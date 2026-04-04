const loginPanel = document.getElementById("loginPanel");
const createPanel = document.getElementById("createPanel");
const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");
const loginButton = document.getElementById("loginButton");
const logoutButton = document.getElementById("logoutButton");
const loginStatus = document.getElementById("loginStatus");
const loggedInSummary = document.getElementById("loggedInSummary");
const companyName = document.getElementById("companyName");
const adminName = document.getElementById("adminName");
const newAdminEmail = document.getElementById("newAdminEmail");
const newAdminPassword = document.getElementById("newAdminPassword");
const platformSecretInput = document.getElementById("platformSecret");
const createButton = document.getElementById("createButton");
const createStatus = document.getElementById("createStatus");

function setLoginStatus(message, tone = "") {
  if (!loginStatus) return;
  loginStatus.textContent = message || "";
  loginStatus.className = `status-message${tone ? ` ${tone}` : ""}`;
}

function setCreateStatus(message, tone = "") {
  if (!createStatus) return;
  createStatus.textContent = message || "";
  createStatus.className = `status-message${tone ? ` ${tone}` : ""}`;
}

function showPanels(user) {
  if (user) {
    if (loginPanel) loginPanel.hidden = true;
    if (createPanel) createPanel.hidden = false;
    if (loggedInSummary) {
      loggedInSummary.textContent = `${user.name} (${user.email}) · ${user.companyName || "company"}`;
    }
  } else {
    if (loginPanel) loginPanel.hidden = false;
    if (createPanel) createPanel.hidden = true;
    if (loggedInSummary) loggedInSummary.textContent = "";
  }
}

async function handleLogin() {
  setLoginStatus("");
  try {
    if (loginButton) loginButton.disabled = true;
    const user = await loginQuickCaptureUser(authEmail?.value, authPassword?.value);
    if (authPassword) authPassword.value = "";
    showPanels(user);
    setLoginStatus("Logged in. Fill the new company details below.", "success");
  } catch (error) {
    showPanels(null);
    setLoginStatus(String(error?.message || error), "error");
  } finally {
    if (loginButton) loginButton.disabled = false;
  }
}

function handleLogout() {
  logoutQuickCaptureUser();
  showPanels(null);
  setLoginStatus("Logged out.", "success");
  setCreateStatus("");
}

async function handleCreateCompany() {
  setCreateStatus("");
  const token = getQuickCaptureAuthToken();
  if (!token) {
    setCreateStatus("Login first.", "error");
    return;
  }
  const body = {
    companyName: String(companyName?.value || "").trim(),
    adminName: String(adminName?.value || "").trim(),
    email: String(newAdminEmail?.value || "").trim(),
    password: String(newAdminPassword?.value || "")
  };
  const secret = String(platformSecretInput?.value || "").trim();
  if (secret) {
    body.platformSecret = secret;
  }
  try {
    if (createButton) createButton.disabled = true;
    const payload = await callQuickCaptureApi("/platform/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setCreateStatus("Company created. New admin can log in with the email you set.", "success");
    if (newAdminPassword) newAdminPassword.value = "";
    if (platformSecretInput) platformSecretInput.value = "";
    console.log("createCompany result", payload?.result);
  } catch (error) {
    setCreateStatus(String(error?.message || error), "error");
  } finally {
    if (createButton) createButton.disabled = false;
  }
}

if (loginButton) loginButton.addEventListener("click", handleLogin);
if (logoutButton) logoutButton.addEventListener("click", handleLogout);
if (createButton) createButton.addEventListener("click", handleCreateCompany);

getQuickCaptureCurrentUser()
  .then((user) => {
    showPanels(user);
    if (user) {
      setLoginStatus("Already logged in. You can create a company below.", "success");
    }
  })
  .catch(() => {
    showPanels(null);
  });
