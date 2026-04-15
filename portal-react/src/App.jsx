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
      { to: "/jobs", label: "Jobs" }
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
  clientShareSignatureLinkUrl2: ""
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
  recruiter: "",
  gender: ""
};

const DASHBOARD_METRIC_COLUMNS = [
  ["sourced", "Sourced"],
  ["applied", "Applied"],
  ["converted", "Shared"],
  ["under_interview_process", "Under Interview"],
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
  const meta = decodePortalApplicantMetadata(candidate);
  const draftPayload = parsePortalObjectField(candidate?.draft_payload || candidate?.draftPayload);
  const screeningAnswers = parsePortalObjectField(candidate?.screening_answers || candidate?.screeningAnswers);
  return {
    ...draftPayload,
    jdScreeningAnswers: Object.keys(screeningAnswers).length
      ? screeningAnswers
      : draftPayload?.jdScreeningAnswers && typeof draftPayload.jdScreeningAnswers === "object"
        ? draftPayload.jdScreeningAnswers
        : meta?.jdScreeningAnswers || {}
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
  const meta = decodePortalApplicantMetadata(item);
  const storedFile = item.cvAnalysis?.storedFile || item.cv_analysis?.storedFile || meta?.cvAnalysisCache?.storedFile || {};
  return Boolean(
    item.cv_url
    || item.cvUrl
    || item.cv_key
    || item.cvKey
    || item.cv_filename
    || item.cvFilename
    || meta?.fileProvider
    || meta?.fileKey
    || meta?.fileUrl
    || storedFile?.key
    || storedFile?.url
  );
}

function getCandidateProfileCvMeta(item = {}) {
  const meta = decodePortalApplicantMetadata(item);
  const storedFile = item.cvAnalysis?.storedFile || item.cv_analysis?.storedFile || meta?.cvAnalysisCache?.storedFile || {};
  return {
    candidateId: item.candidate_id || item.candidateId || item.id || "",
    url: item.cv_url || item.cvUrl || meta?.fileUrl || storedFile?.url || "",
    filename: item.cv_filename || item.cvFilename || meta?.filename || storedFile?.filename || "",
    key: item.cv_key || item.cvKey || meta?.fileKey || storedFile?.key || "",
    provider: item.cv_provider || item.cvProvider || meta?.fileProvider || storedFile?.provider || ""
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
  if (linkedAssessment) return true;
  return Boolean(
    applicant?.usedInAssessment ||
    applicant?.used_in_assessment ||
    String(applicant?.assessmentId || applicant?.assessment_id || "").trim() ||
    linkedCandidate?.used_in_assessment ||
    linkedCandidate?.usedInAssessment ||
    String(linkedCandidate?.assessment_id || linkedCandidate?.assessmentId || "").trim()
  );
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
  const otherStandardQuestions = String(item.other_standard_questions || item.last_contact_notes || "").trim();
  const reasonOfChangeValue = buildReasonOfChangeForExport(item);
  const meta = decodePortalApplicantMetadata(item);
  const cvResult = meta?.cvAnalysisCache?.result && typeof meta.cvAnalysisCache.result === "object" ? meta.cvAnalysisCache.result : null;
  const highlights = Array.isArray(item.cv_highlights)
    ? item.cv_highlights
    : Array.isArray(item.highlights)
      ? item.highlights
      : Array.isArray(item.cvAnalysis?.highlights)
        ? item.cvAnalysis.highlights
        : Array.isArray(cvResult?.highlights)
          ? cvResult.highlights
          : [];
  const strongPoints = highlights.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 2);
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
    const answer = normalizedLine
      .slice(separatorIndex + 1)
      .replace(/^[\s:\-]+/, "")
      .trim();
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

function MultiSelectDropdown({ label, options, selected, onToggle, allowAll = true, emptySummary = "" }) {
  const summary = !selected.length ? (emptySummary || `All ${label.toLowerCase()}`) : `${selected.length} selected`;
  return (
    <details className="filter-dropdown">
      <summary className="filter-dropdown__summary">
        <span>{label}</span>
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
  const [jdTitle, setJdTitle] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) return;
    setRecruiterId("");
    setJdTitle(applicant?.jd_title || applicant?.jdTitle || "");
    setStatus("");
  }, [open, applicant?.id]);

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
        <label><span>JD / role</span><select value={jdTitle} onChange={(e) => setJdTitle(e.target.value)}><option value="">Select JD / role</option>{jobs.map((job) => <option key={job.id} value={job.title}>{job.title}</option>)}</select></label>
        {status ? <div className="status">{status}</div> : null}
        <div className="button-row">
          <button onClick={async () => { if ((allowRecruiterSelect && !recruiterId) || !jdTitle) { setStatus(allowRecruiterSelect ? "Select recruiter and JD first." : "Select JD first."); return; } setStatus("Saving assignment..."); try { await onSave({ recruiterId, jdTitle }); } catch (error) { setStatus(String(error?.message || error)); } }}>Save assignment</button>
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
  }, [open, candidate?.id]);

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
  }, [open, assessment?.id]);

  useEffect(() => {
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
              setInferText((current) => syncAssessmentNotesWithStatus(current, candidateStatus, expectedDoj || atValue, { offerAmount: nextValue }));
            }} placeholder="25 L" />
          </label>
        ) : null}
        <label>
          <span>Infer box</span>
          <textarea value={inferText} onChange={(e) => setInferText(e.target.value)} placeholder="Write only the new status update here, e.g. L1 aligned tomorrow 5 PM, screening reject, CV shared." />
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
                  <div className="candidate-snippet">{[item.pipelineStage ? `Pipeline: ${item.pipelineStage}` : "", item.candidateStatus ? `Status: ${item.candidateStatus}` : "", item.followUpAt ? `Follow-up: ${new Date(item.followUpAt).toLocaleString()}` : "", item.interviewAt ? `Interview: ${new Date(item.interviewAt).toLocaleString()}` : ""].filter(Boolean).join("\n")}</div>
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

function CandidateProfileModal({ open, candidate, onClose, onOpenCv, onReuse }) {
  if (!open || !candidate) return null;
  const cvMeta = getCandidateProfileCvMeta(candidate);
  const tags = buildVisibleTagList(candidate);
  const questionAnswers = getAssessmentQuestionAnswers(candidate);
  const noteFields = [
    candidate.other_pointers,
    candidate.otherPointers,
    candidate.recruiter_context_notes,
    candidate.recruiterNotes,
    candidate.notes,
    candidate.callbackNotes,
    candidate.last_contact_notes,
    String(candidate.raw_note || "").trim().startsWith(PORTAL_APPLICANT_METADATA_PREFIX) ? "" : candidate.raw_note
  ].map((item) => String(item || "").trim()).filter(Boolean);
  const uniqueNotes = Array.from(new Set(noteFields));
  const detailCards = [
    ["Current Status", candidate.assessment_status || candidate.outcome || candidate.status || "-"],
    ["Experience", candidate.total_experience || candidate.totalExperience || candidate.experience || "-"],
    ["Current company", candidate.current_company || candidate.currentCompany || candidate.company || "-"],
    ["Current Designation", candidate.current_designation || candidate.currentDesignation || candidate.role || "-"],
    ["Location", candidate.location || "-"],
    ["Notice Period", candidate.notice_period || candidate.noticePeriod || "-"],
    ["Current CTC", candidate.current_ctc || candidate.currentCtc || "-"],
    ["Expected CTC", candidate.expected_ctc || candidate.expectedCtc || "-"],
    ["Offer in Hand", candidate.offer_in_hand || candidate.offerInHand || "-"],
    ["LWD / DOJ", candidate.lwd_or_doj || candidate.lwdOrDoj || "-"]
  ].filter(([, value]) => value && value !== "-");
  return (
    <div className="overlay">
      <div className="overlay-card overlay-card--wide" onClick={(e) => e.stopPropagation()}>
        <h3>{candidate.name || candidate.candidateName || "Candidate"}</h3>
        <p className="muted">{[candidate.jd_title || candidate.jdTitle || candidate.role || "", candidate.client_name || candidate.clientName || "", candidate.current_company || candidate.currentCompany || candidate.company || ""].filter(Boolean).join(" | ")}</p>
        <div className="info-grid">
          {detailCards.map(([label, value]) => (
            <div className="info-card" key={label}>
              <div className="info-label">{label}</div>
              <div className="info-value">{value}</div>
            </div>
          ))}
        </div>
        {questionAnswers.length ? (
          <div className="client-profile-notes">
            <div className="info-label">Screening Questions</div>
            <div className="client-profile-qa">
              {questionAnswers.map((pair, index) => (
                <div className="client-profile-qa__item" key={`${pair.question}-${index}`}>
                  <strong>{pair.question}</strong>
                  <span>{pair.answer}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {tags.length ? (
          <div className="candidate-detail-box">
            <div className="metric-label">Tags / searchable keywords</div>
            <div className="chip-row">
              {tags.map((tag) => <span key={tag} className="chip">{tag}</span>)}
            </div>
          </div>
        ) : null}
        <div className="candidate-detail-box">
          <div className="metric-label">Remarks / notes</div>
          {uniqueNotes.length ? uniqueNotes.map((note, index) => <p key={`${note}-${index}`}>{note}</p>) : <p className="muted">No remarks saved yet.</p>}
        </div>
        <div className="candidate-detail-box">
          <div className="metric-label">CV</div>
          {candidateHasStoredCv(candidate) ? (
            <p>{cvMeta.filename || "Uploaded CV"} is available for this profile.</p>
          ) : (
            <p className="muted">No uploaded CV available yet.</p>
          )}
        </div>
        <div className="button-row">
          {onReuse ? <button onClick={() => onReuse(candidate)}>Reuse profile</button> : null}
          {candidateHasStoredCv(candidate) ? <button onClick={() => onOpenCv(candidate)}>Open CV</button> : null}
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
  const otherPointers = String(assessment.otherPointers || item.otherPointers || candidate.other_pointers || "").trim();
  const questionAnswers = getAssessmentQuestionAnswers(assessment);
  const hasCv = clientPortalItemHasCv(item);
  const trackerRows = buildClientPortalTrackerRows([item], assessmentId && hasCv ? { [assessmentId]: "Open CV from client portal" } : {});
  const trackerPreview = buildCapturedExcelRows(trackerRows, presetId || copySettings.excelPreset, copySettings);
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card overlay-card--wide" onClick={(e) => e.stopPropagation()}>
        <h3>{assessment.candidateName || item.candidateName || "Candidate"}</h3>
        <p className="muted">{[assessment.jdTitle || item.position || item.role || "", assessment.clientName || item.clientName || "", assessment.currentCompany || item.company || ""].filter(Boolean).join(" | ")}</p>
        <div className="info-grid">
          {[["Current Status", formatClientPortalStatusLabel(assessment.candidateStatus) || "-"],["Experience", assessment.totalExperience || item.totalExperience || "-"],["Current company", assessment.currentCompany || item.company || "-"],["Current Designation", assessment.currentDesignation || item.role || "-"],["Location", assessment.location || item.location || "-"],["Notice Period", assessment.noticePeriod || item.noticePeriod || "-"],["Current CTC", assessment.currentCtc || item.currentCtc || "-"],["Expected CTC", assessment.expectedCtc || item.expectedCtc || "-"],["Offer in Hand", assessment.offerInHand || assessment.offerAmount || item.offerInHand || "-"],["LWD / DOJ", assessment.lwdOrDoj || assessment.offerDoj || item.lwdOrDoj || "-"]].filter(([, value]) => value && value !== "-").map(([label, value]) => (
            <div className="info-card" key={label}>
              <div className="info-label">{label}</div>
              <div className="info-value">{value || "-"}</div>
            </div>
          ))}
        </div>
        {questionAnswers.length ? (
          <div className="client-profile-notes">
            <div className="info-label">Screening Questions</div>
            <div className="client-profile-qa">
              {questionAnswers.map((pair, index) => (
                <div className="client-profile-qa__item" key={`${pair.question}-${index}`}>
                  <strong>{pair.question}</strong>
                  <span>{pair.answer}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {otherPointers ? (
          <div className="client-profile-notes">
            <div className="info-label">Other Pointers</div>
            <div className="client-profile-notes__body">{otherPointers}</div>
          </div>
        ) : null}
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
          <button className="ghost-btn" onClick={onClose}>Close</button>
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
  const [candidateSearchMode, setCandidateSearchMode] = useState("all");
  const [candidateSearchText, setCandidateSearchText] = useState("");
  const [candidateAiQueryMode, setCandidateAiQueryMode] = useState("natural");
  const [candidateSearchResults, setCandidateSearchResults] = useState([]);
  const [candidatePage, setCandidatePage] = useState(1);
  const [candidateStructuredFilters, setCandidateStructuredFilters] = useState(EMPTY_CANDIDATE_STRUCTURED_FILTERS);
  const [clientShareDraft, setClientShareDraft] = useState({
    hrName: "",
    recruiterName: "",
    recipientEmail: "",
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
  const [agendaRange, setAgendaRange] = useState("today");
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
  const loadWorkspaceRef = useRef(null);
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

  async function loadDashboardSummary(filters = dashboardFilters) {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.clientLabel) params.set("clientLabel", filters.clientLabel);
    if (filters.recruiterLabel) params.set("recruiterLabel", filters.recruiterLabel);
    const dashboardResult = await api(`/company/dashboard${params.toString() ? `?${params.toString()}` : ""}`, token);
    setState((current) => ({ ...current, dashboard: dashboardResult || {} }));
  }

  async function loadClientPortalSummary(filters = clientPortalFilters) {
    const params = new URLSearchParams();
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    if (filters.clientLabel) params.set("clientLabel", filters.clientLabel);
    const clientPortalResult = await api(`/company/client-portal${params.toString() ? `?${params.toString()}` : ""}`, token);
    setState((current) => ({ ...current, clientPortal: clientPortalResult || {} }));
  }

  async function loadWorkspace() {
    await api("/company/candidates/backfill-assessment-links", token, { method: "POST" }).catch(() => null);
    await api("/company/candidates/backfill-skills", token, { method: "POST" }).catch(() => null);
    const [userResult, dashboardResult, clientPortalResult, applicantsResult, intakeResult, jobsResult, usersResult, clientUsersResult, candidatesResult, databaseCandidatesResult, assessmentsResult, sharedPresetResult] = await Promise.all([
      api("/auth/me", token),
      api("/company/dashboard", token),
      api("/company/client-portal", token).catch(() => ({ summary: { byClient: [], byClientPosition: [] }, availableClients: [] })),
      api("/company/applicants", token).catch(() => ({ items: [] })),
      api("/company/applicant-intake-secret", token).catch(() => null),
      api("/company/jds", token).catch(() => ({ jobs: [] })),
      api("/company/users", token).catch(() => ({ users: [] })),
      api("/company/client-users", token).catch(() => ({ clientUsers: [] })),
      api("/candidates", token).catch(() => []),
      api("/candidates?scope=company&limit=5000", token).catch(() => []),
      api("/company/assessments", token).catch(() => ({ assessments: [] })),
      api("/company/shared-export-presets", token).catch(() => null)
    ]);
    setState({
      user: userResult.user || userResult,
      dashboard: dashboardResult || {},
      clientPortal: clientPortalResult || {},
      applicants: applicantsResult.items || [],
      intake: intakeResult || {},
      jobs: jobsResult.jobs || [],
      users: usersResult.users || [],
      candidates: Array.isArray(candidatesResult) ? candidatesResult : [],
      databaseCandidates: Array.isArray(databaseCandidatesResult) ? databaseCandidatesResult : Array.isArray(candidatesResult) ? candidatesResult : [],
      assessments: assessmentsResult.assessments || []
    });
    setClientUsers(clientUsersResult.clientUsers || []);
    if (sharedPresetResult) {
      setCopySettings((current) => migrateCopySettings({ ...current, ...sharedPresetResult }));
    }
    setStatus("workspace", "Portal loaded.", "ok");
  }

  loadWorkspaceRef.current = loadWorkspace;

  async function refreshWorkspaceSilently(reason = "manual") {
    if (!token || workspaceRefreshInFlightRef.current) return;
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
  }, [state.assessments, state.candidates, assessmentFilters]);

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
        return shareKey && (item.cv_key || item.cv_url || item.candidate_id) && !clientShareCvLinkState[shareKey];
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
          return [shareKey, result.url, "ready"];
        } catch {
          return [shareKey, "", "missing"];
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
    }
    void loadCvLinks();
  }, [selectedAssessmentRows, token]);
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
      const genderValue = String(item.gender || "").trim();
      if (candidateStructuredFilters.minExperience && (years == null || years < minYears)) return false;
      if (candidateStructuredFilters.maxExperience && (years == null || years > maxYears)) return false;
      if (candidateStructuredFilters.location && !locationHay.includes(String(candidateStructuredFilters.location).trim().toLowerCase())) return false;
      if (candidateStructuredFilters.keySkills) {
        const requiredSkills = splitSearchKeywords(candidateStructuredFilters.keySkills);
        if (requiredSkills.length && !requiredSkills.every((term) => skillsHay.includes(term))) return false;
      }
      if (candidateStructuredFilters.currentCompany && !companyHay.includes(String(candidateStructuredFilters.currentCompany).trim().toLowerCase())) return false;
      if (candidateStructuredFilters.client && clientValue !== candidateStructuredFilters.client) return false;
      if (candidateStructuredFilters.minCurrentCtc && (currentCtc == null || currentCtc < minCurrentCtc)) return false;
      if (candidateStructuredFilters.maxCurrentCtc && (currentCtc == null || currentCtc > maxCurrentCtc)) return false;
      if (candidateStructuredFilters.minExpectedCtc && (expectedCtc == null || expectedCtc < minExpectedCtc)) return false;
      if (candidateStructuredFilters.maxExpectedCtc && (expectedCtc == null || expectedCtc > maxExpectedCtc)) return false;
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
      const matchedAssessment = capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase());
      const sourceValue = String(item.source || "").trim();
      const isInboundApplicant = sourceValue === "website_apply" || sourceValue === "hosted_apply" || sourceValue === "google_sheet";
      if (isInboundApplicant) continue;
      if (matchedAssessment || item.used_in_assessment) continue;
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
    const convertedCount = capturedNotesUniverse.filter((item) => {
      const matchedAssessment = capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase());
      return Boolean(matchedAssessment || item.used_in_assessment);
    }).length;
    const activeCount = capturedNotesUniverse.filter((item) => {
      const matchedAssessment = capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase());
      if (matchedAssessment || item.used_in_assessment) return false;
      return !item.hidden_from_captured;
    }).length;
    return {
      today: capturedNotesUniverse.filter((item) => String(item.created_at || "").slice(0, 10) === todayKey).length,
      total: capturedNotesUniverse.length,
      active: activeCount,
      converted: convertedCount
    };
  }, [capturedAssessmentMap, capturedNotesUniverse]);

  const capturedCandidates = useMemo(() => {
    return capturedNotesUniverse.filter((item) => {
      const matchedAssessment = capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase());
      if (matchedAssessment || item.used_in_assessment) return false;
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
      const activeOk = !candidateFilters.activeStates.length ? activeValue === "Active" : candidateFilters.activeStates.includes(activeValue);
      const searchNameMatch = Boolean(queryText && nameHay.includes(queryText));
      const inactiveBlockedByDefault = !candidateFilters.activeStates.length && activeValue === "Inactive" && !searchNameMatch;
      const hiddenBlocked = manuallyHidden && !searchNameMatch && candidateFilters.activeStates.includes("Active");
      return !inactiveBlockedByDefault && !hiddenBlocked && queryOk && dateFromOk && dateToOk && clientOk && jdOk && assignedToOk && capturedByOk && sourceOk && outcomeOk && activeOk;
    });
  }, [candidateFilters, capturedAssessmentMap, capturedNotesUniverse]);

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

  const applicantAssessmentMap = useMemo(() => {
    const map = new Map();
    filteredApplicants.forEach((item) => {
      const linkedCandidate = applicantCandidateMap.get(String(item.id)) || null;
      const applicantId = String(item.id || "").trim();
      const candidateId = String(linkedCandidate?.id || item.candidateId || item.candidate_id || item.id || "").trim();
      const applicantName = String(item.candidateName || linkedCandidate?.name || "").trim().toLowerCase();
      const applicantJd = String(item.jdTitle || item.jd_title || linkedCandidate?.jd_title || "").trim().toLowerCase();
      const match = (state.assessments || []).find((assessment) => {
        const assessmentCandidateId = String(assessment.candidateId || assessment.candidate_id || "").trim();
        if (assessmentCandidateId && (assessmentCandidateId === candidateId || assessmentCandidateId === applicantId)) return true;
        const sameName = applicantName && String(assessment.candidateName || "").trim().toLowerCase() === applicantName;
        const sameJd = !applicantJd || String(assessment.jdTitle || assessment.jd_title || "").trim().toLowerCase() === applicantJd;
        return sameName && sameJd;
      }) || null;
      map.set(String(item.id), match);
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
    const owned = visibleApplicants.filter((item) => getApplicantOwnerLabel(item, applicantCandidateMap.get(String(item.id)) || null) !== "Unassigned").length;
    const unassigned = visibleApplicants.length - owned;
    return {
      today: visibleApplicants.filter((item) => String(item.createdAt || item.created_at || "").slice(0, 10) === todayKey).length,
      owned,
      unassigned,
      manualAssigned: visibleApplicants.filter((item) => getApplicantManualAssigneeLabel(item, applicantCandidateMap.get(String(item.id)) || null)).length,
      total: visibleApplicants.length
    };
  }, [applicantCandidateMap, visibleApplicants]);

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
      linkedin: applicant.linkedin || "",
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

  async function saveCapturedAssignment({ recruiterId, jdTitle }) {
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const effectiveRecruiterId = isAdmin ? String(recruiterId || "").trim() : String(state.user?.id || "").trim();
    const recruiter = (state.users || []).find((user) => String(user.id) === String(effectiveRecruiterId));
    await patchCandidate(assignCandidateId, {
      assigned_to_user_id: effectiveRecruiterId,
      assigned_to_name: recruiter?.name || state.user?.name || "",
      jd_title: jdTitle
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
    await loadWorkspace();
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
    await loadWorkspace();
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
    await loadWorkspace();
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
    const candidateAssessmentId = String(candidate.assessment_id || candidate.assessmentId || "").trim();
    const matched = (state.assessments || []).find((item) => {
      const assessmentId = String(item?.id || "").trim();
      const assessmentCandidateId = String(item?.candidateId || item?.candidate_id || "").trim();
      if (candidateAssessmentId && assessmentId && candidateAssessmentId === assessmentId) return true;
      if (assessmentCandidateId && String(candidate.id || "").trim() === assessmentCandidateId) return true;
      return false;
    });
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
    const matchedCandidate = (state.candidates || []).find((item) => {
      if (assessment?.candidateId && String(item.id) === String(assessment.candidateId)) return true;
      return String(item.name || "").trim().toLowerCase() === String(assessment?.candidateName || "").trim().toLowerCase();
    });
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
    const candidateName = candidate?.name || sourceApplicant?.candidateName || "";
    const matched = (state.assessments || []).find((item) =>
      String(item.candidateId || "") === String(candidate?.id || sourceApplicant?.id || "") ||
      String(item.candidateName || "").trim().toLowerCase() === String(candidate?.name || sourceApplicant?.candidateName || "").trim().toLowerCase()
    );
    if (matched) {
      openSavedAssessment(matched);
      return;
    }

    if (!window.confirm(`Create assessment for ${candidateName || "this candidate"}? This will move the record out of the active ${sourceApplicant ? "Applied Candidates" : "Captured Notes"} list.`)) {
      return;
    }

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
      candidateId: String(candidate?.id || sourceApplicant?.id || ""),
      candidateName,
      phoneNumber: candidate?.phone || sourceApplicant?.phone || "",
      emailId: candidate?.email || sourceApplicant?.email || "",
      location: candidate?.location || sourceApplicant?.location || "",
      currentCtc: candidate?.current_ctc || sourceApplicant?.currentCtc || "",
      expectedCtc: candidate?.expected_ctc || sourceApplicant?.expectedCtc || "",
      noticePeriod: candidate?.notice_period || sourceApplicant?.noticePeriod || "",
      offerInHand: candidate?.offer_in_hand || "",
      lwdOrDoj: sanitizeLwdOrDojValue(candidate?.lwd_or_doj || ""),
      currentCompany: candidate?.company || sourceApplicant?.currentCompany || "",
      currentDesignation: candidate?.role || sourceApplicant?.currentDesignation || "",
      totalExperience: candidate?.experience || sourceApplicant?.totalExperience || "",
      relevantExperience: "",
      highestEducation: candidate?.highest_education || "",
      currentOrgTenure: candidate?.current_org_tenure || "",
      reasonForChange: candidate?.reason_of_change || "",
      clientName: candidate?.client_name || sourceApplicant?.clientName || "",
      jdTitle: candidate?.jd_title || sourceApplicant?.jdTitle || "",
      pipelineStage: "Submitted",
      candidateStatus: "CV shared",
      followUpAt: "",
      interviewAt: "",
      recruiterNotes: candidate?.recruiter_context_notes || sourceApplicant?.screeningAnswers || "",
      callbackNotes: candidate?.notes || "",
      otherPointers: candidate?.other_pointers || "",
      tags: Array.isArray(candidate?.skills) ? candidate.skills.join(", ") : "",
      jdScreeningAnswers: {},
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
    const savedAssessment = await api("/company/assessments", token, "POST", { assessment });
    if (candidate?.id) {
      await api("/candidates/link-assessment", token, "POST", {
        id: candidate.id,
        assessmentId: savedAssessment?.id || assessment.id
      }).catch(() => null);
    }
    await loadWorkspace();
    navigate("/assessments");
    setStatus("assessments", `Converted ${candidateName || "candidate"} into assessment.`, "ok");
  }

  async function saveAssessment() {
    const canonicalInitialStatus = normalizeAssessmentStatusLabel(interviewForm.candidateStatus);
    const normalizedInitialStatus = canonicalInitialStatus.toLowerCase();
    const initialStatus = !normalizedInitialStatus || normalizedInitialStatus === "screening in progress"
      ? "CV shared"
      : canonicalInitialStatus;
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
      const existingCandidate = (state.candidates || []).find((item) => String(item.id) === String(interviewMeta.candidateId));
      const existingMeta = decodePortalApplicantMetadata(existingCandidate || {});
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
          ...existingMeta,
          jdScreeningAnswers: interviewForm.jdScreeningAnswers || {}
        })
      });
      setStatus("interview", "Assessment saved and candidate details updated.", "ok");
    } else {
      await loadWorkspace();
      setStatus("interview", "Assessment saved.", "ok");
    }
  }

  async function saveInterviewDraft() {
    if (!interviewMeta.candidateId) {
      setStatus("interview", "Open an existing draft first to save recruiter edits.", "error");
      return;
    }
    setStatus("interview", "Saving draft...");
    const existingCandidate = (state.candidates || []).find((item) => String(item.id) === String(interviewMeta.candidateId));
    const existingMeta = decodePortalApplicantMetadata(existingCandidate || {});
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
        ...existingMeta,
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
    await loadWorkspace();
    setStatus("interview", "Draft saved.", "ok");
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
    if (!candidateSearchText.trim()) {
      setCandidateSearchMode("all");
      setCandidateSearchResults([]);
      setCandidatePage(1);
      setStatus("workspace", "Showing candidates using structured filters.", "ok");
      return;
    }
    const mode = candidateAiQueryMode === "natural" ? "ai" : "boolean";
    const semanticEnabled = copySettings.semanticSearchEnabled !== false;
    const result = await api(
      `/company/candidates/search-natural?q=${encodeURIComponent(candidateSearchText)}&mode=${encodeURIComponent(mode)}&semantic=${semanticEnabled ? "1" : "0"}`,
      token
    );
    setCandidateSearchResults(result.items || []);
    setCandidateSearchMode("search");
    setCandidatePage(1);
    if (candidateAiQueryMode === "natural" && result.filters) {
      setCandidateStructuredFilters({
        ...EMPTY_CANDIDATE_STRUCTURED_FILTERS,
        minExperience: result.filters.minExperienceYears != null ? String(result.filters.minExperienceYears) : "",
        maxExperience: result.filters.maxExperienceYears != null ? String(result.filters.maxExperienceYears) : "",
        location: result.filters.location || (Array.isArray(result.filters.locations) ? result.filters.locations[0] || "" : ""),
        keySkills: Array.isArray(result.filters.skills) && result.filters.skills.length ? Array.from(new Set(result.filters.skills.flatMap(splitSearchKeywords))).join(", ") : "",
        currentCompany: result.filters.currentCompany || "",
        client: result.filters.client || "",
        minCurrentCtc: result.filters.minCurrentCtcLpa != null ? String(result.filters.minCurrentCtcLpa) : "",
        maxCurrentCtc: result.filters.maxCurrentCtcLpa != null ? String(result.filters.maxCurrentCtcLpa) : "",
        minExpectedCtc: result.filters.minExpectedCtcLpa != null ? String(result.filters.minExpectedCtcLpa) : "",
        maxExpectedCtc: result.filters.maxExpectedCtcLpa != null ? String(result.filters.maxExpectedCtcLpa) : "",
        qualification: result.filters.qualification || "",
        maxNoticeDays: result.filters.maxNoticeDays != null ? String(result.filters.maxNoticeDays) : "",
        recruiter: result.filters.recruiterName || "",
        gender: result.filters.gender || ""
      });
    } else {
      setCandidateStructuredFilters(EMPTY_CANDIDATE_STRUCTURED_FILTERS);
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
      lwd_or_doj: item.lwd_or_doj || item.lwdOrDoj || "",
      offer_in_hand: item.offer_in_hand || item.offerInHand || item.offerAmount || "",
      reason_of_change: buildReasonOfChangeForExport(item),
      created_at: item.created_at || item.createdAt || "",
      skills: Array.isArray(item.skills) ? item.skills : (Array.isArray(item.inferredTags) ? item.inferredTags : []),
      domain_industry: item.domain_industry || item.domainIndustry || "",
      current_org_tenure: item.current_org_tenure || item.currentOrgTenure || "",
      assigned_to_name: item.assigned_to_name || item.assignedToName || item.recruiterName || "",
      recruiter_name: item.assigned_to_name || item.assignedToName || item.recruiter_name || item.recruiterName || "",
      recruiter_context_notes: item.recruiter_context_notes || item.recruiterNotes || "",
      other_pointers: item.other_pointers || item.otherPointers || "",
      notes: item.notes || item.callbackNotes || "",
      other_standard_questions: item.notes || item.callbackNotes || "",
      combined_assessment_insights: buildCombinedAssessmentInsightsForExportV2({
        recruiter_context_notes: item.recruiter_context_notes || item.recruiterNotes || "",
        other_pointers: item.other_pointers || item.otherPointers || "",
        other_standard_questions: item.notes || item.callbackNotes || ""
      }),
      draft_payload: item.draft_payload || item.draftPayload || {},
      screening_answers: item.screening_answers || item.screeningAnswers || {},
      raw_note: item.raw_note || item.rawNote || "",
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
    const signatureText = String(clientShareDraft.signatureText || "").trim()
      || fillClientShareTemplate(copySettings.clientShareSignatureText || DEFAULT_COPY_SETTINGS.clientShareSignatureText || "", context).trim();
    const links = [
      {
        label: String(clientShareDraft.signatureLinkLabel || copySettings.clientShareSignatureLinkLabel || "").trim(),
        url: String(clientShareDraft.signatureLinkUrl || copySettings.clientShareSignatureLinkUrl || "").trim()
      },
      {
        label: String(clientShareDraft.signatureLinkLabel2 || copySettings.clientShareSignatureLinkLabel2 || "").trim(),
        url: String(clientShareDraft.signatureLinkUrl2 || copySettings.clientShareSignatureLinkUrl2 || "").trim()
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
    const effectiveAtValue = isOffered
      ? (payload?.expectedDoj || inferred.expectedDoj || payload?.atValue || "")
      : isJoined
        ? (payload?.dateOfJoining || inferred.dateOfJoining || payload?.atValue || "")
        : (inferred.atValue || payload?.atValue || "");
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
    }
    await loadWorkspace();
    if (options.closeModal !== false) setAssessmentStatusId("");
    setStatus(statusTarget, `Updated status for ${assessment?.candidateName || "candidate"}.`, "ok");
  }

  async function deleteAssessmentItem(assessment) {
    if (!window.confirm(`Delete assessment for ${assessment?.candidateName || "candidate"}?`)) return;
    await api("/company/assessments", token, "DELETE", { assessmentId: assessment?.id });
    await loadWorkspace();
    setStatus("assessments", "Assessment deleted.", "ok");
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
      currentCtc: assessment?.currentCtc || "",
      expectedCtc: assessment?.expectedCtc || "",
      noticePeriod: assessment?.noticePeriod || "",
      offerInHand: assessment?.offerInHand || "",
      currentCompany: assessment?.currentCompany || "",
      currentDesignation: assessment?.currentDesignation || "",
      totalExperience: assessment?.totalExperience || "",
      relevantExperience: assessment?.relevantExperience || "",
      currentOrgTenure: assessment?.currentOrgTenure || "",
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
  const overdueFollowUps = (state.candidates || []).filter((item) => {
    const value = item?.next_follow_up_at ? new Date(item.next_follow_up_at) : null;
    return value && value >= oneDayAgoStart && value < todayStart;
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
  const pendingNotes = (state.candidates || []).filter((item) => {
    const sourceValue = String(item.source || "").trim();
    if (["website_apply", "hosted_apply", "google_sheet"].includes(sourceValue)) return false;
    const matchedAssessment = capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase());
    if (matchedAssessment || item.used_in_assessment || String(item.assessment_id || "").trim()) return false;
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
      action: () => loadCandidateIntoInterview(item.id)
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
      action: () => openSavedAssessment(item)
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
                              <button onClick={() => loadCandidateIntoInterview(item.id)}>Update</button>
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
                              onClick={() => void openDashboardDrilldown({ title: `${group.label} | ${row.positionLabel}`, metric: "sourced", groupType: "position", params: { clientLabel: group.label, positionLabel: row.positionLabel } })}
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
                            <p className="muted">
                              {`Sourcing: ${group.ownership?.assignedSourcing || 0} assigned | ${group.ownership?.selfSourced || 0} self sourced`}
                            </p>
                            <p className="muted">
                              {`Applicants: ${group.ownership?.assignedApplicants || 0} assigned | ${group.ownership?.directApplicants || 0} direct`}
                            </p>
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
                    setCandidateStructuredFilters(EMPTY_CANDIDATE_STRUCTURED_FILTERS);
                  }}>Reset search</button>
                </div>
                <div className="item-card compact-card candidate-filter-card">
                  <div className="candidate-filter-head">
                    <div>
                      <h3>Structured filters</h3>
                      <p className="muted">Naukri-style filters. AI Search fills these automatically; you can adjust them before copying or downloading results.</p>
                    </div>
                  </div>
                  <div className="candidate-filter-layout">
                    <div className="candidate-filter-column candidate-filter-column--wide">
                      <div className="candidate-filter-group">
                        <div className="candidate-filter-label">Experience</div>
                        <div className="range-row">
                          <input type="number" min="0" value={candidateStructuredFilters.minExperience} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, minExperience: e.target.value }))} placeholder="Min experience" />
                          <span>to</span>
                          <input type="number" min="0" value={candidateStructuredFilters.maxExperience} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, maxExperience: e.target.value }))} placeholder="Max experience" />
                          <span>Years</span>
                        </div>
                      </div>
                      <div className="candidate-filter-group">
                        <div className="candidate-filter-label">Current CTC</div>
                        <div className="range-row">
                          <input type="number" min="0" value={candidateStructuredFilters.minCurrentCtc} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, minCurrentCtc: e.target.value }))} placeholder="Min salary" />
                          <span>to</span>
                          <input type="number" min="0" value={candidateStructuredFilters.maxCurrentCtc} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, maxCurrentCtc: e.target.value }))} placeholder="Max salary" />
                          <span>Lacs</span>
                        </div>
                      </div>
                      <div className="candidate-filter-group">
                        <div className="candidate-filter-label">Expected CTC</div>
                        <div className="range-row">
                          <input type="number" min="0" value={candidateStructuredFilters.minExpectedCtc} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, minExpectedCtc: e.target.value }))} placeholder="Min salary" />
                          <span>to</span>
                          <input type="number" min="0" value={candidateStructuredFilters.maxExpectedCtc} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, maxExpectedCtc: e.target.value }))} placeholder="Max salary" />
                          <span>Lacs</span>
                        </div>
                      </div>
                    </div>
                    <div className="candidate-filter-column">
                      <label><span>Keywords</span><input value={candidateStructuredFilters.keySkills} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, keySkills: e.target.value }))} placeholder="SaaS, sales, B2B, candidate name" /></label>
                      <label><span>Current location</span><input value={candidateStructuredFilters.location} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, location: e.target.value }))} placeholder="Mumbai" /></label>
                      <label><span>Notice under (days)</span><input type="number" min="0" value={candidateStructuredFilters.maxNoticeDays} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, maxNoticeDays: e.target.value }))} placeholder="30" /></label>
                    </div>
                    <div className="candidate-filter-column">
                      <label><span>Current company</span><input value={candidateStructuredFilters.currentCompany} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, currentCompany: e.target.value }))} placeholder="Infosys" /></label>
                      <label><span>Qualification</span><input value={candidateStructuredFilters.qualification} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, qualification: e.target.value }))} placeholder="B.Tech / MBA" /></label>
                      <label><span>Client</span><select value={candidateStructuredFilters.client} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, client: e.target.value }))}><option value="">All clients</option>{candidateSearchOptions.clients.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                    </div>
                    <div className="candidate-filter-column">
                      <label><span>Recruiter</span><select value={candidateStructuredFilters.recruiter} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, recruiter: e.target.value }))}><option value="">All recruiters</option>{candidateSearchOptions.recruiters.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                      <label><span>Gender</span><select value={candidateStructuredFilters.gender} onChange={(e) => setCandidateStructuredFilters((current) => ({ ...current, gender: e.target.value }))}><option value="">All genders</option>{candidateSearchOptions.genders.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                    </div>
                  </div>
                </div>
                <div className="item-card compact-card">
                  <h3>Search examples</h3>
                  <p className="muted">{candidateAiQueryMode === "boolean" ? "Use exact keywords with AND / OR and quoted phrases, similar to Naukri boolean search." : "Write the recruiter query naturally. AI will interpret the statement into structured filters and keywords, then retrieval will run deterministically on saved fields, recruiter notes, other pointers, attempts, tags, and hidden CV metadata."}</p>
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
                <div className="metric-card compact-metric"><div className="metric-label">Applied today</div><div className="metric-value">{applicantStats.today}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Owned</div><div className="metric-value">{applicantStats.owned}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Unassigned</div><div className="metric-value">{applicantStats.unassigned}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Manual assigned</div><div className="metric-value">{applicantStats.manualAssigned}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Total visible</div><div className="metric-value">{applicantStats.total}</div></div>
              </div>
              <p className="muted">Owned means the applicant belongs to a recruiter through the job owner / primary recruiter. Manual assigned means admin manually reassigned it. For admin, Owned + Unassigned = Total visible.</p>
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
                      <button onClick={() => loadApplicantIntoInterview(item.id)}>Open draft</button>
                      <button onClick={() => setNotesCandidateId(item.id)}>Recruiter note</button>
                      <button onClick={() => void openAttempts(item.id)}>Attempts</button>
                      <button onClick={() => void createAssessmentFromCandidate(item.id)}>Create assessment</button>
                      {item.cvFilename ? <button onClick={() => void openCv(item.id)}>Open CV</button> : null}
                      {state.user?.role === "admin" ? <button onClick={() => setAssignApplicantId(item.id)}>Assign</button> : null}
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
                <label><span>Date from</span><input type="date" value={candidateFilters.dateFrom} onChange={(e) => setCandidateFilters((c) => ({ ...c, dateFrom: e.target.value }))} /></label>
                <label><span>Date to</span><input type="date" value={candidateFilters.dateTo} onChange={(e) => setCandidateFilters((c) => ({ ...c, dateTo: e.target.value }))} /></label>
              </div>
              <div className="metric-grid metric-grid--tight">
                <div className="metric-card compact-metric"><div className="metric-label">Today</div><div className="metric-value">{capturedNotesStats.today}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Total notes captured</div><div className="metric-value">{capturedNotesStats.total}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Active</div><div className="metric-value">{capturedNotesStats.active}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Converted</div><div className="metric-value">{capturedNotesStats.converted}</div></div>
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
                  const matchedAssessment = capturedAssessmentMap.get(String(item.name || "").trim().toLowerCase());
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
                        <button onClick={() => loadCandidateIntoInterview(item.id)}>Open draft</button>
                        <button onClick={() => setAssignCandidateId(item.id)}>Assign</button>
                        <button onClick={() => setNotesCandidateId(item.id)}>Recruiter note</button>
                        <button onClick={() => void openAttempts(item.id)}>Attempts</button>
                        <button onClick={() => void createAssessmentFromCandidate(item.id)}>Create assessment</button>
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
                <label><span>Date from</span><input type="date" value={assessmentFilters.dateFrom} onChange={(e) => setAssessmentFilters((current) => ({ ...current, dateFrom: e.target.value }))} /></label>
                <label><span>Date to</span><input type="date" value={assessmentFilters.dateTo} onChange={(e) => setAssessmentFilters((current) => ({ ...current, dateTo: e.target.value }))} /></label>
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
              </div>
              <div className="status-note">Selected for client share: {selectedAssessmentIds.length}</div>
              <div className="stack-list">
                {!filteredAssessments.length ? <div className="empty-state">No assessments saved yet.</div> : filteredAssessments.map((item) => (
                  <article className={`item-card compact-card ${selectedAssessmentIds.includes(String(item.id)) ? "selected-card" : ""}`} key={item.id}>
                    {(() => {
                      const latestStatusPreview = getLatestAssessmentStatusPreview(item);
                      return (
                        <>
                    <div className="assessment-select-row">
                      <label className="checkbox-pill">
                        <input type="checkbox" checked={selectedAssessmentIds.includes(String(item.id))} onChange={() => toggleAssessmentSelection(item.id)} />
                        <span>Select for client share</span>
                      </label>
                    </div>
                    <div className="item-card__top">
                      <div>
                        <h3>{item.candidateName || "Candidate"} | {item.jdTitle || "Untitled role"}</h3>
                        <p className="muted">{[item.pipelineStage || "", normalizeAssessmentStatusLabel(item.candidateStatus) || ""].filter(Boolean).join(" | ")}</p>
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
                      <button onClick={() => openSavedAssessment(item)}>Edit assessment</button>
                      <button onClick={() => setAssessmentStatusId(item.id)}>Update status</button>
                      <button onClick={() => void openAssessmentJourney(item)}>Journey</button>
                      <button onClick={() => openAssessmentWhatsapp(item)}>WhatsApp</button>
                      <button onClick={() => reuseAssessmentAsNew(item)}>Reuse as new</button>
                      <button className="ghost-btn" onClick={() => void deleteAssessmentItem(item)}>Delete</button>
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
                  {[["Candidate", interviewForm.candidateName],["Phone", interviewForm.phoneNumber],["Email", interviewForm.emailId],["LinkedIn", interviewForm.linkedin],["Location", interviewForm.location],["Current company", interviewForm.currentCompany],["Current designation", interviewForm.currentDesignation],["Total experience", interviewForm.totalExperience],["Relevant experience", interviewForm.relevantExperience],["Qualification", interviewForm.highestEducation],["Client", interviewForm.clientName],["JD / role", interviewForm.jdTitle],["Tags", interviewForm.tags]].map(([label, value]) => (
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
                  <label className="full"><span>Cautious indicators to check</span><textarea value={interviewForm.cautiousIndicators} onChange={(e) => setInterviewForm((c) => ({ ...c, cautiousIndicators: e.target.value }))} placeholder="What to verify on call: gaps, stability reason, domain mismatch, missing target metrics..." /></label>
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
                      <label><span>Total experience</span><input value={interviewForm.totalExperience} onChange={(e) => setInterviewForm((c) => ({ ...c, totalExperience: e.target.value }))} /></label>
                      <label><span>Relevant experience</span><input value={interviewForm.relevantExperience} onChange={(e) => setInterviewForm((c) => ({ ...c, relevantExperience: e.target.value }))} /></label>
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
                  <button onClick={() => void copyInterviewResult()}>Copy result</button>
                  <button onClick={() => copyInterviewWhatsapp()}>Copy WhatsApp</button>
                  <button onClick={() => void copyInterviewEmail()}>Copy Email</button>
                  {interviewMeta.candidateId && !interviewMeta.assessmentId ? <button onClick={() => void saveInterviewDraft()}>Save draft</button> : null}
                  <button onClick={() => void saveAssessment()}>{interviewMeta.assessmentId ? "Save assessment" : "Create assessment"}</button>
                  <button onClick={() => sendInterviewToSheets()}>Send to Sheets</button>
                  <button onClick={() => exportInterviewAll()}>Export all</button>
                    <button className="ghost-btn" onClick={() => { setInterviewMeta({ candidateId: "", assessmentId: "" }); setInterviewForm({ candidateName: "", phoneNumber: "", emailId: "", linkedin: "", location: "", currentCtc: "", expectedCtc: "", noticePeriod: "", offerInHand: "", lwdOrDoj: "", currentCompany: "", currentDesignation: "", totalExperience: "", relevantExperience: "", currentOrgTenure: "", reasonForChange: "", cautiousIndicators: "", clientName: "", jdTitle: "", pipelineStage: "Under Interview Process", candidateStatus: "Screening in progress", followUpAt: "", interviewAt: "", recruiterNotes: "", callbackNotes: "", otherPointers: "", tags: "", jdScreeningAnswers: {}, cvAnalysis: null, cvAnalysisApplied: false, statusHistory: [] }); setStatus("interview", ""); }}>Clear draft</button>
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
                  <div className="button-row"><button onClick={() => void copyText(getApplyLink(hostedJobId)).then(() => setStatus("intake", "Hosted apply link copied.", "ok"))}>Copy Apply Link</button></div>
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
                  <button onClick={() => downloadJobDraft()}>Download JD</button>
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

      <AssignModal open={Boolean(assignApplicantId)} applicant={assignApplicant} users={state.users} jobs={state.jobs} onClose={() => setAssignApplicantId("")} onSave={saveApplicantAssignment} />
      <AssignModal
        open={Boolean(assignCandidateId)}
        applicant={assignCandidate}
        users={state.users}
        jobs={state.jobs}
        onClose={() => setAssignCandidateId("")}
        onSave={saveCapturedAssignment}
        title="Assign Draft"
        description="Assign {name} to a JD. Recruiters can map the role for themselves; admins can also assign another recruiter."
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
        onOpenNotes={(candidateId) => { setDrilldownState({ open: false, title: "", items: [], request: null }); setNotesCandidateId(candidateId); }}
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
