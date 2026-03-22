const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const LOCAL_STORE_PATH = path.join(__dirname, "..", "data", "candidate-quick-capture.json");

function ensureLocalStore() {
  const dir = path.dirname(LOCAL_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(LOCAL_STORE_PATH)) {
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify({ candidates: [] }, null, 2));
  }
}

function readLocalStore() {
  ensureLocalStore();
  try {
    return JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, "utf8"));
  } catch {
    return { candidates: [] };
  }
}

function writeLocalStore(store) {
  ensureLocalStore();
  fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store, null, 2));
}

function buildQuickCaptureSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "name",
      "company",
      "role",
      "experience",
      "skills",
      "current_ctc",
      "expected_ctc",
      "notice_period",
      "notes",
      "next_action",
      "linkedin"
    ],
    properties: {
      name: { type: ["string", "null"] },
      company: { type: ["string", "null"] },
      role: { type: ["string", "null"] },
      experience: { type: ["string", "null"] },
      skills: {
        type: "array",
        items: { type: "string" },
        maxItems: 20
      },
      current_ctc: { type: ["string", "null"] },
      expected_ctc: { type: ["string", "null"] },
      notice_period: { type: ["string", "null"] },
      notes: { type: ["string", "null"] },
      next_action: { type: ["string", "null"] },
      linkedin: { type: ["string", "null"] }
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
    throw new Error("Missing OpenAI API key for Candidate Quick Capture.");
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

function buildFallbackStructuredNote(noteText, metadata = {}) {
  const raw = String(noteText || "").trim();
  const linkedin = String(metadata.linkedin || "").trim() || null;
  const nameMatch = raw.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/);
  const companyMatch =
    raw.match(/\b(?:ex|from|at)\s+([A-Z][A-Za-z0-9&.,'()\- ]{1,60})/i) ||
    raw.match(/\b(?:company)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.,'()\- ]{1,60})/i);
  const roleMatch =
    raw.match(/\b(?:role|designation|title)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9&.,'()\- /]{1,80})/i) ||
    raw.match(/\b([A-Za-z][A-Za-z0-9&.,'()\- /]{2,80}\b(?:sales|engineer|developer|manager|executive|consultant|recruiter|analyst|lead|director|specialist))\b/i);
  const experienceMatch = raw.match(/\b\d+\s*(?:\+)?\s*(?:years?|yrs?)(?:\s+\d+\s*(?:months?|mos?))?\b/i);
  const currentCtcMatch = raw.match(/\b(?:current\s*ctc|ctc)\s*[:\-]?\s*([A-Za-z0-9.+\- ]{1,30}\b(?:lpa|lakhs?|lakh|cr|crore|k|pa)?)\b/i);
  const expectedCtcMatch = raw.match(/\bexpected\s*ctc\s*[:\-]?\s*([A-Za-z0-9.+\- ]{1,30}\b(?:lpa|lakhs?|lakh|cr|crore|k|pa)?)\b/i);
  const noticeMatch = raw.match(/\b(?:notice|notice period)\s*[:\-]?\s*([A-Za-z0-9 +\-]{1,30})\b/i);
  const nextActionMatch =
    raw.match(/\b(follow[\s-]*up[^.!\n]*|call later[^.!\n]*|reconnect[^.!\n]*|next week[^.!\n]*|tomorrow[^.!\n]*)\b/i);

  return {
    name: nameMatch?.[1]?.trim() || null,
    company: companyMatch?.[1]?.trim() || null,
    role: roleMatch?.[1]?.trim() || null,
    experience: experienceMatch?.[0]?.trim() || null,
    skills: [],
    current_ctc: currentCtcMatch?.[1]?.trim() || null,
    expected_ctc: expectedCtcMatch?.[1]?.trim() || null,
    notice_period: noticeMatch?.[1]?.trim() || null,
    notes: raw || null,
    next_action: nextActionMatch?.[1]?.trim() || null,
    linkedin
  };
}

function buildParseNotePrompt(noteText) {
  return [
    "You are a recruiter assistant.",
    "",
    "Convert this note into structured candidate data.",
    "",
    "Extract:",
    "- name",
    "- company",
    "- role",
    "- experience",
    "- skills",
    "- current_ctc",
    "- expected_ctc",
    "- notice_period",
    "- notes",
    "- next_action",
    "- linkedin",
    "",
    "Rules:",
    "- Do not guess",
    "- Return null if missing",
    '- Normalize values (e.g., "10 LPA", "12 lakhs")',
    "- Extract skills as array",
    "- Return only JSON",
    "",
    "JSON format:",
    "{",
    '  "name": "",',
    '  "company": "",',
    '  "role": "",',
    '  "experience": "",',
    '  "skills": [],',
    '  "current_ctc": "",',
    '  "expected_ctc": "",',
    '  "notice_period": "",',
    '  "notes": "",',
    '  "next_action": "",',
    '  "linkedin": ""',
    "}",
    "",
    "If a LinkedIn profile URL is explicitly present in the note, copy it to linkedin.",
    "Otherwise return null for linkedin.",
    "",
    "INPUT NOTE:",
    String(noteText || "").trim()
  ].join("\n");
}

function normalizeCandidateRow(structured, rawNote, metadata = {}) {
  return {
    id: String(metadata.id || "").trim() || crypto.randomUUID(),
    source: metadata.source == null ? null : String(metadata.source).trim() || null,
    name: structured?.name == null ? null : String(structured.name).trim() || null,
    company: structured?.company == null ? null : String(structured.company).trim() || null,
    role: structured?.role == null ? null : String(structured.role).trim() || null,
    experience: structured?.experience == null ? null : String(structured.experience).trim() || null,
    skills: Array.isArray(structured?.skills)
      ? structured.skills.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    current_ctc: structured?.current_ctc == null ? null : String(structured.current_ctc).trim() || null,
    expected_ctc: structured?.expected_ctc == null ? null : String(structured.expected_ctc).trim() || null,
    notice_period: structured?.notice_period == null ? null : String(structured.notice_period).trim() || null,
    notes: structured?.notes == null ? null : String(structured.notes).trim() || null,
    next_action: structured?.next_action == null ? null : String(structured.next_action).trim() || null,
    linkedin:
      metadata.linkedin ||
      (structured?.linkedin == null ? null : String(structured.linkedin).trim() || null),
    created_at: String(metadata.created_at || "").trim() || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    raw_note: String(rawNote || "").trim()
  };
}

async function parseCandidateQuickNote({ apiKey, model, noteText, metadata = {} }) {
  const structured = apiKey
    ? await callOpenAiJsonSchema({
        apiKey,
        model,
        prompt: buildParseNotePrompt(noteText),
        schemaName: "candidate_quick_capture_output",
        schema: buildQuickCaptureSchema()
      })
    : buildFallbackStructuredNote(noteText, metadata);

  return normalizeCandidateRow(structured, noteText, metadata);
}

function getSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { url, serviceRoleKey };
}

async function saveCandidate(candidate) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const candidateId = String(candidate?.id || "").trim();
  const isUpdate = Boolean(candidateId);
  if (url && serviceRoleKey) {
    const response = await fetch(
      isUpdate ? `${url}/rest/v1/candidates?id=eq.${encodeURIComponent(candidateId)}` : `${url}/rest/v1/candidates`,
      {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify(candidate)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase save failed: ${response.status} ${errorText}`);
    }

    const rows = await response.json();
    return rows?.[0] || candidate;
  }

  const store = readLocalStore();
  store.candidates = Array.isArray(store.candidates) ? store.candidates : [];
  const existingIndex = store.candidates.findIndex((item) => String(item?.id || "") === candidateId);
  if (candidateId && existingIndex >= 0) {
    store.candidates[existingIndex] = {
      ...store.candidates[existingIndex],
      ...candidate,
      updated_at: candidate.updated_at || new Date().toISOString()
    };
  } else {
    store.candidates.unshift(candidate);
  }
  store.candidates = store.candidates.slice(0, 5000);
  writeLocalStore(store);
  return candidate;
}

async function listCandidates(limit = 100) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (url && serviceRoleKey) {
    const response = await fetch(
      `${url}/rest/v1/candidates?select=*&order=created_at.desc&limit=${Math.max(1, Number(limit) || 100)}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase list failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  const store = readLocalStore();
  return (store.candidates || []).slice(0, Math.max(1, Number(limit) || 100));
}

async function deleteCandidate(candidateId) {
  const id = String(candidateId || "").trim();
  if (!id) {
    throw new Error("Missing candidate id.");
  }

  const { url, serviceRoleKey } = getSupabaseConfig();
  if (url && serviceRoleKey) {
    const response = await fetch(`${url}/rest/v1/candidates?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation"
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase delete failed: ${response.status} ${errorText}`);
    }

    return { id };
  }

  const store = readLocalStore();
  store.candidates = Array.isArray(store.candidates) ? store.candidates : [];
  const nextCandidates = store.candidates.filter((item) => String(item?.id || "") !== id);
  store.candidates = nextCandidates;
  writeLocalStore(store);
  return { id };
}

async function linkCandidateToAssessment(candidateId, assessmentId) {
  const id = String(candidateId || "").trim();
  const linkedAssessmentId = String(assessmentId || "").trim();
  if (!id) {
    throw new Error("Missing candidate id.");
  }
  if (!linkedAssessmentId) {
    throw new Error("Missing assessment id.");
  }

  const payload = {
    used_in_assessment: true,
    assessment_id: linkedAssessmentId,
    updated_at: new Date().toISOString()
  };

  const { url, serviceRoleKey } = getSupabaseConfig();
  if (url && serviceRoleKey) {
    const response = await fetch(`${url}/rest/v1/candidates?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase update failed: ${response.status} ${errorText}`);
    }

    const rows = await response.json();
    return rows?.[0] || { id, ...payload };
  }

  const store = readLocalStore();
  store.candidates = Array.isArray(store.candidates) ? store.candidates : [];
  store.candidates = store.candidates.map((item) =>
    String(item?.id || "") === id ? { ...item, ...payload } : item
  );
  writeLocalStore(store);
  return { id, ...payload };
}

module.exports = {
  deleteCandidate,
  linkCandidateToAssessment,
  listCandidates,
  parseCandidateQuickNote,
  saveCandidate
};
