const candidateList = document.getElementById("candidateList");
const listStatus = document.getElementById("listStatus");
const refreshButton = document.getElementById("refreshButton");
const searchInput = document.getElementById("searchInput");
const recordStateFilter = document.getElementById("recordStateFilter");
const candidateTab = document.getElementById("candidateTab");
const assessmentTab = document.getElementById("assessmentTab");
const authLoggedOut = document.getElementById("authLoggedOut");
const authLoggedIn = document.getElementById("authLoggedIn");
const logoutButton = document.getElementById("logoutButton");
const authSummary = document.getElementById("authSummary");
const authStatus = document.getElementById("authStatus");

let allCandidates = [];
let allAssessments = [];
let activeMode = "candidates";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return String(value || "");
  }
}

function isAssessmentArchived(item) {
  return Boolean(item?.archived) || Boolean(item?.archivedAt) || Boolean(item?.archived_at);
}

function setRecordTab(mode) {
  activeMode = mode === "assessments" ? "assessments" : "candidates";
  const assessmentMode = activeMode === "assessments";
  if (candidateTab) {
    candidateTab.classList.toggle("active", !assessmentMode);
    candidateTab.setAttribute("aria-selected", !assessmentMode ? "true" : "false");
  }
  if (assessmentTab) {
    assessmentTab.classList.toggle("active", assessmentMode);
    assessmentTab.setAttribute("aria-selected", assessmentMode ? "true" : "false");
  }
  if (recordStateFilter) {
    recordStateFilter.innerHTML = assessmentMode
      ? '<option value="active">Active</option><option value="archived">Archived</option>'
      : '<option value="active">Active</option><option value="inactive">Inactive / Hidden</option>';
  }
  applyFiltersAndRender();
}

function setListStatus(message, tone = "") {
  listStatus.textContent = message || "";
  listStatus.className = `status-message${tone ? ` ${tone}` : ""}`;
}

function renderAuthState(user) {
  if (authLoggedOut) authLoggedOut.hidden = Boolean(user);
  if (authLoggedIn) authLoggedIn.hidden = !user;
  if (authSummary) {
    authSummary.textContent = user ? `${user.name} | ${String(user.role || "").toUpperCase()} | ${user.companyName}` : "";
  }
  refreshButton.disabled = !user;
  if (!user) {
    candidateList.innerHTML = '<div class="candidate-card"><p>Login required to view records.</p></div>';
  }
}

function setAuthStatus(message, tone = "") {
  if (!authStatus) return;
  authStatus.textContent = message || "";
  authStatus.className = `status-message${tone ? ` ${tone}` : ""}`;
}

async function patchCandidateHidden(candidateId, hidden) {
  await callQuickCaptureApi(`/company/candidates/${encodeURIComponent(String(candidateId || ""))}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patch: { hidden_from_captured: Boolean(hidden) } })
  });
}

async function archiveAssessment(assessmentId) {
  await callQuickCaptureApi("/company/assessments", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assessmentId: String(assessmentId || "").trim() })
  });
}

async function restoreAssessmentForReuse(assessmentId) {
  return callQuickCaptureApi("/company/assessments/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ assessmentId: String(assessmentId || "").trim() })
  });
}

async function loadRecords() {
  const token = getQuickCaptureAuthToken();
  if (!token) {
    renderAuthState(null);
    return;
  }
  setListStatus("Loading records...");
  refreshButton.disabled = true;
  try {
    const user = await getQuickCaptureCurrentUser();
    if (!user) {
      renderAuthState(null);
      setAuthStatus("Session expired. Please login again.", "error");
      candidateList.innerHTML = '<div class="candidate-card"><p>Session expired. Please login again.</p></div>';
      return;
    }
    renderAuthState(user);
    const [candidatePayload, assessmentPayload] = await Promise.all([
      callQuickCaptureApi("/candidates?limit=5000", { method: "GET" }),
      callQuickCaptureApi("/company/assessments", { method: "GET" }).catch(() => ({ result: { assessments: [] } }))
    ]);
    allCandidates = Array.isArray(candidatePayload?.result) ? candidatePayload.result : [];
    allAssessments = Array.isArray(assessmentPayload?.result?.assessments) ? assessmentPayload.result.assessments : [];
    applyFiltersAndRender();
    setListStatus(`Loaded ${allCandidates.length} captured notes and ${allAssessments.length} assessments.`, "success");
  } catch (error) {
    setListStatus(String(error?.message || error), "error");
  } finally {
    refreshButton.disabled = false;
  }
}

function renderCandidates(items) {
  if (!items.length) {
    candidateList.innerHTML = '<div class="candidate-card"><p>No captured notes found for selected filters.</p></div>';
    return;
  }
  candidateList.innerHTML = items.map((candidate) => {
    const skills = Array.isArray(candidate.skills) ? candidate.skills.filter(Boolean) : [];
    const isHidden = Boolean(candidate.hidden_from_captured);
    return `
      <article class="candidate-card">
        <h3>${escapeHtml(candidate.name || "Unnamed candidate")}</h3>
        <p class="card-meta">
          ${escapeHtml(candidate.role || "Role not captured")}
          ${candidate.company ? ` • ${escapeHtml(candidate.company)}` : ""}
        </p>
        <div class="pill-row">${skills.map((skill) => `<span class="pill">${escapeHtml(skill)}</span>`).join("")}</div>
        <div class="detail-grid">
          <div><strong>Experience:</strong> ${escapeHtml(candidate.experience || "-")}</div>
          <div><strong>Current CTC:</strong> ${escapeHtml(candidate.current_ctc || "-")}</div>
          <div><strong>Expected CTC:</strong> ${escapeHtml(candidate.expected_ctc || "-")}</div>
          <div><strong>Notice Period:</strong> ${escapeHtml(candidate.notice_period || "-")}</div>
          <div><strong>Notes:</strong> ${escapeHtml(candidate.notes || "-")}</div>
          <div><strong>Added:</strong> ${escapeHtml(formatDate(candidate.created_at))}</div>
          <div><strong>Status:</strong> ${isHidden ? "Inactive/Hidden" : "Active"}</div>
        </div>
        <div class="card-actions">
          <a class="secondary-link" href="/quick-capture/capture.html?candidateId=${encodeURIComponent(candidate.id || "")}">Update note</a>
          <button type="button" class="ghost-button" data-action="toggle-candidate" data-id="${escapeHtml(candidate.id || "")}" data-hidden="${isHidden ? "1" : "0"}">${isHidden ? "Show as Active" : "Hide as Inactive"}</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderAssessments(items) {
  if (!items.length) {
    candidateList.innerHTML = '<div class="candidate-card"><p>No assessments found for selected filters.</p></div>';
    return;
  }
  candidateList.innerHTML = items.map((item) => {
    const archived = isAssessmentArchived(item);
    const id = String(item?.id || "");
    const candidateId = String(item?.candidateId || item?.candidate_id || "");
    const name = String(item?.candidateName || item?.name || "").trim();
    return `
      <article class="candidate-card">
        <h3>${escapeHtml(name || "Unnamed candidate")}</h3>
        <p class="card-meta">${escapeHtml(item?.currentDesignation || item?.jdTitle || "-")} ${item?.clientName ? `• ${escapeHtml(item.clientName)}` : ""}</p>
        <div class="detail-grid">
          <div><strong>Status:</strong> ${escapeHtml(item?.candidateStatus || item?.status || "-")}</div>
          <div><strong>Pipeline:</strong> ${escapeHtml(item?.pipelineStage || "-")}</div>
          <div><strong>Current CTC:</strong> ${escapeHtml(item?.currentCtc || "-")}</div>
          <div><strong>Expected CTC:</strong> ${escapeHtml(item?.expectedCtc || "-")}</div>
          <div><strong>Notice:</strong> ${escapeHtml(item?.noticePeriod || "-")}</div>
          <div><strong>Created:</strong> ${escapeHtml(formatDate(item?.createdAt || item?.created_at))}</div>
          <div><strong>Record:</strong> ${archived ? "Archived" : "Active"}</div>
        </div>
        <div class="card-actions">
          ${candidateId ? `<a class="secondary-link" href="/quick-capture/capture.html?candidateId=${encodeURIComponent(candidateId)}">Open linked note</a>` : ""}
          ${!archived ? `<button type="button" class="ghost-button" data-action="archive-assessment" data-id="${escapeHtml(id)}">Archive</button>` : `<button type="button" class="ghost-button" data-action="remove-assessment" data-id="${escapeHtml(id)}">Remove</button>`}
          <button type="button" class="ghost-button" data-action="reuse-assessment" data-id="${escapeHtml(id)}">Reuse as New</button>
        </div>
      </article>
    `;
  }).join("");
}

function applyFiltersAndRender() {
  const query = String(searchInput?.value || "").trim().toLowerCase();
  const state = String(recordStateFilter?.value || "active").trim().toLowerCase();
  if (activeMode === "assessments") {
    let rows = allAssessments.slice();
    rows = rows.filter((item) => (state === "archived" ? isAssessmentArchived(item) : !isAssessmentArchived(item)));
    if (query) {
      rows = rows.filter((item) => {
        const hay = [
          item?.candidateName, item?.name, item?.clientName, item?.jdTitle, item?.currentDesignation,
          item?.phoneNumber, item?.emailId, item?.candidateStatus, item?.pipelineStage
        ].map((v) => String(v || "").toLowerCase()).join(" ");
        return hay.includes(query);
      });
    }
    renderAssessments(rows);
    return;
  }

  let rows = allCandidates.slice();
  rows = rows.filter((item) => (state === "inactive" ? Boolean(item?.hidden_from_captured) : !item?.hidden_from_captured));
  if (query) {
    rows = rows.filter((candidate) => {
      const haystack = [
        candidate.name, candidate.company, candidate.role, candidate.experience, candidate.phone,
        candidate.email, candidate.linkedin, candidate.notes, candidate.next_action
      ].map((value) => String(value || "").toLowerCase()).join(" ");
      return haystack.includes(query);
    });
  }
  renderCandidates(rows);
}

candidateList.addEventListener("click", async (event) => {
  const btn = event.target?.closest?.("button[data-action]");
  if (!btn) return;
  const action = String(btn.getAttribute("data-action") || "");
  const id = String(btn.getAttribute("data-id") || "");
  if (!id) return;
  try {
    btn.disabled = true;
    if (action === "toggle-candidate") {
      const hidden = btn.getAttribute("data-hidden") === "1";
      await patchCandidateHidden(id, !hidden);
      setListStatus(hidden ? "Candidate restored to active." : "Candidate moved to inactive.", "success");
      await loadRecords();
      return;
    }
    if (action === "archive-assessment" || action === "remove-assessment") {
      await archiveAssessment(id);
      setListStatus(action === "archive-assessment" ? "Assessment archived." : "Assessment removed.", "success");
      await loadRecords();
      return;
    }
    if (action === "reuse-assessment") {
      const restored = await restoreAssessmentForReuse(id);
      const candidateId = String(restored?.result?.candidateId || restored?.result?.candidate_id || "").trim();
      setListStatus("Assessment restored. Opening as reusable note...", "success");
      window.location.href = candidateId
        ? `/quick-capture/capture.html?candidateId=${encodeURIComponent(candidateId)}`
        : "/quick-capture/capture.html";
    }
  } catch (error) {
    setListStatus(String(error?.message || error), "error");
  } finally {
    btn.disabled = false;
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/quick-capture/sw.js").catch(() => {});
  });
}

refreshButton.addEventListener("click", loadRecords);
if (searchInput) searchInput.addEventListener("input", applyFiltersAndRender);
if (recordStateFilter) recordStateFilter.addEventListener("change", applyFiltersAndRender);
if (candidateTab) candidateTab.addEventListener("click", () => setRecordTab("candidates"));
if (assessmentTab) assessmentTab.addEventListener("click", () => setRecordTab("assessments"));

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    logoutQuickCaptureUser();
    renderAuthState(null);
    setAuthStatus("Logged out.", "success");
  });
}

getQuickCaptureCurrentUser()
  .then((user) => {
    renderAuthState(user);
    if (user) {
      setAuthStatus("Logged in.", "success");
      setRecordTab("candidates");
      return loadRecords();
    }
    return null;
  })
  .catch(() => {
    renderAuthState(null);
  });
