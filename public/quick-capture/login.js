const authLoggedOut = document.getElementById("authLoggedOut");
const authLoggedIn = document.getElementById("authLoggedIn");
const authEmailInput = document.getElementById("authEmail");
const authPasswordInput = document.getElementById("authPassword");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const authStatus = document.getElementById("authStatus");
const authSummary = document.getElementById("authSummary");

function setAuthStatus(message, tone = "") {
  if (!authStatus) return;
  authStatus.textContent = message || "";
  authStatus.className = `status-message${tone ? ` ${tone}` : ""}`;
}

function renderAuthState(user) {
  if (authLoggedOut) authLoggedOut.hidden = Boolean(user);
  if (authLoggedIn) authLoggedIn.hidden = !user;
  if (authSummary) {
    authSummary.textContent = user
      ? `${user.name} | ${user.role === "admin" ? "ADMIN" : "RECRUITER"} | ${user.companyName}`
      : "";
  }
}

async function handleLogin() {
  setAuthStatus("");
  try {
    if (loginButton) loginButton.disabled = true;
    const user = await loginQuickCaptureUser(authEmailInput?.value, authPasswordInput?.value);
    if (authPasswordInput) authPasswordInput.value = "";
    renderAuthState(user);
    setAuthStatus("Login successful. Opening Capture...", "success");
    window.setTimeout(() => {
      window.location.href = "/quick-capture/capture.html";
    }, 350);
  } catch (error) {
    renderAuthState(null);
    setAuthStatus(`Login failed: ${String(error?.message || error)}`, "error");
  } finally {
    if (loginButton) loginButton.disabled = false;
  }
}

function handleLogout() {
  logoutQuickCaptureUser();
  renderAuthState(null);
  setAuthStatus("Logged out.", "success");
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/quick-capture/sw.js").catch(() => {});
  });
}

if (loginButton) {
  loginButton.addEventListener("click", handleLogin);
}

if (logoutButton) {
  logoutButton.addEventListener("click", handleLogout);
}

getQuickCaptureCurrentUser()
  .then((user) => {
    renderAuthState(user);
    if (user) {
      setAuthStatus("Already logged in. You can open Capture or Drafts below.", "success");
    }
  })
  .catch(() => {
    renderAuthState(null);
  });
