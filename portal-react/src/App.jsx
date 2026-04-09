import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";

const TOKEN_KEY = "recruitdesk_portal_token";
const COPY_SETTINGS_STORAGE_KEY = "recruitdesk_portal_copy_settings_v1";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/candidates", label: "Candidates" },
  { to: "/applicants", label: "Applied Candidates" },
  { to: "/captured-notes", label: "Captured Notes" },
  { to: "/assessments", label: "Assessments" },
  { to: "/client-share", label: "Direct Share" },
  { to: "/quick-update", label: "Quick Update" },
  { to: "/interview", label: "Interview Panel" },
  { to: "/intake-settings", label: "Admin Intake Settings" },
  { to: "/jobs", label: "Jobs" },
  { to: "/settings", label: "Settings" }
];

const DEFAULT_COPY_SETTINGS = {
  excelPreset: "compact_recruiter",
  exportPresetLabels: {
    compact_recruiter: "Compact recruiter",
    client_tracker: "Client tracker",
    attentive_tracker: "Attentive tracker",
    client_submission: "Client submission",
    screening_focus: "Screening focus"
  },
  exportPresetColumns: {
    compact_recruiter: "S.No.|s_no\nName|name\nPh|phone\nEmail|email\nCurrent Company|current_company\nCurrent Designation|current_designation\nTotal Experience|total_experience\nTenure in current company|current_org_tenure\nLocation|location\nReason of change|reason_of_change\nStatus|status\nCurrent CTC|current_ctc\nExpected CTC|expected_ctc\nNotice Period|notice_period\nOther Standard Questions|other_standard_questions\nRemarks|remarks\nLinkedIn|linkedin",
    client_tracker: "Client Name|client_name\nTarget Role / Open Position|jd_title\nKey Skills Required|key_skills_required\nRecruiter Name|recruiter_name\nDate Added|date_added\nCandidate Name|name\nStatus|status\nContact No.|phone\nEmail ID|email\nLocation|location\nCurrent Company|current_company\nCurrent Designation|current_designation\nDomain / Industry|domain_industry\nWork Exp (Total years/months)|total_experience\nHighest Education|highest_education\nCurrent CTC|current_ctc\nExpected CTC|expected_ctc\nNotice Period|notice_period\nRemarks / Notes|remarks\nLinkedIn Profile Link (Optional)|linkedin",
    attentive_tracker: "S.No.|s_no\nName|name\nStatus|assessment_status\nPh|phone\nEmail|email\nLocation|location\nCurrent Company|current_company\nCurrent Designation|current_designation\nWork Experience|total_experience\nHighest Education|highest_education\nCurrent CTC|current_ctc\nExpected CTC|expected_ctc\nNotice Period|notice_period\nInsights|combined_assessment_insights\nLinkedIn|linkedin",
    client_submission: "S.No.|s_no\nName|name\nPh|phone\nEmail|email\nCurrent Company|current_company\nCurrent Designation|current_designation\nTotal Experience|total_experience\nStrong Points|other_pointers\nRemarks|remarks",
    screening_focus: "S.No.|s_no\nName|name\nCurrent CTC|current_ctc\nExpected CTC|expected_ctc\nNotice Period|notice_period\nScreening Answers|other_standard_questions\nRemarks|remarks"
  },
  customExportPresets: [],
  whatsappTemplate: "{{index}}. {{name}}\nRole: {{jd_title}}\nCompany: {{company}}\nOutcome: {{outcome}}\nRecruiter note: {{recruiter_notes}}",
  emailTemplate: "{{index}}. {{name}}\nCompany: {{company}}\nRole: {{jd_title}}\nLocation: {{location}}\nOutcome: {{outcome}}\nEmail: {{email}}\nPhone: {{phone}}\nNotes: {{recruiter_notes}}"
};

const AI_SEARCH_EXAMPLE_PROMPTS = [
  "AE in Bangalore",
  "Head of Sales",
  "shared last month",
  "offered Mumbai sales candidates under 18 L",
  "SaaS sales profiles with notice under 30 days",
  "profiles sourced by Ankit this week"
];

const BOOLEAN_SEARCH_EXAMPLE_PROMPTS = [
  "loan AND sales",
  '"business development" AND saas',
  '(sales OR "business development") AND loan',
  'mumbai AND "account executive"'
];

const PORTAL_APPLICANT_METADATA_PREFIX = "[APPLICANT_META]";

const DEFAULT_PIPELINE_STAGE_OPTIONS = [
  "HR screening",
  "Recruiter screening",
  "Shortlisted",
  "Submitted",
  "Interview Scheduled",
  "Offer Extended",
  "Joined",
  "On Hold",
  "Rejected"
];

const DEFAULT_STATUS_OPTIONS = [
  "CV Shared",
  "Screening call aligned",
  "L1 aligned",
  "L2 aligned",
  "L3 aligned",
  "HR interview aligned",
  "Offered",
  "Feedback Awaited",
  "Hold",
  "Did not attend",
  "Dropped",
  "Screening Reject",
  "Interview Reject",
  "Duplicate",
  "Shortlisted",
  "Joined"
];

const APPLIED_OUTCOME_FILTER_ORDER = [
  "Aligned for Interview",
  "CV Shared",
  "Dropped",
  "L1 aligned",
  "L2 aligned",
  "No outcome",
  "Not interested",
  "Offered",
  "call_back_later",
  "revisit_for_other_role"
];

const DASHBOARD_METRIC_COLUMNS = [
  ["sourced", "Sourced"],
  ["converted", "Converted"],
  ["under_interview_process", "Under Interview Process"],
  ["rejected", "Rejected"],
  ["duplicate", "Duplicate"],
  ["dropped", "Dropped"],
  ["shortlisted", "Shortlisted"],
  ["offered", "Offered"],
  ["joined", "Joined"]
];

const DASHBOARD_METRIC_TILES = [
  ["sourced", "Sourced"],
  ["converted", "Converted"],
  ["under_interview_process", "Under Interview"],
  ["offered", "Offered"],
  ["joined", "Joined"]
];

function isTerminalStatus(status) {
  return [
    "shortlisted",
    "offered",
    "hold",
    "did not attend",
    "dropped",
    "screening reject",
    "interview reject",
    "duplicate",
    "joined"
  ].includes(String(status || "").trim().toLowerCase());
}

function normalizeShortcutKey(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value.startsWith("/") ? value : `/${value.replace(/^\/+/, "")}`;
}

function parseAmountToLpa(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  if (/\bcr|crore\b/.test(raw)) return amount * 100;
  if (/\bk\b/.test(raw) && !/\bl|lpa|lakh|lac\b/.test(raw)) return amount / 100;
  return amount;
}

function parseExperienceToYears(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  const yearsMatch = raw.match(/(\d+(?:\.\d+)?)\s*years?/);
  const monthsMatch = raw.match(/(\d+(?:\.\d+)?)\s*months?/);
  if (!yearsMatch && !monthsMatch) return null;
  const years = yearsMatch ? Number(yearsMatch[1]) : 0;
  const months = monthsMatch ? Number(monthsMatch[1]) : 0;
  return years + (months / 12);
}

function parseNoticePeriodToDays(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  if (/immediate|immediately|serving notice|available now/.test(raw)) return 0;
  const daysMatch = raw.match(/(\d+(?:\.\d+)?)\s*days?/);
  if (daysMatch) return Number(daysMatch[1]);
  const monthsMatch = raw.match(/(\d+(?:\.\d+)?)\s*months?/);
  if (monthsMatch) return Number(monthsMatch[1]) * 30;
  return null;
}

function parseShortcutMap(value) {
  if (!String(value || "").trim()) return {};
  try {
    const parsed = JSON.parse(String(value || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
    return {};
  }
}

function stringifyShortcutMap(value) {
  return JSON.stringify(value || {}, null, 2);
}

function parseQuestionList(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function decodePortalApplicantMetadata(item = {}) {
  const raw = String(item?.raw_note || "").trim();
  if (!raw.startsWith(PORTAL_APPLICANT_METADATA_PREFIX)) return {};
  try {
    return JSON.parse(raw.slice(PORTAL_APPLICANT_METADATA_PREFIX.length));
  } catch {
    return {};
  }
}

function buildInterviewCvAnalysis(baseForm = {}, result = {}, storedFile = null) {
  return {
    exactTotalExperience: result.totalExperience || "",
    currentCompany: result.currentCompany || "",
    currentDesignation: result.currentDesignation || "",
    currentOrgTenure: result.currentOrgTenure || "",
    highestEducation: result.highestEducation || "",
    storedFile: storedFile || result.storedFile || null,
    cached: Boolean(result.cached),
    contradictions: [
      baseForm.currentCompany && result.currentCompany && String(baseForm.currentCompany).trim().toLowerCase() !== String(result.currentCompany).trim().toLowerCase()
        ? `Current company: existing "${baseForm.currentCompany}" vs CV "${result.currentCompany}"`
        : "",
      baseForm.currentDesignation && result.currentDesignation && String(baseForm.currentDesignation).trim().toLowerCase() !== String(result.currentDesignation).trim().toLowerCase()
        ? `Current designation: existing "${baseForm.currentDesignation}" vs CV "${result.currentDesignation}"`
        : "",
      baseForm.totalExperience && result.totalExperience && String(baseForm.totalExperience).trim().toLowerCase() !== String(result.totalExperience).trim().toLowerCase()
        ? `Total experience: existing "${baseForm.totalExperience}" vs CV "${result.totalExperience}"`
        : "",
      baseForm.currentOrgTenure && result.currentOrgTenure && String(baseForm.currentOrgTenure).trim().toLowerCase() !== String(result.currentOrgTenure).trim().toLowerCase()
        ? `Tenure in current org: existing "${baseForm.currentOrgTenure}" vs CV "${result.currentOrgTenure}"`
        : ""
    ].filter(Boolean)
  };
}

function getInterviewCvStoredFileLabel(analysis = null) {
  const stored = analysis?.storedFile || null;
  if (!stored) return "";
  return String(stored.filename || stored.key || stored.url || "").trim();
}

function getInterviewCvStoredFilePath(analysis = null) {
  const stored = analysis?.storedFile || null;
  if (!stored) return "";
  return String(stored.key || stored.url || "").trim();
}

function splitStructuredDraftLines(rawText) {
  return String(rawText || "")
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toSentenceCasePreservingContent(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function polishStructuredBulletSentence(line) {
  const text = String(line || "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  const sentence = toSentenceCasePreservingContent(text);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}

function getRecruiterNoteLineKey(line) {
  const lower = String(line || "").toLowerCase().trim();
  if (!lower) return "";
  if (lower.startsWith("expected ctc") || lower.startsWith("expectation") || /^expected\b/.test(lower)) return "expected_ctc";
  if (lower.startsWith("current ctc") || /^current\b/.test(lower)) return "current_ctc";
  if (lower.startsWith("notice period")) return "notice_period";
  if (lower.startsWith("official notice period")) return "official_notice_period";
  if (lower.startsWith("lwd")) return "lwd_or_doj";
  if (lower.startsWith("doj")) return "lwd_or_doj";
  if (lower.startsWith("last working day")) return "lwd_or_doj";
  if (lower.includes("serving notice") && lower.includes("lwd")) return "lwd_or_doj";
  if (lower.startsWith("offer in hand")) return "offer_in_hand";
  if (lower.includes("holds an offer") || lower.includes("holds offer") || lower.includes("got an offer") || lower.includes("offer of")) return "offer_in_hand";
  if (lower.startsWith("location")) return "location";
  if (lower.startsWith("working model")) return "working_model";
  if (lower.startsWith("shift")) return "shift";
  if (lower.startsWith("relocation")) return "relocation";
  if (lower.startsWith("communication")) return "communication";
  return `free:${lower}`;
}

function extractFreeRecruiterLines(text) {
  return normalizeRecruiterNotesBody(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => getRecruiterNoteLineKey(line).startsWith("free:"));
}

function buildCanonicalRecruiterNotes(baseText, currentText, mergedValues = {}) {
  const lines = [];
  const pushStructured = (label, value) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    lines.push(`${label} - ${clean}`);
  };

  pushStructured("Current CTC", mergedValues.current_ctc);
  pushStructured("Expected CTC", mergedValues.expected_ctc);
  pushStructured("Notice period", mergedValues.notice_period);
  pushStructured("LWD / DOJ", mergedValues.lwd_or_doj);
  pushStructured("Offer in hand", mergedValues.offer_in_hand);
  pushStructured("Location", mergedValues.location);

  const freeLines = [...extractFreeRecruiterLines(baseText), ...extractFreeRecruiterLines(currentText)];
  freeLines.forEach((line) => {
    if (!lines.some((existing) => existing.toLowerCase() === line.toLowerCase())) {
      lines.push(line);
    }
  });

  return lines.join("\n");
}

function normalizeRecruiterNotesBody(rawText) {
  const normalizedLines = splitStructuredDraftLines(rawText)
    .map((line) => String(line || "").replace(/^[\-\*]\s*/, "").trim())
    .map((line) => line.replace(/^recruiter notes\s*:?\s*/i, "").trim())
    .map((line) => line.replace(/^[.:;-]+/, "").trim())
    .map(polishStructuredBulletSentence)
    .filter(Boolean);

  const orderedKeys = [];
  const valuesByKey = new Map();
  normalizedLines.forEach((line) => {
    const key = getRecruiterNoteLineKey(line);
    if (!orderedKeys.includes(key)) orderedKeys.push(key);
    valuesByKey.set(key, line);
  });

  return orderedKeys.map((key) => valuesByKey.get(key) || "").filter(Boolean).join("\n");
}

function normalizeOtherPointersBody(rawText) {
  const prepared = String(rawText || "")
    .replace(/\bother pointers\s*:?\s*/gi, "\n")
    .replace(/\.\s+(?=[A-Z])/g, ".\n");

  return splitStructuredDraftLines(prepared)
    .map((line) => String(line || "").replace(/^[\-\*]\s*/, "").trim())
    .map((line) => line.replace(/^[.:;-]+/, "").trim())
    .map(polishStructuredBulletSentence)
    .filter(Boolean)
    .filter((line, index, array) => array.findIndex((item) => item.toLowerCase() === line.toLowerCase()) === index)
    .map((line) => `• ${line.replace(/^•\s*/, "")}`)
    .join("\n");
}

function buildStructuredRecruiterRawNote(sections = {}, extraText = "") {
  const lines = [];
  const pushLine = (label, value) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    lines.push(`${label} - ${clean}`);
  };
  pushLine("Current CTC", sections.current_ctc);
  pushLine("Expected CTC", sections.expected_ctc);
  pushLine("Notice period", sections.notice_period);
  pushLine("Offer in hand", sections.offer_in_hand);
  pushLine("LWD / DOJ", sections.lwd_or_doj);
  const extra = splitStructuredDraftLines(extraText).join("\n");
  return [...lines, extra].filter(Boolean).join("\n");
}

function buildStructuredRecruiterSectionOverrides(sections = {}) {
  const normalizeSectionValue = (value) => {
    const clean = String(value || "").trim();
    if (!clean) return "";
    const lowered = clean.toLowerCase();
    if (["0", "-", "--", "na", "n/a", "nil", "none", "same", "same as existing", "unchanged"].includes(lowered)) {
      return "";
    }
    return clean;
  };
  const direct = {};
  const currentCtc = normalizeSectionValue(sections.current_ctc);
  const expectedCtc = normalizeSectionValue(sections.expected_ctc);
  const noticePeriod = normalizeSectionValue(sections.notice_period);
  const offerInHand = normalizeSectionValue(sections.offer_in_hand);
  const lwdOrDoj = normalizeSectionValue(sections.lwd_or_doj);
  if (currentCtc) direct.current_ctc = currentCtc;
  if (expectedCtc) direct.expected_ctc = expectedCtc;
  if (noticePeriod) direct.notice_period = noticePeriod;
  if (offerInHand) direct.offer_in_hand = offerInHand;
  if (lwdOrDoj) direct.lwd_or_doj = lwdOrDoj;
  return direct;
}

function mergeRecruiterNotes(existingText, incomingText) {
  const existing = normalizeRecruiterNotesBody(existingText);
  const incoming = normalizeRecruiterNotesBody(incomingText);
  if (!existing) return incoming;
  if (!incoming) return existing;
  const existingLines = existing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const incomingLines = incoming.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const keyed = new Map();
  const order = [];
  [...existingLines, ...incomingLines].forEach((line) => {
    const key = getRecruiterNoteLineKey(line);
    if (!order.includes(key)) order.push(key);
    keyed.set(key, line);
  });
  return order.map((key) => keyed.get(key) || "").filter(Boolean).join("\n");
}

function extractLastMeaningfulLine(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

function parseNaturalFollowUpDate(text, baseDate = new Date()) {
  const value = String(text || "").toLowerCase();
  if (!value) return "";
  const hasRelativeDate = /\btoday\b|\btomorrow\b|\bday after tomorrow\b|\bnext week\b|\bthis week\b|\b1st week\b|\b2nd week\b|\byesterday\b/.test(value);
  const hasWeekday = /\b(?:this|next)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(value);
  const hasExplicitDate = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/.test(value);
  const hasTime = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\bmorning\b|\bevening\b/.test(value);
  if (!hasRelativeDate && !hasWeekday && !hasExplicitDate && !hasTime) return "";
  const result = new Date(baseDate);
  result.setSeconds(0, 0);

  if (/\bday after tomorrow\b/.test(value)) result.setDate(result.getDate() + 2);
  else if (/\btomorrow\b/.test(value)) result.setDate(result.getDate() + 1);
  else if (/\bnext week\b/.test(value)) result.setDate(result.getDate() + 7);
  else if (/\bthis week\b/.test(value)) result.setDate(result.getDate() + 3);
  else if (/\b1st week\b/.test(value)) result.setDate(result.getDate() + 7);
  else if (/\b2nd week\b/.test(value)) result.setDate(result.getDate() + 14);
  else if (/\byesterday\b/.test(value)) result.setDate(result.getDate() - 1);

  const weekdayMatch = value.match(/\b(?:(this|next)\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekdayMatch) {
    const modifier = String(weekdayMatch[1] || "").trim();
    const weekdayName = weekdayMatch[2];
    const weekdayMap = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6
    };
    const targetDay = weekdayMap[weekdayName];
    const currentDay = result.getDay();
    let diff = targetDay - currentDay;
    if (modifier === "next") {
      diff = diff <= 0 ? diff + 7 : diff + 7;
    } else {
      diff = diff < 0 ? diff + 7 : diff;
    }
    result.setDate(result.getDate() + diff);
  }

  const dateMatch = value.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/);
  if (dateMatch) {
    const day = Number(dateMatch[1]);
    const monthMap = {
      jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4,
      jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8,
      oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11
    };
    result.setMonth(monthMap[dateMatch[2]]);
    result.setDate(day);
  }

  const timeMatch = value.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (timeMatch) {
    let hours = Number(timeMatch[1]) % 12;
    const minutes = Number(timeMatch[2] || 0);
    if (timeMatch[3] === "pm") hours += 12;
    result.setHours(hours, minutes, 0, 0);
  } else if (/\bmorning\b/.test(value)) {
    result.setHours(10, 0, 0, 0);
  } else if (/\bevening\b/.test(value)) {
    result.setHours(17, 0, 0, 0);
  } else if (hasTime) {
    result.setHours(17, 0, 0, 0);
  }

  return toDateInputValue(result);
}

function inferAttemptOutcomeAndFollowUp(text) {
  const value = String(text || "").toLowerCase();
  if (!value) return { outcome: "", followUpAt: "", candidateStatus: "" };
  if (/\breject\b|\brejected\b|\bscreening reject\b|\bsr\b|\bpoor communication\b|\bbad communication\b/.test(value)) return { outcome: "Screening reject", followUpAt: "", candidateStatus: "Screening Reject" };
  if (/\bnot interested\b/.test(value)) return { outcome: "Not interested", followUpAt: "", candidateStatus: "Not interested" };
  if (/\brevisit\b/.test(value)) return { outcome: "Revisit for other role", followUpAt: "", candidateStatus: "Revisit for other role" };
  if (/\bhold\b|\bon hold\b|\bhigh ctc\b|\bhigh notice\b|\bhigh np\b|\bout of budget\b/.test(value)) return { outcome: "Hold by recruiter", followUpAt: "", candidateStatus: "Hold" };
  if (/\binterested\b/.test(value)) return { outcome: "Interested", followUpAt: "", candidateStatus: "Interested" };
  if (/\bcall later\b|\bcall next\b|\bnext call\b|\bfollow up\b|\bcall tomorrow\b|\bcall today\b|\bcall day after tomorrow\b|\bcall next week\b|\bcall this week\b|\bcall on\b|\bcall at\b|\bcall (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bcall this (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\bcall next (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(value)) return { outcome: "Call later", followUpAt: parseNaturalFollowUpDate(value), candidateStatus: "Follow-up" };
  if (/\bnot reachable\b|\bnot able to connect\b/.test(value)) return { outcome: "Not reachable", followUpAt: "", candidateStatus: "" };
  if (/\bswitch off\b|\bswitched off\b/.test(value)) return { outcome: "Switch Off", followUpAt: "", candidateStatus: "" };
  if (/\bdisconnected\b|\bdisconnecting\b|\bcutting the call\b|\bcall cut\b/.test(value)) return { outcome: "Disconnected", followUpAt: "", candidateStatus: "" };
  if (/\bbusy\b/.test(value)) return { outcome: "Busy", followUpAt: "", candidateStatus: "" };
  if (/\bno response\b|\bnot responding\b|\bnr\b|\bdid not pick up\b/.test(value)) return { outcome: "Not responding", followUpAt: "", candidateStatus: "" };
  return { outcome: "", followUpAt: "", candidateStatus: "" };
}

function isAssessmentStatusLine(line) {
  const value = String(line || "").trim().toLowerCase();
  if (!value) return false;
  return [
    "cv shared",
    "screening call aligned",
    "l1 aligned",
    "l2 aligned",
    "l3 aligned",
    "hr interview aligned",
    "feedback awaited",
    "hold",
    "did not attend",
    "dropped",
    "duplicate",
    "screening reject",
    "interview reject",
    "shortlisted",
    "joined",
    "offered"
  ].some((item) => value.includes(item));
}

function inferAssessmentStatusAndSchedule(text, baseDate = new Date()) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return { candidateStatus: "", atValue: "", offerAmount: "", expectedDoj: "", dateOfJoining: "" };

  const hasOffer = /\boffer\b|\boffered\b/.test(value);
  const hasDropped = /\bdropout\b|\bdropped\b|\bbackout\b/.test(value);
  const hasReject = /\breject\b|\brejected\b/.test(value);
  const hasScreening = /\bscreening\b/.test(value);
  const hasHr = /\bhr\b/.test(value);
  const hasL2 = /\bl2\b/.test(value);
  const hasL1 = /\bl1\b/.test(value);
  const hasScreeningCall = /\bscreening\b/.test(value);
  const hasFeedback = /\bfeedback\b/.test(value);
  const hasHold = /\bon hold\b|\bhold\b|\bhigh notice\b|\bhigh ctc\b|\bout of budget\b/.test(value);
  const hasDNA = /\bdid not join\b|\bdid not attend\b/.test(value);
  const hasDuplicate = /\bduplicate\b/.test(value);
  const hasShortlisted = /\bshortlisted\b|\bselected\b/.test(value);
  const hasJoined = /\bjoined\b/.test(value);

  let candidateStatus = "";
  if (hasOffer && hasDropped) candidateStatus = "Dropped";
  else if (hasScreening && (hasReject || /\bsr\b/.test(value))) candidateStatus = "Screening Reject";
  else if (hasDNA) candidateStatus = "Did not attend";
  else if (hasDropped) candidateStatus = "Dropped";
  else if (hasDuplicate) candidateStatus = "Duplicate";
  else if (hasJoined) candidateStatus = "Joined";
  else if (hasShortlisted) candidateStatus = "Shortlisted";
  else if (hasOffer) candidateStatus = "Offered";
  else if (hasFeedback) candidateStatus = "Feedback Awaited";
  else if (hasHold) candidateStatus = "Hold";
  else if (hasHr) candidateStatus = "HR interview aligned";
  else if (hasL2) candidateStatus = "L2 aligned";
  else if (hasL1) candidateStatus = "L1 aligned";
  else if (hasScreeningCall) candidateStatus = "Screening call aligned";
  else if (hasReject) candidateStatus = "Interview Reject";

  const shouldTrackDate = Boolean(candidateStatus) && (
    isInterviewAlignedStatus(candidateStatus) ||
    ["offered", "joined"].includes(candidateStatus.toLowerCase())
  );

  const parsedAt = shouldTrackDate ? parseNaturalFollowUpDate(value, baseDate) : "";
  const defaultAt = shouldTrackDate && !parsedAt ? toDateInputValue(baseDate) : "";

  const extractAmount = () => {
    const match = value.match(/(\d+(?:\.\d+)?)\s*l\b/);
    return match ? `${match[1]} L` : "";
  };

  return {
    candidateStatus,
    atValue: parsedAt || defaultAt,
    offerAmount: candidateStatus === "Offered" ? extractAmount() : "",
    expectedDoj: candidateStatus === "Offered" ? (parsedAt || defaultAt) : "",
    dateOfJoining: candidateStatus === "Joined" ? (parsedAt || defaultAt) : ""
  };
}

function buildAssessmentStatusNoteLine(statusValue, atValue = "", extra = {}) {
  const status = String(statusValue || "").trim();
  const lowered = status.toLowerCase();
  if (!status) return "";
  if (lowered === "offered") {
    const bits = ["Offered"];
    if (extra.offerAmount) bits.push(`Offer amount ${extra.offerAmount}`);
    if (atValue) bits.push(`Expected DOJ ${formatAssessmentStatusCalendarNoteDate(atValue)}`);
    return `${bits.join(" | ")}.`;
  }
  if (lowered === "joined") {
    return atValue ? `Joined on ${formatAssessmentStatusCalendarNoteDate(atValue)}.` : "Joined.";
  }
  return buildAssessmentStatusCalendarNote(status, atValue);
}

function buildAssessmentJourneyEntries(assessment, contactAttempts = [], candidate = null) {
  const entries = [];
  (contactAttempts || []).forEach((item) => {
    const when = item?.created_at || item?.at || "";
    if (!when) return;
    const noteLines = String(item?.notes || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" | ");
    entries.push({
      at: when,
      text: `Captured note | ${item?.outcome || "Attempt"}${noteLines ? ` | ${noteLines}` : ""}`
    });
  });

  const latestAttemptMissing = candidate?.last_contact_at && !(contactAttempts || []).some((item) => String(item?.created_at || "") === String(candidate.last_contact_at || ""));
  if (latestAttemptMissing) {
    const noteLines = String(candidate?.last_contact_notes || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(" | ");
    entries.push({
      at: candidate.last_contact_at,
      text: `Captured note | ${candidate?.last_contact_outcome || "Attempt"}${noteLines ? ` | ${noteLines}` : ""}`
    });
  }

  if (assessment?.generatedAt) {
    entries.push({
      at: assessment.generatedAt,
      text: `Assessment created | ${assessment?.candidateStatus || "CV Shared"}`
    });
  }

  const statusHistory = Array.isArray(assessment?.statusHistory) ? assessment.statusHistory : [];
  statusHistory.forEach((item) => {
    if (!item?.at) return;
    const bits = [item?.status || "Status update"];
    if (item?.notes) bits.push(item.notes);
    if (item?.offerAmount) bits.push(`Offer amount ${item.offerAmount}`);
    if (item?.atLabel) bits.push(item.atLabel);
    entries.push({
      at: item.at,
      text: `Assessment | ${bits.filter(Boolean).join(" | ")}`
    });
  });

  const interviewAttempts = Array.isArray(assessment?.interviewAttempts) ? assessment.interviewAttempts : [];
  interviewAttempts.forEach((item) => {
    const when = item?.at || item?.createdAt || "";
    if (!when) return;
    entries.push({
      at: when,
      text: `Assessment movement | ${[item?.round, item?.outcome, item?.notes].filter(Boolean).join(" | ")}`
    });
  });

  return entries
    .filter((item) => item.at && item.text)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

function syncAssessmentNotesWithStatus(currentNotes, statusValue, atValue = "", extra = {}) {
  const lines = String(currentNotes || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const nextLine = buildAssessmentStatusNoteLine(statusValue, atValue, extra).trim();
  if (!nextLine) return lines.join("\n");
  if (lines.length && isAssessmentStatusLine(lines[lines.length - 1])) {
    lines[lines.length - 1] = nextLine;
  } else {
    lines.push(nextLine);
  }
  return lines.join("\n");
}

function formatReadableUpdateText(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return "";
  const lines = raw
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return "";

  return lines
    .map((line) => {
      let text = String(line || "")
        .replace(/\s+/g, " ")
        .replace(/\s*,\s*(call(?:\s+next|\s+later|\s+back)?|callback|follow[\s-]*up|connect|speak|talk|revert|check)\b/gi, ". $1")
        .replace(/\s*,\s*(candidate|he|she)\b/gi, ". $1")
        .trim();
      if (!text) return "";
      text = text
        .replace(/\bhe was busy\b/i, "Candidate was busy")
        .replace(/\bshe was busy\b/i, "Candidate was busy")
        .replace(/\bbusy,\s*call\b/i, "Candidate was busy. Call")
        .replace(/\bcall next on\b/i, "Follow up on")
        .replace(/\bcall on\b/i, "Follow up on")
        .replace(/\bcall next\b/i, "Follow up next")
        .replace(/\bcallback on\b/i, "Follow up on")
        .replace(/\bfollowup\b/gi, "follow up");
      text = toSentenceCasePreservingContent(text);
      if (!/[.!?]$/.test(text)) text = `${text}.`;
      return text;
    })
    .filter(Boolean)
    .join("\n");
}

function appendReadableUpdateNote(existingText, incomingText) {
  const existing = String(existingText || "").trim();
  const formattedIncoming = formatReadableUpdateText(incomingText);
  if (!formattedIncoming) return existing;
  const existingLines = existing.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const incomingLines = formattedIncoming.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const merged = [...existingLines];
  incomingLines.forEach((line) => {
    if (!merged.some((existingLine) => existingLine.toLowerCase() === line.toLowerCase())) merged.push(line);
  });
  return merged.join("\n");
}

function formatAttemptLinesWithTimestamp(text, atValue) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  const stamp = atValue ? new Date(atValue).toLocaleString() : "";
  return lines.map((line) => `${stamp ? `[${stamp}] ` : ""}${line}`).join("\n");
}

function normalizeRecruiterMergeBase(item) {
  const source = item || {};
  const base = {
    name: String(source.name || source.candidateName || "").trim(),
    company: String(source.company || source.currentCompany || "").trim(),
    role: String(source.role || source.currentDesignation || "").trim(),
    experience: String(source.experience || source.totalExperience || "").trim(),
    location: String(source.location || "").trim(),
    current_ctc: String(source.current_ctc || source.currentCtc || "").trim(),
    expected_ctc: String(source.expected_ctc || source.expectedCtc || "").trim(),
    notice_period: String(source.notice_period || source.noticePeriod || "").trim(),
    lwd_or_doj: String(source.lwd_or_doj || source.lwdOrDoj || "").trim(),
    offer_in_hand: String(source.offer_in_hand || source.offerInHand || "").trim(),
    phone: String(source.phone || source.phoneNumber || "").trim(),
    email: String(source.email || source.emailId || "").trim(),
    linkedin: String(source.linkedin || source.linkedinUrl || "").trim(),
    highest_education: String(source.highest_education || source.highestEducation || "").trim(),
    next_action: ""
  };
  const savedRecruiterNote = String(source.recruiter_context_notes || source.recruiterContextNotes || "").trim();
  if (!savedRecruiterNote) return base;
  const savedFallbacks = extractRecruiterNoteFieldFallbacks(savedRecruiterNote);
  const savedMentionedKeys = detectRecruiterMentionedKeys(savedRecruiterNote);
  Object.keys(savedFallbacks).forEach((key) => {
    if (savedMentionedKeys.has(key) && String(savedFallbacks[key] || "").trim()) {
      base[key] = String(savedFallbacks[key] || "").trim();
    }
  });
  return base;
}

function extractRecruiterNoteFieldFallbacks(rawNote = "") {
  const text = String(rawNote || "").trim();
  if (!text) return { current_ctc: "", expected_ctc: "", notice_period: "", lwd_or_doj: "", offer_in_hand: "" };
  const findLineValue = (patterns) => {
    const lines = text.split(/\r?\n/).map((line) => String(line || "").trim()).filter(Boolean);
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[1]) return String(match[1]).trim();
      }
    }
    return "";
  };
  return {
    current_ctc: findLineValue([
      /^\s*current\s*ctc(?:\s*is|:)?\s*([^\n,;.]+)/i,
      /^\s*current\s*ctc\s*-\s*([^\n,;.]+)/i,
      /^\s*current\s*[-:]\s*([^\n,;.]+)/i,
      /\bcurrent\s*ctc\s*is\s*([^\n,;.]+)/i,
      /\bcurrent\s*ctc\s*(?:as|=)\s*([^\n,;.]+)/i
    ]),
    expected_ctc: findLineValue([
      /^\s*expected\s*ctc(?:\s*is|:)?\s*([^\n,;.]+)/i,
      /^\s*expected\s*ctc\s*-\s*([^\n,;.]+)/i,
      /^\s*expected\s*[-:]\s*([^\n,;.]+)/i,
      /^\s*expectation(?:\s*is|:)?\s*([^\n,;.]+)/i,
      /^\s*expectation\s*-\s*([^\n,;.]+)/i,
      /\bexpected\s*ctc\s*is\s*([^\n,;.]+)/i,
      /\bexpectation\s*(?:is|as|=)\s*([^\n,;.]+)/i
    ]),
    notice_period: findLineValue([
      /^\s*notice\s*period(?:\s*is|:)?\s*([^\n]+)/i,
      /^\s*notice\s*period\s*-\s*([^\n]+)/i,
      /^\s*notice\s*[-:]\s*([^\n]+)/i,
      /^\s*np(?:\s*is|:)?\s*([^\n]+)/i
    ]),
    lwd_or_doj: findLineValue([
      /^\s*lwd(?:\s*is|:)?\s*([^\n]+)/i,
      /^\s*lwd\s*-\s*([^\n]+)/i,
      /^\s*doj(?:\s*is|:)?\s*([^\n]+)/i,
      /^\s*doj\s*-\s*([^\n]+)/i,
      /^\s*last\s*working\s*day(?:\s*is|:)?\s*([^\n]+)/i,
      /\blwd\s*(?:as|is|=)\s*([^\n]+)/i,
      /\bdoj\s*(?:as|is|=)\s*([^\n]+)/i,
      /\bserving\s*notice.*?\blwd\s*(?:as|is|=)?\s*([^\n]+)/i
    ]),
    offer_in_hand: findLineValue([
      /^\s*offer\s*in\s*hand(?:\s*is|:)?\s*([^\n]+)/i,
      /^\s*offer\s*in\s*hand\s*-\s*([^\n]+)/i,
      /^\s*offers?\s*in\s*hand(?:\s*is|:)?\s*([^\n]+)/i,
      /\bholds?\s+an?\s+offer\s+of\s*([^\n,;.]+)/i,
      /\bgot\s+an?\s+offer\s+of\s*([^\n,;.]+)/i,
      /\boffer\s+of\s*([^\n,;.]+)/i
    ])
  };
}

function detectRecruiterMentionedKeys(rawNote = "") {
  const lines = String(rawNote || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim().toLowerCase())
    .filter(Boolean);
  const mentioned = new Set();
  lines.forEach((line) => {
    if (/^current\s*ctc\b|^current\s*[-:]/i.test(line)) mentioned.add("current_ctc");
    if (/^expected\s*ctc\b|^expected\s*[-:]|^expectation\b/i.test(line)) mentioned.add("expected_ctc");
    if (/^notice\s*period\b|^np\b/i.test(line)) mentioned.add("notice_period");
    if (/^lwd\b|^doj\b|^last\s*working\s*day\b|\bserving\s*notice\b.*\blwd\b/i.test(line)) mentioned.add("lwd_or_doj");
    if (/^offer\s*in\s*hand\b|^offers?\s*in\s*hand\b|\bholds?\s+an?\s+offer\b|\bgot\s+an?\s+offer\b|\boffer\s+of\b/i.test(line)) mentioned.add("offer_in_hand");
    if (/^location\b/i.test(line)) mentioned.add("location");
    if (/^communication\b/i.test(line)) mentioned.add("communication");
    if (/^working\s*model\b/i.test(line)) mentioned.add("working_model");
    if (/^shift\b/i.test(line)) mentioned.add("shift");
    if (/^relocation\b/i.test(line)) mentioned.add("relocation");
  });
  return mentioned;
}

function buildRecruiterMerge(item, parsed, rawNote = "") {
  const base = normalizeRecruiterMergeBase(item);
  const incoming = normalizeRecruiterMergeBase(parsed);
  const fallbacks = extractRecruiterNoteFieldFallbacks(rawNote);
  const mentionedKeys = detectRecruiterMentionedKeys(rawNote);
  const merged = {};
  const overwritten = [];
  for (const key of Object.keys(base)) {
    const explicitIncoming = fallbacks[key] || (mentionedKeys.has(key) ? incoming[key] || "" : "");
    const nextIncoming = explicitIncoming || "";
    merged[key] = nextIncoming || base[key] || "";
    if (nextIncoming && base[key] && nextIncoming.toLowerCase() !== base[key].toLowerCase()) {
      overwritten.push({ key, from: base[key], to: nextIncoming });
    }
  }
  merged.notes_append = String(rawNote || "").trim();
  return { base, incoming, fallbacks, merged, overwritten, mentionedKeys: Array.from(mentionedKeys) };
}

function buildRecruiterFieldPatchFromMerge(mergedPatch) {
  const extractedFieldPatch = {};
  [
    "company",
    "role",
    "experience",
    "location",
    "current_ctc",
    "expected_ctc",
    "notice_period",
    "lwd_or_doj",
    "offer_in_hand",
    "phone",
    "email",
    "linkedin",
    "highest_education"
  ].forEach((key) => {
    const value = mergedPatch?.incoming?.[key] || mergedPatch?.fallbacks?.[key] || "";
    if (String(value || "").trim()) extractedFieldPatch[key] = value;
  });
  return extractedFieldPatch;
}

function formatRecruiterOverwriteLabel(key) {
  const labels = {
    name: "Candidate",
    company: "Company",
    role: "Role",
    experience: "Experience",
    location: "Location",
    current_ctc: "Current CTC",
    expected_ctc: "Expected CTC",
    notice_period: "Notice period",
    lwd_or_doj: "LWD / DOJ",
    offer_in_hand: "Offer in hand",
    phone: "Phone",
    email: "Email",
    linkedin: "LinkedIn",
    highest_education: "Highest education",
    next_action: "Next action"
  };
  return labels[key] || key;
}

function api(path, token, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null
  }).then(async (response) => {
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { ok: false, error: text || `HTTP ${response.status}` };
    }
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || `HTTP ${response.status}`);
    }
    return data.result || data;
  });
}

function copyText(value) {
  return navigator.clipboard.writeText(String(value || ""));
}

async function copyHtmlAndText(htmlValue, textValue) {
  const html = String(htmlValue || "");
  const text = String(textValue || "");
  if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" })
        })
      ]);
      return;
    } catch (error) {
      console.warn("Falling back to plain-text clipboard copy.", error);
    }
  }
  await copyText(text);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getCapturedOutcome(candidate, assessment) {
  const isConverted = Boolean(assessment || candidate?.used_in_assessment);
  if (isConverted) return String(assessment?.candidateStatus || "No outcome").trim();
  return String(candidate?.last_contact_outcome || "No outcome").trim();
}

function getApplicantOutcome(applicant) {
  if (String(applicant?.assignedToName || applicant?.assigned_to_name || "").trim()) return "Assigned";
  return String(applicant?.parseStatus || applicant?.parse_status || "Applied").trim();
}

function getApplicantWorkflowOutcome(applicant, linkedCandidate = null) {
  const assessmentStatus = String(linkedCandidate?.candidate_status || applicant?.candidateStatus || "").trim();
  if (assessmentStatus) {
    if (/^screening call aligned$/i.test(assessmentStatus)) return "Aligned for Interview";
    return assessmentStatus;
  }
  const candidateOutcome = String(linkedCandidate?.last_contact_outcome || "").trim();
  if (!candidateOutcome) return "No outcome";
  if (/^call later$/i.test(candidateOutcome)) return "call_back_later";
  if (/^revisit for other role$/i.test(candidateOutcome)) return "revisit_for_other_role";
  return candidateOutcome;
}

function fillCandidateTemplate(template, candidate) {
  const source = candidate || {};
  const map = {
    index: source.index || "",
    name: source.name || "",
    jd_title: source.jd_title || source.role || "",
    company: source.company || "",
    outcome: source.outcome || "",
    recruiter_notes: source.recruiter_context_notes || source.notes || "",
    location: source.location || "",
    phone: source.phone || "",
    email: source.email || "",
    source: source.source || "",
    follow_up_at: source.follow_up_at || ""
  };
  return String(template || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => String(map[key] || ""));
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",").pop() : result;
      resolve(base64 || "");
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function formatDateForCopy(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

function buildCombinedAssessmentInsightsForExport(item = {}) {
  const parts = [];
  const otherStandardQuestions = String(item.other_standard_questions || item.last_contact_notes || "").trim();
  const otherPointers = String(item.other_pointers || "").trim();
  const recruiterNotes = String(item.recruiter_context_notes || item.notes || "").trim();
  if (otherStandardQuestions) parts.push(otherStandardQuestions);
  if (otherPointers) parts.push(otherPointers.replace(/^•\s*/gm, ""));
  if (recruiterNotes) parts.push(recruiterNotes);
  return parts.filter(Boolean).join("\n");
}

function parsePresetColumns(columnsText = "") {
  return String(columnsText || "")
    .split(/\r?\n/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((line) => {
      const [header, field] = line.split("|");
      return { header: String(header || "").trim(), field: String(field || "").trim() };
    })
    .filter((item) => item.header && item.field);
}

function getCapturedExportFieldValue(item = {}, field = "") {
  const key = String(field || "").trim();
  switch (key) {
    case "s_no": return String(item.index || "");
    case "name": return item.name || "";
    case "assessment_status": return item.assessment_status || item.outcome || "";
    case "status": return item.outcome || "";
    case "phone": return item.phone || "";
    case "email": return item.email || "";
    case "location": return item.location || "";
    case "current_company": return item.current_company || item.company || "";
    case "current_designation": return item.current_designation || item.role || "";
    case "total_experience": return item.total_experience || item.experience || "";
    case "highest_education": return item.highest_education || "";
    case "current_ctc": return item.current_ctc || "";
    case "expected_ctc": return item.expected_ctc || "";
    case "notice_period": return item.notice_period || "";
    case "lwd_or_doj": return item.lwd_or_doj || "";
    case "combined_assessment_insights": return item.combined_assessment_insights || buildCombinedAssessmentInsightsForExport(item);
    case "linkedin": return item.linkedin || "";
    case "client_name": return item.client_name || "";
    case "jd_title": return item.jd_title || item.role || "";
    case "target_role_open_position": return item.jd_title || item.role || "";
    case "key_skills_required": return Array.isArray(item.skills) ? item.skills.join(", ") : String(item.skills || "");
    case "recruiter_name": return item.assigned_to_name || item.recruiter_name || "";
    case "date_added": return item.created_at ? String(item.created_at).slice(0, 10) : "";
    case "domain_industry": return item.domain_industry || "";
    case "current_org_tenure": return item.current_org_tenure || "";
    case "reason_of_change": return item.reason_of_change || "";
    case "other_pointers": return item.other_pointers || "";
    case "other_standard_questions": return item.other_standard_questions || item.last_contact_notes || "";
    case "remarks": return item.recruiter_context_notes || item.notes || "";
    default: return item[key] || "";
  }
}

function buildCapturedExcelRows(items, preset, settings = DEFAULT_COPY_SETTINGS) {
  const normalized = (items || []).map((item, index) => ({
    index: index + 1,
    ...item
  }));
  const customPreset = (settings?.customExportPresets || []).find((item) => String(item.id || "") === String(preset || ""));
  if (customPreset) {
    const columns = parsePresetColumns(customPreset.columns);
    return {
      headers: columns.map((item) => item.header),
      rows: normalized.map((item) => columns.map((column) => getCapturedExportFieldValue(item, column.field)))
    };
  }
  const builtInColumns = String(settings?.exportPresetColumns?.[preset] || DEFAULT_COPY_SETTINGS.exportPresetColumns?.[preset] || "").trim();
  if (builtInColumns) {
    const columns = parsePresetColumns(builtInColumns);
    return {
      headers: columns.map((item) => item.header),
      rows: normalized.map((item) => columns.map((column) => getCapturedExportFieldValue(item, column.field)))
    };
  }
  switch (preset) {
    case "client_tracker":
      return {
        headers: [
          "Client Name",
          "Target Role / Open Position",
          "Key Skills Required",
          "Recruiter Name",
          "Date Added",
          "Candidate Name",
          "Status",
          "Contact No.",
          "Email ID",
          "Location",
          "Current Company",
          "Current Designation",
          "Domain / Industry",
          "Work Exp (Total years/months)",
          "Highest Education",
          "Current CTC",
          "Expected CTC",
          "Notice Period",
          "Remarks / Notes",
          "LinkedIn Profile Link (Optional)"
        ],
        rows: normalized.map((item) => [
          item.client_name || "",
          item.jd_title || item.role || "",
          Array.isArray(item.skills) ? item.skills.join(", ") : "",
          item.assigned_to_name || item.recruiter_name || "",
          item.created_at ? String(item.created_at).slice(0, 10) : "",
          item.name || "",
          item.outcome || "",
          item.phone || "",
          item.email || "",
          item.location || "",
          item.company || "",
          item.role || "",
          "",
          item.experience || "",
          item.highest_education || "",
          item.current_ctc || "",
          item.expected_ctc || "",
          item.notice_period || "",
          item.recruiter_context_notes || item.notes || "",
          item.linkedin || ""
        ])
      };
    case "attentive_tracker":
      return {
        headers: [
          "S.No.",
          "Name",
          "Status",
          "Ph",
          "Email",
          "Location",
          "Current Company",
          "Current Designation",
          "Work Experience",
          "Highest Education",
          "Current CTC",
          "Expected CTC",
          "Notice Period",
          "Insights",
          "LinkedIn"
        ],
        rows: normalized.map((item) => [
          String(item.index),
          item.name || "",
          item.assessment_status || item.outcome || "",
          item.phone || "",
          item.email || "",
          item.location || "",
          item.current_company || item.company || "",
          item.current_designation || item.role || "",
          item.total_experience || item.experience || "",
          item.highest_education || "",
          item.current_ctc || "",
          item.expected_ctc || "",
          item.notice_period || "",
          item.combined_assessment_insights || buildCombinedAssessmentInsightsForExport(item),
          item.linkedin || ""
        ])
      };
    case "client_submission":
      return {
        headers: ["S.No.", "Name", "Ph", "Email", "Current Company", "Current Designation", "Total Experience", "Strong Points", "Remarks"],
        rows: normalized.map((item) => [
          String(item.index),
          item.name || "",
          item.phone || "",
          item.email || "",
          item.company || "",
          item.role || "",
          item.experience || "",
          item.other_pointers || "",
          item.recruiter_context_notes || item.notes || ""
        ])
      };
    case "screening_focus":
      return {
        headers: ["S.No.", "Name", "Current CTC", "Expected CTC", "Notice Period", "Screening Answers", "Remarks"],
        rows: normalized.map((item) => [
          String(item.index),
          item.name || "",
          item.current_ctc || "",
          item.expected_ctc || "",
          item.notice_period || "",
          item.last_contact_notes || "",
          item.recruiter_context_notes || item.notes || ""
        ])
      };
    case "compact_recruiter":
    default:
      return {
        headers: ["S.No.", "Name", "Ph", "Email", "Current Company", "Current Designation", "Total Experience", "Tenure in current company", "Location", "Reason of change", "Status", "Current CTC", "Expected CTC", "Notice Period", "Other Standard Questions", "Remarks", "LinkedIn"],
        rows: normalized.map((item) => [
          String(item.index),
          item.name || "",
          item.phone || "",
          item.email || "",
          item.company || "",
          item.role || "",
          item.experience || "",
          "",
          item.location || "",
          "",
          item.outcome || "",
          item.current_ctc || "",
          item.expected_ctc || "",
          item.notice_period || "",
          item.last_contact_notes || "",
          item.recruiter_context_notes || item.notes || "",
          item.linkedin || ""
        ])
      };
  }
}

function getApplyLink(jobId) {
  return jobId ? `${window.location.origin}/apply/${encodeURIComponent(jobId)}` : "";
}

function buildWordpressSnippet(companyId, secret, apiUrl) {
  return `add_action('wpcf7_before_send_mail', function ($contact_form) {\n  $submission = WPCF7_Submission::get_instance();\n  if (!$submission) return;\n  $data = $submission->get_posted_data();\n  $payload = [\n    'companyId' => '${companyId}',\n    'jdTitle' => !empty($data['job-role']) ? $data['job-role'] : '',\n    'jobId' => sanitize_title(!empty($data['job-role']) ? $data['job-role'] : ''),\n    'sourcePlatform' => 'website',\n    'sourceLabel' => 'WordPress Website',\n    'candidateName' => isset($data['your-name']) ? $data['your-name'] : '',\n    'email' => isset($data['your-email']) ? $data['your-email'] : '',\n    'phone' => isset($data['tel-581']) ? $data['tel-581'] : '',\n    'location' => isset($data['text-961']) ? $data['text-961'] : ''\n  ];\n  wp_remote_post('${apiUrl}', [\n    'timeout' => 90,\n    'headers' => [\n      'Content-Type' => 'application/json',\n      'x-applicant-intake-secret' => '${secret}'\n    ],\n    'body' => wp_json_encode($payload)\n  ]);\n}, 10, 1);`;
}

function buildGoogleScript(companyId, secret, apiUrl) {
  return `function syncRecruitDeskApplicants() {\n  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();\n  const rows = sheet.getDataRange().getValues();\n  if (!rows || rows.length < 2) return;\n  const headers = rows[0].map(String);\n  const syncedColIndex = headers.indexOf("recruitdesk_synced");\n  if (syncedColIndex === -1) throw new Error('Missing "recruitdesk_synced" column.');\n  const find = (name) => headers.indexOf(name);\n  for (let r = 1; r < rows.length; r++) {\n    const row = rows[r];\n    if (String(row[syncedColIndex] || "").trim().toLowerCase() === "yes") continue;\n    const jobRole = String(row[find("major-tech")] || "").trim();\n    const payload = {\n      companyId: "${companyId}", jdTitle: jobRole, jobId: jobRole.toLowerCase().replace(/\\s+/g, "-"),\n      sourcePlatform: "google_sheet", sourceLabel: "Google Sheet",\n      candidateName: String(row[find("your-name")] || "").trim(), email: String(row[find("your-email")] || "").trim(),\n      phone: String(row[find("tel-581")] || "").trim(), location: String(row[find("text-961")] || "").trim()\n    };\n    const response = UrlFetchApp.fetch("${apiUrl}", {\n      method: "post", contentType: "application/json", headers: { "x-applicant-intake-secret": "${secret}" }, payload: JSON.stringify(payload), muteHttpExceptions: true\n    });\n    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) sheet.getRange(r + 1, syncedColIndex + 1).setValue("yes");\n  }\n}`;
}

function toDateInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function isInterviewAlignedStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  return [
    "screening call aligned",
    "l1 aligned",
    "l2 aligned",
    "l3 aligned",
    "hr interview aligned"
  ].includes(value);
}

function mapAssessmentStatusToPipelineStage(status) {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return "";
  if (value === "cv shared") return "Submitted";
  if (isInterviewAlignedStatus(value)) return "Interview Scheduled";
  if (value === "offered") return "Offer Extended";
  if (value === "feedback awaited" || value === "hold") return "On Hold";
  if (value === "screening reject" || value === "interview reject" || value === "duplicate" || value === "dropped") return "Rejected";
  if (value === "shortlisted") return "Shortlisted";
  if (value === "joined") return "Joined";
  return "";
}

function deriveInterviewRoundFromStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (value === "screening call aligned") return "Screening call";
  if (value === "l1 aligned") return "L1";
  if (value === "l2 aligned") return "L2";
  if (value === "l3 aligned") return "L3";
  if (value === "hr interview aligned") return "HR";
  if (value === "did not attend") return "Interview";
  return "";
}

function buildDetectedUpdateConfirmation({ candidateName = "", status = "", outcome = "", interviewAt = "", followUpAt = "", notes = "" }) {
  const lines = [];
  if (candidateName) lines.push(`Candidate: ${candidateName}`);
  if (status) lines.push(`Status: ${status}`);
  if (outcome) lines.push(`Outcome: ${outcome}`);
  if (interviewAt) lines.push(`Interview: ${new Date(interviewAt).toLocaleString()}`);
  if (followUpAt) lines.push(`Follow-up: ${new Date(followUpAt).toLocaleString()}`);
  if (notes) lines.push(`Notes: ${notes}`);
  return `Detected update:\n${lines.join("\n")}\n\nApply this update?`;
}

function formatAssessmentStatusCalendarNoteDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function buildAssessmentStatusCalendarNote(statusValue, atLocalValue) {
  const status = String(statusValue || "").trim().toLowerCase();
  const statusLabel = String(statusValue || "").trim();
  const label = atLocalValue ? formatAssessmentStatusCalendarNoteDate(atLocalValue) : "";
  if (isInterviewAlignedStatus(status)) return label ? `${statusLabel} on ${label}.` : statusLabel;
  if (status === "offered") return label ? `Offered. LWD / DOJ on ${label}.` : "Offered.";
  if (status === "cv shared") return "CV Shared.";
  if (status === "did not attend") return "Did not attend.";
  if (status === "screening reject") return "Screening reject.";
  if (status === "interview reject") return "Interview reject.";
  if (status === "duplicate") return "Duplicate.";
  if (status === "shortlisted") return "Shortlisted.";
  if (status === "joined") return "Joined.";
  if (status === "dropped") return "Dropped.";
  if (status === "feedback awaited") return "Feedback awaited.";
  if (status === "hold") return "Hold.";
  return statusLabel;
}

function normalizedAssessmentState(assessment, candidate) {
  const pipeline = String(assessment?.pipelineStage || candidate?.pipeline_stage || "").trim();
  const status = String(assessment?.candidateStatus || candidate?.candidate_status || "").trim();
  const followUp = String(assessment?.followUpAt || candidate?.next_follow_up_at || "").trim();
  const interviewAt = String(assessment?.interviewAt || "").trim();
  return {
    pipeline,
    status,
    followUp,
    interviewAt,
    summary: [pipeline, status].filter(Boolean).join(" | "),
    note: buildAssessmentStatusCalendarNote(status, interviewAt || followUp)
  };
}

function Section({ kicker, title, children }) {
  return (
    <section className="panel">
      <div className="section-kicker">{kicker}</div>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function LoginScreen({ onLogin, busy, error }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="section-kicker">Company Login</div>
        <h1>Open your RecruitDesk workspace</h1>
        <p className="muted">Use your existing company admin or recruiter credentials.</p>
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); onLogin({ email, password }); }}>
          <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button type="submit" disabled={busy}>{busy ? "Logging in..." : "Login"}</button>
        </form>
        {error ? <div className="status error">{error}</div> : null}
      </div>
    </div>
  );
}

function MultiSelectChipFilter({ label, options, selected, onToggle }) {
  return (
    <div className="filter-block">
      <div className="info-label">{label}</div>
      <div className="chip-row">
        <button
          className={`chip chip-toggle${!selected.length ? " active" : ""}`}
          onClick={() => onToggle("__all__")}
        >
          All
        </button>
        {options.map((option) => (
          <button
            key={option}
            className={`chip chip-toggle${selected.includes(option) ? " active" : ""}`}
            onClick={() => onToggle(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiSelectDropdown({ label, options, selected, onToggle }) {
  const summary = !selected.length ? `All ${label.toLowerCase()}` : `${selected.length} selected`;
  return (
    <details className="filter-dropdown">
      <summary className="filter-dropdown__summary">
        <span>{label}</span>
        <span className="muted">{summary}</span>
      </summary>
      <div className="filter-dropdown__body">
        <div className="chip-row">
          <button className={`chip chip-toggle${!selected.length ? " active" : ""}`} onClick={() => onToggle("__all__")}>All</button>
          {options.map((option) => (
            <button
              key={option}
              className={`chip chip-toggle${selected.includes(option) ? " active" : ""}`}
              onClick={() => onToggle(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </details>
  );
}

function AssignModal({ open, applicant, users, jobs, onClose, onSave, title = "Assign Applicant", description = "Assign this record to a recruiter and JD.", nameKey = "candidateName" }) {
  const [recruiterId, setRecruiterId] = useState("");
  const [jdTitle, setJdTitle] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) return;
    setRecruiterId("");
    setJdTitle(applicant?.jd_title || applicant?.jdTitle || "");
    setStatus("");
  }, [open, applicant]);

  if (!open) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted">{description.replace("{name}", applicant?.[nameKey] || applicant?.name || "this candidate")}</p>
        <label><span>Recruiter</span><select value={recruiterId} onChange={(e) => setRecruiterId(e.target.value)}><option value="">Select recruiter</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} | {user.email}</option>)}</select></label>
        <label><span>JD / role</span><select value={jdTitle} onChange={(e) => setJdTitle(e.target.value)}><option value="">Select JD / role</option>{jobs.map((job) => <option key={job.id} value={job.title}>{job.title}</option>)}</select></label>
        {status ? <div className="status">{status}</div> : null}
        <div className="button-row">
          <button onClick={async () => { if (!recruiterId || !jdTitle) { setStatus("Select recruiter and JD first."); return; } setStatus("Saving assignment..."); try { await onSave({ recruiterId, jdTitle }); } catch (error) { setStatus(String(error?.message || error)); } }}>Save assignment</button>
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function NotesModal({ open, candidate, onClose, onPatch, onParse }) {
  const [recruiterNote, setRecruiterNote] = useState("");
  const [otherPointers, setOtherPointers] = useState("");
  const [rawRecruiterSections, setRawRecruiterSections] = useState({
    current_ctc: "",
    expected_ctc: "",
    notice_period: "",
    offer_in_hand: "",
    lwd_or_doj: ""
  });
  const [parsedSummary, setParsedSummary] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [mergedPatch, setMergedPatch] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open || !candidate) return;
    const base = normalizeRecruiterMergeBase(candidate);
    setRecruiterNote(String(candidate.recruiter_context_notes || ""));
    setOtherPointers(String(candidate.other_pointers || ""));
    setRawRecruiterSections({
      current_ctc: String(base.current_ctc || ""),
      expected_ctc: String(base.expected_ctc || ""),
      notice_period: String(base.notice_period || ""),
      offer_in_hand: String(base.offer_in_hand || ""),
      lwd_or_doj: String(base.lwd_or_doj || "")
    });
    setParsedSummary(base);
    setConflicts([]);
    setMergedPatch(null);
    setStatus("");
  }, [open, candidate]);

  if (!open || !candidate) return null;

  const effectiveRawRecruiterNote = buildStructuredRecruiterRawNote(rawRecruiterSections, "");

  const saveAll = async () => {
    try {
      const mergeForSave = mergedPatch || { merged: normalizeRecruiterMergeBase(candidate), overwritten: [] };
      if (mergeForSave.overwritten?.length) {
        const message = mergeForSave.overwritten.map((entry) => `${formatRecruiterOverwriteLabel(entry.key)}: "${entry.from}" -> "${entry.to}"`).join("\n");
        const confirmed = window.confirm(`These fields will be overwritten:\n\n${message}\n\nDo you want to apply and save this recruiter note?`);
        if (!confirmed) return;
      }
      const extractedFieldPatch = buildRecruiterFieldPatchFromMerge(mergeForSave);
      const canonicalRecruiterNotes = buildCanonicalRecruiterNotes(
        candidate?.recruiter_context_notes || "",
        recruiterNote,
        mergeForSave?.merged || normalizeRecruiterMergeBase(candidate)
      );
      await onPatch({
        recruiter_context_notes: canonicalRecruiterNotes,
        other_pointers: normalizeOtherPointersBody(otherPointers),
        ...extractedFieldPatch
      }, "Recruiter note applied and saved.");
      setStatus("Recruiter note applied and saved.");
      onClose();
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>Recruiter Note</h3>
        <p className="muted">{candidate.name || "Candidate"} | {candidate.jd_title || candidate.role || "No role set"}</p>
        <div className="form-grid two-col">
          <label><span>Current CTC</span><input value={rawRecruiterSections.current_ctc} onChange={(e) => setRawRecruiterSections((current) => ({ ...current, current_ctc: e.target.value }))} placeholder="Recruiter can type in any style here" /></label>
          <label><span>Expected CTC</span><input value={rawRecruiterSections.expected_ctc} onChange={(e) => setRawRecruiterSections((current) => ({ ...current, expected_ctc: e.target.value }))} placeholder="Expected / expectation" /></label>
          <label><span>Notice period</span><input value={rawRecruiterSections.notice_period} onChange={(e) => setRawRecruiterSections((current) => ({ ...current, notice_period: e.target.value }))} placeholder="15 days / immediate / 30 days" /></label>
          <label><span>If serving, offer amount</span><input value={rawRecruiterSections.offer_in_hand} onChange={(e) => setRawRecruiterSections((current) => ({ ...current, offer_in_hand: e.target.value }))} placeholder="Offer amount / in hand offer" /></label>
          <label className="full"><span>LWD or DOJ</span><input value={rawRecruiterSections.lwd_or_doj} onChange={(e) => setRawRecruiterSections((current) => ({ ...current, lwd_or_doj: e.target.value }))} placeholder="8th June / 1st July / DOJ if offered" /></label>
        </div>
        <label><span>Other pointers</span><textarea value={otherPointers} onChange={(e) => setOtherPointers(e.target.value)} /></label>
        <div className="button-row">
          <button onClick={async () => {
            if (!String(effectiveRawRecruiterNote || "").trim()) {
              setStatus("Type recruiter note first.");
              return;
            }
            setStatus("Parsing recruiter note...");
            try {
              const parsed = await onParse(effectiveRawRecruiterNote);
              const structuredOverrides = buildStructuredRecruiterSectionOverrides(rawRecruiterSections);
              const merge = buildRecruiterMerge(
                candidate,
                { ...(parsed || {}), ...structuredOverrides },
                effectiveRawRecruiterNote
              );
              const mergedWithStructuredPriority = {
                ...(merge.merged || {}),
                ...structuredOverrides
              };
              setMergedPatch({ ...merge, merged: mergedWithStructuredPriority });
              setConflicts(merge.overwritten || []);
              setParsedSummary(mergedWithStructuredPriority || null);
              setRecruiterNote(normalizeRecruiterNotesBody(effectiveRawRecruiterNote));
              setStatus(
                merge.overwritten?.length
                  ? `Recruiter note parsed. Conflicts found in ${merge.overwritten.map((entry) => formatRecruiterOverwriteLabel(entry.key)).join(", ")}.`
                  : "Recruiter note parsed. Review and apply."
              );
            } catch (error) {
              setStatus(String(error?.message || error));
            }
          }}>Parse recruiter note</button>
          <button className="ghost-btn" onClick={saveAll}>Save all</button>
        </div>
        {parsedSummary ? (
          <div className="parsed-summary">
            <div className="info-label">Parsed summary</div>
            <div className="info-grid">
              {[["Candidate", parsedSummary.name],["Company", parsedSummary.company],["Role", parsedSummary.role],["Experience", parsedSummary.experience],["Location", parsedSummary.location],["Current CTC", parsedSummary.current_ctc],["Expected CTC", parsedSummary.expected_ctc],["Notice period", parsedSummary.notice_period],["LWD / DOJ", parsedSummary.lwd_or_doj],["Offer in hand", parsedSummary.offer_in_hand],["Phone", parsedSummary.phone],["Email", parsedSummary.email],["LinkedIn", parsedSummary.linkedin],["Highest education", parsedSummary.highest_education]].map(([label, value]) => value ? (
                <div className="info-card" key={label}>
                  <div className="info-label">{label}</div>
                  <div className="info-value">{value}</div>
                </div>
              ) : null)}
            </div>
          </div>
        ) : null}
        {conflicts.length ? (
          <div className="conflict-box">
            <div className="info-label">Conflicts detected</div>
            <ul>
              {conflicts.map((entry) => <li key={`${entry.key}-${entry.from}-${entry.to}`}><strong>{formatRecruiterOverwriteLabel(entry.key)}</strong>{`: existing "${entry.from}" to new "${entry.to}"`}</li>)}
            </ul>
          </div>
        ) : null}
        <label><span>Recruiter note</span><textarea value={recruiterNote} onChange={(e) => setRecruiterNote(e.target.value)} /></label>
        {status ? <div className="status">{status}</div> : null}
        <div className="button-row">
          <button onClick={saveAll}>Save all</button>
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AttemptsModal({ open, candidate, attempts, onClose, onRefresh, onSave }) {
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open || !candidate) return;
    setOutcome(String(candidate.last_contact_outcome || "").trim());
    setNotes(String(candidate.last_contact_notes || "").trim());
    if (candidate.next_follow_up_at) {
      const followUp = new Date(candidate.next_follow_up_at);
      const localValue = Number.isNaN(followUp.getTime())
        ? ""
        : new Date(followUp.getTime() - followUp.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      setNextFollowUpAt(localValue);
    } else {
      setNextFollowUpAt("");
    }
    setStatus("");
  }, [open, candidate]);

    useEffect(() => {
      const parsed = inferAttemptOutcomeAndFollowUp(extractLastMeaningfulLine(notes));
      if (parsed.outcome && parsed.outcome !== outcome) setOutcome(parsed.outcome);
      if (parsed.followUpAt) {
        setNextFollowUpAt(parsed.followUpAt);
      } else if (parsed.outcome && parsed.outcome !== "Call later" && parsed.outcome !== "Switch Off") {
        setNextFollowUpAt("");
      }
    }, [notes]);

  if (!open || !candidate) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card overlay-card--wide" onClick={(e) => e.stopPropagation()}>
        <h3>Attempts</h3>
        <p className="muted">{candidate.name || "Candidate"} | {candidate.jd_title || candidate.role || "No role set"}</p>
        <div className="attempt-grid">
        <div className="attempt-history">
            <h4>History</h4>
            <div className="stack-list compact">
              {candidate?.last_contact_outcome || candidate?.last_contact_notes || candidate?.next_follow_up_at ? (
                <article className="item-card compact-card">
                  <div className="item-card__top compact-top">
                    <strong>Latest saved status</strong>
                    <span className="muted">{candidate?.last_contact_at ? new Date(candidate.last_contact_at).toLocaleString() : ""}</span>
                  </div>
                  <p className="muted">{candidate?.last_contact_outcome || "No outcome"}</p>
                  {candidate?.last_contact_notes ? <div className="candidate-snippet">{formatAttemptLinesWithTimestamp(candidate.last_contact_notes, candidate.last_contact_at)}</div> : null}
                  {candidate?.next_follow_up_at ? <div className="chip-row"><span className="chip">Next follow-up: {new Date(candidate.next_follow_up_at).toLocaleString()}</span></div> : null}
                </article>
              ) : null}
              {!attempts.length ? <div className="empty-state">No attempts logged yet.</div> : attempts.map((item) => (
                <article key={item.id || `${item.created_at}-${item.outcome}`} className="item-card compact-card">
                  <div className="item-card__top compact-top">
                    <strong>{item.outcome || "Attempt"}</strong>
                    <span className="muted">{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</span>
                  </div>
                  <div className="candidate-snippet">{formatAttemptLinesWithTimestamp(item.notes || "No notes", item.created_at)}</div>
                  {item.next_follow_up_at ? <div className="chip-row"><span className="chip">Next follow-up: {new Date(item.next_follow_up_at).toLocaleString()}</span></div> : null}
                </article>
              ))}
            </div>
          </div>
          <div className="attempt-form">
            <h4>Log attempt</h4>
            <label><span>Outcome</span><select value={outcome} onChange={(e) => {
              const selected = e.target.value;
              setOutcome(selected);
              setNotes((current) => {
                if (!selected) return current;
                const line = extractLastMeaningfulLine(current);
                const nextLine = line.toLowerCase() === selected.toLowerCase() ? line : selected;
                return String(current || "").trim() ? `${String(current || "").trim()}\n${nextLine}` : nextLine;
              });
              }}><option value="">Select outcome</option><option>Not responding</option><option>Busy</option><option>Switch Off</option><option>Disconnected</option><option>Not reachable</option><option>Call later</option><option>Interested</option><option>Hold by recruiter</option><option>Not interested</option><option>Screening reject</option><option>Revisit for other role</option></select></label>
            <label><span>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            <label><span>Next follow-up</span><input type="datetime-local" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} /></label>
            {status ? <div className="status">{status}</div> : null}
            <div className="button-row">
                <button onClick={async () => {
                  setStatus("Saving attempt...");
                  try {
                    const lastLine = extractLastMeaningfulLine(notes);
                    const parsed = inferAttemptOutcomeAndFollowUp(lastLine);
                    const finalOutcome = parsed.outcome || outcome;
                    const finalFollowUpAt =
                      parsed.followUpAt ||
                      ((finalOutcome === "Call later" || finalOutcome === "Switch Off") ? nextFollowUpAt : "");
                    await onSave({
                      outcome: finalOutcome,
                      notes,
                      next_follow_up_at: finalFollowUpAt,
                      derived_status: parsed.candidateStatus,
                      final_line: lastLine
                    });
                  setStatus("Attempt saved.");
                  setNotes("");
                  setNextFollowUpAt("");
                  await onRefresh();
                } catch (error) {
                  setStatus(String(error?.message || error));
                }
              }}>Save attempt</button>
              <button className="ghost-btn" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssessmentStatusModal({ open, assessment, onClose, onSave }) {
  const [candidateStatus, setCandidateStatus] = useState("");
  const [atValue, setAtValue] = useState("");
  const [notes, setNotes] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [expectedDoj, setExpectedDoj] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open || !assessment) return;
    setCandidateStatus(String(assessment.candidateStatus || "").trim());
    setAtValue(toDateInputValue(assessment.interviewAt || assessment.followUpAt || ""));
    setNotes(String(assessment.callbackNotes || "").trim());
    setOfferAmount(String(assessment.offerAmount || "").trim());
    setExpectedDoj(toDateInputValue(assessment.expectedDoj || assessment.followUpAt || ""));
    setDateOfJoining(toDateInputValue(assessment.dateOfJoining || assessment.followUpAt || ""));
    setStatus("");
  }, [open, assessment]);

  useEffect(() => {
    const lastLine = extractLastMeaningfulLine(notes);
    const parsed = inferAssessmentStatusAndSchedule(lastLine);
    if (parsed.candidateStatus && parsed.candidateStatus !== candidateStatus) {
      setCandidateStatus(parsed.candidateStatus);
    }
    if (parsed.atValue) {
      if (parsed.candidateStatus === "Offered" && parsed.atValue !== expectedDoj) setExpectedDoj(parsed.atValue);
      else if (parsed.candidateStatus === "Joined" && parsed.atValue !== dateOfJoining) setDateOfJoining(parsed.atValue);
      else if (parsed.atValue !== atValue) setAtValue(parsed.atValue);
    }
    if (parsed.offerAmount && parsed.offerAmount !== offerAmount) setOfferAmount(parsed.offerAmount);
  }, [notes]);

  if (!open || !assessment) return null;

  const normalizedStatus = String(candidateStatus || "").trim().toLowerCase();
  const shouldShowCalendar = isInterviewAlignedStatus(candidateStatus) || normalizedStatus === "offered" || normalizedStatus === "joined";
  const effectiveAtValue = normalizedStatus === "offered" ? expectedDoj : normalizedStatus === "joined" ? dateOfJoining : atValue;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>Update assessment status</h3>
        <p className="muted">{assessment.candidateName || "Candidate"} | {assessment.jdTitle || "Untitled role"}</p>
        <label>
          <span>Status</span>
          <select value={candidateStatus} onChange={(e) => {
            const selected = e.target.value;
            setCandidateStatus(selected);
            const nextDate = selected.toLowerCase() === "offered" ? expectedDoj : selected.toLowerCase() === "joined" ? dateOfJoining : atValue;
            setNotes((current) => syncAssessmentNotesWithStatus(current, selected, nextDate, { offerAmount }));
          }}>
            <option value="">Select status</option>
            {DEFAULT_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>{normalizedStatus === "offered" ? "Expected DOJ" : normalizedStatus === "joined" ? "Date of joining" : "Interview / status date"}</span>
          <input
            type="datetime-local"
            value={effectiveAtValue}
            onChange={(e) => {
              const nextValue = e.target.value;
              if (normalizedStatus === "offered") setExpectedDoj(nextValue);
              else if (normalizedStatus === "joined") setDateOfJoining(nextValue);
              else setAtValue(nextValue);
              setNotes((current) => syncAssessmentNotesWithStatus(current, candidateStatus, nextValue, { offerAmount }));
            }}
            disabled={!shouldShowCalendar}
          />
        </label>
        {normalizedStatus === "offered" ? (
          <label>
            <span>Offer amount</span>
            <input value={offerAmount} onChange={(e) => {
              const nextValue = e.target.value;
              setOfferAmount(nextValue);
              setNotes((current) => syncAssessmentNotesWithStatus(current, candidateStatus, expectedDoj || atValue, { offerAmount: nextValue }));
            }} placeholder="25 L" />
          </label>
        ) : null}
        <label>
          <span>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="L1 aligned tomorrow 5 PM, screening reject, CV shared, etc." />
        </label>
        <p className="muted">Last line in notes is the final source of truth for current status.</p>
        {status ? <div className="status">{status}</div> : null}
        <div className="button-row">
          <button onClick={async () => {
            if (!candidateStatus) {
              setStatus("Select a status first.");
              return;
            }
            if (normalizedStatus === "offered" && !offerAmount) {
              setStatus("Add offer amount before saving.");
              return;
            }
            setStatus("Saving status update...");
            try {
              await onSave({
                candidateStatus,
                atValue: effectiveAtValue,
                notes,
                offerAmount,
                expectedDoj,
                dateOfJoining
              });
            } catch (error) {
              setStatus(String(error?.message || error));
            }
          }}>Save update</button>
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function NewDraftModal({ open, form, users, jobs, currentUser, onChange, onClose, onSave }) {
  if (!open) return null;
  const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>Create Draft</h3>
        <p className="muted">Add minimal details to create a draft without parsing.</p>
        <div className="form-grid two-col">
          {isAdmin ? (
            <label>
              <span>Assign recruiter</span>
              <select value={form.assigned_to_user_id} onChange={(e) => onChange("assigned_to_user_id", e.target.value)}>
                <option value="">Select recruiter</option>
                {(users || []).map((user) => <option key={user.id} value={user.id}>{user.name} | {user.email}</option>)}
              </select>
            </label>
          ) : null}
          <label><span>Name</span><input value={form.name} onChange={(e) => onChange("name", e.target.value)} /></label>
          <label><span>Phone</span><input value={form.phone} onChange={(e) => onChange("phone", e.target.value)} /></label>
          <label><span>Email</span><input value={form.email} onChange={(e) => onChange("email", e.target.value)} /></label>
          <label><span>LinkedIn</span><input value={form.linkedin} onChange={(e) => onChange("linkedin", e.target.value)} /></label>
          <label><span>Current Company</span><input value={form.company} onChange={(e) => onChange("company", e.target.value)} /></label>
          <label><span>Location</span><input value={form.location} onChange={(e) => onChange("location", e.target.value)} /></label>
          <label>
            <span>JD / Role</span>
            <select value={form.jd_title} onChange={(e) => {
              const selectedTitle = e.target.value;
              const matchedJob = (jobs || []).find((job) => String(job.title || "") === String(selectedTitle));
              onChange("jd_title", selectedTitle);
              onChange("client_name", matchedJob?.clientName || "");
            }}>
              <option value="">Select JD / role</option>
              {(jobs || []).map((job) => <option key={job.id} value={job.title}>{job.title}</option>)}
            </select>
          </label>
          <label><span>Client</span><input value={form.client_name} readOnly /></label>
          <label className="full">
            <span>Tags / searchable keywords</span>
            <textarea
              value={form.tags}
              onChange={(e) => onChange("tags", e.target.value)}
              placeholder="B2B corporate sales, SaaS, enterprise sales, node dev, full stack, react + java"
            />
          </label>
          <label className="full"><span>Notes</span><textarea value={form.notes} onChange={(e) => onChange("notes", e.target.value)} /></label>
        </div>
        <div className="button-row">
          <button onClick={onSave}>Save draft</button>
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DrilldownModal({ open, title, items, onClose, onOpenCv, onOpenDraft, onOpenAssessment }) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card overlay-card--wide" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted">{items.length} candidate(s)</p>
        <div className="stack-list compact">
          {!items.length ? <div className="empty-state">No matching candidates found.</div> : items.map((item, index) => (
            <article className="item-card compact-card" key={`${item.id || item.assessmentId || index}`}>
              <div className="item-card__top">
                <div>
                  <h3>{item.name || item.candidateName || "Candidate"} | {item.position || item.jdTitle || item.role || "Untitled role"}</h3>
                  <p className="muted">{[item.company || item.currentCompany || "", item.clientName ? `Client: ${item.clientName}` : "", item.ownerRecruiter ? `Recruiter: ${item.ownerRecruiter}` : "", item.source ? `Source: ${item.source}` : ""].filter(Boolean).join(" | ")}</p>
                  <div className="candidate-snippet">{[item.pipelineStage ? `Pipeline: ${item.pipelineStage}` : "", item.candidateStatus ? `Status: ${item.candidateStatus}` : "", item.followUpAt ? `Follow-up: ${new Date(item.followUpAt).toLocaleString()}` : "", item.interviewAt ? `Interview: ${new Date(item.interviewAt).toLocaleString()}` : ""].filter(Boolean).join("\n")}</div>
                  <div className="button-row">
                    {(item.raw?.candidate?.id || item.id) && (item.raw?.candidate?.cv_filename || item.raw?.candidate?.cv_url) ? <button onClick={() => onOpenCv(item.raw?.candidate?.id || item.id)}>Open CV</button> : null}
                    {item.raw?.candidate?.id ? <button onClick={() => onOpenDraft(item.raw.candidate.id)}>Open draft</button> : null}
                    {item.raw?.assessment || item.sourceType === "assessment_only" ? <button onClick={() => onOpenAssessment(item.raw?.assessment || item)}>Edit assessment</button> : null}
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
        <div className="button-row">
          <button className="ghost-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const DASHBOARD_FILTER_STORAGE_KEY = "recruitdesk_portal_dashboard_filters_v1";

function PortalApp({ token, onLogout }) {
  const navigate = useNavigate();
  const [state, setState] = useState({
    user: null,
    dashboard: null,
    applicants: [],
    candidates: [],
    assessments: [],
    users: [],
    intake: null,
    jobs: []
  });
  const [statuses, setStatuses] = useState({});
  const [assignApplicantId, setAssignApplicantId] = useState("");
  const [assignCandidateId, setAssignCandidateId] = useState("");
  const [hostedJobId, setHostedJobId] = useState("");
  const [dashboardFilters, setDashboardFilters] = useState(() => {
    try {
      const raw = window.localStorage.getItem(DASHBOARD_FILTER_STORAGE_KEY);
      if (!raw) return { dateFrom: "", dateTo: "", clientLabel: "", recruiterLabel: "", quickRange: "all" };
      const parsed = JSON.parse(raw);
      return {
        dateFrom: String(parsed?.dateFrom || ""),
        dateTo: String(parsed?.dateTo || ""),
        clientLabel: String(parsed?.clientLabel || ""),
        recruiterLabel: String(parsed?.recruiterLabel || ""),
        quickRange: String(parsed?.quickRange || "all")
      };
    } catch {
      return { dateFrom: "", dateTo: "", clientLabel: "", recruiterLabel: "", quickRange: "all" };
    }
  });
  const [candidateFilters, setCandidateFilters] = useState({
    q: "",
    dateFrom: "",
    dateTo: "",
    clients: [],
    jds: [],
    lanes: ["captured"],
    assignedTo: [],
    capturedBy: [],
    sources: [],
    outcomes: [],
    activeStates: ["active"]
  });
  const [applicantFilters, setApplicantFilters] = useState({
    q: "",
    dateFrom: "",
    dateTo: "",
    clients: [],
    jds: [],
    assignedTo: [],
    outcomes: []
  });
  const [assessmentFilters, setAssessmentFilters] = useState({
    q: "",
    dateFrom: "",
    dateTo: "",
    clients: [],
    jds: [],
    recruiters: []
  });
  const [candidateSearchMode, setCandidateSearchMode] = useState("all");
  const [candidateSearchText, setCandidateSearchText] = useState("");
  const [candidateAiQueryMode, setCandidateAiQueryMode] = useState("natural");
  const [candidateSearchResults, setCandidateSearchResults] = useState([]);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateStructuredFilters, setCandidateStructuredFilters] = useState({
    minExperience: "",
    maxExperience: "",
    location: "",
    keySkills: "",
    currentCompany: "",
    client: "",
    maxCurrentCtc: "",
    maxExpectedCtc: "",
    qualification: "",
    maxNoticeDays: "",
    recruiter: "",
    gender: ""
  });
  const [clientShareDraft, setClientShareDraft] = useState({
    hrName: "",
    recipientEmail: "",
    clientLabel: "",
    targetRole: "",
    presetId: "client_submission",
    extraMessage: ""
  });
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState([]);
  const [clientShareCvLinks, setClientShareCvLinks] = useState({});
  const [clientShareCvLinkState, setClientShareCvLinkState] = useState({});
  const [agendaRange, setAgendaRange] = useState("today");
  const [copySettings, setCopySettings] = useState(() => {
    try {
      const saved = window.localStorage.getItem(COPY_SETTINGS_STORAGE_KEY);
      return saved ? { ...DEFAULT_COPY_SETTINGS, ...JSON.parse(saved) } : DEFAULT_COPY_SETTINGS;
    } catch {
      return DEFAULT_COPY_SETTINGS;
    }
  });
  const [newPresetDraft, setNewPresetDraft] = useState({ label: "", columns: "" });
  const [quickUpdateCandidateQuery, setQuickUpdateCandidateQuery] = useState("");
  const [quickUpdateCandidateId, setQuickUpdateCandidateId] = useState("");
  const [quickUpdateText, setQuickUpdateText] = useState("");
  const [quickUpdateStatusText, setQuickUpdateStatusText] = useState("");
  const [quickUpdateRecruiterSections, setQuickUpdateRecruiterSections] = useState({
    current_ctc: "",
    expected_ctc: "",
    notice_period: "",
    offer_in_hand: "",
    lwd_or_doj: "",
    tags: ""
  });
  const [quickUpdateParsedSummary, setQuickUpdateParsedSummary] = useState(null);
  const [quickUpdateConflicts, setQuickUpdateConflicts] = useState([]);
  const [quickUpdateMergedPatch, setQuickUpdateMergedPatch] = useState(null);
  const [newDraftOpen, setNewDraftOpen] = useState(false);
  const [newDraftForm, setNewDraftForm] = useState({
    assigned_to_user_id: "",
    name: "",
    phone: "",
    email: "",
    linkedin: "",
    company: "",
    location: "",
    jd_title: "",
    client_name: "",
    tags: "",
    notes: ""
  });
  const [notesCandidateId, setNotesCandidateId] = useState("");
  const [attemptsCandidateId, setAttemptsCandidateId] = useState("");
  const [assessmentStatusId, setAssessmentStatusId] = useState("");
  const [drilldownState, setDrilldownState] = useState({ open: false, title: "", items: [] });
  const [attempts, setAttempts] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobShortcutKey, setJobShortcutKey] = useState("");
  const [jobShortcutValue, setJobShortcutValue] = useState("");
  const [jobDraft, setJobDraft] = useState({
    id: "",
    title: "",
    clientName: "",
    ownerRecruiterId: "",
    ownerRecruiterName: "",
    jobDescription: "",
    mustHaveSkills: "",
    redFlags: "",
    recruiterNotes: "",
    standardQuestions: "",
    jdShortcuts: ""
  });
  const [interviewMeta, setInterviewMeta] = useState({ candidateId: "", assessmentId: "" });
  const [interviewForm, setInterviewForm] = useState({
    candidateName: "",
    phoneNumber: "",
    emailId: "",
    location: "",
    currentCtc: "",
    expectedCtc: "",
    noticePeriod: "",
    offerInHand: "",
    lwdOrDoj: "",
    currentCompany: "",
    currentDesignation: "",
    totalExperience: "",
    currentOrgTenure: "",
    reasonForChange: "",
    clientName: "",
    jdTitle: "",
    pipelineStage: "Under Interview Process",
    candidateStatus: "Screening in progress",
    followUpAt: "",
    interviewAt: "",
    recruiterNotes: "",
    callbackNotes: "",
    otherPointers: "",
    jdScreeningAnswers: {},
    cvAnalysis: null,
    cvAnalysisApplied: false
  });

  const assignApplicant = (state.applicants || []).find((item) => String(item.id) === String(assignApplicantId)) || null;
  const assignCandidate = (state.candidates || []).find((item) => String(item.id) === String(assignCandidateId)) || null;
  const notesCandidate = (state.candidates || []).find((item) => String(item.id) === String(notesCandidateId)) || null;
  const attemptsCandidate = (state.candidates || []).find((item) => String(item.id) === String(attemptsCandidateId)) || null;
  const assessmentStatusItem = (state.assessments || []).find((item) => String(item.id) === String(assessmentStatusId)) || null;
  const quickUpdateCandidate = (state.candidates || []).find((item) => String(item.id) === String(quickUpdateCandidateId)) || null;
  const quickUpdateLinkedAssessment = useMemo(() => {
    if (!quickUpdateCandidate) return null;
    return (state.assessments || []).find((item) => {
      if (item?.candidateId && String(item.candidateId) === String(quickUpdateCandidate.id)) return true;
      return String(item?.candidateName || "").trim().toLowerCase() === String(quickUpdateCandidate?.name || "").trim().toLowerCase();
    }) || null;
  }, [quickUpdateCandidate, state.assessments]);
  const isSettingsAdmin = String(state.user?.role || "").toLowerCase() === "admin";

  function setStatus(key, message, kind = "") {
    setStatuses((current) => ({ ...current, [key]: message, [`${key}Kind`]: kind }));
  }

  async function loadDashboardSummary(filters = dashboardFilters) {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.clientLabel) params.set("clientLabel", filters.clientLabel);
    if (filters.recruiterLabel) params.set("recruiterLabel", filters.recruiterLabel);
    const dashboardResult = await api(`/company/dashboard${params.toString() ? `?${params.toString()}` : ""}`, token);
    setState((current) => ({ ...current, dashboard: dashboardResult || {} }));
  }

  async function loadWorkspace() {
    const [userResult, dashboardResult, applicantsResult, intakeResult, jobsResult, usersResult, candidatesResult, assessmentsResult, sharedPresetResult] = await Promise.all([
      api("/auth/me", token),
      api("/company/dashboard", token),
      api("/company/applicants", token).catch(() => ({ items: [] })),
      api("/company/applicant-intake-secret", token).catch(() => null),
      api("/company/jds", token).catch(() => ({ jobs: [] })),
      api("/company/users", token).catch(() => ({ users: [] })),
      api("/candidates", token).catch(() => []),
      api("/company/assessments", token).catch(() => ({ assessments: [] })),
      api("/company/shared-export-presets", token).catch(() => null)
    ]);
    setState({
      user: userResult.user || userResult,
      dashboard: dashboardResult || {},
      applicants: applicantsResult.items || [],
      intake: intakeResult || {},
      jobs: jobsResult.jobs || [],
      users: usersResult.users || [],
      candidates: Array.isArray(candidatesResult) ? candidatesResult : [],
      assessments: assessmentsResult.assessments || []
    });
    if (sharedPresetResult) {
      setCopySettings((current) => ({ ...current, ...DEFAULT_COPY_SETTINGS, ...sharedPresetResult }));
    }
    setStatus("workspace", "Portal loaded.", "ok");
  }

  useEffect(() => {
    void loadWorkspace().catch((error) => setStatus("workspace", String(error?.message || error), "error"));
  }, [token]);

  useEffect(() => {
    try {
      window.localStorage.setItem(DASHBOARD_FILTER_STORAGE_KEY, JSON.stringify(dashboardFilters));
    } catch {
      // Ignore local storage errors in restricted browsers.
    }
  }, [dashboardFilters]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COPY_SETTINGS_STORAGE_KEY, JSON.stringify(copySettings));
    } catch {
      // Ignore local storage errors in restricted browsers.
    }
  }, [copySettings]);

  useEffect(() => {
    setQuickUpdateParsedSummary(null);
    setQuickUpdateConflicts([]);
    setQuickUpdateMergedPatch(null);
  }, [quickUpdateCandidateId, quickUpdateText, quickUpdateStatusText]);

  useEffect(() => {
    if (!quickUpdateCandidate) {
      setQuickUpdateRecruiterSections({
        current_ctc: "",
        expected_ctc: "",
        notice_period: "",
        offer_in_hand: "",
        lwd_or_doj: "",
        tags: ""
      });
      setQuickUpdateText("");
      setQuickUpdateStatusText("");
      return;
    }
    const base = normalizeRecruiterMergeBase(quickUpdateCandidate);
    setQuickUpdateRecruiterSections({
      current_ctc: String(base.current_ctc || ""),
      expected_ctc: String(base.expected_ctc || ""),
      notice_period: String(base.notice_period || ""),
      offer_in_hand: String(base.offer_in_hand || ""),
      lwd_or_doj: String(base.lwd_or_doj || ""),
      tags: Array.isArray(quickUpdateCandidate.skills) ? quickUpdateCandidate.skills.join(", ") : ""
    });
    setQuickUpdateText(String(quickUpdateCandidate.other_pointers || ""));
    setQuickUpdateStatusText(String(quickUpdateCandidate.last_contact_notes || ""));
  }, [quickUpdateCandidate]);

  const capturedAssessmentMap = useMemo(() => {
    const map = new Map();
    for (const item of state.assessments || []) {
      const key = String(item.candidateName || "").trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, item);
    }
    return map;
  }, [state.assessments]);
  const capturedSources = useMemo(() => Array.from(new Set((state.candidates || []).map((item) => String(item.source || "").trim()).filter(Boolean))), [state.candidates]);
  const assessmentOptions = useMemo(() => {
    const clients = new Set();
    const jds = new Set();
    const recruiters = new Set();
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const currentUserName = String(state.user?.name || "").trim();
    const adminNames = (state.users || [])
      .filter((item) => String(item?.role || "").toLowerCase() === "admin")
      .map((item) => String(item?.name || "").trim())
      .filter(Boolean);
    const allowedRecruiterNames = isAdmin
      ? (state.users || []).map((item) => String(item?.name || "").trim()).filter(Boolean)
      : Array.from(new Set([currentUserName, ...adminNames].filter(Boolean)));
    (state.assessments || []).forEach((item) => {
      const matchedCandidate = (state.candidates || []).find((candidate) =>
        (item?.candidateId && String(candidate.id) === String(item.candidateId)) ||
        String(candidate.name || "").trim().toLowerCase() === String(item?.candidateName || "").trim().toLowerCase()
      );
      const clientValue = String(item?.clientName || matchedCandidate?.client_name || "").trim();
      const jdValue = String(item?.jdTitle || matchedCandidate?.jd_title || "").trim();
      const recruiterValue = String(item?.recruiterName || matchedCandidate?.assigned_to_name || matchedCandidate?.recruiter_name || "").trim();
      if (clientValue) clients.add(clientValue);
      if (jdValue) jds.add(jdValue);
      if (recruiterValue) recruiters.add(recruiterValue);
    });
    allowedRecruiterNames.forEach((name) => recruiters.add(name));
    return {
      clients: Array.from(clients).sort((a, b) => a.localeCompare(b)),
      jds: Array.from(jds).sort((a, b) => a.localeCompare(b)),
      recruiters: Array.from(recruiters).sort((a, b) => a.localeCompare(b))
    };
  }, [state.assessments, state.candidates, state.user, state.users]);

  const filteredAssessments = useMemo(() => {
    const query = String(assessmentFilters.q || "").trim().toLowerCase();
    return (state.assessments || []).filter((item) => {
      const matchedCandidate = (state.candidates || []).find((candidate) =>
        (item?.candidateId && String(candidate.id) === String(item.candidateId)) ||
        String(candidate.name || "").trim().toLowerCase() === String(item?.candidateName || "").trim().toLowerCase()
      );
      const clientValue = String(item?.clientName || matchedCandidate?.client_name || "").trim();
      const jdValue = String(item?.jdTitle || matchedCandidate?.jd_title || "").trim();
      const recruiterValue = String(item?.recruiterName || matchedCandidate?.assigned_to_name || matchedCandidate?.recruiter_name || "").trim();
      const createdDate = String(item?.generatedAt || item?.updatedAt || "").slice(0, 10);
      const hay = [
        item?.candidateName,
        item?.phoneNumber,
        item?.emailId,
        jdValue,
        clientValue,
        recruiterValue
      ].join(" ").toLowerCase();
      if (query && !hay.includes(query)) return false;
      if (assessmentFilters.dateFrom && createdDate && createdDate < assessmentFilters.dateFrom) return false;
      if (assessmentFilters.dateTo && createdDate && createdDate > assessmentFilters.dateTo) return false;
      if (assessmentFilters.clients.length && !assessmentFilters.clients.includes(clientValue)) return false;
      if (assessmentFilters.jds.length && !assessmentFilters.jds.includes(jdValue)) return false;
      if (assessmentFilters.recruiters.length && !assessmentFilters.recruiters.includes(recruiterValue)) return false;
      return true;
    });
  }, [state.assessments, state.candidates, assessmentFilters]);

  const assessmentLinkedCandidateMap = useMemo(() => {
    const map = new Map();
    filteredAssessments.forEach((item) => {
      const match = (state.candidates || []).find((candidate) => {
        const sameAssessment = String(candidate.assessment_id || "").trim() === String(item.id || "").trim();
        if (sameAssessment) return true;
        const sameName = String(candidate.name || "").trim().toLowerCase() === String(item.candidateName || "").trim().toLowerCase();
        const sameJd = String(candidate.jd_title || "").trim().toLowerCase() === String(item.jdTitle || "").trim().toLowerCase();
        const sameCompany = String(candidate.company || "").trim().toLowerCase() === String(item.currentCompany || "").trim().toLowerCase();
        const sameRole = String(candidate.role || "").trim().toLowerCase() === String(item.currentDesignation || "").trim().toLowerCase();
        return sameName && (
          (!String(item.jdTitle || "").trim() || sameJd) ||
          (sameCompany && sameRole) ||
          sameCompany
        );
      }) || null;
      map.set(String(item.id || ""), match);
    });
    return map;
  }, [filteredAssessments, state.candidates]);

  const normalizedAssessmentCopyRows = useMemo(() => {
    return filteredAssessments.map((item, index) => ({
      id: item.id || "",
      index: index + 1,
      s_no: index + 1,
      name: item.candidateName || "",
      phone: item.phoneNumber || "",
      email: item.emailId || "",
      location: item.location || "",
      company: item.currentCompany || "",
      current_company: item.currentCompany || "",
      role: item.currentDesignation || "",
      current_designation: item.currentDesignation || "",
      total_experience: item.totalExperience || "",
      highest_education: item.highestEducation || "",
      current_ctc: item.currentCtc || "",
      expected_ctc: item.expectedCtc || "",
      notice_period: item.noticePeriod || "",
      recruiter_context_notes: item.recruiterNotes || "",
      other_pointers: item.otherPointers || "",
      notes: item.recruiterNotes || item.callbackNotes || "",
      other_standard_questions: item.callbackNotes || "",
      combined_assessment_insights: buildCombinedAssessmentInsightsForExport({
        recruiter_context_notes: item.recruiterNotes || "",
        other_pointers: item.otherPointers || "",
        other_standard_questions: item.callbackNotes || ""
      }),
      linkedin: item.linkedinUrl || "",
      jd_title: item.jdTitle || "",
      client_name: item.clientName || "",
      outcome: item.candidateStatus || "",
      assessment_status: item.candidateStatus || "",
      follow_up_at: formatDateForCopy(item.followUpAt || item.interviewAt || ""),
      candidate_id: assessmentLinkedCandidateMap.get(String(item.id || ""))?.id || "",
      cv_url: assessmentLinkedCandidateMap.get(String(item.id || ""))?.cv_url || "",
      cv_filename: assessmentLinkedCandidateMap.get(String(item.id || ""))?.cv_filename || ""
    }));
  }, [assessmentLinkedCandidateMap, filteredAssessments]);
  const selectedAssessmentRows = useMemo(() => (
    normalizedAssessmentCopyRows
      .filter((item) => selectedAssessmentIds.includes(String(item.id || item.assessmentId || "")))
      .map((item, index) => ({ ...item, index: index + 1 }))
  ), [normalizedAssessmentCopyRows, selectedAssessmentIds]);
  useEffect(() => {
    let cancelled = false;
    async function loadCvLinks() {
      if (!token || !selectedAssessmentRows.length) return;
      const rowsNeedingLinks = selectedAssessmentRows.filter((item) => item.candidate_id && !clientShareCvLinkState[item.candidate_id]);
      if (!rowsNeedingLinks.length) return;
      setClientShareCvLinkState((current) => {
        const next = { ...current };
        rowsNeedingLinks.forEach((item) => {
          if (item.candidate_id) next[item.candidate_id] = "loading";
        });
        return next;
      });
      const entries = await Promise.all(rowsNeedingLinks.map(async (item) => {
        try {
          const result = await api(`/company/candidates/${encodeURIComponent(item.candidate_id)}/share-cv-link`, token);
          return [item.candidate_id, result.url, "ready"];
        } catch {
          return [item.candidate_id, "", "missing"];
        }
      }));
      if (cancelled) return;
      setClientShareCvLinks((current) => {
        const next = { ...current };
        entries.forEach(([candidateId, url]) => {
          if (candidateId && url) next[candidateId] = url;
        });
        return next;
      });
      setClientShareCvLinkState((current) => {
        const next = { ...current };
        entries.forEach(([candidateId, _url, state]) => {
          if (candidateId) next[candidateId] = state;
        });
        return next;
      });
    }
    void loadCvLinks();
    return () => {
      cancelled = true;
    };
  }, [selectedAssessmentRows, token]);
  const candidateUniverseAll = useMemo(() => {
    const linkedAssessmentIds = new Set((state.candidates || []).map((item) => String(item.assessment_id || "").trim()).filter(Boolean));
    const candidateNames = new Set((state.candidates || []).map((item) => String(item.name || "").trim().toLowerCase()).filter(Boolean));
    const assessmentOnlyItems = (state.assessments || [])
      .filter((item) => {
        const assessmentId = String(item.id || "").trim();
        if (assessmentId && linkedAssessmentIds.has(assessmentId)) return false;
        const nameKey = String(item.candidateName || "").trim().toLowerCase();
        return !nameKey || !candidateNames.has(nameKey);
      })
      .map((item) => ({
        id: item.id,
        assessmentId: item.id,
        name: item.candidateName || "",
        role: item.currentDesignation || "",
        company: item.currentCompany || "",
        experience: item.totalExperience || "",
        totalExperience: item.totalExperience || "",
        current_ctc: item.currentCtc || "",
        expected_ctc: item.expectedCtc || "",
        notice_period: item.noticePeriod || "",
        highest_education: item.highestEducation || "",
        linkedin: item.linkedinUrl || "",
        location: item.location || "",
        client_name: item.clientName || "",
        jd_title: item.jdTitle || "",
        assigned_to_name: item.recruiterName || "",
        source: "assessment_only",
        notes: item.callbackNotes || "",
        recruiter_context_notes: item.recruiterNotes || "",
        other_pointers: item.otherPointers || ""
      }));
    return [...(state.candidates || []), ...assessmentOnlyItems];
  }, [state.assessments, state.candidates]);
  const candidateSearchOptions = useMemo(() => {
    const recruiters = new Set();
    const genders = new Set();
    const clients = new Set();
    candidateUniverseAll.forEach((item) => {
      const recruiter = String(item.assigned_to_name || item.ownerRecruiter || item.recruiterName || "").trim();
      const gender = String(item.gender || "").trim();
      const client = String(item.client_name || item.clientName || "").trim();
      if (recruiter) recruiters.add(recruiter);
      if (gender) genders.add(gender);
      if (client) clients.add(client);
    });
    return {
      clients: Array.from(clients).sort(),
      recruiters: Array.from(recruiters).sort(),
      genders: Array.from(genders).sort()
    };
  }, [candidateUniverseAll]);
  const candidateBaseUniverse = useMemo(() => {
    if (candidateSearchMode === "all" || !String(candidateSearchText || "").trim()) return candidateUniverseAll;
    return candidateSearchResults || [];
  }, [candidateSearchMode, candidateSearchResults, candidateSearchText, candidateUniverseAll]);
  const candidateUniverse = useMemo(() => {
    return candidateBaseUniverse.filter((item) => {
      const years = parseExperienceToYears(item.experience || item.totalExperience || "");
      const minYears = Number(candidateStructuredFilters.minExperience || "");
      const maxYears = Number(candidateStructuredFilters.maxExperience || "");
      const noticeDays = parseNoticePeriodToDays(item.notice_period || item.noticePeriod || "");
      const currentCtc = parseAmountToLpa(item.current_ctc || item.currentCtc || "");
      const expectedCtc = parseAmountToLpa(item.expected_ctc || item.expectedCtc || "");
      const locationHay = String(item.location || "").toLowerCase();
      const companyHay = String(item.company || item.currentCompany || "").toLowerCase();
      const educationHay = String(item.highest_education || item.highestEducation || "").toLowerCase();
      const skillsHay = [
        item.role || item.currentDesignation || "",
        item.position || item.jdTitle || "",
        Array.isArray(item.skills) ? item.skills.join(" ") : "",
        Array.isArray(item.inferredTags) ? item.inferredTags.join(" ") : "",
        item.notesText || "",
        item.hiddenCvText || "",
        item.other_pointers || "",
        item.recruiter_context_notes || ""
      ].join(" ").toLowerCase();
      const clientValue = String(item.client_name || item.clientName || "").trim();
      const recruiterValue = String(item.assigned_to_name || item.ownerRecruiter || item.recruiterName || "").trim();
      const genderValue = String(item.gender || "").trim();
      if (candidateStructuredFilters.minExperience && (years == null || years < minYears)) return false;
      if (candidateStructuredFilters.maxExperience && (years == null || years > maxYears)) return false;
      if (candidateStructuredFilters.location && !locationHay.includes(String(candidateStructuredFilters.location).trim().toLowerCase())) return false;
      if (candidateStructuredFilters.keySkills) {
        const requiredSkills = String(candidateStructuredFilters.keySkills)
          .split(/[,\n]/)
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);
        if (requiredSkills.length && !requiredSkills.every((term) => skillsHay.includes(term))) return false;
      }
      if (candidateStructuredFilters.currentCompany && !companyHay.includes(String(candidateStructuredFilters.currentCompany).trim().toLowerCase())) return false;
      if (candidateStructuredFilters.client && clientValue !== candidateStructuredFilters.client) return false;
      if (candidateStructuredFilters.maxCurrentCtc && (currentCtc == null || currentCtc > Number(candidateStructuredFilters.maxCurrentCtc))) return false;
      if (candidateStructuredFilters.maxExpectedCtc && (expectedCtc == null || expectedCtc > Number(candidateStructuredFilters.maxExpectedCtc))) return false;
      if (candidateStructuredFilters.qualification && !educationHay.includes(String(candidateStructuredFilters.qualification).trim().toLowerCase())) return false;
      if (candidateStructuredFilters.maxNoticeDays && (noticeDays == null || noticeDays > Number(candidateStructuredFilters.maxNoticeDays))) return false;
      if (candidateStructuredFilters.recruiter && recruiterValue !== candidateStructuredFilters.recruiter) return false;
      if (candidateStructuredFilters.gender && genderValue !== candidateStructuredFilters.gender) return false;
      return true;
    });
  }, [candidateBaseUniverse, candidateStructuredFilters]);
  const pagedCandidates = useMemo(() => {
    const start = (candidatePage - 1) * 10;
    return candidateUniverse.slice(start, start + 10);
  }, [candidateUniverse, candidatePage]);
  const totalCandidatePages = Math.max(1, Math.ceil((candidateUniverse.length || 0) / 10));

  const capturedCandidateOptions = useMemo(() => {
    const meta = { clients: new Set(), jds: new Set(), sources: new Set(), outcomes: new Set(), assignedTo: new Set(), capturedBy: new Set() };
    const allowedJds = new Set([
      ...(state.jobs || []).map((job) => String(job.title || "").trim()).filter(Boolean)
    ]);
    const currentUserName = String(state.user?.name || "").trim();
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    if (isAdmin) {
      (state.users || []).forEach((user) => {
        const label = String(user?.name || "").trim();
        if (label) meta.capturedBy.add(label);
      });
    } else {
      if (currentUserName) meta.capturedBy.add(currentUserName);
      const adminUser = (state.users || []).find((user) => String(user?.role || "").toLowerCase() === "admin");
      const adminName = String(adminUser?.name || "").trim();
      if (adminName) meta.capturedBy.add(adminName);
    }
    for (const item of state.candidates || []) {
      const matchedAssessment = capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase());
      const sourceValue = String(item.source || "").trim();
      const isInboundApplicant = sourceValue === "website_apply" || sourceValue === "hosted_apply";
      if (isInboundApplicant) continue;
      const clientValue = String(item.client_name || matchedAssessment?.clientName || "Unassigned").trim();
      const jdValue = String(item.jd_title || matchedAssessment?.jdTitle || item.role || "").trim();
      const outcomeValue = getCapturedOutcome(item, matchedAssessment);
      const assignedToValue = String(item.assigned_to_name || "Unassigned").trim();
      const capturedByValue = String(item.recruiter_name || item.assigned_by_name || "Unknown").trim();
      if (clientValue) meta.clients.add(clientValue);
      if (jdValue && allowedJds.has(jdValue)) meta.jds.add(jdValue);
      if (sourceValue) meta.sources.add(sourceValue);
      if (outcomeValue) meta.outcomes.add(outcomeValue);
      if (assignedToValue) meta.assignedTo.add(assignedToValue);
      if (capturedByValue && (isAdmin || capturedByValue === currentUserName || String(capturedByValue).toLowerCase() === "admin")) {
        meta.capturedBy.add(capturedByValue);
      }
    }
    return {
      clients: Array.from(meta.clients).sort(),
      jds: Array.from(meta.jds).sort(),
      sources: Array.from(meta.sources).sort(),
      outcomes: Array.from(meta.outcomes).sort(),
      assignedTo: Array.from(meta.assignedTo).sort(),
      capturedBy: Array.from(meta.capturedBy).sort()
    };
  }, [capturedAssessmentMap, state.candidates, state.jobs, state.user]);

  const capturedCandidates = useMemo(() => {
    return (state.candidates || []).filter((item) => {
      const matchedAssessment = capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase());
      const sourceValue = String(item.source || "").trim();
      const isInboundApplicant = sourceValue === "website_apply" || sourceValue === "hosted_apply";
      if (isInboundApplicant) return false;
      const clientValue = String(item.client_name || matchedAssessment?.clientName || "Unassigned").trim();
      const jdValue = String(item.jd_title || matchedAssessment?.jdTitle || item.role || "").trim();
      const laneValue = matchedAssessment || item.used_in_assessment ? "converted" : "captured";
      const assignedToValue = String(item.assigned_to_name || "Unassigned").trim();
      const capturedByValue = String(item.recruiter_name || item.assigned_by_name || "Unknown").trim();
      const outcomeValue = getCapturedOutcome(item, matchedAssessment);
      const activeValue = isTerminalStatus(outcomeValue) ? "inactive" : "active";
      const createdAtValue = item.created_at ? String(item.created_at).slice(0, 10) : "";
      const hiddenOutcome = ["not interested", "screening reject", "revisit for other role"].includes(String(outcomeValue || "").trim().toLowerCase());
      const manuallyHidden = item.hidden_from_captured === true;
      const nameHay = [item.name].join(" ").toLowerCase();
      const hay = [
        item.name,
        item.company,
        item.role,
        item.jd_title,
        item.client_name,
        item.assigned_to_name,
        item.source,
        item.notes,
        item.recruiter_context_notes,
        item.other_pointers
      ].join(" ").toLowerCase();
      const queryText = candidateFilters.q.trim().toLowerCase();
      const queryOk = !queryText || hay.includes(queryText);
      const dateFromOk = !candidateFilters.dateFrom || (createdAtValue && createdAtValue >= candidateFilters.dateFrom);
      const dateToOk = !candidateFilters.dateTo || (createdAtValue && createdAtValue <= candidateFilters.dateTo);
      const clientOk = !candidateFilters.clients.length || candidateFilters.clients.includes(clientValue);
      const jdOk = !candidateFilters.jds.length || candidateFilters.jds.includes(jdValue);
      const laneOk = !candidateFilters.lanes.length || candidateFilters.lanes.includes(laneValue);
      const assignedToOk = !candidateFilters.assignedTo.length || candidateFilters.assignedTo.includes(assignedToValue);
      const capturedByOk = !candidateFilters.capturedBy.length || candidateFilters.capturedBy.includes(capturedByValue);
      const sourceOk = !candidateFilters.sources.length || candidateFilters.sources.includes(sourceValue);
      const outcomeOk = !candidateFilters.outcomes.length || candidateFilters.outcomes.includes(outcomeValue);
      const activeOk = !candidateFilters.activeStates.length || candidateFilters.activeStates.includes(activeValue);
      const searchNameMatch = Boolean(queryText && nameHay.includes(queryText));
      const hiddenBlocked = manuallyHidden && !searchNameMatch;
      const hiddenOutcomeBlocked = hiddenOutcome && !searchNameMatch;
      return !hiddenBlocked && !hiddenOutcomeBlocked && queryOk && dateFromOk && dateToOk && clientOk && jdOk && laneOk && assignedToOk && capturedByOk && sourceOk && outcomeOk && activeOk;
    });
  }, [candidateFilters, capturedAssessmentMap, state.candidates, state.users, state.user]);

  const filteredApplicants = useMemo(() => {
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const currentUserName = String(state.user?.name || "").trim().toLowerCase();
    return (state.applicants || []).filter((item) => {
      if (isAdmin) return true;
      const assignedName = String(item.assignedToName || item.assigned_to_name || "").trim().toLowerCase();
      return Boolean(assignedName && assignedName === currentUserName);
    });
  }, [state.applicants, state.user]);

  const applicantCandidateMap = useMemo(() => {
    const map = new Map();
    filteredApplicants.forEach((item) => {
      const match = (state.candidates || []).find((candidate) => {
        if (String(candidate.id || "").trim() && String(candidate.id) === String(item.id)) return true;
        const sameName = String(candidate.name || "").trim().toLowerCase() === String(item.candidateName || "").trim().toLowerCase();
        const sameJd = String(candidate.jd_title || "").trim().toLowerCase() === String(item.jdTitle || "").trim().toLowerCase();
        return sameName && (!String(item.jdTitle || "").trim() || sameJd);
      }) || null;
      map.set(String(item.id), match);
    });
    return map;
  }, [filteredApplicants, state.candidates]);

  const applicantOptions = useMemo(() => {
    const clients = new Set();
    const jds = new Set();
    const assignedTo = new Set();
    const outcomes = new Set();
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    if (isAdmin) {
      (state.users || []).forEach((user) => {
        const name = String(user?.name || "").trim();
        if (name) assignedTo.add(name);
      });
      assignedTo.add("Unassigned");
    }
    filteredApplicants.forEach((item) => {
      const linkedCandidate = applicantCandidateMap.get(String(item.id)) || null;
      const clientValue = String(item.clientName || item.client_name || "Unassigned").trim();
      const jdValue = String(item.jdTitle || item.jd_title || "").trim();
      const assignedValue = String(item.assignedToName || item.assigned_to_name || "Unassigned").trim();
      const outcomeValue = getApplicantWorkflowOutcome(item, linkedCandidate);
      if (clientValue) clients.add(clientValue);
      if (jdValue) jds.add(jdValue);
      if (!isAdmin && assignedValue) assignedTo.add(assignedValue);
      if (outcomeValue) outcomes.add(outcomeValue);
    });
    return {
      clients: Array.from(clients).sort((a, b) => a.localeCompare(b)),
      jds: Array.from(jds).sort((a, b) => a.localeCompare(b)),
      assignedTo: Array.from(assignedTo).sort((a, b) => a.localeCompare(b)),
      outcomes: APPLIED_OUTCOME_FILTER_ORDER.filter((item) => outcomes.has(item)).concat(
        Array.from(outcomes).filter((item) => !APPLIED_OUTCOME_FILTER_ORDER.includes(item)).sort((a, b) => a.localeCompare(b))
      )
    };
  }, [filteredApplicants, applicantCandidateMap, state.user, state.users]);

  const visibleApplicants = useMemo(() => {
    const query = String(applicantFilters.q || "").trim().toLowerCase();
    return filteredApplicants.filter((item) => {
      const linkedCandidate = applicantCandidateMap.get(String(item.id)) || null;
      const clientValue = String(item.clientName || item.client_name || "Unassigned").trim();
      const jdValue = String(item.jdTitle || item.jd_title || "").trim();
      const assignedValue = String(item.assignedToName || item.assigned_to_name || "Unassigned").trim();
      const outcomeValue = getApplicantWorkflowOutcome(item, linkedCandidate);
      const createdDate = String(item.createdAt || item.created_at || "").slice(0, 10);
      const hay = [
        item.candidateName,
        item.phone,
        item.email,
        jdValue,
        clientValue,
        assignedValue,
        item.currentCompany,
        item.currentDesignation
      ].join(" ").toLowerCase();
      if (query && !hay.includes(query)) return false;
      if (applicantFilters.dateFrom && createdDate && createdDate < applicantFilters.dateFrom) return false;
      if (applicantFilters.dateTo && createdDate && createdDate > applicantFilters.dateTo) return false;
      if (applicantFilters.clients.length && !applicantFilters.clients.includes(clientValue)) return false;
      if (applicantFilters.jds.length && !applicantFilters.jds.includes(jdValue)) return false;
      if (applicantFilters.assignedTo.length && !applicantFilters.assignedTo.includes(assignedValue)) return false;
      if (applicantFilters.outcomes.length && !applicantFilters.outcomes.includes(outcomeValue)) return false;
      return true;
    });
  }, [filteredApplicants, applicantFilters, applicantCandidateMap]);

  const quickUpdateMatches = useMemo(() => {
    const query = String(quickUpdateCandidateQuery || "").trim().toLowerCase();
    if (!query) return [];
    return (state.candidates || [])
      .filter((item) => {
        const hay = [
          item.name,
          item.phone,
          item.email,
          item.company,
          item.role,
          item.jd_title,
          item.client_name,
          item.linkedin
        ].join(" ").toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 10);
  }, [quickUpdateCandidateQuery, state.candidates]);

  async function openCv(applicantId) {
    const applicant = (state.applicants || []).find((item) => String(item.id) === String(applicantId));
    if (!applicant) {
      setStatus("applicants", "Applicant not found.", "error");
      return;
    }
    const params = new URLSearchParams({
      access_token: token,
      cv_url: String(applicant.cvUrl || ""),
      cv_filename: String(applicant.cvFilename || "")
    });
    window.open(`/company/candidates/${encodeURIComponent(applicantId)}/cv?${params.toString()}`, "_blank", "noopener,noreferrer");
    setStatus("applicants", "Opening CV...", "ok");
  }

  function openInterviewStoredCv() {
    if (!interviewMeta.candidateId) {
      setStatus("interview", "Save or open a real candidate draft before opening the stored CV.", "error");
      return;
    }
    const storedFile = interviewForm.cvAnalysis?.storedFile || null;
    if (!storedFile) {
      setStatus("interview", "No uploaded CV available yet.", "error");
      return;
    }
    const params = new URLSearchParams({ access_token: token });
    if (storedFile.url) params.set("cv_url", String(storedFile.url));
    if (storedFile.filename) params.set("cv_filename", String(storedFile.filename));
    window.open(`/company/candidates/${encodeURIComponent(interviewMeta.candidateId)}/cv?${params.toString()}`, "_blank", "noopener,noreferrer");
    setStatus("interview", "Opening uploaded CV...", "ok");
  }

  async function removeApplicant(applicantId) {
    if (!window.confirm("Remove this applicant from the intake inbox?")) return;
    await api(`/company/applicants?id=${encodeURIComponent(applicantId)}`, token, "DELETE");
    await loadWorkspace();
    setStatus("applicants", "Applicant removed.", "ok");
  }

  async function saveApplicantAssignment({ recruiterId, jdTitle }) {
    await api("/company/applicants/assign", token, "POST", { id: assignApplicantId, assignedToUserId: recruiterId, jdTitle });
    setAssignApplicantId("");
    await loadWorkspace();
    setStatus("workspace", "Applicant assigned into recruiter workflow.", "ok");
  }

  function loadApplicantIntoInterview(applicantId) {
    const applicant = (state.applicants || []).find((item) => String(item.id) === String(applicantId));
    if (!applicant) {
      setStatus("applicants", "Applicant not found for draft view.", "error");
      return;
    }
    setInterviewMeta({
      candidateId: String(applicant.id || ""),
      assessmentId: ""
    });
    setInterviewForm({
      candidateName: applicant.candidateName || "",
      phoneNumber: applicant.phone || "",
      emailId: applicant.email || "",
      location: applicant.location || "",
      currentCtc: applicant.currentCtc || "",
      expectedCtc: applicant.expectedCtc || "",
      noticePeriod: applicant.noticePeriod || "",
      offerInHand: applicant.offerInHand || "",
      lwdOrDoj: applicant.lwdOrDoj || "",
      currentCompany: applicant.currentCompany || "",
      currentDesignation: applicant.currentDesignation || "",
      totalExperience: applicant.totalExperience || "",
      currentOrgTenure: applicant.currentOrgTenure || "",
      reasonForChange: applicant.reasonForChange || "",
      clientName: applicant.clientName || "",
      jdTitle: applicant.jdTitle || "",
      pipelineStage: "Submitted",
      candidateStatus: applicant.parseStatus || "Applied",
      followUpAt: "",
      interviewAt: "",
      recruiterNotes: "",
      callbackNotes: applicant.screeningAnswers || "",
      otherPointers: "",
      jdScreeningAnswers: {},
      cvAnalysis: null,
      cvAnalysisApplied: false
    });
    navigate("/interview");
    setStatus("interview", `Loaded ${applicant.candidateName || "applicant"} into Interview Panel.`, "ok");
  }

  async function saveCapturedAssignment({ recruiterId, jdTitle }) {
    const recruiter = (state.users || []).find((user) => String(user.id) === String(recruiterId));
    await patchCandidate(assignCandidateId, {
      assigned_to_user_id: recruiterId,
      assigned_to_name: recruiter?.name || "",
      jd_title: jdTitle
    }, "Draft assigned to recruiter.");
    setAssignCandidateId("");
  }

  async function patchCandidate(candidateId, patch, okMessage) {
    await api(`/company/candidates/${encodeURIComponent(candidateId)}`, token, "PATCH", { patch });
    await loadWorkspace();
    setStatus("captured", okMessage, "ok");
  }

  async function patchCandidateQuiet(candidateId, patch) {
    await api(`/company/candidates/${encodeURIComponent(candidateId)}`, token, "PATCH", { patch });
    await loadWorkspace();
  }

  async function hideCapturedCandidate(candidateId) {
    await patchCandidate(candidateId, { hidden_from_captured: true }, "Candidate hidden from captured notes.");
  }

  async function parseQuickUpdateRecruiterNote() {
    if (!quickUpdateCandidate) {
      setStatus("quickUpdate", "Select an existing candidate first.", "error");
      return;
    }
    const effectiveRawRecruiterNote = buildStructuredRecruiterRawNote(quickUpdateRecruiterSections, "");
    if (!String(effectiveRawRecruiterNote || "").trim()) {
      setStatus("quickUpdate", "Type the recruiter update note first.", "error");
      return;
    }
    setStatus("quickUpdate", "Parsing recruiter update...");
    try {
      const parsed = await api("/parse-note", token, "POST", {
        note: effectiveRawRecruiterNote,
        source: "portal_manual",
        client_name: quickUpdateCandidate?.client_name || "",
        jd_title: quickUpdateCandidate?.jd_title || "",
        preview: true
      });
      const structuredOverrides = buildStructuredRecruiterSectionOverrides(quickUpdateRecruiterSections);
      const merge = buildRecruiterMerge(quickUpdateCandidate, { ...(parsed || {}), ...structuredOverrides }, effectiveRawRecruiterNote);
      const mergedWithStructuredPriority = {
        ...(merge.merged || {}),
        ...structuredOverrides
      };
      setQuickUpdateMergedPatch({ ...merge, merged: mergedWithStructuredPriority });
      setQuickUpdateParsedSummary(mergedWithStructuredPriority || null);
      setQuickUpdateConflicts(merge.overwritten || []);
      setStatus(
        "quickUpdate",
        merge.overwritten?.length
          ? `Parsed update. Conflicts found in ${merge.overwritten.map((entry) => formatRecruiterOverwriteLabel(entry.key)).join(", ")}.`
          : "Parsed recruiter update. Review and apply.",
        "ok"
      );
    } catch (error) {
      setStatus("quickUpdate", String(error?.message || error), "error");
    }
  }

  async function applyQuickUpdateRecruiterNote() {
    if (!quickUpdateCandidate) {
      setStatus("quickUpdate", "Select an existing candidate first.", "error");
      return;
    }
    const effectiveRawRecruiterNote = buildStructuredRecruiterRawNote(quickUpdateRecruiterSections, "");
    const mergeForSave = quickUpdateMergedPatch || buildRecruiterMerge(quickUpdateCandidate, buildStructuredRecruiterSectionOverrides(quickUpdateRecruiterSections), effectiveRawRecruiterNote);
    if (mergeForSave.overwritten?.length) {
      const message = mergeForSave.overwritten.map((entry) => `${formatRecruiterOverwriteLabel(entry.key)}: "${entry.from}" -> "${entry.to}"`).join("\n");
      const confirmed = window.confirm(`These fields will be overwritten:\n\n${message}\n\nApply recruiter note update?`);
      if (!confirmed) return;
    }
    try {
      const extractedFieldPatch = buildRecruiterFieldPatchFromMerge(mergeForSave);
      const parsedSkills = String(quickUpdateRecruiterSections.tags || "")
        .split(/\r?\n|,|\||;/)
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      const canonicalRecruiterNotes = buildCanonicalRecruiterNotes(
        quickUpdateCandidate?.recruiter_context_notes || "",
        effectiveRawRecruiterNote,
        mergeForSave?.merged || normalizeRecruiterMergeBase(quickUpdateCandidate)
      );
      await patchCandidateQuiet(quickUpdateCandidate.id, {
        recruiter_context_notes: canonicalRecruiterNotes,
        other_pointers: normalizeOtherPointersBody(quickUpdateText),
        skills: parsedSkills,
        ...extractedFieldPatch
      });
      setQuickUpdateMergedPatch(null);
      setQuickUpdateConflicts([]);
      setQuickUpdateParsedSummary(null);
      setQuickUpdateText("");
      setStatus("quickUpdate", "Recruiter note merged into existing candidate.", "ok");
    } catch (error) {
      setStatus("quickUpdate", String(error?.message || error), "error");
    }
  }

  async function applyQuickUpdateAssessmentDetails() {
    if (!quickUpdateCandidate || !quickUpdateLinkedAssessment) {
      setStatus("quickUpdate", "This candidate does not have a linked assessment yet.", "error");
      return;
    }
    const mergeForSave = quickUpdateMergedPatch;
    if (!mergeForSave) {
      setStatus("quickUpdate", "Parse recruiter note first, then apply assessment details.", "error");
      return;
    }
    if (mergeForSave.overwritten?.length) {
      const message = mergeForSave.overwritten.map((entry) => `${formatRecruiterOverwriteLabel(entry.key)}: "${entry.from}" -> "${entry.to}"`).join("\n");
      const confirmed = window.confirm(`These fields will be overwritten in candidate + assessment:\n\n${message}\n\nApply assessment detail update?`);
      if (!confirmed) return;
    }
    try {
      const merged = mergeForSave.merged || normalizeRecruiterMergeBase(quickUpdateCandidate);
      const effectiveRawRecruiterNote = buildStructuredRecruiterRawNote(quickUpdateRecruiterSections, "");
      const extractedFieldPatch = buildRecruiterFieldPatchFromMerge(mergeForSave);
      const parsedSkills = String(quickUpdateRecruiterSections.tags || "")
        .split(/\r?\n|,|\||;/)
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      const canonicalRecruiterNotes = buildCanonicalRecruiterNotes(
        quickUpdateCandidate?.recruiter_context_notes || "",
        effectiveRawRecruiterNote,
        merged
      );
      await patchCandidateQuiet(quickUpdateCandidate.id, {
        recruiter_context_notes: canonicalRecruiterNotes,
        other_pointers: normalizeOtherPointersBody(quickUpdateText),
        skills: parsedSkills,
        ...extractedFieldPatch
      });
      const nextAssessment = {
        ...quickUpdateLinkedAssessment,
        candidateName: merged.name || quickUpdateLinkedAssessment.candidateName || quickUpdateCandidate.name || "",
        phoneNumber: merged.phone || quickUpdateLinkedAssessment.phoneNumber || quickUpdateCandidate.phone || "",
        emailId: merged.email || quickUpdateLinkedAssessment.emailId || quickUpdateCandidate.email || "",
        location: merged.location || quickUpdateLinkedAssessment.location || quickUpdateCandidate.location || "",
        currentCtc: merged.current_ctc || quickUpdateLinkedAssessment.currentCtc || quickUpdateCandidate.current_ctc || "",
        expectedCtc: merged.expected_ctc || quickUpdateLinkedAssessment.expectedCtc || quickUpdateCandidate.expected_ctc || "",
        noticePeriod: merged.notice_period || quickUpdateLinkedAssessment.noticePeriod || quickUpdateCandidate.notice_period || "",
        offerInHand: merged.offer_in_hand || quickUpdateLinkedAssessment.offerInHand || "",
        lwdOrDoj: merged.lwd_or_doj || quickUpdateLinkedAssessment.lwdOrDoj || quickUpdateCandidate.lwd_or_doj || "",
        currentCompany: merged.company || quickUpdateLinkedAssessment.currentCompany || quickUpdateCandidate.company || "",
        currentDesignation: merged.role || quickUpdateLinkedAssessment.currentDesignation || quickUpdateCandidate.role || "",
        totalExperience: merged.experience || quickUpdateLinkedAssessment.totalExperience || quickUpdateCandidate.experience || "",
        highestEducation: merged.highest_education || quickUpdateLinkedAssessment.highestEducation || quickUpdateCandidate.highest_education || "",
        skills: parsedSkills,
        recruiterNotes: canonicalRecruiterNotes,
        otherPointers: normalizeOtherPointersBody(quickUpdateText),
        updatedAt: new Date().toISOString()
      };
      await api("/company/assessments", token, "POST", { assessment: nextAssessment });
      await loadWorkspace();
      setQuickUpdateMergedPatch(null);
      setQuickUpdateConflicts([]);
      setQuickUpdateParsedSummary(null);
      setQuickUpdateText("");
      setStatus("quickUpdate", "Assessment details synced with recruiter note update.", "ok");
    } catch (error) {
      setStatus("quickUpdate", String(error?.message || error), "error");
    }
  }

  async function applyQuickCandidateUpdate() {
    if (!quickUpdateCandidate) {
      setStatus("quickUpdate", "Select an existing candidate first.", "error");
      return;
    }
    const finalLine = extractLastMeaningfulLine(quickUpdateStatusText);
    if (!finalLine) {
      setStatus("quickUpdate", "Type the quick update note first.", "error");
      return;
    }
    const inferred = inferAttemptOutcomeAndFollowUp(finalLine);
    if (!inferred?.outcome) {
      setStatus("quickUpdate", "Could not understand the update from the last line.", "error");
      return;
    }
    try {
      await api("/contact-attempts", token, "POST", {
        candidateId: quickUpdateCandidate.id,
        outcome: inferred.outcome,
        notes: finalLine,
        next_follow_up_at: inferred.followUpAt || ""
      });
      const candidatePatch = {
        last_contact_outcome: inferred.outcome || "",
        last_contact_notes: finalLine,
        last_contact_at: new Date().toISOString()
      };
      if (inferred.followUpAt) {
        candidatePatch.next_follow_up_at = new Date(inferred.followUpAt).toISOString();
      } else if (inferred.outcome !== "Call later" && inferred.outcome !== "Switch Off") {
        candidatePatch.next_follow_up_at = "";
      }
      await patchCandidateQuiet(quickUpdateCandidate.id, candidatePatch);
      setQuickUpdateStatusText("");
      setStatus("quickUpdate", `Quick update applied for ${quickUpdateCandidate.name || "candidate"}.`, "ok");
    } catch (error) {
      setStatus("quickUpdate", String(error?.message || error), "error");
    }
  }

  async function applyQuickAssessmentStatusUpdate() {
    if (!quickUpdateLinkedAssessment) {
      setStatus("quickUpdate", "This candidate does not have a linked assessment yet.", "error");
      return;
    }
    const lastLine = extractLastMeaningfulLine(quickUpdateStatusText);
    if (!lastLine) {
      setStatus("quickUpdate", "Type the status note first.", "error");
      return;
    }
    const inferred = inferAssessmentStatusAndSchedule(lastLine);
    if (!inferred?.candidateStatus) {
      setStatus("quickUpdate", "Could not map assessment status from the last line.", "error");
      return;
    }
    try {
      await saveAssessmentStatusUpdate(quickUpdateLinkedAssessment, {
        candidateStatus: inferred.candidateStatus,
        atValue: inferred.atValue || "",
        notes: lastLine,
        offerAmount: inferred.offerAmount || "",
        expectedDoj: inferred.expectedDoj || "",
        dateOfJoining: inferred.dateOfJoining || ""
      });
      setQuickUpdateStatusText("");
      setStatus("quickUpdate", `Assessment status updated to ${inferred.candidateStatus}.`, "ok");
    } catch (error) {
      setStatus("quickUpdate", String(error?.message || error), "error");
    }
  }

  async function createManualDraft() {
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const assignedRecruiter = isAdmin
      ? (state.users || []).find((user) => String(user.id) === String(newDraftForm.assigned_to_user_id))
      : state.user;
    const parsedSkills = String(newDraftForm.tags || "")
      .split(/\r?\n|,|\||;/)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const payload = {
      ...newDraftForm,
      source: "manual_draft",
      recruiter_context_notes: "",
      other_pointers: "",
      hidden_from_captured: false,
      skills: parsedSkills,
      linkedin: newDraftForm.linkedin || "",
      assigned_to_user_id: assignedRecruiter?.id || "",
      assigned_to_name: assignedRecruiter?.name || ""
    };
    await api("/candidates", token, "POST", { candidate: payload });
    await loadWorkspace();
    setNewDraftOpen(false);
    setNewDraftForm({
      assigned_to_user_id: "",
      name: "",
      phone: "",
      email: "",
      linkedin: "",
      company: "",
      location: "",
      jd_title: "",
      client_name: "",
      tags: "",
      notes: ""
    });
    setStatus("captured", "Manual draft created.", "ok");
  }

  async function completeAgendaFollowUp(candidate) {
    await patchCandidate(candidate.id, {
      next_follow_up_at: ""
    }, "Follow-up marked done.");
    setStatus("workspace", `Marked follow-up done for ${candidate?.name || "candidate"}.`, "ok");
  }

  async function openAttempts(candidateId) {
    setAttemptsCandidateId(candidateId);
    const result = await api(`/contact-attempts?candidate_id=${encodeURIComponent(candidateId)}&limit=20`, token).catch(() => []);
    setAttempts(Array.isArray(result) ? result : []);
  }

  async function refreshAttempts() {
    if (!attemptsCandidateId) return;
    const result = await api(`/contact-attempts?candidate_id=${encodeURIComponent(attemptsCandidateId)}&limit=20`, token).catch(() => []);
    setAttempts(Array.isArray(result) ? result : []);
    await loadWorkspace();
  }

  async function saveAttempt(patch) {
    const finalLine = String(patch.final_line || extractLastMeaningfulLine(patch.notes || "")).trim();
    await api("/contact-attempts", token, "POST", {
      candidateId: attemptsCandidateId,
      outcome: patch.outcome,
      notes: finalLine || String(patch.notes || "").trim(),
      next_follow_up_at: patch.next_follow_up_at
    });
    const candidatePatch = {
      last_contact_outcome: patch.outcome || "",
      last_contact_notes: finalLine || String(patch.notes || "").trim(),
      last_contact_at: new Date().toISOString()
    };
    if (patch.next_follow_up_at) {
      candidatePatch.next_follow_up_at = new Date(patch.next_follow_up_at).toISOString();
    } else if (patch.outcome && patch.outcome !== "Call later" && patch.outcome !== "Switch Off") {
      candidatePatch.next_follow_up_at = "";
    }
    if (Object.keys(candidatePatch).length) {
      await patchCandidate(attemptsCandidateId, candidatePatch, "Attempt logged.");
    } else {
      await loadWorkspace();
      setStatus("captured", "Attempt logged.", "ok");
    }
    setStatus("captured", "Attempt logged.", "ok");
  }

  function loadCandidateIntoInterview(candidateId) {
    const candidate = (state.candidates || []).find((item) => String(item.id) === String(candidateId));
    if (!candidate) {
      setStatus("captured", "Candidate not found for interview panel.", "error");
      return;
    }
    const matched = (state.assessments || []).find((item) =>
      String(item.candidateName || "").trim().toLowerCase() === String(candidate.name || "").trim().toLowerCase()
    );
    setInterviewMeta({
      candidateId: String(candidate.id || ""),
      assessmentId: String(matched?.id || "")
    });
    const parsedRecruiterBase = normalizeRecruiterMergeBase(candidate);
    const cvMeta = decodePortalApplicantMetadata(candidate);
    const candidateCvAnalysis = cvMeta?.cvAnalysisCache?.result
      ? buildInterviewCvAnalysis({
          currentCompany: matched?.currentCompany || candidate?.company || "",
          currentDesignation: matched?.currentDesignation || candidate?.role || "",
          totalExperience: matched?.totalExperience || candidate?.experience || "",
          currentOrgTenure: matched?.currentOrgTenure || candidate?.current_org_tenure || ""
        }, cvMeta.cvAnalysisCache.result, cvMeta.cvAnalysisCache.storedFile || null)
      : null;
    setInterviewForm({
      candidateName: matched?.candidateName || candidate?.name || "",
      phoneNumber: matched?.phoneNumber || candidate?.phone || "",
      emailId: matched?.emailId || candidate?.email || "",
      location: matched?.location || candidate?.location || "",
      currentCtc: matched?.currentCtc || candidate?.current_ctc || "",
      expectedCtc: matched?.expectedCtc || candidate?.expected_ctc || "",
      noticePeriod: matched?.noticePeriod || candidate?.notice_period || parsedRecruiterBase.notice_period || "",
      offerInHand: matched?.offerInHand || parsedRecruiterBase.offer_in_hand || "",
      lwdOrDoj: matched?.lwdOrDoj || candidate?.lwd_or_doj || parsedRecruiterBase.lwd_or_doj || "",
      currentCompany: matched?.currentCompany || candidate?.company || "",
      currentDesignation: matched?.currentDesignation || candidate?.role || "",
      totalExperience: matched?.totalExperience || candidate?.experience || "",
      currentOrgTenure: matched?.currentOrgTenure || candidate?.current_org_tenure || "",
      reasonForChange: matched?.reasonForChange || "",
      clientName: matched?.clientName || candidate?.client_name || "",
      jdTitle: matched?.jdTitle || candidate?.jd_title || "",
      pipelineStage: matched?.pipelineStage || candidate?.pipeline_stage || "Under Interview Process",
      candidateStatus: matched?.candidateStatus || candidate?.candidate_status || "Screening in progress",
      followUpAt: toDateInputValue(matched?.followUpAt || candidate?.next_follow_up_at),
      interviewAt: toDateInputValue(matched?.interviewAt),
      recruiterNotes: matched?.recruiterNotes || candidate?.recruiter_context_notes || "",
      callbackNotes: candidate?.notes || "",
      otherPointers: matched?.otherPointers || candidate?.other_pointers || "",
      jdScreeningAnswers: matched?.jdScreeningAnswers || {},
      cvAnalysis: matched?.cvAnalysis || candidateCvAnalysis || null,
      cvAnalysisApplied: Boolean(matched?.cvAnalysisApplied),
      statusHistory: Array.isArray(matched?.statusHistory) ? matched.statusHistory : []
    });
    navigate("/interview");
    setStatus("interview", `Loaded ${candidate.name || "candidate"} into Interview Panel.`, "ok");
  }

  function openSavedAssessment(assessment) {
    const matchedCandidate = (state.candidates || []).find((item) => {
      if (assessment?.candidateId && String(item.id) === String(assessment.candidateId)) return true;
      return String(item.name || "").trim().toLowerCase() === String(assessment?.candidateName || "").trim().toLowerCase();
    });
    setInterviewMeta({
      candidateId: String(matchedCandidate?.id || assessment?.candidateId || ""),
      assessmentId: String(assessment?.id || "")
    });
    const parsedRecruiterBase = normalizeRecruiterMergeBase(matchedCandidate || assessment || {});
    const cvMeta = decodePortalApplicantMetadata(matchedCandidate || {});
    const candidateCvAnalysis = cvMeta?.cvAnalysisCache?.result
      ? buildInterviewCvAnalysis({
          currentCompany: assessment?.currentCompany || matchedCandidate?.company || "",
          currentDesignation: assessment?.currentDesignation || matchedCandidate?.role || "",
          totalExperience: assessment?.totalExperience || matchedCandidate?.experience || "",
          currentOrgTenure: assessment?.currentOrgTenure || matchedCandidate?.current_org_tenure || ""
        }, cvMeta.cvAnalysisCache.result, cvMeta.cvAnalysisCache.storedFile || null)
      : null;
    setInterviewForm({
      candidateName: assessment?.candidateName || "",
      phoneNumber: assessment?.phoneNumber || matchedCandidate?.phone || "",
      emailId: assessment?.emailId || matchedCandidate?.email || "",
      location: assessment?.location || matchedCandidate?.location || "",
      currentCtc: assessment?.currentCtc || matchedCandidate?.current_ctc || "",
      expectedCtc: assessment?.expectedCtc || matchedCandidate?.expected_ctc || "",
      noticePeriod: assessment?.noticePeriod || matchedCandidate?.notice_period || parsedRecruiterBase.notice_period || "",
      offerInHand: assessment?.offerInHand || parsedRecruiterBase.offer_in_hand || "",
      lwdOrDoj: assessment?.lwdOrDoj || matchedCandidate?.lwd_or_doj || parsedRecruiterBase.lwd_or_doj || "",
      currentCompany: assessment?.currentCompany || matchedCandidate?.company || "",
      currentDesignation: assessment?.currentDesignation || matchedCandidate?.role || "",
      totalExperience: assessment?.totalExperience || matchedCandidate?.experience || "",
      currentOrgTenure: assessment?.currentOrgTenure || matchedCandidate?.current_org_tenure || "",
      reasonForChange: assessment?.reasonForChange || "",
      clientName: assessment?.clientName || matchedCandidate?.client_name || "",
      jdTitle: assessment?.jdTitle || matchedCandidate?.jd_title || "",
      pipelineStage: assessment?.pipelineStage || "Under Interview Process",
      candidateStatus: assessment?.candidateStatus || "Screening in progress",
      followUpAt: toDateInputValue(assessment?.followUpAt),
      interviewAt: toDateInputValue(assessment?.interviewAt),
      recruiterNotes: assessment?.recruiterNotes || matchedCandidate?.recruiter_context_notes || "",
      callbackNotes: matchedCandidate?.notes || "",
      otherPointers: assessment?.otherPointers || matchedCandidate?.other_pointers || "",
      jdScreeningAnswers: assessment?.jdScreeningAnswers || {},
      cvAnalysis: assessment?.cvAnalysis || candidateCvAnalysis || null,
      cvAnalysisApplied: Boolean(assessment?.cvAnalysisApplied),
      statusHistory: Array.isArray(assessment?.statusHistory) ? assessment.statusHistory : []
    });
    navigate("/interview");
    setStatus("interview", `Opened saved assessment for ${assessment?.candidateName || "candidate"}.`, "ok");
  }

  async function createAssessmentFromCandidate(candidateId) {
    const candidate = (state.candidates || []).find((item) => String(item.id) === String(candidateId));
    if (!candidate) {
      setStatus("captured", "Candidate not found for assessment conversion.", "error");
      return;
    }
    const matched = (state.assessments || []).find((item) =>
      String(item.candidateId || "") === String(candidate.id || "") ||
      String(item.candidateName || "").trim().toLowerCase() === String(candidate.name || "").trim().toLowerCase()
    );
    if (matched) {
      openSavedAssessment(matched);
      return;
    }

    const cvMeta = decodePortalApplicantMetadata(candidate);
    const candidateCvAnalysis = cvMeta?.cvAnalysisCache?.result
      ? buildInterviewCvAnalysis({
          currentCompany: candidate.company || "",
          currentDesignation: candidate.role || "",
          totalExperience: candidate.experience || "",
          currentOrgTenure: candidate.current_org_tenure || ""
        }, cvMeta.cvAnalysisCache.result, cvMeta.cvAnalysisCache.storedFile || null)
      : null;
    const assessment = {
      id: `assessment-${Date.now()}`,
      candidateId: String(candidate.id || ""),
      candidateName: candidate.name || "",
      phoneNumber: candidate.phone || "",
      emailId: candidate.email || "",
      location: candidate.location || "",
      currentCtc: candidate.current_ctc || "",
      expectedCtc: candidate.expected_ctc || "",
      noticePeriod: candidate.notice_period || "",
      offerInHand: candidate.offer_in_hand || "",
      lwdOrDoj: candidate.lwd_or_doj || "",
      currentCompany: candidate.company || "",
      currentDesignation: candidate.role || "",
      totalExperience: candidate.experience || "",
      currentOrgTenure: candidate.current_org_tenure || "",
      reasonForChange: candidate.reason_of_change || "",
      clientName: candidate.client_name || "",
      jdTitle: candidate.jd_title || "",
      pipelineStage: "Submitted",
      candidateStatus: "CV Shared",
      followUpAt: "",
      interviewAt: "",
      recruiterNotes: candidate.recruiter_context_notes || "",
      callbackNotes: candidate.notes || "",
      otherPointers: candidate.other_pointers || "",
      jdScreeningAnswers: {},
      cvAnalysis: candidateCvAnalysis,
      cvAnalysisApplied: false,
      statusHistory: [{
        status: "CV Shared",
        at: new Date().toISOString(),
        notes: "Draft converted into assessment.",
        atLabel: ""
      }],
      questionMode: "basic",
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setStatus("captured", "Converting draft into assessment...");
    const savedAssessment = await api("/company/assessments", token, "POST", { assessment });
    await api("/candidates/link-assessment", token, "POST", {
      id: candidate.id,
      assessmentId: savedAssessment?.id || assessment.id
    }).catch(() => null);
    await loadWorkspace();
    navigate("/assessments");
    setStatus("assessments", `Converted ${candidate.name || "candidate"} into assessment.`, "ok");
  }

  async function saveAssessment() {
    const normalizedInitialStatus = String(interviewForm.candidateStatus || "").trim().toLowerCase();
    const initialStatus = !normalizedInitialStatus || normalizedInitialStatus === "screening in progress"
      ? "CV Shared"
      : interviewForm.candidateStatus;
    const assessment = {
      id: interviewMeta.assessmentId || `assessment-${Date.now()}`,
      ...interviewForm,
      candidateStatus: initialStatus,
      pipelineStage: mapAssessmentStatusToPipelineStage(initialStatus) || interviewForm.pipelineStage || "Submitted",
      statusHistory: Array.isArray(interviewForm.statusHistory) && interviewForm.statusHistory.length
        ? interviewForm.statusHistory
        : [{
            status: initialStatus,
            at: new Date().toISOString(),
            notes: "Assessment created.",
            atLabel: ""
          }],
      questionMode: "basic",
      generatedAt: new Date().toISOString()
    };
    setStatus("interview", "Saving assessment...");
    const savedAssessment = await api("/company/assessments", token, "POST", { assessment });
    if (interviewMeta.candidateId) {
      await api("/candidates/link-assessment", token, "POST", {
        id: interviewMeta.candidateId,
        assessmentId: savedAssessment?.id || assessment.id
      }).catch(() => null);
      await patchCandidateQuiet(interviewMeta.candidateId, {
        name: interviewForm.candidateName,
        phone: interviewForm.phoneNumber,
        email: interviewForm.emailId,
        location: interviewForm.location,
        company: interviewForm.currentCompany,
        role: interviewForm.currentDesignation,
        experience: interviewForm.totalExperience,
        current_ctc: interviewForm.currentCtc,
        expected_ctc: interviewForm.expectedCtc,
        notice_period: interviewForm.noticePeriod,
        recruiter_context_notes: interviewForm.recruiterNotes,
        other_pointers: interviewForm.otherPointers,
        lwd_or_doj: interviewForm.lwdOrDoj,
        jd_title: interviewForm.jdTitle,
        client_name: interviewForm.clientName,
        next_follow_up_at: interviewForm.followUpAt
      });
      setStatus("interview", "Assessment saved and candidate details updated.", "ok");
    } else {
      await loadWorkspace();
      setStatus("interview", "Assessment saved.", "ok");
    }
  }

  async function parseInterviewCvFile(file) {
    if (!file) return;
    setStatus("interview", "Uploading CV for analysis...");
    try {
      const fileData = await fileToBase64(file);
      const payload = {
        candidateName: interviewForm.candidateName,
        emailId: interviewForm.emailId,
        phoneNumber: interviewForm.phoneNumber,
        totalExperience: interviewForm.totalExperience,
        normalizeWithAi: true,
        file: {
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          fileData
        }
      };
      const parsed = interviewMeta.candidateId
        ? await api(`/company/candidates/${encodeURIComponent(interviewMeta.candidateId)}/interview-cv`, token, "POST", payload)
        : await api("/parse-candidate", token, "POST", {
            sourceType: "cv",
            ...payload
          });
      const result = parsed?.result || parsed || {};
      setInterviewForm((current) => ({
        ...current,
        cvAnalysis: buildInterviewCvAnalysis(current, result, result.storedFile || current.cvAnalysis?.storedFile || null),
        cvAnalysisApplied: false
      }));
      setStatus(
        "interview",
        result.cached
          ? "Loaded cached CV data from the stored upload."
          : interviewMeta.candidateId
            ? "CV uploaded to storage and parsed. Parsed data is saved for search and later sharing."
            : "CV parsed and saved in hidden metadata for later search use.",
        "ok"
      );
    } catch (error) {
      setStatus("interview", String(error?.message || error), "error");
    }
  }

  function handleInterviewCvSelection(event) {
    const file = event?.target?.files?.[0] || null;
    if (!file) {
      setStatus("interview", "No CV selected.", "error");
      return;
    }
    void parseInterviewCvFile(file);
    event.target.value = "";
  }

  function applyCvAnalysisToDraft() {
    const analysis = interviewForm.cvAnalysis;
    if (!analysis) {
      setStatus("interview", "No CV analysis available yet.", "error");
      return;
    }
    setInterviewForm((current) => ({
      ...current,
      totalExperience: analysis.exactTotalExperience || current.totalExperience,
      currentCompany: analysis.currentCompany || current.currentCompany,
      currentDesignation: analysis.currentDesignation || current.currentDesignation,
      currentOrgTenure: analysis.currentOrgTenure || current.currentOrgTenure,
      cvAnalysisApplied: true
    }));
    setStatus("interview", "Applied CV analysis values to draft.", "ok");
  }

  async function rotateSecret() {
    setStatus("intake", "Rotating secret...");
    await api("/company/applicant-intake-secret", token, "POST", {});
    await loadWorkspace();
    setStatus("intake", "Applicant intake secret rotated.", "ok");
  }

  function loadJobIntoDraft(jobId) {
    const job = (state.jobs || []).find((item) => String(item.id) === String(jobId));
    if (!job) {
      setSelectedJobId("");
      setJobDraft({
        id: "",
        title: "",
        clientName: "",
        ownerRecruiterId: "",
        ownerRecruiterName: "",
        jobDescription: "",
        mustHaveSkills: "",
        redFlags: "",
        recruiterNotes: "",
        standardQuestions: "",
        jdShortcuts: ""
      });
      return;
    }
    setSelectedJobId(String(job.id || ""));
    setJobDraft({
      id: String(job.id || ""),
      title: String(job.title || ""),
      clientName: String(job.clientName || ""),
      ownerRecruiterId: String(job.ownerRecruiterId || ""),
      ownerRecruiterName: String(job.ownerRecruiterName || ""),
      jobDescription: String(job.jobDescription || ""),
      mustHaveSkills: String(job.mustHaveSkills || ""),
      redFlags: String(job.redFlags || ""),
      recruiterNotes: String(job.recruiterNotes || ""),
      standardQuestions: String(job.standardQuestions || ""),
      jdShortcuts: String(job.jdShortcuts || "")
    });
    setJobShortcutKey("");
    setJobShortcutValue("");
  }

  async function saveJobDraft() {
    setStatus("jobs", "Saving JD...");
    const result = await api("/company/jds", token, "POST", { job: jobDraft });
    await loadWorkspace();
    setSelectedJobId(String(result?.id || jobDraft.id || ""));
    setStatus("jobs", "JD saved.", "ok");
  }

  function downloadJobDraft() {
    const blob = new Blob([jobDraft.jobDescription || ""], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(jobDraft.title || "jd").replace(/[^\w\-]+/g, "-")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function applySelectedJobToInterview() {
    setInterviewForm((current) => ({
      ...current,
      jdTitle: jobDraft.title || current.jdTitle,
      clientName: jobDraft.clientName || current.clientName
    }));
    navigate("/interview");
    setStatus("interview", `Applied JD setup for ${jobDraft.title || "selected role"} into Interview Panel.`, "ok");
  }

  function generateJdFromText() {
    const text = String(jobDraft.jobDescription || "").trim();
    if (!text) {
      setStatus("jobs", "Paste role text first.", "error");
      return;
    }
    const lines = text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const title = jobDraft.title || lines[0] || "";
    const skills = (text.match(/\b(Java|Python|React|Node|Sales|Recruitment|HR|SQL|Excel|Flutter|Real Estate)\b/gi) || [])
      .filter((value, index, array) => array.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
      .join(", ");
    setJobDraft((current) => ({
      ...current,
      title,
      mustHaveSkills: current.mustHaveSkills || skills,
      recruiterNotes: current.recruiterNotes || `Generated from text on ${new Date().toLocaleString()}`
    }));
    setStatus("jobs", "Generated JD fields from text.", "ok");
  }

  async function handleJdUpload(file) {
    if (!file) return;
    const text = await file.text();
    setJobDraft((current) => ({
      ...current,
      jobDescription: text,
      title: current.title || String(file.name || "").replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")
    }));
    setStatus("jobs", "JD text uploaded into editor.", "ok");
  }

  function saveShortcutDraft() {
    const key = normalizeShortcutKey(jobShortcutKey);
    const value = String(jobShortcutValue || "").trim();
    if (!key || !value) {
      setStatus("jobs", "Add both shortcut key and template.", "error");
      return;
    }
    const parsed = parseShortcutMap(jobDraft.jdShortcuts);
    parsed[key] = value;
    setJobDraft((current) => ({ ...current, jdShortcuts: stringifyShortcutMap(parsed) }));
    setJobShortcutKey("");
    setJobShortcutValue("");
    setStatus("jobs", `Saved shortcut ${key}.`, "ok");
  }

  function editShortcutDraft(key) {
    const parsed = parseShortcutMap(jobDraft.jdShortcuts);
    setJobShortcutKey(key);
    setJobShortcutValue(String(parsed[key] || ""));
  }

  function applyDashboardQuickRange(value) {
    const today = new Date();
    const toDate = today.toISOString().slice(0, 10);
    let dateFrom = "";
    if (value === "last_7_days") {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      dateFrom = from.toISOString().slice(0, 10);
    } else if (value === "this_month") {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      dateFrom = from.toISOString().slice(0, 10);
    }
    setDashboardFilters((current) => ({ ...current, quickRange: value, dateFrom, dateTo: value === "all" ? "" : toDate }));
  }

  async function applyDashboardFilters() {
    setStatus("workspace", "Refreshing dashboard...");
    await loadDashboardSummary(dashboardFilters);
    setStatus("workspace", "Dashboard refreshed.", "ok");
  }

  async function openDashboardDrilldown({ title, metric, groupType, params = {} }) {
    const query = new URLSearchParams({
      metric,
      groupType,
      dateFrom: dashboardFilters.dateFrom || "",
      dateTo: dashboardFilters.dateTo || "",
      clientFilter: dashboardFilters.clientLabel || "",
      recruiterFilter: dashboardFilters.recruiterLabel || "",
      clientLabel: params.clientLabel || "",
      recruiterLabel: params.recruiterLabel || "",
      positionLabel: params.positionLabel || ""
    });
    const result = await api(`/company/dashboard/drilldown?${query.toString()}`, token);
    setDrilldownState({
      open: true,
      title,
      items: result.items || []
    });
  }

  async function runCandidateSearch() {
    if (!candidateSearchText.trim()) {
      setCandidateSearchMode("all");
      setCandidateSearchResults([]);
      setCandidatePage(1);
      setStatus("workspace", "Showing candidates using structured filters.", "ok");
      return;
    }
    const mode = candidateAiQueryMode === "natural" ? "ai" : "boolean";
    const result = await api(`/company/candidates/search-natural?q=${encodeURIComponent(candidateSearchText)}&mode=${encodeURIComponent(mode)}`, token);
    setCandidateSearchResults(result.items || []);
    setCandidateSearchMode("search");
    setCandidatePage(1);
    if (candidateAiQueryMode === "natural" && result.filters) {
      setCandidateStructuredFilters((current) => ({
        ...current,
        minExperience: result.filters.minExperienceYears != null ? String(result.filters.minExperienceYears) : current.minExperience,
        maxExperience: result.filters.maxExperienceYears != null ? String(result.filters.maxExperienceYears) : current.maxExperience,
        location: result.filters.location || (Array.isArray(result.filters.locations) ? result.filters.locations[0] || "" : "") || current.location,
        keySkills: Array.isArray(result.filters.skills) && result.filters.skills.length ? result.filters.skills.join(", ") : current.keySkills,
        currentCompany: result.filters.currentCompany || current.currentCompany,
        client: result.filters.client || current.client,
        maxCurrentCtc: result.filters.maxCurrentCtcLpa != null ? String(result.filters.maxCurrentCtcLpa) : current.maxCurrentCtc,
        maxExpectedCtc: result.filters.maxExpectedCtcLpa != null ? String(result.filters.maxExpectedCtcLpa) : current.maxExpectedCtc,
        qualification: result.filters.qualification || current.qualification,
        maxNoticeDays: result.filters.maxNoticeDays != null ? String(result.filters.maxNoticeDays) : current.maxNoticeDays,
        recruiter: result.filters.recruiterName || current.recruiter,
        gender: result.filters.gender || current.gender
      }));
    }
    setStatus("workspace", `${candidateAiQueryMode === "boolean" ? "Boolean search" : "AI-interpreted search"} returned ${result.items?.length || 0} candidates.`, "ok");
  }

  function buildCapturedCopyRows() {
    return capturedCandidates.map((item) => {
      const matchedAssessment = capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase());
      return {
        ...item,
        outcome: getCapturedOutcome(item, matchedAssessment),
        assessment_status: matchedAssessment?.candidateStatus || "",
        current_company: item.company || item.currentCompany || "",
        current_designation: item.role || item.currentDesignation || "",
        total_experience: item.experience || item.totalExperience || "",
        combined_assessment_insights: buildCombinedAssessmentInsightsForExport({
          ...item,
          notes: matchedAssessment?.recruiterNotes || item.notes || "",
          other_pointers: matchedAssessment?.otherPointers || item.other_pointers || "",
          other_standard_questions: matchedAssessment?.callbackNotes || item.last_contact_notes || ""
        })
      };
    });
  }

  async function copyCapturedExcel() {
    const rows = buildCapturedCopyRows();
    const preset = buildCapturedExcelRows(rows, copySettings.excelPreset, copySettings);
    const lines = [preset.headers.join("\t"), ...preset.rows.map((row) => row.map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))].join("\n");
    await copyText(lines);
    setStatus("captured", "Filtered candidates copied in Excel format.", "ok");
  }

  async function copyCapturedWhatsapp() {
    const rows = buildCapturedCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.whatsappTemplate, { ...item, index: index + 1, follow_up_at: formatDateForCopy(item.next_follow_up_at) })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("captured", "Filtered candidates copied in WhatsApp format.", "ok");
  }

  async function copyCapturedEmail() {
    const rows = buildCapturedCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.emailTemplate, { ...item, index: index + 1, follow_up_at: formatDateForCopy(item.next_follow_up_at) })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("captured", "Filtered candidates copied in email format.", "ok");
  }

  function buildApplicantCopyRows() {
    return visibleApplicants.map((item, index) => ({
      index: index + 1,
      s_no: index + 1,
      name: item.candidateName || "",
      phone: item.phone || "",
      email: item.email || "",
      location: item.location || "",
      company: item.currentCompany || "",
      current_company: item.currentCompany || "",
      role: item.currentDesignation || item.jdTitle || "",
      current_designation: item.currentDesignation || "",
      total_experience: item.totalExperience || "",
      highest_education: item.highestEducation || "",
      current_ctc: item.currentCtc || "",
      expected_ctc: item.expectedCtc || "",
      notice_period: item.noticePeriod || "",
      recruiter_context_notes: item.screeningAnswers || "",
      other_pointers: "",
      notes: item.screeningAnswers || "",
      other_standard_questions: item.screeningAnswers || "",
      combined_assessment_insights: buildCombinedAssessmentInsightsForExport({
        recruiter_context_notes: item.screeningAnswers || "",
        other_pointers: "",
        other_standard_questions: item.screeningAnswers || ""
      }),
      linkedin: item.linkedin || "",
      jd_title: item.jdTitle || "",
      client_name: item.clientName || "",
      outcome: getApplicantOutcome(item),
      assessment_status: getApplicantOutcome(item),
      follow_up_at: ""
    }));
  }

  async function copyApplicantsExcel() {
    const rows = buildApplicantCopyRows();
    const preset = buildCapturedExcelRows(rows, copySettings.excelPreset, copySettings);
    const lines = [preset.headers.join("\t"), ...preset.rows.map((row) => row.map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))].join("\n");
    await copyText(lines);
    setStatus("applicants", "Filtered applied candidates copied in Excel format.", "ok");
  }

  async function copyApplicantsWhatsapp() {
    const rows = buildApplicantCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.whatsappTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("applicants", "Filtered applied candidates copied in WhatsApp format.", "ok");
  }

  async function copyApplicantsEmail() {
    const rows = buildApplicantCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.emailTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("applicants", "Filtered applied candidates copied in email format.", "ok");
  }

  async function copyAssessmentsExcel() {
    const preset = buildCapturedExcelRows(normalizedAssessmentCopyRows, copySettings.excelPreset, copySettings);
    const lines = [preset.headers.join("\t"), ...preset.rows.map((row) => row.map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))].join("\n");
    await copyText(lines);
    setStatus("assessments", "Filtered assessments copied in Excel format.", "ok");
  }

  async function copyAssessmentsWhatsapp() {
    const text = normalizedAssessmentCopyRows.map((item, index) => fillCandidateTemplate(copySettings.whatsappTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("assessments", "Filtered assessments copied in WhatsApp format.", "ok");
  }

  async function copyAssessmentsEmail() {
    const text = normalizedAssessmentCopyRows.map((item, index) => fillCandidateTemplate(copySettings.emailTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("assessments", "Filtered assessments copied in email format.", "ok");
  }

  function buildCandidateUniverseCopyRows() {
    return candidateUniverse.map((item, index) => ({
      index: index + 1,
      s_no: index + 1,
      name: item.name || item.candidateName || "",
      phone: item.phone || item.phoneNumber || "",
      email: item.email || item.emailId || "",
      location: item.location || "",
      company: item.company || item.currentCompany || "",
      current_company: item.company || item.currentCompany || "",
      role: item.role || item.currentDesignation || item.jdTitle || "",
      current_designation: item.role || item.currentDesignation || "",
      total_experience: item.experience || item.totalExperience || "",
      highest_education: item.highest_education || item.highestEducation || "",
      current_ctc: item.current_ctc || item.currentCtc || "",
      expected_ctc: item.expected_ctc || item.expectedCtc || "",
      notice_period: item.notice_period || item.noticePeriod || "",
      recruiter_context_notes: item.recruiter_context_notes || item.recruiterNotes || "",
      other_pointers: item.other_pointers || item.otherPointers || "",
      notes: item.notes || item.callbackNotes || "",
      other_standard_questions: item.notes || item.callbackNotes || "",
      combined_assessment_insights: buildCombinedAssessmentInsightsForExport({
        recruiter_context_notes: item.recruiter_context_notes || item.recruiterNotes || "",
        other_pointers: item.other_pointers || item.otherPointers || "",
        other_standard_questions: item.notes || item.callbackNotes || ""
      }),
      linkedin: item.linkedin || item.linkedinUrl || "",
      jd_title: item.jd_title || item.jdTitle || "",
      client_name: item.client_name || item.clientName || "",
      outcome: item.candidate_status || item.candidateStatus || item.last_contact_outcome || "",
      assessment_status: item.candidate_status || item.candidateStatus || item.last_contact_outcome || "",
      follow_up_at: formatDateForCopy(item.next_follow_up_at || item.followUpAt || item.interviewAt || "")
    }));
  }

  async function copyCandidatesExcel() {
    const rows = buildCandidateUniverseCopyRows();
    const preset = buildCapturedExcelRows(rows, copySettings.excelPreset, copySettings);
    const lines = [preset.headers.join("\t"), ...preset.rows.map((row) => row.map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))].join("\n");
    await copyText(lines);
    setStatus("workspace", "Candidate search results copied in Excel format.", "ok");
  }

  async function copyCandidatesWhatsapp() {
    const rows = buildCandidateUniverseCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.whatsappTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("workspace", "Candidate search results copied in WhatsApp format.", "ok");
  }

  async function copyCandidatesEmail() {
    const rows = buildCandidateUniverseCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.emailTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("workspace", "Candidate search results copied in email format.", "ok");
  }

  function downloadCandidatesExcel() {
    const rows = buildCandidateUniverseCopyRows();
    const preset = buildCapturedExcelRows(rows, copySettings.excelPreset, copySettings);
    const text = [preset.headers.join("\t"), ...preset.rows.map((row) => row.map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))].join("\n");
    const blob = new Blob([text], { type: "text/tab-separated-values;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `candidate-search-${new Date().toISOString().slice(0, 10)}.tsv`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("workspace", "Candidate search results downloaded.", "ok");
  }

  function getClientShareRows() {
    return selectedAssessmentRows;
  }

  function getClientSharePresetColumns() {
    const customPreset = (copySettings.customExportPresets || []).find((preset) => String(preset.id) === String(clientShareDraft.presetId));
    const columnsText = customPreset?.columns
      || copySettings.exportPresetColumns?.[clientShareDraft.presetId]
      || DEFAULT_COPY_SETTINGS.exportPresetColumns?.[clientShareDraft.presetId]
      || "";
    return parsePresetColumns(columnsText);
  }

  function buildClientShareBody() {
    const hrName = String(clientShareDraft.hrName || "").trim();
    const clientLabel = String(clientShareDraft.clientLabel || "").trim();
    const targetRole = String(clientShareDraft.targetRole || "").trim();
    const recruiterName = String(state.user?.name || "Recruiter").trim();
    const companyName = String(state.user?.companyName || state.user?.company_name || "RecruitDesk").trim();
    const roleLine = [targetRole, clientLabel].filter(Boolean).join(" for ");
    const presetColumns = getClientSharePresetColumns();
    const rows = getClientShareRows();
    const profileLines = rows.flatMap((item, index) => {
      const cells = presetColumns.map((column) => `${column.header}: ${getCapturedExportFieldValue({ index: index + 1, ...item }, column.field) || "-"}`);
      const cvLinkText = !item.candidate_id
        ? "Linked candidate not found for this assessment"
        : clientShareCvLinks[item.candidate_id]
          || (clientShareCvLinkState[item.candidate_id] === "missing" ? "CV link not available yet" : "Generating secure CV link...");
      return [
        `${index + 1}. ${item.name || "Candidate"}`,
        ...cells,
        `CV Link: ${cvLinkText}`,
        ""
      ];
    });
    return [
      `Hello ${hrName || "Team"},`,
      "",
      "Greetings !!",
      "",
      `This is ${recruiterName} from ${companyName}.`,
      `PFA the profiles${roleLine ? ` for ${roleLine}` : ""}.`,
      "Kindly review and share your feedback.",
      `${getClientShareRows().length} selected profile(s) are listed below.`,
      "",
      ...profileLines,
      String(clientShareDraft.extraMessage || "").trim()
    ].filter((line, index, array) => line || (index > 0 && array[index - 1] !== "")).join("\n");
  }

  function buildClientShareHtml() {
    const hrName = String(clientShareDraft.hrName || "").trim();
    const clientLabel = String(clientShareDraft.clientLabel || "").trim();
    const targetRole = String(clientShareDraft.targetRole || "").trim();
    const recruiterName = String(state.user?.name || "Recruiter").trim();
    const companyName = String(state.user?.companyName || state.user?.company_name || "RecruitDesk").trim();
    const roleLine = [targetRole, clientLabel].filter(Boolean).join(" for ");
    const rows = getClientShareRows();
    const presetColumns = getClientSharePresetColumns();
    const tableHeaders = presetColumns.map((column) => `<th style="border:1px solid #d8dee8;padding:10px 12px;background:#f6f8fb;text-align:left;font-size:13px;">${escapeHtml(column.header)}</th>`).join("");
    const tableRows = rows.map((item, index) => {
      const cells = presetColumns.map((column) => {
        const value = getCapturedExportFieldValue({ index: index + 1, ...item }, column.field) || "-";
        return `<td style="border:1px solid #d8dee8;padding:10px 12px;vertical-align:top;font-size:13px;line-height:1.45;">${escapeHtml(value).replace(/\n/g, "<br/>")}</td>`;
      }).join("");
      const cvLink = clientShareCvLinks[item.candidate_id];
      const cvCell = cvLink
        ? `<a href="${escapeHtml(cvLink)}" style="color:#0b57d0;text-decoration:none;">Open CV</a>`
        : (!item.candidate_id
          ? "Linked candidate not found"
          : (clientShareCvLinkState[item.candidate_id] === "missing" ? "CV link not available yet" : "Generating secure CV link..."));
      return `<tr>${cells}<td style="border:1px solid #d8dee8;padding:10px 12px;vertical-align:top;font-size:13px;line-height:1.45;">${cvCell}</td></tr>`;
    }).join("");
    const extraMessage = String(clientShareDraft.extraMessage || "").trim();
    return `
      <div style="font-family:Arial, sans-serif;color:#1f2a44;line-height:1.6;">
        <p>Hello ${escapeHtml(hrName || "Team")},</p>
        <p>Greetings !!</p>
        <p>This is ${escapeHtml(recruiterName)} from ${escapeHtml(companyName)}.<br/>
        PFA the profiles${roleLine ? ` for ${escapeHtml(roleLine)}` : ""}.<br/>
        Kindly review and share your feedback.</p>
        <p>${rows.length} selected profile(s) are listed below.</p>
        <table style="border-collapse:collapse;width:100%;margin-top:12px;">
          <thead>
            <tr>${tableHeaders}<th style="border:1px solid #d8dee8;padding:10px 12px;background:#f6f8fb;text-align:left;font-size:13px;">CV Link</th></tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
        ${extraMessage ? `<p style="margin-top:16px;">${escapeHtml(extraMessage).replace(/\n/g, "<br/>")}</p>` : ""}
      </div>
    `.trim();
  }

  async function copyClientShareEmailDraft() {
    if (!getClientShareRows().length) {
      setStatus("clientShare", "Select assessment profiles first from the Assessments tab.", "error");
      return;
    }
    await copyHtmlAndText(buildClientShareHtml(), buildClientShareBody());
    setStatus("clientShare", "Client email draft copied in table format.", "ok");
  }

  function toggleAssessmentSelection(assessmentId) {
    const id = String(assessmentId || "");
    if (!id) return;
    setSelectedAssessmentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function saveSharedCopySettings() {
    if (!isSettingsAdmin) {
      setStatus("settings", "Only admin can save shared settings.", "error");
      return;
    }
    const payload = {
      ...copySettings,
      exportPresetLabels: copySettings.exportPresetLabels || DEFAULT_COPY_SETTINGS.exportPresetLabels,
      customExportPresets: copySettings.customExportPresets || []
    };
    const result = await api("/company/shared-export-presets", token, "POST", { settings: payload });
    setCopySettings((current) => ({ ...current, ...DEFAULT_COPY_SETTINGS, ...result }));
    setStatus("settings", "Shared copy presets saved for all recruiters.", "ok");
  }

  function addCustomPreset() {
    if (!isSettingsAdmin) {
      setStatus("settings", "Only admin can add shared presets.", "error");
      return;
    }
    const label = String(newPresetDraft.label || "").trim();
    const columns = String(newPresetDraft.columns || "").trim();
    if (!label || !columns) {
      setStatus("settings", "Preset label and columns are required.", "error");
      return;
    }
    const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `custom_${Date.now()}`;
    setCopySettings((current) => ({
      ...current,
      customExportPresets: [
        ...((current.customExportPresets || []).filter((item) => String(item.id) !== String(id))),
        { id, label, columns }
      ]
    }));
    setNewPresetDraft({ label: "", columns: "" });
    setStatus("settings", "Custom preset added. Save settings to share it with the team.", "ok");
  }

  function removeCustomPreset(id) {
    if (!isSettingsAdmin) {
      setStatus("settings", "Only admin can remove shared presets.", "error");
      return;
    }
    setCopySettings((current) => ({
      ...current,
      customExportPresets: (current.customExportPresets || []).filter((item) => String(item.id) !== String(id))
    }));
  }

  const selectedCustomPreset = (copySettings.customExportPresets || []).find((preset) => String(preset.id) === String(copySettings.excelPreset));
  const selectedBuiltInPresetId = selectedCustomPreset ? "" : String(copySettings.excelPreset || "");
  const selectedPresetLabel = selectedCustomPreset
    ? selectedCustomPreset.label
    : (copySettings.exportPresetLabels?.[selectedBuiltInPresetId] || DEFAULT_COPY_SETTINGS.exportPresetLabels?.[selectedBuiltInPresetId] || "");
  const selectedPresetColumns = selectedCustomPreset
    ? selectedCustomPreset.columns
    : (copySettings.exportPresetColumns?.[selectedBuiltInPresetId] || DEFAULT_COPY_SETTINGS.exportPresetColumns?.[selectedBuiltInPresetId] || "");

  function updateSelectedPresetLabel(value) {
    if (selectedCustomPreset) {
      setCopySettings((current) => ({
        ...current,
        customExportPresets: (current.customExportPresets || []).map((preset) => String(preset.id) === String(selectedCustomPreset.id) ? { ...preset, label: value } : preset)
      }));
      return;
    }
    if (!selectedBuiltInPresetId) return;
    setCopySettings((current) => ({
      ...current,
      exportPresetLabels: {
        ...(current.exportPresetLabels || {}),
        [selectedBuiltInPresetId]: value
      }
    }));
  }

  function updateSelectedPresetColumns(value) {
    if (selectedCustomPreset) {
      setCopySettings((current) => ({
        ...current,
        customExportPresets: (current.customExportPresets || []).map((preset) => String(preset.id) === String(selectedCustomPreset.id) ? { ...preset, columns: value } : preset)
      }));
      return;
    }
    if (!selectedBuiltInPresetId) return;
    setCopySettings((current) => ({
      ...current,
      exportPresetColumns: {
        ...(current.exportPresetColumns || {}),
        [selectedBuiltInPresetId]: value
      }
    }));
  }

  function deleteShortcutDraft(key) {
    const parsed = parseShortcutMap(jobDraft.jdShortcuts);
    delete parsed[key];
    setJobDraft((current) => ({ ...current, jdShortcuts: stringifyShortcutMap(parsed) }));
    if (normalizeShortcutKey(jobShortcutKey) === key) {
      setJobShortcutKey("");
      setJobShortcutValue("");
    }
    setStatus("jobs", `Removed shortcut ${key}.`, "ok");
  }

  function copyInterviewResult() {
    const text = [
      interviewForm.candidateName,
      interviewForm.jdTitle ? `JD: ${interviewForm.jdTitle}` : "",
      interviewForm.clientName ? `Client: ${interviewForm.clientName}` : "",
      interviewForm.recruiterNotes ? `Recruiter notes: ${interviewForm.recruiterNotes}` : "",
      interviewForm.callbackNotes ? `Callback notes: ${interviewForm.callbackNotes}` : ""
    ].filter(Boolean).join("\n");
    return copyText(text).then(() => setStatus("interview", "Interview result copied.", "ok"));
  }

  function copyInterviewEmail() {
    const text = `Candidate: ${interviewForm.candidateName}\nRole: ${interviewForm.jdTitle}\nLocation: ${interviewForm.location}\nNotes: ${interviewForm.callbackNotes}`;
    return copyText(text).then(() => setStatus("interview", "Email summary copied.", "ok"));
  }

  function copyInterviewWhatsapp() {
    const phone = String(interviewForm.phoneNumber || "").replace(/[^\d]/g, "");
    if (!phone) {
      setStatus("interview", "No phone number available.", "error");
      return;
    }
    window.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer");
  }

  function sendInterviewToSheets() {
    setStatus("interview", "Sent to Sheets wiring will be connected next.", "ok");
  }

  function exportInterviewAll() {
    const text = JSON.stringify(interviewForm, null, 2);
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(interviewForm.candidateName || "interview-draft").replace(/[^\w\-]+/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function buildJourneyText(assessment, contactAttempts = [], candidate = null) {
    const header = [
      assessment?.candidateName || "Candidate",
      assessment?.jdTitle ? `JD: ${assessment.jdTitle}` : "",
      assessment?.candidateStatus ? `Current status: ${assessment.candidateStatus}` : ""
    ].filter(Boolean);
    const timeline = buildAssessmentJourneyEntries(assessment, contactAttempts, candidate)
      .map((item) => `${new Date(item.at).toLocaleString()} | ${item.text}`);
    return [...header, "", "Journey:", ...timeline].filter(Boolean).join("\n");
  }

  async function saveAssessmentStatusUpdate(assessment, payload) {
    const lastLine = extractLastMeaningfulLine(payload?.notes || "");
    const inferred = inferAssessmentStatusAndSchedule(lastLine);
    const nextStatus = String(inferred.candidateStatus || payload?.candidateStatus || "").trim();
    if (!nextStatus) throw new Error("Select a status first.");
    const nextStatusLower = nextStatus.toLowerCase();
    const isInterviewStatus = isInterviewAlignedStatus(nextStatus);
    const isOffered = nextStatusLower === "offered";
    const isJoined = nextStatusLower === "joined";
    const effectiveAtValue = isOffered
      ? (payload?.expectedDoj || inferred.expectedDoj || payload?.atValue || "")
      : isJoined
        ? (payload?.dateOfJoining || inferred.dateOfJoining || payload?.atValue || "")
        : (inferred.atValue || payload?.atValue || "");
    const atIso = (isInterviewStatus || isOffered || isJoined) && effectiveAtValue
      ? new Date(effectiveAtValue).toISOString()
      : "";
    const readableNotes = formatReadableUpdateText(payload?.notes || "");
    const confirmMessage = buildDetectedUpdateConfirmation({
      candidateName: assessment?.candidateName || "",
      status: nextStatus,
      interviewAt: isInterviewStatus ? atIso : "",
      followUpAt: !isInterviewStatus && (isOffered || isJoined) ? atIso : "",
      notes: [
        readableNotes,
        buildAssessmentStatusNoteLine(nextStatus, atIso, { offerAmount: payload?.offerAmount })
      ].filter(Boolean).join("\n")
    });
    if (!window.confirm(confirmMessage)) return;

    const nextAssessment = {
      ...assessment,
      candidateStatus: nextStatus,
      pipelineStage: mapAssessmentStatusToPipelineStage(nextStatus) || assessment?.pipelineStage || "",
      callbackNotes: appendReadableUpdateNote(
        assessment?.callbackNotes || "",
        [readableNotes, buildAssessmentStatusNoteLine(nextStatus, atIso, { offerAmount: payload?.offerAmount })].filter(Boolean).join("\n")
      ),
      interviewAttempts: Array.isArray(assessment?.interviewAttempts) ? [...assessment.interviewAttempts] : [],
      statusHistory: Array.isArray(assessment?.statusHistory) ? [...assessment.statusHistory] : [],
      offerAmount: isOffered ? String(payload?.offerAmount || inferred.offerAmount || "").trim() : (assessment?.offerAmount || ""),
      expectedDoj: isOffered ? atIso : (assessment?.expectedDoj || ""),
      dateOfJoining: isJoined ? atIso : (assessment?.dateOfJoining || ""),
      updatedAt: new Date().toISOString()
    };
    nextAssessment.statusHistory.push({
      status: nextStatus,
      at: atIso || new Date().toISOString(),
      notes: readableNotes || "",
      offerAmount: isOffered ? String(payload?.offerAmount || inferred.offerAmount || "").trim() : "",
      atLabel: buildAssessmentStatusNoteLine(nextStatus, atIso, { offerAmount: payload?.offerAmount })
    });

    if (isInterviewStatus) {
      nextAssessment.interviewAttempts.push({
        round: deriveInterviewRoundFromStatus(nextStatus) || "Interview",
        outcome: "Scheduled",
        at: atIso || new Date().toISOString(),
        notes: readableNotes || nextStatus,
        createdAt: new Date().toISOString()
      });
    } else if (nextStatusLower === "did not attend") {
      nextAssessment.interviewAttempts.push({
        round: deriveInterviewRoundFromStatus(nextStatus) || "Interview",
        outcome: "Did not attend",
        at: new Date().toISOString(),
        notes: readableNotes || nextStatus,
        createdAt: new Date().toISOString()
      });
    } else if (nextStatusLower === "interview reject") {
      nextAssessment.interviewAttempts.push({
        round: "Interview",
        outcome: "Rejected",
        at: new Date().toISOString(),
        notes: readableNotes || nextStatus,
        createdAt: new Date().toISOString()
      });
    }

    nextAssessment.interviewAt = isInterviewStatus ? (atIso || assessment?.interviewAt || "") : "";
    nextAssessment.followUpAt = !isInterviewStatus && (isOffered || isJoined) ? atIso : "";

    await api("/company/assessments", token, "POST", {
      assessment: {
        ...nextAssessment,
        generatedAt: assessment?.generatedAt || new Date().toISOString()
      }
    });
    await loadWorkspace();
    setAssessmentStatusId("");
    setStatus("assessments", `Updated status for ${assessment?.candidateName || "candidate"}.`, "ok");
  }

  async function deleteAssessmentItem(assessment) {
    if (!window.confirm(`Delete assessment for ${assessment?.candidateName || "candidate"}?`)) return;
    await api("/company/assessments", token, "DELETE", { assessmentId: assessment?.id });
    await loadWorkspace();
    setStatus("assessments", "Assessment deleted.", "ok");
  }

  async function completeAgendaInterview(assessment) {
    await saveAssessmentStatusUpdate(assessment, {
      candidateStatus: "Feedback Awaited",
      atValue: "",
      notes: "Interview completed from Today's Agenda."
    });
  }

  async function completeAgendaJoining(assessment) {
    await saveAssessmentStatusUpdate(assessment, {
      candidateStatus: "Joined",
      atValue: "",
      notes: "Marked complete from Today's Agenda."
    });
  }

  function reuseAssessmentAsNew(assessment) {
    setInterviewMeta({ candidateId: "", assessmentId: "" });
    setInterviewForm({
      candidateName: assessment?.candidateName || "",
      phoneNumber: assessment?.phoneNumber || "",
      emailId: assessment?.emailId || "",
      location: assessment?.location || "",
      currentCtc: assessment?.currentCtc || "",
      expectedCtc: assessment?.expectedCtc || "",
      noticePeriod: assessment?.noticePeriod || "",
      offerInHand: assessment?.offerInHand || "",
      currentCompany: assessment?.currentCompany || "",
      currentDesignation: assessment?.currentDesignation || "",
      totalExperience: assessment?.totalExperience || "",
      currentOrgTenure: assessment?.currentOrgTenure || "",
      reasonForChange: assessment?.reasonForChange || "",
      clientName: assessment?.clientName || "",
      jdTitle: assessment?.jdTitle || "",
      pipelineStage: assessment?.pipelineStage || "Under Interview Process",
      candidateStatus: assessment?.candidateStatus || "Screening in progress",
      followUpAt: toDateInputValue(assessment?.followUpAt),
      interviewAt: toDateInputValue(assessment?.interviewAt),
      recruiterNotes: assessment?.recruiterNotes || "",
      callbackNotes: assessment?.callbackNotes || "",
      otherPointers: assessment?.otherPointers || "",
      jdScreeningAnswers: assessment?.jdScreeningAnswers || {},
      cvAnalysis: assessment?.cvAnalysis || null,
      cvAnalysisApplied: Boolean(assessment?.cvAnalysisApplied)
    });
    navigate("/interview");
    setStatus("interview", `Loaded ${assessment?.candidateName || "candidate"} as reusable draft.`, "ok");
  }

  async function openAssessmentJourney(assessment) {
    const candidate = (state.candidates || []).find((item) => {
      if (assessment?.candidateId && String(item.id) === String(assessment.candidateId)) return true;
      return String(item.name || "").trim().toLowerCase() === String(assessment?.candidateName || "").trim().toLowerCase();
    }) || null;
    const contactAttempts = candidate?.id
      ? await api(`/contact-attempts?candidate_id=${encodeURIComponent(candidate.id)}&limit=100`, token).catch(() => [])
      : [];
    const text = buildJourneyText(assessment, Array.isArray(contactAttempts) ? contactAttempts : [], candidate);
    await copyText(text);
    window.alert(text);
    setStatus("assessments", "Journey copied.", "ok");
  }

  function openAssessmentWhatsapp(assessment) {
    const phone = String(assessment?.phoneNumber || "").replace(/[^\d]/g, "");
    if (!phone) {
      setStatus("assessments", "No phone number available for WhatsApp.", "error");
      return;
    }
    window.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer");
  }

  const companyId = String(state.user?.companyId || state.intake?.company?.id || "").trim();
  const secret = String(state.intake?.applicantIntakeSecret || "").trim();
  const apiUrl = `${window.location.origin}/public/applicants/intake`;
  const jdShortcutEntries = Object.entries(parseShortcutMap(jobDraft.jdShortcuts));
  const jdScreeningQuestions = parseQuestionList(jobDraft.standardQuestions);
  const interviewSelectedJob = (state.jobs || []).find((job) => String(job.title || "").trim() === String(interviewForm.jdTitle || "").trim()) || null;
  const interviewScreeningQuestions = parseQuestionList(interviewSelectedJob?.standardQuestions || "");
  const clientPositionRows = state.dashboard?.summary?.byClientPosition || [];
  const recruiterPositionRows = state.dashboard?.summary?.byClientRecruiter || [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const dayAfterTomorrowStart = new Date(todayStart);
  dayAfterTomorrowStart.setDate(dayAfterTomorrowStart.getDate() + 2);
  const nextWeekEnd = new Date(todayStart);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);
  const agendaWindowStart = agendaRange === "tomorrow" ? tomorrowStart : todayStart;
  const agendaWindowEnd = agendaRange === "today"
    ? tomorrowStart
    : agendaRange === "tomorrow"
      ? dayAfterTomorrowStart
      : nextWeekEnd;
  const overdueFollowUps = (state.candidates || []).filter((item) => {
    const value = item?.next_follow_up_at ? new Date(item.next_follow_up_at) : null;
    return value && value < todayStart;
  });
  const todaysFollowUps = (state.candidates || []).filter((item) => {
    const value = item?.next_follow_up_at ? new Date(item.next_follow_up_at) : null;
    return value && value >= agendaWindowStart && value < agendaWindowEnd;
  });
  const todaysInterviews = (state.assessments || []).filter((item) => {
    const value = item?.interviewAt ? new Date(item.interviewAt) : null;
    return value && value >= agendaWindowStart && value < agendaWindowEnd;
  });
  const upcomingJoinings = (state.assessments || []).filter((item) => {
    const status = String(item?.candidateStatus || "").trim().toLowerCase();
    if (!status || (status !== "offered" && status !== "joined")) return false;
    const value = item?.followUpAt ? new Date(item.followUpAt) : item?.interviewAt ? new Date(item.interviewAt) : null;
    return value && value >= agendaWindowStart && value < nextWeekEnd;
  });
  const pendingAssignments = (state.applicants || []).length;
  const todaysAgendaItems = [
    ...todaysFollowUps.map((item) => ({
      key: `followup-${item.id}`,
      type: "Follow-up",
      title: item.name || "Candidate",
      subtitle: item.jd_title || item.role || "Untitled role",
      when: item.next_follow_up_at,
      raw: item,
      action: () => loadCandidateIntoInterview(item.id)
    })),
    ...todaysInterviews.map((item) => ({
      key: `interview-${item.id}`,
      type: "Interview",
      title: item.candidateName || "Candidate",
      subtitle: item.jdTitle || "Untitled role",
      when: item.interviewAt,
      raw: item,
      action: () => openSavedAssessment(item)
    }))
  ]
    .sort((a, b) => new Date(a.when) - new Date(b.when))
    .slice(0, 8);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-kicker">RecruitDesk</div>
          <h1>Portal</h1>
        </div>
        <nav className="nav">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-btn${isActive ? " active" : ""}`}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="muted">{state.user ? `${state.user.name} | ${state.user.role} | ${state.user.companyName || "Company"}` : "Not logged in"}</div>
          <button className="ghost-btn" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      <main className="content">
        <header className="workspace-header">
          <div>
            <div className="section-kicker">{state.user?.companyName || "Company Workspace"}</div>
            <h1>RecruitDesk Portal</h1>
          </div>
          {statuses.workspace ? <div className={`status inline ${statuses.workspaceKind || ""}`}>{statuses.workspace}</div> : null}
        </header>

        <Routes>
          <Route path="/dashboard" element={
            <div className="page-grid">
              <Section kicker="Today" title="Today's Agenda">
                <div className="agenda-header">
                  <p className="muted">
                    {`${agendaRange === "today" ? "Today" : agendaRange === "tomorrow" ? "Tomorrow" : "Next 7 days"}: ${overdueFollowUps.length} overdue | ${todaysFollowUps.length} follow-up(s) | ${todaysInterviews.length} interview(s) | ${upcomingJoinings.length} joining(s)`}
                  </p>
                  <select value={agendaRange} onChange={(e) => setAgendaRange(e.target.value)}>
                    <option value="today">Today</option>
                    <option value="tomorrow">Tomorrow</option>
                    <option value="next_7_days">Next 7 days</option>
                  </select>
                </div>
                <div className="agenda-summary-grid">
                  <div className="metric-card compact-metric">
                    <div className="metric-label">Overdue follow-ups</div>
                    <div className="metric-value">{overdueFollowUps.length}</div>
                  </div>
                  <div className="metric-card compact-metric">
                    <div className="metric-label">Scheduled interviews</div>
                    <div className="metric-value">{todaysInterviews.length}</div>
                  </div>
                  <div className="metric-card compact-metric">
                    <div className="metric-label">Upcoming joinings</div>
                    <div className="metric-value">{upcomingJoinings.length}</div>
                  </div>
                </div>
                <div className="stack-list compact">
                  {!!overdueFollowUps.length && (
                    <div className="agenda-block agenda-block--overdue">
                      <h3>Overdue follow-ups</h3>
                      <div className="stack-list compact">
                        {overdueFollowUps.slice(0, 5).map((item) => (
                          <article key={`overdue-${item.id}`} className="agenda-item">
                            <div>
                              <span className="agenda-item__title">{item.name || "Candidate"}</span>
                              <span className="agenda-item__subtitle">{item.jd_title || item.role || "Untitled role"}</span>
                              <span className="agenda-item__time">{`Call follow-up | ${new Date(item.next_follow_up_at).toLocaleString()}`}</span>
                            </div>
                            <div className="button-row tight">
                              <button onClick={() => loadCandidateIntoInterview(item.id)}>Update</button>
                              <button className="ghost-btn" onClick={() => void completeAgendaFollowUp(item)}>Done</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!todaysAgendaItems.length && (
                    <div className="agenda-block">
                      <h3>Scheduled follow-ups and interviews</h3>
                      <div className="stack-list compact">
                        {todaysAgendaItems.map((item) => (
                          <article key={item.key} className="agenda-item">
                            <div>
                              <span className="agenda-item__type">{item.type}</span>
                              <span className="agenda-item__title">{item.title}</span>
                              <span className="agenda-item__subtitle">{item.subtitle}</span>
                              <span className="agenda-item__time">{new Date(item.when).toLocaleString()}</span>
                            </div>
                            <div className="button-row tight">
                              <button onClick={item.action}>Update</button>
                              <button
                                className="ghost-btn"
                                onClick={() => void (item.type === "Follow-up"
                                  ? completeAgendaFollowUp(item.raw)
                                  : completeAgendaInterview(item.raw))}
                              >
                                Done
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!upcomingJoinings.length && (
                    <div className="agenda-block agenda-block--joining">
                      <h3>Upcoming joinings</h3>
                      <div className="stack-list compact">
                        {upcomingJoinings.slice(0, 5).map((item) => (
                          <article key={`joining-${item.id}`} className="agenda-item">
                            <div>
                              <span className="agenda-item__title">{item.candidateName || "Candidate"}</span>
                              <span className="agenda-item__subtitle">{item.jdTitle || "Untitled role"}</span>
                              <span className="agenda-item__time">{`Upcoming joining | ${new Date(item.followUpAt || item.interviewAt).toLocaleString()} | ${item.candidateStatus || "Offered"}`}</span>
                            </div>
                            <div className="button-row tight">
                              <button onClick={() => openSavedAssessment(item)}>Update</button>
                              <button className="ghost-btn" onClick={() => void completeAgendaJoining(item)}>Mark complete</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                  {!overdueFollowUps.length && !todaysAgendaItems.length && !upcomingJoinings.length ? (
                    <div className="empty-state">No scheduled follow-ups, interviews, or joinings for this range yet.</div>
                  ) : null}
                  {!!pendingAssignments && (
                    <div className="muted">{`${pendingAssignments} pending applicant(s) are waiting in Applied Candidates.`}</div>
                  )}
                </div>
              </Section>
              <Section kicker="Performance" title="Recruitment Dashboard">
                <div className="form-grid three-col">
                  <label><span>Date from</span><input type="date" value={dashboardFilters.dateFrom} onChange={(e) => setDashboardFilters((c) => ({ ...c, dateFrom: e.target.value, quickRange: "custom" }))} /></label>
                  <label><span>Date to</span><input type="date" value={dashboardFilters.dateTo} onChange={(e) => setDashboardFilters((c) => ({ ...c, dateTo: e.target.value, quickRange: "custom" }))} /></label>
                  <label><span>Client</span><select value={dashboardFilters.clientLabel} onChange={(e) => setDashboardFilters((c) => ({ ...c, clientLabel: e.target.value }))}><option value="">All clients</option>{(state.dashboard?.availableClients || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label><span>Recruiter</span><select value={dashboardFilters.recruiterLabel} onChange={(e) => setDashboardFilters((c) => ({ ...c, recruiterLabel: e.target.value }))}><option value="">All recruiters</option>{(state.dashboard?.availableRecruiters || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label><span>Quick range</span><select value={dashboardFilters.quickRange} onChange={(e) => applyDashboardQuickRange(e.target.value)}><option value="all">All time</option><option value="last_7_days">Last 7 days</option><option value="this_month">This month</option><option value="custom">Custom</option></select></label>
                  <div className="button-row align-end"><button onClick={() => void applyDashboardFilters()}>Apply dates</button></div>
                </div>
                <p className="muted">Under Interview Process excludes shortlisted, offered, hold, did not attend, dropped, screening reject, interview reject, duplicate, and joined.</p>
                <div className="metric-grid">
                  {DASHBOARD_METRIC_COLUMNS.map(([key, label]) => (
                    <button key={key} className="metric-card metric-card--button" onClick={() => void openDashboardDrilldown({ title: `${label} candidates`, metric: key, groupType: "all" })}>
                      <div className="metric-label">{label}</div>
                      <div className="metric-value">{state.dashboard?.summary?.overall?.[key] || 0}</div>
                    </button>
                  ))}
                </div>
              </Section>
              <div className="dashboard-breakdown-stack">
                <Section kicker="Breakdown" title="Client Breakdown">
                  <div className="stack-list">
                    {!(state.dashboard?.summary?.byClient || []).length ? <div className="empty-state">No client breakdown available.</div> : (state.dashboard.summary.byClient || []).map((group) => (
                      <details className="dashboard-group" key={group.label}>
                        <summary className="dashboard-group__summary">
                          <div>
                            <h3>{group.label}</h3>
                            <p className="muted">{`${group.metrics?.sourced || 0} sourced | ${group.metrics?.converted || 0} converted | ${group.metrics?.under_interview_process || 0} under interview`}</p>
                          </div>
                        </summary>
                        <div className="metric-grid metric-grid--tight">
                          {DASHBOARD_METRIC_TILES.map(([key, label]) => (
                            <button key={key} className="metric-card metric-card--button compact-metric" onClick={() => void openDashboardDrilldown({ title: `${group.label} | ${label}`, metric: key, groupType: "client", params: { clientLabel: group.label } })}>
                              <div className="metric-label">{label}</div>
                              <div className="metric-value">{group.metrics?.[key] || 0}</div>
                            </button>
                          ))}
                        </div>
                        <div className="chip-row dashboard-position-chip-row">
                          {clientPositionRows.filter((row) => row.clientLabel === group.label).map((row) => (
                            <button
                              key={`${row.clientLabel}-${row.positionLabel}-chip`}
                              className="dashboard-position-chip"
                              onClick={() => void openDashboardDrilldown({ title: `${group.label} | ${row.positionLabel}`, metric: "sourced", groupType: "position", params: { clientLabel: group.label, positionLabel: row.positionLabel } })}
                            >
                              <span className="dashboard-position-chip__title">{row.positionLabel}</span>
                              <span className="dashboard-position-chip__meta">
                                {`${row.metrics?.sourced || 0} sourced | ${row.metrics?.converted || 0} converted | ${row.metrics?.under_interview_process || 0} under interview`}
                              </span>
                            </button>
                          ))}
                        </div>
                        <div className="table-wrap">
                          <table className="dashboard-table">
                            <thead>
                              <tr>
                                <th>Position</th>
                                {DASHBOARD_METRIC_COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}
                              </tr>
                            </thead>
                            <tbody>
                              {clientPositionRows.filter((row) => row.clientLabel === group.label).map((row) => (
                                <tr key={`${row.clientLabel}-${row.positionLabel}`}>
                                  <td>{row.positionLabel}</td>
                                  {DASHBOARD_METRIC_COLUMNS.map(([key, label]) => (
                                    <td key={key}>
                                      <button className="table-metric-btn" onClick={() => void openDashboardDrilldown({ title: `${group.label} | ${row.positionLabel} | ${label}`, metric: key, groupType: "position", params: { clientLabel: group.label, positionLabel: row.positionLabel } })}>
                                        {row.metrics?.[key] || 0}
                                      </button>
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ))}
                  </div>
                </Section>
                <Section kicker="Breakdown" title="Recruiter Breakdown">
                  <div className="stack-list">
                    {!(state.dashboard?.summary?.byOwnerRecruiter || []).length ? <div className="empty-state">No recruiter breakdown available.</div> : (state.dashboard.summary.byOwnerRecruiter || []).map((group) => (
                      <details className="dashboard-group" key={group.label}>
                        <summary className="dashboard-group__summary">
                          <div>
                            <h3>{group.label}</h3>
                            <p className="muted">{`${group.metrics?.sourced || 0} sourced | ${group.metrics?.converted || 0} converted | ${group.metrics?.under_interview_process || 0} under interview`}</p>
                          </div>
                        </summary>
                        <div className="metric-grid metric-grid--tight">
                          {DASHBOARD_METRIC_TILES.map(([key, label]) => (
                            <button key={key} className="metric-card metric-card--button compact-metric" onClick={() => void openDashboardDrilldown({ title: `${group.label} | ${label}`, metric: key, groupType: "recruiter", params: { recruiterLabel: group.label } })}>
                              <div className="metric-label">{label}</div>
                              <div className="metric-value">{group.metrics?.[key] || 0}</div>
                            </button>
                          ))}
                        </div>
                        <div className="stack-list compact dashboard-nested-list">
                          {Object.entries(
                            recruiterPositionRows
                              .filter((row) => row.recruiterLabel === group.label)
                              .reduce((acc, row) => {
                                const key = row.clientLabel || "Unassigned";
                                acc[key] = acc[key] || [];
                                acc[key].push(row);
                                return acc;
                              }, {})
                          ).map(([clientLabel, rows]) => (
                            <div className="nested-block" key={`${group.label}-${clientLabel}`}>
                              <div className="nested-block__title">{clientLabel}</div>
                              <div className="table-wrap">
                                <table className="dashboard-table">
                                  <thead>
                                    <tr>
                                      <th>Position</th>
                                      {DASHBOARD_METRIC_COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row) => (
                                      <tr key={`${row.recruiterLabel}-${row.clientLabel}-${row.positionLabel}`}>
                                        <td>{row.positionLabel}</td>
                                        {DASHBOARD_METRIC_COLUMNS.map(([key, label]) => (
                                          <td key={key}>
                                            <button className="table-metric-btn" onClick={() => void openDashboardDrilldown({ title: `${group.label} | ${row.clientLabel} | ${row.positionLabel} | ${label}`, metric: key, groupType: "recruiter_position", params: { recruiterLabel: group.label, clientLabel: row.clientLabel, positionLabel: row.positionLabel } })}>
                                              {row.metrics?.[key] || 0}
                                            </button>
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </Section>
              </div>
            </div>
          } />

          <Route path="/candidates" element={
            <div className="page-grid">
              <Section kicker="Candidate Universe" title="Candidates">
                <p className="muted">This view can surface captured, applied, and assessment-linked candidates together. Candidates without CV uploads still remain searchable through saved structured fields, recruiter notes, attempts, and assessment data. Hidden CV metadata is used only by search and not shown in the UI.</p>
                <div className="item-card compact-card">
                  <h3>Search mode</h3>
                  <p className="muted">Use Boolean for exact keyword retrieval. Use Natural when you want AI to interpret the statement and convert it into deterministic filters.</p>
                  <div className="button-row">
                    <button className={candidateAiQueryMode === "boolean" ? "" : "ghost-btn"} onClick={() => setCandidateAiQueryMode("boolean")}>Boolean</button>
                    <button className={candidateAiQueryMode === "natural" ? "" : "ghost-btn"} onClick={() => setCandidateAiQueryMode("natural")}>Natural</button>
                  </div>
                </div>
                <div className="toolbar">
                  <input placeholder={candidateAiQueryMode === "boolean" ? '(sales OR "business development") AND saas' : "Get me Account Executives with 4+ years of experience based out of Mumbai with current CTC under 20 L"} value={candidateSearchText} onChange={(e) => setCandidateSearchText(e.target.value)} />
                  <button onClick={() => void runCandidateSearch()}>{candidateAiQueryMode === "boolean" ? "Run Boolean Search" : "Run AI Search"}</button>
                  <button className="ghost-btn" onClick={() => {
                    setCandidateSearchText("");
                    setCandidateSearchResults([]);
                    setCandidateSearchMode("all");
                    setCandidatePage(1);
                    setCandidateStructuredFilters({
                      minExperience: "",
                      maxExperience: "",
                      location: "",
                      keySkills: "",
                      currentCompany: "",
                      client: "",
                      maxCurrentCtc: "",
                      maxExpectedCtc: "",
                      qualification: "",
                      maxNoticeDays: "",
                      recruiter: "",
                      gender: ""
                    });
                  }}>Reset search</button>
                </div>
                <div className="item-card compact-card">
                  <h3>Structured filters</h3>
                  <div className="form-grid three-col">
                    <label><span>Min experience</span><input type="number" min="0" value={candidateStructuredFilters.minExperience} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, minExperience: e.target.value }))} placeholder="2" /></label>
                    <label><span>Max experience</span><input type="number" min="0" value={candidateStructuredFilters.maxExperience} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, maxExperience: e.target.value }))} placeholder="10" /></label>
                    <label><span>Location</span><input value={candidateStructuredFilters.location} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, location: e.target.value }))} placeholder="Mumbai" /></label>
                    <label><span>Key skills</span><input value={candidateStructuredFilters.keySkills} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, keySkills: e.target.value }))} placeholder="SaaS, sales, B2B" /></label>
                    <label><span>Current company</span><input value={candidateStructuredFilters.currentCompany} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, currentCompany: e.target.value }))} placeholder="Infosys" /></label>
                    <label><span>Client</span><select value={candidateStructuredFilters.client} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, client: e.target.value }))}><option value="">All clients</option>{candidateSearchOptions.clients.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                    <label><span>Current CTC under</span><input type="number" min="0" value={candidateStructuredFilters.maxCurrentCtc} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, maxCurrentCtc: e.target.value }))} placeholder="20" /></label>
                    <label><span>Expected CTC under</span><input type="number" min="0" value={candidateStructuredFilters.maxExpectedCtc} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, maxExpectedCtc: e.target.value }))} placeholder="25" /></label>
                    <label><span>Qualification</span><input value={candidateStructuredFilters.qualification} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, qualification: e.target.value }))} placeholder="B.Tech / MBA" /></label>
                    <label><span>Notice under (days)</span><input type="number" min="0" value={candidateStructuredFilters.maxNoticeDays} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, maxNoticeDays: e.target.value }))} placeholder="30" /></label>
                    <label><span>Recruiter</span><select value={candidateStructuredFilters.recruiter} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, recruiter: e.target.value }))}><option value="">All recruiters</option>{candidateSearchOptions.recruiters.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                    <label><span>Gender</span><select value={candidateStructuredFilters.gender} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, gender: e.target.value }))}><option value="">All genders</option>{candidateSearchOptions.genders.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  </div>
                </div>
                <div className="item-card compact-card">
                  <h3>Search examples</h3>
                  <p className="muted">{candidateAiQueryMode === "boolean" ? "Use exact keywords with AND / OR and quoted phrases, similar to Naukri boolean search." : "Write the recruiter query naturally. AI will interpret the statement into structured search filters, then retrieval will run deterministically on saved fields, recruiter notes, other pointers, attempts, tags, and hidden CV metadata."}</p>
                  <div className="button-row">
                    {(candidateAiQueryMode === "boolean" ? BOOLEAN_SEARCH_EXAMPLE_PROMPTS : AI_SEARCH_EXAMPLE_PROMPTS).map((prompt) => (
                      <button
                        key={prompt}
                        className="ghost-btn"
                        onClick={() => {
                          setCandidateSearchText(prompt);
                          setCandidatePage(1);
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="button-row">
                  <button onClick={() => void copyCandidatesExcel()}>Copy Excel</button>
                  <button onClick={() => void copyCandidatesWhatsapp()}>Copy WhatsApp</button>
                  <button onClick={() => void copyCandidatesEmail()}>Copy Email</button>
                  <button className="ghost-btn" onClick={() => downloadCandidatesExcel()}>Download results</button>
                </div>
                <div className="stack-list">
                  {!pagedCandidates.length ? <div className="empty-state">No candidates found for this view.</div> : pagedCandidates.map((item) => (
                    <article className="item-card compact-card" key={item.id || item.assessmentId}>
                      <div className="item-card__top">
                        <div>
                          <h3>{item.name || item.candidateName || "Candidate"} | {item.role || item.currentDesignation || item.jdTitle || "Untitled role"}</h3>
                          <p className="muted">{[item.company || item.currentCompany || "", item.location || "", item.ownerRecruiter ? `Recruiter: ${item.ownerRecruiter}` : "", item.source ? `Source: ${item.source}` : ""].filter(Boolean).join(" | ")}</p>
                          <div className="candidate-snippet">{[item.experience || item.totalExperience || "", item.current_ctc || item.currentCtc ? `Current CTC: ${item.current_ctc || item.currentCtc}` : "", item.expected_ctc || item.expectedCtc ? `Expected CTC: ${item.expected_ctc || item.expectedCtc}` : "", item.notice_period || item.noticePeriod ? `Notice: ${item.notice_period || item.noticePeriod}` : ""].filter(Boolean).join("\n")}</div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="button-row">
                  <button className="ghost-btn" disabled={candidatePage <= 1} onClick={() => setCandidatePage((page) => Math.max(1, page - 1))}>Previous</button>
                  <div className="muted">Page {candidatePage} of {totalCandidatePages}</div>
                  <button className="ghost-btn" disabled={candidatePage >= totalCandidatePages} onClick={() => setCandidatePage((page) => Math.min(totalCandidatePages, page + 1))}>Next</button>
                </div>
              </Section>
            </div>
          } />

          <Route path="/applicants" element={
            <Section kicker="Admin Inbox" title="Applied Candidates">
              {statuses.applicants ? <div className={`status ${statuses.applicantsKind || ""}`}>{statuses.applicants}</div> : null}
              <div className="form-grid three-col">
                <label className="full"><span>Search</span><input placeholder="Search by candidate, phone, email, JD..." value={applicantFilters.q} onChange={(e) => setApplicantFilters((current) => ({ ...current, q: e.target.value }))} /></label>
                <label><span>Date from</span><input type="date" value={applicantFilters.dateFrom} onChange={(e) => setApplicantFilters((current) => ({ ...current, dateFrom: e.target.value }))} /></label>
                <label><span>Date to</span><input type="date" value={applicantFilters.dateTo} onChange={(e) => setApplicantFilters((current) => ({ ...current, dateTo: e.target.value }))} /></label>
              </div>
              <div className="metric-grid metric-grid--tight">
                <div className="metric-card compact-metric"><div className="metric-label">Applied today</div><div className="metric-value">{visibleApplicants.filter((item) => String(item.createdAt || item.created_at || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).length}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Assigned</div><div className="metric-value">{visibleApplicants.filter((item) => String(item.assignedToName || item.assigned_to_name || "").trim()).length}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Total visible</div><div className="metric-value">{visibleApplicants.length}</div></div>
              </div>
              <div className="captured-filter-grid">
                <MultiSelectDropdown label="Clients" options={applicantOptions.clients} selected={applicantFilters.clients} onToggle={(value) => setApplicantFilters((current) => ({ ...current, clients: value === "__all__" ? [] : current.clients.includes(value) ? current.clients.filter((item) => item !== value) : [...current.clients, value] }))} />
                <MultiSelectDropdown label="JD / Role" options={applicantOptions.jds} selected={applicantFilters.jds} onToggle={(value) => setApplicantFilters((current) => ({ ...current, jds: value === "__all__" ? [] : current.jds.includes(value) ? current.jds.filter((item) => item !== value) : [...current.jds, value] }))} />
                {String(state.user?.role || "").toLowerCase() === "admin" ? <MultiSelectDropdown label="Assigned to" options={applicantOptions.assignedTo} selected={applicantFilters.assignedTo} onToggle={(value) => setApplicantFilters((current) => ({ ...current, assignedTo: value === "__all__" ? [] : current.assignedTo.includes(value) ? current.assignedTo.filter((item) => item !== value) : [...current.assignedTo, value] }))} /> : null}
                <MultiSelectDropdown label="Outcome" options={applicantOptions.outcomes} selected={applicantFilters.outcomes} onToggle={(value) => setApplicantFilters((current) => ({ ...current, outcomes: value === "__all__" ? [] : current.outcomes.includes(value) ? current.outcomes.filter((item) => item !== value) : [...current.outcomes, value] }))} />
              </div>
              <div className="button-row">
                <button onClick={() => void copyApplicantsExcel()}>Copy Excel</button>
                <button onClick={() => void copyApplicantsWhatsapp()}>Copy WhatsApp</button>
                <button onClick={() => void copyApplicantsEmail()}>Copy Email</button>
              </div>
              <div className="stack-list">
                {!visibleApplicants.length ? <div className="empty-state">No applied candidates right now.</div> : visibleApplicants.map((item) => (
                  <article className="item-card compact-card" key={item.id}>
                    <div className="item-card__top">
                      <div>
                        <h3>{item.candidateName || "Applicant"} | {item.jdTitle || "Untitled role"}</h3>
                        <p className="muted">{[
                          item.clientName ? `Client: ${item.clientName}` : "",
                          item.jdTitle ? `JD: ${item.jdTitle}` : "",
                          item.sourcePlatform ? `Source: ${item.sourcePlatform}` : "",
                          item.assignedToName ? `Assigned: ${item.assignedToName}` : "",
                          item.parseStatus ? `Parse: ${item.parseStatus}` : ""
                        ].filter(Boolean).join(" | ")}</p>
                        {item.assignedToName ? <div className="status-note">{`Already assigned to ${item.assignedToName}`}</div> : null}
                      </div>
                      <div className="chip-row">
                        {item.cvFilename ? <span className="chip">CV: {item.cvFilename}</span> : null}
                        {item.location ? <span className="chip">{item.location}</span> : null}
                        {item.totalExperience ? <span className="chip">{item.totalExperience}</span> : null}
                      </div>
                    </div>
                    <div className="button-row">
                      <button onClick={() => loadApplicantIntoInterview(item.id)}>Open draft</button>
                      <button onClick={() => setNotesCandidateId(item.id)}>Recruiter note</button>
                      <button onClick={() => void openAttempts(item.id)}>Attempts</button>
                      {item.cvFilename ? <button onClick={() => void openCv(item.id)}>Open CV</button> : null}
                      {state.user?.role === "admin" ? <button onClick={() => setAssignApplicantId(item.id)}>Assign</button> : null}
                      {state.user?.role === "admin" ? <button className="ghost-btn" onClick={() => void removeApplicant(item.id)}>Remove</button> : null}
                    </div>
                    <div className="candidate-snippet">{[
                      item.screeningAnswers ? `Screening answers:\n${item.screeningAnswers}` : "",
                      item.currentCompany || item.currentDesignation ? [item.currentCompany, item.currentDesignation].filter(Boolean).join(" | ") : ""
                    ].filter(Boolean).join("\n\n") || "No extra notes yet."}</div>
                  </article>
                ))}
              </div>
            </Section>
          } />

          <Route path="/captured-notes" element={
            <Section kicker="Shared Workflow" title="Captured Notes">
              {statuses.captured ? <div className={`status ${statuses.capturedKind || ""}`}>{statuses.captured}</div> : null}
              <div className="button-row">
                <button onClick={() => setNewDraftOpen(true)}>New Draft</button>
              </div>
              <div className="form-grid three-col">
                <label className="full"><span>Search</span><input placeholder="Search candidate name, company, phone, email, LinkedIn..." value={candidateFilters.q} onChange={(e) => setCandidateFilters((c) => ({ ...c, q: e.target.value }))} /></label>
                <label><span>Date from</span><input type="date" value={candidateFilters.dateFrom} onChange={(e) => setCandidateFilters((c) => ({ ...c, dateFrom: e.target.value }))} /></label>
                <label><span>Date to</span><input type="date" value={candidateFilters.dateTo} onChange={(e) => setCandidateFilters((c) => ({ ...c, dateTo: e.target.value }))} /></label>
              </div>
              <div className="metric-grid metric-grid--tight">
                <div className="metric-card compact-metric"><div className="metric-label">Today</div><div className="metric-value">{capturedCandidates.filter((item) => String(item.created_at || "").slice(0, 10) === new Date().toISOString().slice(0, 10)).length}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Active</div><div className="metric-value">{capturedCandidates.filter((item) => !isTerminalStatus((capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase())?.candidateStatus || item.candidate_status || ""))).length}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Converted</div><div className="metric-value">{capturedCandidates.filter((item) => capturedAssessmentMap.has(String(item.name || "").trim().toLowerCase()) || item.used_in_assessment).length}</div></div>
              </div>
                <div className="captured-filter-grid">
                  <MultiSelectDropdown label="Clients" options={capturedCandidateOptions.clients} selected={candidateFilters.clients} onToggle={(value) => setCandidateFilters((current) => ({ ...current, clients: value === "__all__" ? [] : current.clients.includes(value) ? current.clients.filter((item) => item !== value) : [...current.clients, value] }))} />
                  <MultiSelectDropdown label="JD / Role" options={capturedCandidateOptions.jds} selected={candidateFilters.jds} onToggle={(value) => setCandidateFilters((current) => ({ ...current, jds: value === "__all__" ? [] : current.jds.includes(value) ? current.jds.filter((item) => item !== value) : [...current.jds, value] }))} />
                  <MultiSelectDropdown label="Lane" options={["captured", "converted"]} selected={candidateFilters.lanes} onToggle={(value) => setCandidateFilters((current) => ({ ...current, lanes: value === "__all__" ? [] : current.lanes.includes(value) ? current.lanes.filter((item) => item !== value) : [...current.lanes, value] }))} />
                  {String(state.user?.role || "").toLowerCase() === "admin" ? <MultiSelectDropdown label="Assigned to" options={capturedCandidateOptions.assignedTo} selected={candidateFilters.assignedTo} onToggle={(value) => setCandidateFilters((current) => ({ ...current, assignedTo: value === "__all__" ? [] : current.assignedTo.includes(value) ? current.assignedTo.filter((item) => item !== value) : [...current.assignedTo, value] }))} /> : null}
                  <MultiSelectDropdown label="Captured by" options={capturedCandidateOptions.capturedBy} selected={candidateFilters.capturedBy} onToggle={(value) => setCandidateFilters((current) => ({ ...current, capturedBy: value === "__all__" ? [] : current.capturedBy.includes(value) ? current.capturedBy.filter((item) => item !== value) : [...current.capturedBy, value] }))} />
                  <MultiSelectDropdown label="Sources" options={capturedCandidateOptions.sources} selected={candidateFilters.sources} onToggle={(value) => setCandidateFilters((current) => ({ ...current, sources: value === "__all__" ? [] : current.sources.includes(value) ? current.sources.filter((item) => item !== value) : [...current.sources, value] }))} />
                  <MultiSelectDropdown label="Outcomes" options={capturedCandidateOptions.outcomes} selected={candidateFilters.outcomes} onToggle={(value) => setCandidateFilters((current) => ({ ...current, outcomes: value === "__all__" ? [] : current.outcomes.includes(value) ? current.outcomes.filter((item) => item !== value) : [...current.outcomes, value] }))} />
                  <MultiSelectDropdown label="State" options={["active", "inactive"]} selected={candidateFilters.activeStates} onToggle={(value) => setCandidateFilters((current) => ({ ...current, activeStates: value === "__all__" ? [] : current.activeStates.includes(value) ? current.activeStates.filter((item) => item !== value) : [...current.activeStates, value] }))} />
                </div>
                <div className="button-row">
                  <button onClick={() => void copyCapturedExcel()}>Copy Excel</button>
                  <button onClick={() => void copyCapturedWhatsapp()}>Copy WhatsApp</button>
                  <button onClick={() => void copyCapturedEmail()}>Copy Email</button>
                </div>
                <div className="stack-list">
                {!capturedCandidates.length ? <div className="empty-state">No captured notes or recruiter-owned candidates yet.</div> : capturedCandidates.map((item) => {
                  const matchedAssessment = capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase());
                  const statusState = normalizedAssessmentState(matchedAssessment, item);
                  return (
                    <article className="item-card compact-card" key={item.id}>
                      <div className="item-card__top">
                        <div>
                          <h3>{item.name || "Candidate"} | {item.jd_title || item.role || "Untitled role"}</h3>
                          <p className="muted">{[item.company || "", item.source ? `Source: ${item.source}` : "", item.assigned_to_name ? `Assigned: ${item.assigned_to_name}` : ""].filter(Boolean).join(" | ")}</p>
                          {statusState.summary ? <div className="status-line">{statusState.summary}</div> : null}
                          {statusState.note ? <div className="status-note">{statusState.note}</div> : null}
                          <div className="chip-row">
                            {statusState.followUp ? <span className="chip">Follow-up: {new Date(statusState.followUp).toLocaleString()}</span> : null}
                            {statusState.interviewAt ? <span className="chip">Interview: {new Date(statusState.interviewAt).toLocaleString()}</span> : null}
                          </div>
                        </div>
                      </div>
                      <div className="button-row">
                        <button onClick={() => loadCandidateIntoInterview(item.id)}>Open draft</button>
                        <button onClick={() => setAssignCandidateId(item.id)}>Assign</button>
                        <button onClick={() => setNotesCandidateId(item.id)}>Recruiter note</button>
                        <button onClick={() => void openAttempts(item.id)}>Attempts</button>
                        <button onClick={() => void createAssessmentFromCandidate(item.id)}>Create assessment</button>
                        <button className="ghost-btn" onClick={() => void hideCapturedCandidate(item.id)}>Hide from list</button>
                        <button className="ghost-btn" onClick={() => void api(`/candidates?id=${encodeURIComponent(item.id)}`, token, "DELETE").then(loadWorkspace).then(() => setStatus("captured", "Candidate deleted.", "ok")).catch((error) => setStatus("captured", String(error?.message || error), "error"))}>Delete</button>
                      </div>
                      <div className="candidate-snippet">{[item.notes ? `Initial notes:\n${item.notes}` : "", item.recruiter_context_notes, item.other_pointers].filter(Boolean).join("\n\n") || "No recruiter note or pointers yet."}</div>
                    </article>
                  );
                })}
              </div>
            </Section>
          } />

          <Route path="/assessments" element={
            <Section kicker="Structured Workflow" title="Assessments">
              {statuses.assessments ? <div className={`status ${statuses.assessmentsKind || ""}`}>{statuses.assessments}</div> : null}
              <div className="form-grid three-col">
                <label className="full"><span>Search</span><input placeholder="Search by candidate, phone, email, JD..." value={assessmentFilters.q} onChange={(e) => setAssessmentFilters((current) => ({ ...current, q: e.target.value }))} /></label>
                <label><span>Date from</span><input type="date" value={assessmentFilters.dateFrom} onChange={(e) => setAssessmentFilters((current) => ({ ...current, dateFrom: e.target.value }))} /></label>
                <label><span>Date to</span><input type="date" value={assessmentFilters.dateTo} onChange={(e) => setAssessmentFilters((current) => ({ ...current, dateTo: e.target.value }))} /></label>
              </div>
              <div className="captured-filter-grid">
                <MultiSelectDropdown label="Clients" options={assessmentOptions.clients} selected={assessmentFilters.clients} onToggle={(value) => setAssessmentFilters((current) => ({ ...current, clients: value === "__all__" ? [] : current.clients.includes(value) ? current.clients.filter((item) => item !== value) : [...current.clients, value] }))} />
                <MultiSelectDropdown label="JD / Role" options={assessmentOptions.jds} selected={assessmentFilters.jds} onToggle={(value) => setAssessmentFilters((current) => ({ ...current, jds: value === "__all__" ? [] : current.jds.includes(value) ? current.jds.filter((item) => item !== value) : [...current.jds, value] }))} />
                <MultiSelectDropdown label="Recruiters" options={assessmentOptions.recruiters} selected={assessmentFilters.recruiters} onToggle={(value) => setAssessmentFilters((current) => ({ ...current, recruiters: value === "__all__" ? [] : current.recruiters.includes(value) ? current.recruiters.filter((item) => item !== value) : [...current.recruiters, value] }))} />
              </div>
              <div className="button-row">
                <button onClick={() => void copyAssessmentsExcel()}>Copy Excel</button>
                <button onClick={() => void copyAssessmentsWhatsapp()}>Copy WhatsApp</button>
                <button onClick={() => void copyAssessmentsEmail()}>Copy Email</button>
              </div>
              <div className="status-note">Selected for client share: {selectedAssessmentIds.length}</div>
              <div className="stack-list">
                {!filteredAssessments.length ? <div className="empty-state">No assessments saved yet.</div> : filteredAssessments.map((item) => (
                  <article className={`item-card compact-card ${selectedAssessmentIds.includes(String(item.id)) ? "selected-card" : ""}`} key={item.id}>
                    <div className="assessment-select-row">
                      <label className="checkbox-pill">
                        <input type="checkbox" checked={selectedAssessmentIds.includes(String(item.id))} onChange={() => toggleAssessmentSelection(item.id)} />
                        <span>Select for client share</span>
                      </label>
                    </div>
                    <div className="item-card__top">
                      <div>
                        <h3>{item.candidateName || "Candidate"} | {item.jdTitle || "Untitled role"}</h3>
                        <p className="muted">{[item.pipelineStage || "", item.candidateStatus || ""].filter(Boolean).join(" | ")}</p>
                        <div className="status-note">
                          {[
                            item.currentCompany || "",
                            item.interviewAt ? `Interview ${new Date(item.interviewAt).toLocaleString()}` : "",
                            item.updatedAt ? `Updated ${new Date(item.updatedAt).toLocaleString()}` : ""
                          ].filter(Boolean).join(" | ")}
                        </div>
                      </div>
                    </div>
                    <div className="button-row">
                      <button onClick={() => openSavedAssessment(item)}>Edit assessment</button>
                      <button onClick={() => setAssessmentStatusId(item.id)}>Update status</button>
                      <button onClick={() => void openAssessmentJourney(item)}>Journey</button>
                      <button onClick={() => openAssessmentWhatsapp(item)}>WhatsApp</button>
                      <button onClick={() => reuseAssessmentAsNew(item)}>Reuse as new</button>
                      <button className="ghost-btn" onClick={() => void deleteAssessmentItem(item)}>Delete</button>
                    </div>
                  </article>
                ))}
              </div>
            </Section>
          } />

          <Route path="/quick-update" element={
            <div className="page-grid">
              <Section kicker="Fast Lane" title="Quick Update">
                <p className="muted">Use this for already saved candidates when details change later. Pick the candidate once, then either merge recruiter details or apply a quick status/timeline update.</p>
                {statuses.quickUpdate ? <div className={`status ${statuses.quickUpdateKind || ""}`}>{statuses.quickUpdate}</div> : null}
                <div className="form-grid">
                  <label className="full">
                    <span>Search existing candidate</span>
                    <input
                      placeholder="Type candidate name, phone, email, LinkedIn, JD..."
                      value={quickUpdateCandidateQuery}
                      onChange={(e) => setQuickUpdateCandidateQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="stack-list compact">
                  {!quickUpdateCandidateQuery.trim()
                    ? <div className="empty-state">Search by name or phone to pick an existing candidate.</div>
                    : quickUpdateMatches.map((item) => (
                      <article className={`item-card compact-card${String(quickUpdateCandidateId) === String(item.id) ? " selected-card" : ""}`} key={item.id}>
                        <div className="item-card__top">
                          <div>
                            <h3>{item.name || "Candidate"} | {item.jd_title || item.role || "Untitled role"}</h3>
                            <p className="muted">{[item.company || "", item.client_name ? `Client: ${item.client_name}` : "", item.phone || "", item.email || ""].filter(Boolean).join(" | ")}</p>
                          </div>
                          <div className="button-row">
                            <button className={String(quickUpdateCandidateId) === String(item.id) ? "" : "ghost-btn"} onClick={() => setQuickUpdateCandidateId(String(item.id))}>
                              {String(quickUpdateCandidateId) === String(item.id) ? "Selected" : "Select"}
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}
                </div>
              </Section>

              <Section kicker="Existing Candidate" title="Update Workspace">
                {!quickUpdateCandidate ? (
                  <div className="empty-state">Select a candidate above to start a quick update.</div>
                ) : (
                  <>
                    <div className="info-grid">
                      {[["Candidate", quickUpdateCandidate.name],["Phone", quickUpdateCandidate.phone],["Email", quickUpdateCandidate.email],["Client", quickUpdateCandidate.client_name],["JD / role", quickUpdateCandidate.jd_title || quickUpdateCandidate.role],["Current outcome", quickUpdateCandidate.last_contact_outcome || "-"],["Linked assessment", quickUpdateLinkedAssessment ? `${quickUpdateLinkedAssessment.jdTitle || "Assessment"} | ${quickUpdateLinkedAssessment.candidateStatus || "Saved"}` : "No"]].map(([label, value]) => (
                        <div className="info-card" key={label}>
                          <div className="info-label">{label}</div>
                          <div className="info-value">{value || "-"}</div>
                        </div>
                      ))}
                    </div>
                    <div className="form-grid">
                      <div className="form-grid two-col">
                        <label><span>Current CTC</span><input value={quickUpdateRecruiterSections.current_ctc} onChange={(e) => setQuickUpdateRecruiterSections((current) => ({ ...current, current_ctc: e.target.value }))} placeholder="Got a hike, now 20 L" /></label>
                        <label><span>Expected CTC</span><input value={quickUpdateRecruiterSections.expected_ctc} onChange={(e) => setQuickUpdateRecruiterSections((current) => ({ ...current, expected_ctc: e.target.value }))} placeholder="Looking for 27 L" /></label>
                        <label><span>Notice period</span><input value={quickUpdateRecruiterSections.notice_period} onChange={(e) => setQuickUpdateRecruiterSections((current) => ({ ...current, notice_period: e.target.value }))} placeholder="30 days / serving notice" /></label>
                        <label><span>If serving, offer amount</span><input value={quickUpdateRecruiterSections.offer_in_hand} onChange={(e) => setQuickUpdateRecruiterSections((current) => ({ ...current, offer_in_hand: e.target.value }))} placeholder="Offer in hand 25 L" /></label>
                        <label className="full"><span>LWD / DOJ</span><input value={quickUpdateRecruiterSections.lwd_or_doj} onChange={(e) => setQuickUpdateRecruiterSections((current) => ({ ...current, lwd_or_doj: e.target.value }))} placeholder="8th June / 1st July" /></label>
                        <label className="full"><span>Tags / searchable keywords</span><textarea value={quickUpdateRecruiterSections.tags} onChange={(e) => setQuickUpdateRecruiterSections((current) => ({ ...current, tags: e.target.value }))} placeholder="B2B corporate sales, SaaS, enterprise sales, node dev, react + java" /></label>
                      </div>
                      <label className="full">
                        <span>Other pointers</span>
                        <textarea
                          value={quickUpdateText}
                          onChange={(e) => setQuickUpdateText(e.target.value)}
                          placeholder="Good communication. Okay with remote setup."
                        />
                      </label>
                      <label className="full">
                        <span>Status update note</span>
                        <textarea
                          value={quickUpdateStatusText}
                          onChange={(e) => setQuickUpdateStatusText(e.target.value)}
                          placeholder="Call tomorrow at 7 PM, or L2 tomorrow 12 PM."
                        />
                      </label>
                    </div>
                    <p className="muted">
                      {quickUpdateLinkedAssessment
                        ? "This candidate is already in Assessments. Use the fixed recruiter-note boxes to sync changed details, and use the last line of the status update box to update assessment status."
                        : "For captured or applied candidates, use the fixed recruiter-note boxes for detail changes and the last line of the status update box for log-attempt movement."}
                    </p>
                    <div className="button-row">
                      <button onClick={() => void parseQuickUpdateRecruiterNote()}>Parse recruiter note</button>
                      {quickUpdateLinkedAssessment ? (
                        <>
                          <button onClick={() => void applyQuickUpdateAssessmentDetails()}>Update assessment details</button>
                          <button onClick={() => void applyQuickAssessmentStatusUpdate()}>Update status</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => void applyQuickUpdateRecruiterNote()}>Apply recruiter note</button>
                          <button onClick={() => void applyQuickCandidateUpdate()}>Apply candidate update</button>
                        </>
                      )}
                    </div>
                    {quickUpdateParsedSummary ? (
                      <div className="parsed-summary">
                        <div className="info-label">Parsed summary</div>
                        <div className="info-grid">
                          {[["Company", quickUpdateParsedSummary.company],["Role", quickUpdateParsedSummary.role],["Location", quickUpdateParsedSummary.location],["Current CTC", quickUpdateParsedSummary.current_ctc],["Expected CTC", quickUpdateParsedSummary.expected_ctc],["Notice period", quickUpdateParsedSummary.notice_period],["LWD / DOJ", quickUpdateParsedSummary.lwd_or_doj],["Offer in hand", quickUpdateParsedSummary.offer_in_hand]].map(([label, value]) => value ? (
                            <div className="info-card" key={label}>
                              <div className="info-label">{label}</div>
                              <div className="info-value">{value}</div>
                            </div>
                          ) : null)}
                        </div>
                      </div>
                    ) : null}
                    {quickUpdateConflicts.length ? (
                      <div className="conflict-box">
                        <div className="info-label">Conflicts detected</div>
                        <ul>
                          {quickUpdateConflicts.map((entry) => <li key={`${entry.key}-${entry.from}-${entry.to}`}><strong>{formatRecruiterOverwriteLabel(entry.key)}</strong>{`: existing "${entry.from}" to new "${entry.to}"`}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </>
                )}
              </Section>
            </div>
          } />

          <Route path="/client-share" element={
            <div className="page-grid">
              <Section kicker="Client Submission" title="Direct Share with Client">
                <p className="muted">Prepare a clean email draft for the client using selected assessments only. Select profiles in the Assessments tab first, then copy this draft into your email client.</p>
                {statuses.clientShare ? <div className={`status ${statuses.clientShareKind || ""}`}>{statuses.clientShare}</div> : null}
                <div className="form-grid two-col">
                  <label>
                    <span>Selected profiles</span>
                    <input value={`${selectedAssessmentRows.length} assessment profile(s)`} readOnly />
                  </label>
                  <label>
                    <span>Attachment preset</span>
                    <select value={clientShareDraft.presetId} onChange={(e) => setClientShareDraft((current) => ({ ...current, presetId: e.target.value }))}>
                      <option value="compact_recruiter">{copySettings.exportPresetLabels?.compact_recruiter || "Compact recruiter"}</option>
                      <option value="client_tracker">{copySettings.exportPresetLabels?.client_tracker || "Client tracker"}</option>
                      <option value="attentive_tracker">{copySettings.exportPresetLabels?.attentive_tracker || "Attentive tracker"}</option>
                      <option value="client_submission">{copySettings.exportPresetLabels?.client_submission || "Client submission"}</option>
                      <option value="screening_focus">{copySettings.exportPresetLabels?.screening_focus || "Screening focus"}</option>
                      {(copySettings.customExportPresets || []).map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                  </label>
                  <label><span>HR name</span><input value={clientShareDraft.hrName} onChange={(e) => setClientShareDraft((current) => ({ ...current, hrName: e.target.value }))} placeholder="Attentive HR Team" /></label>
                  <label><span>Recipient email</span><input type="email" value={clientShareDraft.recipientEmail} onChange={(e) => setClientShareDraft((current) => ({ ...current, recipientEmail: e.target.value }))} placeholder="hr@client.com" /></label>
                  <label><span>Client</span><input value={clientShareDraft.clientLabel} onChange={(e) => setClientShareDraft((current) => ({ ...current, clientLabel: e.target.value }))} placeholder="Attentive" /></label>
                  <label><span>Role / requirement</span><input value={clientShareDraft.targetRole} onChange={(e) => setClientShareDraft((current) => ({ ...current, targetRole: e.target.value }))} placeholder="AE / Account Executive" /></label>
                  <label className="full">
                    <span>Selected preset columns</span>
                    <textarea value={(copySettings.customExportPresets || []).find((preset) => String(preset.id) === String(clientShareDraft.presetId))?.columns || copySettings.exportPresetColumns?.[clientShareDraft.presetId] || DEFAULT_COPY_SETTINGS.exportPresetColumns?.[clientShareDraft.presetId] || ""} readOnly />
                  </label>
                  <label className="full"><span>Extra message</span><textarea value={clientShareDraft.extraMessage} onChange={(e) => setClientShareDraft((current) => ({ ...current, extraMessage: e.target.value }))} placeholder="Optional note for the client." /></label>
                  <label className="full">
                    <span>Email preview</span>
                    <div className="client-share-preview" dangerouslySetInnerHTML={{ __html: buildClientShareHtml() }} />
                  </label>
                </div>
                {!selectedAssessmentRows.length ? <div className="empty-state">No assessment selected yet. Go to Assessments and tick `Select for client share` on the profiles you want to send.</div> : null}
                <p className="muted">Current flow: copy the email draft from here, then paste it into Zoho/Gmail/Outlook and attach CVs manually.</p>
                <div className="button-row">
                  <button onClick={() => void copyClientShareEmailDraft()}>Copy email draft</button>
                </div>
              </Section>
            </div>
          } />

          <Route path="/interview" element={
            <div className="page-grid">
              <Section kicker="Recruiter Workspace" title="Interview Panel">
                <p className="muted">This panel is for captured information, recruiter notes, runbook, CV analysis, and output actions. Assessment status and pipeline updates stay in the Assessments lane to avoid confusion.</p>
              </Section>

              <Section kicker="Captured Information" title="Candidate Context">
                <div className="info-grid">
                  {[["Candidate", interviewForm.candidateName],["Phone", interviewForm.phoneNumber],["Email", interviewForm.emailId],["Location", interviewForm.location],["Current company", interviewForm.currentCompany],["Current designation", interviewForm.currentDesignation],["Experience", interviewForm.totalExperience],["Client", interviewForm.clientName],["JD / role", interviewForm.jdTitle]].map(([label, value]) => (
                    <div className="info-card" key={label}>
                      <div className="info-label">{label}</div>
                      <div className="info-value">{value || "-"}</div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section kicker="Recruiter Inputs" title="Draft Notes">
                <form className="form-grid two-col" onSubmit={(e) => { e.preventDefault(); }}>
                  {[["candidateName", "Candidate name"], ["phoneNumber", "Phone"], ["emailId", "Email", "email"], ["location", "Location"], ["currentCompany", "Current company"], ["currentDesignation", "Current designation"], ["totalExperience", "Total experience"]].map(([name, label, type]) => (
                    <label key={name}><span>{label}</span><input type={type || "text"} value={interviewForm[name]} onChange={(e) => setInterviewForm((c) => ({ ...c, [name]: e.target.value }))} /></label>
                  ))}
                  <label>
                    <span>JD / role</span>
                    <select value={interviewForm.jdTitle} onChange={(e) => {
                      const selectedTitle = e.target.value;
                      const matchedJob = (state.jobs || []).find((job) => String(job.title || "") === String(selectedTitle)) || null;
                      setInterviewForm((current) => ({
                        ...current,
                        jdTitle: selectedTitle,
                        clientName: matchedJob?.clientName || current.clientName,
                        jdScreeningAnswers: current.jdTitle === selectedTitle ? current.jdScreeningAnswers : {}
                      }));
                    }}>
                      <option value="">Select JD / role</option>
                      {(state.jobs || []).map((job) => <option key={job.id} value={job.title}>{job.title}</option>)}
                    </select>
                  </label>
                  <label><span>Client name</span><input value={interviewForm.clientName} readOnly /></label>
                  <label className="full"><span>Captured notes</span><textarea value={interviewForm.callbackNotes} onChange={(e) => setInterviewForm((c) => ({ ...c, callbackNotes: e.target.value }))} /></label>
                  <label className="full"><span>Recruiter notes</span><textarea value={interviewForm.recruiterNotes} onChange={(e) => setInterviewForm((c) => ({ ...c, recruiterNotes: e.target.value }))} /></label>
                  <label className="full"><span>Other pointers</span><textarea value={interviewForm.otherPointers} onChange={(e) => setInterviewForm((c) => ({ ...c, otherPointers: e.target.value }))} /></label>
                </form>
              </Section>

              <Section kicker="Runbook" title="Interview Runbook">
                <div className="runbook-layout">
                  <div className="runbook-block">
                    <div className="info-label">JD-defined screening questions</div>
                    {interviewScreeningQuestions.length ? (
                      <div className="question-stack">
                        {interviewScreeningQuestions.map((question, index) => (
                          <div className="question-card" key={`${index}-${question}`}>
                            <div className="question-card__head">
                              <div className="question-index">Q{index + 1}</div>
                              <div className="question-text">{question}</div>
                            </div>
                            <textarea
                              className="question-answer"
                              value={interviewForm.jdScreeningAnswers?.[question] || ""}
                              onChange={(e) => setInterviewForm((current) => ({
                                ...current,
                                jdScreeningAnswers: {
                                  ...(current.jdScreeningAnswers || {}),
                                  [question]: e.target.value
                                }
                              }))}
                              placeholder="Write candidate answer here"
                            />
                          </div>
                        ))}
                      </div>
                    ) : <div className="empty-state">No JD screening questions added yet.</div>}
                  </div>

                  <div className="runbook-block">
                    <div className="info-label">Recruiter screening block</div>
                    <div className="form-grid two-col">
                      <label><span>Current CTC</span><input value={interviewForm.currentCtc} onChange={(e) => setInterviewForm((c) => ({ ...c, currentCtc: e.target.value }))} /></label>
                      <label><span>Expected CTC</span><input value={interviewForm.expectedCtc} onChange={(e) => setInterviewForm((c) => ({ ...c, expectedCtc: e.target.value }))} /></label>
                      <label><span>Notice period</span><input value={interviewForm.noticePeriod} onChange={(e) => setInterviewForm((c) => ({ ...c, noticePeriod: e.target.value }))} /></label>
                      <label><span>Offer in hand</span><input value={interviewForm.offerInHand} onChange={(e) => setInterviewForm((c) => ({ ...c, offerInHand: e.target.value }))} /></label>
                      <label><span>LWD / DOJ</span><input value={interviewForm.lwdOrDoj} onChange={(e) => setInterviewForm((c) => ({ ...c, lwdOrDoj: e.target.value }))} /></label>
                      <label><span>Total experience</span><input value={interviewForm.totalExperience} onChange={(e) => setInterviewForm((c) => ({ ...c, totalExperience: e.target.value }))} /></label>
                      <label><span>Tenure in current org</span><input value={interviewForm.currentOrgTenure} onChange={(e) => setInterviewForm((c) => ({ ...c, currentOrgTenure: e.target.value }))} /></label>
                      <label><span>Reason of change</span><textarea value={interviewForm.reasonForChange} onChange={(e) => setInterviewForm((c) => ({ ...c, reasonForChange: e.target.value }))} /></label>
                      <label><span>Location</span><input value={interviewForm.location} onChange={(e) => setInterviewForm((c) => ({ ...c, location: e.target.value }))} /></label>
                    </div>
                  </div>

                </div>
              </Section>

              <Section kicker="CV Upload" title="Candidate CV Storage">
                <div className="cv-analysis-box">
                  {statuses.interview ? <div className={`status ${statuses.interviewKind || ""}`}>{statuses.interview}</div> : null}
                  <p className="muted">Upload CV here when you want to keep it ready for later sharing. The file will be stored, parsed once, and the parsed metadata will stay hidden in the backend for AI search and future client-sharing flows.</p>
                  <div className="cv-upload-card">
                    <div className="cv-upload-card__copy">
                      <div className="info-label">Upload CV</div>
                      <div className="muted">Upload once, save to storage, and reuse the cached parse later without repeated AI calls.</div>
                      <div className="muted">
                        {interviewMeta.candidateId
                          ? "Candidate-linked upload is active. This CV should store against the current candidate."
                          : "Open a real candidate draft first if you want this CV stored in S3 for later sharing."}
                      </div>
                    </div>
                    <div className="button-row">
                      <label className="file-btn">
                        <input type="file" accept=".pdf,.doc,.docx" hidden onClick={(e) => { e.target.value = ""; }} onChange={handleInterviewCvSelection} />
                        Upload CV
                      </label>
                    </div>
                  </div>
                  {interviewForm.cvAnalysis?.storedFile ? (
                    <div className="cv-analysis-meta">
                      <span className="status-note">{interviewForm.cvAnalysis.cached ? "Using cached parse" : "Parsed from uploaded CV"}</span>
                      <span className="status-note">{getInterviewCvStoredFileLabel(interviewForm.cvAnalysis)}</span>
                      <span className="status-note">{`Stored: ${getInterviewCvStoredFilePath(interviewForm.cvAnalysis)}`}</span>
                      {interviewMeta.candidateId ? <button className="ghost-btn" onClick={() => openInterviewStoredCv()}>Open uploaded CV</button> : null}
                    </div>
                  ) : null}
                  {interviewForm.cvAnalysis ? (
                    <div className="empty-state compact-empty">
                      <div className="empty-state__title">CV metadata saved</div>
                      <div className="muted">Parsed CV information is stored in candidate metadata for AI Search and later sharing workflows. It is intentionally hidden from the recruiter-facing panel.</div>
                    </div>
                  ) : (
                    <div className="empty-state compact-empty">
                      <div className="empty-state__title">No CV uploaded yet</div>
                      <div className="muted">Upload a CV when you want to save it in storage and keep its parsed metadata ready for future search and client sharing.</div>
                    </div>
                  )}
                </div>
              </Section>

              <Section kicker="Step 5" title="Final Excel Output">
                <p className="muted">Save the assessment and export recruiter-sheet format.</p>
                {statuses.interview ? <div className={`status ${statuses.interviewKind || ""}`}>{statuses.interview}</div> : null}
                <div className="button-row">
                  <button onClick={() => void copyInterviewResult()}>Copy result</button>
                  <button onClick={() => copyInterviewWhatsapp()}>Copy WhatsApp</button>
                  <button onClick={() => void copyInterviewEmail()}>Copy Email</button>
                  <button onClick={() => void saveAssessment()}>{interviewMeta.assessmentId ? "Save assessment" : "Create assessment"}</button>
                  <button onClick={() => sendInterviewToSheets()}>Send to Sheets</button>
                  <button onClick={() => exportInterviewAll()}>Export all</button>
                  <button className="ghost-btn" onClick={() => { setInterviewMeta({ candidateId: "", assessmentId: "" }); setInterviewForm({ candidateName: "", phoneNumber: "", emailId: "", location: "", currentCtc: "", expectedCtc: "", noticePeriod: "", offerInHand: "", lwdOrDoj: "", currentCompany: "", currentDesignation: "", totalExperience: "", currentOrgTenure: "", reasonForChange: "", clientName: "", jdTitle: "", pipelineStage: "Under Interview Process", candidateStatus: "Screening in progress", followUpAt: "", interviewAt: "", recruiterNotes: "", callbackNotes: "", otherPointers: "", jdScreeningAnswers: {}, cvAnalysis: null, cvAnalysisApplied: false, statusHistory: [] }); setStatus("interview", ""); }}>Clear draft</button>
                </div>
              </Section>
            </div>
          } />

          <Route path="/intake-settings" element={
            <div className="page-grid">
              <Section kicker="Company Intake" title="Admin Intake Settings">
                {statuses.intake ? <div className={`status ${statuses.intakeKind || ""}`}>{statuses.intake}</div> : null}
                <div className="form-grid two-col">
                  <label><span>Company ID</span><textarea readOnly value={companyId} /></label>
                  <label><span>Applicant Intake Secret</span><textarea readOnly value={secret} /></label>
                  <label className="full"><span>API URL</span><textarea readOnly value={apiUrl} /></label>
                  <div className="full button-row">
                    <button onClick={() => void copyText(companyId).then(() => setStatus("intake", "Company ID copied.", "ok"))}>Copy Company ID</button>
                    <button onClick={() => void copyText(secret).then(() => setStatus("intake", "Intake secret copied.", "ok"))}>Copy Secret</button>
                    <button onClick={() => void copyText(apiUrl).then(() => setStatus("intake", "API URL copied.", "ok"))}>Copy API URL</button>
                    <button className="ghost-btn" onClick={() => void rotateSecret()}>Rotate Secret</button>
                  </div>
                </div>
              </Section>
              <Section kicker="Recommended" title="RecruitDesk Apply Link">
                <div className="form-grid">
                  <label><span>Select JD / role</span><select value={hostedJobId} onChange={(e) => setHostedJobId(e.target.value)}><option value="">Select JD / role</option>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
                  <label><span>Hosted Apply Link</span><textarea readOnly value={getApplyLink(hostedJobId)} /></label>
                  <div className="button-row"><button onClick={() => void copyText(getApplyLink(hostedJobId)).then(() => setStatus("intake", "Hosted apply link copied.", "ok"))}>Copy Apply Link</button></div>
                </div>
              </Section>
              <Section kicker="WordPress" title="WordPress Website">
                <p className="muted">Use this if the agency has a WordPress form and only needs details intake.</p>
                <textarea className="code-box" readOnly value={buildWordpressSnippet(companyId, secret, apiUrl)} />
              </Section>
              <Section kicker="Google Sheet" title="Google Sheet Row Watcher">
                <p className="muted">Use this if candidate rows are landing in a Google Sheet. Add a <code>recruitdesk_synced</code> column and run it on a time-driven trigger.</p>
                <textarea className="code-box" readOnly value={buildGoogleScript(companyId, secret, apiUrl)} />
              </Section>
            </div>
          } />

            <Route path="/jobs" element={
              <div className="page-grid">
                <Section kicker="Company JDs" title="Jobs">
                {statuses.jobs ? <div className={`status ${statuses.jobsKind || ""}`}>{statuses.jobs}</div> : null}
                <div className="form-grid">
                  <label>
                    <span>Existing jobs</span>
                    <select value={selectedJobId} onChange={(e) => loadJobIntoDraft(e.target.value)}>
                      <option value="">Select JD</option>
                      {state.jobs.map((job) => <option key={job.id} value={job.id}>{job.title || "Untitled JD"}</option>)}
                    </select>
                  </label>
                </div>
              </Section>

              <Section kicker="JD Setup" title="JD Workspace">
                <div className="button-row">
                  <label className="file-btn">
                    Upload JD
                    <input type="file" accept=".txt,.md,.doc,.docx,.pdf" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleJdUpload(file); }} />
                  </label>
                  <button onClick={() => applySelectedJobToInterview()}>Apply generated JD</button>
                  <button onClick={() => generateJdFromText()}>Generate JD from text</button>
                  <button onClick={() => downloadJobDraft()}>Download JD</button>
                  <button onClick={() => void saveJobDraft()}>Save JD</button>
                </div>

                <div className="form-grid two-col">
                  <label><span>Job title</span><input value={jobDraft.title} onChange={(e) => setJobDraft((c) => ({ ...c, title: e.target.value }))} /></label>
                  <label><span>Client</span><input value={jobDraft.clientName} onChange={(e) => setJobDraft((c) => ({ ...c, clientName: e.target.value }))} /></label>
                  <label>
                    <span>Owner recruiter</span>
                    <select
                      value={jobDraft.ownerRecruiterId}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const selectedUser = (state.users || []).find((user) => String(user.id) === String(selectedId)) || null;
                        setJobDraft((c) => ({
                          ...c,
                          ownerRecruiterId: selectedId,
                          ownerRecruiterName: selectedUser?.name || ""
                        }));
                      }}
                    >
                      <option value="">Unassigned</option>
                      {(state.users || []).map((user) => <option key={user.id} value={user.id}>{user.name} | {user.email}</option>)}
                    </select>
                  </label>
                  <label><span>Owner recruiter name</span><input value={jobDraft.ownerRecruiterName} readOnly /></label>
                  <label className="full"><span>Job description</span><textarea className="jd-editor" value={jobDraft.jobDescription} onChange={(e) => setJobDraft((c) => ({ ...c, jobDescription: e.target.value }))} /></label>
                  <label className="full"><span>Must-have skills</span><textarea value={jobDraft.mustHaveSkills} onChange={(e) => setJobDraft((c) => ({ ...c, mustHaveSkills: e.target.value }))} /></label>
                  <label className="full"><span>Red flags</span><textarea value={jobDraft.redFlags} onChange={(e) => setJobDraft((c) => ({ ...c, redFlags: e.target.value }))} /></label>
                  <label className="full"><span>Standard screening questions</span><textarea value={jobDraft.standardQuestions} onChange={(e) => setJobDraft((c) => ({ ...c, standardQuestions: e.target.value }))} /></label>
                  <label className="full"><span>Recruiter notes</span><textarea value={jobDraft.recruiterNotes} onChange={(e) => setJobDraft((c) => ({ ...c, recruiterNotes: e.target.value }))} /></label>
                </div>

                <div className="shortcut-builder">
                  <div className="shortcut-builder__head">
                    <div>
                      <div className="info-label">JD shortcuts</div>
                      <div className="muted">These save in backend JD records and are meant to be reused by extension templates too.</div>
                    </div>
                  </div>
                  <div className="form-grid two-col">
                    <label>
                      <span>Shortcut key</span>
                      <input placeholder="/intro" value={jobShortcutKey} onChange={(e) => setJobShortcutKey(e.target.value)} />
                    </label>
                    <label>
                      <span>Shortcut text / template</span>
                      <textarea value={jobShortcutValue} onChange={(e) => setJobShortcutValue(e.target.value)} />
                    </label>
                  </div>
                  <div className="button-row">
                    <button onClick={() => saveShortcutDraft()}>{jobShortcutKey ? "Update shortcut" : "Add shortcut"}</button>
                  </div>
                  <div className="shortcut-note">Saved format stays extension-compatible in backend. Recruiters only see this simplified editor.</div>
                  <div className="stack-list compact">
                    {jdShortcutEntries.length ? jdShortcutEntries.map(([key, value]) => (
                      <article className="item-card compact-card" key={key}>
                        <div className="item-card__top compact-top">
                          <strong>{key}</strong>
                          <div className="button-row tight">
                            <button className="ghost-btn" onClick={() => editShortcutDraft(key)}>Edit</button>
                            <button className="ghost-btn" onClick={() => deleteShortcutDraft(key)}>Delete</button>
                          </div>
                        </div>
                        <div className="candidate-snippet no-top-border">{String(value || "")}</div>
                      </article>
                    )) : <div className="empty-state">No JD shortcuts yet.</div>}
                  </div>
                </div>
                </Section>
              </div>
            } />

            <Route path="/settings" element={
              <div className="page-grid">
                <Section kicker="Copy Presets" title="Settings">
                  <p className="muted">Set shared Excel preset and default WhatsApp / email formats for filtered captured notes. These settings can be shared across recruiters.</p>
                  {!isSettingsAdmin ? <p className="muted">You can use shared presets here. Only admin can create, edit, or save shared preset settings.</p> : null}
                  {statuses.settings ? <div className={`status ${statuses.settingsKind || ""}`}>{statuses.settings}</div> : null}
                  <div className="form-grid">
                    <label>
                      <span>Excel preset</span>
                      <select value={copySettings.excelPreset} onChange={(e) => setCopySettings((current) => ({ ...current, excelPreset: e.target.value }))}>
                        <option value="compact_recruiter">{copySettings.exportPresetLabels?.compact_recruiter || "Compact recruiter"}</option>
                        <option value="client_tracker">{copySettings.exportPresetLabels?.client_tracker || "Client tracker"}</option>
                        <option value="attentive_tracker">{copySettings.exportPresetLabels?.attentive_tracker || "Attentive tracker"}</option>
                        <option value="client_submission">{copySettings.exportPresetLabels?.client_submission || "Client submission"}</option>
                        <option value="screening_focus">{copySettings.exportPresetLabels?.screening_focus || "Screening focus"}</option>
                        {(copySettings.customExportPresets || []).map((preset) => (
                          <option key={preset.id} value={preset.id}>{preset.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>{isSettingsAdmin ? "Editable preset label" : "Selected preset label"}</span>
                      <input
                        disabled={!isSettingsAdmin}
                        value={selectedPresetLabel}
                        onChange={(e) => updateSelectedPresetLabel(e.target.value)}
                        placeholder="Attentive tracker"
                        spellCheck={false}
                      />
                    </label>
                    <label className="full">
                      <span>{isSettingsAdmin ? "Editable preset columns" : "Selected preset columns"}</span>
                      <textarea
                        className="preset-editor"
                        disabled={!isSettingsAdmin}
                        value={selectedPresetColumns}
                        onChange={(e) => updateSelectedPresetColumns(e.target.value)}
                        placeholder={"S.No.|s_no\nName|name\nStatus|assessment_status"}
                        rows={10}
                        spellCheck={false}
                      />
                    </label>
                    <p className="muted full">
                      {isSettingsAdmin
                        ? "Edit one column per line in Header|field format, then click Save shared settings to apply changes for everyone."
                        : "This preset is managed by your admin. Each line follows Header|field format."}
                    </p>
                    <label className="full">
                      <span>WhatsApp template</span>
                      <textarea disabled={!isSettingsAdmin} value={copySettings.whatsappTemplate} onChange={(e) => setCopySettings((current) => ({ ...current, whatsappTemplate: e.target.value }))} />
                    </label>
                    <label className="full">
                      <span>Email template</span>
                      <textarea disabled={!isSettingsAdmin} value={copySettings.emailTemplate} onChange={(e) => setCopySettings((current) => ({ ...current, emailTemplate: e.target.value }))} />
                    </label>
                    <label><span>New preset label</span><input disabled={!isSettingsAdmin} value={newPresetDraft.label} onChange={(e) => setNewPresetDraft((current) => ({ ...current, label: e.target.value }))} placeholder="Client shortlisting sheet" /></label>
                    <label className="full"><span>New preset columns</span><textarea disabled={!isSettingsAdmin} value={newPresetDraft.columns} onChange={(e) => setNewPresetDraft((current) => ({ ...current, columns: e.target.value }))} placeholder={"S.No.|s_no\nName|name\nStatus|assessment_status"} /></label>
                  </div>
                  <p className="muted">Available placeholders: {`{{index}} {{name}} {{jd_title}} {{company}} {{outcome}} {{recruiter_notes}} {{location}} {{phone}} {{email}} {{source}} {{follow_up_at}}`}</p>
                  {isSettingsAdmin ? <div className="button-row">
                    <button className="ghost-btn" onClick={addCustomPreset}>Add custom preset</button>
                  </div> : null}
                  <div className="stack-list compact">
                    {(copySettings.customExportPresets || []).map((preset) => (
                      <article className="item-card compact-card" key={preset.id}>
                        <div className="item-card__top">
                          <div>
                            <h3>{preset.label}</h3>
                            <div className="candidate-snippet">{preset.columns}</div>
                          </div>
                          {isSettingsAdmin ? <div className="button-row">
                            <button className="ghost-btn" onClick={() => removeCustomPreset(preset.id)}>Remove</button>
                          </div> : null}
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="button-row">
                    <button onClick={() => setCopySettings(DEFAULT_COPY_SETTINGS)}>Reset defaults</button>
                    {isSettingsAdmin ? <button onClick={() => void saveSharedCopySettings()}>Save shared settings</button> : null}
                  </div>
                </Section>
              </div>
            } />

            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
      </main>

      <AssignModal open={Boolean(assignApplicantId)} applicant={assignApplicant} users={state.users} jobs={state.jobs} onClose={() => setAssignApplicantId("")} onSave={saveApplicantAssignment} />
      <AssignModal
        open={Boolean(assignCandidateId)}
        applicant={assignCandidate}
        users={state.users}
        jobs={state.jobs}
        onClose={() => setAssignCandidateId("")}
        onSave={saveCapturedAssignment}
        title="Assign Draft"
        description="Assign {name} to a recruiter and JD."
        nameKey="name"
      />
      <NotesModal
        open={Boolean(notesCandidateId)}
        candidate={notesCandidate}
        onClose={() => setNotesCandidateId("")}
        onPatch={async (patch, message) => { await patchCandidate(notesCandidateId, patch, message || "Recruiter note updated."); setNotesCandidateId(""); }}
        onParse={async (rawText) => api("/parse-note", token, "POST", {
          note: rawText,
          source: "portal_manual",
          client_name: notesCandidate?.client_name || "",
          jd_title: notesCandidate?.jd_title || "",
          preview: true
        })}
      />
      <NewDraftModal
        open={newDraftOpen}
        form={newDraftForm}
        users={state.users}
        jobs={state.jobs}
        currentUser={state.user}
        onChange={(key, value) => setNewDraftForm((current) => ({ ...current, [key]: value }))}
        onClose={() => setNewDraftOpen(false)}
        onSave={() => void createManualDraft()}
      />
      <AttemptsModal open={Boolean(attemptsCandidateId)} candidate={attemptsCandidate} attempts={attempts} onClose={() => setAttemptsCandidateId("")} onRefresh={refreshAttempts} onSave={saveAttempt} />
      <AssessmentStatusModal open={Boolean(assessmentStatusId)} assessment={assessmentStatusItem} onClose={() => setAssessmentStatusId("")} onSave={(payload) => saveAssessmentStatusUpdate(assessmentStatusItem, payload)} />
      <DrilldownModal
        open={drilldownState.open}
        title={drilldownState.title}
        items={drilldownState.items}
        onClose={() => setDrilldownState({ open: false, title: "", items: [] })}
        onOpenCv={(candidateId) => void openCv(candidateId)}
        onOpenDraft={(candidateId) => { setDrilldownState({ open: false, title: "", items: [] }); loadCandidateIntoInterview(candidateId); }}
        onOpenAssessment={(assessment) => { setDrilldownState({ open: false, title: "", items: [] }); openSavedAssessment(assessment); }}
      />
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY) || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login({ email, password }) {
    try {
      setBusy(true);
      setError("");
      const result = await api("/auth/login", "", "POST", { email, password });
      localStorage.setItem(TOKEN_KEY, result.token || "");
      setToken(result.token || "");
    } catch (loginError) {
      setError(String(loginError?.message || loginError));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
  }

  if (!token) return <LoginScreen onLogin={login} busy={busy} error={error} />;
  return <PortalApp token={token} onLogout={logout} />;
}
