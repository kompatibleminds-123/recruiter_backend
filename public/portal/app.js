(function () {
  const state = {
    token: localStorage.getItem("recruitdesk_portal_token") || "",
    user: null,
    dashboard: null,
    applicants: [],
    candidates: [],
    users: [],
    intake: null,
    jobs: [],
    pendingApplicantId: ""
  };

  const $ = (id) => document.getElementById(id);

  function setStatus(id, message, kind = "") {
    const node = $(id);
    if (!node) return;
    node.textContent = String(message || "");
    node.className = `status ${kind}`.trim();
  }

  function setWorkspaceStatus(message, kind = "") {
    setStatus("workspaceStatus", message, kind);
  }

  function api(path, method = "GET", body = null) {
    const headers = { "Content-Type": "application/json" };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
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

  function copyText(value, statusId, okMessage) {
    return navigator.clipboard.writeText(String(value || "")).then(() => {
      setStatus(statusId, okMessage, "ok");
    }).catch((error) => {
      setStatus(statusId, String(error?.message || error), "error");
    });
  }

  function getHostedApplyLink(jobId) {
    return jobId ? `${window.location.origin}/apply/${encodeURIComponent(jobId)}` : "";
  }

  function buildWordpressSnippet({ companyId, secret, apiUrl }) {
    return `add_action('wpcf7_before_send_mail', function ($contact_form) {\n  $submission = WPCF7_Submission::get_instance();\n  if (!$submission) return;\n  $data = $submission->get_posted_data();\n  $payload = [\n    'companyId' => '${companyId}',\n    'jdTitle' => !empty($data['job-role']) ? $data['job-role'] : '',\n    'jobId' => sanitize_title(!empty($data['job-role']) ? $data['job-role'] : ''),\n    'sourcePlatform' => 'website',\n    'sourceLabel' => 'WordPress Website',\n    'candidateName' => isset($data['your-name']) ? $data['your-name'] : '',\n    'email' => isset($data['your-email']) ? $data['your-email'] : '',\n    'phone' => isset($data['tel-581']) ? $data['tel-581'] : '',\n    'location' => isset($data['text-961']) ? $data['text-961'] : ''\n  ];\n  wp_remote_post('${apiUrl}', [\n    'timeout' => 90,\n    'headers' => [\n      'Content-Type' => 'application/json',\n      'x-applicant-intake-secret' => '${secret}'\n    ],\n    'body' => wp_json_encode($payload)\n  ]);\n}, 10, 1);`;
  }

  function buildGoogleSheetScript({ companyId, secret, apiUrl }) {
    return `function syncRecruitDeskApplicants() {\n  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();\n  const rows = sheet.getDataRange().getValues();\n  if (!rows || rows.length < 2) return;\n  const headers = rows[0].map(String);\n  const syncedColIndex = headers.indexOf("recruitdesk_synced");\n  if (syncedColIndex === -1) throw new Error('Missing "recruitdesk_synced" column.');\n  const find = (name) => headers.indexOf(name);\n  for (let r = 1; r < rows.length; r++) {\n    const row = rows[r];\n    if (String(row[syncedColIndex] || "").trim().toLowerCase() === "yes") continue;\n    const jobRole = String(row[find("major-tech")] || "").trim();\n    const payload = {\n      companyId: "${companyId}",\n      jdTitle: jobRole,\n      jobId: jobRole.toLowerCase().replace(/\\s+/g, "-"),\n      sourcePlatform: "google_sheet",\n      sourceLabel: "Google Sheet",\n      candidateName: String(row[find("your-name")] || "").trim(),\n      email: String(row[find("your-email")] || "").trim(),\n      phone: String(row[find("tel-581")] || "").trim(),\n      location: String(row[find("text-961")] || "").trim()\n    };\n    const response = UrlFetchApp.fetch("${apiUrl}", {\n      method: "post",\n      contentType: "application/json",\n      headers: { "x-applicant-intake-secret": "${secret}" },\n      payload: JSON.stringify(payload),\n      muteHttpExceptions: true\n    });\n    if (response.getResponseCode() >= 200 && response.getResponseCode() < 300) {\n      sheet.getRange(r + 1, syncedColIndex + 1).setValue("yes");\n    }\n  }\n}`;
  }

  function switchView(view) {
    ["dashboard", "applicants", "captured", "intake", "jobs"].forEach((name) => {
      const panel = $(`${name}View`);
      const btn = document.querySelector(`.nav-btn[data-view="${name}"]`);
      if (panel) panel.hidden = name !== view;
      if (btn) btn.classList.toggle("active", name === view);
    });
  }

  function renderAuthState() {
    const loggedIn = Boolean(state.user && state.token);
    $("loginView").hidden = loggedIn;
    $("workspaceView").hidden = !loggedIn;
    $("logoutBtn").hidden = !loggedIn;
    $("currentUserSummary").textContent = loggedIn
      ? `${state.user.name} | ${state.user.role} | ${state.user.companyName || "Company"}`
      : "Not logged in";
    $("companyKicker").textContent = loggedIn ? state.user.companyName || "Company Workspace" : "Company Workspace";
    $("workspaceTitle").textContent = loggedIn ? `${state.user.companyName || "RecruitDesk"} Portal` : "RecruitDesk Portal";
  }

  function renderDashboard() {
    const mount = $("dashboardMetrics");
    const summary = state.dashboard?.summary || {};
    const metrics = [
      ["Sourced", summary.sourcedCount || 0],
      ["Converted", summary.convertedCount || 0],
      ["Applicants", (state.applicants || []).length],
      ["Joined", summary.joinedCount || 0]
    ];
    mount.innerHTML = metrics.map(([label, value]) => `
      <div class="metric-card">
        <div class="metric-label">${label}</div>
        <div class="metric-value">${value}</div>
      </div>
    `).join("");
  }

  function renderApplicants() {
    const mount = $("applicantsList");
    const items = Array.isArray(state.applicants) ? state.applicants : [];
    if (!items.length) {
      mount.innerHTML = `<div class="item-card"><div class="item-subtitle">No applied candidates right now.</div></div>`;
      return;
    }
    mount.innerHTML = items.map((item) => `
      <div class="item-card" data-applicant-id="${item.id}">
        <div class="item-title">${item.candidateName || "Applicant"}</div>
        <div class="item-subtitle">
          ${[
            item.clientName ? `Client: ${item.clientName}` : "",
            item.jdTitle ? `JD: ${item.jdTitle}` : "",
            item.sourcePlatform ? `Source: ${item.sourcePlatform}` : "",
            item.parseStatus ? `Parse: ${item.parseStatus}` : ""
          ].filter(Boolean).join(" | ")}
        </div>
        <div class="chip-row">
          ${item.cvFilename ? `<span class="chip">CV: ${item.cvFilename}</span>` : ""}
          ${item.location ? `<span class="chip">${item.location}</span>` : ""}
          ${item.totalExperience ? `<span class="chip">${item.totalExperience}</span>` : ""}
        </div>
        <div class="item-actions">
          ${item.cvFilename ? `<button class="mini-btn applicant-open-cv" type="button" data-id="${item.id}">Open CV</button>` : ""}
          ${state.user?.role === "admin" ? `<button class="mini-btn applicant-assign" type="button" data-id="${item.id}">Assign</button>` : ""}
          ${state.user?.role === "admin" ? `<button class="mini-btn applicant-remove" type="button" data-id="${item.id}">Remove</button>` : ""}
        </div>
      </div>
    `).join("");
  }

  function renderCapturedNotes() {
    const mount = $("capturedList");
    const items = Array.isArray(state.candidates) ? state.candidates : [];
    if (!items.length) {
      mount.innerHTML = `<div class="item-card"><div class="item-subtitle">No captured notes or assigned candidates yet.</div></div>`;
      return;
    }
    mount.innerHTML = items.map((item) => `
      <div class="item-card">
        <div class="item-title">${item.name || "Candidate"}</div>
        <div class="item-subtitle">
          ${[
            item.company ? `Company: ${item.company}` : "",
            item.role ? `Role: ${item.role}` : "",
            item.jd_title ? `JD: ${item.jd_title}` : "",
            item.assigned_to_name ? `Assigned: ${item.assigned_to_name}` : "",
            item.source ? `Source: ${item.source}` : ""
          ].filter(Boolean).join(" | ")}
        </div>
      </div>
    `).join("");
  }

  function renderIntakeSettings() {
    const companyId = String(state.user?.companyId || state.intake?.company?.id || "").trim();
    const secret = String(state.intake?.applicantIntakeSecret || "").trim();
    const apiUrl = `${window.location.origin}/public/applicants/intake`;
    $("companyIdField").value = companyId;
    $("intakeSecretField").value = secret;
    $("apiUrlField").value = apiUrl;
    $("wordpressSnippetField").value = buildWordpressSnippet({ companyId, secret, apiUrl });
    $("googleScriptField").value = buildGoogleSheetScript({ companyId, secret, apiUrl });

    const select = $("hostedJobSelect");
    const current = String(select.value || "").trim();
    select.innerHTML = '<option value="">Select JD / role</option>' + (state.jobs || []).map((job) => {
      const id = String(job?.id || "").trim();
      const title = String(job?.title || "").trim() || "Untitled JD";
      return `<option value="${id}">${title}</option>`;
    }).join("");
    if (current && (state.jobs || []).some((job) => String(job?.id || "").trim() === current)) {
      select.value = current;
    }
    updateHostedApplyField();
  }

  function renderJobs() {
    const mount = $("jobsList");
    const items = Array.isArray(state.jobs) ? state.jobs : [];
    if (!items.length) {
      mount.innerHTML = `<div class="item-card"><div class="item-subtitle">No jobs saved in backend yet.</div></div>`;
      return;
    }
    mount.innerHTML = items.map((job) => `
      <div class="item-card">
        <div class="item-title">${job.title || "Untitled JD"}</div>
        <div class="item-subtitle">${job.clientName ? `Client: ${job.clientName}` : "No client set"}${job.location ? ` | Location: ${job.location}` : ""}</div>
        <div class="chip-row">
          <span class="chip">${job.id}</span>
        </div>
      </div>
    `).join("");
  }

  function fillAssignOptions(applicant) {
    const recruiter = $("assignRecruiter");
    const jd = $("assignJd");
    recruiter.innerHTML = '<option value="">Select recruiter</option>' + (state.users || [])
      .map((user) => `<option value="${user.id}">${user.name} | ${user.email}</option>`)
      .join("");
    jd.innerHTML = '<option value="">Select JD / role</option>' + (state.jobs || [])
      .map((job) => {
        const title = String(job?.title || "").trim();
        return `<option value="${title}">${title}</option>`;
      })
      .join("");
    if (jd && applicant?.jdTitle) jd.value = applicant.jdTitle;
    $("assignModalSummary").textContent = `Assign ${applicant?.candidateName || "this applicant"} to a recruiter and JD.`;
  }

  function openAssignModal(applicantId) {
    const applicant = (state.applicants || []).find((item) => String(item.id) === String(applicantId));
    if (!applicant) return;
    state.pendingApplicantId = String(applicantId);
    fillAssignOptions(applicant);
    setStatus("assignStatus", "");
    $("assignModal").hidden = false;
  }

  function closeAssignModal() {
    state.pendingApplicantId = "";
    $("assignModal").hidden = true;
    setStatus("assignStatus", "");
  }

  async function openApplicantCv(applicantId) {
    try {
      const applicant = (state.applicants || []).find((item) => String(item.id) === String(applicantId));
      if (!applicant) throw new Error("Applicant not found.");
      const params = new URLSearchParams({
        access_token: state.token,
        cv_url: String(applicant.cvUrl || ""),
        cv_filename: String(applicant.cvFilename || "")
      });
      window.open(`/company/candidates/${encodeURIComponent(applicantId)}/cv?${params.toString()}`, "_blank", "noopener,noreferrer");
      setStatus("applicantsStatus", "Opening CV...", "ok");
    } catch (error) {
      setStatus("applicantsStatus", String(error?.message || error), "error");
    }
  }

  async function removeApplicant(applicantId) {
    try {
      await api(`/company/applicants?id=${encodeURIComponent(applicantId)}`, "DELETE");
      state.applicants = (state.applicants || []).filter((item) => String(item.id) !== String(applicantId));
      renderApplicants();
      setStatus("applicantsStatus", "Applicant removed.", "ok");
    } catch (error) {
      setStatus("applicantsStatus", String(error?.message || error), "error");
    }
  }

  async function assignApplicant() {
    try {
      const recruiterId = $("assignRecruiter").value;
      const jdTitle = $("assignJd").value;
      if (!state.pendingApplicantId || !recruiterId || !jdTitle) {
        throw new Error("Select recruiter and JD first.");
      }
      setStatus("assignStatus", "Saving assignment...");
      await api("/company/applicants/assign", "POST", {
        id: state.pendingApplicantId,
        assignedToUserId: recruiterId,
        jdTitle
      });
      closeAssignModal();
      await loadWorkspace();
      switchView("captured");
      setWorkspaceStatus("Applicant assigned and moved into captured notes flow.", "ok");
    } catch (error) {
      setStatus("assignStatus", String(error?.message || error), "error");
    }
  }

  function updateHostedApplyField() {
    const select = $("hostedJobSelect");
    $("hostedApplyField").value = getHostedApplyLink(select.value || "");
  }

  async function loadWorkspace() {
    const [userResult, dashboardResult, applicantsResult, intakeResult, jobsResult, usersResult, candidatesResult] = await Promise.all([
      api("/auth/me"),
      api("/company/dashboard"),
      api("/company/applicants").catch(() => ({ items: [] })),
      api("/company/applicant-intake-secret").catch(() => null),
      api("/company/jds").catch(() => ({ jobs: [] })),
      api("/company/users").catch(() => ({ users: [] })),
      api("/candidates").catch(() => [])
    ]);
    state.user = userResult.user || userResult;
    state.dashboard = dashboardResult || {};
    state.applicants = applicantsResult.items || [];
    state.intake = intakeResult || {};
    state.jobs = jobsResult.jobs || [];
    state.users = usersResult.users || [];
    state.candidates = Array.isArray(candidatesResult) ? candidatesResult : [];
    renderAuthState();
    renderDashboard();
    renderApplicants();
    renderCapturedNotes();
    renderIntakeSettings();
    renderJobs();
    setWorkspaceStatus("Portal loaded.", "ok");
  }

  async function login(event) {
    event.preventDefault();
    try {
      setStatus("authStatus", "Logging in...");
      const result = await api("/auth/login", "POST", {
        email: $("email").value.trim(),
        password: $("password").value
      });
      state.token = result.token || "";
      localStorage.setItem("recruitdesk_portal_token", state.token);
      setStatus("authStatus", "");
      await loadWorkspace();
    } catch (error) {
      setStatus("authStatus", String(error?.message || error), "error");
    }
  }

  async function logout() {
    state.token = "";
    state.user = null;
    state.dashboard = null;
    state.applicants = [];
    state.candidates = [];
    state.users = [];
    state.intake = null;
    state.jobs = [];
    state.pendingApplicantId = "";
    localStorage.removeItem("recruitdesk_portal_token");
    renderAuthState();
    switchView("dashboard");
    setWorkspaceStatus("");
  }

  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  $("loginForm").addEventListener("submit", login);
  $("logoutBtn").addEventListener("click", logout);
  $("hostedJobSelect").addEventListener("change", updateHostedApplyField);
  $("copyCompanyIdBtn").addEventListener("click", () => copyText($("companyIdField").value, "intakeStatus", "Company ID copied."));
  $("copySecretBtn").addEventListener("click", () => copyText($("intakeSecretField").value, "intakeStatus", "Intake secret copied."));
  $("copyApiBtn").addEventListener("click", () => copyText($("apiUrlField").value, "intakeStatus", "API URL copied."));
  $("copyHostedApplyBtn").addEventListener("click", () => copyText($("hostedApplyField").value, "intakeStatus", "Hosted apply link copied."));
  $("copyWordpressBtn").addEventListener("click", () => copyText($("wordpressSnippetField").value, "intakeStatus", "WordPress snippet copied."));
  $("copyGoogleScriptBtn").addEventListener("click", () => copyText($("googleScriptField").value, "intakeStatus", "Google Sheet script copied."));
  $("assignSubmitBtn").addEventListener("click", assignApplicant);
  $("assignCancelBtn").addEventListener("click", closeAssignModal);
  $("applicantsList").addEventListener("click", (event) => {
    const openCvBtn = event.target.closest(".applicant-open-cv");
    if (openCvBtn) {
      void openApplicantCv(openCvBtn.dataset.id);
      return;
    }
    const assignBtn = event.target.closest(".applicant-assign");
    if (assignBtn) {
      openAssignModal(assignBtn.dataset.id);
      return;
    }
    const removeBtn = event.target.closest(".applicant-remove");
    if (removeBtn) {
      const confirmed = window.confirm("Remove this applicant from the intake inbox?");
      if (confirmed) void removeApplicant(removeBtn.dataset.id);
    }
  });
  $("assignModal").addEventListener("click", (event) => {
    if (event.target === $("assignModal")) closeAssignModal();
  });

  renderAuthState();
  switchView("dashboard");

  if (state.token) {
    loadWorkspace().catch((error) => {
      setWorkspaceStatus(String(error?.message || error), "error");
      logout();
    });
  }
})();
