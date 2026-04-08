import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";

const TOKEN_KEY = "recruitdesk_portal_token";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/candidates", label: "Candidates" },
  { to: "/applicants", label: "Applied Candidates" },
  { to: "/captured-notes", label: "Captured Notes" },
  { to: "/assessments", label: "Assessments" },
  { to: "/interview", label: "Interview Panel" },
  { to: "/intake-settings", label: "Admin Intake Settings" },
  { to: "/jobs", label: "Jobs" }
];

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

function normalizeShortcutKey(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  return value.startsWith("/") ? value : `/${value.replace(/^\/+/, "")}`;
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

function normalizeRecruiterNotesBody(rawText) {
  const normalizedLines = splitStructuredDraftLines(rawText)
    .map((line) => String(line || "").replace(/^[\-\*]\s*/, "").trim())
    .map((line) => line.replace(/^recruiter notes\s*:?\s*/i, "").trim())
    .map((line) => line.replace(/^[.:;-]+/, "").trim())
    .map(polishStructuredBulletSentence)
    .filter(Boolean);

  const getLineKey = (line) => {
    const lower = String(line || "").toLowerCase().trim();
    if (!lower) return "";
    if (lower.startsWith("expected ctc")) return "expected_ctc";
    if (lower.startsWith("current ctc")) return "current_ctc";
    if (lower.startsWith("notice period")) return "notice_period";
    if (lower.startsWith("official notice period")) return "official_notice_period";
    if (lower.startsWith("location")) return "location";
    if (lower.startsWith("working model")) return "working_model";
    if (lower.startsWith("shift")) return "shift";
    if (lower.startsWith("relocation")) return "relocation";
    if (lower.startsWith("communication")) return "communication";
    return `free:${lower}`;
  };

  const orderedKeys = [];
  const valuesByKey = new Map();
  normalizedLines.forEach((line) => {
    const key = getLineKey(line);
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
    .join("\n");
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

function normalizeRecruiterMergeBase(item) {
  const source = item || {};
  return {
    name: String(source.name || source.candidateName || "").trim(),
    company: String(source.company || source.currentCompany || "").trim(),
    role: String(source.role || source.currentDesignation || "").trim(),
    experience: String(source.experience || source.totalExperience || "").trim(),
    location: String(source.location || "").trim(),
    current_ctc: String(source.current_ctc || source.currentCtc || "").trim(),
    expected_ctc: String(source.expected_ctc || source.expectedCtc || "").trim(),
    notice_period: String(source.notice_period || source.noticePeriod || "").trim(),
    offer_in_hand: String(source.offer_in_hand || source.offerInHand || "").trim(),
    phone: String(source.phone || source.phoneNumber || "").trim(),
    email: String(source.email || source.emailId || "").trim(),
    linkedin: String(source.linkedin || source.linkedinUrl || "").trim(),
    highest_education: String(source.highest_education || source.highestEducation || "").trim(),
    next_action: ""
  };
}

function extractRecruiterNoteFieldFallbacks(rawNote = "") {
  const text = String(rawNote || "").trim();
  if (!text) return { current_ctc: "", expected_ctc: "", notice_period: "", offer_in_hand: "" };
  const findValue = (patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return String(match[1]).trim();
    }
    return "";
  };
  const offerLine = text.split(/\r?\n/).map((line) => String(line || "").trim()).find((line) => /\boffer\b|\bdoj\b|\blwd\b|\blast\s*working\s*day\b/i.test(line));
  return {
    current_ctc: findValue([/\bcurrent\s*ctc(?:\s*is|:)?\s*([^\n,;.]+)/i, /\bcurrent\s*ctc\s*-\s*([^\n,;.]+)/i, /\bcurrent\s*[-:]\s*([^\n,;.]+)/i]),
    expected_ctc: findValue([/\bexpected\s*ctc(?:\s*is|:)?\s*([^\n,;.]+)/i, /\bexpected\s*ctc\s*-\s*([^\n,;.]+)/i, /\bexpected\s*[-:]\s*([^\n,;.]+)/i]),
    notice_period: findValue([/\bnotice\s*period(?:\s*is|:)?\s*([^\n,;.]+)/i, /\bnotice\s*period\s*-\s*([^\n,;.]+)/i, /\bnotice\s*[-:]\s*([^\n,;.]+)/i, /\bnp(?:\s*is|:)?\s*([^\n,;.]+)/i]),
    offer_in_hand: findValue([/\boffer\s*in\s*hand(?:\s*is|:)?\s*([^\n]+)/i, /\boffers?\s*in\s*hand(?:\s*is|:)?\s*([^\n]+)/i]) || (offerLine ? offerLine : "")
  };
}

function buildRecruiterMerge(item, parsed, rawNote = "") {
  const base = normalizeRecruiterMergeBase(item);
  const incoming = normalizeRecruiterMergeBase(parsed);
  const fallbacks = extractRecruiterNoteFieldFallbacks(rawNote);
  const merged = {};
  const overwritten = [];
  for (const key of Object.keys(base)) {
    const nextIncoming = incoming[key] || fallbacks[key] || "";
    merged[key] = nextIncoming || base[key] || "";
    if (nextIncoming && base[key] && nextIncoming.toLowerCase() !== base[key].toLowerCase()) {
      overwritten.push({ key, from: base[key], to: nextIncoming });
    }
  }
  merged.notes_append = String(rawNote || "").trim();
  return { base, incoming, merged, overwritten };
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
    offer_in_hand: "Offer in hand / DOJ / LWD",
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

function AssignModal({ open, applicant, users, jobs, onClose, onSave }) {
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
        <h3>Assign Applicant</h3>
        <p className="muted">Assign {applicant?.candidateName || "this applicant"} to a recruiter and JD.</p>
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
  const [rawRecruiterNote, setRawRecruiterNote] = useState("");
  const [parsedSummary, setParsedSummary] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const [mergedPatch, setMergedPatch] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open || !candidate) return;
    setRecruiterNote(String(candidate.recruiter_context_notes || ""));
    setOtherPointers(String(candidate.other_pointers || ""));
    setRawRecruiterNote("");
    setParsedSummary(null);
    setConflicts([]);
    setMergedPatch(null);
    setStatus("");
  }, [open, candidate]);

  if (!open || !candidate) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>Recruiter Note</h3>
        <p className="muted">{candidate.name || "Candidate"} | {candidate.jd_title || candidate.role || "No role set"}</p>
        <label><span>Raw recruiter note</span><textarea value={rawRecruiterNote} onChange={(e) => setRawRecruiterNote(e.target.value)} placeholder="Paste the discussion note here, then parse it before applying." /></label>
        <div className="button-row">
          <button onClick={async () => {
            if (!String(rawRecruiterNote || "").trim()) {
              setStatus("Type recruiter note first.");
              return;
            }
            setStatus("Parsing recruiter note...");
            try {
              const parsed = await onParse(rawRecruiterNote);
              const merge = buildRecruiterMerge(candidate, parsed || {}, rawRecruiterNote);
              setMergedPatch(merge);
              setConflicts(merge.overwritten || []);
              setParsedSummary(merge.merged || null);
              setRecruiterNote(normalizeRecruiterNotesBody(rawRecruiterNote));
              setOtherPointers(normalizeOtherPointersBody(rawRecruiterNote));
              setStatus(
                merge.overwritten?.length
                  ? `Recruiter note parsed. Conflicts found in ${merge.overwritten.map((entry) => formatRecruiterOverwriteLabel(entry.key)).join(", ")}.`
                  : "Recruiter note parsed. Review and apply."
              );
            } catch (error) {
              setStatus(String(error?.message || error));
            }
          }}>Parse recruiter note</button>
          <button className="ghost-btn" onClick={async () => {
            try {
              if (mergedPatch?.overwritten?.length) {
                const message = mergedPatch.overwritten.map((entry) => `${formatRecruiterOverwriteLabel(entry.key)}: "${entry.from}" -> "${entry.to}"`).join("\n");
                const confirmed = window.confirm(`These fields will be overwritten:\n\n${message}\n\nDo you want to apply this recruiter note?`);
                if (!confirmed) return;
              }
              const patch = {
                recruiter_context_notes: normalizeRecruiterNotesBody(rawRecruiterNote || recruiterNote),
                other_pointers: normalizeOtherPointersBody(rawRecruiterNote || otherPointers),
                company: mergedPatch?.merged?.company || undefined,
                role: mergedPatch?.merged?.role || undefined,
                experience: mergedPatch?.merged?.experience || undefined,
                location: mergedPatch?.merged?.location || undefined,
                current_ctc: mergedPatch?.merged?.current_ctc || undefined,
                expected_ctc: mergedPatch?.merged?.expected_ctc || undefined,
                notice_period: mergedPatch?.merged?.notice_period || undefined,
                offer_in_hand: mergedPatch?.merged?.offer_in_hand || undefined,
                phone: mergedPatch?.merged?.phone || undefined,
                email: mergedPatch?.merged?.email || undefined,
                linkedin: mergedPatch?.merged?.linkedin || undefined,
                highest_education: mergedPatch?.merged?.highest_education || undefined
              };
              await onPatch(patch, "Recruiter note applied.");
              setStatus("Recruiter note applied.");
              onClose();
            } catch (error) {
              setStatus(String(error?.message || error));
            }
          }}>Apply parsed note</button>
        </div>
        {parsedSummary ? (
          <div className="parsed-summary">
            <div className="info-label">Parsed summary</div>
            <div className="info-grid">
              {[["Candidate", parsedSummary.name],["Company", parsedSummary.company],["Role", parsedSummary.role],["Experience", parsedSummary.experience],["Location", parsedSummary.location],["Current CTC", parsedSummary.current_ctc],["Expected CTC", parsedSummary.expected_ctc],["Notice period", parsedSummary.notice_period],["Offer in hand", parsedSummary.offer_in_hand],["Phone", parsedSummary.phone],["Email", parsedSummary.email],["LinkedIn", parsedSummary.linkedin],["Highest education", parsedSummary.highest_education]].map(([label, value]) => value ? (
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
        <label><span>Other pointers</span><textarea value={otherPointers} onChange={(e) => setOtherPointers(e.target.value)} /></label>
        {status ? <div className="status">{status}</div> : null}
        <div className="button-row">
          <button onClick={async () => { setStatus("Saving notes..."); try { await onPatch({ recruiter_context_notes: normalizeRecruiterNotesBody(recruiterNote), other_pointers: normalizeOtherPointersBody(otherPointers) }, "Recruiter note updated."); onClose(); } catch (error) { setStatus(String(error?.message || error)); } }}>Save notes</button>
          <button className="ghost-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AttemptsModal({ open, candidate, attempts, onClose, onRefresh, onSave }) {
  const [outcome, setOutcome] = useState("Called");
  const [notes, setNotes] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open) return;
    setOutcome("Called");
    setNotes("");
    setNextFollowUpAt("");
    setStatus("");
  }, [open]);

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
              {!attempts.length ? <div className="empty-state">No attempts logged yet.</div> : attempts.map((item) => (
                <article key={item.id || `${item.created_at}-${item.outcome}`} className="item-card compact-card">
                  <div className="item-card__top compact-top">
                    <strong>{item.outcome || "Attempt"}</strong>
                    <span className="muted">{item.created_at ? new Date(item.created_at).toLocaleString() : ""}</span>
                  </div>
                  <p className="muted">{item.notes || "No notes"}</p>
                  {item.next_follow_up_at ? <div className="chip-row"><span className="chip">Next follow-up: {new Date(item.next_follow_up_at).toLocaleString()}</span></div> : null}
                </article>
              ))}
            </div>
          </div>
          <div className="attempt-form">
            <h4>Log attempt</h4>
            <label><span>Outcome</span><select value={outcome} onChange={(e) => setOutcome(e.target.value)}><option>Called</option><option>Connected</option><option>No answer</option><option>Wrong number</option><option>Not interested</option><option>Follow-up needed</option><option>Interview aligned</option></select></label>
            <label><span>Notes</span><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
            <label><span>Next follow-up</span><input type="datetime-local" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} /></label>
            {status ? <div className="status">{status}</div> : null}
            <div className="button-row">
              <button onClick={async () => { setStatus("Saving attempt..."); try { await onSave({ outcome, notes, next_follow_up_at: nextFollowUpAt }); setStatus("Attempt saved."); setNotes(""); setNextFollowUpAt(""); await onRefresh(); } catch (error) { setStatus(String(error?.message || error)); } }}>Save attempt</button>
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
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open || !assessment) return;
    setCandidateStatus(String(assessment.candidateStatus || "").trim());
    setAtValue(toDateInputValue(assessment.interviewAt || assessment.followUpAt || ""));
    setNotes(String(assessment.callbackNotes || "").trim());
    setStatus("");
  }, [open, assessment]);

  if (!open || !assessment) return null;

  const shouldShowCalendar = isInterviewAlignedStatus(candidateStatus) || String(candidateStatus || "").trim().toLowerCase() === "offered";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>Update assessment status</h3>
        <p className="muted">{assessment.candidateName || "Candidate"} | {assessment.jdTitle || "Untitled role"}</p>
        <label>
          <span>Status</span>
          <select value={candidateStatus} onChange={(e) => setCandidateStatus(e.target.value)}>
            <option value="">Select status</option>
            {DEFAULT_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>{String(candidateStatus || "").trim().toLowerCase() === "offered" ? "LWD / DOJ" : "Interview / status date"}</span>
          <input type="datetime-local" value={atValue} onChange={(e) => setAtValue(e.target.value)} disabled={!shouldShowCalendar} />
        </label>
        <label>
          <span>Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="L1 aligned tomorrow 5 PM, screening reject, CV shared, etc." />
        </label>
        {status ? <div className="status">{status}</div> : null}
        <div className="button-row">
          <button onClick={async () => {
            if (!candidateStatus) {
              setStatus("Select a status first.");
              return;
            }
            setStatus("Saving status update...");
            try {
              await onSave({ candidateStatus, atValue, notes });
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
                    {item.raw?.assessment || item.sourceType === "assessment_only" ? <button onClick={() => onOpenAssessment(item.raw?.assessment || item)}>Open assessment</button> : null}
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
  const [hostedJobId, setHostedJobId] = useState("");
  const [dashboardFilters, setDashboardFilters] = useState({ dateFrom: "", dateTo: "", clientLabel: "", recruiterLabel: "", quickRange: "all" });
  const [candidateFilters, setCandidateFilters] = useState({ q: "", source: "all", assignment: "all" });
  const [candidateSearchMode, setCandidateSearchMode] = useState("all");
  const [candidateSearchText, setCandidateSearchText] = useState("");
  const [candidateSearchResults, setCandidateSearchResults] = useState([]);
  const [candidatePage, setCandidatePage] = useState(1);
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
    otherPointers: ""
  });

  const assignApplicant = (state.applicants || []).find((item) => String(item.id) === String(assignApplicantId)) || null;
  const notesCandidate = (state.candidates || []).find((item) => String(item.id) === String(notesCandidateId)) || null;
  const attemptsCandidate = (state.candidates || []).find((item) => String(item.id) === String(attemptsCandidateId)) || null;
  const assessmentStatusItem = (state.assessments || []).find((item) => String(item.id) === String(assessmentStatusId)) || null;

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
    const [userResult, dashboardResult, applicantsResult, intakeResult, jobsResult, usersResult, candidatesResult, assessmentsResult] = await Promise.all([
      api("/auth/me", token),
      api("/company/dashboard", token),
      api("/company/applicants", token).catch(() => ({ items: [] })),
      api("/company/applicant-intake-secret", token).catch(() => null),
      api("/company/jds", token).catch(() => ({ jobs: [] })),
      api("/company/users", token).catch(() => ({ users: [] })),
      api("/candidates", token).catch(() => []),
      api("/company/assessments", token).catch(() => ({ assessments: [] }))
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
    setStatus("workspace", "Portal loaded.", "ok");
  }

  useEffect(() => {
    void loadWorkspace().catch((error) => setStatus("workspace", String(error?.message || error), "error"));
  }, [token]);

  const capturedSources = useMemo(() => Array.from(new Set((state.candidates || []).map((item) => String(item.source || "").trim()).filter(Boolean))), [state.candidates]);
  const candidateUniverse = useMemo(() => candidateSearchMode === "all" ? (state.candidates || []) : (candidateSearchResults || []), [candidateSearchMode, state.candidates, candidateSearchResults]);
  const pagedCandidates = useMemo(() => {
    const start = (candidatePage - 1) * 10;
    return candidateUniverse.slice(start, start + 10);
  }, [candidateUniverse, candidatePage]);
  const totalCandidatePages = Math.max(1, Math.ceil((candidateUniverse.length || 0) / 10));

  const capturedCandidates = useMemo(() => {
    return (state.candidates || []).filter((item) => {
      const sourceValue = String(item.source || "").trim();
      const isInboundApplicant = sourceValue === "website_apply" || sourceValue === "hosted_apply";
      const isAssignedInbound = Boolean(item.assigned_to_name || item.assigned_to_user_id);
      if (isInboundApplicant && !isAssignedInbound) return false;
      const hay = [
        item.name,
        item.company,
        item.role,
        item.jd_title,
        item.assigned_to_name,
        item.source,
        item.notes,
        item.recruiter_context_notes,
        item.other_pointers
      ].join(" ").toLowerCase();
      const queryOk = !candidateFilters.q.trim() || hay.includes(candidateFilters.q.trim().toLowerCase());
      const sourceOk = candidateFilters.source === "all" || sourceValue === candidateFilters.source;
      const assignmentOk = candidateFilters.assignment === "all" || (candidateFilters.assignment === "assigned" ? Boolean(item.assigned_to_name) : !item.assigned_to_name);
      return queryOk && sourceOk && assignmentOk;
    });
  }, [candidateFilters, state.candidates]);

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

  async function patchCandidate(candidateId, patch, okMessage) {
    await api(`/company/candidates/${encodeURIComponent(candidateId)}`, token, "PATCH", { patch });
    await loadWorkspace();
    setStatus("captured", okMessage, "ok");
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
    await api("/contact-attempts", token, "POST", {
      candidateId: attemptsCandidateId,
      outcome: patch.outcome,
      notes: patch.notes,
      next_follow_up_at: patch.next_follow_up_at
    });
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
    setInterviewForm({
      candidateName: matched?.candidateName || candidate?.name || "",
      phoneNumber: matched?.phoneNumber || candidate?.phone || "",
      emailId: matched?.emailId || candidate?.email || "",
      location: matched?.location || candidate?.location || "",
      currentCtc: matched?.currentCtc || candidate?.current_ctc || "",
      expectedCtc: matched?.expectedCtc || candidate?.expected_ctc || "",
      noticePeriod: matched?.noticePeriod || candidate?.notice_period || "",
      offerInHand: matched?.offerInHand || "",
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
      callbackNotes: matched?.callbackNotes || candidate?.callback_notes || "",
      otherPointers: matched?.otherPointers || candidate?.other_pointers || ""
    });
    navigate("/interview");
    setStatus("interview", `Loaded ${candidate.name || "candidate"} into Interview Panel.`, "ok");
  }

  async function saveAssessment() {
    const assessment = {
      id: interviewMeta.assessmentId || `assessment-${Date.now()}`,
      ...interviewForm,
      questionMode: "basic",
      generatedAt: new Date().toISOString()
    };
    setStatus("interview", "Saving assessment...");
    await api("/company/assessments", token, "POST", { assessment });
    if (interviewMeta.candidateId) {
      await patchCandidate(interviewMeta.candidateId, {
        recruiter_context_notes: interviewForm.recruiterNotes,
        callback_notes: interviewForm.callbackNotes,
        other_pointers: interviewForm.otherPointers,
        pipeline_stage: interviewForm.pipelineStage,
        candidate_status: interviewForm.candidateStatus,
        next_follow_up_at: interviewForm.followUpAt
      }, "Assessment saved and candidate state updated.");
    } else {
      await loadWorkspace();
      setStatus("interview", "Assessment saved.", "ok");
    }
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
      setStatus("workspace", "Showing all uploaded candidates.", "ok");
      return;
    }
    if (candidateSearchMode === "jd_match") {
      const result = await api("/company/candidates/search-jd-match", token, "POST", {
        jdText: candidateSearchText,
        jdTitle: candidateSearchText
      });
      setCandidateSearchResults(result.items || []);
      setCandidatePage(1);
      setStatus("workspace", `JD match returned ${result.items?.length || 0} candidates.`, "ok");
      return;
    }
    const result = await api(`/company/candidates/search-natural?q=${encodeURIComponent(candidateSearchText)}`, token);
    setCandidateSearchResults(result.items || []);
    setCandidatePage(1);
    setStatus("workspace", `AI search returned ${result.items?.length || 0} candidates.`, "ok");
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

  function buildJourneyText(assessment) {
    const lines = [
      assessment?.candidateName || "Candidate",
      assessment?.jdTitle ? `JD: ${assessment.jdTitle}` : "",
      assessment?.pipelineStage ? `Pipeline: ${assessment.pipelineStage}` : "",
      assessment?.candidateStatus ? `Status: ${assessment.candidateStatus}` : "",
      assessment?.followUpAt ? `Follow-up: ${new Date(assessment.followUpAt).toLocaleString()}` : "",
      assessment?.interviewAt ? `Interview: ${new Date(assessment.interviewAt).toLocaleString()}` : "",
      assessment?.callbackNotes ? `Notes: ${assessment.callbackNotes}` : ""
    ].filter(Boolean);
    return lines.join("\n");
  }

  async function saveAssessmentStatusUpdate(assessment, payload) {
    const nextStatus = String(payload?.candidateStatus || "").trim();
    if (!nextStatus) throw new Error("Select a status first.");
    const nextStatusLower = nextStatus.toLowerCase();
    const shouldKeepCalendar = isInterviewAlignedStatus(nextStatus);
    const atIso = shouldKeepCalendar || nextStatusLower === "offered"
      ? (payload?.atValue ? new Date(payload.atValue).toISOString() : "")
      : "";
    const readableNotes = formatReadableUpdateText(payload?.notes || "");
    const confirmMessage = buildDetectedUpdateConfirmation({
      candidateName: assessment?.candidateName || "",
      status: nextStatus,
      interviewAt: shouldKeepCalendar ? atIso : "",
      followUpAt: "",
      notes: [
        readableNotes,
        buildAssessmentStatusCalendarNote(nextStatus, atIso)
      ].filter(Boolean).join("\n")
    });
    if (!window.confirm(confirmMessage)) return;

    const nextAssessment = {
      ...assessment,
      candidateStatus: nextStatus,
      pipelineStage: mapAssessmentStatusToPipelineStage(nextStatus) || assessment?.pipelineStage || "",
      callbackNotes: appendReadableUpdateNote(
        assessment?.callbackNotes || "",
        [readableNotes, buildAssessmentStatusCalendarNote(nextStatus, atIso)].filter(Boolean).join("\n")
      ),
      interviewAttempts: Array.isArray(assessment?.interviewAttempts) ? [...assessment.interviewAttempts] : []
    };

    if (isInterviewAlignedStatus(nextStatus)) {
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

    nextAssessment.interviewAt = shouldKeepCalendar ? (atIso || assessment?.interviewAt || "") : "";
    nextAssessment.followUpAt = "";

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
      otherPointers: assessment?.otherPointers || ""
    });
    navigate("/interview");
    setStatus("interview", `Loaded ${assessment?.candidateName || "candidate"} as reusable draft.`, "ok");
  }

  async function openAssessmentJourney(assessment) {
    const text = buildJourneyText(assessment);
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
  const clientPositionRows = state.dashboard?.summary?.byClientPosition || [];
  const recruiterPositionRows = state.dashboard?.summary?.byClientRecruiter || [];

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
              <div className="two-pane-grid">
                <Section kicker="Breakdown" title="Client Breakdown">
                  <div className="stack-list">
                    {!(state.dashboard?.summary?.byClient || []).length ? <div className="empty-state">No client breakdown available.</div> : (state.dashboard.summary.byClient || []).map((group) => (
                      <details className="dashboard-group" key={group.label} open>
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
                <div className="toolbar">
                  <select value={candidateSearchMode} onChange={(e) => { setCandidateSearchMode(e.target.value); setCandidatePage(1); }}>
                    <option value="all">All candidates</option>
                    <option value="ai_search">AI Search</option>
                    <option value="jd_match">Map to JD</option>
                  </select>
                  <input placeholder={candidateSearchMode === "jd_match" ? "Paste JD title or requirement text" : "Search role, skill, company, location"} value={candidateSearchText} onChange={(e) => setCandidateSearchText(e.target.value)} />
                  <button onClick={() => void runCandidateSearch()}>{candidateSearchMode === "all" ? "Refresh" : "Run"}</button>
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
              <div className="stack-list">
                {!state.applicants.length ? <div className="empty-state">No applied candidates right now.</div> : state.applicants.map((item) => (
                  <article className="item-card" key={item.id}>
                    <div className="item-card__top">
                      <div>
                        <h3>{item.candidateName || "Applicant"}</h3>
                        <p className="muted">{[
                          item.clientName ? `Client: ${item.clientName}` : "",
                          item.jdTitle ? `JD: ${item.jdTitle}` : "",
                          item.sourcePlatform ? `Source: ${item.sourcePlatform}` : "",
                          item.parseStatus ? `Parse: ${item.parseStatus}` : ""
                        ].filter(Boolean).join(" | ")}</p>
                      </div>
                      <div className="chip-row">
                        {item.cvFilename ? <span className="chip">CV: {item.cvFilename}</span> : null}
                        {item.location ? <span className="chip">{item.location}</span> : null}
                        {item.totalExperience ? <span className="chip">{item.totalExperience}</span> : null}
                      </div>
                    </div>
                    <div className="button-row">
                      {item.cvFilename ? <button onClick={() => void openCv(item.id)}>Open CV</button> : null}
                      {state.user?.role === "admin" ? <button onClick={() => setAssignApplicantId(item.id)}>Assign</button> : null}
                      {state.user?.role === "admin" ? <button className="ghost-btn" onClick={() => void removeApplicant(item.id)}>Remove</button> : null}
                    </div>
                  </article>
                ))}
              </div>
            </Section>
          } />

          <Route path="/captured-notes" element={
            <Section kicker="Shared Workflow" title="Captured Notes">
              {statuses.captured ? <div className={`status ${statuses.capturedKind || ""}`}>{statuses.captured}</div> : null}
              <div className="toolbar">
                <input placeholder="Search candidate, company, JD, recruiter" value={candidateFilters.q} onChange={(e) => setCandidateFilters((c) => ({ ...c, q: e.target.value }))} />
                <select value={candidateFilters.source} onChange={(e) => setCandidateFilters((c) => ({ ...c, source: e.target.value }))}>
                  <option value="all">All sources</option>
                  {capturedSources.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
                <select value={candidateFilters.assignment} onChange={(e) => setCandidateFilters((c) => ({ ...c, assignment: e.target.value }))}>
                  <option value="all">All assignments</option>
                  <option value="assigned">Assigned</option>
                  <option value="unassigned">Unassigned</option>
                </select>
              </div>
              <div className="stack-list">
                {!capturedCandidates.length ? <div className="empty-state">No captured notes or recruiter-owned candidates yet.</div> : capturedCandidates.map((item) => {
                  const matchedAssessment = (state.assessments || []).find((assessment) => String(assessment.candidateName || "").trim().toLowerCase() === String(item.name || "").trim().toLowerCase());
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
                        <button onClick={() => setNotesCandidateId(item.id)}>Recruiter note</button>
                        <button onClick={() => void openAttempts(item.id)}>Attempts</button>
                        <button onClick={() => loadCandidateIntoInterview(item.id)}>Create assessment</button>
                        <button className="ghost-btn" onClick={() => void api(`/candidates?id=${encodeURIComponent(item.id)}`, token, "DELETE").then(loadWorkspace).then(() => setStatus("captured", "Candidate deleted.", "ok")).catch((error) => setStatus("captured", String(error?.message || error), "error"))}>Delete</button>
                      </div>
                      <div className="candidate-snippet">{[item.notes, item.recruiter_context_notes, item.other_pointers].filter(Boolean).join("\n\n") || "No recruiter note or pointers yet."}</div>
                    </article>
                  );
                })}
              </div>
            </Section>
          } />

          <Route path="/assessments" element={
            <Section kicker="Structured Workflow" title="Assessments">
              {statuses.assessments ? <div className={`status ${statuses.assessmentsKind || ""}`}>{statuses.assessments}</div> : null}
              <div className="stack-list">
                {!state.assessments.length ? <div className="empty-state">No assessments saved yet.</div> : state.assessments.map((item) => (
                  <article className="item-card compact-card" key={item.id}>
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

          <Route path="/interview" element={
            <div className="page-grid">
              <Section kicker="Recruiter Workspace" title="Interview Panel">
                <p className="muted">This panel is for captured information, recruiter notes, runbook, CV analysis, and output actions. Assessment status and pipeline updates stay in the Assessments lane to avoid confusion.</p>
                {statuses.interview ? <div className={`status ${statuses.interviewKind || ""}`}>{statuses.interview}</div> : null}
                <div className="button-row">
                  <button onClick={() => void copyInterviewResult()}>Copy result</button>
                  <button onClick={() => copyInterviewWhatsapp()}>Copy WhatsApp</button>
                  <button onClick={() => void copyInterviewEmail()}>Copy email</button>
                  <button onClick={() => setStatus("interview", "Notes live in the draft editor below.", "ok")}>Save notes</button>
                  <button onClick={() => void saveAssessment()}>Create assessment</button>
                  <button onClick={() => sendInterviewToSheets()}>Send to sheets</button>
                  <button onClick={() => exportInterviewAll()}>Export all</button>
                  <button className="ghost-btn" onClick={() => { setInterviewMeta({ candidateId: "", assessmentId: "" }); setInterviewForm({ candidateName: "", phoneNumber: "", emailId: "", location: "", currentCtc: "", expectedCtc: "", noticePeriod: "", offerInHand: "", currentCompany: "", currentDesignation: "", totalExperience: "", currentOrgTenure: "", reasonForChange: "", clientName: "", jdTitle: "", pipelineStage: "Under Interview Process", candidateStatus: "Screening in progress", followUpAt: "", interviewAt: "", recruiterNotes: "", callbackNotes: "", otherPointers: "" }); setStatus("interview", ""); }}>Clear draft</button>
                </div>
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
                  {[["candidateName", "Candidate name"], ["phoneNumber", "Phone"], ["emailId", "Email", "email"], ["location", "Location"], ["currentCompany", "Current company"], ["currentDesignation", "Current designation"], ["totalExperience", "Total experience"], ["clientName", "Client name"]].map(([name, label, type]) => (
                    <label key={name}><span>{label}</span><input type={type || "text"} value={interviewForm[name]} onChange={(e) => setInterviewForm((c) => ({ ...c, [name]: e.target.value }))} /></label>
                  ))}
                  <label className="full"><span>JD / role</span><input value={interviewForm.jdTitle} onChange={(e) => setInterviewForm((c) => ({ ...c, jdTitle: e.target.value }))} /></label>
                  <label className="full"><span>Captured notes</span><textarea value={interviewForm.callbackNotes} onChange={(e) => setInterviewForm((c) => ({ ...c, callbackNotes: e.target.value }))} /></label>
                  <label className="full"><span>Recruiter notes</span><textarea value={interviewForm.recruiterNotes} onChange={(e) => setInterviewForm((c) => ({ ...c, recruiterNotes: e.target.value }))} /></label>
                  <label className="full"><span>Other pointers</span><textarea value={interviewForm.otherPointers} onChange={(e) => setInterviewForm((c) => ({ ...c, otherPointers: e.target.value }))} /></label>
                </form>
              </Section>

              <Section kicker="Runbook" title="Interview Runbook">
                <div className="runbook-layout">
                  <div className="runbook-block">
                    <div className="info-label">JD-defined screening questions</div>
                    {jdScreeningQuestions.length ? (
                      <div className="question-stack">
                        {jdScreeningQuestions.map((question, index) => (
                          <div className="question-card" key={`${index}-${question}`}>
                            <div className="question-index">Q{index + 1}</div>
                            <div>{question}</div>
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
                      <label><span>Offer in hand / DOJ / LWD</span><input value={interviewForm.offerInHand} onChange={(e) => setInterviewForm((c) => ({ ...c, offerInHand: e.target.value }))} /></label>
                      <label><span>Total experience</span><input value={interviewForm.totalExperience} onChange={(e) => setInterviewForm((c) => ({ ...c, totalExperience: e.target.value }))} /></label>
                      <label><span>Tenure in current org</span><input value={interviewForm.currentOrgTenure} onChange={(e) => setInterviewForm((c) => ({ ...c, currentOrgTenure: e.target.value }))} /></label>
                      <label><span>Reason of change</span><textarea value={interviewForm.reasonForChange} onChange={(e) => setInterviewForm((c) => ({ ...c, reasonForChange: e.target.value }))} /></label>
                      <label><span>Location</span><input value={interviewForm.location} onChange={(e) => setInterviewForm((c) => ({ ...c, location: e.target.value }))} /></label>
                    </div>
                  </div>

                  <div className="runbook-block">
                    <div className="info-label">Planning</div>
                    <div className="form-grid two-col">
                      <label><span>Next follow-up</span><input type="datetime-local" value={interviewForm.followUpAt} onChange={(e) => setInterviewForm((c) => ({ ...c, followUpAt: e.target.value }))} /></label>
                      <label><span>Interview date</span><input type="datetime-local" value={interviewForm.interviewAt} onChange={(e) => setInterviewForm((c) => ({ ...c, interviewAt: e.target.value }))} /></label>
                    </div>
                  </div>
                </div>
              </Section>

              <Section kicker="CV Analysis" title="CV Parsing Verification">
                <div className="cv-analysis-box">
                  <div className="info-label">Current analysis view</div>
                  <div className="muted">CV analysis block is ready. Next pass we will connect parsed CV sections, extracted skills, tenure checks, and JD match verification exactly from extension logic.</div>
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

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      <AssignModal open={Boolean(assignApplicantId)} applicant={assignApplicant} users={state.users} jobs={state.jobs} onClose={() => setAssignApplicantId("")} onSave={saveApplicantAssignment} />
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
      <AttemptsModal open={Boolean(attemptsCandidateId)} candidate={attemptsCandidate} attempts={attempts} onClose={() => setAttemptsCandidateId("")} onRefresh={refreshAttempts} onSave={saveAttempt} />
      <AssessmentStatusModal open={Boolean(assessmentStatusId)} assessment={assessmentStatusItem} onClose={() => setAssessmentStatusId("")} onSave={(payload) => saveAssessmentStatusUpdate(assessmentStatusItem, payload)} />
      <DrilldownModal
        open={drilldownState.open}
        title={drilldownState.title}
        items={drilldownState.items}
        onClose={() => setDrilldownState({ open: false, title: "", items: [] })}
        onOpenCv={(candidateId) => void openCv(candidateId)}
        onOpenDraft={(candidateId) => { setDrilldownState({ open: false, title: "", items: [] }); loadCandidateIntoInterview(candidateId); }}
        onOpenAssessment={(assessment) => { setDrilldownState({ open: false, title: "", items: [] }); reuseAssessmentAsNew(assessment); }}
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
