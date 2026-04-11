const QUICK_CAPTURE_AUTH_STORAGE_KEY = "quickCaptureBackendAuthToken";
const QUICK_CAPTURE_WORKSPACE_CACHE_KEY = "quickCaptureWorkspaceCache";

function getQuickCaptureAuthToken() {
  return String(window.localStorage.getItem(QUICK_CAPTURE_AUTH_STORAGE_KEY) || "").trim();
}

function setQuickCaptureAuthToken(token) {
  if (token) {
    window.localStorage.setItem(QUICK_CAPTURE_AUTH_STORAGE_KEY, String(token).trim());
    return;
  }
  window.localStorage.removeItem(QUICK_CAPTURE_AUTH_STORAGE_KEY);
}

async function callQuickCaptureApi(path, options = {}) {
  const token = getQuickCaptureAuthToken();
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }

  return payload;
}

async function loginQuickCaptureUser(email, password) {
  const payload = await callQuickCaptureApi("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: String(email || "").trim(),
      password: String(password || "")
    })
  });
  const token = String(payload?.result?.token || "").trim();
  if (!token) {
    throw new Error("Backend login did not return a token.");
  }
  setQuickCaptureAuthToken(token);
  return payload?.result?.user || null;
}

async function getQuickCaptureCurrentUser() {
  const token = getQuickCaptureAuthToken();
  if (!token) return null;
  try {
    const payload = await callQuickCaptureApi("/auth/me", { method: "GET" });
    return payload?.result?.user || null;
  } catch {
    setQuickCaptureAuthToken("");
    return null;
  }
}

function logoutQuickCaptureUser() {
  setQuickCaptureAuthToken("");
}

function setQuickCaptureWorkspaceCache(cache) {
  if (!cache) {
    window.localStorage.removeItem(QUICK_CAPTURE_WORKSPACE_CACHE_KEY);
    return;
  }
  window.localStorage.setItem(QUICK_CAPTURE_WORKSPACE_CACHE_KEY, JSON.stringify(cache));
}

function getQuickCaptureWorkspaceCache() {
  try {
    return JSON.parse(window.localStorage.getItem(QUICK_CAPTURE_WORKSPACE_CACHE_KEY) || "null");
  } catch {
    return null;
  }
}

async function refreshQuickCaptureWorkspaceCache() {
  const user = await getQuickCaptureCurrentUser();
  if (!user) {
    throw new Error("Login required before refresh.");
  }

  const [jobsPayload, candidatesPayload, assessmentsPayload] = await Promise.all([
    callQuickCaptureApi("/company/jds", { method: "GET" }),
    callQuickCaptureApi("/candidates?limit=1000", { method: "GET" }),
    callQuickCaptureApi("/company/assessments", { method: "GET" })
  ]);

  const jobs = Array.isArray(jobsPayload?.result?.jobs) ? jobsPayload.result.jobs : [];
  const candidates = Array.isArray(candidatesPayload?.result) ? candidatesPayload.result : [];
  const assessments = Array.isArray(assessmentsPayload?.result?.assessments)
    ? assessmentsPayload.result.assessments
    : Array.isArray(assessmentsPayload?.result)
      ? assessmentsPayload.result
      : [];
  const cache = {
    syncedAt: new Date().toISOString(),
    userId: user.id || "",
    companyId: user.companyId || "",
    jobs,
    candidates,
    assessments
  };
  setQuickCaptureWorkspaceCache(cache);
  return {
    ...cache,
    counts: {
      jobs: jobs.length,
      candidates: candidates.length,
      assessments: assessments.length
    }
  };
}

function formatQuickCaptureSyncMessage(cache) {
  if (!cache?.counts) return "Workspace refreshed.";
  return `Workspace refreshed: ${cache.counts.jobs} job(s), ${cache.counts.candidates} candidate(s), ${cache.counts.assessments} assessment(s).`;
}

function wireQuickCaptureRefreshButton(button, statusElement) {
  if (!button) return;
  button.addEventListener("click", async () => {
    if (statusElement) {
      statusElement.textContent = "Refreshing workspace...";
      statusElement.className = "status-message";
    }
    button.disabled = true;
    try {
      const cache = await refreshQuickCaptureWorkspaceCache();
      if (statusElement) {
        statusElement.textContent = formatQuickCaptureSyncMessage(cache);
        statusElement.className = "status-message success";
      }
    } catch (error) {
      if (statusElement) {
        statusElement.textContent = String(error?.message || error);
        statusElement.className = "status-message error";
      }
    } finally {
      button.disabled = false;
    }
  });
}
