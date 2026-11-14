const crypto = require("crypto");
const { listCandidates, patchCandidate, saveContactAttempt } = require("./quick-capture");

const ACTIVE_SCREENING_STATUSES = [
  "creating",
  "template_sent",
  "awaiting_interest",
  "awaiting_current_ctc",
  "awaiting_expected_ctc",
  "awaiting_notice_period",
  "awaiting_recruiter_call",
  "awaiting_confirmation",
  "human_takeover"
];

const QUESTION_PROMPTS = {
  current_ctc: "What is your current CTC? Please share it in LPA, for example 12 LPA.",
  expected_ctc: "What is your expected CTC? Please share it in LPA.",
  notice_period: "What is your notice period or earliest joining availability?",
  recruiter_call: "Would you like to connect with our recruiter for more details? Please reply Yes or No."
};

function screeningConfig(options = {}) {
  const templateName = String(options.templateName || process.env.META_WHATSAPP_SCREENING_TEMPLATE_NAME || "km_job_opportunity_screening").trim();
  const configuredTemplateLanguage = String(options.templateLanguage || process.env.META_WHATSAPP_SCREENING_TEMPLATE_LANGUAGE || "en").trim() || "en";
  const templateLanguage = templateName === "km_job_opportunity_screening" && /^(?:en_us|english)$/i.test(configuredTemplateLanguage)
    ? "en"
    : configuredTemplateLanguage;
  return {
    supabaseUrl: String(options.supabaseUrl || process.env.SUPABASE_URL || "").trim().replace(/\/+$/, ""),
    serviceRoleKey: String(options.serviceRoleKey || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
    accessToken: String(options.accessToken || process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN || "").trim(),
    phoneNumberId: String(options.phoneNumberId || process.env.META_WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim(),
    graphVersion: String(options.graphVersion || process.env.META_WHATSAPP_GRAPH_VERSION || "v22.0").trim() || "v22.0",
    templateName,
    templateLanguage,
    retentionDays: Math.max(30, Math.min(730, Number(options.retentionDays || process.env.WHATSAPP_SCREENING_RETENTION_DAYS || 180))),
    fetchImpl: options.fetchImpl || fetch
  };
}

function ensureSupabaseConfigured(config) {
  if (!config.supabaseUrl || !config.serviceRoleKey) throw new Error("Supabase service role is not configured.");
}

async function supabaseRequest(table, query = "", options = {}) {
  const config = screeningConfig(options);
  ensureSupabaseConfigured(config);
  const response = await config.fetchImpl(`${config.supabaseUrl}/rest/v1/${table}${query}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const raw = await response.text().catch(() => "");
  if (!response.ok) {
    let message = raw;
    try { message = JSON.parse(raw)?.message || JSON.parse(raw)?.error || raw; } catch { /* keep raw */ }
    throw new Error(String(message || `Supabase ${table} request failed (${response.status}).`));
  }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function normalizeWhatsAppPhone(value, defaultCountryCode = "91") {
  let digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `${String(defaultCountryCode || "91").replace(/\D/g, "")}${digits}`;
  if (digits.length < 8 || digits.length > 15) return "";
  return digits;
}

function parseJsonObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return { ...value };
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cleanAnswer(value, maxLength = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function extractInboundText(event = {}) {
  const message = event?.payload?.message || {};
  return cleanAnswer(
    message?.text?.body
      || message?.button?.text
      || message?.interactive?.button_reply?.title
      || message?.interactive?.list_reply?.title
      || "",
    2000
  );
}

function extractInboundReplyId(event = {}) {
  const message = event?.payload?.message || {};
  return cleanAnswer(
    message?.button?.payload
      || message?.interactive?.button_reply?.id
      || message?.interactive?.list_reply?.id
      || "",
    240
  );
}

function parseYesNo(value) {
  const normalized = cleanAnswer(value).toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  if (/^(yes|y|yeah|yep|sure|ok|okay|please|interested|connect|call me|haan|ha|ji)$/.test(normalized)) return true;
  if (/^(no|n|nope|not interested|do not call|dont call|nah|nahi|na)$/.test(normalized)) return false;
  return null;
}

function parseInterest(value, replyId = "") {
  const id = String(replyId || "").toLowerCase();
  const text = cleanAnswer(value).toLowerCase();
  if (/\b(stop|unsubscribe|opt\s*out|do not message|dont message)\b/.test(text)) return "opt_out";
  if (id.includes("share_jd") || /\b(share|send)\s+(the\s+)?jd\b|\bjob description\b/.test(text)) return "share_jd";
  const yesNo = parseYesNo(text);
  if (yesNo === false || /\b(not interested|no thanks|not looking)\b/.test(text)) return "not_interested";
  if (yesNo === true || /\b(interested|explore|tell me more)\b/.test(text)) return "interested";
  return "";
}

function parseCombinedScreeningAnswers(value) {
  const text = cleanAnswer(value, 2000);
  const answers = {};
  const patterns = [
    ["current_ctc", /(?:current\s*(?:ctc|salary|package)|curr\s*ctc)\s*[:\-=]?\s*([^,;|\n]+)/i],
    ["expected_ctc", /(?:expected\s*(?:ctc|salary|package)|exp\s*ctc)\s*[:\-=]?\s*([^,;|\n]+)/i],
    ["notice_period", /(?:notice\s*(?:period)?|joining\s*(?:time|availability)|available\s*(?:in|from)?)\s*[:\-=]?\s*([^,;|\n]+)/i]
  ];
  patterns.forEach(([key, pattern]) => {
    const match = text.match(pattern);
    if (match?.[1]) answers[key] = cleanAnswer(match[1]);
  });
  return answers;
}

function nextMissingQuestion(answers = {}) {
  if (!cleanAnswer(answers.current_ctc)) return "current_ctc";
  if (!cleanAnswer(answers.expected_ctc)) return "expected_ctc";
  if (!cleanAnswer(answers.notice_period)) return "notice_period";
  if (typeof answers.recruiter_call_requested !== "boolean") return "recruiter_call";
  return "confirmation";
}

function questionStatus(question) {
  return question === "confirmation" ? "awaiting_confirmation" : `awaiting_${question}`;
}

function formatConfirmation(answers = {}) {
  return [
    "Please confirm your screening details:",
    `Current CTC: ${cleanAnswer(answers.current_ctc) || "Not provided"}`,
    `Expected CTC: ${cleanAnswer(answers.expected_ctc) || "Not provided"}`,
    `Notice period: ${cleanAnswer(answers.notice_period) || "Not provided"}`,
    `Recruiter call: ${answers.recruiter_call_requested === true ? "Yes" : "No"}`,
    "Reply Confirm to save these details, or send a correction such as ‘Expected CTC: 18 LPA’."
  ].join("\n");
}

function buildConfirmedCandidatePatch(candidate = {}, answers = {}) {
  const patch = {};
  const replacedValues = {};
  ["current_ctc", "expected_ctc", "notice_period"].forEach((field) => {
    const nextValue = cleanAnswer(answers[field]);
    if (!nextValue) return;
    const existingValue = cleanAnswer(candidate[field]);
    patch[field] = nextValue;
    if (existingValue && existingValue.toLowerCase() !== nextValue.toLowerCase()) {
      replacedValues[field] = {
        existing: existingValue,
        confirmed: nextValue,
        resolution: "candidate_confirmed_overwrite"
      };
    }
  });
  return { patch, replacedValues };
}

function stripClientName(value, clientName) {
  const source = String(value || "");
  const client = String(clientName || "").trim();
  if (!client) return source;
  return source.replace(new RegExp(client.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), "Confidential client");
}

function buildJobShareMessage(session = {}) {
  const job = parseJsonObject(session.job_snapshot);
  const anonymous = String(session.client_visibility || "anonymous") === "anonymous";
  const clientName = String(job.clientName || job.client_name || "").trim();
  const titleSource = anonymous
    ? String(job.publicPostingTitle || job.public_posting_title || job.title || session.assigned_jd_title || "Opportunity")
    : String(job.title || session.assigned_jd_title || "Opportunity");
  const descriptionSource = String(job.jobDescription || job.job_description || "").trim();
  const title = cleanAnswer(anonymous ? stripClientName(titleSource, clientName) : titleSource, 220);
  const description = (anonymous ? stripClientName(descriptionSource, clientName) : descriptionSource).trim().slice(0, 3200);
  const clientLine = anonymous ? "Client: Confidential" : (clientName ? `Client: ${clientName}` : "");
  return ["Job description", `Role: ${title}`, clientLine, description].filter(Boolean).join("\n\n");
}

async function sendMetaPayload(payload, options = {}) {
  const config = screeningConfig(options);
  if (!config.accessToken || !config.phoneNumberId) throw new Error("Meta WhatsApp sending is not configured.");
  const response = await config.fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload })
  });
  const raw = await response.text().catch(() => "");
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = {}; }
  if (!response.ok) throw new Error(String(result?.error?.message || `Meta WhatsApp send failed (${response.status}).`));
  return result;
}

function buildScreeningTemplatePayload(session, candidate, options = {}) {
  const config = screeningConfig(options);
  const firstName = cleanAnswer(String(candidate?.name || "Candidate").split(/\s+/)[0], 60) || "Candidate";
  const job = parseJsonObject(session.job_snapshot);
  const clientName = String(job.clientName || job.client_name || "").trim();
  const titleSource = session.client_visibility === "anonymous"
    ? (job.publicPostingTitle || job.public_posting_title || job.title || session.assigned_jd_title)
    : (job.title || session.assigned_jd_title);
  const title = cleanAnswer(session.client_visibility === "anonymous" ? stripClientName(titleSource, clientName) : titleSource, 220);
  return {
    to: session.candidate_wa_id,
    type: "template",
    template: {
      name: config.templateName,
      language: { code: config.templateLanguage },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "candidate_name", text: firstName },
            { type: "text", parameter_name: "job_title", text: title }
          ]
        },
        { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: `ws:${session.id}:interested` }] },
        { type: "button", sub_type: "quick_reply", index: "1", parameters: [{ type: "payload", payload: `ws:${session.id}:share_jd` }] },
        { type: "button", sub_type: "quick_reply", index: "2", parameters: [{ type: "payload", payload: `ws:${session.id}:not_interested` }] }
      ]
    }
  };
}

async function sendScreeningTemplate(session, candidate, options = {}) {
  return sendMetaPayload(buildScreeningTemplatePayload(session, candidate, options), options);
}

async function sendText(to, body, options = {}) {
  return sendMetaPayload({ to, type: "text", text: { preview_url: false, body: String(body || "").slice(0, 4096) } }, options);
}

function firstMetaMessageId(result) {
  return cleanAnswer(result?.messages?.[0]?.id || "", 300) || null;
}

async function insertMessage(session, message, options = {}) {
  const rows = await supabaseRequest("whatsapp_screening_messages", "", {
    ...options,
    method: "POST",
    prefer: "return=representation",
    body: {
      id: message.id || crypto.randomUUID(),
      company_id: session.company_id,
      candidate_id: session.candidate_id,
      screening_session_id: session.id,
      assigned_jd_id: session.assigned_jd_id,
      direction: message.direction,
      sender_type: message.sender_type,
      message_type: message.message_type || "text",
      body: String(message.body || "").slice(0, 8000),
      question_context: message.question_context || null,
      meta_message_id: message.meta_message_id || null,
      webhook_event_key: message.webhook_event_key || null,
      delivery_status: message.delivery_status || null,
      sent_at: message.sent_at || null,
      created_at: message.created_at || new Date().toISOString()
    }
  });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateSession(sessionId, patch, options = {}) {
  const rows = await supabaseRequest(
    "whatsapp_screening_sessions",
    `?id=eq.${encodeURIComponent(sessionId)}&select=*`,
    { ...options, method: "PATCH", prefer: "return=representation", body: { ...patch, updated_at: new Date().toISOString() } }
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function getScreeningSession(sessionId, companyId = "", options = {}) {
  const companyFilter = companyId ? `&company_id=eq.${encodeURIComponent(companyId)}` : "";
  const rows = await supabaseRequest("whatsapp_screening_sessions", `?id=eq.${encodeURIComponent(sessionId)}${companyFilter}&select=*&limit=1`, options);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function listCandidateScreenings(candidateId, companyId, options = {}) {
  await purgeExpiredScreeningData(companyId, options).catch(() => null);
  const jobId = String(options.jobId || options.assignedJdId || "").trim();
  const jobFilter = jobId ? `&assigned_jd_id=eq.${encodeURIComponent(jobId)}` : "";
  let sessions = await supabaseRequest(
    "whatsapp_screening_sessions",
    `?candidate_id=eq.${encodeURIComponent(candidateId)}&company_id=eq.${encodeURIComponent(companyId)}${jobFilter}&select=*&order=created_at.desc&limit=25`,
    options
  );
  sessions = Array.isArray(sessions) ? sessions : [];
  const refreshed = [];
  for (const session of sessions) refreshed.push(await expireSessionIfNeeded(session, options));
  return refreshed;
}

async function purgeExpiredScreeningData(companyId, options = {}) {
  const config = screeningConfig(options);
  const now = new Date().toISOString();
  const expired = await supabaseRequest(
    "whatsapp_screening_sessions",
    `?company_id=eq.${encodeURIComponent(companyId)}&retention_until=lt.${encodeURIComponent(now)}&history_purged_at=is.null&select=id&limit=100`,
    options
  );
  for (const session of (Array.isArray(expired) ? expired : [])) {
    await supabaseRequest("whatsapp_screening_messages", `?screening_session_id=eq.${encodeURIComponent(session.id)}`, {
      ...options, method: "DELETE", prefer: "return=minimal"
    });
    await updateSession(session.id, {
      candidate_snapshot: {},
      job_snapshot: {},
      proposed_answers: {},
      confirmed_answers: {},
      conflicts: {},
      history_purged_at: now
    }, options);
  }
  const cutoff = new Date(Date.now() - config.retentionDays * 86400000).toISOString();
  await supabaseRequest("whatsapp_screening_event_processing", `?created_at=lt.${encodeURIComponent(cutoff)}`, {
    ...options, method: "DELETE", prefer: "return=minimal"
  });
  await supabaseRequest("whatsapp_webhook_events", `?received_at=lt.${encodeURIComponent(cutoff)}`, {
    ...options, method: "DELETE", prefer: "return=minimal"
  });
}

async function listScreeningMessages(sessionId, companyId, options = {}) {
  const rows = await supabaseRequest(
    "whatsapp_screening_messages",
    `?screening_session_id=eq.${encodeURIComponent(sessionId)}&company_id=eq.${encodeURIComponent(companyId)}&select=*&order=created_at.asc&limit=500`,
    options
  );
  return Array.isArray(rows) ? rows : [];
}

async function createScreeningSession({ actor, candidate, job, consent, clientVisibility = "anonymous" }, options = {}) {
  const config = screeningConfig(options);
  if (!actor?.companyId || !candidate?.id || !job?.id) throw new Error("Candidate and assigned job are required.");
  const actorCompanyId = String(actor.companyId || "").trim();
  const candidateCompanyId = String(candidate.company_id || candidate.companyId || "").trim();
  const jobCompanyId = String(job.company_id || job.companyId || "").trim();
  if (!candidateCompanyId || candidateCompanyId !== actorCompanyId) throw new Error("Candidate does not belong to the authenticated company.");
  if (!jobCompanyId || jobCompanyId !== actorCompanyId) throw new Error("Assigned job does not belong to the authenticated company.");
  const assignedJobId = String(candidate.assigned_jd_id || candidate.assignedJdId || "").trim();
  if (!assignedJobId || assignedJobId !== String(job.id)) throw new Error("Candidate must be assigned to the selected job before screening.");
  const candidateWaId = normalizeWhatsAppPhone(candidate.phone || candidate.phoneNumber);
  if (!candidateWaId) throw new Error("Candidate phone number is not a valid WhatsApp number.");
  if (!consent?.confirmed) throw new Error("Candidate WhatsApp opt-in must be confirmed before sending.");
  if (!String(consent?.source || "").trim()) throw new Error("Select the WhatsApp opt-in source.");
  if (!config.phoneNumberId || !config.templateName) throw new Error("WhatsApp screening configuration is incomplete.");

  const activeFilter = ACTIVE_SCREENING_STATUSES.join(",");
  const active = await supabaseRequest(
    "whatsapp_screening_sessions",
    `?phone_number_id=eq.${encodeURIComponent(config.phoneNumberId)}&candidate_wa_id=eq.${encodeURIComponent(candidateWaId)}&status=in.(${activeFilter})&select=*&limit=2`,
    options
  ).catch(() => []);
  const currentActive = [];
  for (const session of (Array.isArray(active) ? active : [])) {
    const refreshed = await expireSessionIfNeeded(session, options);
    if (ACTIVE_SCREENING_STATUSES.includes(String(refreshed?.status || ""))) currentActive.push(refreshed);
  }
  if (currentActive.length) throw new Error("An active WhatsApp screening already exists for this candidate number.");

  const now = new Date();
  const retentionUntil = new Date(now.getTime() + config.retentionDays * 86400000).toISOString();
  const consentRows = await supabaseRequest("whatsapp_contact_consents", "", {
    ...options,
    method: "POST",
    prefer: "return=representation",
    body: {
      company_id: actor.companyId,
      candidate_id: candidate.id,
      phone_e164: candidateWaId,
      purpose: "job_opportunity_screening",
      consent_status: "granted",
      consent_source: String(consent.source).trim(),
      consent_evidence: String(consent.evidence || "").trim().slice(0, 1000),
      consented_at: consent.consentedAt || now.toISOString(),
      recorded_by: actor.id
    }
  });
  const consentRow = Array.isArray(consentRows) ? consentRows[0] : consentRows;
  const assignedUserId = String(candidate.assigned_to_user_id || candidate.assignedToUserId || actor.id || "").trim() || null;
  const assignedName = String(candidate.assigned_to_name || candidate.assignedToName || actor.name || "").trim();
  const sessionId = crypto.randomUUID();
  const sessionRows = await supabaseRequest("whatsapp_screening_sessions", "", {
    ...options,
    method: "POST",
    prefer: "return=representation",
    body: {
      id: sessionId,
      company_id: actor.companyId,
      candidate_id: candidate.id,
      assigned_jd_id: job.id,
      assigned_jd_title: String(job.title || candidate.assigned_jd_title || "").trim(),
      assigned_to_user_id: assignedUserId,
      assigned_to_name: assignedName,
      created_by_user_id: actor.id,
      phone_number_id: config.phoneNumberId,
      candidate_wa_id: candidateWaId,
      consent_id: consentRow?.id || null,
      client_visibility: clientVisibility === "named" ? "named" : "anonymous",
      template_name: config.templateName,
      template_language: config.templateLanguage,
      status: "creating",
      current_question: "interest",
      candidate_snapshot: {
        name: candidate.name || "",
        phone: candidate.phone || "",
        current_ctc: candidate.current_ctc || "",
        expected_ctc: candidate.expected_ctc || "",
        notice_period: candidate.notice_period || ""
      },
      job_snapshot: job,
      expires_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
      retention_until: retentionUntil
    }
  });
  let session = Array.isArray(sessionRows) ? sessionRows[0] : sessionRows;
  try {
    const result = await sendScreeningTemplate(session, candidate, options);
    const metaMessageId = firstMetaMessageId(result);
    await insertMessage(session, {
      direction: "outbound",
      sender_type: "automation",
      message_type: "template",
      body: `Opportunity screening template: ${session.assigned_jd_title}`,
      question_context: "interest",
      meta_message_id: metaMessageId,
      delivery_status: "accepted",
      sent_at: now.toISOString()
    }, options);
    session = await updateSession(session.id, {
      status: "awaiting_interest",
      initial_message_id: metaMessageId,
      last_outbound_at: now.toISOString()
    }, options);
    return session;
  } catch (error) {
    await updateSession(session.id, { status: "failed", last_error: String(error?.message || error).slice(0, 1000) }, options).catch(() => null);
    throw error;
  }
}

async function sendAndRecord(session, body, questionContext, senderType = "automation", options = {}) {
  const result = await sendText(session.candidate_wa_id, body, options);
  const now = new Date().toISOString();
  await insertMessage(session, {
    direction: "outbound",
    sender_type: senderType,
    body,
    question_context: questionContext || null,
    meta_message_id: firstMetaMessageId(result),
    delivery_status: "accepted",
    sent_at: now
  }, options);
  return updateSession(session.id, { last_outbound_at: now }, options);
}

async function recordOutcome(session, outcome, notes, options = {}) {
  return saveContactAttempt(session.candidate_id, {
    recruiter_id: session.assigned_to_user_id,
    recruiter_name: session.assigned_to_name,
    jd_id: session.assigned_jd_id,
    jd_title: session.assigned_jd_title,
    outcome,
    notes,
    next_follow_up_at: null
  }, { companyId: session.company_id });
}

async function expireSessionIfNeeded(session, options = {}) {
  if (!session || !ACTIVE_SCREENING_STATUSES.includes(String(session.status || ""))) return session;
  const expiresAt = session.expires_at ? new Date(session.expires_at).getTime() : 0;
  if (!expiresAt || expiresAt > Date.now()) return session;
  const updated = await updateSession(session.id, {
    status: "not_responding",
    current_question: "completed",
    completed_at: new Date().toISOString()
  }, options);
  const attemptResult = await recordOutcome(session, "Not responding", `No response to WhatsApp screening for ${session.assigned_jd_title}.`, options);
  if (typeof options.onCandidateUpdated === "function") options.onCandidateUpdated(attemptResult?.candidate || null, attemptResult?.attempt || null, updated);
  return updated;
}

async function revokeSessionConsent(session, options = {}) {
  if (!session?.consent_id) return null;
  return supabaseRequest("whatsapp_contact_consents", `?id=eq.${encodeURIComponent(session.consent_id)}`, {
    ...options,
    method: "PATCH",
    prefer: "return=minimal",
    body: { consent_status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  });
}

async function completeConfirmedSession(session, answers, options = {}) {
  const candidates = await listCandidates({ id: session.candidate_id, companyId: session.company_id, limit: 1 });
  const candidate = Array.isArray(candidates) ? candidates[0] : null;
  if (!candidate) throw new Error("Linked candidate no longer exists.");
  const { patch, replacedValues } = buildConfirmedCandidatePatch(candidate, answers);
  const screeningAnswers = parseJsonObject(candidate.screening_answers);
  patch.screening_answers = {
    ...screeningAnswers,
    "WhatsApp interest": "Interested",
    "WhatsApp current CTC": cleanAnswer(answers.current_ctc),
    "WhatsApp expected CTC": cleanAnswer(answers.expected_ctc),
    "WhatsApp notice period": cleanAnswer(answers.notice_period),
    "WhatsApp recruiter call requested": answers.recruiter_call_requested === true ? "Yes" : "No"
  };
  if (Object.keys(patch).length) await patchCandidate(candidate.id, patch, { companyId: session.company_id });
  const notes = [
    `WhatsApp screening completed for ${session.assigned_jd_title}.`,
    `Current CTC: ${cleanAnswer(answers.current_ctc) || "Not provided"}.`,
    `Expected CTC: ${cleanAnswer(answers.expected_ctc) || "Not provided"}.`,
    `Notice: ${cleanAnswer(answers.notice_period) || "Not provided"}.`,
    `Recruiter call requested: ${answers.recruiter_call_requested === true ? "Yes" : "No"}.`
  ].join(" ");
  const attemptResult = await recordOutcome(session, "Interested", notes, options);
  const updated = await updateSession(session.id, {
    status: "completed",
    current_question: "completed",
    confirmed_answers: answers,
    conflicts: replacedValues,
    needs_recruiter_follow_up: answers.recruiter_call_requested === true,
    completed_at: new Date().toISOString()
  }, options);
  if (typeof options.onCandidateUpdated === "function") {
    options.onCandidateUpdated(attemptResult?.candidate || null, attemptResult?.attempt || null, updated);
  }
  return updated;
}

function looksLikeCandidateQuestion(value) {
  const text = cleanAnswer(value).toLowerCase();
  return /\?$/.test(text) || /^(what|where|when|why|how|which|can you|could you|please explain)\b/.test(text);
}

async function processInboundForSession(session, event, options = {}) {
  const text = extractInboundText(event);
  const replyId = extractInboundReplyId(event);
  const now = event.event_timestamp || new Date().toISOString();
  await insertMessage(session, {
    direction: "inbound",
    sender_type: "candidate",
    message_type: event.message_type || "text",
    body: text,
    question_context: session.current_question || null,
    meta_message_id: event.meta_message_id || null,
    webhook_event_key: event.event_key,
    delivery_status: "received",
    created_at: now
  }, options);
  session = await updateSession(session.id, { last_inbound_at: now }, options);
  if (session.status === "human_takeover") return session;
  if (!text && !replyId) return session;

  if (session.status === "awaiting_interest") {
    const interest = parseInterest(text, replyId);
    if (interest === "not_interested" || interest === "opt_out") {
      if (interest === "opt_out") await revokeSessionConsent(session, options);
      const attemptResult = await recordOutcome(session, "Not interested", `Not interested via WhatsApp screening for ${session.assigned_jd_title}.`, options);
      const closed = await updateSession(session.id, { status: interest === "opt_out" ? "opted_out" : "not_interested", current_question: "completed", completed_at: now }, options);
      await sendAndRecord(closed, interest === "opt_out" ? "Your WhatsApp opt-out request has been recorded." : "Thank you for letting us know. We will close this opportunity screening.", "completed", "automation", options);
      if (typeof options.onCandidateUpdated === "function") options.onCandidateUpdated(attemptResult?.candidate || null, attemptResult?.attempt || null, closed);
      return closed;
    }
    if (interest === "share_jd") {
      session = await sendAndRecord(session, buildJobShareMessage(session), "jd_shared", "automation", options);
      return sendAndRecord(session, "Would you be interested in exploring this opportunity? Please reply Interested or Not Interested.", "interest", "automation", options);
    }
    if (interest !== "interested") {
      return sendAndRecord(session, "Please choose Interested, Share JD, or Not Interested.", "interest", "automation", options);
    }
    session = await updateSession(session.id, { status: "awaiting_current_ctc", current_question: "current_ctc", proposed_answers: { interested: true } }, options);
    return sendAndRecord(session, QUESTION_PROMPTS.current_ctc, "current_ctc", "automation", options);
  }

  if (looksLikeCandidateQuestion(text) && !Object.keys(parseCombinedScreeningAnswers(text)).length) {
    session = await updateSession(session.id, {
      status: "human_takeover",
      paused_from_status: session.status,
      needs_recruiter_follow_up: true
    }, options);
    return sendAndRecord(session, "Thank you. Our recruiter will help with your question and continue the screening with you.", "human_takeover", "automation", options);
  }

  let answers = { ...parseJsonObject(session.proposed_answers), ...parseCombinedScreeningAnswers(text) };
  const currentQuestion = String(session.current_question || "");
  if (currentQuestion === "current_ctc" && !answers.current_ctc) answers.current_ctc = cleanAnswer(text);
  if (currentQuestion === "expected_ctc" && !answers.expected_ctc) answers.expected_ctc = cleanAnswer(text);
  if (currentQuestion === "notice_period" && !answers.notice_period) answers.notice_period = cleanAnswer(text);
  if (currentQuestion === "recruiter_call") {
    const yesNo = parseYesNo(text);
    if (yesNo === null) return sendAndRecord(session, QUESTION_PROMPTS.recruiter_call, "recruiter_call", "automation", options);
    answers.recruiter_call_requested = yesNo;
  }
  if (session.status === "awaiting_confirmation") {
    const corrections = parseCombinedScreeningAnswers(text);
    if (Object.keys(corrections).length) {
      answers = { ...answers, ...corrections };
      session = await updateSession(session.id, { proposed_answers: answers }, options);
      return sendAndRecord(session, formatConfirmation(answers), "confirmation", "automation", options);
    }
    const confirmed = parseYesNo(text) === true || /^(confirm|confirmed|correct|save)$/i.test(cleanAnswer(text));
    if (!confirmed) return sendAndRecord(session, "Please reply Confirm, or send a labelled correction such as ‘Expected CTC: 18 LPA’.", "confirmation", "automation", options);
    return completeConfirmedSession(session, answers, options);
  }

  const nextQuestion = nextMissingQuestion(answers);
  session = await updateSession(session.id, {
    proposed_answers: answers,
    current_question: nextQuestion,
    status: questionStatus(nextQuestion),
    needs_recruiter_follow_up: answers.recruiter_call_requested === true
  }, options);
  const prompt = nextQuestion === "confirmation" ? formatConfirmation(answers) : QUESTION_PROMPTS[nextQuestion];
  return sendAndRecord(session, prompt, nextQuestion, "automation", options);
}

async function claimEvent(event, options = {}) {
  try {
    const claimed = await supabaseRequest("rpc/claim_whatsapp_screening_event", "", {
      ...options,
      method: "POST",
      body: { p_event_key: event.event_key, p_webhook_event_id: event.id || null }
    });
    return Boolean(claimed && (typeof claimed !== "object" || !Array.isArray(claimed) || claimed.length > 0));
  } catch {
    return false;
  }
}

async function finishEvent(eventKey, patch, options = {}) {
  return supabaseRequest("whatsapp_screening_event_processing", `?event_key=eq.${encodeURIComponent(eventKey)}`, {
    ...options,
    method: "PATCH",
    prefer: "return=minimal",
    body: { ...patch, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  });
}

async function findActiveSessionsForEvent(event, options = {}) {
  const phoneNumberId = cleanAnswer(event.phone_number_id, 200);
  const waId = normalizeWhatsAppPhone(event.sender_wa_id);
  if (!phoneNumberId || !waId) return [];
  const statuses = ACTIVE_SCREENING_STATUSES.join(",");
  const rows = await supabaseRequest(
    "whatsapp_screening_sessions",
    `?phone_number_id=eq.${encodeURIComponent(phoneNumberId)}&candidate_wa_id=eq.${encodeURIComponent(waId)}&status=in.(${statuses})&select=*&order=created_at.desc&limit=3`,
    options
  );
  return Array.isArray(rows) ? rows : [];
}

async function processStatusEvent(event, options = {}) {
  if (!event.meta_message_id) return null;
  const rows = await supabaseRequest("whatsapp_screening_messages", `?meta_message_id=eq.${encodeURIComponent(event.meta_message_id)}&select=*&limit=1`, options);
  const message = Array.isArray(rows) ? rows[0] : null;
  if (!message) return null;
  const status = String(event.delivery_status || "").trim();
  const timestamp = event.event_timestamp || new Date().toISOString();
  const patch = { delivery_status: status };
  if (status === "delivered") patch.delivered_at = timestamp;
  if (status === "read") patch.read_at = timestamp;
  if (status === "failed") patch.failed_at = timestamp;
  await supabaseRequest("whatsapp_screening_messages", `?id=eq.${encodeURIComponent(message.id)}`, {
    ...options, method: "PATCH", prefer: "return=minimal", body: patch
  });
  return message.screening_session_id || null;
}

async function processWhatsAppScreeningEvents(events, options = {}) {
  const results = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (!event?.event_key || !(await claimEvent(event, options))) continue;
    try {
      if (event.event_type === "status") {
        const sessionId = await processStatusEvent(event, options);
        await finishEvent(event.event_key, { status: sessionId ? "processed" : "ignored", screening_session_id: sessionId }, options);
        results.push({ eventKey: event.event_key, status: sessionId ? "processed" : "ignored" });
        continue;
      }
      if (event.event_type !== "message") {
        await finishEvent(event.event_key, { status: "ignored" }, options);
        continue;
      }
      const sessions = await findActiveSessionsForEvent(event, options);
      if (sessions.length !== 1) {
        await finishEvent(event.event_key, {
          status: sessions.length > 1 ? "ambiguous" : "ignored",
          error_message: sessions.length > 1 ? "Multiple active screening sessions matched this WhatsApp identity." : null
        }, options);
        continue;
      }
      const updated = await processInboundForSession(sessions[0], event, options);
      await finishEvent(event.event_key, { status: "processed", screening_session_id: updated?.id || sessions[0].id }, options);
      results.push({ eventKey: event.event_key, status: "processed", sessionId: updated?.id || sessions[0].id });
    } catch (error) {
      await finishEvent(event.event_key, { status: "failed", error_message: String(error?.message || error).slice(0, 1000) }, options).catch(() => null);
      results.push({ eventKey: event.event_key, status: "failed" });
    }
  }
  return results;
}

async function setHumanTakeover(session, actor, action, options = {}) {
  const normalizedAction = String(action || "pause").toLowerCase();
  if (normalizedAction === "resume") {
    const resumeStatus = String(session.paused_from_status || questionStatus(session.current_question || "current_ctc"));
    return updateSession(session.id, { status: resumeStatus, paused_from_status: null }, options);
  }
  return updateSession(session.id, { status: "human_takeover", paused_from_status: session.status }, options);
}

async function sendManualScreeningMessage(session, actor, message, options = {}) {
  const text = cleanAnswer(message, 4000);
  if (!text) throw new Error("Message is required.");
  const lastInbound = session.last_inbound_at ? new Date(session.last_inbound_at).getTime() : 0;
  if (!lastInbound || Date.now() - lastInbound > 24 * 60 * 60 * 1000) {
    throw new Error("The 24-hour WhatsApp service window is closed. Use an approved template to restart contact.");
  }
  let activeSession = session;
  if (activeSession.status !== "human_takeover") activeSession = await setHumanTakeover(activeSession, actor, "pause", options);
  return sendAndRecord(activeSession, text, activeSession.current_question || null, "recruiter", options);
}

module.exports = {
  ACTIVE_SCREENING_STATUSES,
  buildConfirmedCandidatePatch,
  buildJobShareMessage,
  buildScreeningTemplatePayload,
  createScreeningSession,
  extractInboundReplyId,
  extractInboundText,
  formatConfirmation,
  getScreeningSession,
  listCandidateScreenings,
  listScreeningMessages,
  normalizeWhatsAppPhone,
  parseCombinedScreeningAnswers,
  parseInterest,
  parseYesNo,
  processWhatsAppScreeningEvents,
  screeningConfig,
  sendManualScreeningMessage,
  setHumanTakeover
};
