const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const {
  extractMetaWhatsappEvents,
  persistMetaWhatsappEvents,
  readRawBodyBuffer,
  verifyMetaSignature,
  verifyWebhookChallenge
} = require("../src/meta-whatsapp-webhook");

async function run() {
  const challenge = verifyWebhookChallenge({ mode: "subscribe", token: "verify-me", challenge: "12345", expectedToken: "verify-me" });
  assert.deepEqual(challenge, { ok: true, status: 200, challenge: "12345" });
  assert.equal(verifyWebhookChallenge({ mode: "subscribe", token: "wrong", challenge: "12345", expectedToken: "verify-me" }).status, 403);
  assert.equal(verifyWebhookChallenge({ mode: "subscribe", token: "verify-me", challenge: "12345", expectedToken: "" }).status, 503);

  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: "waba-1",
      changes: [{
        field: "messages",
        value: {
          metadata: { display_phone_number: "15550000000", phone_number_id: "phone-1" },
          contacts: [{ wa_id: "919999999999", profile: { name: "Candidate" } }],
          messages: [{ from: "919999999999", id: "wamid.message-1", timestamp: "1794412800", type: "text", text: { body: "Interested" } }],
          statuses: [
            { id: "wamid.outbound-1", recipient_id: "919999999999", status: "delivered", timestamp: "1794412801" },
            { id: "wamid.outbound-1", recipient_id: "919999999999", status: "read", timestamp: "1794412802" }
          ]
        }
      }]
    }]
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const appSecret = "app-secret-for-test";
  const signature = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  assert.equal(verifyMetaSignature(rawBody, signature, appSecret).ok, true);
  assert.equal(verifyMetaSignature(Buffer.from(`${rawBody.toString()} `), signature, appSecret).status, 401);
  assert.equal(verifyMetaSignature(rawBody, "", appSecret).status, 401);
  assert.equal(verifyMetaSignature(rawBody, signature, "").status, 503);
  const streamedBody = await readRawBodyBuffer(Readable.from([rawBody.subarray(0, 20), rawBody.subarray(20)]));
  assert.deepEqual(streamedBody, rawBody);

  const events = extractMetaWhatsappEvents(payload);
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.event_type), ["message", "status", "status"]);
  assert.equal(events[0].event_key, "message:wamid.message-1");
  assert.equal(events[0].sender_wa_id, "919999999999");
  assert.equal(events[1].event_key, "status:wamid.outbound-1:delivered:1794412801");
  assert.equal(events[2].delivery_status, "read");
  assert.deepEqual(extractMetaWhatsappEvents(payload).map((event) => event.event_key), events.map((event) => event.event_key));
  assert.deepEqual(extractMetaWhatsappEvents({ object: "page", entry: payload.entry }), []);

  let request = null;
  const persisted = await persistMetaWhatsappEvents(events, {
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role-test",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 201, text: async () => "" };
    }
  });
  assert.equal(persisted.received, 3);
  assert.match(request.url, /whatsapp_webhook_events\?on_conflict=event_key$/);
  assert.equal(request.options.headers.Prefer, "resolution=ignore-duplicates,return=minimal");
  assert.equal(JSON.parse(request.options.body).length, 3);

  const migration = fs.readFileSync(path.join(__dirname, "..", "sql", "2026-11-12-whatsapp-webhook-events.sql"), "utf8");
  assert.match(migration, /event_key text not null unique/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.whatsapp_webhook_events from anon, authenticated/i);
}

module.exports = { run };

if (require.main === module) {
  run().then(() => process.stdout.write("meta-whatsapp-webhook.spec passed\n")).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
