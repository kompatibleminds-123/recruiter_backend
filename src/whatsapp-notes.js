const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const LOCAL_STORE_PATH = path.join(__dirname, "..", "data", "whatsapp-notes.json");

function ensureLocalNotesStore() {
  const dir = path.dirname(LOCAL_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_STORE_PATH)) {
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify({ notes: [] }, null, 2));
  }
}

function readLocalNotesStore() {
  ensureLocalNotesStore();
  try {
    return JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, "utf8"));
  } catch {
    return { notes: [] };
  }
}

function writeLocalNotesStore(store) {
  ensureLocalNotesStore();
  fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store, null, 2));
}

function buildWhatsappNoteSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["name", "company", "role", "notes", "action"],
    properties: {
      name: { type: ["string", "null"] },
      company: { type: ["string", "null"] },
      role: { type: ["string", "null"] },
      notes: { type: ["string", "null"] },
      action: { type: ["string", "null"] }
    }
  };
}

function parseStructuredOutput(data) {
  const outputText =
    data.output_text ||
    data.resultText ||
    data.output
      ?.flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text || "")
      .join("") ||
    "";

  if (!outputText) {
    throw new Error("The AI response came back empty.");
  }

  return JSON.parse(outputText);
}

async function callOpenAiJsonSchema({ apiKey, prompt, model, schemaName, schema }) {
  if (!apiKey) {
    throw new Error("Missing OpenAI API key for WhatsApp note processing.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || "gpt-4.1-mini",
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return parseStructuredOutput(data);
}

function buildWhatsappNotePrompt(messageText) {
  return [
    "You are a strict recruiter note structuring assistant.",
    "Convert the unstructured WhatsApp note into structured JSON.",
    "Do not guess facts that are not present.",
    "Keep notes concise and recruiter-friendly.",
    "Return JSON only.",
    "Schema:",
    '{"name":string|null,"company":string|null,"role":string|null,"notes":string|null,"action":string|null}',
    "",
    "INPUT NOTE:",
    String(messageText || "").trim()
  ].join("\n");
}

async function structureWhatsappNoteWithAi({ apiKey, model, messageText }) {
  const prompt = buildWhatsappNotePrompt(messageText);
  const structured = await callOpenAiJsonSchema({
    apiKey,
    prompt,
    model,
    schemaName: "whatsapp_note_structured_output",
    schema: buildWhatsappNoteSchema()
  });

  return {
    name: structured?.name == null ? null : String(structured.name).trim() || null,
    company: structured?.company == null ? null : String(structured.company).trim() || null,
    role: structured?.role == null ? null : String(structured.role).trim() || null,
    notes: structured?.notes == null ? null : String(structured.notes).trim() || null,
    action_items: structured?.action == null ? null : String(structured.action).trim() || null
  };
}

function extractIncomingWhatsAppMessages(payload) {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  const messages = [];

  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const incomingMessages = Array.isArray(value?.messages) ? value.messages : [];
      for (const item of incomingMessages) {
        const textBody =
          item?.text?.body ||
          item?.button?.text ||
          item?.interactive?.button_reply?.title ||
          item?.interactive?.list_reply?.title ||
          "";

        messages.push({
          messageId: item?.id || "",
          from: item?.from || "",
          type: item?.type || "",
          text: String(textBody || "").trim(),
          timestamp: item?.timestamp || "",
          raw: item
        });
      }
    }
  }

  return messages;
}

async function saveWhatsappStructuredNote(note) {
  const supabaseUrl = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

  if (supabaseUrl && supabaseKey) {
    const response = await fetch(`${supabaseUrl}/rest/v1/whatsapp_notes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify(note)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase insert failed: ${response.status} ${errorText}`);
    }

    const rows = await response.json();
    return rows?.[0] || note;
  }

  const store = readLocalNotesStore();
  store.notes = Array.isArray(store.notes) ? store.notes : [];
  store.notes.unshift(note);
  store.notes = store.notes.slice(0, 5000);
  writeLocalNotesStore(store);
  return note;
}

function listWhatsappStructuredNotes(limit = 100) {
  const store = readLocalNotesStore();
  return (store.notes || []).slice(0, Math.max(1, Number(limit) || 100));
}

async function sendWhatsappConfirmation({ to, message }) {
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  if (!accessToken || !phoneNumberId || !to || !message) {
    return { sent: false, reason: "missing_configuration_or_payload" };
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: {
        preview_url: false,
        body: message
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WhatsApp confirmation failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function processIncomingWhatsappMessage(message, options = {}) {
  const aiApiKey = options.aiApiKey || process.env.OPENAI_API_KEY || "";
  const aiModel = options.aiModel || process.env.WHATSAPP_NOTES_MODEL || "gpt-4.1-mini";

  const structured = await structureWhatsappNoteWithAi({
    apiKey: aiApiKey,
    model: aiModel,
    messageText: message.text
  });

  const note = {
    id: crypto.randomUUID(),
    phone_number: String(message.from || "").trim(),
    name: structured.name,
    company: structured.company,
    role: structured.role,
    notes: structured.notes,
    action_items: structured.action_items,
    raw_message: String(message.text || "").trim(),
    source: "whatsapp_cloud_api",
    created_at: new Date().toISOString()
  };

  const stored = await saveWhatsappStructuredNote(note);
  return stored;
}

module.exports = {
  extractIncomingWhatsAppMessages,
  listWhatsappStructuredNotes,
  processIncomingWhatsappMessage,
  sendWhatsappConfirmation
};
