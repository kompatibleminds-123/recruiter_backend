const crypto = require("crypto");
const { getAssessmentById } = require("./auth-store");
const { listCandidates } = require("./quick-capture");
const { normalizeWhatsAppPhone } = require("./whatsapp-screening");

const REMINDER_TIMEZONE = "Asia/Kolkata";
const OPEN_REMINDER_STATUSES = ["scheduled", "sending", "awaiting_response", "review_required"];

function reminderConfig(options = {}) {
  const templateName = String(options.templateName || process.env.META_WHATSAPP_INTERVIEW_REMINDER_TEMPLATE_NAME || "km_interview_reminder").trim();
  const configuredTemplateLanguage = String(options.templateLanguage || process.env.META_WHATSAPP_INTERVIEW_REMINDER_TEMPLATE_LANGUAGE || "en").trim() || "en";
  const templateLanguage = templateName === "km_interview_reminder" && /^(?:en_us|english)$/i.test(configuredTemplateLanguage)
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
    sendWindowMinutes: Math.max(1, Math.min(30, Number(options.sendWindowMinutes || process.env.WHATSAPP_INTERVIEW_REMINDER_SEND_WINDOW_MINUTES || 15))),
    fetchImpl: options.fetchImpl || fetch
  };
}

async function supabaseRequest(table, query = "", options = {}) {
  const config = reminderConfig(options);
  if (!config.supabaseUrl || !config.serviceRoleKey) throw new Error("Supabase service role is not configured.");
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
    try { message = JSON.parse(raw)?.message || JSON.parse(raw)?.error || raw; } catch {}
    throw new Error(String(message || `Supabase ${table} request failed (${response.status}).`));
  }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function cleanText(value, maxLength = 500) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function parseInterviewDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(raw) ? `${raw}+05:30` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function indiaDateParts(dateValue) {
  const date = dateValue instanceof Date ? dateValue : parseInterviewDate(dateValue);
  if (!date) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: REMINDER_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute)
  };
}

function reminderScheduleForInterview(interviewAt) {
  const date = parseInterviewDate(interviewAt);
  const parts = indiaDateParts(date);
  if (!date || !parts) return null;
  return {
    interviewAt: date.toISOString(),
    scheduledSendAt: new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 4, 30, 0)).toISOString(),
    interviewAfterTen: parts.hour > 10 || (parts.hour === 10 && parts.minute > 0)
  };
}

function ordinalDay(day) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  return `${day}${day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"}`;
}

function formatInterviewDate(interviewAt) {
  const date = parseInterviewDate(interviewAt);
  const parts = indiaDateParts(date);
  if (!date || !parts) return "";
  const month = new Intl.DateTimeFormat("en-US", { timeZone: REMINDER_TIMEZONE, month: "short" }).format(date);
  return `${ordinalDay(parts.day)} ${month}`;
}

function formatInterviewTime(interviewAt) {
  const date = parseInterviewDate(interviewAt);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: REMINDER_TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function isTerminalInterviewStatus(value) {
  return /\b(cancelled|canceled|completed|joined|reject|rejected|dropped|withdrawn|did not attend|no show)\b/i.test(String(value || ""));
}

function assessmentOwnerId(assessment = {}) {
  return String(assessment.recruiterId || assessment.recruiter_id || assessment.assignedToUserId || assessment.assigned_to_user_id || "").trim();
}

function assertAssessmentReminderAccess(actor, assessment) {
  if (!assessment || String(assessment.companyId || assessment.company_id || "").trim() !== String(actor?.companyId || "").trim()) {
    throw new Error("Assessment was not found for this company.");
  }
  if (String(actor?.role || "").toLowerCase() !== "admin" && assessmentOwnerId(assessment) !== String(actor?.id || "").trim()) {
    throw new Error("You can only manage reminders for your own assessments.");
  }
}

async function loadAssessmentCandidate(assessment, companyId) {
  const candidateId = String(assessment?.candidateId || assessment?.candidate_id || "").trim();
  if (!candidateId) throw new Error("Assessment is not linked to a candidate.");
  const rows = await listCandidates({ id: candidateId, companyId, limit: 1 });
  const candidate = Array.isArray(rows) ? rows[0] : null;
  if (!candidate) throw new Error("Linked candidate was not found.");
  return candidate;
}

function reminderSnapshot({ actor, assessment, candidate, config }) {
  const schedule = reminderScheduleForInterview(assessment.interviewAt || assessment.interview_at);
  if (!schedule) throw new Error("Schedule the interview before enabling its WhatsApp reminder.");
  const candidateWaId = normalizeWhatsAppPhone(candidate.phone || candidate.phoneNumber || assessment.phoneNumber || assessment.phone_number);
  if (!candidateWaId) throw new Error("Candidate phone number is not a valid WhatsApp number.");
  const candidateName = cleanText(assessment.candidateName || assessment.candidate_name || candidate.name, 160);
  const jobTitle = cleanText(assessment.jdTitle || assessment.jd_title || candidate.assigned_jd_title || candidate.jd_title, 240);
  const companyName = cleanText(assessment.clientName || assessment.client_name || candidate.client_name, 240);
  if (!candidateName || !jobTitle || !companyName) throw new Error("Candidate name, position and client/company are required for the reminder template.");
  if (!config.phoneNumberId || !config.templateName) throw new Error("WhatsApp interview reminder configuration is incomplete.");
  return {
    schedule,
    candidateWaId,
    candidateName,
    jobTitle,
    companyName,
    candidateId: String(candidate.id || "").trim(),
    assignedJdId: String(candidate.assigned_jd_id || candidate.assignedJdId || "").trim() || null,
    recruiterId: assessmentOwnerId(assessment) || String(actor?.id || "").trim() || null,
    recruiterName: cleanText(assessment.recruiterName || assessment.recruiter_name || candidate.assigned_to_name || actor?.name, 160)
  };
}

async function listInterviewReminders(assessmentId, companyId, options = {}) {
  const rows = await supabaseRequest(
    "whatsapp_interview_reminders",
    `?assessment_id=eq.${encodeURIComponent(assessmentId)}&company_id=eq.${encodeURIComponent(companyId)}&select=*&order=created_at.desc&limit=50`,
    options
  );
  return Array.isArray(rows) ? rows : [];
}

async function listInterviewReminderMessages(reminderId, companyId, options = {}) {
  const rows = await supabaseRequest(
    "whatsapp_interview_reminder_messages",
    `?reminder_id=eq.${encodeURIComponent(reminderId)}&company_id=eq.${encodeURIComponent(companyId)}&select=*&order=created_at.asc&limit=500`,
    options
  );
  return Array.isArray(rows) ? rows : [];
}

async function enableInterviewReminder({ actor, assessment, candidate }, options = {}) {
  assertAssessmentReminderAccess(actor, assessment);
  if (isTerminalInterviewStatus(assessment.candidateStatus || assessment.candidate_status || assessment.status)) {
    throw new Error("This interview is already cancelled, completed or inactive.");
  }
  const config = reminderConfig(options);
  const snapshot = reminderSnapshot({ actor, assessment, candidate, config });
  const now = new Date();
  const existingRows = await supabaseRequest(
    "whatsapp_interview_reminders",
    `?assessment_id=eq.${encodeURIComponent(assessment.id)}&interview_at=eq.${encodeURIComponent(snapshot.schedule.interviewAt)}&select=*&limit=1`,
    options
  );
  const existing = Array.isArray(existingRows) ? existingRows[0] || null : null;
  if (existing?.sent_at || existing?.initial_message_id || ["sending", "awaiting_response", "confirmed", "review_required"].includes(existing?.status)) {
    return existing;
  }
  let status = "scheduled";
  let skippedReason = null;
  if (!snapshot.schedule.interviewAfterTen) {
    status = "skipped";
    skippedReason = "Interview is scheduled at or before 10:00 AM IST.";
  } else if (new Date(snapshot.schedule.scheduledSendAt).getTime() < now.getTime()) {
    status = "skipped";
    skippedReason = "The 10:00 AM IST reminder window has already passed.";
  }
  await supabaseRequest(
    "whatsapp_interview_reminders",
    `?assessment_id=eq.${encodeURIComponent(assessment.id)}&company_id=eq.${encodeURIComponent(actor.companyId)}&status=in.(scheduled,sending,awaiting_response,review_required)&interview_at=neq.${encodeURIComponent(snapshot.schedule.interviewAt)}`,
    {
      ...options,
      method: "PATCH",
      prefer: "return=minimal",
      body: { enabled: false, status: "superseded", superseded_at: now.toISOString(), updated_at: now.toISOString() }
    }
  );
  const rows = await supabaseRequest("whatsapp_interview_reminders", "?on_conflict=assessment_id,interview_at", {
    ...options,
    method: "POST",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      company_id: actor.companyId,
      assessment_id: assessment.id,
      candidate_id: snapshot.candidateId,
      assigned_jd_id: snapshot.assignedJdId,
      recruiter_id: snapshot.recruiterId,
      recruiter_name: snapshot.recruiterName,
      candidate_name: snapshot.candidateName,
      candidate_wa_id: snapshot.candidateWaId,
      job_title: snapshot.jobTitle,
      company_name: snapshot.companyName,
      phone_number_id: config.phoneNumberId,
      interview_at: snapshot.schedule.interviewAt,
      interview_timezone: REMINDER_TIMEZONE,
      scheduled_send_at: snapshot.schedule.scheduledSendAt,
      enabled: status === "scheduled",
      status,
      template_name: config.templateName,
      template_language: config.templateLanguage,
      skipped_reason: skippedReason,
      updated_at: now.toISOString()
    }
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function sendInterviewReminderNow({ actor, assessment, candidate }, options = {}) {
  assertAssessmentReminderAccess(actor, assessment);
  if (isTerminalInterviewStatus(assessment.candidateStatus || assessment.candidate_status || assessment.status)) {
    throw new Error("This interview is already cancelled, completed or inactive.");
  }
  const config = reminderConfig(options);
  const snapshot = reminderSnapshot({ actor, assessment, candidate, config });
  const now = new Date().toISOString();
  let existingRows = await supabaseRequest(
    "whatsapp_interview_reminders",
    `?assessment_id=eq.${encodeURIComponent(assessment.id)}&interview_at=eq.${encodeURIComponent(snapshot.schedule.interviewAt)}&select=*&limit=1`,
    options
  );
  let reminder = Array.isArray(existingRows) ? existingRows[0] || null : null;
  if (["sending", "awaiting_response", "confirmed", "review_required"].includes(String(reminder?.status || ""))) {
    return { reminder, sent: false, alreadySent: true };
  }
  if (!reminder) {
    const inserted = await supabaseRequest("whatsapp_interview_reminders", "?on_conflict=assessment_id,interview_at", {
      ...options,
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=representation",
      body: {
        company_id: actor.companyId,
        assessment_id: assessment.id,
        candidate_id: snapshot.candidateId,
        assigned_jd_id: snapshot.assignedJdId,
        recruiter_id: snapshot.recruiterId,
        recruiter_name: snapshot.recruiterName,
        candidate_name: snapshot.candidateName,
        candidate_wa_id: snapshot.candidateWaId,
        job_title: snapshot.jobTitle,
        company_name: snapshot.companyName,
        phone_number_id: config.phoneNumberId,
        interview_at: snapshot.schedule.interviewAt,
        interview_timezone: REMINDER_TIMEZONE,
        scheduled_send_at: now,
        enabled: false,
        status: "scheduled",
        template_name: config.templateName,
        template_language: config.templateLanguage,
        updated_at: now
      }
    });
    reminder = Array.isArray(inserted) ? inserted[0] || null : inserted;
    if (!reminder) {
      existingRows = await supabaseRequest(
        "whatsapp_interview_reminders",
        `?assessment_id=eq.${encodeURIComponent(assessment.id)}&interview_at=eq.${encodeURIComponent(snapshot.schedule.interviewAt)}&select=*&limit=1`,
        options
      );
      reminder = Array.isArray(existingRows) ? existingRows[0] || null : null;
    }
  }
  if (!reminder) throw new Error("Interview reminder could not be prepared.");
  const claimedRows = await supabaseRequest(
    "whatsapp_interview_reminders",
    `?id=eq.${encodeURIComponent(reminder.id)}&status=in.(scheduled,failed,skipped,superseded,cancelled)&select=*`,
    {
      ...options,
      method: "PATCH",
      prefer: "return=representation",
      body: {
        status: "sending",
        enabled: false,
        candidate_name: snapshot.candidateName,
        candidate_wa_id: snapshot.candidateWaId,
        job_title: snapshot.jobTitle,
        company_name: snapshot.companyName,
        recruiter_id: snapshot.recruiterId,
        recruiter_name: snapshot.recruiterName,
        template_name: config.templateName,
        template_language: config.templateLanguage,
        last_error: null,
        failed_at: null,
        updated_at: now
      }
    }
  );
  const claimed = Array.isArray(claimedRows) ? claimedRows[0] || null : claimedRows;
  if (!claimed) {
    const latest = await getInterviewReminder(reminder.id, actor.companyId, options);
    return { reminder: latest || reminder, sent: false, alreadySent: true };
  }
  try {
    const response = await sendMetaPayload(buildInterviewReminderTemplatePayload(claimed, options), options);
    const messageId = cleanText(response?.messages?.[0]?.id, 300) || null;
    await insertReminderMessage(claimed, {
      direction: "outbound",
      sender_type: "recruiter",
      message_type: "template",
      body: `Interview reminder: ${claimed.job_title} | ${formatInterviewDate(claimed.interview_at)} ${formatInterviewTime(claimed.interview_at)}`,
      meta_message_id: messageId,
      delivery_status: "accepted",
      sent_at: now
    }, options);
    const updated = await patchReminder(claimed.id, {
      status: "awaiting_response",
      initial_message_id: messageId,
      sent_at: now,
      last_outbound_at: now
    }, options);
    return { reminder: updated || claimed, sent: true, alreadySent: false };
  } catch (error) {
    await patchReminder(claimed.id, {
      status: "failed",
      failed_at: new Date().toISOString(),
      last_error: String(error?.message || error).slice(0, 1000)
    }, options).catch(() => null);
    throw error;
  }
}

async function disableInterviewReminder(reminderId, companyId, options = {}) {
  const rows = await supabaseRequest(
    "whatsapp_interview_reminders",
    `?id=eq.${encodeURIComponent(reminderId)}&company_id=eq.${encodeURIComponent(companyId)}&status=in.(${OPEN_REMINDER_STATUSES.join(",")})`,
    { ...options, method: "PATCH", prefer: "return=representation", body: { enabled: false, status: "cancelled", updated_at: new Date().toISOString() } }
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function resolveInterviewReminder(reminderId, companyId, actorId, action, note, options = {}) {
  const normalizedAction = String(action || "resolve").trim().toLowerCase();
  const patch = {
    review_resolved_at: new Date().toISOString(),
    review_resolved_by: actorId || null,
    resolution_note: cleanText(note, 1000),
    updated_at: new Date().toISOString()
  };
  patch.status = normalizedAction === "confirm" ? "confirmed" : "awaiting_response";
  if (normalizedAction === "confirm") patch.confirmed_at = new Date().toISOString();
  const rows = await supabaseRequest(
    "whatsapp_interview_reminders",
    `?id=eq.${encodeURIComponent(reminderId)}&company_id=eq.${encodeURIComponent(companyId)}&status=eq.review_required`,
    { ...options, method: "PATCH", prefer: "return=representation", body: patch }
  );
  return Array.isArray(rows) ? rows[0] || null : rows;
}

function buildInterviewReminderTemplatePayload(reminder, options = {}) {
  const config = reminderConfig(options);
  return {
    to: reminder.candidate_wa_id,
    type: "template",
    template: {
      name: reminder.template_name || config.templateName,
      language: { code: reminder.template_language || config.templateLanguage },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", parameter_name: "candidate_name", text: reminder.candidate_name },
            { type: "text", parameter_name: "job_title", text: reminder.job_title },
            { type: "text", parameter_name: "company_name", text: reminder.company_name },
            { type: "text", parameter_name: "interview_date", text: formatInterviewDate(reminder.interview_at) },
            { type: "text", parameter_name: "interview_time", text: formatInterviewTime(reminder.interview_at) }
          ]
        },
        { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: `wi:${reminder.id}:confirm` }] }
      ]
    }
  };
}

async function sendMetaPayload(payload, options = {}) {
  const config = reminderConfig(options);
  if (!config.accessToken || !config.phoneNumberId) throw new Error("Meta WhatsApp sending is not configured.");
  const response = await config.fetchImpl(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.accessToken}` },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload })
  });
  const raw = await response.text().catch(() => "");
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch {}
  if (!response.ok) throw new Error(String(result?.error?.message || `Meta WhatsApp send failed (${response.status}).`));
  return result;
}

async function insertReminderMessage(reminder, message, options = {}) {
  const rows = await supabaseRequest("whatsapp_interview_reminder_messages", "", {
    ...options,
    method: "POST",
    prefer: "return=representation",
    body: {
      id: message.id || crypto.randomUUID(),
      company_id: reminder.company_id,
      reminder_id: reminder.id,
      assessment_id: reminder.assessment_id,
      candidate_id: reminder.candidate_id,
      assigned_jd_id: reminder.assigned_jd_id,
      direction: message.direction,
      sender_type: message.sender_type,
      message_type: message.message_type || "text",
      body: String(message.body || "").slice(0, 8000),
      meta_message_id: message.meta_message_id || null,
      webhook_event_key: message.webhook_event_key || null,
      delivery_status: message.delivery_status || null,
      sent_at: message.sent_at || null,
      created_at: message.created_at || new Date().toISOString()
    }
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function patchReminder(reminderId, patch, options = {}) {
  const rows = await supabaseRequest("whatsapp_interview_reminders", `?id=eq.${encodeURIComponent(reminderId)}`, {
    ...options, method: "PATCH", prefer: "return=representation", body: { ...patch, updated_at: new Date().toISOString() }
  });
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function validateClaimedReminder(reminder, options = {}) {
  const assessment = await getAssessmentById({ companyId: reminder.company_id, assessmentId: reminder.assessment_id });
  if (!assessment) return { ok: false, reason: "Assessment no longer exists." };
  if (isTerminalInterviewStatus(assessment.candidateStatus || assessment.candidate_status || assessment.status)) {
    return { ok: false, reason: "Interview is cancelled, completed or inactive." };
  }
  const currentInterview = parseInterviewDate(assessment.interviewAt || assessment.interview_at);
  if (!currentInterview || currentInterview.getTime() !== new Date(reminder.interview_at).getTime()) {
    return { ok: false, reason: "Interview schedule has changed." };
  }
  const candidate = await loadAssessmentCandidate(assessment, reminder.company_id);
  if (normalizeWhatsAppPhone(candidate.phone || candidate.phoneNumber) !== reminder.candidate_wa_id) {
    return { ok: false, reason: "Candidate WhatsApp number has changed." };
  }
  return { ok: true };
}

async function processDueInterviewReminders(options = {}) {
  const config = reminderConfig(options);
  const now = options.now instanceof Date ? options.now : new Date(options.now || Date.now());
  const windowStart = new Date(now.getTime() - config.sendWindowMinutes * 60000);
  await supabaseRequest(
    "whatsapp_interview_reminders",
    `?enabled=eq.true&status=eq.scheduled&scheduled_send_at=lt.${encodeURIComponent(windowStart.toISOString())}`,
    {
      ...options,
      method: "PATCH",
      prefer: "return=minimal",
      body: { enabled: false, status: "skipped", skipped_reason: "The 10:00 AM IST send window was missed.", updated_at: now.toISOString() }
    }
  );
  const claimToken = crypto.randomUUID();
  const claimed = await supabaseRequest("rpc/claim_due_whatsapp_interview_reminders", "", {
    ...options,
    method: "POST",
    body: { p_now: now.toISOString(), p_window_start: windowStart.toISOString(), p_limit: Math.max(1, Math.min(50, Number(options.limit || 20))), p_claim_token: claimToken }
  });
  const reminders = Array.isArray(claimed) ? claimed : [];
  const result = { claimed: reminders.length, sent: 0, failed: 0, skipped: 0 };
  for (const reminder of reminders) {
    try {
      const validation = await validateClaimedReminder(reminder, options);
      if (!validation.ok) {
        await patchReminder(reminder.id, { enabled: false, status: "superseded", superseded_at: now.toISOString(), skipped_reason: validation.reason }, options);
        result.skipped += 1;
        continue;
      }
      const response = await sendMetaPayload(buildInterviewReminderTemplatePayload(reminder, options), options);
      const messageId = cleanText(response?.messages?.[0]?.id, 300) || null;
      await insertReminderMessage(reminder, {
        direction: "outbound",
        sender_type: "automation",
        message_type: "template",
        body: `Interview reminder: ${reminder.job_title} | ${formatInterviewDate(reminder.interview_at)} ${formatInterviewTime(reminder.interview_at)}`,
        meta_message_id: messageId,
        delivery_status: "accepted",
        sent_at: now.toISOString()
      }, options);
      await patchReminder(reminder.id, {
        status: "awaiting_response",
        initial_message_id: messageId,
        sent_at: now.toISOString(),
        last_outbound_at: now.toISOString(),
        claim_token: null
      }, options);
      result.sent += 1;
    } catch (error) {
      await patchReminder(reminder.id, { status: "failed", failed_at: now.toISOString(), last_error: String(error?.message || error).slice(0, 1000), claim_token: null }, options).catch(() => null);
      result.failed += 1;
    }
  }
  return result;
}

function extractReplyId(event = {}) {
  const message = event?.payload?.message || {};
  return cleanText(message?.button?.payload || message?.interactive?.button_reply?.id || "", 300);
}

function extractMessageText(event = {}) {
  const message = event?.payload?.message || {};
  return cleanText(message?.text?.body || message?.button?.text || message?.interactive?.button_reply?.title || "", 2000);
}

async function claimEvent(eventKey, reminderId, options = {}) {
  const claimed = await supabaseRequest("rpc/claim_whatsapp_interview_reminder_event", "", {
    ...options,
    method: "POST",
    body: { p_event_key: eventKey, p_reminder_id: reminderId || null }
  });
  return Boolean(claimed && (typeof claimed !== "object" || !Array.isArray(claimed) || claimed.length > 0));
}

async function finishEvent(eventKey, patch, options = {}) {
  await supabaseRequest("whatsapp_interview_event_processing", `?event_key=eq.${encodeURIComponent(eventKey)}`, {
    ...options, method: "PATCH", prefer: "return=minimal", body: { ...patch, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() }
  });
}

async function getReminderById(reminderId, options = {}) {
  const rows = await supabaseRequest("whatsapp_interview_reminders", `?id=eq.${encodeURIComponent(reminderId)}&select=*&limit=1`, options);
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function getInterviewReminder(reminderId, companyId, options = {}) {
  const rows = await supabaseRequest(
    "whatsapp_interview_reminders",
    `?id=eq.${encodeURIComponent(reminderId)}&company_id=eq.${encodeURIComponent(companyId)}&select=*&limit=1`,
    options
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function findReminderByMessageId(messageId, options = {}) {
  const rows = await supabaseRequest("whatsapp_interview_reminder_messages", `?meta_message_id=eq.${encodeURIComponent(messageId)}&select=*&limit=1`, options);
  if (!Array.isArray(rows) || !rows[0]) return null;
  return { message: rows[0], reminder: await getReminderById(rows[0].reminder_id, options) };
}

async function hasActiveScreening(event, options = {}) {
  const phoneNumberId = cleanText(event.phone_number_id, 200);
  const waId = normalizeWhatsAppPhone(event.sender_wa_id);
  if (!phoneNumberId || !waId) return false;
  const statuses = "creating,template_sent,awaiting_interest,awaiting_current_ctc,awaiting_expected_ctc,awaiting_notice_period,awaiting_recruiter_call,awaiting_call_time,awaiting_additional_input_choice,awaiting_additional_input,awaiting_confirmation,human_takeover";
  const rows = await supabaseRequest("whatsapp_screening_sessions", `?phone_number_id=eq.${encodeURIComponent(phoneNumberId)}&candidate_wa_id=eq.${encodeURIComponent(waId)}&status=in.(${statuses})&select=id&limit=1`, options);
  return Array.isArray(rows) && rows.length > 0;
}

async function processInterviewReminderStatus(event, context, options = {}) {
  const status = cleanText(event.delivery_status, 80);
  const at = event.event_timestamp || new Date().toISOString();
  const messagePatch = { delivery_status: status };
  if (status === "delivered") messagePatch.delivered_at = at;
  if (status === "read") messagePatch.read_at = at;
  if (status === "failed") messagePatch.failed_at = at;
  await supabaseRequest("whatsapp_interview_reminder_messages", `?id=eq.${encodeURIComponent(context.message.id)}`, {
    ...options, method: "PATCH", prefer: "return=minimal", body: messagePatch
  });
  let reminder = context.reminder;
  if (status === "failed" && ["sending", "awaiting_response"].includes(context.reminder.status)) {
    reminder = await patchReminder(context.reminder.id, { status: "failed", failed_at: at, last_error: "Meta reported reminder delivery failure." }, options) || reminder;
  }
  return reminder;
}

async function processInterviewReminderMessage(event, reminder, action, options = {}) {
  const text = extractMessageText(event);
  const now = event.event_timestamp || new Date().toISOString();
  await insertReminderMessage(reminder, {
    direction: "inbound",
    sender_type: "candidate",
    message_type: event.message_type || "text",
    body: text,
    meta_message_id: event.meta_message_id || null,
    webhook_event_key: event.event_key,
    delivery_status: "received",
    created_at: now
  }, options);
  if (action === "confirm") {
    return patchReminder(reminder.id, { status: "confirmed", confirmed_at: now, last_inbound_at: now, review_reason: null }, options);
  }
  return patchReminder(reminder.id, {
    status: "review_required",
    review_required_at: now,
    review_reason: text || "Candidate sent an unexpected interview reminder response.",
    last_inbound_at: now
  }, options);
}

async function processWhatsAppInterviewReminderEvents(events, options = {}) {
  const handledEventKeys = [];
  const updates = [];
  for (const event of Array.isArray(events) ? events : []) {
    try {
      let reminder = null;
      let action = "";
      if (event.event_type === "status" && event.meta_message_id) {
        const context = await findReminderByMessageId(event.meta_message_id, options);
        if (!context?.reminder) continue;
        reminder = context.reminder;
        if (!(await claimEvent(event.event_key, reminder.id, options))) continue;
        const updated = await processInterviewReminderStatus(event, context, options);
        await finishEvent(event.event_key, { status: "processed" }, options);
        handledEventKeys.push(event.event_key);
        updates.push(updated);
        continue;
      }
      if (event.event_type !== "message") continue;
      const replyId = extractReplyId(event);
      const payloadMatch = replyId.match(/^wi:([0-9a-f-]{36}):(confirm)$/i);
      if (payloadMatch) {
        reminder = await getReminderById(payloadMatch[1], options);
        action = payloadMatch[2].toLowerCase();
      } else {
        if (await hasActiveScreening(event, options)) continue;
        const phoneNumberId = cleanText(event.phone_number_id, 200);
        const waId = normalizeWhatsAppPhone(event.sender_wa_id);
        if (!phoneNumberId || !waId) continue;
        const rows = await supabaseRequest(
          "whatsapp_interview_reminders",
          `?phone_number_id=eq.${encodeURIComponent(phoneNumberId)}&candidate_wa_id=eq.${encodeURIComponent(waId)}&status=eq.awaiting_response&select=*&order=sent_at.desc&limit=2`,
          options
        );
        if (!Array.isArray(rows) || rows.length !== 1) continue;
        reminder = rows[0];
        action = "review";
      }
      if (!reminder || reminder.phone_number_id !== cleanText(event.phone_number_id, 200) || reminder.candidate_wa_id !== normalizeWhatsAppPhone(event.sender_wa_id)) continue;
      if (action === "confirm" && !["awaiting_response", "review_required"].includes(reminder.status)) {
        if (await claimEvent(event.event_key, reminder.id, options)) {
          await finishEvent(event.event_key, { status: "ignored" }, options);
        }
        handledEventKeys.push(event.event_key);
        continue;
      }
      if (!(await claimEvent(event.event_key, reminder.id, options))) continue;
      const updated = await processInterviewReminderMessage(event, reminder, action, options);
      await finishEvent(event.event_key, { status: "processed" }, options);
      handledEventKeys.push(event.event_key);
      updates.push(updated);
    } catch (error) {
      if (event?.event_key) await finishEvent(event.event_key, { status: "failed", error_message: String(error?.message || error).slice(0, 1000) }, options).catch(() => null);
    }
  }
  if (typeof options.onReminderUpdated === "function") {
    updates.filter(Boolean).forEach((reminder) => options.onReminderUpdated(reminder));
  }
  return { handledEventKeys, updates };
}

module.exports = {
  OPEN_REMINDER_STATUSES,
  REMINDER_TIMEZONE,
  assertAssessmentReminderAccess,
  buildInterviewReminderTemplatePayload,
  disableInterviewReminder,
  enableInterviewReminder,
  formatInterviewDate,
  formatInterviewTime,
  getInterviewReminder,
  listInterviewReminderMessages,
  listInterviewReminders,
  loadAssessmentCandidate,
  processDueInterviewReminders,
  processWhatsAppInterviewReminderEvents,
  reminderConfig,
  reminderScheduleForInterview,
  resolveInterviewReminder,
  sendInterviewReminderNow
};
