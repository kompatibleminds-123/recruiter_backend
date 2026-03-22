const QUICK_CAPTURE_AUTH_STORAGE_KEY = "quickCaptureBackendAuthToken";

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
