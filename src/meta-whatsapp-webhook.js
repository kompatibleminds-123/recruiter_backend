const crypto = require("crypto");

const MAX_WEBHOOK_BODY_BYTES = 5 * 1024 * 1024;

function timingSafeEqualString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "utf8");
  const rightBuffer = Buffer.from(String(right || ""), "utf8");
  if (!leftBuffer.length || leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyWebhookChallenge({ mode, token, challenge, expectedToken }) {
  if (!String(expectedToken || "").trim()) return { ok: false, status: 503, error: "Webhook verification is not configured." };
  if (String(mode || "") !== "subscribe" || !String(challenge || "")) {
    return { ok: false, status: 403, error: "Webhook verification failed." };
  }
  if (!timingSafeEqualString(token, expectedToken)) {
    return { ok: false, status: 403, error: "Webhook verification failed." };
  }
  return { ok: true, status: 200, challenge: String(challenge) };
}

function verifyMetaSignature(rawBody, signatureHeader, appSecret) {
  const secret = String(appSecret || "").trim();
  if (!secret) return { ok: false, status: 503, error: "Webhook signature validation is not configured." };
  const match = String(signatureHeader || "").trim().match(/^sha256=([a-f0-9]{64})$/i);
  if (!match) return { ok: false, status: 401, error: "Invalid webhook signature." };
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || "");
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (!timingSafeEqualString(match[1].toLowerCase(), expected)) {
    return { ok: false, status: 401, error: "Invalid webhook signature." };
  }
  return { ok: true, status: 200 };
}

function readRawBodyBuffer(req, maxBytes = MAX_WEBHOOK_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    req.on("data", (chunk) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) {
        fail(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on("error", fail);
  });
}

function eventTimestamp(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stableEventHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function extractMetaWhatsappEvents(payload = {}) {
  if (String(payload?.object || "") !== "whatsapp_business_account") return [];
  const events = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  entries.forEach((entry, entryIndex) => {
    const wabaId = String(entry?.id || "").trim() || null;
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    changes.forEach((change, changeIndex) => {
      const field = String(change?.field || "").trim() || "unknown";
      const value = change?.value && typeof change.value === "object" ? change.value : {};
      const metadata = value?.metadata && typeof value.metadata === "object" ? value.metadata : {};
      const phoneNumberId = String(metadata?.phone_number_id || "").trim() || null;
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      const statuses = Array.isArray(value?.statuses) ? value.statuses : [];

      messages.forEach((message, messageIndex) => {
        const messageId = String(message?.id || "").trim();
        const atomicPayload = { entryId: wabaId, field, metadata, contacts: value?.contacts || [], message };
        events.push({
          event_key: messageId ? `message:${messageId}` : `message:${stableEventHash({ entryIndex, changeIndex, messageIndex, atomicPayload })}`,
          object_type: "whatsapp_business_account",
          event_type: "message",
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          meta_message_id: messageId || null,
          sender_wa_id: String(message?.from || "").trim() || null,
          recipient_wa_id: null,
          message_type: String(message?.type || "").trim() || null,
          delivery_status: null,
          event_timestamp: eventTimestamp(message?.timestamp),
          payload: atomicPayload
        });
      });

      statuses.forEach((statusEvent, statusIndex) => {
        const messageId = String(statusEvent?.id || "").trim();
        const status = String(statusEvent?.status || "").trim();
        const timestamp = String(statusEvent?.timestamp || "").trim();
        const atomicPayload = { entryId: wabaId, field, metadata, status: statusEvent };
        const stableIdentity = messageId && status
          ? `${messageId}:${status}:${timestamp || "unknown"}`
          : stableEventHash({ entryIndex, changeIndex, statusIndex, atomicPayload });
        events.push({
          event_key: `status:${stableIdentity}`,
          object_type: "whatsapp_business_account",
          event_type: "status",
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          meta_message_id: messageId || null,
          sender_wa_id: null,
          recipient_wa_id: String(statusEvent?.recipient_id || "").trim() || null,
          message_type: null,
          delivery_status: status || null,
          event_timestamp: eventTimestamp(statusEvent?.timestamp),
          payload: atomicPayload
        });
      });

      if (!messages.length && !statuses.length) {
        const atomicPayload = { entryId: wabaId, field, value };
        events.push({
          event_key: `change:${stableEventHash(atomicPayload)}`,
          object_type: "whatsapp_business_account",
          event_type: "change",
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          meta_message_id: null,
          sender_wa_id: null,
          recipient_wa_id: null,
          message_type: null,
          delivery_status: null,
          event_timestamp: null,
          payload: atomicPayload
        });
      }
    });
  });

  return events;
}

async function persistMetaWhatsappEvents(events, options = {}) {
  const rows = Array.isArray(events) ? events.filter((event) => event?.event_key) : [];
  if (!rows.length) return { received: 0 };
  const supabaseUrl = String(options.supabaseUrl || process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(options.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  const fetchImpl = options.fetchImpl || fetch;
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase service role is not configured.");

  const response = await fetchImpl(`${supabaseUrl}/rest/v1/whatsapp_webhook_events?on_conflict=event_key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: "resolution=ignore-duplicates,return=minimal"
    },
    body: JSON.stringify(rows)
  });
  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(`Could not persist WhatsApp webhook events (${response.status})${message ? `: ${message}` : "."}`);
  }
  return { received: rows.length };
}

module.exports = {
  extractMetaWhatsappEvents,
  persistMetaWhatsappEvents,
  readRawBodyBuffer,
  verifyMetaSignature,
  verifyWebhookChallenge
};
