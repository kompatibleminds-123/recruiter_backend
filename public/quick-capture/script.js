const noteInput = document.getElementById("noteInput");
const micButton = document.getElementById("micButton");
const existingMicButton = document.getElementById("existingMicButton");
const parseButton = document.getElementById("parseButton");
const saveButton = document.getElementById("saveButton");
const statusMessage = document.getElementById("statusMessage");
const jsonOutput = document.getElementById("jsonOutput");
const candidateSummary = document.getElementById("candidateSummary");
const conflictSummary = document.getElementById("conflictSummary");
const mergeContext = document.getElementById("mergeContext");
const candidateNameInput = document.getElementById("candidateName");
const candidateCompanyInput = document.getElementById("candidateCompany");
const candidateRoleInput = document.getElementById("candidateRole");
const candidateExperienceInput = document.getElementById("candidateExperience");
const candidateLocationInput = document.getElementById("candidateLocation");
const candidateCurrentCtcInput = document.getElementById("candidateCurrentCtc");
const candidateExpectedCtcInput = document.getElementById("candidateExpectedCtc");
const candidateNoticePeriodInput = document.getElementById("candidateNoticePeriod");
const candidatePhoneInput = document.getElementById("candidatePhone");
const candidateEmailInput = document.getElementById("candidateEmail");
const candidateLinkedinInput = document.getElementById("candidateLinkedin");
const candidateNextActionInput = document.getElementById("candidateNextAction");
const newCandidateCvButton = document.getElementById("newCandidateCvButton");
const newCandidateCvFile = document.getElementById("newCandidateCvFile");
const existingRecruiterNoteInput = document.getElementById("existingRecruiterNoteInput");
const existingStatusUpdateInput = document.getElementById("existingStatusUpdateInput");
const existingCandidateTab = document.getElementById("existingCandidateTab");
const newCandidateTab = document.getElementById("newCandidateTab");
const existingCandidatePanel = document.getElementById("existingCandidatePanel");
const newCandidatePanel = document.getElementById("newCandidatePanel");
const existingParseButton = document.getElementById("existingParseButton");
const existingApplyRecruiterButton = document.getElementById("existingApplyRecruiterButton");
const existingApplyUpdateButton = document.getElementById("existingApplyUpdateButton");
const existingStatusMicButton = document.getElementById("existingStatusMicButton");
const existingStatusMessage = document.getElementById("existingStatusMessage");
const existingCandidateSummary = document.getElementById("existingCandidateSummary");
const voiceLanguageSelect = document.getElementById("voiceLanguageSelect");
const existingConflictSummary = document.getElementById("existingConflictSummary");
let recognition = null;
let isListening = false;
let voiceSilenceTimer = null;
let voiceRestartTimer = null;
let keepAliveUntil = 0;
let manualVoiceStop = false;
let voiceSessionActive = false;
let voiceBaseText = "";
let voiceInterimText = "";
let voiceCommittedChunks = new Set();
let voiceRequestedByUser = false;
let voiceTargetInput = null;
let voiceTargetButton = null;
let voiceTargetStatusSetter = setStatus;
let currentCandidateRecordId = "";
let currentCandidateCreatedAt = "";
let currentQuickCaptureUser = null;
let currentNewCandidateSource = "mobile_pwa";
let latestParsedCandidateDraft = null;
let latestIncomingParsedCandidate = null;
let currentLoadedCandidateBaseline = null;
let latestDraftConflicts = [];
let latestExistingMatchedTarget = null;
let latestExistingParsedResult = null;
let latestExistingMergedResult = null;
const VOICE_SILENCE_STOP_MS = 5000;
let voiceLanguage = "en-IN";

function applyVoiceLanguage(recognitionInstance) {
  if (!recognitionInstance) return;
  try {
    recognitionInstance.lang = voiceLanguage;
  } catch {
    // Ignore invalid language updates from browser engines.
  }
}

function tryCloseQuickCaptureWindow() {
  try {
    const isStandalone =
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone;
    if (isStandalone) {
      window.close();
    }
  } catch {
    // Best-effort close only in supported PWA environments.
  }
}

function setCaptureTab(mode) {
  const showExisting = mode === "existing";
  if (existingCandidatePanel) existingCandidatePanel.hidden = !showExisting;
  if (newCandidatePanel) newCandidatePanel.hidden = showExisting;
  if (existingCandidateTab) {
    existingCandidateTab.classList.toggle("active", showExisting);
    existingCandidateTab.setAttribute("aria-selected", showExisting ? "true" : "false");
  }
  if (newCandidateTab) {
    newCandidateTab.classList.toggle("active", !showExisting);
    newCandidateTab.setAttribute("aria-selected", !showExisting ? "true" : "false");
  }
}

function clearNewCandidateForm() {
  [
    candidateNameInput,
    candidateCompanyInput,
    candidateRoleInput,
    candidateExperienceInput,
    candidateLocationInput,
    candidateCurrentCtcInput,
    candidateExpectedCtcInput,
    candidateNoticePeriodInput,
    candidatePhoneInput,
    candidateEmailInput,
    candidateLinkedinInput,
    candidateNextActionInput,
    noteInput
  ].forEach((input) => {
    if (input) input.value = "";
  });
}

function clearExistingCandidateComposer() {
  stopVoiceCapture();
  if (existingRecruiterNoteInput) existingRecruiterNoteInput.value = "";
  if (existingStatusUpdateInput) existingStatusUpdateInput.value = "";
  clearExistingCandidatePreview();
}

function normalizeVoiceChunk(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mergeVoiceText(baseText, newChunk) {
  const base = String(baseText || "").trim();
  const chunk = String(newChunk || "").trim();
  if (!chunk) return base;
  if (!base) return chunk;

  const normalizedBase = normalizeVoiceChunk(base);
  const normalizedChunk = normalizeVoiceChunk(chunk);
  if (!normalizedChunk) return base;
  if (
    normalizedBase === normalizedChunk ||
    normalizedBase.endsWith(normalizedChunk) ||
    normalizedBase.includes(` ${normalizedChunk} `) ||
    normalizedBase.includes(normalizedChunk)
  ) {
    return base;
  }

  const baseWords = base.split(/\s+/);
  const chunkWords = chunk.split(/\s+/);
  const normalizedBaseWords = baseWords.map(normalizeVoiceChunk);
  const normalizedChunkWords = chunkWords.map(normalizeVoiceChunk);
  const maxOverlap = Math.min(normalizedBaseWords.length, normalizedChunkWords.length);

  for (let overlap = maxOverlap; overlap >= 3; overlap -= 1) {
    const baseTail = normalizedBaseWords.slice(-overlap).join(" ");
    const chunkHead = normalizedChunkWords.slice(0, overlap).join(" ");
    if (baseTail && baseTail === chunkHead) {
      const remainingWords = chunkWords.slice(overlap);
      return remainingWords.length ? `${base} ${remainingWords.join(" ")}`.trim() : base;
    }
  }

  return `${base} ${chunk}`.trim();
}

function inferLatestExistingCandidateUpdate(text, options = {}) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const inferred = inferExistingCandidateUpdate(lines[index], options);
    if (inferred) {
      return {
        ...inferred,
        notes: String(text || "").trim(),
        callbackNotes: String(text || "").trim()
      };
    }
  }
  return inferExistingCandidateUpdate(String(text || "").trim(), options);
}

function setStatus(message, tone = "") {
  statusMessage.textContent = message || "";
  statusMessage.className = `status-message${tone ? ` ${tone}` : ""}`;
}

function setExistingStatus(message, tone = "") {
  if (!existingStatusMessage) return;
  existingStatusMessage.textContent = message || "";
  existingStatusMessage.className = `status-message${tone ? ` ${tone}` : ""}`;
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function isAllowedCvCaptureFile(file) {
  if (!file) return false;
  const allowedTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/rtf",
    "text/rtf",
    "text/plain",
    ""
  ]);
  const allowedExtensions = [".pdf", ".doc", ".docx", ".rtf", ".txt"];
  const lowerName = String(file.name || "").toLowerCase();
  return allowedTypes.has(file.type) || allowedExtensions.some((ext) => lowerName.endsWith(ext));
}

function buildCvCaptureNoteFromParsedResult(result, filename = "") {
  const candidateName = String(result?.candidateName || "").trim();
  const company = String(result?.currentCompany || "").trim();
  const role = String(result?.currentDesignation || "").trim();
  const totalExperience = String(result?.totalExperience || "").trim();
  const phone = String(result?.phoneNumber || "").trim();
  const email = String(result?.emailId || "").trim();
  const linkedin = String(result?.linkedinUrl || "").trim();
  const highestEducation = String(result?.highestEducation || "").trim();
  const timelineText = Array.isArray(result?.timeline)
    ? result.timeline
        .slice(0, 6)
        .map((item) => {
          const timelineRole = String(item?.title || "").trim();
          const timelineCompany = String(item?.company || "").trim();
          const timelineDates = [String(item?.start || "").trim(), String(item?.end || "").trim()].filter(Boolean).join(" - ");
          return [timelineRole && timelineCompany ? `${timelineRole} at ${timelineCompany}` : timelineRole || timelineCompany, timelineDates].filter(Boolean).join(" | ");
        })
        .filter(Boolean)
        .join("; ")
    : "";

  return [
    candidateName,
    role && company ? `${role} at ${company}` : role || company,
    totalExperience ? `Total experience: ${totalExperience}` : "",
    highestEducation ? `Highest education: ${highestEducation}` : "",
    phone ? `Phone: ${phone}` : "",
    email ? `Email: ${email}` : "",
    linkedin ? `LinkedIn: ${linkedin}` : "",
    timelineText ? `Experience timeline: ${timelineText}` : "",
    filename ? `CV: ${filename}` : ""
  ]
    .filter(Boolean)
    .join(". ");
}

function renderAuthState(user) {
  currentQuickCaptureUser = user || null;
  if (parseButton) parseButton.disabled = !user;
  if (saveButton) {
    saveButton.disabled = !user || !latestParsedCandidateDraft;
    saveButton.hidden = !latestParsedCandidateDraft;
  }
  if (!user) {
    resetCurrentCandidateTracking();
  }
}

function renderJson(data) {
  if (typeof data === "string") {
    jsonOutput.textContent = data;
    return;
  }
  jsonOutput.textContent = JSON.stringify(data, null, 2);
}

function normalizeCandidateValue(value) {
  return String(value || "").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCandidateSummary(data) {
  if (!candidateSummary) return;
  const rows = [
    ["Candidate", data?.name],
    ["Company", data?.company],
    ["Role", data?.role],
    ["Experience", data?.experience],
    ["Location", data?.location],
    ["Skills", Array.isArray(data?.skills) ? data.skills.filter(Boolean).join(", ") : ""],
    ["Current CTC", data?.current_ctc],
    ["Expected CTC", data?.expected_ctc],
    ["Notice Period", data?.notice_period],
    ["Next Action", data?.next_action],
    ["Notes", data?.notes],
    ["Phone", data?.phone],
    ["Email", data?.email],
    ["LinkedIn", data?.linkedin]
  ].filter(([, value]) => String(value || "").trim());

  if (!rows.length) {
    candidateSummary.className = "candidate-summary empty";
    candidateSummary.textContent = "No captured data yet.";
    return;
  }

  candidateSummary.className = "candidate-summary";
  candidateSummary.innerHTML = `<div class="summary-grid">${rows
    .map(
      ([label, value]) =>
        `<div class="summary-row"><div class="summary-key">${escapeHtml(label)}</div><div class="summary-value">${escapeHtml(value)}</div></div>`
    )
    .join("")}</div>`;
}

function buildCandidateMerge(base, incoming, latestNoteText = "") {
  const keys = [
    "name",
    "company",
    "role",
    "experience",
    "location",
    "current_ctc",
    "expected_ctc",
    "notice_period",
    "phone",
    "email",
    "linkedin",
    "highest_education",
    "next_action"
  ];
  const merged = { ...(base || {}), ...(incoming || {}) };
  const conflicts = [];

  for (const key of keys) {
    const baseValue = normalizeCandidateValue(base?.[key]);
    const incomingValue = normalizeCandidateValue(incoming?.[key]);
    merged[key] = incomingValue || baseValue || "";
    if (baseValue && incomingValue && baseValue.toLowerCase() !== incomingValue.toLowerCase()) {
      conflicts.push({ key, from: baseValue, to: incomingValue });
    }
  }

  const existingNotes = normalizeCandidateValue(base?.notes);
  const incomingNotes = normalizeCandidateValue(incoming?.notes);
  const freshNote = normalizeCandidateValue(latestNoteText);
  merged.notes = [existingNotes, freshNote, incomingNotes]
    .filter(Boolean)
    .filter((value, index, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .join("\n");
  merged.id = normalizeCandidateValue(base?.id || incoming?.id);
  merged.created_at = normalizeCandidateValue(base?.created_at || incoming?.created_at);
  merged.source = normalizeCandidateValue(base?.source || incoming?.source || "mobile_pwa");
  return { merged, conflicts };
}

function formatConflictLabel(key) {
  const labels = {
    name: "Candidate",
    company: "Company",
    role: "Role",
    experience: "Experience",
    location: "Location",
    current_ctc: "Current CTC",
    expected_ctc: "Expected CTC",
    notice_period: "Notice period",
    phone: "Phone",
    email: "Email",
    linkedin: "LinkedIn",
    highest_education: "Highest education",
    next_action: "Next action"
  };
  return labels[key] || key;
}

function renderConflictSummary(conflicts) {
  if (!conflictSummary) return;
  const rows = Array.isArray(conflicts) ? conflicts : [];
  conflictSummary.hidden = !rows.length;
  if (!rows.length) {
    conflictSummary.innerHTML = "";
    return;
  }
  conflictSummary.innerHTML = `
    <div class="conflict-title">Conflicts detected</div>
    <ul class="conflict-list">
      ${rows
        .map(
          (entry) =>
            `<li><strong>${escapeHtml(formatConflictLabel(entry.key))}</strong>: existing "${escapeHtml(entry.from)}" -> new "${escapeHtml(entry.to)}"</li>`
        )
        .join("")}
    </ul>
  `;
}

function renderExistingConflictSummary(conflicts) {
  if (!existingConflictSummary) return;
  const rows = Array.isArray(conflicts) ? conflicts : [];
  existingConflictSummary.hidden = !rows.length;
  if (!rows.length) {
    existingConflictSummary.innerHTML = "";
    return;
  }
  existingConflictSummary.innerHTML = `
    <div class="conflict-title">Conflicts detected</div>
    <ul class="conflict-list">
      ${rows
        .map(
          (entry) =>
            `<li><strong>${escapeHtml(formatConflictLabel(entry.key))}</strong>: existing "${escapeHtml(entry.from)}" -> new "${escapeHtml(entry.to)}"</li>`
        )
        .join("")}
    </ul>
  `;
}

function renderExistingCandidateSummary(data, matchedLabel = "") {
  if (!existingCandidateSummary) return;
  const rows = [
    ["Matched", matchedLabel],
    ["Candidate", data?.name],
    ["Company", data?.company],
    ["Role", data?.role],
    ["Experience", data?.experience],
    ["Location", data?.location],
    ["Current CTC", data?.current_ctc],
    ["Expected CTC", data?.expected_ctc],
    ["Notice Period", data?.notice_period],
    ["Highest education", data?.highest_education],
    ["Next Action", data?.next_action],
    ["Phone", data?.phone],
    ["Email", data?.email],
    ["LinkedIn", data?.linkedin]
  ].filter(([, value]) => String(value || "").trim());

  if (!rows.length) {
    existingCandidateSummary.className = "candidate-summary empty";
    existingCandidateSummary.textContent = "No existing-candidate parse yet.";
    return;
  }

  existingCandidateSummary.className = "candidate-summary";
  existingCandidateSummary.innerHTML = `<div class="summary-grid">${rows
    .map(
      ([label, value]) =>
        `<div class="summary-row"><div class="summary-key">${escapeHtml(label)}</div><div class="summary-value">${escapeHtml(value)}</div></div>`
    )
      .join("")}</div>`;
}

function appendUniqueNote(existingValue, nextValue) {
  return [String(existingValue || "").trim(), String(nextValue || "").trim()]
    .filter(Boolean)
    .filter((value, index, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .join("\n");
}

function normalizeLooseText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCandidateLeadText(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const stopWords = /\b(call|callback|follow|follow-up|followup|interview|current|expected|notice|location|company|role|aligned|reject|shortlisted|joined|duplicate|speak|talk|connect|will)\b/i;
  const match = raw.match(stopWords);
  if (!match || typeof match.index !== "number") return raw;
  return raw.slice(0, match.index).trim().replace(/[,\-|]+$/, "").trim();
}

function normalizeExistingCandidateItem(item) {
  return {
    id: String(item?.id || "").trim(),
    name: String(item?.name || "").trim(),
    company: String(item?.company || "").trim(),
    role: String(item?.role || "").trim(),
    experience: String(item?.experience || "").trim(),
    location: String(item?.location || "").trim(),
    current_ctc: String(item?.current_ctc || "").trim(),
    expected_ctc: String(item?.expected_ctc || "").trim(),
    notice_period: String(item?.notice_period || "").trim(),
    phone: String(item?.phone || "").trim(),
    email: String(item?.email || "").trim(),
    linkedin: String(item?.linkedin || "").trim(),
    highest_education: String(item?.highest_education || "").trim(),
    next_action: String(item?.next_action || "").trim(),
    notes: String(item?.notes || "").trim(),
    recruiterContextNotes: String(item?.recruiterContextNotes || item?.recruiter_context_notes || "").trim(),
    kind: "quick_capture"
  };
}

function normalizeExistingAssessmentItem(item) {
  return {
    id: String(item?.id || "").trim(),
    name: String(item?.candidateName || "").trim(),
    company: String(item?.currentCompany || "").trim(),
    role: String(item?.currentDesignation || "").trim(),
    experience: String(item?.totalExperience || "").trim(),
    location: String(item?.location || "").trim(),
    current_ctc: String(item?.currentCtc || "").trim(),
    expected_ctc: String(item?.expectedCtc || "").trim(),
    notice_period: String(item?.noticePeriod || "").trim(),
    phone: String(item?.phoneNumber || "").trim(),
    email: String(item?.emailId || "").trim(),
    linkedin: String(item?.linkedinUrl || "").trim(),
    highest_education: String(item?.highestEducation || "").trim(),
    next_action: "",
    notes: String(item?.callbackNotes || "").trim(),
    recruiterContextNotes: String(item?.recruiterContextNotes || "").trim(),
    kind: "assessment"
  };
}

function scoreNameMatch(targetName, noteText) {
  const target = normalizeLooseText(targetName);
  const note = normalizeLooseText(noteText);
  if (!target) return 0;
  if (note.includes(target)) return target.length + 100;
  const parts = target.split(" ").filter(Boolean);
  return parts.reduce((score, part) => (note.includes(part) ? score + part.length : score), 0);
}

async function findExistingCandidateTarget(noteText) {
  const lead = extractCandidateLeadText(noteText);
  if (!lead) return null;
  const [candidatePayload, assessmentPayload] = await Promise.all([
    callQuickCaptureApi(`/candidates?limit=200&q=${encodeURIComponent(lead)}`, { method: "GET" }).catch(() => ({ result: [] })),
    callQuickCaptureApi(`/company/assessments/search?q=${encodeURIComponent(lead)}&limit=25`, { method: "GET" }).catch(() => ({ result: { assessments: [] } }))
  ]);

  const buildMatches = (candidateRows, assessmentRows) => {
    const candidateMatches = (Array.isArray(candidateRows) ? candidateRows : [])
      .filter((item) => !item?.used_in_assessment)
      .map((item) => ({ kind: "quick_capture", item, score: scoreNameMatch(item?.name, noteText) }));
    const assessmentMatches = (Array.isArray(assessmentRows) ? assessmentRows : [])
      .map((item) => ({ kind: "assessment", item, score: scoreNameMatch(item?.candidateName, noteText) + 5 }));

    return [...assessmentMatches, ...candidateMatches]
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
  };

  let matches = buildMatches(
    Array.isArray(candidatePayload?.result) ? candidatePayload.result : [],
    Array.isArray(assessmentPayload?.result?.assessments) ? assessmentPayload.result.assessments : []
  );

  if (matches.length) {
    return matches[0];
  }

  const [allCandidatePayload, allAssessmentPayload] = await Promise.all([
    callQuickCaptureApi("/candidates?limit=1000", { method: "GET" }).catch(() => ({ result: [] })),
    callQuickCaptureApi("/company/assessments", { method: "GET" }).catch(() => ({ result: { assessments: [] } }))
  ]);

  matches = buildMatches(
    Array.isArray(allCandidatePayload?.result) ? allCandidatePayload.result : [],
    Array.isArray(allAssessmentPayload?.result?.assessments) ? allAssessmentPayload.result.assessments : []
  );

  return matches[0] || null;
}

function parseFilterDateInput(value, endOfDay = false) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(`${text}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function getNamedDateIsoFromText(text, options = {}) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const now = new Date();
  const setTime = (date, hour = 11, minute = 0) => {
    date.setHours(hour, minute, 0, 0);
    return date.toISOString();
  };

  let hour = 11;
  let minute = 0;
  const timeMatch = lower.match(/\b(\d{1,2})(?:[:.](\d{1,2}))?\s*(am|pm)?\b/);
  if (timeMatch) {
    hour = Number(timeMatch[1]);
    minute = Number(timeMatch[2] || 0);
    const meridian = String(timeMatch[3] || "").toLowerCase();
    if (meridian === "pm" && hour < 12) hour += 12;
    if (meridian === "am" && hour === 12) hour = 0;
  } else if (/\bevening\b/.test(lower)) {
    hour = 18;
  }

  if (/\btomorrow\b/.test(lower)) {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    return setTime(next, hour, minute);
  }

  if (/\bday after tomorrow\b/.test(lower)) {
    const next = new Date();
    next.setDate(next.getDate() + 2);
    return setTime(next, hour, minute);
  }

  const weekdayMap = { sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3, thursday: 4, thu: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6 };
  const weekdayThisWeek = lower.match(/\b(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|sunday|sun)\s+this\s+week\b/);
  if (weekdayThisWeek) {
    const target = weekdayMap[weekdayThisWeek[1]];
    const date = new Date();
    let delta = target - date.getDay();
    if (delta < 0) delta += 7;
    date.setDate(date.getDate() + delta);
    return setTime(date, hour, minute);
  }

  const weekdayMatch = lower.match(/\b(?:(next)\s+)?(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thurs|friday|fri|saturday|sat|sunday|sun)\b/);
  if (weekdayMatch) {
    const target = weekdayMap[weekdayMatch[2]];
    const date = new Date();
    let delta = (target - date.getDay() + 7) % 7;
    if (weekdayMatch[1] === "next" || delta === 0) delta += 7;
    date.setDate(date.getDate() + delta);
    return setTime(date, hour, minute);
  }

  const monthMap = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  const dayMonthMatch = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+(\d{2,4}))?\b/);
  if (dayMonthMatch) {
    const day = Number(dayMonthMatch[1]);
    const month = monthMap[dayMonthMatch[2]];
    let year = Number(dayMonthMatch[3] || now.getFullYear());
    if (year < 100) year += 2000;
    return setTime(new Date(year, month, day), hour, minute);
  }

  const monthDayMatch = lower.match(/\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{2,4}))?\b/);
  if (monthDayMatch) {
    const month = monthMap[monthDayMatch[1]];
    const day = Number(monthDayMatch[2]);
    let year = Number(monthDayMatch[3] || now.getFullYear());
    if (year < 100) year += 2000;
    return setTime(new Date(year, month, day), hour, minute);
  }

  const slashDateMatch = lower.match(/\b(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{2,4}))?\b/);
  if (slashDateMatch) {
    const day = Number(slashDateMatch[1]);
    const month = Number(slashDateMatch[2]) - 1;
    let year = Number(slashDateMatch[3] || now.getFullYear());
    if (year < 100) year += 2000;
    return setTime(new Date(year, month, day), hour, minute);
  }

  if (options.baseDateIso) {
    const base = new Date(options.baseDateIso);
    if (Number.isFinite(base.getTime())) {
      return setTime(base, hour, minute);
    }
  }

  return "";
}

function inferExistingCandidateUpdate(text, options = {}) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return null;
  const explicitAt = getNamedDateIsoFromText(raw, options);
  const preferredKind = String(options.preferredKind || "").trim();
  const hasInterviewRoundMarker = /\b(l1|l2|l3|l4|hr|final)\b/.test(lower);
  const hasScreeningCallMarker = /\bscreening call\b/.test(lower);
  const followUpIntent = /(next call|callback|call back|call later|call me|call him|call her|call to|follow up|follow-up|followup|connect|speak|talk|will speak|call next|aligned)/.test(lower);
  const interviewIntent =
    /interview/.test(lower) &&
    /(align|aligned|schedule|scheduled|change|changed|reschedule|rescheduled|move|moved|shift|shifted|update|updated)/.test(lower);
  const detectAlignedStatus = () => {
    if (/\bscreening call\b/.test(lower)) return "Screening call aligned";
    if (/\bl1\b/.test(lower)) return "L1 aligned";
    if (/\bl2\b/.test(lower)) return "L2 aligned";
    if (/\bl3\b/.test(lower)) return "L3 aligned";
    if (/\bhr\b/.test(lower) || /\bfinal\b/.test(lower)) return "HR interview aligned";
    return "L1 aligned";
  };

  if ((/\boffer(ed|ing)?\b/.test(lower) && /\b(drop|dropout|drop out|dropped|reject)\b/.test(lower)) || ((hasInterviewRoundMarker || /interview/.test(lower)) && /\b(drop|dropout|drop out|dropped)\b/.test(lower))) {
    return { kind: "assessment", candidateStatus: "Dropped", pipelineStage: "Rejected", callbackNotes: raw };
  }

  if (interviewIntent || ((hasInterviewRoundMarker || hasScreeningCallMarker) && /\b(align|aligned|schedule|scheduled|change|changed|reschedule|rescheduled|move|moved|shift|shifted)\b/.test(lower))) {
    return {
      kind: "assessment",
      candidateStatus: detectAlignedStatus(),
      pipelineStage: "Interview Scheduled",
      interviewAt: explicitAt,
      callbackNotes: raw
    };
  }

  if (/\bcv shared\b/.test(lower)) {
    return { kind: "assessment", candidateStatus: "CV Shared", pipelineStage: "Submitted", callbackNotes: raw };
  }
  if (/\bdid\s*not\s*attend\b/.test(lower) || /\bdidn'?t\s*attend\b/.test(lower) || /\bnot\s*attend(?:ed)?\b/.test(lower)) {
    return { kind: "assessment", candidateStatus: "Did not attend", pipelineStage: "Rejected", callbackNotes: raw };
  }
  if ((/\bhr\b/.test(lower) && /\breject/.test(lower)) || /\bscreen(ing)?\s+reject/.test(lower) || /\brecruiter screening reject\b/.test(lower) || /\bsr\b/.test(lower)) {
    return { kind: "assessment", candidateStatus: "Screening Reject", pipelineStage: "Rejected", callbackNotes: raw };
  }
  if (((hasInterviewRoundMarker || /interview/.test(lower)) && /\breject(?:ed)?\b/.test(lower))) {
    return { kind: "assessment", candidateStatus: "Interview Reject", pipelineStage: "Rejected", callbackNotes: raw };
  }
  if (/\bduplicate\b/.test(lower) || /\bdup\b/.test(lower)) {
    return { kind: "assessment", candidateStatus: "Duplicate", pipelineStage: "Rejected", callbackNotes: raw };
  }
  if (/\bshortlisted\b/.test(lower) || /\bshortlist\b/.test(lower)) {
    return { kind: "assessment", candidateStatus: "Shortlisted", pipelineStage: "Shortlisted", callbackNotes: raw };
  }
  if (/\bjoined\b/.test(lower) || /\bjoin(?:ed|ing)\b/.test(lower)) {
    return { kind: "assessment", candidateStatus: "Joined", pipelineStage: "Joined", callbackNotes: raw };
  }
  if (/\b(feedback awaited|feedback|awaiting feedback)\b/.test(lower)) {
    return { kind: "assessment", candidateStatus: "Feedback Awaited", pipelineStage: "On Hold", callbackNotes: raw };
  }
  if (/\bhold\b/.test(lower) || /\b(l1|l2|l3|l4|screening)\s+hold\b/.test(lower)) {
    return { kind: "assessment", candidateStatus: "Hold", pipelineStage: "On Hold", callbackNotes: raw };
  }
  if (/\boffer(ed|ing)?\b/.test(lower)) {
    return { kind: "assessment", candidateStatus: "Offered", pipelineStage: "Offer Extended", callbackNotes: raw };
  }

  if (followUpIntent || explicitAt) {
    if (preferredKind === "assessment") {
      return {
        kind: "assessment",
        candidateStatus: String(options.currentStatus || "").trim(),
        pipelineStage: String(options.currentPipelineStage || "").trim(),
        next_follow_up_at: explicitAt,
        callbackNotes: raw
      };
    }
    return {
      kind: "quick_capture",
      outcome: "call_back_later",
      next_follow_up_at: explicitAt,
      notes: raw
    };
  }

  if (/\bnot responding\b|\bno response\b|\bnot received\b|\bnr\b|\bno answer\b/.test(lower)) {
    return { kind: "quick_capture", outcome: "no_answer", next_follow_up_at: "", notes: raw };
  }
  if (/\bcall busy\b|\bbusy\b/.test(lower)) {
    return { kind: "quick_capture", outcome: "busy", next_follow_up_at: "", notes: raw };
  }
  if (/\bswitch(?:ed)?\s*off\b/.test(lower)) {
    return { kind: "quick_capture", outcome: "switch_off", next_follow_up_at: "", notes: raw };
  }
  if (/\bdisconnected\b|\bdisconnecting\b/.test(lower)) {
    return { kind: "quick_capture", outcome: "disconnecting", next_follow_up_at: "", notes: raw };
  }
  if (/\bcall not reachable\b|\bnot reachable\b/.test(lower)) {
    return { kind: "quick_capture", outcome: "not_reachable", next_follow_up_at: "", notes: raw };
  }
  if (/\bni\b|\bnot interested\b/.test(lower)) {
    return { kind: "quick_capture", outcome: "not_interested_current_role", next_follow_up_at: "", notes: raw };
  }
  if (/\bscreen(ing)? reject\b|\brecruiter screening reject\b|\bsr\b/.test(lower)) {
    return { kind: "quick_capture", outcome: "not_suitable_current_role", next_follow_up_at: "", notes: raw };
  }
  if (/\brevisit\b/.test(lower)) {
    return { kind: "quick_capture", outcome: "revisit_for_other_role", next_follow_up_at: "", notes: raw };
  }
  if (/\binterested\b/.test(lower)) {
    return { kind: "quick_capture", outcome: "interested", next_follow_up_at: "", notes: raw };
  }
  if (/\bhold by recruiter\b|\bhigh notice\b|\bhigh ctc\b|\bhold\b/.test(lower)) {
    return { kind: "quick_capture", outcome: "hold_by_recruiter", next_follow_up_at: "", notes: raw };
  }
  return null;
}

function buildExistingCandidateQuickCaptureSave(targetItem, merged, rawText) {
  const recruiterText = appendUniqueNote(targetItem.recruiterContextNotes || targetItem.recruiter_context_notes || "", rawText);
  const otherPointersText = appendUniqueNote(targetItem.otherPointers || targetItem.other_pointers || "", rawText);
  return {
    ...targetItem,
    id: targetItem.id,
    source: targetItem.source || "mobile_pwa",
    name: merged.name || targetItem.name || "",
    company: merged.company || targetItem.company || "",
    role: merged.role || targetItem.role || "",
    experience: merged.experience || targetItem.experience || "",
    skills: Array.isArray(targetItem.skills) ? targetItem.skills : [],
    phone: merged.phone || targetItem.phone || "",
    email: merged.email || targetItem.email || "",
    location: merged.location || targetItem.location || "",
    highest_education: merged.highest_education || targetItem.highest_education || "",
    current_ctc: merged.current_ctc || targetItem.current_ctc || "",
    expected_ctc: merged.expected_ctc || targetItem.expected_ctc || "",
    notice_period: merged.notice_period || targetItem.notice_period || "",
    next_action: merged.next_action || targetItem.next_action || "",
    linkedin: merged.linkedin || targetItem.linkedin || "",
    notes: appendUniqueNote(targetItem.notes, rawText),
    raw_note: appendUniqueNote(targetItem.raw_note, rawText),
    recruiter_context_notes: recruiterText,
    other_pointers: otherPointersText,
    recruiter_id: currentQuickCaptureUser?.id || targetItem.recruiter_id || "",
    recruiter_name: currentQuickCaptureUser?.name || targetItem.recruiter_name || "",
    client_name: targetItem.client_name || "",
    jd_title: targetItem.jd_title || "",
    assigned_to_user_id: targetItem.assigned_to_user_id || "",
    assigned_to_name: targetItem.assigned_to_name || "",
    assigned_by_user_id: targetItem.assigned_by_user_id || "",
    assigned_by_name: targetItem.assigned_by_name || "",
    assigned_jd_id: targetItem.assigned_jd_id || "",
    assigned_jd_title: targetItem.assigned_jd_title || "",
    assigned_at: targetItem.assigned_at || "",
    last_contact_outcome: targetItem.last_contact_outcome || "",
    last_contact_notes: targetItem.last_contact_notes || "",
    last_contact_at: targetItem.last_contact_at || "",
    next_follow_up_at: targetItem.next_follow_up_at || "",
    created_at: targetItem.created_at || undefined,
    updated_at: new Date().toISOString()
  };
}

function buildExistingAssessmentSave(targetItem, patch = {}, rawText = "") {
  const mergedNotes = rawText ? appendUniqueNote(targetItem.recruiterNotes, rawText) : targetItem.recruiterNotes || "";
  const mergedRecruiterContextNotes = rawText ? appendUniqueNote(targetItem.recruiterContextNotes, rawText) : targetItem.recruiterContextNotes || "";
  const mergedOtherPointers = rawText ? appendUniqueNote(targetItem.otherPointers, rawText) : targetItem.otherPointers || "";
  return {
    ...targetItem,
    id: targetItem.id,
    recruiterNotes: patch.recruiterNotes != null ? patch.recruiterNotes : mergedNotes,
    recruiterContextNotes: patch.recruiterContextNotes != null ? patch.recruiterContextNotes : mergedRecruiterContextNotes,
    otherPointers: patch.otherPointers != null ? patch.otherPointers : mergedOtherPointers,
    callbackNotes: patch.callbackNotes != null ? patch.callbackNotes : (targetItem.callbackNotes || ""),
    candidateName: patch.candidateName != null ? patch.candidateName : targetItem.candidateName,
    currentCompany: patch.currentCompany != null ? patch.currentCompany : targetItem.currentCompany,
    currentDesignation: patch.currentDesignation != null ? patch.currentDesignation : targetItem.currentDesignation,
    totalExperience: patch.totalExperience != null ? patch.totalExperience : targetItem.totalExperience,
    location: patch.location != null ? patch.location : targetItem.location,
    phoneNumber: patch.phoneNumber != null ? patch.phoneNumber : targetItem.phoneNumber,
    emailId: patch.emailId != null ? patch.emailId : targetItem.emailId,
    linkedinUrl: patch.linkedinUrl != null ? patch.linkedinUrl : targetItem.linkedinUrl,
    highestEducation: patch.highestEducation != null ? patch.highestEducation : targetItem.highestEducation,
    candidateStatus: patch.candidateStatus != null ? patch.candidateStatus : targetItem.candidateStatus,
    pipelineStage: patch.pipelineStage != null ? patch.pipelineStage : targetItem.pipelineStage,
    followUpAt: patch.followUpAt != null ? patch.followUpAt : targetItem.followUpAt,
    interviewAt: patch.interviewAt != null ? patch.interviewAt : targetItem.interviewAt
  };
}

function clearExistingCandidatePreview() {
  latestExistingMatchedTarget = null;
  latestExistingParsedResult = null;
  latestExistingMergedResult = null;
  renderExistingConflictSummary([]);
  renderExistingCandidateSummary(null);
}

async function parseExistingRecruiterNote() {
  if (!currentQuickCaptureUser) {
    setExistingStatus("Login required first.", "error");
    return;
  }
  const rawText = String(existingRecruiterNoteInput?.value || "").trim();
  if (!rawText) {
    setExistingStatus("Enter candidate name and recruiter note first.", "error");
    return;
  }

  existingParseButton.disabled = true;
  setExistingStatus("Finding candidate and parsing recruiter note...");

  try {
    const target = await findExistingCandidateTarget(rawText);
    if (!target) {
      clearExistingCandidatePreview();
      setExistingStatus("No matching existing candidate found.", "error");
      return;
    }

    latestExistingMatchedTarget = target;
    const base =
      target.kind === "assessment"
        ? normalizeExistingAssessmentItem(target.item)
        : normalizeExistingCandidateItem(target.item);

    const payload = await callQuickCaptureApi("/parse-note", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: rawText,
        preview: true,
        id: base.id,
        linkedin: base.linkedin,
        source: target.kind === "assessment" ? "assessment_existing" : (target.item?.source || "mobile_pwa"),
        jd_title: target.item?.jdTitle || target.item?.jd_title || target.item?.role || "",
        recruiter_id: currentQuickCaptureUser?.id || "",
        recruiter_name: currentQuickCaptureUser?.name || ""
      })
    });

    latestExistingParsedResult = payload.result || null;
    const { merged, conflicts } = buildCandidateMerge(base, payload.result || {}, rawText);
    latestExistingMergedResult = merged;
    renderExistingConflictSummary(conflicts || []);
    renderExistingCandidateSummary(
      merged,
      `${target.kind === "assessment" ? "Assessment" : "Captured note"} | ${base.name || "candidate"}`
    );
    setExistingStatus("Recruiter note parsed. Review and apply.", "success");
  } catch (error) {
    clearExistingCandidatePreview();
    setExistingStatus(String(error.message || error), "error");
  } finally {
    existingParseButton.disabled = false;
  }
}

async function applyExistingRecruiterNote() {
  if (!currentQuickCaptureUser) {
    setExistingStatus("Login required first.", "error");
    return;
  }
  const rawText = String(existingRecruiterNoteInput?.value || "").trim();
  if (!latestExistingMatchedTarget || !latestExistingMergedResult || !rawText) {
    setExistingStatus("Parse recruiter note first.", "error");
    return;
  }

  existingApplyRecruiterButton.disabled = true;
  setExistingStatus("Applying recruiter note...");

  try {
    const target = latestExistingMatchedTarget;
    if (target.kind === "assessment") {
      const existingAssessment = target.item || {};
      const merged = latestExistingMergedResult || {};
      const assessmentPayload = buildExistingAssessmentSave(
        existingAssessment,
        {
          candidateName: merged.name || existingAssessment.candidateName || "",
          currentCompany: merged.company || existingAssessment.currentCompany || "",
          currentDesignation: merged.role || existingAssessment.currentDesignation || "",
          totalExperience: merged.experience || existingAssessment.totalExperience || "",
          location: merged.location || existingAssessment.location || "",
          phoneNumber: merged.phone || existingAssessment.phoneNumber || "",
          emailId: merged.email || existingAssessment.emailId || "",
          linkedinUrl: merged.linkedin || existingAssessment.linkedinUrl || "",
          highestEducation: merged.highest_education || existingAssessment.highestEducation || "",
          recruiterNotes: appendUniqueNote(existingAssessment.recruiterNotes, rawText)
        },
        ""
      );
      const payload = await callQuickCaptureApi("/company/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ assessment: assessmentPayload })
      });
      latestExistingMatchedTarget = { kind: "assessment", item: payload.result };
      renderExistingCandidateSummary(
        normalizeExistingAssessmentItem(payload.result),
        `Assessment | ${payload.result?.candidateName || merged.name || "candidate"}`
      );
    } else {
      const existingCandidate = target.item || {};
      const merged = latestExistingMergedResult || {};
      const candidatePayload = {
        ...existingCandidate,
        id: existingCandidate.id,
        source: existingCandidate.source || "mobile_pwa",
        name: merged.name || existingCandidate.name || "",
        company: merged.company || existingCandidate.company || "",
        role: merged.role || existingCandidate.role || "",
        experience: merged.experience || existingCandidate.experience || "",
        phone: merged.phone || existingCandidate.phone || "",
        email: merged.email || existingCandidate.email || "",
        location: merged.location || existingCandidate.location || "",
        highest_education: merged.highest_education || existingCandidate.highest_education || "",
        current_ctc: merged.current_ctc || existingCandidate.current_ctc || "",
        expected_ctc: merged.expected_ctc || existingCandidate.expected_ctc || "",
        notice_period: merged.notice_period || existingCandidate.notice_period || "",
        next_action: merged.next_action || existingCandidate.next_action || "",
        linkedin: merged.linkedin || existingCandidate.linkedin || "",
        notes: appendUniqueNote(existingCandidate.notes, rawText),
        raw_note: appendUniqueNote(existingCandidate.raw_note, rawText),
        recruiter_context_notes: existingCandidate.recruiter_context_notes || "",
        other_pointers: existingCandidate.other_pointers || "",
        recruiter_id: currentQuickCaptureUser?.id || existingCandidate.recruiter_id || "",
        recruiter_name: currentQuickCaptureUser?.name || existingCandidate.recruiter_name || "",
        updated_at: new Date().toISOString()
      };
      const payload = await callQuickCaptureApi("/candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ candidate: candidatePayload })
      });
      const savedCandidate = payload.result || candidatePayload;
      latestExistingMatchedTarget = { kind: "quick_capture", item: savedCandidate };
      renderExistingCandidateSummary(
        normalizeExistingCandidateItem(savedCandidate),
        `Captured note | ${savedCandidate?.name || latestExistingMergedResult.name || "candidate"}`
      );
    }

    renderExistingConflictSummary([]);
    setExistingStatus("Recruiter note applied.", "success");
    clearExistingCandidateComposer();
  } catch (error) {
    setExistingStatus(String(error.message || error), "error");
  } finally {
    existingApplyRecruiterButton.disabled = false;
  }
}

async function applyExistingCandidateUpdate() {
  if (!currentQuickCaptureUser) {
    setExistingStatus("Login required first.", "error");
    return;
  }
  const rawText = String(existingStatusUpdateInput?.value || "").trim();
  if (!rawText) {
    setExistingStatus("Enter candidate name and update note first.", "error");
    return;
  }

  existingApplyUpdateButton.disabled = true;
  setExistingStatus("Applying candidate update...");

  try {
    const target = await findExistingCandidateTarget(rawText);
    if (!target) {
      clearExistingCandidatePreview();
      setExistingStatus("No matching existing candidate found.", "error");
      return;
    }

    const inferred = inferLatestExistingCandidateUpdate(rawText, {
      preferredKind: target.kind,
      currentStatus: target.item?.candidateStatus || "",
      currentPipelineStage: target.item?.pipelineStage || "",
      baseDateIso:
        target.kind === "assessment"
          ? (target.item?.interviewAt || target.item?.followUpAt || "")
          : (target.item?.next_follow_up_at || "")
    });

    if (!inferred) {
      setExistingStatus("No status or timeline update detected in that note.", "error");
      return;
    }

    if (target.kind === "assessment") {
      const existingAssessment = target.item || {};
      const assessmentPayload = buildExistingAssessmentSave(existingAssessment, {
        candidateStatus:
          inferred.candidateStatus != null ? inferred.candidateStatus : existingAssessment.candidateStatus,
        pipelineStage:
          inferred.pipelineStage != null ? inferred.pipelineStage : existingAssessment.pipelineStage,
        followUpAt:
          inferred.next_follow_up_at != null ? inferred.next_follow_up_at : existingAssessment.followUpAt,
        interviewAt:
          inferred.interviewAt != null ? inferred.interviewAt : existingAssessment.interviewAt
      }, "");
      const payload = await callQuickCaptureApi("/company/assessments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ assessment: assessmentPayload })
      });
      latestExistingMatchedTarget = { kind: "assessment", item: payload.result };
      renderExistingCandidateSummary(
        {
          ...normalizeExistingAssessmentItem(payload.result),
          next_action: payload.result?.candidateStatus || ""
        },
        `Assessment | ${payload.result?.candidateName || "candidate"}`
      );
    } else {
      const payload = await callQuickCaptureApi("/contact-attempts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          candidate_id: target.item?.id,
          outcome: inferred.outcome || "call_back_later",
          notes: "",
          next_follow_up_at: inferred.next_follow_up_at || ""
        })
      });
      const candidatePatch = {
        ...target.item,
        last_contact_outcome: payload.result?.outcome || inferred.outcome || "call_back_later",
        last_contact_at: payload.result?.created_at || new Date().toISOString(),
        next_follow_up_at: payload.result?.next_follow_up_at || inferred.next_follow_up_at || ""
      };
      latestExistingMatchedTarget = { kind: "quick_capture", item: candidatePatch };
      renderExistingCandidateSummary(
        {
          ...normalizeExistingCandidateItem(candidatePatch),
          next_action: candidatePatch.next_follow_up_at || candidatePatch.last_contact_outcome || ""
        },
        `Captured note | ${candidatePatch?.name || "candidate"}`
      );
    }

    renderExistingConflictSummary([]);
    setExistingStatus("Candidate update applied.", "success");
    clearExistingCandidateComposer();
  } catch (error) {
    setExistingStatus(String(error.message || error), "error");
  } finally {
    existingApplyUpdateButton.disabled = false;
  }
}

function populateFormFromParsedResult(data) {
  if (!data || typeof data !== "object") return;
  currentCandidateRecordId = String(data.id || "").trim();
  currentCandidateCreatedAt = String(data.created_at || "").trim();
  if (candidateNameInput) candidateNameInput.value = String(data.name || "").trim();
  if (candidateCompanyInput) candidateCompanyInput.value = String(data.company || "").trim();
  if (candidateRoleInput) candidateRoleInput.value = String(data.role || "").trim();
  if (candidateExperienceInput) candidateExperienceInput.value = String(data.experience || "").trim();
  if (candidateLocationInput) candidateLocationInput.value = String(data.location || "").trim();
  if (candidateCurrentCtcInput) candidateCurrentCtcInput.value = String(data.current_ctc || "").trim();
  if (candidateExpectedCtcInput) candidateExpectedCtcInput.value = String(data.expected_ctc || "").trim();
  if (candidateNoticePeriodInput) candidateNoticePeriodInput.value = String(data.notice_period || "").trim();
  if (candidatePhoneInput) candidatePhoneInput.value = String(data.phone || "").trim();
  if (candidateEmailInput) candidateEmailInput.value = String(data.email || "").trim();
  if (candidateLinkedinInput) candidateLinkedinInput.value = String(data.linkedin || "").trim();
  if (candidateNextActionInput) candidateNextActionInput.value = String(data.next_action || "").trim();
}

function setLatestParsedCandidateDraft(data) {
  latestParsedCandidateDraft = data && typeof data === "object" ? { ...data } : null;
  if (saveButton) {
    saveButton.disabled = !currentQuickCaptureUser || !latestParsedCandidateDraft;
    saveButton.hidden = !latestParsedCandidateDraft;
  }
}

function loadCandidateIntoCapture(candidate) {
  const item = candidate && typeof candidate === "object" ? { ...candidate } : null;
  currentLoadedCandidateBaseline = item;
  currentCandidateRecordId = String(item?.id || "").trim();
  currentCandidateCreatedAt = String(item?.created_at || "").trim();
  latestIncomingParsedCandidate = null;
  latestDraftConflicts = [];
  renderConflictSummary([]);
  if (mergeContext) {
    mergeContext.hidden = !item;
    mergeContext.textContent = item ? `Updating existing draft: ${item.name || "candidate"}${item.assigned_to_name ? ` | Assigned to ${item.assigned_to_name}` : ""}` : "";
  }
  if (!item) return;
  populateFormFromParsedResult(item);
  if (noteInput) noteInput.value = "";
  currentNewCandidateSource = String(item?.source || "").trim() || "mobile_pwa";
  setLatestParsedCandidateDraft(item);
  renderCandidateSummary(item);
  renderJson(item);
}

function buildCandidateFromReviewFields() {
  const base = latestParsedCandidateDraft && typeof latestParsedCandidateDraft === "object" ? { ...latestParsedCandidateDraft } : {};
  const notesValue = base.notes || noteInput?.value.trim() || "";
  return {
    ...base,
    id: currentCandidateRecordId || base.id || undefined,
    created_at: currentCandidateCreatedAt || base.created_at || undefined,
    source: base.source || currentNewCandidateSource || "mobile_pwa",
    name: candidateNameInput?.value.trim() || "",
    company: candidateCompanyInput?.value.trim() || "",
    role: candidateRoleInput?.value.trim() || "",
    experience: candidateExperienceInput?.value.trim() || "",
    location: candidateLocationInput?.value.trim() || "",
    current_ctc: candidateCurrentCtcInput?.value.trim() || "",
    expected_ctc: candidateExpectedCtcInput?.value.trim() || "",
    notice_period: candidateNoticePeriodInput?.value.trim() || "",
    phone: candidatePhoneInput?.value.trim() || "",
    email: candidateEmailInput?.value.trim() || "",
    linkedin: candidateLinkedinInput?.value.trim() || "",
    next_action: candidateNextActionInput?.value.trim() || "",
    notes: notesValue,
    recruiter_id: currentQuickCaptureUser?.id || base.recruiter_id || "",
    recruiter_name: currentQuickCaptureUser?.name || base.recruiter_name || ""
  };
}

function refreshReviewPreview() {
  if (!latestParsedCandidateDraft) return;
  renderCandidateSummary(buildCandidateFromReviewFields());
}

function clearVoiceSilenceTimer() {
  if (voiceSilenceTimer) {
    window.clearTimeout(voiceSilenceTimer);
    voiceSilenceTimer = null;
  }
}

function clearVoiceRestartTimer() {
  if (voiceRestartTimer) {
    window.clearTimeout(voiceRestartTimer);
    voiceRestartTimer = null;
  }
}

function armVoiceSilenceTimer() {
  clearVoiceSilenceTimer();
  voiceSilenceTimer = window.setTimeout(() => {
    keepAliveUntil = 0;
    if (recognition && isListening) {
      manualVoiceStop = true;
      recognition.stop();
    }
    tryCloseQuickCaptureWindow();
  }, VOICE_SILENCE_STOP_MS);
}

function resetVoiceSessionState() {
  voiceSessionActive = false;
  voiceBaseText = String(voiceTargetInput?.value || "").trim();
  voiceInterimText = "";
  voiceCommittedChunks.clear();
  voiceRequestedByUser = false;
  voiceTargetInput = null;
  voiceTargetButton = null;
  voiceTargetStatusSetter = setStatus;
}

function scheduleVoiceRestart() {
  clearVoiceRestartTimer();
  if (!recognition || !voiceRequestedByUser) return;
  if (Date.now() >= keepAliveUntil) return;
  voiceRestartTimer = window.setTimeout(() => {
    if (recognition && !isListening && voiceRequestedByUser && Date.now() < keepAliveUntil) {
      try {
        recognition.start();
      } catch {
        // Ignore restart errors from browser speech engines.
      }
    }
  }, 220);
}

function buildNoteFromForm() {
  const parts = [
    candidateNameInput?.value.trim() ? `name ${candidateNameInput.value.trim()}` : "",
    candidateCompanyInput?.value.trim() ? `company ${candidateCompanyInput.value.trim()}` : "",
    candidateRoleInput?.value.trim() ? `role ${candidateRoleInput.value.trim()}` : "",
    candidateExperienceInput?.value.trim() ? `experience ${candidateExperienceInput.value.trim()}` : "",
    candidateLocationInput?.value.trim() ? `location ${candidateLocationInput.value.trim()}` : "",
    candidateCurrentCtcInput?.value.trim() ? `current ctc ${candidateCurrentCtcInput.value.trim()}` : "",
    candidateExpectedCtcInput?.value.trim() ? `expected ctc ${candidateExpectedCtcInput.value.trim()}` : "",
    candidateNoticePeriodInput?.value.trim() ? `notice period ${candidateNoticePeriodInput.value.trim()}` : "",
    candidatePhoneInput?.value.trim() ? `phone ${candidatePhoneInput.value.trim()}` : "",
    candidateEmailInput?.value.trim() ? `email ${candidateEmailInput.value.trim()}` : "",
    candidateLinkedinInput?.value.trim() ? `linkedin ${candidateLinkedinInput.value.trim()}` : "",
    candidateNextActionInput?.value.trim() ? `next action ${candidateNextActionInput.value.trim()}` : "",
    noteInput.value.trim()
  ].filter(Boolean);

  return parts.join(". ");
}

function buildRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micButton.disabled = true;
    micButton.textContent = "Voice not supported";
    if (existingMicButton) {
      existingMicButton.disabled = true;
      existingMicButton.textContent = "Voice not supported";
    }
      if (existingStatusMicButton) {
        existingStatusMicButton.disabled = true;
        existingStatusMicButton.textContent = "Voice not supported";
      }
    return null;
  }

  const instance = new SpeechRecognition();
  applyVoiceLanguage(instance);
  instance.interimResults = true;
  instance.continuous = true;
  instance.maxAlternatives = 3;

  instance.onstart = () => {
    isListening = true;
    clearVoiceRestartTimer();
    manualVoiceStop = false;
    if (!voiceSessionActive) {
      voiceSessionActive = true;
      voiceBaseText = String(voiceTargetInput?.value || "").trim();
      voiceInterimText = "";
      voiceCommittedChunks = new Set();
    }
    keepAliveUntil = Date.now() + VOICE_SILENCE_STOP_MS;
    armVoiceSilenceTimer();
    if (voiceTargetButton) voiceTargetButton.textContent = "Listening...";
    voiceTargetStatusSetter("Voice capture started.");
  };

  instance.onend = () => {
    clearVoiceSilenceTimer();
    isListening = false;
    const shouldStayActive = voiceRequestedByUser && Date.now() < keepAliveUntil;
    if (manualVoiceStop || !shouldStayActive) {
      manualVoiceStop = false;
      resetVoiceSessionState();
      if (micButton) micButton.textContent = "Start voice input";
      if (existingMicButton) existingMicButton.textContent = "Start voice input";
        if (existingStatusMicButton) existingStatusMicButton.textContent = "Start voice input for status update";
      setStatus("Voice capture stopped.");
      setExistingStatus("Voice capture stopped.");
      return;
    }

    if (voiceTargetButton) voiceTargetButton.textContent = "Listening...";
    scheduleVoiceRestart();
  };

  instance.onerror = (event) => {
    voiceInterimText = "";
    if (event?.error === "no-speech" && voiceRequestedByUser && Date.now() < keepAliveUntil) {
      scheduleVoiceRestart();
      return;
    }
    voiceTargetStatusSetter(`Voice input error: ${event.error}`, "error");
  };

  instance.onresult = (event) => {
    keepAliveUntil = Date.now() + VOICE_SILENCE_STOP_MS;
    armVoiceSilenceTimer();

    let committedNewText = false;
    const interimChunks = [];

    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript = (result[0]?.transcript || "").trim();
      if (!transcript || transcript.length < 3) continue;

      if (result.isFinal) {
        const chunkKey = transcript.toLowerCase().replace(/\s+/g, " ").trim();
        if (!voiceCommittedChunks.has(chunkKey)) {
          voiceCommittedChunks.add(chunkKey);
          voiceBaseText = mergeVoiceText(voiceBaseText, transcript);
          committedNewText = true;
        }
      } else {
        interimChunks.push(transcript);
      }
    }

    voiceInterimText = interimChunks.join(" ").trim();
    if (voiceTargetInput) {
      voiceTargetInput.value = mergeVoiceText(voiceBaseText, voiceInterimText);
      voiceTargetInput.classList.add("voice-highlight");
      window.setTimeout(() => {
        voiceTargetInput.classList.remove("voice-highlight");
      }, 700);
    }

    if (committedNewText) {
      voiceTargetStatusSetter("Voice note added to input.");
    }
  };

  return instance;
}

function stopVoiceCapture() {
  if (!recognition) return;
  voiceRequestedByUser = false;
  manualVoiceStop = true;
  keepAliveUntil = 0;
  clearVoiceSilenceTimer();
  clearVoiceRestartTimer();
  voiceInterimText = "";
  if (voiceTargetInput) {
    voiceTargetInput.value = voiceBaseText || String(voiceTargetInput.value || "").trim();
  }
  if (isListening) {
    recognition.stop();
  } else {
    resetVoiceSessionState();
    if (micButton) micButton.textContent = "Start voice input";
    if (existingMicButton) existingMicButton.textContent = "Start voice input";
    if (existingStatusMicButton) existingStatusMicButton.textContent = "Start voice input for status update";
  }
}

function startVoiceCapture(targetInput, targetButton, statusSetter) {
  if (!recognition || !targetInput || !targetButton) return;
  if (isListening) {
    const sameTarget = voiceTargetInput === targetInput;
    stopVoiceCapture();
    if (sameTarget) return;
  }
  if (micButton) micButton.textContent = "Start voice input";
  if (existingMicButton) existingMicButton.textContent = "Start voice input";
  if (existingStatusMicButton) existingStatusMicButton.textContent = "Start voice input for status update";
  voiceTargetInput = targetInput;
  voiceTargetButton = targetButton;
  voiceTargetStatusSetter = statusSetter || setStatus;
  voiceRequestedByUser = true;
  keepAliveUntil = Date.now() + VOICE_SILENCE_STOP_MS;
  recognition.start();
}

function resetCurrentCandidateTracking() {
  currentCandidateRecordId = "";
  currentCandidateCreatedAt = "";
  currentLoadedCandidateBaseline = null;
  latestIncomingParsedCandidate = null;
  latestDraftConflicts = [];
  currentNewCandidateSource = "mobile_pwa";
  setLatestParsedCandidateDraft(null);
  renderConflictSummary([]);
  if (mergeContext) {
    mergeContext.hidden = true;
    mergeContext.textContent = "";
  }
  renderCandidateSummary(null);
  renderJson("No parsed data yet.");
}

function buildQuickCapturePayload(noteText) {
  return {
    id: currentCandidateRecordId || undefined,
    created_at: currentCandidateCreatedAt || undefined,
    noteText,
    source: currentNewCandidateSource || "mobile_pwa",
    client_name: "",
    jd_title: candidateRoleInput?.value.trim() || "",
    recruiter_id: currentQuickCaptureUser?.id || "",
    recruiter_name: currentQuickCaptureUser?.name || ""
  };
}

async function captureNewCandidateFromCvFile(file) {
  if (!currentQuickCaptureUser) {
    setStatus("Login required first.", "error");
    return;
  }
  if (!isAllowedCvCaptureFile(file)) {
    throw new Error("Please choose a PDF, Word, RTF, or TXT CV file.");
  }
  stopVoiceCapture();
  const buffer = await file.arrayBuffer();
  const payload = await callQuickCaptureApi("/parse-candidate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      sourceType: "cv",
      file: {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        fileData: arrayBufferToBase64(buffer)
      }
    })
  });

  const result = payload.result || {};
  const generatedNote = buildCvCaptureNoteFromParsedResult(result, file.name);
  currentNewCandidateSource = "mobile_cv";
  latestIncomingParsedCandidate = null;
  latestDraftConflicts = [];
  renderConflictSummary([]);
  setLatestParsedCandidateDraft(null);
  renderCandidateSummary(null);
  renderJson({
    source: "mobile_cv",
    cv_parsed: result,
    generated_note: generatedNote
  });
  if (noteInput) noteInput.value = generatedNote;
}

async function parseNoteForReview() {
  if (!currentQuickCaptureUser) {
    setStatus("Login required first.", "error");
    return;
  }
  stopVoiceCapture();
  const noteText = buildNoteFromForm();
  if (!noteText) {
    setStatus("Please enter or dictate a candidate note first.", "error");
    return;
  }
  parseButton.disabled = true;
  if (saveButton) saveButton.disabled = true;
  setStatus("Parsing candidate note for review...");

  try {
    const payload = await callQuickCaptureApi("/parse-note", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...buildQuickCapturePayload(noteText),
        preview: true
      })
    });
    latestIncomingParsedCandidate = payload.result || null;
    const mergeResult =
      currentLoadedCandidateBaseline
        ? buildCandidateMerge(currentLoadedCandidateBaseline, payload.result, noteInput?.value.trim() || "")
        : { merged: payload.result, conflicts: [] };
    latestDraftConflicts = mergeResult.conflicts || [];
    renderJson({
      merged: mergeResult.merged,
      parsed_note: payload.result,
      conflicts: latestDraftConflicts
    });
    populateFormFromParsedResult(mergeResult.merged);
    setLatestParsedCandidateDraft(mergeResult.merged);
    renderConflictSummary(latestDraftConflicts);
    refreshReviewPreview();
    if (latestDraftConflicts.length) {
      const labels = latestDraftConflicts.map((entry) => formatConflictLabel(entry.key)).join(", ");
      setStatus(`Parsed with conflicts in: ${labels}. Review before saving.`, "error");
    } else {
      setStatus("Candidate parsed and merged. Review the summary, edit if needed, then save.", "success");
    }
  } catch (error) {
    latestIncomingParsedCandidate = null;
    latestDraftConflicts = [];
    renderConflictSummary([]);
    setLatestParsedCandidateDraft(null);
    setStatus(String(error.message || error), "error");
  } finally {
    parseButton.disabled = !currentQuickCaptureUser;
    if (saveButton) saveButton.disabled = !currentQuickCaptureUser || !latestParsedCandidateDraft;
  }
}

async function saveCandidateAfterReview() {
  const liveUser = await getQuickCaptureCurrentUser();
  if (!liveUser) {
    renderAuthState(null);
    setStatus("Session expired. Please login again.", "error");
    window.location.href = "/quick-capture/";
    return;
  }
  renderAuthState(liveUser);
  if (!currentQuickCaptureUser) {
    setStatus("Login required first.", "error");
    return;
  }
  if (!latestParsedCandidateDraft) {
    setStatus("Parse the note for review before saving.", "error");
    return;
  }

  stopVoiceCapture();
  parseButton.disabled = true;
  saveButton.disabled = true;
  setStatus("Saving candidate...");

  try {
    const wasExistingRecord = Boolean(currentCandidateRecordId);
    if (latestDraftConflicts.length) {
      const conflictText = latestDraftConflicts
        .map((entry) => `${formatConflictLabel(entry.key)}: "${entry.from}" -> "${entry.to}"`)
        .join("\n");
      const confirmed = window.confirm(`These values conflict with the existing draft:\n\n${conflictText}\n\nSave merged candidate anyway?`);
      if (!confirmed) {
        setStatus("Save cancelled. Review conflicts first.", "error");
        return;
      }
    }
    const payload = await callQuickCaptureApi("/candidates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        candidate: {
          ...buildCandidateFromReviewFields()
        }
      })
    });

    renderJson(payload.result);
    latestDraftConflicts = [];
    renderConflictSummary([]);
    clearNewCandidateForm();
    resetCurrentCandidateTracking();
    latestIncomingParsedCandidate = null;
    latestDraftConflicts = [];
    renderConflictSummary([]);
    renderCandidateSummary(null);
    renderJson("No parsed output yet.");
    setLatestParsedCandidateDraft(null);
    if (wasExistingRecord) {
      setStatus("Candidate updated.", "success");
    } else {
      setStatus("Candidate saved.", "success");
    }
  } catch (error) {
    setStatus(String(error.message || error), "error");
  } finally {
    parseButton.disabled = !currentQuickCaptureUser;
    saveButton.disabled = !currentQuickCaptureUser || !latestParsedCandidateDraft;
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/quick-capture/sw.js").catch(() => {});
  });
}

recognition = buildRecognition();

if (voiceLanguageSelect) {
  voiceLanguageSelect.addEventListener("change", () => {
    const next = String(voiceLanguageSelect.value || "").trim() || "en-IN";
    voiceLanguage = next;
    applyVoiceLanguage(recognition);
    if (isListening && recognition) {
      try {
        manualVoiceStop = false;
        recognition.stop();
        recognition.start();
      } catch {
        // Best-effort restart.
      }
    }
  });
}

micButton.addEventListener("click", () => {
  startVoiceCapture(noteInput, micButton, setStatus);
});
if (existingMicButton) {
  existingMicButton.addEventListener("click", () => {
    startVoiceCapture(existingRecruiterNoteInput, existingMicButton, setExistingStatus);
  });
}
if (existingStatusMicButton) {
  existingStatusMicButton.addEventListener("click", () => {
    startVoiceCapture(existingStatusUpdateInput, existingStatusMicButton, setExistingStatus);
  });
}

parseButton.addEventListener("click", parseNoteForReview);
saveButton.addEventListener("click", saveCandidateAfterReview);
if (existingParseButton) existingParseButton.addEventListener("click", parseExistingRecruiterNote);
if (existingApplyRecruiterButton) existingApplyRecruiterButton.addEventListener("click", applyExistingRecruiterNote);
if (existingApplyUpdateButton) existingApplyUpdateButton.addEventListener("click", applyExistingCandidateUpdate);
if (existingCandidateTab) {
  existingCandidateTab.addEventListener("click", () => setCaptureTab("existing"));
}
if (newCandidateTab) {
  newCandidateTab.addEventListener("click", () => setCaptureTab("new"));
}
if (newCandidateCvButton) {
  newCandidateCvButton.addEventListener("click", () => {
    newCandidateCvFile?.click();
  });
}
if (newCandidateCvFile) {
  newCandidateCvFile.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCaptureTab("new");
    setStatus("Parsing CV into a captured note...");
    try {
      await captureNewCandidateFromCvFile(file);
      setStatus("CV converted into a captured note. Review or edit the note, then parse for review.", "success");
    } catch (error) {
      setStatus(String(error.message || error), "error");
    } finally {
      event.target.value = "";
    }
  });
}

async function bootstrapAuthState() {
  const user = await getQuickCaptureCurrentUser();
  renderAuthState(user);
  if (!user) {
    window.location.href = "/quick-capture/";
    return;
  }
  const candidateId = new URLSearchParams(window.location.search).get("candidateId");
  if (candidateId) {
    try {
      const payload = await callQuickCaptureApi(`/candidates?id=${encodeURIComponent(candidateId)}&limit=1`, { method: "GET" });
      const item = Array.isArray(payload.result) ? payload.result[0] : null;
      if (item) {
        loadCandidateIntoCapture(item);
        setStatus(`Loaded existing draft for ${item.name || "candidate"}. Add your new note, then parse for review.`, "success");
        return;
      }
    } catch (error) {
      setStatus(String(error.message || error), "error");
      return;
    }
  }
  setStatus("Quick capture is ready.", "success");
}

[
  candidateNameInput,
  candidateCompanyInput,
  candidateRoleInput,
  candidateExperienceInput,
  candidateLocationInput,
  candidateCurrentCtcInput,
  candidateExpectedCtcInput,
  candidateNoticePeriodInput,
  candidatePhoneInput,
  candidateEmailInput,
  candidateLinkedinInput,
  candidateNextActionInput,
  noteInput
].forEach((element) => {
  if (!element) return;
  element.addEventListener("input", refreshReviewPreview);
});

if (existingRecruiterNoteInput) {
  existingRecruiterNoteInput.addEventListener("input", () => {
    latestExistingParsedResult = null;
    latestExistingMergedResult = null;
    renderExistingConflictSummary([]);
    setExistingStatus("");
  });
}
if (existingStatusUpdateInput) {
  existingStatusUpdateInput.addEventListener("input", () => {
    latestExistingParsedResult = null;
    latestExistingMergedResult = null;
    renderExistingConflictSummary([]);
    setExistingStatus("");
  });
}

bootstrapAuthState().catch(() => {
  renderAuthState(null);
  window.location.href = "/quick-capture/";
});

setCaptureTab("existing");
