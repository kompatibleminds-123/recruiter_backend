import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";

const TOKEN_KEY = "recruitdesk_portal_token";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/applicants", label: "Applied Candidates" },
  { to: "/captured-notes", label: "Captured Notes" },
  { to: "/interview", label: "Interview Panel" },
  { to: "/intake-settings", label: "Admin Intake Settings" },
  { to: "/jobs", label: "Jobs" }
];

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
    summary: [pipeline, status].filter(Boolean).join(" | ")
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

function NotesModal({ open, candidate, onClose, onSave }) {
  const [recruiterNote, setRecruiterNote] = useState("");
  const [otherPointers, setOtherPointers] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!open || !candidate) return;
    setRecruiterNote(String(candidate.recruiter_context_notes || ""));
    setOtherPointers(String(candidate.other_pointers || ""));
    setStatus("");
  }, [open, candidate]);

  if (!open || !candidate) return null;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="overlay-card" onClick={(e) => e.stopPropagation()}>
        <h3>Recruiter Note</h3>
        <p className="muted">{candidate.name || "Candidate"} | {candidate.jd_title || candidate.role || "No role set"}</p>
        <label><span>Recruiter note</span><textarea value={recruiterNote} onChange={(e) => setRecruiterNote(e.target.value)} /></label>
        <label><span>Other pointers</span><textarea value={otherPointers} onChange={(e) => setOtherPointers(e.target.value)} /></label>
        {status ? <div className="status">{status}</div> : null}
        <div className="button-row">
          <button onClick={async () => { setStatus("Saving notes..."); try { await onSave({ recruiter_context_notes: recruiterNote, other_pointers: otherPointers }); } catch (error) { setStatus(String(error?.message || error)); } }}>Save notes</button>
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
  const [candidateFilters, setCandidateFilters] = useState({ q: "", source: "all", assignment: "all" });
  const [notesCandidateId, setNotesCandidateId] = useState("");
  const [attemptsCandidateId, setAttemptsCandidateId] = useState("");
  const [attempts, setAttempts] = useState([]);
  const [interviewMeta, setInterviewMeta] = useState({ candidateId: "", assessmentId: "" });
  const [interviewForm, setInterviewForm] = useState({
    candidateName: "",
    phoneNumber: "",
    emailId: "",
    location: "",
    currentCompany: "",
    currentDesignation: "",
    totalExperience: "",
    clientName: "",
    jdTitle: "",
    pipelineStage: "Under Interview Process",
    candidateStatus: "Screening in progress",
    followUpAt: "",
    interviewAt: "",
    recruiterNotes: "",
    callbackNotes: ""
  });

  const assignApplicant = (state.applicants || []).find((item) => String(item.id) === String(assignApplicantId)) || null;
  const notesCandidate = (state.candidates || []).find((item) => String(item.id) === String(notesCandidateId)) || null;
  const attemptsCandidate = (state.candidates || []).find((item) => String(item.id) === String(attemptsCandidateId)) || null;

  function setStatus(key, message, kind = "") {
    setStatuses((current) => ({ ...current, [key]: message, [`${key}Kind`]: kind }));
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
      currentCompany: matched?.currentCompany || candidate?.company || "",
      currentDesignation: matched?.currentDesignation || candidate?.role || "",
      totalExperience: matched?.totalExperience || candidate?.experience || "",
      clientName: matched?.clientName || candidate?.client_name || "",
      jdTitle: matched?.jdTitle || candidate?.jd_title || "",
      pipelineStage: matched?.pipelineStage || candidate?.pipeline_stage || "Under Interview Process",
      candidateStatus: matched?.candidateStatus || candidate?.candidate_status || "Screening in progress",
      followUpAt: toDateInputValue(matched?.followUpAt || candidate?.next_follow_up_at),
      interviewAt: toDateInputValue(matched?.interviewAt),
      recruiterNotes: matched?.recruiterNotes || candidate?.recruiter_context_notes || "",
      callbackNotes: matched?.callbackNotes || candidate?.callback_notes || ""
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

  const companyId = String(state.user?.companyId || state.intake?.company?.id || "").trim();
  const secret = String(state.intake?.applicantIntakeSecret || "").trim();
  const apiUrl = `${window.location.origin}/public/applicants/intake`;

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
              <Section kicker="Overview" title="Pipeline Snapshot">
                <div className="metric-grid">
                  <div className="metric-card"><div className="metric-label">Sourced</div><div className="metric-value">{state.dashboard?.summary?.sourcedCount || 0}</div></div>
                  <div className="metric-card"><div className="metric-label">Converted</div><div className="metric-value">{state.dashboard?.summary?.convertedCount || 0}</div></div>
                  <div className="metric-card"><div className="metric-label">Applicants</div><div className="metric-value">{state.applicants.length}</div></div>
                  <div className="metric-card"><div className="metric-label">Joined</div><div className="metric-value">{state.dashboard?.summary?.joinedCount || 0}</div></div>
                </div>
              </Section>
              <Section kicker="Direction" title="Shared Team Workspace">
                <p className="muted">Inbound applicants stay in Applied Candidates. Recruiter-managed work happens in Captured Notes and Interview Panel.</p>
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
                      <div className="candidate-snippet">{[item.notes, item.recruiter_context_notes, item.other_pointers].filter(Boolean).join(" | ") || "No recruiter note or pointers yet."}</div>
                    </article>
                  );
                })}
              </div>
            </Section>
          } />

          <Route path="/interview" element={
            <Section kicker="Recruiter Workflow" title="Interview Panel">
              <p className="muted">Use this for recruiter notes, callback updates, status progression, and formal assessment save.</p>
              {statuses.interview ? <div className={`status ${statuses.interviewKind || ""}`}>{statuses.interview}</div> : null}
              <form className="form-grid two-col" onSubmit={(e) => { e.preventDefault(); void saveAssessment(); }}>
                {[["candidateName", "Candidate name"], ["phoneNumber", "Phone"], ["emailId", "Email", "email"], ["location", "Location"], ["currentCompany", "Current company"], ["currentDesignation", "Current designation"], ["totalExperience", "Total experience"], ["clientName", "Client name"]].map(([name, label, type]) => (
                  <label key={name}><span>{label}</span><input type={type || "text"} value={interviewForm[name]} onChange={(e) => setInterviewForm((c) => ({ ...c, [name]: e.target.value }))} /></label>
                ))}
                <label className="full"><span>JD / role</span><input value={interviewForm.jdTitle} onChange={(e) => setInterviewForm((c) => ({ ...c, jdTitle: e.target.value }))} /></label>
                <label><span>Pipeline stage</span><input value={interviewForm.pipelineStage} onChange={(e) => setInterviewForm((c) => ({ ...c, pipelineStage: e.target.value }))} /></label>
                <label><span>Candidate status</span><input value={interviewForm.candidateStatus} onChange={(e) => setInterviewForm((c) => ({ ...c, candidateStatus: e.target.value }))} /></label>
                <label><span>Next follow-up</span><input type="datetime-local" value={interviewForm.followUpAt} onChange={(e) => setInterviewForm((c) => ({ ...c, followUpAt: e.target.value }))} /></label>
                <label><span>Interview date</span><input type="datetime-local" value={interviewForm.interviewAt} onChange={(e) => setInterviewForm((c) => ({ ...c, interviewAt: e.target.value }))} /></label>
                <label className="full"><span>Recruiter notes</span><textarea value={interviewForm.recruiterNotes} onChange={(e) => setInterviewForm((c) => ({ ...c, recruiterNotes: e.target.value }))} /></label>
                <label className="full"><span>Callback / update notes</span><textarea value={interviewForm.callbackNotes} onChange={(e) => setInterviewForm((c) => ({ ...c, callbackNotes: e.target.value }))} /></label>
                <div className="full button-row">
                  <button type="submit">Save assessment</button>
                  <button type="button" className="ghost-btn" onClick={() => { setInterviewMeta({ candidateId: "", assessmentId: "" }); setInterviewForm({ candidateName: "", phoneNumber: "", emailId: "", location: "", currentCompany: "", currentDesignation: "", totalExperience: "", clientName: "", jdTitle: "", pipelineStage: "Under Interview Process", candidateStatus: "Screening in progress", followUpAt: "", interviewAt: "", recruiterNotes: "", callbackNotes: "" }); setStatus("interview", ""); }}>Clear</button>
                </div>
              </form>
            </Section>
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
            <Section kicker="Company JDs" title="Jobs">
              <div className="stack-list">
                {!state.jobs.length ? <div className="empty-state">No jobs saved in backend yet.</div> : state.jobs.map((job) => (
                  <article className="item-card" key={job.id}>
                    <h3>{job.title || "Untitled JD"}</h3>
                    <p className="muted">{job.clientName ? `Client: ${job.clientName}` : "No client set"}{job.location ? ` | Location: ${job.location}` : ""}</p>
                    <div className="chip-row"><span className="chip">{job.id}</span></div>
                  </article>
                ))}
              </div>
            </Section>
          } />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>

      <AssignModal open={Boolean(assignApplicantId)} applicant={assignApplicant} users={state.users} jobs={state.jobs} onClose={() => setAssignApplicantId("")} onSave={saveApplicantAssignment} />
      <NotesModal open={Boolean(notesCandidateId)} candidate={notesCandidate} onClose={() => setNotesCandidateId("")} onSave={async (patch) => { await patchCandidate(notesCandidateId, patch, "Recruiter note updated."); setNotesCandidateId(""); }} />
      <AttemptsModal open={Boolean(attemptsCandidateId)} candidate={attemptsCandidate} attempts={attempts} onClose={() => setAttemptsCandidateId("")} onRefresh={refreshAttempts} onSave={saveAttempt} />
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
