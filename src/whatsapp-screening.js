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
  "awaiting_call_time",
  "awaiting_confirmation",
  "human_takeover"
];

const QUESTION_PROMPTS = {
  current_ctc: "What is your current CTC?",
  expected_ctc: "What is your expected CTC?",
  notice_period: "What is your notice period or earliest joining availability?",
  recruiter_call: "Would you like to connect with our recruiter for more details?",
  call_time: "Please share a convenient date and time for the recruiter to contact you."
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

function parseYesNo(value, replyId = "") {
  const id = String(replyId || "").trim().toLowerCase();
  if (/:(?:call_)?yes$|:confirm$/.test(id)) return true;
  if (/:(?:call_)?no$/.test(id)) return false;
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
  if (answers.recruiter_call_requested === true && !cleanAnswer(answers.preferred_call_time)) return "call_time";
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
    answers.recruiter_call_requested === true ? `Preferred call time: ${cleanAnswer(answers.preferred_call_time) || "Not provided"}` : "",
    "Please choose Confirm to save, or Edit to revise these details."
  ].filter(Boolean).join("\n");
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

function stripClientName(value, clientName, replacement = "") {
  const source = String(value || "");
  const client = String(clientName || "").trim();
  if (!client) return source;
  return source
    .replace(new RegExp(client.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), String(replacement || ""))
    .replace(/\s*[-|]\s*(?=$|\n)/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code) || 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16) || 32));
}

function htmlToWhatsAppText(value) {
  return decodeHtmlEntities(
    String(value || "")
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*\/\s*(?:p|div|section|h[1-6])\s*>/gi, "\n\n")
      .replace(/<\s*li\b[^>]*>/gi, "\n• ")
      .replace(/<\s*\/\s*li\s*>/gi, "")
      .replace(/<\s*(?:strong|b)\b[^>]*>/gi, "*")
      .replace(/<\s*\/\s*(?:strong|b)\s*>/gi, "*")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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
  const publicCompanyLine = cleanAnswer(job.publicCompanyLine || job.public_company_line, 300);
  const companyLine = anonymous
    ? (publicCompanyLine || "A leading organization in this sector")
    : clientName;
  const description = htmlToWhatsAppText(anonymous ? stripClientName(descriptionSource, clientName, "the company") : descriptionSource).slice(0, 2500);
  const applyLink = String(job.publicApplyLink || job.public_apply_link || job.applyLink || job.apply_link || "").trim();
  return [
    `*Position:* ${title}`,
    companyLine ? `*Company:* ${companyLine}` : "",
    description ? `*About the role:*\n${description}` : "",
    applyLink ? `*View full JD / Apply:*\n${applyLink}` : ""
  ].filter(Boolean).join("\n\n");
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

async function sendInteractiveButtons(to, body, buttons, options = {}) {
  const replies = (Array.isArray(buttons) ? buttons : []).slice(0, 3).map((button) => ({
    type: "reply",
    reply: {
      id: cleanAnswer(button?.id, 240),
      title: cleanAnswer(button?.title, 20)
    }
  })).filter((button) => button.reply.id && button.reply.title);
  if (!replies.length) return sendText(to, body, options);
  return sendMetaPayload({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: String(body || "").slice(0, 1024) },
      action: { buttons: replies }
    }
  }, options);
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
  const activeSessionIds = refreshed
    .filter((session) => ACTIVE_SCREENING_STATUSES.includes(String(session?.status || "")))
    .map((session) => String(session?.id || "").trim())
    .filter(Boolean);
  if (activeSessionIds.length) {
    const failedMessages = await supabaseRequest(
      "whatsapp_screening_messages",
      `?screening_session_id=in.(${activeSessionIds.join(",")})&delivery_status=eq.failed&select=screening_session_id&limit=100`,
      options
    ).catch(() => []);
    const failedSessionIds = new Set((Array.isArray(failedMessages) ? failedMessages : []).map((message) => String(message?.screening_session_id || "")));
    for (let index = 0; index < refreshed.length; index += 1) {
      const session = refreshed[index];
      if (!failedSessionIds.has(String(session?.id || "")) || !ACTIVE_SCREENING_STATUSES.includes(String(session?.status || ""))) continue;
      refreshed[index] = await updateSession(session.id, {
        status: "failed",
        last_error: session.last_error || "Meta accepted the request but could not deliver the WhatsApp message."
      }, options) || session;
    }
  }
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
  const publicPortalBaseUrl = String(process.env.PUBLIC_PORTAL_BASE_URL || "https://recruit.kompatibleminds.com").trim().replace(/\/+$/, "");
  const jobSnapshot = {
    ...job,
    publicApplyLink: String(job.publicApplyLink || job.public_apply_link || "").trim()
      || `${publicPortalBaseUrl}/apply-public/${encodeURIComponent(String(job.id || "").trim())}`
  };
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
      job_snapshot: jobSnapshot,
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

async function sendButtonsAndRecord(session, body, questionContext, buttons, options = {}) {
  const result = await sendInteractiveButtons(session.candidate_wa_id, body, buttons, options);
  const now = new Date().toISOString();
  await insertMessage(session, {
    direction: "outbound",
    sender_type: "automation",
    message_type: "interactive",
    body,
    question_context: questionContext || null,
    meta_message_id: firstMetaMessageId(result),
    delivery_status: "accepted",
    sent_at: now
  }, options);
  return updateSession(session.id, { last_outbound_at: now }, options);
}

function interestButtons(sessionId) {
  return [
    { id: `ws:${sessionId}:interested`, title: "Interested" },
    { id: `ws:${sessionId}:not_interested`, title: "Not Interested" }
  ];
}

function recruiterCallButtons(sessionId) {
  return [
    { id: `ws:${sessionId}:call_yes`, title: "Yes" },
    { id: `ws:${sessionId}:call_no`, title: "No" }
  ];
}

function preferredCallTimeButtons(sessionId) {
  return [
    { id: `ws:${sessionId}:call_today`, title: "Today" },
    { id: `ws:${sessionId}:call_tomorrow`, title: "Tomorrow" },
    { id: `ws:${sessionId}:call_custom`, title: "Choose date/time" }
  ];
}

function confirmationButtons(sessionId) {
  return [
    { id: `ws:${sessionId}:confirm`, title: "Confirm" },
    { id: `ws:${sessionId}:edit`, title: "Edit" }
  ];
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
    "WhatsApp recruiter call requested": answers.recruiter_call_requested === true ? "Yes" : "No",
    "WhatsApp preferred call time": answers.recruiter_call_requested === true ? cleanAnswer(answers.preferred_call_time) : ""
  };
  const originalAnswers = parseJsonObject(answers._revision_original);
  const revisionLabels = {
    current_ctc: "Current CTC",
    expected_ctc: "Expected CTC",
    notice_period: "Notice period",
    preferred_call_time: "Preferred call time"
  };
  const revisionLines = Object.keys(revisionLabels).map((field) => {
    const previous = cleanAnswer(originalAnswers[field]);
    const confirmed = cleanAnswer(answers[field]);
    return previous && previous.toLowerCase() !== confirmed.toLowerCase()
      ? `${revisionLabels[field]} revised: ${previous} → ${confirmed || "Not provided"}`
      : "";
  }).filter(Boolean);
  const recruiterNoteEntry = [
    "WhatsApp screening confirmed.",
    `Current CTC: ${cleanAnswer(answers.current_ctc) || "Not provided"}`,
    `Expected CTC: ${cleanAnswer(answers.expected_ctc) || "Not provided"}`,
    `Notice period: ${cleanAnswer(answers.notice_period) || "Not provided"}`,
    `Recruiter call requested: ${answers.recruiter_call_requested === true ? "Yes" : "No"}`,
    answers.recruiter_call_requested === true ? `Preferred call time: ${cleanAnswer(answers.preferred_call_time) || "Not provided"}` : "",
    ...revisionLines
  ].filter(Boolean).join("\n");
  patch.recruiter_context_notes = [String(candidate.recruiter_context_notes || "").trim().slice(-6000), recruiterNoteEntry]
    .filter(Boolean)
    .join("\n\n")
    .slice(-8000);
  if (Object.keys(patch).length) await patchCandidate(candidate.id, patch, { companyId: session.company_id });
  const notes = [
    `WhatsApp screening completed for ${session.assigned_jd_title}.`,
    `Current CTC: ${cleanAnswer(answers.current_ctc) || "Not provided"}.`,
    `Expected CTC: ${cleanAnswer(answers.expected_ctc) || "Not provided"}.`,
    `Notice: ${cleanAnswer(answers.notice_period) || "Not provided"}.`,
    `Recruiter call requested: ${answers.recruiter_call_requested === true ? "Yes" : "No"}.`,
    answers.recruiter_call_requested === true ? `Preferred contact time: ${cleanAnswer(answers.preferred_call_time) || "Not provided"}.` : "",
    ...revisionLines.map((line) => `${line}.`)
  ].filter(Boolean).join(" ");
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

async function sendQuestion(session, question, options = {}) {
  if (question === "recruiter_call") {
    return sendButtonsAndRecord(session, QUESTION_PROMPTS.recruiter_call, question, recruiterCallButtons(session.id), options);
  }
  if (question === "call_time") {
    return sendButtonsAndRecord(session, "When would you prefer the recruiter to contact you?", question, preferredCallTimeButtons(session.id), options);
  }
  if (question === "confirmation") {
    return sendButtonsAndRecord(session, formatConfirmation(parseJsonObject(session.proposed_answers)), question, confirmationButtons(session.id), options);
  }
  return sendAndRecord(session, QUESTION_PROMPTS[question], question, "automation", options);
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
      const attemptResult = await recordOutcome(session, "JD shared", `JD shared via WhatsApp screening for ${session.assigned_jd_title}.`, options);
      if (typeof options.onCandidateUpdated === "function") options.onCandidateUpdated(attemptResult?.candidate || null, attemptResult?.attempt || null, session);
      return sendButtonsAndRecord(
        session,
        "Would you be interested in exploring this opportunity?",
        "interest",
        interestButtons(session.id),
        options
      );
    }
    if (interest !== "interested") {
      return sendButtonsAndRecord(session, "Please choose an option below.", "interest", interestButtons(session.id), options);
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
    const yesNo = parseYesNo(text, replyId);
    if (yesNo === null) return sendQuestion(session, "recruiter_call", options);
    answers.recruiter_call_requested = yesNo;
    if (yesNo === false) delete answers.preferred_call_time;
  }
  if (currentQuestion === "call_time") {
    const normalizedReplyId = String(replyId || "").toLowerCase();
    if (normalizedReplyId.endsWith(":call_custom")) {
      session = await updateSession(session.id, { proposed_answers: answers }, options);
      return sendAndRecord(session, QUESTION_PROMPTS.call_time, "call_time", "automation", options);
    }
    if (normalizedReplyId.endsWith(":call_today")) answers.preferred_call_time = "Today";
    else if (normalizedReplyId.endsWith(":call_tomorrow")) answers.preferred_call_time = "Tomorrow";
    else answers.preferred_call_time = cleanAnswer(text);
    if (!answers.preferred_call_time || /^choose date\/time$/i.test(answers.preferred_call_time)) {
      return sendAndRecord(session, QUESTION_PROMPTS.call_time, "call_time", "automation", options);
    }
  }
  if (session.status === "awaiting_confirmation") {
    const normalizedReplyId = String(replyId || "").toLowerCase();
    if (normalizedReplyId.endsWith(":edit")) {
      const originalAnswers = parseJsonObject(answers._revision_original);
      const revisionOriginal = Object.keys(originalAnswers).length ? originalAnswers : {
        current_ctc: cleanAnswer(answers.current_ctc),
        expected_ctc: cleanAnswer(answers.expected_ctc),
        notice_period: cleanAnswer(answers.notice_period),
        recruiter_call_requested: answers.recruiter_call_requested === true,
        preferred_call_time: cleanAnswer(answers.preferred_call_time)
      };
      const restartedAnswers = {
        interested: true,
        _revision_original: revisionOriginal,
        _revision_count: Number(answers._revision_count || 0) + 1
      };
      session = await updateSession(session.id, {
        status: "awaiting_current_ctc",
        current_question: "current_ctc",
        proposed_answers: restartedAnswers,
        needs_recruiter_follow_up: false
      }, options);
      return sendQuestion(session, "current_ctc", options);
    }
    const corrections = parseCombinedScreeningAnswers(text);
    if (Object.keys(corrections).length) {
      answers = { ...answers, ...corrections };
      session = await updateSession(session.id, { proposed_answers: answers }, options);
      return sendButtonsAndRecord(session, formatConfirmation(answers), "confirmation", confirmationButtons(session.id), options);
    }
    const confirmed = normalizedReplyId.endsWith(":confirm") || parseYesNo(text, replyId) === true || /^(confirm|confirmed|correct|save)$/i.test(cleanAnswer(text));
    if (!confirmed) return sendButtonsAndRecord(session, "Please choose Confirm to save or Edit to revise your details.", "confirmation", confirmationButtons(session.id), options);
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
  if (nextQuestion === "confirmation") return sendButtonsAndRecord(session, prompt, nextQuestion, confirmationButtons(session.id), options);
  return sendQuestion(session, nextQuestion, options);
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
  if (status === "failed") {
    await updateSession(message.screening_session_id, {
      status: "failed",
      last_error: extractMetaStatusError(event) || "Meta accepted the request but could not deliver the WhatsApp message."
    }, options);
  }
  return message.screening_session_id || null;
}

function extractMetaStatusError(event = {}) {
  const statusPayload = event?.payload?.status || {};
  const error = Array.isArray(statusPayload?.errors) ? statusPayload.errors[0] : null;
  if (!error) return "";
  const code = String(error.code || "").trim();
  const title = cleanAnswer(error.title || error.message, 300);
  const detail = cleanAnswer(error?.error_data?.details, 600);
  return [code ? `Meta error ${code}` : "", title, detail].filter(Boolean).join(": ").slice(0, 1000);
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
  extractMetaStatusError,
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
