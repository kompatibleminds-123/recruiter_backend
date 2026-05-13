import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import PayrollSettingsSection from "./payroll/PayrollSettingsSection";
import PayrollCompensationSection from "./payroll/PayrollCompensationSection";
import PayrollRunsSection from "./payroll/PayrollRunsSection";
import PayrollFbpSection from "./payroll/PayrollFbpSection";
import PayrollPayslipsSection from "./payroll/PayrollPayslipsSection";
import usePayrollAdminData from "./payroll/usePayrollAdminData";

const TOKEN_KEY = "recruitdesk_portal_token";
const CLIENT_TOKEN_KEY = "recruitdesk_client_portal_token";
const EMPLOYEE_TOKEN_KEY = "recruitdesk_employee_portal_token";
const PAYROLL_TOKEN_KEY = "recruitdesk_payroll_portal_token";
const AUTH_MODE_KEY = "recruitdesk_auth_mode";
const COPY_SETTINGS_STORAGE_KEY = "recruitdesk_portal_copy_settings_v1";
const DEFAULT_JD_EMAIL_CC = "ankit.garg@kompatibleminds.com";
const JD_EMAIL_CC_HISTORY_KEY_PREFIX = "recruitdesk_portal_jd_email_cc_history_v1:";
const KOMPATIBLE_MINDS_COMPANY_ID = "c0a7d2c9-4ddb-4add-9d4a-24cdd1caba7c";

const BASE_NAV_SECTIONS = [
  {
    label: "Core",
    items: [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/jobs", label: "Jobs" },
      { to: "/shortcuts", label: "Shortcut Templates" },
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
      { to: "/plan", label: "Plan" },
      { to: "/login-settings", label: "Login Settings" },
      { to: "/intake-settings", label: "Job Apply Link" },
      { to: "/settings", label: "Preset Settings" }
    ]
  }
];

const STANDALONE_NAV_ITEMS = [
  { to: "/candidates", label: "Database" },
  { to: "/reports", label: "Reports & Analytics" }
];
const PAYROLL_NAV_ITEMS = [
  { to: "/payroll/dashboard", label: "Dashboard" },
  { to: "/payroll/employees", label: "Employees" },
  { to: "/payroll/salary-structures", label: "Salary Structures" },
  { to: "/payroll/attendance-lop", label: "Employee Monthly Inputs" },
  { to: "/payroll/fbp-claims", label: "Manage FBP" },
  { to: "/payroll/runs", label: "Payroll Runs" },
  { to: "/payroll/payslips", label: "Payslips" },
  { to: "/payroll/statutory-settings", label: "Statutory Settings" }
];

function FeatureLockedSection({ title = "Feature locked" }) {
  return (
    <div className="page-grid">
      <Section kicker="Plan Required" title={title}>
        <div className="empty-state compact-empty">
          <div className="empty-state__title">Available on SaaS Unlimited (Rs 4999)</div>
          <div className="muted">Upgrade to unlock this feature for your workspace.</div>
        </div>
      </Section>
    </div>
  );
}

	const DEFAULT_COPY_SETTINGS = {
	  excelPreset: "compact_recruiter",
  // When enabled, /company/candidates/search-natural will use embeddings for semantic reranking.
  // Admin can turn it off for the whole workspace from Preset Settings.
  semanticSearchEnabled: true,
  exportPresetLabels: {
    compact_recruiter: "Compact recruiter",
    client_tracker: "Client tracker",
    client_submission: "Client submission",
    screening_focus: "Screening focus"
  },
	  exportPresetColumns: {
	    compact_recruiter: "S.No.|s_no\nName|name\nPh|phone\nEmail|email\nCurrent Company|current_company\nCurrent Designation|current_designation\nTotal Experience|total_experience\nTenure in current company|current_org_tenure\nLocation|location\nReason of change|reason_of_change\nStatus|status\nCurrent CTC|current_ctc\nExpected CTC|expected_ctc\nNotice Period|notice_period\nOther Standard Questions|other_standard_questions\nRemarks|remarks\nLinkedIn|linkedin",
	    client_tracker: "Client Name|client_name\nTarget Role / Open Position|jd_title\nKey Skills Required|key_skills_required\nRecruiter Name|recruiter_name\nDate Added|date_added\nCandidate Name|name\nStatus|status\nContact No.|phone\nEmail ID|email\nLocation|location\nCurrent Company|current_company\nCurrent Designation|current_designation\nDomain / Industry|domain_industry\nWork Exp (Total years/months)|total_experience\nHighest Education|highest_education\nCurrent CTC|current_ctc\nExpected CTC|expected_ctc\nNotice Period|notice_period\nRemarks / Notes|remarks\nLinkedIn Profile Link (Optional)|linkedin",
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
  companyWideShortcuts: {},
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
  { id: "shared_today", label: "Candidates shared today", querySuffix: "converted to assessments today" },
  { id: "shared_this_week", label: "Shared this week", querySuffix: "converted to assessments this week" },
  { id: "offered_candidates", label: "Offered candidates", querySuffix: "assessment status offered" },
  { id: "cv_shared", label: "Active pipeline", querySuffix: "active assessments" }
];
const SMART_CHIP_INTERVIEW_ALIGNED_STATUSES = new Set([
  "screening call aligned",
  "l1 aligned",
  "l2 aligned",
  "l3 aligned",
  "hr interview aligned"
]);
const SHORTCUT_TEMPLATE_PLACEHOLDERS = [
  "{{name}}",
  "{{recruiter_name}}",
  "{{interview_at}}",
  "{{jd_title}}",
  "{{client_name}}",
  "{{company_name}}",
  "{{phone}}",
  "{{email}}",
  "{{jd_link}}",
  "{{recruiter_jd_link}}"
];

const REPORT_PENDING_FEEDBACK_STATUSES = new Set([
  "cv shared",
  "test or assignment shared",
  "feedback awaited"
]);

const REPORT_ACTIVE_PIPELINE_STATUSES = new Set([
  "cv shared",
  "test or assignment shared",
  "screening call aligned",
  "l1 aligned",
  "l2 aligned",
  "l3 aligned",
  "hr interview aligned",
  "feedback awaited",
  "hold",
  "offered",
  "shortlisted",
  "joined"
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

function buildBooleanFromKeywordBars({ must = "", any = "", anyGroups = [], exclude = "" } = {}) {
  const mustTokens = parseKeywordBarTokens(must).map(formatBooleanToken).filter(Boolean);
  const normalizedAnyGroups = Array.isArray(anyGroups)
    ? anyGroups.map((group) => parseKeywordBarTokens(group).map(formatBooleanToken).filter(Boolean)).filter((group) => group.length)
    : [];
  // Backward compatibility for legacy single "any" bar.
  const legacyAnyTokens = parseKeywordBarTokens(any).map(formatBooleanToken).filter(Boolean);
  if (legacyAnyTokens.length) normalizedAnyGroups.unshift(legacyAnyTokens);
  const excludeTokens = parseKeywordBarTokens(exclude).map(formatBooleanToken).filter(Boolean);
  const positiveParts = [];
  if (mustTokens.length) positiveParts.push(mustTokens.join(" AND "));
  if (normalizedAnyGroups.length) {
    normalizedAnyGroups.forEach((group) => {
      positiveParts.push(`(${group.join(" OR ")})`);
    });
  }
  const positiveQuery = positiveParts.join(" AND ").trim();
  const excludeQuery = excludeTokens.length ? `NOT (${excludeTokens.join(" OR ")})` : "";
  return [positiveQuery, excludeQuery].filter(Boolean).join(" ").trim();
}

function toIsoDateOnly(value) {
  return String(value || "").trim().slice(0, 10);
}

function safeTime(value) {
  const parsed = Date.parse(String(value || "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDateWithinRange(value, dateFrom = "", dateTo = "") {
  const dateOnly = toIsoDateOnly(value);
  if (!dateOnly) return false;
  if (dateFrom && dateOnly < dateFrom) return false;
  if (dateTo && dateOnly > dateTo) return false;
  return true;
}

function uniqueNonEmpty(values = []) {
  return Array.from(new Set((values || []).map((item) => String(item || "").trim()).filter(Boolean)));
}

function formatPercent(value) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
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

function formatEmployeeLocationStatusLabel(value) {
  const key = String(value || "").trim().toLowerCase();
  if (!key) return "-";
  if (key === "on_site") return "Active";
  if (key === "outside_radius") return "Outside Geofence";
  if (key === "remote") return "Remote";
  if (key === "unknown") return "Unknown";
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function formatEmployeeCoordinatePair(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "-";
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}
function formatDistanceFromOffice(value) {
  const meters = Number(value);
  if (!Number.isFinite(meters) || meters < 0) return "";
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}
function formatAccuracyWithOfficeDistance({ accuracyMeters, locationStatus, distanceFromSiteMeters }) {
  const accuracy = Number(accuracyMeters);
  const status = String(locationStatus || "").trim().toLowerCase();
  const base = Number.isFinite(accuracy) ? `${Math.round(accuracy)} m` : "-";
  if (status !== "outside_radius") return base;
  const distanceLabel = formatDistanceFromOffice(distanceFromSiteMeters);
  if (!distanceLabel) return `${base} | Outside geofence`;
  return `${base} | ${distanceLabel} from office`;
}

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
    try {
      const payload = {
        ts: new Date().toISOString(),
        scope: "portal",
        message: String(error?.message || error || ""),
        stack: String(error?.stack || "")
      };
      window.localStorage.setItem("rd_last_render_error", JSON.stringify(payload));
    } catch {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="app-shell">
          <main className="content">
            <Section kicker="Portal Error" title="Screen crashed">
              <p className="muted">Portal blank screen avoid karne ke liye fallback dikhaya gaya hai. Page refresh karke ya latest deploy ke baad dubara try karo.</p>
              <div className="status error">Temporary screen error. Please reload once.</div>
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

  componentDidCatch(error, info) {
    console.error("Portal route render error", error, info);
    try {
      const payload = {
        ts: new Date().toISOString(),
        scope: "route",
        routeKey: String(this.props?.routeKey || ""),
        message: String(error?.message || error || ""),
        stack: String(error?.stack || ""),
        componentStack: String(info?.componentStack || "")
      };
      window.localStorage.setItem("rd_last_render_error", JSON.stringify(payload));
    } catch {}
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
          <div className="status error">Temporary page error. Please reload once.</div>
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

class PayrollRouteBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMessage: "" };
  }
  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      errorMessage: String(error?.message || error || "Payroll page crashed.")
    };
  }
  componentDidCatch(error, info) {
    console.error("Payroll route render error", error, info);
    try {
      const payload = {
        ts: new Date().toISOString(),
        scope: "payroll",
        message: String(error?.message || error || ""),
        stack: String(error?.stack || ""),
        componentStack: String(info?.componentStack || "")
      };
      window.localStorage.setItem("rd_last_render_error", JSON.stringify(payload));
    } catch {}
  }
  render() {
    if (this.state.hasError) {
      return (
        <Section kicker="Payroll Error" title="Payroll module temporarily unavailable">
          <p className="muted">Blank screen avoid karne ke liye payroll-specific fallback dikhaya gaya hai.</p>
          <div className="status error">Temporary payroll screen error. Please reload once.</div>
          <div className="button-row">
            <button onClick={() => window.location.reload()}>Reload portal</button>
          </div>
        </Section>
      );
    }
    return this.props.children;
  }
}

function formatAssessmentStatusDisplay(status) {
  const label = normalizeAssessmentStatusLabel(status);
  if (!label) return "";
  return label
    .replace(/\bl(\d)\b/gi, "L$1")
    .replace(/\bhr\b/gi, "HR");
}

function normalizeShortcutKey(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  const stripped = value.replace(/^\/+/, "");
  if (!stripped) return "";
  return `/${stripped}`;
}

function formatShortcutLabel(raw) {
  const normalized = normalizeShortcutKey(raw);
  if (!normalized) return "/";
  return normalized;
}

function normalizeShortcutMapKeys(map = {}) {
  const source = map && typeof map === "object" ? map : {};
  const next = {};
  Object.entries(source).forEach(([rawKey, rawValue]) => {
    const key = normalizeShortcutKey(rawKey);
    const value = String(rawValue || "").trim();
    if (!key || !value) return;
    next[key] = value;
  });
  return next;
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
  if (/\b(lwd|doj)\b/.test(raw) && /\bnext week\b/.test(raw)) return 7;
  const daysMatch = raw.match(/(\d+(?:\.\d+)?)\s*days?/);
  if (daysMatch) return Number(daysMatch[1]);
  const monthsMatch = raw.match(/(\d+(?:\.\d+)?)\s*months?/);
  if (monthsMatch) return Number(monthsMatch[1]) * 30;
  const monthMap = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11
  };
  const cleaned = raw
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let targetDate = null;

  // Formats: 30/04/2026 or 30-04-2026 or 30/04
  const numericMatch = cleaned.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (numericMatch) {
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]) - 1;
    let year = numericMatch[3] ? Number(numericMatch[3]) : now.getFullYear();
    if (year < 100) year += 2000;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      targetDate = new Date(year, month, day);
    }
  }

  // Formats: 30 april / april 30
  if (!targetDate) {
    const dmyMatch = cleaned.match(/\b(\d{1,2})\s+([a-z]{3,9})(?:\s+(\d{4}))?\b/);
    if (dmyMatch) {
      const day = Number(dmyMatch[1]);
      const monthKey = dmyMatch[2].toLowerCase();
      const month = monthMap[monthKey];
      let year = dmyMatch[3] ? Number(dmyMatch[3]) : now.getFullYear();
      if (day >= 1 && day <= 31 && Number.isInteger(month)) {
        targetDate = new Date(year, month, day);
      }
    }
  }
  if (!targetDate) {
    const mdyMatch = cleaned.match(/\b([a-z]{3,9})\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?\b/);
    if (mdyMatch) {
      const monthKey = mdyMatch[1].toLowerCase();
      const month = monthMap[monthKey];
      const day = Number(mdyMatch[2]);
      let year = mdyMatch[3] ? Number(mdyMatch[3]) : now.getFullYear();
      if (day >= 1 && day <= 31 && Number.isInteger(month)) {
        targetDate = new Date(year, month, day);
      }
    }
  }
  if (targetDate && Number.isFinite(targetDate.getTime())) {
    // If year was omitted and parsed date already passed significantly, assume next year.
    if (!/\b\d{4}\b/.test(cleaned) && targetDate.getTime() < startOfToday.getTime() - (2 * 24 * 60 * 60 * 1000)) {
      targetDate = new Date(targetDate.getFullYear() + 1, targetDate.getMonth(), targetDate.getDate());
    }
    const dayDiff = Math.ceil((targetDate.getTime() - startOfToday.getTime()) / (24 * 60 * 60 * 1000));
    return Math.max(0, dayDiff);
  }
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

function normalizeApplicantLocationLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
  if (!compact) return "";
  const lower = compact.toLowerCase();
  if (lower.length <= 1) return "";
  if (["engineer", "developer", "manager", "executive", "consultant", "analyst"].includes(lower)) return "";

  const firstPart = compact.split(",")[0].trim();
  const cityLike = firstPart
    .replace(/\./g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!cityLike || cityLike.length <= 1) return "";

  const cityMap = new Map([
    ["bangalore", "Bengaluru"],
    ["bengaluru", "Bengaluru"],
    ["bengaluru urban", "Bengaluru"],
    ["gurgaon", "Gurugram"],
    ["gurugram", "Gurugram"],
    ["bombay", "Mumbai"],
    ["mumbai", "Mumbai"],
    ["new delhi", "New Delhi"],
    ["delhi", "Delhi"],
    ["noida", "Noida"],
    ["pune", "Pune"],
    ["hyderabad", "Hyderabad"],
    ["kolkata", "Kolkata"],
    ["calcutta", "Kolkata"],
    ["chennai", "Chennai"],
    ["indore", "Indore"],
    ["lucknow", "Lucknow"],
    ["surat", "Surat"],
    ["thane", "Thane"]
  ]);
  if (cityMap.has(cityLike)) return cityMap.get(cityLike) || "";

  return cityLike
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function parseMultiChipTokens(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toTimestampSafe(value) {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  const direct = Date.parse(raw);
  if (Number.isFinite(direct)) return direct;
  // Support: DD/MM/YYYY, HH:mm:ss (or HH:mm)
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return NaN;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const hours = Number(m[4] || 0);
  const minutes = Number(m[5] || 0);
  const seconds = Number(m[6] || 0);
  const dt = new Date(year, month, day, hours, minutes, seconds);
  return dt.getTime();
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
  const rawConfidence = String(
    result?.timelineConfidence?.level || result?.parseDebug?.timelineConfidence || ""
  ).trim().toLowerCase();
  const timelineConfidenceLevel =
    rawConfidence === "medium" ? "mid" : (rawConfidence === "high" || rawConfidence === "low" ? rawConfidence : "");
  const timelineConfidenceLabel =
    String(result?.timelineConfidence?.label || result?.parseDebug?.timelineConfidenceLabel || "").trim()
    || (timelineConfidenceLevel ? `Timeline confidence ${timelineConfidenceLevel}` : "");
  return {
    exactTotalExperience: result.totalExperience || "",
    currentCompany: result.currentCompany || "",
    currentDesignation: result.currentDesignation || "",
    currentOrgTenure: result.currentOrgTenure || "",
    highestEducation: result.highestEducation || "",
    candidateName: result.candidateName || "",
    emailId: result.emailId || "",
    phoneNumber: result.phoneNumber || "",
    timelineConfidenceLevel,
    timelineConfidenceLabel,
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

function normalizeMojibakeSymbols(text) {
  return String(text || "")
    .replace(/Ã¢â‚¬Â¢|â€¢/g, "•")
    .replace(/Ã¢â‚¬â€œ|â€“/g, "-")
    .replace(/Ã¢â‚¬â€|â€”/g, "-")
    .replace(/Ã¢â‚¬Ëœ|â€˜/g, "'")
    .replace(/Ã¢â‚¬â„¢|â€™/g, "'")
    .replace(/Ã¢â‚¬Å“|â€œ/g, "\"")
    .replace(/Ã¢â‚¬Â|â€/g, "\"")
    .replace(/Ã‚/g, "");
}
function polishStructuredBulletSentence(line) {
  const text = normalizeMojibakeSymbols(line).trim().replace(/\s+/g, " ");
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
  return normalizeMojibakeSymbols(value)
    .trim()
    .replace(/^[\s\-:;]+/, "")
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
    .map((line) => normalizeMojibakeSymbols(line).replace(/^[\-\*•]\s*/, "").trim())
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
  const prepared = normalizeMojibakeSymbols(rawText)
    .replace(/\bother pointers\s*:?\s*/gi, "\n")
    .replace(/\.\s+(?=[A-Z])/g, ".\n");

  return splitStructuredDraftLines(prepared)
    .map((line) => normalizeMojibakeSymbols(line).replace(/^[\-\*•]\s*/, "").trim())
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
    .replace(/^[\s\-Ã¢â‚¬â€œÃ¢â‚¬â€:]+/, "")
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
    if (raw.length > 350) return `${raw.slice(0, 350)}Ã¢â‚¬Â¦`;
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
    follow_up_at: source.follow_up_at || "",
    recruiter_name: source.recruiter_name || source.recruiterName || "",
    interview_at: source.interview_at || source.interviewAt || "",
    client_name: source.client_name || source.clientName || "",
    company_name: source.company_name || source.companyName || "",
    jd_link: source.jd_link || source.jdLink || "",
    recruiter_jd_link: source.recruiter_jd_link || source.recruiterJdLink || source.jd_link || source.jdLink || ""
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
  const ctx = resolveCandidateContext(item);
  const qaLines = [];
  const seen = new Set();

  const pushQa = (question, answer) => {
    const q = String(question || "")
      .replace(/<[^>]+>/g, "")
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/:+$/, "");
    const a = String(answer || "")
      .replace(/<[^>]+>/g, "")
      .replace(/^\s*[:\-]+\s*/, "")
      .replace(/\*/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!q || !a) return;
    if (!/[a-z]/i.test(q)) return;
    if (/^reason\s+of\s+change$/i.test(q)) return;
    const key = `${q.toLowerCase()}::${a.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    qaLines.push({ question: q, answer: a });
  };

  if (ctx.screeningMap && typeof ctx.screeningMap === "object") {
    Object.entries(ctx.screeningMap).forEach(([question, answer]) => pushQa(question, answer));
  }

  const otherStandardQuestions = String(item.other_standard_questions || item.last_contact_notes || "").trim();
  otherStandardQuestions
    .split(/\r?\n+/)
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .forEach((line) => {
      if (/^\[[^\]]+\]\s*/.test(line)) return;
      const cleaned = line.replace(/^[\d\.\-\)\s]+/, "").trim();
      const separatorIndex = cleaned.indexOf(":");
      if (separatorIndex <= 0) return;
      const label = cleaned.slice(0, separatorIndex).trim();
      const value = cleaned.slice(separatorIndex + 1).replace(/^[\s:\-]+/, "").trim();
      pushQa(label, value);
    });

  const strongPoints = (
    Array.isArray(item.topStrengths) ? item.topStrengths
      : Array.isArray(item.result?.topStrengths) ? item.result.topStrengths
      : []
  )
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const reasonOfChange = String(item.reason_of_change || "").trim();
  const parts = [];
  if (strongPoints.length) {
    parts.push(
      [
        "Strong points:",
        ...strongPoints.map((value, index) => `${index + 1}. *${value}*`)
      ].join("\n")
    );
  }
  if (qaLines.length) {
    parts.push(
      [
        "Screening pointers:",
        ...qaLines.map((entry, index) => `${index + 1}. ${entry.question} - *${entry.answer}*`)
      ].join("\n")
    );
  }
  if (reasonOfChange) {
    parts.push(["Reason of change:", `*${reasonOfChange}*`].join("\n"));
  }
  return parts.filter(Boolean).join("\n\n");
}

function getJdCcHistoryStorageKey(companyId = "") {
  return `${JD_EMAIL_CC_HISTORY_KEY_PREFIX}${String(companyId || "").trim()}`;
}

function readJdCcHistory(companyId = "") {
  const id = String(companyId || "").trim();
  if (!id) return [];
  try {
    const raw = window.localStorage.getItem(getJdCcHistoryStorageKey(id));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
      : [];
  } catch {
    return [];
  }
}

function saveJdCcHistory(companyId = "", list = []) {
  const id = String(companyId || "").trim();
  if (!id) return;
  const next = Array.isArray(list)
    ? list.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 20)
    : [];
  try {
    window.localStorage.setItem(getJdCcHistoryStorageKey(id), JSON.stringify(next));
  } catch {
    // ignore storage errors
  }
}

function normalizeCcTokens(value = "") {
  return String(value || "")
    .split(/,|;|\s+/)
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
}

function buildNextCcHistory(companyId = "", value = "", fallback = "") {
  const existing = readJdCcHistory(companyId);
  const incoming = [...normalizeCcTokens(value), ...normalizeCcTokens(fallback)];
  const merged = Array.from(new Set([...incoming, ...existing])).slice(0, 20);
  saveJdCcHistory(companyId, merged);
  return merged;
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

function Section({ kicker, title, children, className = "" }) {
  return (
    <section className={`panel ${className}`.trim()}>
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

function isEmployeePortalUrl() {
  if (typeof window === "undefined") return false;
  const search = new URLSearchParams(window.location.search || "");
  const mode = String(search.get("mode") || search.get("portal") || "").toLowerCase();
  return ["/employee-portal", "/employee-login", "/employee"].some((path) => window.location.pathname.startsWith(path)) || mode === "employee";
}

function isPayrollPortalUrl() {
  if (typeof window === "undefined") return false;
  const search = new URLSearchParams(window.location.search || "");
  const mode = String(search.get("mode") || search.get("portal") || "").toLowerCase();
  return ["/payroll", "/payroll-login"].some((path) => window.location.pathname.startsWith(path)) || mode === "payroll";
}

function LoginScreen({ onRecruiterLogin, onClientLogin, onEmployeeLogin, onEmployerLogin, onPayrollLogin, busy, error, forcedMode = "" }) {
  const [mode, setMode] = useState(() => forcedMode || "recruiter");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (forcedMode) setMode(forcedMode);
  }, [forcedMode]);

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
        <div className="section-kicker auth-kicker">
          {mode === "client" ? "Client Login" : mode === "employee" ? "Employee Login" : mode === "payroll" ? "Payroll Admin Login" : "Company Login"}
        </div>
        <h1>{mode === "client" ? CLIENT_PORTAL_LABEL : mode === "employee" ? `${PRODUCT_NAME} Employee Portal` : mode === "payroll" ? `${PRODUCT_NAME} Payroll Admin` : RECRUITER_PORTAL_LABEL}</h1>
        <p className="muted">
          {mode === "client"
            ? "Use the client username and password shared by your recruiter team."
            : mode === "employee"
              ? "Use your employee username or employee code and password."
              : mode === "payroll"
                ? "Use your payroll_owner or payroll_manager credentials."
              : "Use your existing company admin or recruiter credentials."}
        </p>
        {!forcedMode ? (
          <div className="button-row">
            <button type="button" className={mode === "recruiter" ? "" : "ghost-btn"} onClick={() => setMode("recruiter")}>Recruiter login</button>
            <button type="button" className={mode === "client" ? "" : "ghost-btn"} onClick={() => setMode("client")}>Client login</button>
            <button type="button" className={mode === "employee" ? "" : "ghost-btn"} onClick={() => setMode("employee")}>Employee login</button>
            <button type="button" className={mode === "payroll" ? "" : "ghost-btn"} onClick={() => setMode("payroll")}>Payroll login</button>
          </div>
        ) : null}
        <form className="form-grid" onSubmit={(e) => {
          e.preventDefault();
          if (mode === "client") onClientLogin({ username, password });
          else if (mode === "employee") (onEmployeeLogin || onEmployerLogin)?.({ username, password });
          else if (mode === "payroll") onPayrollLogin?.({ email, password });
          else onRecruiterLogin({ email, password });
        }}>
          {mode === "client" || mode === "employee"
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
  }, [
    open,
    applicant?.id,
    applicant?.assigned_to_user_id,
    applicant?.assignedToUserId,
    applicant?.assigned_to,
    applicant?.assigned_jd_id,
    applicant?.assignedJdId,
    applicant?.assigned_jd_title,
    applicant?.assignedJdTitle,
    applicant?.jd_title,
    applicant?.jdTitle
  ]);

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

function NewDraftModal({
  open,
  form,
  users,
  jobs,
  currentUser,
  onChange,
  onClose,
  onSave,
  onPasteScreenshot,
  onImportSheet,
  onImportCvFiles,
  importBusy = false,
  onOpenSheetImportPreview
}) {
  if (!open) return null;
  const isAdmin = String(currentUser?.role || "").toLowerCase() === "admin";
  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>Create Draft</h3>
        <p className="muted">Add minimal details to create a draft without parsing.</p>
        <div className="button-row" style={{ marginBottom: 10 }}>
          <button type="button" className="ghost-btn" onClick={onPasteScreenshot} disabled={importBusy}>Paste screenshot (Ctrl+V)</button>
          <label className="ghost-btn" style={{ display: "inline-flex", alignItems: "center", cursor: importBusy ? "not-allowed" : "pointer", opacity: importBusy ? 0.7 : 1 }}>
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              style={{ display: "none" }}
              disabled={importBusy}
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file) {
                  onImportSheet?.(file);
                  onOpenSheetImportPreview?.();
                }
                e.currentTarget.value = "";
              }}
            />
            Upload Excel/CSV
          </label>
          <label className="ghost-btn" style={{ display: "inline-flex", alignItems: "center", cursor: importBusy ? "not-allowed" : "pointer", opacity: importBusy ? 0.7 : 1 }}>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.txt,.rtf"
              multiple
              style={{ display: "none" }}
              disabled={importBusy}
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length) onImportCvFiles?.(files);
                e.currentTarget.value = "";
              }}
            />
            Bulk CV upload
          </label>
        </div>
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
          <label><span>Current designation</span><input value={form.current_designation} onChange={(e) => onChange("current_designation", e.target.value)} placeholder="Senior Portfolio Manager" /></label>
          <label><span>Total experience</span><input value={form.total_experience} onChange={(e) => onChange("total_experience", e.target.value)} placeholder="7 years 5 months" /></label>
          <label><span>Location</span><input value={form.location} onChange={(e) => onChange("location", e.target.value)} /></label>
          <label><span>Current CTC</span><input value={form.current_ctc} onChange={(e) => onChange("current_ctc", e.target.value)} placeholder="11.5 LPA" /></label>
          <label><span>Notice period</span><input value={form.notice_period} onChange={(e) => onChange("notice_period", e.target.value)} placeholder="15 days / immediate" /></label>
          <label><span>Highest qualification</span><input value={form.highest_education} onChange={(e) => onChange("highest_education", e.target.value)} placeholder="MBA / B.Tech / MCA" /></label>
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

function DrilldownModal({ open, title, items, onClose, onOpenCv, onOpenDraft, onOpenAssessment, onOpenNotes, onOpenStatus, onAddFeedback, extraActions = null, inline = false, hideRoleClient = false, loading = false }) {
  if (!open) return null;
  const containerClass = inline ? "inline-drilldown" : "overlay";
  const cardClass = inline ? "panel inline-drilldown__card" : "overlay-card overlay-card--wide";
  return (
    <div className={containerClass} onClick={inline ? undefined : onClose}>
      <div className={cardClass} onClick={(e) => !inline && e.stopPropagation()}>
        <div className="drilldown-inline-head">
          <h3>{title}</h3>
          {inline ? <button className="ghost-btn" onClick={onClose}>Collapse</button> : null}
        </div>
        <p className="muted">{loading ? "Loading candidates..." : `${items.length} candidate(s)`}</p>
        {extraActions ? <div className="drilldown-toolbar">{extraActions}</div> : null}
        <div className="stack-list compact">
          {loading ? <div className="empty-state">Loading candidates...</div> : (!items.length ? <div className="empty-state">No matching candidates found.</div> : items.map((item, index) => {
            const stableItemKey = String(
              item?.id ||
              item?.assessmentId ||
              item?.candidateId ||
              item?.raw?.candidate?.id ||
              `${item?.name || item?.candidateName || "candidate"}-${item?.phone || item?.email || index}`
            );
            return (
            <article className="item-card compact-card" key={stableItemKey}>
              {(() => {
                const feedbackMeta = readItemClientFeedback(item);
                const assessmentForAction = item.raw?.assessment || item.assessment || (item.assessmentId || item.sourceType === "assessment_only" ? item : null);
                const profileTarget = assessmentForAction || item;
                const candidateIdForAction = String(item.raw?.candidate?.id || (!assessmentForAction ? item.id : "") || "").trim();
                const profileOnlyMode = Boolean(onAddFeedback && !onOpenDraft && !onOpenNotes && !onOpenStatus);
                return (
              <div className="item-card__top">
                <div>
                  <h3>{hideRoleClient ? (item.name || item.candidateName || "Candidate") : `${item.name || item.candidateName || "Candidate"} | ${item.position || item.jdTitle || item.role || "Untitled role"}`}</h3>
                  <p className="muted">{[
                    item.company || item.currentCompany || "",
                    hideRoleClient ? "" : (item.clientName ? `Client: ${item.clientName}` : ""),
                    item.ownerRecruiter ? `Recruiter: ${item.ownerRecruiter}` : "",
                    item.source ? `Source: ${item.source}` : ""
                  ].filter(Boolean).join(" | ")}</p>
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
                    {onOpenNotes && candidateIdForAction ? <button onClick={() => onOpenNotes(candidateIdForAction)}>Update notes</button> : null}
                    {!assessmentForAction && !onOpenNotes && onOpenDraft && candidateIdForAction ? <button onClick={() => onOpenDraft(candidateIdForAction)}>Update details</button> : null}
                    {!assessmentForAction && onOpenStatus && candidateIdForAction ? <button onClick={() => onOpenStatus({ candidateId: candidateIdForAction, item })}>Update status</button> : null}
                    {onAddFeedback ? <button className="ghost-btn" onClick={() => onAddFeedback(item)}>{feedbackMeta.feedback ? "Add another feedback" : "Add feedback"}</button> : null}
                  </div>
                </div>
              </div>
                );
              })()}
            </article>
          );
          }))}
        </div>
        {inline ? null : (
          <div className="button-row">
            <button className="ghost-btn" onClick={onClose}>Close</button>
          </div>
        )}
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

function JdEmailModal({ open, jobs, value, ccSuggestions = [], onChange, onClose, onSend, busy = false, status = "", statusKind = "" }) {
  if (!open) return null;
  const jobOptions = Array.isArray(jobs) ? jobs : [];
  const suggestionList = Array.isArray(ccSuggestions) ? ccSuggestions : [];
  return (
    <div className="overlay" onClick={() => { if (!busy) onClose(); }}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>Send JD Email</h3>
        <p className="muted">Sends from your configured SMTP (Settings Ã¢â€ â€™ Email settings). Use Zoho app password.</p>
        {status ? <div className={`status ${statusKind || ""}`} style={{ marginBottom: 12 }}>{status}</div> : null}
        <div className="form-grid">
          <label className="full">
            <span>To</span>
            <input value={value.to} onChange={(e) => onChange("to", e.target.value)} placeholder="candidate@example.com" />
          </label>
          <label className="full">
            <span>CC (optional)</span>
            <input list="jdEmailCcSuggestions" value={value.cc || ""} onChange={(e) => onChange("cc", e.target.value)} placeholder="manager@company.com, team@company.com" />
            {suggestionList.length ? (
              <datalist id="jdEmailCcSuggestions">
                {suggestionList.map((item) => <option key={item} value={item} />)}
              </datalist>
            ) : null}
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
    assessmentEvents: [],
    users: [],
    intake: null,
    jobs: []
  });
  const [statuses, setStatuses] = useState({});
  const statusTimersRef = useRef({});
  const [companyLicense, setCompanyLicense] = useState(null);
  const [billingOverview, setBillingOverview] = useState(null);
  const [billingPlans, setBillingPlans] = useState([]);
  const [planUpgradeBusyCode, setPlanUpgradeBusyCode] = useState("");
  const [assignApplicantId, setAssignApplicantId] = useState("");
  const [assignCandidateId, setAssignCandidateId] = useState("");
  const [bulkAssignApplicantIds, setBulkAssignApplicantIds] = useState([]);
  const [bulkAssignCandidateIds, setBulkAssignCandidateIds] = useState([]);
  const [bulkAssignApplicantModalOpen, setBulkAssignApplicantModalOpen] = useState(false);
  const [bulkAssignCandidateModalOpen, setBulkAssignCandidateModalOpen] = useState(false);
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
    view: "all",
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
    locations: [],
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
  const [reportsTab, setReportsTab] = useState("client");
  const [reportsFilters, setReportsFilters] = useState({
    dateFrom: "",
    dateTo: "",
    recruiter: "",
    client: "",
    job: ""
  });
  const [candidateSearchMode, setCandidateSearchMode] = useState("all");
  const [candidateSearchText, setCandidateSearchText] = useState("");
  const [candidateSearchQueryUsed, setCandidateSearchQueryUsed] = useState("");
  const [candidateAiQueryMode, setCandidateAiQueryMode] = useState("natural");
  const [candidateKeywordMust, setCandidateKeywordMust] = useState("");
  const [candidateKeywordAny1, setCandidateKeywordAny1] = useState("");
  const [candidateKeywordAny2, setCandidateKeywordAny2] = useState("");
  const [candidateKeywordAny3, setCandidateKeywordAny3] = useState("");
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
      anyGroups: [candidateKeywordAny1, candidateKeywordAny2, candidateKeywordAny3],
      exclude: candidateKeywordExclude
    })
  ), [candidateKeywordMust, candidateKeywordAny1, candidateKeywordAny2, candidateKeywordAny3, candidateKeywordExclude]);
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
        <div className="candidate-filter-column">
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
          <label><span>Current company</span><input value={candidateStructuredFiltersDraft.currentCompany} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, currentCompany: e.target.value }))} placeholder="Infosys" /></label>
          <label><span>Qualification</span><input value={candidateStructuredFiltersDraft.qualification} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, qualification: e.target.value }))} placeholder="B.Tech / MBA" /></label>
          <label><span>Locations</span><input value={candidateStructuredFiltersDraft.location} onChange={(e) => setCandidateStructuredFiltersDraft((current) => ({ ...current, location: e.target.value }))} placeholder="Mumbai, Hyderabad" /></label>
        </div>
        <div className="candidate-filter-column">
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
        </div>
        <div className="candidate-filter-column">
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
  const [payrollUserDraft, setPayrollUserDraft] = useState({ name: "", email: "", password: "", role: "payroll_owner" });
  const [teamPasswordDrafts, setTeamPasswordDrafts] = useState({});
  const [employeeUsers, setEmployeeUsers] = useState([]);
  const [employeeUserDraft, setEmployeeUserDraft] = useState({
    employeeCode: "",
    username: "",
    fullName: "",
    password: "",
    designation: "",
    clientName: "",
    workSiteName: "",
    workSiteAddress: "",
    workSiteLatitude: "",
    workSiteLongitude: "",
    workSiteRadiusMeters: "500"
  });
  const [employeePasswordDrafts, setEmployeePasswordDrafts] = useState({});
  const [employeeEditDrafts, setEmployeeEditDrafts] = useState({});
  const [companyDraft, setCompanyDraft] = useState({ companyName: "", adminName: "", email: "", password: "", platformSecret: "" });
  const [clientUsers, setClientUsers] = useState([]);
  const payrollWorkspaceUsers = useMemo(
    () => (state.users || []).filter((item) => ["payroll_owner", "payroll_manager"].includes(String(item?.role || "").toLowerCase())),
    [state.users]
  );
  const recruiterWorkspaceUsers = useMemo(
    () => (state.users || []).filter((item) => !["payroll_owner", "payroll_manager"].includes(String(item?.role || "").toLowerCase())),
    [state.users]
  );
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
  const [loginSettingsPanel, setLoginSettingsPanel] = useState("team");
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
    current_designation: "",
    total_experience: "",
    location: "",
    current_ctc: "",
    notice_period: "",
    highest_education: "",
    jd_title: "",
    client_name: "",
    tags: "",
    notes: ""
  });
  const resetNewDraftForm = useCallback(() => {
    setNewDraftForm({
      assigned_to_user_id: "",
      name: "",
      phone: "",
      email: "",
      linkedin: "",
      company: "",
      current_designation: "",
      total_experience: "",
      location: "",
      current_ctc: "",
      notice_period: "",
      highest_education: "",
      jd_title: "",
      client_name: "",
      tags: "",
      notes: ""
    });
  }, []);
  const [newDraftImportBusy, setNewDraftImportBusy] = useState(false);
  const [newDraftSheetPreviewOpen, setNewDraftSheetPreviewOpen] = useState(false);
  const [newDraftSheetRows, setNewDraftSheetRows] = useState([]);
  const [notesCandidateId, setNotesCandidateId] = useState("");
  const [attemptsCandidateId, setAttemptsCandidateId] = useState("");
  const [assessmentStatusId, setAssessmentStatusId] = useState("");
  const [drilldownState, setDrilldownState] = useState({ open: false, title: "", items: [], request: null, loading: false });
  const inlineDrilldownRef = useRef(null);
  const loginSettingsSectionRef = useRef(null);
  const [inlineDrilldownPulse, setInlineDrilldownPulse] = useState(false);
  const [clientFeedbackItem, setClientFeedbackItem] = useState(null);
	const [attempts, setAttempts] = useState([]);
	const workspaceRefreshInFlightRef = useRef(false);
	const lastWorkspaceRefreshAtRef = useRef(0);
  const lastWorkspaceRefreshByPathRef = useRef({});
  // Prevent background refresh from clobbering in-flight actions (e.g. SMTP send).
  const suspendWorkspaceRefreshRef = useRef(false);
	const loadWorkspaceRef = useRef(null);
	const linkedinSideWindowRef = useRef(null);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobListLane, setJobListLane] = useState("active");
  const [jobsCatalog, setJobsCatalog] = useState([]);
  const [jobShortcutKey, setJobShortcutKey] = useState("");
  const [jobShortcutValue, setJobShortcutValue] = useState("");
  const [shortcutPersonalKey, setShortcutPersonalKey] = useState("");
  const [shortcutPersonalValue, setShortcutPersonalValue] = useState("");
  const [shortcutJobId, setShortcutJobId] = useState("");
  const [shortcutJobKey, setShortcutJobKey] = useState("");
  const [shortcutJobValue, setShortcutJobValue] = useState("");
  const [shortcutCompanyKey, setShortcutCompanyKey] = useState("");
  const [shortcutCompanyValue, setShortcutCompanyValue] = useState("");
  const personalTemplateTextareaRef = useRef(null);
  const jobTemplateTextareaRef = useRef(null);
  const companyTemplateTextareaRef = useRef(null);
  const jdWorkspaceShortcutTextareaRef = useRef(null);
  const JOB_CLOSE_REASONS = [
    "Position closed",
    "Position put on hold",
    "Position closed at company's end"
  ];
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
    jdShortcuts: "",
    isArchived: false,
    archivedAt: null,
    archivedBy: "",
    closeReason: "",
    closedAt: null,
    closedBy: ""
  });
  const [jobActionBusy, setJobActionBusy] = useState(false);
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
  const [smtpTestBusy, setSmtpTestBusy] = useState(false);
  const [zohoConnectBusy, setZohoConnectBusy] = useState(false);
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
  const [jdEmailCcSuggestions, setJdEmailCcSuggestions] = useState([]);
  const [jdEmailBusy, setJdEmailBusy] = useState(false);
  const [jdEmailModalStatus, setJdEmailModalStatus] = useState({ message: "", kind: "" });
  const [personalShortcuts, setPersonalShortcuts] = useState({});
  const [whatsappTemplatePicker, setWhatsappTemplatePicker] = useState({
    open: false,
    options: [],
    selectedId: "",
    row: null,
    phone: "",
    statusKey: "workspace",
    customText: "",
    newShortcutKey: "",
    saveScope: "all_jobs",
    assignJobId: ""
  });

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

  const assignApplicant = (state.applicants || []).find((item) => String(item.id) === String(assignApplicantId))
    || ((bulkAssignApplicantIds || []).length ? (state.applicants || []).find((item) => String(item.id) === String(bulkAssignApplicantIds[0])) : null)
    || null;
  const assignCandidate = (state.candidates || []).find((item) => String(item.id) === String(assignCandidateId))
    || ((bulkAssignCandidateIds || []).length ? (state.candidates || []).find((item) => String(item.id) === String(bulkAssignCandidateIds[0])) : null)
    || null;
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
  const normalizedUserRole = String(state.user?.role || "").trim().toLowerCase();
  const isSettingsAdmin = ["admin", "owner_admin", "super_admin"].includes(normalizedUserRole);
  const isExistingJobSelection = Boolean(String(selectedJobId || jobDraft.id || "").trim());
  const canEditCurrentJob =
    isSettingsAdmin ||
    !isExistingJobSelection ||
    String(jobDraft.ownerRecruiterId || "").trim() === String(state.user?.id || "").trim();
  const jobDraftReadOnly = isExistingJobSelection && !canEditCurrentJob;
  const isLicenseOwnerAdmin =
    isSettingsAdmin &&
    String(state.user?.id || "").trim() &&
    String(state.user?.id || "").trim() === String(companyLicense?.ownerAdminUserId || "").trim();
  const effectiveLicense = billingOverview?.license || companyLicense || null;
  const currentCompanyId = String(state.user?.companyId || "").trim();
  const isKompatibleCompany = currentCompanyId === KOMPATIBLE_MINDS_COMPANY_ID;
  const defaultJdEmailCc = isKompatibleCompany ? DEFAULT_JD_EMAIL_CC : "";
  const currentPlanCode = String(effectiveLicense?.plan || "trial").trim().toLowerCase();
  const currentPlanTier = String(billingOverview?.currentPlan?.tier || "").trim().toLowerCase();
  const fullRecruiterPlanCodes = new Set([
    "s1_full_999", "s3_full_1999", "s7_full_3999", "s15_full_4999",
    "s1_suite_1499", "s3_suite_2999", "s7_suite_5999", "s15_suite_6999",
    "ext_999_3_users", "ext_1999_7_users", "saas_4999_unlimited", "legacy", "enterprise_contact"
  ]);
  const suitePlanCodes = new Set([
    "s1_suite_1499", "s3_suite_2999", "s7_suite_5999", "s15_suite_6999",
    "saas_4999_unlimited", "legacy", "enterprise_contact"
  ]);
  const hasSaasUnlimitedAccess =
    Boolean(billingOverview?.fullAccessBypass) ||
    Boolean(billingOverview?.currentPlan?.fullRecruiter) ||
    currentPlanTier === "full_recruiter_mode" ||
    currentPlanTier === "full_recruiter_plus_modules" ||
    fullRecruiterPlanCodes.has(currentPlanCode);
  const hasSuiteModulesAccess =
    Boolean(billingOverview?.fullAccessBypass) ||
    Boolean(billingOverview?.currentPlan?.suiteModules) ||
    currentPlanTier === "full_recruiter_plus_modules" ||
    suitePlanCodes.has(currentPlanCode);
  const accessStateLabel = billingOverview?.fullAccessBypass
    ? "Full Access (Bypass)"
    : hasSuiteModulesAccess
      ? "Full + Modules Access"
      : hasSaasUnlimitedAccess
        ? "Full Recruiter Access"
        : currentPlanCode === "trial"
          ? "Trial Access"
          : (effectiveLicense?.canCapture ? "Active" : "Blocked");
  const isKompatibleAdminContext =
    String(state.user?.companyId || "").trim() === KOMPATIBLE_MINDS_COMPANY_ID &&
    isSettingsAdmin;
  const isAnkitAdmin = String(state.user?.email || "").trim().toLowerCase() === "ankit.garg@kompatibleminds.com";
  const canAddCompany = isSettingsAdmin && isAnkitAdmin;
  const canViewClientPayrollInLoginSettings = hasSuiteModulesAccess || isKompatibleCompany;
  const loginSettingsOptions = [
    { id: "team", label: "Add Recruitment Team", visible: true },
    { id: "client", label: "Add Client", visible: canViewClientPayrollInLoginSettings },
    { id: "payroll", label: "Add Payroll", visible: canViewClientPayrollInLoginSettings },
    { id: "company", label: "Add Company", visible: canAddCompany }
  ].filter((item) => item.visible);
  const shortcutJobOptions = useMemo(() => {
    const source = Array.isArray(state.jobs) && state.jobs.length ? state.jobs : jobsCatalog;
    return (source || []).map((job) => ({
      id: String(job?.id || "").trim(),
      title: String(job?.title || "Untitled job").trim(),
      clientName: String(job?.clientName || job?.client_name || "").trim(),
      jdShortcuts: String(job?.jdShortcuts || "")
    })).filter((job) => job.id);
  }, [state.jobs, jobsCatalog]);
  const selectedShortcutJob = useMemo(
    () => shortcutJobOptions.find((job) => String(job.id) === String(shortcutJobId || "")) || null,
    [shortcutJobOptions, shortcutJobId]
  );
  const selectedShortcutJobMap = useMemo(
    () => normalizeShortcutMapKeys(parseShortcutMap(selectedShortcutJob?.jdShortcuts || "")),
    [selectedShortcutJob]
  );
  const accessFlagsReady = Boolean(state.user?.id) && (Boolean(companyLicense) || Boolean(billingOverview));
  const navSections = useMemo(() => (
    BASE_NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const itemTo = String(item?.to || "");
          if ((itemTo === "/plan" || itemTo === "/login-settings" || itemTo === "/intake-settings" || itemTo === "/settings" || itemTo.startsWith("/admin/payroll")) && !isSettingsAdmin) return false;
          if (!hasSaasUnlimitedAccess && (itemTo === "/client-share" || itemTo === "/intake-settings" || itemTo === "/mail-settings" || itemTo === "/applicants")) return false;
          return true;
        })
      }))
      .filter((section) => section.items.length)
  ), [isSettingsAdmin, hasSaasUnlimitedAccess]);
  const standaloneNavItems = useMemo(() => (
    STANDALONE_NAV_ITEMS.filter((item) => {
      if (!hasSaasUnlimitedAccess && item.to === "/reports") return false;
      if (item.to === "/reports") return isSettingsAdmin;
      if (item.to === "/candidates" && !hasSaasUnlimitedAccess) return false;
      return true;
    })
  ), [isSettingsAdmin, hasSaasUnlimitedAccess]);
  const trialDaysLeft = Number.isFinite(Number(effectiveLicense?.daysRemaining))
    ? Math.max(0, Number(effectiveLicense?.daysRemaining))
    : null;
  const trialCapturesLeft = Number.isFinite(Number(effectiveLicense?.capturesRemaining))
    ? Math.max(0, Number(effectiveLicense?.capturesRemaining))
    : null;
  const planRank = {
    trial: 0,
    s1_basic_499: 1, s3_basic_999: 2, s7_basic_1999: 3, s15_basic_2999: 4,
    s1_full_999: 5, s3_full_1999: 6, s7_full_3999: 7, s15_full_4999: 8,
    s1_suite_1499: 9, s3_suite_2999: 10, s7_suite_5999: 11, s15_suite_6999: 12,
    legacy: 13
  };
  const currentRank = Number(planRank[currentPlanCode] ?? 0);
  const upgradePlans = useMemo(() => (
    (billingPlans || []).filter((plan) => Number(planRank[String(plan.code || "").toLowerCase()] ?? 0) > currentRank)
  ), [billingPlans, currentRank]);

  useEffect(() => {
    if (!currentCompanyId) {
      setJdEmailCcSuggestions([]);
      return;
    }
    const history = readJdCcHistory(currentCompanyId);
    const merged = defaultJdEmailCc
      ? Array.from(new Set([defaultJdEmailCc.toLowerCase(), ...history]))
      : history;
    setJdEmailCcSuggestions(merged);
  }, [currentCompanyId, defaultJdEmailCc]);

  useEffect(() => {
    if (!accessFlagsReady) return;
    const blockedPaths = new Set(["/client-share", "/intake-settings", "/candidates", "/mail-settings", "/reports", "/applicants"]);
    if (!hasSaasUnlimitedAccess && blockedPaths.has(String(location?.pathname || ""))) {
      navigate("/plan", { replace: true });
      setStatus("loginSettings", "This feature is available on SaaS Unlimited (Rs 4999).", "error");
    }
  }, [accessFlagsReady, hasSaasUnlimitedAccess, location?.pathname, navigate]);

  useEffect(() => {
    if (!accessFlagsReady) return;
    const pathname = String(location?.pathname || "");
    const isModulePath =
      pathname === "/client-login" ||
      pathname.startsWith("/client-portal") ||
      pathname === "/employee-login" ||
      pathname.startsWith("/employee-portal") ||
      pathname === "/payroll-login" ||
      pathname.startsWith("/payroll");
    if (!hasSuiteModulesAccess && isModulePath) {
      navigate("/plan", { replace: true });
      setStatus("loginSettings", "Client, Employee, and Payroll modules are available on Full Recruiter + Other Modules plans.", "error");
    }
  }, [accessFlagsReady, hasSuiteModulesAccess, location?.pathname, navigate]);

  useEffect(() => {
    // Keep every route landing at top to avoid blank-gap feel while async tab data hydrates.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [location?.pathname]);

  useEffect(() => {
    const visibleIds = new Set(loginSettingsOptions.map((item) => item.id));
    if (!visibleIds.has(loginSettingsPanel)) {
      setLoginSettingsPanel(loginSettingsOptions[0]?.id || "team");
    }
  }, [loginSettingsPanel, loginSettingsOptions]);

  useEffect(() => {
    if (String(location?.pathname || "") !== "/login-settings") return;
    const sectionEl = loginSettingsSectionRef.current;
    if (!sectionEl || typeof sectionEl.getBoundingClientRect !== "function") return;
    const rect = sectionEl.getBoundingClientRect();
    // Keep tab switch stable: only auto-scroll when the target section is actually above viewport.
    if (rect.top >= 16) return;
    window.requestAnimationFrame(() => {
      sectionEl.scrollIntoView({ block: "start", behavior: "auto" });
    });
  }, [loginSettingsPanel, location?.pathname]);

  async function openPlanUpgrade(planCode) {
    try {
      const code = String(planCode || "").trim();
      if (!code) throw new Error("Invalid plan code.");
      setPlanUpgradeBusyCode(code);
      const result = await api("/company/license/upgrade-link", token, "POST", { planCode: code });
      const upgradeUrl = String(result?.upgradeUrl || "").trim();
      if (!upgradeUrl) throw new Error("Could not open upgrade URL.");
      window.open(upgradeUrl, "_blank", "noopener,noreferrer");
      setStatus("loginSettings", "Upgrade page opened in new tab.", "ok");
    } catch (error) {
      setStatus("loginSettings", String(error?.message || error), "error");
    } finally {
      setPlanUpgradeBusyCode("");
    }
  }

	function setStatus(key, message, kind = "") {
	  const scopedKey = String(key || "").trim();
	  if (!scopedKey) return;
	  if (statusTimersRef.current[scopedKey]) {
	    clearTimeout(statusTimersRef.current[scopedKey]);
	    delete statusTimersRef.current[scopedKey];
	  }
	  setStatuses((current) => ({ ...current, [scopedKey]: message, [`${scopedKey}Kind`]: kind }));
	  const hasMessage = String(message || "").trim().length > 0;
	  if (!hasMessage) return;
	  const timeoutMs = kind === "error" ? 7000 : 4000;
	  statusTimersRef.current[scopedKey] = setTimeout(() => {
	    setStatuses((current) => {
	      if (String(current?.[scopedKey] || "") !== String(message || "")) return current;
	      const next = { ...current };
	      delete next[scopedKey];
	      delete next[`${scopedKey}Kind`];
	      return next;
	    });
	    delete statusTimersRef.current[scopedKey];
	  }, timeoutMs);
	}

  useEffect(() => () => {
    Object.values(statusTimersRef.current || {}).forEach((timerId) => {
      try { clearTimeout(timerId); } catch { /* ignore */ }
    });
    statusTimersRef.current = {};
  }, []);

  useEffect(() => {
    const message = String(statuses?.jobs || "").trim();
    if (!message) return;
    const hardClearMs = 8000;
    const timer = setTimeout(() => {
      setStatuses((current) => {
        if (String(current?.jobs || "").trim() !== message) return current;
        const next = { ...current };
        delete next.jobs;
        delete next.jobsKind;
        return next;
      });
    }, hardClearMs);
    return () => clearTimeout(timer);
  }, [statuses?.jobs]);

  function getTimeToFillDays(job) {
    const createdAtRaw = String(job?.createdAt || "").trim();
    const closedAtRaw = String(job?.closedAt || job?.archivedAt || "").trim();
    if (!createdAtRaw || !closedAtRaw) return null;
    const createdAt = new Date(createdAtRaw).getTime();
    const closedAt = new Date(closedAtRaw).getTime();
    if (!Number.isFinite(createdAt) || !Number.isFinite(closedAt) || closedAt < createdAt) return null;
    const days = Math.ceil((closedAt - createdAt) / (1000 * 60 * 60 * 24));
    return Math.max(0, days);
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

  function normalizeWhatsappPhone(phoneValue) {
    const digits = String(phoneValue || "").replace(/[^\d]/g, "");
    if (!digits) return "";
    // India-first normalization:
    // - 10 digits => prepend 91
    // - 11 digits starting with 0 => strip 0, prepend 91
    // - already 91 + 10 digits => keep
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith("91")) return digits;
    return digits;
  }

  function isMobileDevice() {
    if (typeof navigator === "undefined") return false;
    const ua = String(navigator.userAgent || "").toLowerCase();
    return /android|iphone|ipad|ipod|mobile/i.test(ua);
  }

  function buildWhatsappUrl(phoneValue, textValue = "") {
    const phone = normalizeWhatsappPhone(phoneValue);
    if (!phone) return "";
    const encodedText = String(textValue || "").trim() ? `?text=${encodeURIComponent(String(textValue || "").trim())}` : "";
    if (isMobileDevice()) return `https://wa.me/${encodeURIComponent(phone)}${encodedText}`;
    return `https://web.whatsapp.com/send?phone=${encodeURIComponent(phone)}${encodedText}`;
  }

  function openWhatsappInSideWindow(phoneValue, statusKey = "workspace", textValue = "") {
    const phone = normalizeWhatsappPhone(phoneValue);
    if (!phone) {
      setStatus(statusKey, "No phone number available for WhatsApp.", "error");
      return;
    }
    try {
      const url = buildWhatsappUrl(phone, textValue);
      if (!url) {
        setStatus(statusKey, "WhatsApp link unavailable for this number.", "error");
        return;
      }
      if (isMobileDevice()) {
        window.location.href = url;
        return;
      }
      const width = Math.min(760, Math.max(640, (window.outerWidth || 1400) - 420));
      const height = Math.min(980, Math.max(760, (window.outerHeight || 940) - 70));
      const left = Math.max(0, (window.screenX || 0) + (window.outerWidth || 1400) - width - 24);
      const top = Math.max(0, (window.screenY || 0) + 24);
      const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`;
      const win = window.open(url, "whatsapp_side_window", features);
      if (!win) return;
      win.focus?.();
    } catch {
      // Ignore popup blocker/runtime window errors.
    }
  }

  function resolveRowJobId(row = {}) {
    const jdId = String(row?.jd_id || row?.jdId || row?.jobId || "").trim();
    if (jdId) return jdId;
    const jdTitle = String(row?.jd_title || row?.jdTitle || row?.role || "").trim().toLowerCase();
    if (!jdTitle) return "";
    const matchedJob = (state.jobs || []).find((job) => String(job?.title || "").trim().toLowerCase() === jdTitle) || null;
    return String(matchedJob?.id || "").trim();
  }

  function getWhatsappTemplateOptions(row = {}, incomingPersonalShortcuts = null, incomingCompanyWideShortcuts = null) {
    const options = [];
    const companyWideMap = incomingCompanyWideShortcuts && typeof incomingCompanyWideShortcuts === "object"
      ? incomingCompanyWideShortcuts
      : copySettings?.companyWideShortcuts && typeof copySettings.companyWideShortcuts === "object"
        ? copySettings.companyWideShortcuts
      : {};
    Object.entries(companyWideMap || {}).forEach(([key, template]) => {
      const safeKey = String(key || "").trim();
      const displayKey = safeKey.replace(/^\/+/, "");
      const safeTemplate = String(template || "").trim();
      if (!displayKey || !safeTemplate) return;
      options.push({ id: `company:${displayKey}`, label: `/${displayKey} (Company)`, template: safeTemplate, scope: "company_wide" });
    });
    const personalMap = incomingPersonalShortcuts && typeof incomingPersonalShortcuts === "object" ? incomingPersonalShortcuts : personalShortcuts;
    Object.entries(personalMap || {}).forEach(([key, template]) => {
      const safeKey = String(key || "").trim();
      const displayKey = safeKey.replace(/^\/+/, "");
      const safeTemplate = String(template || "").trim();
      if (!displayKey || !safeTemplate) return;
      options.push({ id: `personal:${displayKey}`, label: `/${displayKey} (All jobs)`, template: safeTemplate, scope: "all_jobs" });
    });
    const normalizeJdMatch = (value = "") => String(value || "").trim().toLowerCase().replace(/[\s\-_]+/g, " ");
    const jdId = String(row?.jd_id || row?.jdId || row?.jobId || "").trim();
    const jdTitle = normalizeJdMatch(row?.jd_title || row?.jdTitle || row?.role || "");
    const jobs = Array.from(
      new Map(
        [
          ...(Array.isArray(state.jobs) ? state.jobs : []),
          ...(Array.isArray(jobsCatalog) ? jobsCatalog : [])
        ].map((job) => [String(job?.id || `${job?.title || ""}`), job])
      ).values()
    );
    const matchedJob = jobs.find((job) => {
      const jobTitle = normalizeJdMatch(job?.title || "");
      if (jdId && String(job?.id || "").trim() === jdId) return true;
      if (jdTitle && jobTitle && jdTitle === jobTitle) return true;
      if (jdTitle && jobTitle && (jdTitle.includes(jobTitle) || jobTitle.includes(jdTitle))) return true;
      return false;
    }) || null;

    const addShortcutOptions = (map = {}, prefix = "shortcut", titleLabel = "") => {
      Object.entries(map || {}).forEach(([key, template]) => {
        const safeKey = String(key || "").trim();
        const displayKey = safeKey.replace(/^\/+/, "");
        const safeTemplate = String(template || "").trim();
        if (!displayKey || !safeTemplate) return;
        const label = titleLabel ? `/${displayKey} (${titleLabel})` : `/${displayKey}`;
        options.push({ id: `${prefix}:${displayKey}:${titleLabel}`, label, template: safeTemplate, scope: "this_job" });
      });
    };

    addShortcutOptions(parseShortcutMap(matchedJob?.jdShortcuts || ""), "shortcut", String(matchedJob?.title || "").trim());

    // Fallback: if JD match is weak/missing, still show recruiter's saved shortcuts from other JDs.
    if (!matchedJob) {
      jobs.forEach((job) => {
        const titleLabel = String(job?.title || "").trim();
        addShortcutOptions(parseShortcutMap(job?.jdShortcuts || ""), "shortcut", titleLabel);
      });
    }

    // Extra fallback: if user is editing a JD in Jobs tab, include draft shortcuts too.
    addShortcutOptions(parseShortcutMap(jobDraft?.jdShortcuts || ""), "draft", String(jobDraft?.title || "").trim());

    return options.filter((item, index, arr) => (
      arr.findIndex((entry) => String(entry.template || "").trim() === String(item.template || "").trim()) === index
    ));
  }

  async function copyWhatsappDraftAndOpen(row = {}, phoneValue = "", statusKey = "workspace", templateOverride = "") {
    const activeTemplate = String(templateOverride || "").trim();
    if (!activeTemplate) {
      setStatus(statusKey, "No shortcut template found. Create one first.", "error");
      return;
    }
    const text = fillCandidateTemplate(activeTemplate, {
      ...row,
      index: 1,
      follow_up_at: formatDateForCopy(row?.follow_up_at || row?.next_follow_up_at || "")
    });
    const hasTemplateText = String(text || "").trim().length > 0;
    if (hasTemplateText) {
      try {
        await copyText(text);
        setStatus(statusKey, "WhatsApp draft copied. Paste in chat (Ctrl+V).", "ok");
      } catch {
        // ignore clipboard errors and still open WhatsApp
      }
    }
    openWhatsappInSideWindow(phoneValue, statusKey);
  }

  async function loadPersonalShortcuts() {
    if (!token) return {};
    const result = await api("/company/personal-shortcuts", token).catch(() => null);
    const shortcuts = normalizeShortcutMapKeys(result?.shortcuts && typeof result.shortcuts === "object" ? result.shortcuts : {});
    setPersonalShortcuts(shortcuts);
    return shortcuts;
  }

  function renderWhatsappTemplatePreview(template = "", row = {}) {
    const resolvedJobId = resolveRowJobId(row);
    const baseJdLink = resolvedJobId ? getApplyLink(resolvedJobId) : "";
    const recruiterJdLink = String(row?.recruiter_jd_link || row?.recruiterJdLink || "").trim() || baseJdLink;
    return fillCandidateTemplate(String(template || "").trim(), {
      ...row,
      index: 1,
      follow_up_at: formatDateForCopy(row?.follow_up_at || row?.next_follow_up_at || ""),
      jd_link: baseJdLink,
      recruiter_jd_link: recruiterJdLink
    });
  }

  async function fetchRecruiterApplyLinkForRow(row = {}) {
    const jobId = resolveRowJobId(row);
    if (!jobId || !token) return "";
    try {
      const result = await api(`/company/jobs/${encodeURIComponent(jobId)}/apply-link-signatures`, token);
      const items = Array.isArray(result?.items) ? result.items : [];
      const selfId = String(state.user?.id || "").trim();
      const mine = items.find((item) => String(item?.recruiterId || "").trim() === selfId) || items[0] || null;
      if (!mine?.sig) return getApplyLink(jobId);
      return getRecruiterApplyLink(jobId, mine.recruiterId, mine.sig);
    } catch {
      return getApplyLink(jobId);
    }
  }

  async function openWhatsappTemplatePicker(row = {}, phoneValue = "", statusKey = "workspace") {
    const cachedCompanyWideShortcuts =
      copySettings?.companyWideShortcuts && typeof copySettings.companyWideShortcuts === "object"
        ? copySettings.companyWideShortcuts
        : {};
    const rowWithLinks = {
      ...(row || {}),
      recruiter_jd_link: String(row?.recruiter_jd_link || row?.recruiterJdLink || "").trim(),
      jd_link: resolveRowJobId(row) ? getApplyLink(resolveRowJobId(row)) : ""
    };
    const options = getWhatsappTemplateOptions(row, personalShortcuts, cachedCompanyWideShortcuts);
    const selectedId = String(options[0]?.id || "");
    const selectedTemplate = String(options[0]?.template || "");
    setWhatsappTemplatePicker({
      open: true,
      options,
      selectedId,
      row: rowWithLinks,
      phone: phoneValue,
      statusKey,
      customText: selectedTemplate
        ? renderWhatsappTemplatePreview(selectedTemplate, rowWithLinks)
        : "",
      newShortcutKey: "",
      saveScope: "all_jobs",
      assignJobId: resolveRowJobId(rowWithLinks)
    });

    // Keep popup instant; hydrate latest shortcuts and recruiter apply link in background.
    void (async () => {
      const [latestPersonalShortcuts, sharedPresetResult, recruiterLink] = await Promise.all([
        loadPersonalShortcuts().catch(() => personalShortcuts || {}),
        api("/company/shared-export-presets", token).catch(() => null),
        fetchRecruiterApplyLinkForRow(row).catch(() => "")
      ]);
      let latestCompanyWideShortcuts = cachedCompanyWideShortcuts;
      if (sharedPresetResult && typeof sharedPresetResult === "object") {
        const merged = migrateCopySettings({ ...copySettings, ...sharedPresetResult });
        latestCompanyWideShortcuts =
          merged?.companyWideShortcuts && typeof merged.companyWideShortcuts === "object"
            ? merged.companyWideShortcuts
            : latestCompanyWideShortcuts;
        setCopySettings((current) => migrateCopySettings({ ...current, ...sharedPresetResult }));
      }
      const hydratedRow = {
        ...rowWithLinks,
        recruiter_jd_link: recruiterLink || rowWithLinks.recruiter_jd_link || "",
        jd_link: rowWithLinks.jd_link || (resolveRowJobId(row) ? getApplyLink(resolveRowJobId(row)) : "")
      };
      const hydratedOptions = getWhatsappTemplateOptions(hydratedRow, latestPersonalShortcuts, latestCompanyWideShortcuts);
      const hydratedSelectedTemplate = String(hydratedOptions[0]?.template || "");
      setWhatsappTemplatePicker((current) => {
        if (!current.open) return current;
        return {
          ...current,
          row: hydratedRow,
          options: hydratedOptions,
          customText:
            String(current.customText || "").trim() ||
            (hydratedSelectedTemplate ? renderWhatsappTemplatePreview(hydratedSelectedTemplate, hydratedRow) : "")
        };
      });
    })();
  }

  async function applyWhatsappTemplatePickerSelection() {
    const customText = String(whatsappTemplatePicker.customText || "").trim();
    if (!customText) {
      setStatus(whatsappTemplatePicker.statusKey || "workspace", "Template text is empty.", "error");
      return;
    }
    const phone = whatsappTemplatePicker.phone || "";
    // Open immediately in user gesture context to avoid popup blocking on mobile browsers.
    openWhatsappInSideWindow(phone, whatsappTemplatePicker.statusKey || "workspace", customText);
    try {
      await copyText(customText);
      setStatus(whatsappTemplatePicker.statusKey || "workspace", "WhatsApp draft copied. Paste in chat (Ctrl+V).", "ok");
    } catch {
      // ignore clipboard error and still open whatsapp
    }
    setWhatsappTemplatePicker({ open: false, options: [], selectedId: "", row: null, phone: "", statusKey: "workspace", customText: "", newShortcutKey: "", saveScope: "all_jobs", assignJobId: "" });
  }

  async function saveWhatsappTemplateFromPicker() {
    const shortcutKey = normalizeShortcutKey(whatsappTemplatePicker.newShortcutKey);
    const templateText = String(whatsappTemplatePicker.customText || "").trim();
    if (!shortcutKey || !templateText) {
      setStatus(whatsappTemplatePicker.statusKey || "workspace", "Add shortcut key and template text.", "error");
      return;
    }
    let refreshedCompanyWideForPicker = null;
    if (whatsappTemplatePicker.saveScope === "company_wide") {
      if (!isSettingsAdmin) {
        setStatus(whatsappTemplatePicker.statusKey || "workspace", "Only admin can save company templates.", "error");
        return;
      }
      const existingCompanyWide = copySettings?.companyWideShortcuts && typeof copySettings.companyWideShortcuts === "object"
        ? copySettings.companyWideShortcuts
        : {};
      const nextCompanyWide = { ...existingCompanyWide, [shortcutKey]: templateText };
      const payload = {
        ...copySettings,
        companyWideShortcuts: nextCompanyWide,
        exportPresetLabels: copySettings.exportPresetLabels || DEFAULT_COPY_SETTINGS.exportPresetLabels,
        exportPresetClientMap: copySettings.exportPresetClientMap || DEFAULT_COPY_SETTINGS.exportPresetClientMap,
        customExportPresets: copySettings.customExportPresets || []
      };
      const result = await api("/company/shared-export-presets", token, "POST", { settings: payload });
      setCopySettings((current) => ({ ...DEFAULT_COPY_SETTINGS, ...current, ...result }));
      refreshedCompanyWideForPicker = nextCompanyWide;
      setStatus(whatsappTemplatePicker.statusKey || "workspace", `Saved /${shortcutKey} for all recruiters.`, "ok");
    } else if (whatsappTemplatePicker.saveScope === "all_jobs") {
      const next = { ...(personalShortcuts || {}), [shortcutKey]: templateText };
      const result = await api("/company/personal-shortcuts", token, "POST", { shortcuts: next });
      const saved = result?.shortcuts && typeof result.shortcuts === "object" ? result.shortcuts : next;
      setPersonalShortcuts(saved);
      setStatus(whatsappTemplatePicker.statusKey || "workspace", `Saved /${shortcutKey} for all jobs.`, "ok");
    } else {
      const jobId = String(whatsappTemplatePicker.assignJobId || "").trim();
      if (!jobId) {
        setStatus(whatsappTemplatePicker.statusKey || "workspace", "Select a job for 'save for this job'.", "error");
        return;
      }
      const job = (state.jobs || []).find((item) => String(item?.id || "") === jobId) || null;
      const map = parseShortcutMap(job?.jdShortcuts || "");
      map[shortcutKey] = templateText;
      const payloadShortcuts = stringifyShortcutMap(map);
      const result = await api("/company/jds/shortcuts", token, "POST", { jobId, shortcuts: payloadShortcuts });
      const savedShortcuts = String(result?.result?.jdShortcuts || result?.jdShortcuts || payloadShortcuts);
      setState((current) => ({
        ...current,
        jobs: Array.isArray(current.jobs)
          ? current.jobs.map((item) => String(item?.id || "") === jobId ? { ...item, jdShortcuts: savedShortcuts } : item)
          : current.jobs
      }));
      setStatus(whatsappTemplatePicker.statusKey || "workspace", `Saved /${shortcutKey} for this job.`, "ok");
    }
    const row = whatsappTemplatePicker.row || {};
    const refreshedPersonal = whatsappTemplatePicker.saveScope === "all_jobs" ? { ...(personalShortcuts || {}), [shortcutKey]: templateText } : personalShortcuts;
    const options = getWhatsappTemplateOptions(
      row,
      refreshedPersonal,
      refreshedCompanyWideForPicker || undefined
    );
    const selectedId = options.find((item) => String(item.label || "").toLowerCase().includes(`/${shortcutKey}`.toLowerCase()))?.id || String(options[0]?.id || "");
    const selectedTemplate = options.find((item) => String(item.id || "") === String(selectedId || ""))?.template || "";
    setWhatsappTemplatePicker((current) => ({
      ...current,
      options,
      selectedId,
      customText: renderWhatsappTemplatePreview(selectedTemplate, row),
      newShortcutKey: ""
    }));
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

  async function loadWorkspace(options = {}) {
    const {
      includeEvents = true,
      includeClientUsers = true,
      includeEmployeeUsers = true,
      includeSharedPresets = true,
      includeEmailSettings = true
    } = options || {};
    const pathname = String(location?.pathname || "/dashboard").trim() || "/dashboard";
    const needsDashboard = pathname === "/dashboard";
    const needsApplicants = pathname === "/dashboard" || pathname === "/applicants";
    const needsIntake = pathname === "/intake-settings" || pathname === "/jobs" || pathname === "/applicants";
    const needsJobs = pathname !== "/mail-settings" && pathname !== "/settings" && pathname !== "/login-settings" && pathname !== "/plan";
    const needsUsers = needsJobs || pathname === "/login-settings";
    const needsEmployeeUsers = includeEmployeeUsers && (pathname === "/login-settings" || pathname.startsWith("/admin/payroll"));
    const needsCandidates =
      pathname === "/dashboard" ||
      pathname === "/captured-notes" ||
      pathname === "/assessments" ||
      pathname === "/interview";
    const needsDatabaseCandidates = pathname === "/candidates";
    const needsAssessments =
      pathname === "/dashboard" ||
      pathname === "/assessments" ||
      pathname === "/client-share" ||
      pathname === "/interview";
    // Candidate smart-search chips (Shared this week/today) need conversion timestamps,
    // which are best sourced from assessment events.
    const needsAssessmentEvents = includeEvents && (pathname === "/dashboard" || pathname === "/assessments" || pathname === "/candidates");
    const needsEmailSettings = includeEmailSettings && pathname === "/mail-settings";
    // Billing/access flags are used in sidebar gating across the app,
    // so fetch billing overview on all recruiter routes (plans list only needed on /plan).
    const needsBilling = true;
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

    const [userResult, dashboardResult, clientPortalResult, applicantsResult, intakeResult, jobsResult, jobsManageResult, usersResult, clientUsersResult, employeeUsersResult, candidatesResult, databaseCandidatesResult, assessmentsResult, assessmentEventsResult, sharedPresetResult, smtpSettingsResult, licenseResult, billingOverviewResult, billingPlansResult] = await Promise.all([
      api("/auth/me", token),
      needsDashboard
        ? api(`/company/dashboard${dashboardParams.toString() ? `?${dashboardParams.toString()}` : ""}`, token)
        : Promise.resolve(null),
      needsDashboard
        ? api(`/company/client-portal${clientPortalParams.toString() ? `?${clientPortalParams.toString()}` : ""}`, token)
            .catch(() => ({ summary: { byClient: [], byClientPosition: [] }, availableClients: [] }))
        : Promise.resolve(null),
      needsApplicants ? api("/company/applicants", token).catch(() => ({ items: [] })) : Promise.resolve(null),
      needsIntake ? api("/company/applicant-intake-secret", token).catch(() => null) : Promise.resolve(null),
      needsJobs ? api("/company/jds", token).catch(() => ({ jobs: [] })) : Promise.resolve(null),
      needsJobs ? api("/company/jds?includeArchived=1", token).catch(() => ({ jobs: [] })) : Promise.resolve(null),
      needsUsers ? api("/company/users", token).catch(() => ({ users: [] })) : Promise.resolve(null),
      includeClientUsers
        ? api("/company/client-users", token).catch(() => ({ clientUsers: [] }))
        : Promise.resolve(null),
      needsEmployeeUsers
        ? api("/company/employees", token).catch(() => ({ employees: [] }))
        : Promise.resolve(null),
      needsCandidates ? api("/candidates?limit=5000", token).catch(() => []) : Promise.resolve(null),
      needsDatabaseCandidates ? api("/company/database-candidates?limit=5000", token).catch(() => []) : Promise.resolve(null),
      needsAssessments ? api("/company/assessments", token).catch(() => ({ assessments: [] })) : Promise.resolve(null),
      needsAssessmentEvents
        ? api("/company/assessment-events?limit=10000", token).catch(() => ({ result: { rows: [] } }))
        : Promise.resolve(null),
      includeSharedPresets
        ? api("/company/shared-export-presets", token).catch(() => null)
        : Promise.resolve(null),
      needsEmailSettings
        ? api("/company/email-settings", token).catch(() => null)
        : Promise.resolve(null),
      api("/license/me", token).catch(() => null),
      needsBilling ? api("/company/billing/overview", token).catch(() => null) : Promise.resolve(null),
      pathname === "/plan" ? api("/company/billing/plans", token).catch(() => ({ plans: [] })) : Promise.resolve(null)
    ]);
    const nextDashboard =
      needsDashboard && latestDashboardKeyRef.current === dashboardKey
        ? (
            dashboardResult && typeof dashboardResult === "object" && Object.keys(dashboardResult).length
              ? dashboardResult
              : (current => current.dashboard)
          )
        : (current => current.dashboard);
    const nextClientPortal =
      needsDashboard && latestClientPortalKeyRef.current === clientPortalKey
        ? (
            clientPortalResult && typeof clientPortalResult === "object" && Object.keys(clientPortalResult).length
              ? clientPortalResult
              : (current => current.clientPortal)
          )
        : (current => current.clientPortal);

    setState((current) => ({
      ...current,
      user: userResult.user || userResult,
      dashboard: nextDashboard(current),
      clientPortal: nextClientPortal(current),
      applicants: needsApplicants ? (applicantsResult?.items || []) : current.applicants,
      intake: needsIntake ? (intakeResult || {}) : current.intake,
      jobs: needsJobs ? (jobsResult?.jobs || []) : current.jobs,
      users: needsUsers ? (usersResult?.users || []) : current.users,
      candidates: needsCandidates ? (Array.isArray(candidatesResult) ? candidatesResult : []) : current.candidates,
      databaseCandidates: needsDatabaseCandidates
        ? (Array.isArray(databaseCandidatesResult) ? databaseCandidatesResult : [])
        : current.databaseCandidates,
      assessments: needsAssessments ? (assessmentsResult?.assessments || []) : current.assessments,
      assessmentEvents: needsAssessmentEvents ? (assessmentEventsResult?.result?.rows || []) : current.assessmentEvents
    }));
    if (needsJobs) {
      setJobsCatalog(Array.isArray(jobsManageResult?.jobs) ? jobsManageResult.jobs : []);
    }
    if (includeClientUsers && clientUsersResult) {
      setClientUsers(clientUsersResult.clientUsers || []);
    }
    if (needsEmployeeUsers && employeeUsersResult) {
      setEmployeeUsers(employeeUsersResult?.employees || []);
    }
    if (includeSharedPresets && sharedPresetResult) {
      setCopySettings((current) => migrateCopySettings({ ...current, ...sharedPresetResult }));
    }
    if (needsEmailSettings && smtpSettingsResult) {
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
    setCompanyLicense(licenseResult?.license || null);
    if (needsBilling) {
      setBillingOverview(billingOverviewResult || null);
      if (pathname === "/plan") {
        setBillingPlans(Array.isArray(billingPlansResult?.plans) ? billingPlansResult.plans : []);
      }
    }
  }

  loadWorkspaceRef.current = loadWorkspace;

  async function refreshWorkspaceSilently(reason = "manual", options = {}) {
    if (!token || workspaceRefreshInFlightRef.current) return;
    if (suspendWorkspaceRefreshRef.current) return;
    const now = Date.now();
    const throttleMs = 15000;
    const force = Boolean(options?.force);
    if (!force && now - lastWorkspaceRefreshAtRef.current < throttleMs) return;
    workspaceRefreshInFlightRef.current = true;
    lastWorkspaceRefreshAtRef.current = now;
    try {
      const latestLoader = loadWorkspaceRef.current;
      if (typeof latestLoader === "function") {
        await latestLoader({
          includeEvents: false,
          includeClientUsers: false,
          includeSharedPresets: Boolean(options?.includeSharedPresets),
          includeEmailSettings: Boolean(options?.includeEmailSettings)
        });
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

  async function reloadApplicantsSlice() {
    if (!token) return;
    const applicantsResult = await api("/company/applicants", token).catch(() => ({ items: [] }));
    setState((current) => ({
      ...current,
      applicants: applicantsResult?.items || []
    }));
  }

  async function reloadIntakeSlice() {
    if (!token) return;
    const intakeResult = await api("/company/applicant-intake-secret", token).catch(() => null);
    setState((current) => ({
      ...current,
      intake: intakeResult || {}
    }));
  }

  async function reloadJobsWorkspace() {
    if (!token) return;
    const [jobsResult, jobsManageResult, usersResult, intakeResult] = await Promise.all([
      api("/company/jds", token).catch(() => ({ jobs: [] })),
      api("/company/jds?includeArchived=1", token).catch(() => ({ jobs: [] })),
      api("/company/users", token).catch(() => ({ users: [] })),
      api("/company/applicant-intake-secret", token).catch(() => null)
    ]);
    setState((current) => ({
      ...current,
      jobs: jobsResult?.jobs || [],
      users: usersResult?.users || [],
      intake: intakeResult || current.intake
    }));
    setJobsCatalog(Array.isArray(jobsManageResult?.jobs) ? jobsManageResult.jobs : []);
  }

  async function reloadLoginSettingsWorkspace() {
    if (!token) return;
    const [usersResult, clientUsersResult, licenseResult] = await Promise.all([
      api("/company/users", token).catch(() => ({ users: [] })),
      api("/company/client-users", token).catch(() => ({ clientUsers: [] })),
      api("/license/me", token).catch(() => null)
    ]);
    const employeesEnvelope = await api("/company/employees", token)
      .then((data) => ({ ok: true, data }))
      .catch((error) => ({ ok: false, error: String(error?.message || error) }));
    setState((current) => ({
      ...current,
      users: usersResult?.users || []
    }));
    setClientUsers(clientUsersResult?.clientUsers || []);
    setCompanyLicense(licenseResult?.license || null);
    if (employeesEnvelope.ok) {
      setEmployeeUsers(employeesEnvelope?.data?.employees || []);
    } else {
      setStatus("loginEmployee", `Employee list refresh failed: ${employeesEnvelope.error}`, "error");
    }
  }

  async function reloadCandidatesSlice({ includeDatabase = false } = {}) {
    if (!token) return;
    const [candidatesResult, databaseCandidatesResult] = await Promise.all([
      api("/candidates?limit=5000", token).catch(() => []),
      includeDatabase ? api("/company/database-candidates?limit=5000", token).catch(() => []) : Promise.resolve(null)
    ]);
    setState((current) => ({
      ...current,
      candidates: Array.isArray(candidatesResult) ? candidatesResult : current.candidates,
      databaseCandidates: includeDatabase
        ? (Array.isArray(databaseCandidatesResult) ? databaseCandidatesResult : current.databaseCandidates)
        : current.databaseCandidates
    }));
  }

  async function reloadAssessmentsSlice({ includeEvents = false } = {}) {
    if (!token) return;
    const [assessmentsResult, assessmentEventsResult] = await Promise.all([
      api("/company/assessments", token).catch(() => ({ assessments: [] })),
      includeEvents
        ? api("/company/assessment-events?limit=10000", token).catch(() => ({ result: { rows: [] } }))
        : Promise.resolve(null)
    ]);
    setState((current) => ({
      ...current,
      assessments: assessmentsResult?.assessments || current.assessments,
      assessmentEvents: includeEvents ? (assessmentEventsResult?.result?.rows || current.assessmentEvents) : current.assessmentEvents
    }));
  }

  useEffect(() => {
    if (!token) return;
    const pathname = String(location?.pathname || "/dashboard").trim() || "/dashboard";
    const now = Date.now();
    const ttlMs = 30000;
    const lastForPath = Number(lastWorkspaceRefreshByPathRef.current?.[pathname] || 0);
    if (now - lastForPath < ttlMs) return;
    lastWorkspaceRefreshByPathRef.current = {
      ...(lastWorkspaceRefreshByPathRef.current || {}),
      [pathname]: now
    };
    lastWorkspaceRefreshAtRef.current = now;
    void loadWorkspace().catch((error) => setStatus("workspace", String(error?.message || error), "error"));
  }, [token, location?.pathname]);

  useEffect(() => {
    if (!token) return undefined;
    // Keep workspace refresh manual/lightweight to avoid burning Supabase egress on every tab focus/poll.
    return undefined;
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (String(location?.pathname || "") !== "/shortcuts") return;
    void loadPersonalShortcuts();
    if (!String(shortcutJobId || "").trim()) {
      const firstJobId = String((state.jobs || [])[0]?.id || "").trim();
      if (firstJobId) setShortcutJobId(firstJobId);
    }
  }, [token, location?.pathname, state.jobs, shortcutJobId]);

  useEffect(() => {
    if (!token) return undefined;
    const templateSensitivePaths = new Set(["/jobs", "/shortcuts", "/settings", "/mail-settings", "/client-share", "/captured-notes", "/assessments", "/applicants"]);
    function syncOnFocusLikeEvent() {
      if (document.visibilityState === "hidden") return;
      const includeSharedPresets = templateSensitivePaths.has(String(location?.pathname || ""));
      const includeEmailSettings = String(location?.pathname || "") === "/mail-settings";
      void refreshWorkspaceSilently("focus-sync", { includeSharedPresets, includeEmailSettings, force: true });
    }
    window.addEventListener("focus", syncOnFocusLikeEvent);
    window.addEventListener("pageshow", syncOnFocusLikeEvent);
    document.addEventListener("visibilitychange", syncOnFocusLikeEvent);
    return () => {
      window.removeEventListener("focus", syncOnFocusLikeEvent);
      window.removeEventListener("pageshow", syncOnFocusLikeEvent);
      document.removeEventListener("visibilitychange", syncOnFocusLikeEvent);
    };
  }, [token, location?.pathname]);

  useEffect(() => {
    if (!token) return undefined;
    async function refreshAfterUpgrade(source = "upgrade") {
      try {
        const latestLoader = loadWorkspaceRef.current;
        if (typeof latestLoader === "function") await latestLoader();
        setStatus("loginSettings", "Plan upgraded successfully. Billing refreshed.", "ok");
      } catch (error) {
        setStatus("loginSettings", `Upgrade detected but refresh failed: ${String(error?.message || error)}`, "error");
      }
    }
    function onStorage(event) {
      if (String(event?.key || "") !== "rd_upgrade_success") return;
      void refreshAfterUpgrade("storage");
    }
    function onMessage(event) {
      const data = event?.data || {};
      if (String(data?.type || "") !== "RSD_UPGRADE_SUCCESS") return;
      void refreshAfterUpgrade("message");
    }
    function onFocus() {
      try {
        const raw = window.localStorage.getItem("rd_upgrade_success");
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const at = Date.parse(String(parsed?.at || ""));
        if (Number.isFinite(at) && Date.now() - at <= 10 * 60 * 1000) {
          void refreshAfterUpgrade("focus");
        }
      } catch {
        // ignore parse/storage issues
      }
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("message", onMessage);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("message", onMessage);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
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
    const combined = [...databaseRows, ...assessmentOnlyItems];
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    if (isAdmin) return combined;
    const currentUserId = String(state.user?.id || "").trim();
    const currentUserName = String(state.user?.name || "").trim().toLowerCase();
    return combined.filter((item) => {
      const assignedUserId = String(item?.assigned_to_user_id || item?.assignedToUserId || "").trim();
      const ownerRecruiterId = String(item?.ownerRecruiterId || item?.recruiter_id || "").trim();
      const assignedToName = String(item?.assigned_to_name || item?.assignedToName || "").trim().toLowerCase();
      const recruiterName = String(item?.ownerRecruiter || item?.recruiterName || item?.recruiter_name || "").trim().toLowerCase();
      if (currentUserId && (assignedUserId === currentUserId || ownerRecruiterId === currentUserId)) return true;
      if (currentUserName && (assignedToName === currentUserName || recruiterName === currentUserName)) return true;
      return false;
    });
  }, [state.assessments, state.candidates, state.databaseCandidates, state.user]);
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
    const emptyRows = {
      aligned_interviews: [],
      feedback_awaited: [],
      quick_joiners: [],
      shared_today: [],
      shared_this_week: [],
      offered_candidates: [],
      cv_shared: []
    };
    try {
    const assessments = Array.isArray(state.assessments) ? state.assessments : [];
    const assessmentById = new Map(assessments.map((assessment) => [String(assessment?.id || "").trim(), assessment]));
    const assessmentByCandidateId = new Map();
    assessments.forEach((assessment) => {
      const candidateId = String(
        assessment?.candidateId
        || assessment?.candidate_id
        || assessment?.payload?.candidateId
        || assessment?.payload?.candidate_id
        || ""
      ).trim();
      if (candidateId && !assessmentByCandidateId.has(candidateId)) {
        assessmentByCandidateId.set(candidateId, assessment);
      }
    });
    const candidateRows = Array.isArray(state.candidates) ? state.candidates : [];
    const candidateById = new Map(
      candidateRows.map((candidate) => [String(candidate?.id || "").trim(), candidate]).filter(([id]) => id)
    );
    const universeAssessmentIds = new Set();
    const universeCandidateIds = new Set();
    const universeConvertedAtByAssessmentId = new Map();
    const universeConvertedAtByCandidateId = new Map();
    (candidateUniverse || []).forEach((item) => {
      const assessmentId = String(
        item?.assessment_id
        || item?.assessmentId
        || item?.assessment?.id
        || item?.raw?.assessment?.id
        || ""
      ).trim();
      const candidateId = String(
        item?.id
        || item?.candidate_id
        || item?.candidateId
        || item?.raw?.candidate?.id
        || ""
      ).trim();
      const sharedAt = String(item?.sharedAt || "").trim();
      if (assessmentId) universeAssessmentIds.add(assessmentId);
      if (candidateId) universeCandidateIds.add(candidateId);
      if (assessmentId && sharedAt && !universeConvertedAtByAssessmentId.has(assessmentId)) {
        universeConvertedAtByAssessmentId.set(assessmentId, sharedAt);
      }
      if (candidateId && sharedAt && !universeConvertedAtByCandidateId.has(candidateId)) {
        universeConvertedAtByCandidateId.set(candidateId, sharedAt);
      }
    });
    const fromTs = candidateSmartDateFrom ? new Date(`${candidateSmartDateFrom}T00:00:00`).getTime() : null;
    const toTs = candidateSmartDateTo ? new Date(`${candidateSmartDateTo}T23:59:59`).getTime() : null;
    const now = new Date();
    const startOfTodayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfTodayTs = startOfTodayTs + (24 * 60 * 60 * 1000) - 1;
    const dayOfWeek = now.getDay(); // 0 sunday
    const weekStartTs = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
    const weekEndTs = weekStartTs + (7 * 24 * 60 * 60 * 1000) - 1;
    const inDateRange = (value) => {
      if (!fromTs && !toTs) return true;
      const ts = toTimestampSafe(value);
      if (!Number.isFinite(ts)) return false;
      if (fromTs && ts < fromTs) return false;
      if (toTs && ts > toTs) return false;
      return true;
    };
    const inToday = (value) => {
      const ts = toTimestampSafe(value);
      if (!Number.isFinite(ts)) return false;
      return ts >= startOfTodayTs && ts <= endOfTodayTs;
    };
    const inThisWeek = (value) => {
      const ts = toTimestampSafe(value);
      if (!Number.isFinite(ts)) return false;
      return ts >= weekStartTs && ts <= weekEndTs;
    };
    const normalizeStatus = (value) => normalizeAssessmentStatusLabel(String(value || "")).toLowerCase();
    const rowsByChip = { ...emptyRows };
    const assessmentSharedAtMap = new Map();
    const eventRows = Array.isArray(state.assessmentEvents) ? state.assessmentEvents : [];
    eventRows.forEach((event) => {
      const assessmentId = String(event?.assessment_id || event?.assessmentId || "").trim();
      if (!assessmentId) return;
      const eventType = String(event?.event_type || event?.eventType || "").trim().toLowerCase();
      const status = normalizeAssessmentStatusLabel(String(event?.status || "")).toLowerCase();
      const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
      const previousStatus = normalizeAssessmentStatusLabel(String(payload?.previousStatus || "")).toLowerCase();
      const eventAt = String(event?.event_at || event?.eventAt || event?.created_at || event?.createdAt || "").trim();
      const isInitialShareEvent =
        eventType === "converted"
        || (eventType === "status_updated" && !previousStatus && status === "cv shared");
      if (isInitialShareEvent && eventAt) {
        const existing = assessmentSharedAtMap.get(assessmentId);
        if (!existing || toTimestampSafe(eventAt) < toTimestampSafe(existing)) {
          assessmentSharedAtMap.set(assessmentId, eventAt);
        }
      }
    });
    assessments.forEach((assessment) => {
      const assessmentId = String(assessment?.id || "").trim();
      const candidateId = String(
        assessment?.candidateId
        || assessment?.candidate_id
        || assessment?.payload?.candidateId
        || assessment?.payload?.candidate_id
        || ""
      ).trim();
      const hasAssessmentScope = universeAssessmentIds.size > 0;
      const inScopedUniverse = hasAssessmentScope
        ? (assessmentId && universeAssessmentIds.has(assessmentId))
        : (candidateId && universeCandidateIds.has(candidateId));
      if (!inScopedUniverse) return;
      const item = (candidateId && candidateById.get(candidateId)) || null;
      const linkedAssessment = assessmentById.get(assessmentId)
        || (candidateId ? assessmentByCandidateId.get(candidateId) : null)
        || null;
      if (!linkedAssessment) return;
      const assessmentStatus = normalizeStatus(
        linkedAssessment?.candidateStatus
          || linkedAssessment?.status
          || ""
      );
      const interviewAt = String(
        linkedAssessment?.interviewAt
          || linkedAssessment?.interview_at
          || ""
      ).trim();
      const updatedAt = String(
        linkedAssessment?.generatedAt
          || linkedAssessment?.generated_at
          || linkedAssessment?.updatedAt
          || linkedAssessment?.updated_at
          || ""
      ).trim();
      const statusHistory = Array.isArray(linkedAssessment?.statusHistory) ? linkedAssessment.statusHistory : [];
      // Status history ordering isn't guaranteed (some payloads prepend newest).
      // Find the earliest "conversion/share" marker across the full list.
      let statusHistoryConvertedAt = "";
      statusHistory.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const at = String(entry?.at || "").trim();
        if (!at) return;
        const label = normalizeAssessmentStatusLabel(String(entry?.status || "")).toLowerCase();
        const notes = String(entry?.notes || "").trim().toLowerCase();
        const isConversionMarker = label === "cv shared" || notes.includes("converted into assessment");
        if (!isConversionMarker) return;
        if (!statusHistoryConvertedAt || toTimestampSafe(at) < toTimestampSafe(statusHistoryConvertedAt)) {
          statusHistoryConvertedAt = at;
        }
      });
      const convertedAt = String(
        universeConvertedAtByAssessmentId.get(String(linkedAssessment?.id || assessmentId || "").trim())
          || universeConvertedAtByCandidateId.get(candidateId)
          || assessmentSharedAtMap.get(String(linkedAssessment?.id || assessmentId || "").trim())
          || statusHistoryConvertedAt
          || linkedAssessment?.createdAt
          || linkedAssessment?.created_at
          || ""
      ).trim();
      const noticeDays = parseNoticePeriodToDays(item?.notice_period || item?.noticePeriod || "");
      const baseRow = {
        item: item || { assessmentId: linkedAssessment?.id, candidateId },
        candidateName: item?.name || item?.candidateName || "Candidate",
        role: linkedAssessment?.jdTitle || item?.role || item?.currentDesignation || item?.jd_title || item?.jdTitle || "",
        client: linkedAssessment?.clientName || item?.client_name || item?.clientName || "",
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
        rowsByChip.aligned_interviews.push({ ...baseRow, round: formatAssessmentStatusDisplay(assessmentStatus) });
      }
      if (assessmentStatus === "feedback awaited" && inDateRange(interviewAt || updatedAt)) {
        rowsByChip.feedback_awaited.push({ ...baseRow, round: "Feedback awaited" });
      }
      const capturedIsActive = item ? (item?.hidden_from_captured !== true && item?.hiddenFromCaptured !== true) : true;
      const activeAssessment = linkedAssessment && !isAssessmentArchived(linkedAssessment);
      if (noticeDays != null && noticeDays <= 15 && capturedIsActive && activeAssessment && inDateRange(updatedAt)) {
        rowsByChip.quick_joiners.push({ ...baseRow, round: formatAssessmentStatusDisplay(baseRow.status || assessmentStatus || "CV shared") });
      }
      if (linkedAssessment && inToday(convertedAt) && inDateRange(convertedAt)) {
        rowsByChip.shared_today.push({ ...baseRow, round: "Converted to assessment", date: convertedAt });
      }
      if (linkedAssessment && inThisWeek(convertedAt) && inDateRange(convertedAt)) {
        rowsByChip.shared_this_week.push({ ...baseRow, round: "Converted to assessment", date: convertedAt });
      }
      if (assessmentStatus === "offered" && inDateRange(updatedAt)) {
        rowsByChip.offered_candidates.push({ ...baseRow, round: "Offered" });
      }
      if (activeAssessment && inDateRange(updatedAt)) {
        const statusLower = normalizeStatus(baseRow.status || assessmentStatus || "");
        const displayDate = statusLower === "cv shared"
          ? (convertedAt || updatedAt || "")
          : (interviewAt || updatedAt || "");
        rowsByChip.cv_shared.push({ ...baseRow, round: formatAssessmentStatusDisplay(assessmentStatus || "Active"), date: displayDate });
      }
    });
    if (!rowsByChip.shared_today.length || !rowsByChip.shared_this_week.length) {
      assessments.forEach((assessment) => {
        const assessmentId = String(assessment?.id || "").trim();
        if (!assessmentId) return;
        const candidateId = String(
          assessment?.candidateId
          || assessment?.candidate_id
          || assessment?.payload?.candidateId
          || assessment?.payload?.candidate_id
          || ""
        ).trim();
        const convertedAt = String(
          universeConvertedAtByAssessmentId.get(assessmentId)
          || universeConvertedAtByCandidateId.get(candidateId)
          || assessmentSharedAtMap.get(assessmentId)
          || assessment?.createdAt
          || assessment?.created_at
          || assessment?.generatedAt
          || assessment?.generated_at
          || ""
        ).trim();
        const hasAssessmentScope = universeAssessmentIds.size > 0;
        const inScopedUniverse = hasAssessmentScope
          ? universeAssessmentIds.has(assessmentId)
          : (candidateId && universeCandidateIds.has(candidateId));
        if (!inScopedUniverse) return;
        if (!convertedAt || !inDateRange(convertedAt)) return;
        const candidate = (candidateId && candidateById.get(candidateId)) || null;
        const fallbackRow = {
          item: candidate || { id: candidateId || assessmentId, assessmentId, candidateId },
          candidateName: candidate?.name || candidate?.candidateName || assessment?.candidateName || assessment?.payload?.candidateName || "Candidate",
          role: assessment?.jdTitle || candidate?.role || candidate?.jd_title || candidate?.jdTitle || "",
          client: assessment?.clientName || candidate?.client_name || candidate?.clientName || "",
          recruiter: candidate?.assigned_to_name || candidate?.ownerRecruiter || candidate?.recruiterName || "",
          currentCtc: candidate?.current_ctc || candidate?.currentCtc || "",
          expectedCtc: candidate?.expected_ctc || candidate?.expectedCtc || "",
          notice: candidate?.notice_period || candidate?.noticePeriod || "",
          status: normalizeAssessmentStatusLabel(assessment?.candidateStatus || assessment?.status || ""),
          round: "Converted to assessment",
          date: convertedAt
        };
        if (inToday(convertedAt) && !rowsByChip.shared_today.some((row) => String(row?.item?.assessmentId || row?.item?.id || "") === assessmentId)) {
          rowsByChip.shared_today.push(fallbackRow);
        }
        if (inThisWeek(convertedAt) && !rowsByChip.shared_this_week.some((row) => String(row?.item?.assessmentId || row?.item?.id || "") === assessmentId)) {
          rowsByChip.shared_this_week.push(fallbackRow);
        }
      });
    }
    return rowsByChip;
    } catch (error) {
      console.error("candidateSmartChipRows failed", error);
      return emptyRows;
    }
  }, [candidateUniverse, candidateSmartDateFrom, candidateSmartDateTo, state.assessments, state.candidates, state.assessmentEvents]);
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
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const currentUserName = String(state.user?.name || "").trim().toLowerCase();
    const currentUserId = String(state.user?.id || "").trim();
    const isMine = (item) => {
      const capturedId = String(item?.recruiter_id || "").trim();
      const capturedName = String(item?.recruiter_name || "").trim().toLowerCase();
      const assignedId = String(item?.assigned_to_user_id || "").trim();
      const assignedName = String(item?.assigned_to_name || "").trim().toLowerCase();
      if (currentUserId && (capturedId || assignedId)) {
        if (capturedId && capturedId === currentUserId) return true;
        if (assignedId && assignedId === currentUserId) return true;
      }
      if (currentUserName) {
        if (capturedName && capturedName === currentUserName) return true;
        if (assignedName && assignedName === currentUserName) return true;
      }
      return false;
    };

    return (state.candidates || []).filter((item) => {
      const sourceValue = String(item.source || "").trim();
      const isInboundApplicant = sourceValue === "website_apply" || sourceValue === "hosted_apply" || sourceValue === "google_sheet";
      if (isInboundApplicant) return false;
      if (isAdmin) return true;
      return isMine(item);
    });
  }, [state.candidates, state.user]);

  const capturedNotesStats = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const queryText = String(candidateFilters.q || "").trim().toLowerCase();
    const viewMode = String(candidateFilters.view || "all").trim() || "all";
    const currentUserName = String(state.user?.name || "").trim().toLowerCase();
    const currentUserId = String(state.user?.id || "").trim();
    const adminUserIds = new Set((state.users || []).filter((user) => String(user?.role || "").toLowerCase() === "admin").map((user) => String(user?.id || "").trim()).filter(Boolean));
    const parseTime = (value) => {
      const time = Date.parse(String(value || ""));
      return Number.isFinite(time) ? time : 0;
    };
    const activityDateKey = (item) => {
      const createdAt = parseTime(item?.created_at);
      const assignedAt = parseTime(item?.assigned_at);
      const activityAt = Math.max(createdAt, assignedAt);
      if (!activityAt) return item?.created_at ? String(item.created_at).slice(0, 10) : "";
      return new Date(activityAt).toISOString().slice(0, 10);
    };
    const isAssignedToCurrentUser = (item) => {
      const assignedId = String(item?.assigned_to_user_id || "").trim();
      const assignedName = String(item?.assigned_to_name || "").trim().toLowerCase();
      if (currentUserId && assignedId) return assignedId === currentUserId;
      return Boolean(currentUserName && assignedName && assignedName === currentUserName);
    };
    const isAssignedByCurrentUser = (item) => {
      const assignedById = String(item?.assigned_by_user_id || "").trim();
      const assignedByName = String(item?.assigned_by_name || "").trim().toLowerCase();
      if (currentUserId && assignedById) return assignedById === currentUserId;
      return Boolean(currentUserName && assignedByName && assignedByName === currentUserName);
    };
    const isCapturedByCurrentUser = (item) => {
      const capturedId = String(item?.recruiter_id || "").trim();
      const capturedName = String(item?.recruiter_name || "").trim().toLowerCase();
      if (currentUserId && capturedId) return capturedId === currentUserId;
      return Boolean(currentUserName && capturedName && capturedName === currentUserName);
    };
    const isFirstAssignedToCurrentUser = (item) => {
      const firstId = String(item?.first_assigned_to_user_id || "").trim();
      const firstName = String(item?.first_assigned_to_name || "").trim().toLowerCase();
      if (currentUserId && firstId) return firstId === currentUserId;
      return Boolean(currentUserName && firstName && firstName === currentUserName);
    };
    const isFirstAssignedByAdmin = (item) => {
      const firstById = String(item?.first_assigned_by_user_id || "").trim();
      if (firstById && adminUserIds.size) return adminUserIds.has(firstById);
      const fallbackById = String(item?.assigned_by_user_id || "").trim();
      if (fallbackById && adminUserIds.size) return adminUserIds.has(fallbackById);
      const fallbackByName = String(item?.assigned_by_name || "").trim().toLowerCase();
      return Boolean(fallbackByName === "admin");
    };
    // Build one common filtered base for captured notes metrics.
    const filteredBase = capturedNotesUniverse.filter((item) => {
      const matchedAssessment = resolveCapturedAssessment(item);
      const sourceValue = String(item.source || "").trim();
      const clientValue = String(item.client_name || matchedAssessment?.clientName || "Unassigned").trim();
      const jdValue = String(item.jd_title || matchedAssessment?.jdTitle || item.role || "").trim();
      const assignedToValue = String(item.assigned_to_name || "Unassigned").trim();
      const capturedByValue = String(item.recruiter_name || item.assigned_by_name || "Unknown").trim();
      const outcomeValue = getCapturedOutcome(item, matchedAssessment);
      const activityKey = activityDateKey(item);
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
      const dateFromOk = !candidateFilters.dateFrom || (activityKey && activityKey >= candidateFilters.dateFrom);
      const dateToOk = !candidateFilters.dateTo || (activityKey && activityKey <= candidateFilters.dateTo);
      const clientOk = !candidateFilters.clients.length || candidateFilters.clients.includes(clientValue);
      const jdOk = !candidateFilters.jds.length || candidateFilters.jds.includes(jdValue);
      const assignedToOk = !candidateFilters.assignedTo.length || candidateFilters.assignedTo.includes(assignedToValue);
      const capturedByOk = !candidateFilters.capturedBy.length || candidateFilters.capturedBy.includes(capturedByValue);
      const sourceOk = !candidateFilters.sources.length || candidateFilters.sources.includes(sourceValue);
      const outcomeOk = !candidateFilters.outcomes.length || candidateFilters.outcomes.includes(outcomeValue);
      const searchNameMatch = Boolean(queryText && nameHay.includes(queryText));
      const viewOk = (() => {
        if (viewMode === "all") return true;
        if (viewMode === "added_by_me") return isCapturedByCurrentUser(item);
        if (viewMode === "assigned_to_me") {
          return isAssignedToCurrentUser(item)
            && !isCapturedByCurrentUser(item)
            && Boolean(item?.first_assigned_to_user_id || item?.first_assigned_to_name)
            && isFirstAssignedToCurrentUser(item)
            && isFirstAssignedByAdmin(item);
        }
        if (viewMode === "reassigned_to_me") {
          return isAssignedToCurrentUser(item)
            && !isCapturedByCurrentUser(item)
            && Boolean(item?.first_assigned_to_user_id || item?.first_assigned_to_name)
            && !isFirstAssignedToCurrentUser(item);
        }
        if (viewMode === "reassigned_by_me") return isAssignedByCurrentUser(item) && Boolean(item?.assigned_at);
        return true;
      })();

      return viewOk && queryOk && dateFromOk && dateToOk && clientOk && jdOk && assignedToOk && capturedByOk && sourceOk && outcomeOk;
    });

    const wantsActive = candidateFilters.activeStates.includes("Active");
    const wantsInactive = candidateFilters.activeStates.includes("Inactive");
    const defaultActiveOnly = !candidateFilters.activeStates.length;

    // Converted metric now follows selected state:
    // - default/Active: include converted
    // - Inactive only: converted = 0
    // - Active+Inactive: include converted
    const includeConvertedForState = defaultActiveOnly || wantsActive || (wantsActive && wantsInactive);
    const convertedCount = includeConvertedForState
      ? filteredBase.filter((item) => Boolean(resolveCapturedAssessment(item))).length
      : 0;

    // Captured totals are strictly non-converted rows only.
    const nonConvertedBase = filteredBase.filter((item) => !resolveCapturedAssessment(item));
    const stateScopedRows = nonConvertedBase.filter((item) => {
      const manuallyHidden = item.hidden_from_captured === true;
      const activeValue = manuallyHidden ? "Inactive" : "Active";
      const searchNameMatch = Boolean(queryText && String(item?.name || "").toLowerCase().includes(queryText));
      const activeOk = defaultActiveOnly
        ? (activeValue === "Active" || searchNameMatch)
        : (candidateFilters.activeStates.includes(activeValue) || (searchNameMatch && wantsActive));
      const inactiveBlockedByDefault = defaultActiveOnly && activeValue === "Inactive" && !searchNameMatch;
      return !inactiveBlockedByDefault && activeOk;
    });

    const activeCount = stateScopedRows.filter((item) => !item.hidden_from_captured).length;
    const inactiveCount = stateScopedRows.filter((item) => item.hidden_from_captured === true).length;
    return {
      today: stateScopedRows.filter((item) => activityDateKey(item) === todayKey).length,
      total: activeCount + inactiveCount + convertedCount,
      active: activeCount,
      inactive: inactiveCount,
      converted: convertedCount
    };
  }, [candidateFilters, capturedAssessmentMap, capturedNotesUniverse, state.user]);

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
    const queryText = candidateFilters.q.trim().toLowerCase();
    const viewMode = String(candidateFilters.view || "all").trim() || "all";
    const currentUserName = String(state.user?.name || "").trim().toLowerCase();
    const currentUserId = String(state.user?.id || "").trim();
    const adminUserIds = new Set((state.users || []).filter((user) => String(user?.role || "").toLowerCase() === "admin").map((user) => String(user?.id || "").trim()).filter(Boolean));
    const parseTime = (value) => {
      const time = Date.parse(String(value || ""));
      return Number.isFinite(time) ? time : 0;
    };
    const activityTime = (item) => Math.max(parseTime(item?.created_at), parseTime(item?.assigned_at));
    const activityDateKey = (item) => {
      const time = activityTime(item);
      if (!time) return item?.created_at ? String(item.created_at).slice(0, 10) : "";
      return new Date(time).toISOString().slice(0, 10);
    };
    const isAssignedToCurrentUser = (item) => {
      const assignedId = String(item?.assigned_to_user_id || "").trim();
      const assignedName = String(item?.assigned_to_name || "").trim().toLowerCase();
      if (currentUserId && assignedId) return assignedId === currentUserId;
      return Boolean(currentUserName && assignedName && assignedName === currentUserName);
    };
    const isAssignedByCurrentUser = (item) => {
      const assignedById = String(item?.assigned_by_user_id || "").trim();
      const assignedByName = String(item?.assigned_by_name || "").trim().toLowerCase();
      if (currentUserId && assignedById) return assignedById === currentUserId;
      return Boolean(currentUserName && assignedByName && assignedByName === currentUserName);
    };
    const isCapturedByCurrentUser = (item) => {
      const capturedId = String(item?.recruiter_id || "").trim();
      const capturedName = String(item?.recruiter_name || "").trim().toLowerCase();
      if (currentUserId && capturedId) return capturedId === currentUserId;
      return Boolean(currentUserName && capturedName && capturedName === currentUserName);
    };
    const isFirstAssignedToCurrentUser = (item) => {
      const firstId = String(item?.first_assigned_to_user_id || "").trim();
      const firstName = String(item?.first_assigned_to_name || "").trim().toLowerCase();
      if (currentUserId && firstId) return firstId === currentUserId;
      return Boolean(currentUserName && firstName && firstName === currentUserName);
    };
    const isFirstAssignedByAdmin = (item) => {
      const firstById = String(item?.first_assigned_by_user_id || "").trim();
      if (firstById && adminUserIds.size) return adminUserIds.has(firstById);
      const fallbackById = String(item?.assigned_by_user_id || "").trim();
      if (fallbackById && adminUserIds.size) return adminUserIds.has(fallbackById);
      const fallbackByName = String(item?.assigned_by_name || "").trim().toLowerCase();
      return Boolean(fallbackByName === "admin");
    };

    const filtered = capturedNotesUniverse.filter((item) => {
      const matchedAssessment = resolveCapturedAssessment(item);
      if (matchedAssessment) return false;
      const sourceValue = String(item.source || "").trim();
      const clientValue = String(item.client_name || matchedAssessment?.clientName || "Unassigned").trim();
      const jdValue = String(item.jd_title || matchedAssessment?.jdTitle || item.role || "").trim();
      const assignedToValue = String(item.assigned_to_name || "Unassigned").trim();
      const capturedByValue = String(item.recruiter_name || item.assigned_by_name || "Unknown").trim();
      const outcomeValue = getCapturedOutcome(item, matchedAssessment);
      const activityKey = activityDateKey(item);
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
      const dateFromOk = !candidateFilters.dateFrom || (activityKey && activityKey >= candidateFilters.dateFrom);
      const dateToOk = !candidateFilters.dateTo || (activityKey && activityKey <= candidateFilters.dateTo);
      const clientOk = !candidateFilters.clients.length || candidateFilters.clients.includes(clientValue);
      const jdOk = !candidateFilters.jds.length || candidateFilters.jds.includes(jdValue);
      const assignedToOk = !candidateFilters.assignedTo.length || candidateFilters.assignedTo.includes(assignedToValue);
      const capturedByOk = !candidateFilters.capturedBy.length || candidateFilters.capturedBy.includes(capturedByValue);
      const sourceOk = !candidateFilters.sources.length || candidateFilters.sources.includes(sourceValue);
      const outcomeOk = !candidateFilters.outcomes.length || candidateFilters.outcomes.includes(outcomeValue);
      const searchNameMatch = Boolean(queryText && nameHay.includes(queryText));
      const viewOk = (() => {
        if (viewMode === "all") return true;
        if (viewMode === "added_by_me") return isCapturedByCurrentUser(item);
        if (viewMode === "assigned_to_me") {
          return isAssignedToCurrentUser(item)
            && !isCapturedByCurrentUser(item)
            && Boolean(item?.first_assigned_to_user_id || item?.first_assigned_to_name)
            && isFirstAssignedToCurrentUser(item)
            && isFirstAssignedByAdmin(item);
        }
        if (viewMode === "reassigned_to_me") {
          return isAssignedToCurrentUser(item)
            && !isCapturedByCurrentUser(item)
            && Boolean(item?.first_assigned_to_user_id || item?.first_assigned_to_name)
            && !isFirstAssignedToCurrentUser(item);
        }
        if (viewMode === "reassigned_by_me") return isAssignedByCurrentUser(item) && Boolean(item?.assigned_at);
        return true;
      })();

      const wantsActive = candidateFilters.activeStates.includes("Active");
      const defaultActiveOnly = !candidateFilters.activeStates.length;
      const activeOk = defaultActiveOnly
        ? (activeValue === "Active" || searchNameMatch)
        : (candidateFilters.activeStates.includes(activeValue) || (searchNameMatch && wantsActive));

      const inactiveBlockedByDefault = defaultActiveOnly && activeValue === "Inactive" && !searchNameMatch;
      return !inactiveBlockedByDefault && viewOk && queryOk && dateFromOk && dateToOk && clientOk && jdOk && assignedToOk && capturedByOk && sourceOk && outcomeOk && activeOk;
    });

    return filtered.sort((a, b) => {
      const delta = activityTime(b) - activityTime(a);
      if (delta !== 0) return delta;
      return String(b?.created_at || "").localeCompare(String(a?.created_at || ""));
    });
  }, [candidateFilters, capturedAssessmentMap, capturedNotesUniverse, state.user]);

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
    const locations = new Set();
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
      const locationValue = normalizeApplicantLocationLabel(item.location || linkedCandidate?.location || "");
      const ownedValue = getApplicantOwnerLabel(item, linkedCandidate);
      const assignedValue = getApplicantManualAssigneeLabel(item, linkedCandidate);
      const outcomeValue = getApplicantWorkflowOutcome(item, linkedCandidate);
      if (clientValue) clients.add(clientValue);
      if (jdValue) jds.add(jdValue);
      if (locationValue) locations.add(locationValue);
      if (ownedValue) ownedBy.add(ownedValue);
      if (assignedValue) assignedTo.add(assignedValue);
      if (outcomeValue) outcomes.add(outcomeValue);
    });
    return {
      clients: Array.from(clients).sort((a, b) => a.localeCompare(b)),
      jds: Array.from(jds).sort((a, b) => a.localeCompare(b)),
      locations: Array.from(locations).sort((a, b) => a.localeCompare(b)),
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
      const locationValue = normalizeApplicantLocationLabel(item.location || linkedCandidate?.location || "");
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
        locationValue,
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
      if (applicantFilters.locations.length && !applicantFilters.locations.includes(locationValue)) return false;
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
      const locationValue = normalizeApplicantLocationLabel(item.location || linkedCandidate?.location || "");
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
        locationValue,
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
      if (applicantFilters.locations.length && !applicantFilters.locations.includes(locationValue)) return false;
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

  function openAssessmentStatusFromSearch(item) {
    const assessmentId = String(item?.assessment_id || item?.assessmentId || item?.raw?.assessment?.id || item?.assessment?.id || "").trim();
    if (assessmentId) {
      setAssessmentStatusId(assessmentId);
      return;
    }
    const candidateId = String(item?.id || item?.candidate_id || item?.candidateId || "").trim();
    if (!candidateId) {
      setStatus("workspace", "Assessment status update is not available for this row.", "error");
      return;
    }
    const matchedAssessment = (state.assessments || []).find((assessment) => {
      const linkedCandidateId = String(assessment?.candidateId || "").trim();
      return linkedCandidateId && linkedCandidateId === candidateId;
    });
    if (matchedAssessment?.id) {
      setAssessmentStatusId(String(matchedAssessment.id));
      return;
    }
    setStatus("workspace", "No linked assessment found for this candidate yet.", "error");
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
    void refreshWorkspaceSilently("post-cv-remove");
  }

  async function removeApplicant(applicantId) {
    if (!window.confirm("Remove this applicant from the intake inbox?")) return;
    await api(`/company/applicants?id=${encodeURIComponent(applicantId)}`, token, "DELETE");
    setState((current) => ({
      ...current,
      applicants: Array.isArray(current.applicants)
        ? current.applicants.filter((item) => String(item?.id || "") !== String(applicantId))
        : current.applicants,
      candidates: Array.isArray(current.candidates)
        ? current.candidates.filter((item) => String(item?.id || "") !== String(applicantId))
        : current.candidates,
      databaseCandidates: Array.isArray(current.databaseCandidates)
        ? current.databaseCandidates.filter((item) => String(item?.id || "") !== String(applicantId))
        : current.databaseCandidates
    }));
    await reloadApplicantsSlice();
    void refreshWorkspaceSilently("post-applicant-remove");
    setStatus("applicants", "Applicant removed.", "ok");
  }

  async function hideApplicant(applicantId) {
    if (!String(applicantId || "").trim()) {
      setStatus("applicants", "Cannot hide: missing applicant id.", "error");
      return;
    }
    await api(`/company/candidates/${encodeURIComponent(applicantId)}`, token, "PATCH", { patch: { hidden_from_captured: true } });
    setState((current) => {
      const applyPatch = (items) => Array.isArray(items)
        ? items.map((item) => String(item?.id || "") === String(applicantId) ? { ...item, hidden_from_captured: true } : item)
        : items;
      return {
        ...current,
        applicants: applyPatch(current.applicants),
        candidates: applyPatch(current.candidates),
        databaseCandidates: applyPatch(current.databaseCandidates)
      };
    });
    await reloadApplicantsSlice();
    void refreshWorkspaceSilently("post-applicant-hide");
    setStatus("applicants", "Applicant hidden from active list.", "ok");
  }

  async function restoreApplicant(applicantId) {
    await api(`/company/candidates/${encodeURIComponent(applicantId)}`, token, "PATCH", { patch: { hidden_from_captured: false } });
    setState((current) => {
      const applyPatch = (items) => Array.isArray(items)
        ? items.map((item) => String(item?.id || "") === String(applicantId) ? { ...item, hidden_from_captured: false } : item)
        : items;
      return {
        ...current,
        applicants: applyPatch(current.applicants),
        candidates: applyPatch(current.candidates),
        databaseCandidates: applyPatch(current.databaseCandidates)
      };
    });
    await reloadApplicantsSlice();
    void refreshWorkspaceSilently("post-applicant-restore");
    setStatus("applicants", "Applicant restored to active list.", "ok");
  }

  async function saveApplicantAssignment({ recruiterId, jdId, jdTitle, clientName, targetIds = [] }) {
    const user = (state.users || []).find((item) => String(item.id || "") === String(recruiterId || "")) || null;
    const ids = (Array.isArray(targetIds) && targetIds.length ? targetIds : [assignApplicantId])
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    for (const id of ids) {
      await api("/company/applicants/assign", token, "POST", {
        id,
        assignedToUserId: recruiterId,
        assignedToName: user?.name || "",
        assignedJdId: jdId,
        assignedJdTitle: jdTitle,
        clientName,
        client_name: clientName,
        jdTitle
      });
    }
    setAssignApplicantId("");
    setBulkAssignApplicantIds([]);
    setBulkAssignApplicantModalOpen(false);
    await reloadApplicantsSlice();
    void refreshWorkspaceSilently("post-applicant-assign");
    setStatus("workspace", ids.length > 1 ? `${ids.length} applicants assigned.` : "Applicant assigned into recruiter workflow.", "ok");
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

  async function saveCapturedAssignment({ recruiterId, jdId, jdTitle, clientName, targetIds = [] }) {
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const effectiveRecruiterId = isAdmin ? String(recruiterId || "").trim() : String(state.user?.id || "").trim();
    const recruiter = (state.users || []).find((user) => String(user.id) === String(effectiveRecruiterId));
    const nextAssigneeName = recruiter?.name || state.user?.name || "";
    const ids = (Array.isArray(targetIds) && targetIds.length ? targetIds : [assignCandidateId])
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    if (isAdmin) {
      const results = await Promise.allSettled(ids.map(async (id) => {
        await api("/candidates/assign", token, "POST", {
          id,
          assignedToUserId: effectiveRecruiterId,
          assignedToName: nextAssigneeName,
          assignedJdId: jdId,
          assignedJdTitle: jdTitle,
          clientName,
          client_name: clientName
        });
        await patchCandidateQuiet(id, { hidden_from_captured: false });
      }));
      const successCount = results.filter((entry) => entry.status === "fulfilled").length;
      const failCount = Math.max(0, ids.length - successCount);
      setAssignCandidateId("");
      setBulkAssignCandidateIds([]);
      setBulkAssignCandidateModalOpen(false);
      if (failCount > 0) {
        setStatus("captured", `${successCount}/${ids.length} drafts assigned. ${failCount} failed, retry once.`, "error");
      } else {
        setStatus("captured", ids.length > 1 ? `${ids.length} drafts assigned to recruiter.` : "Draft assigned to recruiter.", "ok");
      }
      void refreshWorkspaceSilently("post-captured-bulk-assign");
      return;
    }
    const results = await Promise.allSettled(ids.map(async (id) => {
      await api("/candidates/claim", token, "POST", {
        id,
        assignedJdId: jdId,
        assignedJdTitle: jdTitle,
        jdTitle,
        clientName,
        client_name: clientName
      });
    }));
    const successCount = results.filter((entry) => entry.status === "fulfilled").length;
    const failCount = Math.max(0, ids.length - successCount);
    setAssignCandidateId("");
    setBulkAssignCandidateIds([]);
    setBulkAssignCandidateModalOpen(false);
    if (failCount > 0) {
      setStatus("captured", `${successCount}/${ids.length} drafts assigned. ${failCount} failed, retry once.`, "error");
    } else {
      setStatus("captured", ids.length > 1 ? `${ids.length} drafts assigned to recruiter.` : "Draft assigned to recruiter.", "ok");
    }
    void refreshWorkspaceSilently("post-claim");
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
    if (!String(candidateId || "").trim()) {
      setStatus("captured", "Cannot hide: missing candidate id.", "error");
      return;
    }
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
      await reloadAssessmentsSlice();
      void refreshWorkspaceSilently("post-quick-update");
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
    const payload = buildManualDraftCandidatePayload({
      draftForm: newDraftForm,
      assignedRecruiter
    });
    await api("/candidates", token, "POST", { candidate: payload });
    await reloadCandidatesSlice({ includeDatabase: location?.pathname === "/candidates" });
    void refreshWorkspaceSilently("post-manual-draft");
    setNewDraftOpen(false);
    resetNewDraftForm();
    setStatus("captured", "Manual draft created.", "ok");
  }

  function buildManualDraftCandidatePayload({ draftForm, assignedRecruiter, parsedResult = null, source = "manual_draft", filename = "" }) {
    const parsedSkills = String(draftForm.tags || "")
      .split(/\r?\n|,|\||;/)
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    const parsedTimelineLabel = Array.isArray(parsedResult?.timeline) && parsedResult.timeline.length
      ? `Timeline entries: ${parsedResult.timeline.length}`
      : "";
    const timelineConfidenceLabel = String(parsedResult?.timelineConfidence?.label || "").trim();
    const notes = [String(draftForm.notes || "").trim(), timelineConfidenceLabel, parsedTimelineLabel].filter(Boolean).join(" | ");
    return {
      ...draftForm,
      source,
      role: String(draftForm.current_designation || parsedResult?.currentDesignation || "").trim(),
      experience: String(draftForm.total_experience || parsedResult?.totalExperience || "").trim(),
      current_ctc: String(draftForm.current_ctc || parsedResult?.currentCtc || "").trim(),
      notice_period: String(draftForm.notice_period || parsedResult?.noticePeriod || "").trim(),
      highest_education: String(draftForm.highest_education || parsedResult?.highestEducation || "").trim(),
      recruiter_context_notes: "",
      other_pointers: parsedTimelineLabel || "",
      hidden_from_captured: false,
      skills: parsedSkills,
      screening_answers: {},
      draft_payload: {
        candidateName: draftForm.name || "",
        phoneNumber: draftForm.phone || "",
        emailId: draftForm.email || "",
        linkedin: draftForm.linkedin || "",
        location: draftForm.location || "",
        currentCompany: draftForm.company || "",
        currentDesignation: String(draftForm.current_designation || parsedResult?.currentDesignation || "").trim(),
        totalExperience: String(draftForm.total_experience || parsedResult?.totalExperience || "").trim(),
        relevantExperience: "",
        highestEducation: String(draftForm.highest_education || parsedResult?.highestEducation || "").trim(),
        currentCtc: String(draftForm.current_ctc || parsedResult?.currentCtc || "").trim(),
        expectedCtc: "",
        noticePeriod: String(draftForm.notice_period || parsedResult?.noticePeriod || "").trim(),
        offerInHand: "",
        lwdOrDoj: "",
        currentOrgTenure: String(parsedResult?.currentOrgTenure || "").trim(),
        reasonForChange: "",
        clientName: draftForm.client_name || "",
        jdTitle: draftForm.jd_title || "",
        pipelineStage: "Under Interview Process",
        candidateStatus: "Screening in progress",
        followUpAt: "",
        interviewAt: "",
        recruiterNotes: "",
        callbackNotes: notes,
        otherPointers: "",
        tags: draftForm.tags || "",
        jdScreeningAnswers: {},
        cvAnalysis: parsedResult || null,
        cvAnalysisApplied: false,
        statusHistory: []
      },
      linkedin: draftForm.linkedin || "",
      assigned_to_user_id: assignedRecruiter?.id || "",
      assigned_to_name: assignedRecruiter?.name || "",
      cv_filename: filename || ""
    };
  }

  async function importBulkCvDrafts(files = []) {
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const assignedRecruiter = isAdmin
      ? (state.users || []).find((user) => String(user.id) === String(newDraftForm.assigned_to_user_id))
      : state.user;
    try {
      setNewDraftImportBusy(true);
      const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
      if (!safeFiles.length) {
        setStatus("captured", "No CV files selected.", "error");
        return;
      }
      setStatus("captured", `Parsing ${safeFiles.length} CV(s)...`);
      let success = 0;
      let failed = 0;
      for (const file of safeFiles) {
        try {
          const fileData = await fileToBase64(file);
          const parsed = await api("/parse-candidate", token, "POST", {
            sourceType: "cv",
            normalizeWithAi: true,
            file: {
              filename: file.name || "candidate-cv.pdf",
              mimeType: file.type || "application/octet-stream",
              fileData
            }
          });
          const parsedResult = parsed?.result && typeof parsed.result === "object" ? parsed.result : parsed;
          const candidateName = String(parsedResult?.candidateName || file.name?.replace(/\.[^.]+$/, "") || "").trim();
          const candidateForm = {
            ...newDraftForm,
            name: candidateName,
            phone: String(parsedResult?.phoneNumber || "").trim(),
            email: String(parsedResult?.emailId || "").trim(),
            linkedin: String(parsedResult?.linkedinUrl || "").trim(),
            company: String(parsedResult?.currentCompany || "").trim(),
            current_designation: String(parsedResult?.currentDesignation || "").trim(),
            total_experience: String(parsedResult?.totalExperience || "").trim(),
            location: String(parsedResult?.location || "").trim(),
            current_ctc: String(parsedResult?.currentCtc || "").trim(),
            notice_period: String(parsedResult?.noticePeriod || "").trim(),
            highest_education: String(parsedResult?.highestEducation || "").trim()
          };
          const payload = buildManualDraftCandidatePayload({
            draftForm: candidateForm,
            assignedRecruiter,
            parsedResult,
            source: "bulk_cv_import",
            filename: file.name || ""
          });
          await api("/candidates", token, "POST", { candidate: payload });
          success += 1;
        } catch {
          failed += 1;
        }
      }
      await reloadCandidatesSlice({ includeDatabase: location?.pathname === "/candidates" });
      void refreshWorkspaceSilently("post-bulk-cv-import");
      setStatus("captured", `Bulk CV import done. Success: ${success} | Failed: ${failed}.`, failed ? "error" : "ok");
    } finally {
      setNewDraftImportBusy(false);
    }
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
      void refreshWorkspaceSilently("post-followup-done");
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
    void refreshWorkspaceSilently("post-attempt-refresh");
  }

  function applyNewDraftAutofillPatch(patch = {}) {
    setNewDraftForm((current) => {
      const next = { ...current };
      Object.entries(patch || {}).forEach(([key, value]) => {
        const normalized = String(value || "").trim();
        if (normalized) next[key] = normalized;
      });
      if (next.jd_title && !next.client_name) {
        const matchedJob = (state.jobs || []).find((job) => String(job.title || "") === String(next.jd_title));
        if (matchedJob?.clientName) next.client_name = String(matchedJob.clientName || "").trim();
      }
      return next;
    });
  }

  async function importNewDraftFromPastedScreenshot() {
    try {
      setNewDraftImportBusy(true);
      setStatus("captured", "Reading screenshot from clipboard...");
      if (!navigator.clipboard?.read) {
        throw new Error("Clipboard image access is not supported. Use latest Chrome and allow clipboard permissions.");
      }
      const clipboardItems = await navigator.clipboard.read();
      const imageItem = (clipboardItems || []).find((item) => (item.types || []).some((type) => String(type).startsWith("image/")));
      if (!imageItem) throw new Error("No image found in clipboard. Copy screenshot first, then click Paste screenshot.");
      const imageType = (imageItem.types || []).find((type) => String(type).startsWith("image/")) || "image/png";
      const blob = await imageItem.getType(imageType);
      const file = new File([blob], "candidate-screenshot.png", { type: imageType });
      const fileData = await fileToBase64(file);
      const result = await api("/company/linkedin-assist/screenshot", token, "POST", {
        file: {
          filename: file.name,
          mimeType: file.type || "image/png",
          fileData
        }
      });
      const extracted = result?.extracted || {};
      applyNewDraftAutofillPatch({
        name: extracted?.name || "",
        phone: extracted?.phone || "",
        email: extracted?.email || "",
        company: extracted?.company || "",
        current_designation: extracted?.role || "",
        total_experience: extracted?.totalExperience || "",
        location: extracted?.location || "",
        linkedin: extracted?.linkedin || "",
        current_ctc: extracted?.currentCtc || "",
        notice_period: extracted?.noticePeriod || "",
        highest_education: extracted?.highestEducation || ""
      });
      setStatus("captured", "Screenshot parsed and form auto-filled.", "ok");
    } catch (error) {
      setStatus("captured", String(error?.message || error), "error");
    } finally {
      setNewDraftImportBusy(false);
    }
  }

  async function importNewDraftFromSheet(file) {
    if (!file) return;
    const filename = String(file.name || "").toLowerCase();
    try {
      setNewDraftImportBusy(true);
      setStatus("captured", "Reading sheet...");
      if (!(filename.endsWith(".csv") || filename.endsWith(".tsv") || filename.endsWith(".txt"))) {
        throw new Error("For now, upload CSV/TSV (save Excel as CSV once), then auto-fill will work.");
      }
      const raw = await file.text();
      const rows = parseDelimitedRowsFromText(raw);
      const mappedRows = buildSheetDraftRows(rows).slice(0, 50);
      if (!mappedRows.length) {
        throw new Error("Could not detect columns. Keep header row like Name, Email, Phone, Company, Location.");
      }
      const existingRows = [...(state.candidates || []), ...(state.databaseCandidates || [])];
      const validated = validateSheetDraftRows(mappedRows, existingRows);
      setNewDraftSheetRows(validated);
      setNewDraftSheetPreviewOpen(true);
      setStatus("captured", `Sheet loaded for preview. ${validated.length} row(s) ready (max 50).`, "ok");
    } catch (error) {
      setStatus("captured", String(error?.message || error), "error");
    } finally {
      setNewDraftImportBusy(false);
    }
  }

  function updateSheetPreviewRow(rowId, key, value) {
    setNewDraftSheetRows((current) => {
      const next = (current || []).map((row) => (
        String(row.id) === String(rowId) ? { ...row, [key]: String(value || "") } : row
      ));
      const existingRows = [...(state.candidates || []), ...(state.databaseCandidates || [])];
      return validateSheetDraftRows(next, existingRows);
    });
  }

  async function importValidatedSheetRows() {
    const validRows = (newDraftSheetRows || []).filter((row) => row.status === "valid");
    if (!validRows.length) {
      setStatus("captured", "No valid rows to import.", "error");
      return;
    }
    const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
    const assignedRecruiter = isAdmin
      ? (state.users || []).find((user) => String(user.id) === String(newDraftForm.assigned_to_user_id))
      : state.user;
    let success = 0;
    let failed = 0;
    try {
      setNewDraftImportBusy(true);
      setStatus("captured", `Importing ${validRows.length} valid row(s)...`);
      for (const row of validRows) {
        try {
          const payload = buildManualDraftCandidatePayload({
            draftForm: {
              ...newDraftForm,
              ...row
            },
            assignedRecruiter,
            parsedResult: null,
            source: "sheet_bulk_import",
            filename: ""
          });
          await api("/candidates", token, "POST", { candidate: payload });
          success += 1;
        } catch {
          failed += 1;
        }
      }
      await reloadCandidatesSlice({ includeDatabase: location?.pathname === "/candidates" });
      void refreshWorkspaceSilently("post-sheet-bulk-import");
      setNewDraftSheetPreviewOpen(false);
      setNewDraftSheetRows([]);
      setStatus("captured", `Sheet import done. Imported: ${success} | Failed: ${failed} | Skipped: ${(newDraftSheetRows || []).length - validRows.length}.`, failed ? "error" : "ok");
    } finally {
      setNewDraftImportBusy(false);
    }
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
      void refreshWorkspaceSilently("post-attempt-save");
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
    await reloadIntakeSlice();
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
      jdShortcuts: "",
      isArchived: false,
      archivedAt: null,
      archivedBy: "",
      closeReason: "",
      closedAt: null,
      closedBy: ""
    });
    setJobShortcutKey("");
    setJobShortcutValue("");
  }

  function loadJobIntoDraft(jobId) {
    const job = ((jobsCatalog || []).find((item) => String(item.id) === String(jobId)))
      || ((state.jobs || []).find((item) => String(item.id) === String(jobId)));
    if (!job) {
      resetJobDraftBlank();
      return;
    }
    setSelectedJobId(String(job.id || ""));
    setJobListLane(Boolean(job.isArchived) ? "archived" : "active");
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
      jdShortcuts: String(job.jdShortcuts || ""),
      isArchived: Boolean(job.isArchived),
      archivedAt: job.archivedAt || null,
      archivedBy: String(job.archivedBy || ""),
      closeReason: String(job.closeReason || ""),
      closedAt: job.closedAt || job.archivedAt || null,
      closedBy: String(job.closedBy || job.archivedBy || "")
    });
    setJobShortcutKey("");
    setJobShortcutValue("");
  }

  async function saveJobDraft() {
    if (jobActionBusy) return;
    setJobActionBusy(true);
    setStatus("jobs", "Saving JD...");
    try {
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
          isArchived: Boolean(jobDraft.isArchived),
          ownerRecruiterId,
          ownerRecruiterName,
          assignedRecruiters: Array.from(dedupedRecruiters.values())
        }
      });
      await reloadJobsWorkspace();
      const nextId = String(result?.id || selectedJobId || jobDraft.id || "").trim();
      if (nextId) {
        setSelectedJobId(nextId);
        setJobDraft((current) => ({ ...current, id: nextId }));
      }
      setStatus("jobs", "JD saved.", "ok");
    } catch (error) {
      setStatus("jobs", `JD save failed: ${String(error?.message || error)}`, "error");
    } finally {
      setJobActionBusy(false);
    }
  }

  async function saveJobDraftAsNew() {
    if (jobActionBusy) return;
    setJobActionBusy(true);
    setStatus("jobs", "Saving as new JD...");
    try {
      const isAdmin = String(state.user?.role || "").toLowerCase() === "admin";
      const ownerRecruiterId = isAdmin
        ? String(jobDraft.ownerRecruiterId || state.user?.id || "").trim()
        : String(state.user?.id || "");
      const ownerRecruiterName = isAdmin
        ? String(jobDraft.ownerRecruiterName || state.user?.name || "").trim()
        : String(state.user?.name || "");
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
      const buildNewJobPayload = (forceFresh = false) => ({
        ...jobDraft,
        // Force-create a new JD even if user is currently editing an existing one.
        id: forceFresh ? "" : `jd-${Date.now()}`,
        isArchived: false,
        ownerRecruiterId,
        ownerRecruiterName,
        assignedRecruiters: Array.from(dedupedRecruiters.values()),
        archivedAt: null,
        archivedBy: "",
        closeReason: "",
        closedAt: null,
        closedBy: ""
      });
      let result;
      try {
        result = await api("/company/jds", token, "POST", { job: buildNewJobPayload(false) });
      } catch {
        // Fallback: force a fully fresh insert payload if first attempt fails.
        result = await api("/company/jds", token, "POST", { job: buildNewJobPayload(true) });
      }
      await reloadJobsWorkspace();
      const nextId = String(result?.id || "").trim();
      if (nextId) {
        loadJobIntoDraft(nextId);
      } else {
        resetJobDraftBlank();
      }
      setStatus("jobs", "Saved as a new JD.", "ok");
    } catch (error) {
      setStatus("jobs", `Save as new failed: ${String(error?.message || error)}`, "error");
    } finally {
      setJobActionBusy(false);
    }
  }

  async function deleteSelectedJobDraft() {
    const jobId = String(selectedJobId || jobDraft.id || "").trim();
    if (!jobId) return;
    const confirmed = window.confirm("Delete this JD? This cannot be undone.");
    if (!confirmed) return;
    if (jobActionBusy) return;
    setJobActionBusy(true);
    setStatus("jobs", "Deleting JD...");
    try {
      await api("/company/jds", token, "DELETE", { jobId });
      await reloadJobsWorkspace();
      resetJobDraftBlank();
      setStatus("jobs", "JD deleted.", "ok");
    } catch (error) {
      setStatus("jobs", `Delete JD failed: ${String(error?.message || error)}`, "error");
    } finally {
      setJobActionBusy(false);
    }
  }

  async function setSelectedJobArchiveState(nextArchived) {
    const jobId = String(selectedJobId || jobDraft.id || "").trim();
    if (!jobId) return;
    if (jobActionBusy) return;
    setJobActionBusy(true);
    setStatus("jobs", nextArchived ? "Closing job..." : "Reactivating JD...");
    try {
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
      await api("/company/jds", token, "POST", {
        job: {
          ...jobDraft,
          id: jobId,
          isArchived: Boolean(nextArchived),
          closeReason: nextArchived ? String(jobDraft.closeReason || JOB_CLOSE_REASONS[0]) : "",
          closedAt: nextArchived ? (jobDraft.closedAt || new Date().toISOString()) : null,
          closedBy: nextArchived ? (jobDraft.closedBy || String(state.user?.email || "")) : "",
          ownerRecruiterId,
          ownerRecruiterName,
          assignedRecruiters: Array.from(dedupedRecruiters.values())
        }
      });
      await reloadJobsWorkspace();
      setJobDraft((current) => ({
        ...current,
        isArchived: Boolean(nextArchived),
        archivedAt: nextArchived ? (current.archivedAt || new Date().toISOString()) : null,
        archivedBy: nextArchived ? (current.archivedBy || String(state.user?.email || "")) : "",
        closeReason: nextArchived ? String(current.closeReason || JOB_CLOSE_REASONS[0]) : "",
        closedAt: nextArchived ? (current.closedAt || new Date().toISOString()) : null,
        closedBy: nextArchived ? (current.closedBy || String(state.user?.email || "")) : ""
      }));
      setStatus("jobs", nextArchived ? "Job closed and moved to Archived JDs." : "JD reactivated.", "ok");
    } catch (error) {
      setStatus("jobs", `${nextArchived ? "Archive" : "Reactivate"} failed: ${String(error?.message || error)}`, "error");
    } finally {
      setJobActionBusy(false);
    }
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

  function buildShortJdShareText(channel = "whatsapp") {
    const title = String(jobDraft.title || "Role").trim();
    const client = String(jobDraft.clientName || "").trim();
    const location = String(jobDraft.location || "").trim();
    const workMode = String(jobDraft.workMode || "").trim();
    const skills = String(jobDraft.mustHaveSkills || "").trim();
    const jdText = String(jobDraft.jobDescription || "").trim();
    const highlights = jdText
      .split(/\r?\n/)
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .filter((line) => line.length >= 25)
      .slice(0, 3);
    if (channel === "linkedin") {
      return [
        `Hiring: ${title}${client ? ` | ${client}` : ""}`,
        location ? `Location: ${location}` : "",
        workMode ? `Work Mode: ${workMode}` : "",
        skills ? `Must-have skills: ${skills}` : "",
        ...highlights.map((line, idx) => `${idx + 1}. ${line}`),
        "Interested candidates can reach out in DM or share resume."
      ].filter(Boolean).join("\n");
    }
    return [
      `*${title}*${client ? ` | ${client}` : ""}`,
      location ? `Location: ${location}` : "",
      workMode ? `Mode: ${workMode}` : "",
      skills ? `Skills: ${skills}` : "",
      ...highlights.map((line) => `- ${line}`),
      "Please share your updated CV if interested."
    ].filter(Boolean).join("\n");
  }

  async function copyJobFormatForShare(channel = "whatsapp") {
    const text = buildShortJdShareText(channel);
    if (!String(text || "").trim()) {
      setStatus("jobs", "Add JD details first.", "error");
      return;
    }
    await copyText(text);
    setStatus("jobs", `${channel === "linkedin" ? "LinkedIn" : "WhatsApp"} format copied.`, "ok");
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

  async function persistCurrentJobShortcuts(nextMap, successMessage) {
    const nextShortcuts = stringifyShortcutMap(nextMap);
    setJobDraft((current) => ({ ...current, jdShortcuts: nextShortcuts }));
    const jobId = String(selectedJobId || jobDraft.id || "").trim();
    if (!jobId) {
      setStatus("jobs", "Shortcut added in draft. Save JD once to persist it.", "ok");
      return;
    }
    setStatus("jobs", "Saving shortcut...", "info");
    try {
      const result = await api("/company/jds/shortcuts", token, "POST", {
        jobId,
        shortcuts: nextShortcuts
      });
      const savedShortcuts = String(result?.jdShortcuts || nextShortcuts);
      setJobDraft((current) => ({ ...current, jdShortcuts: savedShortcuts }));
      const scopedJobId = String(jobId || "").trim();
      if (scopedJobId) {
        setJobsCatalog((current) => (Array.isArray(current)
          ? current.map((item) => String(item?.id || "") === scopedJobId ? { ...item, jdShortcuts: savedShortcuts } : item)
          : current));
        setState((current) => ({
          ...current,
          jobs: Array.isArray(current.jobs)
            ? current.jobs.map((item) => String(item?.id || "") === scopedJobId ? { ...item, jdShortcuts: savedShortcuts } : item)
            : current.jobs
        }));
      }
      setStatus("jobs", successMessage, "ok");
    } catch (error) {
      setStatus("jobs", `Shortcut save failed: ${String(error?.message || error)}`, "error");
    }
  }

  async function saveShortcutDraft() {
    const jobId = String(selectedJobId || jobDraft.id || "").trim();
    if (!jobId) {
      setStatus("jobs", "Select an existing JD first. JD shortcuts are saved per JD.", "error");
      return;
    }
    const key = normalizeShortcutKey(jobShortcutKey);
    const value = String(jobShortcutValue || "").trim();
    if (!key || !value) {
      setStatus("jobs", "Add both shortcut key and template.", "error");
      return;
    }
    const parsed = parseShortcutMap(jobDraft.jdShortcuts);
    parsed[key] = value;
    setJobShortcutKey("");
    setJobShortcutValue("");
    await persistCurrentJobShortcuts(parsed, `Saved shortcut ${key}.`);
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
    setDrilldownState({
      open: true,
      title,
      items: [],
      loading: true,
      request: { mode: "dashboard", title, metric, groupType, params }
    });
    try {
      const result = await api(`/company/dashboard/drilldown?${query.toString()}`, token);
      setDrilldownState({
        open: true,
        title,
        items: result.items || [],
        loading: false,
        request: { mode: "dashboard", title, metric, groupType, params }
      });
    } catch (error) {
      setDrilldownState({
        open: true,
        title,
        items: [],
        loading: false,
        request: { mode: "dashboard", title, metric, groupType, params }
      });
      setStatus("workspace", String(error?.message || error || "Unable to load drilldown"), "error");
    }
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
    setDrilldownState({
      open: true,
      title,
      items: [],
      loading: true,
      request: { mode: "clientPortal", title, metric, groupType, params }
    });
    try {
      const result = await api(`/company/client-portal/drilldown?${query.toString()}`, token);
      setDrilldownState({
        open: true,
        title,
        items: result.items || [],
        loading: false,
        request: { mode: "clientPortal", title, metric, groupType, params }
      });
    } catch (error) {
      setDrilldownState({
        open: true,
        title,
        items: [],
        loading: false,
        request: { mode: "clientPortal", title, metric, groupType, params }
      });
      setStatus("workspace", String(error?.message || error || "Unable to load drilldown"), "error");
    }
  }

  async function refreshOpenDrilldown() {
    if (!drilldownState.request) return;
    if (drilldownState.request.mode === "dashboard") {
      await openDashboardDrilldown(drilldownState.request);
      return;
    }
    await openClientPortalDrilldown(drilldownState.request);
  }

  useEffect(() => {
    if (!drilldownState.open) return;
    if (String(location?.pathname || "") !== "/dashboard") return;
    const timer = setTimeout(() => {
      try {
        inlineDrilldownRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        inlineDrilldownRef.current?.focus?.();
      } catch { /* ignore scroll/focus issues */ }
      setInlineDrilldownPulse(true);
      setTimeout(() => setInlineDrilldownPulse(false), 1100);
    }, 30);
    return () => clearTimeout(timer);
  }, [drilldownState.open, drilldownState.title, location?.pathname]);

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
    if (assessment) {
      await reloadAssessmentsSlice();
    } else {
      await reloadCandidatesSlice({ includeDatabase: location?.pathname === "/candidates" });
    }
    void refreshWorkspaceSilently("post-client-feedback");
    await refreshOpenDrilldown();
    setClientFeedbackItem(null);
    setStatus("workspace", "Client feedback saved.", "ok");
  }

  async function runCandidateSearch() {
    const keywordDrivenBoolean = buildBooleanFromKeywordBars({
      must: candidateKeywordMust,
      anyGroups: [candidateKeywordAny1, candidateKeywordAny2, candidateKeywordAny3],
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
        const next = {
          ...EMPTY_CANDIDATE_STRUCTURED_FILTERS,
          minExperience: result.filters.minExperienceYears != null ? String(result.filters.minExperienceYears) : "",
          maxExperience: result.filters.maxExperienceYears != null ? String(result.filters.maxExperienceYears) : "",
          location: result.filters.location || (Array.isArray(result.filters.locations) ? result.filters.locations.filter(Boolean).join(", ") : ""),
          // Smart keyword builder already captures skills/keywords above.
          keySkills: "",
          currentCompany: result.filters.currentCompany || "",
          client: result.filters.client || "",
          minCurrentCtc: result.filters.minCurrentCtcLpa != null ? String(result.filters.minCurrentCtcLpa) : "",
          maxCurrentCtc: result.filters.maxCurrentCtcLpa != null ? String(result.filters.maxCurrentCtcLpa) : "",
          minExpectedCtc: result.filters.minExpectedCtcLpa != null ? String(result.filters.minExpectedCtcLpa) : "",
          maxExpectedCtc: result.filters.maxExpectedCtcLpa != null ? String(result.filters.maxExpectedCtcLpa) : "",
          qualification: result.filters.qualification || "",
          // Never auto-select notice period buckets; keep it explicit/manual.
          maxNoticeDays: "",
          noticeBucket: "",
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

  async function saveSignatureOnly() {
    setStatus("settings", "Saving signature only...");
    try {
      const current = await api("/company/email-settings", token);
      await api("/company/email-settings", token, "POST", {
        settings: {
          host: String(current?.host || "").trim(),
          port: Number(current?.port || 587),
          secure: Boolean(current?.secure),
          user: String(current?.user || "").trim(),
          from: String(current?.from || "").trim(),
          pass: "",
          keepPass: true,
          signatureText: smtpSettings.signatureText,
          signatureLinkLabel: smtpSettings.signatureLinkLabel,
          signatureLinkUrl: smtpSettings.signatureLinkUrl,
          signatureLinkLabel2: smtpSettings.signatureLinkLabel2,
          signatureLinkUrl2: smtpSettings.signatureLinkUrl2
        }
      });
      setStatus("settings", "Signature saved.", "ok");
    } catch (error) {
      setStatus("settings", `Signature save failed: ${String(error?.message || error)}`, "error");
    }
  }

  async function testSmtpSettings(sendTestMail = false) {
    setSmtpTestBusy(true);
    setStatus("settings", sendTestMail ? "Sending test email..." : "Verifying SMTP settings...");
    try {
      const result = await api("/company/email-settings/test", token, "POST", { sendTestMail });
      if (result?.testMailSent) {
        setStatus("settings", `SMTP verified and test email sent to ${result.sentTo}.`, "ok");
      } else {
        setStatus("settings", `SMTP verified for ${result.user} via ${result.host}:${result.port}.`, "ok");
      }
    } catch (error) {
      setStatus("settings", `SMTP test failed: ${String(error?.message || error)}`, "error");
    } finally {
      setSmtpTestBusy(false);
    }
  }

  async function connectZohoMailbox() {
    setZohoConnectBusy(true);
    setStatus("settings", "Preparing Zoho connect...");
    try {
      const currentHost = String(smtpSettings.host || "").trim().toLowerCase();
      const hostHint = currentHost.startsWith("zohoapi") ? currentHost : "zohoapi.com";
      const query = new URLSearchParams({ host: hostHint });
      const result = await api(`/company/email-settings/zoho/connect-url?${query.toString()}`, token);
      const authUrl = String(result?.authUrl || "").trim();
      if (!authUrl) throw new Error("Zoho auth URL could not be generated.");
      // Avoid noopener/noreferrer here: some browsers return null handle even when popup opened.
      const popup = window.open(authUrl, "rd-zoho-connect", "width=720,height=840");
      if (!popup) throw new Error("Popup blocked. Please allow popups and try again.");
      setStatus("settings", "Complete Zoho consent in popup window...", "ok");
      await new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          try { window.removeEventListener("message", onMessage); } catch {}
          try { window.clearInterval(timer); } catch {}
          resolve();
        };
        const onMessage = (event) => {
          const data = event?.data || {};
          if (data?.type !== "RSD_ZOHO_CONNECTED") return;
          if (data?.ok) {
            setStatus("settings", "Zoho connected successfully.", "ok");
          } else {
            setStatus("settings", `Zoho connect failed: ${String(data?.message || "Unknown error")}`, "error");
          }
          finish();
        };
        window.addEventListener("message", onMessage);
        const timer = window.setInterval(() => {
          if (!popup || popup.closed) finish();
        }, 500);
      });
      setSmtpSettingsLoaded(false);
      smtpSettingsDirtyRef.current = false;
      await loadSmtpSettingsOnce();
    } catch (error) {
      setStatus("settings", `Zoho connect failed: ${String(error?.message || error)}`, "error");
    } finally {
      setZohoConnectBusy(false);
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
    const rememberedCc = String((jdEmailCcSuggestions || [])[0] || "").trim();
    const defaultCc = rememberedCc || defaultJdEmailCc;
    setJdEmailModal({
      open: true,
      candidate,
      to: candidateEmail,
      cc: defaultCc,
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
      if (currentCompanyId) {
        const nextCcHistory = buildNextCcHistory(currentCompanyId, cc, defaultJdEmailCc);
        setJdEmailCcSuggestions(nextCcHistory);
      }
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

  function downloadCandidateSmartChipRows(chipId) {
    const chip = SMART_SEARCH_QUICK_CHIPS.find((item) => item.id === chipId);
    const rows = candidateSmartChipRows[chipId] || [];
    if (!rows.length) {
      setStatus("workspace", "No rows to download for this chip.", "error");
      return;
    }
    const safeLabel = String(chip?.label || chipId || "smart-chip")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const headers = ["Candidate", "Round / Status", "Date", "Client", "Role", "Current CTC", "Expected CTC", "Notice", "Recruiter"];
    const bodyRows = rows.map((row) => ([
      row.candidateName || "",
      row.round || row.status || "",
      row.date ? formatDateForCopy(row.date) : "",
      row.client || "",
      row.role || "",
      row.currentCtc || "",
      row.expectedCtc || "",
      row.notice || "",
      row.recruiter || ""
    ]));
    const tableHeaders = headers.map((heading) => `<th style="border:1px solid #d8dee8;padding:10px 12px;background:#f6f8fb;text-align:left;font-size:13px;">${escapeHtml(heading)}</th>`).join("");
    const tableRows = bodyRows.map((cells) => `<tr>${cells.map((cell) => `<td style="border:1px solid #d8dee8;padding:8px 10px;font-size:12px;">${escapeHtml(cell)}</td>`).join("")}</tr>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"/></head><body><table style="border-collapse:collapse;width:100%;"><thead><tr>${tableHeaders}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
    downloadTextFile(`smart-${safeLabel || "search"}-${new Date().toISOString().slice(0, 10)}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
    setStatus("workspace", `${chip?.label || "Smart chip"} downloaded in Excel format.`, "ok");
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
    const signatureText = perUserSignatureText
      || fillClientShareTemplate(copySettings.clientShareSignatureText || DEFAULT_COPY_SETTINGS.clientShareSignatureText || "", context).trim();
    const links = [
      {
        label: String(smtpSettings.signatureLinkLabel || copySettings.clientShareSignatureLinkLabel || "").trim(),
        url: String(smtpSettings.signatureLinkUrl || copySettings.clientShareSignatureLinkUrl || "").trim()
      },
      {
        label: String(smtpSettings.signatureLinkLabel2 || copySettings.clientShareSignatureLinkLabel2 || "").trim(),
        url: String(smtpSettings.signatureLinkUrl2 || copySettings.clientShareSignatureLinkUrl2 || "").trim()
      }
    ].filter((link) => link.url);
    return { signatureText, links };
  }

  function splitSignatureLinkLabel(rawLabel) {
    const raw = String(rawLabel || "").trim();
    if (!raw) return { clickLabel: "Link", tail: "" };
    if (/linkedin/i.test(raw)) {
      const tail = raw
        .replace(/linkedin/ig, "")
        .replace(/^[\s|:-]+/, "")
        .replace(/[\s|:-]+$/, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      return { clickLabel: "LinkedIn", tail };
    }
    const [primary, secondary] = raw.split("||");
    const clickLabel = String(primary || raw).trim() || "Link";
    const tail = String(secondary || "").trim();
    return { clickLabel, tail };
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
      ...signature.links.map((link) => {
        const parts = splitSignatureLinkLabel(link.label || link.url || "");
        return `${parts.clickLabel}: ${link.url}${parts.tail ? ` ${parts.tail}` : ""}`;
      })
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
      .map((link) => {
        const parts = splitSignatureLinkLabel(link.label || link.url || "");
        const clickLabel = parts.clickLabel;
        const tail = parts.tail;
        const anchor = `<a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" style="color:#0b57d0;text-decoration:none;">${escapeHtml(clickLabel || link.url)}</a>`;
        return tail ? `${anchor} ${escapeHtml(tail)}` : anchor;
      })
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
      await reloadLoginSettingsWorkspace();
      setClientUserDraft({ username: "", password: "", clientName: "", allowedPositions: "" });
      setStatus("loginClient", "Client login created.", "ok");
    } catch (error) {
      setStatus("loginClient", String(error?.message || error), "error");
    }
  }

  async function createEmployeePortalUser() {
    if (!isSettingsAdmin) {
      setStatus("loginEmployee", "Only admin can add employees.", "error");
      return;
    }
    try {
      setStatus("loginEmployee", "Creating employee login...");
      const payload = {
        employeeCode: String(employeeUserDraft.employeeCode || "").trim(),
        username: String(employeeUserDraft.username || "").trim(),
        fullName: String(employeeUserDraft.fullName || "").trim(),
        password: String(employeeUserDraft.password || ""),
        designation: String(employeeUserDraft.designation || "").trim(),
        clientName: String(employeeUserDraft.clientName || "").trim()
      };
      const latitude = Number(String(employeeUserDraft.workSiteLatitude || "").trim());
      const longitude = Number(String(employeeUserDraft.workSiteLongitude || "").trim());
      const radius = Number(String(employeeUserDraft.workSiteRadiusMeters || "").trim() || "500");
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        payload.workSite = {
          siteName: String(employeeUserDraft.workSiteName || "Primary Work Site").trim(),
          addressText: String(employeeUserDraft.workSiteAddress || "").trim(),
          clientName: String(employeeUserDraft.clientName || "").trim(),
          latitude,
          longitude,
          radiusMeters: Number.isFinite(radius) ? Math.max(50, radius) : 500,
          isPrimary: true
        };
      }
      const createdEmployee = await api("/company/employees", token, "POST", payload);
      if (createdEmployee && typeof createdEmployee === "object") {
        setEmployeeUsers((current) => {
          const incomingId = String(createdEmployee.id || "").trim();
          const withoutDuplicate = incomingId
            ? (current || []).filter((item) => String(item?.id || "").trim() !== incomingId)
            : (current || []);
          return [createdEmployee, ...withoutDuplicate];
        });
      }
      await reloadLoginSettingsWorkspace().catch(() => {});
      setEmployeeUserDraft({
        employeeCode: "",
        username: "",
        fullName: "",
        password: "",
        designation: "",
        clientName: "",
        workSiteName: "",
        workSiteAddress: "",
        workSiteLatitude: "",
        workSiteLongitude: "",
        workSiteRadiusMeters: "500"
      });
      setStatus("loginEmployee", "Employee login created.", "ok");
    } catch (error) {
      setStatus("loginEmployee", String(error?.message || error), "error");
    }
  }
  const createEmployeeUser = createEmployeePortalUser;

  async function createPayrollUser() {
    if (!isSettingsAdmin) {
      setStatus("loginPayroll", "Only admin can add payroll users.", "error");
      return;
    }
    if (!isLicenseOwnerAdmin) {
      setStatus("loginPayroll", "Only license owner admin can add payroll users.", "error");
      return;
    }
    try {
      setStatus("loginPayroll", "Creating payroll user...");
      const payload = {
        name: String(payrollUserDraft.name || "").trim(),
        email: String(payrollUserDraft.email || "").trim(),
        password: String(payrollUserDraft.password || ""),
        role: String(payrollUserDraft.role || "payroll_owner").trim()
      };
      if (!payload.name || !payload.email || !payload.password) {
        setStatus("loginPayroll", "Name, email, and temporary password are required.", "error");
        return;
      }
      await api("/company/users", token, "POST", payload);
      await reloadLoginSettingsWorkspace();
      setPayrollUserDraft({ name: "", email: "", password: "", role: "payroll_owner" });
      setStatus("loginPayroll", "Payroll user created.", "ok");
    } catch (error) {
      setStatus("loginPayroll", String(error?.message || error), "error");
    }
  }

  async function resetEmployeePortalPassword(employeeUserId) {
    if (!isSettingsAdmin) {
      setStatus("loginEmployee", "Only admin can reset employee passwords.", "error");
      return;
    }
    const nextPassword = String(employeePasswordDrafts[employeeUserId] || "").trim();
    if (!nextPassword) {
      setStatus("loginEmployee", "Enter a new employee password first.", "error");
      return;
    }
    try {
      setStatus("loginEmployee", "Resetting employee password...");
      await api("/company/employees/password", token, "POST", { employeeUserId, newPassword: nextPassword });
      setEmployeePasswordDrafts((current) => ({ ...current, [employeeUserId]: "" }));
      setStatus("loginEmployee", "Employee password reset.", "ok");
    } catch (error) {
      setStatus("loginEmployee", String(error?.message || error), "error");
    }
  }

  function getEmployeeEditDraft(item) {
    const employeeId = String(item?.id || "").trim();
    const existing = employeeEditDrafts[employeeId];
    if (existing) return existing;
    return {
      designation: String(item?.designation || "").trim(),
      clientName: String(item?.clientName || "").trim(),
      workSiteName: String(item?.workSite?.siteName || "").trim(),
      workSiteAddress: String(item?.workSite?.addressText || "").trim(),
      workSiteLatitude: item?.workSite?.latitude == null ? "" : String(item.workSite.latitude),
      workSiteLongitude: item?.workSite?.longitude == null ? "" : String(item.workSite.longitude),
      workSiteRadiusMeters: String(item?.workSite?.radiusMeters || 500)
    };
  }

  function setEmployeeEditField(employeeId, key, value) {
    setEmployeeEditDrafts((current) => ({
      ...current,
      [employeeId]: {
        ...(current[employeeId] || {}),
        [key]: value
      }
    }));
  }

  async function saveEmployeeEdits(item) {
    if (!isSettingsAdmin) {
      setStatus("loginEmployee", "Only admin can edit employee details.", "error");
      return;
    }
    const employeeId = String(item?.id || "").trim();
    if (!employeeId) {
      setStatus("loginEmployee", "Employee id missing.", "error");
      return;
    }
    const draft = getEmployeeEditDraft(item);
    try {
      setStatus("loginEmployee", "Saving employee details...");
      const latitude = Number(String(draft.workSiteLatitude || "").trim());
      const longitude = Number(String(draft.workSiteLongitude || "").trim());
      const radiusMeters = Number(String(draft.workSiteRadiusMeters || "").trim() || "500");
      const payload = {
        employeeId,
        employeeCode: String(item?.employeeCode || "").trim(),
        fullName: String(item?.fullName || "").trim(),
        designation: String(draft.designation || "").trim(),
        clientName: String(draft.clientName || "").trim(),
        workSite: Number.isFinite(latitude) && Number.isFinite(longitude)
          ? {
              siteName: String(draft.workSiteName || "Primary Work Site").trim(),
              addressText: String(draft.workSiteAddress || "").trim(),
              clientName: String(draft.clientName || item?.clientName || "").trim(),
              latitude,
              longitude,
              radiusMeters: Number.isFinite(radiusMeters) ? Math.max(50, radiusMeters) : 500,
              isPrimary: true
            }
          : {}
      };
      await api("/company/employees/update", token, "POST", payload);
      await reloadLoginSettingsWorkspace();
      setStatus("loginEmployee", "Employee details updated.", "ok");
    } catch (error) {
      setStatus("loginEmployee", String(error?.message || error), "error");
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
      await reloadLoginSettingsWorkspace();
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
      await reloadLoginSettingsWorkspace();
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

  async function deleteShortcutDraft(key) {
    const jobId = String(selectedJobId || jobDraft.id || "").trim();
    if (!jobId) {
      setStatus("jobs", "Select an existing JD first to delete JD shortcuts.", "error");
      return;
    }
    const parsed = parseShortcutMap(jobDraft.jdShortcuts);
    delete parsed[key];
    if (normalizeShortcutKey(jobShortcutKey) === key) {
      setJobShortcutKey("");
      setJobShortcutValue("");
    }
    await persistCurrentJobShortcuts(parsed, `Removed shortcut ${key}.`);
  }

  async function savePersonalShortcutTemplate() {
    const key = normalizeShortcutKey(shortcutPersonalKey);
    const value = String(shortcutPersonalValue || "").trim();
    if (!key || !value) {
      setStatus("shortcuts", "Enter personal shortcut key and template text.", "error");
      return;
    }
    try {
      const next = { ...normalizeShortcutMapKeys(personalShortcuts || {}), [key]: value };
      const result = await api("/company/personal-shortcuts", token, "POST", { shortcuts: next });
      const savedRaw = result?.shortcuts && typeof result.shortcuts === "object" ? result.shortcuts : next;
      const saved = normalizeShortcutMapKeys(savedRaw);
      setPersonalShortcuts(saved);
      setShortcutPersonalKey("");
      setShortcutPersonalValue("");
      setStatus("shortcuts", `Saved personal shortcut ${formatShortcutLabel(key)}.`, "ok");
    } catch (error) {
      setStatus("shortcuts", String(error?.message || error), "error");
    }
  }

  async function deletePersonalShortcutTemplate(key) {
    const normalized = normalizeShortcutKey(key);
    if (!normalized) return;
    try {
      const next = { ...normalizeShortcutMapKeys(personalShortcuts || {}) };
      delete next[normalized];
      const result = await api("/company/personal-shortcuts", token, "POST", { shortcuts: next });
      const savedRaw = result?.shortcuts && typeof result.shortcuts === "object" ? result.shortcuts : next;
      const saved = normalizeShortcutMapKeys(savedRaw);
      setPersonalShortcuts(saved);
      if (normalizeShortcutKey(shortcutPersonalKey) === normalized) {
        setShortcutPersonalKey("");
        setShortcutPersonalValue("");
      }
      setStatus("shortcuts", `Deleted personal shortcut ${formatShortcutLabel(normalized)}.`, "ok");
    } catch (error) {
      setStatus("shortcuts", String(error?.message || error), "error");
    }
  }

  async function saveJobShortcutTemplate() {
    const jobId = String(shortcutJobId || "").trim();
    const key = normalizeShortcutKey(shortcutJobKey);
    const value = String(shortcutJobValue || "").trim();
    if (!jobId) {
      setStatus("shortcuts", "Select a JD first for job-specific shortcut.", "error");
      return;
    }
    if (!key || !value) {
      setStatus("shortcuts", "Enter job shortcut key and template text.", "error");
      return;
    }
    try {
      const currentMap = normalizeShortcutMapKeys(parseShortcutMap(selectedShortcutJob?.jdShortcuts || ""));
      currentMap[key] = value;
      const payload = stringifyShortcutMap(currentMap);
      const result = await api("/company/jds/shortcuts", token, "POST", { jobId, shortcuts: payload });
      const savedShortcuts = String(result?.jdShortcuts || payload);
      setState((current) => ({
        ...current,
        jobs: Array.isArray(current.jobs)
          ? current.jobs.map((item) => String(item?.id || "") === jobId ? { ...item, jdShortcuts: savedShortcuts } : item)
          : current.jobs
      }));
      setJobsCatalog((current) => Array.isArray(current)
        ? current.map((item) => String(item?.id || "") === jobId ? { ...item, jdShortcuts: savedShortcuts } : item)
        : current);
      setShortcutJobKey("");
      setShortcutJobValue("");
      setStatus("shortcuts", `Saved job shortcut ${formatShortcutLabel(key)}.`, "ok");
    } catch (error) {
      setStatus("shortcuts", String(error?.message || error), "error");
    }
  }

  async function deleteJobShortcutTemplate(key) {
    const jobId = String(shortcutJobId || "").trim();
    const normalized = normalizeShortcutKey(key);
    if (!jobId || !normalized) return;
    try {
      const currentMap = normalizeShortcutMapKeys(parseShortcutMap(selectedShortcutJob?.jdShortcuts || ""));
      delete currentMap[normalized];
      const payload = stringifyShortcutMap(currentMap);
      const result = await api("/company/jds/shortcuts", token, "POST", { jobId, shortcuts: payload });
      const savedShortcuts = String(result?.jdShortcuts || payload);
      setState((current) => ({
        ...current,
        jobs: Array.isArray(current.jobs)
          ? current.jobs.map((item) => String(item?.id || "") === jobId ? { ...item, jdShortcuts: savedShortcuts } : item)
          : current.jobs
      }));
      setJobsCatalog((current) => Array.isArray(current)
        ? current.map((item) => String(item?.id || "") === jobId ? { ...item, jdShortcuts: savedShortcuts } : item)
        : current);
      if (normalizeShortcutKey(shortcutJobKey) === normalized) {
        setShortcutJobKey("");
        setShortcutJobValue("");
      }
      setStatus("shortcuts", `Deleted job shortcut ${formatShortcutLabel(normalized)}.`, "ok");
    } catch (error) {
      setStatus("shortcuts", String(error?.message || error), "error");
    }
  }

  async function saveCompanyShortcutTemplate() {
    if (!isSettingsAdmin) {
      setStatus("shortcuts", "Only admin can save company templates.", "error");
      return;
    }
    const key = normalizeShortcutKey(shortcutCompanyKey);
    const value = String(shortcutCompanyValue || "").trim();
    if (!key || !value) {
      setStatus("shortcuts", "Enter company shortcut key and template text.", "error");
      return;
    }
    try {
      const existing = normalizeShortcutMapKeys(
        copySettings?.companyWideShortcuts && typeof copySettings.companyWideShortcuts === "object"
          ? copySettings.companyWideShortcuts
          : {}
      );
      const payload = { ...copySettings, companyWideShortcuts: { ...existing, [key]: value } };
      const result = await api("/company/shared-export-presets", token, "POST", { settings: payload });
      setCopySettings((current) => ({ ...DEFAULT_COPY_SETTINGS, ...current, ...result }));
      setShortcutCompanyKey("");
      setShortcutCompanyValue("");
      setStatus("shortcuts", `Saved company shortcut ${formatShortcutLabel(key)}.`, "ok");
    } catch (error) {
      setStatus("shortcuts", String(error?.message || error), "error");
    }
  }

  async function deleteCompanyShortcutTemplate(key) {
    if (!isSettingsAdmin) {
      setStatus("shortcuts", "Only admin can delete company templates.", "error");
      return;
    }
    const normalized = normalizeShortcutKey(key);
    if (!normalized) return;
    try {
      const existing = normalizeShortcutMapKeys(
        copySettings?.companyWideShortcuts && typeof copySettings.companyWideShortcuts === "object"
          ? { ...copySettings.companyWideShortcuts }
          : {}
      );
      delete existing[normalized];
      const payload = { ...copySettings, companyWideShortcuts: existing };
      const result = await api("/company/shared-export-presets", token, "POST", { settings: payload });
      setCopySettings((current) => ({ ...DEFAULT_COPY_SETTINGS, ...current, ...result }));
      setStatus("shortcuts", `Deleted company shortcut ${formatShortcutLabel(normalized)}.`, "ok");
    } catch (error) {
      setStatus("shortcuts", String(error?.message || error), "error");
    }
  }

  function buildShortcutCopyContext(jobOverride = null) {
    const job = jobOverride || selectedShortcutJob || null;
    const jobId = String(job?.id || "").trim();
    const recruiterName = String(state.user?.name || "").trim();
    const companyName = String(state.user?.companyName || "").trim();
    const jdTitle = String(job?.title || "").trim();
    const clientName = String(job?.clientName || "").trim();
    const jdLink = jobId ? getApplyLink(jobId) : "";
    return {
      recruiter_name: recruiterName,
      company_name: companyName,
      jd_title: jdTitle,
      client_name: clientName,
      jd_link: jdLink,
      recruiter_jd_link: jdLink
    };
  }

  function renderShortcutTemplateForCopy(template = "", jobOverride = null) {
    const text = String(template || "");
    const map = buildShortcutCopyContext(jobOverride);
    return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, token) => {
      const key = String(token || "").trim().toLowerCase();
      const value = String(map[key] || "").trim();
      // Keep unresolved placeholders intact so recruiter can quickly edit them.
      return value ? value : match;
    });
  }

  async function copyShortcutTemplateWithValues(key, template, jobOverride = null) {
    const rendered = renderShortcutTemplateForCopy(template, jobOverride);
    await copyText(rendered);
    setStatus("shortcuts", `Copied ${formatShortcutLabel(key)} with available values.`, "ok");
  }

  function insertPlaceholderAtCursor(textareaRef, currentValue, setValue, token) {
    const nextToken = String(token || "").trim();
    if (!nextToken) return;
    const text = String(currentValue || "");
    const textarea = textareaRef?.current || null;
    if (!textarea) {
      setValue((prev) => `${String(prev || "")}${nextToken}`);
      return;
    }
    const start = Number.isFinite(textarea.selectionStart) ? textarea.selectionStart : text.length;
    const end = Number.isFinite(textarea.selectionEnd) ? textarea.selectionEnd : start;
    const before = text.slice(0, start);
    const after = text.slice(end);
    const nextText = `${before}${nextToken}${after}`;
    const nextCursor = before.length + nextToken.length;
    setValue(nextText);
    requestAnimationFrame(() => {
      try {
        textarea.focus();
        textarea.setSelectionRange(nextCursor, nextCursor);
      } catch {
        // ignore selection errors
      }
    });
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
    openWhatsappTemplatePicker({
      name: interviewForm.candidateName || "",
      jd_title: interviewForm.jdTitle || "",
      company: interviewForm.currentCompany || "",
      company_name: state.user?.companyName || "",
      outcome: interviewForm.candidateStatus || "",
      recruiter_name: state.user?.name || "",
      recruiter_notes: interviewForm.recruiterNotes || interviewForm.callbackNotes || "",
      location: interviewForm.location || "",
      phone: interviewForm.phoneNumber || "",
      email: interviewForm.emailId || "",
      source: "interview",
      interview_at: interviewForm.interviewAt || ""
    }, interviewForm.phoneNumber || "", "interview");
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
    openWhatsappTemplatePicker({
      name: assessment?.candidateName || "",
      jd_title: assessment?.jdTitle || "",
      company: assessment?.currentCompany || "",
      company_name: state.user?.companyName || "",
      outcome: normalizeAssessmentStatusLabel(assessment?.candidateStatus || ""),
      recruiter_name: assessment?.recruiterName || state.user?.name || "",
      recruiter_notes: assessment?.recruiterNotes || "",
      location: assessment?.location || "",
      phone: assessment?.phoneNumber || "",
      email: assessment?.emailId || "",
      source: "assessment",
      interview_at: assessment?.interviewAt || "",
      client_name: assessment?.clientName || "",
      jd_id: assessment?.jobId || assessment?.jdId || ""
    }, assessment?.phoneNumber || "", "assessments");
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
  const dashboardOverall = state.dashboard?.summary?.overall || {};
  const dashboardClientGroups = state.dashboard?.summary?.byClient || [];
  const dashboardRecruiterGroups = state.dashboard?.summary?.byOwnerRecruiter || [];
  const hasDashboardData = Boolean(
    Object.keys(dashboardOverall || {}).length ||
    dashboardClientGroups.length ||
    dashboardRecruiterGroups.length
  );
  const safePct = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);
  const kpiCards = [
    { key: "totalCandidates", label: "Total Candidates", value: Number(dashboardOverall.sourced || 0), icon: "TC" },
    { key: "activeClients", label: "Active Clients", value: dashboardClientGroups.length, icon: "CL" },
    { key: "activeRecruiters", label: "Active Recruiters", value: dashboardRecruiterGroups.length, icon: "RC" },
    { key: "sharedProfiles", label: "Shared Profiles", value: Number(dashboardOverall.converted || 0), icon: "SH" },
    { key: "interviews", label: "Interviews", value: Number(dashboardOverall.under_interview_process || 0), icon: "IN" },
    { key: "offers", label: "Offers", value: Number(dashboardOverall.offered || 0), icon: "OF" },
    { key: "overallConversion", label: "Overall Conversion %", value: `${safePct(Number(dashboardOverall.converted || 0), Number(dashboardOverall.sourced || 0))}%`, icon: "CV" }
  ];
  const clientLeaderboardShared = [...dashboardClientGroups]
    .sort((a, b) => Number(b?.metrics?.converted || 0) - Number(a?.metrics?.converted || 0))
    .slice(0, 3);
  const clientLeaderboardInterviews = [...dashboardClientGroups]
    .sort((a, b) => Number(b?.metrics?.under_interview_process || 0) - Number(a?.metrics?.under_interview_process || 0))
    .slice(0, 3);
  const clientLeaderboardLowConversion = [...dashboardClientGroups]
    .map((group) => ({
      ...group,
      conversion: safePct(Number(group?.metrics?.converted || 0), Number(group?.metrics?.sourced || 0))
    }))
    .filter((group) => Number(group?.metrics?.sourced || 0) > 0)
    .sort((a, b) => Number(a.conversion || 0) - Number(b.conversion || 0))
    .slice(0, 3);
  const clientChartRows = [...dashboardClientGroups]
    .map((group) => ({
      label: String(group?.label || "Client"),
      sourced: Number(group?.metrics?.sourced || 0),
      shared: Number(group?.metrics?.converted || 0),
      interviews: Number(group?.metrics?.under_interview_process || 0),
      conversion: safePct(Number(group?.metrics?.converted || 0), Number(group?.metrics?.sourced || 0))
    }))
    .sort((a, b) => b.sourced - a.sourced)
    .slice(0, 8);
  const maxClientSourced = Math.max(1, ...clientChartRows.map((row) => row.sourced));
  const maxClientSharedForFunnel = Math.max(1, ...clientChartRows.map((row) => row.shared));
  const recruiterLeaderboardShared = [...dashboardRecruiterGroups]
    .sort((a, b) => Number(b?.metrics?.converted || 0) - Number(a?.metrics?.converted || 0))
    .slice(0, 5);
  const recruiterInsights = [...dashboardRecruiterGroups].map((group) => {
    const sourced = Number(group?.metrics?.sourced || 0);
    const applied = Number(group?.metrics?.applied || 0);
    const shared = Number(group?.metrics?.converted || 0);
    const interviews = Number(group?.metrics?.under_interview_process || 0);
    const shortlisted = Number(group?.metrics?.shortlisted || 0);
    const offered = Number(group?.metrics?.offered || 0);
    const selfSourced = Number(group?.ownership?.selfSourced || 0);
    const assignedSourcing = Number(group?.ownership?.assignedSourcing || group?.ownership?.adminAssignedSourcing || 0);
    const adminAssignedSourcing = Number(group?.ownership?.adminAssignedSourcing || 0);
    const directApplicants = Number(group?.ownership?.directApplicants || group?.ownership?.websiteApply || 0);
    const assignedApplicants = Number(group?.ownership?.assignedApplicants || group?.ownership?.adminAssignedApplicants || 0);
    const conversionPct = safePct(shared, sourced);
    const interviewPct = safePct(interviews, shared);
    const selfAssignedPct = adminAssignedSourcing > 0
      ? safePct(selfSourced, Math.max(selfSourced, adminAssignedSourcing))
      : safePct(selfSourced, selfSourced + assignedSourcing);
    const directAssignedPct = safePct(directApplicants, directApplicants + assignedApplicants);
    const performanceScore = Math.max(0, Math.min(100, Math.round(
      (conversionPct * 0.35) +
      (interviewPct * 0.25) +
      (safePct(offered, Math.max(1, interviews)) * 0.2) +
      (safePct(shortlisted, Math.max(1, interviews)) * 0.1) +
      (Math.min(shared, 100) * 0.1)
    )));
    return {
      label: String(group?.label || "Recruiter"),
      sourced,
      applied,
      shared,
      interviews,
      shortlisted,
      offered,
      selfSourced,
      assignedSourcing,
      directApplicants,
      assignedApplicants,
      conversionPct,
      interviewPct,
      selfAssignedPct,
      directAssignedPct,
      performanceScore
    };
  });
  const recruiterLeaderboardRanked = [...recruiterInsights]
    .sort((a, b) => b.performanceScore - a.performanceScore)
    .map((row, idx) => ({ ...row, rank: idx + 1 }));
  const maxRecruiterScore = Math.max(1, ...recruiterLeaderboardRanked.map((row) => row.performanceScore));
  const maxRecruiterSourced = Math.max(1, ...recruiterLeaderboardRanked.map((row) => row.sourced));
  const maxRecruiterShared = Math.max(1, ...recruiterLeaderboardRanked.map((row) => row.shared));
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
                {!hasDashboardData ? (
                  <div className="reports-skeleton-grid" aria-hidden="true">
                    <div className="reports-skeleton-card" />
                    <div className="reports-skeleton-card" />
                    <div className="reports-skeleton-card" />
                    <div className="reports-skeleton-card" />
                  </div>
                ) : null}
                <div className="reports-kpi-grid">
                  {kpiCards.map((item) => (
                    <article key={item.key} className="reports-kpi-card">
                      <div className="reports-kpi-card__top">
                        <span className="reports-kpi-card__icon">{item.icon}</span>
                        <span className="reports-kpi-card__trend">No trend data</span>
                      </div>
                      <div className="reports-kpi-card__value">{item.value}</div>
                      <div className="reports-kpi-card__label">{item.label}</div>
                    </article>
                  ))}
                </div>
                <div className="reports-view-tabs">
                  <button className={reportsTab === "client" ? "active" : ""} onClick={() => setReportsTab("client")}>Client View</button>
                  <button className={reportsTab === "recruiter" ? "active" : ""} onClick={() => setReportsTab("recruiter")}>Recruiter View</button>
                </div>
              </Section>
              <div className="dashboard-breakdown-stack">
                {reportsTab !== "recruiter" ? (
                <Section kicker="Breakdown" title="Client Breakdown">
                  <div className="reports-leaderboard-strip">
                    <article className="reports-leaderboard-card">
                      <h4>Top Clients by Shared</h4>
                      <ol>
                        {clientLeaderboardShared.map((item) => (
                          <li key={`client-shared-${item.label}`}>
                            <span>{item.label}</span>
                            <strong>{item?.metrics?.converted || 0}</strong>
                          </li>
                        ))}
                        {!clientLeaderboardShared.length ? <li><span>No data</span><strong>0</strong></li> : null}
                      </ol>
                    </article>
                    <article className="reports-leaderboard-card">
                      <h4>Top Clients by Interviews</h4>
                      <ol>
                        {clientLeaderboardInterviews.map((item) => (
                          <li key={`client-int-${item.label}`}>
                            <span>{item.label}</span>
                            <strong>{item?.metrics?.under_interview_process || 0}</strong>
                          </li>
                        ))}
                        {!clientLeaderboardInterviews.length ? <li><span>No data</span><strong>0</strong></li> : null}
                      </ol>
                    </article>
                    <article className="reports-leaderboard-card">
                      <h4>Lowest Conversion (Improve)</h4>
                      <ol>
                        {clientLeaderboardLowConversion.map((item) => (
                          <li key={`client-low-${item.label}`}>
                            <span>{item.label}</span>
                            <strong>{item.conversion}%</strong>
                          </li>
                        ))}
                        {!clientLeaderboardLowConversion.length ? <li><span>No data</span><strong>0%</strong></li> : null}
                      </ol>
                    </article>
                  </div>
                  <div className="reports-client-chart-grid">
                    <article className="reports-chart-card">
                      <h4>Client-wise Sourced vs Shared</h4>
                      {!clientChartRows.length ? <div className="empty-state compact-empty">No chart data.</div> : (
                        <div className="reports-bar-list">
                          {clientChartRows.map((row) => (
                            <div key={`client-bars-${row.label}`} className="reports-bar-row">
                              <span className="reports-bar-label">{row.label}</span>
                              <div className="reports-stacked-track">
                                <i
                                  className="reports-stacked-track__base"
                                  style={{ width: `${Math.max(4, Math.round((row.sourced / maxClientSourced) * 100))}%` }}
                                />
                                <i
                                  className="reports-stacked-track__fill"
                                  style={{ width: `${row.sourced > 0 ? Math.max(2, Math.round((row.shared / row.sourced) * Math.max(4, Math.round((row.sourced / maxClientSourced) * 100)))) : 0}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                    <article className="reports-chart-card">
                      <h4>Client Pipeline Funnel (Shared â†’ Interview)</h4>
                      {!clientChartRows.length ? <div className="empty-state compact-empty">No funnel data.</div> : (
                        <div className="reports-funnel-list">
                          {clientChartRows.map((row) => (
                            <div key={`client-funnel-${row.label}`} className="reports-funnel-item">
                              <div className="reports-funnel-item__head"><span>{row.label}</span><strong>{row.interviews}</strong></div>
                              <div className="reports-stacked-track">
                                <i
                                  className="reports-stacked-track__base"
                                  style={{ width: `${Math.max(4, Math.round((row.shared / maxClientSharedForFunnel) * 100))}%` }}
                                />
                                <i
                                  className="reports-stacked-track__fill"
                                  style={{ width: `${row.shared > 0 ? Math.max(2, Math.round((row.interviews / row.shared) * Math.max(4, Math.round((row.shared / maxClientSharedForFunnel) * 100)))) : 0}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                    <article className="reports-chart-card">
                      <h4>Client Conversion Comparison</h4>
                      {!clientChartRows.length ? <div className="empty-state compact-empty">No conversion data.</div> : (
                        <div className="reports-conversion-list">
                          {clientChartRows.map((row) => (
                            <div key={`client-conv-${row.label}`} className="reports-conversion-item">
                              <span>{row.label}</span>
                              <div className="reports-conversion-pill">{row.conversion}%</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  </div>
                  <div className="stack-list">
                    {!dashboardClientGroups.length ? <div className="empty-state">No client breakdown available.</div> : dashboardClientGroups.map((group) => (
                      <details className="dashboard-group" key={group.label}>
                        <summary className="dashboard-group__summary">
                          <div>
                            <h3>{group.label}</h3>
                            <p className="muted">{`${group.metrics?.sourced || 0} sourced | ${group.metrics?.applied || 0} applied | ${group.metrics?.converted || 0} shared | ${group.metrics?.under_interview_process || 0} under interview | ${safePct(Number(group.metrics?.converted || 0), Number(group.metrics?.sourced || 0))}% conversion`}</p>
                            <div className="reports-inline-badges">
                              <span className="reports-inline-badge">Conversion {safePct(Number(group.metrics?.converted || 0), Number(group.metrics?.sourced || 0))}%</span>
                              <span className="reports-inline-badge reports-inline-badge--alt">Interview Ratio {safePct(Number(group.metrics?.under_interview_process || 0), Number(group.metrics?.converted || 0))}%</span>
                            </div>
                            <div className="reports-inline-progress">
                              <div className="reports-inline-progress__bar"><i style={{ width: `${safePct(Number(group.metrics?.converted || 0), Number(group.metrics?.sourced || 0))}%` }} /></div>
                              <div className="reports-inline-progress__bar reports-inline-progress__bar--alt"><i style={{ width: `${safePct(Number(group.metrics?.under_interview_process || 0), Number(group.metrics?.converted || 0))}%` }} /></div>
                            </div>
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
                ) : null}
                {reportsTab !== "client" ? (
                <Section kicker="Breakdown" title="Recruiter Breakdown">
                  <div className="reports-leaderboard-strip">
                    <article className="reports-leaderboard-card">
                      <h4>Top Recruiters by Shared</h4>
                      <ol>
                        {recruiterLeaderboardShared.map((item) => (
                          <li key={`recruiter-shared-${item.label}`}>
                            <span>{item.label}</span>
                            <strong>{item?.metrics?.converted || 0}</strong>
                          </li>
                        ))}
                        {!recruiterLeaderboardShared.length ? <li><span>No data</span><strong>0</strong></li> : null}
                      </ol>
                    </article>
                  </div>
                  <div className="table-wrap">
                    <table className="dashboard-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Recruiter</th>
                          <th>Sourced</th>
                          <th>Applied</th>
                          <th>Shared</th>
                          <th>Interviews</th>
                          <th>Offers</th>
                          <th>Conversion %</th>
                          <th>Score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recruiterLeaderboardRanked.map((row) => (
                          <tr key={`leaderboard-${row.label}`}>
                            <td>{row.rank}</td>
                            <td>{row.label}</td>
                            <td>{row.sourced}</td>
                            <td>{row.applied}</td>
                            <td>{row.shared}</td>
                            <td>{row.interviews}</td>
                            <td>{row.offered}</td>
                            <td>{row.conversionPct}%</td>
                            <td>{row.performanceScore}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="reports-client-chart-grid">
                    <article className="reports-chart-card">
                      <h4>Recruiter Performance (Score)</h4>
                      {!recruiterLeaderboardRanked.length ? <div className="empty-state compact-empty">No chart data.</div> : (
                        <div className="reports-funnel-list">
                          {recruiterLeaderboardRanked.map((row) => (
                            <div key={`score-${row.label}`} className="reports-funnel-item">
                              <div className="reports-funnel-item__head"><span>{row.label}</span><strong>{row.performanceScore}</strong></div>
                              <div className="reports-funnel-track"><i style={{ width: `${Math.max(4, Math.round((row.performanceScore / maxRecruiterScore) * 100))}%` }} /></div>
                            </div>
                          ))}
                        </div>
                      )}
                      <p className="muted reports-formula-note">
                        Score = 35% conversion + 25% interview ratio + 20% offer ratio + 10% shortlist ratio + 10% shared volume bonus (capped), range 0-100.
                      </p>
                    </article>
                    <article className="reports-chart-card">
                      <h4>Recruiter Conversion Funnel</h4>
                      {!recruiterLeaderboardRanked.length ? <div className="empty-state compact-empty">No funnel data.</div> : (
                        <div className="reports-bar-list">
                          {recruiterLeaderboardRanked.map((row) => (
                            <div key={`conv-funnel-${row.label}`} className="reports-bar-row">
                              <span className="reports-bar-label">{row.label}</span>
                              <div className="reports-stacked-track">
                                <i
                                  className="reports-stacked-track__base"
                                  style={{ width: `${Math.max(4, Math.round((row.sourced / maxRecruiterSourced) * 100))}%` }}
                                />
                                <i
                                  className="reports-stacked-track__mid"
                                  style={{ width: `${row.sourced > 0 ? Math.max(2, Math.round((row.shared / row.sourced) * Math.max(4, Math.round((row.sourced / maxRecruiterSourced) * 100)))) : 0}%` }}
                                />
                                <i
                                  className="reports-stacked-track__fill"
                                  style={{ width: `${row.sourced > 0 ? Math.max(2, Math.round((row.interviews / row.sourced) * Math.max(4, Math.round((row.sourced / maxRecruiterSourced) * 100)))) : 0}%` }}
                                />
                              </div>
                              <span className="reports-bar-meta">{`So:${row.sourced} | Sh:${row.shared} | I:${row.interviews}`}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                    <article className="reports-chart-card">
                      <h4>Self Sourced vs Assigned</h4>
                      {!recruiterLeaderboardRanked.length ? <div className="empty-state compact-empty">No ratio data.</div> : (
                        <div className="reports-conversion-list">
                          {recruiterLeaderboardRanked.map((row) => (
                            <div key={`self-assigned-${row.label}`} className="reports-conversion-item">
                              <span>{row.label}</span>
                              <div className="reports-conversion-pill">{row.selfAssignedPct}% self</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                    <article className="reports-chart-card">
                      <h4>Shared to Interview Ratio</h4>
                      {!recruiterLeaderboardRanked.length ? <div className="empty-state compact-empty">No ratio data.</div> : (
                        <div className="reports-conversion-list">
                          {recruiterLeaderboardRanked.map((row) => (
                            <div key={`shared-int-${row.label}`} className="reports-conversion-item">
                              <span>{row.label}</span>
                              <div className="reports-conversion-pill">{row.interviewPct}%</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </article>
                  </div>
                  <div className="stack-list">
                    {!dashboardRecruiterGroups.length ? <div className="empty-state">No recruiter breakdown available.</div> : dashboardRecruiterGroups.map((group) => (
                      <details className="dashboard-group" key={group.label}>
                        <summary className="dashboard-group__summary">
                          <div>
                            <h3>{group.label}</h3>
                            <p className="muted">{`${group.metrics?.sourced || 0} sourced | ${group.metrics?.applied || 0} applied | ${group.metrics?.converted || 0} shared | ${group.metrics?.under_interview_process || 0} under interview | ${group.metrics?.shortlisted || 0} shortlisted | ${group.metrics?.offered || 0} offered`}</p>
                            {(() => {
                              const insight = recruiterLeaderboardRanked.find((row) => String(row.label) === String(group.label));
                              return insight ? (
                                <>
                                  <div className="reports-inline-badges">
                                    <span className="reports-inline-badge">Rank #{insight.rank}</span>
                                    <span className="reports-inline-badge">Score {insight.performanceScore}</span>
                                    <span className="reports-inline-badge reports-inline-badge--alt">Conversion {insight.conversionPct}%</span>
                                    <span className="reports-inline-badge reports-inline-badge--alt">Direct/Assigned {insight.directAssignedPct}%</span>
                                  </div>
                                  <div className="reports-inline-progress">
                                    <div className="reports-inline-progress__bar"><i style={{ width: `${insight.performanceScore}%` }} /></div>
                                    <div className="reports-inline-progress__bar reports-inline-progress__bar--alt"><i style={{ width: `${insight.interviewPct}%` }} /></div>
                                  </div>
                                </>
                              ) : null;
                            })()}
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
                ) : null}
              </div>
              {drilldownState.open ? (
                <div
                  ref={inlineDrilldownRef}
                  tabIndex={-1}
                  className={`inline-drilldown-anchor${inlineDrilldownPulse ? " is-active" : ""}`}
                >
                  <DrilldownModal
                    open={drilldownState.open}
                    loading={Boolean(drilldownState.loading)}
                    inline
                    hideRoleClient
                    title={drilldownState.title}
                    items={drilldownState.items}
                    onClose={() => setDrilldownState({ open: false, title: "", items: [], request: null, loading: false })}
                    onOpenCv={(candidateId) => void openCv(candidateId)}
                    onOpenNotes={(candidateId) => void openRecruiterNotes(candidateId)}
                    onOpenStatus={(target) => {
                      const assessmentId = String(target?.id || target?.assessmentId || "").trim();
                      if (assessmentId) {
                        setAssessmentStatusId(assessmentId);
                        return;
                      }
                      if (target?.candidateId) void openAttempts(target.candidateId);
                    }}
                  />
                </div>
              ) : null}
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
                      setCandidateKeywordAny1("");
                      setCandidateKeywordAny2("");
                      setCandidateKeywordAny3("");
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
                      <label><span>Any group 1 (OR)</span><input value={candidateKeywordAny1} onChange={(e) => setCandidateKeywordAny1(e.target.value)} placeholder=".NET Core, C#" /></label>
                      <label><span>Any group 2 (OR)</span><input value={candidateKeywordAny2} onChange={(e) => setCandidateKeywordAny2(e.target.value)} placeholder="Angular, React" /></label>
                      <label><span>Any group 3 (OR)</span><input value={candidateKeywordAny3} onChange={(e) => setCandidateKeywordAny3(e.target.value)} placeholder="SQL, MongoDB" /></label>
                      <label><span>Exclude keywords</span><input value={candidateKeywordExclude} onChange={(e) => setCandidateKeywordExclude(e.target.value)} placeholder="sales, recruiter, hr" /></label>
                    </div>
                    {candidateKeywordPreview ? (
                      <div className="muted">Query preview: <code>{candidateKeywordPreview}</code></div>
                    ) : (
                      <div className="muted">Add keywords to generate Boolean preview.</div>
                    )}
                  </div>
                ) : null}
                {candidateAiQueryMode === "natural" ? (
                  <div className="item-card compact-card candidate-quick-chip-builder">
                    <h3>Quick chips</h3>
                    <p className="muted">One-click shortlist blocks. Results stay aligned with your selected filters.</p>
                    <div className="filter-block">
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
                      setCandidateKeywordAny1("");
                      setCandidateKeywordAny2("");
                      setCandidateKeywordAny3("");
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
                {candidateFilterPanelOpen ? renderCandidateFilterPanel() : null}
                {candidateHasSmartChipSelection ? (
                  <div className="stack-list" style={{ marginTop: 10 }}>
                    {SMART_SEARCH_QUICK_CHIPS
                      .filter((chip) => candidateQuickChipIds.includes(chip.id))
                      .map((chip) => {
                        const rows = candidateSmartChipRows[chip.id] || [];
                        return (
                          <article key={chip.id} className="item-card compact-card candidate-smart-section">
                            <div className="candidate-smart-head">
                              <h3>{chip.label} ({rows.length})</h3>
                              <button
                                className="ghost-btn"
                                disabled={!rows.length}
                                onClick={() => downloadCandidateSmartChipRows(chip.id)}
                              >
                                Download
                              </button>
                            </div>
                            {!rows.length ? (
                              <div className="empty-state">No candidates found for this chip and current filters.</div>
                            ) : (
                              <div className="table-wrap candidate-smart-table-wrap">
                                <table className="dashboard-table candidate-smart-table">
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
                                      <th>Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {rows.map((row, index) => (
                                      <tr key={`${chip.id}-${row.item?.id || row.item?.assessmentId || row.candidateName}-${index}`}>
                                        <td>
                                          <button
                                            className="linkish candidate-smart-link"
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
                                        <td>
                                          <button
                                            className="ghost-btn"
                                            type="button"
                                            onClick={() => openAssessmentStatusFromSearch(row.item)}
                                          >
                                            Update status
                                          </button>
                                        </td>
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
                <MultiSelectDropdown label="Location" options={applicantOptions.locations} selected={applicantFilters.locations} onToggle={(value) => setApplicantFilters((current) => ({ ...current, locations: value === "__all__" ? [] : current.locations.includes(value) ? current.locations.filter((item) => item !== value) : [...current.locations, value] }))} />
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
                {String(state.user?.role || "").toLowerCase() === "admin" ? (
                  <>
                    {bulkAssignApplicantIds.length ? (
                      <button
                        onClick={() => {
                          if (!bulkAssignApplicantIds.length) return;
                          setAssignApplicantId("");
                          setBulkAssignApplicantModalOpen(true);
                        }}
                      >
                        {`Assign selected (${bulkAssignApplicantIds.length})`}
                      </button>
                    ) : null}
                  </>
                ) : null}
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
                        {String(state.user?.role || "").toLowerCase() === "admin" ? (
                          <label className="checkbox-row" style={{ marginRight: 6 }}>
                            <input
                              type="checkbox"
                              checked={bulkAssignApplicantIds.includes(String(item?.id || ""))}
                              onChange={(e) => {
                                const id = String(item?.id || "");
                                if (!id) return;
                                setBulkAssignApplicantIds((current) => e.target.checked
                                  ? Array.from(new Set([...current, id]))
                                  : current.filter((entry) => entry !== id));
                              }}
                            />
                            <span>Select</span>
                          </label>
                        ) : null}
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
                      <button
                        className="whatsapp-logo-btn"
                        onClick={() => openWhatsappTemplatePicker({
                          name: item.candidateName || "",
                          jd_title: item.jdTitle || "",
                          company: item.currentCompany || "",
                          company_name: state.user?.companyName || "",
                          outcome: getApplicantOutcome(item),
                          recruiter_name: item.assignedToName || state.user?.name || "",
                          recruiter_notes: item.screeningAnswers || "",
                          location: item.location || "",
                          phone: item.phone || item.phoneNumber || "",
                          email: item.email || "",
                          source: item.sourcePlatform || "",
                          client_name: item.clientName || "",
                          jd_id: item.jdId || item.jobId || ""
                        }, item.phone || item.phoneNumber || "", "applicants")}
                        title="Open WhatsApp"
                        aria-label="Open WhatsApp"
                      >
                        <img src="https://web.whatsapp.com/favicon.ico" alt="" />
                      </button>
                      <button onClick={() => void openAttempts(item.id)}>Attempts</button>
                      {!item.hidden_from_captured ? (
                        <button className="ghost-btn" onClick={() => openJdEmailModalForCandidate(item, item.jdId || "")}>Email JD</button>
                      ) : null}
                      {!item.hidden_from_captured ? (
                        <button onClick={() => void createAssessmentFromCandidate(item.id)}>Create assessment</button>
                      ) : null}
                      {item.cvFilename ? <button onClick={() => void openCv(item.id)}>Open CV</button> : null}
                      {state.user?.role === "admin" ? <button onClick={() => { setBulkAssignApplicantModalOpen(false); setBulkAssignApplicantIds([]); setAssignApplicantId(item.id); }}>{item.assignedToName ? "Reassign" : "Assign"}</button> : null}
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
                <button onClick={() => { resetNewDraftForm(); setNewDraftOpen(true); }}>New Draft</button>
              </div>
              <div className="form-grid three-col">
                <label className="full"><span>Search</span><input placeholder="Search candidate name, company, phone, email, LinkedIn..." value={candidateFilters.q} onChange={(e) => setCandidateFilters((c) => ({ ...c, q: e.target.value }))} /></label>
              </div>
              <div className="form-grid three-col">
                <label>
                  <span>View</span>
                  <select value={candidateFilters.view} onChange={(e) => setCandidateFilters((current) => ({ ...current, view: e.target.value }))}>
                    <option value="all">All captured</option>
                    <option value="added_by_me">Added by me</option>
                    <option value="assigned_to_me">Assigned to me (primary)</option>
                    <option value="reassigned_to_me">Reassigned to me</option>
                    {String(state.user?.role || "").toLowerCase() === "admin" ? <option value="reassigned_by_me">Reassigned by me</option> : null}
                  </select>
                </label>
              </div>
              <div className="metric-grid metric-grid--tight captured-metric-row">
                <div className="metric-card compact-metric"><div className="metric-label">Today</div><div className="metric-value">{capturedNotesStats.today}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Total notes captured</div><div className="metric-value">{capturedNotesStats.total}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Active</div><div className="metric-value">{capturedNotesStats.active}</div></div>
                <div className="metric-card compact-metric"><div className="metric-label">Inactive</div><div className="metric-value">{capturedNotesStats.inactive || 0}</div></div>
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
                  {String(state.user?.role || "").toLowerCase() === "admin" ? (
                    <>
                      {bulkAssignCandidateIds.length ? (
                        <button
                          onClick={() => {
                            if (!bulkAssignCandidateIds.length) return;
                            setAssignCandidateId("");
                            setBulkAssignCandidateModalOpen(true);
                          }}
                        >
                          {`Assign selected (${bulkAssignCandidateIds.length})`}
                        </button>
                      ) : null}
                    </>
                  ) : null}
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
                          <p className="muted">{[
                            item.company || "",
                            item.source ? `Source: ${item.source}` : "",
                            item.recruiter_name ? `Captured: ${item.recruiter_name}` : "",
                            item.assigned_to_name ? `Assigned: ${item.assigned_to_name}` : "",
                            item.assigned_by_name ? `Assigned by: ${item.assigned_by_name}` : "",
                            item.assigned_at ? `Assigned at: ${new Date(item.assigned_at).toLocaleString()}` : ""
                          ].filter(Boolean).join(" | ")}</p>
                          {statusState.summary ? <div className="status-line">{statusState.summary}</div> : null}
                          {statusState.note ? <div className="status-note">{statusState.note}</div> : null}
                          <div className="chip-row">
                            {String(state.user?.role || "").toLowerCase() === "admin" ? (
                              <label className="checkbox-row" style={{ marginRight: 6 }}>
                                <input
                                  type="checkbox"
                                  checked={bulkAssignCandidateIds.includes(String(item?.id || ""))}
                                  onChange={(e) => {
                                    const id = String(item?.id || "");
                                    if (!id) return;
                                    setBulkAssignCandidateIds((current) => e.target.checked
                                      ? Array.from(new Set([...current, id]))
                                      : current.filter((entry) => entry !== id));
                                  }}
                                />
                                <span>Select</span>
                              </label>
                            ) : null}
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
                        <button onClick={() => { setBulkAssignCandidateModalOpen(false); setBulkAssignCandidateIds([]); setAssignCandidateId(item.id); }}>{item.assigned_to_name ? "Reassign" : "Assign"}</button>
	                      <button onClick={() => openRecruiterNotes(item)}>Recruiter note</button>
                        <button
                          className="whatsapp-logo-btn"
                          onClick={() => openWhatsappTemplatePicker({
                            name: item.name || "",
                            jd_title: item.jd_title || item.role || "",
                            company: item.company || "",
                            company_name: state.user?.companyName || "",
                            outcome: getCapturedOutcome(item, matchedAssessment),
                            recruiter_name: item.assigned_to_name || item.recruiter_name || state.user?.name || "",
                            recruiter_notes: item.recruiter_context_notes || item.notes || "",
                            location: item.location || "",
                            phone: item.phone || item.phoneNumber || "",
                            email: item.email || "",
                            source: item.source || "",
                            client_name: item.client_name || "",
                            jd_id: item.jd_id || item.jdId || item.jobId || ""
                          }, item.phone || item.phoneNumber || "", "captured")}
                          title="Open WhatsApp"
                          aria-label="Open WhatsApp"
                        >
                          <img src="https://web.whatsapp.com/favicon.ico" alt="" />
                        </button>
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
              </div>
              <div className="status-note">Selected for client share: {selectedAssessmentIds.length}</div>
              <div className="stack-list">
                {!(Array.isArray(filteredAssessments) && filteredAssessments.length) ? <div className="empty-state">No assessments saved yet.</div> : filteredAssessments.map((item) => (
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
                          <button
                            className="whatsapp-logo-btn"
                            onClick={() => { closeAssessmentMoreMenu(); openAssessmentWhatsapp(item); }}
                            title="Open WhatsApp"
                            aria-label="Open WhatsApp"
                          >
                            <img src="https://web.whatsapp.com/favicon.ico" alt="" />
                          </button>
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
                              More
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
                              More
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

          <Route path="/quick-update" element={<Navigate to="/dashboard" replace />} />

          <Route path="/client-share" element={
            <div className="page-grid">
              <Section kicker="Client Submission" title="Direct Share with Client">
                <p className="muted">Prepare a clean email draft for the client using selected assessments only. Select profiles in the Assessments tab first, choose the client preset here, then copy this draft into your email client.</p>
                {statuses.clientShare ? <div className={`status ${statuses.clientShareKind || ""}`}>{statuses.clientShare}</div> : null}
                <div className="direct-share-sections">
                  <div className="settings-subsection direct-share-section direct-share-meta-shell">
                    <div className="section-kicker">Section 1</div>
                    <h3>Recipient and Job Details</h3>
                    <div className="form-grid two-col">
                      <label>
                        <span>Selected profiles</span>
                        <input value={`${selectedAssessmentRows.length} assessment profile(s)`} readOnly />
                      </label>
                      <label>
                        <span>Recipient email</span>
                        <input type="email" value={clientShareDraft.recipientEmail} onChange={(e) => setClientShareDraft((current) => ({ ...current, recipientEmail: e.target.value }))} placeholder="hr@client.com" />
                      </label>
                      <label>
                        <span>Email subject</span>
                        <input value={clientShareDraft.emailSubject} onChange={(e) => setClientShareDraft((current) => ({ ...current, emailSubject: e.target.value }))} placeholder={getClientShareEmailSubject()} />
                      </label>
                      <label><span>Client</span><input value={clientShareDraft.clientLabel} onChange={(e) => setClientShareDraft((current) => ({ ...current, clientLabel: e.target.value }))} placeholder="Attentive" /></label>
                      <label><span>Role / requirement</span><input value={clientShareDraft.targetRole} onChange={(e) => setClientShareDraft((current) => ({ ...current, targetRole: e.target.value }))} placeholder="AE / Account Executive" /></label>
                      <label><span>HR name</span><input value={clientShareDraft.hrName} onChange={(e) => setClientShareDraft((current) => ({ ...current, hrName: e.target.value }))} placeholder="Attentive HR Team" /></label>
                      <label><span>Recruiter name</span><input value={clientShareDraft.recruiterName} onChange={(e) => setClientShareDraft((current) => ({ ...current, recruiterName: e.target.value }))} placeholder={state.user?.name || "Ankit Garg"} /></label>
                    </div>
                  </div>

                  <div className="settings-subsection direct-share-section direct-share-body-shell">
                    <div className="section-kicker">Section 2</div>
                    <h3>Mail Body and Preset</h3>
                    <div className="form-grid two-col">
                      <label>
                        <span>Client share preset</span>
                        <select value={clientShareDraft.presetId} onChange={(e) => setClientShareDraft((current) => ({ ...current, presetId: e.target.value }))}>
                          {exportPresetOptions.map((preset) => (
                            <option key={preset.id} value={preset.id}>{preset.label}</option>
                          ))}
                        </select>
                        <span className="field-help">Admin defines these presets; recruiters can choose the right client format for this share.</span>
                      </label>
                      <label className="full">
                        <span>Selected preset columns</span>
                        <textarea value={(copySettings.customExportPresets || []).find((preset) => String(preset.id) === String(clientShareDraft.presetId))?.columns || copySettings.exportPresetColumns?.[clientShareDraft.presetId] || DEFAULT_COPY_SETTINGS.exportPresetColumns?.[clientShareDraft.presetId] || ""} readOnly />
                      </label>
                      <label className="full">
                        <span>Email intro</span>
                        <textarea value={clientShareDraft.introText || ""} onChange={(e) => setClientShareDraft((current) => ({ ...current, introText: e.target.value }))} placeholder={getClientShareIntroText()} />
                        <span className="field-help">Default intro to be set by Admin.</span>
                      </label>
                      <label className="full"><span>Extra message</span><textarea value={clientShareDraft.extraMessage} onChange={(e) => setClientShareDraft((current) => ({ ...current, extraMessage: e.target.value }))} placeholder="Optional note for the client." /></label>
                      <label className="full">
                        <span>Signature source</span>
                        <input value="Using Mail Settings signature (single source)" readOnly />
                        <span className="field-help">To update signature, go to Mail Settings. Direct Share uses the same signature automatically.</span>
                      </label>
                    </div>
                  </div>

                  <div className="settings-subsection direct-share-section direct-share-preview-shell">
                    <div className="section-kicker">Section 3</div>
                    <h3>Email Preview</h3>
                    <div className="client-share-preview" dangerouslySetInnerHTML={{ __html: buildClientShareHtml() }} />
                  </div>

                  {hasSaasUnlimitedAccess && isSettingsAdmin ? (
                    <div className="settings-subsection direct-share-section direct-share-admin-preset">
                      <div className="section-kicker">Section 4</div>
                      <h3>Admin Settings for Email Template</h3>
                      <p className="muted">Default intro and fallback signature used in Direct Share. Signature from Mail Settings remains the primary source.</p>
                      <div className="form-grid">
                        <label className="full">
                          <span>Direct share default email intro</span>
                          <textarea value={copySettings.clientShareIntroTemplate || DEFAULT_COPY_SETTINGS.clientShareIntroTemplate} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareIntroTemplate: e.target.value }))} />
                        </label>
                        <label className="full">
                          <span>Direct share default signature text (fallback)</span>
                          <textarea value={copySettings.clientShareSignatureText || DEFAULT_COPY_SETTINGS.clientShareSignatureText} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareSignatureText: e.target.value }))} />
                        </label>
                        <label><span>Signature link 1 text</span><input value={copySettings.clientShareSignatureLinkLabel || ""} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareSignatureLinkLabel: e.target.value }))} placeholder="Kompatible Minds" /></label>
                        <label><span>Signature link 1 URL</span><input value={copySettings.clientShareSignatureLinkUrl || ""} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareSignatureLinkUrl: e.target.value }))} placeholder="https://kompatibleminds.com" /></label>
                        <label><span>Signature link 2 text</span><input value={copySettings.clientShareSignatureLinkLabel2 || ""} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareSignatureLinkLabel2: e.target.value }))} placeholder="LinkedIn" /></label>
                        <label><span>Signature link 2 URL</span><input value={copySettings.clientShareSignatureLinkUrl2 || ""} onChange={(e) => setCopySettings((current) => ({ ...current, clientShareSignatureLinkUrl2: e.target.value }))} placeholder="https://www.linkedin.com/in/..." /></label>
                      </div>
                      <p className="muted">Placeholders: {`{{hr_name}} {{recruiter_name}} {{company_name}} {{client_name}} {{role}} {{role_line}}`}.</p>
                      <div className="button-row">
                        <button className="ghost-btn" onClick={() => setCopySettings(DEFAULT_COPY_SETTINGS)}>Reset defaults</button>
                        <button onClick={() => void saveSharedCopySettings()}>Save direct share preset</button>
                      </div>
                    </div>
                  ) : null}
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
                      {interviewForm.cvAnalysis.timelineConfidenceLabel ? (
                        <span className="status-note">{interviewForm.cvAnalysis.timelineConfidenceLabel}</span>
                      ) : null}
                      <span className="status-note">{getInterviewCvStoredFileLabel(interviewForm.cvAnalysis)}</span>
                      <span className="status-note">{`Stored: ${getInterviewCvStoredFilePath(interviewForm.cvAnalysis)}`}</span>
                      {interviewMeta.candidateId ? <button className="ghost-btn" onClick={() => openInterviewStoredCv()}>Open uploaded CV</button> : null}
                      {interviewMeta.candidateId ? <button className="ghost-btn" onClick={() => void removeInterviewStoredCv()}>Remove uploaded CV</button> : null}
                    </div>
                  ) : null}
                  {interviewForm.cvAnalysis ? (
                    <div className="empty-state compact-empty">
                      <div className="empty-state__title">CV metadata saved</div>
                      {interviewForm.cvAnalysis.timelineConfidenceLabel ? (
                        <div className="muted" style={{ marginTop: 6 }}>{interviewForm.cvAnalysis.timelineConfidenceLabel}</div>
                      ) : null}
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
                <p className="muted">Configure email delivery for JD sharing. You can use either SMTP credentials or API mode (per recruiter).</p>
                <div className="settings-subsection mail-settings-shell jd-shell-create">
                  <div className="section-kicker">Mail Share Settings (SMTP / API)</div>
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
                    <button className="secondary" disabled={smtpTestBusy} onClick={() => void testSmtpSettings(false)}>
                      {smtpTestBusy ? "Testing..." : "Test SMTP settings"}
                    </button>
                    <button className="secondary" disabled={smtpTestBusy} onClick={() => void testSmtpSettings(true)}>
                      {smtpTestBusy ? "Testing..." : "Send test mail to self"}
                    </button>
                    <button className="secondary" disabled={zohoConnectBusy} onClick={() => void connectZohoMailbox()}>
                      {zohoConnectBusy ? "Connecting..." : "Connect Zoho (1-click)"}
                    </button>
                  </div>
                </div>
                <div className="settings-subsection mail-settings-notes">
                  <div className="section-kicker">Mail Share Notes</div>
                  <p className="muted"><strong>Supported modes:</strong> SMTP mode (<code>smtppro.zoho.com</code>, <code>smtp.gmail.com</code>, <code>smtp.office365.com</code>) or API mode via host keys.</p>
                  <p className="muted"><strong>API mode host keys:</strong> <code>zohoapi.com</code>, <code>sendgridapi</code>, <code>postmarkapi</code>.</p>
                  <p className="muted"><strong>Zoho:</strong> click <strong>Connect Zoho (1-click)</strong>. No manual code/token copy required.</p>
                  <p className="muted"><strong>Password meaning:</strong> SMTP = mailbox/app password. API = provider credential (Zoho refresh token / SendGrid key / Postmark token).</p>
                  <p className="muted"><strong>Connection:</strong> {String(smtpSettings.host || "").toLowerCase().startsWith("zohoapi") && smtpSettings.hasPassword ? "Zoho connected" : "Not connected"} for current recruiter account.</p>
                  <p className="muted"><strong>Hosting note:</strong> SMTP mode may need paid hosting/network egress; API mode often avoids SMTP port blockers.</p>
                </div>

                <div className="settings-subsection mail-signature-shell" style={{ marginTop: 18 }}>
                  <div className="section-kicker">Your Email Signature (per recruiter)</div>
                  <p className="muted">Used in JD emails and Direct Share by default. Tip: to make only part of link text clickable, write it as <code>LinkedIn || 7027xxxxxxx</code> (only "LinkedIn" becomes the hyperlink).</p>
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
                  <div className="button-row">
                    <button className="secondary" onClick={() => void saveSignatureOnly()}>Save signature only</button>
                  </div>
                </div>

                {isSettingsAdmin ? (
                  <div className="settings-subsection mail-template-shell" style={{ marginTop: 18 }}>
                    <div className="section-kicker">JD Email Template (Admin)</div>
                    <p className="muted">Default subject/body in the "Email JD" modal. Placeholders: {`{Candidate} {Recruiter} {Role}`}</p>
                    <div className="form-grid">
                      <label className="full">
                        <span>Subject template</span>
                        <input
                          value={copySettings.jdEmailSubjectTemplate || DEFAULT_COPY_SETTINGS.jdEmailSubjectTemplate}
                          onChange={(e) => setCopySettings((current) => ({ ...current, jdEmailSubjectTemplate: e.target.value }))}
                          placeholder="Job Description - {Role}"
                        />
                      </label>
                      <label className="full">
                        <span>Body template</span>
                        <textarea
                          value={copySettings.jdEmailIntroTemplate || DEFAULT_COPY_SETTINGS.jdEmailIntroTemplate}
                          onChange={(e) => setCopySettings((current) => ({ ...current, jdEmailIntroTemplate: e.target.value }))}
                          rows={8}
                        />
                      </label>
                    </div>
                    <div className="button-row">
                      <button onClick={() => void saveSharedCopySettings()}>Save JD email template</button>
                    </div>
                  </div>
                ) : null}
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
                    <select value={jobListLane} onChange={(e) => setJobListLane(e.target.value)}>
                      <option value="active">Active JDs</option>
                      <option value="archived">Archived JDs</option>
                    </select>
                  </label>
                  <label>
                    <span>Select JD</span>
                    <select value={selectedJobId} onChange={(e) => loadJobIntoDraft(e.target.value)}>
                      <option value="">Select JD</option>
                      {jobsCatalog
                        .filter((job) => (jobListLane === "archived" ? Boolean(job?.isArchived) : !Boolean(job?.isArchived)))
                        .map((job) => {
                          const ttfDays = getTimeToFillDays(job);
                          const ttfLabel = jobListLane === "archived" && ttfDays !== null ? ` | TTF: ${ttfDays} day${ttfDays === 1 ? "" : "s"}` : "";
                          return <option key={job.id} value={job.id}>{`${job.title || "Untitled JD"}${ttfLabel}`}</option>;
                        })}
                    </select>
                    {jobListLane === "archived" && selectedJobId ? (
                      <small className="muted">
                        {(() => {
                          const selectedJob = (jobsCatalog || []).find((job) => String(job?.id || "") === String(selectedJobId || ""));
                          if (!selectedJob) return "Time to fill not available.";
                          const ttfDays = getTimeToFillDays(selectedJob);
                          const closeReason = String(selectedJob?.closeReason || "").trim();
                          const closeDate = String(selectedJob?.closedAt || selectedJob?.archivedAt || "").trim();
                          if (ttfDays === null) return "Time to fill not available for this closed job.";
                          return `Time to fill: ${ttfDays} day${ttfDays === 1 ? "" : "s"}${closeReason ? ` | Reason: ${closeReason}` : ""}${closeDate ? ` | Closed: ${new Date(closeDate).toLocaleDateString()}` : ""}`;
                        })()}
                      </small>
                    ) : null}
                  </label>
                </div>
              </Section>

              <Section kicker="JD Setup" title="JD Workspace">
                  {jobDraftReadOnly ? <div className="status">View only: only Admin or Primary Owner can edit this JD.</div> : null}
                <div className="settings-subsection mail-settings-shell">
                  <div className="section-kicker">Create Job</div>
                  <div className="button-row">
                    <label className="file-btn">
                      Upload JD
                      <input disabled={jobDraftReadOnly || jobActionBusy} type="file" accept=".txt,.md,.doc,.docx,.pdf" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleJdUpload(file); }} />
                    </label>
                    <button className="ghost-btn" onClick={() => resetJobDraftBlank()}>New blank JD</button>
                    <button disabled={jobActionBusy || jobDraftReadOnly} onClick={() => generateJdFromText()}>Generate JD from text</button>
                  </div>
                </div>

                <div className="settings-subsection mail-signature-shell jd-shell-actions">
                  <div className="section-kicker">Job Actions (Selected Existing JD)</div>
                  <div className="button-row">
                    <button disabled={jobActionBusy} className="ghost-btn" onClick={() => downloadJobDraftWord()}>Download Word</button>
                    <button disabled={jobActionBusy} className="ghost-btn" onClick={() => void copyJobFormatForShare("linkedin")}>Generate LinkedIn format</button>
                    <button disabled={jobActionBusy} className="ghost-btn" onClick={() => void copyJobFormatForShare("whatsapp")}>Generate WhatsApp format</button>
                    <button disabled={jobActionBusy || jobDraftReadOnly} onClick={() => void saveJobDraft()}>{jobActionBusy ? "Saving..." : (selectedJobId ? "Update JD" : "Save JD")}</button>
                    <button
                      className="ghost-btn"
                      disabled={jobActionBusy || !String(jobDraft.title || "").trim() || !String(jobDraft.jobDescription || "").trim() || jobDraftReadOnly}
                      onClick={() => void saveJobDraftAsNew()}
                      title="Duplicate current JD as a new saved record"
                    >
                      {jobActionBusy ? "Saving..." : "Save as new JD"}
                    </button>
                    {isSettingsAdmin || String(jobDraft.ownerRecruiterId || "") === String(state.user?.id || "") ? (
                      <button
                        className="ghost-btn"
                        disabled={jobActionBusy || !selectedJobId}
                        onClick={() => void deleteSelectedJobDraft()}
                      >
                        Delete JD
                      </button>
                    ) : null}
                    {isSettingsAdmin || String(jobDraft.ownerRecruiterId || "") === String(state.user?.id || "") ? (
                      jobDraft.isArchived ? (
                        <button
                          className="ghost-btn"
                          disabled={jobActionBusy || !selectedJobId}
                          onClick={() => void setSelectedJobArchiveState(false)}
                        >
                          Reactivate JD
                        </button>
                      ) : (
                        <>
                          <select
                            disabled={jobActionBusy || !selectedJobId || jobDraftReadOnly}
                            value={String(jobDraft.closeReason || JOB_CLOSE_REASONS[0])}
                            onChange={(e) => setJobDraft((c) => ({ ...c, closeReason: e.target.value }))}
                          >
                            {JOB_CLOSE_REASONS.map((reason) => (
                              <option key={reason} value={reason}>{reason}</option>
                            ))}
                          </select>
                          <button
                            className="ghost-btn"
                            disabled={jobActionBusy || !selectedJobId || jobDraftReadOnly}
                            onClick={() => void setSelectedJobArchiveState(true)}
                          >
                            Close Job
                          </button>
                        </>
                      )
                    ) : null}
                  </div>
                </div>

                <div className="settings-subsection mail-settings-notes jd-shell-basic">
                  <div className="section-kicker">Basic Job Setup</div>
                  <div className="form-grid two-col">
                  <label><span>Job title</span><input disabled={jobDraftReadOnly || jobActionBusy} value={jobDraft.title} onChange={(e) => setJobDraft((c) => ({ ...c, title: e.target.value }))} /></label>
                  <label><span>Client</span><input disabled={jobDraftReadOnly || jobActionBusy} value={jobDraft.clientName} onChange={(e) => setJobDraft((c) => ({ ...c, clientName: e.target.value }))} /></label>
                  <label><span>Location</span><input disabled={jobDraftReadOnly || jobActionBusy} value={jobDraft.location} onChange={(e) => setJobDraft((c) => ({ ...c, location: e.target.value }))} placeholder="Mumbai / Bengaluru / Remote" /></label>
                  <label><span>Work mode</span><select disabled={jobDraftReadOnly || jobActionBusy} value={jobDraft.workMode} onChange={(e) => setJobDraft((c) => ({ ...c, workMode: e.target.value }))}><option value="">Not specified</option><option value="Remote">Remote</option><option value="Hybrid">Hybrid</option><option value="Work from office">Work from office</option></select></label>
                  {isSettingsAdmin && hasSaasUnlimitedAccess && !jobDraftReadOnly ? (
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
                  </div>
                </div>

                <div className="settings-subsection mail-template-shell">
                  <div className="section-kicker">Job Content</div>
                  <div className="form-grid two-col">
                  {hasSaasUnlimitedAccess ? (
                    <>
                      <label className="full"><span>About company</span><textarea disabled={jobDraftReadOnly || jobActionBusy} value={jobDraft.aboutCompany} onChange={(e) => setJobDraft((c) => ({ ...c, aboutCompany: e.target.value }))} placeholder="Short company context shown on hosted apply link." /></label>
                      <label className="full">
                        <span>Public company line (anonymous apply link)</span>
                        <textarea
                          disabled={jobDraftReadOnly || jobActionBusy}
                          value={jobDraft.publicCompanyLine || ""}
                          onChange={(e) => setJobDraft((c) => ({ ...c, publicCompanyLine: e.target.value }))}
                          placeholder="Shown on /apply-public. Example: Leading company with all-in-one CRM stack for connected customer experience."
                        />
                      </label>
                      <label className="full">
                        <span>Public posting title (optional)</span>
                        <input
                          disabled={jobDraftReadOnly || jobActionBusy}
                          value={jobDraft.publicTitle || ""}
                          onChange={(e) => setJobDraft((c) => ({ ...c, publicTitle: e.target.value }))}
                          placeholder="If blank, public link will use JD title with client name redacted."
                        />
                      </label>
                    </>
                  ) : null}
                  <label className="full"><span>Job description</span><textarea disabled={jobDraftReadOnly || jobActionBusy} className="jd-editor" value={jobDraft.jobDescription} onChange={(e) => setJobDraft((c) => ({ ...c, jobDescription: e.target.value }))} placeholder="Paste the full JD here. Hosted apply link will show this as one clean block." /></label>
                  <label className="full"><span>Must-have skills</span><textarea disabled={jobDraftReadOnly || jobActionBusy} value={jobDraft.mustHaveSkills} onChange={(e) => setJobDraft((c) => ({ ...c, mustHaveSkills: e.target.value }))} placeholder="Shown on hosted apply link only when filled." /></label>
                  <label className="full"><span>Red flags</span><textarea disabled={jobDraftReadOnly || jobActionBusy} value={jobDraft.redFlags} onChange={(e) => setJobDraft((c) => ({ ...c, redFlags: e.target.value }))} /></label>
                  <label className="full"><span>Standard screening questions</span><textarea disabled={jobDraftReadOnly || jobActionBusy} value={jobDraft.standardQuestions} onChange={(e) => setJobDraft((c) => ({ ...c, standardQuestions: e.target.value }))} placeholder="Recruiter-only. These are used in Interview Panel and will not show on hosted apply link." /></label>
                </div>
                </div>

                <div className="settings-subsection direct-share-admin-preset shortcut-builder">
                  <div className="shortcut-builder__head">
                    <div>
                      <div className="info-label">JD shortcuts</div>
                      <div className="muted">These save per recruiter for this JD (so one recruiter's shortcuts don't overwrite others). Extension templates use the same shortcuts.</div>
                    </div>
                  </div>
                  <div className="form-grid two-col shortcut-builder__form">
                    <label className="shortcut-builder__key-field">
                      <span>Shortcut key</span>
                      <input placeholder="/intro" value={jobShortcutKey} onChange={(e) => setJobShortcutKey(e.target.value)} />
                    </label>
                    <label>
                      <span>Shortcut text / template</span>
                      <textarea ref={jdWorkspaceShortcutTextareaRef} value={jobShortcutValue} onChange={(e) => setJobShortcutValue(e.target.value)} />
                      <span className="field-help">Click placeholders to insert:</span>
                      <div className="placeholder-selector">
                        {SHORTCUT_TEMPLATE_PLACEHOLDERS.map((token) => (
                          <button
                            key={`job-workspace-${token}`}
                            type="button"
                            className="ghost-btn placeholder-chip"
                            onClick={() => insertPlaceholderAtCursor(jdWorkspaceShortcutTextareaRef, jobShortcutValue, setJobShortcutValue, token)}
                          >
                            {token}
                          </button>
                        ))}
                      </div>
                    </label>
                  </div>
                  <div className="button-row">
                    <button
                      disabled={!String(selectedJobId || jobDraft.id || "").trim()}
                      title={!String(selectedJobId || jobDraft.id || "").trim() ? "Select an existing JD first" : ""}
                      onClick={() => saveShortcutDraft()}
                    >
                      {jobShortcutKey ? "Update shortcut" : "Add shortcut"}
                    </button>
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

            <Route path="/shortcuts" element={
              <div className="page-grid">
                <Section kicker="Templates" title="Shortcut Templates">
                  <p className="muted">Create shortcuts once and sync across portal + extension for WhatsApp, LinkedIn, and email copy workflows.</p>
                  {statuses.shortcuts ? <div className={`status ${statuses.shortcutsKind || ""}`}>{statuses.shortcuts}</div> : null}
                </Section>

                <Section kicker="Personal" title="Personal Shortcuts (All Jobs)" className="shortcuts-section shortcuts-section--personal">
                  <div className="form-grid two-col">
                    <label>
                      <span>Shortcut key</span>
                      <input value={shortcutPersonalKey} onChange={(e) => setShortcutPersonalKey(e.target.value)} placeholder="/followup_1" />
                    </label>
                    <label className="full">
                      <span>Template text</span>
                      <textarea ref={personalTemplateTextareaRef} value={shortcutPersonalValue} onChange={(e) => setShortcutPersonalValue(e.target.value)} rows={4} />
                      <span className="field-help">Click placeholders to insert:</span>
                      <div className="placeholder-selector">
                        {SHORTCUT_TEMPLATE_PLACEHOLDERS.map((token) => (
                          <button key={`personal-${token}`} type="button" className="ghost-btn placeholder-chip" onClick={() => insertPlaceholderAtCursor(personalTemplateTextareaRef, shortcutPersonalValue, setShortcutPersonalValue, token)}>{token}</button>
                        ))}
                      </div>
                    </label>
                  </div>
                  <div className="button-row">
                    <button onClick={() => void savePersonalShortcutTemplate()}>{normalizeShortcutKey(shortcutPersonalKey) ? "Save personal shortcut" : "Add personal shortcut"}</button>
                  </div>
                  <div className="stack-list compact">
                    {Object.entries(personalShortcuts || {}).length ? (
                      Object.entries(personalShortcuts || {})
                        .sort(([a], [b]) => String(a || "").localeCompare(String(b || "")))
                        .map(([key, value]) => (
                          <article className="item-card compact-card" key={`personal-${key}`}>
                            <div className="item-card__top compact-top">
                              <strong>{formatShortcutLabel(key)}</strong>
                              <div className="button-row tight">
                                <button className="ghost-btn" onClick={() => { setShortcutPersonalKey(String(key || "")); setShortcutPersonalValue(String(value || "")); }}>Edit</button>
                                <button className="ghost-btn" onClick={() => void copyShortcutTemplateWithValues(String(key || ""), String(value || ""), selectedShortcutJob)}>Copy</button>
                                <button className="ghost-btn" onClick={() => void deletePersonalShortcutTemplate(String(key || ""))}>Delete</button>
                              </div>
                            </div>
                            <div className="candidate-snippet no-top-border">{String(value || "")}</div>
                          </article>
                        ))
                    ) : <div className="empty-state">No personal shortcuts yet.</div>}
                  </div>
                </Section>

                <Section kicker="Job" title="Job-Specific Shortcuts" className="shortcuts-section shortcuts-section--job">
                  <div className="form-grid two-col">
                    <label>
                      <span>Select JD</span>
                      <select value={shortcutJobId} onChange={(e) => setShortcutJobId(e.target.value)}>
                        <option value="">Select JD / role</option>
                        {shortcutJobOptions.map((job) => <option key={job.id} value={job.id}>{job.title}{job.clientName ? ` (${job.clientName})` : ""}</option>)}
                      </select>
                    </label>
                    <label className="shortcuts-key-field">
                      <span>Shortcut key</span>
                      <input value={shortcutJobKey} onChange={(e) => setShortcutJobKey(e.target.value)} placeholder="/interview" />
                    </label>
                    <label className="full">
                      <span>Template text</span>
                      <textarea ref={jobTemplateTextareaRef} value={shortcutJobValue} onChange={(e) => setShortcutJobValue(e.target.value)} rows={4} />
                      <span className="field-help">Click placeholders to insert:</span>
                      <div className="placeholder-selector">
                        {SHORTCUT_TEMPLATE_PLACEHOLDERS.map((token) => (
                          <button key={`job-${token}`} type="button" className="ghost-btn placeholder-chip" onClick={() => insertPlaceholderAtCursor(jobTemplateTextareaRef, shortcutJobValue, setShortcutJobValue, token)}>{token}</button>
                        ))}
                      </div>
                    </label>
                  </div>
                  <div className="button-row">
                    <button onClick={() => void saveJobShortcutTemplate()}>{normalizeShortcutKey(shortcutJobKey) ? "Save job shortcut" : "Add job shortcut"}</button>
                  </div>
                  <div className="stack-list compact">
                    {Object.entries(selectedShortcutJobMap || {}).length ? (
                      Object.entries(selectedShortcutJobMap || {})
                        .sort(([a], [b]) => String(a || "").localeCompare(String(b || "")))
                        .map(([key, value]) => (
                          <article className="item-card compact-card" key={`job-${selectedShortcutJob?.id || "none"}-${key}`}>
                            <div className="item-card__top compact-top">
                              <strong>{formatShortcutLabel(key)}</strong>
                              <div className="button-row tight">
                                <button className="ghost-btn" onClick={() => { setShortcutJobKey(String(key || "")); setShortcutJobValue(String(value || "")); }}>Edit</button>
                                <button className="ghost-btn" onClick={() => void copyShortcutTemplateWithValues(String(key || ""), String(value || ""), selectedShortcutJob)}>Copy</button>
                                <button className="ghost-btn" onClick={() => void deleteJobShortcutTemplate(String(key || ""))}>Delete</button>
                              </div>
                            </div>
                            <div className="candidate-snippet no-top-border">{String(value || "")}</div>
                          </article>
                        ))
                    ) : <div className="empty-state">{shortcutJobId ? "No job-specific shortcuts yet." : "Select JD to view shortcuts."}</div>}
                  </div>
                </Section>

                <Section kicker="Company" title="Company Shortcuts" className="shortcuts-section shortcuts-section--company">
                  {!isSettingsAdmin ? <p className="muted">Read-only for recruiters. Admin-defined company shortcuts appear automatically in your template pickers.</p> : null}
                  {isSettingsAdmin ? (
                    <>
                      <div className="form-grid two-col">
                        <label>
                          <span>Shortcut key</span>
                          <input value={shortcutCompanyKey} onChange={(e) => setShortcutCompanyKey(e.target.value)} placeholder="/nr" />
                        </label>
                        <label className="full">
                          <span>Template text</span>
                          <textarea ref={companyTemplateTextareaRef} value={shortcutCompanyValue} onChange={(e) => setShortcutCompanyValue(e.target.value)} rows={4} />
                          <span className="field-help">Click placeholders to insert:</span>
                          <div className="placeholder-selector">
                            {SHORTCUT_TEMPLATE_PLACEHOLDERS.map((token) => (
                              <button key={`company-${token}`} type="button" className="ghost-btn placeholder-chip" onClick={() => insertPlaceholderAtCursor(companyTemplateTextareaRef, shortcutCompanyValue, setShortcutCompanyValue, token)}>{token}</button>
                            ))}
                          </div>
                        </label>
                      </div>
                      <div className="button-row">
                        <button onClick={() => void saveCompanyShortcutTemplate()}>{normalizeShortcutKey(shortcutCompanyKey) ? "Save company shortcut" : "Add company shortcut"}</button>
                      </div>
                    </>
                  ) : null}
                  <div className="stack-list compact">
                    {Object.entries((copySettings?.companyWideShortcuts && typeof copySettings.companyWideShortcuts === "object") ? copySettings.companyWideShortcuts : {}).length ? (
                      Object.entries(copySettings.companyWideShortcuts)
                        .sort(([a], [b]) => String(a || "").localeCompare(String(b || "")))
                        .map(([key, value]) => (
                          <article className="item-card compact-card" key={`company-${key}`}>
                            <div className="item-card__top compact-top">
                              <strong>{formatShortcutLabel(key)}</strong>
                              {isSettingsAdmin ? (
                                <div className="button-row tight">
                                  <button className="ghost-btn" onClick={() => { setShortcutCompanyKey(String(key || "")); setShortcutCompanyValue(String(value || "")); }}>Edit</button>
                                  <button className="ghost-btn" onClick={() => void copyShortcutTemplateWithValues(String(key || ""), String(value || ""), selectedShortcutJob)}>Copy</button>
                                  <button className="ghost-btn" onClick={() => void deleteCompanyShortcutTemplate(String(key || ""))}>Delete</button>
                                </div>
                              ) : (
                                <div className="button-row tight">
                                  <button className="ghost-btn" onClick={() => void copyShortcutTemplateWithValues(String(key || ""), String(value || ""), selectedShortcutJob)}>Copy</button>
                                </div>
                              )}
                            </div>
                            <div className="candidate-snippet no-top-border">{String(value || "")}</div>
                          </article>
                        ))
                    ) : <div className="empty-state">No company shortcuts yet.</div>}
                  </div>
                </Section>
              </div>
            } />

            <Route path="/settings" element={
              <div className="page-grid">
                <Section kicker="Copy Presets" title="Preset Settings">
                  <p className="muted">Set shared candidate tracker presets and direct-share email defaults. Admin saves them once; recruiters can choose the preset while copying or sharing.</p>
                  {!hasSaasUnlimitedAccess ? <p className="muted">Current plan mode: preset edit only. New preset creation and advanced preset controls unlock on SaaS Unlimited (Rs 4999).</p> : null}
                  {!isSettingsAdmin ? <p className="muted">You can use shared presets here. Only admin can create, edit, or save shared preset settings.</p> : null}
                  {statuses.settings ? <div className={`status ${statuses.settingsKind || ""}`}>{statuses.settings}</div> : null}
                  {/* Email Settings moved to Mail Settings tab (visible to all recruiters). */}
                  <div className="settings-subsection preset-edit-shell">
                    <div className="section-kicker">Edit Existing Presets</div>
                    <p className="muted">Edit any existing candidate tracker preset, attach it to a specific client if needed, and save shared usage defaults.</p>
                    <div className="form-grid">
                      <label>
                        <span>Select preset to edit</span>
                        <select value={copySettings.excelPreset} onChange={(e) => setCopySettings((current) => ({ ...current, excelPreset: e.target.value }))}>
                          <option value="compact_recruiter">{copySettings.exportPresetLabels?.compact_recruiter || "Compact recruiter"}</option>
                          <option value="client_tracker">{copySettings.exportPresetLabels?.client_tracker || "Client tracker"}</option>
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
                  {hasSaasUnlimitedAccess ? <div className="settings-subsection preset-create-shell">
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
                  </div> : null}
                </Section>
              </div>
            } />

            <Route path="/plan" element={
              <div className="page-grid">
                <Section kicker="Billing" title="Current Plan and Pricing">
                  <p className="muted">Track current plan, trial balance, and upgrade only to higher plans.</p>
                  {statuses.loginSettings ? <div className={`status ${statuses.loginSettingsKind || ""}`}>{statuses.loginSettings}</div> : null}
                </Section>
                {!isSettingsAdmin ? (
                  <Section kicker="Access" title="Restricted">
                    <p className="muted">Plan and billing details are visible to admin users only.</p>
                  </Section>
                ) : (
                  <>
                    <div className="stack-list compact">
                      <article className="item-card compact-card">
                        <div className="item-card__top">
                          <div>
                            <h3>{String(billingOverview?.currentPlan?.label || "Current plan").trim()}</h3>
                            <p className="muted">
                              {`Status: ${String(billingOverview?.billing?.status || companyLicense?.status || "unknown").trim()} | `}
                              {`Valid till: ${billingOverview?.billing?.subscriptionEndsAt ? new Date(billingOverview.billing.subscriptionEndsAt).toLocaleDateString() : "N/A"} | `}
                              {`Full access bypass: ${billingOverview?.fullAccessBypass ? "Enabled" : "No"}`}
                            </p>
                            {currentPlanCode === "trial" ? (
                              <p className="muted">
                                {`Trial balance: ${trialDaysLeft == null ? "-" : `${trialDaysLeft} day(s) left`} | ${trialCapturesLeft == null ? "-" : `${trialCapturesLeft} capture(s) left`}`}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </article>
                    </div>
                    <Section kicker="Other Modules" title="Client, Employee, and Payroll">
                      {hasSuiteModulesAccess ? (
                        <div className="button-row">
                          <button onClick={() => window.open("/client-login", "_blank", "noopener,noreferrer")}>Open Client Portal</button>
                          <button onClick={() => window.open("/employee-login", "_blank", "noopener,noreferrer")}>Open Employee Portal</button>
                          <button onClick={() => window.open("/payroll-login", "_blank", "noopener,noreferrer")}>Open Payroll Portal</button>
                        </div>
                      ) : (
                        <div className="empty-state compact-empty">
                          Upgrade to Full Recruiter + Other Modules to unlock Client, Employee, and Payroll portals.
                        </div>
                      )}
                    </Section>
                    <Section kicker="Billing Details" title="Current Billing Snapshot">
                      <div className="table-wrap">
                        <table className="dashboard-table">
                          <tbody>
                            <tr>
                              <th>Plan code</th>
                              <td>{String(currentPlanCode || "-").trim() || "-"}</td>
                            </tr>
                            <tr>
                              <th>Billing status</th>
                              <td>{String(billingOverview?.billing?.status || effectiveLicense?.status || "-").trim() || "-"}</td>
                            </tr>
                            <tr>
                              <th>Subscription start</th>
                              <td>{effectiveLicense?.subscriptionStartedAt ? new Date(effectiveLicense.subscriptionStartedAt).toLocaleString() : "-"}</td>
                            </tr>
                            <tr>
                              <th>Subscription end</th>
                              <td>{effectiveLicense?.subscriptionEndsAt ? new Date(effectiveLicense.subscriptionEndsAt).toLocaleString() : "-"}</td>
                            </tr>
                            <tr>
                              <th>Last license update</th>
                              <td>{effectiveLicense?.updatedAt ? new Date(effectiveLicense.updatedAt).toLocaleString() : "-"}</td>
                            </tr>
                            {currentPlanCode === "trial" ? (
                              <tr>
                                <th>Capture usage</th>
                                <td>
                                  {effectiveLicense?.captureLimit == null
                                    ? "-"
                                    : `${Number(effectiveLicense?.capturesUsed || 0)} / ${Number(effectiveLicense?.captureLimit || 0)} used`}
                                </td>
                              </tr>
                            ) : null}
                            <tr>
                              <th>Access state</th>
                              <td>{accessStateLabel}</td>
                            </tr>
                            <tr>
                              <th>Payment reference</th>
                              <td>{String(effectiveLicense?.lastPaymentId || "-").trim() || "-"}</td>
                            </tr>
                            <tr>
                              <th>Payment order id</th>
                              <td>{String(effectiveLicense?.lastPaymentOrderId || "-").trim() || "-"}</td>
                            </tr>
                            <tr>
                              <th>Last paid at</th>
                              <td>{effectiveLicense?.lastPaidAt ? new Date(effectiveLicense.lastPaidAt).toLocaleString() : "-"}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </Section>
                    <Section kicker="Pricing Matrix" title="Seat-wise Plan Grid">
                      <div className="table-wrap plan-matrix-wrap">
                        <table className="dashboard-table plan-matrix-table">
                          <thead>
                            <tr>
                              <th>Seats</th>
                              <th>Basic</th>
                              <th>Full Recruiter</th>
                              <th>Full + Modules</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { seat: "1 seat", basic: "s1_basic_499", full: "s1_full_999", suite: "s1_suite_1499" },
                              { seat: "3 seats", basic: "s3_basic_999", full: "s3_full_1999", suite: "s3_suite_2999" },
                              { seat: "7 seats", basic: "s7_basic_1999", full: "s7_full_3999", suite: "s7_suite_5999" },
                              { seat: "7-15 seats", basic: "s15_basic_2999", full: "s15_full_4999", suite: "s15_suite_6999" }
                            ].map((row) => {
                              const renderPlanCell = (planCode) => {
                                const plan = (billingPlans || []).find((item) => String(item?.code || "").trim().toLowerCase() === planCode) || null;
                                if (!plan) return <td>-</td>;
                                const code = String(plan.code || "").trim().toLowerCase();
                                const rank = Number(planRank[code] ?? 0);
                                const isCurrent = code === currentPlanCode;
                                const canUpgrade = rank > currentRank;
                                return (
                                  <td key={planCode}>
                                    <div className="plan-matrix-price">{`Rs ${Number(plan.amountInr || 0)}`}</div>
                                    {isCurrent ? (
                                      <span className="plan-matrix-badge">Current</span>
                                    ) : canUpgrade ? (
                                      <button
                                        className="plan-matrix-upgrade-btn"
                                        onClick={() => void openPlanUpgrade(plan.code)}
                                        disabled={planUpgradeBusyCode === plan.code}
                                      >
                                        {planUpgradeBusyCode === plan.code ? "Opening..." : "Upgrade"}
                                      </button>
                                    ) : (
                                      <span className="plan-matrix-muted">Not available</span>
                                    )}
                                  </td>
                                );
                              };
                              return (
                                <tr key={row.seat}>
                                  <th>{row.seat}</th>
                                  {renderPlanCell(row.basic)}
                                  {renderPlanCell(row.full)}
                                  {renderPlanCell(row.suite)}
                                </tr>
                              );
                            })}
                            <tr>
                              <th>15+ seats</th>
                              <td colSpan="3">Contact Sales (Custom Enterprise)</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className="muted">Plan 3 unlocks Client, Employee, and Payroll modules.</p>
                    </Section>
                    {!upgradePlans.length ? <div className="empty-state compact-empty">No higher plan available. You are already on highest access.</div> : null}
                  </>
                )}
              </div>
            } />

            <Route path="/login-settings" element={
              <div className="page-grid">
                <Section kicker="Admin Access" title="Login Settings">
                  <p className="muted">Manage company workspace users and client portal access from one place.</p>
                  {!hasSaasUnlimitedAccess ? <p className="muted">Current plan mode: Add Recruitment Team only.</p> : null}
                  {statuses.loginSettings ? <div className={`status ${statuses.loginSettingsKind || ""}`}>{statuses.loginSettings}</div> : null}
                  <div className="login-settings-switch">
                    {loginSettingsOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={loginSettingsPanel === option.id ? "" : "ghost-btn"}
                        onClick={() => setLoginSettingsPanel(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Section>

                {loginSettingsPanel === "company" && canAddCompany ? (
                <details className="panel login-settings-collapse" open ref={loginSettingsSectionRef}>
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
                ) : null}

                {loginSettingsPanel === "team" ? (
                <details className="panel login-settings-collapse" open ref={loginSettingsSectionRef}>
                  <summary className="dashboard-group__summary">
                    <div>
                      <div className="section-kicker">Team Access</div>
                      <h2>Add Recruitment Team</h2>
                    </div>
                  </summary>
                  <p className="muted">Create admins and recruiters for this company workspace. Payroll users are managed in the separate Payroll Access section below.</p>
                  <div className="form-grid two-col">
                    <label><span>Member name</span><input disabled={!isSettingsAdmin} value={teamUserDraft.name} onChange={(e) => setTeamUserDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Ankit Garg" /></label>
                    <label><span>Member email</span><input disabled={!isSettingsAdmin} type="email" value={teamUserDraft.email} onChange={(e) => setTeamUserDraft((current) => ({ ...current, email: e.target.value }))} placeholder="member@company.com" /></label>
                    <label><span>Member role</span><select disabled={!isSettingsAdmin} value={teamUserDraft.role} onChange={(e) => setTeamUserDraft((current) => ({ ...current, role: e.target.value }))}><option value="recruiter">Recruiter</option><option value="admin">Admin</option></select></label>
                    <label><span>Temporary password</span><input disabled={!isSettingsAdmin} type="password" value={teamUserDraft.password} onChange={(e) => setTeamUserDraft((current) => ({ ...current, password: e.target.value }))} placeholder="Temporary password" /></label>
                  </div>
                  {isSettingsAdmin ? <div className="button-row"><button onClick={() => void createTeamUser()}>Add recruitment team</button></div> : null}
                  {statuses.loginTeam ? <div className={`status ${statuses.loginTeamKind || ""}`}>{statuses.loginTeam}</div> : null}
                  <div className="stack-list compact">
                    {(recruiterWorkspaceUsers || []).map((item) => (
                      <article className="item-card compact-card" key={item.id}>
                        <div className="item-card__top">
                          <div>
                            <h3>{item.name}</h3>
                            <p className="muted">{`${item.email} | ${formatWorkspaceUserRoleLabel(item.role)}`}</p>
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
                ) : null}

                {loginSettingsPanel === "client" && canViewClientPayrollInLoginSettings ? (
                <details className="panel login-settings-collapse" open ref={loginSettingsSectionRef}>
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
                ) : null}

                {loginSettingsPanel === "payroll" && canViewClientPayrollInLoginSettings ? (
                <details className="panel login-settings-collapse" open ref={loginSettingsSectionRef}>
                  <summary className="dashboard-group__summary">
                    <div>
                      <div className="section-kicker">Payroll Access</div>
                      <h2>Add Payroll</h2>
                    </div>
                  </summary>
                  <p className="muted">Payroll users login from `/payroll-login`. Payroll Owner can manage payroll access; Payroll Manager can operate payroll based on assigned permissions.</p>
                  <div className="form-grid two-col">
                    <label><span>Name</span><input disabled={!isLicenseOwnerAdmin} value={payrollUserDraft.name} onChange={(e) => setPayrollUserDraft((current) => ({ ...current, name: e.target.value }))} placeholder="Payroll user name" /></label>
                    <label><span>Email</span><input disabled={!isLicenseOwnerAdmin} type="email" value={payrollUserDraft.email} onChange={(e) => setPayrollUserDraft((current) => ({ ...current, email: e.target.value }))} placeholder="payroll@company.com" /></label>
                    <label><span>Role</span><select disabled={!isLicenseOwnerAdmin} value={payrollUserDraft.role} onChange={(e) => setPayrollUserDraft((current) => ({ ...current, role: e.target.value }))}><option value="payroll_owner">Payroll Owner</option><option value="payroll_manager">Payroll Manager</option></select></label>
                    <label><span>Temporary password</span><input disabled={!isLicenseOwnerAdmin} type="password" value={payrollUserDraft.password} onChange={(e) => setPayrollUserDraft((current) => ({ ...current, password: e.target.value }))} placeholder="Temporary password" /></label>
                  </div>
                  {isLicenseOwnerAdmin ? <div className="button-row"><button onClick={() => void createPayrollUser()}>Add payroll</button></div> : null}
                  {!isLicenseOwnerAdmin ? <p className="muted">Only license owner admin can add payroll users.</p> : null}
                  {statuses.loginPayroll ? <div className={`status ${statuses.loginPayrollKind || ""}`}>{statuses.loginPayroll}</div> : null}
                  <div className="stack-list compact">
                    {!payrollWorkspaceUsers.length ? <div className="empty-state">No payroll users yet.</div> : payrollWorkspaceUsers.map((item) => (
                      <article className="item-card compact-card" key={item.id}>
                        <div className="item-card__top">
                          <div>
                            <h3>{item.name}</h3>
                            <p className="muted">{`${item.email} | ${formatWorkspaceUserRoleLabel(item.role)}`}</p>
                          </div>
                          {isLicenseOwnerAdmin ? (
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
                ) : null}

              </div>
            } />

          <Route path="/admin/payroll/settings" element={
            <Navigate to="/payroll/runs" replace />
          } />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </RouteErrorBoundary>
        <footer className="portal-footer portal-footer--content">{PRODUCT_NAME} {COMPANY_ATTRIBUTION} | build-126c8d5</footer>
      </main>

      <AssignModal
        open={Boolean(assignApplicantId) || (bulkAssignApplicantModalOpen && bulkAssignApplicantIds.length > 0)}
        applicant={assignApplicant}
        users={state.users}
        jobs={state.jobs}
        title={bulkAssignApplicantIds.length > 1 ? `Assign ${bulkAssignApplicantIds.length} Applicants` : (assignApplicant?.assignedToName ? "Reassign Applicant" : "Assign Applicant")}
        description={bulkAssignApplicantIds.length > 1 ? "Assign selected applicants to a recruiter and JD." : (assignApplicant?.assignedToName ? "Reassign this record to a recruiter and JD." : "Assign this record to a recruiter and JD.")}
        onClose={() => { setAssignApplicantId(""); setBulkAssignApplicantIds([]); setBulkAssignApplicantModalOpen(false); }}
        onSave={(payload) => saveApplicantAssignment({ ...payload, targetIds: bulkAssignApplicantIds })}
      />
      <AssignModal
        open={Boolean(assignCandidateId) || (bulkAssignCandidateModalOpen && bulkAssignCandidateIds.length > 0)}
        applicant={assignCandidate}
        users={state.users}
        jobs={state.jobs}
        onClose={() => { setAssignCandidateId(""); setBulkAssignCandidateIds([]); setBulkAssignCandidateModalOpen(false); }}
        onSave={(payload) => saveCapturedAssignment({ ...payload, targetIds: bulkAssignCandidateIds })}
        title={bulkAssignCandidateIds.length > 1 ? `Assign ${bulkAssignCandidateIds.length} Drafts` : (assignCandidate?.assigned_to_name ? "Reassign Draft" : "Assign Draft")}
        description={bulkAssignCandidateIds.length > 1 ? "Assign selected captured drafts to a recruiter and JD." : (assignCandidate?.assigned_to_name ? "Reassign {name} to a recruiter and JD." : "Assign {name} to a recruiter and JD. Recruiters can map the role for themselves; admins can also assign another recruiter.")}
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
        onClose={() => { setNewDraftOpen(false); resetNewDraftForm(); }}
        onSave={() => void createManualDraft()}
        onPasteScreenshot={() => void importNewDraftFromPastedScreenshot()}
        onImportSheet={(file) => void importNewDraftFromSheet(file)}
        onImportCvFiles={(files) => void importBulkCvDrafts(files)}
        importBusy={newDraftImportBusy}
        onOpenSheetImportPreview={() => setNewDraftSheetPreviewOpen(true)}
      />
      <NewDraftSheetImportPreviewModal
        open={newDraftSheetPreviewOpen}
        rows={newDraftSheetRows}
        busy={newDraftImportBusy}
        onClose={() => {
          if (newDraftImportBusy) return;
          setNewDraftSheetPreviewOpen(false);
        }}
        onCellChange={updateSheetPreviewRow}
        onImportValid={() => void importValidatedSheetRows()}
      />
      {whatsappTemplatePicker.open ? (
        <div className="overlay" onClick={() => setWhatsappTemplatePicker({ open: false, options: [], selectedId: "", row: null, phone: "", statusKey: "workspace", customText: "", newShortcutKey: "", saveScope: "all_jobs", assignJobId: "" })}>
          <div className="overlay-card whatsapp-template-picker" onClick={(event) => event.stopPropagation()}>
            <div className="section-kicker">WhatsApp Template</div>
            <h3>Choose Template to Copy</h3>
            <div className="muted">Selected template will be copied first, then WhatsApp chat will open.</div>
            {(whatsappTemplatePicker.options || []).length ? (
              <div className="whatsapp-template-picker__options">
                {(whatsappTemplatePicker.options || []).map((option) => (
                  <label key={option.id} className="whatsapp-template-picker__option">
                    <input
                      type="radio"
                      name="whatsapp_template_picker"
                      checked={String(whatsappTemplatePicker.selectedId || "") === String(option.id || "")}
                      onChange={() => setWhatsappTemplatePicker((current) => ({ ...current, selectedId: option.id, customText: renderWhatsappTemplatePreview(option.template || "", current.row || {}) }))}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <div className="status">No saved shortcuts yet. Write message below, add shortcut key, then click Save shortcut.</div>
            )}
            <label className="full">
              <span>Customize message</span>
              <textarea value={whatsappTemplatePicker.customText || ""} onChange={(e) => setWhatsappTemplatePicker((current) => ({ ...current, customText: e.target.value }))} />
              <span className="field-help">Placeholders: {`{{name}} {{recruiter_name}} {{interview_at}} {{jd_title}} {{client_name}} {{company_name}} {{phone}} {{jd_link}} {{recruiter_jd_link}}`}</span>
            </label>
            <div className="form-grid two-col">
              <label>
                <span>New shortcut key</span>
                <input value={whatsappTemplatePicker.newShortcutKey || ""} onChange={(e) => setWhatsappTemplatePicker((current) => ({ ...current, newShortcutKey: e.target.value }))} placeholder="followup_1" />
              </label>
              <label>
                <span>Save scope</span>
                <select value={whatsappTemplatePicker.saveScope || "all_jobs"} onChange={(e) => setWhatsappTemplatePicker((current) => ({ ...current, saveScope: e.target.value }))}>
                  {isSettingsAdmin ? <option value="company_wide">Save for all recruiters (company)</option> : null}
                  <option value="all_jobs">Save for all jobs (personal)</option>
                  <option value="this_job">Save for this job</option>
                </select>
              </label>
              {whatsappTemplatePicker.saveScope === "this_job" ? (
                <label className="full">
                  <span>Assign to job</span>
                  <select value={whatsappTemplatePicker.assignJobId || ""} onChange={(e) => setWhatsappTemplatePicker((current) => ({ ...current, assignJobId: e.target.value }))}>
                    <option value="">Select job</option>
                    {(state.jobs || []).map((job) => <option key={job.id} value={job.id}>{job.title || "Untitled job"}</option>)}
                  </select>
                </label>
              ) : null}
            </div>
            <div className="button-row">
              <button className="ghost-btn" onClick={() => setWhatsappTemplatePicker({ open: false, options: [], selectedId: "", row: null, phone: "", statusKey: "workspace", customText: "", newShortcutKey: "", saveScope: "all_jobs", assignJobId: "" })}>Cancel</button>
              <button className="ghost-btn" onClick={() => void saveWhatsappTemplateFromPicker()}>Save shortcut</button>
              <button onClick={() => void applyWhatsappTemplatePickerSelection()}>Copy and open (without saving)</button>
            </div>
          </div>
        </div>
      ) : null}
      <AttemptsModal open={Boolean(attemptsCandidateId)} candidate={attemptsCandidate} attempts={attempts} onClose={() => setAttemptsCandidateId("")} onRefresh={refreshAttempts} onSave={saveAttempt} />
      <AssessmentStatusModal open={Boolean(assessmentStatusId)} assessment={assessmentStatusItem} onClose={() => setAssessmentStatusId("")} onSave={(payload) => saveAssessmentStatusUpdate(assessmentStatusItem, payload)} />
      <DrilldownModal
        open={drilldownState.open && String(location?.pathname || "") !== "/dashboard"}
        loading={Boolean(drilldownState.loading)}
        title={drilldownState.title}
        items={drilldownState.items}
        onClose={() => setDrilldownState({ open: false, title: "", items: [], request: null, loading: false })}
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
        ccSuggestions={jdEmailCcSuggestions}
        onChange={(key, val) => setJdEmailModal((current) => ({ ...current, [key]: val }))}
        onClose={() => { setJdEmailModal({ open: false, candidate: null, to: "", cc: String((jdEmailCcSuggestions || [])[0] || defaultJdEmailCc || "").trim(), subject: "", introText: "", jobId: "", attachJdFile: true, signatureText: "", signatureLinks: [] }); setJdEmailModalStatus({ message: "", kind: "" }); }}
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
    const builtInClientPreset = ["compact_recruiter", "client_tracker", "client_submission", "screening_focus"].find((presetId) => (
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
          <footer className="portal-footer portal-footer--content">{COMPANY_ATTRIBUTION} | build-126c8d5</footer>
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

function NewDraftSheetImportPreviewModal({
  open,
  rows = [],
  busy = false,
  onClose,
  onCellChange,
  onImportValid
}) {
  if (!open) return null;
  const total = rows.length;
  const valid = rows.filter((row) => row.status === "valid").length;
  const warnings = rows.filter((row) => row.status === "warning").length;
  const errors = rows.filter((row) => row.status === "error").length;
  const duplicates = rows.filter((row) => row.status === "duplicate").length;
  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 1200, width: "96vw" }}>
        <h3>Sheet Import Preview (Max 50 rows)</h3>
        <p className="muted">Edit anything missing here. Only valid rows will be imported.</p>
        <p className="muted">Total: {total} | Valid: {valid} | Warning: {warnings} | Error: {errors} | Duplicate: {duplicates}</p>
        <div className="table-wrap" style={{ maxHeight: "56vh", overflow: "auto" }}>
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Status</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>LinkedIn</th>
                <th>Company</th>
                <th>Role</th>
                <th>Location</th>
                <th>Notes</th>
                <th>Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.index}</td>
                  <td>{row.status}</td>
                  <td><input value={row.name} onChange={(e) => onCellChange?.(row.id, "name", e.target.value)} /></td>
                  <td><input value={row.phone} onChange={(e) => onCellChange?.(row.id, "phone", e.target.value)} /></td>
                  <td><input value={row.email} onChange={(e) => onCellChange?.(row.id, "email", e.target.value)} /></td>
                  <td><input value={row.linkedin} onChange={(e) => onCellChange?.(row.id, "linkedin", e.target.value)} /></td>
                  <td><input value={row.company} onChange={(e) => onCellChange?.(row.id, "company", e.target.value)} /></td>
                  <td><input value={row.current_designation} onChange={(e) => onCellChange?.(row.id, "current_designation", e.target.value)} /></td>
                  <td><input value={row.location} onChange={(e) => onCellChange?.(row.id, "location", e.target.value)} /></td>
                  <td><input value={row.notes} onChange={(e) => onCellChange?.(row.id, "notes", e.target.value)} /></td>
                  <td style={{ minWidth: 240 }}>{(row.issues || []).join("; ") || "-"}</td>
                </tr>
              ))}
              {!rows.length ? (
                <tr><td colSpan="11"><div className="empty-state compact-empty">No rows loaded yet.</div></td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="button-row" style={{ marginTop: 12 }}>
          <button onClick={onImportValid} disabled={busy || !valid}>{busy ? "Importing..." : "Import Valid Rows Only"}</button>
          <button className="ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function parseDelimitedRowsFromText(text = "") {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const splitLine = (line) => {
    if (delimiter === "\t") return line.split("\t").map((cell) => String(cell || "").trim());
    const out = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === "\"") {
        const next = line[i + 1];
        if (inQuotes && next === "\"") {
          current += "\"";
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    out.push(current.trim());
    return out;
  };
  return lines.map(splitLine);
}

function mapDraftAutofillFromSpreadsheetRows(rows = []) {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  const headers = rows[0].map((item) => String(item || "").trim().toLowerCase());
  const values = rows[1] || [];
  const getValue = (...aliases) => {
    for (const alias of aliases) {
      const idx = headers.findIndex((header) => header === alias || header.includes(alias));
      if (idx >= 0) {
        const value = String(values[idx] || "").trim();
        if (value) return value;
      }
    }
    return "";
  };
  return {
    name: getValue("name", "candidate name", "full name"),
    phone: getValue("phone", "mobile", "contact", "phone number"),
    email: getValue("email", "email id", "mail"),
    linkedin: getValue("linkedin", "linkedin url", "linkedin profile"),
    company: getValue("company", "current company", "organization"),
    current_designation: getValue("designation", "role", "current designation", "position"),
    total_experience: getValue("experience", "total experience", "work experience"),
    location: getValue("location", "city"),
    jd_title: getValue("jd", "role", "position", "job title"),
    client_name: getValue("client", "client name"),
    tags: getValue("skill", "skills", "keywords", "tags"),
    notes: getValue("note", "notes", "remarks"),
    current_ctc: getValue("current ctc", "ctc"),
    notice_period: getValue("notice", "notice period"),
    highest_education: getValue("qualification", "education", "highest education")
  };
}

function normalizeSheetIdentityValue(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeSheetPhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "").trim();
}

function buildSheetDraftRows(rows = []) {
  if (!Array.isArray(rows) || rows.length < 2) return [];
  const headers = rows[0].map((item) => String(item || "").trim().toLowerCase());
  const getValue = (values = [], ...aliases) => {
    for (const alias of aliases) {
      const idx = headers.findIndex((header) => header === alias || header.includes(alias));
      if (idx >= 0) {
        const value = String(values[idx] || "").trim();
        if (value) return value;
      }
    }
    return "";
  };
  return rows.slice(1).map((values, idx) => ({
    id: `sheet-row-${idx + 1}`,
    index: idx + 1,
    name: getValue(values, "name", "candidate name", "full name"),
    phone: getValue(values, "phone", "mobile", "contact", "phone number"),
    email: getValue(values, "email", "email id", "mail"),
    linkedin: getValue(values, "linkedin", "linkedin url", "linkedin profile"),
    company: getValue(values, "company", "current company", "organization"),
    current_designation: getValue(values, "designation", "role", "current designation", "position"),
    total_experience: getValue(values, "experience", "total experience", "work experience"),
    location: getValue(values, "location", "city"),
    jd_title: getValue(values, "jd", "role", "position", "job title"),
    client_name: getValue(values, "client", "client name"),
    tags: getValue(values, "skill", "skills", "keywords", "tags"),
    notes: getValue(values, "note", "notes", "remarks"),
    current_ctc: getValue(values, "current ctc", "ctc"),
    notice_period: getValue(values, "notice", "notice period"),
    highest_education: getValue(values, "qualification", "education", "highest education")
  })).filter((row) =>
    Object.keys(row).some((key) => !["id", "index"].includes(key) && String(row[key] || "").trim())
  );
}

function validateSheetDraftRows(rows = [], existingRows = []) {
  const existingIdentitySet = new Set();
  (existingRows || []).forEach((item) => {
    const phone = normalizeSheetPhone(item?.phone || item?.phoneNumber || "");
    const email = normalizeSheetIdentityValue(item?.email || item?.emailId || "");
    const linkedin = normalizeSheetIdentityValue(item?.linkedin || item?.linkedinUrl || "");
    if (phone) existingIdentitySet.add(`phone:${phone}`);
    if (email) existingIdentitySet.add(`email:${email}`);
    if (linkedin) existingIdentitySet.add(`linkedin:${linkedin}`);
  });
  const seenInFile = new Set();
  return (rows || []).map((row) => {
    const issues = [];
    const name = String(row?.name || "").trim();
    const phone = normalizeSheetPhone(row?.phone || "");
    const email = normalizeSheetIdentityValue(row?.email || "");
    const linkedin = normalizeSheetIdentityValue(row?.linkedin || "");
    if (!name) issues.push("Missing name");
    if (!(phone || email || linkedin)) issues.push("Need at least one contact: phone/email/linkedin");
    const identities = [];
    if (phone) identities.push(`phone:${phone}`);
    if (email) identities.push(`email:${email}`);
    if (linkedin) identities.push(`linkedin:${linkedin}`);
    const isDuplicateExisting = identities.some((id) => existingIdentitySet.has(id));
    const isDuplicateInFile = identities.some((id) => seenInFile.has(id));
    identities.forEach((id) => seenInFile.add(id));
    if (isDuplicateExisting || isDuplicateInFile) issues.push("Duplicate by phone/email/linkedin");
    const hasError = issues.some((msg) => msg.includes("Missing") || msg.includes("Need at least one contact"));
    let status = "valid";
    if (issues.length && !hasError) status = "warning";
    if (hasError) status = "error";
    if (issues.some((msg) => msg.includes("Duplicate"))) status = "duplicate";
    return { ...row, issues, status };
  });
}

function getBrowserDevicePayload() {
  if (typeof navigator === "undefined") return {};
  return {
    userAgent: String(navigator.userAgent || "").trim(),
    platform: String(navigator.platform || "").trim(),
    language: String(navigator.language || "").trim()
  };
}

function getCurrentPositionAsync() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Geolocation is not available in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0
    });
  });
}

function PayrollLiteAdminPage({ token, employees = [], users = [], viewMode = "all", onEmployeesChanged }) {
  const formatMoney = (value) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toFixed(2);
  };
  const [employeeCreateDraft, setEmployeeCreateDraft] = useState({
    employeeCode: "",
    username: "",
    fullName: "",
    password: "",
    designation: "",
    clientName: "",
    workSiteName: "",
    workSiteAddress: "",
    workSiteLatitude: "",
    workSiteLongitude: "",
    workSiteRadiusMeters: "500"
  });
  const [employeeCreateStatus, setEmployeeCreateStatus] = useState("");
  const [employeeCreateStatusKind, setEmployeeCreateStatusKind] = useState("");
  const [employeeEditId, setEmployeeEditId] = useState("");
  const {
    settings, setSettings, compItems, fbpHeads, salaryTemplates,
    payrollMonth, setPayrollMonth, payrollYear, setPayrollYear, payrollInputs, payrollRuns,
    fbpDeclarations, fbpApprovalAmounts, setFbpApprovalAmounts, payrollPayslips,
    selectedRunId, setSelectedRunId, selectedRunDetail, runActionStatus, status, setStatus,
    compForm, setCompForm, fbpForm, setFbpForm, templateForm, setTemplateForm, declarationForm, setDeclarationForm,
    declarationDocUploading, suggestRecalculateAfterFbp, setSuggestRecalculateAfterFbp,
    accessControl, setAccessControl,
    showFoundation, showAccessControl, showTemplates, showCompensation, showInputs, showRuns, showFbpHeads, showFbpClaims, showPayslips,
    loadPayrollFoundation, loadPayrollExecutionData, saveSettings, savePayrollAccessControl, saveComp, autoFillCompensation, saveFbpHead, saveTemplate, saveCompanyFbpHeadDeactivate,
    inputByEmployee, userNameById, savePayrollInputRow, setInputField, createRunDraft, runAction, rollbackRunToCalculated, deleteSelectedRun, submitFbpDeclaration, uploadDeclarationDoc, reviewDeclaration, publishPayslipsForSelectedRun,
    updateCompField
  } = usePayrollAdminData({ token, employees, users, viewMode, api });
  const showEmployeeAccess = viewMode === "all" || viewMode === "employees";
  const adminUsers = useMemo(
    () => (users || []).filter((item) => String(item?.role || "").trim().toLowerCase() === "admin"),
    [users]
  );
  useEffect(() => {
    setStatus("");
  }, [viewMode, setStatus]);

  async function createEmployeeFromPayroll() {
    const payload = {
      employeeCode: String(employeeCreateDraft.employeeCode || "").trim(),
      username: String(employeeCreateDraft.username || "").trim(),
      fullName: String(employeeCreateDraft.fullName || "").trim(),
      password: String(employeeCreateDraft.password || ""),
      designation: String(employeeCreateDraft.designation || "").trim(),
      clientName: String(employeeCreateDraft.clientName || "").trim()
    };
    if (!payload.employeeCode || !payload.username || !payload.fullName || (!employeeEditId && !payload.password)) {
      setEmployeeCreateStatusKind("error");
      setEmployeeCreateStatus(employeeEditId
        ? "Employee code, username, and full name are required."
        : "Employee code, username, full name, and temporary password are required.");
      return;
    }
    const latitudeRaw = String(employeeCreateDraft.workSiteLatitude || "").trim();
    const longitudeRaw = String(employeeCreateDraft.workSiteLongitude || "").trim();
    const radiusRaw = String(employeeCreateDraft.workSiteRadiusMeters || "").trim();
    if (latitudeRaw || longitudeRaw || String(employeeCreateDraft.workSiteName || "").trim() || String(employeeCreateDraft.workSiteAddress || "").trim()) {
      const latitude = Number(latitudeRaw);
      const longitude = Number(longitudeRaw);
      const radius = Number(radiusRaw || "500");
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        setEmployeeCreateStatusKind("error");
        setEmployeeCreateStatus("Work site latitude and longitude must be valid numbers.");
        return;
      }
      payload.workSite = {
        siteName: String(employeeCreateDraft.workSiteName || "Primary Work Site").trim(),
        addressText: String(employeeCreateDraft.workSiteAddress || "").trim(),
        clientName: payload.clientName,
        latitude,
        longitude,
        radiusMeters: Number.isFinite(radius) && radius > 0 ? radius : 500
      };
    }
    try {
      setEmployeeCreateStatusKind("");
      setEmployeeCreateStatus("Creating employee...");
      if (employeeEditId) {
        await api("/company/employees/update", token, "POST", {
          employeeId: employeeEditId,
          employeeCode: payload.employeeCode,
          fullName: payload.fullName,
          designation: payload.designation,
          clientName: payload.clientName,
          status: "active",
          workSite: payload.workSite || {}
        });
      } else {
        await api("/company/employees", token, "POST", payload);
      }
      setEmployeeCreateDraft({
        employeeCode: "",
        username: "",
        fullName: "",
        password: "",
        designation: "",
        clientName: "",
        workSiteName: "",
        workSiteAddress: "",
        workSiteLatitude: "",
        workSiteLongitude: "",
        workSiteRadiusMeters: "500"
      });
      setEmployeeCreateStatusKind("ok");
      setEmployeeCreateStatus(employeeEditId ? "Employee updated successfully." : "Employee created successfully.");
      setEmployeeEditId("");
      if (typeof onEmployeesChanged === "function") await onEmployeesChanged();
    } catch (error) {
      setEmployeeCreateStatusKind("error");
      setEmployeeCreateStatus(String(error?.message || error));
    }
  }
  async function updateEmployeeFromPayroll(employee) {
    const site = employee?.workSite && typeof employee.workSite === "object" ? employee.workSite : {};
    setEmployeeCreateDraft((current) => ({
      ...current,
      employeeCode: String(employee?.employeeCode || "").trim(),
      username: String(employee?.username || "").trim(),
      fullName: String(employee?.fullName || "").trim(),
      password: "",
      designation: String(employee?.designation || "").trim(),
      clientName: String(employee?.clientName || "").trim(),
      workSiteName: String(site?.siteName || "").trim(),
      workSiteAddress: String(site?.addressText || "").trim(),
      workSiteLatitude: site?.latitude == null ? "" : String(site.latitude),
      workSiteLongitude: site?.longitude == null ? "" : String(site.longitude),
      workSiteRadiusMeters: site?.radiusMeters == null ? "500" : String(site.radiusMeters)
    }));
    setEmployeeEditId(String(employee?.id || "").trim());
    setEmployeeCreateStatusKind("");
    setEmployeeCreateStatus("Editing employee. Update fields and click 'Update employee'.");
  }
  async function deactivateEmployeeFromPayroll(employee) {
    try {
      const yes = typeof window === "undefined" ? true : window.confirm(`Deactivate ${employee?.fullName || "employee"}?`);
      if (!yes) return;
      await api("/company/employees/update", token, "POST", {
        employeeId: String(employee?.id || "").trim(),
        employeeCode: String(employee?.employeeCode || "").trim(),
        fullName: String(employee?.fullName || "").trim(),
        personalEmail: String(employee?.personalEmail || "").trim(),
        phone: String(employee?.phone || "").trim(),
        designation: String(employee?.designation || "").trim(),
        employmentType: String(employee?.employmentType || "c2h").trim(),
        joiningDate: String(employee?.joiningDate || "").trim(),
        reportingManagerName: String(employee?.reportingManagerName || "").trim(),
        clientName: String(employee?.clientName || "").trim(),
        workMode: String(employee?.workMode || "").trim(),
        status: "inactive"
      });
      setEmployeeCreateStatusKind("ok");
      setEmployeeCreateStatus("Employee deactivated.");
      if (typeof onEmployeesChanged === "function") await onEmployeesChanged();
    } catch (error) {
      setEmployeeCreateStatusKind("error");
      setEmployeeCreateStatus(String(error?.message || error));
    }
  }
  async function deactivateCompensationFromPayroll(item) {
    try {
      const yes = typeof window === "undefined" ? true : window.confirm("Deactivate this salary structure?");
      if (!yes) return;
      await api("/company/payroll/compensation", token, "POST", { ...item, isActive: false });
      await loadPayrollFoundation();
      setStatus("Salary structure deactivated.");
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }
  return (
    <div className="page-grid">
      <PayrollSettingsSection visible={showFoundation} kicker="Payroll Lite" title="Foundation Settings">
        {showFoundation && status ? <div className="status">{status}</div> : null}
        <p className="muted">Phase 1 scaffolding is enabled here. Recruiter/client modules remain untouched.</p>
        <div className="form-grid three-col">
          <label className="checkbox-row"><input type="checkbox" checked={settings.payrollEnabled} onChange={(e) => setSettings((c) => ({ ...c, payrollEnabled: e.target.checked }))} /><span>Payroll enabled</span></label>
          <label><span>Proof cycle</span><select value={settings.defaultFbpProofCycle} onChange={(e) => setSettings((c) => ({ ...c, defaultFbpProofCycle: e.target.value }))}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="final_settlement">Final settlement</option></select></label>
          <label><span>Default PT (monthly)</span><input type="number" value={settings.defaultMonthlyProfessionalTax} onChange={(e) => setSettings((c) => ({ ...c, defaultMonthlyProfessionalTax: Number(e.target.value || 0) }))} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={settings.applyLopProration} onChange={(e) => setSettings((c) => ({ ...c, applyLopProration: e.target.checked }))} /><span>Apply LOP proration</span></label>
          <label className="checkbox-row"><input type="checkbox" checked={settings.prorateHealthInsurance} onChange={(e) => setSettings((c) => ({ ...c, prorateHealthInsurance: e.target.checked }))} /><span>Prorate health insurance</span></label>
          <label className="checkbox-row"><input type="checkbox" checked={settings.prorateReimbursements} onChange={(e) => setSettings((c) => ({ ...c, prorateReimbursements: e.target.checked }))} /><span>Prorate reimbursements</span></label>
          <label className="checkbox-row"><input type="checkbox" checked={settings.gratuityOnFullMonthlyBasic} onChange={(e) => setSettings((c) => ({ ...c, gratuityOnFullMonthlyBasic: e.target.checked }))} /><span>Gratuity on full basic</span></label>
          <label className="checkbox-row"><input type="checkbox" checked={settings.lwfEnabled} onChange={(e) => setSettings((c) => ({ ...c, lwfEnabled: e.target.checked }))} /><span>Enable LWF formula rule</span></label>
          <label><span>LWF employee % of basic</span><input type="number" step="0.01" value={settings.lwfEmployeeRatePercent} onChange={(e) => setSettings((c) => ({ ...c, lwfEmployeeRatePercent: Number(e.target.value || 0) }))} /></label>
          <label><span>LWF employee cap (monthly)</span><input type="number" value={settings.lwfEmployeeMonthlyCap} onChange={(e) => setSettings((c) => ({ ...c, lwfEmployeeMonthlyCap: Number(e.target.value || 0) }))} /></label>
          <label><span>LWF employer multiplier</span><input type="number" step="0.01" value={settings.lwfEmployerMultiplier} onChange={(e) => setSettings((c) => ({ ...c, lwfEmployerMultiplier: Number(e.target.value || 0) }))} /></label>
          <label><span>Default salary template</span><input value={settings.defaultSalaryTemplateCode} onChange={(e) => setSettings((c) => ({ ...c, defaultSalaryTemplateCode: e.target.value }))} /></label>
          <label className="full"><span>Policy note</span><textarea rows={2} value={settings.policyNote} onChange={(e) => setSettings((c) => ({ ...c, policyNote: e.target.value }))} /></label>
        </div>
        <div className="button-row"><button onClick={() => void saveSettings()}>Save settings</button></div>
      </PayrollSettingsSection>
      <PayrollSettingsSection visible={showAccessControl} kicker="Payroll Lite" title="Access Control (Package + Authorization)">
        <p className="muted">Recruitment admin access is separate. Only payroll_owner/payroll_manager should grant payroll permissions.</p>
        <div className="form-grid three-col">
          <label className="checkbox-row">
            <input type="checkbox" checked={Boolean(accessControl.payrollLiteEnabled)} onChange={(e) => setAccessControl((c) => ({ ...c, payrollLiteEnabled: e.target.checked }))} />
            <span>Enable Payroll Lite for this company package</span>
          </label>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead><tr><th>Admin</th><th>Payroll Access</th><th>Payroll Approver</th><th>Can Manage Payroll Access</th></tr></thead>
            <tbody>
              {adminUsers.map((user) => {
                const id = String(user?.id || "").trim();
                return (
                  <tr key={id || user.email}>
                    <td>{user.name} ({user.email})</td>
                    <td><input type="checkbox" checked={(accessControl.payrollAuthorizedUserIds || []).includes(id)} onChange={(e) => toggleAccessId("payrollAuthorizedUserIds", id, e.target.checked)} /></td>
                    <td><input type="checkbox" checked={(accessControl.payrollApproverUserIds || []).includes(id)} onChange={(e) => toggleAccessId("payrollApproverUserIds", id, e.target.checked)} /></td>
                    <td><input type="checkbox" checked={(accessControl.payrollAccessManagerUserIds || []).includes(id)} onChange={(e) => toggleAccessId("payrollAccessManagerUserIds", id, e.target.checked)} /></td>
                  </tr>
                );
              })}
              {!adminUsers.length ? <tr><td colSpan="4"><div className="empty-state compact-empty">No admin users found.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="button-row"><button onClick={() => void savePayrollAccessControl()}>Save payroll access control</button></div>
      </PayrollSettingsSection>

      <PayrollCompensationSection visible={showTemplates} kicker="Salary Templates" title="Create Template Automation Rules">
        {showTemplates && status ? <div className="status">{status}</div> : null}
        <div className="form-grid three-col">
          <label><span>Template code</span><input value={templateForm.code} onChange={(e) => setTemplateForm((c) => ({ ...c, code: e.target.value }))} placeholder="internal_standard" /></label>
          <label><span>Template name</span><input value={templateForm.name} onChange={(e) => setTemplateForm((c) => ({ ...c, name: e.target.value }))} placeholder="Internal Employee Standard" /></label>
          <label><span>Active</span><select value={templateForm.active ? "true" : "false"} onChange={(e) => setTemplateForm((c) => ({ ...c, active: e.target.value === "true" }))}><option value="true">Active</option><option value="false">Inactive</option></select></label>
          <label className="full"><span>Description</span><input value={templateForm.description} onChange={(e) => setTemplateForm((c) => ({ ...c, description: e.target.value }))} placeholder="Used for internal payroll defaults" /></label>
          <label><span>Basic % of CTC</span><input type="number" value={templateForm.basicPercentOfCtc} onChange={(e) => setTemplateForm((c) => ({ ...c, basicPercentOfCtc: e.target.value }))} /></label>
          <label><span>HRA % of Basic</span><input type="number" value={templateForm.hraPercentOfBasic} onChange={(e) => setTemplateForm((c) => ({ ...c, hraPercentOfBasic: e.target.value }))} /></label>
          <label><span>Employer PF % of Basic</span><input type="number" value={templateForm.employerPfPercentOfBasic} onChange={(e) => setTemplateForm((c) => ({ ...c, employerPfPercentOfBasic: e.target.value }))} /></label>
          <label><span>Employee PF % of Basic</span><input type="number" value={templateForm.employeePfPercentOfBasic} onChange={(e) => setTemplateForm((c) => ({ ...c, employeePfPercentOfBasic: e.target.value }))} /></label>
          <label><span>Employer ESI % of Gross</span><input type="number" value={templateForm.employerEsiPercentOfGross} onChange={(e) => setTemplateForm((c) => ({ ...c, employerEsiPercentOfGross: e.target.value }))} /></label>
          <label><span>Employee ESI % of Gross</span><input type="number" value={templateForm.employeeEsiPercentOfGross} onChange={(e) => setTemplateForm((c) => ({ ...c, employeeEsiPercentOfGross: e.target.value }))} /></label>
          <label><span>Employer LWF (monthly)</span><input type="number" value={templateForm.employerLwfMonthly} onChange={(e) => setTemplateForm((c) => ({ ...c, employerLwfMonthly: e.target.value }))} /></label>
          <label><span>Employee LWF (monthly)</span><input type="number" value={templateForm.employeeLwfMonthly} onChange={(e) => setTemplateForm((c) => ({ ...c, employeeLwfMonthly: e.target.value }))} /></label>
          <label><span>PT (monthly)</span><input type="number" value={templateForm.professionalTaxMonthly} onChange={(e) => setTemplateForm((c) => ({ ...c, professionalTaxMonthly: e.target.value }))} /></label>
          <label><span>Gratuity % of Basic (annual)</span><input type="number" value={templateForm.gratuityPercentOfBasicAnnual} onChange={(e) => setTemplateForm((c) => ({ ...c, gratuityPercentOfBasicAnnual: e.target.value }))} /></label>
          <label><span>Default FBP (monthly)</span><input type="number" value={templateForm.defaultFbpMonthly} onChange={(e) => setTemplateForm((c) => ({ ...c, defaultFbpMonthly: e.target.value }))} /></label>
          <label><span>Default health insurance (annual)</span><input type="number" value={templateForm.defaultHealthInsuranceAnnual} onChange={(e) => setTemplateForm((c) => ({ ...c, defaultHealthInsuranceAnnual: e.target.value }))} /></label>
        </div>
        <div className="button-row"><button onClick={() => void saveTemplate()}>Save template</button></div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead><tr><th>Code</th><th>Name</th><th>Basic%</th><th>HRA%</th><th>PF%</th><th>FBP</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {salaryTemplates.map((item) => <tr key={item.id}><td>{item.code}</td><td>{item.name}</td><td>{item.config?.basic_percent_of_ctc ?? "-"}</td><td>{item.config?.hra_percent_of_basic ?? "-"}</td><td>{item.config?.employer_pf_percent_of_basic ?? "-"}</td><td>{item.config?.default_fbp_monthly ?? 0}</td><td>{item.active ? "Active" : "Inactive"}</td><td><button className="ghost-btn" onClick={() => setTemplateForm({
                id: item.id,
                code: item.code,
                name: item.name,
                description: item.description || "",
                basicPercentOfCtc: item.config?.basic_percent_of_ctc ?? 35,
                hraPercentOfBasic: item.config?.hra_percent_of_basic ?? 50,
                employerPfPercentOfBasic: item.config?.employer_pf_percent_of_basic ?? 12,
                employeePfPercentOfBasic: item.config?.employee_pf_percent_of_basic ?? 12,
                employerEsiPercentOfGross: item.config?.employer_esi_percent_of_gross ?? 3.25,
                employeeEsiPercentOfGross: item.config?.employee_esi_percent_of_gross ?? 0.75,
                employerLwfMonthly: item.config?.employer_lwf_monthly ?? 20,
                employeeLwfMonthly: item.config?.employee_lwf_monthly ?? 10,
                professionalTaxMonthly: item.config?.professional_tax_monthly ?? 200,
                gratuityPercentOfBasicAnnual: item.config?.gratuity_percent_of_basic_annual ?? 4.81,
                defaultFbpMonthly: item.config?.default_fbp_monthly ?? 0,
                defaultHealthInsuranceAnnual: item.config?.default_health_insurance_annual ?? 0,
                active: item.active
              })}>Edit</button></td></tr>)}
              {!salaryTemplates.length ? <tr><td colSpan="8"><div className="empty-state compact-empty">No salary templates yet.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </PayrollCompensationSection>

      <PayrollCompensationSection visible={showCompensation} kicker="Compensation" title="Create Structure">
        {showCompensation && status ? <div className="status">{status}</div> : null}
        <div className="form-grid three-col">
          <label><span>Employee</span><select value={compForm.employeeId} onChange={(e) => setCompForm((c) => ({ ...c, employeeId: e.target.value }))}><option value="">Select employee</option>{employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.employeeCode} - {emp.fullName}</option>)}</select></label>
          <label><span>Effective from</span><input type="date" value={compForm.effectiveFrom} onChange={(e) => setCompForm((c) => ({ ...c, effectiveFrom: e.target.value }))} /></label>
          <label><span>Template</span><select value={compForm.templateCode} onChange={(e) => { const next = e.target.value; setCompForm((c) => ({ ...c, templateCode: next })); autoFillCompensation(next, compForm.annualCtc); }}><option value="custom">Custom</option>{salaryTemplates.filter((item) => item.active).map((item) => <option key={item.id} value={item.code}>{item.name}</option>)}</select></label>
          <label><span>Annual CTC</span><input type="number" value={compForm.annualCtc} onChange={(e) => { const next = e.target.value; setCompForm((c) => ({ ...c, annualCtc: next })); autoFillCompensation(compForm.templateCode, next); }} /></label>
          <label><span>Monthly CTC</span><input type="number" value={compForm.monthlyCtc} onChange={(e) => setCompForm((c) => ({ ...c, monthlyCtc: e.target.value }))} /></label>
          <label><span>Basic (monthly)</span><input type="number" value={compForm.basicMonthly} onChange={(e) => updateCompField("basicMonthly", e.target.value, { rebalance: true })} /></label>
          <label><span>HRA (monthly)</span><input type="number" value={compForm.hraMonthly} onChange={(e) => updateCompField("hraMonthly", e.target.value, { rebalance: true })} /></label>
          <label><span>FBP (monthly)</span><input type="number" value={compForm.fbpMonthly} onChange={(e) => updateCompField("fbpMonthly", e.target.value, { rebalance: true })} /></label>
          <label><span>Special allowance</span><input type="number" value={compForm.specialAllowanceMonthly} onChange={(e) => updateCompField("specialAllowanceMonthly", e.target.value)} /></label>
          <label><span>Employer PF</span><input type="number" value={compForm.employerPfMonthly} onChange={(e) => updateCompField("employerPfMonthly", e.target.value, { rebalance: true })} /></label>
          <label><span>Employee PF</span><input type="number" value={compForm.employeePfMonthly} onChange={(e) => updateCompField("employeePfMonthly", e.target.value)} /></label>
          <label><span>Employer ESI</span><input type="number" value={compForm.employerEsiMonthly} onChange={(e) => updateCompField("employerEsiMonthly", e.target.value, { rebalance: true })} /></label>
          <label><span>Employee ESI</span><input type="number" value={compForm.employeeEsiMonthly} onChange={(e) => updateCompField("employeeEsiMonthly", e.target.value)} /></label>
          <label><span>Employer LWF</span><input type="number" value={compForm.employerLwfMonthly} onChange={(e) => updateCompField("employerLwfMonthly", e.target.value, { rebalance: true })} /></label>
          <label><span>Employee LWF</span><input type="number" value={compForm.employeeLwfMonthly} onChange={(e) => updateCompField("employeeLwfMonthly", e.target.value)} /></label>
          <label><span>Professional Tax (monthly)</span><input type="number" value={compForm.professionalTaxMonthly} onChange={(e) => setCompForm((c) => ({ ...c, professionalTaxMonthly: e.target.value }))} /></label>
          <label><span>Gratuity</span><input type="number" value={compForm.gratuityMonthly} onChange={(e) => updateCompField("gratuityMonthly", e.target.value, { rebalance: true })} /></label>
          <label><span>Health insurance</span><input type="number" value={compForm.healthInsuranceMonthly} onChange={(e) => updateCompField("healthInsuranceMonthly", e.target.value, { rebalance: true })} /></label>
          <label><span>Other allowance</span><input type="number" value={compForm.otherAllowanceMonthly} onChange={(e) => updateCompField("otherAllowanceMonthly", e.target.value, { rebalance: true })} /></label>
        </div>
        <div className="button-row">
          <button onClick={() => void saveComp()}>Save compensation</button>
          <button className="ghost-btn" onClick={() => void loadPayrollFoundation()}>Refresh saved structures</button>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead><tr><th>Employee</th><th>Effective</th><th>Annual CTC</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {compItems.map((item) => <tr key={item.id}><td>{employees.find((emp) => emp.id === item.employeeId)?.fullName || item.employeeId}</td><td>{item.effectiveFrom || "-"}</td><td>{item.annualCtc || 0}</td><td>{item.isActive ? "Active" : "Historical"}</td><td><div className="button-row tight"><button className="ghost-btn" onClick={() => setCompForm({
                id: item.id,
                employeeId: item.employeeId,
                effectiveFrom: item.effectiveFrom || new Date().toISOString().slice(0, 10),
                annualCtc: item.annualCtc || "",
                monthlyCtc: item.monthlyCtc || "",
                basicMonthly: item.basicMonthly || "",
                hraMonthly: item.hraMonthly || "",
                fbpMonthly: item.fbpMonthly || "",
                specialAllowanceMonthly: item.specialAllowanceMonthly || "",
                employerPfMonthly: item.employerPfMonthly || "",
                employeePfMonthly: item.employeePfMonthly || "",
                employerEsiMonthly: item.employerEsiMonthly || "",
                employeeEsiMonthly: item.employeeEsiMonthly || "",
                employerLwfMonthly: item.employerLwfMonthly || "",
                employeeLwfMonthly: item.employeeLwfMonthly || "",
                professionalTaxMonthly: item.professionalTaxMonthly || "",
                gratuityMonthly: item.gratuityMonthly || "",
                healthInsuranceMonthly: item.healthInsuranceMonthly || "",
                otherAllowanceMonthly: item.otherAllowanceMonthly || "",
                templateCode: item.templateCode || "custom",
                isActive: item.isActive !== false,
                notes: item.notes || ""
              })}>Edit</button><button className="ghost-btn" onClick={() => void deactivateCompensationFromPayroll(item)} disabled={item.isActive === false}>Deactivate</button></div></td></tr>)}
              {!compItems.length ? <tr><td colSpan="5"><div className="empty-state compact-empty">No compensation records yet.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </PayrollCompensationSection>
      <PayrollCompensationSection visible={showEmployeeAccess} kicker="Employee Access" title="Add Employee">
        {showEmployeeAccess && status ? <div className="status">{status}</div> : null}
        <p className="muted">Create employee login from payroll module. This is now separate from recruiter login settings.</p>
        <div className="form-grid three-col">
          <label><span>Employee code</span><input value={employeeCreateDraft.employeeCode} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, employeeCode: e.target.value }))} placeholder="KM001" /></label>
          <label><span>Username</span><input value={employeeCreateDraft.username} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, username: e.target.value }))} placeholder="km001" /></label>
          <label><span>Full name</span><input value={employeeCreateDraft.fullName} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, fullName: e.target.value }))} placeholder="Rasel Ahmed" /></label>
          <label><span>Temporary password</span><input type="password" value={employeeCreateDraft.password} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, password: e.target.value }))} placeholder="Set employee password" /></label>
          <label><span>Designation (optional)</span><input value={employeeCreateDraft.designation} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, designation: e.target.value }))} placeholder="Software Engineer" /></label>
          <label><span>Client name (optional)</span><input value={employeeCreateDraft.clientName} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, clientName: e.target.value }))} placeholder="Easyrewardz" /></label>
          <label><span>Work site name (optional)</span><input value={employeeCreateDraft.workSiteName} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, workSiteName: e.target.value }))} placeholder="Easyrewardz HQ" /></label>
          <label><span>Work site address (optional)</span><input value={employeeCreateDraft.workSiteAddress} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, workSiteAddress: e.target.value }))} placeholder="DLF Cyber City, Gurugram" /></label>
          <label><span>Work site latitude (optional)</span><input value={employeeCreateDraft.workSiteLatitude} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, workSiteLatitude: e.target.value }))} placeholder="28.4942" /></label>
          <label><span>Work site longitude (optional)</span><input value={employeeCreateDraft.workSiteLongitude} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, workSiteLongitude: e.target.value }))} placeholder="77.0890" /></label>
          <label><span>Allowed radius (meters)</span><input value={employeeCreateDraft.workSiteRadiusMeters} onChange={(e) => setEmployeeCreateDraft((c) => ({ ...c, workSiteRadiusMeters: e.target.value }))} placeholder="500" /></label>
        </div>
        <div className="button-row">
          <button onClick={() => void createEmployeeFromPayroll()}>{employeeEditId ? "Update employee" : "Create employee"}</button>
          {employeeEditId ? <button className="ghost-btn" onClick={() => {
            setEmployeeEditId("");
            setEmployeeCreateDraft({
              employeeCode: "",
              username: "",
              fullName: "",
              password: "",
              designation: "",
              clientName: "",
              workSiteName: "",
              workSiteAddress: "",
              workSiteLatitude: "",
              workSiteLongitude: "",
              workSiteRadiusMeters: "500"
            });
            setEmployeeCreateStatus("");
            setEmployeeCreateStatusKind("");
          }}>Cancel edit</button> : null}
        </div>
        {employeeCreateStatus ? <div className={`status ${employeeCreateStatusKind}`}>{employeeCreateStatus}</div> : null}
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead><tr><th>Employee</th><th>Code</th><th>Username</th><th>Designation</th><th>Client</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {employees.map((item) => (
                <tr key={item.id}>
                  <td>{item.fullName || "-"}</td>
                  <td>{item.employeeCode || "-"}</td>
                  <td>{item.username || "-"}</td>
                  <td>{item.designation || "-"}</td>
                  <td>{item.clientName || "-"}</td>
                  <td>{String(item.status || "active")}</td>
                  <td>
                    <div className="button-row tight">
                      <button className="ghost-btn" onClick={() => void updateEmployeeFromPayroll(item)}>Edit</button>
                      <button className="ghost-btn" onClick={() => void deactivateEmployeeFromPayroll(item)} disabled={String(item.status || "").toLowerCase() === "inactive"}>Deactivate</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!employees.length ? <tr><td colSpan="7"><div className="empty-state compact-empty">No employees found yet.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </PayrollCompensationSection>

      <PayrollRunsSection visible={showInputs} kicker="Payroll Inputs" title="Employee-wise Monthly Inputs">
        {showInputs && status ? <div className="status">{status}</div> : null}
        <div className="form-grid three-col">
          <label><span>Payroll month</span><input type="number" min="1" max="12" value={payrollMonth} onChange={(e) => setPayrollMonth(Number(e.target.value || 1))} /></label>
          <label><span>Payroll year</span><input type="number" min="2000" max="2100" value={payrollYear} onChange={(e) => setPayrollYear(Number(e.target.value || new Date().getFullYear()))} /></label>
          <div className="button-row align-end"><button className="ghost-btn" onClick={() => void loadPayrollExecutionData(payrollMonth, payrollYear)}>Refresh month data</button></div>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Total days</th>
                <th>Payable</th>
                <th>Unpaid/LOP</th>
                <th>Other earnings</th>
                <th>Other deductions</th>
                <th>PT</th>
                <th>TDS</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => {
                const row = inputByEmployee.get(String(emp.id || "")) || {};
                return (
                  <tr key={`pi-${emp.id}`}>
                    <td>{emp.employeeCode} - {emp.fullName}</td>
                    <td><input type="number" value={row.totalCalendarDays ?? 30} onChange={(e) => setInputField(emp.id, "totalCalendarDays", Number(e.target.value || 0))} /></td>
                    <td><input type="number" value={row.payableDays ?? 30} onChange={(e) => setInputField(emp.id, "payableDays", Number(e.target.value || 0))} /></td>
                    <td><input type="number" value={row.unpaidLeaveDays ?? 0} onChange={(e) => setInputField(emp.id, "unpaidLeaveDays", Number(e.target.value || 0))} /></td>
                    <td><input type="number" value={row.otherEarnings ?? 0} onChange={(e) => setInputField(emp.id, "otherEarnings", Number(e.target.value || 0))} /></td>
                    <td><input type="number" value={row.otherDeductions ?? 0} onChange={(e) => setInputField(emp.id, "otherDeductions", Number(e.target.value || 0))} /></td>
                    <td><input type="number" value={row.professionalTax ?? 0} onChange={(e) => setInputField(emp.id, "professionalTax", Number(e.target.value || 0))} /></td>
                    <td><input type="number" value={row.tdsAmount ?? 0} onChange={(e) => setInputField(emp.id, "tdsAmount", Number(e.target.value || 0))} /></td>
                    <td><button className="ghost-btn" onClick={() => void savePayrollInputRow(emp.id)}>Save</button></td>
                  </tr>
                );
              })}
              {!employees.length ? <tr><td colSpan="9"><div className="empty-state compact-empty">No employees available.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </PayrollRunsSection>

      <PayrollRunsSection visible={showRuns} kicker="Payroll Run" title="Draft -> Calculate -> Approve -> Lock">
        {showRuns && status ? <div className="status">{status}</div> : null}
        <div className="button-row">
          <button onClick={() => void createRunDraft()}>Create Draft</button>
          <button className="ghost-btn" onClick={() => void runAction("calculate")} disabled={!selectedRunId}>Calculate</button>
          <button className="ghost-btn" onClick={() => void runAction("approve")} disabled={!selectedRunId}>Approve</button>
          <button className="ghost-btn" onClick={() => void runAction("lock")} disabled={!selectedRunId}>Lock</button>
          <button className="ghost-btn" onClick={() => void rollbackRunToCalculated()} disabled={!selectedRunId}>Back to Calculated</button>
          <button className="ghost-btn" onClick={() => void deleteSelectedRun()} disabled={!selectedRunId}>Delete Run</button>
        </div>
        {runActionStatus ? <div className="status">{runActionStatus}</div> : null}
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead><tr><th>Run ID</th><th>Month</th><th>Status</th><th>Total Gross</th><th>Total Deductions</th><th>Total Net</th><th>Total Employer Cost</th><th>Select</th></tr></thead>
            <tbody>
              {payrollRuns.map((run) => (
                <tr key={String(run?.id || `${run?.payrollMonth || 0}-${run?.payrollYear || 0}`)} onClick={() => setSelectedRunId(String(run?.id || ""))} style={{ cursor: "pointer", background: selectedRunId === String(run?.id || "") ? "rgba(59,130,246,0.08)" : "transparent" }}>
                  <td>{String(run?.id || "").slice(0, 8) || "-"}</td>
                  <td>{run.payrollMonth}/{run.payrollYear}</td>
                  <td>{run.status}</td>
                  <td>{run.totalGross}</td>
                  <td>{run.totalDeductions}</td>
                  <td>{run.totalNetPay}</td>
                  <td>{run.totalEmployerCost}</td>
                  <td><button className="ghost-btn" onClick={(e) => { e.stopPropagation(); setSelectedRunId(String(run?.id || "")); }}>Use</button></td>
                </tr>
              ))}
              {!payrollRuns.length ? <tr><td colSpan="8"><div className="empty-state compact-empty">No payroll runs yet for selected month/year.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead><tr><th>Employee</th><th>Gross</th><th>Deductions</th><th>Net</th><th>Employer Cost</th><th>How Calculated</th></tr></thead>
            <tbody>
              {(selectedRunDetail?.items || []).map((item) => (
                <tr key={item.id}>
                  <td>{item.payload?.employeeCode || item.employeeId} - {item.payload?.employeeName || ""}</td>
                  <td>{item.grossEarnings}</td>
                  <td>{item.grossDeductions}</td>
                  <td>{item.netSalary}</td>
                  <td>{item.employerCost}</td>
                  <td>
                    <div className="muted">
                      Gross = {formatMoney(item.payload?.proratedBasic)} + {formatMoney(item.payload?.proratedHra)} + {formatMoney(item.payload?.proratedFbp)} + {formatMoney(item.payload?.proratedSpecialAllowance)} + {formatMoney(item.payload?.otherAllowance)} + {formatMoney(item.payload?.otherEarnings)} + {formatMoney(item.payload?.approvedReimbursements)}
                    </div>
                    {Number(item.payload?.approvedFbpAmount || 0) > 0 ? (
                      <div className="muted">FBP Approved for month: {formatMoney(item.payload?.approvedFbpAmount)}</div>
                    ) : null}
                    <div className="muted">
                      LOP: Total Days {item.payload?.totalDays ?? item.payload?.total_days ?? 0} | Payable Days {item.payload?.payableDays ?? item.payload?.payable_days ?? 0} | Paid Leave {item.payload?.paidLeaveDays ?? item.payload?.paid_leave_days ?? 0} | LOP Days {item.payload?.lopDays ?? item.payload?.lop_days ?? 0} | LOP Deduction {formatMoney(item.payload?.lopAmount ?? item.payload?.lop_amount ?? 0)}
                    </div>
                    <div className="muted">
                      Deductions = PF {formatMoney(item.payload?.employeePf)} + ESI {formatMoney(item.payload?.employeeEsi)} + LWF {formatMoney(item.payload?.employeeLwf)} + PT {formatMoney(item.payload?.professionalTax)} + TDS {formatMoney(item.payload?.tds)} + Other {formatMoney(item.payload?.otherDeductions)}
                    </div>
                    <div className="muted">
                      Net Pay = Gross ({formatMoney(item.payload?.grossEarnings)}) - Deductions ({formatMoney(item.payload?.grossDeductions)}) = {formatMoney(item.payload?.netSalary)}
                    </div>
                    {item.payload?.remarks ? <div className="muted">Remarks: {String(item.payload.remarks)}</div> : null}
                    <div className="muted">
                      Employer Cost = {Number(item.payload?.configuredMonthlyCtc || 0) > 0
                        ? `Configured Monthly CTC (${formatMoney(item.payload?.configuredMonthlyCtc)})`
                        : `Computed (${formatMoney(item.payload?.grossEarnings)} + ${formatMoney(item.payload?.employerPf)} + ${formatMoney(item.payload?.employerEsi)} + ${formatMoney(item.payload?.employerLwf)} + ${formatMoney(item.payload?.gratuityProvision)} + ${formatMoney(item.payload?.healthInsuranceBenefit)}) = ${formatMoney(item.payload?.computedEmployerCost)}`}
                    </div>
                  </td>
                </tr>
              ))}
              {!(selectedRunDetail?.items || []).length ? <tr><td colSpan="6"><div className="empty-state compact-empty">Select and calculate a run to view details.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </PayrollRunsSection>

      <PayrollFbpSection visible={showFbpHeads} kicker="FBP Heads" title="Manage FBP Policy Heads">
        {showFbpHeads && status ? <div className="status">{status}</div> : null}
        <div className="form-grid three-col">
          <label><span>Head name</span><input value={fbpForm.headName} onChange={(e) => setFbpForm((c) => ({ ...c, headName: e.target.value }))} /></label>
          <label><span>Monthly limit</span><input type="number" value={fbpForm.monthlyLimit} onChange={(e) => setFbpForm((c) => ({ ...c, monthlyLimit: e.target.value }))} /></label>
          <label><span>Annual limit</span><input type="number" value={fbpForm.annualLimit} onChange={(e) => setFbpForm((c) => ({ ...c, annualLimit: e.target.value }))} /></label>
          <label className="checkbox-row"><input type="checkbox" checked={fbpForm.proofRequired} onChange={(e) => setFbpForm((c) => ({ ...c, proofRequired: e.target.checked }))} /><span>Proof required</span></label>
          <label className="checkbox-row"><input type="checkbox" checked={fbpForm.taxableIfUnclaimed} onChange={(e) => setFbpForm((c) => ({ ...c, taxableIfUnclaimed: e.target.checked }))} /><span>Taxable if unclaimed</span></label>
          <label className="checkbox-row"><input type="checkbox" checked={fbpForm.active} onChange={(e) => setFbpForm((c) => ({ ...c, active: e.target.checked }))} /><span>Active</span></label>
        </div>
        <div className="button-row"><button onClick={() => void saveFbpHead()}>{fbpForm.id ? "Update FBP head" : "Save FBP head"}</button></div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead><tr><th>Head</th><th>Monthly</th><th>Annual</th><th>Proof</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {fbpHeads.map((item) => <tr key={item.id}><td>{item.headName}</td><td>{item.monthlyLimit}</td><td>{item.annualLimit}</td><td>{item.proofRequired ? "Yes" : "No"}</td><td>{item.active ? "Active" : "Inactive"}</td><td><div className="button-row tight"><button className="ghost-btn" onClick={() => setFbpForm({ id: item.id, headName: item.headName, monthlyLimit: item.monthlyLimit, annualLimit: item.annualLimit, proofRequired: item.proofRequired, taxableIfUnclaimed: item.taxableIfUnclaimed, active: item.active })}>Edit</button><button className="ghost-btn" onClick={() => void saveCompanyFbpHeadDeactivate(item.id)}>Deactivate</button></div></td></tr>)}
              {!fbpHeads.length ? <tr><td colSpan="6"><div className="empty-state compact-empty">No FBP heads yet.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </PayrollFbpSection>
      <PayrollFbpSection visible={showFbpClaims} kicker="FBP" title="FBP Declarations & Approvals">
        {showFbpClaims && status ? <div className="status">{status}</div> : null}
        {suggestRecalculateAfterFbp && selectedRunId ? (
          <div className="button-row" style={{ marginBottom: 8 }}>
            <button
              className="ghost-btn"
              onClick={() => {
                setSuggestRecalculateAfterFbp(false);
                void runAction("calculate");
              }}
            >
              Recalculate Selected Run Now
            </button>
          </div>
        ) : null}
        <div className="form-grid three-col">
          <label>
            <span>Employee</span>
            <select value={declarationForm.employeeId} onChange={(e) => setDeclarationForm((c) => ({ ...c, employeeId: e.target.value }))}>
              <option value="">Select employee</option>
              {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.employeeCode} - {emp.fullName}</option>)}
            </select>
          </label>
          <label>
            <span>FBP head</span>
            <select value={declarationForm.headId} onChange={(e) => setDeclarationForm((c) => ({ ...c, headId: e.target.value }))}>
              <option value="">Select head</option>
              {(fbpHeads || []).filter((item) => item.active !== false).map((item) => <option key={item.id} value={item.id}>{item.headName}</option>)}
            </select>
          </label>
          <label><span>Declared amount</span><input type="number" value={declarationForm.declaredAmount} onChange={(e) => setDeclarationForm((c) => ({ ...c, declaredAmount: e.target.value }))} /></label>
          <label className="full"><span>Notes</span><input value={declarationForm.notes} onChange={(e) => setDeclarationForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Optional declaration note" /></label>
          <label><span>Doc name</span><input value={declarationForm.docLabel} onChange={(e) => setDeclarationForm((c) => ({ ...c, docLabel: e.target.value }))} placeholder="Rent receipt Apr" /></label>
          <label><span>Doc URL</span><input value={declarationForm.docUrl} onChange={(e) => setDeclarationForm((c) => ({ ...c, docUrl: e.target.value }))} placeholder="Auto after upload" /></label>
          <label><span>Doc note</span><input value={declarationForm.docNote} onChange={(e) => setDeclarationForm((c) => ({ ...c, docNote: e.target.value }))} placeholder="Optional" /></label>
          <label className="full">
            <span>Upload proof file</span>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
              onChange={(e) => {
                const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                if (file) void uploadDeclarationDoc(file);
                e.currentTarget.value = "";
              }}
              disabled={declarationDocUploading}
            />
          </label>
        </div>
        <div className="button-row"><button onClick={() => void submitFbpDeclaration()}>Submit declaration</button></div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead><tr><th>Employee</th><th>Head</th><th>Declared</th><th>Approved</th><th>Status</th><th>Decided At</th><th>Decided By</th><th>Rejection Reason</th><th>Docs</th><th>Actions</th></tr></thead>
            <tbody>
              {(fbpDeclarations || []).map((item) => {
                const emp = employees.find((e) => String(e.id || "") === String(item.employeeId || ""));
                const docs = Array.isArray(item.docs) ? item.docs : [];
                return (
                  <tr key={item.id}>
                    <td>{emp ? `${emp.employeeCode} - ${emp.fullName}` : item.employeeId}</td>
                    <td>{item.headName || "-"}</td>
                    <td>{item.declaredAmount || 0}</td>
                    <td>
                      <input
                        type="number"
                        value={fbpApprovalAmounts[String(item.id || "")] ?? (item.approvedAmount ?? item.declaredAmount ?? 0)}
                        onChange={(e) => setFbpApprovalAmounts((current) => ({ ...current, [String(item.id || "")]: e.target.value }))}
                        disabled={String(item.status || "") === "rejected"}
                        style={{ width: 110 }}
                      />
                    </td>
                    <td>{item.status || "-"}</td>
                    <td>{item.decidedAt ? new Date(item.decidedAt).toLocaleString() : "-"}</td>
                    <td>{item.decidedBy ? (userNameById.get(String(item.decidedBy || "").trim()) || String(item.decidedBy).slice(0, 8)) : "-"}</td>
                    <td>{item.rejectionReason || "-"}</td>
                    <td>{docs.length ? <a href={String(docs[0]?.url || "#")} target="_blank" rel="noreferrer">{String(docs[0]?.label || "Document")}</a> : "-"}</td>
                    <td>
                      <div className="button-row tight">
                        <button className="ghost-btn" onClick={() => void reviewDeclaration(item.id, "approve")} disabled={String(item.status || "") === "approved"}>Approve</button>
                        <button className="ghost-btn" onClick={() => void reviewDeclaration(item.id, "reject")} disabled={String(item.status || "") === "rejected"}>Reject</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!(fbpDeclarations || []).length ? <tr><td colSpan="10"><div className="empty-state compact-empty">No declarations for selected month/year.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </PayrollFbpSection>
      <PayrollPayslipsSection visible={showPayslips} kicker="Payslips" title="Payslip Publish">
        {showPayslips && status ? <div className="status">{status}</div> : null}
        <div className="button-row">
          <button onClick={() => void publishPayslipsForSelectedRun()} disabled={!selectedRunId}>Publish payslips for selected run</button>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead><tr><th>Employee</th><th>Month/Year</th><th>Status</th><th>Published At</th></tr></thead>
            <tbody>
              {(payrollPayslips || []).map((item) => {
                const emp = employees.find((e) => String(e.id || "") === String(item.employeeId || ""));
                return (
                  <tr key={item.id}>
                    <td>{emp ? `${emp.employeeCode} - ${emp.fullName}` : item.employeeId}</td>
                    <td>{item.payrollMonth}/{item.payrollYear}</td>
                    <td>{item.status || "-"}</td>
                    <td>{item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "-"}</td>
                  </tr>
                );
              })}
              {!(payrollPayslips || []).length ? <tr><td colSpan="4"><div className="empty-state compact-empty">No published payslips yet.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </PayrollPayslipsSection>
    </div>
  );
}

function EmployeePortalApp({ token, onLogout }) {
  const [employeeUser, setEmployeeUser] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [attendanceItems, setAttendanceItems] = useState([]);
  const [payrollDocs, setPayrollDocs] = useState([]);
  const [employeeFbpDeclarations, setEmployeeFbpDeclarations] = useState([]);
  const [employeeFbpHeads, setEmployeeFbpHeads] = useState([]);
  const [employeeFbpForm, setEmployeeFbpForm] = useState({
    headName: "",
    declaredAmount: "",
    notes: "",
    docLabel: "",
    docUrl: "",
    docNote: ""
  });
  const [employeeFbpDocUploading, setEmployeeFbpDocUploading] = useState(false);
  const [selectedPayslipId, setSelectedPayslipId] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadEmployeePortal() {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = `${today.slice(0, 8)}01`;
    // Session validity should be decided only by /employee-auth/me.
    // Attendance endpoints may fail due to partial setup and should not auto-logout the user.
    const meResult = await api("/employee-auth/me", token);
    const now = new Date();
    const [dashboardResult, attendanceResult, payrollDocsResult, fbpResult, fbpHeadsResult] = await Promise.all([
      api("/employee/dashboard", token).catch(() => ({ todayAttendance: null })),
      api(`/employee/attendance?dateFrom=${encodeURIComponent(monthStart)}&dateTo=${encodeURIComponent(today)}`, token)
        .catch(() => ({ items: [] })),
      api("/employee/payroll-docs", token).catch(() => ({ items: [] })),
      api(`/employee/payroll/fbp-declarations?payrollMonth=${now.getMonth() + 1}&payrollYear=${now.getFullYear()}`, token).catch(() => ({ items: [] })),
      api("/employee/payroll/fbp-heads", token).catch(() => ({ items: [] }))
    ]);
    setEmployeeUser(meResult.user || meResult);
    setTodayAttendance(dashboardResult.todayAttendance || null);
    setAttendanceItems(Array.isArray(attendanceResult.items) ? attendanceResult.items : []);
    setPayrollDocs(Array.isArray(payrollDocsResult.items) ? payrollDocsResult.items : []);
    setEmployeeFbpDeclarations(Array.isArray(fbpResult.items) ? fbpResult.items : []);
    setEmployeeFbpHeads(Array.isArray(fbpHeadsResult.items) ? fbpHeadsResult.items : []);
  }
  useEffect(() => {
    void loadEmployeePortal().catch((error) => {
      const message = String(error?.message || error);
      if (/invalid|missing employee session|unauthorized|401/i.test(message)) {
        onLogout();
        return;
      }
      setStatus(message || "Unable to load employee portal data.");
    });
  }, [token]);

  async function markAttendance(action) {
    try {
      setBusy(true);
      setStatus(action === "check_in" ? "Capturing location for check-in..." : "Capturing location for check-out...");
      const position = await getCurrentPositionAsync();
      await api(action === "check_in" ? "/employee/attendance/check-in" : "/employee/attendance/check-out", token, "POST", {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        addressLabel: "",
        note: "",
        device: getBrowserDevicePayload()
      });
      await loadEmployeePortal();
      setStatus(action === "check_in" ? "Checked in successfully." : "Checked out successfully.");
    } catch (error) {
      setStatus(String(error?.message || error));
    } finally {
      setBusy(false);
    }
  }

  const activeOpenAttendance = useMemo(() => {
    const openFromList = (attendanceItems || [])
      .filter((item) => item?.checkInAt && !item?.checkOutAt)
      .sort((a, b) => safeTime(b?.checkInAt) - safeTime(a?.checkInAt))[0];
    if (openFromList) return openFromList;
    if (todayAttendance?.checkInAt && !todayAttendance?.checkOutAt) return todayAttendance;
    return null;
  }, [attendanceItems, todayAttendance]);

  const isCheckedIn = Boolean(activeOpenAttendance);
  const displayAttendance = activeOpenAttendance || todayAttendance;
  const selectedPayslip = useMemo(
    () => (payrollDocs || []).find((item) => String(item?.id || "") === String(selectedPayslipId || "")) || null,
    [payrollDocs, selectedPayslipId]
  );
  const formatMoney = (value) => {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return "0.00";
    return n.toFixed(2);
  };
  async function uploadEmployeeFbpDoc(file) {
    try {
      if (!file) return;
      setEmployeeFbpDocUploading(true);
      setStatus("Uploading FBP proof...");
      const fileData = await fileToBase64(file);
      const result = await api("/employee/payroll/fbp-doc/upload", token, "POST", {
        file: {
          filename: file.name || "fbp-proof.bin",
          mimeType: file.type || "application/octet-stream",
          fileData
        }
      });
      setEmployeeFbpForm((current) => ({
        ...current,
        docLabel: current.docLabel || String(result?.filename || file.name || "Document"),
        docUrl: String(result?.url || "").trim()
      }));
      setStatus("FBP proof uploaded.");
    } catch (error) {
      setStatus(String(error?.message || error));
    } finally {
      setEmployeeFbpDocUploading(false);
    }
  }
  async function submitEmployeeFbpDeclaration() {
    try {
      const headName = String(employeeFbpForm.headName || "").trim();
      if (!headName) throw new Error("Please enter FBP head.");
      const now = new Date();
      const docs = String(employeeFbpForm.docUrl || "").trim()
        ? [{
          label: String(employeeFbpForm.docLabel || "Document").trim() || "Document",
          url: String(employeeFbpForm.docUrl || "").trim(),
          note: String(employeeFbpForm.docNote || "").trim()
        }]
        : [];
      await api("/employee/payroll/fbp-declarations", token, "POST", {
        headName,
        declaredAmount: Number(employeeFbpForm.declaredAmount || 0) || 0,
        notes: String(employeeFbpForm.notes || "").trim(),
        payrollMonth: now.getMonth() + 1,
        payrollYear: now.getFullYear(),
        docs
      });
      setEmployeeFbpForm({ headName: "", declaredAmount: "", notes: "", docLabel: "", docUrl: "", docNote: "" });
      await loadEmployeePortal();
      setStatus("FBP declaration submitted.");
    } catch (error) {
      setStatus(String(error?.message || error));
    }
  }

  return (
    <div className="app-shell app-shell--client">
      <main className="content client-portal-content">
        <header className="workspace-header client-portal-header">
          <div>
            <BrandLogo size="sm" />
            <div className="section-kicker">{employeeUser?.clientName || employeeUser?.companyName || "Employee Workspace"}</div>
            <h1>{PRODUCT_NAME} Employee Portal</h1>
          </div>
          <div className="client-user-pill">
            {employeeUser?.fullName ? <span>{employeeUser.fullName}</span> : null}
            <button className="ghost-btn" onClick={onLogout}>Logout</button>
          </div>
        </header>

        <div className="page-grid">
          <Section kicker="Employee" title="Today">
            <p className="muted">Mark attendance with live location from your mobile or browser.</p>
            {status ? <div className="status">{status}</div> : null}
            <div className="metric-grid dashboard-metric-grid client-portal-metric-grid">
              <div className="metric-card">
                <div className="metric-label">Employee Code</div>
                <div className="metric-value">{employeeUser?.employeeCode || "-"}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Designation</div>
                <div className="metric-value">{employeeUser?.designation || "-"}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Check In</div>
                <div className="metric-value">{displayAttendance?.checkInAt ? new Date(displayAttendance.checkInAt).toLocaleTimeString() : "-"}</div>
              </div>
              <div className="metric-card">
                <div className="metric-label">Check Out</div>
                <div className="metric-value">{displayAttendance?.checkOutAt ? new Date(displayAttendance.checkOutAt).toLocaleTimeString() : "-"}</div>
              </div>
            </div>
            <div className="button-row">
              {!isCheckedIn ? <button disabled={busy} onClick={() => void markAttendance("check_in")}>{busy ? "Please wait..." : "Check In"}</button> : null}
              {isCheckedIn ? <button disabled={busy} onClick={() => void markAttendance("check_out")}>{busy ? "Please wait..." : "Check Out"}</button> : null}
            </div>
          </Section>

          <Section kicker="Attendance Log" title="This Month">
            <div className="table-wrap">
              <table className="dashboard-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Check In</th>
                    <th>Check-In Status</th>
                    <th>Check-In Location</th>
                    <th>Check Out</th>
                    <th>Check-Out Status</th>
                    <th>Check-Out Location</th>
                    <th>In Accuracy</th>
                    <th>Out Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceItems.map((item) => (
                    <tr key={item.id}>
                      <td>{item.attendanceDate || "-"}</td>
                      <td>{item.checkInAt ? new Date(item.checkInAt).toLocaleString() : "-"}</td>
                      <td>{item.checkInAt ? formatEmployeeLocationStatusLabel(item.checkInLocationStatus || item.locationStatus) : "-"}</td>
                      <td>{formatEmployeeCoordinatePair(item.checkInLatitude, item.checkInLongitude)}</td>
                      <td>{item.checkOutAt ? new Date(item.checkOutAt).toLocaleString() : "-"}</td>
                      <td>{item.checkOutAt ? formatEmployeeLocationStatusLabel(item.checkOutLocationStatus || item.locationStatus) : "-"}</td>
                      <td>{formatEmployeeCoordinatePair(item.checkOutLatitude, item.checkOutLongitude)}</td>
                      <td>{formatAccuracyWithOfficeDistance({
                        accuracyMeters: item.checkInAccuracyMeters,
                        locationStatus: item.checkInLocationStatus || item.locationStatus,
                        distanceFromSiteMeters: item.checkInDistanceFromSiteMeters ?? item.distanceFromSiteMeters
                      })}</td>
                      <td>{formatAccuracyWithOfficeDistance({
                        accuracyMeters: item.checkOutAccuracyMeters,
                        locationStatus: item.checkOutLocationStatus || item.locationStatus,
                        distanceFromSiteMeters: item.checkOutDistanceFromSiteMeters ?? item.distanceFromSiteMeters
                      })}</td>
                    </tr>
                  ))}
                  {!attendanceItems.length ? <tr><td colSpan="9"><div className="empty-state compact-empty">No attendance records yet.</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          </Section>
          <Section kicker="Payroll" title="My Payroll Docs">
            <div className="table-wrap">
              <table className="dashboard-table">
                <thead><tr><th>Month/Year</th><th>Status</th><th>Published At</th><th>Net Salary</th><th>Action</th></tr></thead>
                <tbody>
                  {(payrollDocs || []).map((doc) => (
                    <tr key={doc.id}>
                      <td>{doc.payrollMonth}/{doc.payrollYear}</td>
                      <td>{doc.status || "-"}</td>
                      <td>{doc.publishedAt ? new Date(doc.publishedAt).toLocaleString() : "-"}</td>
                      <td>{Number(doc?.payload?.netSalary || doc?.payload?.net_salary || 0).toFixed(2)}</td>
                      <td>
                        <div className="button-row tight">
                          <button className="ghost-btn" onClick={() => setSelectedPayslipId(String(doc.id || ""))}>View Payslip</button>
                          <button className="ghost-btn" onClick={() => window.open(`/employee/payroll/payslip?id=${encodeURIComponent(String(doc.id || ""))}&access_token=${encodeURIComponent(token)}`, "_blank", "noopener,noreferrer")}>Printable / PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!payrollDocs.length ? <tr><td colSpan="5"><div className="empty-state compact-empty">No payroll documents published yet.</div></td></tr> : null}
                </tbody>
              </table>
            </div>
            {selectedPayslip ? (
              <div className="item-card compact-card" style={{ marginTop: 12 }}>
                <div className="section-kicker">Payslip Preview</div>
                <h3>{selectedPayslip.payrollMonth}/{selectedPayslip.payrollYear} | {employeeUser?.fullName || "Employee"}</h3>
                <div className="muted">Published: {selectedPayslip.publishedAt ? new Date(selectedPayslip.publishedAt).toLocaleString() : "-"}</div>
                <div className="table-wrap" style={{ marginTop: 10 }}>
                  <table className="dashboard-table">
                    <tbody>
                      <tr><th>Total Days</th><td>{selectedPayslip?.payload?.totalDays ?? selectedPayslip?.payload?.total_days ?? "-"}</td><th>Payable Days</th><td>{selectedPayslip?.payload?.payableDays ?? selectedPayslip?.payload?.payable_days ?? "-"}</td></tr>
                      <tr><th>Paid Leave Days</th><td>{selectedPayslip?.payload?.paidLeaveDays ?? selectedPayslip?.payload?.paid_leave_days ?? "-"}</td><th>LOP Days</th><td>{selectedPayslip?.payload?.lopDays ?? selectedPayslip?.payload?.lop_days ?? "-"}</td></tr>
                      <tr><th>LOP Deduction</th><td>{formatMoney(selectedPayslip?.payload?.lopAmount ?? selectedPayslip?.payload?.lop_amount ?? 0)}</td><th>Net Salary</th><td>{formatMoney(selectedPayslip?.payload?.netSalary ?? 0)}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div className="table-wrap" style={{ marginTop: 10 }}>
                  <table className="dashboard-table">
                    <thead><tr><th>Earnings</th><th>Amount</th><th>Deductions</th><th>Amount</th></tr></thead>
                    <tbody>
                      <tr><td>Basic</td><td>{formatMoney(selectedPayslip?.payload?.proratedBasic ?? 0)}</td><td>Employee PF</td><td>{formatMoney(selectedPayslip?.payload?.employeePf ?? 0)}</td></tr>
                      <tr><td>HRA</td><td>{formatMoney(selectedPayslip?.payload?.proratedHra ?? 0)}</td><td>Employee ESI</td><td>{formatMoney(selectedPayslip?.payload?.employeeEsi ?? 0)}</td></tr>
                      <tr><td>FBP</td><td>{formatMoney(selectedPayslip?.payload?.proratedFbp ?? 0)}</td><td>Employee LWF</td><td>{formatMoney(selectedPayslip?.payload?.employeeLwf ?? 0)}</td></tr>
                      <tr><td>Special Allowance</td><td>{formatMoney(selectedPayslip?.payload?.proratedSpecialAllowance ?? 0)}</td><td>Professional Tax</td><td>{formatMoney(selectedPayslip?.payload?.professionalTax ?? 0)}</td></tr>
                      <tr><td>Other Earnings</td><td>{formatMoney(selectedPayslip?.payload?.otherEarnings ?? 0)}</td><td>TDS</td><td>{formatMoney(selectedPayslip?.payload?.tds ?? 0)}</td></tr>
                      <tr><td>Approved Reimbursements</td><td>{formatMoney(selectedPayslip?.payload?.approvedReimbursements ?? 0)}</td><td>Other Deductions</td><td>{formatMoney(selectedPayslip?.payload?.otherDeductions ?? 0)}</td></tr>
                      <tr><th>Gross Earnings</th><th>{formatMoney(selectedPayslip?.payload?.grossEarnings ?? 0)}</th><th>Gross Deductions</th><th>{formatMoney(selectedPayslip?.payload?.grossDeductions ?? 0)}</th></tr>
                      <tr><th colSpan="3">Net Pay</th><th>{formatMoney(selectedPayslip?.payload?.netSalary ?? 0)}</th></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </Section>
          <Section kicker="Payroll" title="My FBP Declarations">
            <div className="form-grid three-col">
              <label><span>FBP Head</span>
                <select value={employeeFbpForm.headName} onChange={(e) => setEmployeeFbpForm((c) => ({ ...c, headName: e.target.value }))}>
                  <option value="">Select FBP head</option>
                  {(employeeFbpHeads || []).map((h) => <option key={h.id || h.headName} value={h.headName}>{h.headName}</option>)}
                </select>
              </label>
              <label><span>Declared Amount</span><input type="number" value={employeeFbpForm.declaredAmount} onChange={(e) => setEmployeeFbpForm((c) => ({ ...c, declaredAmount: e.target.value }))} /></label>
              <label><span>Notes</span><input value={employeeFbpForm.notes} onChange={(e) => setEmployeeFbpForm((c) => ({ ...c, notes: e.target.value }))} placeholder="Optional" /></label>
              <label><span>Doc name</span><input value={employeeFbpForm.docLabel} onChange={(e) => setEmployeeFbpForm((c) => ({ ...c, docLabel: e.target.value }))} placeholder="Bill Apr" /></label>
              <label><span>Doc URL</span><input value={employeeFbpForm.docUrl} onChange={(e) => setEmployeeFbpForm((c) => ({ ...c, docUrl: e.target.value }))} placeholder="Auto after upload" /></label>
              <label><span>Doc note</span><input value={employeeFbpForm.docNote} onChange={(e) => setEmployeeFbpForm((c) => ({ ...c, docNote: e.target.value }))} placeholder="Optional" /></label>
              <label className="full">
                <span>Upload proof file</span>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                  onChange={(e) => {
                    const file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
                    if (file) void uploadEmployeeFbpDoc(file);
                    e.currentTarget.value = "";
                  }}
                  disabled={employeeFbpDocUploading}
                />
              </label>
            </div>
            <div className="button-row">
              <button onClick={() => void submitEmployeeFbpDeclaration()} disabled={employeeFbpDocUploading}>Submit FBP Declaration</button>
            </div>
            <div className="table-wrap">
              <table className="dashboard-table">
                <thead><tr><th>Head</th><th>Declared</th><th>Approved</th><th>Status</th><th>Doc</th><th>Remark</th></tr></thead>
                <tbody>
                  {(employeeFbpDeclarations || []).map((item) => {
                    const docs = Array.isArray(item.docs) ? item.docs : [];
                    return (
                      <tr key={item.id}>
                        <td>{item.headName || "-"}</td>
                        <td>{Number(item.declaredAmount || 0).toFixed(2)}</td>
                        <td>{Number(item.approvedAmount || 0).toFixed(2)}</td>
                        <td>{item.status || "-"}</td>
                        <td>{docs.length ? <a href={String(docs[0]?.url || "#")} target="_blank" rel="noreferrer">{String(docs[0]?.label || "Document")}</a> : "-"}</td>
                        <td>{item.rejectionReason || item.notes || "-"}</td>
                      </tr>
                    );
                  })}
                  {!employeeFbpDeclarations.length ? <tr><td colSpan="6"><div className="empty-state compact-empty">No FBP declarations yet.</div></td></tr> : null}
                </tbody>
              </table>
            </div>
          </Section>
          <footer className="portal-footer portal-footer--content">{COMPANY_ATTRIBUTION} | employee-mvp</footer>
        </div>
      </main>
    </div>
  );
}

function formatWorkspaceUserRoleLabel(roleValue = "") {
  const role = String(roleValue || "").trim().toLowerCase();
  if (role === "admin") return "Admin";
  if (role === "payroll_owner") return "Payroll Owner";
  if (role === "payroll_manager") return "Payroll Manager";
  return "Recruiter";
}

function PayrollAdminApp({ token, onLogout }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [users, setUsers] = useState([]);
  const [summary, setSummary] = useState({
    activeEmployees: 0,
    monthlyPayrollAmount: 0,
    pendingFbpClaims: 0,
    pendingPayslips: 0,
    missingCompliance: 0
  });
  const [status, setStatus] = useState("");
  async function loadPayrollAdminData() {
    await api("/payroll-auth/me", token);
    const [employeesEnvelope, usersEnvelope, runsEnvelope, declarationsEnvelope, payslipsEnvelope] = await Promise.all([
      api("/company/employees", token).catch(() => ({ employees: [] })),
      api("/company/users", token).catch(() => ({ users: [] })),
      api("/company/payroll/runs", token).catch(() => ({ items: [] })),
      api("/company/payroll/fbp-declarations", token).catch(() => ({ items: [] })),
      api("/company/payroll/payslips", token).catch(() => ({ items: [] }))
    ]);
    const employeeRows = Array.isArray(employeesEnvelope?.employees) ? employeesEnvelope.employees : [];
    const userRows = Array.isArray(usersEnvelope?.users) ? usersEnvelope.users : [];
    const runRows = Array.isArray(runsEnvelope?.items) ? runsEnvelope.items : [];
    const declarationRows = Array.isArray(declarationsEnvelope?.items) ? declarationsEnvelope.items : [];
    const payslipRows = Array.isArray(payslipsEnvelope?.items) ? payslipsEnvelope.items : [];
    setEmployees(employeeRows);
    setUsers(userRows);
    const latestRun = runRows[0] || null;
    const monthlyPayrollAmount = Number(latestRun?.totals?.netSalary || latestRun?.totals?.net_salary || 0);
    const pendingFbpClaims = declarationRows.filter((item) => String(item?.status || "").toLowerCase() === "pending").length;
    const pendingPayslips = payslipRows.filter((item) => !item?.publishedAt && !item?.published_at).length;
    const missingCompliance = employeeRows.filter((item) => !String(item?.pan || "").trim() || !String(item?.uan || "").trim() || !String(item?.bankAccountNumber || item?.bank_account_number || "").trim()).length;
    setSummary({
      activeEmployees: employeeRows.length,
      monthlyPayrollAmount,
      pendingFbpClaims,
      pendingPayslips,
      missingCompliance
    });
  }

  useEffect(() => {
    const path = String(location?.pathname || "");
    if (path === "/payroll" || path === "/payroll/") navigate("/payroll/dashboard", { replace: true });
  }, [location?.pathname, navigate]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await loadPayrollAdminData();
        if (!active) return;
      } catch (error) {
        if (!active) return;
        setStatus(String(error?.message || error));
      }
    })();
    return () => { active = false; };
  }, [token]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <BrandLogo size="md" />
          <p className="muted" style={{ margin: "0.35rem 0 1rem" }}>Payroll Admin</p>
          <nav className="nav">
            {PAYROLL_NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-btn${isActive ? " active" : ""}`}>{item.label}</NavLink>
            ))}
          </nav>
        </div>
        <button className="ghost-btn" onClick={onLogout}>Logout</button>
      </aside>
      <main className="main-panel">
        {status ? <div className="status error">{status}</div> : null}
        <Routes>
          <Route path="/payroll/dashboard" element={
            <div className="page-grid">
              <Section kicker="Payroll Overview" title="Payroll Dashboard">
                <div className="stats-grid">
                  <article className="stat-card"><h3>Active Employees</h3><p>{summary.activeEmployees}</p></article>
                  <article className="stat-card"><h3>Monthly Payroll Amount</h3><p>{Number(summary.monthlyPayrollAmount || 0).toFixed(2)}</p></article>
                  <article className="stat-card"><h3>Pending FBP Claims</h3><p>{summary.pendingFbpClaims}</p></article>
                  <article className="stat-card"><h3>Pending Payslips</h3><p>{summary.pendingPayslips}</p></article>
                  <article className="stat-card"><h3>Missing PAN/UAN/Bank</h3><p>{summary.missingCompliance}</p></article>
                </div>
              </Section>
            </div>
          } />
          <Route path="/payroll/runs" element={<PayrollLiteAdminPage token={token} employees={employees} users={users} viewMode="runs" onEmployeesChanged={loadPayrollAdminData} />} />
          <Route path="/payroll/employees" element={<PayrollLiteAdminPage token={token} employees={employees} users={users} viewMode="employees" onEmployeesChanged={loadPayrollAdminData} />} />
          <Route path="/payroll/salary-structures" element={<PayrollLiteAdminPage token={token} employees={employees} users={users} viewMode="salary" onEmployeesChanged={loadPayrollAdminData} />} />
          <Route path="/payroll/attendance-lop" element={<PayrollLiteAdminPage token={token} employees={employees} users={users} viewMode="attendance" onEmployeesChanged={loadPayrollAdminData} />} />
          <Route path="/payroll/fbp-claims" element={<PayrollLiteAdminPage token={token} employees={employees} users={users} viewMode="fbp" onEmployeesChanged={loadPayrollAdminData} />} />
          <Route path="/payroll/payslips" element={<PayrollLiteAdminPage token={token} employees={employees} users={users} viewMode="payslips" onEmployeesChanged={loadPayrollAdminData} />} />
          <Route path="/payroll/statutory-settings" element={<PayrollLiteAdminPage token={token} employees={employees} users={users} viewMode="statutory" onEmployeesChanged={loadPayrollAdminData} />} />
          <Route path="*" element={<Navigate to="/payroll/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const clientPortalUrl = isClientPortalUrl();
  const employeePortalUrl = isEmployeePortalUrl();
  const payrollPortalUrl = isPayrollPortalUrl();
  const forcedMode = payrollPortalUrl ? "payroll" : employeePortalUrl ? "employee" : clientPortalUrl ? "client" : "recruiter";
  const [authMode, setAuthMode] = useState(() => forcedMode);
  const [token, setToken] = useState(() => forcedMode === "client"
    ? (window.localStorage.getItem(CLIENT_TOKEN_KEY) || "")
    : forcedMode === "employee"
      ? (window.localStorage.getItem(EMPLOYEE_TOKEN_KEY) || "")
      : forcedMode === "payroll"
        ? (window.localStorage.getItem(PAYROLL_TOKEN_KEY) || "")
      : (window.localStorage.getItem(TOKEN_KEY) || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setAuthMode(forcedMode);
    setToken(forcedMode === "client"
      ? (window.localStorage.getItem(CLIENT_TOKEN_KEY) || "")
      : forcedMode === "employee"
        ? (window.localStorage.getItem(EMPLOYEE_TOKEN_KEY) || "")
        : forcedMode === "payroll"
          ? (window.localStorage.getItem(PAYROLL_TOKEN_KEY) || "")
        : (window.localStorage.getItem(TOKEN_KEY) || ""));
  }, [forcedMode]);

  useEffect(() => {
    document.title = forcedMode === "client" ? CLIENT_BROWSER_TITLE : forcedMode === "employee" ? `${PRODUCT_NAME} Employee Portal` : forcedMode === "payroll" ? `${PRODUCT_NAME} Payroll Admin` : RECRUITER_BROWSER_TITLE;
  }, [forcedMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (authMode !== "payroll" || !token) return;
    const pathname = String(window.location.pathname || "");
    if (pathname === "/payroll" || pathname === "/payroll-login") {
      window.history.replaceState({}, "", "/payroll/dashboard");
    }
  }, [authMode, token]);

  async function loginRecruiter({ email, password }) {
    try {
      setBusy(true);
      setError("");
      const result = await api("/auth/login", "", "POST", { email, password, accessContext: "portal" });
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

  async function loginEmployeeUser({ username, password }) {
    try {
      setBusy(true);
      setError("");
      const result = await api("/employee-auth/login", "", "POST", { username, password });
      localStorage.setItem(EMPLOYEE_TOKEN_KEY, result.token || "");
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(CLIENT_TOKEN_KEY);
      localStorage.removeItem(PAYROLL_TOKEN_KEY);
      localStorage.setItem(AUTH_MODE_KEY, "employee");
      setAuthMode("employee");
      setToken(result.token || "");
    } catch (loginError) {
      setError(String(loginError?.message || loginError));
    } finally {
      setBusy(false);
    }
  }
  const loginEmployee = loginEmployeeUser;
  const loginEmployer = loginEmployeeUser;
  async function loginPayrollUser({ email, password }) {
    try {
      setBusy(true);
      setError("");
      const result = await api("/payroll-auth/login", "", "POST", { email, password });
      localStorage.setItem(PAYROLL_TOKEN_KEY, result.token || "");
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(CLIENT_TOKEN_KEY);
      localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
      localStorage.setItem(AUTH_MODE_KEY, "payroll");
      setAuthMode("payroll");
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
    localStorage.removeItem(EMPLOYEE_TOKEN_KEY);
    localStorage.removeItem(PAYROLL_TOKEN_KEY);
    localStorage.removeItem(AUTH_MODE_KEY);
    setAuthMode(forcedMode);
    setToken("");
  }

  if (!token) return <LoginScreen onRecruiterLogin={loginRecruiter} onClientLogin={loginClientUser} onEmployeeLogin={loginEmployee} onEmployerLogin={loginEmployer} onPayrollLogin={loginPayrollUser} busy={busy} error={error} forcedMode={forcedMode === "recruiter" ? "" : forcedMode} />;
  return authMode === "client"
    ? <PortalErrorBoundary><ClientPortalApp token={token} onLogout={logout} /></PortalErrorBoundary>
    : authMode === "employee"
      ? <PortalErrorBoundary><EmployeePortalApp token={token} onLogout={logout} /></PortalErrorBoundary>
      : authMode === "payroll"
        ? <PortalErrorBoundary><PayrollAdminApp token={token} onLogout={logout} /></PortalErrorBoundary>
        : <PortalErrorBoundary><PortalApp token={token} onLogout={logout} /></PortalErrorBoundary>;
}






