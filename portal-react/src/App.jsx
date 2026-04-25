import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import BrandLogo from "./components/branding/BrandLogo";
import {
  CLIENT_BROWSER_TITLE,
  CLIENT_PORTAL_LABEL,
  COMPANY_ATTRIBUTION,
  PRODUCT_NAME,
  RECRUITER_BROWSER_TITLE,
  RECRUITER_PORTAL_LABEL
} from "./components/branding/brandConfig";

const TOKEN_KEY = "recruitdesk_portal_token";
const CLIENT_TOKEN_KEY = "recruitdesk_client_portal_token";
const AUTH_MODE_KEY = "recruitdesk_auth_mode";
const COPY_SETTINGS_STORAGE_KEY = "recruitdesk_portal_copy_settings_v1";

const BASE_NAV_SECTIONS = [
  {
    label: "Core",
    items: [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/quick-update", label: "Quick Update" },
      { to: "/jobs", label: "Jobs" },
      { to: "/mail-settings", label: "Mail Settings" }
    ]
  },
  {
    label: "Sourcing",
    items: [
      { to: "/captured-notes", label: "Captured Notes" },
      { to: "/applicants", label: "Applied Candidates" }
    ]
  },
  {
    label: "Pipeline",
    items: [
      { to: "/interview", label: "Interview Panel" },
      { to: "/assessments", label: "Assessments" },
      { to: "/client-share", label: "Direct Share" }
    ]
  },
  {
    label: "Admin",
    items: [
      { to: "/login-settings", label: "Login Settings" },
      { to: "/intake-settings", label: "Job Apply Link" },
      { to: "/settings", label: "Preset Settings" }
    ]
  }
];

const STANDALONE_NAV_ITEMS = [
  { to: "/candidates", label: "Database" }
];

	const DEFAULT_COPY_SETTINGS = {
	  excelPreset: "compact_recruiter",
  // When enabled, /company/candidates/search-natural will use embeddings for semantic reranking.
  // Admin can turn it off for the whole workspace from Preset Settings.
  semanticSearchEnabled: true,
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
	    attentive_tracker: "S.No.|s_no\nName|name\nStatus|assessment_status\nPh|phone\nEmail|email\nLocation|location\nCurrent Company|current_company\nCurrent Designation|current_designation\nWork Experience|total_experience\nHighest Education|highest_education\nCurrent CTC|current_ctc\nExpected CTC|expected_ctc\nNotice Period|notice_period\nScreening remarks|screening_remarks\nLinkedIn|linkedin",
	    client_submission: "S.No.|s_no\nName|name\nPh|phone\nEmail|email\nCurrent Company|current_company\nCurrent Designation|current_designation\nTotal Experience|total_experience\nStrong Points|other_pointers\nRemarks|remarks",
	    screening_focus: "S.No.|s_no\nName|name\nCurrent CTC|current_ctc\nExpected CTC|expected_ctc\nNotice Period|notice_period\nScreening Answers|other_standard_questions\nRemarks|remarks"
	  },
  exportPresetClientMap: {},
  customExportPresets: [],
  whatsappTemplate: "{{index}}. {{name}}\nRole: {{jd_title}}\nCompany: {{company}}\nOutcome: {{outcome}}\nRecruiter note: {{recruiter_notes}}",
  emailTemplate: "{{index}}. {{name}}\nCompany: {{company}}\nRole: {{jd_title}}\nLocation: {{location}}\nOutcome: {{outcome}}\nEmail: {{email}}\nPhone: {{phone}}\nNotes: {{recruiter_notes}}",
  clientShareIntroTemplate: "Hello {{hr_name}},\n\nGreetings !!\n\nThis is {{recruiter_name}} from {{company_name}}.\nPFA the profiles{{role_line}}.\nKindly review and share your feedback.",
  clientShareSignatureText: "Regards,\n{{recruiter_name}}\n{{company_name}}",
  clientShareSignatureLinkLabel: "",
  clientShareSignatureLinkUrl: "",
  clientShareSignatureLinkLabel2: "",
  clientShareSignatureLinkUrl2: "",
  jdEmailSubjectTemplate: "Job Description - {Role}",
  jdEmailIntroTemplate: "Hello {Candidate}.\nGreetings !!\n\nThis is {Recruiter} from Kompatible Minds.\nIt was good to interact with you.\n\nAs discussed, please find the Job description for the {Role}.\nPlease acknowledge or confirm so we can take your candidature ahead."
};

	function migrateCopySettings(settings = {}) {
	  const next = { ...DEFAULT_COPY_SETTINGS, ...(settings || {}) };
	  next.semanticSearchEnabled = next.semanticSearchEnabled !== false;
	  const presetColumns = { ...(next.exportPresetColumns || {}) };
	  const attentive = String(presetColumns.attentive_tracker || "").trim();
	  if (attentive) {
	    const lines = attentive.split(/\r?\n/).map((line) => String(line || "").trim()).filter(Boolean);
	    let didChange = false;
	    const migratedLines = lines.map((line) => {
	      const parts = line.split("|");
	      if (parts.length < 2) return line;
	      const field = String(parts[parts.length - 1] || "").trim();
	      if (field === "notice_period_indicator") {
	        parts[parts.length - 1] = "notice_period";
	        didChange = true;
	        return parts.join("|");
	      }
	      return line;
	    });
	    const beforeCount = migratedLines.length;
	    const cleanedLines = migratedLines.filter((line) => !String(line).includes("|reason_of_change_indicator"));
	    if (cleanedLines.length !== beforeCount) didChange = true;
	    if (didChange) presetColumns.attentive_tracker = cleanedLines.join("\n");
	  }
	  next.exportPresetColumns = presetColumns;
	  return next;
	}

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

const SMART_SEARCH_QUICK_CHIPS = [
  { id: "aligned_interviews", label: "Aligned interviews", querySuffix: "assessment status screening call aligned or L1 aligned or L2 aligned or L3 aligned or HR interview aligned" },
  { id: "feedback_awaited", label: "Feedback awaited", querySuffix: "assessment status feedback awaited" },
  { id: "quick_joiners", label: "Quick joiners (<=15 days)", querySuffix: "notice period under 15 days" },
  { id: "offered_candidates", label: "Offered candidates", querySuffix: "assessment status offered" },
  { id: "cv_shared", label: "CV shared", querySuffix: "assessment status cv shared" }
];
const SMART_CHIP_INTERVIEW_ALIGNED_STATUSES = new Set([
  "screening call aligned",
  "l1 aligned",
  "l2 aligned",
  "l3 aligned",
  "hr interview aligned"
]);

function parseKeywordBarTokens(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatBooleanToken(token) {
  const value = String(token || "").trim();
  if (!value) return "";
  if (/^".*"$/.test(value)) return value;
  return /\s/.test(value) ? `"${value}"` : value;
}

function buildBooleanFromKeywordBars({ must = "", any = "", exclude = "" } = {}) {
  const mustTokens = parseKeywordBarTokens(must).map(formatBooleanToken).filter(Boolean);
  const anyTokens = parseKeywordBarTokens(any).map(formatBooleanToken).filter(Boolean);
  const excludeTokens = parseKeywordBarTokens(exclude).map(formatBooleanToken).filter(Boolean);
  const positiveParts = [];
  if (mustTokens.length) positiveParts.push(mustTokens.join(" AND "));
  if (anyTokens.length) positiveParts.push(`(${anyTokens.join(" OR ")})`);
  const positiveQuery = positiveParts.join(" AND ").trim();
  const excludeQuery = excludeTokens.length ? `NOT (${excludeTokens.join(" OR ")})` : "";
  return [positiveQuery, excludeQuery].filter(Boolean).join(" ").trim();
}

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
  "CV shared",
  "Test or Assignment shared",
  "Screening call aligned",
  "L1 aligned",
  "L2 aligned",
  "L3 aligned",
  "HR interview aligned",
  "Offered",
  "Feedback Awaited",
  "Hold",
  "Not responding",
  "Dropped",
  "Screening Reject",
  "Interview Reject",
  "Duplicate",
  "Shortlisted",
  "Joined"
];

const APPLIED_OUTCOME_FILTER_ORDER = [
  "No outcome",
  "Not responding",
  "Busy",
  "Switch Off",
  "Disconnected",
  "Not reachable",
  "Call later",
  "Duplicate",
  "JD shared",
  "Interested",
  "Hold by recruiter",
  "Not interested",
  "Screening reject",
  "Revisit for other role"
];
const ATTEMPT_OUTCOME_OPTIONS = APPLIED_OUTCOME_FILTER_ORDER;

function normalizeAttemptOutcomeLabel(outcome) {
  const value = String(outcome || "").trim();
  const key = value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const map = {
    "": "No outcome",
    "no outcome": "No outcome",
    "not responding": "Not responding",
    "nr": "Not responding",
    "no response": "Not responding",
    "busy": "Busy",
    "duplicate": "Duplicate",
    "jd shared": "JD shared",
    "shared jd": "JD shared",
    "switch off": "Switch Off",
    "switched off": "Switch Off",
    "disconnected": "Disconnected",
    "not reachable": "Not reachable",
    "call back later": "Call later",
    "callback later": "Call later",
    "call later": "Call later",
    "interested": "Interested",
    "hold": "Hold by recruiter",
    "hold by recruiter": "Hold by recruiter",
    "not interested": "Not interested",
    "screening reject": "Screening reject",
    "revisit for other role": "Revisit for other role"
  };
  return map[key] || value;
}

const EMPTY_CANDIDATE_STRUCTURED_FILTERS = {
  minExperience: "",
  maxExperience: "",
  location: "",
  keySkills: "",
  currentCompany: "",
  client: "",
  minCurrentCtc: "",
  maxCurrentCtc: "",
  minExpectedCtc: "",
  maxExpectedCtc: "",
  qualification: "",
  maxNoticeDays: "",
  noticeBucket: "",
  recruiter: "",
  gender: "",
  assessmentStatus: "",
  attemptOutcome: ""
};

const DASHBOARD_METRIC_COLUMNS = [
  ["sourced", "Sourced"],
  ["applied", "Applied"],
  ["converted", "Shared"],
  ["under_interview_process", "Under Interview"],
  ["hold", "Hold"],
  ["rejected", "Rejected"],
  ["duplicate", "Duplicate"],
  ["dropped", "Dropped"],
  ["shortlisted", "Shortlisted"],
  ["offered", "Offered"],
  ["joined", "Joined"]
];

const DASHBOARD_METRIC_TILES = [
  ["sourced", "Sourced"],
  ["applied", "Applied"],
  ["converted", "Shared"],
  ["under_interview_process", "Under Interview"],
  ["hold", "Hold"],
  ["offered", "Offered"],
  ["joined", "Joined"]
];

const CLIENT_PORTAL_METRICS = [
  ["total_shared", "Total Shared"],
  ["in_interview_stage", "In Interview Stage"],
  ["to_be_reviewed", "To Be Reviewed"],
  ["rejected", "Rejected"],
  ["duplicates", "Duplicates"],
  ["put_on_hold", "Put on Hold"],
  ["interview_dropout", "Interview Dropout"]
];

const CLIENT_PORTAL_STATUS_LABELS = {
  to_be_reviewed: "Under Review",
  in_interview_stage: "Under Interview",
  rejected: "Rejected",
  duplicates: "Duplicates",
  put_on_hold: "On Hold",
  interview_dropout: "Interview Dropout"
};

function formatClientPortalStatusLabel(value) {
  const normalized = normalizeAssessmentStatusLabel(value);
  if (!normalized) return "";
  if (normalized.toLowerCase() === "cv to be shared") return "CV Shared";
  return normalized;
}

class PortalErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: String(error?.message || error || "Portal crashed.")
    };
  }

  componentDidCatch(error) {
    console.error("Portal render error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell">
          <main className="content">
            <Section kicker="Portal Error" title="Screen crashed">
              <p className="muted">Portal blank screen avoid karne ke liye fallback dikhaya gaya hai. Page refresh karke ya latest deploy ke baad dubara try karo.</p>
              <div className="status error">{this.state.errorMessage || "Unknown portal error."}</div>
              <div className="button-row">
                <button onClick={() => window.location.reload()}>Reload portal</button>
              </div>
            </Section>
          </main>
        </div>
      );
    }
    return this.props.children;
  }
}

class RouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: String(error?.message || error || "Page crashed.")
    };
  }

  componentDidCatch(error) {
    console.error("Portal route render error", error);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.routeKey !== this.props.routeKey && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: "" });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Section kicker="Page Error" title="This page crashed">
          <p className="muted">Portal baaki pages ke saath working rehna chahiye. Kisi aur tab par ja sakte ho, aur is page ko baad me retry kar sakte ho.</p>
          <div className="status error">{this.state.errorMessage || "Unknown page error."}</div>
          <div className="button-row">
            <button onClick={() => window.location.reload()}>Reload portal</button>
          </div>
        </Section>
      );
    }
    return this.props.children;
  }
}

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

function normalizeAssessmentStatusLabel(status) {
  const value = String(status || "").trim();
  if (!value) return "";
  if (/^cv shared$/i.test(value)) return "CV shared";
  if (/^cv to be shared$/i.test(value)) return "CV shared";
  if (/^test\b/i.test(value)) return "Test or Assignment shared";
  if (/\bassignment\b/i.test(value)) return "Test or Assignment shared";
  if (/^did not attend$/i.test(value)) return "Not responding";
  return value;
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

function parseLocationFilterTokens(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return [];
  // Support comma-separated lists and simple OR usage.
  return raw
    .replace(/\s+or\s+/g, ",")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseMultiChipTokens(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toggleMultiChipValue(value, option) {
  const current = parseMultiChipTokens(value);
  if (option === "__all__") return "";
  if (current.includes(option)) {
    return current.filter((item) => item !== option).join(", ");
  }
  return [...current, option].join(", ");
}

const NOTICE_BUCKET_OPTIONS = [
  { value: "", label: "Any notice period" },
  { value: "immediate", label: "Immediate" },
  { value: "15_or_less", label: "15 days or less" },
  { value: "15_30", label: "15-30 days" },
  { value: "30_60", label: "30-60 days" },
  { value: "60_90", label: "60-90 days" },
  { value: "90_plus", label: "90+ days" }
];

function bucketNoticeDays(days) {
  if (days == null || !Number.isFinite(Number(days))) return "";
  const value = Number(days);
  if (value <= 0) return "immediate";
  if (value <= 15) return "15_or_less";
  if (value <= 30) return "15_30";
  if (value <= 60) return "30_60";
  if (value <= 90) return "60_90";
  return "90_plus";
}

function mapMaxNoticeDaysToBucket(maxNoticeDays) {
  const value = Number(maxNoticeDays);
  if (!Number.isFinite(value)) return "";
  if (value <= 0) return "immediate";
  if (value <= 15) return "15_or_less";
  if (value <= 30) return "15_30";
  if (value <= 60) return "30_60";
  if (value <= 90) return "60_90";
  return "90_plus";
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
  const candidate = item?.raw?.candidate || item;
  const raw = String(candidate?.raw_note || "").trim();
  if (!raw.startsWith(PORTAL_APPLICANT_METADATA_PREFIX)) return {};
  try {
    return JSON.parse(raw.slice(PORTAL_APPLICANT_METADATA_PREFIX.length));
  } catch {
    return {};
  }
}

function encodePortalApplicantMetadata(metadata = {}) {
  return `${PORTAL_APPLICANT_METADATA_PREFIX}${JSON.stringify(metadata || {})}`;
}

function parsePortalObjectField(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const raw = String(value || "").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function getCandidateDraftState(candidate = {}) {
  const source = candidate?.raw?.candidate || candidate;
  const meta = decodePortalApplicantMetadata(source);
  const draftPayload = parsePortalObjectField(source?.draft_payload || source?.draftPayload);
  const screeningAnswers = parsePortalObjectField(source?.screening_answers || source?.screeningAnswers);
  const cautiousIndicatorsFallback = String(
    draftPayload?.cautiousIndicators
      || meta?.cautiousIndicators
      || meta?.cautious_indicators
      || meta?.cautiousIndicatorNote
      || meta?.cautious_indicator_note
      || ""
  ).trim();
  return {
    ...draftPayload,
    ...(cautiousIndicatorsFallback ? { cautiousIndicators: cautiousIndicatorsFallback } : {}),
    jdScreeningAnswers: Object.keys(screeningAnswers).length
      ? screeningAnswers
      : draftPayload?.jdScreeningAnswers && typeof draftPayload.jdScreeningAnswers === "object"
        ? draftPayload.jdScreeningAnswers
        : meta?.jdScreeningAnswers || {}
  };
}

function resolveCandidateContext(input = {}) {
  // Canonical resolver so indicators/presets do not have to guess between:
  // - plain candidate rows
  // - universe rows (raw.candidate/raw.assessment)
  // - assessment-only rows
  const raw = input || {};
  const candidate = raw?.raw?.candidate || raw?.candidate || raw;
  const assessment = raw?.raw?.assessment || raw?.assessment || null;
  const draft = getCandidateDraftState(candidate);

  const screeningMap =
    (draft?.jdScreeningAnswers && typeof draft.jdScreeningAnswers === "object" ? draft.jdScreeningAnswers : null)
    || (candidate?.screening_answers && typeof candidate.screening_answers === "object" ? candidate.screening_answers : null)
    || (candidate?.screeningAnswers && typeof candidate.screeningAnswers === "object" ? candidate.screeningAnswers : null)
    || null;

  const otherStandardQuestions = String(
    assessment?.other_standard_questions
      || assessment?.otherStandardQuestions
      || assessment?.otherStandardQuestionAnswers
      || candidate?.other_standard_questions
      || candidate?.otherStandardQuestions
      || candidate?.last_contact_notes
      || candidate?.lastContactNotes
      || ""
  ).trim();

  const meta = decodePortalApplicantMetadata(candidate);
  const cvResult = meta?.cvAnalysisCache?.result && typeof meta.cvAnalysisCache.result === "object" ? meta.cvAnalysisCache.result : null;
  const highlights = Array.isArray(candidate?.cv_highlights)
    ? candidate.cv_highlights
    : Array.isArray(candidate?.highlights)
      ? candidate.highlights
      : Array.isArray(candidate?.cvAnalysis?.highlights)
        ? candidate.cvAnalysis.highlights
        : Array.isArray(cvResult?.highlights)
          ? cvResult.highlights
          : [];

  const phone = String(candidate?.phone || candidate?.phoneNumber || assessment?.phoneNumber || assessment?.phone || draft?.phoneNumber || "").trim();
  const email = String(candidate?.email || candidate?.emailId || assessment?.emailId || assessment?.email || draft?.emailId || "").trim();
  const linkedin = String(candidate?.linkedin || assessment?.linkedinUrl || draft?.linkedin || "").trim();

  return {
    candidate,
    assessment,
    draft,
    screeningMap,
    otherStandardQuestions,
    highlights: highlights.map((v) => String(v || "").trim()).filter(Boolean),
    phone,
    email,
    linkedin
  };
}

function buildCandidateDraftPayloadPatch(candidate = {}, patch = {}) {
  const current = getCandidateDraftState(candidate);
  const next = { ...current };
  if (Object.prototype.hasOwnProperty.call(patch, "name") || Object.prototype.hasOwnProperty.call(patch, "candidateName")) next.candidateName = patch.candidateName ?? patch.name ?? next.candidateName ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "phone") || Object.prototype.hasOwnProperty.call(patch, "phoneNumber")) next.phoneNumber = patch.phoneNumber ?? patch.phone ?? next.phoneNumber ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "email") || Object.prototype.hasOwnProperty.call(patch, "emailId")) next.emailId = patch.emailId ?? patch.email ?? next.emailId ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "linkedin") || Object.prototype.hasOwnProperty.call(patch, "linkedinUrl")) next.linkedin = patch.linkedin ?? patch.linkedinUrl ?? next.linkedin ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "location")) next.location = patch.location ?? next.location ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "company") || Object.prototype.hasOwnProperty.call(patch, "currentCompany")) next.currentCompany = patch.currentCompany ?? patch.company ?? next.currentCompany ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "role") || Object.prototype.hasOwnProperty.call(patch, "currentDesignation")) next.currentDesignation = patch.currentDesignation ?? patch.role ?? next.currentDesignation ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "experience") || Object.prototype.hasOwnProperty.call(patch, "totalExperience")) next.totalExperience = patch.totalExperience ?? patch.experience ?? next.totalExperience ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "relevantExperience") || Object.prototype.hasOwnProperty.call(patch, "relevant_experience")) next.relevantExperience = patch.relevantExperience ?? patch.relevant_experience ?? next.relevantExperience ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "highest_education") || Object.prototype.hasOwnProperty.call(patch, "highestEducation")) next.highestEducation = patch.highestEducation ?? patch.highest_education ?? next.highestEducation ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "current_ctc") || Object.prototype.hasOwnProperty.call(patch, "currentCtc")) next.currentCtc = patch.currentCtc ?? patch.current_ctc ?? next.currentCtc ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "expected_ctc") || Object.prototype.hasOwnProperty.call(patch, "expectedCtc")) next.expectedCtc = patch.expectedCtc ?? patch.expected_ctc ?? next.expectedCtc ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "notice_period") || Object.prototype.hasOwnProperty.call(patch, "noticePeriod")) next.noticePeriod = patch.noticePeriod ?? patch.notice_period ?? next.noticePeriod ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "lwd_or_doj") || Object.prototype.hasOwnProperty.call(patch, "lwdOrDoj")) next.lwdOrDoj = patch.lwdOrDoj ?? patch.lwd_or_doj ?? next.lwdOrDoj ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "recruiter_context_notes") || Object.prototype.hasOwnProperty.call(patch, "recruiterNotes")) next.recruiterNotes = patch.recruiterNotes ?? patch.recruiter_context_notes ?? next.recruiterNotes ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "notes") || Object.prototype.hasOwnProperty.call(patch, "callbackNotes")) next.callbackNotes = patch.callbackNotes ?? patch.notes ?? next.callbackNotes ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "other_pointers") || Object.prototype.hasOwnProperty.call(patch, "otherPointers")) next.otherPointers = patch.otherPointers ?? patch.other_pointers ?? next.otherPointers ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "jd_title") || Object.prototype.hasOwnProperty.call(patch, "jdTitle")) next.jdTitle = patch.jdTitle ?? patch.jd_title ?? next.jdTitle ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "client_name") || Object.prototype.hasOwnProperty.call(patch, "clientName")) next.clientName = patch.clientName ?? patch.client_name ?? next.clientName ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "next_follow_up_at") || Object.prototype.hasOwnProperty.call(patch, "nextFollowUpAt")) next.followUpAt = patch.nextFollowUpAt ?? patch.next_follow_up_at ?? next.followUpAt ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "skills")) next.tags = Array.isArray(patch.skills) ? patch.skills.join(", ") : next.tags ?? "";
  if (Object.prototype.hasOwnProperty.call(patch, "screening_answers") || Object.prototype.hasOwnProperty.call(patch, "screeningAnswers")) {
    next.jdScreeningAnswers = patch.screeningAnswers ?? patch.screening_answers ?? next.jdScreeningAnswers ?? {};
  }
  return next;
}

function sanitizeLwdOrDojValue(value) {
  return String(value || "")
    .trim()
    .replace(/^(?:lwd\s*\/\s*doj|lwd|doj|last working day)\s*(?:is|:|-)?\s*/i, "")
    .replace(/^(?:\/\s*)?(?:lwd|doj)\s*(?:is|:|-)?\s*/i, "")
    .trim();
}

function candidateHasStoredCv(item = {}) {
  const candidate = item?.raw?.candidate || item;
  const meta = decodePortalApplicantMetadata(candidate);
  const storedFile = candidate.cvAnalysis?.storedFile || candidate.cv_analysis?.storedFile || meta?.cvAnalysisCache?.storedFile || {};
  return Boolean(
    candidate.cv_url
    || candidate.cvUrl
    || candidate.cv_key
    || candidate.cvKey
    || candidate.cv_filename
    || candidate.cvFilename
    || meta?.fileProvider
    || meta?.fileKey
    || meta?.fileUrl
    || storedFile?.key
    || storedFile?.url
  );
}

function getCandidateProfileCvMeta(item = {}) {
  const candidate = item?.raw?.candidate || item;
  const meta = decodePortalApplicantMetadata(candidate);
  const storedFile = candidate.cvAnalysis?.storedFile || candidate.cv_analysis?.storedFile || meta?.cvAnalysisCache?.storedFile || {};
  return {
    candidateId: candidate.candidate_id || candidate.candidateId || candidate.id || "",
    url: candidate.cv_url || candidate.cvUrl || meta?.fileUrl || storedFile?.url || "",
    filename: candidate.cv_filename || candidate.cvFilename || meta?.filename || storedFile?.filename || "",
    key: candidate.cv_key || candidate.cvKey || meta?.fileKey || storedFile?.key || "",
    provider: candidate.cv_provider || candidate.cvProvider || meta?.fileProvider || storedFile?.provider || ""
  };
}

function buildVisibleTagList(item = {}) {
  const explicit = Array.isArray(item.skills) ? item.skills : [];
  const inferred = Array.isArray(item.inferredTags) ? item.inferredTags : [];
  return Array.from(new Set([...explicit, ...inferred].map((tag) => String(tag || "").trim()).filter(Boolean)));
}

function parseTagInputValue(raw = "") {
  return String(raw || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildInterviewCvAnalysis(baseForm = {}, result = {}, storedFile = null) {
  return {
    exactTotalExperience: result.totalExperience || "",
    currentCompany: result.currentCompany || "",
    currentDesignation: result.currentDesignation || "",
    currentOrgTenure: result.currentOrgTenure || "",
    highestEducation: result.highestEducation || "",
    candidateName: result.candidateName || "",
    emailId: result.emailId || "",
    phoneNumber: result.phoneNumber || "",
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

function normalizeParsedRecruiterValue(value) {
  return String(value || "")
    .trim()
    .replace(/^[\s\-–—:;]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCanonicalRecruiterNotes(baseText, currentText, mergedValues = {}) {
  const lines = [];
  const pushStructured = (label, value) => {
    const clean = label === "LWD / DOJ" ? sanitizeLwdOrDojValue(value) : normalizeParsedRecruiterValue(value);
    if (!clean) return;
    lines.push(`${label}: ${clean}`);
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
    const clean = normalizeParsedRecruiterValue(value);
    if (!clean) return;
    lines.push(`${label}: ${clean}`);
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
    const clean = normalizeParsedRecruiterValue(value);
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
  if (/\bduplicate\b/.test(value)) return { outcome: "Duplicate", followUpAt: "", candidateStatus: "Duplicate" };
  if (/\bjd shared\b|\bshared jd\b/.test(value)) return { outcome: "JD shared", followUpAt: "", candidateStatus: "" };
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
    "cv to be shared",
    "test",
    "assignment",
    "screening call aligned",
    "l1 aligned",
    "l2 aligned",
    "l3 aligned",
    "hr interview aligned",
    "feedback awaited",
    "hold",
    "did not attend",
    "not responding",
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
  const hasReject = /\breject\b|\brejected\b|\brejct\b|\brject\b|\brejecte?d?\b/.test(value);
  const hasScreening = /\bscreening\b/.test(value);
  const hasHr = /\bhr\b/.test(value);
  const hasL2 = /\bl2\b/.test(value);
  const hasL1 = /\bl1\b/.test(value);
  const hasScreeningCall = /\bscreening\b/.test(value);
  const hasFeedback = /\bfeedback\b/.test(value);
  const hasHold = /\bon hold\b|\bhold\b|\bhigh notice\b|\bhigh ctc\b|\bout of budget\b/.test(value);
  const hasTestOrAssignment = /\btest\b|\bassignment\b|\bassignment shared\b/.test(value);
  const hasNotResponding = /\bnr\b|\bnot responding\b|\bno response\b|\bno answer\b|\bdid not pick up\b|\bdid not join\b|\bdid not attend\b/.test(value);
  const hasDuplicate = /\bduplicate\b/.test(value);
  const hasShortlisted = /\bshortlisted\b|\bselected\b/.test(value);
  const hasJoined = /\bjoined\b/.test(value);

  let candidateStatus = "";
  if (hasOffer && hasDropped) candidateStatus = "Dropped";
  else if (hasScreening && (hasReject || /\bsr\b/.test(value))) candidateStatus = "Screening Reject";
  else if (hasNotResponding) candidateStatus = "Not responding";
  else if (hasDropped) candidateStatus = "Dropped";
  else if (hasDuplicate) candidateStatus = "Duplicate";
  else if (hasJoined) candidateStatus = "Joined";
  else if (hasShortlisted) candidateStatus = "Shortlisted";
  else if (hasOffer) candidateStatus = "Offered";
  else if (hasReject) candidateStatus = "Interview Reject";
  else if (hasFeedback) candidateStatus = "Feedback Awaited";
  else if (hasHold) candidateStatus = "Hold";
  else if (hasTestOrAssignment) candidateStatus = "Test or Assignment shared";
  else if (hasHr) candidateStatus = "HR interview aligned";
  else if (hasL2) candidateStatus = "L2 aligned";
  else if (hasL1) candidateStatus = "L1 aligned";
  else if (hasScreeningCall) candidateStatus = "Screening call aligned";

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
  const candidateCreatedAt = candidate?.created_at || candidate?.createdAt || "";
  if (candidateCreatedAt) {
    const sourceValue = String(candidate?.source || "").trim();
    const isApplied = ["website_apply", "hosted_apply", "google_sheet"].includes(sourceValue);
    entries.push({
      at: candidateCreatedAt,
      text: `${isApplied ? "Applied" : "Captured note created"}${sourceValue ? ` | ${sourceValue}` : ""}`
    });
  }
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
      text: `Log attempt | ${item?.outcome || "Attempt"}${noteLines ? ` | ${noteLines}` : ""}`
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
      text: `Log attempt | ${candidate?.last_contact_outcome || "Attempt"}${noteLines ? ` | ${noteLines}` : ""}`
    });
  }

  if (assessment?.generatedAt) {
    entries.push({
      at: assessment.generatedAt,
      text: `Assessment created | ${normalizeAssessmentStatusLabel(assessment?.candidateStatus) || "CV shared"}`
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

  const feedbackHistory = Array.isArray(assessment?.clientFeedbackHistory) ? assessment.clientFeedbackHistory : [];
  feedbackHistory.forEach((item) => {
    const when = item?.updatedAt || item?.at || "";
    if (!when) return;
    entries.push({
      at: when,
      text: `Client feedback | ${[item?.status, item?.feedback, item?.interviewAt ? `Interview ${new Date(item.interviewAt).toLocaleString()}` : "", item?.updatedBy].filter(Boolean).join(" | ")}`
    });
  });

  return entries
    .filter((item) => item.at && item.text)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

function getLatestAssessmentStatusPreview(assessment = {}) {
  const statusHistory = Array.isArray(assessment?.statusHistory) ? assessment.statusHistory : [];
  const latest = statusHistory.length ? statusHistory[statusHistory.length - 1] : null;
  return {
    status: String(latest?.status || assessment?.candidateStatus || "").trim(),
    remarks: String(latest?.manualRemarks || "").trim(),
    at: String(latest?.at || assessment?.updatedAt || "").trim()
  };
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
  return lines.map((line) => (/^\[[^\]]+\]\s/.test(line) ? line : `${stamp ? `[${stamp}] ` : ""}${line}`)).join("\n");
}

function buildDefaultAttemptRemark(outcome) {
  const value = String(outcome || "").trim();
  if (!value) return "";
  if (value === "JD shared") return "JD shared";
  if (value === "Duplicate") return "Duplicate";
  return "";
}

function buildAttemptHistoryLine({ outcome = "", remarks = "", followUpAt = "", atValue = "" }) {
  const bits = [String(outcome || "").trim()].filter(Boolean);
  const cleanedRemarks = String(remarks || "").trim();
  if (cleanedRemarks) bits.push(`Remarks: ${cleanedRemarks}`);
  if (followUpAt) bits.push(`Follow-up: ${new Date(followUpAt).toLocaleString()}`);
  const line = bits.join(" | ").trim();
  if (!line) return "";
  const stamp = atValue ? new Date(atValue).toLocaleString() : "";
  return stamp ? `[${stamp}] ${line}` : line;
}

function appendAttemptHistory(existingText, nextLine) {
  const existingLines = String(existingText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const line = String(nextLine || "").trim();
  if (!line) return existingLines.join("\n");
  return [...existingLines, line].join("\n");
}

function extractLatestAttemptLine(text) {
  const lines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : "";
}

function extractAttemptRemarks(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  const remarksMatch = value.match(/(?:^|\|)\s*remarks:\s*(.+?)(?:\s*\|\s*follow-up:|\s*$)/i);
  return String(remarksMatch?.[1] || "").trim();
}

function normalizeRecruiterMergeBase(item) {
  const source = item || {};
  const base = {
    name: String(source.name || source.candidateName || "").trim(),
    company: String(source.company || source.currentCompany || "").trim(),
    role: String(source.role || source.currentDesignation || "").trim(),
    experience: String(source.experience || source.totalExperience || "").trim(),
    location: String(source.location || "").trim(),
    current_ctc: normalizeParsedRecruiterValue(source.current_ctc || source.currentCtc || ""),
    expected_ctc: normalizeParsedRecruiterValue(source.expected_ctc || source.expectedCtc || ""),
    notice_period: normalizeParsedRecruiterValue(source.notice_period || source.noticePeriod || ""),
    lwd_or_doj: sanitizeLwdOrDojValue(source.lwd_or_doj || source.lwdOrDoj || ""),
    offer_in_hand: normalizeParsedRecruiterValue(source.offer_in_hand || source.offerInHand || ""),
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

function normalizeRecruiterConflictValue(key, value) {
  let normalized = String(value || "")
    .trim()
    .replace(/^[\s\-–—:]+/, "")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .toLowerCase();
  normalized = normalized.replace(/^[^a-z0-9]+/i, "").trim();
  if (!normalized) return "";
  if (["current_ctc", "expected_ctc", "offer_in_hand"].includes(key)) {
    const amount = normalized.match(/(\d+(?:\.\d+)?)/);
    if (amount) return `${Number(amount[1])}l`;
  }
  if (key === "notice_period") {
    const days = normalized.match(/(\d+(?:\.\d+)?)\s*(?:days?|d)\b/);
    if (days) return `${Number(days[1])}days`;
    const months = normalized.match(/(\d+(?:\.\d+)?)\s*(?:months?|m)\b/);
    if (months) return `${Number(months[1])}months`;
    normalized = normalized.replace(/^notice\s*period\s*(?:is|:|-)?\s*/i, "").trim();
  }
  if (key === "lwd_or_doj") normalized = normalized.replace(/^(lwd|doj|last working day)\s*(?:is|:|-)?\s*/i, "").trim();
  return normalized.replace(/[.\s]+$/g, "");
}

function isMeaningfulRecruiterConflict(key, fromValue, toValue) {
  const fromNormalized = normalizeRecruiterConflictValue(key, fromValue);
  const toNormalized = normalizeRecruiterConflictValue(key, toValue);
  return Boolean(fromNormalized && toNormalized && fromNormalized !== toNormalized);
}

function extractRecruiterNoteFieldFallbacks(rawNote = "") {
  const text = String(rawNote || "").trim();
  if (!text) return { current_ctc: "", expected_ctc: "", notice_period: "", lwd_or_doj: "", offer_in_hand: "" };
  const findLineValue = (patterns) => {
    const lines = text.split(/\r?\n/).map((line) => String(line || "").trim()).filter(Boolean);
    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match?.[1]) {
          const extracted = normalizeParsedRecruiterValue(match[1]);
          return patterns === lwdPatterns ? sanitizeLwdOrDojValue(extracted) : extracted;
        }
      }
    }
    return "";
  };
  const lwdPatterns = [
    /^\s*lwd(?:\s*is|:)?\s*([^\n]+)/i,
    /^\s*lwd\s*-\s*([^\n]+)/i,
    /^\s*doj(?:\s*is|:)?\s*([^\n]+)/i,
    /^\s*doj\s*-\s*([^\n]+)/i,
    /^\s*last\s*working\s*day(?:\s*is|:)?\s*([^\n]+)/i,
    /\blwd\s*(?:as|is|=)\s*([^\n]+)/i,
    /\bdoj\s*(?:as|is|=)\s*([^\n]+)/i,
    /\bserving\s*notice.*?\blwd\s*(?:as|is|=)?\s*([^\n]+)/i
  ];
return {
  current_ctc: findLineValue([
    /^\s*current\s*ctc(?:\s*is|:)?\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i,
    /^\s*current\s*ctc\s*-\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i,
    /^\s*current\s*[-:]\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i,
    /\bcurrent\s*ctc\s*is\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i,
    /\bcurrent\s*ctc\s*(?:as|=)\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i
  ]),
  expected_ctc: findLineValue([
    /^\s*expected\s*ctc(?:\s*is|:)?\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i,
    /^\s*expected\s*ctc\s*-\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i,
    /^\s*expected\s*[-:]\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i,
    /^\s*expectation(?:\s*is|:)?\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i,
    /^\s*expectation\s*-\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i,
    /\bexpected\s*ctc\s*is\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i,
    /\bexpectation\s*(?:is|as|=)\s*(\d+(?:\.\d+)?\s*(?:lpa|l|lac|lakh|lakhs)?)\.?$/i
  ]),
    notice_period: findLineValue([
      /^\s*notice\s*period(?:\s*is|:)?\s*([^\n]+)/i,
      /^\s*notice\s*period\s*-\s*([^\n]+)/i,
      /^\s*notice\s*[-:]\s*([^\n]+)/i,
      /^\s*np(?:\s*is|:)?\s*([^\n]+)/i
    ]),
    lwd_or_doj: findLineValue(lwdPatterns),
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
    if (nextIncoming && base[key] && isMeaningfulRecruiterConflict(key, base[key], nextIncoming)) {
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
    if (!String(value || "").trim()) return;
    extractedFieldPatch[key] = key === "lwd_or_doj" ? sanitizeLwdOrDojValue(value) : value;
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
  function sanitizeApiErrorMessage(message, statusCode) {
    const raw = String(message || "").trim();
    if (!raw) return statusCode ? `HTTP ${statusCode}` : "Request failed.";
    const lowered = raw.toLowerCase();
    const looksLikeHtml = lowered.includes("<!doctype") || lowered.includes("<html") || lowered.includes("<head") || lowered.includes("<body");
    if (looksLikeHtml) {
      if (statusCode === 502) return "Temporary gateway error (502). Please retry in a minute.";
      if (statusCode === 503) return "Service temporarily unavailable (503). Please retry in a minute.";
      return statusCode ? `Request failed (HTTP ${statusCode}). Please retry.` : "Request failed. Please retry.";
    }
    // Avoid dumping full HTML / stack traces into UI status banners.
    if (raw.length > 350) return `${raw.slice(0, 350)}…`;
    return raw;
  }
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const safeMethod = String(method || "GET").toUpperCase();
  const safePath = String(path || "");
  // Avoid indefinite "Saving..." states on network/server issues.
  // Assessments/candidate writes can take longer, so give them a bigger budget.
  const timeoutMs =
    safeMethod !== "GET" && /\/company\/assessments\b/.test(safePath) ? 60000
      : safeMethod !== "GET" ? 45000
        : 30000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(path, {
    method,
    headers,
    signal: controller.signal,
    body: body ? JSON.stringify(body) : null
  })
    .then(async (response) => {
      const text = await response.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { ok: false, error: text || `HTTP ${response.status}` };
      }
      if (!response.ok || data?.ok === false) {
        throw new Error(sanitizeApiErrorMessage(data?.error || `HTTP ${response.status}`, response.status));
      }
      return data.result || data;
    })
    .catch((error) => {
      if (String(error?.name || "") === "AbortError") {
        throw new Error(`Request timed out (${Math.round(timeoutMs / 1000)}s). Please refresh and try again.`);
      }
      throw error;
    })
    .finally(() => clearTimeout(timer));
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

function formatExcelMultilineCell(value) {
  const raw = String(value ?? "");
  if (!raw) return "";
  // Preserve existing formulas (e.g. HYPERLINK) and avoid double-wrapping.
  if (raw.startsWith("=")) return raw;
  if (!/\r?\n/.test(raw)) return raw;
  const lines = raw.split(/\r?\n/).map((line) => String(line ?? ""));
  const parts = [];
  lines.forEach((line, idx) => {
    const escaped = String(line).replace(/\"/g, "\"\"");
    parts.push(`\"${escaped}\"`);
    if (idx < lines.length - 1) parts.push("CHAR(10)");
  });
  // `"a"&CHAR(10)&"b"` (blank lines work because "" is a valid segment)
  return `=${parts.join("&")}`;
}

function normalizeExcelClipboardCell(value) {
  return formatExcelMultilineCell(String(value ?? "").replace(/\t/g, " "));
}

function getCapturedOutcome(candidate, assessment) {
  return normalizeAttemptOutcomeLabel(candidate?.last_contact_outcome || "No outcome");
}

function getApplicantOutcome(applicant) {
  if (String(applicant?.assignedToName || applicant?.assigned_to_name || "").trim()) return "Assigned";
  return String(applicant?.parseStatus || applicant?.parse_status || "Applied").trim();
}

function getApplicantWorkflowOutcome(applicant, linkedCandidate = null) {
  const candidateOutcome = String(linkedCandidate?.last_contact_outcome || "").trim();
  const applicantOutcome = String(
    applicant?.lastContactOutcome ||
    applicant?.last_contact_outcome ||
    applicant?.outcome ||
    applicant?.status ||
    ""
  ).trim();
  return normalizeAttemptOutcomeLabel(candidateOutcome || applicantOutcome || "No outcome");
}

function isAutoHiddenWorkflowOutcome(outcome) {
  return false;
}

function isApplicantConvertedToAssessment(applicant = {}, linkedCandidate = null, linkedAssessment = null) {
  return Boolean(linkedAssessment);
}

function getApplicantOwnerLabel(applicant, linkedCandidate = null) {
  return String(
    applicant?.assignedToName ||
    applicant?.assigned_to_name ||
    linkedCandidate?.assigned_to_name ||
    "Unassigned"
  ).trim() || "Unassigned";
}

function isAdminAssignedApplicant(applicant, linkedCandidate = null) {
  return Boolean(
    String(applicant?.assignedByUserId || applicant?.assigned_by_user_id || linkedCandidate?.assigned_by_user_id || "").trim() ||
    String(applicant?.assignedByName || applicant?.assigned_by_name || linkedCandidate?.assigned_by_name || "").trim()
  );
}

function getApplicantManualAssigneeLabel(applicant, linkedCandidate = null) {
  if (!isAdminAssignedApplicant(applicant, linkedCandidate)) return "";
  return getApplicantOwnerLabel(applicant, linkedCandidate);
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

function fillClientShareTemplate(template, context) {
  const map = {
    hr_name: context.hrName || "Team",
    recruiter_name: context.recruiterName || "Recruiter",
    company_name: context.companyName || "RecruitDesk",
    client_name: context.clientLabel || "",
    role: context.targetRole || "",
    role_line: context.roleLine ? ` for ${context.roleLine}` : ""
  };
  return String(template || "").replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key) => String(map[key] || ""));
}

function splitSearchKeywords(value) {
  return String(value || "")
    .replace(/[()"]/g, " ")
    .split(/,|\n|\/|&|\+|\band\b|\s+/i)
    .map((part) => part.trim().toLowerCase())
    .filter((part) =>
      part &&
      part.length >= 2 &&
      !["get", "me", "show", "all", "profile", "profiles", "candidate", "candidates", "with", "for", "in", "from", "the"].includes(part)
    );
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

function buildCombinedAssessmentInsightsForExportV2(item = {}) {
  const parts = [];
  const otherStandardQuestions = String(item.other_standard_questions || item.last_contact_notes || "").trim();
  const otherPointers = String(item.other_pointers || "").trim();
  if (otherStandardQuestions) parts.push(otherStandardQuestions);
  if (otherPointers) parts.push(otherPointers.replace(/^•\s*/gm, ""));
  return parts.filter(Boolean).join("\n");
}

function buildCombinedAssessmentInsightsForExport(item = {}) {
  const otherStandardQuestions = String(item.other_standard_questions || item.last_contact_notes || "").trim();
  const reasonOfChangeValue = String(item.reason_of_change || "").trim();
  const fixedFieldLabels = new Set([
    "current ctc",
    "expected ctc",
    "notice period",
    "notice",
    "experience",
    "total experience",
    "work experience",
    "highest education",
    "qualification",
    "current company",
    "current designation",
    "location",
    "offer in hand",
    "lwd",
    "doj",
    "lwd / doj",
    "lwd or doj",
    "status",
    "current status",
    "assessment status",
    "candidate status",
    "pipeline",
    "pipeline stage",
    "source",
    "client",
    "recruiter"
  ]);
  const lines = otherStandardQuestions
    .split(/\r?\n+/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const questionLines = [];
  let inlineReasonOfChange = "";

  lines.forEach((line) => {
    const normalizedLine = line.replace(/^[\d\.\-\)\s]+/, "").trim();
    const separatorIndex = normalizedLine.indexOf(":");
    if (separatorIndex <= 0) return;
    const label = normalizedLine.slice(0, separatorIndex).trim();
    const answer = normalizedLine.slice(separatorIndex + 1).trim();
    const normalizedLabel = label.toLowerCase();
    if (!label || !answer) return;
    if (normalizedLabel === "reason of change") {
      inlineReasonOfChange = answer;
      return;
    }
    if (fixedFieldLabels.has(normalizedLabel)) return;
    questionLines.push(`${questionLines.length + 1}. ${label} - *${answer}*`);
  });

  const finalReasonOfChange = inlineReasonOfChange || reasonOfChangeValue;
  const parts = [];
  if (finalReasonOfChange) parts.push(`Reason of change: *${finalReasonOfChange}*`);
  if (questionLines.length) parts.push(...questionLines);
  return parts.join("\n");
}

function buildScreeningRemarksForExport(item = {}) {
  const ctx = resolveCandidateContext(item);
  const otherStandardQuestions = String(ctx.otherStandardQuestions || "").trim();
  const reasonOfChangeValue = buildReasonOfChangeForExport({ ...ctx.candidate, ...(ctx.assessment || {}), screening_answers: ctx.screeningMap || {} });
  const strongPoints = (ctx.highlights || []).slice(0, 2);
  const fixedFieldLabels = new Set([
    "current ctc",
    "expected ctc",
    "notice period",
    "notice",
    "experience",
    "total experience",
    "work experience",
    "highest education",
    "qualification",
    "current company",
    "current designation",
    "location",
    "offer in hand",
    "lwd",
    "doj",
    "lwd / doj",
    "lwd or doj",
    "status",
    "current status",
    "assessment status",
    "candidate status",
    "pipeline",
    "pipeline stage",
    "source",
    "client",
    "recruiter"
  ]);
  const lines = otherStandardQuestions
    .split(/\r?\n+/)
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  const questionLines = [];
  let inlineReasonOfChange = "";

  lines.forEach((line) => {
    // Attempt history lines look like: "[4/15/2026, 4:08:06 PM] JD shared"
    // They contain ":" because of time, which previously got mis-parsed as "label: answer".
    if (/^\[[^\]]+\]\s*/.test(line)) return;
    const normalizedLine = line.replace(/^[\d\.\-\)\s]+/, "").trim();
    const separatorIndex = normalizedLine.indexOf(":");
    if (separatorIndex <= 0) return;
    const label = normalizedLine.slice(0, separatorIndex).trim();
    const answer = normalizedLine
      .slice(separatorIndex + 1)
      .replace(/^[\s:\-]+/, "")
      .trim();
    const normalizedLabel = label.toLowerCase();
    if (!label || !answer) return;
    // Only keep actual question labels (needs at least one letter).
    if (!/[a-z]/i.test(label)) return;
    if (normalizedLabel === "reason of change") {
      inlineReasonOfChange = answer;
      return;
    }
    if (fixedFieldLabels.has(normalizedLabel)) return;
    questionLines.push(`${questionLines.length + 1}. ${label} - *${answer}*`);
  });

  // Primary: use saved screening answers map (JD questions). This avoids leaking attempt-history/status notes.
  if (ctx.screeningMap) {
    const nextLines = [];
    Object.entries(ctx.screeningMap).forEach(([question, answer]) => {
      const label = String(question || "").trim();
      const value = String(answer || "").trim();
      if (!label || !value) return;
      const normalizedLabel = label.toLowerCase();
      if (normalizedLabel === "reason of change") {
        inlineReasonOfChange = value;
        return;
      }
      if (fixedFieldLabels.has(normalizedLabel)) return;
      nextLines.push([label, value]);
    });
    if (nextLines.length) {
      questionLines.length = 0;
      nextLines.forEach(([label, value]) => questionLines.push(`${questionLines.length + 1}. ${label} - *${value}*`));
    }
  }

  const finalReasonOfChange = inlineReasonOfChange || reasonOfChangeValue;
  const parts = [];
  if (strongPoints.length) {
    parts.push("Strong points:");
    strongPoints.forEach((point, index) => parts.push(`${index + 1}. *${point}*`));
  }
  if (questionLines.length) {
    if (parts.length) parts.push("");
    parts.push("Screening pointers:");
    parts.push(...questionLines);
  }
  if (finalReasonOfChange) {
    if (parts.length) parts.push("");
    parts.push("Reason of change:");
    parts.push(`*${finalReasonOfChange}*`);
  }
  return parts.join("\n");
}

function buildReasonOfChangeForExport(item = {}) {
  const draft = getCandidateDraftState(item);
  const direct = String(
    item.reason_of_change
    || item.reasonForChange
    || item.reason_for_change
    || draft.reasonForChange
    || draft.reason_of_change
    || draft.reasonOfChange
    || ""
  ).trim();
  if (direct) return direct;
  const screeningMap = (draft?.jdScreeningAnswers && typeof draft.jdScreeningAnswers === "object" ? draft.jdScreeningAnswers : null)
    || (item?.screening_answers && typeof item.screening_answers === "object" ? item.screening_answers : null)
    || (item?.screeningAnswers && typeof item.screeningAnswers === "object" ? item.screeningAnswers : null)
    || null;
  if (screeningMap) {
    const matchKey = Object.keys(screeningMap).find((key) => String(key || "").trim().toLowerCase() === "reason of change");
    if (matchKey) {
      const value = String(screeningMap[matchKey] || "").trim();
      if (value) return value;
    }
  }
  const structuredQuestions = String(item.other_standard_questions || item.last_contact_notes || "").trim();
  if (structuredQuestions) {
    const lines = structuredQuestions
      .split(/\r?\n+/)
      .map((line) => String(line || "").trim())
      .filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!/^reason\s+of\s+change\b/i.test(line)) continue;
      const colonIndex = line.indexOf(":");
      if (colonIndex >= 0) {
        const extracted = line.slice(colonIndex + 1).trim();
        if (extracted) return extracted;
      }
      const next = lines[i + 1] || "";
      if (next && !/^(\d+[\.\)\-]\s*)/i.test(next)) return next;
    }
  }
  const candidates = [
    item.recruiter_context_notes,
    item.recruiterNotes,
    item.other_pointers,
    item.otherPointers,
    item.notes,
    draft.recruiterNotes,
    draft.otherPointers,
    draft.callbackNotes
  ];
  const lines = candidates
    .flatMap((value) => String(value || "").split(/\r?\n+/))
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!/^reason\s+of\s+change\b/i.test(line)) continue;
    const colonIndex = line.indexOf(":");
    if (colonIndex >= 0) {
      const extracted = line.slice(colonIndex + 1).trim();
      if (extracted) return extracted;
    }
    const next = lines[i + 1] || "";
    if (next && !/^(\d+[\.\)\-]\s*)/i.test(next)) return next;
  }
  return "";
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
    case "notice_period": {
      const draft = getCandidateDraftState(item);
      const notice = String(item.notice_period || item.noticePeriod || draft.noticePeriod || "").trim();
      const lwdOrDoj = String(item.lwd_or_doj || item.lwdOrDoj || draft.lwdOrDoj || "").trim();
      const offerAmount = String(
        item.offer_in_hand
        || item.offerInHand
        || item.offerAmount
        || item.offer_amount
        || draft.offerInHand
        || ""
      ).trim();
      return [
        notice ? `Notice period: ${notice}` : "",
        lwdOrDoj ? `LWD/DOJ: ${lwdOrDoj}` : "",
        offerAmount ? `Offer amount: ${offerAmount}` : ""
      ].filter(Boolean).join(" | ");
    }
    // Backward compatibility for older custom presets.
    case "notice_period_indicator": return getCapturedExportFieldValue(item, "notice_period");
    case "reason_of_change": return buildReasonOfChangeForExport(item);
    case "reason_of_change_indicator": return getCapturedExportFieldValue(item, "reason_of_change");
    case "lwd_or_doj": return item.lwd_or_doj || "";
    case "combined_assessment_insights": return buildCombinedAssessmentInsightsForExportV2(item);
    case "screening_remarks": {
      const next = buildScreeningRemarksForExport(item);
      return next || item.screening_remarks || "";
    }
    case "linkedin": return item.linkedin || item.linkedinUrl || getCandidateDraftState(item).linkedin || "";
    case "client_name": return item.client_name || "";
    case "jd_title": return item.jd_title || item.role || "";
    case "target_role_open_position": return item.jd_title || item.role || "";
    case "key_skills_required": {
      const draft = getCandidateDraftState(item);
      const tags = String(draft?.tags || "").trim();
      if (tags) return tags;
      if (Array.isArray(item.skills) && item.skills.length) return item.skills.join(", ");
      return String(item.key_skills_required || item.keySkillsRequired || item.skills || "").trim();
    }
    case "recruiter_name": return item.assigned_to_name || item.recruiter_name || item.recruiterName || "";
    case "date_added": {
      const value = item.created_at || item.createdAt || item.created_on || item.createdOn || "";
      return value ? String(value).slice(0, 10) : "";
    }
    case "domain_industry": return item.domain_industry || item.domainIndustry || "";
    case "current_org_tenure": return item.current_org_tenure || item.currentOrgTenure || "";
    case "other_pointers": return item.other_pointers || "";
    case "other_standard_questions": return item.other_standard_questions || item.last_contact_notes || "";
    case "remarks": return item.recruiter_context_notes || item.notes || "";
    case "cv_link": {
      const value = String(item.cv_link || item.cv_url || item.cvUrl || "").trim();
      if (!value) return "";
      if (/^https?:\/\//i.test(value)) {
        const safe = value.replace(/\"/g, "\"\"");
        return `=HYPERLINK(\"${safe}\",\"Open CV\")`;
      }
      return value;
    }
    case "cv_url": return item.cv_url || item.cvUrl || item.cv_link || "";
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
          "Screening remarks",
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
          getCapturedExportFieldValue(item, "notice_period"),
          buildScreeningRemarksForExport(item),
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

function buildTsvFromPreset(rows, presetId, settings = DEFAULT_COPY_SETTINGS) {
  const preset = buildCapturedExcelRows(rows || [], presetId || settings?.excelPreset || "compact_recruiter", settings);
  return [preset.headers.join("\t"), ...preset.rows.map((row) => row.map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))].join("\n");
}

function mergeStoredCvIntoApplicantMeta(existingMeta = {}, cvAnalysis = null) {
  const meta = existingMeta && typeof existingMeta === "object" ? { ...existingMeta } : {};
  const stored = cvAnalysis?.storedFile && typeof cvAnalysis.storedFile === "object" ? cvAnalysis.storedFile : null;
  if (!stored) return meta;
  // Only fill missing CV pointers; never overwrite a real stored link/key already present.
  if (!meta.fileProvider && stored.provider) meta.fileProvider = String(stored.provider || "").trim();
  if (!meta.fileKey && stored.key) meta.fileKey = String(stored.key || "").trim();
  if (!meta.fileUrl && stored.url) meta.fileUrl = String(stored.url || "").trim();
  if (!meta.filename && stored.filename) meta.filename = String(stored.filename || "").trim();
  if (!meta.mimeType && stored.mimeType) meta.mimeType = String(stored.mimeType || "").trim();
  return meta;
}

function formatTimelineJsonForText(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return "";
  const lines = rows
    .map((row) => {
      const title = String(row?.title || row?.designation || "").trim();
      const company = String(row?.company || "").trim();
      const start = String(row?.start || "").trim();
      const end = String(row?.end || "").trim();
      const duration = String(row?.duration || "").trim();
      const rolePart = [title, company].filter(Boolean).join(" | ");
      const datePart = [start, end].filter(Boolean).join(" - ");
      return [rolePart, datePart, duration].filter(Boolean).join(" | ");
    })
    .map((line) => String(line || "").trim())
    .filter(Boolean);
  return lines.join("\n");
}

function resolveTimelineText({ textTimeline = "", jsonTimeline = null } = {}) {
  const direct = String(textTimeline || "").trim();
  if (direct) return direct;
  if (Array.isArray(jsonTimeline) && jsonTimeline.length) return formatTimelineJsonForText(jsonTimeline);
  return "";
}

function normalizeCompanyKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(ltd|limited|pvt|private|inc|llc|co|company|technologies|technology|services)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractCompanyFromTimelineSegment(segment) {
  const raw = String(segment || "").replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const cleaned = raw.replace(/^\[[^\]]+\]\s*/g, "").trim();
  const atMatch = cleaned.match(/\bat\s+(.+?)(?:\s*\||\s*\(|\s*\d{4}|\s*$)/i);
  if (atMatch && atMatch[1]) return String(atMatch[1]).trim();
  const pipeParts = cleaned.split("|").map((p) => p.trim()).filter(Boolean);
  if (pipeParts.length) {
    const first = pipeParts[0];
    const looksLikeTitle = /\b(engineer|developer|manager|lead|executive|associate|consultant|analyst|architect|director|head)\b/i.test(first);
    if (!looksLikeTitle) return first;
    if (pipeParts[1] && !/\d{4}/.test(pipeParts[1])) return pipeParts[1];
  }
  return "";
}

function extractPreviousCompaniesFromTimeline({ timelineText = "", currentCompany = "", limit = 3 } = {}) {
  const text = String(timelineText || "").trim();
  if (!text) return [];
  const segments = text
    .replace(/\r/g, "")
    .split(/(?:\n+|;\s*|\u2022\s*)/g)
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const currentKey = normalizeCompanyKey(currentCompany);
  const companies = [];
  segments.forEach((segment) => {
    const company = extractCompanyFromTimelineSegment(segment);
    if (!company) return;
    const key = normalizeCompanyKey(company);
    if (!key) return;
    if (currentKey && (key === currentKey || key.includes(currentKey) || currentKey.includes(key))) return;
    if (companies.some((existing) => normalizeCompanyKey(existing) === key)) return;
    companies.push(company);
  });
  return companies.slice(0, Math.max(0, Number(limit || 0) || 0));
}

function buildExcelHtmlFromPreset(rows, presetId, settings = DEFAULT_COPY_SETTINGS, sheetName = "Sheet1") {
  const preset = buildCapturedExcelRows(rows || [], presetId || settings?.excelPreset || "compact_recruiter", settings);
  const headers = preset.headers.map((header) => `<th style="border:1px solid #d8dee8;padding:10px 12px;background:#f6f8fb;text-align:left;font-size:13px;">${escapeHtml(header)}</th>`).join("");
  const body = preset.rows.map((row) => {
    const cells = row.map((cell) => `<td style="border:1px solid #d8dee8;padding:10px 12px;vertical-align:top;font-size:13px;line-height:1.45;">${escapeHtml(String(cell || "")).replace(/\n/g, "<br/>")}</td>`).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <meta name="ProgId" content="Excel.Sheet" />
  <meta name="Generator" content="RecruitDesk AI" />
  <style>
    table { border-collapse: collapse; width: 100%; }
    td, th { font-family: Calibri, Arial, sans-serif; }
  </style>
</head>
<body>
  <table>
    <thead><tr>${headers}</tr></thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

function buildExcelHtmlFromCardSections({ title = "", subtitle = "", sections = [] } = {}) {
  const rowsHtml = [];
  const pushSection = (label) => {
    rowsHtml.push(`<tr><th colspan="2" style="border:1px solid #d8dee8;padding:10px 12px;background:#eaf0fb;text-align:left;font-size:13px;letter-spacing:.06em;text-transform:uppercase;">${escapeHtml(label)}</th></tr>`);
  };
  const pushRow = (label, value) => {
    rowsHtml.push(
      `<tr>
        <td style="border:1px solid #d8dee8;padding:10px 12px;vertical-align:top;font-size:13px;font-weight:700;width:260px;background:#fbfcff;">${escapeHtml(label)}</td>
        <td style="border:1px solid #d8dee8;padding:10px 12px;vertical-align:top;font-size:13px;line-height:1.45;">${escapeHtml(String(value || "")).replace(/\n/g, "<br/>")}</td>
      </tr>`
    );
  };
  (sections || []).forEach((section) => {
    if (!section) return;
    pushSection(section.title || "Section");
    (section.rows || []).forEach((row) => {
      if (!row) return;
      pushRow(String(row.label || ""), row.value == null ? "" : String(row.value));
    });
  });

  const heading = [
    title ? `<h2 style="margin:0 0 6px;font-family:Calibri,Arial,sans-serif;">${escapeHtml(title)}</h2>` : "",
    subtitle ? `<div style="margin:0 0 12px;color:#4b5563;font-family:Calibri,Arial,sans-serif;">${escapeHtml(subtitle)}</div>` : ""
  ].filter(Boolean).join("");

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8" />
  <meta name="ProgId" content="Excel.Sheet" />
  <meta name="Generator" content="RecruitDesk AI" />
  <style>
    table { border-collapse: collapse; width: 100%; }
    td, th { font-family: Calibri, Arial, sans-serif; }
  </style>
</head>
<body>
  ${heading}
  <table><tbody>${rowsHtml.join("")}</tbody></table>
</body>
</html>`;
}

function downloadCandidateCardExcelFile(filename, { title, subtitle, sections }) {
  const html = buildExcelHtmlFromCardSections({ title, subtitle, sections });
  downloadTextFile(filename, html, "application/vnd.ms-excel;charset=utf-8");
}

function downloadTextFile(filename, text, mimeType = "text/tab-separated-values;charset=utf-8") {
  const blob = new Blob([String(text || "")], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadPresetExcelFile(filename, rows, presetId, settings = DEFAULT_COPY_SETTINGS, sheetName = "Sheet1") {
  const html = buildExcelHtmlFromPreset(rows, presetId, settings, sheetName);
  downloadTextFile(filename, html, "application/vnd.ms-excel;charset=utf-8");
}

function buildExcelHtmlFromTable({ title = "", subtitle = "", headers = [], rows = [] } = {}) {
  const heading = [
    title ? `<h2>${escapeHtml(title)}</h2>` : "",
    subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""
  ].filter(Boolean).join("");

  const headerHtml = `<tr>${(headers || []).map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr>`;
  const rowsHtml = (rows || []).map((row) => (
    `<tr>${(row || []).map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`
  ));

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; width: 100%; }
    td, th { font-family: Calibri, Arial, sans-serif; border: 1px solid #d9d9d9; padding: 6px; vertical-align: top; }
    th { background: #f3f6ff; font-weight: 700; }
  </style>
</head>
<body>
  ${heading}
  <table>
    <thead>${headerHtml}</thead>
    <tbody>${rowsHtml.join("")}</tbody>
  </table>
</body>
</html>`;
}

function getAssessmentQuestionAnswers(assessment = {}) {
  const source = assessment && typeof assessment === "object" ? assessment : {};
  const pairs = [];
  const isVisibleQuestion = (question, answer) => {
    const label = String(question || "").trim().toLowerCase();
    const value = String(answer || "").trim().toLowerCase();
    if (!label || !value) return false;
    if (/^(status|current status|assessment status|candidate status|pipeline|pipeline stage)$/i.test(label)) return false;
    if (label === "source" || label === "recruiter" || label === "client") return false;
    if ((label.includes("status") || label.includes("pipeline")) && /cv\s+(shared|to be shared)|submitted|screening in progress/i.test(value)) return false;
    return true;
  };
  [
    source.questionAnswerPairs,
    source.screeningQuestionAnswers,
    source.screeningQuestions,
    source.questions,
    source.answers,
    source.runbookAnswers
  ].forEach((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((entry, index) => {
      if (!entry || typeof entry === "string") return;
      const question = String(entry.question || entry.label || entry.title || entry.q || `Question ${index + 1}`).trim();
      const answer = String(entry.answer || entry.value || entry.response || entry.a || "").trim();
      if (isVisibleQuestion(question, answer)) pairs.push({ question, answer });
    });
  });
  if (source.screeningAnswers && typeof source.screeningAnswers === "object") {
    Object.entries(source.screeningAnswers).forEach(([question, answer]) => {
      const safeQuestion = String(question || "").trim();
      const safeAnswer = String(answer || "").trim();
      if (isVisibleQuestion(safeQuestion, safeAnswer)) pairs.push({ question: safeQuestion, answer: safeAnswer });
    });
  }
  return Array.from(new Map(pairs.map((pair) => [`${pair.question}|||${pair.answer}`, pair])).values()).slice(0, 40);
}

function clientPortalItemHasCv(item = {}) {
  const candidate = item?.raw?.candidate || item?.candidate || {};
  const metadata = item?.raw?.metadata || item?.metadata || {};
  const storedFile = metadata?.cvAnalysisCache?.storedFile && typeof metadata.cvAnalysisCache.storedFile === "object"
    ? metadata.cvAnalysisCache.storedFile
    : {};
  return Boolean(
    item?.cvAvailable
    || candidateHasStoredCv(candidate)
    || metadata?.fileKey
    || metadata?.fileUrl
    || storedFile?.key
    || storedFile?.url
  );
}

function buildClientPortalTrackerRows(items = [], cvTextByAssessmentId = {}) {
  return (items || []).map((item, index) => {
    const assessment = item.raw?.assessment || item.assessment || item;
    const candidate = item.raw?.candidate || {};
    const candidateDraft = getCandidateDraftState(candidate);
    const questionAnswers = getAssessmentQuestionAnswers(assessment)
      .map((pair) => `${pair.question}: ${pair.answer}`)
      .join("\n");
    const otherPointers = String(assessment.otherPointers || item.otherPointers || candidate.other_pointers || "").trim();
    const recruiterNotes = String(assessment.recruiterNotes || item.notesText || candidate.recruiter_context_notes || "").trim();
    return {
      id: assessment.id || item.id || "",
      index: index + 1,
      s_no: index + 1,
      name: assessment.candidateName || item.candidateName || item.name || "",
      phone: assessment.phoneNumber || item.phone || candidate.phone || "",
      email: assessment.emailId || item.email || candidate.email || "",
      location: assessment.location || item.location || candidate.location || "",
      company: assessment.currentCompany || item.company || candidate.company || "",
      current_company: assessment.currentCompany || item.company || candidate.company || "",
      role: assessment.currentDesignation || item.role || candidate.role || "",
      current_designation: assessment.currentDesignation || item.role || candidate.role || "",
      total_experience: assessment.totalExperience || item.totalExperience || candidate.experience || "",
      highest_education: assessment.highestEducation || item.highestEducation || "",
      current_ctc: assessment.currentCtc || item.currentCtc || candidate.current_ctc || "",
      expected_ctc: assessment.expectedCtc || item.expectedCtc || candidate.expected_ctc || "",
      notice_period: assessment.noticePeriod || item.noticePeriod || candidate.notice_period || "",
      lwd_or_doj: assessment.lwdOrDoj || assessment.offerDoj || item.lwdOrDoj || "",
      recruiter_context_notes: recruiterNotes,
      other_pointers: otherPointers,
      other_standard_questions: questionAnswers,
      combined_assessment_insights: buildCombinedAssessmentInsightsForExportV2({
        recruiter_context_notes: recruiterNotes,
        other_pointers: otherPointers,
        other_standard_questions: questionAnswers,
        reason_of_change: assessment.reasonForChange || candidate.reason_of_change || ""
      }),
      notes: recruiterNotes || assessment.callbackNotes || "",
      linkedin: assessment.linkedinUrl || item.linkedin || candidate.linkedin || candidateDraft.linkedin || "",
      jd_title: assessment.jdTitle || item.position || item.role || "",
      client_name: assessment.clientName || item.clientName || "",
      outcome: assessment.candidateStatus || item.candidateStatus || "",
      assessment_status: assessment.candidateStatus || item.candidateStatus || "",
      cv_link: cvTextByAssessmentId[String(assessment.id || item.id || "")] || ""
    };
  });
}

  function getApplyLink(jobId) {
  return jobId ? `${window.location.origin}/apply/${encodeURIComponent(jobId)}` : "";
}

function getPublicApplyLink(jobId) {
  return jobId ? `${window.location.origin}/apply-public/${encodeURIComponent(jobId)}` : "";
}

function getRecruiterApplyLink(jobId, recruiterId, sig) {
  if (!jobId) return "";
  const base = `${window.location.origin}/apply/${encodeURIComponent(jobId)}`;
  const rid = String(recruiterId || "").trim();
  const token = String(sig || "").trim();
  if (!rid || !token) return base;
  const params = new URLSearchParams();
  // Short query params to keep URLs readable.
  params.set("r", rid);
  params.set("s", token);
  return `${base}?${params.toString()}`;
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
  const value = normalizeAssessmentStatusLabel(status).toLowerCase();
  if (!value) return "";
  if (value === "cv to be shared") return "Submitted";
  if (isInterviewAlignedStatus(value)) return "Interview Scheduled";
  if (value === "offered") return "Offer Extended";
  if (value === "feedback awaited" || value === "hold") return "On Hold";
  if (value === "screening reject" || value === "interview reject" || value === "duplicate" || value === "dropped" || value === "not responding" || value === "did not attend") return "Rejected";
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
  if (value === "not responding" || value === "did not attend") return "Interview";
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
  const statusLabel = normalizeAssessmentStatusLabel(statusValue);
  const status = statusLabel.toLowerCase();
  const label = atLocalValue ? formatAssessmentStatusCalendarNoteDate(atLocalValue) : "";
  if (isInterviewAlignedStatus(status)) return label ? `${statusLabel} on ${label}.` : statusLabel;
  if (status === "offered") return label ? `Offered. LWD / DOJ on ${label}.` : "Offered.";
  if (status === "cv shared") return "CV shared.";
  if (status === "not responding" || status === "did not attend") return "Not responding.";
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

function isClientPortalUrl() {
  if (typeof window === "undefined") return false;
  const search = new URLSearchParams(window.location.search || "");
  const mode = String(search.get("mode") || search.get("portal") || "").toLowerCase();
  return ["/client-portal", "/client-login", "/client"].some((path) => window.location.pathname.startsWith(path)) || mode === "client";
}

function LoginScreen({ onRecruiterLogin, onClientLogin, busy, error, clientOnly = false }) {
  const [mode, setMode] = useState(() => clientOnly ? "client" : "recruiter");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (clientOnly) setMode("client");
  }, [clientOnly]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUTH_MODE_KEY, mode);
    } catch {
      // Ignore local storage failures.
    }
  }, [mode]);

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <BrandLogo size="lg" />
        <div className="section-kicker auth-kicker">{mode === "client" ? "Client Login" : "Company Login"}</div>
        <h1>{mode === "client" ? CLIENT_PORTAL_LABEL : RECRUITER_PORTAL_LABEL}</h1>
        <p className="muted">{mode === "client" ? "Use the client username and password shared by your recruiter team." : "Use your existing company admin or recruiter credentials."}</p>
        {!clientOnly ? (
          <div className="button-row">
            <button type="button">Recruiter login</button>
          </div>
        ) : null}
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); mode === "client" ? onClientLogin({ username, password }) : onRecruiterLogin({ email, password }); }}>
          {mode === "client"
            ? <label><span>Username</span><input value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
            : <label><span>Email</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>}
          <label><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button type="submit" disabled={busy}>{busy ? "Logging in..." : "Login"}</button>
        </form>
        {error ? <div className="status error">{error}</div> : null}
        <div className="portal-footer portal-footer--auth">{COMPANY_ATTRIBUTION}</div>
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

function MultiSelectDropdown({ label, options, selected, onToggle, allowAll = true, emptySummary = "", summaryLabel = "" }) {
  const summary = !selected.length ? (emptySummary || `All ${label.toLowerCase()}`) : `${selected.length} selected`;
  return (
    <details className="filter-dropdown">
      <summary className="filter-dropdown__summary">
        <span>{summaryLabel || label}</span>
        <span className="muted">{summary}</span>
      </summary>
      <div className="filter-dropdown__body">
        <div className="chip-row">
          {allowAll ? (
            <button className={`chip chip-toggle${!selected.length ? " active" : ""}`} onClick={() => onToggle("__all__")}>All</button>
          ) : null}
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

function AssignModal({ open, applicant, users, jobs, onClose, onSave, title = "Assign Applicant", description = "Assign this record to a recruiter and JD.", nameKey = "candidateName", allowRecruiterSelect = true, lockedRecruiterName = "" }) {
  const [recruiterId, setRecruiterId] = useState("");
  const [jdId, setJdId] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) return;
    setRecruiterId(String(applicant?.assigned_to_user_id || applicant?.assignedToUserId || applicant?.assigned_to || "").trim());
    const existingJdId = String(applicant?.assigned_jd_id || applicant?.assignedJdId || "").trim();
    if (existingJdId) {
      setJdId(existingJdId);
    } else {
      const title = String(applicant?.assigned_jd_title || applicant?.assignedJdTitle || applicant?.jd_title || applicant?.jdTitle || "").trim();
      const match = (Array.isArray(jobs) ? jobs : []).find((job) => String(job?.title || "").trim() === title) || null;
      setJdId(match?.id ? String(match.id) : "");
    }
    setStatus("");
  }, [open, applicant?.id, jobs]);

  if (!open) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted">{description.replace("{name}", applicant?.[nameKey] || applicant?.name || "this candidate")}</p>
        {allowRecruiterSelect ? (
          <label><span>Recruiter</span><select value={recruiterId} onChange={(e) => setRecruiterId(e.target.value)}><option value="">Select recruiter</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name} | {user.email}</option>)}</select></label>
        ) : (
          <label><span>Recruiter</span><input value={lockedRecruiterName || "Current recruiter"} readOnly /></label>
        )}
        <label><span>JD / role</span><select value={jdId} onChange={(e) => setJdId(e.target.value)}><option value="">Select JD / role</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
        {status ? <div className="status">{status}</div> : null}
        <div className="button-row">
          <button onClick={async () => {
            if ((allowRecruiterSelect && !recruiterId) || !jdId) {
              setStatus(allowRecruiterSelect ? "Select recruiter and JD first." : "Select JD first.");
              return;
            }
            const job = (Array.isArray(jobs) ? jobs : []).find((item) => String(item?.id || "") === String(jdId || "")) || null;
            const jdTitle = String(job?.title || "").trim();
            const clientName = String(job?.clientName || job?.client_name || "").trim();
            setStatus("Saving assignment...");
            try {
              await onSave({ recruiterId, jdId, jdTitle, clientName });
            } catch (error) {
              setStatus(String(error?.message || error));
            }
          }}>Save assignment</button>
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function NotesModal({ open, candidate, onClose, onPatch, onParse, onOpenLinkedin }) {
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
  }, [open, candidate?.id]);

  if (!open || !candidate) return null;

	  const cautiousIndicatorsText = String(getCandidateDraftState(candidate || {})?.cautiousIndicators || "").trim();
	  const effectiveRawRecruiterNote = buildStructuredRecruiterRawNote(rawRecruiterSections, "");
	  const linkedinUrl = String(parsedSummary?.linkedin || candidate?.linkedin || getCandidateDraftState(candidate || {})?.linkedin || "").trim();

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
        {cautiousIndicatorsText ? (
          <div style={{ marginTop: 8 }}>
            <div className="status-note"><strong>Cautious indicators to check</strong></div>
            <div className="candidate-snippet">{cautiousIndicatorsText}</div>
          </div>
        ) : null}
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
	            {linkedinUrl ? (
	              <div className="button-row tight" style={{ marginTop: 8 }}>
	                <button
	                  className="ghost-btn"
	                  onClick={() => onOpenLinkedin?.(linkedinUrl)}
	                  title="Opens LinkedIn in a small side browser window"
	                >
	                  Open LinkedIn in a side browser
	                </button>
	              </div>
	            ) : null}
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
  const [inferText, setInferText] = useState("");
  const [remarks, setRemarks] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open || !candidate) return;
    setOutcome("");
    setInferText("");
    setRemarks("");
    setNextFollowUpAt("");
    setStatus("");
  }, [open, candidate?.id]);

  useEffect(() => {
    const parsed = inferAttemptOutcomeAndFollowUp(inferText);
    if (parsed.outcome && parsed.outcome !== outcome) setOutcome(parsed.outcome);
    if (parsed.outcome === "Call later" && parsed.followUpAt) {
      setNextFollowUpAt(parsed.followUpAt);
      return;
    }
    if ((parsed.outcome && parsed.outcome !== "Call later") || (outcome && outcome !== "Call later")) {
      setNextFollowUpAt("");
    }
  }, [inferText]);

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
                  {extractAttemptRemarks(extractLatestAttemptLine(candidate?.last_contact_notes || "")) ? <div className="candidate-snippet">{extractAttemptRemarks(extractLatestAttemptLine(candidate?.last_contact_notes || ""))}</div> : null}
                  {candidate?.last_contact_notes ? <div className="candidate-snippet">{formatAttemptLinesWithTimestamp(candidate.last_contact_notes, candidate.last_contact_at)}</div> : null}
                  {candidate?.next_follow_up_at ? <div className="chip-row"><span className="chip">Next follow-up: {new Date(candidate.next_follow_up_at).toLocaleString()}</span></div> : null}
                </article>
              ) : null}
              {!(candidate?.last_contact_outcome || candidate?.last_contact_notes || candidate?.next_follow_up_at)
                ? <div className="empty-state">No attempts logged yet.</div>
                : null}
            </div>
          </div>
          <div className="attempt-form">
            <h4>Log attempt</h4>
            <label><span>Outcome</span><select value={outcome} onChange={(e) => {
              const selected = e.target.value;
              setOutcome(selected);
              setInferText(selected || "");
            }}>{[
              <option key="" value="">Select outcome</option>,
              ...ATTEMPT_OUTCOME_OPTIONS.filter((option) => option !== "No outcome").map((option) => <option key={option} value={option}>{option}</option>)
            ]}</select></label>
            <label><span>Infer Box</span><textarea value={inferText} onChange={(e) => setInferText(e.target.value)} placeholder="Busy, call tomorrow 5 PM, duplicate, screening reject..." /></label>
            <label><span>Manual Remarks</span><textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Busy in production, communication bad, asked to call tomorrow..." /></label>
            <label><span>Next follow-up</span><input type="datetime-local" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} disabled={outcome !== "Call later"} /></label>
            {status ? <div className="status">{status}</div> : null}
            <div className="button-row">
                <button onClick={async () => {
                  setStatus("Saving attempt...");
                  try {
                    const parsed = inferAttemptOutcomeAndFollowUp(inferText);
                    const finalOutcome = String(parsed.outcome || outcome || "").trim();
                    const finalFollowUpAt = finalOutcome === "Call later" ? (parsed.followUpAt || nextFollowUpAt) : "";
                    if (!finalOutcome) {
                      throw new Error("Select attempt outcome first.");
                    }
                    if (finalOutcome === "Call later" && !finalFollowUpAt) {
                      throw new Error("Select next follow-up time for Call later.");
                    }
                    await onSave({
                      outcome: finalOutcome,
                      infer_text: inferText,
                      remarks,
                      next_follow_up_at: finalFollowUpAt,
                      derived_status: ""
                    });
                  setStatus("Attempt saved.");
                  setOutcome("");
                  setInferText("");
                  setRemarks("");
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
  const [inferText, setInferText] = useState("");
  const [manualRemarks, setManualRemarks] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [expectedDoj, setExpectedDoj] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [status, setStatus] = useState("");
  const inferSyncModeRef = useRef("manual");

  useEffect(() => {
    if (!open || !assessment) return;
    setCandidateStatus(normalizeAssessmentStatusLabel(assessment.candidateStatus));
    setAtValue(toDateInputValue(assessment.interviewAt || assessment.followUpAt || ""));
    setInferText("");
    setManualRemarks("");
    setOfferAmount(String(assessment.offerAmount || "").trim());
    setExpectedDoj(toDateInputValue(assessment.expectedDoj || assessment.followUpAt || ""));
    setDateOfJoining(toDateInputValue(assessment.dateOfJoining || assessment.followUpAt || ""));
    setStatus("");
    inferSyncModeRef.current = "programmatic";
  }, [open, assessment?.id]);

  useEffect(() => {
    const mode = inferSyncModeRef.current;
    // Prevent calendar/status from getting overwritten by parser when infer text
    // is auto-updated from dropdown/date inputs.
    if (mode !== "manual") {
      inferSyncModeRef.current = "manual";
      return;
    }
    const lastLine = extractLastMeaningfulLine(inferText);
    const parsedFromLastLine = inferAssessmentStatusAndSchedule(lastLine);
    const parsed = parsedFromLastLine.candidateStatus ? parsedFromLastLine : inferAssessmentStatusAndSchedule(inferText);
    if (parsed.candidateStatus && parsed.candidateStatus !== candidateStatus) {
      setCandidateStatus(parsed.candidateStatus);
    }
    if (parsed.atValue) {
      if (parsed.candidateStatus === "Offered" && parsed.atValue !== expectedDoj) setExpectedDoj(parsed.atValue);
      else if (parsed.candidateStatus === "Joined" && parsed.atValue !== dateOfJoining) setDateOfJoining(parsed.atValue);
      else if (parsed.atValue !== atValue) setAtValue(parsed.atValue);
    }
    if (parsed.offerAmount && parsed.offerAmount !== offerAmount) setOfferAmount(parsed.offerAmount);
  }, [inferText]);

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
            const selectedNormalized = String(selected || "").trim().toLowerCase();
            const selectedNeedsCalendar = isInterviewAlignedStatus(selected) || selectedNormalized === "offered" || selectedNormalized === "joined";
            setCandidateStatus(selected);
            if (!selectedNeedsCalendar) {
              setAtValue("");
              setExpectedDoj("");
              setDateOfJoining("");
            }
            const nextDate = selectedNeedsCalendar
              ? (selectedNormalized === "offered" ? expectedDoj : selectedNormalized === "joined" ? dateOfJoining : atValue)
              : "";
            inferSyncModeRef.current = "programmatic";
            setInferText((current) => syncAssessmentNotesWithStatus(current, selected, nextDate, { offerAmount }));
          }}>
            <option value="">Select status</option>
            {DEFAULT_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {shouldShowCalendar ? (
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
                inferSyncModeRef.current = "programmatic";
                setInferText((current) => syncAssessmentNotesWithStatus(current, candidateStatus, nextValue, { offerAmount }));
              }}
            />
          </label>
        ) : null}
        {normalizedStatus === "offered" ? (
          <label>
            <span>Offer amount</span>
            <input value={offerAmount} onChange={(e) => {
              const nextValue = e.target.value;
              setOfferAmount(nextValue);
              inferSyncModeRef.current = "programmatic";
              setInferText((current) => syncAssessmentNotesWithStatus(current, candidateStatus, expectedDoj || atValue, { offerAmount: nextValue }));
            }} placeholder="25 L" />
          </label>
        ) : null}
        <label>
          <span>Infer box</span>
          <textarea value={inferText} onChange={(e) => {
            inferSyncModeRef.current = "manual";
            setInferText(e.target.value);
          }} placeholder="Write only the new status update here, e.g. L1 aligned tomorrow 5 PM, screening reject, CV shared." />
        </label>
        <label>
          <span>Manual remarks</span>
          <textarea value={manualRemarks} onChange={(e) => setManualRemarks(e.target.value)} placeholder="Add recruiter remarks here, e.g. candidate asked to reconnect after release, communication good, salary flexibility possible." />
        </label>
        <p className="muted">Last line in infer box is the final source of truth for current status.</p>
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
                atValue: shouldShowCalendar ? effectiveAtValue : "",
                notes: inferText,
                inferText,
                manualRemarks,
                offerAmount,
                expectedDoj: normalizedStatus === "offered" ? expectedDoj : "",
                dateOfJoining: normalizedStatus === "joined" ? dateOfJoining : ""
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

function readItemClientFeedback(item) {
  const assessment = item?.raw?.assessment || (item?.sourceType === "assessment_only" ? item : null);
  const candidate = item?.raw?.candidate || null;
  const history = Array.isArray(assessment?.clientFeedbackHistory || candidate?.client_feedback_history)
    ? (assessment?.clientFeedbackHistory || candidate?.client_feedback_history)
    : [];
  return {
    feedback: String(assessment?.clientFeedback || candidate?.client_feedback || "").trim(),
    status: String(assessment?.clientFeedbackStatus || "").trim(),
    updatedAt: String(assessment?.clientFeedbackUpdatedAt || "").trim(),
    updatedBy: String(assessment?.clientFeedbackUpdatedBy || "").trim(),
    history
  };
}

function ClientFeedbackModal({ open, item, onClose, onSave }) {
  const feedbackMeta = readItemClientFeedback(item);
  const assessment = item?.raw?.assessment || (item?.sourceType === "assessment_only" ? item : null);
  const [status, setStatus] = useState("");
  const [feedback, setFeedback] = useState("");
  const [interviewAt, setInterviewAt] = useState("");
  const currentStatus = formatClientPortalStatusLabel(feedbackMeta.status || assessment?.candidateStatus) || "Not set";

  useEffect(() => {
    if (!open) return;
    setStatus(normalizeAssessmentStatusLabel(feedbackMeta.status || assessment?.candidateStatus));
    setFeedback("");
    setInterviewAt(toDateInputValue(assessment?.interviewAt || ""));
  }, [open, item?.id]);

  if (!open) return null;
  const showCalendar = isInterviewAlignedStatus(status);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>Client Feedback</h3>
        <p className="muted">{item?.candidateName || item?.name || "Candidate"} | {item?.position || item?.jdTitle || item?.role || "Untitled role"}</p>
        <div className="form-grid">
          <label>
            <span>Current status</span>
            <input value={currentStatus} readOnly />
          </label>
          <label>
            <span>Choose new status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">Keep current status</option>
              {DEFAULT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{formatClientPortalStatusLabel(option) || option}</option>)}
            </select>
          </label>
          {showCalendar ? (
            <label>
              <span>Interview / call date</span>
              <input type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} />
            </label>
          ) : null}
          <label>
            <span>Comment / feedback</span>
            <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Add what the client said or what should be reviewed next." />
          </label>
        </div>
        {feedbackMeta.history.length ? (
          <div className="feedback-preview">
            <div className="feedback-preview__label">Previous feedback</div>
            {feedbackMeta.history.slice().reverse().map((entry, index) => (
              <div className="status-note" key={`${entry.updatedAt || index}-${entry.status || ""}`}>
                {[entry.updatedAt ? new Date(entry.updatedAt).toLocaleString() : "", entry.updatedBy || "", entry.status || ""].filter(Boolean).join(" | ")}
                {entry.feedback ? <div>{entry.feedback}</div> : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="button-row">
          <button onClick={() => onSave({ status, feedback, interviewAt })}>Save feedback</button>
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function ClientPortalPieCard({ title, total, rows }) {
  const safeRows = (rows || []).filter((row) => Number(row.count || 0) > 0);
  const denominator = Math.max(1, Number(total || safeRows.reduce((sum, row) => sum + Number(row.count || 0), 0)));
  const colors = ["#a86f0d", "#163b6d", "#2f855a", "#b45309", "#9b2c2c", "#64748b", "#7c3aed"];
  let cursor = 0;
  const gradient = safeRows.length
    ? safeRows.map((row, index) => {
      const start = cursor;
      cursor += (Number(row.count || 0) / denominator) * 100;
      return `${colors[index % colors.length]} ${start}% ${cursor}%`;
    }).join(", ")
    : "#e8edf5 0% 100%";
  return (
    <article className="client-pie-card">
      <div className="client-pie-card__chart" style={{ background: `conic-gradient(${gradient})` }}>
        <span>{Number(total || 0)}</span>
      </div>
      <div>
        <div className="feedback-preview__label">{title}</div>
        <div className="client-pie-card__legend">
          {safeRows.length ? safeRows.map((row, index) => (
            <span key={row.label}><i style={{ background: colors[index % colors.length] }} />{row.label}: {row.count}</span>
          )) : <span>No profiles yet</span>}
        </div>
      </div>
    </article>
  );
}

function DrilldownModal({ open, title, items, onClose, onOpenCv, onOpenDraft, onOpenAssessment, onOpenNotes, onOpenStatus, onAddFeedback, extraActions = null }) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card overlay-card--wide" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <p className="muted">{items.length} candidate(s)</p>
        {extraActions ? <div className="drilldown-toolbar">{extraActions}</div> : null}
        <div className="stack-list compact">
          {!items.length ? <div className="empty-state">No matching candidates found.</div> : items.map((item, index) => (
            <article className="item-card compact-card" key={`${item.id || item.assessmentId || index}`}>
              {(() => {
                const feedbackMeta = readItemClientFeedback(item);
                const assessmentForAction = item.raw?.assessment || item.assessment || (item.assessmentId || item.sourceType === "assessment_only" ? item : null);
                const profileTarget = assessmentForAction || item;
                const candidateIdForAction = String(item.raw?.candidate?.id || (!assessmentForAction ? item.id : "") || "").trim();
                const profileOnlyMode = Boolean(onAddFeedback && !onOpenDraft && !onOpenNotes && !onOpenStatus);
                return (
              <div className="item-card__top">
                <div>
                  <h3>{item.name || item.candidateName || "Candidate"} | {item.position || item.jdTitle || item.role || "Untitled role"}</h3>
                  <p className="muted">{[item.company || item.currentCompany || "", item.clientName ? `Client: ${item.clientName}` : "", item.ownerRecruiter ? `Recruiter: ${item.ownerRecruiter}` : "", item.source ? `Source: ${item.source}` : ""].filter(Boolean).join(" | ")}</p>
                  <div className="candidate-snippet">{[item.candidateStatus ? `Assessment status: ${item.candidateStatus}` : "", item.followUpAt ? `Follow-up: ${new Date(item.followUpAt).toLocaleString()}` : "", item.interviewAt ? `Interview: ${new Date(item.interviewAt).toLocaleString()}` : ""].filter(Boolean).join("\n")}</div>
                  {feedbackMeta.feedback ? (
                    <div className="feedback-preview">
                      <div className="feedback-preview__label">Client feedback</div>
                      <div>{feedbackMeta.feedback}</div>
                      {feedbackMeta.history.length > 1 ? <div className="muted">{feedbackMeta.history.length} feedback update(s)</div> : null}
                      <div className="muted">{[feedbackMeta.status ? `Status: ${feedbackMeta.status}` : "", feedbackMeta.updatedBy || "", feedbackMeta.updatedAt ? new Date(feedbackMeta.updatedAt).toLocaleString() : ""].filter(Boolean).join(" | ")}</div>
                    </div>
                  ) : null}
                  <div className="button-row drilldown-actions">
                    {onOpenCv && (item.raw?.candidate?.id || item.id) && (item.raw?.candidate?.cv_filename || item.raw?.candidate?.cv_url) ? <button onClick={() => onOpenCv(item.raw?.candidate?.id || item.id)}>Open CV</button> : null}
                    {onOpenAssessment && (assessmentForAction || profileOnlyMode) ? <button onClick={() => onOpenAssessment(profileTarget)}>{profileOnlyMode ? "Open profile" : "Update Assessment"}</button> : null}
                    {assessmentForAction && onOpenStatus ? <button onClick={() => onOpenStatus(assessmentForAction)}>Update status</button> : null}
                    {!assessmentForAction && onOpenNotes && candidateIdForAction ? <button onClick={() => onOpenNotes(candidateIdForAction)}>Update notes</button> : null}
                    {!assessmentForAction && !onOpenNotes && onOpenDraft && candidateIdForAction ? <button onClick={() => onOpenDraft(candidateIdForAction)}>Update details</button> : null}
                    {!assessmentForAction && onOpenStatus && candidateIdForAction ? <button onClick={() => onOpenStatus({ candidateId: candidateIdForAction, item })}>Update status</button> : null}
                    {onAddFeedback ? <button className="ghost-btn" onClick={() => onAddFeedback(item)}>{feedbackMeta.feedback ? "Add another feedback" : "Add feedback"}</button> : null}
                  </div>
                </div>
              </div>
                );
              })()}
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

function CandidateProfileModal({ open, candidate, onClose, onOpenCv, onReuse, onCopyShareLink }) {
  if (!open || !candidate) return null;
  const ctx = resolveCandidateContext(candidate);
  const baseCandidate = ctx.candidate || candidate;
  const linkedAssessment = ctx.assessment || null;
  const meta = decodePortalApplicantMetadata(baseCandidate);
  const cvResult = meta?.cvAnalysisCache?.result && typeof meta.cvAnalysisCache.result === "object" ? meta.cvAnalysisCache.result : null;
  const cvMeta = getCandidateProfileCvMeta(baseCandidate);
  const tags = buildVisibleTagList(baseCandidate);
  const questionAnswers = getAssessmentQuestionAnswers(linkedAssessment || candidate);
  const draft = getCandidateDraftState(baseCandidate);
  const screeningRemarks = buildScreeningRemarksForExport({
    ...baseCandidate,
    ...(linkedAssessment || {}),
    other_standard_questions: String(ctx.otherStandardQuestions || linkedAssessment?.other_standard_questions || linkedAssessment?.otherStandardQuestions || linkedAssessment?.otherStandardQuestionAnswers || "").trim(),
    reason_of_change: linkedAssessment?.reasonForChange || baseCandidate.reason_of_change || ""
  });
  const reasonOfChange = String(linkedAssessment?.reasonForChange || buildReasonOfChangeForExport(baseCandidate) || "").trim();
  const noteFields = [
    linkedAssessment?.otherPointers,
    linkedAssessment?.callbackNotes,
    linkedAssessment?.recruiterNotes,
    baseCandidate.other_pointers,
    baseCandidate.otherPointers,
    baseCandidate.recruiter_context_notes,
    baseCandidate.recruiterNotes,
    baseCandidate.notes,
    baseCandidate.callbackNotes,
    baseCandidate.last_contact_notes,
    String(baseCandidate.raw_note || "").trim().startsWith(PORTAL_APPLICANT_METADATA_PREFIX) ? "" : baseCandidate.raw_note
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const uniqueNotes = Array.from(new Set(noteFields));
  const dateApplied = String(baseCandidate.created_at || baseCandidate.createdAt || candidate.createdAt || "").trim();
  const candidateRows = [
    ["Name of candidate", linkedAssessment?.candidateName || baseCandidate.name || draft.candidateName || "-"],
    ["Position applied for", linkedAssessment?.jdTitle || baseCandidate.assigned_jd_title || baseCandidate.jd_title || baseCandidate.jdTitle || baseCandidate.role || draft.jdTitle || "-"],
    ["Date applied", dateApplied ? new Date(dateApplied).toLocaleDateString() : "-"],
    ["Mobile", linkedAssessment?.phoneNumber || baseCandidate.phone || baseCandidate.phoneNumber || draft.phoneNumber || "-"],
    ["Email", linkedAssessment?.emailId || baseCandidate.email || baseCandidate.emailId || draft.emailId || "-"],
    ["Source", baseCandidate.source || baseCandidate.sourcePlatform || "-"]
  ];
  const educationRows = [
    ["Highest qualification", linkedAssessment?.highestEducation || baseCandidate.highest_education || baseCandidate.highestEducation || draft.highestEducation || "-"]
  ];
  const professionalRows = [
    ["Current/Last Organization", linkedAssessment?.currentCompany || baseCandidate.company || baseCandidate.currentCompany || draft.currentCompany || "-"],
    ["Designation / Role", linkedAssessment?.currentDesignation || baseCandidate.role || baseCandidate.currentDesignation || draft.currentDesignation || "-"],
    ["Total Work Experience", linkedAssessment?.totalExperience || baseCandidate.experience || baseCandidate.totalExperience || draft.totalExperience || "-"],
    ["Relevant Experience", draft.relevantExperience || "-"],
    ["Notice period", linkedAssessment?.noticePeriod || baseCandidate.notice_period || baseCandidate.noticePeriod || draft.noticePeriod || "-"],
    ["Reason for looking for a change", reasonOfChange || "-"],
    ["Current/Last CTC/PA", linkedAssessment?.currentCtc || baseCandidate.current_ctc || baseCandidate.currentCtc || draft.currentCtc || "-"],
    ["Expected CTC", linkedAssessment?.expectedCtc || baseCandidate.expected_ctc || baseCandidate.expectedCtc || draft.expectedCtc || "-"],
    ["Residence Location", linkedAssessment?.location || baseCandidate.location || draft.location || "-"],
    ["Offer in hand", linkedAssessment?.offerInHand || linkedAssessment?.offerAmount || baseCandidate.offer_in_hand || baseCandidate.offerInHand || draft.offerInHand || "-"],
    ["LWD / DOJ", sanitizeLwdOrDojValue(linkedAssessment?.lwdOrDoj || linkedAssessment?.offerDoj || baseCandidate.lwd_or_doj || baseCandidate.lwdOrDoj || draft.lwdOrDoj || "") || "-"]
  ];
  const excelSections = [
    { title: "Candidate Details", rows: candidateRows.map(([label, value]) => ({ label, value })) },
    { title: "Education Background", rows: educationRows.map(([label, value]) => ({ label, value })) },
    { title: "Personal & Professional Information", rows: professionalRows.map(([label, value]) => ({ label, value })) },
    { title: "Screening Remarks", rows: [{ label: "Screening remarks", value: screeningRemarks || (questionAnswers || []).map((pair) => `${pair.question}: ${pair.answer}`).join("\n") || "-" }] }
  ];
  if (tags.length) excelSections.push({ title: "Tags / searchable keywords", rows: [{ label: "Tags", value: tags.join(", ") }] });
  excelSections.push({ title: "CV", rows: [{ label: "CV", value: candidateHasStoredCv(baseCandidate) ? (cvMeta.filename || "Uploaded CV available") : "No uploaded CV available yet." }] });

  const modalTitle = linkedAssessment?.candidateName || baseCandidate.name || draft.candidateName || "Candidate";
  const modalSubtitle = [
    linkedAssessment?.clientName || baseCandidate.client_name || baseCandidate.clientName || draft.clientName || "",
    linkedAssessment?.jdTitle || baseCandidate.assigned_jd_title || baseCandidate.jd_title || baseCandidate.jdTitle || draft.jdTitle || baseCandidate.role || "",
    linkedAssessment?.currentCompany || baseCandidate.company || baseCandidate.currentCompany || draft.currentCompany || ""
  ].filter(Boolean).join(" | ");
  const assessmentStatusLabel = linkedAssessment
    ? normalizeAssessmentStatusLabel(
        linkedAssessment?.candidateStatus ||
          linkedAssessment?.candidate_status ||
          linkedAssessment?.assessment_status ||
          ""
      )
    : "";
  return (
    <div className="overlay">
      <div className="overlay-card overlay-card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="candidate-sheet__head">
          <div>
            <h3>{modalTitle}</h3>
            <p className="muted">{modalSubtitle}</p>
          </div>
          <div className="candidate-sheet__head-meta">
            {assessmentStatusLabel ? <span className="chip">Assessment status: {assessmentStatusLabel}</span> : null}
          </div>
        </div>

        <div className="candidate-sheet">
          <div className="candidate-sheet__section">
            <div className="candidate-sheet__section-title">Candidate Details</div>
            <div className="candidate-sheet__rows">
              {candidateRows.map(([label, value]) => (
                <div className="candidate-sheet__row" key={label}>
                  <div className="candidate-sheet__label">{label}</div>
                  <div className="candidate-sheet__value">{String(value || "-")}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="candidate-sheet__section">
            <div className="candidate-sheet__section-title">Education Background</div>
            <div className="candidate-sheet__rows">
              {educationRows.map(([label, value]) => (
                <div className="candidate-sheet__row" key={label}>
                  <div className="candidate-sheet__label">{label}</div>
                  <div className="candidate-sheet__value">{String(value || "-")}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="candidate-sheet__section">
            <div className="candidate-sheet__section-title">Personal &amp; Professional Information</div>
            <div className="candidate-sheet__rows">
              {professionalRows.map(([label, value]) => (
                <div className="candidate-sheet__row" key={label}>
                  <div className="candidate-sheet__label">{label}</div>
                  <div className="candidate-sheet__value">{String(value || "-")}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="candidate-sheet__section">
            <div className="candidate-sheet__section-title">Screening Remarks</div>
            {screeningRemarks ? (
              <div className="candidate-sheet__remarks">{screeningRemarks}</div>
            ) : questionAnswers.length ? (
              <div className="client-profile-qa">
                {questionAnswers.map((pair, index) => (
                  <div className="client-profile-qa__item" key={`${pair.question}-${index}`}>
                    <strong>{pair.question}</strong>
                    <span>{pair.answer}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No screening remarks saved yet.</p>
            )}
          </div>

          {tags.length ? (
            <div className="candidate-sheet__section">
              <div className="candidate-sheet__section-title">Tags / searchable keywords</div>
              <div className="chip-row">
                {tags.map((tag) => <span key={tag} className="chip">{tag}</span>)}
              </div>
            </div>
          ) : null}

          <div className="candidate-sheet__section">
            <div className="candidate-sheet__section-title">CV</div>
            {candidateHasStoredCv(baseCandidate) ? (
              <p>{cvMeta.filename || "Uploaded CV"} is available for this profile.</p>
            ) : (
              <p className="muted">No uploaded CV available yet.</p>
            )}
          </div>
        </div>
        <div className="button-row">
          {onReuse ? <button onClick={() => onReuse(candidate)}>Reuse profile</button> : null}
          <button className="ghost-btn" onClick={() => downloadCandidateCardExcelFile(`candidate-card-${new Date().toISOString().slice(0, 10)}.xls`, { title: modalTitle, subtitle: modalSubtitle, sections: excelSections })}>Download card (Excel)</button>
          {onCopyShareLink && baseCandidate?.id ? <button className="ghost-btn" onClick={() => onCopyShareLink(baseCandidate.id)}>Copy share link</button> : null}
          {candidateHasStoredCv(baseCandidate) ? <button onClick={() => onOpenCv(candidate)}>Open CV</button> : null}
          <button className="ghost-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ClientProfileModal({ open, item, onClose, copySettings = DEFAULT_COPY_SETTINGS, presetId = "client_submission", onOpenCv }) {
  if (!open || !item) return null;
  const assessment = item.raw?.assessment || item;
  const candidate = item.raw?.candidate || {};
  const assessmentId = String(assessment.id || item.id || "").trim();
  const candidateDraft = getCandidateDraftState(candidate);
  const otherPointers = String(assessment.otherPointers || item.otherPointers || candidate.other_pointers || "").trim();
  const questionAnswers = getAssessmentQuestionAnswers(assessment);
  const hasCv = clientPortalItemHasCv(item);
  const trackerRows = buildClientPortalTrackerRows([item], assessmentId && hasCv ? { [assessmentId]: "Open CV from client portal" } : {});
  const trackerPreview = buildCapturedExcelRows(trackerRows, presetId || copySettings.excelPreset, copySettings);
  const screeningRemarks = buildScreeningRemarksForExport({
    ...candidate,
    ...assessment,
    other_standard_questions: assessment.other_standard_questions || assessment.otherStandardQuestions || assessment.otherStandardQuestionAnswers || "",
    reason_of_change: assessment.reasonForChange || candidate.reason_of_change || ""
  });
  const dateApplied = String(item.createdAt || assessment.createdAt || candidate.created_at || "").trim();
  const modalTitle = assessment.candidateName || item.candidateName || candidate.name || "Candidate";
  const modalSubtitle = [assessment.clientName || item.clientName || candidate.client_name || candidateDraft.clientName || "", assessment.jdTitle || item.position || item.role || candidate.jd_title || candidateDraft.jdTitle || "", assessment.currentCompany || item.company || candidate.company || ""].filter(Boolean).join(" | ");
  const candidateRows = [
    ["Name of candidate", assessment.candidateName || item.candidateName || candidate.name || candidateDraft.candidateName || "-"],
    ["Position applied for", assessment.jdTitle || item.position || item.role || candidate.jd_title || candidateDraft.jdTitle || "-"],
    ["Date applied", dateApplied ? new Date(dateApplied).toLocaleDateString() : "-"],
    ["Mobile", assessment.phoneNumber || item.phone || candidate.phone || candidateDraft.phoneNumber || "-"],
    ["Email", assessment.emailId || item.email || candidate.email || candidateDraft.emailId || "-"],
    ["Source", candidate.source || item.source || "Client portal"]
  ];
  const educationRows = [
    ["Highest qualification", assessment.highestEducation || candidate.highest_education || candidateDraft.highestEducation || "-"]
  ];
  const professionalRows = [
    ["Current/Last Organization", assessment.currentCompany || item.company || candidate.company || candidateDraft.currentCompany || "-"],
    ["Designation / Role", assessment.currentDesignation || item.role || candidate.role || candidateDraft.currentDesignation || "-"],
    ["Total Work Experience", assessment.totalExperience || item.totalExperience || candidate.experience || candidateDraft.totalExperience || "-"],
    ["Relevant Experience", assessment.relevantExperience || candidateDraft.relevantExperience || "-"],
    ["Notice period", assessment.noticePeriod || item.noticePeriod || candidate.notice_period || candidateDraft.noticePeriod || "-"],
    ["Reason for looking for a change", assessment.reasonForChange || buildReasonOfChangeForExport(candidate) || "-"],
    ["Current/Last CTC/PA", assessment.currentCtc || item.currentCtc || candidate.current_ctc || candidateDraft.currentCtc || "-"],
    ["Expected CTC", assessment.expectedCtc || item.expectedCtc || candidate.expected_ctc || candidateDraft.expectedCtc || "-"],
    ["Residence Location", assessment.location || item.location || candidate.location || candidateDraft.location || "-"],
    ["Offer in hand", assessment.offerInHand || assessment.offerAmount || item.offerInHand || candidate.offer_in_hand || candidateDraft.offerInHand || "-"],
    ["LWD / DOJ", sanitizeLwdOrDojValue(assessment.lwdOrDoj || assessment.offerDoj || item.lwdOrDoj || candidate.lwd_or_doj || candidateDraft.lwdOrDoj || "") || "-"]
  ];
  const excelSections = [
    { title: "Candidate Details", rows: candidateRows.map(([label, value]) => ({ label, value })) },
    { title: "Education Background", rows: educationRows.map(([label, value]) => ({ label, value })) },
    { title: "Personal & Professional Information", rows: professionalRows.map(([label, value]) => ({ label, value })) },
    { title: "Screening Remarks", rows: [{ label: "Screening remarks", value: screeningRemarks || (questionAnswers || []).map((pair) => `${pair.question}: ${pair.answer}`).join("\n") || "-" }] }
  ];
  if (otherPointers) excelSections.push({ title: "Other Pointers", rows: [{ label: "Other pointers", value: otherPointers }] });
  excelSections.push({ title: "CV", rows: [{ label: "CV", value: hasCv ? "CV is available for this profile." : "No uploaded CV available yet." }] });
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card overlay-card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="candidate-sheet__head">
          <div>
            <h3>{modalTitle}</h3>
            <p className="muted">{modalSubtitle}</p>
          </div>
          <div className="candidate-sheet__head-meta">
            {assessment.candidateStatus ? <span className="chip">Assessment status: {formatClientPortalStatusLabel(assessment.candidateStatus)}</span> : null}
          </div>
        </div>

        <div className="candidate-sheet">
          <div className="candidate-sheet__section">
            <div className="candidate-sheet__section-title">Candidate Details</div>
            <div className="candidate-sheet__rows">
              {candidateRows.map(([label, value]) => (
                <div className="candidate-sheet__row" key={label}>
                  <div className="candidate-sheet__label">{label}</div>
                  <div className="candidate-sheet__value">{String(value || "-")}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="candidate-sheet__section">
            <div className="candidate-sheet__section-title">Education Background</div>
            <div className="candidate-sheet__rows">
              {educationRows.map(([label, value]) => (
                <div className="candidate-sheet__row" key={label}>
                  <div className="candidate-sheet__label">{label}</div>
                  <div className="candidate-sheet__value">{String(value || "-")}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="candidate-sheet__section">
            <div className="candidate-sheet__section-title">Personal &amp; Professional Information</div>
            <div className="candidate-sheet__rows">
              {professionalRows.map(([label, value]) => (
                <div className="candidate-sheet__row" key={label}>
                  <div className="candidate-sheet__label">{label}</div>
                  <div className="candidate-sheet__value">{String(value || "-")}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="candidate-sheet__section">
            <div className="candidate-sheet__section-title">Screening Remarks</div>
            {screeningRemarks ? (
              <div className="candidate-sheet__remarks">{screeningRemarks}</div>
            ) : questionAnswers.length ? (
              <div className="client-profile-qa">
                {questionAnswers.map((pair, index) => (
                  <div className="client-profile-qa__item" key={`${pair.question}-${index}`}>
                    <strong>{pair.question}</strong>
                    <span>{pair.answer}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No screening remarks saved yet.</p>
            )}
          </div>

          {otherPointers ? (
            <div className="candidate-sheet__section">
              <div className="candidate-sheet__section-title">Other Pointers</div>
              <div className="client-profile-notes__body">{otherPointers}</div>
            </div>
          ) : null}

          <div className="candidate-sheet__section">
            <div className="candidate-sheet__section-title">CV</div>
            {hasCv ? <p>CV is available for this profile.</p> : <p className="muted">No uploaded CV available yet.</p>}
          </div>
        </div>
        <div className="client-profile-notes">
          <div className="info-label">Client Tracker Preview</div>
          <div className="table-wrap client-tracker-preview">
            <table className="dashboard-table">
              <thead><tr>{trackerPreview.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>
                {trackerPreview.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={`${rowIndex}-${cellIndex}`}>{cell || "-"}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="button-row">
          {hasCv ? <button onClick={() => onOpenCv?.(item)}>Download / Open CV</button> : null}
          <button className="ghost-btn" onClick={() => downloadCandidateCardExcelFile(`candidate-card-${new Date().toISOString().slice(0, 10)}.xls`, { title: modalTitle, subtitle: modalSubtitle, sections: excelSections })}>Download card (Excel)</button>
          <button className="ghost-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function JdEmailModal({ open, jobs, value, onChange, onClose, onSend, busy = false, status = "", statusKind = "" }) {
  if (!open) return null;
  const jobOptions = Array.isArray(jobs) ? jobs : [];
  return (
    <div className="overlay" onClick={() => { if (!busy) onClose(); }}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>Send JD Email</h3>
        <p className="muted">Sends from your configured SMTP (Settings → Email settings). Use Zoho app password.</p>
        {status ? <div className={`status ${statusKind || ""}`} style={{ marginBottom: 12 }}>{status}</div> : null}
        <div className="form-grid">
          <label className="full">
            <span>To</span>
            <input value={value.to} onChange={(e) => onChange("to", e.target.value)} placeholder="candidate@example.com" />
          </label>
          <label className="full">
            <span>CC (optional)</span>
            <input value={value.cc || ""} onChange={(e) => onChange("cc", e.target.value)} placeholder="manager@company.com, team@company.com" />
          </label>
          <label className="full">
            <span>JD / role</span>
            <select value={value.jobId} onChange={(e) => onChange("jobId", e.target.value)}>
              <option value="">Select JD / role</option>
              {jobOptions.map((job) => (
                <option key={job.id} value={job.id}>{job.title || "Untitled role"}</option>
              ))}
            </select>
          </label>
          <label className="full">
            <span>Subject</span>
            <input value={value.subject} onChange={(e) => onChange("subject", e.target.value)} placeholder="JD: ..." />
          </label>
          <label className="full">
            <span>Intro message (optional)</span>
            <textarea rows={5} value={value.introText} onChange={(e) => onChange("introText", e.target.value)} placeholder="Hi, sharing the JD for your reference..." />
          </label>
          <label className="checkbox-row full">
            <input type="checkbox" checked={value.attachJdFile !== false} onChange={(e) => onChange("attachJdFile", e.target.checked)} />
            <span>Attach JD as Word (.docx)</span>
          </label>
        </div>
        <div className="button-row">
          <button disabled={busy} onClick={onSend}>{busy ? "Sending..." : "Send email"}</button>
          <button className="ghost-btn" disabled={busy} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

const DASHBOARD_FILTER_STORAGE_KEY = "recruitdesk_portal_dashboard_filters_v1";

function PortalApp({ token, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState({
    user: null,
    dashboard: null,
    clientPortal: null,
    applicants: [],
    candidates: [],
    databaseCandidates: [],
    assessments: [],
    users: [],
    intake: null,
    jobs: []
  });
  const [statuses, setStatuses] = useState({});
  const [assignApplicantId, setAssignApplicantId] = useState("");
  const [assignCandidateId, setAssignCandidateId] = useState("");
  const [hostedJobId, setHostedJobId] = useState("");
  const [hostedRecruiterApplyLinks, setHostedRecruiterApplyLinks] = useState([]);
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
  const latestDashboardKeyRef = useRef("");
  const latestClientPortalKeyRef = useRef("");
  const [clientPortalFilters, setClientPortalFilters] = useState({
    dateFrom: "",
    dateTo: "",
    clientLabel: "",
    positionLabel: ""
  });
  const [candidateFilters, setCandidateFilters] = useState({
    q: "",
    dateFrom: "",
    dateTo: "",
    clients: [],
    jds: [],
    assignedTo: [],
    capturedBy: [],
    sources: [],
    outcomes: [],
    activeStates: []
  });
  const [applicantFilters, setApplicantFilters] = useState({
    q: "",
    dateFrom: "",
    dateTo: "",
    clients: [],
    jds: [],
    ownedBy: [],
    assignedTo: [],
    outcomes: [],
    activeStates: []
  });
  const [assessmentFilters, setAssessmentFilters] = useState({
    q: "",
    dateFrom: "",
    dateTo: "",
    clients: [],
    jds: [],
    recruiters: [],
    outcomes: []
  });
  const [assessmentLane, setAssessmentLane] = useState("active"); // active | archived
  const [candidateSearchMode, setCandidateSearchMode] = useState("all");
  const [candidateSearchText, setCandidateSearchText] = useState("");
  const [candidateSearchQueryUsed, setCandidateSearchQueryUsed] = useState("");
  const [candidateAiQueryMode, setCandidateAiQueryMode] = useState("natural");
  const [candidateKeywordMust, setCandidateKeywordMust] = useState("");
  const [candidateKeywordAny, setCandidateKeywordAny] = useState("");
  const [candidateKeywordExclude, setCandidateKeywordExclude] = useState("");
  const [candidateQuickChipIds, setCandidateQuickChipIds] = useState([]);
  const [candidateSmartDateFrom, setCandidateSmartDateFrom] = useState("");
  const [candidateSmartDateTo, setCandidateSmartDateTo] = useState("");
  const [candidateFilterPanelOpen, setCandidateFilterPanelOpen] = useState(true);
  const [candidateFilterDrawerOpen, setCandidateFilterDrawerOpen] = useState(false);
  const [isCandidateFilterMobile, setIsCandidateFilterMobile] = useState(() => (
    typeof window !== "undefined" ? window.innerWidth <= 1024 : false
  ));
  const [candidateSearchResults, setCandidateSearchResults] = useState([]);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateStructuredFilters, setCandidateStructuredFilters] = useState(EMPTY_CANDIDATE_STRUCTURED_FILTERS); // applied
  const [candidateStructuredFiltersDraft, setCandidateStructuredFiltersDraft] = useState(EMPTY_CANDIDATE_STRUCTURED_FILTERS); // editable
  const [candidateSearchBusy, setCandidateSearchBusy] = useState(false);
  const [candidateSearchingAs, setCandidateSearchingAs] = useState("");
  const [candidateSearchDebug, setCandidateSearchDebug] = useState(null);
  const [candidateParseFeedbackBusy, setCandidateParseFeedbackBusy] = useState(false);
  const candidateKeywordPreview = useMemo(() => (
    buildBooleanFromKeywordBars({
      must: candidateKeywordMust,
      any: candidateKeywordAny,
      exclude: candidateKeywordExclude
    })
  ), [candidateKeywordMust, candidateKeywordAny, candidateKeywordExclude]);
  const candidateStructuredFiltersDirty = useMemo(() => (
    JSON.stringify(candidateStructuredFiltersDraft) !== JSON.stringify(candidateStructuredFilters)
  ), [candidateStructuredFiltersDraft, candidateStructuredFilters]);
  const candidateNoticeBucketChipOptions = useMemo(() => (
    NOTICE_BUCKET_OPTIONS
      .filter((option) => option.value)
      .map((option) => option.label)
  ), []);
  const candidateNoticeBucketValueByLabel = useMemo(() => (
    Object.fromEntries(NOTICE_BUCKET_OPTIONS.filter((option) => option.value).map((option) => [option.label, option.value]))
  ), []);
  const candidateNoticeBucketLabelByValue = useMemo(() => (
    Object.fromEntries(NOTICE_BUCKET_OPTIONS.filter((option) => option.value).map((option) => [option.value, option.label]))
  ), []);
  const candidateNoticeBucketSelectedLabels = useMemo(() => (
    parseMultiChipTokens(candidateStructuredFiltersDraft.noticeBucket)
      .map((value) => candidateNoticeBucketLabelByValue[value] || value)
      .filter(Boolean)
  ), [candidateStructuredFiltersDraft.noticeBucket, candidateNoticeBucketLabelByValue]);
  const renderCandidateFilterPanel = () => (
    <div className="item-card compact-card candidate-filter-card">
      <div className="candidate-filter-head">
        <div>
          <h3>Structured filters</h3>
          <p className="muted">Naukri-style filters. Smart search fills these automatically; you can adjust them before copying or downloading results.</p>
        </div>
      </div>
      <div className="candidate-filter-layout">
        <div className="candidate-filter-column candidate-filter-column--wide">
          <div className="candidate-filter-group">
            <div className="candidate-filter-label">Experience</div>
            <div className="range-row">
              <input type="number" min="0" value={candidateStructuredFiltersDraft.minExperience} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, minExperience: e.target.value }))} placeholder="Min experience" />
              <span>to</span>
              <input type="number" min="0" value={candidateStructuredFiltersDraft.maxExperience} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, maxExperience: e.target.value }))} placeholder="Max experience" />
              <span>Years</span>
            </div>
          </div>
          <div className="candidate-filter-group">
            <div className="candidate-filter-label">Current CTC</div>
            <div className="range-row">
              <input type="number" min="0" value={candidateStructuredFiltersDraft.minCurrentCtc} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, minCurrentCtc: e.target.value }))} placeholder="Min salary" />
              <span>to</span>
              <input type="number" min="0" value={candidateStructuredFiltersDraft.maxCurrentCtc} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, maxCurrentCtc: e.target.value }))} placeholder="Max salary" />
              <span>Lacs</span>
            </div>
          </div>
          <div className="candidate-filter-group">
            <div className="candidate-filter-label">Expected CTC</div>
            <div className="range-row">
              <input type="number" min="0" value={candidateStructuredFiltersDraft.minExpectedCtc} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, minExpectedCtc: e.target.value }))} placeholder="Min salary" />
              <span>to</span>
              <input type="number" min="0" value={candidateStructuredFiltersDraft.maxExpectedCtc} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, maxExpectedCtc: e.target.value }))} placeholder="Max salary" />
              <span>Lacs</span>
            </div>
          </div>
        </div>
        <div className="candidate-filter-column">
          <label><span>Keywords</span><input value={candidateStructuredFiltersDraft.keySkills} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, keySkills: e.target.value }))} placeholder="SaaS, sales, B2B, candidate name" /></label>
          <label><span>Locations</span><input value={candidateStructuredFiltersDraft.location} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, location: e.target.value }))} placeholder="Mumbai, Hyderabad" /></label>
          <div className="filter-block">
            <div className="candidate-filter-label">Notice period</div>
            <MultiSelectDropdown
              label="Notice period"
              summaryLabel="Select"
              options={candidateNoticeBucketChipOptions}
              selected={candidateNoticeBucketSelectedLabels}
              onToggle={(option) => {
                if (option === "__all__") {
                  setCandidateStructuredFiltersDraft((current) => ({ ...current, noticeBucket: "", maxNoticeDays: "" }));
                  return;
                }
                const toggledLabels = toggleMultiChipValue(candidateNoticeBucketSelectedLabels.join(", "), option);
                const selectedLabels = parseMultiChipTokens(toggledLabels);
                const selectedValues = selectedLabels.map((label) => candidateNoticeBucketValueByLabel[label]).filter(Boolean);
                setCandidateStructuredFiltersDraft((current) => ({
                  ...current,
                  noticeBucket: selectedValues.join(", "),
                  maxNoticeDays: ""
                }));
              }}
              emptySummary="Any notice period"
            />
          </div>
        </div>
        <div className="candidate-filter-column">
          <label><span>Current company</span><input value={candidateStructuredFiltersDraft.currentCompany} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, currentCompany: e.target.value }))} placeholder="Infosys" /></label>
          <label><span>Qualification</span><input value={candidateStructuredFiltersDraft.qualification} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, qualification: e.target.value }))} placeholder="B.Tech / MBA" /></label>
          <div className="filter-block">
            <div className="candidate-filter-label">Client</div>
            <MultiSelectDropdown
              label="Client"
              summaryLabel="Select"
              options={candidateSearchOptions.clients}
              selected={parseMultiChipTokens(candidateStructuredFiltersDraft.client)}
              onToggle={(option) => setCandidateStructuredFiltersDraft((current) => ({
                ...current,
                client: toggleMultiChipValue(current.client, option)
              }))}
              emptySummary="All clients"
            />
          </div>
        </div>
        <div className="candidate-filter-column">
          <div className="filter-block">
            <div className="candidate-filter-label">Recruiter</div>
            <MultiSelectDropdown
              label="Recruiter"
              summaryLabel="Select"
              options={candidateSearchOptions.recruiters}
              selected={parseMultiChipTokens(candidateStructuredFiltersDraft.recruiter)}
              onToggle={(option) => setCandidateStructuredFiltersDraft((current) => ({
                ...current,
                recruiter: toggleMultiChipValue(current.recruiter, option)
              }))}
              emptySummary="All recruiters"
            />
          </div>
          <div className="filter-block">
            <div className="candidate-filter-label">Gender</div>
            <MultiSelectDropdown
              label="Gender"
              summaryLabel="Select"
              options={Array.from(new Set(["Male", "Female", ...(candidateSearchOptions.genders || [])])).filter(Boolean)}
              selected={parseMultiChipTokens(candidateStructuredFiltersDraft.gender)}
              onToggle={(option) => setCandidateStructuredFiltersDraft((current) => ({
                ...current,
                gender: toggleMultiChipValue(current.gender, option)
              }))}
              emptySummary="All genders"
            />
          </div>
          <div className="filter-block">
            <div className="candidate-filter-label">Assessment status</div>
            <MultiSelectDropdown
              label="Assessment status"
              summaryLabel="Select"
              options={DEFAULT_STATUS_OPTIONS}
              selected={parseMultiChipTokens(candidateStructuredFiltersDraft.assessmentStatus)}
              onToggle={(option) => setCandidateStructuredFiltersDraft((current) => ({
                ...current,
                assessmentStatus: toggleMultiChipValue(current.assessmentStatus, option)
              }))}
              emptySummary="Any status"
            />
          </div>
          <div className="filter-block">
            <div className="candidate-filter-label">Attempt outcome</div>
            <MultiSelectDropdown
              label="Attempt outcome"
              summaryLabel="Select"
              options={ATTEMPT_OUTCOME_OPTIONS}
              selected={parseMultiChipTokens(candidateStructuredFiltersDraft.attemptOutcome)}
              onToggle={(option) => setCandidateStructuredFiltersDraft((current) => ({
                ...current,
                attemptOutcome: toggleMultiChipValue(current.attemptOutcome, option)
              }))}
              emptySummary="Any outcome"
            />
          </div>
        </div>
      </div>
      <div className="button-row" style={{ marginTop: 10 }}>
        <button
          className={candidateStructuredFiltersDirty ? "" : "ghost-btn"}
          disabled={!candidateStructuredFiltersDirty}
          onClick={() => {
            setCandidateStructuredFilters(candidateStructuredFiltersDraft);
            setCandidatePage(1);
            setStatus("workspace", "Filters applied.", "ok");
            if (isCandidateFilterMobile) setCandidateFilterDrawerOpen(false);
          }}
        >
          Apply filters
        </button>
        {candidateStructuredFiltersDirty ? <div className="muted">You have unapplied filter changes.</div> : null}
      </div>
    </div>
  );
  const [clientShareDraft, setClientShareDraft] = useState({
    hrName: "",
    recruiterName: "",
    recipientEmail: "",
    emailSubject: "",
    clientLabel: "",
    targetRole: "",
    presetId: "client_submission",
    introText: "",
    extraMessage: "",
    signatureText: "",
    signatureLinkLabel: "",
    signatureLinkUrl: "",
    signatureLinkLabel2: "",
    signatureLinkUrl2: ""
  });
  const [selectedAssessmentIds, setSelectedAssessmentIds] = useState([]);
  const [databaseProfileItem, setDatabaseProfileItem] = useState(null);
  const [clientShareCvLinks, setClientShareCvLinks] = useState({});
  const [clientShareCvLinkState, setClientShareCvLinkState] = useState({});
  const [clientShareCvLinkFingerprint, setClientShareCvLinkFingerprint] = useState({});
  const [agendaRange, setAgendaRange] = useState("today");
  const [openAssessmentMoreId, setOpenAssessmentMoreId] = useState("");
  const assessmentMoreMenuRef = useRef(null);
  // Assessment event exports are available via dedicated buttons (no modal).
  const [copySettings, setCopySettings] = useState(() => {
    try {
      const saved = window.localStorage.getItem(COPY_SETTINGS_STORAGE_KEY);
      return migrateCopySettings(saved ? JSON.parse(saved) : {});
    } catch {
      return migrateCopySettings({});
    }
  });
  const exportPresetOptions = useMemo(() => [
    { id: "compact_recruiter", label: copySettings.exportPresetLabels?.compact_recruiter || "Compact recruiter" },
    { id: "client_tracker", label: copySettings.exportPresetLabels?.client_tracker || "Client tracker" },
    { id: "attentive_tracker", label: copySettings.exportPresetLabels?.attentive_tracker || "Attentive tracker" },
    { id: "client_submission", label: copySettings.exportPresetLabels?.client_submission || "Client submission" },
    { id: "screening_focus", label: copySettings.exportPresetLabels?.screening_focus || "Screening focus" },
    ...((copySettings.customExportPresets || []).map((preset) => ({
      id: preset.id,
      label: preset.label || preset.id
    })))
  ].filter((preset) => String(preset.id || "").trim()), [copySettings]);
  const [activeCopyPresetId, setActiveCopyPresetId] = useState(copySettings.excelPreset || "compact_recruiter");
  const [newPresetDraft, setNewPresetDraft] = useState({ label: "", clientName: "", columns: "" });
  const [teamUserDraft, setTeamUserDraft] = useState({ name: "", email: "", password: "", role: "recruiter" });
  const [teamPasswordDrafts, setTeamPasswordDrafts] = useState({});
  const [companyDraft, setCompanyDraft] = useState({ companyName: "", adminName: "", email: "", password: "", platformSecret: "" });
  const [clientUsers, setClientUsers] = useState([]);
  const availablePresetClients = useMemo(() => {
    const values = new Set();
    (state.jobs || []).forEach((job) => {
      const clientName = String(job?.clientName || job?.client_name || "").trim();
      if (clientName) values.add(clientName);
    });
    (clientUsers || []).forEach((client) => {
      const clientName = String(client?.clientName || "").trim();
      if (clientName) values.add(clientName);
    });
    (((state.clientPortal || {}).availableClients) || []).forEach((clientName) => {
      const value = String(clientName || "").trim();
      if (value) values.add(value);
    });
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [state.jobs, state.clientPortal, clientUsers]);
  const [clientUserDraft, setClientUserDraft] = useState({ username: "", password: "", clientName: "", allowedPositions: "" });
  const [clientPasswordDrafts, setClientPasswordDrafts] = useState({});
  const [quickUpdateCandidateQuery, setQuickUpdateCandidateQuery] = useState("");
  const [quickUpdateCandidateId, setQuickUpdateCandidateId] = useState("");
  const [quickUpdateText, setQuickUpdateText] = useState("");
  const [quickUpdateStatusText, setQuickUpdateStatusText] = useState("");
  const [quickUpdateAttemptOutcome, setQuickUpdateAttemptOutcome] = useState("");
  const [quickUpdateAssessmentStatus, setQuickUpdateAssessmentStatus] = useState("");
  const [quickUpdateStatusAt, setQuickUpdateStatusAt] = useState("");
  const [quickUpdateOfferAmount, setQuickUpdateOfferAmount] = useState("");
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
  const [drilldownState, setDrilldownState] = useState({ open: false, title: "", items: [], request: null });
  const [clientFeedbackItem, setClientFeedbackItem] = useState(null);
	const [attempts, setAttempts] = useState([]);
	const workspaceRefreshInFlightRef = useRef(false);
	const lastWorkspaceRefreshAtRef = useRef(0);
  // Prevent background refresh from clobbering in-flight actions (e.g. SMTP send).
  const suspendWorkspaceRefreshRef = useRef(false);
	const loadWorkspaceRef = useRef(null);
	const linkedinSideWindowRef = useRef(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobShortcutKey, setJobShortcutKey] = useState("");
  const [jobShortcutValue, setJobShortcutValue] = useState("");
  const [jobDraft, setJobDraft] = useState({
    id: "",
    title: "",
    clientName: "",
    ownerRecruiterId: "",
    ownerRecruiterName: "",
    assignedRecruiters: [],
    aboutCompany: "",
    publicCompanyLine: "",
    publicTitle: "",
    location: "",
    workMode: "",
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
    linkedin: "",
    location: "",
    gender: "",
    currentCtc: "",
    expectedCtc: "",
    noticePeriod: "",
    offerInHand: "",
    lwdOrDoj: "",
    currentCompany: "",
    currentDesignation: "",
    totalExperience: "",
    relevantExperience: "",
    highestEducation: "",
    currentOrgTenure: "",
    experienceTimeline: "",
    reasonForChange: "",
    cautiousIndicators: "",
    clientName: "",
    jdTitle: "",
    pipelineStage: "Under Interview Process",
    candidateStatus: "Screening in progress",
    followUpAt: "",
    interviewAt: "",
    recruiterNotes: "",
    callbackNotes: "",
    otherPointers: "",
    tags: "",
    jdScreeningAnswers: {},
    cvAnalysis: null,
    cvAnalysisApplied: false
  });
  const [smtpSettings, setSmtpSettings] = useState({
    host: "",
    port: 587,
    secure: false,
    user: "",
    from: "",
    pass: "",
    hasPassword: false,
    signatureText: "",
    signatureLinkLabel: "",
    signatureLinkUrl: "",
    signatureLinkLabel2: "",
    signatureLinkUrl2: ""
  });
  const [smtpSettingsLoaded, setSmtpSettingsLoaded] = useState(false);
  const [smtpSettingsKeepPass, setSmtpSettingsKeepPass] = useState(true);
  const smtpSettingsDirtyRef = useRef(false);
  const markSmtpSettingsDirty = () => { smtpSettingsDirtyRef.current = true; };

  const [jdEmailModal, setJdEmailModal] = useState({
    open: false,
    candidate: null,
    to: "",
    cc: "",
    subject: "",
    introText: "",
    jobId: "",
    attachJdFile: true,
    signatureText: "",
    signatureLinks: []
  });
  const [jdEmailBusy, setJdEmailBusy] = useState(false);
  const [jdEmailModalStatus, setJdEmailModalStatus] = useState({ message: "", kind: "" });

  const isAssessmentArchived = (assessment) => {
    if (!assessment) return false;
    const archivedFlag = assessment?.archived ?? assessment?.isArchived ?? assessment?.archived_flag;
    if (archivedFlag === true) return true;
    const archivedAt = String(assessment?.archivedAt || assessment?.archived_at || "").trim();
    return Boolean(archivedAt);
  };

  useEffect(() => {
    // Archived assessments should not be selected for client share.
    setSelectedAssessmentIds([]);
  }, [assessmentLane]);

  useEffect(() => {
    // Load per-recruiter SMTP settings when user opens mail settings (or admin settings).
    if (location?.pathname === "/mail-settings" || location?.pathname === "/settings") void loadSmtpSettingsOnce();
  }, [location?.pathname]);

  useEffect(() => {
    if (!openAssessmentMoreId) return;
    const handlePointerDown = (event) => {
      const root = assessmentMoreMenuRef.current;
      if (root && event?.target && root.contains(event.target)) return;
      setOpenAssessmentMoreId("");
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [openAssessmentMoreId]);
  useEffect(() => {
    const handleResize = () => {
      const nextMobile = window.innerWidth <= 1024;
      setIsCandidateFilterMobile(nextMobile);
      if (!nextMobile) setCandidateFilterDrawerOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  const [editCautiousIndicators, setEditCautiousIndicators] = useState(false);

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
  const navSections = useMemo(() => (
    BASE_NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if ((item.to === "/login-settings" || item.to === "/intake-settings" || item.to === "/settings") && !isSettingsAdmin) return false;
          return true;
        })
      }))
      .filter((section) => section.items.length)
  ), [isSettingsAdmin]);
  const standaloneNavItems = STANDALONE_NAV_ITEMS;

	function setStatus(key, message, kind = "") {
	  setStatuses((current) => ({ ...current, [key]: message, [`${key}Kind`]: kind }));
	}

	function normalizeLinkedinUrl(value) {
	  const input = String(value || "");
	  // Some sources store "LinkedIn: <url> Email: ..." or multi-line blobs.
	  // Extract the first linkedin.com URL-like token and ignore the rest.
	  const match = input.match(
	    /(https?:\/\/[^\s<>"']*linkedin\.com\/[^\s<>"']+|www\.[^\s<>"']*linkedin\.com\/[^\s<>"']+|linkedin\.com\/[^\s<>"']+)/i
	  );
	  const raw = String(match ? match[0] : input || "").trim().replace(/[).,;]+$/g, "");
	  if (!raw) return "";
	  if (/^https?:\/\//i.test(raw)) return raw;
	  if (raw.startsWith("//")) return `https:${raw}`;
	  if (/^www\./i.test(raw)) return `https://${raw}`;
	  if (/^linkedin\.com/i.test(raw)) return `https://${raw}`;
	  return raw;
	}

	function openLinkedinInSideWindow(url) {
	  const normalized = normalizeLinkedinUrl(url);
	  if (!normalized) {
	    setStatus("workspace", "LinkedIn link not available for this candidate.", "error");
	    return;
	  }
	  if (!/linkedin\.com/i.test(normalized)) {
	    setStatus("workspace", "LinkedIn link is missing or invalid.", "error");
	    return;
	  }
	  try {
	    const width = 440;
	    const height = Math.min(820, Math.max(560, (window.outerHeight || 900) - 140));
	    const left = Math.max(0, (window.screenX || 0) + (window.outerWidth || 1200) - width - 20);
	    const top = Math.max(0, (window.screenY || 0) + 40);
	    // Open directly to the destination URL (some browsers keep about:blank when navigation is set later).
	    const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
	    const win = window.open(normalized, "linkedin_side_window", features);
	    if (!win) return;
	    linkedinSideWindowRef.current = win;
	    win.focus?.();
	  } catch {
	    // Ignore popup errors / blockers.
	  }
	}

	function openRecruiterNotes(candidateOrId) {
	  const candidateId = String(candidateOrId?.id || candidateOrId || "").trim();
	  if (!candidateId) return;
	  setNotesCandidateId(candidateId);
	}

  useEffect(() => {
    if (!hostedJobId) {
      setHostedRecruiterApplyLinks([]);
      return;
    }
    // Intake settings is admin-only, but keep guard for safety.
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    if (!isAdmin) {
      setHostedRecruiterApplyLinks([]);
      return;
    }
    setStatus("intake", "");
    api(`/company/jobs/${encodeURIComponent(hostedJobId)}/apply-link-signatures`, token)
      .then((result) => {
        const items = Array.isArray(result?.items) ? result.items : [];
        setHostedRecruiterApplyLinks(items);
      })
      .catch((error) => {
        setHostedRecruiterApplyLinks([]);
        setStatus("intake", String(error?.message || error), "error");
      });
  }, [hostedJobId, token, state.user?.role]);

  async function loadDashboardSummary(filters = dashboardFilters) {
    const key = JSON.stringify({
      dateFrom: String(filters?.dateFrom || ""),
      dateTo: String(filters?.dateTo || ""),
      clientLabel: String(filters?.clientLabel || ""),
      recruiterLabel: String(filters?.recruiterLabel || "")
    });
    latestDashboardKeyRef.current = key;
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.clientLabel) params.set("clientLabel", filters.clientLabel);
    if (filters.recruiterLabel) params.set("recruiterLabel", filters.recruiterLabel);
    const dashboardResult = await api(`/company/dashboard${params.toString() ? `?${params.toString()}` : ""}`, token);
    if (latestDashboardKeyRef.current !== key) return;
    setState((current) => ({ ...current, dashboard: dashboardResult || {} }));
  }

  async function loadClientPortalSummary(filters = clientPortalFilters) {
    const key = JSON.stringify({
      dateFrom: String(filters?.dateFrom || ""),
      dateTo: String(filters?.dateTo || ""),
      clientLabel: String(filters?.clientLabel || "")
    });
    latestClientPortalKeyRef.current = key;
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.clientLabel) params.set("clientLabel", filters.clientLabel);
    const clientPortalResult = await api(`/company/client-portal${params.toString() ? `?${params.toString()}` : ""}`, token);
    if (latestClientPortalKeyRef.current !== key) return;
    setState((current) => ({ ...current, clientPortal: clientPortalResult || {} }));
  }

  async function loadWorkspace() {
    // Backfills mutate production candidate rows; keep them admin-only and manual.
    const dashboardKey = JSON.stringify({
      dateFrom: String(dashboardFilters?.dateFrom || ""),
      dateTo: String(dashboardFilters?.dateTo || ""),
      clientLabel: String(dashboardFilters?.clientLabel || ""),
      recruiterLabel: String(dashboardFilters?.recruiterLabel || "")
    });
    latestDashboardKeyRef.current = dashboardKey;
    const dashboardParams = new URLSearchParams();
    if (dashboardFilters.dateFrom) dashboardParams.set("dateFrom", dashboardFilters.dateFrom);
    if (dashboardFilters.dateTo) dashboardParams.set("dateTo", dashboardFilters.dateTo);
    if (dashboardFilters.clientLabel) dashboardParams.set("clientLabel", dashboardFilters.clientLabel);
    if (dashboardFilters.recruiterLabel) dashboardParams.set("recruiterLabel", dashboardFilters.recruiterLabel);

    const clientPortalKey = JSON.stringify({
      dateFrom: String(clientPortalFilters?.dateFrom || ""),
      dateTo: String(clientPortalFilters?.dateTo || ""),
      clientLabel: String(clientPortalFilters?.clientLabel || "")
    });
    latestClientPortalKeyRef.current = clientPortalKey;
    const clientPortalParams = new URLSearchParams();
    if (clientPortalFilters.dateFrom) clientPortalParams.set("dateFrom", clientPortalFilters.dateFrom);
    if (clientPortalFilters.dateTo) clientPortalParams.set("dateTo", clientPortalFilters.dateTo);
    if (clientPortalFilters.clientLabel) clientPortalParams.set("clientLabel", clientPortalFilters.clientLabel);

    const [userResult, dashboardResult, clientPortalResult, applicantsResult, intakeResult, jobsResult, usersResult, clientUsersResult, candidatesResult, databaseCandidatesResult, assessmentsResult, sharedPresetResult, smtpSettingsResult] = await Promise.all([
      api("/auth/me", token),
      api(`/company/dashboard${dashboardParams.toString() ? `?${dashboardParams.toString()}` : ""}`, token),
      api(`/company/client-portal${clientPortalParams.toString() ? `?${clientPortalParams.toString()}` : ""}`, token)
        .catch(() => ({ summary: { byClient: [], byClientPosition: [] }, availableClients: [] })),
      api("/company/applicants", token).catch(() => ({ items: [] })),
      api("/company/applicant-intake-secret", token).catch(() => null),
      api("/company/jds", token).catch(() => ({ jobs: [] })),
      api("/company/users", token).catch(() => ({ users: [] })),
      api("/company/client-users", token).catch(() => ({ clientUsers: [] })),
      api("/candidates?limit=5000", token).catch(() => []),
      api("/candidates?scope=company&limit=5000", token).catch(() => []),
      api("/company/assessments", token).catch(() => ({ assessments: [] })),
      api("/company/shared-export-presets", token).catch(() => null),
      api("/company/email-settings", token).catch(() => null)
    ]);
    setState((current) => ({
      ...current,
      user: userResult.user || userResult,
      dashboard: latestDashboardKeyRef.current === dashboardKey ? (dashboardResult || {}) : current.dashboard,
      clientPortal: latestClientPortalKeyRef.current === clientPortalKey ? (clientPortalResult || {}) : current.clientPortal,
      applicants: applicantsResult.items || [],
      intake: intakeResult || {},
      jobs: jobsResult.jobs || [],
      users: usersResult.users || [],
      candidates: Array.isArray(candidatesResult) ? candidatesResult : [],
      databaseCandidates: Array.isArray(databaseCandidatesResult) ? databaseCandidatesResult : Array.isArray(candidatesResult) ? candidatesResult : [],
      assessments: assessmentsResult.assessments || []
    }));
    setClientUsers(clientUsersResult.clientUsers || []);
    if (sharedPresetResult) {
      setCopySettings((current) => migrateCopySettings({ ...current, ...sharedPresetResult }));
    }
    if (smtpSettingsResult) {
      const isEditingMailSettings = location?.pathname === "/mail-settings";
      if (!isEditingMailSettings || !smtpSettingsDirtyRef.current) {
        setSmtpSettings((current) => ({
          ...current,
          host: String(smtpSettingsResult?.host || "").trim(),
          port: Number(smtpSettingsResult?.port || 587),
          secure: Boolean(smtpSettingsResult?.secure),
          user: String(smtpSettingsResult?.user || "").trim(),
          from: String(smtpSettingsResult?.from || "").trim(),
          hasPassword: Boolean(smtpSettingsResult?.hasPassword),
          signatureText: String(smtpSettingsResult?.signatureText || "").trim(),
          signatureLinkLabel: String(smtpSettingsResult?.signatureLinkLabel || "").trim(),
          signatureLinkUrl: String(smtpSettingsResult?.signatureLinkUrl || "").trim(),
          signatureLinkLabel2: String(smtpSettingsResult?.signatureLinkLabel2 || "").trim(),
          signatureLinkUrl2: String(smtpSettingsResult?.signatureLinkUrl2 || "").trim(),
          pass: ""
        }));
        setSmtpSettingsKeepPass(Boolean(smtpSettingsResult?.hasPassword));
        setSmtpSettingsLoaded(true);
      }
    }
    setStatus("workspace", "Portal loaded.", "ok");
  }

  loadWorkspaceRef.current = loadWorkspace;

  async function refreshWorkspaceSilently(reason = "manual") {
    if (!token || workspaceRefreshInFlightRef.current) return;
    if (suspendWorkspaceRefreshRef.current) return;
    const now = Date.now();
    const throttleMs = reason === "poll" ? 20000 : 4000;
    if (now - lastWorkspaceRefreshAtRef.current < throttleMs) return;
    workspaceRefreshInFlightRef.current = true;
    lastWorkspaceRefreshAtRef.current = now;
    try {
      const latestLoader = loadWorkspaceRef.current;
      if (typeof latestLoader === "function") {
        await latestLoader();
      }
    } catch (error) {
      setStatus("workspace", String(error?.message || error), "error");
    } finally {
      workspaceRefreshInFlightRef.current = false;
    }
  }

  async function refreshWorkspaceNow() {
    if (!token || workspaceRefreshInFlightRef.current) return;
    if (suspendWorkspaceRefreshRef.current) return;
    workspaceRefreshInFlightRef.current = true;
    lastWorkspaceRefreshAtRef.current = Date.now();
    setStatus("workspace", "Refreshing workspace...", "ok");
    try {
      const latestLoader = loadWorkspaceRef.current;
      if (typeof latestLoader === "function") {
        await latestLoader();
      }
      setStatus("workspace", "Workspace refreshed.", "ok");
    } catch (error) {
      setStatus("workspace", String(error?.message || error), "error");
    } finally {
      workspaceRefreshInFlightRef.current = false;
    }
  }

  useEffect(() => {
    void loadWorkspace().catch((error) => setStatus("workspace", String(error?.message || error), "error"));
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const handleWindowFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshWorkspaceSilently("focus");
    };
    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void refreshWorkspaceSilently("visible");
      }
    };
    const poller = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void refreshWorkspaceSilently("poll");
    }, 20000);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(poller);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
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
    if (!exportPresetOptions.length) return;
    const selectedPresetExists = exportPresetOptions.some((preset) => String(preset.id) === String(clientShareDraft.presetId));
    if (!selectedPresetExists) {
      setClientShareDraft((current) => ({ ...current, presetId: exportPresetOptions[0].id }));
    }
  }, [exportPresetOptions, clientShareDraft.presetId]);

  useEffect(() => {
    if (!exportPresetOptions.length) return;
    const selectedPresetExists = exportPresetOptions.some((preset) => String(preset.id) === String(activeCopyPresetId));
    if (!selectedPresetExists) {
      setActiveCopyPresetId(copySettings.excelPreset || exportPresetOptions[0].id);
    }
  }, [activeCopyPresetId, copySettings.excelPreset, exportPresetOptions]);

  useEffect(() => {
    setQuickUpdateParsedSummary(null);
    setQuickUpdateConflicts([]);
    setQuickUpdateMergedPatch(null);
  }, [quickUpdateCandidateId, quickUpdateText, quickUpdateStatusText, quickUpdateAttemptOutcome, quickUpdateAssessmentStatus, quickUpdateStatusAt, quickUpdateOfferAmount]);

  useEffect(() => {
    const clients = state.clientPortal?.availableClients || [];
    if (!clients.length || clientPortalFilters.clientLabel) return;
    setClientPortalFilters((current) => ({
      ...current,
      clientLabel: current.clientLabel || clients[0] || "",
      positionLabel: ""
    }));
  }, [state.clientPortal?.availableClients, clientPortalFilters.clientLabel]);

  useEffect(() => {
    if (!clientPortalFilters.positionLabel) return;
    const stillValid = (state.clientPortal?.summary?.byClientPosition || []).some((row) =>
      String(row.clientLabel || "") === String(clientPortalFilters.clientLabel || "") &&
      String(row.positionLabel || "") === String(clientPortalFilters.positionLabel || "")
    );
    if (!stillValid) {
      setClientPortalFilters((current) => ({ ...current, positionLabel: "" }));
    }
  }, [clientPortalFilters.clientLabel, clientPortalFilters.positionLabel, state.clientPortal?.summary?.byClientPosition]);

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
    const AMBIGUOUS = { __ambiguous: true };
    const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
    const normalizePhone = (value) => {
      const digits = String(value || "").replace(/[^\d]/g, "");
      return digits.length > 10 ? digits.slice(-10) : digits;
    };

    for (const item of state.assessments || []) {
      const id = String(item?.id || "").trim();
      if (id) map.set(`id:${id}`, item);

      const candidateId = String(item?.candidateId || item?.candidate_id || item?.payload?.candidateId || item?.payload?.candidate_id || "").trim();
      if (candidateId && !map.has(`cid:${candidateId}`)) map.set(`cid:${candidateId}`, item);

      const email = normalizeEmail(item?.emailId || item?.email || "");
      if (email) {
        const key = `email:${email}`;
        // If multiple assessments share the same email, do not guess. Canonical candidate_id should exist.
        if (!map.has(key)) map.set(key, item);
        else map.set(key, AMBIGUOUS);
      }

      const phone = normalizePhone(item?.phoneNumber || item?.phone || "");
      if (phone) {
        const key = `phone:${phone}`;
        if (!map.has(key)) map.set(key, item);
        else map.set(key, AMBIGUOUS);
      }
    }
    return map;
  }, [state.assessments]);

  function resolveCapturedAssessment(candidateRow) {
    const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
    const normalizePhone = (value) => {
      const digits = String(value || "").replace(/[^\d]/g, "");
      return digits.length > 10 ? digits.slice(-10) : digits;
    };

    const assessmentId = String(candidateRow?.assessment_id || candidateRow?.assessmentId || "").trim();
    if (assessmentId) {
      const assessment = capturedAssessmentMap.get(`id:${assessmentId}`) || null;
      if (!assessment) return null;
      // Only trust stored assessment_id when we can verify stable identity matches.
      const candidateId = String(candidateRow?.id || "").trim();
      const assessmentCandidateId = String(
        assessment?.candidateId ||
        assessment?.candidate_id ||
        assessment?.payload?.candidateId ||
        assessment?.payload?.candidate_id ||
        ""
      ).trim();
      if (candidateId && assessmentCandidateId && candidateId === assessmentCandidateId) return assessment;

      const candidateEmail = normalizeEmail(candidateRow?.email || candidateRow?.emailId || "");
      const candidatePhone = normalizePhone(candidateRow?.phone || candidateRow?.phoneNumber || "");
      const assessmentEmail = normalizeEmail(assessment?.emailId || assessment?.email || "");
      const assessmentPhone = normalizePhone(assessment?.phoneNumber || assessment?.phone || "");
      if (candidateEmail && assessmentEmail && candidateEmail === assessmentEmail) return assessment;
      if (candidatePhone && assessmentPhone && candidatePhone === assessmentPhone) return assessment;
      // Mismatch: ignore this stored link (it may be from an incorrect backfill).
    }

    const candidateIdKey = String(candidateRow?.id || "").trim();
    if (candidateIdKey) {
      const byCandidateId = capturedAssessmentMap.get(`cid:${candidateIdKey}`) || null;
      if (byCandidateId) return byCandidateId;
    }

    const email = normalizeEmail(candidateRow?.email || candidateRow?.emailId || "");
    if (email) {
      const byEmail = capturedAssessmentMap.get(`email:${email}`) || null;
      if (byEmail && byEmail.__ambiguous) return null;
      return byEmail;
    }

    const phone = normalizePhone(candidateRow?.phone || candidateRow?.phoneNumber || "");
    if (phone) {
      const byPhone = capturedAssessmentMap.get(`phone:${phone}`) || null;
      if (byPhone && byPhone.__ambiguous) return null;
      return byPhone;
    }

    return null;
  }
  const capturedSources = useMemo(() => Array.from(new Set((state.candidates || []).map((item) => String(item.source || "").trim()).filter(Boolean))), [state.candidates]);
  const assessmentOptions = useMemo(() => {
    const clients = new Set();
    const jds = new Set();
    const recruiters = new Set();
    const outcomes = new Set();
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
      // Always display the assigned recruiter (not assessment creator/last editor).
      const recruiterValue = String(matchedCandidate?.assigned_to_name || item?.recruiterName || matchedCandidate?.recruiter_name || "").trim();
      const outcomeValue = normalizeAssessmentStatusLabel(item?.candidateStatus || item?.candidate_status || "") || "No outcome";
      if (clientValue) clients.add(clientValue);
      if (jdValue) jds.add(jdValue);
      if (recruiterValue) recruiters.add(recruiterValue);
      if (outcomeValue) outcomes.add(outcomeValue);
    });
    allowedRecruiterNames.forEach((name) => recruiters.add(name));
    return {
      clients: Array.from(clients).sort((a, b) => a.localeCompare(b)),
      jds: Array.from(jds).sort((a, b) => a.localeCompare(b)),
      recruiters: Array.from(recruiters).sort((a, b) => a.localeCompare(b)),
      outcomes: DEFAULT_STATUS_OPTIONS
    };
  }, [state.assessments, state.candidates, state.user, state.users]);

  const filteredAssessments = useMemo(() => {
    const query = String(assessmentFilters.q || "").trim().toLowerCase();
    return (state.assessments || []).filter((item) => {
      const archived = isAssessmentArchived(item);
      if (assessmentLane === "active" && archived) return false;
      if (assessmentLane === "archived" && !archived) return false;
      const matchedCandidate = (state.candidates || []).find((candidate) =>
        (item?.candidateId && String(candidate.id) === String(item.candidateId)) ||
        String(candidate.name || "").trim().toLowerCase() === String(item?.candidateName || "").trim().toLowerCase()
      );
      const clientValue = String(item?.clientName || matchedCandidate?.client_name || "").trim();
      const jdValue = String(item?.jdTitle || matchedCandidate?.jd_title || "").trim();
      // Always filter by assigned recruiter (not assessment creator/last editor).
      const recruiterValue = String(matchedCandidate?.assigned_to_name || item?.recruiterName || matchedCandidate?.recruiter_name || "").trim();
      const outcomeValue = normalizeAssessmentStatusLabel(item?.candidateStatus || item?.candidate_status || "") || "No outcome";
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
      if (assessmentFilters.outcomes.length && !assessmentFilters.outcomes.includes(outcomeValue)) return false;
      return true;
    });
  }, [state.assessments, state.candidates, assessmentFilters, assessmentLane]);

  function inferInterviewRoundFromStatus(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    if (raw.includes("screening call")) return "Screening";
    if (/\bl1\b/.test(raw)) return "L1";
    if (/\bl2\b/.test(raw)) return "L2";
    if (/\bl3\b/.test(raw)) return "L3";
    if (raw.includes("hr")) return "HR";
    return "";
  }

  function getAssessmentOwnerLabel(assessment, linkedCandidate) {
    const assignedTo = String(linkedCandidate?.assigned_to_name || linkedCandidate?.assignedToName || "").trim();
    const ownerName = String(linkedCandidate?.recruiter_name || linkedCandidate?.recruiterName || assessment?.recruiterName || linkedCandidate?.recruiter_name || "").trim();
    return assignedTo || ownerName || "";
  }

  function getAssessmentOfferedAt(assessment) {
    const statusHistory = Array.isArray(assessment?.statusHistory) ? assessment.statusHistory : [];
    const offered = statusHistory
      .slice()
      .reverse()
      .find((entry) => normalizeAssessmentStatusLabel(entry?.status || "").toLowerCase() === "offered");
    const stamp = String(offered?.at || "").trim() || String(assessment?.updatedAt || "").trim();
    return stamp;
  }

  function buildAssessmentInterviewDoneRows({ assessments, linkedCandidateMap, dateFrom, dateTo }) {
    const rows = [];
    const stageIndexFromStatus = (value) => {
      const lower = normalizeAssessmentStatusLabel(value || "").toLowerCase();
      if (lower === "screening call aligned") return 0;
      if (lower === "l1 aligned") return 1;
      if (lower === "l2 aligned") return 2;
      if (lower === "l3 aligned") return 3;
      if (lower === "hr interview aligned") return 4;
      return -1;
    };
    const stageRoundFromIndex = (idx) => {
      if (idx === 1) return "L1";
      if (idx === 2) return "L2";
      if (idx === 3) return "L3";
      if (idx === 4) return "HR";
      return "";
    };
    const inferDoneRoundFromTransition = (prevStatus, nextStatus) => {
      const nextLower = normalizeAssessmentStatusLabel(nextStatus || "").toLowerCase();
      const prevLower = normalizeAssessmentStatusLabel(prevStatus || "").toLowerCase();
      const nextIdx = stageIndexFromStatus(nextLower);
      // L2/L3/HR aligned means previous round got done.
      if (nextIdx === 2) return "L1";
      if (nextIdx === 3) return "L2";
      if (nextIdx === 4) return "L3";
      // Feedback awaited / interview reject means previous aligned round got done.
      if (nextLower === "feedback awaited" || nextLower === "interview reject") {
        const prevIdx = stageIndexFromStatus(prevLower);
        return stageRoundFromIndex(prevIdx);
      }
      return "";
    };

    (assessments || []).forEach((assessment) => {
      const linkedCandidate = linkedCandidateMap.get(String(assessment?.id || "")) || null;
      const history = Array.isArray(assessment?.statusHistory) ? assessment.statusHistory : [];
      history.forEach((entry, index) => {
        const status = normalizeAssessmentStatusLabel(entry?.status || "");
        const notes = String(entry?.notes || "").trim();
        const atValue = String(entry?.at || entry?.updatedAt || assessment?.interviewAt || "").trim();
        const eventDate = atValue ? atValue.slice(0, 10) : "";
        const prevStatus = index > 0 ? normalizeAssessmentStatusLabel(history[index - 1]?.status || "") : "";
        const inferredRound = inferDoneRoundFromTransition(prevStatus, status);
        if (!inferredRound || !atValue) return;
        if (dateFrom && eventDate && eventDate < dateFrom) return;
        if (dateTo && eventDate && eventDate > dateTo) return;

        const recruiter = getAssessmentOwnerLabel(assessment, linkedCandidate);
        const clientName = String(assessment?.clientName || linkedCandidate?.client_name || "").trim();
        const jdTitle = String(assessment?.jdTitle || linkedCandidate?.jd_title || "").trim();
        rows.push([
          atValue ? new Date(atValue).toLocaleString() : "",
          inferredRound,
          String(assessment?.candidateName || "").trim(),
          jdTitle,
          clientName,
          recruiter,
          status || "Interview done",
          notes
        ]);
      });
    });
    return rows.sort((a, b) => String(b?.[0] || "").localeCompare(String(a?.[0] || "")));
  }

  function downloadAssessmentEventXlsx(kind) {
    const dateFrom = String(assessmentFilters.dateFrom || "").trim();
    const dateTo = String(assessmentFilters.dateTo || "").trim();
    const labelRange = [dateFrom || "any", dateTo || "any"].join("_to_");
    const today = new Date().toISOString().slice(0, 10);
    const filename = `assessments-${kind}-${labelRange}-${today}.xls`;

    const downloadFromEvents = async () => {
      setStatus("assessments", "Preparing download...", "ok");
      try {
        const params = new URLSearchParams();
        params.set("kind", kind);
        if (dateFrom) params.set("dateFrom", dateFrom);
        if (dateTo) params.set("dateTo", dateTo);
        const response = await api(`/company/assessment-events?${params.toString()}`, token);
        const rowsRaw = Array.isArray(response?.result?.rows) ? response.result.rows : [];
        if (!rowsRaw.length) {
          // No factual events yet for this range/kind (or pre-events historical rows).
          // Let existing fallback exporters build rows from current assessment data.
          return false;
        }

        const rows = rowsRaw.map((row) => {
          const atValue = String(row?.event_at || row?.created_at || "").trim();
          const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
          const round = String(payload?.round || "").trim();
          const candidateName = String(payload?.candidateName || "").trim();
          return [
            atValue ? new Date(atValue).toLocaleString() : "",
            round,
            candidateName,
            String(row?.jd_title || "").trim(),
            String(row?.client_name || "").trim(),
            String(row?.recruiter_name || "").trim(),
            String(row?.status || "").trim(),
            String(payload?.notes || payload?.remarks || "").trim()
          ];
        });

        const title = kind === "interviews_done"
          ? "Interviews Done"
          : kind === "interviews_aligned"
            ? "Interviews Aligned"
            : kind === "offered"
              ? "Offered"
              : "Events";

        const headers = ["At", "Round", "Candidate", "Role", "Client", "Recruiter", "Status", "Remarks"];
        const html = buildExcelHtmlFromTable({
          title,
          subtitle: `Range: ${dateFrom || "Any"} to ${dateTo || "Any"}`,
          headers,
          rows
        });
        downloadTextFile(filename, html, "application/vnd.ms-excel;charset=utf-8");
        setStatus("assessments", "Download ready.", "ok");
        return true;
      } catch (error) {
        setStatus("assessments", `Download failed: ${String(error?.message || error)}`, "error");
        return false;
      }
    };

    if (kind === "interviews_done") {
      // Prefer factual backend events; fallback to legacy statusHistory-only logic.
      void downloadFromEvents().then((ok) => {
        if (ok) return;
        const rows = buildAssessmentInterviewDoneRows({
          assessments: filteredAssessments,
          linkedCandidateMap: assessmentLinkedCandidateMap,
          dateFrom,
          dateTo
        });
        const html = buildExcelHtmlFromTable({
          title: "Interviews Done",
          subtitle: `Range: ${dateFrom || "Any"} to ${dateTo || "Any"}`,
          headers: ["Done at", "Round", "Candidate", "Role", "Client", "Recruiter", "Current status", "Remarks"],
          rows
        });
        downloadTextFile(filename, html, "application/vnd.ms-excel;charset=utf-8");
      });
      return;
    }

    if (kind === "interviews_aligned") {
      // Prefer backend events to avoid missing data when interviewAt/statusHistory is inconsistent.
      void downloadFromEvents().then((ok) => {
        if (ok) return;
        const rows = filteredAssessments
          .map((assessment) => {
            const linkedCandidate = assessmentLinkedCandidateMap.get(String(assessment?.id || "")) || null;
            const interviewAt = String(assessment?.interviewAt || "").trim();
            const interviewDate = interviewAt ? interviewAt.slice(0, 10) : "";
            if (!interviewAt) return null;
            if (dateFrom && interviewDate && interviewDate < dateFrom) return null;
            if (dateTo && interviewDate && interviewDate > dateTo) return null;

            const latest = getLatestAssessmentStatusPreview(assessment);
            const status = normalizeAssessmentStatusLabel(latest.status) || latest.status || "";
            const round = inferInterviewRoundFromStatus(status) || inferInterviewRoundFromStatus(assessment?.candidateStatus || "");
            const recruiter = getAssessmentOwnerLabel(assessment, linkedCandidate);
            const clientName = String(assessment?.clientName || linkedCandidate?.client_name || "").trim();
            const jdTitle = String(assessment?.jdTitle || linkedCandidate?.jd_title || "").trim();
            return [
              interviewAt ? new Date(interviewAt).toLocaleString() : "",
              round,
              String(assessment?.candidateName || "").trim(),
              jdTitle,
              clientName,
              recruiter,
              status,
              String(latest.remarks || "").trim()
            ];
          })
          .filter(Boolean);

        const html = buildExcelHtmlFromTable({
          title: "Interview List",
          subtitle: `Range: ${dateFrom || "Any"} to ${dateTo || "Any"}`,
          headers: ["Interview date/time", "Round", "Candidate", "Role", "Client", "Recruiter", "Assessment status", "Remarks"],
          rows
        });
        downloadTextFile(filename, html, "application/vnd.ms-excel;charset=utf-8");
      });
      return;
    }

    if (kind === "offered") {
      void downloadFromEvents().then((ok) => {
        if (ok) return;
        const rows = filteredAssessments
          .map((assessment) => {
            const linkedCandidate = assessmentLinkedCandidateMap.get(String(assessment?.id || "")) || null;
            const latest = getLatestAssessmentStatusPreview(assessment);
            const status = normalizeAssessmentStatusLabel(latest.status) || normalizeAssessmentStatusLabel(assessment?.candidateStatus || "") || "";
            if (status.toLowerCase() !== "offered") return null;

            const offeredAt = getAssessmentOfferedAt(assessment);
            const offeredDate = offeredAt ? offeredAt.slice(0, 10) : "";
            if (dateFrom && offeredDate && offeredDate < dateFrom) return null;
            if (dateTo && offeredDate && offeredDate > dateTo) return null;

            const recruiter = getAssessmentOwnerLabel(assessment, linkedCandidate);
            const clientName = String(assessment?.clientName || linkedCandidate?.client_name || "").trim();
            const jdTitle = String(assessment?.jdTitle || linkedCandidate?.jd_title || "").trim();

            return [
              offeredAt ? new Date(offeredAt).toLocaleString() : "",
              String(assessment?.candidateName || "").trim(),
              jdTitle,
              clientName,
              recruiter,
              status,
              String(latest.remarks || "").trim()
            ];
          })
          .filter(Boolean);

        const html = buildExcelHtmlFromTable({
          title: "Offered Candidates",
          subtitle: `Range: ${dateFrom || "Any"} to ${dateTo || "Any"}`,
          headers: ["Offered at", "Candidate", "Role", "Client", "Recruiter", "Assessment status", "Remarks"],
          rows
        });
        downloadTextFile(filename, html, "application/vnd.ms-excel;charset=utf-8");
      });
      return;
    }
  }

  const assessmentLinkedCandidateMap = useMemo(() => {
    const map = new Map();
    filteredAssessments.forEach((item) => {
      const match = (state.candidates || [])
        .filter((candidate) => {
          const exactCandidateId = String(item.candidateId || "").trim();
          if (exactCandidateId && String(candidate.id || "").trim() === exactCandidateId) return true;
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
        })
        .sort((a, b) => {
          const aExact = String(a.id || "").trim() === String(item.candidateId || "").trim() ? 1 : 0;
          const bExact = String(b.id || "").trim() === String(item.candidateId || "").trim() ? 1 : 0;
          if (bExact !== aExact) return bExact - aExact;
          const aAssessment = String(a.assessment_id || "").trim() === String(item.id || "").trim() ? 1 : 0;
          const bAssessment = String(b.assessment_id || "").trim() === String(item.id || "").trim() ? 1 : 0;
          if (bAssessment !== aAssessment) return bAssessment - aAssessment;
          const aCv = candidateHasStoredCv(a) ? 1 : 0;
          const bCv = candidateHasStoredCv(b) ? 1 : 0;
          if (bCv !== aCv) return bCv - aCv;
          return 0;
        })[0] || null;
      map.set(String(item.id || ""), match);
    });
    return map;
  }, [filteredAssessments, state.candidates]);

  const normalizedAssessmentCopyRows = useMemo(() => {
    return filteredAssessments.map((item, index) => {
      const linkedCandidate = assessmentLinkedCandidateMap.get(String(item.id || "")) || null;
      const linkedCandidateDraft = getCandidateDraftState(linkedCandidate || {});
      const linkedCandidateAnswers = linkedCandidateDraft?.jdScreeningAnswers && typeof linkedCandidateDraft.jdScreeningAnswers === "object"
        ? linkedCandidateDraft.jdScreeningAnswers
        : {};
      const combinedQuestionMap = new Map();
      getAssessmentQuestionAnswers(item).forEach((pair) => {
        const questionKey = String(pair.question || "").trim().toLowerCase();
        const answerValue = String(pair.answer || "").trim();
        if (!questionKey || !answerValue) return;
        if (!combinedQuestionMap.has(questionKey)) combinedQuestionMap.set(questionKey, { question: String(pair.question || "").trim(), answer: answerValue });
      });
      Object.entries(linkedCandidateAnswers || {}).forEach(([question, answer]) => {
        const questionKey = String(question || "").trim().toLowerCase();
        const answerValue = String(answer || "").trim();
        if (!questionKey || !answerValue) return;
        if (!combinedQuestionMap.has(questionKey)) combinedQuestionMap.set(questionKey, { question: String(question || "").trim(), answer: answerValue });
      });
      const screeningSummary = Array.from(combinedQuestionMap.values())
        .map((pair) => `${pair.question}: ${pair.answer}`)
        .join("\n");
      const linkedMeta = decodePortalApplicantMetadata(linkedCandidate || {});
      const assessmentStoredFileRaw = item?.cvAnalysis?.storedFile || item?.cv_analysis?.storedFile || null;
      const assessmentStoredFile = assessmentStoredFileRaw && typeof assessmentStoredFileRaw === "object"
        ? assessmentStoredFileRaw
        : null;
      return {
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
      created_at: item.createdAt || item.generatedAt || "",
      skills: Array.isArray(linkedCandidate?.skills) ? linkedCandidate.skills : [],
      assigned_to_name: String(linkedCandidate?.assigned_to_name || item.recruiterName || linkedCandidate?.recruiter_name || "").trim(),
      recruiter_name: String(linkedCandidate?.assigned_to_name || item.recruiterName || linkedCandidate?.recruiter_name || "").trim(),
      notice_period: item.noticePeriod || "",
      lwd_or_doj: item.lwdOrDoj || item.offerDoj || linkedCandidate?.lwd_or_doj || linkedCandidateDraft?.lwdOrDoj || "",
      offer_in_hand: item.offerInHand || item.offerAmount || linkedCandidate?.offer_in_hand || linkedCandidateDraft?.offerInHand || "",
      cv_highlights: Array.isArray(item?.cvAnalysis?.highlights)
        ? item.cvAnalysis.highlights
        : Array.isArray(item?.cv_analysis?.highlights)
          ? item.cv_analysis.highlights
          : Array.isArray(linkedMeta?.cvAnalysisCache?.result?.highlights)
            ? linkedMeta.cvAnalysisCache.result.highlights
            : [],
      recruiter_context_notes: item.recruiterNotes || "",
      other_pointers: item.otherPointers || "",
      notes: item.recruiterNotes || item.callbackNotes || "",
      other_standard_questions: screeningSummary,
      reason_of_change: item.reasonForChange
        || linkedCandidateDraft?.reasonForChange
        || linkedCandidate?.reason_of_change
        || linkedCandidate?.reasonForChange
        || "",
      combined_assessment_insights: buildCombinedAssessmentInsightsForExportV2({
        recruiter_context_notes: item.recruiterNotes || "",
        other_pointers: item.otherPointers || "",
        other_standard_questions: screeningSummary,
        reason_of_change: item.reasonForChange || ""
      }),
      linkedin: item.linkedinUrl || linkedCandidate?.linkedin || linkedCandidateDraft?.linkedin || "",
      jd_title: item.jdTitle || "",
      client_name: item.clientName || "",
      outcome: item.candidateStatus || "",
      assessment_status: item.candidateStatus || "",
      follow_up_at: formatDateForCopy(item.followUpAt || item.interviewAt || ""),
      candidate_id: linkedCandidate?.id || item.candidateId || "",
      cv_provider: linkedMeta.fileProvider
        || linkedMeta?.cvAnalysisCache?.storedFile?.provider
        || assessmentStoredFile?.provider
        || "",
      cv_key: linkedMeta.fileKey
        || linkedMeta?.cvAnalysisCache?.storedFile?.key
        || assessmentStoredFile?.key
        || "",
      cv_url: linkedMeta.fileUrl
        || linkedMeta?.cvAnalysisCache?.storedFile?.url
        || assessmentStoredFile?.url
        || linkedCandidate?.cv_url
        || "",
      cv_filename: linkedMeta.filename
        || linkedMeta?.cvAnalysisCache?.storedFile?.filename
        || assessmentStoredFile?.filename
        || linkedCandidate?.cv_filename
        || ""
      };
    });
  }, [assessmentLinkedCandidateMap, filteredAssessments]);
  const selectedAssessmentRows = useMemo(() => (
    normalizedAssessmentCopyRows
      .filter((item) => selectedAssessmentIds.includes(String(item.id || item.assessmentId || "")))
      .map((item, index) => ({ ...item, index: index + 1 }))
  ), [normalizedAssessmentCopyRows, selectedAssessmentIds]);
	  useEffect(() => {
	    async function loadCvLinks() {
	      if (!token || !selectedAssessmentRows.length) return;
	      const rowsNeedingLinks = selectedAssessmentRows.filter((item) => {
	        const shareKey = String(item.candidate_id || item.id || "");
	        if (!shareKey) return false;
	        const hasCvRef = Boolean(item.cv_key || item.cv_url || item.cv_provider || item.cv_filename);
	        if (!hasCvRef) return false;
	        const fingerprint = [item.cv_provider || "", item.cv_key || "", item.cv_url || "", item.cv_filename || ""].join("|");
	        return clientShareCvLinkFingerprint[shareKey] !== fingerprint;
	      });
	      if (!rowsNeedingLinks.length) return;
	      setClientShareCvLinkState((current) => {
	        const next = { ...current };
	        rowsNeedingLinks.forEach((item) => {
	          const shareKey = String(item.candidate_id || item.id || "");
	          if (shareKey) next[shareKey] = "loading";
	        });
	        return next;
	      });
	      const entries = await Promise.all(rowsNeedingLinks.map(async (item) => {
	        const shareKey = String(item.candidate_id || item.id || "");
	        try {
          const params = new URLSearchParams();
          if (item.candidate_id) params.set("candidate_id", String(item.candidate_id));
          if (item.phone) params.set("candidate_phone", String(item.phone));
          if (item.email) params.set("candidate_email", String(item.email));
          if (item.jd_title) params.set("jd_title", String(item.jd_title));
          if (item.cv_provider) params.set("cv_provider", String(item.cv_provider));
          if (item.cv_key) params.set("cv_key", String(item.cv_key));
          if (item.cv_url) params.set("cv_url", String(item.cv_url));
          if (item.cv_filename) params.set("cv_filename", String(item.cv_filename));
          if (item.name) params.set("candidate_name", String(item.name));
	          const result = await api(`/company/share-cv-link${params.toString() ? `?${params.toString()}` : ""}`, token);
	          return [shareKey, result.url, "ready", [item.cv_provider || "", item.cv_key || "", item.cv_url || "", item.cv_filename || ""].join("|")];
	        } catch {
	          return [shareKey, "", "missing", [item.cv_provider || "", item.cv_key || "", item.cv_url || "", item.cv_filename || ""].join("|")];
	        }
	      }));
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
	      setClientShareCvLinkFingerprint((current) => {
	        const next = { ...current };
	        entries.forEach(([candidateId, _url, _state, fingerprint]) => {
	          if (candidateId) next[candidateId] = fingerprint || "";
	        });
	        return next;
	      });
	    }
	    void loadCvLinks();
	  }, [selectedAssessmentRows, token, clientShareCvLinkFingerprint]);
  const candidateUniverseAll = useMemo(() => {
    const databaseRows = Array.isArray(state.databaseCandidates) && state.databaseCandidates.length ? state.databaseCandidates : (state.candidates || []);
    const linkedAssessmentIds = new Set(databaseRows.map((item) => String(item.assessment_id || "").trim()).filter(Boolean));
    const candidateNames = new Set(databaseRows.map((item) => String(item.name || "").trim().toLowerCase()).filter(Boolean));
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
    return [...databaseRows, ...assessmentOnlyItems];
  }, [state.assessments, state.candidates, state.databaseCandidates]);
  const candidateSearchOptions = useMemo(() => {
    const recruiters = new Set();
    const genders = new Set();
    const clients = new Set();
    candidateUniverseAll.forEach((item) => {
      const recruiter = String(item.assigned_to_name || item.ownerRecruiter || item.recruiterName || "").trim();
      const draftPayload = parsePortalObjectField(item?.draft_payload || item?.draftPayload);
      const gender = String(item.gender || draftPayload?.gender || "").trim();
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
    if (candidateSearchMode === "all" || !String(candidateSearchQueryUsed || "").trim()) return candidateUniverseAll;
    return candidateSearchResults || [];
  }, [candidateSearchMode, candidateSearchResults, candidateSearchQueryUsed, candidateUniverseAll]);
  const candidateUniverse = useMemo(() => {
    const assessmentById = new Map((state.assessments || []).map((item) => [String(item?.id || "").trim(), item]));
    return candidateBaseUniverse.filter((item) => {
      const years = parseExperienceToYears(item.experience || item.totalExperience || "");
      const minYears = Number(candidateStructuredFilters.minExperience || "");
      const maxYears = Number(candidateStructuredFilters.maxExperience || "");
      const noticeDays = parseNoticePeriodToDays(item.notice_period || item.noticePeriod || "");
      const currentCtc = parseAmountToLpa(item.current_ctc || item.currentCtc || "");
      const expectedCtc = parseAmountToLpa(item.expected_ctc || item.expectedCtc || "");
      const minCurrentCtc = Number(candidateStructuredFilters.minCurrentCtc || "");
      const maxCurrentCtc = Number(candidateStructuredFilters.maxCurrentCtc || "");
      const minExpectedCtc = Number(candidateStructuredFilters.minExpectedCtc || "");
      const maxExpectedCtc = Number(candidateStructuredFilters.maxExpectedCtc || "");
      const locationHay = String(item.location || "").toLowerCase();
      const companyHay = String(item.company || item.currentCompany || "").toLowerCase();
      const educationHay = String(item.highest_education || item.highestEducation || "").toLowerCase();
      const skillsHay = [
        item.name || "",
        item.candidateName || "",
        item.phone || "",
        item.email || "",
        item.role || item.currentDesignation || "",
        item.position || item.jdTitle || "",
        item.company || item.currentCompany || "",
        item.location || "",
        Array.isArray(item.skills) ? item.skills.join(" ") : "",
        Array.isArray(item.inferredTags) ? item.inferredTags.join(" ") : "",
        item.notesText || "",
        item.hiddenCvText || "",
        item.other_pointers || "",
        item.recruiter_context_notes || ""
      ].join(" ").toLowerCase();
      const clientValue = String(item.client_name || item.clientName || "").trim();
      const recruiterValue = String(item.assigned_to_name || item.ownerRecruiter || item.recruiterName || "").trim();
      const draftPayload = parsePortalObjectField(item?.draft_payload || item?.draftPayload);
      const genderValue = String(item.gender || draftPayload?.gender || "").trim();
      const normalizedClientValue = clientValue.toLowerCase();
      const normalizedRecruiterValue = recruiterValue.toLowerCase();
      const normalizedGenderValue = genderValue.toLowerCase();
      const linkedAssessment = item?.raw?.assessment
        || item?.assessment
        || assessmentById.get(String(item.assessment_id || item.assessmentId || "").trim())
        || null;
      const assessmentStatusValue = String(
        linkedAssessment?.candidateStatus
          || linkedAssessment?.status
          || item.candidateStatus
          || item.workflowStatus
          || item.assessment_status
          || item.assessmentStatus
          || ""
      ).trim();
      const attemptOutcomeValue = String(item.last_contact_outcome || item.attemptStatus || item.outcome || "").trim();
      if (candidateStructuredFilters.minExperience && (years == null || years < minYears)) return false;
      if (candidateStructuredFilters.maxExperience && (years == null || years > maxYears)) return false;
      if (candidateStructuredFilters.location) {
        const locationTokens = parseLocationFilterTokens(candidateStructuredFilters.location);
        if (locationTokens.length) {
          const matchesAny = locationTokens.some((token) => locationHay.includes(token));
          if (!matchesAny) return false;
        } else if (!locationHay.includes(String(candidateStructuredFilters.location).trim().toLowerCase())) {
          return false;
        }
      }
      if (candidateStructuredFilters.keySkills) {
        const requiredSkills = splitSearchKeywords(candidateStructuredFilters.keySkills);
        if (requiredSkills.length && !requiredSkills.every((term) => skillsHay.includes(term))) return false;
      }
      if (candidateStructuredFilters.currentCompany && !companyHay.includes(String(candidateStructuredFilters.currentCompany).trim().toLowerCase())) return false;
      const selectedClients = parseMultiChipTokens(candidateStructuredFilters.client).map((item) => item.toLowerCase());
      if (selectedClients.length && !selectedClients.includes(normalizedClientValue)) return false;
      if (candidateStructuredFilters.minCurrentCtc && (currentCtc == null || currentCtc < minCurrentCtc)) return false;
      if (candidateStructuredFilters.maxCurrentCtc && (currentCtc == null || currentCtc > maxCurrentCtc)) return false;
      if (candidateStructuredFilters.minExpectedCtc && (expectedCtc == null || expectedCtc < minExpectedCtc)) return false;
      if (candidateStructuredFilters.maxExpectedCtc && (expectedCtc == null || expectedCtc > maxExpectedCtc)) return false;
      if (candidateStructuredFilters.qualification && !educationHay.includes(String(candidateStructuredFilters.qualification).trim().toLowerCase())) return false;
      const selectedNoticeBuckets = parseMultiChipTokens(candidateStructuredFilters.noticeBucket);
      if (selectedNoticeBuckets.length) {
        if (!selectedNoticeBuckets.includes(bucketNoticeDays(noticeDays))) return false;
      } else if (candidateStructuredFilters.maxNoticeDays && (noticeDays == null || noticeDays > Number(candidateStructuredFilters.maxNoticeDays))) {
        return false;
      }
      const selectedRecruiters = parseMultiChipTokens(candidateStructuredFilters.recruiter).map((item) => item.toLowerCase());
      if (selectedRecruiters.length && !selectedRecruiters.includes(normalizedRecruiterValue)) return false;
      const selectedGenders = parseMultiChipTokens(candidateStructuredFilters.gender).map((item) => item.toLowerCase());
      if (selectedGenders.length && !selectedGenders.includes(normalizedGenderValue)) return false;
      const selectedAssessmentStatuses = parseMultiChipTokens(candidateStructuredFilters.assessmentStatus).map((item) => item.toLowerCase());
      if (selectedAssessmentStatuses.length && !selectedAssessmentStatuses.includes(assessmentStatusValue.toLowerCase())) return false;
      const selectedAttemptOutcomes = parseMultiChipTokens(candidateStructuredFilters.attemptOutcome).map((item) => normalizeAttemptOutcomeLabel(item).toLowerCase());
      if (selectedAttemptOutcomes.length && !selectedAttemptOutcomes.includes(normalizeAttemptOutcomeLabel(attemptOutcomeValue).toLowerCase())) return false;
      return true;
    });
  }, [candidateBaseUniverse, candidateStructuredFilters, state.assessments]);
  const pagedCandidates = useMemo(() => {
    const start = (candidatePage - 1) * 10;
    return candidateUniverse.slice(start, start + 10);
  }, [candidateUniverse, candidatePage]);
  const totalCandidatePages = Math.max(1, Math.ceil((candidateUniverse.length || 0) / 10));
  const candidateSmartChipRows = useMemo(() => {
    const assessmentById = new Map((state.assessments || []).map((assessment) => [String(assessment?.id || "").trim(), assessment]));
    const fromTs = candidateSmartDateFrom ? new Date(`${candidateSmartDateFrom}T00:00:00`).getTime() : null;
    const toTs = candidateSmartDateTo ? new Date(`${candidateSmartDateTo}T23:59:59`).getTime() : null;
    const inDateRange = (value) => {
      if (!fromTs && !toTs) return true;
      const ts = value ? new Date(value).getTime() : NaN;
      if (!Number.isFinite(ts)) return false;
      if (fromTs && ts < fromTs) return false;
      if (toTs && ts > toTs) return false;
      return true;
    };
    const normalizeStatus = (value) => normalizeAssessmentStatusLabel(String(value || "")).toLowerCase();
    const rowsByChip = {
      aligned_interviews: [],
      feedback_awaited: [],
      quick_joiners: [],
      offered_candidates: [],
      cv_shared: []
    };
    candidateUniverse.forEach((item) => {
      const linkedAssessment = item?.raw?.assessment
        || item?.assessment
        || assessmentById.get(String(item?.assessment_id || item?.assessmentId || "").trim())
        || null;
      const assessmentStatus = normalizeStatus(
        linkedAssessment?.candidateStatus
          || linkedAssessment?.status
          || item?.candidateStatus
          || item?.assessment_status
          || item?.assessmentStatus
          || ""
      );
      const interviewAt = String(
        linkedAssessment?.interviewAt
          || linkedAssessment?.interview_at
          || item?.interviewAt
          || ""
      ).trim();
      const updatedAt = String(
        linkedAssessment?.updatedAt
          || linkedAssessment?.updated_at
          || item?.updated_at
          || item?.updatedAt
          || item?.created_at
          || ""
      ).trim();
      const noticeDays = parseNoticePeriodToDays(item?.notice_period || item?.noticePeriod || "");
      const baseRow = {
        item,
        candidateName: item?.name || item?.candidateName || "Candidate",
        role: item?.role || item?.currentDesignation || item?.jd_title || item?.jdTitle || "",
        client: item?.client_name || item?.clientName || linkedAssessment?.clientName || "",
        recruiter: item?.assigned_to_name || item?.ownerRecruiter || item?.recruiterName || "",
        currentCtc: item?.current_ctc || item?.currentCtc || "",
        expectedCtc: item?.expected_ctc || item?.expectedCtc || "",
        notice: item?.notice_period || item?.noticePeriod || "",
        status: normalizeAssessmentStatusLabel(
          linkedAssessment?.candidateStatus
            || linkedAssessment?.status
            || item?.candidateStatus
            || item?.assessment_status
            || item?.assessmentStatus
            || ""
        ),
        date: interviewAt || updatedAt || ""
      };

      if (SMART_CHIP_INTERVIEW_ALIGNED_STATUSES.has(assessmentStatus) && inDateRange(interviewAt || updatedAt)) {
        rowsByChip.aligned_interviews.push({ ...baseRow, round: normalizeAssessmentStatusLabel(assessmentStatus) });
      }
      if (assessmentStatus === "feedback awaited" && inDateRange(interviewAt || updatedAt)) {
        rowsByChip.feedback_awaited.push({ ...baseRow, round: "Feedback awaited" });
      }
      if (noticeDays != null && noticeDays <= 15 && inDateRange(updatedAt)) {
        rowsByChip.quick_joiners.push({ ...baseRow, round: "Quick joiner" });
      }
      if (assessmentStatus === "offered" && inDateRange(updatedAt)) {
        rowsByChip.offered_candidates.push({ ...baseRow, round: "Offered" });
      }
      if (assessmentStatus === "cv shared" && inDateRange(updatedAt)) {
        rowsByChip.cv_shared.push({ ...baseRow, round: "CV shared" });
      }
    });
    return rowsByChip;
  }, [candidateUniverse, candidateSmartDateFrom, candidateSmartDateTo, state.assessments]);
  const candidateHasSmartChipSelection = candidateAiQueryMode === "natural" && candidateQuickChipIds.length > 0;

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
        if (label) {
          meta.capturedBy.add(label);
          meta.assignedTo.add(label);
        }
      });
      meta.assignedTo.add("Unassigned");
    } else {
      if (currentUserName) meta.capturedBy.add(currentUserName);
      const adminUser = (state.users || []).find((user) => String(user?.role || "").toLowerCase() === "admin");
      const adminName = String(adminUser?.name || "").trim();
      if (adminName) meta.capturedBy.add(adminName);
    }
    for (const item of state.candidates || []) {
      const matchedAssessment = resolveCapturedAssessment(item);
      const sourceValue = String(item.source || "").trim();
      const isInboundApplicant = sourceValue === "website_apply" || sourceValue === "hosted_apply" || sourceValue === "google_sheet";
      if (isInboundApplicant) continue;
      if (matchedAssessment) continue;
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
      assignedTo: Array.from(meta.assignedTo).sort(),
      capturedBy: Array.from(meta.capturedBy).sort(),
      outcomes: ATTEMPT_OUTCOME_OPTIONS.concat(
        Array.from(meta.outcomes).filter((item) => !ATTEMPT_OUTCOME_OPTIONS.includes(item)).sort((a, b) => a.localeCompare(b))
      ),
      activeStates: ["Active", "Inactive"]
    };
  }, [capturedAssessmentMap, state.candidates, state.jobs, state.user]);

  const capturedNotesUniverse = useMemo(() => {
    return (state.candidates || []).filter((item) => {
      const sourceValue = String(item.source || "").trim();
      const isInboundApplicant = sourceValue === "website_apply" || sourceValue === "hosted_apply" || sourceValue === "google_sheet";
      return !isInboundApplicant;
    });
  }, [state.candidates]);

  const capturedNotesStats = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const queryText = String(candidateFilters.q || "").trim().toLowerCase();
    // Keep stats aligned with the same filters as the visible list (clients/JD/recruiter/outcome/state/date/query).
    // We do not exclude converted rows here because we show both Active + Converted counts.
    const universe = capturedNotesUniverse.filter((item) => {
      const matchedAssessment = resolveCapturedAssessment(item);
      const sourceValue = String(item.source || "").trim();
      const clientValue = String(item.client_name || matchedAssessment?.clientName || "Unassigned").trim();
      const jdValue = String(item.jd_title || matchedAssessment?.jdTitle || item.role || "").trim();
      const assignedToValue = String(item.assigned_to_name || "Unassigned").trim();
      const capturedByValue = String(item.recruiter_name || item.assigned_by_name || "Unknown").trim();
      const outcomeValue = getCapturedOutcome(item, matchedAssessment);
      const createdAtValue = item.created_at ? String(item.created_at).slice(0, 10) : "";
      const manuallyHidden = item.hidden_from_captured === true;
      const activeValue = manuallyHidden ? "Inactive" : "Active";
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
      const queryOk = !queryText || hay.includes(queryText);
      const dateFromOk = !candidateFilters.dateFrom || (createdAtValue && createdAtValue >= candidateFilters.dateFrom);
      const dateToOk = !candidateFilters.dateTo || (createdAtValue && createdAtValue <= candidateFilters.dateTo);
      const clientOk = !candidateFilters.clients.length || candidateFilters.clients.includes(clientValue);
      const jdOk = !candidateFilters.jds.length || candidateFilters.jds.includes(jdValue);
      const assignedToOk = !candidateFilters.assignedTo.length || candidateFilters.assignedTo.includes(assignedToValue);
      const capturedByOk = !candidateFilters.capturedBy.length || candidateFilters.capturedBy.includes(capturedByValue);
      const sourceOk = !candidateFilters.sources.length || candidateFilters.sources.includes(sourceValue);
      const outcomeOk = !candidateFilters.outcomes.length || candidateFilters.outcomes.includes(outcomeValue);
      const searchNameMatch = Boolean(queryText && nameHay.includes(queryText));

      // State filter rules:
      // - Default (no selection): Active only, but allow finding Inactive rows when searching by name.
      // - If user selects Active/Inactive (or both): respect selection, but still allow name search to surface Inactive even when "Active" is selected.
      const wantsActive = candidateFilters.activeStates.includes("Active");
      const defaultActiveOnly = !candidateFilters.activeStates.length;
      const activeOk = defaultActiveOnly
        ? (activeValue === "Active" || searchNameMatch)
        : (candidateFilters.activeStates.includes(activeValue) || (searchNameMatch && wantsActive));

      const inactiveBlockedByDefault = defaultActiveOnly && activeValue === "Inactive" && !searchNameMatch;
      return !inactiveBlockedByDefault && queryOk && dateFromOk && dateToOk && clientOk && jdOk && assignedToOk && capturedByOk && sourceOk && outcomeOk && activeOk;
    });
    const convertedCount = universe.filter((item) => Boolean(resolveCapturedAssessment(item))).length;
    const activeCount = universe.filter((item) => {
      const matchedAssessment = resolveCapturedAssessment(item);
      if (matchedAssessment) return false;
      return !item.hidden_from_captured;
    }).length;
    return {
      today: universe.filter((item) => String(item.created_at || "").slice(0, 10) === todayKey).length,
      total: universe.length,
      active: activeCount,
      converted: convertedCount
    };
  }, [candidateFilters, capturedAssessmentMap, capturedNotesUniverse]);

  const assessmentStats = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const query = String(assessmentFilters.q || "").trim().toLowerCase();
    // Keep stats aligned with the same filters as the visible list (client/JD/recruiter/outcome/date/query),
    // but we intentionally do not apply the "Active/Archived lane" filter here so the cards can show both counts.
    const universe = (Array.isArray(state.assessments) ? state.assessments : []).filter((item) => {
      const matchedCandidate = (state.candidates || []).find((candidate) =>
        (item?.candidateId && String(candidate.id) === String(item.candidateId)) ||
        String(candidate.name || "").trim().toLowerCase() === String(item?.candidateName || "").trim().toLowerCase()
      );
      const clientValue = String(item?.clientName || matchedCandidate?.client_name || "").trim();
      const jdValue = String(item?.jdTitle || matchedCandidate?.jd_title || "").trim();
      const recruiterValue = String(matchedCandidate?.assigned_to_name || item?.recruiterName || matchedCandidate?.recruiter_name || "").trim();
      const outcomeValue = normalizeAssessmentStatusLabel(item?.candidateStatus || item?.candidate_status || "") || "No outcome";
      const createdKey = String(item?.generatedAt || item?.createdAt || item?.created_at || item?.updatedAt || "").slice(0, 10);
      const hay = [
        item?.candidateName,
        item?.phoneNumber,
        item?.emailId,
        jdValue,
        clientValue,
        recruiterValue
      ].join(" ").toLowerCase();
      if (query && !hay.includes(query)) return false;
      if (assessmentFilters.dateFrom && createdKey && createdKey < assessmentFilters.dateFrom) return false;
      if (assessmentFilters.dateTo && createdKey && createdKey > assessmentFilters.dateTo) return false;
      if (assessmentFilters.clients.length && !assessmentFilters.clients.includes(clientValue)) return false;
      if (assessmentFilters.jds.length && !assessmentFilters.jds.includes(jdValue)) return false;
      if (assessmentFilters.recruiters.length && !assessmentFilters.recruiters.includes(recruiterValue)) return false;
      if (assessmentFilters.outcomes.length && !assessmentFilters.outcomes.includes(outcomeValue)) return false;
      return true;
    });
    const activeCount = universe.filter((item) => !isAssessmentArchived(item)).length;
    const archivedCount = universe.filter((item) => isAssessmentArchived(item)).length;
    return {
      today: universe.filter((item) => String(item?.generatedAt || item?.createdAt || item?.created_at || item?.updatedAt || "").slice(0, 10) === todayKey).length,
      total: universe.length,
      active: activeCount,
      archived: archivedCount
    };
  }, [assessmentFilters, state.assessments, state.candidates]);

  const capturedCandidates = useMemo(() => {
    return capturedNotesUniverse.filter((item) => {
      const matchedAssessment = resolveCapturedAssessment(item);
      if (matchedAssessment) return false;
      const sourceValue = String(item.source || "").trim();
      const clientValue = String(item.client_name || matchedAssessment?.clientName || "Unassigned").trim();
      const jdValue = String(item.jd_title || matchedAssessment?.jdTitle || item.role || "").trim();
      const assignedToValue = String(item.assigned_to_name || "Unassigned").trim();
      const capturedByValue = String(item.recruiter_name || item.assigned_by_name || "Unknown").trim();
      const outcomeValue = getCapturedOutcome(item, matchedAssessment);
      const createdAtValue = item.created_at ? String(item.created_at).slice(0, 10) : "";
      const manuallyHidden = item.hidden_from_captured === true;
      const activeValue = manuallyHidden ? "Inactive" : "Active";
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
      const assignedToOk = !candidateFilters.assignedTo.length || candidateFilters.assignedTo.includes(assignedToValue);
      const capturedByOk = !candidateFilters.capturedBy.length || candidateFilters.capturedBy.includes(capturedByValue);
      const sourceOk = !candidateFilters.sources.length || candidateFilters.sources.includes(sourceValue);
      const outcomeOk = !candidateFilters.outcomes.length || candidateFilters.outcomes.includes(outcomeValue);
      const searchNameMatch = Boolean(queryText && nameHay.includes(queryText));

      const wantsActive = candidateFilters.activeStates.includes("Active");
      const defaultActiveOnly = !candidateFilters.activeStates.length;
      const activeOk = defaultActiveOnly
        ? (activeValue === "Active" || searchNameMatch)
        : (candidateFilters.activeStates.includes(activeValue) || (searchNameMatch && wantsActive));

      const inactiveBlockedByDefault = defaultActiveOnly && activeValue === "Inactive" && !searchNameMatch;
      return !inactiveBlockedByDefault && queryOk && dateFromOk && dateToOk && clientOk && jdOk && assignedToOk && capturedByOk && sourceOk && outcomeOk && activeOk;
    });
  }, [candidateFilters, capturedAssessmentMap, capturedNotesUniverse]);

  const filteredApplicants = useMemo(() => {
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const currentUserName = String(state.user?.name || "").trim().toLowerCase();
    const currentUserId = String(state.user?.id || "").trim();
    return (state.applicants || []).filter((item) => {
      if (isAdmin) return true;
      const assignedName = String(item.assignedToName || item.assigned_to_name || "").trim().toLowerCase();
      const assignedId = String(item.assignedToUserId || item.assigned_to_user_id || "").trim();
      // Prefer stable id matching; fall back to name for legacy rows.
      if (currentUserId && assignedId) return assignedId === currentUserId;
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

  const applicantAssessmentMap = useMemo(() => {
    const map = new Map();
    filteredApplicants.forEach((item) => {
      const applicantId = String(item.id || "").trim();
      const match = (state.assessments || []).find((assessment) => {
        const assessmentCandidateId = String(
          assessment.candidateId ||
          assessment.candidate_id ||
          assessment?.payload?.candidateId ||
          assessment?.payload?.candidate_id ||
          ""
        ).trim();
        return Boolean(assessmentCandidateId && applicantId && assessmentCandidateId === applicantId);
      }) || null;
      map.set(applicantId, match);
    });
    return map;
  }, [filteredApplicants, applicantCandidateMap, state.assessments]);

  const applicantOptions = useMemo(() => {
    const clients = new Set();
    const jds = new Set();
    const ownedBy = new Set();
    const assignedTo = new Set();
    const outcomes = new Set();
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    if (isAdmin) {
      (state.users || []).forEach((user) => {
        const name = String(user?.name || "").trim();
        if (!name) return;
        ownedBy.add(name);
        assignedTo.add(name);
      });
    }
    filteredApplicants.forEach((item) => {
      const linkedCandidate = applicantCandidateMap.get(String(item.id)) || null;
      const linkedAssessment = applicantAssessmentMap.get(String(item.id)) || null;
      if (isApplicantConvertedToAssessment(item, linkedCandidate, linkedAssessment)) return;
      const clientValue = String(item.clientName || item.client_name || "Unassigned").trim();
      const jdValue = String(item.jdTitle || item.jd_title || "").trim();
      const ownedValue = getApplicantOwnerLabel(item, linkedCandidate);
      const assignedValue = getApplicantManualAssigneeLabel(item, linkedCandidate);
      const outcomeValue = getApplicantWorkflowOutcome(item, linkedCandidate);
      if (clientValue) clients.add(clientValue);
      if (jdValue) jds.add(jdValue);
      if (ownedValue) ownedBy.add(ownedValue);
      if (assignedValue) assignedTo.add(assignedValue);
      if (outcomeValue) outcomes.add(outcomeValue);
    });
    return {
      clients: Array.from(clients).sort((a, b) => a.localeCompare(b)),
      jds: Array.from(jds).sort((a, b) => a.localeCompare(b)),
      ownedBy: Array.from(ownedBy).sort((a, b) => a.localeCompare(b)),
      assignedTo: Array.from(assignedTo).sort((a, b) => a.localeCompare(b)),
      outcomes: APPLIED_OUTCOME_FILTER_ORDER.concat(
        Array.from(outcomes).filter((item) => !APPLIED_OUTCOME_FILTER_ORDER.includes(item)).sort((a, b) => a.localeCompare(b))
      ),
      activeStates: ["Active", "Inactive"]
    };
  }, [filteredApplicants, applicantCandidateMap, applicantAssessmentMap, state.user, state.users]);

  const visibleApplicants = useMemo(() => {
    const query = String(applicantFilters.q || "").trim().toLowerCase();
    return filteredApplicants.filter((item) => {
      const linkedCandidate = applicantCandidateMap.get(String(item.id)) || null;
      const linkedAssessment = applicantAssessmentMap.get(String(item.id)) || null;
      if (isApplicantConvertedToAssessment(item, linkedCandidate, linkedAssessment)) return false;
      const clientValue = String(item.clientName || item.client_name || "Unassigned").trim();
      const jdValue = String(item.jdTitle || item.jd_title || "").trim();
      const ownedValue = getApplicantOwnerLabel(item, linkedCandidate);
      const assignedValue = getApplicantManualAssigneeLabel(item, linkedCandidate);
      const outcomeValue = getApplicantWorkflowOutcome(item, linkedCandidate);
      const manuallyHidden = Boolean(item.hidden_from_captured || linkedCandidate?.hidden_from_captured);
      const activeValue = manuallyHidden ? "Inactive" : "Active";
      const createdDate = String(item.createdAt || item.created_at || "").slice(0, 10);
      const nameHay = [item.candidateName, linkedCandidate?.name].join(" ").toLowerCase();
      const hay = [
        item.candidateName,
        linkedCandidate?.name,
        item.phone,
        item.email,
        jdValue,
        clientValue,
        ownedValue,
        assignedValue,
        item.currentCompany,
        item.currentDesignation
      ].join(" ").toLowerCase();
      if (query && !hay.includes(query)) return false;
      const searchNameMatch = Boolean(query && nameHay.includes(query));
      if (!applicantFilters.activeStates.length && activeValue === "Inactive" && !searchNameMatch) return false;
      if (applicantFilters.activeStates.length && !applicantFilters.activeStates.includes(activeValue)) return false;
      if (applicantFilters.dateFrom && createdDate && createdDate < applicantFilters.dateFrom) return false;
      if (applicantFilters.dateTo && createdDate && createdDate > applicantFilters.dateTo) return false;
      if (applicantFilters.clients.length && !applicantFilters.clients.includes(clientValue)) return false;
      if (applicantFilters.jds.length && !applicantFilters.jds.includes(jdValue)) return false;
      if (applicantFilters.ownedBy.length && !applicantFilters.ownedBy.includes(ownedValue)) return false;
      if (applicantFilters.assignedTo.length && !applicantFilters.assignedTo.includes(assignedValue)) return false;
      if (applicantFilters.outcomes.length && !applicantFilters.outcomes.includes(outcomeValue)) return false;
      return true;
    });
  }, [filteredApplicants, applicantFilters, applicantCandidateMap, applicantAssessmentMap]);
  const applicantStats = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const currentUserId = String(state.user?.id || "").trim();
    const currentUserName = String(state.user?.name || "").trim();
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";

    // Keep stats aligned with the same filters as the visible list (clients/JD/owner/assignee/outcome/state/date/query).
    // We do not exclude converted rows here because we show both Active + Converted counts.
    const query = String(applicantFilters.q || "").trim().toLowerCase();
    const universe = filteredApplicants.filter((item) => {
      const linkedCandidate = applicantCandidateMap.get(String(item.id)) || null;
      const linkedAssessment = applicantAssessmentMap.get(String(item.id)) || null;
      const clientValue = String(item.clientName || item.client_name || "Unassigned").trim();
      const jdValue = String(item.jdTitle || item.jd_title || "").trim();
      const ownedValue = getApplicantOwnerLabel(item, linkedCandidate);
      const assignedValue = getApplicantManualAssigneeLabel(item, linkedCandidate);
      const outcomeValue = getApplicantWorkflowOutcome(item, linkedCandidate);
      const manuallyHidden = Boolean(item.hidden_from_captured || linkedCandidate?.hidden_from_captured);
      const activeValue = manuallyHidden ? "Inactive" : "Active";
      const createdDate = String(item.createdAt || item.created_at || "").slice(0, 10);
      const nameHay = [item.candidateName, linkedCandidate?.name].join(" ").toLowerCase();
      const hay = [
        item.candidateName,
        linkedCandidate?.name,
        item.phone,
        item.email,
        jdValue,
        clientValue,
        ownedValue,
        assignedValue,
        item.currentCompany,
        item.currentDesignation
      ].join(" ").toLowerCase();
      if (query && !hay.includes(query)) return false;
      const searchNameMatch = Boolean(query && nameHay.includes(query));
      if (!applicantFilters.activeStates.length && activeValue === "Inactive" && !searchNameMatch) return false;
      if (applicantFilters.activeStates.length && !applicantFilters.activeStates.includes(activeValue)) return false;
      if (applicantFilters.dateFrom && createdDate && createdDate < applicantFilters.dateFrom) return false;
      if (applicantFilters.dateTo && createdDate && createdDate > applicantFilters.dateTo) return false;
      if (applicantFilters.clients.length && !applicantFilters.clients.includes(clientValue)) return false;
      if (applicantFilters.jds.length && !applicantFilters.jds.includes(jdValue)) return false;
      if (applicantFilters.ownedBy.length && !applicantFilters.ownedBy.includes(ownedValue)) return false;
      if (applicantFilters.assignedTo.length && !applicantFilters.assignedTo.includes(assignedValue)) return false;
      if (applicantFilters.outcomes.length && !applicantFilters.outcomes.includes(outcomeValue)) return false;
      // Keep converted rows in universe for Converted counts; list view excludes them separately.
      if (linkedAssessment && isApplicantConvertedToAssessment(item, linkedCandidate, linkedAssessment)) return true;
      return true;
    });
    const converted = universe.filter((item) => Boolean(applicantAssessmentMap.get(String(item.id)) || null)).length;
    const active = universe.filter((item) => {
      const linkedAssessment = applicantAssessmentMap.get(String(item.id)) || null;
      if (linkedAssessment) return false;
      const linkedCandidate = applicantCandidateMap.get(String(item.id)) || null;
      const manuallyHidden = Boolean(item.hidden_from_captured || linkedCandidate?.hidden_from_captured);
      return !manuallyHidden;
    }).length;
    const inactive = universe.filter((item) => {
      const linkedAssessment = applicantAssessmentMap.get(String(item.id)) || null;
      if (linkedAssessment) return false;
      const linkedCandidate = applicantCandidateMap.get(String(item.id)) || null;
      const manuallyHidden = Boolean(item.hidden_from_captured || linkedCandidate?.hidden_from_captured);
      return manuallyHidden;
    }).length;

    // Ownership breakdown (for recruiter/admin clarity):
    // - ownedDirect: came directly to the user's inbox via their apply link (assigned_to_user_id == user and no assigned_by_user_id)
    // - manualAssigned: assigned by admin (assigned_by_user_id present)
    const ownedDirect = universe.filter((item) => {
      const assignedToUserId = String(item.assignedToUserId || item.assigned_to_user_id || "").trim();
      const assignedToName = String(item.assignedToName || item.assigned_to_name || "").trim();
      const assignedByUserId = String(item.assignedByUserId || item.assigned_by_user_id || "").trim();
      const assignedByName = String(item.assignedByName || item.assigned_by_name || "").trim();
      if (isAdmin) {
        // For admin: "Owner" means unassigned inbound applicants sitting in the admin inbox.
        // (assigned_to_* empty) and not manually assigned (assigned_by_* empty).
        const isAssignedToSomeone = Boolean(assignedToUserId || assignedToName);
        const isManuallyAssigned = Boolean(assignedByUserId || assignedByName);
        return !isAssignedToSomeone && !isManuallyAssigned;
      }
      const isToMe = currentUserId && assignedToUserId === currentUserId;
      return isToMe && !assignedByUserId && !assignedByName;
    }).length;

    const assignedManual = universe.filter((item) => {
      const assignedByUserId = String(item.assignedByUserId || item.assigned_by_user_id || "").trim();
      const assignedByName = String(item.assignedByName || item.assigned_by_name || "").trim();
      if (!assignedByUserId && !assignedByName) return false;
      if (!isAdmin) return true;
      // For admin: count only those the admin assigned (not those assigned by someone else).
      if (currentUserId && assignedByUserId) return assignedByUserId === currentUserId;
      if (currentUserName && assignedByName) return assignedByName === currentUserName;
      return false;
    }).length;

    return {
      today: universe.filter((item) => String(item.createdAt || item.created_at || "").slice(0, 10) === todayKey).length,
      active,
      inactive,
      converted,
      ownedDirect,
      assignedManual,
      total: universe.length
    };
  }, [applicantAssessmentMap, applicantCandidateMap, filteredApplicants, state.user, applicantFilters]);

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

  function openDatabaseCandidateCv(candidate) {
    const meta = getCandidateProfileCvMeta(candidate);
    if (!meta.candidateId) {
      setStatus("workspace", "Linked candidate not found for this CV.", "error");
      return;
    }
    if (!candidateHasStoredCv(candidate)) {
      setStatus("workspace", "No uploaded CV available for this profile.", "error");
      return;
    }
    const params = new URLSearchParams({ access_token: token });
    if (meta.url) params.set("cv_url", String(meta.url));
    if (meta.filename) params.set("cv_filename", String(meta.filename));
    if (meta.key) params.set("cv_key", String(meta.key));
    if (meta.provider) params.set("cv_provider", String(meta.provider));
    window.open(`/company/candidates/${encodeURIComponent(meta.candidateId)}/cv?${params.toString()}`, "_blank", "noopener,noreferrer");
    setStatus("workspace", "Opening CV...", "ok");
  }

  async function copyCandidateProfileShareLink(candidateId) {
    const safeId = String(candidateId || "").trim();
    if (!safeId) {
      setStatus("workspace", "Candidate id missing for share link.", "error");
      return;
    }
    const result = await api(`/company/candidates/${encodeURIComponent(safeId)}/share-profile-link`, token, "POST");
    const url = String(result?.url || "").trim();
    if (!url) {
      setStatus("workspace", "Could not generate share link.", "error");
      return;
    }
    await copyText(url);
    setStatus("workspace", "Candidate profile share link copied.", "ok");
  }

  async function openCandidateProfileCard(candidateId, options = {}) {
    const statusTarget = String(options?.statusTarget || "workspace");
    const safeId = String(candidateId || "").trim();
    if (!safeId) {
      setStatus(statusTarget, "Candidate id missing for candidate card.", "error");
      return;
    }
    // Open a blank tab synchronously (popup blockers allow this). We'll redirect once the URL is ready.
    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setStatus(statusTarget, "Popup blocked. Allow popups to open candidate card.", "error");
      return;
    }
    try {
      popup.opener = null;
    } catch {
      // ignore
    }
    try {
      const result = await api(`/company/candidates/${encodeURIComponent(safeId)}/share-profile-link`, token, "POST");
      const url = String(result?.url || "").trim();
      if (!url) {
        try { popup.close(); } catch { /* ignore */ }
        setStatus(statusTarget, "Could not generate candidate card link.", "error");
        return;
      }
      popup.location.href = url;
      setStatus(statusTarget, "Opening candidate card...", "ok");
    } catch (error) {
      try { popup.close(); } catch { /* ignore */ }
      setStatus(statusTarget, String(error?.message || error), "error");
    }
  }

  function resolveCandidateIdForAssessment(assessment) {
    const directId = String(assessment?.candidateId || assessment?.candidate_id || "").trim();
    if (directId) return directId;

    const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
    const normalizePhone = (value) => {
      const digits = String(value || "").replace(/[^\d]/g, "");
      return digits.length > 10 ? digits.slice(-10) : digits;
    };

    const wantedEmail = normalizeEmail(assessment?.emailId || assessment?.email || "");
    const wantedPhone = normalizePhone(assessment?.phoneNumber || assessment?.phone || "");
    if (!wantedEmail && !wantedPhone) return "";

    const pool = (state.databaseCandidates || []).length ? state.databaseCandidates : (state.candidates || []);
    const match = pool.find((candidate) => {
      const email = normalizeEmail(candidate?.email || candidate?.emailId || "");
      const phone = normalizePhone(candidate?.phone || candidate?.phoneNumber || "");
      return (wantedEmail && email && wantedEmail === email) || (wantedPhone && phone && wantedPhone === phone);
    });
    return String(match?.id || "").trim();
  }

  async function openAssessmentCandidateCardModal(assessment) {
    const candidateId = resolveCandidateIdForAssessment(assessment);
    if (!candidateId) {
      setStatus("assessments", "Linked candidate not found for this assessment.", "error");
      return;
    }

    const pool = (state.databaseCandidates || []).length ? state.databaseCandidates : (state.candidates || []);
    let candidateRow = pool.find((item) => String(item?.id || "").trim() === String(candidateId).trim()) || null;
    if (!candidateRow) {
      try {
        const rows = await api(`/candidates?id=${encodeURIComponent(candidateId)}&scope=company&limit=1`, token).catch(() => []);
        candidateRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
      } catch {
        candidateRow = null;
      }
    }

    // If still missing, show a lightweight modal using assessment fields (fallback).
    if (!candidateRow) {
      candidateRow = {
        id: candidateId,
        name: assessment?.candidateName || "Candidate",
        phone: assessment?.phoneNumber || "",
        email: assessment?.emailId || "",
        company: assessment?.currentCompany || "",
        role: assessment?.currentDesignation || "",
        experience: assessment?.totalExperience || "",
        location: assessment?.location || "",
        current_ctc: assessment?.currentCtc || "",
        expected_ctc: assessment?.expectedCtc || "",
        notice_period: assessment?.noticePeriod || "",
        linkedin: assessment?.linkedinUrl || "",
        client_name: assessment?.clientName || "",
        jd_title: assessment?.jdTitle || ""
      };
    }

    setDatabaseProfileItem({
      raw: {
        candidate: candidateRow,
        assessment
      }
    });
  }

  async function openCandidateFromSearch(item) {
    const candidateId = String(item?.id || item?.candidate_id || "").trim();
    const assessmentId = String(item?.assessment_id || item?.assessmentId || "").trim();
    const hasCandidateInWorkflow = candidateId && (state.candidates || []).some((candidate) => String(candidate?.id || "").trim() === candidateId);
    if (hasCandidateInWorkflow) {
      loadCandidateIntoInterview(candidateId);
      return;
    }
    const assessmentFromItem = item?.raw?.assessment
      || item?.assessment
      || (assessmentId ? (state.assessments || []).find((assessment) => String(assessment?.id || "").trim() === assessmentId) : null)
      || null;
    if (assessmentFromItem) {
      await openAssessmentCandidateCardModal(assessmentFromItem);
      return;
    }
    if (candidateId) {
      await openCandidateProfileCard(candidateId, { statusTarget: "workspace" });
      return;
    }
    setStatus("workspace", "Candidate link not available for this row.", "error");
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

  async function removeInterviewStoredCv() {
    if (!interviewMeta.candidateId) {
      setStatus("interview", "Open a real candidate draft before removing the uploaded CV.", "error");
      return;
    }
    if (!interviewForm.cvAnalysis?.storedFile) {
      setStatus("interview", "No uploaded CV is available to remove.", "error");
      return;
    }
    if (!window.confirm("Remove the uploaded CV from this candidate?")) return;
    await api(`/company/candidates/${encodeURIComponent(interviewMeta.candidateId)}/interview-cv`, token, "DELETE");
    setInterviewForm((current) => ({ ...current, cvAnalysis: null, cvAnalysisApplied: false }));
    setStatus("interview", "Uploaded CV removed.", "ok");
    await loadWorkspace();
  }

  async function removeApplicant(applicantId) {
    if (!window.confirm("Remove this applicant from the intake inbox?")) return;
    await api(`/company/applicants?id=${encodeURIComponent(applicantId)}`, token, "DELETE");
    await loadWorkspace();
    setStatus("applicants", "Applicant removed.", "ok");
  }

  async function hideApplicant(applicantId) {
    await api(`/company/candidates/${encodeURIComponent(applicantId)}`, token, "PATCH", { patch: { hidden_from_captured: true } });
    await loadWorkspace();
    setStatus("applicants", "Applicant hidden from active list.", "ok");
  }

  async function restoreApplicant(applicantId) {
    await api(`/company/candidates/${encodeURIComponent(applicantId)}`, token, "PATCH", { patch: { hidden_from_captured: false } });
    await loadWorkspace();
    setStatus("applicants", "Applicant restored to active list.", "ok");
  }

  async function saveApplicantAssignment({ recruiterId, jdId, jdTitle, clientName }) {
    const user = (state.users || []).find((item) => String(item.id || "") === String(recruiterId || "")) || null;
    await api("/company/applicants/assign", token, "POST", {
      id: assignApplicantId,
      assignedToUserId: recruiterId,
      assignedToName: user?.name || "",
      assignedJdId: jdId,
      assignedJdTitle: jdTitle,
      clientName,
      client_name: clientName,
      jdTitle
    });
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
      linkedin: applicant.linkedin || "",
      location: applicant.location || "",
      gender: applicant.gender || "",
      currentCtc: applicant.currentCtc || "",
      expectedCtc: applicant.expectedCtc || "",
      noticePeriod: applicant.noticePeriod || "",
      offerInHand: applicant.offerInHand || "",
      lwdOrDoj: applicant.lwdOrDoj || "",
      currentCompany: applicant.currentCompany || "",
      currentDesignation: applicant.currentDesignation || "",
      totalExperience: applicant.totalExperience || "",
      currentOrgTenure: applicant.currentOrgTenure || "",
      experienceTimeline: "",
      reasonForChange: applicant.reasonForChange || "",
      cautiousIndicators: "",
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

  async function saveCapturedAssignment({ recruiterId, jdId, jdTitle, clientName }) {
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const effectiveRecruiterId = isAdmin ? String(recruiterId || "").trim() : String(state.user?.id || "").trim();
    const recruiter = (state.users || []).find((user) => String(user.id) === String(effectiveRecruiterId));
    const nextAssigneeName = recruiter?.name || state.user?.name || "";
    if (isAdmin) {
      await api("/candidates/assign", token, "POST", {
        id: assignCandidateId,
        assignedToUserId: effectiveRecruiterId,
        assignedToName: nextAssigneeName,
        assignedJdId: jdId,
        assignedJdTitle: jdTitle,
        clientName,
        client_name: clientName
      });
      await patchCandidateQuiet(assignCandidateId, { hidden_from_captured: false });
      setAssignCandidateId("");
      setStatus("captured", "Draft assigned to recruiter.", "ok");
      return;
    }
    await patchCandidate(assignCandidateId, {
      assigned_to_user_id: effectiveRecruiterId,
      assigned_to_name: nextAssigneeName,
      assigned_jd_id: jdId,
      assigned_jd_title: jdTitle,
      jd_title: jdTitle,
      client_name: clientName || "",
      // If a hidden/inactive note is reassigned, make it active for the new assignee.
      hidden_from_captured: false
    }, "Draft assigned to recruiter.");
    setAssignCandidateId("");
  }

  async function patchCandidate(candidateId, patch, okMessage) {
    const currentCandidate = (state.candidates || []).find((item) => String(item.id) === String(candidateId)) || {};
    const nextPatch = { ...patch };
    if (!Object.prototype.hasOwnProperty.call(nextPatch, "draft_payload")) {
      nextPatch.draft_payload = buildCandidateDraftPayloadPatch(currentCandidate, patch);
    }
    if (!Object.prototype.hasOwnProperty.call(nextPatch, "screening_answers")) {
      const currentDraft = getCandidateDraftState(currentCandidate);
      nextPatch.screening_answers = currentDraft.jdScreeningAnswers || parsePortalObjectField(currentCandidate?.screening_answers || currentCandidate?.screeningAnswers);
    }
    await api(`/company/candidates/${encodeURIComponent(candidateId)}`, token, "PATCH", { patch: nextPatch });
    // Optimistic local patch to avoid blocking the UI on a full workspace refresh.
    setState((current) => {
      const applyPatch = (items) => Array.isArray(items)
        ? items.map((item) => String(item?.id || "") === String(candidateId) ? { ...item, ...nextPatch } : item)
        : items;
      return {
        ...current,
        candidates: applyPatch(current.candidates),
        databaseCandidates: applyPatch(current.databaseCandidates)
      };
    });
    void refreshWorkspaceSilently("post-patch");
    setStatus("captured", okMessage, "ok");
  }

  async function patchCandidateQuiet(candidateId, patch) {
    const currentCandidate = (state.candidates || []).find((item) => String(item.id) === String(candidateId)) || {};
    const nextPatch = { ...patch };
    if (!Object.prototype.hasOwnProperty.call(nextPatch, "draft_payload")) {
      nextPatch.draft_payload = buildCandidateDraftPayloadPatch(currentCandidate, patch);
    }
    if (!Object.prototype.hasOwnProperty.call(nextPatch, "screening_answers")) {
      const currentDraft = getCandidateDraftState(currentCandidate);
      nextPatch.screening_answers = currentDraft.jdScreeningAnswers || parsePortalObjectField(currentCandidate?.screening_answers || currentCandidate?.screeningAnswers);
    }
    await api(`/company/candidates/${encodeURIComponent(candidateId)}`, token, "PATCH", { patch: nextPatch });
    setState((current) => {
      const applyPatch = (items) => Array.isArray(items)
        ? items.map((item) => String(item?.id || "") === String(candidateId) ? { ...item, ...nextPatch } : item)
        : items;
      return {
        ...current,
        candidates: applyPatch(current.candidates),
        databaseCandidates: applyPatch(current.databaseCandidates)
      };
    });
    void refreshWorkspaceSilently("post-patch");
  }

  async function hideCapturedCandidate(candidateId) {
    await patchCandidate(candidateId, { hidden_from_captured: true }, "Candidate hidden from captured notes.");
  }

  async function restoreCapturedCandidate(candidateId) {
    await patchCandidate(candidateId, { hidden_from_captured: false }, "Candidate restored to active captured notes.");
  }

  async function deleteCapturedCandidate(candidateId) {
    if (!window.confirm("Delete this captured note permanently?")) return;
    await api(`/company/candidates/${encodeURIComponent(candidateId)}`, token, "DELETE");
    setState((current) => ({
      ...current,
      candidates: Array.isArray(current.candidates) ? current.candidates.filter((item) => String(item?.id || "") !== String(candidateId)) : current.candidates,
      databaseCandidates: Array.isArray(current.databaseCandidates) ? current.databaseCandidates.filter((item) => String(item?.id || "") !== String(candidateId)) : current.databaseCandidates
    }));
    void refreshWorkspaceSilently("post-delete");
    setStatus("captured", "Candidate deleted.", "ok");
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
    const effectiveRawRecruiterNote = buildStructuredRecruiterRawNote(quickUpdateRecruiterSections, "");
    const mergeForSave = quickUpdateMergedPatch || buildRecruiterMerge(
      quickUpdateCandidate,
      buildStructuredRecruiterSectionOverrides(quickUpdateRecruiterSections),
      effectiveRawRecruiterNote
    );
    try {
      const merged = mergeForSave.merged || normalizeRecruiterMergeBase(quickUpdateCandidate);
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
    const manualOutcome = String(quickUpdateAttemptOutcome || "").trim();
    const outcome = manualOutcome;
    const note = outcome;
    const followUpAt = quickUpdateStatusAt || "";
    if (!outcome) {
      setStatus("quickUpdate", "Select an attempt outcome first.", "error");
      return;
    }
    if (outcome === "Call later" && !followUpAt) {
      setStatus("quickUpdate", "Select next follow-up time for this outcome.", "error");
      return;
    }
    try {
      const savedAt = new Date().toISOString();
      await api("/contact-attempts", token, "POST", {
        candidateId: quickUpdateCandidate.id,
        outcome,
        notes: note,
        next_follow_up_at: followUpAt || ""
      });
      const candidatePatch = {
        last_contact_outcome: outcome || "",
        last_contact_notes: appendAttemptHistory(
          quickUpdateCandidate?.last_contact_notes || "",
          buildAttemptHistoryLine({ outcome, remarks: buildDefaultAttemptRemark(outcome), followUpAt, atValue: savedAt })
        ),
        last_contact_at: savedAt
      };
      if (followUpAt) {
        candidatePatch.next_follow_up_at = new Date(followUpAt).toISOString();
      } else if (outcome !== "Call later") {
        candidatePatch.next_follow_up_at = "";
      }
      await patchCandidateQuiet(quickUpdateCandidate.id, candidatePatch);
      setQuickUpdateStatusText("");
      setQuickUpdateAttemptOutcome("");
      setQuickUpdateStatusAt("");
      setQuickUpdateOfferAmount("");
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
    const manualStatus = String(quickUpdateAssessmentStatus || "").trim();
    try {
      const candidateStatus = manualStatus;
      if (!candidateStatus) {
        setStatus("quickUpdate", "Select an assessment status first.", "error");
        return;
      }
      const lowerStatus = candidateStatus.toLowerCase();
      if (lowerStatus === "offered" && (!String(quickUpdateOfferAmount || "").trim() || !quickUpdateStatusAt)) {
        setStatus("quickUpdate", "Offer amount and expected DOJ are required for Offered.", "error");
        return;
      }
      if (lowerStatus === "joined" && !quickUpdateStatusAt) {
        setStatus("quickUpdate", "Date of joining is required for Joined.", "error");
        return;
      }
      await saveAssessmentStatusUpdate(quickUpdateLinkedAssessment, {
        candidateStatus,
        atValue: quickUpdateStatusAt || "",
        notes: "",
        offerAmount: quickUpdateOfferAmount || "",
        expectedDoj: lowerStatus === "offered" ? quickUpdateStatusAt : "",
        dateOfJoining: lowerStatus === "joined" ? quickUpdateStatusAt : ""
      }, {
        statusTarget: "quickUpdate",
        closeModal: false
      });
      setQuickUpdateStatusText("");
      setQuickUpdateAssessmentStatus("");
      setQuickUpdateStatusAt("");
      setQuickUpdateOfferAmount("");
      setStatus("quickUpdate", `Assessment status updated to ${candidateStatus}.`, "ok");
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
      screening_answers: {},
      draft_payload: {
        candidateName: newDraftForm.name || "",
        phoneNumber: newDraftForm.phone || "",
        emailId: newDraftForm.email || "",
        linkedin: newDraftForm.linkedin || "",
        location: newDraftForm.location || "",
        currentCompany: newDraftForm.company || "",
        currentDesignation: "",
        totalExperience: "",
        relevantExperience: "",
        highestEducation: "",
        currentCtc: "",
        expectedCtc: "",
        noticePeriod: "",
        offerInHand: "",
        lwdOrDoj: "",
        currentOrgTenure: "",
        reasonForChange: "",
        clientName: newDraftForm.client_name || "",
        jdTitle: newDraftForm.jd_title || "",
        pipelineStage: "Under Interview Process",
        candidateStatus: "Screening in progress",
        followUpAt: "",
        interviewAt: "",
        recruiterNotes: "",
        callbackNotes: newDraftForm.notes || "",
        otherPointers: "",
        tags: newDraftForm.tags || "",
        jdScreeningAnswers: {},
        cvAnalysis: null,
        cvAnalysisApplied: false,
        statusHistory: []
      },
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
    if (!candidate?.id) {
      setStatus("workspace", "Could not mark follow-up done because the candidate id is missing.", "error");
      return;
    }
    const confirmed = typeof window === "undefined" || window.confirm(`Mark follow-up done for ${candidate?.name || "this candidate"}?`);
    if (!confirmed) return;
    const previousFollowUpAt = candidate.next_follow_up_at || "";
    setState((current) => ({
      ...current,
      candidates: (current.candidates || []).map((item) =>
        String(item.id || "") === String(candidate.id || "") ? { ...item, next_follow_up_at: "" } : item
      ),
      databaseCandidates: (current.databaseCandidates || []).map((item) =>
        String(item.id || "") === String(candidate.id || "") ? { ...item, next_follow_up_at: "" } : item
      )
    }));
    try {
      await api(`/company/candidates/${encodeURIComponent(candidate.id)}`, token, "PATCH", {
        patch: { next_follow_up_at: null }
      });
      await loadWorkspace();
      setStatus("workspace", `Marked follow-up done for ${candidate?.name || "candidate"}.`, "ok");
    } catch (error) {
      setState((current) => ({
        ...current,
        candidates: (current.candidates || []).map((item) =>
          String(item.id || "") === String(candidate.id || "") ? { ...item, next_follow_up_at: previousFollowUpAt } : item
        ),
        databaseCandidates: (current.databaseCandidates || []).map((item) =>
          String(item.id || "") === String(candidate.id || "") ? { ...item, next_follow_up_at: previousFollowUpAt } : item
        )
      }));
      setStatus("workspace", String(error?.message || error || "Could not mark follow-up done."), "error");
    }
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
    const savedAt = new Date().toISOString();
    const finalOutcome = String(patch.outcome || "").trim();
    const finalInferText = String(patch.infer_text || "").trim();
    const finalRemarks = String(patch.remarks || patch.notes || "").trim();
    const storedNote = [finalInferText, finalRemarks ? `Remarks: ${finalRemarks}` : ""].filter(Boolean).join("\n") || buildDefaultAttemptRemark(finalOutcome) || finalOutcome;
    const historyLine = buildAttemptHistoryLine({
      outcome: finalOutcome,
      remarks: finalRemarks,
      followUpAt: patch.next_follow_up_at,
      atValue: savedAt
    });
    await api("/contact-attempts", token, "POST", {
      candidateId: attemptsCandidateId,
      outcome: finalOutcome,
      notes: storedNote,
      next_follow_up_at: patch.next_follow_up_at
    });
    const candidatePatch = {
      last_contact_outcome: finalOutcome,
      last_contact_notes: appendAttemptHistory(attemptsCandidate?.last_contact_notes || "", historyLine),
      last_contact_at: savedAt
    };
    if (patch.next_follow_up_at) {
      candidatePatch.next_follow_up_at = new Date(patch.next_follow_up_at).toISOString();
    } else if (finalOutcome && finalOutcome !== "Call later") {
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
    const candidateDraft = getCandidateDraftState(candidate);
    const matched = resolveCapturedAssessment(candidate);
    setInterviewMeta({
      candidateId: String(candidate.id || ""),
      assessmentId: String(matched?.id || "")
    });
    const parsedRecruiterBase = normalizeRecruiterMergeBase(candidate);
    const cvMeta = decodePortalApplicantMetadata(candidate);
    const candidateCvAnalysis = cvMeta?.cvAnalysisCache?.result
      ? buildInterviewCvAnalysis({
          currentCompany: candidateDraft.currentCompany || matched?.currentCompany || candidate?.company || "",
          currentDesignation: candidateDraft.currentDesignation || matched?.currentDesignation || candidate?.role || "",
          totalExperience: candidateDraft.totalExperience || matched?.totalExperience || candidate?.experience || "",
          currentOrgTenure: candidateDraft.currentOrgTenure || matched?.currentOrgTenure || candidate?.current_org_tenure || ""
        }, cvMeta.cvAnalysisCache.result, cvMeta.cvAnalysisCache.storedFile || null)
      : null;
    setInterviewForm({
      candidateName: candidateDraft.candidateName || matched?.candidateName || candidate?.name || "",
      phoneNumber: candidateDraft.phoneNumber || matched?.phoneNumber || candidate?.phone || "",
      emailId: candidateDraft.emailId || matched?.emailId || candidate?.email || "",
      linkedin: candidateDraft.linkedin || matched?.linkedinUrl || candidate?.linkedin || "",
      location: candidateDraft.location || matched?.location || candidate?.location || "",
      gender: candidateDraft.gender || matched?.gender || candidate?.gender || "",
      currentCtc: candidateDraft.currentCtc || matched?.currentCtc || candidate?.current_ctc || "",
      expectedCtc: candidateDraft.expectedCtc || matched?.expectedCtc || candidate?.expected_ctc || "",
      noticePeriod: candidateDraft.noticePeriod || matched?.noticePeriod || candidate?.notice_period || parsedRecruiterBase.notice_period || "",
      offerInHand: candidateDraft.offerInHand || matched?.offerInHand || parsedRecruiterBase.offer_in_hand || "",
      lwdOrDoj: sanitizeLwdOrDojValue(candidateDraft.lwdOrDoj || matched?.lwdOrDoj || candidate?.lwd_or_doj || parsedRecruiterBase.lwd_or_doj || ""),
      currentCompany: candidateDraft.currentCompany || matched?.currentCompany || candidate?.company || "",
      currentDesignation: candidateDraft.currentDesignation || matched?.currentDesignation || candidate?.role || "",
      totalExperience: candidateDraft.totalExperience || matched?.totalExperience || candidate?.experience || "",
      relevantExperience: candidateDraft.relevantExperience || matched?.relevantExperience || "",
      highestEducation: candidateDraft.highestEducation || matched?.highestEducation || candidate?.highest_education || "",
      currentOrgTenure: candidateDraft.currentOrgTenure || matched?.currentOrgTenure || candidate?.current_org_tenure || "",
      experienceTimeline: candidateDraft.experienceTimeline || matched?.experienceTimeline || matched?.experience_timeline || "",
      reasonForChange: candidateDraft.reasonForChange || matched?.reasonForChange || "",
      cautiousIndicators: candidateDraft.cautiousIndicators || "",
      clientName: candidateDraft.clientName || matched?.clientName || candidate?.client_name || "",
      jdTitle: candidateDraft.jdTitle || matched?.jdTitle || candidate?.jd_title || "",
      pipelineStage: candidateDraft.pipelineStage || matched?.pipelineStage || candidate?.pipeline_stage || "Under Interview Process",
      candidateStatus: normalizeAssessmentStatusLabel(candidateDraft.candidateStatus || matched?.candidateStatus || candidate?.candidate_status) || "Screening in progress",
      followUpAt: toDateInputValue(candidateDraft.followUpAt || matched?.followUpAt || candidate?.next_follow_up_at),
      interviewAt: toDateInputValue(candidateDraft.interviewAt || matched?.interviewAt),
      recruiterNotes: candidateDraft.recruiterNotes || matched?.recruiterNotes || candidate?.recruiter_context_notes || "",
      callbackNotes: candidateDraft.callbackNotes || candidate?.notes || "",
      otherPointers: candidateDraft.otherPointers || matched?.otherPointers || candidate?.other_pointers || "",
      tags: candidateDraft.tags || (Array.isArray(candidate?.skills) ? candidate.skills.join(", ") : ""),
      jdScreeningAnswers: candidateDraft.jdScreeningAnswers || matched?.jdScreeningAnswers || {},
      cvAnalysis: matched?.cvAnalysis || candidateCvAnalysis || null,
      cvAnalysisApplied: candidateDraft.cvAnalysisApplied === true ? true : Boolean(matched?.cvAnalysisApplied),
      statusHistory: Array.isArray(candidateDraft.statusHistory) ? candidateDraft.statusHistory : Array.isArray(matched?.statusHistory) ? matched.statusHistory : []
    });
    navigate("/interview");
    setStatus("interview", `Loaded ${candidate.name || "candidate"} into Interview Panel.`, "ok");
  }

  function openSavedAssessment(assessment) {
    const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
    const normalizePhone = (value) => {
      const digits = String(value || "").replace(/[^\d]/g, "");
      return digits.length > 10 ? digits.slice(-10) : digits;
    };
    const wantedCandidateId = String(assessment?.candidateId || assessment?.candidate_id || "").trim();
    const wantedEmail = normalizeEmail(assessment?.emailId || assessment?.email || "");
    const wantedPhone = normalizePhone(assessment?.phoneNumber || assessment?.phone || "");
    const matchedCandidate = (state.candidates || []).find((item) => {
      if (wantedCandidateId && String(item.id) === wantedCandidateId) return true;
      const email = normalizeEmail(item?.email || item?.emailId || "");
      const phone = normalizePhone(item?.phone || item?.phoneNumber || "");
      return (wantedEmail && email && wantedEmail === email) || (wantedPhone && phone && wantedPhone === phone);
    }) || null;
    const candidateDraft = getCandidateDraftState(matchedCandidate || {});
    setInterviewMeta({
      candidateId: String(matchedCandidate?.id || assessment?.candidateId || ""),
      assessmentId: String(assessment?.id || "")
    });
    const parsedRecruiterBase = normalizeRecruiterMergeBase(matchedCandidate || assessment || {});
    const cvMeta = decodePortalApplicantMetadata(matchedCandidate || {});
    const candidateCvAnalysis = cvMeta?.cvAnalysisCache?.result
      ? buildInterviewCvAnalysis({
          currentCompany: assessment?.currentCompany || candidateDraft.currentCompany || matchedCandidate?.company || "",
          currentDesignation: assessment?.currentDesignation || candidateDraft.currentDesignation || matchedCandidate?.role || "",
          totalExperience: assessment?.totalExperience || candidateDraft.totalExperience || matchedCandidate?.experience || "",
          currentOrgTenure: assessment?.currentOrgTenure || candidateDraft.currentOrgTenure || matchedCandidate?.current_org_tenure || ""
        }, cvMeta.cvAnalysisCache.result, cvMeta.cvAnalysisCache.storedFile || null)
      : null;
    setInterviewForm({
      candidateName: assessment?.candidateName || "",
      phoneNumber: assessment?.phoneNumber || candidateDraft.phoneNumber || matchedCandidate?.phone || "",
      emailId: assessment?.emailId || candidateDraft.emailId || matchedCandidate?.email || "",
      linkedin: assessment?.linkedinUrl || candidateDraft.linkedin || matchedCandidate?.linkedin || "",
      location: assessment?.location || candidateDraft.location || matchedCandidate?.location || "",
      gender: assessment?.gender || candidateDraft.gender || matchedCandidate?.gender || "",
      currentCtc: assessment?.currentCtc || candidateDraft.currentCtc || matchedCandidate?.current_ctc || "",
      expectedCtc: assessment?.expectedCtc || candidateDraft.expectedCtc || matchedCandidate?.expected_ctc || "",
      noticePeriod: assessment?.noticePeriod || candidateDraft.noticePeriod || matchedCandidate?.notice_period || parsedRecruiterBase.notice_period || "",
      offerInHand: assessment?.offerInHand || parsedRecruiterBase.offer_in_hand || "",
      lwdOrDoj: sanitizeLwdOrDojValue(assessment?.lwdOrDoj || candidateDraft.lwdOrDoj || matchedCandidate?.lwd_or_doj || parsedRecruiterBase.lwd_or_doj || ""),
      currentCompany: assessment?.currentCompany || candidateDraft.currentCompany || matchedCandidate?.company || "",
      currentDesignation: assessment?.currentDesignation || candidateDraft.currentDesignation || matchedCandidate?.role || "",
      totalExperience: assessment?.totalExperience || candidateDraft.totalExperience || matchedCandidate?.experience || "",
      relevantExperience: assessment?.relevantExperience || candidateDraft.relevantExperience || "",
      highestEducation: assessment?.highestEducation || candidateDraft.highestEducation || matchedCandidate?.highest_education || "",
      currentOrgTenure: assessment?.currentOrgTenure || candidateDraft.currentOrgTenure || matchedCandidate?.current_org_tenure || "",
      experienceTimeline: assessment?.experienceTimeline || assessment?.experience_timeline || candidateDraft.experienceTimeline || "",
      reasonForChange: assessment?.reasonForChange || candidateDraft.reasonForChange || "",
      cautiousIndicators: assessment?.cautiousIndicators || candidateDraft.cautiousIndicators || "",
      clientName: assessment?.clientName || candidateDraft.clientName || matchedCandidate?.client_name || "",
      jdTitle: assessment?.jdTitle || candidateDraft.jdTitle || matchedCandidate?.jd_title || "",
      pipelineStage: assessment?.pipelineStage || "Under Interview Process",
      candidateStatus: normalizeAssessmentStatusLabel(assessment?.candidateStatus) || "Screening in progress",
      followUpAt: toDateInputValue(assessment?.followUpAt),
      interviewAt: toDateInputValue(assessment?.interviewAt),
      recruiterNotes: assessment?.recruiterNotes || candidateDraft.recruiterNotes || matchedCandidate?.recruiter_context_notes || "",
      callbackNotes: candidateDraft.callbackNotes || matchedCandidate?.notes || "",
      otherPointers: assessment?.otherPointers || candidateDraft.otherPointers || matchedCandidate?.other_pointers || "",
      tags: candidateDraft.tags || (Array.isArray(matchedCandidate?.skills) ? matchedCandidate.skills.join(", ") : ""),
      jdScreeningAnswers: assessment?.jdScreeningAnswers || candidateDraft.jdScreeningAnswers || {},
      cvAnalysis: assessment?.cvAnalysis || candidateCvAnalysis || null,
      cvAnalysisApplied: Boolean(assessment?.cvAnalysisApplied),
      statusHistory: Array.isArray(assessment?.statusHistory) ? assessment.statusHistory : []
    });
    navigate("/interview");
    setStatus("interview", `Opened saved assessment for ${assessment?.candidateName || "candidate"}.`, "ok");
  }

  async function createAssessmentFromCandidate(candidateId) {
    const sourceApplicant = (state.applicants || []).find((item) => String(item.id) === String(candidateId)) || null;
    const statusKey = sourceApplicant ? "applicants" : "captured";
    const linkedApplicantCandidate = sourceApplicant ? applicantCandidateMap.get(String(sourceApplicant.id)) : null;
    const candidate = (state.candidates || []).find((item) => String(item.id) === String(candidateId)) || linkedApplicantCandidate;
    const source = candidate || sourceApplicant;
    if (!source) {
      setStatus(statusKey, "Candidate not found for assessment conversion.", "error");
      return;
    }
    if (candidate?.hidden_from_captured) {
      setStatus(statusKey, "This note is hidden/inactive. Restore to active first, then convert to assessment.", "error");
      return;
    }
    if (sourceApplicant && !candidate) {
      setStatus(statusKey, "This applied candidate is not linked to a saved candidate record yet. Open the draft once (so it saves in Captured Notes), then convert to assessment.", "error");
      return;
    }
    const candidateName = candidate?.name || sourceApplicant?.candidateName || "";
    const matched = (state.assessments || []).find((item) =>
      String(item.candidateId || item.candidate_id || "") === String(candidate?.id || sourceApplicant?.id || "")
    );
    if (matched) {
      openSavedAssessment(matched);
      return;
    }

    if (!window.confirm(`Create assessment for ${candidateName || "this candidate"}? This will move the record out of the active ${sourceApplicant ? "Applied Candidates" : "Captured Notes"} list.`)) {
      return;
    }

    const candidateDraft = candidate ? getCandidateDraftState(candidate) : {};
    const cvMeta = candidate ? decodePortalApplicantMetadata(candidate) : null;
    const candidateCvAnalysis = cvMeta?.cvAnalysisCache?.result
      ? buildInterviewCvAnalysis({
          currentCompany: candidate?.company || sourceApplicant?.currentCompany || "",
          currentDesignation: candidate?.role || sourceApplicant?.currentDesignation || "",
          totalExperience: candidate?.experience || sourceApplicant?.totalExperience || "",
          currentOrgTenure: candidate?.current_org_tenure || ""
        }, cvMeta.cvAnalysisCache.result, cvMeta.cvAnalysisCache.storedFile || null)
      : null;
    const assessment = {
      id: `assessment-${Date.now()}`,
      candidateId: String(candidate?.id || ""),
      candidateName,
      phoneNumber: candidateDraft.phoneNumber || candidate?.phone || sourceApplicant?.phone || "",
      emailId: candidateDraft.emailId || candidate?.email || sourceApplicant?.email || "",
      location: candidateDraft.location || candidate?.location || sourceApplicant?.location || "",
      gender: candidateDraft.gender || candidate?.gender || sourceApplicant?.gender || "",
      currentCtc: candidateDraft.currentCtc || candidate?.current_ctc || sourceApplicant?.currentCtc || "",
      expectedCtc: candidateDraft.expectedCtc || candidate?.expected_ctc || sourceApplicant?.expectedCtc || "",
      noticePeriod: candidateDraft.noticePeriod || candidate?.notice_period || sourceApplicant?.noticePeriod || "",
      offerInHand: candidateDraft.offerInHand || candidate?.offer_in_hand || "",
      lwdOrDoj: sanitizeLwdOrDojValue(candidateDraft.lwdOrDoj || candidate?.lwd_or_doj || ""),
      currentCompany: candidateDraft.currentCompany || candidate?.company || sourceApplicant?.currentCompany || "",
      currentDesignation: candidateDraft.currentDesignation || candidate?.role || sourceApplicant?.currentDesignation || "",
      totalExperience: candidateDraft.totalExperience || candidate?.experience || sourceApplicant?.totalExperience || "",
      relevantExperience: candidateDraft.relevantExperience || "",
      highestEducation: candidateDraft.highestEducation || candidate?.highest_education || "",
      currentOrgTenure: candidateDraft.currentOrgTenure || candidate?.current_org_tenure || "",
      reasonForChange: candidateDraft.reasonForChange || candidate?.reason_of_change || "",
      cautiousIndicators: candidateDraft.cautiousIndicators || "",
      clientName: candidateDraft.clientName || candidate?.client_name || sourceApplicant?.clientName || "",
      jdTitle: candidateDraft.jdTitle || candidate?.jd_title || sourceApplicant?.jdTitle || "",
      pipelineStage: "",
      candidateStatus: "CV shared",
      followUpAt: "",
      interviewAt: "",
      recruiterNotes: candidateDraft.recruiterNotes || candidate?.recruiter_context_notes || sourceApplicant?.screeningAnswers || "",
      callbackNotes: candidateDraft.callbackNotes || candidate?.notes || "",
      otherPointers: candidateDraft.otherPointers || candidate?.other_pointers || "",
      tags: candidateDraft.tags || (Array.isArray(candidate?.skills) ? candidate.skills.join(", ") : ""),
      jdScreeningAnswers: candidateDraft.jdScreeningAnswers || {},
      cvAnalysis: candidateCvAnalysis,
      cvAnalysisApplied: false,
      statusHistory: [{
        status: "CV shared",
        at: new Date().toISOString(),
        notes: "Draft converted into assessment.",
        atLabel: ""
      }],
      questionMode: "basic",
      generatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setStatus(statusKey, "Converting draft into assessment...");
    try {
      const saved = await api("/company/assessments", token, "POST", { assessment });
      // Avoid blocking the UI on a full workspace reload (which can be slow with large datasets).
      // Optimistically update local state, then refresh in the background.
      setState((current) => {
        const nextAssessments = Array.isArray(current.assessments) ? [...current.assessments] : [];
        const savedId = String(saved?.id || assessment?.id || "").trim();
        if (savedId) {
          const existingIx = nextAssessments.findIndex((a) => String(a?.id || "").trim() === savedId);
          if (existingIx >= 0) nextAssessments.splice(existingIx, 1);
          nextAssessments.unshift(saved);
        }
        const nextCandidates = Array.isArray(current.candidates)
          ? current.candidates.map((item) => {
              if (String(item?.id || "") !== String(candidate?.id || "")) return item;
              return {
                ...item,
                assessment_id: savedId || item.assessment_id,
                used_in_assessment: true
              };
            })
          : current.candidates;
        return { ...current, assessments: nextAssessments, candidates: nextCandidates };
      });
      navigate("/assessments");
      setStatus("assessments", `Converted ${candidateName || "candidate"} into assessment.`, "ok");
      void refreshWorkspaceSilently("manual");
    } catch (error) {
      setStatus(statusKey, String(error?.message || error), "error");
    }
  }

  async function saveAssessment() {
    const canonicalInitialStatus = normalizeAssessmentStatusLabel(interviewForm.candidateStatus);
    const normalizedInitialStatus = canonicalInitialStatus.toLowerCase();
    const initialStatus = !normalizedInitialStatus || normalizedInitialStatus === "screening in progress"
      ? "CV shared"
      : canonicalInitialStatus;
    const assessment = {
      id: interviewMeta.assessmentId || `assessment-${Date.now()}`,
      ...(interviewMeta.candidateId ? { candidateId: String(interviewMeta.candidateId) } : {}),
      ...interviewForm,
      candidateStatus: initialStatus,
      pipelineStage: "",
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
    if (interviewMeta.candidateId) {
      const linkedCandidate = (state.candidates || []).find((item) => String(item?.id || "") === String(interviewMeta.candidateId));
      if (linkedCandidate?.hidden_from_captured) {
        setStatus("interview", "This note is hidden/inactive. Restore to active first, then create/update an assessment.", "error");
        return;
      }
    }
    setStatus("interview", "Saving assessment...");
    const savedAssessment = await api("/company/assessments", token, "POST", { assessment });
    upsertAssessmentInState(savedAssessment || assessment);
    if (savedAssessment?.id) {
      setInterviewMeta((current) => ({ ...current, assessmentId: String(savedAssessment.id) }));
    }
    if (interviewMeta.candidateId) {
      const existingCandidate = (state.candidates || []).find((item) => String(item.id) === String(interviewMeta.candidateId));
      const existingMeta = decodePortalApplicantMetadata(existingCandidate || {});
      const nextMeta = mergeStoredCvIntoApplicantMeta(existingMeta, interviewForm.cvAnalysis || null);
      await patchCandidateQuiet(interviewMeta.candidateId, {
        name: interviewForm.candidateName,
        phone: interviewForm.phoneNumber,
        email: interviewForm.emailId,
        linkedin: interviewForm.linkedin,
        location: interviewForm.location,
        company: interviewForm.currentCompany,
        role: interviewForm.currentDesignation,
        experience: interviewForm.totalExperience,
        relevant_experience: interviewForm.relevantExperience,
        highest_education: interviewForm.highestEducation,
        current_ctc: interviewForm.currentCtc,
        expected_ctc: interviewForm.expectedCtc,
        notice_period: interviewForm.noticePeriod,
        recruiter_context_notes: interviewForm.recruiterNotes,
        other_pointers: interviewForm.otherPointers,
        skills: parseTagInputValue(interviewForm.tags),
        lwd_or_doj: sanitizeLwdOrDojValue(interviewForm.lwdOrDoj),
        jd_title: interviewForm.jdTitle,
        client_name: interviewForm.clientName,
        next_follow_up_at: interviewForm.followUpAt,
        screening_answers: interviewForm.jdScreeningAnswers || {},
        draft_payload: {
          ...interviewForm,
          jdScreeningAnswers: interviewForm.jdScreeningAnswers || {}
        },
        raw_note: encodePortalApplicantMetadata({
          ...nextMeta,
          jdScreeningAnswers: interviewForm.jdScreeningAnswers || {}
        })
      });
      setStatus("interview", "Assessment saved and candidate details updated.", "ok");
    } else {
      setStatus("interview", "Assessment saved.", "ok");
    }
    void refreshWorkspaceSilently("post-save");
  }

	  async function saveInterviewDraft() {
	    if (!interviewMeta.candidateId) {
	      setStatus("interview", "Open an existing draft first to save recruiter edits.", "error");
	      return;
	    }
	    setStatus("interview", "Saving draft...");
	    try {
	      const existingCandidate = (state.candidates || []).find((item) => String(item.id) === String(interviewMeta.candidateId));
	      const existingMeta = decodePortalApplicantMetadata(existingCandidate || {});
	      const nextMeta = mergeStoredCvIntoApplicantMeta(existingMeta, interviewForm.cvAnalysis || null);
	      const linkedAssessment = interviewMeta.assessmentId
	        ? (state.assessments || []).find((item) => String(item.id || "") === String(interviewMeta.assessmentId || ""))
	        : null;
	      await api(`/company/candidates/${encodeURIComponent(interviewMeta.candidateId)}`, token, "PATCH", { patch: {
	        name: interviewForm.candidateName,
	        phone: interviewForm.phoneNumber,
	        email: interviewForm.emailId,
	        linkedin: interviewForm.linkedin,
	        location: interviewForm.location,
	        company: interviewForm.currentCompany,
	        role: interviewForm.currentDesignation,
	        experience: interviewForm.totalExperience,
	        relevant_experience: interviewForm.relevantExperience,
	        highest_education: interviewForm.highestEducation,
	        current_ctc: interviewForm.currentCtc,
	        expected_ctc: interviewForm.expectedCtc,
	        notice_period: interviewForm.noticePeriod,
	        recruiter_context_notes: interviewForm.recruiterNotes,
	        notes: interviewForm.callbackNotes,
	        other_pointers: interviewForm.otherPointers,
	        skills: parseTagInputValue(interviewForm.tags),
	        lwd_or_doj: sanitizeLwdOrDojValue(interviewForm.lwdOrDoj),
	        jd_title: interviewForm.jdTitle,
	        client_name: interviewForm.clientName,
	        next_follow_up_at: interviewForm.followUpAt,
	        screening_answers: interviewForm.jdScreeningAnswers || {},
	        draft_payload: {
	          ...interviewForm,
	          jdScreeningAnswers: interviewForm.jdScreeningAnswers || {}
	        },
	        raw_note: encodePortalApplicantMetadata({
	          ...nextMeta,
	          jdScreeningAnswers: interviewForm.jdScreeningAnswers || {}
	        })
	      } });
	      if (linkedAssessment?.id) {
	        await api("/company/assessments", token, "POST", { assessment: {
	          ...linkedAssessment,
	          ...interviewForm,
	          id: linkedAssessment.id,
	          candidateId: interviewMeta.candidateId,
	          candidateName: interviewForm.candidateName,
	          questionMode: linkedAssessment.questionMode || "basic",
	          generatedAt: linkedAssessment.generatedAt || new Date().toISOString(),
	          updatedAt: new Date().toISOString(),
	          statusHistory: Array.isArray(interviewForm.statusHistory) && interviewForm.statusHistory.length
	            ? interviewForm.statusHistory
	            : Array.isArray(linkedAssessment.statusHistory)
	              ? linkedAssessment.statusHistory
	              : []
	        } });
	      }
	      void refreshWorkspaceSilently("post-save");
	      setStatus("interview", "Draft saved.", "ok");
	    } catch (error) {
	      setStatus("interview", `Draft save failed: ${String(error?.message || error)}`, "error");
	    }
	  }

  async function parseInterviewCvFile(file) {
    if (!file) return;
    setStatus("interview", "Uploading CV... (parsing will continue in the background)");
    try {
      const fileData = await fileToBase64(file);
      const isBlank = (value) => !String(value || "").trim();
      const payload = {
        candidateName: interviewForm.candidateName,
        emailId: interviewForm.emailId,
        phoneNumber: interviewForm.phoneNumber,
        totalExperience: interviewForm.totalExperience,
        // Keep AI parsing off from the portal to avoid confusion/cost. Backend still runs deterministic parsing.
        normalizeWithAi: false,
        deferParse: true,
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
      const nextStoredFile = result.storedFile || interviewForm.cvAnalysis?.storedFile || null;
      setInterviewForm((current) => {
        const analysis = buildInterviewCvAnalysis(current, result, nextStoredFile);
        const next = { ...current, cvAnalysis: analysis, cvAnalysisApplied: false };
        const fillBlank = (key, value) => {
          if (!value) return;
          if (isBlank(next[key])) next[key] = value;
        };
        // Never override typed fields; fill only blanks.
        fillBlank("candidateName", analysis.candidateName);
        fillBlank("emailId", analysis.emailId);
        fillBlank("phoneNumber", analysis.phoneNumber);
        fillBlank("totalExperience", analysis.exactTotalExperience || analysis.totalExperience);
        fillBlank("currentCompany", analysis.currentCompany);
        fillBlank("currentDesignation", analysis.currentDesignation);
        fillBlank("currentOrgTenure", analysis.currentOrgTenure);
        fillBlank("highestEducation", analysis.highestEducation);
        return next;
      });
      setStatus(
        "interview",
        result.cached
          ? "Loaded cached CV data from the stored upload."
          : interviewMeta.candidateId
            ? "CV uploaded to storage. Parsing is running in the background. CV link is available immediately."
            : "CV parsed and saved in hidden metadata for later search use.",
        "ok"
      );

      // If we uploaded in candidate context with background parsing, poll for completion and then auto-fill blanks.
      if (interviewMeta.candidateId && payload.deferParse === true && result && result.queued === true) {
        const candidateId = interviewMeta.candidateId;
        (async () => {
          for (let attempt = 0; attempt < 10; attempt += 1) {
            await new Promise((r) => setTimeout(r, 2000));
            try {
              const latest = await api(`/company/candidates/${encodeURIComponent(candidateId)}/cv-analysis`, token).catch(() => null);
              const latestResult = latest?.analysis || latest?.result?.analysis || null;
              const parsePending = Boolean(latest?.parsePending || latest?.result?.parsePending);
              const storedFile = latest?.storedFile || latest?.result?.storedFile || null;
              if (parsePending) continue;
              if (!latestResult) continue;
              setInterviewForm((current) => {
                const analysis = buildInterviewCvAnalysis(current, latestResult, storedFile || current.cvAnalysis?.storedFile || null);
                const next = { ...current, cvAnalysis: analysis };
                const fill = (key, value) => {
                  if (!value) return;
                  if (isBlank(next[key])) next[key] = value;
                };
                fill("candidateName", analysis.candidateName);
                fill("emailId", analysis.emailId);
                fill("phoneNumber", analysis.phoneNumber);
                fill("totalExperience", analysis.exactTotalExperience || analysis.totalExperience);
                fill("currentCompany", analysis.currentCompany);
                fill("currentDesignation", analysis.currentDesignation);
                fill("currentOrgTenure", analysis.currentOrgTenure);
                fill("highestEducation", analysis.highestEducation);
                return next;
              });
              setStatus("interview", "CV parsed in background. Blank fields auto-filled.", "ok");
              break;
            } catch {
              // ignore
            }
          }
        })();
      }
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
    const isBlank = (value) => !String(value || "").trim();
    setInterviewForm((current) => ({
      ...current,
      candidateName: isBlank(current.candidateName) ? (analysis.candidateName || current.candidateName) : current.candidateName,
      emailId: isBlank(current.emailId) ? (analysis.emailId || current.emailId) : current.emailId,
      phoneNumber: isBlank(current.phoneNumber) ? (analysis.phoneNumber || current.phoneNumber) : current.phoneNumber,
      totalExperience: isBlank(current.totalExperience) ? (analysis.exactTotalExperience || analysis.totalExperience || current.totalExperience) : current.totalExperience,
      currentCompany: isBlank(current.currentCompany) ? (analysis.currentCompany || current.currentCompany) : current.currentCompany,
      currentDesignation: isBlank(current.currentDesignation) ? (analysis.currentDesignation || current.currentDesignation) : current.currentDesignation,
      currentOrgTenure: isBlank(current.currentOrgTenure) ? (analysis.currentOrgTenure || current.currentOrgTenure) : current.currentOrgTenure,
      highestEducation: isBlank(current.highestEducation) ? (analysis.highestEducation || current.highestEducation) : current.highestEducation,
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

  function resetJobDraftBlank() {
    setSelectedJobId("");
    setJobDraft({
      id: "",
      title: "",
      clientName: "",
      ownerRecruiterId: "",
      ownerRecruiterName: "",
      assignedRecruiters: [],
      aboutCompany: "",
      publicCompanyLine: "",
      publicTitle: "",
      location: "",
      workMode: "",
      jobDescription: "",
      mustHaveSkills: "",
      redFlags: "",
      recruiterNotes: "",
      standardQuestions: "",
      jdShortcuts: ""
    });
    setJobShortcutKey("");
    setJobShortcutValue("");
  }

  function loadJobIntoDraft(jobId) {
    const job = (state.jobs || []).find((item) => String(item.id) === String(jobId));
    if (!job) {
      resetJobDraftBlank();
      return;
    }
    setSelectedJobId(String(job.id || ""));
    setJobDraft({
      id: String(job.id || ""),
      title: String(job.title || ""),
      clientName: String(job.clientName || ""),
      ownerRecruiterId: String(job.ownerRecruiterId || ""),
      ownerRecruiterName: String(job.ownerRecruiterName || ""),
      assignedRecruiters: Array.isArray(job.assignedRecruiters) ? job.assignedRecruiters : [],
      aboutCompany: String(job.aboutCompany || ""),
      publicCompanyLine: String(job.publicCompanyLine || job.public_company_line || ""),
      publicTitle: String(job.publicTitle || job.public_title || ""),
      location: String(job.location || ""),
      workMode: String(job.workMode || ""),
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
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const ownerRecruiterId = isAdmin ? jobDraft.ownerRecruiterId : String(state.user?.id || "");
    const ownerRecruiterName = isAdmin ? jobDraft.ownerRecruiterName : String(state.user?.name || "");
    const primaryRecruiter = ownerRecruiterId
      ? [{ id: ownerRecruiterId, name: ownerRecruiterName || "", primary: true }]
      : [];
    const additionalRecruiters = isAdmin && Array.isArray(jobDraft.assignedRecruiters) ? jobDraft.assignedRecruiters : [];
    const dedupedRecruiters = new Map();
    [...primaryRecruiter, ...additionalRecruiters].forEach((item) => {
      const id = String(item?.id || "").trim();
      if (!id) return;
      dedupedRecruiters.set(id, {
        id,
        name: String(item?.name || "").trim(),
        primary: id === String(ownerRecruiterId || "").trim()
      });
    });
    const result = await api("/company/jds", token, "POST", {
      job: {
        ...jobDraft,
        id: String(selectedJobId || jobDraft.id || "").trim() || jobDraft.id,
        ownerRecruiterId,
        ownerRecruiterName,
        assignedRecruiters: Array.from(dedupedRecruiters.values())
      }
    });
    await loadWorkspace();
    const nextId = String(result?.id || selectedJobId || jobDraft.id || "").trim();
    if (nextId) {
      setSelectedJobId(nextId);
      setJobDraft((current) => ({ ...current, id: nextId }));
    }
    setStatus("jobs", "JD saved.", "ok");
  }

  async function saveJobDraftAsNew() {
    setStatus("jobs", "Saving as new JD...");
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const ownerRecruiterId = isAdmin ? jobDraft.ownerRecruiterId : String(state.user?.id || "");
    const ownerRecruiterName = isAdmin ? jobDraft.ownerRecruiterName : String(state.user?.name || "");
    const primaryRecruiter = ownerRecruiterId
      ? [{ id: ownerRecruiterId, name: ownerRecruiterName || "", primary: true }]
      : [];
    const additionalRecruiters = isAdmin && Array.isArray(jobDraft.assignedRecruiters) ? jobDraft.assignedRecruiters : [];
    const dedupedRecruiters = new Map();
    [...primaryRecruiter, ...additionalRecruiters].forEach((item) => {
      const id = String(item?.id || "").trim();
      if (!id) return;
      dedupedRecruiters.set(id, {
        id,
        name: String(item?.name || "").trim(),
        primary: id === String(ownerRecruiterId || "").trim()
      });
    });

    const result = await api("/company/jds", token, "POST", {
      job: {
        ...jobDraft,
        // Force-create a new JD even if user is currently editing an existing one.
        id: `jd-${Date.now()}`,
        ownerRecruiterId,
        ownerRecruiterName,
        assignedRecruiters: Array.from(dedupedRecruiters.values())
      }
    });
    await loadWorkspace();
    const nextId = String(result?.id || "").trim();
    if (nextId) {
      loadJobIntoDraft(nextId);
    } else {
      resetJobDraftBlank();
    }
    setStatus("jobs", "Saved as a new JD.", "ok");
  }

  async function deleteSelectedJobDraft() {
    const jobId = String(selectedJobId || jobDraft.id || "").trim();
    if (!jobId) return;
    const confirmed = window.confirm("Delete this JD? This cannot be undone.");
    if (!confirmed) return;
    setStatus("jobs", "Deleting JD...");
    await api("/company/jds", token, "DELETE", { jobId });
    await loadWorkspace();
    resetJobDraftBlank();
    setStatus("jobs", "JD deleted.", "ok");
  }

	function downloadJobDraft() {
	  // Backward-compatible: keep text export, but primary exports are Word/PDF.
	  const blob = new Blob([jobDraft.jobDescription || ""], { type: "text/plain;charset=utf-8" });
	  const url = URL.createObjectURL(blob);
	  const link = document.createElement("a");
	  link.href = url;
	  link.download = `${(jobDraft.title || "jd").replace(/[^\w\-]+/g, "-")}.txt`;
	  link.click();
	  URL.revokeObjectURL(url);
	}

	function buildJobDraftHtml() {
	  const title = String(jobDraft.title || "").trim();
	  const sections = [
	    { label: "Client", value: String(jobDraft.clientName || "").trim() },
	    { label: "Location", value: String(jobDraft.location || "").trim() },
	    { label: "Work mode", value: String(jobDraft.workMode || "").trim() },
	    { label: "About company", value: String(jobDraft.aboutCompany || "").trim() },
	    { label: "Must have skills", value: String(jobDraft.mustHaveSkills || "").trim() },
	    { label: "Job description", value: String(jobDraft.jobDescription || "").trim() },
	    { label: "Red flags", value: String(jobDraft.redFlags || "").trim() },
	    { label: "Recruiter notes", value: String(jobDraft.recruiterNotes || "").trim() },
	    // Standard questions are internal-only and should not be exported in JD downloads.
	  ].filter((item) => item.value);

	  const body = sections.map((item) => `
	    <h2>${escapeHtml(item.label)}</h2>
	    <div class="block">${escapeHtml(item.value).replace(/\n/g, "<br/>")}</div>
	  `.trim()).join("\n");

	  return `
	    <!doctype html>
	    <html>
	      <head>
	        <meta charset="utf-8" />
	        <title>${escapeHtml(title || "Job Description")}</title>
	        <style>
	          body { font-family: Arial, sans-serif; color: #111827; line-height: 1.5; padding: 28px; }
	          h1 { font-size: 22px; margin: 0 0 12px; }
	          h2 { font-size: 14px; margin: 18px 0 6px; color: #374151; letter-spacing: .02em; text-transform: uppercase; }
	          .muted { color: #6b7280; font-size: 12px; margin-bottom: 18px; }
	          .block { font-size: 13.5px; white-space: normal; }
	          hr { border: 0; border-top: 1px solid #e5e7eb; margin: 18px 0; }
	        </style>
	      </head>
	      <body>
	        <h1>${escapeHtml(title || "Job Description")}</h1>
	        <div class="muted">Exported from RecruitDesk Jobs</div>
	        <hr/>
	        ${body || "<div class='block'>No JD content yet.</div>"}
	      </body>
	    </html>
	  `.trim();
	}

	function downloadJobDraftWord() {
	  const html = buildJobDraftHtml();
	  const blob = new Blob([html], { type: "application/msword;charset=utf-8" });
	  const url = URL.createObjectURL(blob);
	  const link = document.createElement("a");
	  link.href = url;
	  link.download = `${(jobDraft.title || "jd").replace(/[^\w\-]+/g, "-")}.doc`;
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
    const locationMatch = text.match(/\bLocation\s*:?\s*([^\n]+)/i);
    const aboutMatch = text.match(/\bAbout\s+(?:the\s+)?Company\s*:?\s*([\s\S]+?)(?:\n\s*(?:Job\s+Description|Role|Responsibilities|Requirements|Key\s+Responsibilities|Must\s+Have|Skills)\s*:|$)/i);
    setJobDraft((current) => ({
      ...current,
      title,
      location: current.location || String(locationMatch?.[1] || "").trim(),
      aboutCompany: current.aboutCompany || String(aboutMatch?.[1] || "").trim(),
      mustHaveSkills: current.mustHaveSkills || skills
    }));
    setStatus("jobs", "Generated JD fields from text.", "ok");
  }

  async function handleJdUpload(file) {
    if (!file) return;
    setStatus("jobs", "Reading JD file...");
    try {
      const filename = String(file.name || "").trim();
      const ext = filename.toLowerCase().split(".").pop() || "";
      let text = "";

      // Plain text formats can be read directly in the browser.
      if (["txt", "md"].includes(ext) || String(file.type || "").toLowerCase().includes("text")) {
        text = await file.text();
      } else {
        // PDFs/DOCX/RTF need server-side extraction; file.text() becomes binary gibberish.
        if (ext === "doc") {
          throw new Error("Legacy .doc parsing is not supported yet. Please upload PDF or DOCX.");
        }
        const fileData = await fileToBase64(file);
        const extracted = await api("/extract-document-text", token, "POST", {
          sourceType: "jd_upload",
          file: {
            filename,
            mimeType: file.type || "application/octet-stream",
            fileData
          }
        });
        text = String(extracted?.rawText || extracted?.result?.rawText || "").trim();
      }

      if (!String(text || "").trim()) {
        throw new Error("JD text could not be extracted from this file.");
      }

      setJobDraft((current) => ({
        ...current,
        jobDescription: text,
        title: current.title || filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")
      }));
      setStatus("jobs", "JD text uploaded into editor.", "ok");
    } catch (error) {
      setStatus("jobs", String(error?.message || error), "error");
    }
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
    const effectiveClientFilter = groupType === "client" || groupType === "clientPosition" || groupType === "position" || groupType === "clientPositionOwner" || groupType === "recruiter_position"
      ? (params.clientLabel || "")
      : (dashboardFilters.clientLabel || "");
    const effectiveRecruiterFilter = groupType === "ownerRecruiter" || groupType === "recruiter" || groupType === "clientPositionOwner" || groupType === "recruiter_position"
      ? (params.recruiterLabel || "")
      : (dashboardFilters.recruiterLabel || "");
    const query = new URLSearchParams({
      metric,
      groupType,
      dateFrom: dashboardFilters.dateFrom || "",
      dateTo: dashboardFilters.dateTo || "",
      clientFilter: effectiveClientFilter || "",
      recruiterFilter: effectiveRecruiterFilter || "",
      clientLabel: params.clientLabel || "",
      recruiterLabel: params.recruiterLabel || "",
      positionLabel: params.positionLabel || ""
    });
    const result = await api(`/company/dashboard/drilldown?${query.toString()}`, token);
    setDrilldownState({
      open: true,
      title,
      items: result.items || [],
      request: { mode: "dashboard", title, metric, groupType, params }
    });
  }

  async function applyClientPortalFilters() {
    setStatus("workspace", "Refreshing client portal...");
    await loadClientPortalSummary(clientPortalFilters);
    setStatus("workspace", "Client portal refreshed.", "ok");
  }

  async function openClientPortalDrilldown({ title, metric, groupType, params = {} }) {
    const query = new URLSearchParams({
      metric,
      groupType,
      dateFrom: clientPortalFilters.dateFrom || "",
      dateTo: clientPortalFilters.dateTo || "",
      clientLabel: params.clientLabel || "",
      positionLabel: params.positionLabel || ""
    });
    const result = await api(`/company/client-portal/drilldown?${query.toString()}`, token);
    setDrilldownState({
      open: true,
      title,
      items: result.items || [],
      request: { mode: "clientPortal", title, metric, groupType, params }
    });
  }

  async function refreshOpenDrilldown() {
    if (!drilldownState.request) return;
    if (drilldownState.request.mode === "dashboard") {
      await openDashboardDrilldown(drilldownState.request);
      return;
    }
    await openClientPortalDrilldown(drilldownState.request);
  }

  async function saveClientFeedback({ status, feedback, interviewAt }) {
    if (!clientFeedbackItem) return;
    const assessment = clientFeedbackItem.raw?.assessment || (clientFeedbackItem.sourceType === "assessment_only" ? clientFeedbackItem : null);
    const candidate = clientFeedbackItem.raw?.candidate || null;
    const trimmedStatus = String(status || "").trim();
    const trimmedFeedback = String(feedback || "").trim();
    if (assessment) {
      const nextStatus = trimmedStatus || assessment.candidateStatus || "";
      const timestamp = new Date().toISOString();
      const nextHistory = [
        ...(Array.isArray(assessment.clientFeedbackHistory) ? assessment.clientFeedbackHistory : []),
        {
          status: nextStatus,
          feedback: trimmedFeedback,
          interviewAt: String(interviewAt || "").trim(),
          updatedAt: timestamp,
          updatedBy: state.user?.name || ""
        }
      ];
      await api("/company/assessments", token, "POST", {
        assessment: {
          ...assessment,
          candidateStatus: nextStatus,
          pipelineStage: mapAssessmentStatusToPipelineStage(nextStatus) || assessment.pipelineStage || "Submitted",
          interviewAt: isInterviewAlignedStatus(nextStatus) ? String(interviewAt || assessment.interviewAt || "").trim() : assessment.interviewAt,
          clientFeedback: trimmedFeedback,
          clientFeedbackStatus: nextStatus,
          clientFeedbackUpdatedAt: timestamp,
          clientFeedbackUpdatedBy: state.user?.name || "",
          clientFeedbackHistory: nextHistory
        }
      });
    } else if (candidate?.id) {
      await patchCandidateQuiet(candidate.id, {
        notes: trimmedFeedback
      });
    }
    await loadWorkspace();
    await refreshOpenDrilldown();
    setClientFeedbackItem(null);
    setStatus("workspace", "Client feedback saved.", "ok");
  }

  async function runCandidateSearch() {
    const keywordDrivenBoolean = buildBooleanFromKeywordBars({
      must: candidateKeywordMust,
      any: candidateKeywordAny,
      exclude: candidateKeywordExclude
    });
    const hasKeywordBuilder = Boolean(keywordDrivenBoolean);
    const chipSuffix = SMART_SEARCH_QUICK_CHIPS
      .filter((chip) => candidateQuickChipIds.includes(chip.id))
      .map((chip) => String(chip.querySuffix || "").trim())
      .filter(Boolean)
      .join(" ");
    const rawInput = String(candidateSearchText || "").trim();
    const effectiveSearchText = [
      hasKeywordBuilder ? keywordDrivenBoolean : rawInput,
      chipSuffix
    ].filter(Boolean).join(" ").trim();

    if (!effectiveSearchText) {
      setCandidateSearchMode("all");
      setCandidateSearchResults([]);
      setCandidatePage(1);
      setCandidateSearchQueryUsed("");
      setCandidateSearchingAs("");
      setStatus("workspace", "Showing candidates using structured filters.", "ok");
      return;
    }
    const mode = candidateAiQueryMode === "natural"
      ? ((hasKeywordBuilder && !chipSuffix) ? "boolean" : "ai")
      : "boolean";
    const semanticEnabled = copySettings.semanticSearchEnabled !== false;
    setCandidateSearchBusy(true);
    setCandidateSearchDebug(null);
    setCandidateSearchQueryUsed(effectiveSearchText);
    setCandidateSearchingAs(hasKeywordBuilder ? keywordDrivenBoolean : "");
    setStatus("workspace", "Searching candidates...", "ok");
    try {
      // Avoid previous applied filters (especially notice bucket) silently wiping results.
      // Search results should render as-is; filters remain editable and can be applied manually.
      setCandidateStructuredFilters(EMPTY_CANDIDATE_STRUCTURED_FILTERS);
      const result = await api(
        `/company/candidates/search-natural?q=${encodeURIComponent(effectiveSearchText)}&mode=${encodeURIComponent(mode)}&semantic=${semanticEnabled ? "1" : "0"}`,
        token
      );
      setCandidateSearchDebug({
        mode,
        semantic: semanticEnabled,
        query: effectiveSearchText,
        searchingAsBoolean: result?.searchingAsBoolean || "",
        filters: result?.filters || null,
        interpretation: result?.interpretation || result?.parsed || result?.planner || null,
        debug: result?.debug || null
      });
      setCandidateSearchingAs(hasKeywordBuilder ? keywordDrivenBoolean : String(result?.searchingAsBoolean || "").trim());
      setCandidateSearchResults(result.items || []);
      setCandidateSearchMode("search");
      setCandidatePage(1);
      if (candidateAiQueryMode === "natural" && result.filters) {
        const maxNoticeDays = result.filters.maxNoticeDays != null ? String(result.filters.maxNoticeDays) : "";
        const noticeBucket = String(result.filters.noticeBucket || "").trim() || mapMaxNoticeDaysToBucket(result.filters.maxNoticeDays);
        const next = {
          ...EMPTY_CANDIDATE_STRUCTURED_FILTERS,
          minExperience: result.filters.minExperienceYears != null ? String(result.filters.minExperienceYears) : "",
          maxExperience: result.filters.maxExperienceYears != null ? String(result.filters.maxExperienceYears) : "",
          location: result.filters.location || (Array.isArray(result.filters.locations) ? result.filters.locations.filter(Boolean).join(", ") : ""),
          keySkills: Array.isArray(result.filters.skills) && result.filters.skills.length ? Array.from(new Set(result.filters.skills.flatMap(splitSearchKeywords))).join(", ") : "",
          currentCompany: result.filters.currentCompany || "",
          client: result.filters.client || "",
          minCurrentCtc: result.filters.minCurrentCtcLpa != null ? String(result.filters.minCurrentCtcLpa) : "",
          maxCurrentCtc: result.filters.maxCurrentCtcLpa != null ? String(result.filters.maxCurrentCtcLpa) : "",
          minExpectedCtc: result.filters.minExpectedCtcLpa != null ? String(result.filters.minExpectedCtcLpa) : "",
          maxExpectedCtc: result.filters.maxExpectedCtcLpa != null ? String(result.filters.maxExpectedCtcLpa) : "",
          qualification: result.filters.qualification || "",
          maxNoticeDays,
          noticeBucket,
          recruiter: result.filters.recruiterName || "",
          gender: result.filters.gender || "",
          assessmentStatus: result.filters.assessmentStatus || "",
          attemptOutcome: result.filters.attemptOutcome || ""
        };
        // AI Search fills filters; keep them editable but do NOT auto-apply,
        // otherwise we end up double-filtering already-filtered results and the list can look empty.
        setCandidateStructuredFiltersDraft(next);
      } else {
        setCandidateStructuredFiltersDraft(EMPTY_CANDIDATE_STRUCTURED_FILTERS);
      }
      setStatus("workspace", `${mode === "boolean" ? "Boolean search" : "Smart search"} returned ${result.items?.length || 0} candidates.`, "ok");
    } catch (error) {
      setCandidateSearchMode("search");
      setCandidateSearchResults([]);
      setCandidateSearchDebug({ error: String(error?.message || error), query: effectiveSearchText, mode });
      setCandidateSearchingAs("");
      setStatus("workspace", `Search failed: ${String(error?.message || error)}`, "error");
    } finally {
      setCandidateSearchBusy(false);
    }
  }

  async function markCandidateParseWrong() {
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    if (!isAdmin) {
      setStatus("workspace", "Only admin can mark parse feedback.", "error");
      return;
    }
    if (!candidateSearchDebug) {
      setStatus("workspace", "Run search first, then mark parse wrong.", "error");
      return;
    }
    const note = window.prompt("What was wrong in parsing? (optional)") || "";
    setCandidateParseFeedbackBusy(true);
    try {
      const result = await api("/company/candidates/search-parse-feedback", token, "POST", {
        query: candidateSearchText,
        mode: candidateAiQueryMode,
        semantic: copySettings.semanticSearchEnabled !== false,
        note: String(note || "").trim(),
        parseDebug: candidateSearchDebug
      });
      const persisted = Boolean(result?.persisted);
      if (persisted) {
        setStatus("workspace", "Parse feedback saved for admin tuning.", "ok");
      } else {
        setStatus("workspace", "Parse feedback captured (fallback log).", "ok");
      }
    } catch (error) {
      setStatus("workspace", `Mark parse wrong failed: ${String(error?.message || error)}`, "error");
    } finally {
      setCandidateParseFeedbackBusy(false);
    }
  }

  async function loadSmtpSettingsOnce() {
    if (smtpSettingsLoaded) return;
    try {
      const result = await api("/company/email-settings", token);
      if (smtpSettingsDirtyRef.current) return;
      setSmtpSettings((current) => ({
        ...current,
        host: String(result?.host || "").trim(),
        port: Number(result?.port || 587),
        secure: Boolean(result?.secure),
        user: String(result?.user || "").trim(),
        from: String(result?.from || "").trim(),
        signatureText: String(result?.signatureText || "").trim(),
        signatureLinkLabel: String(result?.signatureLinkLabel || "").trim(),
        signatureLinkUrl: String(result?.signatureLinkUrl || "").trim(),
        signatureLinkLabel2: String(result?.signatureLinkLabel2 || "").trim(),
        signatureLinkUrl2: String(result?.signatureLinkUrl2 || "").trim(),
        hasPassword: Boolean(result?.hasPassword),
        pass: ""
      }));
      setSmtpSettingsKeepPass(Boolean(result?.hasPassword));
    } catch (error) {
      // Settings are optional; show errors only when user tries to save.
    } finally {
      setSmtpSettingsLoaded(true);
    }
  }

  async function saveSmtpSettings() {
    setStatus("settings", "Saving email settings...");
    try {
      await api("/company/email-settings", token, "POST", {
        settings: {
          host: smtpSettings.host,
          port: smtpSettings.port,
          secure: smtpSettings.secure,
          user: smtpSettings.user,
          from: smtpSettings.from,
          pass: smtpSettings.pass,
          keepPass: smtpSettingsKeepPass,
          signatureText: smtpSettings.signatureText,
          signatureLinkLabel: smtpSettings.signatureLinkLabel,
          signatureLinkUrl: smtpSettings.signatureLinkUrl,
          signatureLinkLabel2: smtpSettings.signatureLinkLabel2,
          signatureLinkUrl2: smtpSettings.signatureLinkUrl2
        }
      });
      setSmtpSettings((c) => ({ ...c, pass: "", hasPassword: true }));
      setSmtpSettingsKeepPass(true);
      smtpSettingsDirtyRef.current = false;
      setStatus("settings", "Email settings saved.", "ok");
    } catch (error) {
      setStatus("settings", `Email settings failed: ${String(error?.message || error)}`, "error");
    }
  }

  function fillJdEmailTemplate(template, { candidateName, recruiterName, roleLabel }) {
    const tpl = String(template || "");
    return tpl
      .replace(/\{Candidate\}/gi, String(candidateName || ""))
      .replace(/\{Recruiter\}/gi, String(recruiterName || ""))
      .replace(/\{Role\}/gi, String(roleLabel || ""));
  }

  function openJdEmailModalForCandidate(candidate, defaultJobId = "") {
    const candidateEmail = String(candidate?.email || candidate?.email_id || candidate?.emailId || "").trim() || String(candidate?.raw?.candidate?.email || "").trim();
    const assignedJobId = String(
      candidate?.assigned_jd_id ||
      candidate?.assignedJdId ||
      candidate?.jdId ||
      candidate?.assignedJdId ||
      ""
    ).trim();
    const suggestedJobId = String(defaultJobId || assignedJobId || "").trim();
    const suggestedJobTitle = suggestedJobId
      ? String((state.jobs || []).find((j) => String(j?.id || "") === suggestedJobId)?.title || "").trim()
      : "";
    const roleLabel = suggestedJobTitle
      || String(candidate?.assigned_jd_title || candidate?.assignedJdTitle || candidate?.jd_title || candidate?.jdTitle || candidate?.role || "").trim();
    const candidateName = String(candidate?.name || candidate?.candidateName || "").trim();
    const recruiterName = String(state.user?.name || "Recruiter").trim();
    const subjectTpl = String(copySettings.jdEmailSubjectTemplate || DEFAULT_COPY_SETTINGS.jdEmailSubjectTemplate || "Job Description - {Role}").trim();
    const introTpl = String(copySettings.jdEmailIntroTemplate || DEFAULT_COPY_SETTINGS.jdEmailIntroTemplate || "").trim();
    const defaultSubject = fillJdEmailTemplate(subjectTpl, { candidateName, recruiterName, roleLabel }).trim();
    const baseIntro = fillJdEmailTemplate(introTpl, { candidateName, recruiterName, roleLabel }).trim();
    const companyName = String(state.user?.companyName || state.user?.company_name || "RecruitDesk").trim();
    const clientLabel = String(candidate?.client_name || candidate?.clientName || candidate?.client || "").trim();
    const roleLine = [roleLabel, clientLabel].filter(Boolean).join(" for ");
    const signatureContext = { hrName: "", clientLabel, targetRole: roleLabel, recruiterName, companyName, roleLine };
    const signatureText = String(smtpSettings.signatureText || "").trim()
      || fillClientShareTemplate(copySettings.clientShareSignatureText || DEFAULT_COPY_SETTINGS.clientShareSignatureText || "", signatureContext).trim();
    const signatureLinks = [
      { label: String(smtpSettings.signatureLinkLabel || copySettings.clientShareSignatureLinkLabel || "").trim(), url: String(smtpSettings.signatureLinkUrl || copySettings.clientShareSignatureLinkUrl || "").trim() },
      { label: String(smtpSettings.signatureLinkLabel2 || copySettings.clientShareSignatureLinkLabel2 || "").trim(), url: String(smtpSettings.signatureLinkUrl2 || copySettings.clientShareSignatureLinkUrl2 || "").trim() }
    ].filter((link) => link.url);
    const defaultIntro = baseIntro;
    setJdEmailModal({
      open: true,
      candidate,
      to: candidateEmail,
      cc: "",
      subject: defaultSubject,
      introText: defaultIntro,
      jobId: suggestedJobId
      ,
      attachJdFile: true,
      signatureText,
      signatureLinks
    });
    setJdEmailModalStatus({ message: "", kind: "" });
  }

  async function sendCandidateJdEmail() {
    const candidate = jdEmailModal.candidate;
    const to = String(jdEmailModal.to || "").trim();
    const cc = String(jdEmailModal.cc || "").trim();
    const jobId = String(jdEmailModal.jobId || "").trim();
    const attachJdFile = jdEmailModal.attachJdFile !== false;
    if (!candidate) return;
    if (!to) {
      setStatus("workspace", "Candidate email is required.", "error");
      return;
    }
    if (!jobId) {
      setStatus("workspace", "Select JD/role first.", "error");
      setJdEmailModalStatus({ message: "Select JD/role first.", kind: "error" });
      return;
    }
    setJdEmailBusy(true);
    suspendWorkspaceRefreshRef.current = true;
    setStatus("workspace", "Sending JD email...", "ok");
    setJdEmailModalStatus({ message: "Sending email...", kind: "ok" });
    try {
      const jobTitle = String((state.jobs || []).find((j) => String(j.id) === jobId)?.title || "Job Description").trim();
      const subject = String(jdEmailModal.subject || "").trim() || `JD: ${jobTitle}`;
      await api("/company/jds/send-email", token, "POST", {
        jobId,
        to,
        cc,
        subject,
        introText: String(jdEmailModal.introText || "").trim(),
        signatureText: String(jdEmailModal.signatureText || "").trim(),
        signatureLinks: Array.isArray(jdEmailModal.signatureLinks) ? jdEmailModal.signatureLinks : [],
        attachJdFile
      });
      setStatus("workspace", "JD emailed.", "ok");
      setJdEmailModalStatus({ message: "JD emailed. Check your Zoho Sent folder to confirm.", kind: "ok" });
    } catch (error) {
      setStatus("workspace", `Email failed: ${String(error?.message || error)}`, "error");
      setJdEmailModalStatus({ message: `Email failed: ${String(error?.message || error)}`, kind: "error" });
    } finally {
      setJdEmailBusy(false);
      suspendWorkspaceRefreshRef.current = false;
    }
  }

  function buildCapturedCopyRows() {
    return capturedCandidates.map((item) => {
      const matchedAssessment = resolveCapturedAssessment(item);
      return {
        ...item,
        outcome: getCapturedOutcome(item, matchedAssessment),
        assessment_status: matchedAssessment?.candidateStatus || "",
        current_company: item.company || item.currentCompany || "",
        current_designation: item.role || item.currentDesignation || "",
        total_experience: item.experience || item.totalExperience || "",
        combined_assessment_insights: buildCombinedAssessmentInsightsForExportV2({
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
    const preset = buildCapturedExcelRows(rows, activeCopyPresetId || copySettings.excelPreset, copySettings);
    const lines = [preset.headers.join("\t"), ...preset.rows.map((row) => row.map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))].join("\n");
    await copyText(lines);
    setStatus("captured", "Filtered candidates copied in Excel format.", "ok");
  }

  async function copyCapturedWhatsapp() {
    const rows = buildCapturedCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.whatsappTemplate || DEFAULT_COPY_SETTINGS.whatsappTemplate, { ...item, index: index + 1, follow_up_at: formatDateForCopy(item.next_follow_up_at) })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("captured", "Filtered candidates copied in WhatsApp format.", "ok");
  }

  async function copyCapturedEmail() {
    const rows = buildCapturedCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.emailTemplate || DEFAULT_COPY_SETTINGS.emailTemplate, { ...item, index: index + 1, follow_up_at: formatDateForCopy(item.next_follow_up_at) })).filter(Boolean).join("\n\n");
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
      combined_assessment_insights: buildCombinedAssessmentInsightsForExportV2({
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
    const preset = buildCapturedExcelRows(rows, activeCopyPresetId || copySettings.excelPreset, copySettings);
    const lines = [preset.headers.join("\t"), ...preset.rows.map((row) => row.map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))].join("\n");
    await copyText(lines);
    setStatus("applicants", "Filtered applied candidates copied in Excel format.", "ok");
  }

  async function copyApplicantsWhatsapp() {
    const rows = buildApplicantCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.whatsappTemplate || DEFAULT_COPY_SETTINGS.whatsappTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("applicants", "Filtered applied candidates copied in WhatsApp format.", "ok");
  }

  async function copyApplicantsEmail() {
    const rows = buildApplicantCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.emailTemplate || DEFAULT_COPY_SETTINGS.emailTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("applicants", "Filtered applied candidates copied in email format.", "ok");
  }

  async function copyAssessmentsExcel() {
    const preset = buildCapturedExcelRows(normalizedAssessmentCopyRows, activeCopyPresetId || copySettings.excelPreset, copySettings);
    const lines = [preset.headers.join("\t"), ...preset.rows.map((row) => row.map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))].join("\n");
    await copyText(lines);
    setStatus("assessments", "Filtered assessments copied in Excel format.", "ok");
  }

  async function copyAssessmentsWhatsapp() {
    const text = normalizedAssessmentCopyRows.map((item, index) => fillCandidateTemplate(copySettings.whatsappTemplate || DEFAULT_COPY_SETTINGS.whatsappTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("assessments", "Filtered assessments copied in WhatsApp format.", "ok");
  }

  async function copyAssessmentsEmail() {
    const text = normalizedAssessmentCopyRows.map((item, index) => fillCandidateTemplate(copySettings.emailTemplate || DEFAULT_COPY_SETTINGS.emailTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("assessments", "Filtered assessments copied in email format.", "ok");
  }

  function buildCandidateUniverseCopyRows() {
    return candidateUniverse.map((item, index) => {
      const ctx = resolveCandidateContext(item);
      const baseCandidate = ctx.candidate || {};
      const linkedAssessment = ctx.assessment || null;
      const draft = ctx.draft || {};
      const phone = ctx.phone || "";
      const email = ctx.email || "";

      const recruiterNotes = String(baseCandidate?.recruiter_context_notes || baseCandidate?.recruiterNotes || linkedAssessment?.recruiterNotes || "").trim();
      const otherPointers = String(baseCandidate?.other_pointers || baseCandidate?.otherPointers || linkedAssessment?.otherPointers || "").trim();
      const lastContactNotes = String(ctx.otherStandardQuestions || "").trim();
      const candidateNotes = String(baseCandidate?.notes || "").trim();
      const createdAt = baseCandidate?.created_at || baseCandidate?.createdAt || item?.createdAt || "";

      const normalizedSkills = Array.isArray(baseCandidate?.skills)
        ? baseCandidate.skills
        : Array.isArray(item?.skills)
          ? item.skills
          : Array.isArray(item?.inferredTags)
            ? item.inferredTags
            : [];

      return {
        index: index + 1,
        s_no: index + 1,
        id: String(baseCandidate?.id || item?.id || linkedAssessment?.id || "").trim(),
        name: baseCandidate?.name || item?.candidateName || linkedAssessment?.candidateName || draft?.candidateName || "",
        phone,
        email,
        location: baseCandidate?.location || linkedAssessment?.location || draft?.location || item?.location || "",
        company: baseCandidate?.company || item?.company || linkedAssessment?.currentCompany || draft?.currentCompany || "",
        current_company: baseCandidate?.company || item?.company || linkedAssessment?.currentCompany || draft?.currentCompany || "",
        role: baseCandidate?.role || item?.role || linkedAssessment?.currentDesignation || draft?.currentDesignation || item?.position || "",
        current_designation: baseCandidate?.role || linkedAssessment?.currentDesignation || draft?.currentDesignation || "",
        total_experience: baseCandidate?.experience || item?.totalExperience || linkedAssessment?.totalExperience || draft?.totalExperience || "",
        highest_education: baseCandidate?.highest_education || baseCandidate?.highestEducation || linkedAssessment?.highestEducation || draft?.highestEducation || "",
        current_ctc: baseCandidate?.current_ctc || linkedAssessment?.currentCtc || draft?.currentCtc || "",
        expected_ctc: baseCandidate?.expected_ctc || linkedAssessment?.expectedCtc || draft?.expectedCtc || "",
        notice_period: baseCandidate?.notice_period || linkedAssessment?.noticePeriod || draft?.noticePeriod || "",
        lwd_or_doj: baseCandidate?.lwd_or_doj || linkedAssessment?.lwdOrDoj || linkedAssessment?.offerDoj || draft?.lwdOrDoj || "",
        offer_in_hand: baseCandidate?.offer_in_hand || linkedAssessment?.offerInHand || linkedAssessment?.offerAmount || draft?.offerInHand || "",
        reason_of_change: linkedAssessment?.reasonForChange || buildReasonOfChangeForExport(baseCandidate),
        created_at: createdAt,
        skills: normalizedSkills,
        domain_industry: baseCandidate?.domain_industry || baseCandidate?.domainIndustry || "",
        current_org_tenure: baseCandidate?.current_org_tenure || baseCandidate?.currentOrgTenure || linkedAssessment?.currentOrgTenure || "",
        assigned_to_name: baseCandidate?.assigned_to_name || baseCandidate?.assignedToName || item?.ownerRecruiter || item?.recruiterName || "",
        recruiter_name: baseCandidate?.recruiter_name || baseCandidate?.assigned_by_name || item?.sourcedRecruiter || baseCandidate?.assigned_to_name || "",
        recruiter_context_notes: recruiterNotes,
        other_pointers: otherPointers,
        notes: candidateNotes || String(linkedAssessment?.callbackNotes || "").trim(),
        other_standard_questions: lastContactNotes,
        combined_assessment_insights: buildCombinedAssessmentInsightsForExportV2({
          recruiter_context_notes: recruiterNotes,
          other_pointers: otherPointers,
          other_standard_questions: lastContactNotes
        }),
        draft_payload: baseCandidate?.draft_payload || baseCandidate?.draftPayload || {},
        screening_answers: ctx.screeningMap || baseCandidate?.screening_answers || baseCandidate?.screeningAnswers || {},
        raw_note: baseCandidate?.raw_note || baseCandidate?.rawNote || "",
        linkedin: ctx.linkedin || baseCandidate?.linkedin || linkedAssessment?.linkedinUrl || draft?.linkedin || "",
        jd_title: baseCandidate?.jd_title || baseCandidate?.jdTitle || linkedAssessment?.jdTitle || item?.position || "",
        client_name: baseCandidate?.client_name || baseCandidate?.clientName || linkedAssessment?.clientName || "",
        outcome: linkedAssessment?.candidateStatus || item?.candidateStatus || baseCandidate?.last_contact_outcome || baseCandidate?.lastContactOutcome || "",
        assessment_status: linkedAssessment?.candidateStatus || item?.candidateStatus || baseCandidate?.last_contact_outcome || baseCandidate?.lastContactOutcome || "",
        follow_up_at: formatDateForCopy(linkedAssessment?.followUpAt || item?.followUpAt || item?.interviewAt || baseCandidate?.next_follow_up_at || "")
      };
    });
  }

  async function copyCandidatesExcel() {
    const rows = buildCandidateUniverseCopyRows();
    const preset = buildCapturedExcelRows(rows, activeCopyPresetId || copySettings.excelPreset, copySettings);
    const lines = [
      preset.headers.join("\t"),
      ...preset.rows.map((row) => row.map((cell) => normalizeExcelClipboardCell(cell)).join("\t"))
    ].join("\n");
    await copyText(lines);
    setStatus("workspace", "Candidate search results copied in Excel format.", "ok");
  }

  async function copyCandidatesWhatsapp() {
    const rows = buildCandidateUniverseCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.whatsappTemplate || DEFAULT_COPY_SETTINGS.whatsappTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("workspace", "Candidate search results copied in WhatsApp format.", "ok");
  }

  async function copyCandidatesEmail() {
    const rows = buildCandidateUniverseCopyRows();
    const text = rows.map((item, index) => fillCandidateTemplate(copySettings.emailTemplate || DEFAULT_COPY_SETTINGS.emailTemplate, { ...item, index: index + 1 })).filter(Boolean).join("\n\n");
    await copyText(text);
    setStatus("workspace", "Candidate search results copied in email format.", "ok");
  }

  function downloadCandidatesExcel() {
    const rows = buildCandidateUniverseCopyRows();
    downloadPresetExcelFile(`candidate-search-${new Date().toISOString().slice(0, 10)}.xls`, rows, activeCopyPresetId || copySettings.excelPreset, copySettings, "Candidates");
    setStatus("workspace", "Candidate search results downloaded in Excel format.", "ok");
  }

  function getClientShareRows() {
    return selectedAssessmentRows;
  }

  function getClientShareCvText(item = {}) {
    const shareKey = String(item.candidate_id || item.id || "");
    if (!shareKey) return "Linked candidate not found";
    return clientShareCvLinks[shareKey]
      || (clientShareCvLinkState[shareKey] === "missing" ? "CV link not available yet" : "Generating secure CV link...");
  }

  function getClientSharePresetColumns() {
    const customPreset = (copySettings.customExportPresets || []).find((preset) => String(preset.id) === String(clientShareDraft.presetId));
    const columnsText = customPreset?.columns
      || copySettings.exportPresetColumns?.[clientShareDraft.presetId]
      || DEFAULT_COPY_SETTINGS.exportPresetColumns?.[clientShareDraft.presetId]
      || "";
    return parsePresetColumns(columnsText);
  }

  function getClientShareContext() {
    const hrName = String(clientShareDraft.hrName || "").trim();
    const clientLabel = String(clientShareDraft.clientLabel || "").trim();
    const targetRole = String(clientShareDraft.targetRole || "").trim();
    const recruiterName = String(clientShareDraft.recruiterName || state.user?.name || "Recruiter").trim();
    const companyName = String(state.user?.companyName || state.user?.company_name || "RecruitDesk").trim();
    const roleLine = [targetRole, clientLabel].filter(Boolean).join(" for ");
    return { hrName, clientLabel, targetRole, recruiterName, companyName, roleLine };
  }

  function getClientShareIntroText() {
    const context = getClientShareContext();
    const template = String(copySettings.clientShareIntroTemplate || DEFAULT_COPY_SETTINGS.clientShareIntroTemplate || "").trim();
    return String(clientShareDraft.introText || "").trim() || fillClientShareTemplate(template, context);
  }

  function getClientShareSignature() {
    const context = getClientShareContext();
    const perUserSignatureText = String(smtpSettings.signatureText || "").trim();
    const signatureText = String(clientShareDraft.signatureText || "").trim()
      || perUserSignatureText
      || fillClientShareTemplate(copySettings.clientShareSignatureText || DEFAULT_COPY_SETTINGS.clientShareSignatureText || "", context).trim();
    const links = [
      {
        label: String(clientShareDraft.signatureLinkLabel || smtpSettings.signatureLinkLabel || copySettings.clientShareSignatureLinkLabel || "").trim(),
        url: String(clientShareDraft.signatureLinkUrl || smtpSettings.signatureLinkUrl || copySettings.clientShareSignatureLinkUrl || "").trim()
      },
      {
        label: String(clientShareDraft.signatureLinkLabel2 || smtpSettings.signatureLinkLabel2 || copySettings.clientShareSignatureLinkLabel2 || "").trim(),
        url: String(clientShareDraft.signatureLinkUrl2 || smtpSettings.signatureLinkUrl2 || copySettings.clientShareSignatureLinkUrl2 || "").trim()
      }
    ].filter((link) => link.url);
    return { signatureText, links };
  }

  function buildClientShareBody() {
    const introText = String(clientShareDraft.introText || "").trim()
      || getClientShareIntroText();
    const signature = getClientShareSignature();
    const presetColumns = getClientSharePresetColumns();
    const rows = getClientShareRows();
    const profileLines = rows.flatMap((item, index) => {
      const cells = presetColumns.map((column) => `${column.header}: ${getCapturedExportFieldValue({ index: index + 1, ...item }, column.field) || "-"}`);
      const shareKey = String(item.candidate_id || item.id || "");
      const cvLinkText = !shareKey
        ? "Linked candidate not found for this assessment"
        : clientShareCvLinks[shareKey]
          || (clientShareCvLinkState[shareKey] === "missing" ? "CV link not available yet" : "Generating secure CV link...");
      return [
        `${index + 1}. ${item.name || "Candidate"}`,
        ...cells,
        `CV Link: ${cvLinkText}`,
        ""
      ];
    });
    return [
      introText,
      `${getClientShareRows().length} selected profile(s) are listed below.`,
      "",
      ...profileLines,
      String(clientShareDraft.extraMessage || "").trim(),
      signature.signatureText,
      ...signature.links.map((link) => `${link.label || "Link"}: ${link.url}`)
    ].filter((line, index, array) => line || (index > 0 && array[index - 1] !== "")).join("\n");
  }

  function buildClientShareHtml() {
    const rows = getClientShareRows();
    const presetColumns = getClientSharePresetColumns();
    const tableHeaders = presetColumns.map((column) => `<th style="border:1px solid #d8dee8;padding:10px 12px;background:#f6f8fb;text-align:left;font-size:13px;">${escapeHtml(column.header)}</th>`).join("");
    const tableRows = rows.map((item, index) => {
      const cells = presetColumns.map((column) => {
        const value = getCapturedExportFieldValue({ index: index + 1, ...item }, column.field) || "-";
        return `<td style="border:1px solid #d8dee8;padding:10px 12px;vertical-align:top;font-size:13px;line-height:1.45;">${escapeHtml(value).replace(/\n/g, "<br/>")}</td>`;
      }).join("");
      const shareKey = String(item.candidate_id || item.id || "");
      const cvLink = clientShareCvLinks[shareKey];
      const cvCell = cvLink
        ? `<a href="${escapeHtml(cvLink)}" target="_blank" rel="noopener noreferrer" style="color:#0b57d0;text-decoration:none;">Open CV</a>`
        : (!shareKey
          ? "Linked candidate not found"
          : (clientShareCvLinkState[shareKey] === "missing" ? "CV link not available yet" : "Generating secure CV link..."));
      return `<tr>${cells}<td style="border:1px solid #d8dee8;padding:10px 12px;vertical-align:top;font-size:13px;line-height:1.45;">${cvCell}</td></tr>`;
    }).join("");
    const extraMessage = String(clientShareDraft.extraMessage || "").trim();
    const introText = getClientShareIntroText();
    const introHtml = escapeHtml(introText).replace(/\n/g, "<br/>");
    const signature = getClientShareSignature();
    const signatureLinksHtml = signature.links
      .map((link) => `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" style="color:#0b57d0;text-decoration:none;">${escapeHtml(link.label || link.url)}</a>`)
      .join("<br/>");
    const signatureHtml = [
      signature.signatureText ? escapeHtml(signature.signatureText).replace(/\n/g, "<br/>") : "",
      signatureLinksHtml
    ].filter(Boolean).join("<br/>");
    return `
      <div style="font-family:Arial, sans-serif;color:#1f2a44;line-height:1.6;">
        <p>${introHtml}</p>
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
        ${signatureHtml ? `<div style="margin-top:18px;">${signatureHtml}</div>` : ""}
      </div>
    `.trim();
  }

  function getClientShareEmailSubject() {
    const context = getClientShareContext();
    const explicit = String(clientShareDraft.emailSubject || "").trim();
    if (explicit) return explicit;
    const roleLine = String(context.roleLine || "").trim();
    if (roleLine) return `Job profiles for ${roleLine}`;
    const fallback = [context.targetRole, context.clientLabel].filter(Boolean).join(" | ");
    return fallback ? `Job profiles: ${fallback}` : "Job profiles";
  }

  async function sendClientShareEmail() {
    if (!getClientShareRows().length) {
      setStatus("clientShare", "Select assessment profiles first from the Assessments tab.", "error");
      return;
    }
    const to = String(clientShareDraft.recipientEmail || "").trim();
    if (!to) {
      setStatus("clientShare", "Recipient email is required.", "error");
      return;
    }
    setStatus("clientShare", "Sending email...", "ok");
    try {
      const subject = getClientShareEmailSubject();
      await api("/company/email/send", token, "POST", {
        to,
        subject,
        html: buildClientShareHtml(),
        text: buildClientShareBody()
      });
      setStatus("clientShare", "Email sent. Check your Sent folder to confirm.", "ok");
    } catch (error) {
      setStatus("clientShare", `Email failed: ${String(error?.message || error)}`, "error");
    }
  }

  async function copyClientShareEmailDraft() {
    if (!getClientShareRows().length) {
      setStatus("clientShare", "Select assessment profiles first from the Assessments tab.", "error");
      return;
    }
    await copyHtmlAndText(buildClientShareHtml(), buildClientShareBody());
    setStatus("clientShare", "Client email draft copied in table format.", "ok");
  }

  async function copyClientShareTracker() {
    const rows = getClientShareRows();
    if (!rows.length) {
      setStatus("clientShare", "Select assessment profiles first from the Assessments tab.", "error");
      return;
    }
    const rowsWithCv = rows.map((item, index) => ({
      ...item,
      index: index + 1,
      s_no: index + 1,
      cv_link: getClientShareCvText(item),
      cv_url: getClientShareCvText(item)
    }));
    const preset = buildCapturedExcelRows(rowsWithCv, clientShareDraft.presetId || copySettings.excelPreset, copySettings);
    const hasCvColumn = preset.headers.some((header) => String(header || "").trim().toLowerCase().includes("cv"));
    const headers = hasCvColumn ? preset.headers : [...preset.headers, "CV Link"];
    const outputRows = preset.rows.map((row, index) => (hasCvColumn
      ? row
      : [...row, getCapturedExportFieldValue({ cv_link: getClientShareCvText(rows[index] || {}) }, "cv_link")]
    ));
    const lines = [
      headers.join("\t"),
      ...outputRows.map((row) => row.map((cell) => normalizeExcelClipboardCell(cell)).join("\t"))
    ].join("\n");
    await copyText(lines);
    setStatus("clientShare", "Selected profiles copied as tracker in the chosen preset.", "ok");
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
      exportPresetClientMap: copySettings.exportPresetClientMap || DEFAULT_COPY_SETTINGS.exportPresetClientMap,
      customExportPresets: copySettings.customExportPresets || []
    };
    const result = await api("/company/shared-export-presets", token, "POST", { settings: payload });
    setCopySettings((current) => ({ ...DEFAULT_COPY_SETTINGS, ...current, ...result }));
    setStatus("settings", "Shared copy presets saved for all recruiters.", "ok");
  }

  async function createClientPortalUser() {
    if (!isSettingsAdmin) {
      setStatus("loginClient", "Only admin can create client accounts.", "error");
      return;
    }
    try {
      setStatus("loginClient", "Creating client login...");
      const payload = {
        username: String(clientUserDraft.username || "").trim(),
        password: String(clientUserDraft.password || ""),
        clientName: String(clientUserDraft.clientName || "").trim(),
        allowedPositions: []
      };
      await api("/company/client-users", token, "POST", payload);
      await loadWorkspace();
      setClientUserDraft({ username: "", password: "", clientName: "", allowedPositions: "" });
      setStatus("loginClient", "Client login created.", "ok");
    } catch (error) {
      setStatus("loginClient", String(error?.message || error), "error");
    }
  }

  async function resetClientPortalPassword(clientUserId) {
    if (!isSettingsAdmin) {
      setStatus("loginClient", "Only admin can reset client passwords.", "error");
      return;
    }
    const nextPassword = String(clientPasswordDrafts[clientUserId] || "").trim();
    if (!nextPassword) {
      setStatus("loginClient", "Enter a new password first.", "error");
      return;
    }
    try {
      setStatus("loginClient", "Resetting client password...");
      await api("/company/client-users/password", token, "POST", { clientUserId, newPassword: nextPassword });
      setClientPasswordDrafts((current) => ({ ...current, [clientUserId]: "" }));
      setStatus("loginClient", "Client password reset.", "ok");
    } catch (error) {
      setStatus("loginClient", String(error?.message || error), "error");
    }
  }

  async function createTeamUser() {
    if (!isSettingsAdmin) {
      setStatus("loginTeam", "Only admin can add team members.", "error");
      return;
    }
    try {
      setStatus("loginTeam", "Creating team member...");
      const payload = {
        name: String(teamUserDraft.name || "").trim(),
        email: String(teamUserDraft.email || "").trim(),
        password: String(teamUserDraft.password || ""),
        role: String(teamUserDraft.role || "recruiter").trim()
      };
      await api("/company/users", token, "POST", payload);
      await loadWorkspace();
      setTeamUserDraft({ name: "", email: "", password: "", role: "recruiter" });
      setStatus("loginTeam", "Team member created.", "ok");
    } catch (error) {
      setStatus("loginTeam", String(error?.message || error), "error");
    }
  }

  async function resetTeamUserPassword(userId) {
    if (!isSettingsAdmin) {
      setStatus("loginTeam", "Only admin can reset team passwords.", "error");
      return;
    }
    const nextPassword = String(teamPasswordDrafts[userId] || "").trim();
    if (!nextPassword) {
      setStatus("loginTeam", "Enter a new team password first.", "error");
      return;
    }
    try {
      setStatus("loginTeam", "Resetting team password...");
      await api("/company/users/password", token, "POST", { userId, newPassword: nextPassword });
      setTeamPasswordDrafts((current) => ({ ...current, [userId]: "" }));
      setStatus("loginTeam", "Team password reset.", "ok");
    } catch (error) {
      setStatus("loginTeam", String(error?.message || error), "error");
    }
  }

  async function deleteTeamUser(userId) {
    if (!isSettingsAdmin) {
      setStatus("loginTeam", "Only admin can remove team members.", "error");
      return;
    }
    if (!window.confirm("Remove this team member from the company?")) return;
    try {
      setStatus("loginTeam", "Removing team member...");
      await api("/company/users", token, "DELETE", { userId });
      await loadWorkspace();
      setStatus("loginTeam", "Team member removed.", "ok");
    } catch (error) {
      setStatus("loginTeam", String(error?.message || error), "error");
    }
  }

  async function createCompanyFromLoginSettings() {
    if (!isSettingsAdmin) {
      setStatus("loginCompany", "Only admin can create companies from this panel.", "error");
      return;
    }
    try {
      setStatus("loginCompany", "Creating company...");
      const payload = {
        companyName: String(companyDraft.companyName || "").trim(),
        adminName: String(companyDraft.adminName || "").trim(),
        email: String(companyDraft.email || "").trim(),
        password: String(companyDraft.password || ""),
        platformSecret: String(companyDraft.platformSecret || "").trim()
      };
      await api("/platform/companies", token, "POST", payload);
      setCompanyDraft({ companyName: "", adminName: "", email: "", password: "", platformSecret: "" });
      setStatus("loginCompany", "Company and first admin created.", "ok");
    } catch (error) {
      setStatus("loginCompany", String(error?.message || error), "error");
    }
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
      // Auto-select the newly created preset so admin can edit it right away.
      excelPreset: id,
      customExportPresets: [
        ...((current.customExportPresets || []).filter((item) => String(item.id) !== String(id))),
        { id, label, clientName: String(newPresetDraft.clientName || "").trim(), columns }
      ]
    }));
    setNewPresetDraft({ label: "", clientName: "", columns: "" });
    setStatus("settings", "Custom preset added. Save settings to share it with the team.", "ok");
  }

  function removeCustomPreset(id) {
    if (!isSettingsAdmin) {
      setStatus("settings", "Only admin can remove shared presets.", "error");
      return;
    }
    setCopySettings((current) => ({
      ...current,
      customExportPresets: (current.customExportPresets || []).filter((item) => String(item.id) !== String(id)),
      excelPreset: String(current.excelPreset) === String(id) ? "compact_recruiter" : current.excelPreset
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
  const selectedPresetClientName = selectedCustomPreset
    ? String(selectedCustomPreset.clientName || "").trim()
    : String(copySettings.exportPresetClientMap?.[selectedBuiltInPresetId] || "").trim();

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

  function updateSelectedPresetClientName(value) {
    if (selectedCustomPreset) {
      setCopySettings((current) => ({
        ...current,
        customExportPresets: (current.customExportPresets || []).map((preset) => String(preset.id) === String(selectedCustomPreset.id) ? { ...preset, clientName: value } : preset)
      }));
      return;
    }
    if (!selectedBuiltInPresetId) return;
    setCopySettings((current) => ({
      ...current,
      exportPresetClientMap: {
        ...(current.exportPresetClientMap || {}),
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

  async function copyInterviewTracker() {
    const row = {
      index: 1,
      s_no: 1,
      name: interviewForm.candidateName || "",
      phone: interviewForm.phoneNumber || "",
      email: interviewForm.emailId || "",
      location: interviewForm.location || "",
      client_name: interviewForm.clientName || "",
      jd_title: interviewForm.jdTitle || "",
      current_company: interviewForm.currentCompany || "",
      current_designation: interviewForm.currentDesignation || "",
      total_experience: interviewForm.totalExperience || "",
      relevant_experience: interviewForm.relevantExperience || "",
      highest_education: interviewForm.highestEducation || "",
      current_ctc: interviewForm.currentCtc || "",
      expected_ctc: interviewForm.expectedCtc || "",
      notice_period: interviewForm.noticePeriod || "",
      lwd_or_doj: interviewForm.lwdOrDoj || "",
      offer_in_hand: interviewForm.offerInHand || "",
      reason_of_change: interviewForm.reasonForChange || "",
      recruiter_context_notes: interviewForm.recruiterNotes || "",
      other_pointers: interviewForm.otherPointers || "",
      other_standard_questions: interviewForm.callbackNotes || "",
      screening_answers: interviewForm.jdScreeningAnswers && typeof interviewForm.jdScreeningAnswers === "object"
        ? interviewForm.jdScreeningAnswers
        : {},
      linkedin: interviewForm.linkedin || "",
      status: interviewForm.candidateStatus || "",
      assessment_status: interviewForm.candidateStatus || ""
    };

    const preset = buildCapturedExcelRows([row], activeCopyPresetId || copySettings.excelPreset, copySettings);
    const lines = [
      preset.headers.join("\t"),
      ...preset.rows.map((cells) => cells.map((cell) => String(cell || "").replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))
    ].join("\n");
    await copyText(lines);
    setStatus("interview", "Tracker copied in Excel format.", "ok");
  }

  function copyInterviewResult() {
    // Backward-compat: older UI used "Copy result". Keep it as an alias.
    return copyInterviewTracker();
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

  async function saveAssessmentStatusUpdate(assessment, payload, options = {}) {
    const statusTarget = options.statusTarget || "assessments";
    const inferText = String(payload?.inferText || payload?.notes || "").trim();
    const manualRemarks = String(payload?.manualRemarks || "").trim();
    const combinedNotes = [inferText, manualRemarks ? `Remarks: ${manualRemarks}` : ""].filter(Boolean).join("\n");
    const lastLine = extractLastMeaningfulLine(inferText);
    const inferred = inferAssessmentStatusAndSchedule(lastLine);
    const nextStatus = String(inferred.candidateStatus || payload?.candidateStatus || "").trim();
    if (!nextStatus) throw new Error("Select a status first.");
    const nextStatusLower = nextStatus.toLowerCase();
    const isInterviewStatus = isInterviewAlignedStatus(nextStatus);
    const isOffered = nextStatusLower === "offered";
    const isJoined = nextStatusLower === "joined";
    // Calendar picker should always win over stale infer-box text when the user explicitly changes date/time.
    // (Infer box still works because we keep it synced into atValue via the modal effect.)
    const effectiveAtValue = isOffered
      ? (payload?.expectedDoj || payload?.atValue || inferred.expectedDoj || inferred.atValue || "")
      : isJoined
        ? (payload?.dateOfJoining || payload?.atValue || inferred.dateOfJoining || inferred.atValue || "")
        : (payload?.atValue || inferred.atValue || "");
    const dateCandidate = effectiveAtValue ? new Date(effectiveAtValue) : null;
    const atIso = (isInterviewStatus || isOffered || isJoined) && dateCandidate && !Number.isNaN(dateCandidate.getTime())
      ? dateCandidate.toISOString()
      : "";
    const readableNotes = formatReadableUpdateText(combinedNotes);
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
      inferText,
      manualRemarks,
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
    } else if (nextStatusLower === "not responding" || nextStatusLower === "did not attend") {
      nextAssessment.interviewAttempts.push({
        round: deriveInterviewRoundFromStatus(nextStatus) || "Interview",
        outcome: "Not responding",
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
    if (options.clearAgendaSchedule) {
      nextAssessment.interviewAt = "";
      nextAssessment.followUpAt = "";
    }

    await api("/company/assessments", token, "POST", {
      assessment: {
        ...nextAssessment,
        generatedAt: assessment?.generatedAt || new Date().toISOString()
      }
    });
    const linkedCandidateId = String(assessment?.candidateId || "").trim();
    if (linkedCandidateId) {
      const currentCandidate = (state.candidates || []).find((item) => String(item.id || "") === linkedCandidateId) || {};
      const candidatePatch = {
        assessment_status: nextStatus,
        notes: appendReadableUpdateNote(
          currentCandidate?.notes || "",
          [readableNotes, buildAssessmentStatusNoteLine(nextStatus, atIso, { offerAmount: payload?.offerAmount })].filter(Boolean).join("\n")
        )
      };
      if (isInterviewStatus || isOffered || isJoined) {
        candidatePatch.next_follow_up_at = atIso || "";
      }
      const nextDraftPayload = buildCandidateDraftPayloadPatch(currentCandidate, {
        candidateStatus: nextStatus,
        callbackNotes: candidatePatch.notes,
        followUpAt: candidatePatch.next_follow_up_at,
        interviewAt: isInterviewStatus ? (atIso || "") : "",
        statusHistory: Array.isArray(nextAssessment.statusHistory) ? nextAssessment.statusHistory : [],
        pipelineStage: nextAssessment.pipelineStage
      });
      const currentDraft = getCandidateDraftState(currentCandidate);
      await api(`/company/candidates/${encodeURIComponent(linkedCandidateId)}`, token, "PATCH", {
        patch: {
          ...candidatePatch,
          draft_payload: nextDraftPayload,
          screening_answers: currentDraft.jdScreeningAnswers || parsePortalObjectField(currentCandidate?.screening_answers || currentCandidate?.screeningAnswers)
        }
      }).catch(() => null);
      // Optimistically reflect the status write on the local candidate row for instant UI feedback.
      setState((current) => {
        const applyPatch = (items) => Array.isArray(items)
          ? items.map((item) => String(item?.id || "") === linkedCandidateId ? { ...item, ...candidatePatch } : item)
          : items;
        return {
          ...current,
          candidates: applyPatch(current.candidates),
          databaseCandidates: applyPatch(current.databaseCandidates)
        };
      });
    }
    upsertAssessmentInState(nextAssessment);
    void refreshWorkspaceSilently("post-status");
    if (options.closeModal !== false) setAssessmentStatusId("");
    setStatus(statusTarget, `Updated status for ${assessment?.candidateName || "candidate"}.`, "ok");
  }

  async function deleteAssessmentItem(assessment) {
    if (!window.confirm(`Delete assessment for ${assessment?.candidateName || "candidate"}?`)) return;
    await api("/company/assessments", token, "DELETE", { assessmentId: assessment?.id });
    setState((current) => ({
      ...current,
      assessments: Array.isArray(current.assessments)
        ? current.assessments.filter((item) => String(item?.id || "") !== String(assessment?.id || ""))
        : current.assessments
    }));
    void refreshWorkspaceSilently("post-delete");
    setStatus("assessments", "Assessment deleted.", "ok");
  }

  function upsertAssessmentInState(saved) {
    setState((current) => {
      const nextAssessments = Array.isArray(current.assessments) ? [...current.assessments] : [];
      const savedId = String(saved?.id || "").trim();
      if (savedId) {
        const existingIx = nextAssessments.findIndex((a) => String(a?.id || "").trim() === savedId);
        if (existingIx >= 0) nextAssessments.splice(existingIx, 1);
        nextAssessments.unshift(saved);
      }
      return { ...current, assessments: nextAssessments };
    });
  }

  async function setAssessmentArchivedState(assessment, archived, options = {}) {
    const safeAssessment = assessment && typeof assessment === "object" ? assessment : null;
    if (!safeAssessment?.id) {
      setStatus("assessments", "Assessment id missing.", "error");
      return null;
    }
    const candidateId = String(safeAssessment?.candidateId || "").trim();
    if (!candidateId) {
      setStatus("assessments", "Candidate id missing for this assessment (cannot archive/restore safely).", "error");
      return null;
    }
    const nowIso = new Date().toISOString();
    const next = {
      ...safeAssessment,
      candidateId,
      archived: Boolean(archived),
      archivedAt: archived ? nowIso : "",
      archivedBy: archived ? String(state.user?.name || "").trim() : ""
    };
    setStatus("assessments", archived ? "Archiving assessment..." : "Restoring assessment...");
    try {
      const saved = await api("/company/assessments", token, "POST", { assessment: next });
      upsertAssessmentInState(saved);
      setStatus("assessments", archived ? "Assessment archived." : "Assessment restored.", "ok");
      void refreshWorkspaceSilently("manual");
      return saved;
    } catch (error) {
      const message = String(error?.message || error);
      // Edge case: the candidate row was deleted, so Supabase restore fails the visibility check.
      // Recover by asking backend to recreate the missing candidate and restore the assessment.
      if (!archived && /candidate not found or not allowed/i.test(message)) {
        try {
          const restored = await api("/company/assessments/restore", token, "POST", { assessmentId: safeAssessment.id });
          upsertAssessmentInState(restored);
          setStatus("assessments", "Assessment restored.", "ok");
          void refreshWorkspaceSilently("post-restore");
          return restored;
        } catch (restoreError) {
          setStatus("assessments", String(restoreError?.message || restoreError), "error");
          return null;
        }
      }
      setStatus("assessments", message, "error");
      return null;
    }
  }

  async function moveAssessmentBackToCaptured(assessment) {
    const safeAssessment = assessment && typeof assessment === "object" ? assessment : null;
    const assessmentId = String(safeAssessment?.id || "").trim();
    const candidateId = String(safeAssessment?.candidateId || "").trim();
    if (!assessmentId) {
      setStatus("assessments", "Assessment id missing.", "error");
      return;
    }
    if (!candidateId) {
      setStatus("assessments", "Candidate id missing for this assessment (cannot move back safely).", "error");
      return;
    }
    const confirmed = typeof window === "undefined" || window.confirm(
      "Move back to Captured will remove this assessment and keep the candidate as a captured note. Continue?"
    );
    if (!confirmed) return;
    setStatus("assessments", "Moving back to Captured...");
    try {
      await api("/company/assessments", token, "DELETE", { assessmentId });
      // Clear the candidate link so it shows up in captured notes again.
      await patchCandidateQuiet(candidateId, {
        assessment_id: "",
        used_in_assessment: false,
        assessment_status: ""
      });
      setState((current) => ({
        ...current,
        assessments: Array.isArray(current.assessments)
          ? current.assessments.filter((item) => String(item?.id || "") !== assessmentId)
          : current.assessments
      }));
      navigate("/captured-notes");
      setStatus("captured", "Moved back to Captured.", "ok");
      void refreshWorkspaceSilently("post-delete");
    } catch (error) {
      setStatus("assessments", String(error?.message || error), "error");
    }
  }

  function closeAssessmentMoreMenu() {
    setOpenAssessmentMoreId("");
  }

  async function completeAgendaInterview(assessment) {
    const confirmed = typeof window === "undefined" || window.confirm(`Mark interview done for ${assessment?.candidateName || "this candidate"}?`);
    if (!confirmed) return;
    await saveAssessmentStatusUpdate(assessment, {
      candidateStatus: "Feedback Awaited",
      atValue: "",
      notes: "Interview completed from Today's Agenda."
    });
  }

  async function completeAgendaJoining(assessment) {
    const confirmed = typeof window === "undefined" || window.confirm(`Mark joining complete for ${assessment?.candidateName || "this candidate"}?`);
    if (!confirmed) return;
    await saveAssessmentStatusUpdate(assessment, {
      candidateStatus: "Joined",
      atValue: "",
      notes: "Marked complete from Today's Agenda."
    }, {
      clearAgendaSchedule: true,
      statusTarget: "workspace"
    });
  }

  function reuseAssessmentAsNew(assessment) {
    setInterviewMeta({ candidateId: "", assessmentId: "" });
    setInterviewForm({
      candidateName: assessment?.candidateName || "",
      phoneNumber: assessment?.phoneNumber || "",
      emailId: assessment?.emailId || "",
      linkedin: assessment?.linkedinUrl || "",
      location: assessment?.location || "",
      gender: assessment?.gender || "",
      currentCtc: assessment?.currentCtc || "",
      expectedCtc: assessment?.expectedCtc || "",
      noticePeriod: assessment?.noticePeriod || "",
      offerInHand: assessment?.offerInHand || "",
      currentCompany: assessment?.currentCompany || "",
      currentDesignation: assessment?.currentDesignation || "",
      totalExperience: assessment?.totalExperience || "",
      relevantExperience: assessment?.relevantExperience || "",
      currentOrgTenure: assessment?.currentOrgTenure || "",
      experienceTimeline: assessment?.experienceTimeline || assessment?.experience_timeline || "",
      reasonForChange: assessment?.reasonForChange || "",
      clientName: assessment?.clientName || "",
      jdTitle: assessment?.jdTitle || "",
      pipelineStage: assessment?.pipelineStage || "Under Interview Process",
      candidateStatus: normalizeAssessmentStatusLabel(assessment?.candidateStatus) || "Screening in progress",
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

  function reuseDatabaseCandidate(candidate) {
    if (!candidate) return;
    setInterviewMeta({ candidateId: "", assessmentId: "" });
    setInterviewForm({
      candidateName: candidate?.name || candidate?.candidateName || "",
      phoneNumber: candidate?.phone || candidate?.phoneNumber || "",
      emailId: candidate?.email || candidate?.emailId || "",
      linkedin: candidate?.linkedin || candidate?.linkedinUrl || "",
      location: candidate?.location || "",
      gender: candidate?.gender || "",
      currentCtc: candidate?.current_ctc || candidate?.currentCtc || "",
      expectedCtc: candidate?.expected_ctc || candidate?.expectedCtc || "",
      noticePeriod: candidate?.notice_period || candidate?.noticePeriod || "",
      offerInHand: candidate?.offer_in_hand || candidate?.offerInHand || "",
      lwdOrDoj: candidate?.lwd_or_doj || candidate?.lwdOrDoj || "",
      currentCompany: candidate?.current_company || candidate?.currentCompany || candidate?.company || "",
      currentDesignation: candidate?.current_designation || candidate?.currentDesignation || candidate?.role || "",
      totalExperience: candidate?.total_experience || candidate?.totalExperience || candidate?.experience || "",
      relevantExperience: candidate?.relevant_experience || candidate?.relevantExperience || "",
      currentOrgTenure: candidate?.current_org_tenure || candidate?.currentOrgTenure || "",
      experienceTimeline: candidate?.experience_timeline || candidate?.experienceTimeline || "",
      reasonForChange: candidate?.reason_of_change || candidate?.reasonForChange || "",
      clientName: candidate?.client_name || candidate?.clientName || "",
      jdTitle: candidate?.jd_title || candidate?.jdTitle || candidate?.role || "",
      pipelineStage: "Under Interview Process",
      candidateStatus: normalizeAssessmentStatusLabel(candidate?.assessment_status || candidate?.candidate_status || candidate?.outcome) || "Screening in progress",
      followUpAt: "",
      interviewAt: "",
      recruiterNotes: candidate?.recruiter_context_notes || candidate?.recruiterNotes || "",
      callbackNotes: candidate?.notes || candidate?.callbackNotes || "",
      otherPointers: candidate?.other_pointers || candidate?.otherPointers || "",
      tags: buildVisibleTagList(candidate).join(", "),
      jdScreeningAnswers: {},
      cvAnalysis: null,
      cvAnalysisApplied: false
    });
    setDatabaseProfileItem(null);
    navigate("/interview");
    setStatus("interview", `Loaded ${candidate?.name || "candidate"} as reusable draft.`, "ok");
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
  const clientPortalSummary = state.clientPortal?.summary || { overall: {}, byClient: [], byClientPosition: [] };
  const selectedClientPortalGroup = (clientPortalSummary.byClient || []).find((group) => String(group.label || "") === String(clientPortalFilters.clientLabel || "")) || null;
  const clientPortalPositionRows = (clientPortalSummary.byClientPosition || []).filter((row) => String(row.clientLabel || "") === String(clientPortalFilters.clientLabel || ""));
  const selectedClientPortalPosition = clientPortalPositionRows.find((row) => String(row.positionLabel || "") === String(clientPortalFilters.positionLabel || "")) || null;
  const clientPortalPositionOptions = clientPortalPositionRows.map((row) => row.positionLabel);
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
  const oneDayAgoStart = new Date(todayStart);
  oneDayAgoStart.setDate(oneDayAgoStart.getDate() - 1);
  const candidateHasAssessment = (item) => {
    // Treat archived assessments as "moved back to captured".
    return Boolean(resolveCapturedAssessment(item));
  };
  const isCapturedCallLater = (item) => {
    if (!item?.next_follow_up_at) return false;
    if (item?.hidden_from_captured === true || item?.hiddenFromCaptured === true) return false;
    // Follow-ups are for captured notes only (Call later), not for assessments.
    if (candidateHasAssessment(item)) return false;
    const outcome = String(item?.last_contact_outcome || item?.lastContactOutcome || "").trim().toLowerCase();
    return outcome === "call later" || outcome === "call_later";
  };
  const overdueFollowUps = (state.candidates || []).filter((item) => {
    if (!isCapturedCallLater(item)) return false;
    const value = item?.next_follow_up_at ? new Date(item.next_follow_up_at) : null;
    return value && value >= oneDayAgoStart && value < todayStart;
  });
  const todaysFollowUps = (state.candidates || []).filter((item) => {
    if (!isCapturedCallLater(item)) return false;
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
  // Pending applicants = Active applicants in Applied Candidates (not converted, not hidden),
  // scoped to the current user's visibility (filteredApplicants already applies this).
  const pendingAssignments = filteredApplicants.filter((item) => {
    const linkedCandidate = applicantCandidateMap.get(String(item.id)) || null;
    const linkedAssessment = applicantAssessmentMap.get(String(item.id)) || null;
    if (isApplicantConvertedToAssessment(item, linkedCandidate, linkedAssessment)) return false;
    const manuallyHidden = Boolean(item.hidden_from_captured || linkedCandidate?.hidden_from_captured);
    return !manuallyHidden;
  }).length;
  const pendingNotes = (state.candidates || []).filter((item) => {
    const sourceValue = String(item.source || "").trim();
    if (["website_apply", "hosted_apply", "google_sheet"].includes(sourceValue)) return false;
      const matchedAssessment = resolveCapturedAssessment(item);
      if (matchedAssessment) return false;
      return !item.hidden_from_captured;
  }).length;
  const scheduledFollowUpItems = todaysFollowUps
    .map((item) => ({
      key: `followup-${item.id}`,
      type: "Follow-up",
      title: item.name || "Candidate",
      subtitle: item.jd_title || item.role || "Untitled role",
      when: item.next_follow_up_at,
      raw: item,
      action: () => void openAttempts(item.id)
    }))
    .sort((a, b) => new Date(a.when) - new Date(b.when))
    .slice(0, 5);
  const scheduledInterviewItems = todaysInterviews
    .map((item) => ({
      key: `interview-${item.id}`,
      type: "Interview",
      title: item.candidateName || "Candidate",
      subtitle: item.jdTitle || "Untitled role",
      when: item.interviewAt,
      raw: item,
      action: () => setAssessmentStatusId(String(item.id || ""))
    }))
    .sort((a, b) => new Date(a.when) - new Date(b.when))
    .slice(0, 5);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BrandLogo size="md" />
        </div>
        <nav className="nav">
          {navSections.map((section) => (
            <div key={section.label} className="nav-section">
              <div className="nav-section__label">{section.label}</div>
              <div className="nav-section__items">
                {section.items.map((item) => (
                  <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-btn${isActive ? " active" : ""}`}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          <div className="nav-standalone">
            {standaloneNavItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-btn${isActive ? " active" : ""}`}>
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="sidebar-footer">
          <div className="muted">{state.user ? `${state.user.name} | ${state.user.role} | ${state.user.companyName || "Company"}` : "Not logged in"}</div>
          <div className="portal-footer">{COMPANY_ATTRIBUTION}</div>
          <button className="ghost-btn" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      <main className="content">
        <header className="workspace-header">
          <div>
            <BrandLogo size="sm" />
            <div className="section-kicker">{state.user?.companyName || "Company Workspace"}</div>
            <h1>{RECRUITER_PORTAL_LABEL}</h1>
          </div>
          <div className="button-row tight">
            <button className="ghost-btn" onClick={() => void refreshWorkspaceNow()}>Refresh</button>
            {statuses.workspace ? <div className={`status inline ${statuses.workspaceKind || ""}`}>{statuses.workspace}</div> : null}
          </div>
        </header>

        <RouteErrorBoundary routeKey={location.pathname}>
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
                    <div className="metric-label">Pending notes</div>
                    <div className="metric-value">{pendingNotes}</div>
                  </div>
                  <div className="metric-card compact-metric">
                    <div className="metric-label">Scheduled interviews</div>
                    <div className="metric-value">{todaysInterviews.length}</div>
                  </div>
                  <div className="metric-card compact-metric">
                    <div className="metric-label">Upcoming joinings</div>
                    <div className="metric-value">{upcomingJoinings.length}</div>
                  </div>
                  <div className="metric-card compact-metric">
                    <div className="metric-label">Pending applicants</div>
                    <div className="metric-value">{pendingAssignments}</div>
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
                              <button onClick={() => void openAttempts(item.id)}>Update</button>
                              <button className="ghost-btn" onClick={() => void completeAgendaFollowUp(item)}>Done</button>
                            </div>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!(scheduledFollowUpItems.length || scheduledInterviewItems.length) && (
                    <div className="agenda-block">
                      <h3>Scheduled follow-ups and interviews</h3>
                      <div className="agenda-split-grid">
                        <div className="agenda-subblock">
                          <h4>Follow-ups</h4>
                          <div className="stack-list compact">
                        {scheduledFollowUpItems.map((item) => (
                          <article key={item.key} className="agenda-item">
                            <div>
                              <span className="agenda-item__type">{item.type}</span>
                              <span className="agenda-item__title">{item.title}</span>
                              <span className="agenda-item__subtitle">{item.subtitle}</span>
                              <span className="agenda-item__time">{new Date(item.when).toLocaleString()}</span>
                            </div>
                            <div className="button-row tight">
                              <button onClick={item.action}>Update</button>
                              <button className="ghost-btn" onClick={() => void completeAgendaFollowUp(item.raw)}>Done</button>
                            </div>
                          </article>
                        ))}
                        {!scheduledFollowUpItems.length ? <div className="empty-state compact-empty">No follow-ups in this range.</div> : null}
                          </div>
                        </div>
                        <div className="agenda-subblock">
                          <h4>Interviews</h4>
                          <div className="stack-list compact">
                        {scheduledInterviewItems.map((item) => (
                          <article key={item.key} className="agenda-item">
                            <div>
                              <span className="agenda-item__type">{item.type}</span>
                              <span className="agenda-item__title">{item.title}</span>
                              <span className="agenda-item__subtitle">{item.subtitle}</span>
                              <span className="agenda-item__time">{new Date(item.when).toLocaleString()}</span>
                            </div>
                            <div className="button-row tight">
                              <button onClick={item.action}>Update</button>
                              <button className="ghost-btn" onClick={() => void completeAgendaInterview(item.raw)}>Done</button>
                            </div>
                          </article>
                        ))}
                        {!scheduledInterviewItems.length ? <div className="empty-state compact-empty">No interviews in this range.</div> : null}
                          </div>
                        </div>
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
                  {!overdueFollowUps.length && !scheduledFollowUpItems.length && !scheduledInterviewItems.length && !upcomingJoinings.length ? (
                    <div className="empty-state">No scheduled follow-ups, interviews, or joinings for this range yet.</div>
                  ) : null}
                </div>
              </Section>
              <Section kicker="Performance" title="Recruitment Dashboard">
                <div className="form-grid three-col">
                  <label><span>Date from</span><input type="date" value={dashboardFilters.dateFrom} onChange={(e) => setDashboardFilters((c) => ({ ...c, dateFrom: e.target.value, quickRange: "custom" }))} /></label>
                  <label><span>Date to</span><input type="date" value={dashboardFilters.dateTo} onChange={(e) => setDashboardFilters((c) => ({ ...c, dateTo: e.target.value, quickRange: "custom" }))} /></label>
                  <label><span>Client</span><select value={dashboardFilters.clientLabel} onChange={(e) => setDashboardFilters((c) => ({ ...c, clientLabel: e.target.value }))}><option value="">All clients</option>{(state.dashboard?.availableClients || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label><span>Recruiter</span><select value={dashboardFilters.recruiterLabel} onChange={(e) => setDashboardFilters((c) => ({ ...c, recruiterLabel: e.target.value }))}><option value="">All recruiters</option>{(state.dashboard?.availableRecruiters || []).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                  <label><span>Quick range</span><select value={dashboardFilters.quickRange} onChange={(e) => applyDashboardQuickRange(e.target.value)}><option value="all">All time</option><option value="last_7_days">Last 7 days</option><option value="this_month">This month</option><option value="custom">Custom</option></select></label>
                  <div className="button-row align-end"><button onClick={() => void applyDashboardFilters()}>Apply</button></div>
                </div>
                <p className="muted">Under Interview Process excludes shortlisted, offered, hold, not responding, dropped, screening reject, interview reject, duplicate, and joined.</p>
                <div className="metric-grid dashboard-metric-grid">
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
                            <p className="muted">{`${group.metrics?.sourced || 0} sourced | ${group.metrics?.applied || 0} applied | ${group.metrics?.converted || 0} shared | ${group.metrics?.under_interview_process || 0} under interview`}</p>
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
                              onClick={() => void openDashboardDrilldown({ title: `${group.label} | ${row.positionLabel}`, metric: "all", groupType: "position", params: { clientLabel: group.label, positionLabel: row.positionLabel } })}
                            >
                              <span className="dashboard-position-chip__title">{row.positionLabel}</span>
                              <span className="dashboard-position-chip__meta">
                              {`${row.metrics?.sourced || 0} sourced | ${row.metrics?.applied || 0} applied | ${row.metrics?.converted || 0} shared | ${row.metrics?.under_interview_process || 0} under interview`}
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
                            <p className="muted">{`${group.metrics?.sourced || 0} sourced | ${group.metrics?.applied || 0} applied | ${group.metrics?.converted || 0} shared | ${group.metrics?.under_interview_process || 0} under interview | ${group.metrics?.shortlisted || 0} shortlisted | ${group.metrics?.offered || 0} offered`}</p>
                            {String(state.user?.role || "").toLowerCase() === "admin" && String(state.user?.name || "").trim() === String(group.label || "").trim() ? (
                              <>
                                <p className="muted">
                                  {`Sourcing: ${group.ownership?.selfSourced || 0} self sourced | ${group.ownership?.adminAssignedSourcing || 0} assigned to team`}
                                </p>
                                <p className="muted">
                                  {`Website apply: ${group.ownership?.websiteApply || 0} | Assigned to team: ${group.ownership?.adminAssignedApplicants || 0}`}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="muted">
                                  {`Sourcing: ${group.ownership?.assignedSourcing || 0} assigned | ${group.ownership?.selfSourced || 0} self sourced`}
                                </p>
                                <p className="muted">
                                  {`Applicants: ${group.ownership?.assignedApplicants || 0} assigned | ${group.ownership?.directApplicants || 0} direct`}
                                </p>
                              </>
                            )}
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
              <Section kicker="Candidate Universe" title="Database">
                <p className="muted">This view can surface captured, applied, and assessment-linked candidates together. Candidates without CV uploads still remain searchable through saved structured fields, recruiter notes, attempts, and assessment data. Hidden CV metadata is used only by search and not shown in the UI.</p>
                <div className="item-card compact-card">
                  <h3>Search mode</h3>
                  <p className="muted">Use Boolean for exact keyword retrieval. Use Smart when you want plain-English converted into deterministic Boolean + filters.</p>
                  <div className="button-row">
                  <button className={candidateAiQueryMode === "boolean" ? "" : "ghost-btn"} onClick={() => setCandidateAiQueryMode("boolean")}>Boolean</button>
                    <button className={candidateAiQueryMode === "natural" ? "" : "ghost-btn"} onClick={() => setCandidateAiQueryMode("natural")}>Smart</button>
                  </div>
                </div>
                {candidateAiQueryMode === "boolean" ? (
                  <div className="toolbar candidate-search-toolbar">
                    <input
                      placeholder='(sales OR "business development") AND saas'
                      value={candidateSearchText}
                      onChange={(e) => setCandidateSearchText(e.target.value)}
                    />
                    <button disabled={candidateSearchBusy} onClick={() => void runCandidateSearch()}>Run Boolean Search</button>
                    <button className="ghost-btn" onClick={() => {
                      setCandidateFilterPanelOpen((current) => !current);
                    }}>{candidateFilterPanelOpen ? "Hide filters" : "Show filters"}</button>
                    <button className="ghost-btn" onClick={() => {
                      setCandidateSearchText("");
                      setCandidateSearchQueryUsed("");
                      setCandidateKeywordMust("");
                      setCandidateKeywordAny("");
                      setCandidateKeywordExclude("");
                      setCandidateQuickChipIds([]);
                      setCandidateSmartDateFrom("");
                      setCandidateSmartDateTo("");
                      setCandidateSearchResults([]);
                      setCandidateSearchMode("all");
                      setCandidatePage(1);
                      setCandidateSearchingAs("");
                      setCandidateStructuredFilters(EMPTY_CANDIDATE_STRUCTURED_FILTERS);
                      setCandidateStructuredFiltersDraft(EMPTY_CANDIDATE_STRUCTURED_FILTERS);
                    }}>Reset search</button>
                  </div>
                ) : null}
                {candidateSearchBusy ? (
                  <div className="muted" style={{ marginTop: 6 }}>Searching candidates...</div>
                ) : null}
                {candidateAiQueryMode === "natural" ? (
                  <div className="item-card compact-card candidate-keyword-builder">
                    <h3>Smart keyword builder</h3>
                    <p className="muted">Use comma separated values. We build a clean Boolean preview before search.</p>
                    <div className="candidate-keyword-grid">
                      <label><span>Must keywords</span><input value={candidateKeywordMust} onChange={(e) => setCandidateKeywordMust(e.target.value)} placeholder=".NET Core, C#, Azure" /></label>
                      <label><span>Any keywords</span><input value={candidateKeywordAny} onChange={(e) => setCandidateKeywordAny(e.target.value)} placeholder="Fintech, lending, finance" /></label>
                      <label><span>Exclude keywords</span><input value={candidateKeywordExclude} onChange={(e) => setCandidateKeywordExclude(e.target.value)} placeholder="sales, recruiter, hr" /></label>
                    </div>
                    <div className="filter-block">
                      <div className="info-label">Quick chips</div>
                      <div className="chip-row">
                        {SMART_SEARCH_QUICK_CHIPS.map((chip) => (
                          <button
                            key={chip.id}
                            className={`chip chip-toggle${candidateQuickChipIds.includes(chip.id) ? " active" : ""}`}
                            onClick={() => setCandidateQuickChipIds((current) => (
                              current.includes(chip.id)
                                ? current.filter((id) => id !== chip.id)
                                : [...current, chip.id]
                            ))}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="form-grid three-col" style={{ marginTop: 8 }}>
                      <label>
                        <span>Chip date from</span>
                        <input
                          type="date"
                          value={candidateSmartDateFrom}
                          onChange={(e) => setCandidateSmartDateFrom(e.target.value)}
                        />
                      </label>
                      <label>
                        <span>Chip date to</span>
                        <input
                          type="date"
                          value={candidateSmartDateTo}
                          onChange={(e) => setCandidateSmartDateTo(e.target.value)}
                        />
                      </label>
                    </div>
                    {candidateKeywordPreview ? (
                      <div className="muted">Query preview: <code>{candidateKeywordPreview}</code></div>
                    ) : (
                      <div className="muted">Add keywords to generate Boolean preview.</div>
                    )}
                  </div>
                ) : null}
                {candidateAiQueryMode === "natural" ? (
                  <div className="toolbar candidate-search-toolbar">
                    <button disabled={candidateSearchBusy} onClick={() => void runCandidateSearch()}>Run Smart Search</button>
                    <button className="ghost-btn" onClick={() => {
                      setCandidateFilterPanelOpen((current) => !current);
                    }}>{candidateFilterPanelOpen ? "Hide filters" : "Show filters"}</button>
                    <button className="ghost-btn" onClick={() => {
                      setCandidateSearchText("");
                      setCandidateSearchQueryUsed("");
                      setCandidateKeywordMust("");
                      setCandidateKeywordAny("");
                      setCandidateKeywordExclude("");
                      setCandidateQuickChipIds([]);
                      setCandidateSmartDateFrom("");
                      setCandidateSmartDateTo("");
                      setCandidateSearchResults([]);
                      setCandidateSearchMode("all");
                      setCandidatePage(1);
                      setCandidateSearchingAs("");
                      setCandidateStructuredFilters(EMPTY_CANDIDATE_STRUCTURED_FILTERS);
                      setCandidateStructuredFiltersDraft(EMPTY_CANDIDATE_STRUCTURED_FILTERS);
                    }}>Reset search</button>
                  </div>
                ) : null}
                {candidateAiQueryMode === "natural" && candidateSearchingAs ? (
                  <div className="muted" style={{ marginTop: 8 }}>
                    Searching as: <code>{candidateSearchingAs}</code>
                  </div>
                ) : null}
                {candidateHasSmartChipSelection ? (
                  <div className="stack-list" style={{ marginTop: 10 }}>
                    {SMART_SEARCH_QUICK_CHIPS
                      .filter((chip) => candidateQuickChipIds.includes(chip.id))
                      .map((chip) => {
                        const rows = candidateSmartChipRows[chip.id] || [];
                        return (
                          <article key={chip.id} className="item-card compact-card">
                            <h3>{chip.label} ({rows.length})</h3>
                            {!rows.length ? (
                              <div className="empty-state">No candidates found for this chip and filters.</div>
                            ) : (
                              <div className="table-wrap" style={{ marginTop: 8 }}>
                                <table>
                                  <thead>
                                    <tr>
                                      <th>Candidate</th>
                                      <th>Round / Status</th>
                                      <th>Date</th>
                                      <th>Client</th>
                                      <th>Role</th>
                                      <th>Current CTC</th>
                                      <th>Expected CTC</th>
                                      <th>Notice</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row, index) => (
                                      <tr key={`${chip.id}-${row.item?.id || row.item?.assessmentId || row.candidateName}-${index}`}>
                                        <td>
                                          <button
                                            className="linkish"
                                            onClick={() => void openCandidateFromSearch(row.item)}
                                          >
                                            {row.candidateName}
                                          </button>
                                        </td>
                                        <td>{row.round || row.status || "-"}</td>
                                        <td>{row.date ? formatDateForCopy(row.date) : "-"}</td>
                                        <td>{row.client || "-"}</td>
                                        <td>{row.role || "-"}</td>
                                        <td>{row.currentCtc || "-"}</td>
                                        <td>{row.expectedCtc || "-"}</td>
                                        <td>{row.notice || "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </article>
                        );
                      })}
                  </div>
                ) : null}
                {candidateFilterPanelOpen ? renderCandidateFilterPanel() : null}
                <div className="button-row">
                  <label className="copy-preset-control">
                    <span>Copy preset</span>
                    <select value={activeCopyPresetId} onChange={(e) => setActiveCopyPresetId(e.target.value)}>
                      {exportPresetOptions.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select>
                  </label>
                  <button onClick={() => void copyCandidatesExcel()}>Copy Excel</button>
                  <button onClick={() => void copyCandidatesWhatsapp()}>Copy WhatsApp</button>
                  <button onClick={() => void copyCandidatesEmail()}>Copy Email</button>
                  <button className="ghost-btn" onClick={() => downloadCandidatesExcel()}>Download results</button>
                </div>
                {!candidateHasSmartChipSelection ? (
                  <>
                    <div className="stack-list">
                      {!pagedCandidates.length ? <div className="empty-state">No candidates found for this view.</div> : pagedCandidates.map((item) => (
                        <article className="item-card compact-card" key={item.id || item.assessmentId}>
                          <div className="item-card__top">
                            <div>
                              <h3>{item.name || item.candidateName || "Candidate"} | {item.role || item.currentDesignation || item.jdTitle || "Untitled role"}</h3>
                              <p className="muted">{[item.company || item.currentCompany || "", item.location || "", item.ownerRecruiter ? `Recruiter: ${item.ownerRecruiter}` : "", item.source ? `Source: ${item.source}` : ""].filter(Boolean).join(" | ")}</p>
                              <div className="candidate-snippet">{[item.experience || item.totalExperience || "", item.current_ctc || item.currentCtc ? `Current CTC: ${item.current_ctc || item.currentCtc}` : "", item.expected_ctc || item.expectedCtc ? `Expected CTC: ${item.expected_ctc || item.expectedCtc}` : "", item.notice_period || item.noticePeriod ? `Notice: ${item.notice_period || item.noticePeriod}` : ""].filter(Boolean).join("\n")}</div>
                              {buildVisibleTagList(item).length ? (
                                <div className="chip-row">
                                  {buildVisibleTagList(item).slice(0, 8).map((tag) => <span key={tag} className="chip">{tag}</span>)}
                                </div>
                              ) : null}
                              <div className="button-row">
                                <button onClick={() => setDatabaseProfileItem(item)}>Open profile</button>
                                {candidateHasStoredCv(item) ? <button className="ghost-btn" onClick={() => openDatabaseCandidateCv(item)}>Open CV</button> : null}
                              </div>
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
                  </>
                ) : null}
              </Section>
            </div>
          } />

          <Route path="/applicants" element={
            <Section kicker="Admin Inbox" title="Applied Candidates">
              {statuses.applicants ? <div className={`status ${statuses.applicantsKind || ""}`}>{statuses.applicants}</div> : null}
              <div className="form-grid three-col">
                <label className="full"><span>Search</span><input placeholder="Search by candidate, phone, email, JD..." value={applicantFilters.q} onChange={(e) => setApplicantFilters((current) => ({ ...current, q: e.target.value }))} /></label>
              </div>
              <div className="metric-grid metric-grid--tight">
                <div className="metric-card compact-metric"><div className="metric-label">Applied today</div><div className="metric-value">{applicantStats.today}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">{String(state.user?.role || "").toLowerCase() === "admin" ? "Owner (unassigned inbox)" : "Owned (direct inbox)"}</div><div className="metric-value">{applicantStats.ownedDirect || 0}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Assigned (manual)</div><div className="metric-value">{applicantStats.assignedManual || 0}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Active</div><div className="metric-value">{applicantStats.active}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Converted</div><div className="metric-value">{applicantStats.converted}</div></div>
              </div>
              <div className="form-grid three-col" style={{ marginTop: 10 }}>
                <label><span>Date from</span><input type="date" value={applicantFilters.dateFrom} onChange={(e) => setApplicantFilters((current) => ({ ...current, dateFrom: e.target.value }))} /></label>
                <label><span>Date to</span><input type="date" value={applicantFilters.dateTo} onChange={(e) => setApplicantFilters((current) => ({ ...current, dateTo: e.target.value }))} /></label>
              </div>
              <div className="muted" style={{ marginTop: 8 }}>
                Inactive: {applicantStats.inactive || 0} (hidden). Total: {applicantStats.total || 0}
              </div>
              <p className="muted">For admin: Owner means inbound applicants not assigned to anyone yet. Assigned (manual) means admin assigned them to a recruiter. For recruiters: Owned means it landed directly in your inbox via your apply link.</p>
              <div className="captured-filter-grid">
                <MultiSelectDropdown label="Clients" options={applicantOptions.clients} selected={applicantFilters.clients} onToggle={(value) => setApplicantFilters((current) => ({ ...current, clients: value === "__all__" ? [] : current.clients.includes(value) ? current.clients.filter((item) => item !== value) : [...current.clients, value] }))} />
                <MultiSelectDropdown label="JD / Role" options={applicantOptions.jds} selected={applicantFilters.jds} onToggle={(value) => setApplicantFilters((current) => ({ ...current, jds: value === "__all__" ? [] : current.jds.includes(value) ? current.jds.filter((item) => item !== value) : [...current.jds, value] }))} />
                {String(state.user?.role || "").toLowerCase() === "admin" ? <MultiSelectDropdown label="Owned by" options={applicantOptions.ownedBy} selected={applicantFilters.ownedBy} onToggle={(value) => setApplicantFilters((current) => ({ ...current, ownedBy: value === "__all__" ? [] : current.ownedBy.includes(value) ? current.ownedBy.filter((item) => item !== value) : [...current.ownedBy, value] }))} /> : null}
                {String(state.user?.role || "").toLowerCase() === "admin" ? <MultiSelectDropdown label="Assigned to" options={applicantOptions.assignedTo} selected={applicantFilters.assignedTo} onToggle={(value) => setApplicantFilters((current) => ({ ...current, assignedTo: value === "__all__" ? [] : current.assignedTo.includes(value) ? current.assignedTo.filter((item) => item !== value) : [...current.assignedTo, value] }))} /> : null}
                <MultiSelectDropdown label="Outcome" options={applicantOptions.outcomes} selected={applicantFilters.outcomes} onToggle={(value) => setApplicantFilters((current) => ({ ...current, outcomes: value === "__all__" ? [] : current.outcomes.includes(value) ? current.outcomes.filter((item) => item !== value) : [...current.outcomes, value] }))} />
                <MultiSelectDropdown label="State" options={applicantOptions.activeStates} selected={applicantFilters.activeStates} allowAll={false} emptySummary="Active only" onToggle={(value) => setApplicantFilters((current) => ({ ...current, activeStates: current.activeStates.includes(value) ? current.activeStates.filter((item) => item !== value) : [...current.activeStates, value] }))} />
              </div>
              <div className="button-row">
                <label className="copy-preset-control">
                  <span>Copy preset</span>
                  <select value={activeCopyPresetId} onChange={(e) => setActiveCopyPresetId(e.target.value)}>
                    {exportPresetOptions.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                  </select>
                </label>
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
                      {!item.hidden_from_captured ? (
                        <button onClick={() => loadApplicantIntoInterview(item.id)}>Open draft</button>
                      ) : null}
	                            <button onClick={() => openRecruiterNotes(item)}>Recruiter note</button>
                      <button onClick={() => void openAttempts(item.id)}>Attempts</button>
                      {!item.hidden_from_captured ? (
                        <button className="ghost-btn" onClick={() => openJdEmailModalForCandidate(item, item.jdId || "")}>Email JD</button>
                      ) : null}
                      {!item.hidden_from_captured ? (
                        <button onClick={() => void createAssessmentFromCandidate(item.id)}>Create assessment</button>
                      ) : null}
                      {item.cvFilename ? <button onClick={() => void openCv(item.id)}>Open CV</button> : null}
                      {state.user?.role === "admin" ? <button onClick={() => setAssignApplicantId(item.id)}>{item.assignedToName ? "Reassign" : "Assign"}</button> : null}
                      {item.hidden_from_captured ? (
                        <button className="ghost-btn" onClick={() => void restoreApplicant(item.id)}>Restore to active</button>
                      ) : (
                        <button className="ghost-btn" onClick={() => void hideApplicant(item.id)}>Hide from list</button>
                      )}
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
              </div>
              <div className="metric-grid metric-grid--tight">
                <div className="metric-card compact-metric"><div className="metric-label">Today</div><div className="metric-value">{capturedNotesStats.today}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Total notes captured</div><div className="metric-value">{capturedNotesStats.total}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Active</div><div className="metric-value">{capturedNotesStats.active}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Converted</div><div className="metric-value">{capturedNotesStats.converted}</div></div>
              </div>
              <div className="form-grid three-col" style={{ marginTop: 10 }}>
                <label><span>Date from</span><input type="date" value={candidateFilters.dateFrom} onChange={(e) => setCandidateFilters((c) => ({ ...c, dateFrom: e.target.value }))} /></label>
                <label><span>Date to</span><input type="date" value={candidateFilters.dateTo} onChange={(e) => setCandidateFilters((c) => ({ ...c, dateTo: e.target.value }))} /></label>
              </div>
                <div className="captured-filter-grid">
                  <MultiSelectDropdown label="Clients" options={capturedCandidateOptions.clients} selected={candidateFilters.clients} onToggle={(value) => setCandidateFilters((current) => ({ ...current, clients: value === "__all__" ? [] : current.clients.includes(value) ? current.clients.filter((item) => item !== value) : [...current.clients, value] }))} />
                  <MultiSelectDropdown label="JD / Role" options={capturedCandidateOptions.jds} selected={candidateFilters.jds} onToggle={(value) => setCandidateFilters((current) => ({ ...current, jds: value === "__all__" ? [] : current.jds.includes(value) ? current.jds.filter((item) => item !== value) : [...current.jds, value] }))} />
                  {String(state.user?.role || "").toLowerCase() === "admin" ? <MultiSelectDropdown label="Assigned to" options={capturedCandidateOptions.assignedTo} selected={candidateFilters.assignedTo} onToggle={(value) => setCandidateFilters((current) => ({ ...current, assignedTo: value === "__all__" ? [] : current.assignedTo.includes(value) ? current.assignedTo.filter((item) => item !== value) : [...current.assignedTo, value] }))} /> : null}
                  <MultiSelectDropdown label="Captured by" options={capturedCandidateOptions.capturedBy} selected={candidateFilters.capturedBy} onToggle={(value) => setCandidateFilters((current) => ({ ...current, capturedBy: value === "__all__" ? [] : current.capturedBy.includes(value) ? current.capturedBy.filter((item) => item !== value) : [...current.capturedBy, value] }))} />
                  <MultiSelectDropdown label="Sources" options={capturedCandidateOptions.sources} selected={candidateFilters.sources} onToggle={(value) => setCandidateFilters((current) => ({ ...current, sources: value === "__all__" ? [] : current.sources.includes(value) ? current.sources.filter((item) => item !== value) : [...current.sources, value] }))} />
                  <MultiSelectDropdown label="Outcome" options={capturedCandidateOptions.outcomes} selected={candidateFilters.outcomes} onToggle={(value) => setCandidateFilters((current) => ({ ...current, outcomes: value === "__all__" ? [] : current.outcomes.includes(value) ? current.outcomes.filter((item) => item !== value) : [...current.outcomes, value] }))} />
                  <MultiSelectDropdown label="State" options={capturedCandidateOptions.activeStates} selected={candidateFilters.activeStates} allowAll={false} emptySummary="Active only" onToggle={(value) => setCandidateFilters((current) => ({ ...current, activeStates: current.activeStates.includes(value) ? current.activeStates.filter((item) => item !== value) : [...current.activeStates, value] }))} />
                </div>
                <div className="button-row">
                  <label className="copy-preset-control">
                    <span>Copy preset</span>
                    <select value={activeCopyPresetId} onChange={(e) => setActiveCopyPresetId(e.target.value)}>
                      {exportPresetOptions.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                    </select>
                  </label>
                  <button onClick={() => void copyCapturedExcel()}>Copy Excel</button>
                  <button onClick={() => void copyCapturedWhatsapp()}>Copy WhatsApp</button>
                  <button onClick={() => void copyCapturedEmail()}>Copy Email</button>
                </div>
                <div className="stack-list">
                {!capturedCandidates.length ? <div className="empty-state">No captured notes or recruiter-owned candidates yet.</div> : capturedCandidates.map((item) => {
                  const matchedAssessment = resolveCapturedAssessment(item);
                  const statusState = normalizedAssessmentState(matchedAssessment, item);
                  const latestAttemptLine = extractLatestAttemptLine(item.last_contact_notes || "");
                  const latestAttemptRemarks = extractAttemptRemarks(latestAttemptLine);
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
                      {item.last_contact_outcome || latestAttemptRemarks ? (
                        <div className="status-line" style={{ justifyContent: "flex-end", textAlign: "right" }}>
                          {[item.last_contact_outcome ? `Status: ${item.last_contact_outcome}` : "", latestAttemptRemarks ? `Remarks: ${latestAttemptRemarks}` : ""].filter(Boolean).join(" | ")}
                        </div>
                      ) : null}
                      <div className="button-row">
                        {!item.hidden_from_captured ? (
                          <button onClick={() => loadCandidateIntoInterview(item.id)}>Open draft</button>
                        ) : null}
                        <button onClick={() => setAssignCandidateId(item.id)}>{item.assigned_to_name ? "Reassign" : "Assign"}</button>
	                      <button onClick={() => openRecruiterNotes(item)}>Recruiter note</button>
                        <button onClick={() => void openAttempts(item.id)}>Attempts</button>
                        {!item.hidden_from_captured ? (
                          <button className="ghost-btn" onClick={() => openJdEmailModalForCandidate(item)}>Email JD</button>
                        ) : null}
                        {!item.hidden_from_captured ? (
                          <button onClick={() => void createAssessmentFromCandidate(item.id)}>Create assessment</button>
                        ) : null}
                        {item.hidden_from_captured ? (
                          <button className="ghost-btn" onClick={() => void restoreCapturedCandidate(item.id)}>Restore to active</button>
                        ) : (
                          <button className="ghost-btn" onClick={() => void hideCapturedCandidate(item.id)}>Hide from list</button>
                        )}
                        <button className="ghost-btn" onClick={() => void deleteCapturedCandidate(item.id).catch((error) => setStatus("captured", String(error?.message || error), "error"))}>Delete</button>
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
              </div>
              <div className="metric-grid metric-grid--tight">
                <div className="metric-card compact-metric"><div className="metric-label">Today</div><div className="metric-value">{assessmentStats.today}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Total assessments</div><div className="metric-value">{assessmentStats.total}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Active</div><div className="metric-value">{assessmentStats.active}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Archived</div><div className="metric-value">{assessmentStats.archived}</div></div>
              </div>
              <div className="form-grid three-col" style={{ marginTop: 10 }}>
                <label><span>Date from</span><input type="date" value={assessmentFilters.dateFrom} onChange={(e) => setAssessmentFilters((current) => ({ ...current, dateFrom: e.target.value }))} /></label>
                <label><span>Date to</span><input type="date" value={assessmentFilters.dateTo} onChange={(e) => setAssessmentFilters((current) => ({ ...current, dateTo: e.target.value }))} /></label>
                <label>
                  <span>State</span>
                  <select value={assessmentLane} onChange={(e) => setAssessmentLane(e.target.value)}>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>
              <div className="captured-filter-grid">
                <MultiSelectDropdown label="Clients" options={assessmentOptions.clients} selected={assessmentFilters.clients} onToggle={(value) => setAssessmentFilters((current) => ({ ...current, clients: value === "__all__" ? [] : current.clients.includes(value) ? current.clients.filter((item) => item !== value) : [...current.clients, value] }))} />
                <MultiSelectDropdown label="JD / Role" options={assessmentOptions.jds} selected={assessmentFilters.jds} onToggle={(value) => setAssessmentFilters((current) => ({ ...current, jds: value === "__all__" ? [] : current.jds.includes(value) ? current.jds.filter((item) => item !== value) : [...current.jds, value] }))} />
                <MultiSelectDropdown label="Recruiters" options={assessmentOptions.recruiters} selected={assessmentFilters.recruiters} onToggle={(value) => setAssessmentFilters((current) => ({ ...current, recruiters: value === "__all__" ? [] : current.recruiters.includes(value) ? current.recruiters.filter((item) => item !== value) : [...current.recruiters, value] }))} />
                <MultiSelectDropdown label="Outcome" options={assessmentOptions.outcomes} selected={assessmentFilters.outcomes} onToggle={(value) => setAssessmentFilters((current) => ({ ...current, outcomes: value === "__all__" ? [] : current.outcomes.includes(value) ? current.outcomes.filter((item) => item !== value) : [...current.outcomes, value] }))} />
              </div>
              <div className="button-row">
                <label className="copy-preset-control">
                  <span>Copy preset</span>
                  <select value={activeCopyPresetId} onChange={(e) => setActiveCopyPresetId(e.target.value)}>
                    {exportPresetOptions.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                  </select>
                </label>
                <button onClick={() => void copyAssessmentsExcel()}>Copy Excel</button>
                <button onClick={() => void copyAssessmentsWhatsapp()}>Copy WhatsApp</button>
                <button onClick={() => void copyAssessmentsEmail()}>Copy Email</button>
                <button className="ghost-btn" onClick={() => downloadAssessmentEventXlsx("interviews_done")}>Download interviews done</button>
                <button className="ghost-btn" onClick={() => downloadAssessmentEventXlsx("interviews_aligned")}>Download interviews aligned</button>
                <button className="ghost-btn" onClick={() => downloadAssessmentEventXlsx("offered")}>Download offered</button>
              </div>
              <div className="muted" style={{ marginTop: 6 }}>
                Export interview done, interview aligned, or offered lists using the current date filters.
              </div>
              <div className="status-note">Selected for client share: {selectedAssessmentIds.length}</div>
              <div className="stack-list">
                {!filteredAssessments.length ? <div className="empty-state">No assessments saved yet.</div> : filteredAssessments.map((item) => (
                  <article className={`item-card compact-card assessment-card ${selectedAssessmentIds.includes(String(item.id)) ? "selected-card" : ""}`} key={item.id}>
                    {(() => {
                      const latestStatusPreview = getLatestAssessmentStatusPreview(item);
                      const isArchived = isAssessmentArchived(item);
                      return (
                        <>
                    <div className="assessment-select-row">
                      {assessmentLane === "active" && !isArchived ? (
                        <label className="checkbox-pill">
                          <input type="checkbox" checked={selectedAssessmentIds.includes(String(item.id))} onChange={() => toggleAssessmentSelection(item.id)} />
                          <span>Select for client share</span>
                        </label>
                      ) : (
                        <span className="muted">Archived</span>
                      )}
                    </div>
                    <div className="item-card__top">
                      <div>
                        <h3>{item.candidateName || "Candidate"} | {item.jdTitle || "Untitled role"}</h3>
                        {(() => {
                          const linkedCandidate = assessmentLinkedCandidateMap.get(String(item.id || "")) || null;
                          const assignedTo = String(linkedCandidate?.assigned_to_name || linkedCandidate?.assignedToName || "").trim();
                          const ownerName = String(linkedCandidate?.recruiter_name || linkedCandidate?.recruiterName || item.recruiterName || "").trim();
                          const recruiterLabel = assignedTo ? `Assigned to: ${assignedTo}` : ownerName ? `Owner: ${ownerName}` : "";
                          return (
                            <p className="muted">
                              {[item.pipelineStage || "", normalizeAssessmentStatusLabel(item.candidateStatus) || "", recruiterLabel].filter(Boolean).join(" | ")}
                            </p>
                          );
                        })()}
                        <div className="status-note">
                          {[
                            item.currentCompany || "",
                            item.interviewAt ? `Interview ${new Date(item.interviewAt).toLocaleString()}` : "",
                            item.updatedAt ? `Updated ${new Date(item.updatedAt).toLocaleString()}` : ""
                          ].filter(Boolean).join(" | ")}
                        </div>
                        {(latestStatusPreview.status || latestStatusPreview.remarks) ? (
                          <div className="feedback-preview">
                            <div className="feedback-preview__label">Latest saved update</div>
                            {latestStatusPreview.status ? <div>{`Status: ${latestStatusPreview.status}`}</div> : null}
                            {latestStatusPreview.remarks ? <div>{`Remarks: ${latestStatusPreview.remarks}`}</div> : null}
                            {latestStatusPreview.at ? <div className="muted">{new Date(latestStatusPreview.at).toLocaleString()}</div> : null}
                          </div>
                        ) : null}
                        {item.clientFeedback ? (
                          <div className="feedback-preview">
                            <div className="feedback-preview__label">Client feedback</div>
                            <div>{item.clientFeedback}</div>
                            <div className="muted">{[item.clientFeedbackStatus ? `Status: ${item.clientFeedbackStatus}` : "", item.clientFeedbackUpdatedBy || "", item.clientFeedbackUpdatedAt ? new Date(item.clientFeedbackUpdatedAt).toLocaleString() : ""].filter(Boolean).join(" | ")}</div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="button-row">
                      {assessmentLane === "active" && !isArchived ? (
                        <>
                          <button onClick={() => { closeAssessmentMoreMenu(); openSavedAssessment(item); }}>Edit assessment</button>
                          <button onClick={() => { closeAssessmentMoreMenu(); setAssessmentStatusId(item.id); }}>Update status</button>
                          <button onClick={() => { closeAssessmentMoreMenu(); void openAssessmentJourney(item); }}>Journey</button>
                          <button onClick={() => { closeAssessmentMoreMenu(); void openAssessmentCandidateCardModal(item); }}>Candidate card</button>
                          <button onClick={() => { closeAssessmentMoreMenu(); openAssessmentWhatsapp(item); }}>WhatsApp</button>
                          <div
                            className={`more-menu ${openAssessmentMoreId === String(item.id) ? "more-menu--open" : ""}`}
                            ref={(node) => {
                              if (openAssessmentMoreId === String(item.id)) assessmentMoreMenuRef.current = node;
                            }}
                          >
                            <button
                              type="button"
                              className="ghost-btn more-menu__trigger"
                              onClick={() => setOpenAssessmentMoreId((current) => (current === String(item.id) ? "" : String(item.id)))}
                            >
                              More <span className="muted">⋯</span>
                            </button>
                            {openAssessmentMoreId === String(item.id) ? (
                              <div className="more-menu__dropdown more-menu__dropdown--inline" role="menu">
                                <button type="button" className="more-menu__item" onClick={() => { closeAssessmentMoreMenu(); void moveAssessmentBackToCaptured(item); }}>Move back to captured</button>
                                <button type="button" className="more-menu__item" onClick={() => { closeAssessmentMoreMenu(); void setAssessmentArchivedState(item, true); }}>Hide</button>
                                <button type="button" className="more-menu__item" onClick={() => { closeAssessmentMoreMenu(); reuseAssessmentAsNew(item); }}>Reuse as new</button>
                                <button type="button" className="more-menu__item more-menu__danger" onClick={() => { closeAssessmentMoreMenu(); void deleteAssessmentItem(item); }}>Delete</button>
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { closeAssessmentMoreMenu(); void setAssessmentArchivedState(item, false); }}>Restore</button>
                          <button onClick={() => { closeAssessmentMoreMenu(); void openAssessmentCandidateCardModal(item); }}>Candidate card</button>
                          <div
                            className={`more-menu ${openAssessmentMoreId === String(item.id) ? "more-menu--open" : ""}`}
                            ref={(node) => {
                              if (openAssessmentMoreId === String(item.id)) assessmentMoreMenuRef.current = node;
                            }}
                          >
                            <button
                              type="button"
                              className="ghost-btn more-menu__trigger"
                              onClick={() => setOpenAssessmentMoreId((current) => (current === String(item.id) ? "" : String(item.id)))}
                            >
                              More <span className="muted">⋯</span>
                            </button>
                            {openAssessmentMoreId === String(item.id) ? (
                              <div className="more-menu__dropdown more-menu__dropdown--inline" role="menu">
                                <button type="button" className="more-menu__item" onClick={() => { closeAssessmentMoreMenu(); reuseAssessmentAsNew(item); }}>Reuse as new</button>
                                <button type="button" className="more-menu__item more-menu__danger" onClick={() => { closeAssessmentMoreMenu(); void deleteAssessmentItem(item); }}>Delete</button>
                              </div>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                        </>
                      );
                    })()}
                  </article>
                ))}
              </div>
            </Section>
          } />

          <Route path="/quick-update" element={
            <div className="page-grid">
              <Section kicker="Fast Lane" title="Quick Update">
                <p className="muted">Use this for already saved candidates when details change later. Pick the candidate once, then either merge recruiter details or apply a quick status/timeline update.</p>
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
                      <div className="full form-field">
                        <span>Status update</span>
                        <div className="form-grid three-col nested-status-grid">
                          {quickUpdateLinkedAssessment ? (
                            <label>
                              <span>Assessment status</span>
                              <select value={quickUpdateAssessmentStatus} onChange={(e) => setQuickUpdateAssessmentStatus(e.target.value)}>
                                <option value="">Select status</option>
                                {DEFAULT_STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </label>
                          ) : (
                            <label>
                              <span>Attempt outcome</span>
                              <select value={quickUpdateAttemptOutcome} onChange={(e) => setQuickUpdateAttemptOutcome(e.target.value)}>
                                <option value="">Select outcome</option>
                                {ATTEMPT_OUTCOME_OPTIONS.filter((option) => option !== "No outcome").map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </label>
                          )}
                          {quickUpdateLinkedAssessment && quickUpdateAssessmentStatus === "Offered" ? (
                            <label>
                              <span>Offer amount</span>
                              <input value={quickUpdateOfferAmount} onChange={(e) => setQuickUpdateOfferAmount(e.target.value)} placeholder="25 LPA" />
                            </label>
                          ) : null}
                          {quickUpdateLinkedAssessment && (quickUpdateAssessmentStatus === "Offered" || quickUpdateAssessmentStatus === "Joined" || isInterviewAlignedStatus(quickUpdateAssessmentStatus)) ? (
                            <label>
                              <span>{quickUpdateAssessmentStatus === "Offered" ? "Expected DOJ" : quickUpdateAssessmentStatus === "Joined" ? "Date of joining" : "Interview / status date"}</span>
                              <input type="datetime-local" value={quickUpdateStatusAt} onChange={(e) => setQuickUpdateStatusAt(e.target.value)} />
                            </label>
                          ) : null}
                          {!quickUpdateLinkedAssessment && quickUpdateAttemptOutcome === "Call later" ? (
                            <label>
                              <span>Next follow-up</span>
                              <input type="datetime-local" value={quickUpdateStatusAt} onChange={(e) => setQuickUpdateStatusAt(e.target.value)} />
                            </label>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <p className="muted">
                      {quickUpdateLinkedAssessment
                        ? "This candidate is already in Assessments. Use the fixed recruiter-note boxes for detail changes, then pick the assessment status/date from the dropdown controls."
                        : "For captured or applied candidates, use the fixed recruiter-note boxes for detail changes, then pick the attempt outcome/follow-up date from the dropdown controls."}
                    </p>
                    <div className="button-row">
                      {quickUpdateLinkedAssessment ? (
                        <>
                          <button onClick={() => void applyQuickUpdateAssessmentDetails()}>Update Assessment details</button>
                          <button onClick={() => void applyQuickAssessmentStatusUpdate()}>Update status</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => void applyQuickUpdateRecruiterNote()}>Update Captured notes</button>
                          <button onClick={() => void applyQuickCandidateUpdate()}>Update status</button>
                        </>
                      )}
                    </div>
                    {statuses.quickUpdate ? <div className={`status action-status ${statuses.quickUpdateKind || ""}`}>{statuses.quickUpdate}</div> : null}
                  </>
                )}
              </Section>
            </div>
          } />

          <Route path="/client-share" element={
            <div className="page-grid">
              <Section kicker="Client Submission" title="Direct Share with Client">
                <p className="muted">Prepare a clean email draft for the client using selected assessments only. Select profiles in the Assessments tab first, choose the client preset here, then copy this draft into your email client.</p>
                {statuses.clientShare ? <div className={`status ${statuses.clientShareKind || ""}`}>{statuses.clientShare}</div> : null}
                <div className="form-grid two-col">
                  <label>
                    <span>Selected profiles</span>
                    <input value={`${selectedAssessmentRows.length} assessment profile(s)`} readOnly />
                  </label>
                  <label>
                    <span>Client share preset</span>
                    <select value={clientShareDraft.presetId} onChange={(e) => setClientShareDraft((current) => ({ ...current, presetId: e.target.value }))}>
                      {exportPresetOptions.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                      ))}
                    </select>
                    <span className="field-help">Admin defines these presets; recruiters can choose the right client format for this share.</span>
                  </label>
                  <label><span>HR name</span><input value={clientShareDraft.hrName} onChange={(e) => setClientShareDraft((current) => ({ ...current, hrName: e.target.value }))} placeholder="Attentive HR Team" /></label>
                  <label><span>Recruiter name</span><input value={clientShareDraft.recruiterName} onChange={(e) => setClientShareDraft((current) => ({ ...current, recruiterName: e.target.value }))} placeholder={state.user?.name || "Ankit Garg"} /></label>
                  <label><span>Recipient email</span><input type="email" value={clientShareDraft.recipientEmail} onChange={(e) => setClientShareDraft((current) => ({ ...current, recipientEmail: e.target.value }))} placeholder="hr@client.com" /></label>
                  <label><span>Email subject</span><input value={clientShareDraft.emailSubject} onChange={(e) => setClientShareDraft((current) => ({ ...current, emailSubject: e.target.value }))} placeholder={getClientShareEmailSubject()} /></label>
                  <label><span>Client</span><input value={clientShareDraft.clientLabel} onChange={(e) => setClientShareDraft((current) => ({ ...current, clientLabel: e.target.value }))} placeholder="Attentive" /></label>
                  <label><span>Role / requirement</span><input value={clientShareDraft.targetRole} onChange={(e) => setClientShareDraft((current) => ({ ...current, targetRole: e.target.value }))} placeholder="AE / Account Executive" /></label>
                  <label className="full">
                    <span>Email intro</span>
                    <textarea value={clientShareDraft.introText || ""} onChange={(e) => setClientShareDraft((current) => ({ ...current, introText: e.target.value }))} placeholder={getClientShareIntroText()} />
                    <span className="field-help">Default intro to be set by Admin.</span>
                  </label>
                  <label className="full">
                    <span>Selected preset columns</span>
                    <textarea value={(copySettings.customExportPresets || []).find((preset) => String(preset.id) === String(clientShareDraft.presetId))?.columns || copySettings.exportPresetColumns?.[clientShareDraft.presetId] || DEFAULT_COPY_SETTINGS.exportPresetColumns?.[clientShareDraft.presetId] || ""} readOnly />
                  </label>
                  <label className="full"><span>Extra message</span><textarea value={clientShareDraft.extraMessage} onChange={(e) => setClientShareDraft((current) => ({ ...current, extraMessage: e.target.value }))} placeholder="Optional note for the client." /></label>
                  <label className="full">
                    <span>Signature text</span>
                    <textarea value={clientShareDraft.signatureText || ""} onChange={(e) => setClientShareDraft((current) => ({ ...current, signatureText: e.target.value }))} placeholder={fillClientShareTemplate(copySettings.clientShareSignatureText || DEFAULT_COPY_SETTINGS.clientShareSignatureText, getClientShareContext())} />
                    <span className="field-help">Normal text only. Font will be similar to the mail body.</span>
                  </label>
                  <label><span>Signature link 1 text</span><input value={clientShareDraft.signatureLinkLabel || ""} onChange={(e) => setClientShareDraft((current) => ({ ...current, signatureLinkLabel: e.target.value }))} placeholder="Kompatible Minds" /></label>
                  <label><span>Signature link 1 URL</span><input value={clientShareDraft.signatureLinkUrl || ""} onChange={(e) => setClientShareDraft((current) => ({ ...current, signatureLinkUrl: e.target.value }))} placeholder="https://kompatibleminds.com" /></label>
                  <label><span>Signature link 2 text</span><input value={clientShareDraft.signatureLinkLabel2 || ""} onChange={(e) => setClientShareDraft((current) => ({ ...current, signatureLinkLabel2: e.target.value }))} placeholder="LinkedIn" /></label>
                  <label><span>Signature link 2 URL</span><input value={clientShareDraft.signatureLinkUrl2 || ""} onChange={(e) => setClientShareDraft((current) => ({ ...current, signatureLinkUrl2: e.target.value }))} placeholder="https://www.linkedin.com/in/..." /></label>
                  <label className="full">
                    <span>Email preview</span>
                    <div className="client-share-preview" dangerouslySetInnerHTML={{ __html: buildClientShareHtml() }} />
                  </label>
                </div>
                {!selectedAssessmentRows.length ? <div className="empty-state">No assessment selected yet. Go to Assessments and tick `Select for client share` on the profiles you want to send.</div> : null}
                <p className="muted">Current flow: copy the email draft from here, then paste it into Zoho/Gmail/Outlook and attach CVs manually.</p>
                <div className="button-row">
                  <button onClick={() => void copyClientShareEmailDraft()}>Copy email draft</button>
                  <button onClick={() => void sendClientShareEmail()}>Send email</button>
                  <button className="ghost-btn" onClick={() => void copyClientShareTracker()}>Copy tracker only</button>
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
                  {[["Candidate", interviewForm.candidateName],["Phone", interviewForm.phoneNumber],["Email", interviewForm.emailId],["LinkedIn", interviewForm.linkedin],["Location", interviewForm.location],["Gender", interviewForm.gender],["Current company", interviewForm.currentCompany],["Current designation", interviewForm.currentDesignation],["Total experience", interviewForm.totalExperience],["Relevant experience", interviewForm.relevantExperience],["Qualification", interviewForm.highestEducation],["Client", interviewForm.clientName],["JD / role", interviewForm.jdTitle],["Tags", interviewForm.tags]].map(([label, value]) => (
                    <div className="info-card" key={label}>
                      <div className="info-label">{label}</div>
                      <div className="info-value">{value || "-"}</div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section kicker="Recruiter Inputs" title="Draft Notes">
                <form className="form-grid two-col" onSubmit={(e) => { e.preventDefault(); }}>
                  {[["candidateName", "Candidate name"], ["phoneNumber", "Phone"], ["emailId", "Email", "email"], ["linkedin", "LinkedIn"], ["location", "Location"], ["currentCompany", "Current company"], ["currentDesignation", "Current designation"], ["totalExperience", "Total experience"], ["relevantExperience", "Relevant experience"], ["highestEducation", "Qualification"]].map(([name, label, type]) => (
                    <label key={name}><span>{label}</span><input type={type || "text"} value={interviewForm[name]} onChange={(e) => setInterviewForm((c) => ({ ...c, [name]: e.target.value }))} /></label>
                  ))}
                  <label>
                    <span>Gender</span>
                    <select value={interviewForm.gender} onChange={(e) => setInterviewForm((c) => ({ ...c, gender: e.target.value }))}>
                      <option value="">Select</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </label>
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
                  {/* Experience timeline removed from recruiter UI (not reliable; CV already contains this). */}
                  {(String(interviewForm.cautiousIndicators || "").trim() || editCautiousIndicators) ? (
                    <label className="full">
                      <span>Cautious indicators to check</span>
                      {String(interviewForm.cautiousIndicators || "").trim() ? (
                        <div className="candidate-snippet">{String(interviewForm.cautiousIndicators || "").trim()}</div>
                      ) : (
                        <div className="muted">No cautious indicators saved yet.</div>
                      )}
                      <div className="button-row tight" style={{ marginTop: 6 }}>
                        <button type="button" className="ghost-btn" onClick={() => setEditCautiousIndicators((v) => !v)}>{editCautiousIndicators ? "Hide editor" : "Edit note"}</button>
                      </div>
                      {editCautiousIndicators ? (
                        <textarea
                          value={interviewForm.cautiousIndicators}
                          onChange={(e) => setInterviewForm((c) => ({ ...c, cautiousIndicators: e.target.value }))}
                          placeholder="What to verify on call: gaps, stability reason, domain mismatch, missing target metrics..."
                        />
                      ) : null}
                    </label>
                  ) : (
                    <div className="full" style={{ marginTop: 6 }}>
                      <button type="button" className="ghost-btn" onClick={() => setEditCautiousIndicators(true)}>Add cautious indicator note</button>
                    </div>
                  )}
                  <label className="full"><span>Tags / searchable keywords</span><textarea value={interviewForm.tags} onChange={(e) => setInterviewForm((c) => ({ ...c, tags: e.target.value }))} placeholder="SaaS, B2B, enterprise sales, node backend, react + java..." /></label>
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
                      <label><span>Tenure in current org</span><input value={interviewForm.currentOrgTenure} onChange={(e) => setInterviewForm((c) => ({ ...c, currentOrgTenure: e.target.value }))} /></label>
                      <label><span>Reason of change</span><textarea value={interviewForm.reasonForChange} onChange={(e) => setInterviewForm((c) => ({ ...c, reasonForChange: e.target.value }))} /></label>
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
                      {interviewMeta.candidateId ? <button className="ghost-btn" onClick={() => void removeInterviewStoredCv()}>Remove uploaded CV</button> : null}
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
	                  <label className="copy-preset-control">
	                    <span>Copy preset</span>
	                    <select value={activeCopyPresetId} onChange={(e) => setActiveCopyPresetId(e.target.value)}>
	                      {exportPresetOptions.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
	                    </select>
	                  </label>
	                  <button onClick={() => void copyInterviewTracker()}>Copy tracker</button>
	                  {interviewMeta.candidateId && !interviewMeta.assessmentId ? <button onClick={() => void saveInterviewDraft()}>Save draft</button> : null}
	                  <button onClick={() => void saveAssessment()}>{interviewMeta.assessmentId ? "Save assessment" : "Create assessment"}</button>
	                  <button onClick={() => sendInterviewToSheets()}>Send to Sheets</button>
	                  <button onClick={() => exportInterviewAll()}>Export all</button>
	                    <button className="ghost-btn" onClick={() => { setEditCautiousIndicators(false); setInterviewMeta({ candidateId: "", assessmentId: "" }); setInterviewForm({ candidateName: "", phoneNumber: "", emailId: "", linkedin: "", location: "", gender: "", currentCtc: "", expectedCtc: "", noticePeriod: "", offerInHand: "", lwdOrDoj: "", currentCompany: "", currentDesignation: "", totalExperience: "", relevantExperience: "", currentOrgTenure: "", experienceTimeline: "", reasonForChange: "", cautiousIndicators: "", clientName: "", jdTitle: "", pipelineStage: "Under Interview Process", candidateStatus: "Screening in progress", followUpAt: "", interviewAt: "", recruiterNotes: "", callbackNotes: "", otherPointers: "", tags: "", jdScreeningAnswers: {}, cvAnalysis: null, cvAnalysisApplied: false, statusHistory: [] }); setStatus("interview", ""); }}>Clear draft</button>
	                </div>
	              </Section>
            </div>
          } />

          <Route path="/intake-settings" element={
            <div className="page-grid">
              <Section kicker="Apply Link" title="Job Apply Link">
                {statuses.intake ? <div className={`status ${statuses.intakeKind || ""}`}>{statuses.intake}</div> : null}
                <p className="muted">Use this hosted apply link for each JD so candidates land directly into the RecruitDesk workflow.</p>
                <div className="form-grid">
                  <label><span>Select JD / role</span><select value={hostedJobId} onChange={(e) => setHostedJobId(e.target.value)}><option value="">Select JD / role</option>{state.jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
                  <label><span>Hosted Apply Link</span><textarea readOnly value={getApplyLink(hostedJobId)} /></label>
                  <label><span>Anonymous / Public Apply Link (client name hidden)</span><textarea readOnly value={getPublicApplyLink(hostedJobId)} /></label>
                  <div className="button-row"><button onClick={() => void copyText(getApplyLink(hostedJobId)).then(() => setStatus("intake", "Hosted apply link copied.", "ok"))}>Copy Apply Link</button></div>
                  <div className="button-row"><button className="ghost-btn" onClick={() => void copyText(getPublicApplyLink(hostedJobId)).then(() => setStatus("intake", "Public apply link copied.", "ok"))}>Copy Public Link</button></div>
                </div>
                {hostedJobId ? (
                  <div className="template-item" style={{ marginTop: 16 }}>
                    <div className="template-key">Recruiter-specific public links</div>
                    <p className="muted">Share the recruiter-specific link with candidates. Whoever applies via that link will land under that recruiter in Applied Candidates.</p>
                    {!hostedRecruiterApplyLinks.length ? (
                      <div className="empty-state">No assigned recruiters found for this JD yet. Set recruiters in Jobs, then come back here.</div>
                    ) : (
                      <div className="stack-list compact" style={{ marginTop: 10 }}>
                        {hostedRecruiterApplyLinks.map((item) => {
                          const url = getRecruiterApplyLink(hostedJobId, item.recruiterId, item.sig);
                          return (
                            <article className="item-card compact-card" key={item.recruiterId}>
                              <div className="item-card__top compact-top">
                                <strong>{item.recruiterName || "Recruiter"}</strong>
                                <div className="button-row tight">
                                  <button className="ghost-btn" onClick={() => void copyText(url).then(() => setStatus("intake", `Apply link copied for ${item.recruiterName || "recruiter"}.`, "ok"))}>Copy link</button>
                                </div>
                              </div>
                              <label className="full"><span>Link</span><textarea readOnly value={url} /></label>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </Section>
            </div>
          } />

          <Route path="/mail-settings" element={
            <div className="page-grid">
              <Section kicker="Email" title="Mail Settings">
                {statuses.settings ? <div className={`status ${statuses.settingsKind || ""}`}>{statuses.settings}</div> : null}
                <p className="muted">Configure your SMTP credentials here. JD emails from candidate cards will send using these settings (per recruiter).</p>
                <div className="form-grid two-col">
                  <label><span>SMTP host</span><input value={smtpSettings.host} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, host: e.target.value })); }} placeholder="smtppro.zoho.com" /></label>
                  <label><span>SMTP port</span><input type="number" value={smtpSettings.port} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, port: Number(e.target.value || 0) || 587 })); }} placeholder="587" /></label>
                  <label className="checkbox-row" style={{ alignItems: "center" }}>
                    <input type="checkbox" checked={smtpSettings.secure} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, secure: e.target.checked })); }} />
                    <span>Use secure (SSL)</span>
                  </label>
                  <div />
                  <label><span>SMTP user</span><input value={smtpSettings.user} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, user: e.target.value })); }} placeholder="you@yourdomain.com" /></label>
                  <label><span>From</span><input value={smtpSettings.from} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, from: e.target.value })); }} placeholder="Your Name <you@yourdomain.com>" /></label>
                  <label className="full">
                    <span>{smtpSettings.hasPassword && smtpSettingsKeepPass ? "SMTP app password (kept)" : "SMTP app password"}</span>
                    <input type="password" value={smtpSettings.pass} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, pass: e.target.value })); }} placeholder={smtpSettings.hasPassword ? "Leave blank to keep existing" : "App password"} />
                  </label>
                  {smtpSettings.hasPassword ? (
                    <label className="checkbox-row full">
                      <input type="checkbox" checked={smtpSettingsKeepPass} onChange={(e) => setSmtpSettingsKeepPass(e.target.checked)} />
                      <span>Keep existing password if blank</span>
                    </label>
                  ) : null}
                </div>
                <div className="button-row">
                  <button onClick={() => void saveSmtpSettings()}>Save email settings</button>
                </div>

                <div className="settings-subsection" style={{ marginTop: 18 }}>
                  <div className="section-kicker">Your Email Signature (per recruiter)</div>
                  <p className="muted">Used in JD emails and Direct Share by default. Tip: to make only part of link text clickable, write it as <code>LinkedIn || 7027xxxxxxx</code> (only “LinkedIn” becomes the hyperlink).</p>
                  <div className="form-grid two-col">
                    <label className="full">
                      <span>Signature text</span>
                      <textarea value={smtpSettings.signatureText || ""} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, signatureText: e.target.value })); }} rows={5} placeholder={"Regards,\nYour Name\nYour Company"} />
                    </label>
                    <label>
                      <span>Signature link 1 text</span>
                      <input value={smtpSettings.signatureLinkLabel || ""} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, signatureLinkLabel: e.target.value })); }} placeholder="Kompatible Minds" />
                    </label>
                    <label>
                      <span>Signature link 1 URL</span>
                      <input value={smtpSettings.signatureLinkUrl || ""} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, signatureLinkUrl: e.target.value })); }} placeholder="https://kompatibleminds.com" />
                    </label>
                    <label>
                      <span>Signature link 2 text</span>
                      <input value={smtpSettings.signatureLinkLabel2 || ""} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, signatureLinkLabel2: e.target.value })); }} placeholder="LinkedIn" />
                    </label>
                    <label>
                      <span>Signature link 2 URL</span>
                      <input value={smtpSettings.signatureLinkUrl2 || ""} onChange={(e) => { markSmtpSettingsDirty(); setSmtpSettings((c) => ({ ...c, signatureLinkUrl2: e.target.value })); }} placeholder="https://www.linkedin.com/in/..." />
                    </label>
                  </div>
                </div>

                <div className="settings-subsection" style={{ marginTop: 18 }}>
                  <div className="section-kicker">JD Email Template (Admin)</div>
                  <p className="muted">Default subject/body in the “Email JD” modal. Placeholders: {`{Candidate} {Recruiter} {Role}`}</p>
                  <div className="form-grid">
                    <label className="full">
                      <span>Subject template</span>
                      <input
                        disabled={!isSettingsAdmin}
                        value={copySettings.jdEmailSubjectTemplate || DEFAULT_COPY_SETTINGS.jdEmailSubjectTemplate}
                        onChange={(e) => setCopySettings((current) => ({ ...current, jdEmailSubjectTemplate: e.target.value }))}
                        placeholder="Job Description - {Role}"
                      />
                    </label>
                    <label className="full">
                      <span>Body template</span>
                      <textarea
                        disabled={!isSettingsAdmin}
                        value={copySettings.jdEmailIntroTemplate || DEFAULT_COPY_SETTINGS.jdEmailIntroTemplate}
                        onChange={(e) => setCopySettings((current) => ({ ...current, jdEmailIntroTemplate: e.target.value }))}
                        rows={8}
                      />
                    </label>
                  </div>
                  <div className="button-row">
                    {isSettingsAdmin ? <button onClick={() => void saveSharedCopySettings()}>Save JD email template</button> : null}
                  </div>
                </div>
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
	                  <button className="ghost-btn" onClick={() => resetJobDraftBlank()}>New blank JD</button>
	                  <button onClick={() => applySelectedJobToInterview()}>Apply generated JD</button>
	                  <button onClick={() => generateJdFromText()}>Generate JD from text</button>
	                  <button className="ghost-btn" onClick={() => downloadJobDraftWord()}>Download Word</button>
	                  <button onClick={() => void saveJobDraft()}>{selectedJobId ? "Update JD" : "Save JD"}</button>
	                  <button
	                    className="ghost-btn"
	                    disabled={!String(jobDraft.title || "").trim() || !String(jobDraft.jobDescription || "").trim()}
                    onClick={() => void saveJobDraftAsNew()}
                    title="Duplicate current JD as a new saved record"
                  >
                    Save as new JD
                  </button>
                  {isSettingsAdmin || String(jobDraft.ownerRecruiterId || "") === String(state.user?.id || "") ? (
                    <button
                      className="ghost-btn"
                      disabled={!selectedJobId}
                      onClick={() => void deleteSelectedJobDraft()}
                    >
                      Delete JD
                    </button>
                  ) : null}
                </div>

                <div className="form-grid two-col">
                  <label><span>Job title</span><input value={jobDraft.title} onChange={(e) => setJobDraft((c) => ({ ...c, title: e.target.value }))} /></label>
                  <label><span>Client</span><input value={jobDraft.clientName} onChange={(e) => setJobDraft((c) => ({ ...c, clientName: e.target.value }))} /></label>
                  <label><span>Location</span><input value={jobDraft.location} onChange={(e) => setJobDraft((c) => ({ ...c, location: e.target.value }))} placeholder="Mumbai / Bengaluru / Remote" /></label>
                  <label><span>Work mode</span><select value={jobDraft.workMode} onChange={(e) => setJobDraft((c) => ({ ...c, workMode: e.target.value }))}><option value="">Not specified</option><option value="Remote">Remote</option><option value="Hybrid">Hybrid</option><option value="Work from office">Work from office</option></select></label>
                  {isSettingsAdmin ? (
                    <>
                      <label>
                        <span>Primary recruiter</span>
                        <select
                          value={jobDraft.ownerRecruiterId}
                          onChange={(e) => {
                            const selectedId = e.target.value;
                            const selectedUser = (state.users || []).find((user) => String(user.id) === String(selectedId)) || null;
                            setJobDraft((c) => {
                              const currentAssigned = Array.isArray(c.assignedRecruiters) ? c.assignedRecruiters : [];
                              const withoutOldPrimary = currentAssigned.filter((item) => String(item?.id || "") !== String(c.ownerRecruiterId || ""));
                              const nextAssigned = selectedId
                                ? [{ id: selectedId, name: selectedUser?.name || "", primary: true }, ...withoutOldPrimary]
                                : withoutOldPrimary;
                              return {
                                ...c,
                                ownerRecruiterId: selectedId,
                                ownerRecruiterName: selectedUser?.name || "",
                                assignedRecruiters: nextAssigned
                              };
                            });
                          }}
                        >
                          <option value="">Unassigned</option>
                          {(state.users || []).map((user) => <option key={user.id} value={user.id}>{user.name} | {user.email}</option>)}
                        </select>
                      </label>
                      <label><span>Primary recruiter name</span><input value={jobDraft.ownerRecruiterName} readOnly /></label>
                      <div className="full">
                        <div className="info-label">Recruiters on this JD</div>
                        <p className="muted">Primary recruiter receives direct applied candidates and owns applicant counts. Others are supporting recruiters.</p>
                        <div className="chip-grid">
                          {(state.users || []).map((user) => {
                            const userId = String(user.id || "");
                            const isPrimary = userId && userId === String(jobDraft.ownerRecruiterId || "");
                            const isChecked = isPrimary || (Array.isArray(jobDraft.assignedRecruiters) && jobDraft.assignedRecruiters.some((item) => String(item?.id || "") === userId));
                            return (
                              <label className="checkbox-pill" key={user.id}>
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isPrimary}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setJobDraft((c) => {
                                      const currentAssigned = Array.isArray(c.assignedRecruiters) ? c.assignedRecruiters : [];
                                      if (!checked) return { ...c, assignedRecruiters: currentAssigned.filter((item) => String(item?.id || "") !== userId) };
                                      if (currentAssigned.some((item) => String(item?.id || "") === userId)) return c;
                                      return { ...c, assignedRecruiters: [...currentAssigned, { id: userId, name: user.name || "", primary: false }] };
                                    });
                                  }}
                                />
                                <span>{user.name}{isPrimary ? " | Primary" : ""}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  ) : (
                    <label>
                      <span>Owner recruiter</span>
                      <input value={jobDraft.ownerRecruiterName || state.user?.name || ""} readOnly />
                    </label>
                  )}
                  <label className="full"><span>About company</span><textarea value={jobDraft.aboutCompany} onChange={(e) => setJobDraft((c) => ({ ...c, aboutCompany: e.target.value }))} placeholder="Short company context shown on hosted apply link." /></label>
                  <label className="full">
                    <span>Public company line (anonymous apply link)</span>
                    <textarea
                      value={jobDraft.publicCompanyLine || ""}
                      onChange={(e) => setJobDraft((c) => ({ ...c, publicCompanyLine: e.target.value }))}
                      placeholder="Shown on /apply-public. Example: Leading company with all-in-one CRM stack for connected customer experience."
                    />
                  </label>
                  <label className="full">
                    <span>Public posting title (optional)</span>
                    <input
                      value={jobDraft.publicTitle || ""}
                      onChange={(e) => setJobDraft((c) => ({ ...c, publicTitle: e.target.value }))}
                      placeholder="If blank, public link will use JD title with client name redacted."
                    />
                  </label>
                  <label className="full"><span>Job description</span><textarea className="jd-editor" value={jobDraft.jobDescription} onChange={(e) => setJobDraft((c) => ({ ...c, jobDescription: e.target.value }))} placeholder="Paste the full JD here. Hosted apply link will show this as one clean block." /></label>
                  <label className="full"><span>Must-have skills</span><textarea value={jobDraft.mustHaveSkills} onChange={(e) => setJobDraft((c) => ({ ...c, mustHaveSkills: e.target.value }))} placeholder="Shown on hosted apply link only when filled." /></label>
                  <label className="full"><span>Red flags</span><textarea value={jobDraft.redFlags} onChange={(e) => setJobDraft((c) => ({ ...c, redFlags: e.target.value }))} /></label>
                  <label className="full"><span>Standard screening questions</span><textarea value={jobDraft.standardQuestions} onChange={(e) => setJobDraft((c) => ({ ...c, standardQuestions: e.target.value }))} placeholder="Recruiter-only. These are used in Interview Panel and will not show on hosted apply link." /></label>
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
                <Section kicker="Copy Presets" title="Preset Settings">
                  <p className="muted">Set shared candidate tracker presets and direct-share email defaults. Admin saves them once; recruiters can choose the preset while copying or sharing.</p>
                  {!isSettingsAdmin ? <p className="muted">You can use shared presets here. Only admin can create, edit, or save shared preset settings.</p> : null}
                  {statuses.settings ? <div className={`status ${statuses.settingsKind || ""}`}>{statuses.settings}</div> : null}
                  <div className="settings-subsection">
                    <div className="section-kicker">Search Settings</div>
                    <p className="muted">Controls apply to the Database AI Search for the whole workspace.</p>
                    <div className="form-grid">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          disabled={!isSettingsAdmin}
                          checked={copySettings.semanticSearchEnabled !== false}
                          onChange={(e) => setCopySettings((current) => ({ ...current, semanticSearchEnabled: e.target.checked }))}
                        />
                        <span>Enable semantic (embeddings) reranking</span>
                      </label>
                    </div>
                    <p className="muted">When disabled, search remains structured/boolean only (no OpenAI embedding calls per query).</p>
                    <div className="button-row">
                      {isSettingsAdmin ? <button onClick={() => void saveSharedCopySettings()}>Save search settings</button> : null}
                    </div>
                  </div>

                  {/* Email Settings moved to Mail Settings tab (visible to all recruiters). */}
                  <div className="settings-subsection">
                    <div className="section-kicker">Edit Existing Presets</div>
                    <p className="muted">Edit any existing candidate tracker preset, attach it to a specific client if needed, and save shared usage defaults.</p>
                    <div className="form-grid">
                      <label>
                        <span>Select preset to edit</span>
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
                        <span>{isSettingsAdmin ? "Preset label" : "Selected preset label"}</span>
                        <input
                          disabled={!isSettingsAdmin}
                          value={selectedPresetLabel}
                          onChange={(e) => updateSelectedPresetLabel(e.target.value)}
                          placeholder="Attentive tracker"
                          spellCheck={false}
                        />
                      </label>
                      <label>
                        <span>Client for this preset</span>
                        <select
                          disabled={!isSettingsAdmin}
                          value={selectedPresetClientName}
                          onChange={(e) => updateSelectedPresetClientName(e.target.value)}
                        >
                          <option value="">Internal / all clients</option>
                          {availablePresetClients.map((clientName) => <option key={clientName} value={clientName}>{clientName}</option>)}
                        </select>
                      </label>
                      <label className="full">
                        <span>{isSettingsAdmin ? "Preset columns" : "Selected preset columns"}</span>
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
                      <label className="full">
                        <span>WhatsApp template</span>
                        <textarea disabled={!isSettingsAdmin} value={copySettings.whatsappTemplate || DEFAULT_COPY_SETTINGS.whatsappTemplate} onChange={(e) => setCopySettings((current) => ({ ...current, whatsappTemplate: e.target.value }))} />
                      </label>
                      <label className="full">
                        <span>Email template</span>
                        <textarea disabled={!isSettingsAdmin} value={copySettings.emailTemplate || DEFAULT_COPY_SETTINGS.emailTemplate} onChange={(e) => setCopySettings((current) => ({ ...current, emailTemplate: e.target.value }))} />
                      </label>
                    </div>
                    <p className="muted">Available placeholders: copy templates use {`{{index}} {{name}} {{jd_title}} {{company}} {{outcome}} {{recruiter_notes}} {{location}} {{phone}} {{email}} {{source}} {{follow_up_at}}`}.</p>
                    <div className="button-row">
                      {isSettingsAdmin ? <button onClick={() => void saveSharedCopySettings()}>Save existing preset changes</button> : null}
                      {isSettingsAdmin && selectedCustomPreset ? (
                        <button
                          className="ghost-btn"
                          onClick={() => {
                            const confirmed = window.confirm(`Remove preset "${selectedCustomPreset.label}"?`);
                            if (!confirmed) return;
                            removeCustomPreset(selectedCustomPreset.id);
                            setStatus("settings", "Preset removed. Save settings to apply for the team.", "ok");
                          }}
                        >
                          Remove selected preset
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="settings-subsection">
                    <div className="section-kicker">Create New Presets</div>
                    <p className="muted">Create a new candidate tracker preset and optionally map it to a client right away.</p>
                    <div className="form-grid">
                      <label><span>New preset label</span><input disabled={!isSettingsAdmin} value={newPresetDraft.label} onChange={(e) => setNewPresetDraft((current) => ({ ...current, label: e.target.value }))} placeholder="Client shortlisting sheet" /></label>
                      <label>
                        <span>Client for new preset</span>
                        <select disabled={!isSettingsAdmin} value={newPresetDraft.clientName || ""} onChange={(e) => setNewPresetDraft((current) => ({ ...current, clientName: e.target.value }))}>
                          <option value="">Internal / all clients</option>
                          {availablePresetClients.map((clientName) => <option key={clientName} value={clientName}>{clientName}</option>)}
                        </select>
                      </label>
                      <label className="full"><span>New preset columns</span><textarea disabled={!isSettingsAdmin} value={newPresetDraft.columns} onChange={(e) => setNewPresetDraft((current) => ({ ...current, columns: e.target.value }))} placeholder={"S.No.|s_no\nName|name\nStatus|assessment_status"} /></label>
                    </div>
                    {isSettingsAdmin ? <div className="button-row">
                      <button className="ghost-btn" onClick={addCustomPreset}>Create preset</button>
                      <button onClick={() => void saveSharedCopySettings()}>Save new preset</button>
                    </div> : null}
                    <p className="muted">After creating a preset, select it from the dropdown above to view, edit, or remove it.</p>
                  </div>
                  <div className="settings-subsection">
                    <div className="section-kicker">Direct Share Email Preset</div>
                    <p className="muted">Default intro and signature used in Direct Share. Recruiters can still override them for one email draft.</p>
                    <div className="form-grid">
                      <label className="full">
                        <span>Direct share default email intro</span>
                        <textarea disabled={!isSettingsAdmin} value={copySettings.clientShareIntroTemplate || DEFAULT_COPY_SETTINGS.clientShareIntroTemplate} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareIntroTemplate: e.target.value }))} />
                      </label>
                      <label className="full">
                        <span>Direct share default signature text</span>
                        <textarea disabled={!isSettingsAdmin} value={copySettings.clientShareSignatureText || DEFAULT_COPY_SETTINGS.clientShareSignatureText} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareSignatureText: e.target.value }))} />
                      </label>
                      <label><span>Signature link 1 text</span><input disabled={!isSettingsAdmin} value={copySettings.clientShareSignatureLinkLabel || ""} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareSignatureLinkLabel: e.target.value }))} placeholder="Kompatible Minds" /></label>
                      <label><span>Signature link 1 URL</span><input disabled={!isSettingsAdmin} value={copySettings.clientShareSignatureLinkUrl || ""} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareSignatureLinkUrl: e.target.value }))} placeholder="https://kompatibleminds.com" /></label>
                      <label><span>Signature link 2 text</span><input disabled={!isSettingsAdmin} value={copySettings.clientShareSignatureLinkLabel2 || ""} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareSignatureLinkLabel2: e.target.value }))} placeholder="LinkedIn" /></label>
                      <label><span>Signature link 2 URL</span><input disabled={!isSettingsAdmin} value={copySettings.clientShareSignatureLinkUrl2 || ""} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareSignatureLinkUrl2: e.target.value }))} placeholder="https://www.linkedin.com/in/..." /></label>
                    </div>
                    <p className="muted">Direct share intro/signature placeholders use {`{{hr_name}} {{recruiter_name}} {{company_name}} {{client_name}} {{role}} {{role_line}}`}.</p>
                    <div className="button-row">
                      <button onClick={() => setCopySettings(DEFAULT_COPY_SETTINGS)}>Reset defaults</button>
                      {isSettingsAdmin ? <button onClick={() => void saveSharedCopySettings()}>Save direct share preset</button> : null}
                    </div>
                  </div>
                </Section>
              </div>
            } />

            <Route path="/login-settings" element={
              <div className="page-grid">
                <Section kicker="Admin Access" title="Login Settings">
                  <p className="muted">Manage company workspace users and client portal access from one place. Client portal URL: https://recruiter-backend-yvex.onrender.com/client-portal</p>
                  {statuses.loginSettings ? <div className={`status ${statuses.loginSettingsKind || ""}`}>{statuses.loginSettings}</div> : null}
                </Section>

                <details className="panel login-settings-collapse">
                  <summary className="dashboard-group__summary">
                    <div>
                      <div className="section-kicker">Company Workspace</div>
                      <h2>Add Company</h2>
                    </div>
                  </summary>
                  <p className="muted">Only platform-authorized admins can create companies. Backend will allow this only if your email is in Render allowlist or a valid platform secret is provided.</p>
                  <div className="form-grid two-col">
                    <label><span>Company name</span><input disabled={!isSettingsAdmin} value={companyDraft.companyName} onChange={(e) => setCompanyDraft((current) => ({ ...current, companyName: e.target.value }))} placeholder="Kompatible Minds" /></label>
                    <label><span>First admin name</span><input disabled={!isSettingsAdmin} value={companyDraft.adminName} onChange={(e) => setCompanyDraft((current) => ({ ...current, adminName: e.target.value }))} placeholder="Admin name" /></label>
                    <label><span>Admin email</span><input disabled={!isSettingsAdmin} type="email" value={companyDraft.email} onChange={(e) => setCompanyDraft((current) => ({ ...current, email: e.target.value }))} placeholder="admin@company.com" /></label>
                    <label><span>Temporary password</span><input disabled={!isSettingsAdmin} type="password" value={companyDraft.password} onChange={(e) => setCompanyDraft((current) => ({ ...current, password: e.target.value }))} placeholder="Temporary password" /></label>
                    <label className="full"><span>Platform authorization secret</span><input disabled={!isSettingsAdmin} type="password" value={companyDraft.platformSecret} onChange={(e) => setCompanyDraft((current) => ({ ...current, platformSecret: e.target.value }))} placeholder="Optional if your admin email is already allowlisted in Render" /></label>
                  </div>
                  {isSettingsAdmin ? <div className="button-row"><button onClick={() => void createCompanyFromLoginSettings()}>Create company</button></div> : null}
                  {statuses.loginCompany ? <div className={`status ${statuses.loginCompanyKind || ""}`}>{statuses.loginCompany}</div> : null}
                </details>

                <details className="panel login-settings-collapse" open>
                  <summary className="dashboard-group__summary">
                    <div>
                      <div className="section-kicker">Team Access</div>
                      <h2>Add Users</h2>
                    </div>
                  </summary>
                  <p className="muted">Create admins and recruiters for this company workspace. Existing admin passwords are not reset from here for safety.</p>
                  <div className="form-grid two-col">
                    <label><span>Member name</span><input disabled={!isSettingsAdmin} value={teamUserDraft.name} onChange={(e) => setTeamUserDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Ankit Garg" /></label>
                    <label><span>Member email</span><input disabled={!isSettingsAdmin} type="email" value={teamUserDraft.email} onChange={(e) => setTeamUserDraft((current) => ({ ...current, email: e.target.value }))} placeholder="member@company.com" /></label>
                    <label><span>Member role</span><select disabled={!isSettingsAdmin} value={teamUserDraft.role} onChange={(e) => setTeamUserDraft((current) => ({ ...current, role: e.target.value }))}><option value="recruiter">Recruiter</option><option value="admin">Admin</option></select></label>
                    <label><span>Temporary password</span><input disabled={!isSettingsAdmin} type="password" value={teamUserDraft.password} onChange={(e) => setTeamUserDraft((current) => ({ ...current, password: e.target.value }))} placeholder="Temporary password" /></label>
                  </div>
                  {isSettingsAdmin ? <div className="button-row"><button onClick={() => void createTeamUser()}>Create member</button></div> : null}
                  {statuses.loginTeam ? <div className={`status ${statuses.loginTeamKind || ""}`}>{statuses.loginTeam}</div> : null}
                  <div className="stack-list compact">
                    {(state.users || []).map((item) => (
                      <article className="item-card compact-card" key={item.id}>
                        <div className="item-card__top">
                          <div>
                            <h3>{item.name}</h3>
                            <p className="muted">{`${item.email} | ${String(item.role || "").toLowerCase() === "admin" ? "Admin" : "Recruiter"}`}</p>
                          </div>
                          {isSettingsAdmin && String(item.role || "").toLowerCase() !== "admin" ? (
                            <div className="form-grid" style={{ minWidth: "260px" }}>
                              <label><span>Reset password</span><input type="password" value={teamPasswordDrafts[item.id] || ""} onChange={(e) => setTeamPasswordDrafts((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="New password" /></label>
                              <div className="button-row tight">
                                <button className="ghost-btn" onClick={() => void resetTeamUserPassword(item.id)}>Reset</button>
                                <button className="ghost-btn" onClick={() => void deleteTeamUser(item.id)}>Remove</button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </details>

                <details className="panel login-settings-collapse" open>
                  <summary className="dashboard-group__summary">
                    <div>
                      <div className="section-kicker">Client Access</div>
                      <h2>Add Client</h2>
                    </div>
                  </summary>
                  <p className="muted">Create client usernames for the separate client portal. Client will see all current and future positions for their client name.</p>
                  <div className="form-grid two-col">
                    <label><span>Username</span><input disabled={!isSettingsAdmin} value={clientUserDraft.username} onChange={(e) => setClientUserDraft((current) => ({ ...current, username: e.target.value }))} placeholder="attentive_hr" /></label>
                    <label><span>Password</span><input disabled={!isSettingsAdmin} type="password" value={clientUserDraft.password} onChange={(e) => setClientUserDraft((current) => ({ ...current, password: e.target.value }))} placeholder="Set client password" /></label>
                    <label><span>Client name</span><input disabled={!isSettingsAdmin} value={clientUserDraft.clientName} onChange={(e) => setClientUserDraft((current) => ({ ...current, clientName: e.target.value }))} placeholder="Attentive" /></label>
                  </div>
                  {isSettingsAdmin ? <div className="button-row"><button onClick={() => void createClientPortalUser()}>Create client login</button></div> : null}
                  {statuses.loginClient ? <div className={`status ${statuses.loginClientKind || ""}`}>{statuses.loginClient}</div> : null}
                  <div className="stack-list compact">
                    {!clientUsers.length ? <div className="empty-state">No client portal accounts created yet.</div> : clientUsers.map((item) => (
                      <article className="item-card compact-card" key={item.id}>
                        <div className="item-card__top">
                          <div>
                            <h3>{item.clientName}</h3>
                            <p className="muted">{`Username: ${item.username}`}</p>
                            <div className="candidate-snippet">{(item.allowedPositions || []).join("\n") || "All current and future positions for this client"}</div>
                          </div>
                          {isSettingsAdmin ? (
                            <div className="form-grid" style={{ minWidth: "240px" }}>
                              <label><span>Reset password</span><input type="password" value={clientPasswordDrafts[item.id] || ""} onChange={(e) => setClientPasswordDrafts((current) => ({ ...current, [item.id]: e.target.value }))} placeholder="New password" /></label>
                              <div className="button-row"><button className="ghost-btn" onClick={() => void resetClientPortalPassword(item.id)}>Reset</button></div>
                            </div>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                </details>
              </div>
            } />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </RouteErrorBoundary>
        <footer className="portal-footer portal-footer--content">{PRODUCT_NAME} {COMPANY_ATTRIBUTION}</footer>
      </main>

      <AssignModal
        open={Boolean(assignApplicantId)}
        applicant={assignApplicant}
        users={state.users}
        jobs={state.jobs}
        title={assignApplicant?.assignedToName ? "Reassign Applicant" : "Assign Applicant"}
        description={assignApplicant?.assignedToName ? "Reassign this record to a recruiter and JD." : "Assign this record to a recruiter and JD."}
        onClose={() => setAssignApplicantId("")}
        onSave={saveApplicantAssignment}
      />
      <AssignModal
        open={Boolean(assignCandidateId)}
        applicant={assignCandidate}
        users={state.users}
        jobs={state.jobs}
        onClose={() => setAssignCandidateId("")}
        onSave={saveCapturedAssignment}
        title={assignCandidate?.assigned_to_name ? "Reassign Draft" : "Assign Draft"}
        description={assignCandidate?.assigned_to_name ? "Reassign {name} to a recruiter and JD." : "Assign {name} to a recruiter and JD. Recruiters can map the role for themselves; admins can also assign another recruiter."}
        nameKey="name"
        allowRecruiterSelect={String(state.user?.role || "").toLowerCase() === "admin"}
        lockedRecruiterName={state.user?.name || ""}
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
	        onOpenLinkedin={(url) => openLinkedinInSideWindow(url)}
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
        onClose={() => setDrilldownState({ open: false, title: "", items: [], request: null })}
        onOpenCv={(candidateId) => void openCv(candidateId)}
        onOpenAssessment={(assessment) => { setDrilldownState({ open: false, title: "", items: [], request: null }); openSavedAssessment(assessment); }}
	        onOpenNotes={(candidateId) => { setDrilldownState({ open: false, title: "", items: [], request: null }); openRecruiterNotes(candidateId); }}
        onOpenStatus={(target) => {
          setDrilldownState({ open: false, title: "", items: [], request: null });
          const assessmentId = String(target?.id || target?.assessmentId || "").trim();
          if (assessmentId) {
            setAssessmentStatusId(assessmentId);
            return;
          }
          if (target?.candidateId) void openAttempts(target.candidateId);
        }}
      />
      <CandidateProfileModal
        open={Boolean(databaseProfileItem)}
        candidate={databaseProfileItem}
        onClose={() => setDatabaseProfileItem(null)}
        onOpenCv={(candidate) => openDatabaseCandidateCv(candidate)}
        onReuse={(candidate) => reuseDatabaseCandidate(candidate)}
        onCopyShareLink={(candidateId) => void copyCandidateProfileShareLink(candidateId)}
      />
      <JdEmailModal
        open={Boolean(jdEmailModal.open)}
        jobs={state.jobs}
        value={jdEmailModal}
        onChange={(key, val) => setJdEmailModal((current) => ({ ...current, [key]: val }))}
        onClose={() => { setJdEmailModal({ open: false, candidate: null, to: "", cc: "", subject: "", introText: "", jobId: "", attachJdFile: true, signatureText: "", signatureLinks: [] }); setJdEmailModalStatus({ message: "", kind: "" }); }}
        onSend={() => void sendCandidateJdEmail()}
        busy={jdEmailBusy}
        status={jdEmailModalStatus.message}
        statusKind={jdEmailModalStatus.kind}
      />
      <ClientFeedbackModal open={Boolean(clientFeedbackItem)} item={clientFeedbackItem} onClose={() => setClientFeedbackItem(null)} onSave={(payload) => void saveClientFeedback(payload)} />
    </div>
  );
}

function ClientPortalApp({ token, onLogout }) {
  const [clientUser, setClientUser] = useState(null);
  const [clientPortal, setClientPortal] = useState({ summary: { byClient: [], byClientPosition: [] } });
  const [clientCopySettings, setClientCopySettings] = useState(DEFAULT_COPY_SETTINGS);
  const [clientTrackerPresetId, setClientTrackerPresetId] = useState("client_submission");
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", positionLabel: "" });
  const [status, setStatus] = useState("");
  const [drilldownState, setDrilldownState] = useState({ open: false, title: "", items: [], request: null });
  const [clientFeedbackItem, setClientFeedbackItem] = useState(null);
  const [profileItem, setProfileItem] = useState(null);

  async function loadClientPortal(currentFilters = filters) {
    const params = new URLSearchParams();
    if (currentFilters.dateFrom) params.set("dateFrom", currentFilters.dateFrom);
    if (currentFilters.dateTo) params.set("dateTo", currentFilters.dateTo);
    const [meResult, summaryResult] = await Promise.all([
      api("/client-auth/me", token),
      api(`/client-portal/summary${params.toString() ? `?${params.toString()}` : ""}`, token)
    ]);
    const nextUser = meResult.user || meResult;
    const nextCopySettings = { ...DEFAULT_COPY_SETTINGS, ...(summaryResult.copySettings || {}) };
    const clientSpecificPreset = (nextCopySettings.customExportPresets || []).find((preset) => (
      String(preset.clientName || "").trim().toLowerCase() === String(nextUser?.clientName || "").trim().toLowerCase()
    ));
    const builtInClientPreset = ["compact_recruiter", "client_tracker", "attentive_tracker", "client_submission", "screening_focus"].find((presetId) => (
      String(nextCopySettings.exportPresetClientMap?.[presetId] || "").trim().toLowerCase() === String(nextUser?.clientName || "").trim().toLowerCase()
    ));
    setClientUser(nextUser);
    setClientCopySettings(nextCopySettings);
    setClientTrackerPresetId(clientSpecificPreset?.id || builtInClientPreset || nextCopySettings.excelPreset || "client_submission");
    setClientPortal(summaryResult || { summary: { byClient: [], byClientPosition: [] } });
  }

  useEffect(() => {
    void loadClientPortal().catch((error) => {
      const message = String(error?.message || error);
      if (/invalid|missing session|unauthorized|401/i.test(message)) {
        onLogout();
        return;
      }
      setStatus(message);
    });
  }, [token]);

  const summary = clientPortal.summary || { overall: {}, byClient: [], byClientPosition: [] };
  const agenda = clientPortal.agenda || { interviews: [], joinings: [] };
  const clientName = clientUser?.clientName || summary.byClient?.[0]?.label || "";
  const overall = summary.byClient?.[0]?.metrics || summary.overall || {};
  const positionRows = (summary.byClientPosition || []).filter((row) => !filters.positionLabel || String(row.positionLabel || "") === String(filters.positionLabel || ""));
  const clientAgendaInterviews = (agenda.interviews || []).filter((item) => !filters.positionLabel || String(item.position || "") === String(filters.positionLabel || ""));
  const clientAgendaJoinings = (agenda.joinings || []).filter((item) => !filters.positionLabel || String(item.position || "") === String(filters.positionLabel || ""));
  const selectedPosition = (summary.byClientPosition || []).find((row) => String(row.positionLabel || "") === String(filters.positionLabel || "")) || null;
  const positionOptions = Array.from(new Set((summary.byClientPosition || []).map((row) => row.positionLabel).filter(Boolean)));
  const rolePieRows = (summary.byClientPosition || []).map((row) => ({ label: row.positionLabel || "Unassigned", count: row.metrics?.total_shared || 0 }));
  const statusPieRows = (summary.byStatus || []).length
    ? (summary.byStatus || []).map((row) => ({ label: CLIENT_PORTAL_STATUS_LABELS[row.label] || row.label, count: row.count || 0 }))
    : CLIENT_PORTAL_METRICS.filter(([key]) => key !== "total_shared" && Number(overall[key] || 0) > 0).map(([key, label]) => ({ label, count: Number(overall[key] || 0) }));
  async function applyFilters() {
    try {
      setStatus("Refreshing client portal...");
      await loadClientPortal(filters);
      setStatus("");
    } catch (error) {
      const message = String(error?.message || error);
      if (/invalid|missing session|unauthorized|401/i.test(message)) {
        onLogout();
        return;
      }
      setStatus(message);
    }
  }

  async function openDrilldown({ title, metric, groupType, params = {} }) {
    const query = new URLSearchParams({
      metric,
      groupType,
      dateFrom: filters.dateFrom || "",
      dateTo: filters.dateTo || "",
      positionLabel: params.positionLabel || ""
    });
    const result = await api(`/client-portal/drilldown?${query.toString()}`, token);
    setDrilldownState({ open: true, title, items: result.items || [], request: { title, metric, groupType, params } });
  }

  async function refreshDrilldown() {
    if (!drilldownState.request) return;
    await openDrilldown(drilldownState.request);
  }

  async function saveFeedback({ status: nextStatus, feedback, interviewAt }) {
    const assessmentId = String(clientFeedbackItem?.raw?.assessment?.id || clientFeedbackItem?.id || "").trim();
    await api("/client-portal/feedback", token, "POST", { assessmentId, status: nextStatus, feedback, interviewAt });
    await loadClientPortal(filters);
    await refreshDrilldown();
    setClientFeedbackItem(null);
  }

  async function completeClientAgendaItem(item, kind) {
    const candidateName = item?.candidateName || "this candidate";
    const label = kind === "joining" ? "joining" : "interview";
    const confirmed = typeof window === "undefined" || window.confirm(`Mark ${label} done for ${candidateName}?`);
    if (!confirmed) return;
    try {
      await api("/client-portal/agenda/complete", token, "POST", {
        assessmentId: item?.assessmentId || item?.id || "",
        kind
      });
      await loadClientPortal(filters);
      await refreshDrilldown();
      setStatus(`${label[0].toUpperCase()}${label.slice(1)} marked done.`);
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }

  function getClientCvUrl(item) {
    const assessment = item?.raw?.assessment || item || {};
    const assessmentId = String(assessment.id || item?.id || "").trim();
    if (!assessmentId || !clientPortalItemHasCv(item)) return "";
    return `/client-portal/cv?assessmentId=${encodeURIComponent(assessmentId)}&access_token=${encodeURIComponent(token)}`;
  }

  function openClientCv(item) {
    const url = getClientCvUrl(item);
    if (!url) {
      setStatus("CV link not available for this profile.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function copyClientTrackerRows(items = drilldownState.items) {
    const cvTextByAssessmentId = {};
    (items || []).forEach((item) => {
      const assessment = item.raw?.assessment || item;
      const id = String(assessment.id || item.id || "").trim();
      const cvUrl = getClientCvUrl(item);
      if (id && cvUrl) cvTextByAssessmentId[id] = `${window.location.origin}${cvUrl}`;
    });
    const rows = buildClientPortalTrackerRows(items, cvTextByAssessmentId);
    await copyText(buildTsvFromPreset(rows, clientTrackerPresetId, clientCopySettings));
    setStatus("Tracker copied in selected preset.");
  }

  function downloadClientTrackerRows(items = drilldownState.items) {
    const cvTextByAssessmentId = {};
    (items || []).forEach((item) => {
      const assessment = item.raw?.assessment || item;
      const id = String(assessment.id || item.id || "").trim();
      const cvUrl = getClientCvUrl(item);
      if (id && cvUrl) cvTextByAssessmentId[id] = `${window.location.origin}${cvUrl}`;
    });
    const rows = buildClientPortalTrackerRows(items, cvTextByAssessmentId);
    downloadPresetExcelFile(`client-tracker-${new Date().toISOString().slice(0, 10)}.xls`, rows, clientTrackerPresetId, clientCopySettings, "Client Tracker");
    setStatus("Tracker downloaded in selected preset.");
  }

  return (
    <div className="app-shell app-shell--client">
      <main className="content client-portal-content">
        <header className="workspace-header client-portal-header">
          <div>
            <BrandLogo size="sm" />
            <div className="section-kicker">{clientName || clientUser?.companyName || "Client Workspace"}</div>
            <h1>{CLIENT_PORTAL_LABEL}</h1>
          </div>
          <div className="client-user-pill">
            {clientUser?.username ? <span>{clientUser.username}</span> : null}
            <button className="ghost-btn" onClick={onLogout}>Logout</button>
          </div>
        </header>

        <div className="page-grid">
          <Section kicker="Client View" title="Hiring Summary">
            <p className="muted">Track shared profiles by role, open profile details, and add client feedback directly in the portal.</p>
            {status ? <div className="status">{status}</div> : null}
            <div className="form-grid three-col">
              <label><span>Date from</span><input type="date" value={filters.dateFrom} onChange={(e) => setFilters((current) => ({ ...current, dateFrom: e.target.value }))} /></label>
              <label><span>Date to</span><input type="date" value={filters.dateTo} onChange={(e) => setFilters((current) => ({ ...current, dateTo: e.target.value }))} /></label>
              <label><span>Position</span><select value={filters.positionLabel} onChange={(e) => setFilters((current) => ({ ...current, positionLabel: e.target.value }))}><option value="">All positions</option>{positionOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <div className="button-row align-end"><button onClick={() => void applyFilters()}>Apply</button></div>
            </div>
          </Section>

          <Section kicker="Overall Recruitment Summary" title={clientName || "Client"}>
            <div className="client-pie-grid">
              <ClientPortalPieCard title="Shared by role" total={overall.total_shared || 0} rows={rolePieRows} />
              <ClientPortalPieCard title="Status split" total={overall.total_shared || 0} rows={statusPieRows} />
            </div>
            <div className="metric-grid dashboard-metric-grid client-portal-metric-grid">
              {CLIENT_PORTAL_METRICS.map(([key, label]) => (
                <button key={key} className="metric-card metric-card--button client-portal-metric-card" onClick={() => void openDrilldown({ title: `${clientName} | ${label}`, metric: key, groupType: "client" })}>
                  <div className="metric-label">{label}</div>
                  <div className="metric-value">{overall[key] || 0}</div>
                </button>
              ))}
            </div>
          </Section>

          <Section kicker="Schedule" title="Interviews and Joinings">
            <div className="agenda-split-grid">
              <div className="agenda-subblock">
                <h4>Interviews aligned</h4>
                <div className="stack-list compact">
                  {clientAgendaInterviews.slice(0, 8).map((item) => (
                    <article className="agenda-item" key={`client-interview-${item.assessmentId || item.id}`}>
                      <div>
                        <span className="agenda-item__title">{item.candidateName || "Candidate"}</span>
                        <span className="agenda-item__subtitle">{item.position || "Untitled role"}</span>
                        <span className="agenda-item__time">{item.at ? new Date(item.at).toLocaleString() : item.status}</span>
                      </div>
                      <button className="ghost-btn" onClick={() => void completeClientAgendaItem(item, "interview")}>Mark done</button>
                    </article>
                  ))}
                  {!clientAgendaInterviews.length ? <div className="empty-state compact-empty">No interviews aligned.</div> : null}
                </div>
              </div>
              <div className="agenda-subblock">
                <h4>Upcoming joinings</h4>
                <div className="stack-list compact">
                  {clientAgendaJoinings.slice(0, 8).map((item) => (
                    <article className="agenda-item" key={`client-joining-${item.assessmentId || item.id}`}>
                      <div>
                        <span className="agenda-item__title">{item.candidateName || "Candidate"}</span>
                        <span className="agenda-item__subtitle">{item.position || "Untitled role"}</span>
                        <span className="agenda-item__time">{item.at ? new Date(item.at).toLocaleString() : item.status}</span>
                      </div>
                      <button className="ghost-btn" onClick={() => void completeClientAgendaItem(item, "joining")}>Mark done</button>
                    </article>
                  ))}
                  {!clientAgendaJoinings.length ? <div className="empty-state compact-empty">No upcoming joinings.</div> : null}
                </div>
              </div>
            </div>
          </Section>

          <Section kicker="Role Wise Summary" title={filters.positionLabel || "All Positions"}>
            {selectedPosition ? (
              <div className="metric-grid dashboard-metric-grid client-portal-metric-grid">
                {CLIENT_PORTAL_METRICS.map(([key, label]) => (
                  <button key={key} className="metric-card metric-card--button client-portal-metric-card" onClick={() => void openDrilldown({ title: `${clientName} | ${selectedPosition.positionLabel} | ${label}`, metric: key, groupType: "position", params: { positionLabel: selectedPosition.positionLabel } })}>
                    <div className="metric-label">{label}</div>
                    <div className="metric-value">{selectedPosition.metrics?.[key] || 0}</div>
                  </button>
                ))}
              </div>
            ) : null}
            <div className="table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Position</th>
                    {CLIENT_PORTAL_METRICS.map(([, label]) => <th key={label}>{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {positionRows.map((row) => (
                    <tr key={`${row.clientLabel}-${row.positionLabel}`}>
                      <td><button className="table-metric-btn table-metric-btn--label" onClick={() => setFilters((current) => ({ ...current, positionLabel: row.positionLabel }))}>{row.positionLabel}</button></td>
                      {CLIENT_PORTAL_METRICS.map(([key, label]) => (
                        <td key={key}>
                          <button className="table-metric-btn" onClick={() => void openDrilldown({ title: `${clientName} | ${row.positionLabel} | ${label}`, metric: key, groupType: "position", params: { positionLabel: row.positionLabel } })}>
                            {row.metrics?.[key] || 0}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {!positionRows.length ? <tr><td colSpan={CLIENT_PORTAL_METRICS.length + 1}><div className="empty-state compact-empty">No shared profiles found for this view.</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          </Section>
          <footer className="portal-footer portal-footer--content">{COMPANY_ATTRIBUTION}</footer>
        </div>

        <DrilldownModal
          open={drilldownState.open}
          title={drilldownState.title}
          items={drilldownState.items}
          onClose={() => setDrilldownState({ open: false, title: "", items: [], request: null })}
          onOpenAssessment={(item) => setProfileItem(item)}
          onAddFeedback={(item) => setClientFeedbackItem(item)}
          extraActions={(
            <div className="button-row tight client-tracker-actions">
              <button onClick={() => void copyClientTrackerRows()}>Copy tracker</button>
              <button className="ghost-btn" onClick={() => downloadClientTrackerRows()}>Download tracker</button>
            </div>
          )}
        />
        <ClientFeedbackModal open={Boolean(clientFeedbackItem)} item={clientFeedbackItem} onClose={() => setClientFeedbackItem(null)} onSave={(payload) => void saveFeedback(payload)} />
        <ClientProfileModal
          open={Boolean(profileItem)}
          item={profileItem}
          onClose={() => setProfileItem(null)}
          copySettings={clientCopySettings}
          presetId={clientTrackerPresetId}
          onOpenCv={(item) => openClientCv(item)}
        />
      </main>
    </div>
  );
}

export default function App() {
  const clientPortalUrl = isClientPortalUrl();
  const [authMode, setAuthMode] = useState(() => clientPortalUrl ? "client" : "recruiter");
  const [token, setToken] = useState(() => clientPortalUrl
    ? (window.localStorage.getItem(CLIENT_TOKEN_KEY) || "")
    : (window.localStorage.getItem(TOKEN_KEY) || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const forcedMode = clientPortalUrl ? "client" : "recruiter";
    setAuthMode(forcedMode);
    setToken(clientPortalUrl
      ? (window.localStorage.getItem(CLIENT_TOKEN_KEY) || "")
      : (window.localStorage.getItem(TOKEN_KEY) || ""));
  }, [clientPortalUrl]);

  useEffect(() => {
    document.title = clientPortalUrl ? CLIENT_BROWSER_TITLE : RECRUITER_BROWSER_TITLE;
  }, [clientPortalUrl]);

  async function loginRecruiter({ email, password }) {
    try {
      setBusy(true);
      setError("");
      const result = await api("/auth/login", "", "POST", { email, password });
      localStorage.setItem(TOKEN_KEY, result.token || "");
      localStorage.removeItem(CLIENT_TOKEN_KEY);
      localStorage.setItem(AUTH_MODE_KEY, "recruiter");
      setAuthMode("recruiter");
      setToken(result.token || "");
    } catch (loginError) {
      setError(String(loginError?.message || loginError));
    } finally {
      setBusy(false);
    }
  }

  async function loginClientUser({ username, password }) {
    try {
      setBusy(true);
      setError("");
      const result = await api("/client-auth/login", "", "POST", { username, password });
      localStorage.setItem(CLIENT_TOKEN_KEY, result.token || "");
      localStorage.removeItem(TOKEN_KEY);
      localStorage.setItem(AUTH_MODE_KEY, "client");
      setAuthMode("client");
      setToken(result.token || "");
    } catch (loginError) {
      setError(String(loginError?.message || loginError));
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CLIENT_TOKEN_KEY);
    localStorage.removeItem(AUTH_MODE_KEY);
    setAuthMode(clientPortalUrl ? "client" : "recruiter");
    setToken("");
  }

  if (!token) return <LoginScreen onRecruiterLogin={loginRecruiter} onClientLogin={loginClientUser} busy={busy} error={error} clientOnly={clientPortalUrl} />;
  return authMode === "client"
    ? <PortalErrorBoundary><ClientPortalApp token={token} onLogout={logout} /></PortalErrorBoundary>
    : <PortalErrorBoundary><PortalApp token={token} onLogout={logout} /></PortalErrorBoundary>;
}
