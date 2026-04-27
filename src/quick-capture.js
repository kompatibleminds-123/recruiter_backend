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
    fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify({ candidates: [], contact_attempts: [] }, null, 2));
  }
}

function readLocalStore() {
  ensureLocalStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(LOCAL_STORE_PATH, "utf8"));
    return {
      candidates: Array.isArray(parsed?.candidates) ? parsed.candidates : [],
      contact_attempts: Array.isArray(parsed?.contact_attempts) ? parsed.contact_attempts : []
    };
  } catch {
    return { candidates: [], contact_attempts: [] };
  }
}

function writeLocalStore(store) {
  ensureLocalStore();
  fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(store, null, 2));
}

function normalizeCompanyId(value) {
  return String(value || "").trim();
}

function getCandidateCompanyId(candidate) {
  return normalizeCompanyId(candidate?.company_id || candidate?.companyId);
}

function getContactAttemptCompanyId(item) {
  return normalizeCompanyId(item?.company_id || item?.companyId);
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
      "phone",
      "email",
      "location",
      "highest_education",
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
      phone: { type: ["string", "null"] },
      email: { type: ["string", "null"] },
      location: { type: ["string", "null"] },
      highest_education: { type: ["string", "null"] },
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
  const emailMatch = raw.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  const phoneMatch =
    raw.match(/(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{3,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{4,6}\b/) ||
    raw.match(/\b\d{10}\b/);
  const nameMatch = raw.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/);
  const companyMatch =
    raw.match(/\b(?:ex|from|at)\s+([A-Z][A-Za-z0-9&.,'()\- ]{1,60})/i) ||
    raw.match(/\b(?:company|organisation|organization)\s*[:\-]?\s*([A-Z][A-Za-z0-9&.,'()\- ]{1,60})/i);
  const roleMatch =
    raw.match(/\b(?:role|designation|title)\s*[:\-]?\s*([A-Za-z][A-Za-z0-9&.,'()\- /]{1,80})/i) ||
    raw.match(/\b([A-Za-z][A-Za-z0-9&.,'()\- /]{2,80}\b(?:sales|engineer|developer|manager|executive|consultant|recruiter|analyst|lead|director|specialist))\b/i);
  const locationMatch =
    raw.match(/\b(?:location|based in|located in|stays in|lives in)\s*[:\-]?\s*([A-Za-z][A-Za-z ,./()\-]{1,60})/i) ||
    raw.match(/\b(Bangalore|Bengaluru|Mumbai|Pune|Delhi|Noida|Gurgaon|Gurugram|Hyderabad|Chennai|Kolkata|Ahmedabad|Jaipur|Remote)\b/i);
  const highestEducationMatch =
    raw.match(/\b(?:highest\s*(?:education|degree)|qualification)\s*[:\-]?\s*([A-Za-z0-9.,/&()\- ]{2,120})/i);
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
    phone: phoneMatch?.[0]?.trim().replace(/\s+/g, " ") || null,
    email: emailMatch?.[0]?.trim() || null,
    location: locationMatch?.[1]?.trim() || locationMatch?.[0]?.trim() || null,
    highest_education: highestEducationMatch?.[1]?.trim() || null,
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
    "- phone",
    "- email",
    "- location",
    "- highest_education",
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
    '  "phone": "",',
    '  "email": "",',
    '  "location": "",',
    '  "highest_education": "",',
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
    company_id: normalizeCompanyId(metadata.company_id || metadata.companyId) || null,
    source: metadata.source == null ? null : String(metadata.source).trim() || null,
    name: structured?.name == null ? null : String(structured.name).trim() || null,
    company: structured?.company == null ? null : String(structured.company).trim() || null,
    role: structured?.role == null ? null : String(structured.role).trim() || null,
    experience: structured?.experience == null ? null : String(structured.experience).trim() || null,
    skills: Array.isArray(structured?.skills)
      ? structured.skills.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    phone: structured?.phone == null ? null : String(structured.phone).trim() || null,
    email: structured?.email == null ? null : String(structured.email).trim() || null,
    location: structured?.location == null ? null : String(structured.location).trim() || null,
    highest_education: structured?.highest_education == null ? null : String(structured.highest_education).trim() || null,
    current_ctc: structured?.current_ctc == null ? null : String(structured.current_ctc).trim() || null,
    expected_ctc: structured?.expected_ctc == null ? null : String(structured.expected_ctc).trim() || null,
    notice_period: structured?.notice_period == null ? null : String(structured.notice_period).trim() || null,
    notes: structured?.notes == null ? null : String(structured.notes).trim() || null,
    recruiter_context_notes: String(metadata.recruiter_context_notes || metadata.recruiterContextNotes || "").trim() || null,
    other_pointers: String(metadata.other_pointers || metadata.otherPointers || "").trim() || null,
    next_action: structured?.next_action == null ? null : String(structured.next_action).trim() || null,
    client_name: String(metadata.client_name || "").trim() || null,
    jd_title: String(metadata.jd_title || "").trim() || null,
    recruiter_id: String(metadata.recruiter_id || "").trim() || null,
    recruiter_name: String(metadata.recruiter_name || "").trim() || null,
    assigned_to_user_id: String(metadata.assigned_to_user_id || "").trim() || null,
    assigned_to_name: String(metadata.assigned_to_name || "").trim() || null,
    assigned_by_user_id: String(metadata.assigned_by_user_id || "").trim() || null,
    assigned_by_name: String(metadata.assigned_by_name || "").trim() || null,
    assigned_jd_id: String(metadata.assigned_jd_id || "").trim() || null,
    assigned_jd_title: String(metadata.assigned_jd_title || "").trim() || null,
    assigned_at: String(metadata.assigned_at || "").trim() || null,
    last_contact_outcome: String(metadata.last_contact_outcome || "").trim() || null,
    last_contact_notes: String(metadata.last_contact_notes || "").trim() || null,
    last_contact_at: String(metadata.last_contact_at || "").trim() || null,
    next_follow_up_at: String(metadata.next_follow_up_at || "").trim() || null,
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

function normalizePhoneForMatch(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeEmailForMatch(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeLinkedinForMatch(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

function matchesDuplicateKey(left, right) {
  if (!left || !right) return false;
  return left === right;
}

function getDuplicateMatch(candidate, existing) {
  const matchBy = [];
  if (matchesDuplicateKey(normalizePhoneForMatch(candidate.phone), normalizePhoneForMatch(existing.phone))) {
    matchBy.push("phone");
  }
  if (matchesDuplicateKey(normalizeEmailForMatch(candidate.email), normalizeEmailForMatch(existing.email))) {
    matchBy.push("email");
  }
  if (matchesDuplicateKey(normalizeLinkedinForMatch(candidate.linkedin), normalizeLinkedinForMatch(existing.linkedin))) {
    matchBy.push("linkedin");
  }
  return matchBy;
}

async function findDuplicateCandidate(candidate, options = {}) {
  const candidateId = String(candidate?.id || "").trim();
  const companyId = normalizeCompanyId(options.companyId || candidate?.company_id || candidate?.companyId);
  const phone = normalizePhoneForMatch(candidate?.phone);
  const email = normalizeEmailForMatch(candidate?.email);
  const linkedin = normalizeLinkedinForMatch(candidate?.linkedin);

  if (!phone && !email && !linkedin) return null;

  const { url, serviceRoleKey } = getSupabaseConfig();
  if (url && serviceRoleKey) {
    const filters = ["select=*", "order=created_at.desc", "limit=2000"];
    if (companyId) {
      filters.push(`company_id=eq.${encodeURIComponent(companyId)}`);
    }
    const response = await fetch(`${url}/rest/v1/candidates?${filters.join("&")}`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` }
    });
    const rows = response.ok ? await response.json() : [];
    for (const existing of rows) {
      if (String(existing?.id || "").trim() === candidateId) continue;
      const matchBy = getDuplicateMatch(candidate, existing);
      if (matchBy.length) {
        return { existing, matchBy };
      }
    }
    return null;
  }

  const store = readLocalStore();
  const candidates = (Array.isArray(store.candidates) ? store.candidates : []).filter((item) => {
    if (!companyId) return true;
    return getCandidateCompanyId(item) === companyId;
  });
  for (const existing of candidates) {
    if (String(existing?.id || "").trim() === candidateId) continue;
    const matchBy = getDuplicateMatch(candidate, existing);
    if (matchBy.length) {
      return { existing, matchBy };
    }
  }
  return null;
}

async function saveCandidate(candidate, options = {}) {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const candidateId = String(candidate?.id || "").trim();
  const companyId = normalizeCompanyId(options.companyId || candidate?.company_id || candidate?.companyId);
  const nextCandidate = {
    ...candidate,
    company_id: companyId || null
  };
  if (!candidateId) {
    delete nextCandidate.id;
  }
  if (url && serviceRoleKey) {
    let isUpdate = false;
    if (candidateId) {
      const filters = [`id=eq.${encodeURIComponent(candidateId)}`, "select=id", "limit=1"];
      if (companyId) {
        filters.unshift(`company_id=eq.${encodeURIComponent(companyId)}`);
      }
      const checkResponse = await fetch(
        `${url}/rest/v1/candidates?${filters.join("&")}`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`
          }
        }
      );

      if (!checkResponse.ok) {
        const errorText = await checkResponse.text();
        throw new Error(`Supabase existence check failed: ${checkResponse.status} ${errorText}`);
      }

      const existingRows = await checkResponse.json();
      isUpdate = Array.isArray(existingRows) && existingRows.length > 0;
    }

    // recruiter_id / recruiter_name represent "captured by" (first time sourcing).
    // They should not be overwritten on later edits (recruiter notes, attempts, etc).
    if (isUpdate && !options.forceRecruiterIdentityUpdate) {
      delete nextCandidate.recruiter_id;
      delete nextCandidate.recruiter_name;
    }

    const response = await fetch(
      isUpdate
        ? `${url}/rest/v1/candidates?id=eq.${encodeURIComponent(candidateId)}${companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : ""}`
        : `${url}/rest/v1/candidates`,
      {
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify(nextCandidate)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase save failed: ${response.status} ${errorText}`);
    }

    const rows = await response.json();
    return rows?.[0] || nextCandidate;
  }

  const store = readLocalStore();
  store.candidates = Array.isArray(store.candidates) ? store.candidates : [];
  const existingIndex = store.candidates.findIndex(
    (item) => String(item?.id || "") === candidateId && (!companyId || getCandidateCompanyId(item) === companyId)
  );
  if (candidateId && existingIndex >= 0) {
    store.candidates[existingIndex] = {
      ...store.candidates[existingIndex],
      ...nextCandidate,
      updated_at: nextCandidate.updated_at || new Date().toISOString()
    };
  } else {
    store.candidates.unshift(nextCandidate);
  }
  store.candidates = store.candidates.slice(0, 5000);
  writeLocalStore(store);
  return nextCandidate;
}

async function patchCandidate(candidateId, patch, options = {}) {
  const id = String(candidateId || "").trim();
  const companyId = normalizeCompanyId(options.companyId || patch?.company_id || patch?.companyId);
  if (!id) {
    throw new Error("Missing candidate id.");
  }

  const payload = {
    ...patch,
    updated_at: new Date().toISOString()
  };

  const { url, serviceRoleKey } = getSupabaseConfig();
  if (url && serviceRoleKey) {
    const response = await fetch(
      `${url}/rest/v1/candidates?id=eq.${encodeURIComponent(id)}${companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : ""}`,
      {
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
    String(item?.id || "") === id && (!companyId || getCandidateCompanyId(item) === companyId) ? { ...item, ...payload } : item
  );
  writeLocalStore(store);
  return { id, ...payload };
}

function normalizeListOptions(input) {
  if (typeof input === "number") {
    return {
      limit: Math.max(1, Number(input) || 100),
      q: "",
      companyId: ""
    };
  }
  return {
    limit: Math.max(1, Number(input?.limit) || 100),
    q: String(input?.q || "").trim().toLowerCase(),
    companyId: normalizeCompanyId(input?.companyId || input?.company_id)
  };
}

function matchesCandidateSearch(candidate, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    candidate?.name,
    candidate?.company,
    candidate?.role,
    candidate?.experience,
    candidate?.phone,
    candidate?.email,
    candidate?.linkedin,
    candidate?.location,
    candidate?.client_name,
    candidate?.jd_title,
    candidate?.recruiter_name,
    candidate?.assigned_to_name,
    candidate?.notes,
    candidate?.recruiter_context_notes,
    candidate?.other_pointers,
    candidate?.next_action,
    candidate?.raw_note,
    candidate?.draft_payload && typeof candidate.draft_payload === "object" ? JSON.stringify(candidate.draft_payload) : candidate?.draft_payload,
    candidate?.screening_answers && typeof candidate.screening_answers === "object" ? JSON.stringify(candidate.screening_answers) : candidate?.screening_answers
  ]
    .filter(Boolean)
    .join(" | ")
    .toLowerCase();
  return haystack.includes(q);
}

function matchesCandidateId(candidate, rawId) {
  const id = String(rawId || "").trim();
  if (!id) return true;
  return String(candidate?.id || "").trim() === id;
}

async function listCandidates(options = 100) {
  const { limit, q, companyId } = normalizeListOptions(options);
  const id = String(options?.id || "").trim();
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (url && serviceRoleKey) {
    // If querying for a specific id, filter at the API level (UUID ordering + limit=1 would otherwise miss).
    const fetchLimit = id ? Math.max(limit, 50) : (q ? Math.max(limit, 2000) : limit);
    const filters = ["select=*", "order=created_at.desc", `limit=${fetchLimit}`];
    if (companyId) {
      filters.push(`company_id=eq.${encodeURIComponent(companyId)}`);
    }
    if (id) {
      filters.push(`id=eq.${encodeURIComponent(id)}`);
    }
    const response = await fetch(
      `${url}/rest/v1/candidates?${filters.join("&")}`,
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

    const rows = await response.json();
    return rows.filter((item) => matchesCandidateId(item, id)).filter((item) => matchesCandidateSearch(item, q)).slice(0, limit);
  }

  const store = readLocalStore();
  return (store.candidates || [])
    .filter((item) => !companyId || getCandidateCompanyId(item) === companyId)
    .filter((item) => matchesCandidateId(item, id))
    .filter((item) => matchesCandidateSearch(item, q))
    .slice(0, limit);
}

async function listCandidatesForUser(user, options = 100) {
  const { limit, q } = normalizeListOptions(options);
  const id = String(options?.id || "").trim();
  const companyWide = options?.companyWide === true || options?.scope === "company";
  const maxRows = limit;
  if (!user?.id) {
    return listCandidates({ limit: maxRows, q, id, companyId: normalizeCompanyId(user?.companyId) });
  }

  if (companyWide) {
    return listCandidates({ limit: maxRows, q, id, companyId: normalizeCompanyId(user.companyId) });
  }

  if (user.role === "admin") {
    return listCandidates({ limit: maxRows, q, id, companyId: normalizeCompanyId(user.companyId) });
  }

  const { url, serviceRoleKey } = getSupabaseConfig();
  const companyId = normalizeCompanyId(user.companyId);
  if (url && serviceRoleKey) {
    const recruiterId = encodeURIComponent(String(user.id).trim());
    // If querying for a specific id, filter at the API level (otherwise limit=1 often misses).
    const fetchLimit = id ? Math.max(maxRows, 50) : (q ? Math.max(maxRows, 2000) : maxRows);
    const idFilter = id ? `&id=eq.${encodeURIComponent(id)}` : "";
    const response = await fetch(
      `${url}/rest/v1/candidates?select=*&company_id=eq.${encodeURIComponent(companyId)}&or=(recruiter_id.eq.${recruiterId},assigned_to_user_id.eq.${recruiterId})${idFilter}&order=created_at.desc&limit=${fetchLimit}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase filtered list failed: ${response.status} ${errorText}`);
    }

    const rows = await response.json();
    return rows.filter((item) => matchesCandidateId(item, id)).filter((item) => matchesCandidateSearch(item, q)).slice(0, maxRows);
  }

  const store = readLocalStore();
  return (store.candidates || [])
    .filter((item) => !companyId || getCandidateCompanyId(item) === companyId)
    .filter((item) => item?.recruiter_id === user.id || item?.assigned_to_user_id === user.id)
    .filter((item) => matchesCandidateId(item, id))
    .filter((item) => matchesCandidateSearch(item, q))
    .slice(0, maxRows);
}

async function deleteCandidate(candidateId, options = {}) {
  const id = String(candidateId || "").trim();
  const companyId = normalizeCompanyId(options.companyId);
  if (!id) {
    throw new Error("Missing candidate id.");
  }

  const { url, serviceRoleKey } = getSupabaseConfig();
  if (url && serviceRoleKey) {
    const response = await fetch(
      `${url}/rest/v1/candidates?id=eq.${encodeURIComponent(id)}${companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : ""}`,
      {
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

    const rows = await response.json().catch(() => []);
    if (Array.isArray(rows) && rows.length === 0) {
      throw new Error("Candidate not found in this company.");
    }
    return { id, deleted: Array.isArray(rows) ? rows.length : 1 };
  }

  const store = readLocalStore();
  store.candidates = Array.isArray(store.candidates) ? store.candidates : [];
  const before = store.candidates.length;
  const nextCandidates = store.candidates.filter(
    (item) => !(String(item?.id || "") === id && (!companyId || getCandidateCompanyId(item) === companyId))
  );
  if (nextCandidates.length === before) {
    throw new Error("Candidate not found in this company.");
  }
  store.candidates = nextCandidates;
  writeLocalStore(store);
  return { id, deleted: before - nextCandidates.length };
}

async function linkCandidateToAssessment(candidateId, assessmentId, options = {}) {
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
  return patchCandidate(id, payload, options);
}

async function assignCandidate(candidateId, assignment = {}, options = {}) {
  const id = String(candidateId || "").trim();
  if (!id) {
    throw new Error("Missing candidate id.");
  }

  const assignedToUserId = String(assignment.assigned_to_user_id || assignment.assignedToUserId || "").trim();
  const assignedToName = String(assignment.assigned_to_name || assignment.assignedToName || "").trim();
  const assignedJdId = String(assignment.assigned_jd_id || assignment.assignedJdId || "").trim();
  const assignedJdTitle = String(assignment.assigned_jd_title || assignment.assignedJdTitle || "").trim();
  const clientName = String(assignment.client_name || assignment.clientName || "").trim();
  const jdTitle = String(assignment.jd_title || assignment.jdTitle || "").trim();
  const assignedByUserId = String(assignment.assigned_by_user_id || assignment.assignedByUserId || "").trim() || null;
  const assignedByName = String(assignment.assigned_by_name || assignment.assignedByName || "").trim() || null;

  if (!assignedToUserId || !assignedToName) {
    throw new Error("Assigned recruiter is required.");
  }

  const basePatch = {
    assigned_to_user_id: assignedToUserId,
    assigned_to_name: assignedToName,
    assigned_by_user_id: assignedByUserId,
    assigned_by_name: assignedByName,
    assigned_jd_id: assignedJdId || null,
    assigned_jd_title: assignedJdTitle || null,
    // Keep the legacy display fields in sync so dashboards/search don't have to guess.
    jd_title: (jdTitle || assignedJdTitle || null),
    client_name: clientName || null,
    assigned_at: new Date().toISOString(),
    // If a hidden/inactive note is reassigned, make it active for the new assignee.
    hidden_from_captured: false
  };

  const { url, serviceRoleKey } = getSupabaseConfig();
  const companyId = normalizeCompanyId(options.companyId || assignment.company_id || assignment.companyId);
  let firstAssignmentPatch = null;

  if (url && serviceRoleKey) {
    try {
      const select = [
        "id",
        "assigned_to_user_id",
        "assigned_to_name",
        "assigned_at",
        "assigned_by_user_id",
        "assigned_by_name",
        "first_assigned_to_user_id",
        "first_assigned_to_name",
        "first_assigned_at",
        "first_assigned_by_user_id",
        "first_assigned_by_name"
      ].join(",");
      const filters = [`id=eq.${encodeURIComponent(id)}`, `select=${select}`, "limit=1"];
      if (companyId) {
        filters.unshift(`company_id=eq.${encodeURIComponent(companyId)}`);
      }
      const response = await fetch(`${url}/rest/v1/candidates?${filters.join("&")}`, {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      });

      if (response.ok) {
        const rows = await response.json();
        const existing = rows?.[0] || null;
        const hasFirst = Boolean(existing?.first_assigned_to_user_id || existing?.first_assigned_to_name || existing?.first_assigned_at);
        if (!hasFirst) {
          const existingAssignedToUserId = String(existing?.assigned_to_user_id || "").trim();
          const existingAssignedToName = String(existing?.assigned_to_name || "").trim();
          const existingAssignedAt = String(existing?.assigned_at || "").trim();
          const existingAssignedByUserId = String(existing?.assigned_by_user_id || "").trim() || null;
          const existingAssignedByName = String(existing?.assigned_by_name || "").trim() || null;
          const hasExistingAssignment = Boolean(existingAssignedToUserId || existingAssignedToName || existingAssignedAt);

          firstAssignmentPatch = {
            first_assigned_to_user_id: hasExistingAssignment ? (existingAssignedToUserId || null) : assignedToUserId,
            first_assigned_to_name: hasExistingAssignment ? (existingAssignedToName || null) : assignedToName,
            first_assigned_at: hasExistingAssignment ? (existingAssignedAt || basePatch.assigned_at) : basePatch.assigned_at,
            first_assigned_by_user_id: hasExistingAssignment ? existingAssignedByUserId : assignedByUserId,
            first_assigned_by_name: hasExistingAssignment ? existingAssignedByName : assignedByName
          };
        }
      }
    } catch {
      firstAssignmentPatch = null;
    }
  }

  if (firstAssignmentPatch) {
    try {
      return await patchCandidate(id, { ...basePatch, ...firstAssignmentPatch }, options);
    } catch (error) {
      const message = String(error?.message || error);
      if (message.includes("first_assigned_") && message.includes("does not exist")) {
        return patchCandidate(id, basePatch, options);
      }
      throw error;
    }
  }

  return patchCandidate(id, basePatch, options);
}

function normalizeContactAttemptRow(candidateId, payload = {}) {
  const outcome = String(payload.outcome || "").trim();
  const companyId = normalizeCompanyId(payload.company_id || payload.companyId);
  if (!candidateId) {
    throw new Error("Missing candidate id.");
  }
  if (!outcome) {
    throw new Error("Contact outcome is required.");
  }

  return {
    id: String(payload.id || "").trim() || crypto.randomUUID(),
    candidate_id: candidateId,
    company_id: companyId || null,
    recruiter_id: String(payload.recruiter_id || payload.recruiterId || "").trim() || null,
    recruiter_name: String(payload.recruiter_name || payload.recruiterName || "").trim() || null,
    jd_id: String(payload.jd_id || payload.jdId || "").trim() || null,
    jd_title: String(payload.jd_title || payload.jdTitle || "").trim() || null,
    outcome,
    notes: String(payload.notes || "").trim() || null,
    next_follow_up_at: String(payload.next_follow_up_at || payload.nextFollowUpAt || "").trim() || null,
    created_at: new Date().toISOString()
  };
}

async function saveContactAttempt(candidateId, payload = {}, options = {}) {
  const row = normalizeContactAttemptRow(String(candidateId || "").trim(), {
    ...payload,
    company_id: options.companyId || payload.company_id || payload.companyId
  });
  const { url, serviceRoleKey } = getSupabaseConfig();

  if (url && serviceRoleKey) {
    const response = await fetch(`${url}/rest/v1/contact_attempts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=representation"
      },
      body: JSON.stringify(row)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase contact attempt save failed: ${response.status} ${errorText}`);
    }

    const rows = await response.json();
    await patchCandidate(candidateId, {
      last_contact_outcome: row.outcome,
      last_contact_notes: row.notes,
      last_contact_at: row.created_at,
      next_follow_up_at: row.next_follow_up_at
    }, { companyId: row.company_id });
    return rows?.[0] || row;
  }

  const store = readLocalStore();
  store.contact_attempts = Array.isArray(store.contact_attempts) ? store.contact_attempts : [];
  store.contact_attempts.unshift(row);
  store.contact_attempts = store.contact_attempts.slice(0, 10000);
  writeLocalStore(store);
  await patchCandidate(candidateId, {
    last_contact_outcome: row.outcome,
    last_contact_notes: row.notes,
    last_contact_at: row.created_at,
    next_follow_up_at: row.next_follow_up_at
  }, { companyId: row.company_id });
  return row;
}

async function listContactAttempts(candidateId, limit = 20, options = {}) {
  const id = String(candidateId || "").trim();
  const companyId = normalizeCompanyId(options.companyId);
  if (!id) {
    throw new Error("Missing candidate id.");
  }

  const maxRows = Math.max(1, Number(limit) || 20);
  const { url, serviceRoleKey } = getSupabaseConfig();
  if (url && serviceRoleKey) {
    const response = await fetch(
      `${url}/rest/v1/contact_attempts?candidate_id=eq.${encodeURIComponent(id)}${companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : ""}&select=*&order=created_at.desc&limit=${maxRows}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase contact attempt list failed: ${response.status} ${errorText}`);
    }

    return response.json();
  }

  const store = readLocalStore();
  return (Array.isArray(store.contact_attempts) ? store.contact_attempts : [])
    .filter((item) => !companyId || getContactAttemptCompanyId(item) === companyId)
    .filter((item) => String(item?.candidate_id || "") === id)
    .slice(0, maxRows);
}

async function exportCompanyQuickCaptureData(companyId) {
  const scopedCompanyId = normalizeCompanyId(companyId);
  if (!scopedCompanyId) {
    throw new Error("Missing company id.");
  }

  const candidates = await listCandidates({ limit: 5000, companyId: scopedCompanyId });
  const { url, serviceRoleKey } = getSupabaseConfig();

  if (url && serviceRoleKey) {
    const response = await fetch(
      `${url}/rest/v1/contact_attempts?company_id=eq.${encodeURIComponent(scopedCompanyId)}&select=*&order=created_at.desc&limit=10000`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase contact attempt export failed: ${response.status} ${errorText}`);
    }

    return {
      candidates,
      contactAttempts: await response.json()
    };
  }

  const store = readLocalStore();
  return {
    candidates,
    contactAttempts: (Array.isArray(store.contact_attempts) ? store.contact_attempts : []).filter(
      (item) => getContactAttemptCompanyId(item) === scopedCompanyId
    )
  };
}

module.exports = {
  assignCandidate,
  deleteCandidate,
  exportCompanyQuickCaptureData,
  findDuplicateCandidate,
  linkCandidateToAssessment,
  listCandidatesForUser,
  listContactAttempts,
  listCandidates,
  parseCandidateQuickNote,
  patchCandidate,
  saveContactAttempt,
  saveCandidate
};
