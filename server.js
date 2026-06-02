const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseCandidatePayload } = require("./src/parser");
const { callOpenAiJsonSchema, callOpenAiQuestions, normalizeCandidateFileWithAi, normalizeCandidateWithAi, extractLinkedInAssistFromScreenshotWithAi } = require("./src/ai");
const { parseCandidateHybrid } = require("./src/hybrid-candidate-service");
const { storeUploadedFile, loadStoredFile } = require("./src/storage");
const {
  assignCandidate,
  deleteCandidate,
  exportCompanyQuickCaptureData,
  getCandidateStatsForUser,
  findDuplicateCandidate,
  linkCandidateToAssessment,
  listDatabaseCandidatesForUser,
  listCandidatesForUser,
  listCandidates,
  listContactAttempts,
  patchCandidate,
  parseCandidateQuickNote,
  saveCandidate,
  saveContactAttempt
} = require("./src/quick-capture");
const {
  extractIncomingWhatsAppMessages,
  listWhatsappStructuredNotes,
  processIncomingWhatsappMessage,
  sendWhatsappConfirmation
} = require("./src/whatsapp-notes");
const {
  bootstrapAdmin,
  createClientUser,
  createEmployeeUser,
  createCompanyWithAdmin,
  createTrialCompanyWithAdmin,
  createUser,
  updateUserProfile,
  deleteUser,
  deleteAssessment,
  deleteCompanyJob,
  getUserSmtpSettings,
  saveUserSmtpSettings,
  getCompanyApplicantIntakeSecret,
  getCompanyClientUsers,
  getCompanyPayrollSettings,
  getCompanyPayrollAccessControl,
  getEmployeeProfile,
  getCompanyLicense,
  getClientSessionUser,
  getEmployeeSessionUser,
  getSessionUser,
  getPlatformSessionUser,
  getCompanySharedExportPresets,
  getCompanyEmailThreadByKey,
  getCompanyPersonalShortcuts,
  getPublicCompanyJob,
  getPublicCompanyJobsBySlug,
  listCompanyEmployees,
  listCompanySalaryTemplates,
  listCompanyFbpHeads,
  listEmployeeCompanyFbpHeads,
  listFbpDeclarations,
  listEmployeeFbpDeclarations,
  listPayrollInputs,
  listPayrollPayslips,
  listPayrollRuns,
  listEmployeeCompensationStructures,
  listCompaniesAndUsersSummary,
  listAssessments,
  listEmployeeAttendance,
  getAssessmentById,
  searchAssessments,
  listCompanyJobs,
  listCompanyUsers,
  loginClient,
  loginEmployee,
  loginPayrollAdmin,
  loginPlatformCreator,
  login,
  incrementCompanyCaptureUsage,
  markEmployeeAttendance,
  createPayrollRunDraft,
  calculatePayrollRun,
  approvePayrollRun,
  lockPayrollRun,
  setPayrollRunStatus,
  deletePayrollRun,
  getPayrollRunDetail,
  publishPayrollPayslips,
  requirePlatformSessionUser,
  requireClientSessionUser,
  requireEmployeeSessionUser,
  requirePayrollSessionUser,
  requireSessionUser,
  getPortalUserByEmailForReset,
  resetClientUserPassword,
  resetEmployeeUserPassword,
  resetPortalUserPasswordByToken,
  resetUserPassword,
  removeCompanyFbpHead,
  reviewFbpDeclaration,
  saveAssessment,
  saveFbpDeclaration,
  saveEmployeeFbpDeclaration,
  saveCompanyFbpHead,
  saveCompanySalaryTemplate,
  saveCompanyPayrollSettings,
  saveCompanyPayrollAccessControl,
  savePayrollInput,
  saveEmployeeCompensationStructure,
  saveEmployeeProfile,
  updateEmployeeProfileAndWorkSite,
  patchAssessmentCandidateLink,
  saveCompanyJob,
  saveCompanyJobRecruiterShortcuts,
  saveCompanySharedExportPresets,
  appendAuditLog,
  listCompanyAuditLogs,
  upsertCompanyEmailThread,
  saveCompanyPersonalShortcuts,
  setCompanyExtensionPlan,
  setCompanyApplicantIntakeSecret,
  verifyUserEmail
} = require("./src/auth-store");

const { DEFAULT_SYNONYMS, mapLocationAlias } = require("./src/search/synonyms");
const { normalizeRecruiterQuery } = require("./src/search/normalize");
const { parseDeterministicRecruiterQuery, resolveKnownRole } = require("./src/search/query-parser");
const { hybridSearchCandidates, buildCandidateSemanticText } = require("./src/search/hybrid-search");
const { createEmbedding, hashText } = require("./src/search/embedding-service");
const { upsertCandidateSearchDocV1, listCandidateSearchDocsForCompany, listAssessmentEvents, insertSearchParseFeedback } = require("./src/search/search-doc-store");
let nodemailer = null;
try {
  // Optional dependency: only needed when SMTP-based JD email sharing is enabled.
  // If not installed / not configured, endpoint will return a clear error.
  nodemailer = require("nodemailer");
} catch (_) {
  nodemailer = null;
}

let docxLib = null;
try {
  docxLib = require("docx");
} catch (_) {
  docxLib = null;
}
let xlsxLib = null;
try {
  xlsxLib = require("xlsx");
} catch (_) {
  xlsxLib = null;
}
let pdfLib = null;
try {
  pdfLib = require("pdf-lib");
} catch (_) {
  pdfLib = null;
}

const PORT = Number(process.env.PORT || 8787);
const WHATSAPP_VERIFY_TOKEN = String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
const QUICK_CAPTURE_PUBLIC_DIR = path.join(__dirname, "public", "quick-capture");
const ROOT_PUBLIC_DIR = path.join(__dirname, "public");
const BRANDED_CV_RESPONSE_CACHE_TTL_MS = 1000 * 60 * 10;
const BRANDED_CV_RESPONSE_CACHE_MAX_ENTRIES = 30;
const BRANDED_CV_RESPONSE_CACHE = new Map();
const MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  sept: 8,
  oct: 9,
  nov: 10,
  dec: 11
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function extractEmailAddress(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const angle = raw.match(/<([^>]+)>/);
  const candidate = angle?.[1] || raw;
  const emailMatch = String(candidate).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return String(emailMatch?.[0] || "").trim();
}

function normalizeSmtpHost(host = "") {
  return String(host || "")
    .trim()
    .replace(/^smtps?:\/\//i, "")
    .replace(/\/.*$/, "")
    .trim();
}

function sanitizeSmtpConfig(rawCfg = {}) {
  const host = normalizeSmtpHost(rawCfg.host);
  const secure = Boolean(rawCfg.secure);
  const portRaw = Number(rawCfg.port || (secure ? 465 : 587));
  const port = Number.isFinite(portRaw) && portRaw > 0 ? Math.round(portRaw) : (secure ? 465 : 587);
  const from = String(rawCfg.from || "").trim();
  let user = String(rawCfg.user || "").trim();
  const fromEmail = extractEmailAddress(from);
  const userLooksLikeEmail = /\S+@\S+\.\S+/.test(user);
  const providerLikelyEmailLogin = /(zoho|gmail|google|outlook|office365|hotmail|yahoo)\./i.test(host.toLowerCase());
  if (!userLooksLikeEmail && fromEmail && providerLikelyEmailLogin) {
    user = fromEmail;
  }
  return {
    host,
    port,
    secure,
    user,
    from,
    pass: String(rawCfg.pass || "")
  };
}

function formatSmtpError(error) {
  const code = String(error?.code || "").trim();
  const responseCode = Number(error?.responseCode || 0) || 0;
  const command = String(error?.command || "").trim();
  const response = String(error?.response || error?.message || error || "").trim();
  const parts = [response];
  if (code) parts.push(`code=${code}`);
  if (responseCode) parts.push(`responseCode=${responseCode}`);
  if (command) parts.push(`command=${command}`);
  return parts.filter(Boolean).join(" | ");
}

function isZohoApiMode(cfg = {}) {
  const host = normalizeSmtpHost(cfg.host).toLowerCase();
  return host.startsWith("zohoapi");
}

function isSendgridApiMode(cfg = {}) {
  const host = normalizeSmtpHost(cfg.host).toLowerCase();
  return host.startsWith("sendgridapi");
}

function isPostmarkApiMode(cfg = {}) {
  const host = normalizeSmtpHost(cfg.host).toLowerCase();
  return host.startsWith("postmarkapi");
}

function isGoogleApiMode(cfg = {}) {
  const host = normalizeSmtpHost(cfg.host).toLowerCase();
  return host.startsWith("googleapi");
}

function isMicrosoftApiMode(cfg = {}) {
  const host = normalizeSmtpHost(cfg.host).toLowerCase();
  return host.startsWith("microsoftapi");
}

function isTruthyEnv(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function getSystemMailConfig() {
  const modeRaw = String(process.env.SYSTEM_MAIL_MODE || "").trim().toLowerCase();
  const from = String(process.env.SYSTEM_MAIL_FROM || "contact@kompatibleminds.com").trim();
  const user = String(process.env.SYSTEM_MAIL_USER || from).trim();
  const pass = String(process.env.SYSTEM_MAIL_PASS || "").trim();
  const host = normalizeSmtpHost(
    process.env.SYSTEM_MAIL_HOST ||
    (modeRaw === "zoho_api" ? "zohoapi.com" : modeRaw === "sendgrid_api" ? "sendgridapi" : modeRaw === "postmark_api" ? "postmarkapi" : "smtp.zoho.com")
  );
  const portDefault = modeRaw === "smtp" ? 587 : 443;
  const port = Number(process.env.SYSTEM_MAIL_PORT || portDefault) || portDefault;
  const secure = isTruthyEnv(process.env.SYSTEM_MAIL_SECURE);
  return sanitizeSmtpConfig({ host, port, secure, user, from, pass });
}

function systemMailReady(cfg = {}) {
  const hasFrom = Boolean(extractEmailAddress(cfg.from || ""));
  if (isZohoApiMode(cfg) || isSendgridApiMode(cfg) || isPostmarkApiMode(cfg) || isGoogleApiMode(cfg) || isMicrosoftApiMode(cfg)) {
    return hasFrom && Boolean(String(cfg.pass || "").trim());
  }
  return hasFrom && Boolean(cfg.host) && Boolean(cfg.user) && Boolean(String(cfg.pass || "").trim());
}

async function sendPlatformTransactionalMail({ to, cc = "", subject, html = "", text = "" }) {
  const cfg = getSystemMailConfig();
  const toEmail = String(to || "").trim();
  if (!isValidEmail(toEmail)) {
    throw new Error("Invalid recipient email for transactional mail.");
  }
  if (isEmailBounced(toEmail)) {
    const info = getEmailBounceInfo(toEmail);
    throw new Error(`Recipient email is marked bounced/blocked (${String(info?.reason || "bounce")}).`);
  }
  if (!systemMailReady(cfg)) {
    console.log("[mail] Skipped transactional mail (system sender not configured).", { to, subject });
    return { skipped: true };
  }
  if (isZohoApiMode(cfg)) {
    const systemZohoClientId = String(process.env.SYSTEM_ZOHO_CLIENT_ID || "").trim();
    const systemZohoClientSecret = String(process.env.SYSTEM_ZOHO_CLIENT_SECRET || "").trim();
    const cfgWithSystemClient = {
      ...cfg,
      __zohoClientId: systemZohoClientId || undefined,
      __zohoClientSecret: systemZohoClientSecret || undefined
    };
    await sendZohoEmailWithCfg(cfgWithSystemClient, { to: toEmail, cc, subject, html, text, attachments: [] });
    return { mode: "zoho_api" };
  }
  if (isSendgridApiMode(cfg)) {
    await sendSendgridEmailWithCfg(cfg, { to: toEmail, cc, subject, html, text, attachments: [] });
    return { mode: "sendgrid_api" };
  }
  if (isPostmarkApiMode(cfg)) {
    await sendPostmarkEmailWithCfg(cfg, { to: toEmail, cc, subject, html, text, attachments: [] });
    return { mode: "postmark_api" };
  }
  if (isGoogleApiMode(cfg)) {
    await sendGoogleEmailWithCfg(cfg, { to: toEmail, cc, subject, html, text, attachments: [] });
    return { mode: "google_api" };
  }
  if (isMicrosoftApiMode(cfg)) {
    await sendMicrosoftEmailWithCfg(cfg, { to: toEmail, cc, subject, html, text, attachments: [] });
    return { mode: "microsoft_api" };
  }
  if (!nodemailer) throw new Error("Nodemailer dependency is missing for SMTP system mail mode.");
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  });
  await transport.sendMail({ from: cfg.from, to: toEmail, cc: cc || undefined, subject, text, html: html || undefined });
  return { mode: "smtp" };
}

function buildSignupMail({ companyName = "", adminName = "", verifyUrl = "" }) {
  const safeCompany = String(companyName || "").trim() || "your company";
  const safeName = String(adminName || "").trim() || "there";
  const safeVerifyUrl = String(verifyUrl || "").trim();
  const subject = `Welcome to RecruitDesk AI from Kompatible Minds - ${safeCompany}`;
  const text = `Hi ${safeName},\n\nWelcome to RecruitDesk AI from Kompatible Minds.\nYour workspace for ${safeCompany} is almost ready.\n\nPlease verify your email to activate your account:\n${safeVerifyUrl}\n\nIf this signup was not done by you, please ignore this email.\n\nRegards,\nRecruitDesk AI from Kompatible Minds`;
  const html = `<p>Hi ${escapeHtml(safeName)},</p><p>Welcome to <strong>RecruitDesk AI from Kompatible Minds</strong>.</p><p>Your workspace for <strong>${escapeHtml(safeCompany)}</strong> is almost ready.</p><p>Please verify your email to activate your account:</p><p><a href="${escapeHtml(safeVerifyUrl)}" target="_blank" rel="noopener noreferrer">Activate account</a></p><p>If this signup was not done by you, please ignore this email.</p><p>Regards,<br/>RecruitDesk AI from Kompatible Minds</p>`;
  return { subject, text, html };
}

function buildPasswordResetMail({ adminName = "", resetUrl = "" }) {
  const safeName = String(adminName || "").trim() || "there";
  const safeResetUrl = String(resetUrl || "").trim();
  const subject = "Reset your RecruitDesk AI password";
  const text = `Hi ${safeName},\n\nWe received a request to reset your RecruitDesk AI password.\n\nUse this link to set a new password:\n${safeResetUrl}\n\nThis link expires in 30 minutes.\nIf you did not request this, you can ignore this email.\n\nRegards,\nRecruitDesk AI from Kompatible Minds`;
  const html = `<p>Hi ${escapeHtml(safeName)},</p><p>We received a request to reset your <strong>RecruitDesk AI</strong> password.</p><p><a href="${escapeHtml(safeResetUrl)}" target="_blank" rel="noopener noreferrer">Reset password</a></p><p>This link expires in <strong>30 minutes</strong>.</p><p>If you did not request this, you can ignore this email.</p><p>Regards,<br/>RecruitDesk AI from Kompatible Minds</p>`;
  return { subject, text, html };
}

function planLabel(planCode = "") {
  const code = String(planCode || "").trim().toLowerCase();
  if (code === "trial") return "7-day Trial";
  if (code === "basic") return "Basic";
  if (code === "full_recruiter") return "Full Recruiter";
  if (code.includes("basic") || code === "ext_499_1_user") return "Basic";
  if (code.includes("full") || code.includes("suite") || code.includes("saas") || code === "ext_999_3_users" || code === "ext_1999_7_users") return "Full Recruiter";
  return String(planCode || "Plan").trim();
}

const PLAN_DEFINITIONS = {
  trial: { code: "trial", label: "7-day Trial", amountInr: 0, interval: "one_time_trial", seats: 1, tier: "basic_layout", fullRecruiter: false, suiteModules: false },
  basic: { code: "basic", label: "Basic", amountInr: 499, interval: "monthly", seats: 1, tier: "basic_layout", fullRecruiter: false, suiteModules: false },
  full_recruiter: { code: "full_recruiter", label: "Full Recruiter", amountInr: 999, interval: "monthly", seats: null, tier: "full_recruiter_mode", fullRecruiter: true, suiteModules: true },
  legacy: { code: "legacy", label: "Legacy", amountInr: 0, interval: "legacy", seats: null, tier: "full_recruiter_mode", fullRecruiter: true, suiteModules: true }
};

function getPortalBuildInfo() {
  const assetsDir = path.join(ROOT_PUBLIC_DIR, "portal-app", "assets");
  let buildId = "unknown";
  let builtAtIso = "";
  try {
    const files = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
    const jsFiles = files.filter((name) => /^index-.*\.js$/i.test(String(name || "")));
    const target = jsFiles[0] || "";
    if (target) {
      const m = String(target).match(/^index-([^.]+)\.js$/i);
      if (m && m[1]) buildId = m[1];
      const fullPath = path.join(assetsDir, target);
      const stat = fs.statSync(fullPath);
      if (stat?.mtime) builtAtIso = new Date(stat.mtime).toISOString();
    }
  } catch (_) {
    // Keep endpoint resilient even when asset scan fails.
  }
  return { buildId, builtAt: builtAtIso };
}

function getPlanDefinition(planCode = "") {
  const code = String(planCode || "").trim().toLowerCase();
  if (PLAN_DEFINITIONS[code]) return PLAN_DEFINITIONS[code];
  if (code.includes("basic") || code === "ext_499_1_user") return PLAN_DEFINITIONS.basic;
  if (code.includes("full") || code.includes("suite") || code.includes("saas") || code === "ext_999_3_users" || code === "ext_1999_7_users" || code === "enterprise_contact") return PLAN_DEFINITIONS.full_recruiter;
  return PLAN_DEFINITIONS.trial;
}

function getPlanCatalog() {
  return ["trial", "basic", "full_recruiter"].map((code) => {
    const def = getPlanDefinition(code);
    return {
      code: def.code,
      label: def.label,
      amountInr: def.amountInr,
      interval: def.interval,
      seats: def.seats,
      tier: def.tier,
      fullRecruiter: Boolean(def.fullRecruiter),
      suiteModules: Boolean(def.suiteModules)
    };
  });
}

function buildBillingOverview({ license = null, companyId = "", isFullAccess = false } = {}) {
  const safeLicense = license && typeof license === "object" ? license : {};
  const planCode = String(safeLicense.plan || "trial").trim().toLowerCase();
  const catalog = getPlanCatalog();
  const currentPlan = getPlanDefinition(planCode);
  const amountInr = Number(currentPlan?.amountInr || 0);
  return {
    companyId: String(companyId || "").trim(),
    fullAccessBypass: Boolean(isFullAccess),
    currentPlan: {
      code: planCode,
      label: currentPlan?.label || planLabel(planCode),
      amountInr,
      interval: currentPlan?.interval || "monthly",
      tier: currentPlan?.tier || "basic_layout",
      fullRecruiter: Boolean(currentPlan?.fullRecruiter) || Boolean(isFullAccess),
      suiteModules: Boolean(currentPlan?.suiteModules) || Boolean(isFullAccess),
      seats: currentPlan?.seats ?? null
    },
    license: safeLicense,
    billing: {
      amountInr,
      currency: "INR",
      subscriptionEndsAt: String(safeLicense.subscriptionEndsAt || "").trim() || null,
      subscriptionStartedAt: String(safeLicense.subscriptionStartedAt || "").trim() || null,
      status: String(safeLicense.status || "").trim().toLowerCase() || "trial"
    },
    plans: catalog
  };
}

function buildPlanPurchaseMail({ companyName = "", planCode = "", subscriptionEndsAt = "" }) {
  const safeCompany = String(companyName || "").trim() || "your company";
  const planName = planLabel(planCode);
  const endText = subscriptionEndsAt ? new Date(subscriptionEndsAt).toLocaleDateString("en-IN") : "N/A";
  const subject = `RecruitDesk AI from Kompatible Minds - Plan Activated (${planName})`;
  const text = `Your plan has been activated for ${safeCompany}.\nPlan: ${planName}\nValid till: ${endText}\n\nThank you for choosing RecruitDesk AI from Kompatible Minds.\n\nRegards,\nRecruitDesk AI from Kompatible Minds`;
  const html = `<p>Your plan has been activated for <strong>${escapeHtml(safeCompany)}</strong>.</p><p><strong>Plan:</strong> ${escapeHtml(planName)}<br/><strong>Valid till:</strong> ${escapeHtml(endText)}</p><p>Thank you for choosing <strong>RecruitDesk AI from Kompatible Minds</strong>.</p><p>Regards,<br/>RecruitDesk AI from Kompatible Minds</p>`;
  return { subject, text, html };
}

function buildPlanExpiryReminderMail({ companyName = "", daysLeft = 0, subscriptionEndsAt = "" }) {
  const safeCompany = String(companyName || "").trim() || "your company";
  const endText = subscriptionEndsAt ? new Date(subscriptionEndsAt).toLocaleDateString("en-IN") : "soon";
  const dueText = daysLeft <= 0 ? "has expired" : `expires in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const subject = `RecruitDesk AI from Kompatible Minds - Subscription ${dueText}`;
  const text = `Your RecruitDesk AI subscription for ${safeCompany} ${dueText}.\nExpiry date: ${endText}\nPlease renew to avoid interruption.\n\nRegards,\nRecruitDesk AI from Kompatible Minds`;
  const html = `<p>Your RecruitDesk AI subscription for <strong>${escapeHtml(safeCompany)}</strong> ${escapeHtml(dueText)}.</p><p><strong>Expiry date:</strong> ${escapeHtml(endText)}<br/>Please renew to avoid interruption.</p><p>Regards,<br/>RecruitDesk AI from Kompatible Minds</p>`;
  return { subject, text, html };
}

const PLAN_REMINDER_SENT_CACHE = new Map();
const BOUNCED_EMAIL_CACHE = new Map();

function normalizeEmailForBounce(value = "") {
  return String(value || "").trim().toLowerCase();
}

function markEmailBounced(email = "", reason = "") {
  const key = normalizeEmailForBounce(email);
  if (!key || !isValidEmail(key)) return false;
  BOUNCED_EMAIL_CACHE.set(key, {
    email: key,
    reason: String(reason || "bounce").trim() || "bounce",
    updatedAt: new Date().toISOString()
  });
  return true;
}

function isEmailBounced(email = "") {
  const key = normalizeEmailForBounce(email);
  return key ? BOUNCED_EMAIL_CACHE.has(key) : false;
}

function getEmailBounceInfo(email = "") {
  const key = normalizeEmailForBounce(email);
  return key ? (BOUNCED_EMAIL_CACHE.get(key) || null) : null;
}

async function maybeSendPlanExpiryReminder(companyId = "") {
  const safeCompanyId = String(companyId || "").trim();
  if (!safeCompanyId) return;
  try {
    const license = await getCompanyLicense(safeCompanyId).catch(() => null);
    const endsAt = String(license?.subscriptionEndsAt || "").trim();
    const status = String(license?.status || "").trim().toLowerCase();
    if (!endsAt || status !== "active") return;
    const msLeft = new Date(endsAt).getTime() - Date.now();
    const daysLeft = Math.ceil(msLeft / 86400000);
    const marker = daysLeft <= 1 ? 1 : daysLeft <= 3 ? 3 : daysLeft <= 5 ? 5 : daysLeft <= 7 ? 7 : null;
    if (marker == null) return;
    const cycleKey = new Date(endsAt).toISOString().slice(0, 10);
    const dedupeKey = `${safeCompanyId}:${cycleKey}:${marker}`;
    if (PLAN_REMINDER_SENT_CACHE.get(dedupeKey)) return;
    const users = await listCompanyUsers(safeCompanyId).catch(() => []);
    const admins = (users || [])
      .filter((u) => String(u?.role || "").trim().toLowerCase() === "admin")
      .map((u) => String(u?.email || "").trim())
      .filter(Boolean);
    const to = admins[0] || "";
    if (!to) return;
    const cc = admins.slice(1).join(",");
    const companyName = String(users?.[0]?.companyName || "").trim();
    const mail = buildPlanExpiryReminderMail({ companyName, daysLeft: marker, subscriptionEndsAt: endsAt });
    await sendPlatformTransactionalMail({ to, cc, subject: mail.subject, html: mail.html, text: mail.text });
    PLAN_REMINDER_SENT_CACHE.set(dedupeKey, true);
  } catch (error) {
    console.log("[mail] expiry reminder skipped:", String(error?.message || error));
  }
}

function resolveZohoBases(cfg = {}) {
  const host = normalizeSmtpHost(cfg.host).toLowerCase();
  const fromEmail = extractEmailAddress(cfg.from || "");
  const userEmail = extractEmailAddress(cfg.user || "");
  const tldHint = [host, fromEmail, userEmail].join(" ");
  const tld =
    tldHint.includes(".zoho.in") || tldHint.endsWith(".in") ? "in" :
    tldHint.includes(".zoho.eu") || tldHint.endsWith(".eu") ? "eu" :
    tldHint.includes(".zoho.com.au") || tldHint.endsWith(".com.au") ? "com.au" :
    tldHint.includes(".zoho.jp") || tldHint.endsWith(".jp") ? "jp" :
    tldHint.includes(".zohocloud.ca") || tldHint.endsWith(".ca") ? "ca" :
    tldHint.includes(".zoho.ae") || tldHint.endsWith(".ae") ? "ae" :
    tldHint.includes(".zoho.sa") || tldHint.endsWith(".sa") ? "sa" :
    tldHint.includes(".zoho.com.cn") || tldHint.endsWith(".com.cn") ? "com.cn" :
    "com";
  const accountsBaseDefaultMap = {
    com: "https://accounts.zoho.com",
    eu: "https://accounts.zoho.eu",
    in: "https://accounts.zoho.in",
    "com.au": "https://accounts.zoho.com.au",
    jp: "https://accounts.zoho.jp",
    ca: "https://accounts.zohocloud.ca",
    ae: "https://accounts.zoho.ae",
    sa: "https://accounts.zoho.sa",
    "com.cn": "https://accounts.zoho.com.cn"
  };
  const mailBaseDefaultMap = {
    com: "https://mail.zoho.com",
    eu: "https://mail.zoho.eu",
    in: "https://mail.zoho.in",
    "com.au": "https://mail.zoho.com.au",
    jp: "https://mail.zoho.jp",
    ca: "https://mail.zohocloud.ca",
    ae: "https://mail.zoho.ae",
    sa: "https://mail.zoho.sa",
    "com.cn": "https://mail.zoho.com.cn"
  };
  const accountsBase = String(process.env.ZOHO_ACCOUNTS_BASE_URL || accountsBaseDefaultMap[tld] || accountsBaseDefaultMap.com).trim().replace(/\/+$/, "");
  const mailBase = String(process.env.ZOHO_MAIL_API_BASE_URL || mailBaseDefaultMap[tld] || mailBaseDefaultMap.com).trim().replace(/\/+$/, "");
  return { tld, accountsBase, mailBase };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 20000));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function toBufferContent(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value == null) return Buffer.alloc(0);
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value), "utf8");
}

function collectZohoAttachmentRefs(node, acc = []) {
  if (!node || typeof node !== "object") return acc;
  if (Array.isArray(node)) {
    for (const item of node) collectZohoAttachmentRefs(item, acc);
    return acc;
  }
  const storeName = String(node.storeName || "").trim();
  const attachmentPath = String(node.attachmentPath || "").trim();
  const attachmentName = String(node.attachmentName || "").trim();
  if (storeName && attachmentPath && attachmentName) {
    acc.push({ storeName, attachmentPath, attachmentName });
  }
  for (const value of Object.values(node)) collectZohoAttachmentRefs(value, acc);
  return acc;
}

function formatZohoApiError(error) {
  const code = String(error?.code || "").trim();
  const status = Number(error?.status || 0) || 0;
  const body = String(error?.body || error?.message || error || "").trim();
  const parts = [body];
  if (status) parts.push(`status=${status}`);
  if (code) parts.push(`code=${code}`);
  return parts.filter(Boolean).join(" | ");
}

function formatProviderApiError(error) {
  const status = Number(error?.status || 0) || 0;
  const code = String(error?.code || "").trim();
  const body = String(error?.body || error?.message || error || "").trim();
  const parts = [body];
  if (status) parts.push(`status=${status}`);
  if (code) parts.push(`code=${code}`);
  return parts.filter(Boolean).join(" | ");
}

async function getZohoAccessToken(cfg = {}) {
  const refreshToken = String(cfg.pass || "").trim();
  const clientId = String(cfg.__zohoClientId || process.env.ZOHO_CLIENT_ID || "").trim();
  const clientSecret = String(cfg.__zohoClientSecret || process.env.ZOHO_CLIENT_SECRET || "").trim();
  if (!refreshToken) throw new Error("Zoho API mode requires a refresh token in SMTP app password field.");
  if (!clientId || !clientSecret) throw new Error("ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must be set on backend.");
  const { accountsBase } = resolveZohoBases(cfg);
  const form = new URLSearchParams();
  form.set("refresh_token", refreshToken);
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("grant_type", "refresh_token");
  const response = await fetchWithTimeout(`${accountsBase}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  }, 20000);
  const raw = await response.text();
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  if (!response.ok || !String(parsed?.access_token || "").trim()) {
    const err = new Error(String(parsed?.error || parsed?.error_description || raw || "Failed to refresh Zoho access token."));
    err.status = response.status;
    err.body = raw;
    throw err;
  }
  return String(parsed.access_token).trim();
}

async function exchangeZohoAuthCode({ code = "", redirectUri = "", hostHint = "zohoapi.com" } = {}) {
  const authCode = String(code || "").trim();
  const clientId = String(process.env.ZOHO_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.ZOHO_CLIENT_SECRET || "").trim();
  const callback = String(redirectUri || "").trim();
  if (!authCode) throw new Error("Missing Zoho authorization code.");
  if (!clientId || !clientSecret) throw new Error("ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET must be set on backend.");
  if (!callback) throw new Error("Missing Zoho redirect URI.");
  const { accountsBase } = resolveZohoBases({ host: hostHint, from: "", user: "" });
  const form = new URLSearchParams();
  form.set("code", authCode);
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("redirect_uri", callback);
  form.set("grant_type", "authorization_code");
  const response = await fetchWithTimeout(`${accountsBase}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  }, 20000);
  const raw = await response.text();
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  if (!response.ok || !String(parsed?.refresh_token || "").trim()) {
    const err = new Error(String(parsed?.error || parsed?.error_description || raw || "Failed to exchange Zoho authorization code."));
    err.status = response.status;
    err.body = raw;
    throw err;
  }
  return {
    accessToken: String(parsed?.access_token || "").trim(),
    refreshToken: String(parsed?.refresh_token || "").trim(),
    expiresIn: Number(parsed?.expires_in || 0) || 0
  };
}

async function resolveZohoMailboxFromAccessToken({ accessToken = "", hostHint = "zohoapi.com" } = {}) {
  const token = String(accessToken || "").trim();
  if (!token) return "";
  const { mailBase } = resolveZohoBases({ host: hostHint, from: "", user: "" });
  const response = await fetchWithTimeout(`${mailBase}/api/accounts`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Zoho-oauthtoken ${token}`
    }
  }, 20000);
  const raw = await response.text();
  let parsed = {};
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    parsed = {};
  }
  if (!response.ok) return "";
  const accounts = Array.isArray(parsed?.data) ? parsed.data : [];
  const first = accounts[0] || null;
  const primary = String(first?.primaryEmailAddress || "").trim();
  const mailbox = String(first?.mailboxAddress || "").trim();
  return primary || mailbox || "";
}

async function sendZohoEmailWithCfg(cfg, { to, cc = "", subject, html = "", text = "", attachments = [], threading = {}, allowThreading = false }) {
  const readString = (...values) => values.map((value) => String(value || "").trim()).find(Boolean) || "";
  const findKeyDeep = (root, keyNames = [], maxDepth = 6) => {
    const wanted = new Set(keyNames.map((k) => String(k || "").toLowerCase()).filter(Boolean));
    if (!wanted.size || root == null) return "";
    const queue = [{ node: root, depth: 0 }];
    const seen = new Set();
    while (queue.length) {
      const { node, depth } = queue.shift();
      if (!node || depth > maxDepth) continue;
      if (typeof node === "object") {
        if (seen.has(node)) continue;
        seen.add(node);
      }
      if (Array.isArray(node)) {
        for (const child of node) queue.push({ node: child, depth: depth + 1 });
        continue;
      }
      if (typeof node !== "object") continue;
      for (const [key, value] of Object.entries(node)) {
        if (wanted.has(String(key || "").toLowerCase())) {
          const picked = readString(value);
          if (picked) return picked;
        }
        if (value && typeof value === "object") queue.push({ node: value, depth: depth + 1 });
      }
    }
    return "";
  };
  const accessToken = await getZohoAccessToken(cfg);
  const { mailBase } = resolveZohoBases(cfg);
  const accountsRes = await fetchWithTimeout(`${mailBase}/api/accounts`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Authorization": `Zoho-oauthtoken ${accessToken}`
    }
  }, 20000);
  const accountsRaw = await accountsRes.text();
  let accountsJson = {};
  try {
    accountsJson = accountsRaw ? JSON.parse(accountsRaw) : {};
  } catch {
    accountsJson = {};
  }
  if (!accountsRes.ok) {
    const err = new Error("Failed to load Zoho accounts.");
    err.status = accountsRes.status;
    err.body = accountsRaw;
    throw err;
  }
  const accounts = Array.isArray(accountsJson?.data) ? accountsJson.data : [];
  const fromEmail = extractEmailAddress(cfg.from || "");
  const userEmail = extractEmailAddress(cfg.user || "");
  const findMatch = (acc) => {
    const primary = String(acc?.primaryEmailAddress || "").trim().toLowerCase();
    const mailbox = String(acc?.mailboxAddress || "").trim().toLowerCase();
    const sendFroms = Array.isArray(acc?.sendMailDetails) ? acc.sendMailDetails : [];
    const canSendFrom = sendFroms.some((entry) => {
      if (entry?.status === false) return false;
      return String(entry?.fromAddress || "").trim().toLowerCase() === fromEmail.toLowerCase();
    });
    return [primary, mailbox].includes(fromEmail.toLowerCase()) || [primary, mailbox].includes(userEmail.toLowerCase()) || canSendFrom;
  };
  const selected = accounts.find(findMatch) || accounts[0] || null;
  const accountId = String(selected?.accountId || "").trim();
  if (!accountId) throw new Error("No usable Zoho mail account found for this recruiter token.");
  const attachmentRefs = [];
  if (Array.isArray(attachments) && attachments.length) {
    for (const attachment of attachments) {
      const filename = String(attachment?.filename || "attachment").trim() || "attachment";
      const bytes = toBufferContent(attachment?.content);
      const form = new FormData();
      const mime = String(attachment?.contentType || "application/octet-stream").trim() || "application/octet-stream";
      const blob = new Blob([bytes], { type: mime });
      form.append("attach", blob, filename);
      const uploadRes = await fetchWithTimeout(
        `${mailBase}/api/accounts/${encodeURIComponent(accountId)}/messages/attachments?uploadType=multipart`,
        {
          method: "POST",
          headers: {
            "Accept": "application/json",
            "Authorization": `Zoho-oauthtoken ${accessToken}`
          },
          body: form
        },
        25000
      );
      const uploadRaw = await uploadRes.text();
      let uploadJson = {};
      try {
        uploadJson = uploadRaw ? JSON.parse(uploadRaw) : {};
      } catch {
        uploadJson = {};
      }
      if (!uploadRes.ok) {
        const err = new Error(`Zoho attachment upload failed for ${filename}.`);
        err.status = uploadRes.status;
        err.body = uploadRaw;
        throw err;
      }
      const refs = collectZohoAttachmentRefs(uploadJson, []);
      if (!refs.length) {
        const err = new Error(`Zoho attachment upload response missing attachment reference for ${filename}.`);
        err.status = uploadRes.status || 400;
        err.body = uploadRaw;
        throw err;
      }
      attachmentRefs.push(refs[0]);
    }
  }
  const toCsv = String(to || "").trim();
  const ccCsv = String(cc || "").trim();
  const payload = {
    fromAddress: fromEmail || userEmail,
    toAddress: toCsv,
    ...(ccCsv ? { ccAddress: ccCsv } : {}),
    subject: String(subject || "").trim(),
    content: String(html || text || "").trim(),
    mailFormat: html ? "html" : "plaintext",
    ...(attachmentRefs.length ? { attachments: attachmentRefs } : {})
  };
  const inReplyTo = String(threading?.inReplyTo || "").trim();
  const anchorMailId = String(threading?.anchorMailId || "").trim();
  const references = Array.isArray(threading?.references) ? threading.references.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (allowThreading && inReplyTo) {
    // Zoho API support can vary by tenant/region. We send best-effort threading hints.
    payload.inReplyToMessageId = inReplyTo;
    payload.replyToMessageId = inReplyTo;
    if (references.length) payload.references = references;
  }
  async function postZohoMessage(requestPayload, { replyMailId = "" } = {}) {
    const targetUrl = String(replyMailId || "").trim()
      ? `${mailBase}/api/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(String(replyMailId || "").trim())}`
      : `${mailBase}/api/accounts/${encodeURIComponent(accountId)}/messages`;
    const response = await fetchWithTimeout(targetUrl, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Zoho-oauthtoken ${accessToken}`
      },
      body: JSON.stringify(requestPayload)
    }, 25000);
    const raw = await response.text();
    let json = {};
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch {
      json = {};
    }
    const statusCode = Number(json?.status?.code || 0) || 0;
    const ok = response.ok && (!statusCode || statusCode < 300);
    return { response, raw, json, statusCode, ok };
  }

  const replyAnchor = allowThreading ? anchorMailId : "";
  let sendResult = await postZohoMessage(payload, { replyMailId: replyAnchor });
  let threadedPayloadUsed = Boolean(allowThreading && inReplyTo);
  if (!sendResult.ok) {
    const desc = String(sendResult?.json?.status?.description || sendResult?.json?.data?.error?.message || sendResult?.raw || "Zoho send failed.");
    const looksInvalidInput = /invalid input/i.test(desc);
    if (allowThreading && inReplyTo && looksInvalidInput) {
      const retryPayload = { ...payload };
      delete retryPayload.inReplyToMessageId;
      delete retryPayload.replyToMessageId;
      delete retryPayload.references;
      sendResult = await postZohoMessage(retryPayload, { replyMailId: replyAnchor });
      threadedPayloadUsed = false;
    }
  }
  if (!sendResult.ok) {
    const desc = String(sendResult?.json?.status?.description || sendResult?.json?.data?.error?.message || sendResult?.raw || "Zoho send failed.");
    const err = new Error(desc);
    err.status = sendResult?.response?.status || sendResult?.statusCode || 400;
    err.body = sendResult?.raw || "";
    throw err;
  }
  const sendJson = sendResult?.json || {};
  const candidateData = sendJson?.data;
  const responseHeaders = sendResult?.response?.headers;
  const headerMessageId = readString(
    responseHeaders?.get?.("message-id"),
    responseHeaders?.get?.("x-message-id"),
    responseHeaders?.get?.("x-zm-message-id"),
    responseHeaders?.get?.("x-zm-mailid")
  );
  const extractedMessageId = readString(
    headerMessageId,
    sendJson?.messageId,
    sendJson?.message_id,
    sendJson?.mailId,
    sendJson?.mail_id,
    candidateData?.messageId,
    candidateData?.message_id,
    candidateData?.mailId,
    candidateData?.mail_id,
    findKeyDeep(sendJson, ["messageId", "message_id", "mailId", "mail_id", "internetMessageId", "internet_message_id"]),
    Array.isArray(candidateData) ? candidateData?.[0]?.messageId : "",
    Array.isArray(candidateData) ? candidateData?.[0]?.message_id : "",
    Array.isArray(candidateData) ? candidateData?.[0]?.mailId : ""
  );
  const mailId = readString(
    sendJson?.mailId,
    sendJson?.mail_id,
    candidateData?.mailId,
    candidateData?.mail_id,
    findKeyDeep(sendJson, ["mailId", "mail_id", "id"])
  );
  const internetMessageId = readString(
    sendJson?.internetMessageId,
    sendJson?.internet_message_id,
    candidateData?.internetMessageId,
    candidateData?.internet_message_id,
    findKeyDeep(sendJson, ["internetMessageId", "internet_message_id", "messageHeaderId", "message_header_id"]),
    /@/.test(extractedMessageId) ? extractedMessageId : ""
  );
  const messageId = readString(mailId, extractedMessageId, internetMessageId);
  const threadId = readString(
    sendJson?.threadId,
    sendJson?.thread_id,
    sendJson?.conversationId,
    sendJson?.conversation_id,
    candidateData?.threadId,
    candidateData?.thread_id,
    candidateData?.conversationId,
    candidateData?.conversation_id,
    findKeyDeep(sendJson, ["threadId", "thread_id", "conversationId", "conversation_id"]),
    Array.isArray(candidateData) ? candidateData?.[0]?.threadId : "",
    Array.isArray(candidateData) ? candidateData?.[0]?.thread_id : ""
  );
  return {
    ok: true,
    accountId,
    fromAddress: payload.fromAddress,
    messageId,
    mailId,
    internetMessageId,
    threadId,
    threadedApplied: Boolean(threadedPayloadUsed && inReplyTo)
  };
}

async function sendSendgridEmailWithCfg(cfg, { to, cc = "", subject, html = "", text = "", attachments = [] }) {
  const apiKey = String(cfg?.pass || "").trim();
  if (!apiKey) throw new Error("SendGrid API mode requires API key in SMTP app password field.");
  const toList = String(to || "").split(/,|;/).map((x) => String(x || "").trim()).filter(Boolean);
  if (!toList.length) throw new Error("Recipient email is required.");
  const ccList = String(cc || "").split(/,|;/).map((x) => String(x || "").trim()).filter(Boolean);
  const fromEmail = extractEmailAddress(cfg?.from || cfg?.user || "");
  if (!fromEmail) throw new Error("Valid From email is required for SendGrid.");
  const fromName = String(cfg?.from || "").replace(/<[^>]+>/g, "").trim();
  const payload = {
    personalizations: [{
      to: toList.map((email) => ({ email })),
      ...(ccList.length ? { cc: ccList.map((email) => ({ email })) } : {})
    }],
    from: { email: fromEmail, ...(fromName ? { name: fromName } : {}) },
    subject: String(subject || "").trim(),
    content: [
      ...(html ? [{ type: "text/html", value: String(html || "") }] : []),
      ...(!html && text ? [{ type: "text/plain", value: String(text || "") }] : [])
    ],
    ...(Array.isArray(attachments) && attachments.length
      ? {
          attachments: attachments.map((a) => ({
            content: toBufferContent(a?.content).toString("base64"),
            filename: String(a?.filename || "attachment").trim() || "attachment",
            type: String(a?.contentType || "application/octet-stream").trim() || "application/octet-stream",
            disposition: "attachment"
          }))
        }
      : {})
  };
  const res = await fetchWithTimeout("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, 25000);
  const raw = await res.text();
  if (!res.ok) {
    const err = new Error("SendGrid send failed.");
    err.status = res.status;
    err.body = raw;
    throw err;
  }
  return { ok: true };
}

async function sendPostmarkEmailWithCfg(cfg, { to, cc = "", subject, html = "", text = "", attachments = [] }) {
  const serverToken = String(cfg?.pass || "").trim();
  if (!serverToken) throw new Error("Postmark API mode requires Server Token in SMTP app password field.");
  const fromEmail = extractEmailAddress(cfg?.from || cfg?.user || "");
  if (!fromEmail) throw new Error("Valid From email is required for Postmark.");
  const payload = {
    From: fromEmail,
    To: String(to || "").trim(),
    ...(String(cc || "").trim() ? { Cc: String(cc || "").trim() } : {}),
    Subject: String(subject || "").trim(),
    ...(html ? { HtmlBody: String(html || "") } : {}),
    ...(!html && text ? { TextBody: String(text || "") } : {}),
    ...(Array.isArray(attachments) && attachments.length
      ? {
          Attachments: attachments.map((a) => ({
            Name: String(a?.filename || "attachment").trim() || "attachment",
            Content: toBufferContent(a?.content).toString("base64"),
            ContentType: String(a?.contentType || "application/octet-stream").trim() || "application/octet-stream"
          }))
        }
      : {})
  };
  const res = await fetchWithTimeout("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "X-Postmark-Server-Token": serverToken,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(payload)
  }, 25000);
  const raw = await res.text();
  if (!res.ok) {
    const err = new Error("Postmark send failed.");
    err.status = res.status;
    err.body = raw;
    throw err;
  }
  return { ok: true };
}

function decodeHtmlEntities(value = "") {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function richHtmlToReadableText(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!/[<>]/.test(raw)) return raw;
  let text = raw;
  text = text.replace(/<\s*br\s*\/?>/gi, "\n");
  text = text.replace(/<\/\s*(p|div|section|article|h[1-6])\s*>/gi, "\n");
  text = text.replace(/<\s*li[^>]*>/gi, "\n- ");
  text = text.replace(/<\/\s*li\s*>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = decodeHtmlEntities(text);
  text = text
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return text;
}

function buildJobShareEmail({ job, introText = "", senderName = "", signatureText = "", signatureLinks = [] }) {
  const title = String(job?.title || "").trim();
  const client = String(job?.clientName || "").trim();
  const location = String(job?.location || "").trim();
  const workMode = String(job?.workMode || "").trim();
  const aboutCompany = String(job?.aboutCompany || "").trim();
  const mustHave = String(job?.mustHaveSkills || "").trim();
  const jd = richHtmlToReadableText(String(job?.jobDescription || "").trim());
  const redFlags = String(job?.redFlags || "").trim();
  const recruiterNotes = String(job?.recruiterNotes || "").trim();
  const applyBase = String(process.env.PUBLIC_PORTAL_BASE_URL || "https://recruit.kompatibleminds.com").trim().replace(/\/+$/, "");
  const applyLink = job?.id ? `${applyBase}/apply/${encodeURIComponent(String(job.id))}` : "";

  const blocks = [
    introText ? { label: "Message", value: introText } : null,
    client ? { label: "Client", value: client } : null,
    location ? { label: "Location", value: location } : null,
    workMode ? { label: "Work mode", value: workMode } : null,
    aboutCompany ? { label: "About company", value: aboutCompany } : null,
    mustHave ? { label: "Must have skills", value: mustHave } : null,
    jd ? { label: "Job description", value: jd } : null,
    redFlags ? { label: "Red flags", value: redFlags } : null,
    recruiterNotes ? { label: "Notes", value: recruiterNotes } : null,
    applyLink ? { label: "Apply link", value: applyLink } : null
  ].filter(Boolean);

  const htmlBody = blocks.map((item) => `
    <h2>${escapeHtml(item.label)}</h2>
    <div class="block">${escapeHtml(item.value).replace(/\n/g, "<br/>")}</div>
  `.trim()).join("\n");

  const signatureLinksSafe = Array.isArray(signatureLinks) ? signatureLinks : [];
  const signatureTextSafe = String(signatureText || "").trim();
  const signatureLinksHtml = signatureLinksSafe
    .map((link) => {
      const labelRaw = String(link?.label || "").trim();
      const parts = labelRaw.split("||").map((p) => String(p || "").trim()).filter(Boolean);
      const label = String(parts[0] || labelRaw || "").trim();
      const suffix = parts.length > 1 ? parts.slice(1).join(" || ").trim() : "";
      return {
        label,
        suffix,
        url: String(link?.url || "").trim()
      };
    })
    .filter((link) => link.url)
    .map((link) => {
      const anchorText = escapeHtml(link.label || link.url);
      const suffixText = link.suffix ? ` <span style="color:#6b7280;">${escapeHtml(link.suffix)}</span>` : "";
      return `<div><a href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${anchorText}</a>${suffixText}</div>`;
    })
    .join("");
  const signatureHtml = [
    signatureTextSafe ? `<div>${escapeHtml(signatureTextSafe).replace(/\n/g, "<br/>")}</div>` : "",
    signatureLinksHtml
  ].filter(Boolean).join("");

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(title || "Job Description")}</title>
        <style>
          body { font-family: Arial, sans-serif; color: #111827; line-height: 1.5; padding: 20px; }
          h1 { font-size: 18px; margin: 0 0 10px; }
          h2 { font-size: 12px; margin: 16px 0 6px; color: #374151; letter-spacing: .02em; text-transform: uppercase; }
          .muted { color: #6b7280; font-size: 12px; margin-bottom: 14px; }
          .block { font-size: 13.5px; white-space: normal; }
          hr { border: 0; border-top: 1px solid #e5e7eb; margin: 14px 0; }
          a { color: #2563eb; text-decoration: none; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(title || "Job Description")}</h1>
        <div class="muted">Shared from RecruitDesk${senderName ? ` by ${escapeHtml(senderName)}` : ""}</div>
        <hr/>
        ${htmlBody || "<div class='block'>No JD content found.</div>"}
        ${signatureHtml ? `<div style="margin-top:22px;">${signatureHtml}</div>` : ""}
      </body>
    </html>
  `.trim();

  const signatureTextLines = [
    signatureTextSafe,
    ...(signatureLinksSafe || [])
      .map((link) => {
        const labelRaw = String(link?.label || "").trim();
        const parts = labelRaw.split("||").map((p) => String(p || "").trim()).filter(Boolean);
        const label = String(parts[0] || labelRaw || "").trim();
        const suffix = parts.length > 1 ? parts.slice(1).join(" || ").trim() : "";
        const url = String(link?.url || "").trim();
        if (!url) return "";
        return suffix ? `${label || "Link"}: ${url} (${suffix})` : `${label || "Link"}: ${url}`;
      })
      .filter(Boolean)
  ].filter(Boolean).join("\n");
  const text = [
    blocks.map((item) => `${item.label}:\n${item.value}`).join("\n\n"),
    signatureTextLines
  ].filter(Boolean).join("\n\n");
  return { html, text, applyLink };
}

async function buildJobShareDocxBuffer({ job, introText = "", senderName = "" }) {
  if (!docxLib) return null;
  const title = String(job?.title || "Job Description").trim();
  const client = String(job?.clientName || "").trim();
  const location = String(job?.location || "").trim();
  const workMode = String(job?.workMode || "").trim();
  const aboutCompany = String(job?.aboutCompany || "").trim();
  const mustHave = String(job?.mustHaveSkills || "").trim();
  const jd = richHtmlToReadableText(String(job?.jobDescription || "").trim());
  const redFlags = String(job?.redFlags || "").trim();
  const recruiterNotes = String(job?.recruiterNotes || "").trim();
  const applyBase = String(process.env.PUBLIC_PORTAL_BASE_URL || "https://recruit.kompatibleminds.com").trim().replace(/\/+$/, "");
  const applyLink = job?.id ? `${applyBase}/apply/${encodeURIComponent(String(job.id))}` : "";

  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docxLib;

  const blocks = [
    client ? { label: "Client", value: client } : null,
    location ? { label: "Location", value: location } : null,
    workMode ? { label: "Work mode", value: workMode } : null,
    aboutCompany ? { label: "About company", value: aboutCompany } : null,
    mustHave ? { label: "Must have skills", value: mustHave } : null,
    jd ? { label: "Job description", value: jd } : null,
    redFlags ? { label: "Red flags", value: redFlags } : null,
    recruiterNotes ? { label: "Notes", value: recruiterNotes } : null,
    applyLink ? { label: "Apply link", value: applyLink } : null
  ].filter(Boolean);

  const children = [
    new Paragraph({ text: title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Shared from RecruitDesk${senderName ? ` by ${senderName}` : ""}`,
          italics: true
        })
      ]
    }),
    new Paragraph({ text: "" })
  ];

  blocks.forEach((item) => {
    children.push(new Paragraph({ text: String(item.label || ""), heading: HeadingLevel.HEADING_2 }));
    const lines = String(item.value || "").split(/\r?\n/);
    lines.forEach((line) => {
      children.push(new Paragraph({ text: String(line || "") }));
    });
    children.push(new Paragraph({ text: "" }));
  });

  const doc = new Document({
    sections: [{ properties: {}, children }]
  });
  const buf = await Packer.toBuffer(doc);
  return buf;
}

async function sendSmtpEmail({ to, subject, html, text }) {
  throw new Error("Email is not configured. Each recruiter must configure Zoho SMTP in Settings.");
}

async function createActorSmtpTransport(actor) {
  const cfg = await getUserSmtpSettings({ companyId: actor.companyId, userId: actor.id });
  if (!cfg || !cfg.host || !cfg.user || !cfg.pass || !cfg.from) {
    throw new Error("Email settings not configured. Go to Settings -> Email settings.");
  }
  if (isZohoApiMode(cfg)) {
    return { transport: null, cfg: sanitizeSmtpConfig(cfg) };
  }
  if (isSendgridApiMode(cfg) || isPostmarkApiMode(cfg) || isGoogleApiMode(cfg) || isMicrosoftApiMode(cfg)) {
    return { transport: null, cfg: sanitizeSmtpConfig(cfg) };
  }
  if (!nodemailer) throw new Error("Email sending is not available.");
  const finalCfg = sanitizeSmtpConfig(cfg);
  const transport = nodemailer.createTransport({
    host: finalCfg.host,
    port: Number(finalCfg.port || 587),
    secure: Boolean(finalCfg.secure),
    requireTLS: !Boolean(finalCfg.secure) && Number(finalCfg.port) === 587,
    auth: { user: finalCfg.user, pass: finalCfg.pass },
    authMethod: "LOGIN",
    name: "recruitdesk-mailer",
    tls: {
      servername: finalCfg.host,
      minVersion: "TLSv1.2"
    },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    dnsTimeout: 10000
  });
  return { transport, cfg: finalCfg };
}

async function sendJdEmailAsActor(actor, { to, cc = "", subject, html, text, attachments = [], threading = {}, allowZohoApiThreading = false }) {
  if (isEmailBounced(to)) {
    const info = getEmailBounceInfo(to);
    throw new Error(`Recipient email is marked bounced/blocked (${String(info?.reason || "bounce")}).`);
  }
  const { transport, cfg } = await createActorSmtpTransport(actor);
  const ccValue = String(cc || "").trim();
  if (isZohoApiMode(cfg)) {
    const meta = await sendZohoEmailWithCfg(cfg, {
      to,
      cc: ccValue,
      subject,
      html,
      text,
      attachments,
      threading,
      allowThreading: Boolean(allowZohoApiThreading)
    });
    return {
      providerMode: "zoho_api",
      messageId: String(meta?.messageId || "").trim(),
      mailId: String(meta?.mailId || "").trim(),
      internetMessageId: String(meta?.internetMessageId || "").trim(),
      threadId: String(meta?.threadId || "").trim(),
      threadedApplied: Boolean(meta?.threadedApplied)
    };
  }
  if (isSendgridApiMode(cfg)) {
    await sendSendgridEmailWithCfg(cfg, { to, cc: ccValue, subject, html, text, attachments });
    return { providerMode: "sendgrid_api", messageId: "", mailId: "", internetMessageId: "", threadId: "" };
  }
  if (isPostmarkApiMode(cfg)) {
    await sendPostmarkEmailWithCfg(cfg, { to, cc: ccValue, subject, html, text, attachments });
    return { providerMode: "postmark_api", messageId: "", mailId: "", internetMessageId: "", threadId: "" };
  }
  if (isGoogleApiMode(cfg)) {
    const meta = await sendGoogleEmailWithCfg(cfg, { to, cc: ccValue, subject, html, text, attachments });
    return { providerMode: "google_api", messageId: String(meta?.messageId || "").trim(), mailId: "", internetMessageId: String(meta?.messageId || "").trim(), threadId: String(meta?.threadId || "").trim() };
  }
  if (isMicrosoftApiMode(cfg)) {
    const meta = await sendMicrosoftEmailWithCfg(cfg, { to, cc: ccValue, subject, html, text, attachments });
    return { providerMode: "microsoft_api", messageId: String(meta?.messageId || "").trim(), mailId: "", internetMessageId: "", threadId: String(meta?.threadId || "").trim() };
  }
  const info = await transport.sendMail({
    from: String(cfg.from || "").trim(),
    to,
    ...(ccValue ? { cc: ccValue } : {}),
    subject,
    text,
    html,
    ...(threading?.inReplyTo ? { inReplyTo: String(threading.inReplyTo || "").trim() } : {}),
    ...(Array.isArray(threading?.references) && threading.references.length ? { references: threading.references } : {}),
    attachments: Array.isArray(attachments) ? attachments : []
  });
  return {
    providerMode: "smtp",
    messageId: String(info?.messageId || "").trim(),
    mailId: "",
    internetMessageId: String(info?.messageId || "").trim(),
    threadId: "",
    threadedApplied: Boolean(String(threading?.inReplyTo || "").trim())
  };
}

function readImageBufferFromDataUrl(dataUrl = "") {
  const raw = String(dataUrl || "").trim();
  const match = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  try {
    return Buffer.from(match[2], "base64");
  } catch {
    return null;
  }
}

function hexToRgb01(hex = "") {
  const raw = String(hex || "").trim().replace(/^#/, "");
  if (!raw) return null;
  const normalized = raw.length === 3
    ? raw.split("").map((ch) => ch + ch).join("")
    : raw;
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  const n = Number.parseInt(normalized, 16);
  if (!Number.isFinite(n)) return null;
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255
  };
}

async function buildResumeFormattingSampleDocxBuffer({ companyName = "Your Company", resumeFormatting = {} } = {}) {
  if (!docxLib) return null;
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Header, Footer, AlignmentType, ImageRun } = docxLib;
  const rf = resumeFormatting && typeof resumeFormatting === "object" ? resumeFormatting : {};
  const watermarkEnabled = Boolean(rf.watermarkEnabled);
  const watermarkText = String(rf.watermarkText || "CONFIDENTIAL").trim() || "CONFIDENTIAL";
  const footerText = String(rf.footerText || "Confidential candidate profile shared by {{company_name}}")
    .replace(/\{\{\s*company_name\s*\}\}/gi, String(companyName || "Your Company").trim())
    .trim();
  const logoBuf = readImageBufferFromDataUrl(rf.logoDataUrl || "");

  const headerChildren = [];
  if (logoBuf) {
    try {
      headerChildren.push(
        new Paragraph({
          children: [new ImageRun({ data: logoBuf, transformation: { width: 96, height: 40 } })]
        })
      );
    } catch {
      headerChildren.push(new Paragraph({ text: "LOGO" }));
    }
  } else {
    headerChildren.push(new Paragraph({ text: "LOGO" }));
  }
  headerChildren.push(
    new Paragraph({ text: "Candidate Name", heading: HeadingLevel.HEADING_2 }),
    new Paragraph({ text: "Role | Email | Phone | Notice | Experience" })
  );

  const footerChildren = [
    new Paragraph({
      children: [
        new TextRun({ text: footerText }),
        new TextRun({ text: "    Page 1/1" }),
      ],
      alignment: AlignmentType.LEFT
    })
  ];

  const bodyChildren = [];
  if (watermarkEnabled) {
    bodyChildren.push(new Paragraph({ text: watermarkText, alignment: AlignmentType.CENTER }));
  }
  bodyChildren.push(
    new Paragraph({ text: "" }),
    new Paragraph({ text: "Sample profile content line 1." }),
    new Paragraph({ text: "Sample profile content line 2." }),
    new Paragraph({ text: "Sample profile content line 3." }),
    new Paragraph({ text: "Sample profile content line 4." }),
    new Paragraph({ text: "Sample profile content line 5." })
  );

  const doc = new Document({
    sections: [{
      headers: { default: new Header({ children: headerChildren }) },
      footers: { default: new Footer({ children: footerChildren }) },
      children: bodyChildren
    }]
  });
  return Packer.toBuffer(doc);
}

async function buildBrandedPdfBuffer({
  pdfBase64 = "",
  companyName = "Your Company",
  resumeFormatting = {},
  candidateName = "Candidate Name",
  headerLine = ""
} = {}) {
  if (!pdfLib) throw new Error("PDF branding dependency missing.");
  const { PDFDocument, StandardFonts, rgb, degrees } = pdfLib;
  const raw = String(pdfBase64 || "").trim();
  if (!raw) throw new Error("PDF payload missing.");
  const src = Buffer.from(raw, "base64");
  const srcDoc = await PDFDocument.load(src);
  // Some CV PDFs store contact details in AcroForm fields.
  // Flatten first so field values become normal page content before overlay rendering.
  try {
    const form = srcDoc.getForm?.();
    if (form && typeof form.flatten === "function") {
      try {
        if (typeof form.updateFieldAppearances === "function") {
          form.updateFieldAppearances();
        }
      } catch {
        // Some PDFs have partial/invalid appearance metadata; continue to flatten attempt.
      }
      form.flatten({ updateFieldAppearances: true });
    }
  } catch {
    // Not a form PDF (or malformed form) - continue without flatten.
  }
  const outDoc = await PDFDocument.create();
  const srcPages = srcDoc.getPages();
  const rf = resumeFormatting && typeof resumeFormatting === "object" ? resumeFormatting : {};

  const headerEnabled = rf.headerEnabled !== false;
  const footerEnabled = rf.footerEnabled !== false;
  const watermarkEnabled = rf.watermarkEnabled === true;
  const watermarkText = String(rf.watermarkText || "CONFIDENTIAL").trim() || "CONFIDENTIAL";
  const footerText = String(rf.footerText || "Confidential candidate profile shared by {{company_name}}")
    .replace(/\{\{\s*company_name\s*\}\}/gi, String(companyName || "Your Company").trim());
  const sideRibbonText = String(rf.sideRibbonText || "Shared by {{company_name}}")
    .replace(/\{\{\s*company_name\s*\}\}/gi, String(companyName || "Your Company").trim())
    .trim();
  const templateStyle = String(rf.templateStyle || "minimal_corporate").trim() || "minimal_corporate";
  const headerLayout = String(rf.headerLayout || "executive").trim().toLowerCase() === "compact" ? "compact" : "executive";
  // Keep header slimmer (~15%) and elegant.
  const requestedHeaderHeight = Math.max(56, Math.min(90, Number(rf.headerMaxHeightPx || 72) || 72));
  const headerHeight = Math.max(46, Math.round(requestedHeaderHeight * 0.85));
  const footerHeight = Math.max(34, Math.min(70, Number(rf.footerMaxHeightPx || 50) || 50));
  const wmOpacity = Math.max(0.05, Math.min(0.15, Number(rf.watermarkOpacity || 0.12) || 0.12));
  const primaryColor = String(rf.primaryColor || "#243B6B").trim() || "#243B6B";
  const displayName = String(candidateName || "Candidate Name").trim() || "Candidate Name";
  const displayLine = String(headerLine || "").trim();
  const fontRegular = await outDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await outDoc.embedFont(StandardFonts.HelveticaBold);
  const navy = hexToRgb01(primaryColor) || { r: 0.14, g: 0.23, b: 0.42 };
  const darkNavy = { r: Math.max(0, navy.r - 0.1), g: Math.max(0, navy.g - 0.1), b: Math.max(0, navy.b - 0.1) };
  const blueJay = { r: 43 / 255, g: 84 / 255, b: 126 / 255 }; // #2B547E
  const slateText = { r: 0.28, g: 0.33, b: 0.42 };
  const divider = { r: 0.85, g: 0.88, b: 0.93 };
  const softPanel = { r: 0.96, g: 0.97, b: 0.99 };
  const footerCaps = footerText.toUpperCase();
  const headerFieldOrder = Array.isArray(rf.headerShowFields) ? rf.headerShowFields.map((v) => String(v || "").trim()) : [];
  const sharedByText = String(sideRibbonText || `Shared by ${String(companyName || "Your Company").trim() || "Your Company"}`).trim();
  const safeMarginX = 10;

  let logoImage = null;
  const logoBuf = readImageBufferFromDataUrl(String(rf.logoDataUrl || "").trim());
  if (logoBuf) {
    try {
      logoImage = await outDoc.embedPng(logoBuf);
    } catch {
      try {
        logoImage = await outDoc.embedJpg(logoBuf);
      } catch {
        logoImage = null;
      }
    }
  }

  for (let index = 0; index < srcPages.length; index += 1) {
    const srcPage = srcPages[index];
    const { width, height } = srcPage.getSize();
    const page = outDoc.addPage([width, height]);
    const embedded = await outDoc.embedPage(srcPage);
    const showHeaderOnThisPage = headerEnabled && index === 0 && templateStyle !== "watermark_footer_only";
    const showSideRibbon = templateStyle === "side_ribbon_branding";
    const topPad = showHeaderOnThisPage ? headerHeight : 0;
    const bottomPad = footerEnabled ? footerHeight : 0;
    const innerTopGap = 0;
    const innerBottomGap = 0;
    const bodyLeftInset = showSideRibbon ? 20 : 0;
    const bodyRightInset = 0;
    const availableHeight = Math.max(40, height - topPad - bottomPad);
    const renderHeight = Math.max(40, availableHeight - innerTopGap - innerBottomGap);
    page.drawPage(embedded, {
      x: bodyLeftInset,
      y: bottomPad + innerBottomGap,
      width: Math.max(80, width - bodyLeftInset - bodyRightInset),
      height: renderHeight
    });

    if (watermarkEnabled || templateStyle === "watermark_footer_only") {
      page.drawText(watermarkText, {
        x: width * 0.26,
        y: height * 0.5,
        size: templateStyle === "watermark_footer_only" ? 50 : 44,
        font: fontBold,
        color: rgb(navy.r, navy.g, navy.b),
        opacity: templateStyle === "watermark_footer_only" ? Math.min(0.11, wmOpacity) : Math.min(0.08, wmOpacity),
        rotate: degrees(-24)
      });
    }
    if (showSideRibbon) {
      const ribbonWidth = 28;
      const ribbonBottom = footerEnabled ? footerHeight : 0;
      const ribbonHeight = height - ribbonBottom;
      page.drawRectangle({
        x: 0,
        y: ribbonBottom,
        width: ribbonWidth,
        height: ribbonHeight,
        color: rgb(darkNavy.r, darkNavy.g, darkNavy.b),
        opacity: 0.88
      });
      // Keep text centered vertically and readable for variable company names.
      let ribbonFontSize = 10.6;
      const minFontSize = 8.0;
      while (ribbonFontSize > minFontSize && fontRegular.widthOfTextAtSize(sharedByText, ribbonFontSize) > (ribbonHeight - 14)) {
        ribbonFontSize -= 0.2;
      }
      const textWidth = fontRegular.widthOfTextAtSize(sharedByText, ribbonFontSize);
      const ribbonTextY = ribbonBottom + ((ribbonHeight - textWidth) / 2);
      page.drawText(sharedByText, {
        // Rotate-90 anchor: keep baseline centered in ribbon width.
        x: Math.max(9.0, ((ribbonWidth - ribbonFontSize) / 2) + 5.0),
        y: ribbonTextY,
        size: ribbonFontSize,
        font: fontBold,
        color: rgb(0.965, 0.975, 0.995),
        rotate: degrees(90)
      });
    }
    if (showHeaderOnThisPage) {
      const headY = height - headerHeight;
      let headBg = rgb(0.982, 0.986, 0.994);
      let textColor = rgb(navy.r, navy.g, navy.b);
      let subTextColor = rgb(slateText.r, slateText.g, slateText.b);
      if (templateStyle === "premium_blue_bar") {
        headBg = rgb(blueJay.r, blueJay.g, blueJay.b);
        textColor = rgb(0.97, 0.99, 1);
        subTextColor = rgb(0.87, 0.91, 0.97);
      } else if (templateStyle === "client_submission_style") {
        headBg = rgb(0.972, 0.982, 0.998);
      } else if (templateStyle === "watermark_footer_only") {
        headBg = rgb(1, 1, 1);
      }
      page.drawRectangle({ x: 0, y: headY, width, height: headerHeight, color: headBg });
      // subtle divider below header
      page.drawLine({ start: { x: safeMarginX, y: headY + 0.5 }, end: { x: width - safeMarginX, y: headY + 0.5 }, thickness: 0.8, color: rgb(divider.r, divider.g, divider.b) });
      const logoMaxW = headerLayout === "compact" ? 52 : 62;
      const logoMaxH = headerLayout === "compact" ? 24 : 30;
      const logoX = 20;
      const logoY = headY + (headerLayout === "compact" ? 11 : 10);
      if (logoImage) {
        const iw = Number(logoImage.width || logoMaxW) || logoMaxW;
        const ih = Number(logoImage.height || logoMaxH) || logoMaxH;
        const ratio = Math.min(logoMaxW / iw, logoMaxH / ih);
        const drawW = Math.max(12, iw * ratio);
        const drawH = Math.max(12, ih * ratio);
        const x = logoX + ((logoMaxW - drawW) / 2);
        const y = logoY + ((logoMaxH - drawH) / 2);
        page.drawImage(logoImage, { x, y, width: drawW, height: drawH });
      }
      const textX = logoImage
        ? (headerLayout === "compact" ? 82 : 94)
        : 20;
      const titleSize = headerLayout === "compact" ? 11.8 : 13.2;
      if (templateStyle !== "client_submission_style") {
        page.drawText(displayName, { x: textX, y: headY + (headerLayout === "compact" ? 26 : 31), size: titleSize, font: fontBold, color: textColor, maxWidth: width - textX - 20 });
      }
      // In client-submission mode, role/experience/location/notice is represented via chips.
      if (displayLine && templateStyle !== "client_submission_style") {
        const headerMetaSize = headerLayout === "compact" ? 9.0 : 9.2;
        page.drawText(displayLine, { x: textX, y: headY + (headerLayout === "compact" ? 13 : 14), size: headerMetaSize, font: fontRegular, color: subTextColor, maxWidth: width - textX - 20 });
      }

      if (templateStyle === "client_submission_style") {
        const chipValues = displayLine ? displayLine.split("|").map((v) => String(v || "").trim()).filter(Boolean).slice(0, 6) : [];
        const fallbackLabels = ["Company", "Target Role", "Current Designation", "Experience", "Notice"];
        const fieldToLabel = {
          current_company: "Company",
          candidate_role: "Target Role",
          target_role: "Target Role",
          current_designation: "Current Designation",
          total_experience: "Experience",
          notice_period: "Notice",
          location: "Location",
          email: "Email",
          phone: "Phone",
          candidate_name: "Name"
        };
        const chipEntries = chipValues.map((value, chipIdx) => ({
          label: String(fieldToLabel[headerFieldOrder[chipIdx]] || fallbackLabels[chipIdx] || "Field").trim(),
          value: String(value || "").trim()
        })).filter((entry) => entry.value);
        const roleIdx = chipEntries.findIndex((entry) => /target role/i.test(entry.label));
        const roleEntry = roleIdx >= 0 ? chipEntries[roleIdx] : null;
        const compactEntries = chipEntries.filter((_, idx) => idx !== roleIdx).slice(0, 4);

        let cursorX = textX;
        let chipY = headY + 7;
        const rightLimit = width - 20;

        // Line 1: candidate name + target-role chip (same line).
        const line1Y = headY + 27.2;
        const nameText = String(displayName || "Candidate Name").trim() || "Candidate Name";
        const nameW = fontBold.widthOfTextAtSize(nameText, titleSize);
        page.drawText(nameText, {
          x: textX,
          y: line1Y,
          size: titleSize,
          font: fontBold,
          color: textColor,
          maxWidth: Math.max(120, rightLimit - textX - 40)
        });

        if (roleEntry) {
          const roleLabel = String(roleEntry.label || "Target Role").slice(0, 16);
          const roleValue = String(roleEntry.value || "");
          const roleLabelW = fontBold.widthOfTextAtSize(roleLabel, 7.8);
          const roleValueSize = roleValue.length > 56 ? 8.0 : 8.8;
          const roleValueW = fontRegular.widthOfTextAtSize(roleValue.slice(0, 80), roleValueSize);
          const roleChipX = Math.min(rightLimit - 170, textX + Math.min(nameW + 14, 250));
          const roleChipW = Math.max(170, Math.min(rightLimit - roleChipX, roleLabelW + roleValueW + 36));
          const roleChipY = line1Y - 3.2;
          page.drawRoundedRectangle?.({ x: roleChipX, y: roleChipY, width: roleChipW, height: 16.8, borderRadius: 8, color: rgb(0.962, 0.976, 0.998), borderColor: rgb(0.79, 0.84, 0.93), borderWidth: 0.8 });
          if (!page.drawRoundedRectangle) {
            page.drawRectangle({ x: roleChipX, y: roleChipY, width: roleChipW, height: 16.8, color: rgb(0.962, 0.976, 0.998), borderColor: rgb(0.79, 0.84, 0.93), borderWidth: 0.8 });
          }
          page.drawCircle({ x: roleChipX + 9.4, y: roleChipY + 8.4, size: 4.2, color: rgb(navy.r, navy.g, navy.b), opacity: 0.94 });
          page.drawText("T", { x: roleChipX + 7.8, y: roleChipY + 5.5, size: 6.2, font: fontBold, color: rgb(0.98, 0.99, 1) });
          page.drawText(roleLabel, { x: roleChipX + 16.8, y: roleChipY + 6.2, size: 7.8, font: fontBold, color: rgb(0.18, 0.25, 0.38) });
          page.drawText(roleValue, {
            x: roleChipX + 16.8 + roleLabelW + 5.1,
            y: roleChipY + (roleValue.length > 56 ? 5.2 : 5.3),
            size: roleValueSize,
            font: fontRegular,
            color: rgb(0.24, 0.3, 0.42),
            maxWidth: Math.max(80, roleChipW - (24 + roleLabelW + 8))
          });
        }

        compactEntries.forEach((entry) => {
          if (/target role/i.test(entry.label)) return;
          const label = entry.label;
          const valueText = String(entry.value || "").slice(0, 28);
          const iconText = String(label || "F").slice(0, 1).toUpperCase();
          const iconR = 4.2;
          const labelText = label.slice(0, 14);
          const valueW = fontRegular.widthOfTextAtSize(valueText, 8.8);
          const labelW = fontBold.widthOfTextAtSize(labelText, 7.8);
          const chipW = Math.min(210, Math.max(104, valueW + labelW + 38));
          if ((cursorX + chipW) > rightLimit) {
            cursorX = textX;
            chipY -= 18.8;
          }
          page.drawRoundedRectangle?.({ x: cursorX, y: chipY, width: chipW, height: 16.2, borderRadius: 8, color: rgb(0.962, 0.976, 0.998), borderColor: rgb(0.79, 0.84, 0.93), borderWidth: 0.8 });
          if (!page.drawRoundedRectangle) {
            page.drawRectangle({ x: cursorX, y: chipY, width: chipW, height: 16.2, color: rgb(0.962, 0.976, 0.998), borderColor: rgb(0.79, 0.84, 0.93), borderWidth: 0.8 });
          }
          page.drawCircle({ x: cursorX + 9.4, y: chipY + 8.1, size: iconR, color: rgb(navy.r, navy.g, navy.b), opacity: 0.94 });
          page.drawText(iconText, { x: cursorX + 7.8, y: chipY + 5.2, size: 6.2, font: fontBold, color: rgb(0.98, 0.99, 1) });
          page.drawText(labelText, { x: cursorX + 16.8, y: chipY + 5.9, size: 7.8, font: fontBold, color: rgb(0.18, 0.25, 0.38) });
          page.drawText(valueText, { x: cursorX + 16.8 + labelW + 5.1, y: chipY + 5.0, size: 8.8, font: fontRegular, color: rgb(0.24, 0.3, 0.42) });
          cursorX += chipW + 6;
        });
      }
    }
    if (footerEnabled) {
      let footBg = rgb(0.985, 0.988, 0.995);
      let footText = rgb(slateText.r, slateText.g, slateText.b);
      if (templateStyle === "premium_blue_bar") {
        footBg = rgb(0.965, 0.972, 0.986);
        footText = rgb(0.15, 0.2, 0.32);
      } else if (templateStyle === "watermark_footer_only") {
        footBg = rgb(0.99, 0.992, 0.996);
        footText = rgb(0.33, 0.37, 0.46);
      }
      page.drawRectangle({ x: 0, y: 0, width, height: footerHeight, color: footBg });
      page.drawLine({ start: { x: safeMarginX, y: footerHeight - 0.5 }, end: { x: width - safeMarginX, y: footerHeight - 0.5 }, thickness: 0.8, color: rgb(divider.r, divider.g, divider.b) });
      page.drawText(footerCaps, { x: 20, y: 11.8, size: 8, font: fontRegular, color: footText, maxWidth: width - 140 });
      page.drawText(`PAGE ${index + 1}/${srcPages.length}`, { x: width - 86, y: 11.8, size: 8, font: fontRegular, color: footText });
    }
  }

  const bytes = await outDoc.save();
  return { buffer: Buffer.from(bytes), brandedFallbackUsed: false };
}

async function loadAttachmentFromUrl(url = "", fallbackName = "cv.pdf", mimeType = "") {
  const targetUrl = String(url || "").trim();
  if (!targetUrl) throw new Error("Attachment URL missing.");
  const safeName = String(fallbackName || "cv.pdf").trim().replace(/[^a-z0-9._-]+/gi, "-") || "cv.pdf";
  const res = await fetchWithTimeout(targetUrl, { method: "GET" }, 30000);
  if (!res.ok) throw new Error(`Attachment download failed (${res.status}).`);
  const arr = await res.arrayBuffer();
  const buffer = Buffer.from(arr);
  return {
    buffer,
    filename: safeName,
    mimeType: String(res.headers.get("content-type") || mimeType || "application/octet-stream").trim()
  };
}

function normalizeThreadToken(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function toSafeCvFilenameBase(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "Candidate";
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "Candidate";
}

function isInternetMessageId(value = "") {
  const text = String(value || "").trim();
  return Boolean(text) && text.includes("@");
}

function buildConversationKey({ to = "", clientLabel = "", role = "" } = {}) {
  const toKey = normalizeThreadToken(String(to || "").split(/,|;/)[0] || "");
  const clientKey = normalizeThreadToken(clientLabel);
  const roleKey = normalizeThreadToken(role);
  return [toKey, clientKey, roleKey].filter(Boolean).join("|");
}

function buildResumeHeaderLineFromCandidate(candidate = {}, resumeFormatting = {}) {
  const fields = Array.isArray(resumeFormatting?.headerShowFields) && resumeFormatting.headerShowFields.length
    ? resumeFormatting.headerShowFields
    : ["candidate_name", "target_role", "current_designation", "email", "phone", "notice_period", "total_experience"];
  const role = String(
    candidate?.role
    || candidate?.jd_title
    || candidate?.jdTitle
    || candidate?.target_role
    || candidate?.targetRole
    || ""
  ).trim();
  const currentDesignation = String(
    candidate?.current_designation
    || candidate?.currentDesignation
    || candidate?.designation
    || ""
  ).trim();
  const email = String(candidate?.email || candidate?.email_id || candidate?.emailId || "").trim();
  const phone = String(candidate?.phone || candidate?.phone_number || candidate?.phoneNumber || candidate?.mobile || "").trim();
  const location = String(candidate?.location || candidate?.city || "").trim();
  const noticePeriod = String(candidate?.notice_period || candidate?.noticePeriod || "").trim();
  const totalExperience = String(
    candidate?.total_experience
    || candidate?.experience
    || candidate?.totalExperience
    || ""
  ).trim();
  const currentCompany = String(
    candidate?.current_company
    || candidate?.currentCompany
    || candidate?.company
    || ""
  ).trim();
  const map = {
    candidate_name: String(candidate?.name || "").trim(),
    candidate_role: role,
    target_role: role,
    current_designation: currentDesignation,
    email,
    phone,
    location,
    notice_period: noticePeriod,
    total_experience: totalExperience,
    current_company: currentCompany
  };
  return fields.map((key) => String(map[key] || "").trim()).filter(Boolean).join(" | ");
}

function buildResumeHeaderLineFromValues(values = {}, resumeFormatting = {}) {
  const fields = Array.isArray(resumeFormatting?.headerShowFields) && resumeFormatting.headerShowFields.length
    ? resumeFormatting.headerShowFields
    : ["candidate_name", "target_role", "current_designation", "email", "phone", "notice_period", "total_experience"];
  const safe = values && typeof values === "object" ? values : {};
  return fields
    .map((key) => String(safe[key] || "").trim())
    .filter(Boolean)
    .join(" | ");
}

function buildBrandedHeaderValues({ candidate = {}, assessment = null } = {}) {
  const c = candidate && typeof candidate === "object" ? candidate : {};
  const a = assessment && typeof assessment === "object" ? assessment : null;
  return {
    candidate_name: String(a?.candidateName || c?.name || "").trim(),
    target_role: String(a?.jdTitle || c?.jd_title || c?.jdTitle || c?.target_role || c?.targetRole || c?.role || "").trim(),
    current_designation: String(a?.currentDesignation || c?.current_designation || c?.currentDesignation || c?.designation || "").trim(),
    email: String(a?.emailId || c?.email || c?.email_id || c?.emailId || "").trim(),
    phone: String(a?.phoneNumber || c?.phone || c?.phone_number || c?.phoneNumber || c?.mobile || "").trim(),
    location: String(a?.location || c?.location || c?.city || "").trim(),
    notice_period: String(a?.noticePeriod || c?.notice_period || c?.noticePeriod || "").trim(),
    total_experience: String(a?.totalExperience || c?.total_experience || c?.totalExperience || c?.experience || "").trim(),
    current_company: String(a?.currentCompany || c?.current_company || c?.currentCompany || c?.company || "").trim()
  };
}

async function resolveBrandedCvContext({
  companyId = "",
  companyName = "",
  candidate = null,
  assessment = null
} = {}) {
  const scopedCompanyId = String(companyId || "").trim();
  if (!scopedCompanyId) throw new Error("companyId is required for branded CV context.");
  const sharedSettings = await getCompanySharedExportPresets(scopedCompanyId).catch(() => ({}));
  const resumeFormatting = sharedSettings?.resumeFormatting && typeof sharedSettings.resumeFormatting === "object"
    ? sharedSettings.resumeFormatting
    : {};
  let resolvedAssessment = assessment && typeof assessment === "object" ? assessment : null;
  if (!resolvedAssessment) {
    const assessmentId = String(candidate?.assessment_id || candidate?.assessmentId || "").trim();
    if (assessmentId) {
      resolvedAssessment = await getAssessmentById({ companyId: scopedCompanyId, assessmentId }).catch(() => null);
    }
  }
  const headerValues = buildBrandedHeaderValues({ candidate, assessment: resolvedAssessment });
  const resolvedCandidateName = String(headerValues.candidate_name || candidate?.name || "Candidate Name").trim() || "Candidate Name";
  const resolvedHeaderLine = buildResumeHeaderLineFromValues(headerValues, resumeFormatting)
    || buildResumeHeaderLineFromCandidate(candidate || {}, resumeFormatting);
  return {
    resumeFormatting,
    candidateName: resolvedCandidateName,
    headerValues,
    headerLine: resolvedHeaderLine,
    companyName: String(companyName || "Your Company").trim() || "Your Company"
  };
}

const STATIC_MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const APPLICANT_METADATA_PREFIX = "[APPLICANT_META]";

function getAllowedOrigins() {
  const defaults = [
    "http://localhost:8787",
    "http://127.0.0.1:8787",
    "https://recruiter-backend-yvex.onrender.com"
  ];
  const extra = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return new Set([...defaults, ...extra]);
}

function buildResponseHeaders(req, extras = {}) {
  const origin = String(req?.headers?.origin || "").trim();
  const headers = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    ...extras
  };
  if (origin && getAllowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  headers["Access-Control-Allow-Methods"] = "GET,POST,DELETE,OPTIONS";
  headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
  return headers;
}

function getCvShareSecret() {
  return (
    String(process.env.CV_SHARE_SECRET || "").trim() ||
    String(process.env.PLATFORM_SESSION_SECRET || "").trim() ||
    "recruitdesk-cv-share-secret"
  );
}

function createSignedCvShareToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getCvShareSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function readSignedCvShareToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto
    .createHmac("sha256", getCvShareSecret())
    .update(encoded)
    .digest("base64url");
  if (!timingSafeEqualString(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload?.type !== "shared_cv") return null;
    if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}

function createSignedCandidateShareToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getCvShareSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function readSignedCandidateShareToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto
    .createHmac("sha256", getCvShareSecret())
    .update(encoded)
    .digest("base64url");
  if (!timingSafeEqualString(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload?.type !== "shared_candidate") return null;
    if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}

function buildSharedCandidateProfile({ candidate = {}, assessment = null } = {}) {
  const c = candidate && typeof candidate === "object" ? candidate : {};
  const a = assessment && typeof assessment === "object" ? assessment : null;
  const meta = decodeApplicantMetadata(c);
  const draftPayload = normalizeJsonObjectInput(c.draft_payload || c.draftPayload);
  const screeningAnswers = normalizeJsonObjectInput(c.screening_answers || c.screeningAnswers);

  const cvResult = getVersionedCvAnalysisResult(meta) || {};
  const highlights = Array.isArray(c?.cv_highlights)
    ? c.cv_highlights
    : Array.isArray(cvResult?.highlights)
      ? cvResult.highlights
      : [];
  const strongPoints = highlights.map((v) => String(v || "").trim()).filter(Boolean).slice(0, 2);

  const candidateName = String(a?.candidateName || c.name || draftPayload.candidateName || "").trim();
  const phone = String(a?.phoneNumber || c.phone || draftPayload.phoneNumber || "").trim();
  const email = String(a?.emailId || c.email || draftPayload.emailId || "").trim();
  const linkedin = String(a?.linkedinUrl || c.linkedin || draftPayload.linkedin || "").trim();
  const clientName = String(a?.clientName || draftPayload.clientName || c.client_name || c.clientName || c.assigned_jd_client || "").trim();
  const jdTitle = String(a?.jdTitle || draftPayload.jdTitle || c.assigned_jd_title || c.jd_title || c.jdTitle || "").trim();
  const currentCompany = String(a?.currentCompany || c.company || draftPayload.currentCompany || cvResult?.currentCompany || "").trim();
  const currentDesignation = String(a?.currentDesignation || c.role || draftPayload.currentDesignation || cvResult?.currentDesignation || "").trim();
  const totalExperience = String(a?.totalExperience || c.experience || draftPayload.totalExperience || cvResult?.exactTotalExperience || "").trim();
  const relevantExperience = String(a?.relevantExperience || draftPayload.relevantExperience || "").trim();
  const location = String(a?.location || c.location || draftPayload.location || "").trim();
  const highestEducation = String(a?.highestEducation || c.highest_education || draftPayload.highestEducation || cvResult?.highestEducation || "").trim();
  const noticePeriod = String(a?.noticePeriod || c.notice_period || draftPayload.noticePeriod || "").trim();
  const currentCtc = String(a?.currentCtc || c.current_ctc || draftPayload.currentCtc || "").trim();
  const expectedCtc = String(a?.expectedCtc || c.expected_ctc || draftPayload.expectedCtc || "").trim();
  const offerInHand = String(a?.offerInHand || a?.offerAmount || c.offer_in_hand || draftPayload.offerInHand || "").trim();
  const lwdOrDoj = String(a?.lwdOrDoj || a?.offerDoj || c.lwd_or_doj || draftPayload.lwdOrDoj || "").trim();

  const pipelineStage = String(a?.pipelineStage || draftPayload.pipelineStage || "").trim();
  const candidateStatus = String(a?.candidateStatus || draftPayload.candidateStatus || "").trim();
  const dateAppliedRaw = String(c.created_at || c.createdAt || a?.createdAt || a?.generatedAt || "").trim();
  const sourcePlatform = String(c.source || meta?.sourcePlatform || "").trim();

  const otherStandardQuestions = String(a?.other_standard_questions || a?.otherStandardQuestions || a?.otherStandardQuestionAnswers || "").trim();
  const reasonOfChange = String(
    a?.reasonForChange
    || c.reason_of_change
    || c.reasonForChange
    || draftPayload.reasonForChange
    || ""
  ).trim() || String(screeningAnswers["Reason of change"] || screeningAnswers["reason of change"] || "").trim();
  const otherPointers = String(a?.otherPointers || c.other_pointers || draftPayload.otherPointers || "").trim();
  const recruiterNotes = String(a?.recruiterNotes || c.recruiter_context_notes || draftPayload.recruiterNotes || "").trim();
  const callbackNotes = String(a?.callbackNotes || c.notes || draftPayload.callbackNotes || "").trim();

  const screeningRemarksParts = [];
  if (strongPoints.length) {
    screeningRemarksParts.push("Strong points:");
    strongPoints.forEach((p, idx) => screeningRemarksParts.push(`${idx + 1}. *${p}*`));
  }
  if (reasonOfChange) {
    if (screeningRemarksParts.length) screeningRemarksParts.push("");
    screeningRemarksParts.push("Reason of change:");
    screeningRemarksParts.push(`*${reasonOfChange}*`);
  }
  const screeningRemarks = screeningRemarksParts.join("\n").trim();

  const sections = [
    {
      title: "Candidate Details",
      rows: [
        { label: "Name of candidate", value: candidateName || "-" },
        { label: "Position applied for", value: jdTitle || "-" },
        { label: "Date applied", value: dateAppliedRaw ? new Date(dateAppliedRaw).toLocaleDateString() : "-" },
        { label: "Mobile", value: phone || "-" },
        { label: "Email", value: email || "-" },
        { label: "Source", value: sourcePlatform || "-" }
      ]
    },
    {
      title: "Education Background",
      rows: [{ label: "Highest qualification", value: highestEducation || "-" }]
    },
    {
      title: "Personal & Professional Information",
      rows: [
        { label: "Current/Last Organization", value: currentCompany || "-" },
        { label: "Designation / Role", value: currentDesignation || "-" },
        { label: "Total Work Experience", value: totalExperience || "-" },
        { label: "Relevant Experience", value: relevantExperience || "-" },
        { label: "Residence Location", value: location || "-" },
        { label: "Notice period", value: noticePeriod || "-" },
        { label: "Current/Last CTC/PA", value: currentCtc || "-" },
        { label: "Expected CTC", value: expectedCtc || "-" },
        { label: "Offer in hand", value: offerInHand || "-" },
        { label: "LWD / DOJ", value: lwdOrDoj || "-" }
      ]
    },
    {
      title: "Screening Remarks",
      rows: [{ label: "Screening remarks", value: screeningRemarks || "-" }]
    }
  ];

  const notesBlock = [recruiterNotes, callbackNotes, otherPointers].map((v) => String(v || "").trim()).filter(Boolean).join("\n\n");
  if (notesBlock) {
    sections.push({
      title: "Other Pointers / Notes",
      rows: [{ label: "Notes", value: notesBlock }]
    });
  }

  return {
    title: candidateName || "Candidate Profile",
    subtitle: [clientName ? `Client: ${clientName}` : "", jdTitle ? `JD: ${jdTitle}` : "", currentCompany ? `Company: ${currentCompany}` : ""].filter(Boolean).join(" | "),
    statusText: [candidateStatus ? `Assessment status: ${candidateStatus}` : ""].filter(Boolean).join(" | "),
    sections
  };
}

function getRequestBaseUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || "").trim() || "http";
  const host = String(req.headers.host || "").trim();
  return host ? `${proto}://${host}` : "";
}

function sendJson(arg1, arg2, arg3, arg4) {
  const hasExplicitReq = arguments.length >= 4;
  const req = hasExplicitReq ? arg1 : null;
  const res = hasExplicitReq ? arg2 : arg1;
  const statusCode = hasExplicitReq ? arg3 : arg2;
  const payload = hasExplicitReq ? arg4 : arg3;
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, buildResponseHeaders(req, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  }));
  res.end(body);
}

function sendText(arg1, arg2, arg3, arg4, arg5 = "text/plain; charset=utf-8") {
  const hasExplicitReq = arguments.length >= 4;
  const req = hasExplicitReq ? arg1 : null;
  const res = hasExplicitReq ? arg2 : arg1;
  const statusCode = hasExplicitReq ? arg3 : arg2;
  const body = hasExplicitReq ? arg4 : arg3;
  const contentType = hasExplicitReq ? arg5 : arg4 || "text/plain; charset=utf-8";
  res.writeHead(statusCode, buildResponseHeaders(req, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body)
  }));
  res.end(body);
}

function sendHtml(arg1, arg2, arg3, arg4) {
  const hasExplicitReq = arguments.length >= 4;
  const req = hasExplicitReq ? arg1 : null;
  const res = hasExplicitReq ? arg2 : arg1;
  const statusCode = hasExplicitReq ? arg3 : arg2;
  const body = hasExplicitReq ? arg4 : arg3;
  sendText(req, res, statusCode, String(body || ""), "text/html; charset=utf-8");
}

function sendBuffer(arg1, arg2, arg3, arg4, arg5 = {}) {
  const hasExplicitReq = arguments.length >= 4;
  const req = hasExplicitReq ? arg1 : null;
  const res = hasExplicitReq ? arg2 : arg1;
  const statusCode = hasExplicitReq ? arg3 : arg2;
  const buffer = hasExplicitReq ? arg4 : arg3;
  const extras = hasExplicitReq ? arg5 : arg4 || {};
  res.writeHead(statusCode, buildResponseHeaders(req, {
    "Content-Length": buffer.length,
    ...extras
  }));
  res.end(buffer);
}

function stableStringifyForCache(value) {
  const seen = new WeakSet();
  const normalize = (input) => {
    if (input === null || input === undefined) return null;
    if (Buffer.isBuffer(input)) {
      return {
        __type: "buffer",
        sha256: crypto.createHash("sha256").update(input).digest("hex"),
        length: input.length
      };
    }
    if (input instanceof Date) return input.toISOString();
    if (Array.isArray(input)) return input.map((item) => normalize(item));
    if (typeof input === "object") {
      if (seen.has(input)) return "[Circular]";
      seen.add(input);
      const out = {};
      for (const key of Object.keys(input).sort()) {
        const normalized = normalize(input[key]);
        if (normalized !== undefined) out[key] = normalized;
      }
      seen.delete(input);
      return out;
    }
    if (typeof input === "bigint") return String(input);
    if (typeof input === "number" && !Number.isFinite(input)) return String(input);
    return input;
  };
  return JSON.stringify(normalize(value));
}

function sha256Hex(value = "") {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function normalizeEtagValue(value = "") {
  return String(value || "")
    .trim()
    .replace(/^W\//i, "")
    .replace(/^"|"$/g, "");
}

function requestMatchesEtag(req, etag = "") {
  const expected = normalizeEtagValue(etag);
  if (!expected) return false;
  const header = String(req?.headers?.["if-none-match"] || "").trim();
  if (!header) return false;
  const values = header.split(",").map((item) => normalizeEtagValue(item)).filter(Boolean);
  return values.includes("*") || values.includes(expected);
}

function pruneBrandedCvResponseCache() {
  const now = Date.now();
  for (const [cacheKey, entry] of BRANDED_CV_RESPONSE_CACHE.entries()) {
    if (!entry || !entry.createdAt || now - Number(entry.createdAt || 0) > BRANDED_CV_RESPONSE_CACHE_TTL_MS) {
      BRANDED_CV_RESPONSE_CACHE.delete(cacheKey);
    }
  }
  while (BRANDED_CV_RESPONSE_CACHE.size > BRANDED_CV_RESPONSE_CACHE_MAX_ENTRIES) {
    let oldestKey = null;
    let oldestTouched = Infinity;
    for (const [cacheKey, entry] of BRANDED_CV_RESPONSE_CACHE.entries()) {
      const touched = Number(entry?.lastAccessAt || entry?.createdAt || 0);
      if (touched < oldestTouched) {
        oldestTouched = touched;
        oldestKey = cacheKey;
      }
    }
    if (!oldestKey) break;
    BRANDED_CV_RESPONSE_CACHE.delete(oldestKey);
  }
}

function getBrandedCvResponseFromCache(cacheKey = "") {
  const key = String(cacheKey || "").trim();
  if (!key) return null;
  pruneBrandedCvResponseCache();
  const entry = BRANDED_CV_RESPONSE_CACHE.get(key) || null;
  if (!entry) return null;
  entry.lastAccessAt = Date.now();
  BRANDED_CV_RESPONSE_CACHE.set(key, entry);
  return entry;
}

function setBrandedCvResponseCache(cacheKey = "", value = {}) {
  const key = String(cacheKey || "").trim();
  if (!key || !value || !Buffer.isBuffer(value.buffer) || !value.etag) return;
  BRANDED_CV_RESPONSE_CACHE.set(key, {
    buffer: value.buffer,
    etag: String(value.etag || "").trim(),
    cacheControl: String(value.cacheControl || "private, max-age=0, must-revalidate").trim(),
    contentType: String(value.contentType || "application/pdf").trim(),
    contentDisposition: String(value.contentDisposition || "").trim(),
    brandedFallbackUsed: Boolean(value.brandedFallbackUsed),
    createdAt: Date.now(),
    lastAccessAt: Date.now()
  });
  pruneBrandedCvResponseCache();
}

function buildBrandedCvResponseCacheKey(parts = {}) {
  return sha256Hex(stableStringifyForCache({
    route: String(parts.route || "").trim(),
    companyId: String(parts.companyId || "").trim(),
    candidateId: String(parts.candidateId || "").trim(),
    assessmentId: String(parts.assessmentId || "").trim(),
    forceDownload: Boolean(parts.forceDownload),
    companyName: String(parts.companyName || "").trim(),
    candidateName: String(parts.candidateName || "").trim(),
    headerLine: String(parts.headerLine || "").trim(),
    resumeFormatting: parts.resumeFormatting && typeof parts.resumeFormatting === "object" ? parts.resumeFormatting : {},
    fileHash: Buffer.isBuffer(parts.fileBuffer) ? sha256Hex(parts.fileBuffer) : String(parts.fileHash || "").trim()
  }));
}

function sendConditionalBuffer(arg1, arg2, arg3, arg4, arg5 = {}) {
  const hasExplicitReq = arguments.length >= 4;
  const req = hasExplicitReq ? arg1 : null;
  const res = hasExplicitReq ? arg2 : arg1;
  const statusCode = hasExplicitReq ? arg3 : arg2;
  const buffer = hasExplicitReq ? arg4 : arg3;
  const extras = hasExplicitReq ? { ...(arg5 || {}) } : { ...((arg4 && typeof arg4 === "object") ? arg4 : {}) };
  const etag = normalizeEtagValue(extras.ETag || extras.etag || "");
  if (etag) {
    extras.ETag = `"${etag}"`;
    if (requestMatchesEtag(req, etag)) {
      res.writeHead(304, buildResponseHeaders(req, {
        ...extras,
        "Content-Length": 0
      }));
      res.end();
      return;
    }
  }
  sendBuffer(req, res, statusCode, buffer, extras);
}

function serveStaticFile(arg1, arg2, arg3) {
  const hasExplicitReq = arguments.length >= 3;
  const req = hasExplicitReq ? arg1 : null;
  const res = hasExplicitReq ? arg2 : arg1;
  const filePath = hasExplicitReq ? arg3 : arg2;
  if (!filePath.startsWith(QUICK_CAPTURE_PUBLIC_DIR) && !filePath.startsWith(ROOT_PUBLIC_DIR)) {
    sendText(req, res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(req, res, 404, "Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = STATIC_MIME_TYPES[ext] || "application/octet-stream";
  const body = fs.readFileSync(filePath);
  const normalizedPath = String(filePath || "").replace(/\\/g, "/").toLowerCase();
  const isHtmlShell = path.basename(filePath).toLowerCase() === "index.html";
  const isHashedPortalAsset =
    normalizedPath.includes("/public/portal-app/assets/")
    && /\/index-[^/]+\.(js|css)$/i.test(normalizedPath);
  const cacheControl = isHtmlShell
    ? "no-cache, no-store, must-revalidate"
    : isHashedPortalAsset
      ? "public, max-age=31536000, immutable"
      : (contentType.startsWith("image/") ? "public, max-age=86400" : "no-store");
  res.writeHead(200, buildResponseHeaders(req, {
    "Content-Type": contentType,
    "Content-Length": body.length,
    "Cache-Control": cacheControl
  }));
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 15 * 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function getBearerToken(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function getBearerTokenFromRequest(req, requestUrl = null) {
  const headerToken = getBearerToken(req);
  if (headerToken) return headerToken;
  const queryToken = String(requestUrl?.searchParams?.get("access_token") || "").trim();
  return queryToken;
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error("Request body too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(raw));
    req.on("error", reject);
  });
}

function getZohoRedirectUri(req) {
  const configured = String(process.env.ZOHO_REDIRECT_URI || "").trim();
  if (configured) return configured;
  return "https://recruiter-backend-yvex.onrender.com/zoho/oauth/callback";
}

async function writeAuditLogSafe({
  companyId = "",
  actorUserId = "",
  actorEmail = "",
  actorName = "",
  action = "",
  module = "",
  entity = "",
  entityId = "",
  detail = ""
} = {}) {
  try {
    await appendAuditLog({
      companyId,
      actorUserId,
      actorEmail,
      actorName,
      action,
      module,
      entity,
      entityId,
      detail
    });
  } catch (_) {
    // Best-effort only.
  }
}

function getEmailOauthRedirectUri(provider = "", req = null) {
  const p = String(provider || "").trim().toLowerCase();
  if (p === "zoho") return getZohoRedirectUri(req);
  if (p === "google") {
    return String(process.env.GOOGLE_OAUTH_REDIRECT_URI || "").trim() || "https://recruiter-backend-yvex.onrender.com/email/oauth/callback";
  }
  if (p === "microsoft") {
    return String(process.env.MICROSOFT_OAUTH_REDIRECT_URI || "").trim() || "https://recruiter-backend-yvex.onrender.com/email/oauth/callback";
  }
  return "";
}

function getEmailOauthStateSecret() {
  return (
    String(process.env.ZOHO_OAUTH_STATE_SECRET || "").trim() ||
    String(process.env.PLATFORM_SESSION_SECRET || "").trim() ||
    String(process.env.CV_SHARE_SECRET || "").trim() ||
    "recruitdesk-email-oauth-state"
  );
}

function createSignedEmailOauthState(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getEmailOauthStateSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function readSignedEmailOauthState(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto
    .createHmac("sha256", getEmailOauthStateSecret())
    .update(encoded)
    .digest("base64url");
  if (!timingSafeEqualString(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload?.type !== "email_oauth_connect") return null;
    if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCsvEnvSet(value = "") {
  return new Set(
    String(value || "")
      .split(/,|;|\r?\n/)
      .map((item) => String(item || "").trim())
      .filter(Boolean)
  );
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function getPortalApprovedCompanyIds() {
  const legacy = parseCsvEnvSet(process.env.PORTAL_APPROVED_COMPANY_IDS || "");
  const fullAccess = parseCsvEnvSet(process.env.FULL_ACCESS_COMPANY_IDS || "");
  return new Set([...legacy, ...fullAccess]);
}

async function isPortalCompanyApproved(companyId = "") {
  const id = String(companyId || "").trim();
  if (!id) return false;
  const approved = getPortalApprovedCompanyIds();
  if (approved.has(id)) return true;
  const license = await getCompanyLicense(id).catch(() => null);
  const status = String(license?.status || "").trim().toLowerCase();
  const planDef = getPlanDefinition(String(license?.plan || "").trim().toLowerCase());
  return (status === "active" || status === "legacy" || status === "trial") && Boolean(planDef?.code);
}

async function ensurePortalCompanyApproved(companyId = "") {
  if (!(await isPortalCompanyApproved(companyId))) {
    throw new Error("Portal access pending admin approval.");
  }
}

async function requireSaasAccess(actor, featureLabel = "this feature") {
  const companyId = String(actor?.companyId || "").trim();
  if (!companyId) throw new Error("Invalid company context.");
  const approved = getPortalApprovedCompanyIds();
  if (approved.has(companyId)) return true;
  const license = await getCompanyLicense(companyId).catch(() => null);
  const status = String(license?.status || "").trim().toLowerCase();
  const planDef = getPlanDefinition(String(license?.plan || "").trim().toLowerCase());
  if ((status === "active" || status === "legacy" || status === "trial") && Boolean(planDef?.fullRecruiter)) return true;
  throw new Error(`${featureLabel} is available on Full Recruiter plans.`);
}

async function requireSuiteModulesAccess(actor, featureLabel = "this feature") {
  const companyId = String(actor?.companyId || "").trim();
  if (!companyId) throw new Error("Invalid company context.");
  const approved = getPortalApprovedCompanyIds();
  if (approved.has(companyId)) return true;
  const license = await getCompanyLicense(companyId).catch(() => null);
  const status = String(license?.status || "").trim().toLowerCase();
  const planDef = getPlanDefinition(String(license?.plan || "").trim().toLowerCase());
  if ((status === "active" || status === "legacy" || status === "trial") && Boolean(planDef?.fullRecruiter)) return true;
  throw new Error(`${featureLabel} is available on Full Recruiter plans.`);
}

async function requireCompanySessionOrPayrollSession(token) {
  const rawToken = String(token || "").trim();
  if (!rawToken) throw new Error("Invalid or missing session.");
  try {
    return await requireSessionUser(rawToken);
  } catch {
    return requirePayrollSessionUser(rawToken);
  }
}

const UPGRADE_ALLOWED_PLANS = new Set([
  "basic",
  "full_recruiter",
  "s1_basic_499", "s3_basic_999", "s7_basic_1999", "s15_basic_2999", "ext_499_1_user",
  "s1_full_999", "s3_full_1999", "s7_full_3999", "s15_full_4999", "ext_999_3_users", "ext_1999_7_users",
  "s1_suite_1499", "s3_suite_2999", "s7_suite_5999", "s15_suite_6999", "saas_4999_unlimited"
]);

const UPGRADE_PLAN_AMOUNT_INR = {
  basic: 499,
  full_recruiter: 999,
  s1_basic_499: 499, s3_basic_999: 499, s7_basic_1999: 499, s15_basic_2999: 499, ext_499_1_user: 499,
  s1_full_999: 999, s3_full_1999: 999, s7_full_3999: 999, s15_full_4999: 999, ext_999_3_users: 999, ext_1999_7_users: 999,
  s1_suite_1499: 999, s3_suite_2999: 999, s7_suite_5999: 999, s15_suite_6999: 999, saas_4999_unlimited: 999
};

function getUpgradeTokenSecret() {
  return (
    String(process.env.UPGRADE_LINK_SECRET || "").trim() ||
    String(process.env.PLATFORM_SESSION_SECRET || "").trim() ||
    getCvShareSecret()
  );
}

function createSignedUpgradeToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getUpgradeTokenSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function readSignedUpgradeToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto
    .createHmac("sha256", getUpgradeTokenSecret())
    .update(encoded)
    .digest("base64url");
  if (!timingSafeEqualString(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload?.type !== "shared_upgrade_link") return null;
    if (!UPGRADE_ALLOWED_PLANS.has(String(payload?.planCode || "").trim())) return null;
    if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getEmailVerifyTokenSecret() {
  return (
    String(process.env.EMAIL_VERIFY_SECRET || "").trim() ||
    String(process.env.PLATFORM_SESSION_SECRET || "").trim() ||
    getCvShareSecret()
  );
}

function createSignedEmailVerifyToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getEmailVerifyTokenSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function readSignedEmailVerifyToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto
    .createHmac("sha256", getEmailVerifyTokenSecret())
    .update(encoded)
    .digest("base64url");
  if (!timingSafeEqualString(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload?.type !== "email_verify") return null;
    if (!payload?.userId || !payload?.companyId || !payload?.email) return null;
    if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}

function getPasswordResetTokenSecret() {
  return (
    String(process.env.PASSWORD_RESET_SECRET || "").trim() ||
    String(process.env.PLATFORM_SESSION_SECRET || "").trim() ||
    getCvShareSecret()
  );
}

function createSignedPasswordResetToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getPasswordResetTokenSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}

function readSignedPasswordResetToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto
    .createHmac("sha256", getPasswordResetTokenSecret())
    .update(encoded)
    .digest("base64url");
  if (!timingSafeEqualString(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload?.type !== "password_reset") return null;
    if (!payload?.userId || !payload?.companyId || !payload?.email) return null;
    if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}

function isRazorpayConfigured() {
  return Boolean(String(process.env.RAZORPAY_KEY_ID || "").trim() && String(process.env.RAZORPAY_KEY_SECRET || "").trim());
}

async function createRazorpayOrder({ amountInr, receipt, notes = {} }) {
  const keyId = String(process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");
  const auth = Buffer.from(`${keyId}:${keySecret}`, "utf8").toString("base64");
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      amount: Math.round(Number(amountInr || 0) * 100),
      currency: "INR",
      receipt: String(receipt || "").slice(0, 40),
      payment_capture: 1,
      notes
    })
  });
  const raw = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch {}
  if (!response.ok) {
    throw new Error(String(parsed?.error?.description || raw || "Could not create Razorpay order."));
  }
  return parsed;
}

function timingSafeEqualString(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  try {
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function inferStoredFileRefFromUrl(actor, requestUrl) {
  const fileProvider = String(requestUrl?.searchParams?.get("cv_provider") || "").trim();
  const fileKey = String(requestUrl?.searchParams?.get("cv_key") || "").trim();
  const fileUrl = String(requestUrl?.searchParams?.get("cv_url") || "").trim();
  const filename = String(requestUrl?.searchParams?.get("cv_filename") || "").trim();
  if (fileProvider && fileKey) {
    if (!fileKey.includes(String(actor.companyId || "").trim())) return null;
    return {
      provider: fileProvider,
      key: fileKey,
      url: fileUrl,
      filename,
      mimeType: "application/octet-stream"
    };
  }
  if (!fileUrl) {
    return null;
  }
  try {
    const parsed = new URL(fileUrl);
    const pathname = decodeURIComponent(parsed.pathname || "").replace(/^\/+/, "");
    if (!pathname || !pathname.includes(String(actor.companyId || "").trim())) {
      return null;
    }
    return {
      provider: "s3",
      key: pathname,
      url: fileUrl,
      filename,
      mimeType: "application/octet-stream"
    };
  } catch {
    return null;
  }
}

function encodeApplicantMetadata(metadata = {}) {
  return `${APPLICANT_METADATA_PREFIX}${JSON.stringify(metadata || {})}`;
}

function decodeApplicantMetadata(candidate = {}) {
  const raw = String(candidate?.raw_note || "").trim();
  if (!raw.startsWith(APPLICANT_METADATA_PREFIX)) return {};
  try {
    return JSON.parse(raw.slice(APPLICANT_METADATA_PREFIX.length));
  } catch {
    return {};
  }
}

function normalizeJsonObjectInput(value) {
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

function mergeDraftPayloadPreservingExisting(existingDraftValue, incomingDraftValue) {
  const existing = normalizeJsonObjectInput(existingDraftValue);
  const incoming = normalizeJsonObjectInput(incomingDraftValue);
  const merged = { ...existing };
  const protectedKeys = [
    "candidateName",
    "currentCompany",
    "currentDesignation",
    "totalExperience",
    "highestEducation"
  ];
  const isBlank = (value) => !String(value == null ? "" : value).trim();

  Object.keys(incoming).forEach((key) => {
    const nextValue = incoming[key];
    if (protectedKeys.includes(key)) {
      if (!isBlank(nextValue)) {
        merged[key] = nextValue;
      } else if (!(key in merged)) {
        merged[key] = nextValue;
      }
      return;
    }
    merged[key] = nextValue;
  });
  return merged;
}

function screeningAnswersToSearchText(obj) {
  const input = obj && typeof obj === "object" ? obj : {};
  const pairs = Object.entries(input)
    .map(([k, v]) => `${String(k || "").trim()} ${String(v == null ? "" : v).trim()}`.trim())
    .filter(Boolean);
  if (!pairs.length) return "";
  return pairs.join("\n");
}

function buildUploadedFileFingerprint(file = {}) {
  const fileData = String(file?.fileData || "").trim();
  if (!fileData) return "";
  return crypto.createHash("sha1").update(fileData).digest("hex");
}

const PARSE_CANDIDATE_CACHE = new Map();
const PARSE_CANDIDATE_CACHE_MAX = 3000;
const CV_PARSE_RESULT_VERSION = "2026-05-23-unified-v2";
const CV_EXPERIENCE_POLICY = Object.freeze({
  excludeIntern: true,
  excludeFreelance: true,
  includeTrainee: true
});

function getVersionedCvAnalysisResult(meta = {}) {
  const cache = meta?.cvAnalysisCache && typeof meta.cvAnalysisCache === "object" ? meta.cvAnalysisCache : null;
  const result = cache?.result && typeof cache.result === "object" ? cache.result : null;
  if (!result) return null;
  const version = String(cache?.parseVersion || result?.parseVersion || "").trim();
  if (version !== CV_PARSE_RESULT_VERSION) return null;
  return result;
}

function buildParseCandidateCacheKey(body = {}, companyId = "") {
  const sourceType = String(body?.sourceType || "").trim().toLowerCase();
  const fingerprint = buildUploadedFileFingerprint(body?.file || {});
  if (!fingerprint) return "";
  const aiMode = body?.normalizeWithAi !== false ? "ai" : "manual";
  const scope = String(companyId || "global").trim().toLowerCase();
  return `${CV_PARSE_RESULT_VERSION}|${scope}|${sourceType}|${aiMode}|${fingerprint}`;
}

async function getEffectiveInterviewAiParsingEnabled(companyId = "") {
  const scopedCompanyId = String(companyId || "").trim();
  if (!scopedCompanyId) return true;
  try {
    const settings = await getCompanySharedExportPresets(scopedCompanyId);
    return settings?.interviewAiParsingEnabled !== false;
  } catch (_) {
    return true;
  }
}

function setParseCandidateCache(cacheKey = "", payload = null) {
  if (!cacheKey || !payload) return;
  if (PARSE_CANDIDATE_CACHE.has(cacheKey)) PARSE_CANDIDATE_CACHE.delete(cacheKey);
  PARSE_CANDIDATE_CACHE.set(cacheKey, {
    payload,
    createdAt: Date.now()
  });
  if (PARSE_CANDIDATE_CACHE.size > PARSE_CANDIDATE_CACHE_MAX) {
    const oldestKey = PARSE_CANDIDATE_CACHE.keys().next().value;
    if (oldestKey) PARSE_CANDIDATE_CACHE.delete(oldestKey);
  }
}

function shouldIncludeCvExperienceForSummary(row = {}) {
  const policy = CV_EXPERIENCE_POLICY;
  const text = `${String(row?.designation || "").trim()} ${String(row?.company_name || "").trim()}`.toLowerCase();
  if (!text) return true;
  if (policy.excludeIntern && /\bintern(ship)?\b/.test(text)) return false;
  if (policy.excludeFreelance && /\bfreelanc(?:e|er|ing)\b/.test(text)) return false;
  if (/\btrainee\b/.test(text)) return Boolean(policy.includeTrainee);
  return true;
}

function normalizeCvExperienceRowsForContract(result = {}, finalOutput = {}) {
  const fromFinal = Array.isArray(finalOutput?.experienceTimeline) ? finalOutput.experienceTimeline : [];
  const fromResult = Array.isArray(result?.experience_history) ? result.experience_history : [];
  const fallbackTimeline = Array.isArray(result?.experienceTimeline) ? result.experienceTimeline : [];
  const selected = fromFinal.length ? fromFinal : (fromResult.length ? fromResult : fallbackTimeline);
  const mapped = selected.map((item) => ({
    company_name: String(item?.company_name || item?.company || "").trim(),
    designation: String(item?.designation || item?.title || "").trim(),
    start_date: String(item?.start_date || item?.startDate || item?.start || "").trim(),
    end_date: String(item?.end_date || item?.endDate || item?.end || "").trim(),
    source_text: String(item?.source_text || item?.sourceText || item?.raw_line || "").trim()
  }));
  return mapped.filter((row) => row.company_name || row.designation || row.start_date || row.end_date);
}

function normalizeCvEducationRowsForContract(result = {}, finalOutput = {}) {
  const fromFinal = Array.isArray(finalOutput?.education) ? finalOutput.education : [];
  const fromResult = Array.isArray(result?.education_history) ? result.education_history : [];
  const selected = fromFinal.length ? fromFinal : fromResult;
  const mapped = selected.map((item) => ({
    degree: String(item?.degree || item?.qualification || "").trim(),
    institution: String(item?.institution || item?.university || item?.school || "").trim(),
    start_date: String(item?.start_date || item?.startDate || "").trim(),
    end_date: String(item?.end_date || item?.endDate || "").trim(),
    year: String(item?.year || "").trim()
  }));
  return mapped.filter((row) => row.degree || row.institution || row.start_date || row.end_date || row.year);
}

function parseCvMonthIndex(value = "") {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/present|current|ongoing|till\s*date/i.test(text)) {
    const now = new Date();
    return (now.getFullYear() * 12) + now.getMonth();
  }
  const m = text.match(/(19\d{2}|20\d{2})[-/](0?[1-9]|1[0-2])/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (Number.isFinite(y) && Number.isFinite(mo)) return (y * 12) + (mo - 1);
  }
  const parsed = parseMonthYear(text, /present|current|ongoing|till\s*date/i.test(text));
  const idx = monthIndex(parsed);
  return Number.isInteger(idx) ? idx : null;
}

function rankCvEducationDegree(value = "") {
  const d = String(value || "").trim().toLowerCase();
  if (!d) return 0;
  if (/\b(ph\.?\s*d|doctorate)\b/.test(d)) return 9;
  if (/\b(master|mba|mca|m\.?\s*tech|m\.?\s*e\.?|m\.?\s*sc|m\.?\s*com|m\.?\s*a|pgdm)\b/.test(d)) return 8;
  if (/\b(bachelor|graduat(?:ion)?|b\.?\s*tech|b\.?\s*e\.?|bca|b\.?\s*sc|b\.?\s*com|b\.?\s*a)\b/.test(d)) return 7;
  if (/\b(diploma|iti|polytechnic)\b/.test(d)) return 6;
  if (/\b(12th|hsc|intermediate)\b/.test(d)) return 5;
  if (/\b(10th|ssc|matric)\b/.test(d)) return 4;
  return 0;
}

function deriveDeterministicCvSummary({ experienceHistory = [], educationHistory = [], rawText = "", normalizedLocation = "" }) {
  const rows = (Array.isArray(experienceHistory) ? experienceHistory : []).filter(shouldIncludeCvExperienceForSummary);
  const timelineRows = rows
    .map((row) => ({
      company: String(row?.company_name || "").trim(),
      title: String(row?.designation || "").trim(),
      start: String(row?.start_date || "").trim(),
      end: String(row?.end_date || "").trim()
    }))
    .filter((row) => row.company || row.title || row.start || row.end);

  const intervals = [];
  for (const row of timelineRows) {
    const s = parseCvMonthIndex(row.start);
    const e = parseCvMonthIndex(row.end);
    if (s == null || e == null || e < s) continue;
    intervals.push([s, e]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of intervals) {
    const last = merged[merged.length - 1];
    if (!last || s > last[1] + 1) merged.push([s, e]);
    else last[1] = Math.max(last[1], e);
  }
  const totalMonths = merged.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
  const totalExperience = totalMonths > 0 ? formatTotalExperience(totalMonths) : "";

  const currentSpan = getCurrentCompanyContiguousSpan(timelineRows);
  const currentRole = currentSpan.row || getCurrentRoleFromTimeline(timelineRows) || null;
  const currentOrgMonths = Number(currentSpan.months || 0);

  const rankedEducation = (Array.isArray(educationHistory) ? educationHistory : [])
    .map((row) => {
      const degree = String(row?.degree || "").trim();
      const rank = rankCvEducationDegree(degree);
      const yrText = `${String(row?.end_date || "").trim()} ${String(row?.year || "").trim()} ${String(row?.start_date || "").trim()}`;
      const years = Array.from(String(yrText).matchAll(/\b(19\d{2}|20\d{2})\b/g)).map((m) => Number(m[1])).filter(Number.isFinite);
      const year = years.length ? Math.max(...years) : 0;
      return { degree, rank, year };
    })
    .filter((item) => item.degree && item.rank > 0)
    .sort((a, b) => (b.rank - a.rank) || (b.year - a.year));

  const location = resolveCandidateLocationFromCv({
    experienceHistory: rows,
    normalizedLocation: String(normalizedLocation || "").trim(),
    rawText: String(rawText || "")
  });

  return {
    currentCompany: String(currentRole?.company || "").trim(),
    currentDesignation: String(currentRole?.title || "").trim(),
    totalExperience: String(totalExperience || "").trim(),
    currentOrgTenure: currentOrgMonths > 0 ? formatTotalExperience(currentOrgMonths) : "",
    highestQualification: String(rankedEducation[0]?.degree || "").trim(),
    location: String(location || "").trim(),
    policy: {
      ...CV_EXPERIENCE_POLICY
    }
  };
}

function finalizeCvParseResult({ hybrid, aiParseMode = "", aiParseReason = "" }) {
  const parsed = hybrid?.parsed || {};
  const normalized = hybrid?.normalized || {};
  const finalOutput = hybrid?.finalOutput || {};
  const result = buildCandidateParseResponse(parsed, normalized, { aiParseMode, aiParseReason });
  const experience_history = normalizeCvExperienceRowsForContract(result, finalOutput);
  const education_history = normalizeCvEducationRowsForContract(result, finalOutput);
  const deterministicSummary = deriveDeterministicCvSummary({
    experienceHistory: experience_history,
    educationHistory: education_history,
    rawText: String(parsed?.rawText || ""),
    normalizedLocation: String(result?.location || "").trim()
  });

  result.experience_history = experience_history;
  result.education_history = education_history;
  result.currentCompany = deterministicSummary.currentCompany || "";
  result.currentDesignation = deterministicSummary.currentDesignation || "";
  result.totalExperience = deterministicSummary.totalExperience || "";
  result.currentOrgTenure = deterministicSummary.currentOrgTenure || "";
  result.highestQualification = deterministicSummary.highestQualification || "";
  result.location = deterministicSummary.location || "";
  result.needsReview = finalOutput.needsReview;
  result.reviewReasons = finalOutput.reviewReasons;
  result.parseMeta = hybrid?.meta || {};
  result.parseVersion = CV_PARSE_RESULT_VERSION;
  result.deterministic_summary = deterministicSummary;
  result.parse_contract = {
    timeline: result.experience_history,
    education: result.education_history,
    contact: {
      candidateName: String(result?.candidateName || "").trim(),
      phoneNumber: String(result?.phoneNumber || "").trim(),
      emailId: String(result?.emailId || "").trim(),
      linkedinUrl: String(result?.linkedinUrl || "").trim(),
      location: String(result?.location || "").trim()
    },
    summaryText: String(parsed?.rawText || "").trim().slice(0, 2000)
  };
  if (result.fixed_schema && typeof result.fixed_schema === "object") {
    result.fixed_schema = {
      ...result.fixed_schema,
      summary: {
        ...(result.fixed_schema.summary && typeof result.fixed_schema.summary === "object" ? result.fixed_schema.summary : {}),
        location: result.location,
        current_company: result.currentCompany,
        current_designation: result.currentDesignation,
        total_experience: result.totalExperience,
        highest_education: result.highestQualification
      },
      experience_history: result.experience_history,
      education_history: result.education_history
    };
  }
  return result;
}

const INFERRED_SEARCH_TAG_RULES = [
  { tag: "saas", patterns: [/\bsaas\b/i, /\bsoftware as a service\b/i, /\bcrm\b/i, /\bproduct company\b/i] },
  { tag: "b2b", patterns: [/\bb2b\b/i, /\benterprise\b/i, /\bcorporate sales\b/i, /\bchannel partner\b/i, /\bbusiness development\b/i] },
  { tag: "fintech", patterns: [/\bfintech\b/i, /\bpayments\b/i, /\blending\b/i, /\bloans?\b/i, /\bnbfc\b/i, /\bfinancial services\b/i] },
  { tag: "lending", patterns: [/\bloans?\b/i, /\blap\b/i, /\bhome loan\b/i, /\bpersonal loan\b/i, /\bmortgage\b/i] },
  { tag: "healthtech", patterns: [/\bhealthtech\b/i, /\bhealth care\b/i, /\bhospital\b/i, /\bpharma\b/i] },
  { tag: "enterprise sales", patterns: [/\benterprise sales\b/i, /\baccount executive\b/i, /\baccount manager\b/i, /\bbusiness development\b/i] },
  // IMPORTANT: Keep tech tags strict. Generic words like "backend" / "frontend" should not auto-map
  // to "node backend" / "react frontend" because that causes false positives in Database search.
  { tag: "node backend", patterns: [/\bnode\.?js\b/i, /\bnode js\b/i, /\bexpress\.?js\b/i, /\bnest\.?js\b/i] },
  { tag: "react frontend", patterns: [/\breact\.?js\b/i, /\breact js\b/i, /\breact\b/i] }
];

function deriveInferredSearchTags({ cvResult = null, recruiterNotes = "", otherPointers = "", tags = [] } = {}) {
  const combinedText = [
    recruiterNotes,
    otherPointers,
    Array.isArray(tags) ? tags.join(" ") : "",
    cvResult && typeof cvResult === "object" ? JSON.stringify(cvResult) : ""
  ].filter(Boolean).join("\n");
  const inferred = new Set();
  for (const rule of INFERRED_SEARCH_TAG_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(combinedText))) inferred.add(rule.tag);
  }
  return Array.from(inferred);
}

function filterTechSearchTags(rawTags = [], evidenceText = "") {
  const tags = Array.isArray(rawTags) ? rawTags : [];
  if (!tags.length) return [];

  // NOTE: This intentionally ignores the tag text itself as evidence (otherwise a stored tag like
  // "react frontend" would keep itself forever). Only keep these tech tags when we see supporting
  // evidence in notes/CV metadata/screening answers.
  const hay = String(evidenceText || "");
  const keepNodeBackend = /\bnode\.?js\b|\bnode js\b|\bexpress\.?js\b|\bnest\.?js\b/i.test(hay);
  const keepReactFrontend = /\breact\.?js\b|\breact js\b|\breact\b/i.test(hay);

  return tags.filter((tag) => {
    const normalized = String(tag || "").trim().toLowerCase();
    if (normalized === "node backend") return keepNodeBackend;
    if (normalized === "react frontend") return keepReactFrontend;
    return true;
  });
}

function normalizeCandidateSearchDocText(value) {
  const base = normalizeDashboardText(value);
  if (!base) return "";
  // Keep punctuation but normalize common tech strings so boolean queries match reliably.
  return base
    .replace(/\basp\s*\.?\s*net\b/gi, "asp.net")
    // Keep both tokens so boolean phrases like ".net core" still match.
    .replace(/\b\.net\b/gi, "dotnet .net")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCuratedCvSearchText(cvResult = {}) {
  const safeCv = cvResult && typeof cvResult === "object" ? cvResult : {};
  if (!Object.keys(safeCv).length) return "";
  const TECH_TOKEN_RULES = [
    { token: "sql", patterns: [/\bsql\b/i, /\bmysql\b/i, /\bpostgres(?:ql)?\b/i, /\bms\s*sql\b/i, /\bsql\s*server\b/i, /\bpl\/sql\b/i] },
    { token: "azure", patterns: [/\bazure\b/i, /\baz[- ]?900\b/i, /\bpower\s*platform\b/i, /\bdynamics\s*365\b/i] },
    { token: "mongodb", patterns: [/\bmongodb\b/i, /\bmongo\b/i] },
    { token: "nodejs", patterns: [/\bnode\.?js\b/i, /\bnode js\b/i, /\bexpress\.?js\b/i, /\bnest\.?js\b/i] },
    { token: "react", patterns: [/\breact\.?js\b/i, /\breact js\b/i, /\breact\b/i] },
    { token: "java", patterns: [/\bjava\b/i, /\bspring\b/i, /\bspringboot\b/i, /\bspring boot\b/i] },
    { token: "python", patterns: [/\bpython\b/i, /\bdjango\b/i, /\bflask\b/i, /\bfastapi\b/i] },
    { token: "aws", patterns: [/\baws\b/i, /\bamazon web services\b/i, /\bec2\b/i, /\bs3\b/i, /\blambda\b/i] },
    { token: "gcp", patterns: [/\bgcp\b/i, /\bgoogle cloud\b/i, /\bbigquery\b/i] },
    { token: "docker", patterns: [/\bdocker\b/i, /\bkubernetes\b/i, /\bk8s\b/i] },
    { token: "salesforce", patterns: [/\bsalesforce\b/i, /\bcrm\b/i] }
  ];
  const denyKeyPattern = /(raw|full|content|text|resume|cv_text|ocr|markdown|html|body|blob)/i;
  const allowKeyPattern = /(skill|skills|tool|tools|tech|technology|stack|domain|industry|role|designation|title|company|employer|experience|education|degree|cert|certificate|qualification|location|city|state|summary|highlight|keyword|keywords|project|projects)/i;
  const chunks = [];
  const longTextForTokenScan = [];
  const walk = (value, keyPath = "") => {
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, keyPath));
      return;
    }
    if (typeof value === "object") {
      Object.entries(value).forEach(([key, nested]) => walk(nested, keyPath ? `${keyPath}.${key}` : key));
      return;
    }
    const raw = String(value || "").trim();
    if (!raw) return;
    const keyTail = String((keyPath || "").split(".").slice(-1)[0] || "");
    const keyFull = String(keyPath || "");
    // Keep long text only for token scanning (not direct indexing).
    if (raw.length > 180) {
      longTextForTokenScan.push(raw);
      return;
    }
    // Prevent full CV / OCR dumps from entering search doc.
    if ((denyKeyPattern.test(keyTail) || denyKeyPattern.test(keyFull)) && !allowKeyPattern.test(keyFull)) return;
    // Keep short/medium signals only.
    // Mostly textual signals; drop noisy numeric-only blobs.
    if (!/[A-Za-z]/.test(raw)) return;
    chunks.push(raw);
  };
  walk(safeCv, "");
  const tokenHaystack = longTextForTokenScan.join("\n");
  const extractedTechTokens = TECH_TOKEN_RULES
    .filter((rule) => rule.patterns.some((pattern) => pattern.test(tokenHaystack)))
    .map((rule) => rule.token);
  extractedTechTokens.forEach((token) => chunks.push(token));
  if (!chunks.length) return "";
  const unique = Array.from(new Set(chunks.map((item) => item.toLowerCase())));
  return unique.slice(0, 500).join(" ");
}

function deriveCandidateSearchDocV1FromParts({
  candidate = {},
  meta = {},
  draftPayload = {},
  screeningAnswers = {},
  cvResult = null,
  inferredSearchTags = []
} = {}) {
  const safeCandidate = candidate && typeof candidate === "object" ? candidate : {};
  const safeMeta = meta && typeof meta === "object" ? meta : {};
  const safeDraft = draftPayload && typeof draftPayload === "object" ? draftPayload : {};
  const safeScreening = screeningAnswers && typeof screeningAnswers === "object" ? screeningAnswers : {};
  const safeCv = cvResult && typeof cvResult === "object" ? cvResult : {};

  const metaScreening = normalizeJsonObjectInput(
    safeMeta?.jdScreeningAnswers
      || safeMeta?.jd_screening_answers
      || {}
  );
  const draftScreening = normalizeJsonObjectInput(
    safeDraft?.jdScreeningAnswers
      || safeDraft?.jd_screening_answers
      || {}
  );

  const chunks = [
    safeCandidate?.name || "",
    safeCandidate?.phone || "",
    safeCandidate?.email || "",
    safeCandidate?.linkedin || "",
    safeCandidate?.company || "",
    safeCandidate?.role || "",
    safeCandidate?.experience || "",
    safeCandidate?.location || "",
    safeCandidate?.client_name || safeCandidate?.clientName || "",
    safeCandidate?.jd_title || safeCandidate?.jdTitle || "",
    safeCandidate?.assigned_jd_title || safeCandidate?.assignedJdTitle || "",
    safeCandidate?.recruiter_name || safeCandidate?.recruiterName || "",
    safeCandidate?.assigned_to_name || safeCandidate?.assignedToName || "",
    safeCandidate?.notes || "",
    safeCandidate?.recruiter_context_notes || safeCandidate?.recruiterContextNotes || "",
    safeCandidate?.other_pointers || safeCandidate?.otherPointers || "",
    safeCandidate?.current_ctc || safeCandidate?.currentCtc || "",
    safeCandidate?.expected_ctc || safeCandidate?.expectedCtc || "",
    safeCandidate?.notice_period || safeCandidate?.noticePeriod || "",
    safeCandidate?.lwd_or_doj || safeCandidate?.lwdOrDoj || "",
    safeCandidate?.highest_education || safeCandidate?.highestEducation || "",
    Array.isArray(safeCandidate?.skills) ? safeCandidate.skills.join(" ") : "",
    Array.isArray(inferredSearchTags) ? inferredSearchTags.join(" ") : "",
    screeningAnswersToSearchText(safeScreening),
    screeningAnswersToSearchText(draftScreening),
    screeningAnswersToSearchText(metaScreening),
    buildCuratedCvSearchText(safeCv)
  ].filter(Boolean);

  // Keep a hard cap to avoid raw_note metadata blowups.
  const joined = chunks.join(" \n ");
  const capped = joined.length > 24000 ? joined.slice(0, 24000) : joined;
  return normalizeCandidateSearchDocText(capped);
}

function summarizeApplicantNotes(payload = {}) {
  const customFieldText = screeningAnswersToSearchText(payload?.customFields || {});
  return [
    payload?.sourcePlatform ? `Source: ${payload.sourcePlatform}` : "",
    payload?.jobPageUrl ? `Apply URL: ${payload.jobPageUrl}` : "",
    payload?.screeningAnswers ? `Screening: ${payload.screeningAnswers}` : "",
    customFieldText ? `Custom fields:\n${customFieldText}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function mergeApplicantCandidateFields(parsed = {}, normalized = {}, payload = {}) {
  const timeline = Array.isArray(normalized?.timeline) ? normalized.timeline : Array.isArray(parsed?.timeline) ? parsed.timeline : [];
  return {
    name: parsed?.candidateName || payload?.candidateName || payload?.name || "",
    company: normalized?.currentCompany || payload?.currentCompany || payload?.company || "",
    role: normalized?.currentDesignation || payload?.currentDesignation || payload?.role || payload?.jobTitle || "",
    experience: normalized?.totalExperience || parsed?.totalExperience || payload?.totalExperience || payload?.experience || "",
    skills: Array.isArray(payload?.skills) ? payload.skills : [],
    phone: normalized?.phoneNumber || payload?.phoneNumber || payload?.phone || "",
    email: normalized?.emailId || payload?.emailId || payload?.email || "",
    location: payload?.location || "",
    highest_education: normalized?.highestEducation || payload?.highestEducation || "",
    current_ctc: payload?.currentCtc || payload?.current_ctc || "",
    expected_ctc: payload?.expectedCtc || payload?.expected_ctc || "",
    notice_period: payload?.noticePeriod || payload?.notice_period || "",
    notes: summarizeApplicantNotes(payload),
    next_action: payload?.nextAction || "Review applicant",
    linkedin: normalized?.linkedinUrl || payload?.linkedinUrl || payload?.linkedin || "",
    timeline
  };
}

function normalizeApplicantBody(body = {}) {
  const input = body && typeof body === "object" ? body : {};
  return {
    companyId: String(input.companyId || input.company_id || "").trim(),
    clientName: String(input.clientName || input.client_name || "").trim(),
    jdTitle: String(input.jdTitle || input.jd_title || input.jobTitle || "").trim(),
    jobId: String(input.jobId || input.job_id || "").trim(),
    assignedToUserId: String(input.assignedToUserId || input.assigned_to_user_id || input.rid || input.r || "").trim(),
    assignedToSig: String(input.assignedToSig || input.assigned_to_sig || input.sig || input.s || "").trim(),
    sourcePlatform: String(input.sourcePlatform || input.source_platform || input.source || "website").trim(),
    sourceLabel: String(input.sourceLabel || input.source_label || "").trim(),
    jobPageUrl: String(input.jobPageUrl || input.job_page_url || input.applyUrl || "").trim(),
    candidateName: String(input.candidateName || input.name || "").trim(),
    currentCompany: String(input.currentCompany || input.company || "").trim(),
    currentDesignation: String(input.currentDesignation || input.role || "").trim(),
    totalExperience: String(input.totalExperience || input.experience || "").trim(),
    email: String(input.email || input.emailId || "").trim(),
    phone: String(input.phone || input.phoneNumber || "").trim(),
    location: String(input.location || "").trim(),
    currentCtc: String(input.currentCtc || input.current_ctc || "").trim(),
    expectedCtc: String(input.expectedCtc || input.expected_ctc || "").trim(),
    noticePeriod: String(input.noticePeriod || input.notice_period || "").trim(),
    linkedinUrl: String(input.linkedinUrl || input.linkedin || "").trim(),
    highestEducation: String(input.highestEducation || input.highest_education || "").trim(),
    screeningAnswers: String(input.screeningAnswers || input.screening_answers || "").trim(),
    customFields: normalizeJsonObjectInput(input.customFields || input.custom_fields || {}),
    recruiterName: String(input.recruiterName || input.recruiter_name || "Website Apply").trim(),
    file: input.file || null,
    parseWithAi: input.parseWithAi !== false,
    model: String(input.model || "").trim(),
    skills: Array.isArray(input.skills) ? input.skills : []
  };
}

function signRecruiterApplyLink({ companyId, jobId, recruiterId, secret }) {
  const scopedSecret = String(secret || "").trim();
  const scopedCompanyId = String(companyId || "").trim();
  const scopedJobId = String(jobId || "").trim();
  const scopedRecruiterId = String(recruiterId || "").trim();
  if (!scopedSecret || !scopedCompanyId || !scopedJobId || !scopedRecruiterId) return "";
  const message = `${scopedCompanyId}|${scopedJobId}|${scopedRecruiterId}`;
  return crypto.createHmac("sha256", scopedSecret).update(message).digest("base64url");
}

function verifyRecruiterApplyLinkSignature({ companyId, jobId, recruiterId, secret, signature }) {
  const expected = signRecruiterApplyLink({ companyId, jobId, recruiterId, secret });
  const provided = String(signature || "").trim();
  if (!expected || !provided) return false;
  // Allow truncated signatures for shorter URLs (prefix match).
  // Provided signature may be a prefix of the expected HMAC (base64url).
  if (provided.length > expected.length) return false;
  try {
    const expectedPrefix = expected.slice(0, provided.length);
    const expectedBuf = Buffer.from(expectedPrefix);
    const providedBuf = Buffer.from(provided);
    if (expectedBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  } catch {
    return false;
  }
}

function sanitizeApplicantCandidate(candidate = {}) {
  const meta = decodeApplicantMetadata(candidate);
  const draftPayload = normalizeJsonObjectInput(candidate?.draft_payload || candidate?.draftPayload);
  const normalizedCurrentOrgTenure = String(
    draftPayload?.currentOrgTenure
    || draftPayload?.current_org_tenure
    || candidate?.current_org_tenure
    || candidate?.currentOrgTenure
    || ""
  ).trim();
  return {
    id: String(candidate?.id || "").trim(),
    candidateName: String(candidate?.name || "").trim(),
    role: String(candidate?.role || "").trim(),
    currentCompany: String(candidate?.company || "").trim(),
    totalExperience: String(candidate?.experience || "").trim(),
    location: String(candidate?.location || "").trim(),
    email: String(candidate?.email || "").trim(),
    phone: String(candidate?.phone || "").trim(),
    clientName: String(candidate?.client_name || "").trim(),
    jdTitle: String(candidate?.jd_title || candidate?.assigned_jd_title || "").trim(),
    recruiterName: String(candidate?.recruiter_name || "").trim(),
    assignedToName: String(candidate?.assigned_to_name || "").trim(),
    assignedToUserId: String(candidate?.assigned_to_user_id || "").trim(),
    assignedByName: String(candidate?.assigned_by_name || "").trim(),
    assignedByUserId: String(candidate?.assigned_by_user_id || "").trim(),
    parseStatus: String(meta.parseStatus || "").trim(),
    cvUrl: String(meta.fileUrl || "").trim(),
    cvFilename: String(meta.filename || "").trim(),
    sourcePlatform: String(meta.sourcePlatform || "").trim(),
    sourceLabel: String(meta.sourceLabel || "").trim(),
    jobPageUrl: String(meta.jobPageUrl || "").trim(),
    screeningAnswers: String(meta.screeningAnswers || "").trim(),
    currentOrgTenure: normalizedCurrentOrgTenure,
    current_org_tenure: normalizedCurrentOrgTenure,
    draft_payload: draftPayload,
    createdAt: String(candidate?.created_at || "").trim(),
    updatedAt: String(candidate?.updated_at || "").trim(),
    usedInAssessment: Boolean(candidate?.used_in_assessment),
    applicantState: String(meta.applicantState || "").trim() || (candidate?.used_in_assessment ? "converted" : "new")
  };
}

function normalizeApplicantFilterOptions(raw = {}) {
  const toList = (value) => {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    const text = String(value || "").trim();
    if (!text) return [];
    return text.split(",").map((item) => String(item || "").trim()).filter(Boolean);
  };
  return {
    q: String(raw?.q || "").trim(),
    dateFrom: String(raw?.dateFrom || "").trim(),
    dateTo: String(raw?.dateTo || "").trim(),
    clients: toList(raw?.clients),
    jds: toList(raw?.jds),
    locations: toList(raw?.locations),
    ownedBy: toList(raw?.ownedBy),
    assignedTo: toList(raw?.assignedTo),
    jdIds: toList(raw?.jdIds),
    activeStates: toList(raw?.activeStates)
  };
}

function normalizeJdMatchKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesJdFilterValue(candidateValue = "", selectedValues = []) {
  const candidateKey = normalizeJdMatchKey(candidateValue);
  if (!candidateKey) return false;
  return (Array.isArray(selectedValues) ? selectedValues : []).some((value) => {
    const filterKey = normalizeJdMatchKey(value);
    if (!filterKey) return false;
    return candidateKey === filterKey || candidateKey.includes(filterKey) || filterKey.includes(candidateKey);
  });
}

function buildJdFilterQueryClause(selectedValues = [], fieldName = "jd_title") {
  const values = Array.isArray(selectedValues)
    ? Array.from(new Set(selectedValues.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];
  const parts = [];
  values.forEach((value) => {
    const clean = String(value || "").replace(/[%*]/g, "").trim();
    if (!clean) return;
    const like = `*${clean.replace(/,/g, " ")}*`;
    parts.push(`${fieldName}.eq.${encodeURIComponent(value)}`);
    parts.push(`${fieldName}.ilike.${encodeURIComponent(like)}`);
  });
  return parts.length ? `or=(${parts.join(",")})` : "";
}

function buildJobIdFilterQueryClause(selectedValues = [], fieldNames = ["assigned_jd_id", "jd_id", "job_id", "jobId"]) {
  const ids = Array.isArray(selectedValues)
    ? Array.from(new Set(selectedValues.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];
  if (!ids.length) return "";
  const idClause = ids.map((item) => encodeURIComponent(item)).join(",");
  const parts = (Array.isArray(fieldNames) ? fieldNames : []).map((fieldName) => `${fieldName}.in.(${idClause})`);
  return parts.length ? `or=(${parts.join(",")})` : "";
}

function matchesJobIdFilterValue(candidateValue = "", selectedValues = []) {
  const candidateKey = String(candidateValue || "").trim();
  if (!candidateKey) return false;
  return (Array.isArray(selectedValues) ? selectedValues : []).some((value) => String(value || "").trim() === candidateKey);
}

function matchApplicantState(candidate = {}, activeStates = []) {
  if (!Array.isArray(activeStates) || !activeStates.length) return true;
  const isConverted = Boolean(candidate?.used_in_assessment) || Boolean(String(candidate?.assessment_id || candidate?.assessmentId || "").trim());
  const isHidden = Boolean(candidate?.hidden_from_captured);
  const state = isHidden ? "Inactive" : (isConverted ? "Converted" : "Active");
  return activeStates.includes(state) || (state === "Converted" && activeStates.includes("Converted"));
}

function applyApplicantFiltersLocal(row = {}, filters = {}, includeConverted = true) {
  const source = String(row?.source || "").trim().toLowerCase();
  if (!["website_apply", "hosted_apply", "google_sheet"].includes(source)) return false;
  const isConverted = Boolean(row?.used_in_assessment) || Boolean(String(row?.assessment_id || row?.assessmentId || "").trim());
  if (!includeConverted && isConverted) return false;
  if (!matchApplicantState(row, filters.activeStates || [])) return false;
  const createdAt = String(row?.created_at || "").slice(0, 10);
  if (filters.dateFrom && createdAt && createdAt < filters.dateFrom) return false;
  if (filters.dateTo && createdAt && createdAt > filters.dateTo) return false;
  if (filters.clients?.length) {
    const value = String(row?.client_name || "Unassigned").trim();
    if (!filters.clients.includes(value)) return false;
  }
  if (filters.jds?.length) {
    const value = String(row?.jd_title || row?.assigned_jd_title || "").trim();
    if (!matchesJdFilterValue(value, filters.jds)) return false;
  }
  if (filters.jdIds?.length) {
    const candidateIds = [
      row?.assigned_jd_id,
      row?.assignedJdId,
      row?.jd_id,
      row?.jdId,
      row?.job_id,
      row?.jobId
    ].map((item) => String(item || "").trim()).filter(Boolean);
    if (!candidateIds.some((id) => matchesJobIdFilterValue(id, filters.jdIds))) return false;
  }
  if (filters.locations?.length) {
    const value = String(row?.location || "").trim();
    if (!filters.locations.includes(value)) return false;
  }
  if (filters.ownedBy?.length) {
    const value = String(row?.assigned_to_name || row?.assignedToName || row?.recruiter_name || "").trim();
    if (!filters.ownedBy.includes(value)) return false;
  }
  if (filters.assignedTo?.length) {
    const value = String(row?.assigned_to_name || row?.assignedToName || "").trim();
    if (!filters.assignedTo.includes(value)) return false;
  }
  if (filters.q) {
    const hay = [
      row?.name,
      row?.email,
      row?.phone,
      row?.company,
      row?.role,
      row?.location,
      row?.client_name,
      row?.jd_title
    ].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(String(filters.q || "").toLowerCase())) return false;
  }
  return true;
}

async function listApplicantsForUser(user, options = {}) {
  const limit = Math.max(1, Math.min(1000, Number(options.limit || 50)));
  const page = Math.max(1, Number(options.page || 1));
  const offset = Math.max(0, (page - 1) * limit);
  const filters = normalizeApplicantFilterOptions(options.filters || { q: options.q });
  const q = String(filters.q || "").trim();
  const includeConverted = options.includeConverted === true;
  const { on, url, key } = getSupabaseServiceConfig();
  const companyId = String(user?.companyId || "").trim();
  const actorId = String(user?.id || "").trim();
  const actorIsAdmin = String(user?.role || "").toLowerCase() === "admin";
  const sources = ["website_apply", "hosted_apply", "google_sheet"];

  if (on && companyId) {
    const baseFilterParts = [
      "select=*",
      `company_id=eq.${encodeURIComponent(companyId)}`,
      `source=in.(${sources.map((item) => encodeURIComponent(item)).join(",")})`
    ];
    if (!actorIsAdmin && actorId) {
      baseFilterParts.push(`or=(recruiter_id.eq.${encodeURIComponent(actorId)},assigned_to_user_id.eq.${encodeURIComponent(actorId)})`);
    }
    if (q) {
      const escaped = q.replace(/[%*]/g, "").trim();
      if (escaped) {
        const like = `*${escaped.replace(/,/g, " ")}*`;
        baseFilterParts.push(`or=(name.ilike.${encodeURIComponent(like)},email.ilike.${encodeURIComponent(like)},phone.ilike.${encodeURIComponent(like)},company.ilike.${encodeURIComponent(like)},role.ilike.${encodeURIComponent(like)},location.ilike.${encodeURIComponent(like)},client_name.ilike.${encodeURIComponent(like)},jd_title.ilike.${encodeURIComponent(like)})`);
      }
    }
    if (filters.dateFrom) baseFilterParts.push(`created_at=gte.${encodeURIComponent(`${filters.dateFrom}T00:00:00.000Z`)}`);
    if (filters.dateTo) baseFilterParts.push(`created_at=lte.${encodeURIComponent(`${filters.dateTo}T23:59:59.999Z`)}`);
    if (filters.clients.length) baseFilterParts.push(`client_name=in.(${filters.clients.map((item) => encodeURIComponent(item)).join(",")})`);
    if (filters.jdIds.length) {
      const jobIdClause = buildJobIdFilterQueryClause(filters.jdIds, ["assigned_jd_id", "jd_id", "job_id"]);
      if (jobIdClause) baseFilterParts.push(jobIdClause);
    } else if (filters.jds.length) {
      const jdClause = buildJdFilterQueryClause(filters.jds, "jd_title");
      if (jdClause) baseFilterParts.push(jdClause);
    }
    if (filters.locations.length) baseFilterParts.push(`location=in.(${filters.locations.map((item) => encodeURIComponent(item)).join(",")})`);
    if (filters.assignedTo.length) baseFilterParts.push(`assigned_to_name=in.(${filters.assignedTo.map((item) => encodeURIComponent(item)).join(",")})`);
    const selectedStates = Array.isArray(filters.activeStates)
      ? Array.from(new Set(filters.activeStates.map((item) => String(item || "").trim()).filter(Boolean)))
      : [];
    if (selectedStates.length === 1) {
      const only = selectedStates[0];
      if (only === "Active") {
        baseFilterParts.push("hidden_from_captured=not.is.true");
        baseFilterParts.push("used_in_assessment=not.is.true");
        baseFilterParts.push("assessment_id=is.null");
      } else if (only === "Inactive") {
        baseFilterParts.push("hidden_from_captured=is.true");
      } else if (only === "Converted") {
        baseFilterParts.push("hidden_from_captured=not.is.true");
        baseFilterParts.push("or=(used_in_assessment.is.true,assessment_id.not.is.null)");
      }
    } else if (selectedStates.length === 2 && selectedStates.includes("Active") && selectedStates.includes("Inactive")) {
      baseFilterParts.push("used_in_assessment=not.is.true");
      baseFilterParts.push("assessment_id=is.null");
    } else if (selectedStates.length >= 3) {
      // All states are selected; keep the full captured universe except converted rows stay counter-only.
      baseFilterParts.push("used_in_assessment=not.is.true");
      baseFilterParts.push("assessment_id=is.null");
    }
    if (!includeConverted) {
      baseFilterParts.push("used_in_assessment=not.is.true");
      baseFilterParts.push("assessment_id=is.null");
    }
    const listQueryParts = [
      ...baseFilterParts,
      "order=created_at.desc",
      `limit=${limit}`,
      `offset=${offset}`
    ];
    const response = await fetch(`${url}/rest/v1/candidates?${listQueryParts.join("&")}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Applied candidates read failed: ${response.status} ${errorText}`);
    }
    const rows = await response.json();
    const countFilterParts = baseFilterParts.filter((part) => !String(part || "").startsWith("select="));
    const countResponse = await fetch(`${url}/rest/v1/candidates?select=id&${countFilterParts.join("&")}&limit=1`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "count=exact"
      }
    });
    let total = 0;
    if (countResponse.ok) {
      const contentRange = String(countResponse.headers.get("content-range") || "");
      const totalPart = contentRange.split("/")[1] || "";
      total = Math.max(0, Number(totalPart || 0));
    }
    const items = (Array.isArray(rows) ? rows : []).map(sanitizeApplicantCandidate);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return { items, total, page, limit, totalPages };
  }

  // Local fallback (non-supabase): keep legacy behavior.
  const rows = await listCandidatesForUser(user, {
    limit: Math.max(500, limit * Math.max(1, page)),
    q
  });
  const filtered = rows.filter((candidate) => applyApplicantFiltersLocal(candidate, filters, includeConverted));
  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit).map(sanitizeApplicantCandidate);
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return { items, total, page, limit, totalPages };
}

async function getApplicantStatsForUser(user, options = {}) {
  const filters = normalizeApplicantFilterOptions(options.filters || { q: options.q });
  const q = String(filters.q || "").trim();
  const { on, url, key } = getSupabaseServiceConfig();
  const companyId = String(user?.companyId || "").trim();
  const actorId = String(user?.id || "").trim();
  const actorIsAdmin = String(user?.role || "").toLowerCase() === "admin";
  const sources = ["website_apply", "hosted_apply", "google_sheet"];
  const todayKey = new Date().toISOString().slice(0, 10);

  const buildBaseQueryParts = () => {
    const parts = [
      `company_id=eq.${encodeURIComponent(companyId)}`,
      `source=in.(${sources.map((item) => encodeURIComponent(item)).join(",")})`
    ];
    if (!actorIsAdmin && actorId) {
      parts.push(`or=(recruiter_id.eq.${encodeURIComponent(actorId)},assigned_to_user_id.eq.${encodeURIComponent(actorId)})`);
    }
    if (q) {
      const escaped = q.replace(/[%*]/g, "").trim();
      if (escaped) {
        const like = `*${escaped.replace(/,/g, " ")}*`;
        parts.push(`or=(name.ilike.${encodeURIComponent(like)},email.ilike.${encodeURIComponent(like)},phone.ilike.${encodeURIComponent(like)},company.ilike.${encodeURIComponent(like)},role.ilike.${encodeURIComponent(like)},location.ilike.${encodeURIComponent(like)},client_name.ilike.${encodeURIComponent(like)},jd_title.ilike.${encodeURIComponent(like)})`);
      }
    }
    if (filters.dateFrom) parts.push(`created_at=gte.${encodeURIComponent(`${filters.dateFrom}T00:00:00.000Z`)}`);
    if (filters.dateTo) parts.push(`created_at=lte.${encodeURIComponent(`${filters.dateTo}T23:59:59.999Z`)}`);
    if (filters.clients.length) parts.push(`client_name=in.(${filters.clients.map((item) => encodeURIComponent(item)).join(",")})`);
    if (filters.jdIds.length) {
      const jobIdClause = buildJobIdFilterQueryClause(filters.jdIds, ["assigned_jd_id", "jd_id", "job_id"]);
      if (jobIdClause) parts.push(jobIdClause);
    } else if (filters.jds.length) {
      const jdClause = buildJdFilterQueryClause(filters.jds, "jd_title");
      if (jdClause) parts.push(jdClause);
    }
    if (filters.locations.length) parts.push(`location=in.(${filters.locations.map((item) => encodeURIComponent(item)).join(",")})`);
    if (filters.assignedTo.length) parts.push(`assigned_to_name=in.(${filters.assignedTo.map((item) => encodeURIComponent(item)).join(",")})`);
    return parts;
  };

  const fetchStatRows = async () => {
    if (!(on && companyId)) return [];
    const query = [
      "select=id,source,created_at,hidden_from_captured,used_in_assessment,assessment_id,name,email,phone,company,role,location,client_name,jd_title,assigned_to_name,recruiter_name",
      ...buildBaseQueryParts(),
      "limit=5000"
    ].join("&");
    const response = await fetch(`${url}/rest/v1/candidates?${query}`, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`
      }
    });
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
  };

  if (on && companyId) {
    const rows = await fetchStatRows();
    const pool = rows.filter((item) => applyApplicantFiltersLocal(item, filters, true));
    const converted = pool.filter((item) => (Boolean(item?.used_in_assessment) || Boolean(String(item?.assessment_id || item?.assessmentId || "").trim())) && item?.hidden_from_captured !== true).length;
    const inactive = pool.filter((item) => item?.hidden_from_captured === true).length;
    const total = pool.length;
    const active = Math.max(0, total - converted - inactive);
    const today = pool.filter((item) => String(item?.created_at || "").slice(0, 10) === todayKey).length;
    return { today, total, active, inactive, converted };
  }

  // Local fallback.
  const fallbackRows = await listCandidatesForUser(user, { limit: 5000, q });
  const pool = (Array.isArray(fallbackRows) ? fallbackRows : []).filter((item) => applyApplicantFiltersLocal(item, filters, true));
  const converted = pool.filter((item) => (Boolean(item?.used_in_assessment) || Boolean(String(item?.assessment_id || item?.assessmentId || "").trim())) && !Boolean(item?.hidden_from_captured)).length;
  const inactive = pool.filter((item) => Boolean(item?.hidden_from_captured)).length;
  const total = pool.length;
  const active = Math.max(0, total - converted - inactive);
  const today = pool.filter((item) => String(item?.created_at || "").slice(0, 10) === todayKey).length;
  return { today, total, active, inactive, converted };
}

function normalizeCapturedFilterOptions(raw = {}) {
  const toList = (value) => {
    if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
    const text = String(value || "").trim();
    if (!text) return [];
    return text.split(",").map((item) => String(item || "").trim()).filter(Boolean);
  };
  return {
    q: String(raw?.q || "").trim(),
    view: String(raw?.view || "all").trim() || "all",
    dateFrom: String(raw?.dateFrom || "").trim(),
    dateTo: String(raw?.dateTo || "").trim(),
    clients: toList(raw?.clients),
    jds: toList(raw?.jds),
    assignedTo: toList(raw?.assignedTo),
    capturedBy: toList(raw?.capturedBy),
    sources: toList(raw?.sources),
    outcomes: toList(raw?.outcomes),
    jdIds: toList(raw?.jdIds),
    activeStates: toList(raw?.activeStates)
  };
}

function isCapturedCandidateRow(row = {}) {
  const source = String(row?.source || "").trim().toLowerCase();
  return !["website_apply", "hosted_apply", "google_sheet"].includes(source);
}

function applyCapturedFiltersLocal(row = {}, filters = {}, user = null) {
  if (!isCapturedCandidateRow(row)) return false;
  const isConverted = Boolean(row?.used_in_assessment) || Boolean(String(row?.assessment_id || row?.assessmentId || "").trim());
  const isHidden = row?.hidden_from_captured === true;
  const state = isHidden ? "Inactive" : (isConverted ? "Converted" : "Active");
  const activeStates = Array.isArray(filters?.activeStates) ? filters.activeStates : [];
  if (activeStates.length) {
    if (!activeStates.includes(state)) return false;
  } else if (state !== "Active") {
    return false;
  }
  const createdAt = String(row?.created_at || row?.createdAt || "").slice(0, 10);
  if (filters?.dateFrom && createdAt && createdAt < filters.dateFrom) return false;
  if (filters?.dateTo && createdAt && createdAt > filters.dateTo) return false;
  if (filters?.clients?.length) {
    const value = String(row?.client_name || "Unassigned").trim();
    if (!filters.clients.includes(value)) return false;
  }
  if (filters?.jds?.length) {
    const value = String(row?.jd_title || row?.assigned_jd_title || "").trim();
    if (!matchesJdFilterValue(value, filters.jds)) return false;
  }
  if (filters?.jdIds?.length) {
    const candidateIds = [
      row?.assigned_jd_id,
      row?.assignedJdId,
      row?.jd_id,
      row?.jdId,
      row?.job_id,
      row?.jobId
    ].map((item) => String(item || "").trim()).filter(Boolean);
    if (!candidateIds.some((id) => matchesJobIdFilterValue(id, filters.jdIds))) return false;
  }
  if (filters?.assignedTo?.length) {
    const value = String(row?.assigned_to_name || "Unassigned").trim();
    if (!filters.assignedTo.includes(value)) return false;
  }
  if (filters?.capturedBy?.length) {
    const value = String(row?.recruiter_name || row?.assigned_by_name || "Unknown").trim();
    if (!filters.capturedBy.includes(value)) return false;
  }
  if (filters?.sources?.length) {
    const value = String(row?.source || "").trim();
    if (!filters.sources.includes(value)) return false;
  }
  if (filters?.outcomes?.length) {
    const value = String(row?.last_contact_outcome || "").trim() || "No outcome";
    if (!filters.outcomes.includes(value)) return false;
  }
  if (filters?.q) {
    const q = String(filters.q || "").toLowerCase();
    const hay = [
      row?.name,
      row?.company,
      row?.role,
      row?.jd_title,
      row?.client_name,
      row?.assigned_to_name,
      row?.recruiter_name,
      row?.source,
      row?.phone,
      row?.email,
      row?.notes,
      row?.recruiter_context_notes,
      row?.other_pointers
    ].filter(Boolean).join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const view = String(filters?.view || "all").trim();
  if (view !== "all" && user) {
    const currentUserId = String(user?.id || "").trim();
    const currentUserName = String(user?.name || "").trim().toLowerCase();
    const capturedId = String(row?.recruiter_id || "").trim();
    const capturedName = String(row?.recruiter_name || "").trim().toLowerCase();
    const assignedId = String(row?.assigned_to_user_id || "").trim();
    const assignedName = String(row?.assigned_to_name || "").trim().toLowerCase();
    const firstAssignedToId = String(row?.first_assigned_to_user_id || "").trim();
    if (view === "added_by_me") {
      const byId = currentUserId && capturedId && capturedId === currentUserId;
      const byName = currentUserName && capturedName && capturedName === currentUserName;
      if (!byId && !byName) return false;
    } else if (view === "assigned_to_me") {
      const toMe = (currentUserId && assignedId === currentUserId) || (currentUserName && assignedName === currentUserName);
      const firstToMe = (currentUserId && firstAssignedToId === currentUserId) || false;
      if (!toMe || !firstToMe) return false;
    } else if (view === "reassigned_to_me") {
      const toMe = (currentUserId && assignedId === currentUserId) || (currentUserName && assignedName === currentUserName);
      const firstToMe = (currentUserId && firstAssignedToId === currentUserId) || false;
      if (!toMe || firstToMe) return false;
    }
  }
  return true;
}

async function listCapturedForUser(user, options = {}) {
  const limit = Math.max(1, Math.min(200, Number(options.limit || 25)));
  const page = Math.max(1, Number(options.page || 1));
  const offset = Math.max(0, (page - 1) * limit);
  const filters = normalizeCapturedFilterOptions(options.filters || {});
  const { on, url, key } = getSupabaseServiceConfig();
  const companyId = String(user?.companyId || "").trim();
  const actorId = String(user?.id || "").trim();
  const actorName = String(user?.name || "").trim();
  const actorIsAdmin = String(user?.role || "").toLowerCase() === "admin";

  if (on && companyId) {
    const baseFilterParts = [
      "select=*",
      `company_id=eq.${encodeURIComponent(companyId)}`,
      "or=(source.is.null,source.not.in.(website_apply,hosted_apply,google_sheet))"
    ];
    if (!actorIsAdmin) {
      if (actorId) {
        baseFilterParts.push(`or=(recruiter_id.eq.${encodeURIComponent(actorId)},assigned_to_user_id.eq.${encodeURIComponent(actorId)})`);
      } else if (actorName) {
        baseFilterParts.push(`or=(recruiter_name.eq.${encodeURIComponent(actorName)},assigned_to_name.eq.${encodeURIComponent(actorName)})`);
      }
    }
    if (filters.dateFrom) baseFilterParts.push(`created_at=gte.${encodeURIComponent(`${filters.dateFrom}T00:00:00.000Z`)}`);
    if (filters.dateTo) baseFilterParts.push(`created_at=lte.${encodeURIComponent(`${filters.dateTo}T23:59:59.999Z`)}`);
    if (filters.clients.length) baseFilterParts.push(`client_name=in.(${filters.clients.map((item) => encodeURIComponent(item)).join(",")})`);
    if (filters.jdIds.length) {
      const jobIdClause = buildJobIdFilterQueryClause(filters.jdIds, ["assigned_jd_id", "jd_id", "job_id"]);
      if (jobIdClause) baseFilterParts.push(jobIdClause);
    } else if (filters.jds.length) {
      const jdClause = buildJdFilterQueryClause(filters.jds, "jd_title");
      if (jdClause) baseFilterParts.push(jdClause);
    }
    if (filters.assignedTo.length) baseFilterParts.push(`assigned_to_name=in.(${filters.assignedTo.map((item) => encodeURIComponent(item)).join(",")})`);
    if (filters.capturedBy.length) baseFilterParts.push(`recruiter_name=in.(${filters.capturedBy.map((item) => encodeURIComponent(item)).join(",")})`);
    if (filters.sources.length) baseFilterParts.push(`source=in.(${filters.sources.map((item) => encodeURIComponent(item)).join(",")})`);
    if (filters.activeStates.length === 1) {
      const only = String(filters.activeStates[0] || "").trim();
      if (only === "Active") {
        baseFilterParts.push("hidden_from_captured=not.is.true");
        baseFilterParts.push("used_in_assessment=not.is.true");
        baseFilterParts.push("assessment_id=is.null");
      } else if (only === "Inactive") {
        baseFilterParts.push("hidden_from_captured=is.true");
      } else if (only === "Converted") {
        baseFilterParts.push("hidden_from_captured=not.is.true");
        baseFilterParts.push("or=(used_in_assessment.is.true,assessment_id.not.is.null)");
      }
    } else if (filters.activeStates.length === 2 && filters.activeStates.includes("Active") && filters.activeStates.includes("Inactive")) {
      baseFilterParts.push("used_in_assessment=not.is.true");
      baseFilterParts.push("assessment_id=is.null");
    } else if (!filters.activeStates.length) {
      // Captured default behavior: active-only when no state selected.
      baseFilterParts.push("hidden_from_captured=not.is.true");
      baseFilterParts.push("used_in_assessment=not.is.true");
      baseFilterParts.push("assessment_id=is.null");
    }
    if (filters.view === "added_by_me") {
      if (actorId) baseFilterParts.push(`recruiter_id=eq.${encodeURIComponent(actorId)}`);
      else if (actorName) baseFilterParts.push(`recruiter_name=eq.${encodeURIComponent(actorName)}`);
    } else if (filters.view === "assigned_to_me") {
      if (actorId) {
        baseFilterParts.push(`assigned_to_user_id=eq.${encodeURIComponent(actorId)}`);
        baseFilterParts.push(`first_assigned_to_user_id=eq.${encodeURIComponent(actorId)}`);
      } else if (actorName) {
        baseFilterParts.push(`assigned_to_name=eq.${encodeURIComponent(actorName)}`);
        baseFilterParts.push(`first_assigned_to_name=eq.${encodeURIComponent(actorName)}`);
      }
    } else if (filters.view === "reassigned_to_me") {
      if (actorId) {
        baseFilterParts.push(`assigned_to_user_id=eq.${encodeURIComponent(actorId)}`);
        baseFilterParts.push(`first_assigned_to_user_id=not.eq.${encodeURIComponent(actorId)}`);
      } else if (actorName) {
        baseFilterParts.push(`assigned_to_name=eq.${encodeURIComponent(actorName)}`);
        baseFilterParts.push(`first_assigned_to_name=not.eq.${encodeURIComponent(actorName)}`);
      }
    }
    if (filters.q) {
      const escaped = filters.q.replace(/[%*]/g, "").trim();
      if (escaped) {
        const like = `*${escaped.replace(/,/g, " ")}*`;
        baseFilterParts.push(`or=(name.ilike.${encodeURIComponent(like)},email.ilike.${encodeURIComponent(like)},phone.ilike.${encodeURIComponent(like)},company.ilike.${encodeURIComponent(like)},role.ilike.${encodeURIComponent(like)},client_name.ilike.${encodeURIComponent(like)},jd_title.ilike.${encodeURIComponent(like)})`);
      }
    }
    const listQueryParts = [...baseFilterParts, "order=updated_at.desc", `limit=${limit}`, `offset=${offset}`];
    const response = await fetch(`${url}/rest/v1/candidates?${listQueryParts.join("&")}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Captured list read failed: ${response.status} ${errorText}`);
    }
    const rows = await response.json();
    const countFilterParts = baseFilterParts.filter((part) => !String(part || "").startsWith("select="));
    const countResponse = await fetch(`${url}/rest/v1/candidates?select=id&${countFilterParts.join("&")}&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" }
    });
    let total = Array.isArray(rows) ? rows.length : 0;
    if (countResponse.ok) {
      const contentRange = String(countResponse.headers.get("content-range") || "");
      const totalPart = contentRange.split("/")[1] || "";
      total = Math.max(0, Number(totalPart || 0));
    }
    return { items: Array.isArray(rows) ? rows : [], total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }

  const fallbackRows = await listCandidatesForUser(user, { limit: 5000, q: filters.q });
  const filtered = (Array.isArray(fallbackRows) ? fallbackRows : []).filter((row) => applyCapturedFiltersLocal(row, filters, user));
  const items = filtered.slice(offset, offset + limit);
  const total = filtered.length;
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function getCapturedStatsForUser(user, options = {}) {
  const filters = normalizeCapturedFilterOptions(options.filters || {});
  // Tiny re-read by count queries (no full list scan).
  const [active, inactive, converted, todayAll] = await Promise.all([
    listCapturedForUser(user, { limit: 1, page: 1, filters: { ...filters, activeStates: ["Active"] } }),
    listCapturedForUser(user, { limit: 1, page: 1, filters: { ...filters, activeStates: ["Inactive"] } }),
    listCapturedForUser(user, { limit: 1, page: 1, filters: { ...filters, activeStates: ["Converted"] } }),
    listCapturedForUser(user, {
      limit: 1,
      page: 1,
      filters: {
        ...filters,
        activeStates: ["Active", "Inactive", "Converted"],
        dateFrom: new Date().toISOString().slice(0, 10),
        dateTo: new Date().toISOString().slice(0, 10)
      }
    })
  ]);
  const activeCount = Number(active?.total || 0);
  const inactiveCount = Number(inactive?.total || 0);
  const convertedCount = Number(converted?.total || 0);
  const totalCount = activeCount + inactiveCount + convertedCount;
  return {
    today: Number(todayAll?.total || 0),
    total: totalCount,
    active: activeCount,
    inactive: inactiveCount,
    converted: convertedCount
  };
}

function getSupabaseServiceConfig() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { on: Boolean(url && key), url, key };
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

function normalizeAssessmentFilterOptions(raw = {}) {
  const toList = (value) => {
    if (Array.isArray(value)) {
      return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
    }
    const text = String(value || "").trim();
    if (!text) return [];
    return Array.from(new Set(text.split(",").map((item) => String(item || "").trim()).filter(Boolean)));
  };
  return {
    q: String(raw?.q || "").trim(),
    dateFrom: String(raw?.dateFrom || "").trim(),
    dateTo: String(raw?.dateTo || "").trim(),
    clients: toList(raw?.clients),
    jds: toList(raw?.jds),
    jdIds: toList(raw?.jdIds),
    recruiters: toList(raw?.recruiters),
    outcomes: toList(raw?.outcomes),
    lane: String(raw?.lane || "active").trim() || "active"
  };
}

function isAssessmentArchivedLocal(item = {}) {
  const archivedFlag = item?.archived ?? item?.isArchived ?? item?.archived_flag;
  if (archivedFlag === true) return true;
  const archivedAt = String(item?.archivedAt || item?.archived_at || "").trim();
  return Boolean(archivedAt);
}

function getAssessmentFilterFieldValues(item = {}) {
  const clientValue = String(item?.clientName || item?.client_name || "").trim() || "Unassigned";
  const jdValue = String(item?.jdTitle || item?.jd_title || "").trim() || "Unassigned";
  const recruiterValue = String(item?.assigned_to_name || item?.assignedToName || "").trim() || "Unassigned";
  const outcomeValue = normalizeAssessmentStatusLabel(item?.candidateStatus || item?.candidate_status || "") || "No outcome";
  const createdKey = String(item?.generatedAt || item?.createdAt || item?.created_at || item?.updatedAt || item?.updated_at || "").slice(0, 10);
  const hay = [
    item?.candidateName,
    item?.phoneNumber,
    item?.emailId,
    jdValue,
    clientValue,
    recruiterValue
  ].join(" ").toLowerCase();
  return { clientValue, jdValue, recruiterValue, outcomeValue, createdKey, hay };
}

async function hydrateAssessmentsWithCandidateAssignees(rows = [], companyId = "") {
  const items = Array.isArray(rows) ? rows : [];
  const safeCompanyId = String(companyId || "").trim();
  if (!items.length || !safeCompanyId) return items;
  const candidateIds = Array.from(new Set(items.map((row) => String(row?.candidateId || row?.candidate_id || row?.payload?.candidateId || row?.payload?.candidate_id || "").trim()).filter(Boolean)));
  if (!candidateIds.length) return items;
  const { on, url, key } = getSupabaseServiceConfig();
  if (!(on && url && key)) return items;
  const candidateRows = await fetch(`${url}/rest/v1/candidates?select=id,assigned_to_name,assigned_to_user_id,name&company_id=eq.${encodeURIComponent(safeCompanyId)}&id=in.(${candidateIds.map((id) => encodeURIComponent(id)).join(",")})&limit=5000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  }).then(async (response) => (response.ok ? response.json() : [])).catch(() => []);
  const byId = new Map((Array.isArray(candidateRows) ? candidateRows : []).map((candidate) => [String(candidate?.id || "").trim(), candidate]));
  return items.map((item) => {
    const candidateId = String(item?.candidateId || item?.candidate_id || item?.payload?.candidateId || item?.payload?.candidate_id || "").trim();
    if (!candidateId) return item;
    const candidate = byId.get(candidateId) || null;
    if (!candidate) return item;
    const assignedToName = String(candidate?.assigned_to_name || "").trim();
    const assignedToUserId = String(candidate?.assigned_to_user_id || "").trim();
    return {
      ...item,
      assigned_to_name: assignedToName || item?.assigned_to_name || item?.recruiter_name || "",
      assignedToName: assignedToName || item?.assignedToName || item?.recruiter_name || "",
      assigned_to_user_id: assignedToUserId || item?.assigned_to_user_id || item?.assignedToUserId || "",
      assignedToUserId: assignedToUserId || item?.assignedToUserId || item?.assigned_to_user_id || "",
      recruiter_name: assignedToName || item?.recruiter_name || "",
      recruiterName: assignedToName || item?.recruiterName || ""
    };
  });
}

async function resolveAssessmentCandidateIdsForAssignees(companyId, recruiters = []) {
  const safeCompanyId = String(companyId || "").trim();
  const names = Array.isArray(recruiters) ? recruiters.map((item) => String(item || "").trim()).filter(Boolean) : [];
  if (!safeCompanyId || !names.length) return [];
  const { on, url, key } = getSupabaseServiceConfig();
  if (!(on && url && key)) return [];
  const candidateRows = await fetch(`${url}/rest/v1/candidates?select=id,assigned_to_name&company_id=eq.${encodeURIComponent(safeCompanyId)}&assigned_to_name=in.(${names.map((name) => encodeURIComponent(name)).join(",")})&limit=5000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  }).then(async (response) => (response.ok ? response.json() : [])).catch(() => []);
  return Array.from(new Set((Array.isArray(candidateRows) ? candidateRows : []).map((candidate) => String(candidate?.id || "").trim()).filter(Boolean)));
}

function applyAssessmentFiltersLocal(item = {}, filters = {}) {
  const lane = String(filters?.lane || "active").trim() || "active";
  const archived = isAssessmentArchivedLocal(item);
  if (lane === "active" && archived) return false;
  if (lane === "archived" && !archived) return false;
  const { clientValue, jdValue, recruiterValue, outcomeValue, createdKey, hay } = getAssessmentFilterFieldValues(item);
  const query = String(filters?.q || "").trim().toLowerCase();
  if (query && !hay.includes(query)) return false;
  if (filters?.dateFrom && createdKey && createdKey < filters.dateFrom) return false;
  if (filters?.dateTo && createdKey && createdKey > filters.dateTo) return false;
  if (Array.isArray(filters?.clients) && filters.clients.length && !filters.clients.includes(clientValue)) return false;
  if (Array.isArray(filters?.jds) && filters.jds.length && !matchesJdFilterValue(jdValue, filters.jds)) return false;
  if (Array.isArray(filters?.jdIds) && filters.jdIds.length) {
    const candidateIds = [
      item?.jobId,
      item?.job_id,
      item?.jd_id,
      item?.assigned_jd_id,
      item?.payload?.jobId,
      item?.payload?.job_id,
      item?.payload?.jd_id
    ].map((value) => String(value || "").trim()).filter(Boolean);
    if (!candidateIds.some((id) => matchesJobIdFilterValue(id, filters.jdIds))) return false;
  }
  if (Array.isArray(filters?.recruiterCandidateIds) && filters.recruiterCandidateIds.length) {
    const candidateId = String(item?.candidateId || item?.candidate_id || item?.payload?.candidateId || item?.payload?.candidate_id || "").trim();
    if (!filters.recruiterCandidateIds.includes(candidateId)) return false;
  } else if (Array.isArray(filters?.recruiters) && filters.recruiters.length && !filters.recruiters.includes(recruiterValue)) return false;
  if (Array.isArray(filters?.outcomes) && filters.outcomes.length && !filters.outcomes.includes(outcomeValue)) return false;
  return true;
}

function sortAssessmentsForList(items = [], sortBy = "updated") {
  const sortMode = String(sortBy || "updated").trim().toLowerCase();
  const primaryKeys = sortMode === "created"
    ? ["createdAt", "created_at", "generatedAt", "updatedAt", "updated_at"]
    : ["updatedAt", "updated_at", "generatedAt", "createdAt", "created_at"];
  return (Array.isArray(items) ? items : []).slice().sort((a, b) => {
    const aTime = Date.parse(String(primaryKeys.map((key) => a?.[key]).find((value) => String(value || "").trim()) || ""));
    const bTime = Date.parse(String(primaryKeys.map((key) => b?.[key]).find((value) => String(value || "").trim()) || ""));
    const diff = (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
    if (diff) return diff;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

async function getAssessmentsUniverseForUser(user) {
  const rows = await listAssessments({ actorUserId: user.id, companyId: user.companyId }).catch(() => []);
  return hydrateAssessmentsWithCandidateAssignees(Array.isArray(rows) ? rows : [], user.companyId).catch(() => Array.isArray(rows) ? rows : []);
}

async function listAssessmentsForUser(user, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 25)));
  const page = Math.max(1, Number(options.page || 1));
  const offset = Math.max(0, (page - 1) * limit);
  const filters = normalizeAssessmentFilterOptions(options.filters || {});
  if (filters.recruiters.length) {
    const recruiterCandidateIds = await resolveAssessmentCandidateIdsForAssignees(user.companyId, filters.recruiters);
    if (recruiterCandidateIds.length) filters.jdIds = filters.jdIds || [];
    if (recruiterCandidateIds.length) {
      filters.recruiterCandidateIds = recruiterCandidateIds;
    }
  }
  const rows = sortAssessmentsForList(await getAssessmentsUniverseForUser(user), options.sortBy || "updated");
  const filtered = rows.filter((item) => applyAssessmentFiltersLocal(item, filters));
  const items = filtered.slice(offset, offset + limit);
  const total = filtered.length;
  return { items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

async function buildAssessmentVisibilityQueryForUser(user) {
  const companyId = String(user?.companyId || "").trim();
  const actorId = String(user?.id || "").trim();
  const actorIsAdmin = String(user?.role || "").toLowerCase() === "admin";
  const { on, url, key } = getSupabaseServiceConfig();
  if (!(on && companyId)) return null;
  if (actorIsAdmin) return null;

  const visibleCandidates = await fetch(`${url}/rest/v1/candidates?select=id,email,phone&company_id=eq.${encodeURIComponent(companyId)}&or=(recruiter_id.eq.${encodeURIComponent(actorId)},assigned_to_user_id.eq.${encodeURIComponent(actorId)})&limit=5000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` }
  }).then(async (response) => (response.ok ? response.json() : [])).catch(() => []);

  const visibleCandidateIds = Array.from(new Set((Array.isArray(visibleCandidates) ? visibleCandidates : []).map((candidate) => String(candidate?.id || "").trim()).filter(Boolean)));
  const visibleEmails = Array.from(new Set((Array.isArray(visibleCandidates) ? visibleCandidates : []).map((candidate) => String(candidate?.email || "").trim().toLowerCase()).filter(Boolean)));
  const visiblePhones = Array.from(new Set((Array.isArray(visibleCandidates) ? visibleCandidates : []).map((candidate) => String(candidate?.phone || "").replace(/\D/g, "").slice(-10)).filter(Boolean)));
  const visibilityOrParts = [`recruiter_id.eq.${encodeURIComponent(actorId)}`];
  if (visibleCandidateIds.length) visibilityOrParts.push(`candidate_id.in.(${visibleCandidateIds.map((id) => encodeURIComponent(id)).join(",")})`);
  if (visibleEmails.length) visibilityOrParts.push(`email_id.in.(${visibleEmails.map((email) => encodeURIComponent(email)).join(",")})`);
  if (visiblePhones.length) visibilityOrParts.push(`phone_number.in.(${visiblePhones.map((phone) => encodeURIComponent(phone)).join(",")})`);
  return `or=(${visibilityOrParts.join(",")})`;
}

async function countAssessmentsForUser(user, options = {}) {
  const filters = normalizeAssessmentFilterOptions(options.filters || {});
  const lane = String(options?.lane || "all").trim() || "all";
  const companyId = String(user?.companyId || "").trim();
  const visibilityQuery = String(options?.visibilityQuery || "").trim();
  const { on, url, key } = getSupabaseServiceConfig();
  if (!(on && companyId)) return 0;

  const queryParts = [
    `company_id=eq.${encodeURIComponent(companyId)}`
  ];

  if (visibilityQuery) queryParts.push(visibilityQuery);
  else if (String(user?.role || "").toLowerCase() !== "admin") {
    const fallbackVisibilityQuery = await buildAssessmentVisibilityQueryForUser(user);
    if (fallbackVisibilityQuery) queryParts.push(fallbackVisibilityQuery);
  }

  if (filters.q) {
    const escaped = String(filters.q || "").replace(/[%*]/g, "").trim();
    if (escaped) {
      const like = `*${escaped.replace(/,/g, " ")}*`;
      queryParts.push(`or=(candidate_name.ilike.${encodeURIComponent(like)},email_id.ilike.${encodeURIComponent(like)},phone_number.ilike.${encodeURIComponent(like)},client_name.ilike.${encodeURIComponent(like)},jd_title.ilike.${encodeURIComponent(like)})`);
    }
  }
  if (filters.dateFrom) queryParts.push(`created_at=gte.${encodeURIComponent(`${filters.dateFrom}T00:00:00.000Z`)}`);
  if (filters.dateTo) queryParts.push(`created_at=lte.${encodeURIComponent(`${filters.dateTo}T23:59:59.999Z`)}`);
  if (filters.clients.length) queryParts.push(`client_name=in.(${filters.clients.map((item) => encodeURIComponent(item)).join(",")})`);
  if (filters.jdIds.length) {
    const jobIdClause = buildJobIdFilterQueryClause(filters.jdIds, ["job_id", "jobId", "jd_id"]);
    if (jobIdClause) queryParts.push(jobIdClause);
  } else if (filters.jds.length) {
    const jdClause = buildJdFilterQueryClause(filters.jds, "jd_title");
    if (jdClause) queryParts.push(jdClause);
  }
  if (filters.recruiters.length) {
    const recruiterCandidateIds = await resolveAssessmentCandidateIdsForAssignees(companyId, filters.recruiters);
    if (recruiterCandidateIds.length) {
      queryParts.push(`candidate_id=in.(${recruiterCandidateIds.map((item) => encodeURIComponent(item)).join(",")})`);
    } else {
      queryParts.push("id=eq.__no_assignee_match__");
    }
  }
  if (filters.outcomes.length) queryParts.push(`candidate_status=in.(${filters.outcomes.map((item) => encodeURIComponent(item)).join(",")})`);
  if (lane === "active") {
    queryParts.push("payload->>archived=eq.false");
  } else if (lane === "archived") {
    queryParts.push("payload->>archived=eq.true");
  }

  const response = await fetch(`${url}/rest/v1/assessments?select=id&${queryParts.join("&")}&limit=1`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: "count=exact"
    }
  });
  if (!response.ok) return 0;
  const contentRange = String(response.headers.get("content-range") || "");
  const totalPart = contentRange.split("/")[1] || "";
  return Math.max(0, Number(totalPart || 0));
}

async function getAssessmentStatsForUser(user, options = {}) {
  const filters = normalizeAssessmentFilterOptions(options.filters || {});
  const todayKey = new Date().toISOString().slice(0, 10);
  const visibilityQuery = await buildAssessmentVisibilityQueryForUser(user);
  const [total, active, archived, today] = await Promise.all([
    countAssessmentsForUser(user, { filters, lane: "all", visibilityQuery }),
    countAssessmentsForUser(user, { filters, lane: "active", visibilityQuery }),
    countAssessmentsForUser(user, { filters, lane: "archived", visibilityQuery }),
    countAssessmentsForUser(user, { filters: { ...filters, dateFrom: todayKey, dateTo: todayKey }, lane: "all", visibilityQuery })
  ]);
  return {
    today,
    total,
    active,
    archived
  };
}

const assessmentStreamByCompany = new Map();

function addAssessmentStreamClient(companyId, client) {
  const key = String(companyId || "").trim();
  if (!key || !client) return;
  const list = assessmentStreamByCompany.get(key) || [];
  list.push(client);
  assessmentStreamByCompany.set(key, list);
}

function removeAssessmentStreamClient(companyId, client) {
  const key = String(companyId || "").trim();
  if (!key) return;
  const list = assessmentStreamByCompany.get(key) || [];
  const next = list.filter((item) => item !== client);
  if (next.length) assessmentStreamByCompany.set(key, next);
  else assessmentStreamByCompany.delete(key);
}

function emitAssessmentStreamEvent(companyId, eventType = "assessment_changed", payload = {}) {
  const key = String(companyId || "").trim();
  if (!key) return;
  const list = assessmentStreamByCompany.get(key) || [];
  if (!list.length) return;
  const safePayload = (payload && typeof payload === "object") ? payload : {};
  const data = JSON.stringify({
    type: String(eventType || "assessment_changed").trim(),
    at: new Date().toISOString(),
    ...safePayload
  });
  list.forEach((client) => {
    try {
      client.res.write(`event: assessment\n`);
      client.res.write(`data: ${data}\n\n`);
    } catch {
      removeAssessmentStreamClient(key, client);
      try { client.res.end(); } catch {}
    }
  });
}

function toIsoNow() {
  return new Date().toISOString();
}

function normalizeMarketingEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function normalizeMarketingCategories(value) {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || "").trim().replace(/^"+|"+$/g, "")).filter(Boolean)));
  }
  const raw = String(value || "").trim();
  if (!raw) return [];
  return Array.from(new Set(raw.split(",").map((item) => String(item || "").trim().replace(/^"+|"+$/g, "")).filter(Boolean)));
}

function isMarketingOwnerEmail(value = "") {
  const email = normalizeMarketingEmail(value);
  return email === "ankit.garg@kompatibleminds.com" || email === "rasel.mazumder@kompatibleminds.com";
}

function parseMarketingCsv(content = "") {
  const raw = String(content || "").trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/).filter((line) => String(line || "").trim());
  if (!lines.length) return [];
  function parseCsvRow(line = "") {
    const out = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        const next = line[i + 1];
        if (inQuotes && next === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (ch === "," && !inQuotes) {
        out.push(current);
        current = "";
        continue;
      }
      current += ch;
    }
    out.push(current);
    return out.map((cell) => String(cell || "").trim());
  }
  const headers = parseCsvRow(lines[0]).map((part) => String(part || "").trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = parseCsvRow(line);
    const row = {};
    headers.forEach((key, idx) => {
      row[key] = String(cells[idx] || "").trim();
    });
    return row;
  });
}

function parseMarketingSpreadsheetBase64(fileData = "", filename = "") {
  if (!xlsxLib) {
    throw new Error("Excel parser is not installed on server. Please install dependency `xlsx`.");
  }
  const safeData = String(fileData || "").trim();
  if (!safeData) return [];
  const ext = String(filename || "").trim().toLowerCase();
  const type = ext.endsWith(".xls") || ext.endsWith(".xlsx") ? "buffer" : "buffer";
  const workbook = xlsxLib.read(Buffer.from(safeData, "base64"), { type });
  const firstSheetName = Array.isArray(workbook?.SheetNames) && workbook.SheetNames.length ? workbook.SheetNames[0] : null;
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = xlsxLib.utils.sheet_to_json(sheet, { defval: "" });
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const out = {};
    Object.keys(row || {}).forEach((key) => {
      out[String(key || "").trim().toLowerCase()] = String(row[key] == null ? "" : row[key]).trim();
    });
    return out;
  });
}

function renderMarketingTemplate(template = "", prospect = {}, context = {}) {
  const source = String(template || "");
  const firstName = extractSafeFirstName(String(prospect?.name || "").trim());
  const senderName = String(context?.senderName || context?.actorName || "").trim();
  const senderFirstName = extractSafeFirstName(senderName);
  const senderEmail = String(context?.senderEmail || "").trim();
  const replacementMap = {
    name: String(prospect?.name || "").trim(),
    first_name: firstName,
    email: String(prospect?.email || "").trim(),
    phone: String(prospect?.phone || "").trim(),
    company: String(prospect?.company_name || prospect?.companyName || "").trim(),
    company_name: String(prospect?.company_name || prospect?.companyName || "").trim(),
    designation: String(prospect?.designation || "").trim(),
    category: String(prospect?.category || "").trim(),
    categories: Array.isArray(prospect?.categories) ? prospect.categories.join(", ") : String(prospect?.categories || "").trim(),
    sender_name: senderName,
    sender_first_name: senderFirstName,
    sender_email: senderEmail
  };
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => {
    const needle = String(key || "").trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(replacementMap, needle) ? replacementMap[needle] : "";
  });
}

function parseGenericSpreadsheetBase64ToRows(fileData = "", filename = "") {
  if (!xlsxLib) {
    throw new Error("Excel parser is not installed on server. Please install dependency `xlsx`.");
  }
  const safeData = String(fileData || "").trim();
  if (!safeData) return [];
  const ext = String(filename || "").trim().toLowerCase();
  const type = ext.endsWith(".xls") || ext.endsWith(".xlsx") ? "buffer" : "buffer";
  const workbook = xlsxLib.read(Buffer.from(safeData, "base64"), { type });
  const firstSheetName = Array.isArray(workbook?.SheetNames) && workbook.SheetNames.length ? workbook.SheetNames[0] : null;
  if (!firstSheetName) return [];
  const sheet = workbook.Sheets[firstSheetName];
  const grid = xlsxLib.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  const rows = Array.isArray(grid) ? grid.map((row) => (Array.isArray(row) ? row : [])).filter((row) => row.some((cell) => String(cell || "").trim())) : [];
  if (!rows.length) return [];
  const normalize = (value = "") => String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  const headerHints = ["name", "candidate", "phone", "mobile", "email", "linkedin", "company", "designation", "role", "location", "ctc", "notice", "experience", "qualification", "education"];
  let headerRowIndex = 0;
  let bestScore = -1;
  const scanUpto = Math.min(rows.length, 12);
  for (let i = 0; i < scanUpto; i += 1) {
    const row = rows[i];
    const nonEmpty = row.filter((cell) => String(cell || "").trim()).length;
    if (!nonEmpty) continue;
    const tokens = row.map((cell) => normalize(cell)).filter(Boolean);
    const hintHits = tokens.reduce((count, token) => count + (headerHints.some((hint) => token.includes(hint)) ? 1 : 0), 0);
    const score = hintHits * 10 + nonEmpty;
    if (score > bestScore) {
      bestScore = score;
      headerRowIndex = i;
    }
  }
  const headers = rows[headerRowIndex].map((cell, idx) => {
    const raw = String(cell || "").trim();
    return raw ? raw : `column_${idx + 1}`;
  });
  const output = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i];
    const out = {};
    let hasValue = false;
    headers.forEach((header, idx) => {
      const value = String(row[idx] == null ? "" : row[idx]).trim();
      if (value) hasValue = true;
      out[String(header || "").trim().toLowerCase()] = value;
    });
    if (hasValue) output.push(out);
  }
  return output;
}

async function getGoogleAccessToken(cfg = {}) {
  const refreshToken = String(cfg.pass || "").trim();
  const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
  if (!refreshToken) throw new Error("Google API mode requires a refresh token in SMTP app password field.");
  if (!clientId || !clientSecret) throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must be set on backend.");
  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("refresh_token", refreshToken);
  form.set("grant_type", "refresh_token");
  const response = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  }, 20000);
  const raw = await response.text();
  let parsed = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; }
  if (!response.ok || !String(parsed?.access_token || "").trim()) {
    const err = new Error(String(parsed?.error_description || parsed?.error || raw || "Failed to refresh Google access token."));
    err.status = response.status;
    err.body = raw;
    throw err;
  }
  return String(parsed.access_token).trim();
}

async function getMicrosoftAccessToken(cfg = {}) {
  const refreshToken = String(cfg.pass || "").trim();
  const clientId = String(process.env.MICROSOFT_OAUTH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.MICROSOFT_OAUTH_CLIENT_SECRET || "").trim();
  const tenant = String(process.env.MICROSOFT_OAUTH_TENANT_ID || "common").trim() || "common";
  if (!refreshToken) throw new Error("Microsoft API mode requires a refresh token in SMTP app password field.");
  if (!clientId || !clientSecret) throw new Error("MICROSOFT_OAUTH_CLIENT_ID and MICROSOFT_OAUTH_CLIENT_SECRET must be set on backend.");
  const form = new URLSearchParams();
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("refresh_token", refreshToken);
  form.set("grant_type", "refresh_token");
  form.set("scope", "offline_access openid profile email https://graph.microsoft.com/Mail.Send");
  const response = await fetchWithTimeout(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString()
  }, 20000);
  const raw = await response.text();
  let parsed = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = {}; }
  if (!response.ok || !String(parsed?.access_token || "").trim()) {
    const err = new Error(String(parsed?.error_description || parsed?.error || raw || "Failed to refresh Microsoft access token."));
    err.status = response.status;
    err.body = raw;
    throw err;
  }
  return String(parsed.access_token).trim();
}

function buildRawMimeEmail({ from = "", to = "", cc = "", subject = "", html = "", text = "", attachments = [] } = {}) {
  const lines = [];
  const boundaryMixed = `mixed_${crypto.randomBytes(8).toString("hex")}`;
  const boundaryAlt = `alt_${crypto.randomBytes(8).toString("hex")}`;
  lines.push(`From: ${from}`);
  lines.push(`To: ${to}`);
  if (String(cc || "").trim()) lines.push(`Cc: ${cc}`);
  lines.push(`Subject: ${String(subject || "").replace(/\r?\n/g, " ")}`);
  lines.push("MIME-Version: 1.0");
  lines.push(`Content-Type: multipart/mixed; boundary="${boundaryMixed}"`);
  lines.push("");
  lines.push(`--${boundaryMixed}`);
  lines.push(`Content-Type: multipart/alternative; boundary="${boundaryAlt}"`);
  lines.push("");
  lines.push(`--${boundaryAlt}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(String(text || htmlToPlainText(String(html || "")) || ""));
  lines.push("");
  lines.push(`--${boundaryAlt}`);
  lines.push('Content-Type: text/html; charset="UTF-8"');
  lines.push("Content-Transfer-Encoding: 7bit");
  lines.push("");
  lines.push(String(html || "").trim() || `<p>${escapeHtml(String(text || ""))}</p>`);
  lines.push("");
  lines.push(`--${boundaryAlt}--`);
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const filename = String(attachment?.filename || "attachment").trim() || "attachment";
    const contentType = String(attachment?.contentType || "application/octet-stream").trim() || "application/octet-stream";
    const bytes = toBufferContent(attachment?.content);
    const b64 = bytes.toString("base64").replace(/(.{76})/g, "$1\r\n");
    lines.push(`--${boundaryMixed}`);
    lines.push(`Content-Type: ${contentType}; name="${filename.replace(/"/g, "")}"`);
    lines.push("Content-Transfer-Encoding: base64");
    lines.push(`Content-Disposition: attachment; filename="${filename.replace(/"/g, "")}"`);
    lines.push("");
    lines.push(b64);
    lines.push("");
  }
  lines.push(`--${boundaryMixed}--`);
  return lines.join("\r\n");
}

async function sendGoogleEmailWithCfg(cfg, { to, cc = "", subject, html = "", text = "", attachments = [] }) {
  const accessToken = await getGoogleAccessToken(cfg);
  const rawMime = buildRawMimeEmail({
    from: String(cfg.from || cfg.user || "").trim(),
    to: String(to || "").trim(),
    cc: String(cc || "").trim(),
    subject,
    html,
    text,
    attachments
  });
  const raw = Buffer.from(rawMime, "utf8").toString("base64url");
  const response = await fetchWithTimeout("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  }, 25000);
  const responseRaw = await response.text();
  let parsed = {};
  try { parsed = responseRaw ? JSON.parse(responseRaw) : {}; } catch { parsed = {}; }
  if (!response.ok) {
    const err = new Error(String(parsed?.error?.message || responseRaw || "Google send failed."));
    err.status = response.status;
    err.body = responseRaw;
    throw err;
  }
  return { messageId: String(parsed?.id || "").trim(), threadId: String(parsed?.threadId || "").trim() };
}

async function sendMicrosoftEmailWithCfg(cfg, { to, cc = "", subject, html = "", text = "", attachments = [] }) {
  const accessToken = await getMicrosoftAccessToken(cfg);
  const toRecipients = String(to || "").split(",").map((v) => String(v || "").trim()).filter(Boolean).map((address) => ({ emailAddress: { address } }));
  const ccRecipients = String(cc || "").split(",").map((v) => String(v || "").trim()).filter(Boolean).map((address) => ({ emailAddress: { address } }));
  const msAttachments = (Array.isArray(attachments) ? attachments : []).map((attachment) => {
    const filename = String(attachment?.filename || "attachment").trim() || "attachment";
    const contentType = String(attachment?.contentType || "application/octet-stream").trim() || "application/octet-stream";
    const contentBytes = toBufferContent(attachment?.content).toString("base64");
    return {
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: filename,
      contentType,
      contentBytes
    };
  });
  const bodyHtml = String(html || "").trim() || `<p>${escapeHtml(String(text || ""))}</p>`;
  const payload = {
    message: {
      subject: String(subject || "").trim(),
      body: { contentType: "HTML", content: bodyHtml },
      toRecipients,
      ...(ccRecipients.length ? { ccRecipients } : {}),
      ...(msAttachments.length ? { attachments: msAttachments } : {})
    },
    saveToSentItems: true
  };
  const response = await fetchWithTimeout("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  }, 25000);
  const responseRaw = await response.text();
  if (!response.ok) {
    let parsed = {};
    try { parsed = responseRaw ? JSON.parse(responseRaw) : {}; } catch { parsed = {}; }
    const err = new Error(String(parsed?.error?.message || responseRaw || "Microsoft send failed."));
    err.status = response.status;
    err.body = responseRaw;
    throw err;
  }
  return { messageId: "", threadId: "" };
}

function stripHtmlForText(value = "") {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractSafeFirstName(fullName = "") {
  const raw = String(fullName || "").trim();
  if (!raw) return "";
  const titles = new Set(["mr", "mrs", "ms", "miss", "sh", "shri", "smt", "dr"]);
  const tokens = raw
    .split(/\s+/)
    .map((token) => String(token || "").trim())
    .filter(Boolean);
  for (const token of tokens) {
    const cleaned = token.replace(/[.,]/g, "").trim();
    const lower = cleaned.toLowerCase();
    if (!cleaned) continue;
    if (titles.has(lower)) continue;
    // Reject initials like "F" or "F."
    if (cleaned.length <= 1) continue;
    if (!/[a-z]/i.test(cleaned)) continue;
    return cleaned;
  }
  return "";
}

const MARKETING_TEMPLATE_ATTACHMENT_MARKER = "RSD_TEMPLATE_ATTACHMENT_V1";
const MARKETING_TEMPLATE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

function stripMarketingTemplateAttachment(rawBody = "") {
  const source = String(rawBody || "");
  const pattern = new RegExp(`<!--\\s*${MARKETING_TEMPLATE_ATTACHMENT_MARKER}:(.*?)\\s*-->`, "s");
  const match = source.match(pattern);
  if (!match) return { cleanBody: source, attachment: null };
  let parsed = null;
  try {
    parsed = JSON.parse(match[1] || "{}");
  } catch {
    parsed = null;
  }
  const cleanBody = source.replace(pattern, "").trim();
  if (!parsed || typeof parsed !== "object") return { cleanBody, attachment: null };
  return {
    cleanBody,
    attachment: {
      filename: String(parsed.filename || "").trim(),
      mimeType: String(parsed.mimeType || "application/octet-stream").trim() || "application/octet-stream",
      fileData: String(parsed.fileData || "").trim()
    }
  };
}

function applyMarketingTemplateAttachment(rawBody = "", attachment = null) {
  const cleaned = stripMarketingTemplateAttachment(rawBody).cleanBody;
  if (!attachment || typeof attachment !== "object") return cleaned;
  const filename = String(attachment.filename || "").trim();
  const fileData = String(attachment.fileData || "").trim();
  if (!filename || !fileData) return cleaned;
  const mimeType = String(attachment.mimeType || "application/octet-stream").trim() || "application/octet-stream";
  const payload = { filename, mimeType, fileData };
  return `${cleaned}\n<!--${MARKETING_TEMPLATE_ATTACHMENT_MARKER}:${JSON.stringify(payload)}-->`;
}

function sanitizeMarketingTemplateAttachment(input = null) {
  if (!input || typeof input !== "object") return null;
  const filenameRaw = String(input.filename || "").trim();
  const filename = filenameRaw.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 180);
  const mimeType = String(input.mimeType || "application/octet-stream").trim() || "application/octet-stream";
  const fileData = String(input.fileData || "").trim().replace(/^data:[^;]+;base64,/i, "");
  if (!filename && !fileData) return null;
  if (!filename) throw new Error("Attachment filename is required.");
  if (!fileData) throw new Error("Attachment file data is required.");
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(fileData)) throw new Error("Attachment must be base64 encoded.");
  const approxBytes = Math.floor((fileData.replace(/\s+/g, "").length * 3) / 4);
  if (approxBytes <= 0) throw new Error("Attachment file is empty.");
  if (approxBytes > MARKETING_TEMPLATE_ATTACHMENT_MAX_BYTES) throw new Error("Attachment too large. Max 5MB.");
  return { filename, mimeType, fileData };
}

function normalizeMarketingTemplateRow(row = null) {
  if (!row || typeof row !== "object") return row;
  const bodyRaw = String(row.body_text || "").trim();
  const { cleanBody, attachment } = stripMarketingTemplateAttachment(bodyRaw);
  return {
    ...row,
    body_text: cleanBody,
    attachment: attachment && attachment.filename && attachment.fileData ? {
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      hasFileData: true
    } : null
  };
}

function isAdminActor(actor = null) {
  return String(actor?.role || "").trim().toLowerCase() === "admin";
}

function buildMarketingOwnerFilter(actor = null, columnName = "created_by") {
  if (isAdminActor(actor)) return "";
  const actorId = encodeURIComponent(String(actor?.id || "").trim());
  if (!actorId) return "&id=eq.__no_actor__";
  return `&${columnName}=eq.${actorId}`;
}

async function getMarketingCampaignForActor(actor, campaignId = "") {
  const safeCampaignId = encodeURIComponent(String(campaignId || "").trim());
  const safeCompanyId = encodeURIComponent(String(actor?.companyId || "").trim());
  if (!safeCampaignId || !safeCompanyId) return null;
  const rows = await supabaseTableFetch(
    "marketing_campaigns",
    `?select=id,sender_user_id,company_id&company_id=eq.${safeCompanyId}&id=eq.${safeCampaignId}&limit=1`
  ).catch(() => []);
  const campaign = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!campaign) return null;
  if (isAdminActor(actor)) return campaign;
  const ownerId = String(campaign?.sender_user_id || "").trim();
  if (ownerId && ownerId === String(actor?.id || "").trim()) return campaign;
  return null;
}

function buildMarketingSignatureHtmlAndText(settings = {}) {
  const signatureHtml = String(settings?.signatureHtml || "").trim();
  const signatureText = String(settings?.signatureText || "").trim();
  const links = [
    { label: String(settings?.signatureLinkLabel || "").trim(), url: String(settings?.signatureLinkUrl || "").trim() },
    { label: String(settings?.signatureLinkLabel2 || "").trim(), url: String(settings?.signatureLinkUrl2 || "").trim() }
  ].filter((item) => item.url);
  const linksHtml = links
    .map((item) => `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label || item.url)}</a>`)
    .join(" | ");
  const fallbackHtml = [
    signatureText ? `<div>${escapeHtml(signatureText).replace(/\n/g, "<br/>")}</div>` : "",
    linksHtml ? `<div style="margin-top:6px;">${linksHtml}</div>` : ""
  ].filter(Boolean).join("");
  const finalHtml = signatureHtml || fallbackHtml;
  const finalText = signatureText || stripHtmlForText(signatureHtml || "");
  return { html: finalHtml, text: finalText };
}

async function processMarketingWorkerTickForActor(actor, options = {}) {
  const companyId = encodeURIComponent(String(actor?.companyId || "").trim());
  if (!companyId) return { sent: 0 };
  const batchPerCampaign = Math.max(1, Math.min(50, Number(options?.batchPerCampaign || 1)));
  const companyUsers = await listCompanyUsers(String(actor?.companyId || "").trim()).catch(() => []);
  const userById = new Map((Array.isArray(companyUsers) ? companyUsers : []).map((item) => [String(item?.id || "").trim(), item]));
  const smtpByUserId = new Map();
  const now = new Date();
  const campaigns = await supabaseTableFetch(
    "marketing_campaigns",
    `?select=*&company_id=eq.${companyId}&status=eq.active${buildMarketingOwnerFilter(actor, "sender_user_id")}&limit=50`
  );
  let sent = 0;
  for (const campaign of Array.isArray(campaigns) ? campaigns : []) {
    const campaignId = String(campaign?.id || "").trim();
    const senderUserId = String(campaign?.sender_user_id || "").trim();
    if (!campaignId || !senderUserId) continue;
    if (!isAdminActor(actor) && senderUserId !== String(actor?.id || "").trim()) continue;
    const senderUser = userById.get(senderUserId) || null;
    if (!senderUser?.id) continue;
    if (!smtpByUserId.has(senderUserId)) {
      const smtp = await getUserSmtpSettings({
        companyId: String(actor?.companyId || "").trim(),
        userId: senderUserId
      }).catch(() => null);
      smtpByUserId.set(senderUserId, smtp || null);
    }
    const senderSmtp = smtpByUserId.get(senderUserId);
    if (!senderSmtp) continue;
    const senderActor = {
      ...actor,
      id: String(senderUser.id || "").trim(),
      email: String(senderUser.email || "").trim(),
      name: String(senderUser.name || "").trim() || String(actor?.name || "").trim(),
      role: String(senderUser.role || actor?.role || "").trim(),
      companyId: String(actor?.companyId || "").trim()
    };
    const signature = buildMarketingSignatureHtmlAndText(senderSmtp || {});
    const templateRows = await supabaseTableFetch("marketing_templates", `?select=*&campaign_id=eq.${encodeURIComponent(campaignId)}&company_id=eq.${companyId}&limit=1`);
    const template = Array.isArray(templateRows) && templateRows.length ? templateRows[0] : null;
    if (!template?.subject || !template?.body_text) continue;
    const templateParsed = stripMarketingTemplateAttachment(String(template.body_text || ""));
    const templateBody = String(templateParsed.cleanBody || "").trim();
    const templateAttachment = templateParsed.attachment;
    if (!templateBody) continue;
    const queueRows = await supabaseTableFetch(
      "marketing_campaign_prospects",
      `?select=id,prospect_id,state,updated_at,last_sent_at&company_id=eq.${companyId}&campaign_id=eq.${encodeURIComponent(campaignId)}&state=eq.ready&order=updated_at.asc&limit=${batchPerCampaign}`
    );
    const rows = Array.isArray(queueRows) ? queueRows : [];
    for (const row of rows) {
      const prospectId = String(row?.prospect_id || "").trim();
      const prospectRows = prospectId
        ? await supabaseTableFetch(
            "marketing_prospects",
            `?select=id,name,email,phone,company_name,designation,category,categories,status&company_id=eq.${companyId}&id=eq.${encodeURIComponent(prospectId)}&limit=1`
          )
        : [];
      const prospect = Array.isArray(prospectRows) && prospectRows.length ? prospectRows[0] : null;
      if (!row || !prospect || String(prospect?.status || "").toLowerCase() !== "active") continue;
      const rawGap = Math.max(1, Number(campaign?.send_gap_minutes || 5));
      // Apply send gap only for rows that have already been sent before.
      // Fresh "ready" rows (no last_sent_at) should not be throttled by gap.
      const lastSentAt = row?.last_sent_at ? new Date(row.last_sent_at) : null;
      if (lastSentAt && (now.getTime() - lastSentAt.getTime()) < (rawGap * 60 * 1000)) continue;
      const to = normalizeMarketingEmail(prospect?.email);
      if (!to) continue;
      const subject = renderMarketingTemplate(template.subject, prospect, {
        senderName: String(senderActor?.name || "").trim(),
        senderEmail: String(senderActor?.email || "").trim()
      });
      const renderedBody = renderMarketingTemplate(templateBody, prospect, {
        senderName: String(senderActor?.name || "").trim(),
        senderEmail: String(senderActor?.email || "").trim()
      });
      const hasHtmlBody = /<[^>]+>/.test(renderedBody);
      const textBase = hasHtmlBody ? stripHtmlForText(renderedBody) : renderedBody;
      const htmlBase = hasHtmlBody
        ? renderedBody
        : `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap;">${escapeHtml(textBase)}</pre>`;
      const html = signature.html
        ? `${htmlBase}<div style="margin-top:16px;">${signature.html}</div>`
        : htmlBase;
      const text = signature.text
        ? `${textBase}\n\n${signature.text}`
        : textBase;
      const attachments = [];
      if (templateAttachment?.filename && templateAttachment?.fileData) {
        try {
          attachments.push({
            filename: templateAttachment.filename,
            content: Buffer.from(String(templateAttachment.fileData || "").replace(/^data:[^;]+;base64,/i, ""), "base64"),
            contentType: String(templateAttachment.mimeType || "application/octet-stream").trim() || "application/octet-stream"
          });
        } catch {
          // Ignore malformed template attachment, keep send resilient.
        }
      }
      await sendJdEmailAsActor(senderActor, { to, subject, text, html, cc: "", attachments });
      await supabaseTableFetch("marketing_campaign_prospects", `?id=eq.${encodeURIComponent(String(row.id || ""))}&select=*`, {
        method: "PATCH",
        body: { state: "sent", updated_at: toIsoNow(), last_sent_at: toIsoNow() },
        prefer: "return=minimal"
      });
      await supabaseTableFetch("marketing_message_events", "?select=id", {
        method: "POST",
        body: {
          id: crypto.randomUUID(),
          company_id: actor.companyId,
          campaign_id: campaignId,
          prospect_id: prospect.id,
          event_type: "sent",
          event_at: toIsoNow(),
          meta: { subject, auto: true }
        },
        prefer: "return=minimal"
      });
      sent += 1;
    }
  }
  return { sent };
}

async function supabaseTableFetch(tableName, query = "", options = {}) {
  const { method = "GET", body = null, prefer = "", extraHeaders = {} } = options || {};
  const { on, url, key } = getSupabaseServiceConfig();
  if (!on) throw new Error("Supabase service role is not configured.");
  const rel = `/rest/v1/${tableName}${String(query || "")}`;
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extraHeaders
  };
  if (prefer) headers.Prefer = prefer;
  if (body !== null) headers["Content-Type"] = "application/json";
  const response = await fetch(`${url}${rel}`, {
    method: String(method || "GET").toUpperCase(),
    headers,
    body: body !== null ? JSON.stringify(body) : null
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (!response.ok) {
    const message = typeof parsed === "string"
      ? parsed
      : String(parsed?.message || parsed?.error_description || parsed?.error || `Supabase request failed (${response.status}).`);
    throw new Error(message);
  }
  return parsed;
}

function normalizeApplicantPhoneForMatch(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeApplicantEmailForMatch(value) {
  return String(value || "").trim().toLowerCase();
}

async function findAssessmentLinkedCandidateByIdentity({ companyId, phone, email }) {
  const safeCompanyId = String(companyId || "").trim();
  const needlePhone = normalizeApplicantPhoneForMatch(phone);
  const needleEmail = normalizeApplicantEmailForMatch(email);
  if (!safeCompanyId) return null;
  if (!needlePhone && !needleEmail) return null;

  const { on, url, key } = getSupabaseServiceConfig();
  if (!on) return null;

  const orParts = [];
  if (needleEmail) orParts.push(`email_id.eq.${encodeURIComponent(needleEmail)}`);
  if (needlePhone) orParts.push(`phone_number.like.*${encodeURIComponent(needlePhone)}*`);
  if (!orParts.length) return null;

  try {
    const rel = `/rest/v1/assessments?select=id,candidate_id,email_id,phone_number&company_id=eq.${encodeURIComponent(safeCompanyId)}&or=(${orParts.join(",")})&order=updated_at.desc&limit=25`;
    const response = await fetch(`${url}${rel}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!response.ok) return null;
    const rows = await response.json();
    const match = (rows || []).find((row) => String(row?.candidate_id || "").trim()) || null;
    const candidateId = String(match?.candidate_id || "").trim();
    if (!candidateId) return null;
    const candidates = await listCandidates({ id: candidateId, companyId: safeCompanyId, limit: 1 }).catch(() => []);
    return Array.isArray(candidates) && candidates.length ? candidates[0] : null;
  } catch {
    return null;
  }
}

function getPlatformCreateCompanySecret(req, body = {}) {
  const header = String(req.headers["x-platform-secret"] || req.headers["X-Platform-Secret"] || "").trim();
  if (header) return header;
  return String(body.platformSecret || body.platform_secret || "").trim();
}

function getApplicantIntakeSecret(req, body = {}) {
  const header = String(req.headers["x-applicant-intake-secret"] || "").trim();
  if (header) return header;
  return String(body.intakeSecret || body.intake_secret || "").trim();
}

async function ensureCandidateVisibleToActor(actor, candidateId) {
  const id = String(candidateId || "").trim();
  if (!id) {
    throw new Error("Missing candidate id.");
  }
  const matches = await listCandidatesForUser(actor, { id, limit: 1 });
  if (!Array.isArray(matches) || !matches.length) {
    throw new Error("Candidate not found or not allowed.");
  }
  return matches[0];
}

const capturedStreamByCompany = new Map();

function addCapturedStreamClient(companyId, client) {
  const key = String(companyId || "").trim();
  if (!key || !client) return;
  const list = capturedStreamByCompany.get(key) || [];
  list.push(client);
  capturedStreamByCompany.set(key, list);
}

function removeCapturedStreamClient(companyId, client) {
  const key = String(companyId || "").trim();
  if (!key) return;
  const list = capturedStreamByCompany.get(key) || [];
  const next = list.filter((item) => item !== client);
  if (next.length) capturedStreamByCompany.set(key, next);
  else capturedStreamByCompany.delete(key);
}

function emitCapturedStreamEvent(companyId, eventType = "candidate_changed", payload = {}) {
  const key = String(companyId || "").trim();
  if (!key) return;
  const list = capturedStreamByCompany.get(key) || [];
  if (!list.length) return;
  const safePayload = (payload && typeof payload === "object") ? payload : {};
  const derivedCandidateId = String(
    safePayload?.candidateId ||
    safePayload?.candidate_id ||
    safePayload?.id ||
    safePayload?.candidate?.id ||
    ""
  ).trim();
  const data = JSON.stringify({
    type: String(eventType || "candidate_changed").trim(),
    at: new Date().toISOString(),
    ...safePayload,
    candidateId: derivedCandidateId || undefined
  });
  list.forEach((client) => {
    try {
      client.res.write(`event: captured\n`);
      client.res.write(`data: ${data}\n\n`);
    } catch {
      removeCapturedStreamClient(key, client);
      try { client.res.end(); } catch {}
    }
  });
}

async function getVisibleCandidateForActor(actor, candidateId) {
  const id = String(candidateId || "").trim();
  if (!id) {
    throw new Error("Candidate not found.");
  }
  const matches = await listCandidates({ id, limit: 1, companyId: actor.companyId });
  const candidate = Array.isArray(matches) ? matches[0] : null;
  if (!candidate) {
    throw new Error("Candidate not found in this company.");
  }
  return candidate;
}

async function ensureCompanyCandidateExists(companyId, candidateId) {
  const id = String(candidateId || "").trim();
  const scopedCompanyId = String(companyId || "").trim();
  if (!id) {
    throw new Error("Missing candidate id.");
  }
  const matches = await listCandidates({ id, limit: 1, companyId: scopedCompanyId });
  if (!Array.isArray(matches) || !matches.length) {
    throw new Error("Candidate not found in this company.");
  }
  return matches[0];
}

async function unlinkAssessmentFromCompanyCandidates(companyId, assessmentId) {
  const scopedAssessmentId = String(assessmentId || "").trim();
  const scopedCompanyId = String(companyId || "").trim();
  if (!scopedAssessmentId || !scopedCompanyId) {
    return;
  }
  const candidates = await listCandidates({ companyId: scopedCompanyId, limit: 5000 });
  const linkedCandidates = (Array.isArray(candidates) ? candidates : []).filter(
    (candidate) =>
      String(candidate?.assessment_id || candidate?.assessmentId || "").trim() === scopedAssessmentId
  );
  for (const candidate of linkedCandidates) {
    const candidateId = String(candidate?.id || "").trim();
    if (!candidateId) continue;
    const source = String(candidate?.source || "").trim().toLowerCase();
    const isAppliedSource = source === "website_apply" || source === "hosted_apply" || source === "google_sheet";
    if (isAppliedSource) {
      // Under 1:1, deleting an assessment converted from an applied note should delete the applied note too.
      try {
        await deleteCandidate(candidateId, { companyId: scopedCompanyId });
      } catch {
        // ignore
      }
      continue;
    }
    await patchCandidate(candidateId, {
      hidden_from_captured: false,
      used_in_assessment: false,
      assessment_id: null,
      updated_at: new Date().toISOString()
    }, { companyId: scopedCompanyId });
  }
}

async function ingestApplicantSubmission(body, req) {
  const payload = normalizeApplicantBody(body);
  if (!payload.companyId) {
    throw new Error("companyId is required.");
  }

  const providedSecret = getApplicantIntakeSecret(req, body);
  const configuredSecretInfo = await getCompanyApplicantIntakeSecret(payload.companyId);
  const configuredSecret = String(configuredSecretInfo?.applicantIntakeSecret || "").trim();
  if (configuredSecret && providedSecret !== configuredSecret) {
    throw new Error("Invalid applicant intake secret.");
  }

  let matchedJob = null;
  if (payload.jobId) {
    try {
      matchedJob = await getPublicCompanyJob(payload.jobId);
    } catch {
      matchedJob = null;
    }
  }
  if (!matchedJob && payload.companyId && payload.jdTitle) {
    try {
      const jobs = await listCompanyJobs(payload.companyId);
      matchedJob = (jobs || []).find((item) => String(item?.title || "").trim().toLowerCase() === String(payload.jdTitle || "").trim().toLowerCase()) || null;
    } catch {
      matchedJob = null;
    }
  }

  let storedFile = null;
  let parsed = {
    candidateName: payload.candidateName,
    totalExperience: payload.totalExperience,
    currentCompany: payload.currentCompany,
    currentDesignation: payload.currentDesignation,
    emailId: payload.email,
    phoneNumber: payload.phone,
    timeline: []
  };

  if (payload.file?.fileData) {
    storedFile = await storeUploadedFile(payload.file, {
      objectPrefix: `applicants/${payload.companyId}/${payload.jdTitle || payload.jobId || "general"}`
    });

    parsed = await parseCandidatePayload({
      sourceType: "cv",
      file: payload.file,
      candidateName: payload.candidateName,
      totalExperience: payload.totalExperience
    });
  }

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  let normalized = null;
  let parseStatus = payload.file?.fileData ? "parsed" : "submitted_without_cv";
  if (payload.file?.fileData && apiKey && payload.parseWithAi) {
    try {
      normalized = await normalizeCandidateFileWithAi({
        apiKey,
        model: payload.model,
        uploadedFile: payload.file,
        sourceType: "cv",
        filename: parsed.filename,
        fallbackFields: {
          candidateName: parsed.candidateName,
          totalExperience: parsed.totalExperience,
          currentCompany: parsed.currentCompany,
          currentDesignation: parsed.currentDesignation,
          emailId: parsed.emailId,
          phoneNumber: parsed.phoneNumber,
          timeline: parsed.timeline,
          gaps: parsed.gaps
        }
      });
      parseStatus = "parsed_with_ai";
    } catch (error) {
      parseStatus = `parsed_fallback:${String(error?.message || error)}`;
    }
  }

  const merged = mergeApplicantCandidateFields(parsed, normalized, payload);
  const metadata = {
    type: "website_apply",
    parseStatus,
    sourcePlatform: payload.sourcePlatform,
    sourceLabel: payload.sourceLabel,
    ...(storedFile ? {
      fileProvider: storedFile.provider || "",
      fileKey: storedFile.key || "",
      fileUrl: storedFile.url || "",
      filename: storedFile.filename || "",
      mimeType: storedFile.mimeType || "",
      sizeBytes: storedFile.sizeBytes || 0
    } : {}),
    jobId: payload.jobId,
    jobPageUrl: payload.jobPageUrl,
    screeningAnswers: payload.screeningAnswers,
    customFields: payload.customFields || {},
    applicantState: "new"
  };
  const cvResultForSearch =
    normalized && typeof normalized === "object"
      ? normalized
      : parsed && typeof parsed === "object"
        ? parsed
        : null;
  const inferredSearchTags = deriveInferredSearchTags({
    cvResult: cvResultForSearch,
    recruiterNotes: [
      String(payload.screeningAnswers || "").trim(),
      screeningAnswersToSearchText(payload.customFields || {})
    ].filter(Boolean).join("\n"),
    otherPointers: "",
    tags: Array.isArray(merged?.skills) ? merged.skills : []
  });
  metadata.inferredSearchTags = inferredSearchTags;

  // Recruiter-specific public apply links (signed).
  // If present and valid, override the default JD owner assignment so the applicant appears under that recruiter.
  let linkAssignedRecruiter = null;
  const intakeSecret = String(configuredSecretInfo?.applicantIntakeSecret || "").trim();
  if (matchedJob?.id && payload.assignedToUserId && payload.assignedToSig && intakeSecret) {
    const ok = verifyRecruiterApplyLinkSignature({
      companyId: payload.companyId,
      jobId: matchedJob.id,
      recruiterId: payload.assignedToUserId,
      secret: intakeSecret,
      signature: payload.assignedToSig
    });
    if (ok) {
      const recruiters = await listCompanyUsers(payload.companyId);
      linkAssignedRecruiter = (recruiters || []).find((user) => String(user?.id || "").trim() === String(payload.assignedToUserId || "").trim()) || null;
      if (linkAssignedRecruiter) {
        metadata.applyAssignedToUserId = String(linkAssignedRecruiter.id || "");
        metadata.applyAssignedToName = String(linkAssignedRecruiter.name || "");
        metadata.applyAssignedVia = "apply_link";
      }
    }
  }

  // Default assignment for inbound applicants:
  // 1) recruiter-specific apply link
  // 2) JD owner recruiter
  // 3) company admin (fallback)
  let defaultInboxOwner = linkAssignedRecruiter
    ? { id: String(linkAssignedRecruiter.id || "").trim(), name: String(linkAssignedRecruiter.name || "").trim() }
    : matchedJob?.ownerRecruiterId
      ? { id: String(matchedJob.ownerRecruiterId || "").trim(), name: String(matchedJob.ownerRecruiterName || "").trim() }
      : null;
  if (!defaultInboxOwner?.id) {
    try {
      const users = await listCompanyUsers(payload.companyId);
      const admin = (Array.isArray(users) ? users : []).find((u) => String(u?.role || "").toLowerCase() === "admin") || null;
      const picked = admin || (Array.isArray(users) ? users[0] : null) || null;
      if (picked?.id) {
        defaultInboxOwner = { id: String(picked.id || "").trim(), name: String(picked.name || "").trim() };
      }
    } catch {
      // ignore
    }
  }

  const appliedSource = payload.sourcePlatform === "hosted_apply" ? "hosted_apply" : "website_apply";

  // If the same candidate already exists (captured note), merge into that row and move it to Applied
  // instead of creating a duplicate candidate entry.
  let duplicate = await findDuplicateCandidate(
    { company_id: payload.companyId, phone: merged.phone, email: merged.email, linkedin: merged.linkedin },
    { companyId: payload.companyId }
  ).catch(() => null);
  if (!duplicate?.existing?.id) {
    const linked = await findAssessmentLinkedCandidateByIdentity({ companyId: payload.companyId, phone: merged.phone, email: merged.email }).catch(() => null);
    if (linked?.id) {
      duplicate = { existing: linked, matchBy: ["assessment_identity"] };
    }
  }

  if (duplicate?.existing?.id) {
    const existing = duplicate.existing;
    const existingMeta = decodeApplicantMetadata(existing);
    const nextMeta = {
      ...(existingMeta || {}),
      ...(metadata || {}),
      originalSource: String(existingMeta?.originalSource || existing?.source || "").trim() || undefined,
      mergedFrom: "website_apply_duplicate",
      mergedAt: new Date().toISOString()
    };
    nextMeta.searchDocV1 = deriveCandidateSearchDocV1FromParts({
      candidate: {
        ...(existing || {}),
        source: appliedSource,
        client_name: payload.clientName || existing?.client_name || "",
        jd_title: payload.jdTitle || existing?.jd_title || "",
        recruiter_context_notes: [
          payload.screeningAnswers || existing?.recruiter_context_notes || "",
          screeningAnswersToSearchText(payload.customFields || {})
        ].filter(Boolean).join("\n"),
        skills: Array.isArray(existing?.skills) && existing.skills.length ? existing.skills : (Array.isArray(merged?.skills) ? merged.skills : [])
      },
      meta: nextMeta,
      draftPayload: existing?.draft_payload && typeof existing.draft_payload === "object" ? existing.draft_payload : {},
      screeningAnswers: {
        ...(existing?.screening_answers && typeof existing.screening_answers === "object" ? existing.screening_answers : {}),
        ...(payload.customFields || {})
      },
      cvResult: cvResultForSearch,
      inferredSearchTags
    });
    nextMeta.searchDocUpdatedAt = new Date().toISOString();
    Object.keys(nextMeta).forEach((k) => nextMeta[k] === undefined && delete nextMeta[k]);

    // Keep candidates in one place:
    // - If this person was already captured (extension/manual/etc), do NOT move them into Applied Candidates.
    // - Only keep "website_apply/hosted_apply" source if the existing record was already an inbound applicant.
    const existingSource = String(existing?.source || "").trim();
    const existingIsInbound = existingSource === "website_apply" || existingSource === "hosted_apply";
    const existingConverted = Boolean(existing?.used_in_assessment) || Boolean(String(existing?.assessment_id || existing?.assessmentId || "").trim());
    const nextSource = existingIsInbound
      ? appliedSource
      : (existingSource || (existingConverted ? "manual_draft" : appliedSource));

    const patch = {
      source: nextSource,
      raw_note: encodeApplicantMetadata(nextMeta),
      client_name: payload.clientName || existing.client_name || null,
      jd_title: payload.jdTitle || existing.jd_title || null,
      assigned_to_user_id: defaultInboxOwner?.id || existing.assigned_to_user_id || null,
      assigned_to_name: defaultInboxOwner?.name || existing.assigned_to_name || null,
      assigned_jd_id: matchedJob?.id || existing.assigned_jd_id || null,
      assigned_jd_title: matchedJob?.title || payload.jdTitle || existing.assigned_jd_title || null,
      recruiter_context_notes: [
        payload.screeningAnswers || existing.recruiter_context_notes || "",
        screeningAnswersToSearchText(payload.customFields || {})
      ].filter(Boolean).join("\n") || null,
      // Fill missing contact fields if they were empty in the captured record.
      phone: existing.phone ? undefined : (merged.phone || undefined),
      email: existing.email ? undefined : (merged.email || undefined),
      linkedin: existing.linkedin ? undefined : (merged.linkedin || undefined),
      location: existing.location ? undefined : (merged.location || undefined),
      name: existing.name ? undefined : (merged.name || undefined),
      company: existing.company ? undefined : (merged.company || undefined),
      role: existing.role ? undefined : (merged.role || undefined),
      experience: existing.experience ? undefined : (merged.experience || undefined),
      highest_education: existing.highest_education ? undefined : (merged.highest_education || undefined),
      current_ctc: existing.current_ctc ? undefined : (merged.current_ctc || undefined),
      expected_ctc: existing.expected_ctc ? undefined : (merged.expected_ctc || undefined),
      notice_period: existing.notice_period ? undefined : (merged.notice_period || undefined)
    };
    Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

    const updated = await patchCandidate(String(existing.id), patch, { companyId: payload.companyId });
    try {
      await upsertCandidateSearchDocV1({
        companyId: payload.companyId,
        candidateId: String(existing.id || "").trim(),
        docV1: String(nextMeta.searchDocV1 || "").trim(),
        cvTextFull: String(parsed?.rawText || "")
      });
    } catch (_) {}
    return sanitizeApplicantCandidate(updated);
  }

  metadata.searchDocV1 = deriveCandidateSearchDocV1FromParts({
    candidate: {
      source: appliedSource,
      name: merged.name,
      company: merged.company,
      role: merged.role,
      experience: merged.experience,
      skills: merged.skills,
      phone: merged.phone,
      email: merged.email,
      location: merged.location,
      highest_education: merged.highest_education,
      current_ctc: merged.current_ctc,
      expected_ctc: merged.expected_ctc,
      notice_period: merged.notice_period,
      notes: merged.notes,
      recruiter_context_notes: [
        payload.screeningAnswers || "",
        screeningAnswersToSearchText(payload.customFields || {})
      ].filter(Boolean).join("\n"),
      next_action: merged.next_action,
      client_name: payload.clientName || "",
      jd_title: payload.jdTitle || "",
      recruiter_name: defaultInboxOwner?.name || payload.recruiterName || "Website Apply",
      assigned_to_name: defaultInboxOwner?.name || "",
      assigned_jd_title: matchedJob?.title || payload.jdTitle || "",
      linkedin: merged.linkedin || ""
    },
    meta: metadata,
    draftPayload: {},
    screeningAnswers: payload.customFields || {},
    cvResult: cvResultForSearch,
    inferredSearchTags
  });
  metadata.searchDocUpdatedAt = new Date().toISOString();

  const candidate = await saveCandidate(
    {
      id: "",
      company_id: payload.companyId,
      source: appliedSource,
      name: merged.name,
      company: merged.company,
      role: merged.role,
      experience: merged.experience,
      skills: merged.skills,
      phone: merged.phone,
      email: merged.email,
      location: merged.location,
      highest_education: merged.highest_education,
      current_ctc: merged.current_ctc,
      expected_ctc: merged.expected_ctc,
      notice_period: merged.notice_period,
      notes: merged.notes,
      recruiter_context_notes: [
        payload.screeningAnswers || "",
        screeningAnswersToSearchText(payload.customFields || {})
      ].filter(Boolean).join("\n") || null,
      other_pointers: normalized?.timeline?.length ? `Timeline entries: ${normalized.timeline.length}` : null,
      next_action: merged.next_action,
      client_name: payload.clientName || null,
      jd_title: payload.jdTitle || null,
      recruiter_name: defaultInboxOwner?.name || payload.recruiterName || "Website Apply",
      assigned_to_user_id: defaultInboxOwner?.id || null,
      assigned_to_name: defaultInboxOwner?.name || null,
      assigned_jd_id: matchedJob?.id || null,
      assigned_jd_title: matchedJob?.title || payload.jdTitle || null,
      linkedin: merged.linkedin || null,
      raw_note: encodeApplicantMetadata(metadata)
    },
    { companyId: payload.companyId }
  );
  try {
    await upsertCandidateSearchDocV1({
      companyId: payload.companyId,
      candidateId: String(candidate?.id || "").trim(),
      docV1: String(metadata.searchDocV1 || "").trim(),
      cvTextFull: String(parsed?.rawText || "")
    });
  } catch (_) {}

  return sanitizeApplicantCandidate(candidate);
}

function sanitizeTimelineRows(timeline) {
  function hasContactLikeNoise(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    if (/@/.test(text)) return true;
    if (/\b(e-?mail|email|contact\s*(no|number)?|phone|mobile|mob|linkedin)\b/i.test(text)) return true;
    if (/\+?\d[\d\s().-]{8,}/.test(text)) return true;
    return false;
  }
  function isBadRoleOrCompany(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    if (hasContactLikeNoise(text)) return true;
    if (/^(exact\s+responsibilities?|responsibilities?)\s*:?\s*$/i.test(text)) return true;
    if (/\b(academic qualification|education|declaration|career objective)\b/i.test(text)) return true;
    return false;
  }
  if (!Array.isArray(timeline)) return [];
  return timeline
    .map((item) => ({
      company: String(item?.company || item?.employer || item?.organization || item?.currentCompany || "").trim(),
      title: String(item?.designation || item?.title || item?.role || item?.jobTitle || item?.currentDesignation || "").trim(),
      start: String(item?.start || item?.startDate || item?.start_date || item?.from || "").trim(),
      end: String(item?.end || item?.endDate || item?.end_date || item?.to || "").trim(),
      duration: String(item?.duration || "").trim()
    }))
    .filter((item) => item.company || item.title || item.start || item.end || item.duration)
    .filter((item) => !isBadRoleOrCompany(item.company) && !isBadRoleOrCompany(item.title));
}

function sanitizeGapRows(gaps) {
  if (!Array.isArray(gaps)) return [];
  return gaps
    .map((item) => ({
      from: String(item?.from || "").trim(),
      to: String(item?.to || "").trim(),
      duration: String(item?.duration || "").trim(),
      note: String(item?.note || item?.afterCompany || "").trim()
    }))
    .filter((item) => item.from || item.to || item.duration || item.note);
}

const DASHBOARD_REJECTED_STATUSES = new Set(["screening reject", "interview reject"]);
const DASHBOARD_DROPPED_STATUSES = new Set(["did not attend", "not responding", "dropped"]);
const DASHBOARD_FINAL_OUTCOMES = new Set([
  "offered",
  "hold",
  "did not attend",
  "not responding",
  "dropped",
  "screening reject",
  "interview reject",
  "duplicate",
  "joined"
]);

function normalizeDashboardText(value) {
  return String(value || "").trim().toLowerCase();
}

function parseAmountToLpa(value) {
  const text = normalizeDashboardText(value).replace(/[, ]+/g, " ");
  if (!text) return null;
  const numMatch = text.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return null;
  const amount = Number(numMatch[1]);
  if (!Number.isFinite(amount)) return null;
  if (/\bcr|crore\b/.test(text)) return amount * 100;
  if (/\blpa|lac|lakh|lakhs\b/.test(text)) return amount;
  if (/\bk\b/.test(text)) return amount / 100;
  if (/\bpa\b/.test(text)) return amount / 100000;
  if (amount > 1000000) return amount / 100000;
  return amount;
}

function parseExperienceToYears(value) {
  const text = normalizeDashboardText(value);
  if (!text) return null;
  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/);
  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:months?|mos?)/);
  if (!yearMatch && !monthMatch) return null;
  const years = yearMatch ? Number(yearMatch[1]) : 0;
  const months = monthMatch ? Number(monthMatch[1]) : 0;
  return years + months / 12;
}

function parseNoticePeriodToDays(value) {
  const text = normalizeDashboardText(value);
  if (!text) return null;
  const dayMatch = text.match(/(\d+)\s*days?/);
  if (dayMatch) return Number(dayMatch[1]);
  const monthMatch = text.match(/(\d+(?:\.\d+)?)\s*months?/);
  if (monthMatch) return Math.round(Number(monthMatch[1]) * 30);
  if (text.includes("immediate")) return 0;
  if (text.includes("serving")) return 30;
  return null;
}

function getAssessmentLifecycleBucket(item) {
  // Lifecycle buckets must work for both:
  // - assessments (candidateStatus)
  // - captured notes (attemptStatus / workflowStatus)
  // Otherwise queries like "duplicate" only match assessments and miss captured-note duplicates.
  const status = normalizeDashboardText(item?.candidateStatus || item?.candidate_status || item?.status || "");
  const workflow = normalizeDashboardText(item?.workflowStatus || "");
  const attempt = normalizeDashboardText(item?.attemptStatus || "");
  const combined = `${status} ${workflow} ${attempt}`.trim();
  if (combined.includes("duplicate")) return "duplicate";
  if (combined.includes("joined")) return "joined";
  if (combined.includes("offer") || status === "offered") return "offered";
  if (combined.includes("shortlist")) return "shortlisted";
  // Rejected/dropped can appear in captured attempts as well, so check both the strict status token
  // and the combined text.
  if (DASHBOARD_REJECTED_STATUSES.has(status) || DASHBOARD_REJECTED_STATUSES.has(combined)) return "rejected";
  if (DASHBOARD_DROPPED_STATUSES.has(status) || DASHBOARD_DROPPED_STATUSES.has(combined)) return "dropped";
  if (status === "hold" || combined.includes("on hold")) return "hold";
  return "under_process";
}

function getClientLabel(candidate = {}, assessment = {}) {
  return (
    String(candidate.client_name || candidate.clientName || "").trim() ||
    String(assessment.clientName || assessment.client_name || "").trim() ||
    "Unassigned"
  );
}

function getRecruiterLabel(candidate = {}, assessment = {}) {
  return (
    String(candidate.assigned_to_name || candidate.assignedToName || "").trim() ||
    String(assessment.assigned_to_name || assessment.assignedToName || "").trim() ||
    String(candidate.recruiter_name || candidate.recruiterName || "").trim() ||
    String(assessment.recruiterName || assessment.recruiter_name || "").trim() ||
    "Unassigned"
  );
}

function getOwnerRecruiterLabel(candidate = {}, assessment = {}) {
  const source = String(candidate?.source || "").trim().toLowerCase();
  const isApplicant = source === "website" || source === "website_apply" || source === "hosted_apply";
  const assigned = String(candidate.assigned_to_name || candidate.assignedToName || "").trim();
  if (assigned) return assigned;
  // Applicants often arrive without an assigned recruiter. Avoid showing "Website Apply" as a
  // pseudo-recruiter bucket; treat them as unassigned until an admin maps/assigns them.
  if (isApplicant) return "Unassigned";
  // For many flows (extension capture), assigned_to_name can be empty even though
  // the candidate is clearly owned by a recruiter. Use recruiter_name / assessment recruiterName
  // as a safe fallback so dashboards and filters behave consistently.
  const owner =
    String(candidate.recruiter_name || candidate.recruiterName || "").trim() ||
    String(assessment.recruiterName || assessment.recruiter_name || "").trim();
  return owner || "Unassigned";
}

function candidateRowQualityScore(candidate = {}) {
  if (!candidate || typeof candidate !== "object") return 0;
  const assignedTo = String(candidate.assigned_to_name || candidate.assignedToName || "").trim();
  const phone = String(candidate.phone_number || candidate.phoneNumber || candidate.phone || "").trim();
  const email = String(candidate.email_id || candidate.emailId || candidate.email || "").trim();
  const linkedin = String(candidate.linkedin_url || candidate.linkedinUrl || candidate.linkedin || "").trim();
  const notes = String(candidate.notes || "").trim();
  const cv = String(candidate.pdf_filename || candidate.pdfFilename || "").trim();
  const updatedAt = String(candidate.updated_at || candidate.updatedAt || "").trim();
  const createdAt = String(candidate.created_at || candidate.createdAt || "").trim();
  const ts = Math.max(parseIsoDateValue(updatedAt)?.getTime() || 0, parseIsoDateValue(createdAt)?.getTime() || 0);
  return (
    (assignedTo ? 50 : 0)
    + (phone ? 8 : 0)
    + (email ? 8 : 0)
    + (linkedin ? 5 : 0)
    + (cv ? 4 : 0)
    + (notes ? Math.min(6, Math.ceil(notes.length / 80)) : 0)
    + (ts ? Math.min(10, Math.floor((Date.now() - ts) / 86400000) * -1) : 0)
  );
}

function buildKnownJdTitleSet(jobs = []) {
  return new Set(
    (Array.isArray(jobs) ? jobs : [])
      .map((job) => String(job?.title || job?.jdTitle || job?.jd_title || "").trim().toLowerCase())
      .filter(Boolean)
  );
}

function buildJobIndexById(jobs = []) {
  const map = new Map();
  (Array.isArray(jobs) ? jobs : []).forEach((job) => {
    const id = String(job?.id || "").trim();
    if (!id) return;
    map.set(id, {
      id,
      title: String(job?.title || job?.jdTitle || job?.jd_title || "").trim(),
      clientName: String(job?.clientName || job?.client_name || "").trim()
    });
  });
  return map;
}

function buildJobIndexByTitle(jobs = []) {
  const map = new Map();
  (Array.isArray(jobs) ? jobs : []).forEach((job) => {
    const title = String(job?.title || job?.jdTitle || job?.jd_title || "").trim();
    if (!title) return;
    map.set(title.toLowerCase(), {
      id: String(job?.id || "").trim(),
      title,
      clientName: String(job?.clientName || job?.client_name || "").trim()
    });
  });
  return map;
}

function resolveJobForDashboard(candidate = {}, assessment = {}, jobById = null, jobByTitle = null) {
  if (!(jobById instanceof Map)) return null;
  const candidateJobId = String(candidate?.assigned_jd_id || candidate?.assignedJdId || "").trim();
  const assessmentPayload = assessment?.payload && typeof assessment.payload === "object" ? assessment.payload : {};
  const assessmentJobId = String(assessment?.jobId || assessment?.job_id || assessmentPayload?.jobId || assessmentPayload?.job_id || "").trim();
  const id = candidateJobId || assessmentJobId;
  if (!id) return null;
  return jobById.get(id) || null;
}

function resolveJobForDashboardLoose(candidate = {}, assessment = {}, jobById = null, jobByTitle = null) {
  const resolvedById = resolveJobForDashboard(candidate, assessment, jobById, jobByTitle);
  if (resolvedById) return resolvedById;
  if (!(jobByTitle instanceof Map)) return null;
  const titleCandidates = [
    String(candidate?.assigned_jd_title || candidate?.assignedJdTitle || "").trim(),
    String(candidate?.jd_title || candidate?.jdTitle || "").trim()
  ].filter(Boolean);
  const assessmentPayload = assessment?.payload && typeof assessment.payload === "object" ? assessment.payload : {};
  const assessmentTitle = String(assessment?.jdTitle || assessment?.jd_title || assessmentPayload?.jdTitle || assessmentPayload?.jd_title || "").trim();
  if (assessmentTitle) titleCandidates.push(assessmentTitle);
  for (const title of titleCandidates) {
    const hit = jobByTitle.get(String(title).toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function getPositionLabel(candidate = {}, assessment = {}, knownJdTitles = null) {
  const candidates = [
    String(candidate.assigned_jd_title || candidate.assignedJdTitle || "").trim(),
    String(candidate.jd_title || candidate.jdTitle || "").trim(),
    String(assessment.jdTitle || assessment.jd_title || "").trim()
  ].filter(Boolean);
  if (knownJdTitles instanceof Set && knownJdTitles.size) {
    const matched = candidates.find((value) => knownJdTitles.has(value.toLowerCase()));
    return matched || "";
  }
  return "";
}

function parseIsoDateValue(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  // 1) Native parsing for ISO/RFC formats.
  const nativeStamp = new Date(text).getTime();
  if (Number.isFinite(nativeStamp)) return new Date(nativeStamp);

  // 2) Flexible parsing for common portal formats:
  // - "15/04/2026, 01:55:52"
  // - "15/04/2026 01:55"
  // - "15-04-2026"
  // - "04/15/2026" (less common, but handle)
  const cleaned = text.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const match = cleaned.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?(?:\s*(am|pm))?$/i);
  if (match) {
    const a = Number(match[1]);
    const b = Number(match[2]);
    const yearRaw = Number(match[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    let hour = match[4] != null ? Number(match[4]) : 0;
    const minute = match[5] != null ? Number(match[5]) : 0;
    const second = match[6] != null ? Number(match[6]) : 0;
    const meridiem = String(match[7] || "").toLowerCase();
    if (meridiem) {
      if (meridiem === "pm" && hour < 12) hour += 12;
      if (meridiem === "am" && hour === 12) hour = 0;
    }

    // Prefer dd/mm/yyyy (India) unless it is clearly mm/dd/yyyy.
    const dayFirst = a > 12 || b <= 12;
    const day = dayFirst ? a : b;
    const month = dayFirst ? b : a;
    if (year >= 1900 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const stamp = Date.UTC(year, month - 1, day, hour, minute, second);
      if (Number.isFinite(stamp)) return new Date(stamp);
    }
  }

  return null;
}

function parseDateInput(value, endOfDay = false) {
  const text = String(value || "").trim();
  if (!text) return null;
  const date = new Date(`${text}T${endOfDay ? "23:59:59" : "00:00:00"}`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isDateWithinRange(value, fromValue, toValue) {
  if (!fromValue && !toValue) return true;
  const date = parseIsoDateValue(value);
  if (!date) return false;
  const from = parseDateInput(fromValue, false);
  const to = parseDateInput(toValue, true);
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function getCandidateCreatedAt(candidate = {}) {
  return String(candidate.created_at || candidate.createdAt || "").trim();
}

function getCandidateConvertedAt(_candidate = {}, assessment = {}) {
  // "Converted/shared at" must reflect when assessment got created, not when
  // candidate/assessment records were later updated in bulk.
  return String(
    assessment.created_at ||
      assessment.createdAt ||
      assessment.generatedAt ||
      assessment.generated_at ||
      ""
  ).trim();
}

function normalizeDateOutput(value) {
  const parsed = parseIsoDateValue(value);
  return parsed ? parsed.toISOString() : "";
}

function normalizeNullableTimestampInput(value) {
  if (value === null) return null;
  const trimmed = String(value || "").trim();
  return trimmed ? trimmed : null;
}

function formatLocalDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRelativeMonthRange(monthOffset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999);
  return {
    from: formatLocalDateKey(start),
    to: formatLocalDateKey(end)
  };
}

function getRelativeDayRange(days = 0) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return {
    from: formatLocalDateKey(start),
    to: formatLocalDateKey(end)
  };
}

function getRelativeNamedDayRange(dayOffset = 0) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + dayOffset);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return {
    from: formatLocalDateKey(start),
    to: formatLocalDateKey(end)
  };
}

function getCurrentWeekRange() {
  const now = new Date();
  const start = new Date(now);
  const day = start.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diffToMonday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    from: formatLocalDateKey(start),
    to: formatLocalDateKey(end)
  };
}

function getNextWeekRange() {
  const current = getCurrentWeekRange();
  const start = new Date(`${current.from}T00:00:00`);
  start.setDate(start.getDate() + 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return {
    from: formatLocalDateKey(start),
    to: formatLocalDateKey(end)
  };
}

function getNamedMonthRange(monthName, year = new Date().getFullYear()) {
  const names = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const monthIndex = names.indexOf(String(monthName || "").trim().toLowerCase());
  if (monthIndex < 0) return { from: "", to: "" };
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return {
    from: formatLocalDateKey(start),
    to: formatLocalDateKey(end)
  };
}

function parseFreeformDateText(raw) {
  const text = String(raw || "")
    .trim()
    .replace(/\.$/, "")
    // Handle ordinal day tokens like "13th April 2026" which `new Date(...)` often fails to parse.
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1");
  if (!text) return "";
  const parsed = new Date(text);
  if (!Number.isFinite(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function createDashboardBucket() {
  return {
    sourced: 0,
    applied: 0,
    converted: 0,
    under_interview_process: 0,
    hold: 0,
    rejected: 0,
    duplicate: 0,
    dropped: 0,
    shortlisted: 0,
    offered: 0,
    joined: 0
  };
}

function createClientPortalBucket() {
  return {
    total_shared: 0,
    in_interview_stage: 0,
    to_be_reviewed: 0,
    rejected: 0,
    duplicates: 0,
    put_on_hold: 0,
    interview_dropout: 0
  };
}

function createDashboardRecruiterBucket() {
  return {
    metrics: createDashboardBucket(),
    ownership: {
      assignedSourcing: 0,
      selfSourced: 0,
      // Admin-only: how many of admin-sourced candidates were assigned out to the team.
      adminAssignedSourcing: 0,
      assignedApplicants: 0,
      directApplicants: 0,
      websiteApply: 0,
      otherInboxApplicants: 0,
      otherApplicants: 0,
      adminAssignedApplicants: 0
    }
  };
}

function incrementDashboardMetric(target, metric) {
  target[metric] = Number(target[metric] || 0) + 1;
}

function incrementClientPortalMetric(target, metric) {
  target[metric] = Number(target[metric] || 0) + 1;
}

function addCandidateMetrics(target, candidate, linkedAssessment, dateRange = {}) {
  let changed = false;
  const createdAt = getCandidateCreatedAt(candidate);
  const source = String(candidate?.source || "").trim().toLowerCase();
  const isApplicant = source === "website_apply" || source === "hosted_apply" || source === "google_sheet";
  if (isDateWithinRange(createdAt, dateRange.from, dateRange.to)) {
    incrementDashboardMetric(target, isApplicant ? "applied" : "sourced");
    changed = true;
  }
  const isConverted = Boolean(linkedAssessment?.id);
  if (!isConverted) return changed;
  const convertedAt = getCandidateConvertedAt(candidate, linkedAssessment || {});
  if (!isDateWithinRange(convertedAt, dateRange.from, dateRange.to)) return changed;
  incrementDashboardMetric(target, "converted");
  changed = true;
  const bucket = getAssessmentLifecycleBucket(linkedAssessment || {});
  if (isInterviewAlignedStatus(linkedAssessment?.candidateStatus || linkedAssessment?.candidate_status || linkedAssessment?.status || "")) {
    incrementDashboardMetric(target, "under_interview_process");
  }
  if (bucket === "hold") incrementDashboardMetric(target, "hold");
  if (bucket === "rejected") incrementDashboardMetric(target, "rejected");
  if (bucket === "duplicate") incrementDashboardMetric(target, "duplicate");
  if (bucket === "dropped") incrementDashboardMetric(target, "dropped");
  if (bucket === "shortlisted") incrementDashboardMetric(target, "shortlisted");
  if (bucket === "offered") incrementDashboardMetric(target, "offered");
  if (bucket === "joined") incrementDashboardMetric(target, "joined");
  return changed;
}

function addAssessmentOnlyMetrics(target, assessment, dateRange = {}) {
  if (!assessment) return false;
  const convertedAt = getCandidateConvertedAt({}, assessment || {});
  if (!isDateWithinRange(convertedAt, dateRange.from, dateRange.to)) return false;
  incrementDashboardMetric(target, "converted");
  const bucket = getAssessmentLifecycleBucket(assessment || {});
  if (isInterviewAlignedStatus(assessment?.candidateStatus || assessment?.candidate_status || assessment?.status || "")) {
    incrementDashboardMetric(target, "under_interview_process");
  }
  if (bucket === "hold") incrementDashboardMetric(target, "hold");
  if (bucket === "rejected") incrementDashboardMetric(target, "rejected");
  if (bucket === "duplicate") incrementDashboardMetric(target, "duplicate");
  if (bucket === "dropped") incrementDashboardMetric(target, "dropped");
  if (bucket === "shortlisted") incrementDashboardMetric(target, "shortlisted");
  if (bucket === "offered") incrementDashboardMetric(target, "offered");
  if (bucket === "joined") incrementDashboardMetric(target, "joined");
  return true;
}

function getCanonicalLinkedAssessmentForCandidate(candidate = {}, assessmentsById = null) {
  if (!(assessmentsById instanceof Map)) return null;
  const assessmentId = String(candidate?.assessment_id || candidate?.assessmentId || "").trim();
  if (!assessmentId) return null;
  const assessment = assessmentsById.get(assessmentId) || null;
  if (!assessment) return null;
  const candidateId = String(candidate?.id || "").trim();
  const linkedCandidateId = String(
    assessment?.candidateId ||
    assessment?.candidate_id ||
    assessment?.payload?.candidateId ||
    assessment?.payload?.candidate_id ||
    ""
  ).trim();
  if (!candidateId || !linkedCandidateId) return null;
  if (candidateId !== linkedCandidateId) return null;
  return assessment;
}

function addRecruiterOwnershipMetrics(target, recruiterLabel, candidate, linkedAssessment, dateRange = {}) {
  if (!target || !recruiterLabel || recruiterLabel === "Unassigned") return;
  const createdAt = getCandidateCreatedAt(candidate);
  if (!isDateWithinRange(createdAt, dateRange.from, dateRange.to)) return;
  const source = String(candidate?.source || "").trim().toLowerCase();
  const isApplicant = source === "website_apply" || source === "hosted_apply" || source === "google_sheet";
  const assignedLabel = getOwnerRecruiterLabel(candidate, linkedAssessment || {});
  const capturedByLabel = String(candidate?.recruiter_name || candidate?.recruiterName || "").trim();
  const capturedById = String(candidate?.recruiter_id || candidate?.recruiterId || "").trim();
  const assignedByLabel = String(candidate?.assigned_by_name || candidate?.assignedByName || "").trim();
  const assignedById = String(candidate?.assigned_by_user_id || candidate?.assignedByUserId || "").trim();
  const assignedToId = String(candidate?.assigned_to_user_id || candidate?.assignedToUserId || "").trim();
  const hasAssignedTo = Boolean(
    String(candidate?.assigned_to_user_id || candidate?.assignedToUserId || "").trim()
    || String(candidate?.assigned_to_name || candidate?.assignedToName || "").trim()
  );
  if (isApplicant) {
    const recruiterNeedle = String(recruiterLabel || "").trim().toLowerCase();
    const assignedByNeedle = String(assignedByLabel || "").trim().toLowerCase();

    // Admin view: attribute unassigned inbox applicants to admin bucket (handled earlier via owner label).
    // For any recruiter bucket, count applicants only when they are owned by that recruiter.
    if (assignedLabel === recruiterLabel) {
      const wasManuallyAssigned = Boolean(assignedByLabel);
      if (!hasAssignedTo) {
        // Inbox
        if (source === "website_apply") target.ownership.websiteApply = Number(target.ownership.websiteApply || 0) + 1;
        else target.ownership.otherInboxApplicants = Number(target.ownership.otherInboxApplicants || 0) + 1;
      } else if (wasManuallyAssigned) {
        target.ownership.assignedApplicants = Number(target.ownership.assignedApplicants || 0) + 1;
      } else {
        target.ownership.directApplicants = Number(target.ownership.directApplicants || 0) + 1;
      }

      // Admin metric: how many inbox applicants were assigned out by admin.
      if (recruiterNeedle && assignedByNeedle && recruiterNeedle === assignedByNeedle) {
        // This is the admin bucket; count assignments out (once they have an assignee).
        if (hasAssignedTo && wasManuallyAssigned) {
          target.ownership.adminAssignedApplicants = Number(target.ownership.adminAssignedApplicants || 0) + 1;
        }
      }
    }
    return;
  }
  // For sourcing, keep buckets disjoint:
  // - selfSourced: candidate currently owned by recruiter and was sourced by them (initial capture)
  // - assignedSourcing: candidate currently owned by recruiter but originally sourced by someone else (admin assigned)
  const recruiterNeedle = String(recruiterLabel || "").trim().toLowerCase();
  if (assignedLabel === recruiterLabel) {
    const assignedByNeedle = String(assignedByLabel || "").trim().toLowerCase();
    const capturedByNeedle = String(capturedByLabel || "").trim().toLowerCase();

    // Core rule:
    // If the note was captured by someone else (admin/team) and then assigned to this recruiter,
    // it must count as "assigned", not "self sourced". To avoid misclassifying true self-sourced
    // notes that were later re-assigned, we only treat "assigned" as canonical when the assigner
    // is the same entity as the original capturer (capturedBy == assignedBy) and the assignee differs.
    const assignedFromAnotherCapturer =
      Boolean(assignedById && capturedById && assignedToId && assignedById === capturedById && assignedById !== assignedToId)
      || Boolean(assignedByNeedle && capturedByNeedle && assignedByNeedle === capturedByNeedle && assignedByNeedle !== recruiterNeedle);

    if (assignedFromAnotherCapturer) {
      target.ownership.assignedSourcing = Number(target.ownership.assignedSourcing || 0) + 1;
    } else if (capturedByNeedle && capturedByNeedle === recruiterNeedle) {
      target.ownership.selfSourced = Number(target.ownership.selfSourced || 0) + 1;
    } else {
      // Fallback: if capture identity is missing, treat as assigned to avoid inflating self-sourced.
      target.ownership.assignedSourcing = Number(target.ownership.assignedSourcing || 0) + 1;
    }
    return;
  }
  // Admin-only: count how many admin-sourced candidates were assigned out to someone else.
  const capturedByNeedle = String(capturedByLabel || "").trim().toLowerCase();
  if (capturedByNeedle && capturedByNeedle === recruiterNeedle && hasAssignedTo) {
    target.ownership.adminAssignedSourcing = Number(target.ownership.adminAssignedSourcing || 0) + 1;
  }
}

function toDashboardBreakdownMap(itemsMap) {
  return Array.from(itemsMap.entries())
    .map(([label, metrics]) => ({ label, metrics }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function isInterviewAlignedStatus(status) {
  // Dashboard rule: "Feedback awaited" is still considered "Under interview" (interview happened, awaiting outcome).
  return /\b(screening call aligned|l1 aligned|l2 aligned|l3 aligned|hr interview aligned|aligned for interview|interview scheduled|feedback awaited)\b/i.test(String(status || ""));
}

function buildDashboardSummary({ candidates = [], assessments = [], jobs = [], dateFrom = "", dateTo = "", clientFilter = "", recruiterFilter = "", actor = null }) {
  const overall = createDashboardBucket();
  const byClient = new Map();
  const byOwnerRecruiter = new Map();
  const byClientRecruiter = new Map();
  const byClientPosition = new Map();
  const knownJdTitles = buildKnownJdTitleSet(jobs);
  const jobById = buildJobIndexById(jobs);
  const jobByTitle = buildJobIndexByTitle(jobs);
  const assessmentsById = new Map(
    (Array.isArray(assessments) ? assessments : []).map((item) => [String(item?.id || "").trim(), item])
  );
  // Avoid double-counting conversion metrics if duplicate candidate rows reference the same assessment.
  const countedAssessmentIds = new Set();
  const actorName = actor && typeof actor === "object" ? String(actor?.name || "").trim() : "";
  const actorIsAdmin = actor && typeof actor === "object"
    ? String(actor?.role || "").toLowerCase() === "admin"
    : false;
  const dateRange = { from: dateFrom, to: dateTo };

  // Deduplicate candidates that reference the same linked assessment.
  // Without this, the same assessment can show up under multiple recruiter buckets when
  // duplicate candidate rows exist (e.g. re-capture + conversion).
  const canonicalCandidates = (() => {
    const looseCandidates = [];
    const bestByAssessment = new Map();
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const linkedAssessment = getCanonicalLinkedAssessmentForCandidate(candidate, assessmentsById) || null;
      const assessmentId = String(linkedAssessment?.id || "").trim();
      if (!assessmentId) {
        looseCandidates.push(candidate);
        continue;
      }
      const existing = bestByAssessment.get(assessmentId) || null;
      if (!existing) {
        bestByAssessment.set(assessmentId, candidate);
        continue;
      }
      const prevScore = candidateRowQualityScore(existing);
      const nextScore = candidateRowQualityScore(candidate);
      if (nextScore > prevScore) bestByAssessment.set(assessmentId, candidate);
    }
    return [...looseCandidates, ...Array.from(bestByAssessment.values())];
  })();

  // Admin block should show overall pipeline metrics, plus simple admin activity counts:
  // - Sourcing (self sourced + assigned to team)
  // - Applicants (inbox split by source + assigned to team)
  const adminOwnership = actorIsAdmin && actorName
    ? {
      sourcedTotal: 0,
      sourcedAssignedToTeam: 0,
      applicantWebsite: 0,
      applicantHosted: 0,
      applicantOther: 0,
      applicantsAssignedToTeam: 0
    }
    : null;

  for (const candidate of canonicalCandidates) {
    const linkedAssessment = getCanonicalLinkedAssessmentForCandidate(candidate, assessmentsById) || null;
    const resolvedJob = resolveJobForDashboardLoose(candidate, linkedAssessment || {}, jobById, jobByTitle);
    const source = String(candidate?.source || "").trim().toLowerCase();
    const isApplicant = source === "website" || source === "website_apply" || source === "hosted_apply" || source === "google_sheet";
    const rawPosition = String(candidate?.assigned_jd_title || candidate?.assignedJdTitle || candidate?.jd_title || candidate?.jdTitle || "").trim();
    // Website/hosted applicants can refer to jobs that are no longer in the system.
    // Keep them visible, but group them under a clear "Unmapped candidates" bucket so
    // they don't pollute real client breakdowns.
    const isUnmappedApplicant = isApplicant && !resolvedJob && Boolean(rawPosition);
    const clientLabel = isUnmappedApplicant
      ? "Unmapped candidates"
      : (resolvedJob?.clientName || getClientLabel(candidate, linkedAssessment || {}));
    if (clientFilter && clientLabel !== clientFilter) continue;
    let ownerRecruiterLabel = getOwnerRecruiterLabel(candidate, linkedAssessment || {});
    // Admin dashboard: keep unassigned applicants in admin's inbox bucket (avoid "Website Apply"/"Unassigned" pseudo recruiter).
    if (actorIsAdmin && actorName && isApplicant && ownerRecruiterLabel === "Unassigned") {
      ownerRecruiterLabel = actorName;
    }
    if (recruiterFilter && ownerRecruiterLabel !== recruiterFilter) continue;
    const positionLabel = isUnmappedApplicant
      ? rawPosition
      : (resolvedJob?.title || getPositionLabel(candidate, linkedAssessment || {}, knownJdTitles));
    const createdAt = getCandidateCreatedAt(candidate);

    if (adminOwnership && isDateWithinRange(createdAt, dateRange.from, dateRange.to)) {
      if (source === "website_apply") adminOwnership.applicantWebsite += 1;
      else if (source === "hosted_apply") adminOwnership.applicantHosted += 1;
      else if (source === "google_sheet") adminOwnership.applicantOther += 1;

      const capturedBy = String(candidate?.recruiter_name || candidate?.recruiterName || "").trim();
      if (capturedBy && capturedBy.toLowerCase() === actorName.toLowerCase() && !isApplicant) {
        adminOwnership.sourcedTotal += 1;
        const assignedTo = String(candidate?.assigned_to_name || candidate?.assignedToName || "").trim();
        if (assignedTo && assignedTo.toLowerCase() !== actorName.toLowerCase()) {
          adminOwnership.sourcedAssignedToTeam += 1;
        }
      }

      const assignedBy = String(candidate?.assigned_by_name || candidate?.assignedByName || "").trim();
      const assignedTo = String(candidate?.assigned_to_name || candidate?.assignedToName || "").trim();
      if (assignedBy && assignedBy.toLowerCase() === actorName.toLowerCase() && isApplicant && assignedTo && assignedTo.toLowerCase() !== actorName.toLowerCase()) {
        adminOwnership.applicantsAssignedToTeam += 1;
      }
    }
    // Dedupe conversion metrics by assessment id (legacy duplicates can exist).
    let effectiveAssessment = linkedAssessment;
    if (effectiveAssessment?.id) {
      const assessmentId = String(effectiveAssessment.id || "").trim();
      if (assessmentId && countedAssessmentIds.has(assessmentId)) {
        effectiveAssessment = null;
      } else if (assessmentId) {
        countedAssessmentIds.add(assessmentId);
      }
    }
    const contributes = addCandidateMetrics(overall, candidate, effectiveAssessment, dateRange);
    if (!contributes) continue;
    if (!byClient.has(clientLabel)) byClient.set(clientLabel, createDashboardBucket());
    if (!byOwnerRecruiter.has(ownerRecruiterLabel)) byOwnerRecruiter.set(ownerRecruiterLabel, createDashboardRecruiterBucket());
    addCandidateMetrics(byClient.get(clientLabel), candidate, effectiveAssessment, dateRange);
    addCandidateMetrics(byOwnerRecruiter.get(ownerRecruiterLabel).metrics, candidate, effectiveAssessment, dateRange);
    addRecruiterOwnershipMetrics(byOwnerRecruiter.get(ownerRecruiterLabel), ownerRecruiterLabel, candidate, effectiveAssessment, dateRange);

    // Do not create extra buckets based on captured-by; keep recruiter buckets purely ownership-based.
    if (positionLabel) {
      const matrixKey = `${clientLabel}|||${positionLabel}|||${ownerRecruiterLabel}`;
      const clientPositionKey = `${clientLabel}|||${positionLabel}`;
      if (!byClientRecruiter.has(matrixKey)) {
        byClientRecruiter.set(matrixKey, {
          clientLabel,
          positionLabel,
          recruiterLabel: ownerRecruiterLabel,
          metrics: createDashboardBucket()
        });
      }
      if (!byClientPosition.has(clientPositionKey)) {
        byClientPosition.set(clientPositionKey, { clientLabel, positionLabel, metrics: createDashboardBucket() });
      }
      addCandidateMetrics(byClientRecruiter.get(matrixKey).metrics, candidate, effectiveAssessment, dateRange);
      addCandidateMetrics(byClientPosition.get(clientPositionKey).metrics, candidate, effectiveAssessment, dateRange);
    }
  }

  // No credit bucket.

  // Include assessments that are not canonically linked to a candidate row (assessment-only / legacy).
  for (const assessment of Array.isArray(assessments) ? assessments : []) {
    const assessmentId = String(assessment?.id || "").trim();
    if (!assessmentId || countedAssessmentIds.has(assessmentId)) continue;
    const resolvedJob = resolveJobForDashboardLoose({}, assessment || {}, jobById, jobByTitle);
    const clientLabel = resolvedJob?.clientName || getClientLabel({}, assessment || {});
    if (clientFilter && clientLabel !== clientFilter) continue;
    const ownerRecruiterLabel = getOwnerRecruiterLabel({}, assessment || {});
    if (recruiterFilter && ownerRecruiterLabel !== recruiterFilter) continue;
    const positionLabel = resolvedJob?.title || getPositionLabel({}, assessment || {}, knownJdTitles);
    const dateRange = { from: dateFrom, to: dateTo };
    const contributes = addAssessmentOnlyMetrics(overall, assessment, dateRange);
    if (!contributes) continue;
    countedAssessmentIds.add(assessmentId);
    if (!byClient.has(clientLabel)) byClient.set(clientLabel, createDashboardBucket());
    if (!byOwnerRecruiter.has(ownerRecruiterLabel)) byOwnerRecruiter.set(ownerRecruiterLabel, createDashboardRecruiterBucket());
    addAssessmentOnlyMetrics(byClient.get(clientLabel), assessment, dateRange);
    addAssessmentOnlyMetrics(byOwnerRecruiter.get(ownerRecruiterLabel).metrics, assessment, dateRange);
    if (positionLabel) {
      const matrixKey = `${clientLabel}|||${positionLabel}|||${ownerRecruiterLabel}`;
      const clientPositionKey = `${clientLabel}|||${positionLabel}`;
      if (!byClientRecruiter.has(matrixKey)) {
        byClientRecruiter.set(matrixKey, {
          clientLabel,
          positionLabel,
          recruiterLabel: ownerRecruiterLabel,
          metrics: createDashboardBucket()
        });
      }
      if (!byClientPosition.has(clientPositionKey)) {
        byClientPosition.set(clientPositionKey, { clientLabel, positionLabel, metrics: createDashboardBucket() });
      }
      addAssessmentOnlyMetrics(byClientRecruiter.get(matrixKey).metrics, assessment, dateRange);
      addAssessmentOnlyMetrics(byClientPosition.get(clientPositionKey).metrics, assessment, dateRange);
    }
  }

  // Override the admin bucket to behave as a company-level summary.
  if (adminOwnership && actorName) {
    if (!byOwnerRecruiter.has(actorName)) byOwnerRecruiter.set(actorName, createDashboardRecruiterBucket());
    const bucket = byOwnerRecruiter.get(actorName);
    // Keep bucket.metrics ownership-based (what admin currently owns / not assigned out).
    bucket.ownership = bucket.ownership && typeof bucket.ownership === "object" ? bucket.ownership : {};
    bucket.ownership.selfSourced = adminOwnership.sourcedTotal;
    bucket.ownership.adminAssignedSourcing = adminOwnership.sourcedAssignedToTeam;
    bucket.ownership.websiteApply = adminOwnership.applicantWebsite;
    bucket.ownership.otherInboxApplicants = adminOwnership.applicantHosted;
    bucket.ownership.otherApplicants = adminOwnership.applicantOther;
    bucket.ownership.adminAssignedApplicants = adminOwnership.applicantsAssignedToTeam;
  }

  return {
    overall,
    byClient: toDashboardBreakdownMap(byClient),
    byOwnerRecruiter: Array.from(byOwnerRecruiter.entries())
      .map(([label, value]) => ({ label, metrics: value.metrics, ownership: value.ownership }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    byClientPosition: Array.from(byClientPosition.values()).sort((a, b) =>
      `${a.clientLabel} ${a.positionLabel}`.localeCompare(`${b.clientLabel} ${b.positionLabel}`)
    ),
    byClientRecruiter: Array.from(byClientRecruiter.values()).sort((a, b) =>
      `${a.clientLabel} ${a.recruiterLabel}`.localeCompare(`${b.clientLabel} ${b.recruiterLabel}`)
    ),
    dateRange: {
      from: String(dateFrom || "").trim(),
      to: String(dateTo || "").trim()
    },
    clientFilter: String(clientFilter || "").trim(),
    recruiterFilter: String(recruiterFilter || "").trim()
  };
}

function getClientPortalLifecycleBucket(item) {
  const status = normalizeDashboardText(item?.candidateStatus || item?.candidate_status || item?.status || "");
  const combined = `${status}`.trim();
  if (combined.includes("duplicate")) return "duplicates";
  if (DASHBOARD_REJECTED_STATUSES.has(status)) return "rejected";
  if (DASHBOARD_DROPPED_STATUSES.has(status)) return "interview_dropout";
  if (status === "hold" || combined.includes("on hold")) return "put_on_hold";
  if (!status || status === "cv shared" || status === "cv to be shared" || status === "feedback awaited") return "to_be_reviewed";
  return "in_interview_stage";
}

function addClientPortalMetrics(target, item, dateRange = {}) {
  const sharedAt = String(item?.sharedAt || "").trim();
  if (!sharedAt || item?.sourceType === "captured_note" || !isDateWithinRange(sharedAt, dateRange.from, dateRange.to)) {
    return false;
  }
  incrementClientPortalMetric(target, "total_shared");
  incrementClientPortalMetric(target, getClientPortalLifecycleBucket(item));
  return true;
}

function buildClientPortalSummary({ candidates = [], assessments = [], jobs = [], dateFrom = "", dateTo = "", clientFilter = "" }) {
  const overall = createClientPortalBucket();
  const byClient = new Map();
  const byClientPosition = new Map();
  const byStatus = new Map();
  const universe = buildCandidateSearchUniverse(candidates, assessments, jobs).filter((item) => item.sourceType !== "assessment_only");
  const dateRange = { from: dateFrom, to: dateTo };

  for (const item of universe) {
    const clientLabel = String(item?.clientName || "Unassigned").trim() || "Unassigned";
    if (clientFilter && clientLabel !== clientFilter) continue;
    const contributes = addClientPortalMetrics(overall, item, dateRange);
    if (!contributes) continue;
    const statusBucket = getClientPortalLifecycleBucket(item);
    byStatus.set(statusBucket, Number(byStatus.get(statusBucket) || 0) + 1);
    if (!byClient.has(clientLabel)) byClient.set(clientLabel, createClientPortalBucket());
    addClientPortalMetrics(byClient.get(clientLabel), item, dateRange);
    const positionLabel = String(item?.position || item?.jdTitle || item?.role || "Unassigned").trim() || "Unassigned";
    const key = `${clientLabel}|||${positionLabel}`;
    if (!byClientPosition.has(key)) byClientPosition.set(key, { clientLabel, positionLabel, metrics: createClientPortalBucket() });
    addClientPortalMetrics(byClientPosition.get(key).metrics, item, dateRange);
  }

  return {
    overall,
    byClient: Array.from(byClient.entries())
      .map(([label, metrics]) => ({ label, metrics }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    byClientPosition: Array.from(byClientPosition.values()).sort((a, b) =>
      `${a.clientLabel} ${a.positionLabel}`.localeCompare(`${b.clientLabel} ${b.positionLabel}`)
    ),
    byStatus: Array.from(byStatus.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label))),
    dateRange: {
      from: String(dateFrom || "").trim(),
      to: String(dateTo || "").trim()
    },
    clientFilter: String(clientFilter || "").trim()
  };
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function isDateInClientAgendaWindow(value, dateRange = {}) {
  const parsed = parseIsoDateValue(value);
  if (!parsed) return false;
  if (dateRange.from || dateRange.to) return isDateWithinRange(value, dateRange.from, dateRange.to);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + 45);
  end.setHours(23, 59, 59, 999);
  return parsed >= today && parsed <= end;
}

function buildClientPortalAgenda(scopedUniverse = [], dateRange = {}) {
  const interviews = [];
  const joinings = [];
  const seen = new Set();
  for (const item of Array.isArray(scopedUniverse) ? scopedUniverse : []) {
    if (!item || item.sourceType === "captured_note") continue;
    const assessment = item.raw?.assessment || {};
    const assessmentId = String(assessment.id || item.id || "").trim();
    if (!assessmentId || seen.has(assessmentId)) continue;
    seen.add(assessmentId);
    const status = String(assessment.candidateStatus || item.candidateStatus || "").trim();
    const normalizedStatus = normalizeDashboardText(status);
    const base = {
      id: assessmentId,
      assessmentId,
      candidateName: String(assessment.candidateName || item.candidateName || "").trim(),
      position: String(assessment.jdTitle || item.position || item.role || "Untitled role").trim(),
      company: String(assessment.currentCompany || item.company || "").trim(),
      status
    };
    const interviewAt = normalizeDateOutput(assessment.interviewAt || item.interviewAt || "");
    if (isInterviewAlignedStatus(status) && isDateInClientAgendaWindow(interviewAt, dateRange)) {
      interviews.push({ ...base, kind: "interview", at: interviewAt });
    }
    const joiningAt = normalizeDateOutput(assessment.offerDoj || item.offerDoj || assessment.followUpAt || item.followUpAt || "");
    if (normalizedStatus === "offered" && isDateInClientAgendaWindow(joiningAt, dateRange)) {
      joinings.push({ ...base, kind: "joining", at: joiningAt });
    }
  }
  const byDate = (a, b) => String(a.at || "").localeCompare(String(b.at || ""));
  return {
    interviews: interviews.sort(byDate).slice(0, 50),
    joinings: joinings.sort(byDate).slice(0, 50)
  };
}

function findBestCandidateByIdentity(candidates = [], criteria = {}) {
  const targetId = String(criteria.candidateId || "").trim();
  const targetEmail = String(criteria.email || "").trim().toLowerCase();
  const targetPhone = normalizePhoneDigits(criteria.phone || "");
  const targetName = String(criteria.name || "").trim().toLowerCase();
  const targetJd = String(criteria.jdTitle || "").trim().toLowerCase();
  let best = null;
  let bestScore = -1;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    let score = 0;
    const candidateId = String(candidate?.id || "").trim();
    const candidateEmail = String(candidate?.email || "").trim().toLowerCase();
    const candidatePhone = normalizePhoneDigits(candidate?.phone || "");
    const candidateName = String(candidate?.name || "").trim().toLowerCase();
    const candidateJd = String(candidate?.jd_title || candidate?.jdTitle || "").trim().toLowerCase();
    if (targetId && candidateId && targetId === candidateId) score += 200;
    if (targetEmail && candidateEmail && targetEmail === candidateEmail) score += 120;
    if (targetPhone && candidatePhone && targetPhone === candidatePhone) score += 120;
    if (targetName && candidateName && targetName === candidateName) score += 70;
    if (targetJd && candidateJd && targetJd === candidateJd) score += 20;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function pickBestCandidateForAssessment(assessment = {}, candidates = []) {
  const exactCandidateId = String(assessment?.candidateId || assessment?.candidate_id || "").trim();
  if (exactCandidateId) {
    const exactMatch = candidates.find((candidate) => String(candidate?.id || "").trim() === exactCandidateId);
    if (exactMatch) return exactMatch;
  }
  const assessmentId = String(assessment?.id || "").trim();
  if (assessmentId) {
    const linkedMatch = candidates.find((candidate) => String(candidate?.assessment_id || candidate?.assessmentId || "").trim() === assessmentId);
    if (linkedMatch) return linkedMatch;
  }
  const targetName = String(assessment?.candidateName || "").trim().toLowerCase();
  const targetEmail = String(assessment?.emailId || assessment?.email || "").trim().toLowerCase();
  const targetPhone = normalizePhoneDigits(assessment?.phoneNumber || assessment?.phone || "");
  const targetJd = String(assessment?.jdTitle || assessment?.jd_title || "").trim().toLowerCase();
  const targetCompany = String(assessment?.currentCompany || assessment?.company || "").trim().toLowerCase();
  const targetRole = String(assessment?.currentDesignation || assessment?.role || "").trim().toLowerCase();

  let best = null;
  let bestScore = -1;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    let score = 0;
    const candidateId = String(candidate?.id || "").trim();
    if (!candidateId) continue;
    const candidateAssessmentId = String(candidate?.assessment_id || candidate?.assessmentId || "").trim();
    const candidateName = String(candidate?.name || "").trim().toLowerCase();
    const candidateEmail = String(candidate?.email || "").trim().toLowerCase();
    const candidatePhone = normalizePhoneDigits(candidate?.phone || "");
    const candidateJd = String(candidate?.jd_title || candidate?.jdTitle || "").trim().toLowerCase();
    const candidateCompany = String(candidate?.company || "").trim().toLowerCase();
    const candidateRole = String(candidate?.role || "").trim().toLowerCase();

    if (assessmentId && candidateAssessmentId === assessmentId) score += 120;
    if (targetEmail && candidateEmail && targetEmail === candidateEmail) score += 100;
    if (targetPhone && candidatePhone && targetPhone === candidatePhone) score += 100;
    if (targetName && candidateName && targetName === candidateName) score += 60;
    if (targetJd && candidateJd && targetJd === candidateJd) score += 25;
    if (targetCompany && candidateCompany && targetCompany === candidateCompany) score += 15;
    if (targetRole && candidateRole && targetRole === candidateRole) score += 15;

    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

function pickBestAssessmentForCandidate(candidate = {}, assessments = []) {
  const candidateAssessmentId = String(candidate?.assessment_id || candidate?.assessmentId || "").trim();
  if (candidateAssessmentId) {
    const exactLinked = assessments.find((assessment) => String(assessment?.id || "").trim() === candidateAssessmentId);
    if (exactLinked) return exactLinked;
  }
  const targetName = String(candidate?.name || "").trim().toLowerCase();
  const targetEmail = String(candidate?.email || "").trim().toLowerCase();
  const targetPhone = normalizePhoneDigits(candidate?.phone || "");
  const targetJd = String(candidate?.jd_title || candidate?.jdTitle || "").trim().toLowerCase();
  const targetCompany = String(candidate?.company || "").trim().toLowerCase();
  const targetRole = String(candidate?.role || "").trim().toLowerCase();

  let best = null;
  let bestScore = -1;
  for (const assessment of Array.isArray(assessments) ? assessments : []) {
    let score = 0;
    const assessmentId = String(assessment?.id || "").trim();
    const linkedCandidateId = String(assessment?.candidateId || assessment?.candidate_id || "").trim();
    const assessmentName = String(assessment?.candidateName || "").trim().toLowerCase();
    const assessmentEmail = String(assessment?.emailId || assessment?.email || "").trim().toLowerCase();
    const assessmentPhone = normalizePhoneDigits(assessment?.phoneNumber || assessment?.phone || "");
    const assessmentJd = String(assessment?.jdTitle || assessment?.jd_title || "").trim().toLowerCase();
    const assessmentCompany = String(assessment?.currentCompany || assessment?.company || "").trim().toLowerCase();
    const assessmentRole = String(assessment?.currentDesignation || assessment?.role || "").trim().toLowerCase();

    if (candidateAssessmentId && assessmentId && candidateAssessmentId === assessmentId) score += 200;
    if (linkedCandidateId && String(candidate?.id || "").trim() === linkedCandidateId) score += 180;
    if (targetEmail && assessmentEmail && targetEmail === assessmentEmail) score += 120;
    if (targetPhone && assessmentPhone && targetPhone === assessmentPhone) score += 120;
    if (targetName && assessmentName && targetName === assessmentName) score += 70;
    if (targetJd && assessmentJd && targetJd === assessmentJd) score += 25;
    if (targetCompany && assessmentCompany && targetCompany === assessmentCompany) score += 15;
    if (targetRole && assessmentRole && targetRole === assessmentRole) score += 15;

    if (score > bestScore) {
      best = assessment;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : null;
}

async function backfillCandidateAssessmentLinks(user) {
  const actor = user || {};
  if (!actor?.id || !actor?.companyId) return { linked: 0 };
  const [candidates, assessments] = await Promise.all([
    listCandidatesForUser(actor, { limit: 5000 }),
    listAssessments({ actorUserId: actor.id, companyId: actor.companyId })
  ]);
  let linked = 0;
  for (const assessment of Array.isArray(assessments) ? assessments : []) {
    const matchedCandidate = pickBestCandidateForAssessment(assessment, candidates);
    if (!matchedCandidate) continue;
    const assessmentId = String(assessment?.id || "").trim();
    const currentAssessmentId = String(matchedCandidate?.assessment_id || matchedCandidate?.assessmentId || "").trim();
    const needsLink = !matchedCandidate?.used_in_assessment || !currentAssessmentId || currentAssessmentId !== assessmentId;
    if (!needsLink) continue;
    await linkCandidateToAssessment(String(matchedCandidate.id || "").trim(), assessmentId, { companyId: actor.companyId });
    matchedCandidate.used_in_assessment = true;
    matchedCandidate.assessment_id = assessmentId;
    linked += 1;
  }
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const currentAssessmentId = String(candidate?.assessment_id || candidate?.assessmentId || "").trim();
    const needsRepair = Boolean(candidate?.used_in_assessment) || !currentAssessmentId;
    if (!needsRepair) continue;
    const matchedAssessment = pickBestAssessmentForCandidate(candidate, assessments);
    if (!matchedAssessment?.id) continue;
    const matchedAssessmentId = String(matchedAssessment.id || "").trim();
    if (currentAssessmentId === matchedAssessmentId && candidate?.used_in_assessment) continue;
    await linkCandidateToAssessment(String(candidate.id || "").trim(), matchedAssessmentId, { companyId: actor.companyId });
    candidate.used_in_assessment = true;
    candidate.assessment_id = matchedAssessmentId;
    linked += 1;
  }
  return { linked };
}

async function backfillCandidateSkillsFromMetadata(user) {
  const actor = user || {};
  if (!actor?.id || !actor?.companyId) return { updated: 0 };
  const candidates = await listCandidatesForUser(actor, { limit: 5000 });
  let updated = 0;
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const meta = decodeApplicantMetadata(candidate);
    const inferredFromMeta = Array.isArray(meta?.inferredSearchTags) ? meta.inferredSearchTags : [];
    const inferred = deriveInferredSearchTags({
      cvResult: getVersionedCvAnalysisResult(meta) || null,
      recruiterNotes: candidate?.recruiter_context_notes || "",
      otherPointers: candidate?.other_pointers || "",
      tags: Array.isArray(candidate?.skills) ? candidate.skills : inferredFromMeta
    });
    const nextSkills = Array.from(
      new Set([...(Array.isArray(candidate?.skills) ? candidate.skills : []), ...inferredFromMeta, ...inferred].map((item) => String(item || "").trim()).filter(Boolean))
    );
    const currentSkills = Array.isArray(candidate?.skills) ? candidate.skills.map((item) => String(item || "").trim()).filter(Boolean) : [];
    if (JSON.stringify(currentSkills) === JSON.stringify(nextSkills)) continue;
    await patchCandidate(String(candidate.id || "").trim(), { skills: nextSkills }, { companyId: actor.companyId });
    updated += 1;
  }
  return { updated };
}

function parseNaturalLanguageCandidateQuery(rawQuery) {
  const query = String(rawQuery || "").trim();
  const lower = query.toLowerCase();
  const deterministic = parseDeterministicRecruiterQuery(query, DEFAULT_SYNONYMS);
  const statusNoiseRegex = /\b(feedback awaited|awaiting feedback|awaited feedback|not received|not responding|no response|nr|call later|call back later|switch off|switched off|not reachable|disconnected|busy|jd shared|shared jd|interested|not interested|revisit for other role|screening reject|interview reject|duplicate|shortlisted|offered|joined|hold)\b/ig;
  const upcomingJoiningsIntent = /\bupcoming\s+joining(?:s)?\b/i.test(lower);
  const minExperienceMatch = lower.match(/(\d+(?:\.\d+)?)\s*\+?\s*years?/);
  const maxExperienceMatch = lower.match(/\b(?:under|less than|max)\s+(\d+(?:\.\d+)?)\s*years?/);
  const locationMatch = lower.match(/\b(?:based out of|based in|located in|in|from)\s+([a-z][a-z\s]+?)(?:\s+\bwith\b|\s+\bunder\b|\s+\bbelow\b|\s+\bfor\b|$)/i);
  const ctcAboveMatch = lower.match(/\b(?:current\s+ctc\s+(?:above|over|more than|min|minimum)|ctc\s+(?:above|over|more than|min|minimum)|package\s+(?:above|over|more than|min|minimum)|more than)\s+(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)?\b/i);
  const ctcUnderMatch = lower.match(/\b(?:current\s+ctc\s+under|ctc\s+under|under|below)\s+(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)?\b/i);
  const expectedCtcAboveMatch = lower.match(/\b(?:expected\s+ctc\s+(?:above|over|more than|min|minimum))\s+(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)?\b/i);
  const expectedCtcUnderMatch = lower.match(/\b(?:expected\s+ctc\s+under)\s+(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)?\b/i);
  const noticeMatch = lower.match(/\b(?:notice\s+period\s+under|notice\s+under|notice period of)\s+(\d+(?:\.\d+)?)\s*(days?|months?)\b/i);
  const skillMatch = lower.match(/\b(?:with skills?|skills?|having)\s+([a-z0-9,+/&\s-]+?)(?:\bwith\b|\bbased\b|\bfor\b|$)/i);
  const currentCompanyMatch = lower.match(/\b(?:from current company|in current company|currently at)\s+([a-z0-9][a-z0-9\s&.-]+?)(?:\bwith\b|\bbased\b|$)/i);
  const locationListMatch =
    // Support "delhi an gurugram" typo as well ("an" -> "and").
    lower.match(/\b(?:in|from|based in|based out of|located in)\s+([a-z][a-z\s]+(?:\s+(?:or|and|an)\s+[a-z][a-z\s]+)+)\b/i) ||
    null;
  const interviewIntent = /\b(?:aligned|interview(?:s)?|scheduled)\b/i.test(lower);
  const recruiterScopeMe = /\b(?:i|me|my)\s+(?:sourced|captured|shared|converted)\b/i.test(lower) || /\bthat i (?:sourced|captured|shared|converted)\b/i.test(lower);
  const capturedNotesIntent = /\bcaptured\s+notes?\b|\bnotes?\s+captured\b/i.test(lower);
  const appliedIntent = /\bapplied\b|\bapplicants?\b|\bwebsite\s+apply\b|\bhosted\s+apply\b/i.test(lower);
  // recruiter attribution intent (who captured it first, not current owner/assignee)
  const capturedByIntent = /\b(?:captured|sourced|added|created)\s+by\b|\b(?:captured|sourced)\s+from\b/i.test(lower);
  const hasFeedbackAwaited = /\b(feedback awaited|awaiting feedback|awaited feedback)\b/i.test(lower);
  let assessmentIntent = /\bassessments?\b/i.test(lower);
  let convertedIntent = /\b(?:shared|converted|cv shared|cv to be shared)\b/i.test(lower);
  // Treat "feedback awaited" as an assessment-status intent even if the recruiter doesn't say "assessment".
  if (hasFeedbackAwaited) {
    assessmentIntent = true;
    convertedIntent = true;
  }
  const recruiterNameMatch = lower.match(/\bby\s+([a-z][a-z\s.-]+?)(?:\s+for\b|\s+in\b|\s+this\b|\s+last\b|\s+today\b|\s+tomorrow\b|\s+and\b|\s+are\b|\s+with\b|\s+who\b|\s+whose\b|$)/i);
  const assignedToMatch = lower.match(/\bassigned\s+to\s+([a-z][a-z\s.-]+?)(?:\s+for\b|\s+in\b|\s+this\b|\s+last\b|\s+today\b|\s+tomorrow\b|\s+and\b|\s+are\b|\s+with\b|\s+who\b|\s+whose\b|$)/i);
  // JD/role scoping can come as:
  // - "profiles shared for <role> in <client>"
  // - "profiles shared under <role> in <client>"
  // Keep this deterministic and avoid numeric phrases like "under 15 days".
  const targetLabelMatch =
    lower.match(/\bfor\s+([a-z0-9][a-z0-9\s&.-]+?)(?:\s+across roles|\s+this week|\s+tomorrow|\s+today|\s+last month|\s+this month|\s+from\s|\s+with\s|\s+under\b|\s+in\s|$)/i)
    || lower.match(/\bunder\s+([a-z][a-z0-9\s&.-]+?)(?:\s+across roles|\s+this week|\s+tomorrow|\s+today|\s+last month|\s+this month|\s+from\s|\s+with\s|\s+for\s|\s+in\s|$)/i);
  const statusTerms = [];
  const detailedStatusTerms = [];
  const attemptOutcomeCandidates = [];
  const assessmentStatusCandidates = [];
  if (/\bshortlisted\b/i.test(lower)) statusTerms.push("shortlisted");
  if (/\boffered\b|\boffer\b/i.test(lower)) statusTerms.push("offered");
  if (/\bjoined\b/i.test(lower)) statusTerms.push("joined");
  if (/\breject(?:ed)?\b/i.test(lower)) statusTerms.push("rejected");
  if (/\bduplicate\b/i.test(lower)) statusTerms.push("duplicate");
  if (/\bdropped\b|\bdid not attend\b|\bnot responding\b|\bno response\b|\bno answer\b|\bnr\b/i.test(lower)) statusTerms.push("dropped");
  if (hasFeedbackAwaited) detailedStatusTerms.push("feedback awaited");
  if (/\bscreening reject\b/i.test(lower)) detailedStatusTerms.push("screening reject");
  if (/\binterview reject\b/i.test(lower)) detailedStatusTerms.push("interview reject");
  if (/\bhold\b/i.test(lower)) detailedStatusTerms.push("hold");
  if (/\bdid not attend\b|\bnot responding\b|\bno response\b|\bno answer\b|\bnr\b/i.test(lower)) detailedStatusTerms.push("not responding");
  if (/\bunder process\b/i.test(lower)) detailedStatusTerms.push("under process");
  if (/\baligned\b|\binterview aligned\b|\bl1 aligned\b|\bl2 aligned\b|\bl3 aligned\b|\bhr interview aligned\b/i.test(lower)) detailedStatusTerms.push("aligned");
  if (/\bnot received\b|\bno response\b|\bnot responding\b|\bno answer\b|\bnr\b/i.test(lower)) detailedStatusTerms.push("not received");
  if (/\bnot reachable\b/i.test(lower)) detailedStatusTerms.push("not reachable");
  if (/\bbusy\b|\bcall busy\b/i.test(lower)) detailedStatusTerms.push("busy");
  if (/\bswitch off\b|\bswitched off\b/i.test(lower)) detailedStatusTerms.push("switch off");
  if (/\bdisconnected\b/i.test(lower)) detailedStatusTerms.push("disconnected");
  if (/\bcall back later\b|\bcall later\b/i.test(lower)) detailedStatusTerms.push("call later");
  if (/\binterested\b/i.test(lower)) detailedStatusTerms.push("interested");
  if (/\bnot interested\b/i.test(lower)) detailedStatusTerms.push("not interested");
  if (/\brevisit for other role\b/i.test(lower)) detailedStatusTerms.push("revisit for other role");

  // Attempt outcomes (captured notes log-attempt dropdown) - canonical labels.
  if (/\bbusy\b|\bcall busy\b/i.test(lower)) attemptOutcomeCandidates.push("Busy");
  if (/\bdisconnected\b/i.test(lower)) attemptOutcomeCandidates.push("Disconnected");
  if (/\bnot reachable\b|\bunreachable\b/i.test(lower)) attemptOutcomeCandidates.push("Not reachable");
  if (/\bswitch off\b|\bswitched off\b/i.test(lower)) attemptOutcomeCandidates.push("Switch off");
  if (/\bnot received\b/i.test(lower)) attemptOutcomeCandidates.push("Not responding");
  if (/\bnot responding\b|\bno response\b|\bno answer\b|\bnr\b/i.test(lower)) attemptOutcomeCandidates.push("Not responding");
  if (/\bjd shared\b|\bshared jd\b/i.test(lower)) attemptOutcomeCandidates.push("JD shared");
  if (/\bduplicate\b/i.test(lower)) attemptOutcomeCandidates.push("Duplicate");
  if (/\bscreening reject\b/i.test(lower)) attemptOutcomeCandidates.push("Screening reject");
  if (/\bcall later\b|\bcall back later\b/i.test(lower)) attemptOutcomeCandidates.push("Call later");
  if (/\binterested\b/i.test(lower)) attemptOutcomeCandidates.push("Interested");
  if (/\bnot interested\b/i.test(lower)) attemptOutcomeCandidates.push("Not interested");

  // Assessment statuses (assessment status dropdown) - canonical labels.
  if (/\bscreening call aligned\b/i.test(lower)) assessmentStatusCandidates.push("Screening call aligned");
  if (/\bl1 aligned\b/i.test(lower)) assessmentStatusCandidates.push("L1 aligned");
  if (/\bl2 aligned\b/i.test(lower)) assessmentStatusCandidates.push("L2 aligned");
  if (/\bl3 aligned\b/i.test(lower)) assessmentStatusCandidates.push("L3 aligned");
  if (/\bhr interview aligned\b/i.test(lower)) assessmentStatusCandidates.push("HR interview aligned");
  if (/\bfeedback awaited\b|\bawaiting feedback\b|\bawaited feedback\b/i.test(lower)) assessmentStatusCandidates.push("Feedback awaited");
  if (/\bshortlisted\b/i.test(lower)) assessmentStatusCandidates.push("Shortlisted");
  if (/\boffered\b|\boffer released\b/i.test(lower)) assessmentStatusCandidates.push("Offered");
  if (/\bjoined\b|\bonboarded\b/i.test(lower)) assessmentStatusCandidates.push("Joined");
  if (/\bduplicate\b/i.test(lower)) assessmentStatusCandidates.push("Duplicate");
  if (/\bdropped\b|\bdid not attend\b/i.test(lower)) assessmentStatusCandidates.push("Dropped");
  if (/\bscreening reject\b/i.test(lower)) assessmentStatusCandidates.push("Screening reject");
  if (/\binterview reject\b/i.test(lower)) assessmentStatusCandidates.push("Interview reject");
  if (/\bhold\b/i.test(lower)) assessmentStatusCandidates.push("Hold");
  const explicitRangeMatch =
    lower.match(/\bfrom\s+([a-z0-9,/\- ]+?)\s+to\s+([a-z0-9,/\- ]+?)(?:\bwith\b|\bfor\b|$)/i) ||
    lower.match(/\bbetween\s+([a-z0-9,/\- ]+?)\s+and\s+([a-z0-9,/\- ]+?)(?:\bwith\b|\bfor\b|$)/i);
  const monthOnlyMatch = lower.match(/\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  const clientMatch =
    lower.match(/\bin\s+([a-z0-9][a-z0-9\s&.-]+?)\s+from\s+attempt\s+outcome\b/i) ||
    lower.match(/\bin\s+([a-z0-9][a-z0-9\s&.-]+?)\s+from\s+assessment\s+status\b/i) ||
    lower.match(/\b(?:for client|for)\s+([a-z0-9][a-z0-9\s&.-]+?)(?=\s+\b(?:in\s+captured\s+notes?|in\s+captured\s+note|from\s+captured\s+notes?|from\s+captured\s+note|in\s+assessments?|from\s+assessments?|in\s+applied|from\s+applied)\b|$)/i);
  let dateFrom = "";
  let dateTo = "";
  if (/\blast month\b/i.test(lower)) {
    const range = getRelativeMonthRange(-1);
    dateFrom = range.from;
    dateTo = range.to;
  } else if (/\bnext week\b/i.test(lower)) {
    const range = getNextWeekRange();
    dateFrom = range.from;
    dateTo = range.to;
  } else if (/\bthis week\b/i.test(lower)) {
    const range = getCurrentWeekRange();
    dateFrom = range.from;
    dateTo = range.to;
  } else if (/\btomorrow\b/i.test(lower)) {
    const range = getRelativeNamedDayRange(1);
    dateFrom = range.from;
    dateTo = range.to;
  } else if (/\bthis month\b/i.test(lower)) {
    const range = getRelativeMonthRange(0);
    dateFrom = range.from;
    dateTo = range.to;
  } else if (monthOnlyMatch) {
    const range = getNamedMonthRange(monthOnlyMatch[1]);
    dateFrom = range.from;
    dateTo = range.to;
  } else {
    const lastDaysMatch = lower.match(/\blast\s+(\d+)\s+days\b/i);
    if (lastDaysMatch) {
      const range = getRelativeDayRange(Number(lastDaysMatch[1]) || 0);
      dateFrom = range.from;
      dateTo = range.to;
    } else if (/\btoday\b/i.test(lower)) {
      const range = getRelativeDayRange(1);
      dateFrom = range.from;
      dateTo = range.to;
    } else if (explicitRangeMatch) {
      dateFrom = parseFreeformDateText(explicitRangeMatch[1]);
      dateTo = parseFreeformDateText(explicitRangeMatch[2]);
    }
  }
  if (upcomingJoiningsIntent && !dateFrom) {
    const range = getRelativeNamedDayRange(0);
    dateFrom = range.from;
  }
  let dateField = "";
  if (/\bshared\b|\bconverted\b|\bassessment\b|\bcv shared\b|\bcv to be shared\b/i.test(lower)) {
    dateField = "shared";
  } else if (/\bjoined\b|\bjoining(?:s)?\b/i.test(lower) || upcomingJoiningsIntent) {
    dateField = "joined";
  } else if (interviewIntent) {
    dateField = "interview";
  } else if (/\bcaptured\b|\bsourced\b|\badded\b|\bcreated\b/i.test(lower)) {
    dateField = "captured";
  }
  let roleText = query
    .replace(/\bget me\b/i, "")
    .replace(/\bshow me\b/i, "")
    .replace(/\ball candidates?\b/i, "")
    .replace(/\bshared\b.*$/i, "")
    .replace(/\bcaptured\b.*$/i, "")
    .replace(/\bsourced\b.*$/i, "")
    .replace(statusNoiseRegex, " ")
    .replace(/\bthis month\b.*$/i, "")
    .replace(/\blast month\b.*$/i, "")
    .replace(/\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b.*$/i, "")
    .replace(/\blast\s+\d+\s+days\b.*$/i, "")
    .replace(/\bfrom\s+[a-z0-9,/\- ]+\s+to\s+[a-z0-9,/\- ]+.*$/i, "")
    .replace(/\bbetween\s+[a-z0-9,/\- ]+\s+and\s+[a-z0-9,/\- ]+.*$/i, "")
    .replace(/\bwith\s+\d+(?:\.\d+)?\s*\+?\s*years?.*$/i, "")
    .replace(/\bbased out of\b.*$/i, "")
    .replace(/\bbased in\b.*$/i, "")
    .replace(/\bin\s+[a-z][a-z\s]+(?:\s+(?:or|and)\s+[a-z][a-z\s]+)+.*$/i, "")
    .replace(/\b(?:in|from|based in|based out of|located in)\s+[a-z][a-z\s]+(?=\s+(?:under|below|with|for|over|above|more than)\b|$).*$/i, "")
    .replace(/\bfrom\b.*$/i, "")
    .replace(/\bcurrent\s+ctc\s+under\b.*$/i, "")
    .replace(/\bctc\s+under\b.*$/i, "")
    .replace(/\b(?:package|salary|ctc|current ctc|expected ctc)?\s*(?:under|below|max|less than|more than|above|over|minimum|min)\s+\d+(?:\.\d+)?\s*(?:l|lpa|lakhs?|lac|cr|crore|k)?\b.*$/i, "")
    .replace(/\baligned\b.*$/i, "")
    .replace(/\binterviews?\b.*$/i, "")
    .replace(/\bby\s+[a-z][a-z\s.-]+$/i, "")
    .replace(/\bfor\s+[a-z0-9][a-z0-9\s&.-]+$/i, "")
    .replace(/\bin\s+[a-z0-9][a-z0-9\s&.-]+$/i, "")
    .trim();
  roleText = roleText.replace(/\s+/g, " ").trim();
  roleText = roleText.replace(/\bcandidates?\b/gi, "").trim();
  roleText = roleText.replace(/\bprofiles?\b/gi, "").trim();
  const locationsFromRegex = locationListMatch
    ? String(locationListMatch[1] || "")
        // Support "an" typo as well ("an" -> "and") consistently in split.
        .split(/\s+(?:or|and|an)\s+/i)
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
  const deterministicLocations = Array.isArray(deterministic?.locations) ? deterministic.locations : [];
  const locations = deterministicLocations.length
    ? deterministicLocations
    : locationsFromRegex;
  let derivedLocation = deterministic?.location
    ? String(deterministic.location || "").trim()
    : locationMatch
      ? String(locationMatch[1] || "").trim()
      : "";
  // Do not guess trailing "locations" from remaining role text.
  // This caused false positives like "Loan sales" being treated as a location.
  const explicitSkills = skillMatch
    ? String(skillMatch[1] || "")
        .split(/,| and |\/|&/i)
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
  // Phrase-aware skill hints (avoid splitting into noisy tokens like "data" + "engineer").
  // Only used when explicit "skills:" section is not provided.
  const phraseSkillHints = [];
  if (/\bdata\s+engineer(?:s)?\b/i.test(lower)) phraseSkillHints.push("data engineer");
  if (/\bdata\s+engineering\b/i.test(lower)) phraseSkillHints.push("data engineer");
  if (/\bproduct\s+manager(?:s)?\b/i.test(lower)) phraseSkillHints.push("product manager");
  if (/\bproject\s+manager(?:s)?\b/i.test(lower)) phraseSkillHints.push("project manager");
  // "node development"/"node developer" usually means Node.js, and "development" is very noisy (Business Development).
  if (/\bnode(?:js)?\s+(?:dev|developer|development)\b/i.test(lower)) phraseSkillHints.push("nodejs");
  if (/\bnode\s+development\b/i.test(lower)) phraseSkillHints.push("nodejs");

  const derivedSkills = explicitSkills.length
    ? explicitSkills
    : Array.from(new Set([...phraseSkillHints, ...splitCandidateSearchKeywords(roleText)]));
  const hasBusinessDevelopmentPhrase = /\bbusiness\s+development\b/i.test(lower);
  const hasKnownTechSignal =
    /\b(node\b|node\.?js|nodejs|react(?:js)?|angular|vue(?:js)?|java\b|spring|spring\s*boot|python|django|flask|fastapi|golang|\bgo\b|rust|dotnet|\.net|asp\.?net|c#|kotlin|swift|android|ios|devops|aws|azure|gcp|docker|kubernetes|sql\b|mysql|postgres|mongodb|mongo|kafka)\b/i.test(lower);
  const hasDataEngineerPhrase = /\bdata\s+engineer(?:s)?\b/i.test(lower) || phraseSkillHints.includes("data engineer");
  const cleanedSkills = derivedSkills
    .map((skill) => String(skill || "").trim())
    .filter(Boolean)
    .filter((skill) => !["assessment", "assessments"].includes(String(skill || "").toLowerCase().trim()))
    // If the recruiter asked for "data engineer", don't treat generic "engineer" token as a required skill.
    .filter((skill) => {
      const token = String(skill || "").toLowerCase().trim();
      if (!hasDataEngineerPhrase) return true;
      if (token === "engineer" || token === "engineers") return false;
      return true;
    })
    // "development" is extremely noisy because of "Business Development" in sales profiles.
    // If the query already has a clear tech signal, treat "development" as a stopword
    // unless the recruiter explicitly says "business development".
    .filter((skill) => {
      const token = String(skill || "").toLowerCase().trim();
      if (token !== "development") return true;
      if (hasBusinessDevelopmentPhrase) return true;
      return !hasKnownTechSignal;
    })
    // prevent status terms like "not received" turning into required keywords (causes zero results)
    .filter((skill) => !["not", "received", "feedback", "awaited", "awaiting", "responding", "response", "nr"].includes(String(skill || "").toLowerCase().trim()));
  const hasOrOperator = /\bor\b/i.test(lower);
  const skillsMatch = hasOrOperator && cleanedSkills.length >= 2 ? "any" : "all";
  const resolvedRoleText = String(deterministic?.role || roleText || "").trim();
  const resolvedRoleFamilies = Array.isArray(deterministic?.roleFamilies) && deterministic.roleFamilies.length
    ? deterministic.roleFamilies
    : detectRoleFamilies(resolvedRoleText);
  const resolvedSkills = Array.isArray(deterministic?.skills) && deterministic.skills.length
    ? deterministic.skills
    : Array.from(new Set(cleanedSkills));
  const resolvedMaxNoticeDays = typeof deterministic?.maxNoticeDays === "number"
    ? deterministic.maxNoticeDays
    : noticeMatch
      ? parseNoticePeriodToDays(`${noticeMatch[1]} ${noticeMatch[2]}`)
      : null;
  const resolvedDomainKeywords = Array.isArray(deterministic?.domainKeywords)
    ? deterministic.domainKeywords.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const resolvedMustHaveSkills = Boolean(deterministic?.mustHaveSkills);
  const resolvedSourceTypeFilter = String(deterministic?.sourceTypeFilter || "").trim();
  const resolvedDetailedStatuses = Array.isArray(deterministic?.detailedStatuses)
    ? deterministic.detailedStatuses.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const resolvedAttemptOutcome = String(deterministic?.attemptOutcome || "").trim();
  const resolvedAssessmentStatus = String(deterministic?.assessmentStatus || "").trim();
  if (!derivedLocation && locations.length) derivedLocation = String(locations[0] || "").trim();

  return {
    raw: query,
    role: resolvedRoleText,
    roleFamilies: resolvedRoleFamilies,
    minExperienceYears: minExperienceMatch ? Number(minExperienceMatch[1]) : null,
    maxExperienceYears: maxExperienceMatch ? Number(maxExperienceMatch[1]) : null,
    location: derivedLocation,
    locations,
    minCurrentCtcLpa: ctcAboveMatch ? parseAmountToLpa(`${ctcAboveMatch[1]} ${ctcAboveMatch[2] || "lpa"}`) : null,
    maxCurrentCtcLpa: ctcUnderMatch ? parseAmountToLpa(`${ctcUnderMatch[1]} ${ctcUnderMatch[2] || "lpa"}`) : null,
    minExpectedCtcLpa: expectedCtcAboveMatch ? parseAmountToLpa(`${expectedCtcAboveMatch[1]} ${expectedCtcAboveMatch[2] || "lpa"}`) : null,
    maxExpectedCtcLpa: expectedCtcUnderMatch ? parseAmountToLpa(`${expectedCtcUnderMatch[1]} ${expectedCtcUnderMatch[2] || "lpa"}`) : null,
    maxNoticeDays: resolvedMaxNoticeDays,
    skills: resolvedSkills,
    domainKeywords: resolvedDomainKeywords,
    skillsMatch,
    mustHaveSkills: resolvedMustHaveSkills,
    currentCompany: currentCompanyMatch ? String(currentCompanyMatch[1] || "").trim() : "",
    statuses: statusTerms,
    detailedStatuses: Array.from(new Set([...detailedStatusTerms, ...resolvedDetailedStatuses])),
    // Additive: lets Natural search also act like structured filters for status/outcome dropdowns.
    // If multiple statuses/outcomes are present, leave blank to avoid over-filtering.
    attemptOutcome: resolvedAttemptOutcome || (attemptOutcomeCandidates.length === 1 ? attemptOutcomeCandidates[0] : ""),
    assessmentStatus: resolvedAssessmentStatus || (assessmentStatusCandidates.length === 1 ? assessmentStatusCandidates[0] : ""),
    client: clientMatch ? String(clientMatch[1] || "").trim() : "",
    targetLabel: targetLabelMatch ? String(targetLabelMatch[1] || "").trim() : "",
    interviewScheduled: interviewIntent,
    upcomingJoinings: upcomingJoiningsIntent,
    recruiterScope: recruiterScopeMe ? "me" : "",
    recruiterName: recruiterNameMatch
      ? String(recruiterNameMatch[1] || "").trim()
      : assignedToMatch
        ? String(assignedToMatch[1] || "").trim()
        : "",
    // "Captured by ..." and "Sourced by ..." should map to captured-by dimension (sourcedRecruiter).
    // "Assigned to ..." maps to owner/assignee dimension.
    recruiterField: capturedByIntent ? "sourced" : (convertedIntent || assessmentIntent || assignedToMatch) ? "owner" : "",
    // Only force captured/applied when the user explicitly asks for captured notes / applicants.
    sourceTypeFilter: resolvedSourceTypeFilter || (assessmentIntent
      ? "assessment"
      : convertedIntent
        ? "converted"
        : appliedIntent
          ? "applied"
          : capturedNotesIntent
            ? "captured"
            : ""),
    dateFrom,
    dateTo,
    dateField
  };
}

function buildCandidateSearchInterpretationSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: [
      "role",
      "roleFamilies",
      "skills",
      "domainKeywords",
      "locations",
      "minExperienceYears",
      "maxExperienceYears",
      "minCurrentCtcLpa",
      "maxCurrentCtcLpa",
      "minExpectedCtcLpa",
      "maxExpectedCtcLpa",
      "maxNoticeDays",
      "statuses",
      "detailedStatuses",
      "assessmentStatus",
      "attemptOutcome",
      "client",
      "recruiterName",
      "recruiterScope",
      "recruiterField",
      "sourceTypeFilter",
      "dateFrom",
      "dateTo",
      "dateField",
      "currentCompany"
    ],
    properties: {
      role: { type: ["string", "null"] },
      roleFamilies: { type: "array", items: { type: "string" }, maxItems: 6 },
      skills: { type: "array", items: { type: "string" }, maxItems: 12 },
      domainKeywords: { type: "array", items: { type: "string" }, maxItems: 12 },
      locations: { type: "array", items: { type: "string" }, maxItems: 8 },
      minExperienceYears: { type: ["number", "null"] },
      maxExperienceYears: { type: ["number", "null"] },
      minCurrentCtcLpa: { type: ["number", "null"] },
      maxCurrentCtcLpa: { type: ["number", "null"] },
      minExpectedCtcLpa: { type: ["number", "null"] },
      maxExpectedCtcLpa: { type: ["number", "null"] },
      maxNoticeDays: { type: ["number", "null"] },
      statuses: { type: "array", items: { type: "string" }, maxItems: 8 },
      detailedStatuses: { type: "array", items: { type: "string" }, maxItems: 12 },
      // Optional: when the recruiter explicitly names a single status/outcome,
      // set these so UI can map directly to dropdown filters.
      assessmentStatus: { type: ["string", "null"] },
      attemptOutcome: { type: ["string", "null"] },
      client: { type: ["string", "null"] },
      recruiterName: { type: ["string", "null"] },
      recruiterScope: { type: ["string", "null"], enum: ["", "me", null] },
      recruiterField: { type: ["string", "null"], enum: ["", "sourced", "owner", null] },
      sourceTypeFilter: { type: ["string", "null"], enum: ["", "captured", "converted", "applied", "assessment", null] },
      dateFrom: { type: ["string", "null"] },
      dateTo: { type: ["string", "null"] },
      dateField: { type: ["string", "null"], enum: ["", "captured", "shared", "interview", "joined", null] },
      currentCompany: { type: ["string", "null"] }
    }
  };
}

function buildRecruiterQueryParserSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["intent", "normalizedQuery", "confidence", "filters"],
    properties: {
      intent: {
        type: "string",
        enum: [
          "candidate_search",
          "interview_schedule_search",
          "shared_profiles_search",
          "stale_candidates",
          "recruiter_activity_report",
          "reports",
          "job_search",
          "company_search",
          "general_keyword_search"
        ]
      },
      normalizedQuery: { type: "string" },
      confidence: { type: "number" },
      filters: {
        type: "object",
        additionalProperties: false,
        required: [
          "role", "skills", "location", "locations", "client", "company", "jobTitleKeywords",
          "statuses", "detailedStatuses", "skillsMatch", "mustHaveSkills", "attemptOutcome", "assessmentStatus", "sourceTypeFilter",
          "sharedOnly", "interviewScheduled", "upcomingJoinings", "minExperienceYears", "maxExperienceYears",
          "maxNoticeDays", "dateFrom", "dateTo", "dateField", "recruiterName", "recruiterScope", "fallbackKeywords"
        ],
        properties: {
          role: { type: ["string", "null"] },
          skills: { type: "array", items: { type: "string" }, maxItems: 20 },
          skillsMatch: { type: ["string", "null"], enum: ["all", "any", null] },
          mustHaveSkills: { type: ["boolean", "null"] },
          location: { type: ["string", "null"] },
          locations: { type: "array", items: { type: "string" }, maxItems: 12 },
          client: { type: ["string", "null"] },
          company: { type: ["string", "null"] },
          jobTitleKeywords: { type: "array", items: { type: "string" }, maxItems: 12 },
          statuses: { type: "array", items: { type: "string" }, maxItems: 12 },
          detailedStatuses: { type: "array", items: { type: "string" }, maxItems: 20 },
          attemptOutcome: { type: ["string", "null"] },
          assessmentStatus: { type: ["string", "null"] },
          sourceTypeFilter: { type: ["string", "null"] },
          sharedOnly: { type: ["boolean", "null"] },
          interviewScheduled: { type: ["boolean", "null"] },
          upcomingJoinings: { type: ["boolean", "null"] },
          minExperienceYears: { type: ["number", "null"] },
          maxExperienceYears: { type: ["number", "null"] },
          maxNoticeDays: { type: ["number", "null"] },
          dateFrom: { type: ["string", "null"] },
          dateTo: { type: ["string", "null"] },
          dateField: { type: ["string", "null"] },
          recruiterName: { type: ["string", "null"] },
          recruiterScope: { type: ["string", "null"] },
          fallbackKeywords: { type: "array", items: { type: "string" }, maxItems: 20 }
        }
      }
    }
  };
}

function assertStrictSchemaCompatibility(schema, path = "root") {
  if (!schema || typeof schema !== "object") return;
  const type = schema.type;
  const isObjectSchema = type === "object" || (Array.isArray(type) && type.includes("object"));
  if (isObjectSchema && schema.properties) {
    const propKeys = Object.keys(schema.properties || {});
    const required = Array.isArray(schema.required) ? schema.required : [];
    const missing = propKeys.filter((key) => !required.includes(key));
    if (missing.length) {
      throw new Error(`Strict schema mismatch at ${path}: required is missing keys: ${missing.join(", ")}`);
    }
    if (schema.additionalProperties !== false) {
      throw new Error(`Strict schema mismatch at ${path}: additionalProperties must be false`);
    }
  }

  if (schema.properties && typeof schema.properties === "object") {
    Object.entries(schema.properties).forEach(([key, child]) => {
      assertStrictSchemaCompatibility(child, `${path}.properties.${key}`);
    });
  }
  if (schema.items) {
    assertStrictSchemaCompatibility(schema.items, `${path}.items`);
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((child, idx) => assertStrictSchemaCompatibility(child, `${path}.anyOf[${idx}]`));
  }
  if (Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach((child, idx) => assertStrictSchemaCompatibility(child, `${path}.oneOf[${idx}]`));
  }
}

async function parseRecruiterQueryWithOpenAI(rawQuery, { apiKey, actor } = {}) {
  const query = String(rawQuery || "").trim();
  const normalized = normalizeRecruiterQuery(query, DEFAULT_SYNONYMS);
  const norm = String(normalized?.normalized || query || "").trim();
  const prompt = [
    "You are a recruiter query parser. Convert messy English into strict JSON filters.",
    "Do not search database. Do not explain. Return JSON only.",
    "Use intent and filters exactly matching schema.",
    "",
    "Rules:",
    "1) Prefer empty role over wrong role.",
    "2) Never infer role from filler phrases like: those who are, who are, having, profiles, candidates, people.",
    "3) Set role only for known job functions like developer, recruiter, engineer, manager, analyst, tester, sales, accountant, hr.",
    "4) Preserve uncertain useful terms in fallbackKeywords or jobTitleKeywords.",
    "5) If query asks for shared/submitted profiles: intent=shared_profiles_search, sourceTypeFilter=assessment, sharedOnly=true, dateField=shared.",
    "5b) Interview scheduling/listing queries should use intent=interview_schedule_search.",
    "5c) Reporting summaries should use intent=reports.",
    "6) If C2H / contract to hire appears, keep it in jobTitleKeywords.",
    "7) If client appears inside title text, keep it in jobTitleKeywords too.",
    "8) If busy appears: detailedStatuses=['busy'], attemptOutcome='Busy'.",
    "9) If not contacted in X days: intent=stale_candidates, dateField=last_contacted.",
    "10) immediate joiner/can join immediately => maxNoticeDays=0.",
    "11) If confidence is low, intent=general_keyword_search and keep fallbackKeywords rich.",
    "12) Never set recruiterName unless recruiter is explicitly mentioned in query text.",
    "13) Never default recruiterName to current actor.",
    "14) Date phrases (today, tomorrow, next week, this month, dd/mm/yyyy, month names) are never locations.",
    "15) Filler phrases are never roles: those who are, who are, profiles, candidates, people.",
    "16) Unknown useful terms should go to fallbackKeywords or jobTitleKeywords instead of role/location.",
    `Current recruiter name context: "${String(actor?.name || "").trim()}" (for disambiguation only, not default).`,
    "",
    `Query: ${norm}`
  ].join("\n");

  const recruiterQuerySchema = buildRecruiterQueryParserSchema();
  assertStrictSchemaCompatibility(recruiterQuerySchema, "recruiter_query_parser");

  const result = await callOpenAiJsonSchema({
    apiKey,
    prompt,
    model: "gpt-4.1-mini",
    schemaName: "recruiter_query_parser",
    schema: recruiterQuerySchema
  });

  const toArray = (value) =>
    Array.from(new Set((Array.isArray(value) ? value : []).map((x) => String(x || "").trim()).filter(Boolean)));
  const detectExplicitTechSkillsFromQuery = (text = "") => {
    const q = String(text || "").toLowerCase();
    const out = [];
    const add = (v) => { if (!out.includes(v)) out.push(v); };
    if (/\b(\.net\s*core|dot\s*net\s*core|dotnet\s*core|asp\.?\s*net\s*core)\b/.test(q)) add(".NET Core");
    if (/\basp\.?\s*net\s*core\b/.test(q)) add("ASP.NET Core");
    if (/\bspring\s+boot\b/.test(q)) add("Spring Boot");
    if (/\bcore\s+java\b/.test(q)) add("Core Java");
    if (/\breact\s+native\b/.test(q)) add("React Native");
    if (/\bnode(\.js|js| js)\b/.test(q)) add("Node.js");
    if (/\bnext(\.js|js| js)\b/.test(q)) add("Next.js");
    if (/\bangular(\s+js|js)\b/.test(q)) add("Angular JS");
    if (/\bsql\s+server\b/.test(q)) add("SQL Server");
    if (/\bpower\s+bi\b/.test(q)) add("Power BI");
    if (/\bmachine\s+learning\b/.test(q)) add("Machine Learning");
    if (/\bdata\s+engineering\b/.test(q)) add("Data Engineering");
    if (/\bbusiness\s+analyst\b/.test(q)) add("Business Analyst");
    if (/\bmanual\s+testing\b/.test(q)) add("Manual Testing");
    if (/\bautomation\s+testing\b/.test(q)) add("Automation Testing");
    if (/\b(node\.?js|nodejs|node js)\b/.test(q)) add("nodejs");
    if (/\breact(\.js|js)?\b/.test(q)) add("react");
    if (/\bangular(\.js|js)?\b/.test(q)) add("angular");
    if (/\b(java|spring|spring boot)\b/.test(q)) add("java");
    if (/\b(python|django|flask|fastapi)\b/.test(q)) add("python");
    if (/\b(go|golang|go lang)\b/.test(q)) add("golang");
    if (/\b(\.net|dotnet|dot net|asp\.?net|c#|c sharp)\b/.test(q)) add("dotnet");
    if (/\b(qa|automation tester|selenium|playwright|cypress)\b/.test(q)) add("qa");
    return out;
  };
  const safeRole = resolveKnownRole(String(result?.filters?.role || "").trim());
  const qLower = norm.toLowerCase();
  const filters = {
    role: safeRole || "",
    skills: normalizeCandidateSearchKeywords(toArray(result?.filters?.skills)),
    location: String(result?.filters?.location || "").trim(),
    locations: toArray(result?.filters?.locations),
    client: String(result?.filters?.client || "").trim(),
    company: String(result?.filters?.company || "").trim(),
    jobTitleKeywords: toArray(result?.filters?.jobTitleKeywords),
    statuses: toArray(result?.filters?.statuses),
    detailedStatuses: toArray(result?.filters?.detailedStatuses),
    skillsMatch: String(result?.filters?.skillsMatch || "").trim().toLowerCase() === "any" ? "any" : "all",
    mustHaveSkills: Boolean(result?.filters?.mustHaveSkills),
    attemptOutcome: String(result?.filters?.attemptOutcome || "").trim(),
    assessmentStatus: String(result?.filters?.assessmentStatus || "").trim(),
    sourceTypeFilter: String(result?.filters?.sourceTypeFilter || "").trim(),
    sharedOnly: Boolean(result?.filters?.sharedOnly),
    interviewScheduled: Boolean(result?.filters?.interviewScheduled),
    upcomingJoinings: Boolean(result?.filters?.upcomingJoinings),
    minExperienceYears: typeof result?.filters?.minExperienceYears === "number" ? result.filters.minExperienceYears : null,
    maxExperienceYears: typeof result?.filters?.maxExperienceYears === "number" ? result.filters.maxExperienceYears : null,
    maxNoticeDays: typeof result?.filters?.maxNoticeDays === "number" ? result.filters.maxNoticeDays : null,
    dateFrom: String(result?.filters?.dateFrom || "").trim(),
    dateTo: String(result?.filters?.dateTo || "").trim(),
    dateField: String(result?.filters?.dateField || "").trim(),
    recruiterName: String(result?.filters?.recruiterName || "").trim(),
    recruiterScope: String(result?.filters?.recruiterScope || "").trim(),
    fallbackKeywords: toArray(result?.filters?.fallbackKeywords)
  };
  const explicitTechSkills = detectExplicitTechSkillsFromQuery(norm);

  // Deterministic corrections
  if (/\bshared|submitted|cv shared|converted\b/i.test(qLower)) {
    filters.sharedOnly = true;
    filters.sourceTypeFilter = "assessment";
    filters.dateField = "shared";
  }
  if (/\bbusy\b/i.test(qLower)) {
    if (!filters.detailedStatuses.includes("busy")) filters.detailedStatuses.push("busy");
    if (!filters.attemptOutcome) filters.attemptOutcome = "Busy";
  }
  if (/\bimmediate joiner|can join immediately|immediate\b/i.test(qLower)) {
    filters.maxNoticeDays = 0;
  }
  if (/\bc2h\b|\bcontract to hire\b/i.test(qLower) && !filters.jobTitleKeywords.some((k) => /^c2h$/i.test(k))) {
    filters.jobTitleKeywords.push("C2H");
  }
  if (!filters.role) {
    filters.skills = filters.skills.filter((s) => !/^(those|who|are|having|profiles?|candidates?|people)$/i.test(s));
  }
  if (explicitTechSkills.length) {
    const currentSkills = normalizeCandidateSearchKeywords(filters.skills || []);
    const hasDotNetCoreAtomic = explicitTechSkills.some((s) => String(s || "").toLowerCase() === ".net core");
    if (hasDotNetCoreAtomic) {
      filters.skills = [".NET Core"];
      filters.skillsMatch = "all";
      filters.mustHaveSkills = true;
      filters.role = filters.role || "dotnet developer";
    } else {
      filters.skills = normalizeCandidateSearchKeywords([...currentSkills, ...explicitTechSkills]);
    }
    // If recruiter explicitly asks for developers/engineers and we detected tech skill,
    // keep role deterministic and avoid broad non-tech matches.
    if (!filters.role && /\b(developer|developers|engineer|engineers)\b/i.test(norm)) {
      const primary = explicitTechSkills[0];
      const roleGuess =
        primary === "dotnet" ? ".net developer"
        : primary === "nodejs" ? "nodejs developer"
        : primary === "react" ? "react developer"
        : primary === "angular" ? "angular developer"
        : primary === "java" ? "java developer"
        : primary === "python" ? "python developer"
        : primary === "golang" ? "golang developer"
        : "";
      if (roleGuess) filters.role = roleGuess;
    }
    // Default to strict match for explicit tech-role queries unless recruiter used OR explicitly.
    if (!/\bor\b/i.test(norm)) filters.skillsMatch = "all";
  }
  if (Array.isArray(filters.skills) && filters.skills.some((s) => String(s || "").toLowerCase() === ".net core")) {
    filters.skills = [".NET Core"];
    filters.skillsMatch = "all";
    filters.mustHaveSkills = true;
  }
  const keepFallback = Array.from(new Set([
    ...filters.fallbackKeywords,
    ...filters.jobTitleKeywords,
    ...filters.skills
  ])).filter(Boolean);
  filters.fallbackKeywords = keepFallback.filter((k) => String(k || "").trim().toLowerCase() !== "core");

  return {
    intent: String(result?.intent || "general_keyword_search").trim() || "general_keyword_search",
    normalizedQuery: String(result?.normalizedQuery || norm).trim() || norm,
    confidence: typeof result?.confidence === "number" ? result.confidence : 0.5,
    filters
  };
}

function mapOpenAiParsedToDeterministicFilters(parsed = {}) {
  const pf = parsed?.filters && typeof parsed.filters === "object" ? parsed.filters : {};
  const keywords = normalizeCandidateSearchKeywords([...(pf.skills || []), ...(pf.jobTitleKeywords || [])]);
  const role = resolveKnownRole(String(pf.role || "").trim()) || "";
  const normalizedQuery = String(parsed?.normalizedQuery || "").trim();
  const lowerQuery = normalizedQuery.toLowerCase();
  const hasExplicitTargetIntent = /\b(jd|job|role|position|title|opening|openings|under)\b/i.test(lowerQuery);
  const hasExplicitRecruiterIntent = /\b(assigned to|owned by|owner|sourced by|captured by|by|under)\b/i.test(lowerQuery);
  const rawRecruiterName = String(pf.recruiterName || "").trim();
  const recruiterNameToken = normalizeDashboardText(rawRecruiterName).toLowerCase();
  const recruiterExplicitlyMentioned =
    hasExplicitRecruiterIntent &&
    recruiterNameToken &&
    lowerQuery.includes(recruiterNameToken);
  return {
    raw: normalizedQuery,
    role,
    roleFamilies: role ? detectRoleFamilies(role) : [],
    minExperienceYears: typeof pf.minExperienceYears === "number" ? pf.minExperienceYears : null,
    maxExperienceYears: typeof pf.maxExperienceYears === "number" ? pf.maxExperienceYears : null,
    location: String(pf.location || "").trim(),
    locations: Array.isArray(pf.locations) ? pf.locations.map((x) => String(x || "").trim()).filter(Boolean) : [],
    minCurrentCtcLpa: null,
    maxCurrentCtcLpa: null,
    minExpectedCtcLpa: null,
    maxExpectedCtcLpa: null,
    maxNoticeDays: typeof pf.maxNoticeDays === "number" ? pf.maxNoticeDays : null,
    skills: keywords,
    domainKeywords: normalizeCandidateSearchKeywords(Array.isArray(pf.domainKeywords) ? pf.domainKeywords : []),
    skillsMatch: String(pf.skillsMatch || "").trim().toLowerCase() === "any" ? "any" : "all",
    mustHaveSkills: Boolean(pf.mustHaveSkills),
    currentCompany: String(pf.company || "").trim(),
    statuses: Array.isArray(pf.statuses) ? pf.statuses.map((x) => normalizeDashboardText(x)).filter(Boolean) : [],
    detailedStatuses: Array.isArray(pf.detailedStatuses) ? pf.detailedStatuses.map((x) => String(x || "").trim()).filter(Boolean) : [],
    attemptOutcome: String(pf.attemptOutcome || "").trim(),
    assessmentStatus: String(pf.assessmentStatus || "").trim(),
    client: String(pf.client || "").trim(),
    targetLabel: hasExplicitTargetIntent && Array.isArray(pf.jobTitleKeywords) ? String(pf.jobTitleKeywords[0] || "").trim() : "",
    interviewScheduled: Boolean(pf.interviewScheduled),
    upcomingJoinings: Boolean(pf.upcomingJoinings),
    recruiterScope: recruiterExplicitlyMentioned ? String(pf.recruiterScope || "").trim() : "",
    recruiterName: recruiterExplicitlyMentioned ? rawRecruiterName : "",
    recruiterField: "owner",
    sourceTypeFilter: String(pf.sourceTypeFilter || "").trim(),
    dateFrom: String(pf.dateFrom || "").trim(),
    dateTo: String(pf.dateTo || "").trim(),
    dateField: String(pf.dateField || "").trim(),
    fallbackKeywords: Array.isArray(pf.fallbackKeywords) ? pf.fallbackKeywords.map((x) => String(x || "").trim()).filter(Boolean) : []
  };
}

async function interpretCandidateSearchQueryWithAi({ apiKey, query, actor }) {
  const prompt = [
    "You convert recruiter search statements into deterministic candidate-search filters.",
    "Return compact JSON only.",
    "",
    "RULES",
    "1. Convert free text into structured filters for candidate search.",
    "2. If the recruiter asks for captured notes candidates, sourceTypeFilter = captured.",
    "3. If they ask for applied candidates, sourceTypeFilter = applied.",
    "4. If they ask for assessments or shared candidates, sourceTypeFilter = converted or assessment depending on intent.",
    "5. Extract role keywords into role and/or skills.",
    "6. Extract locations ONLY when the query clearly mentions a geography (city/region). Never put role/skill phrases into locations. If unsure, return locations as an empty array.",
    "7. Convert 'under 20 L' like phrases into maxCurrentCtcLpa when no expected CTC is specified.",
    "8. Convert 'more than 20 L' / 'above 20 L' / 'package more than 20 L' into minCurrentCtcLpa when no expected CTC is specified.",
    "9. Convert experience range phrases into minExperienceYears and maxExperienceYears.",
    "10. Convert phrases like 'SaaS Sales' into separate skills/keywords: ['saas','sales'], not one combined phrase.",
    "11. If a query looks like a person name, keep it in role or skills as searchable keywords.",
    "12. Convert notice constraints into maxNoticeDays ONLY if notice/immediate/joining is explicitly mentioned; otherwise set maxNoticeDays = null.",
    "13. If they mention a recruiter name, set recruiterName.",
    "14. If they mean 'profiles sourced by X', recruiterField = sourced.",
    "15. If they mean 'profiles under X' or assigned/owned by X, recruiterField = owner.",
    "16. If they ask for 'my' profiles, recruiterScope = me.",
    "17. Keep arrays empty and strings blank if not specified.",
    "18. If the query is source-only (e.g. 'profiles in assessments', 'show captured notes'), keep role='' and skills=[].",
    `19. Current recruiter is "${String(actor?.name || "").trim()}".`,
    "20. If the recruiter mentions a single explicit assessment status (e.g. 'L1 aligned', 'Feedback awaited', 'Offered'), set assessmentStatus to that exact label.",
    "21. If the recruiter mentions a single explicit call/attempt outcome (e.g. 'Not responding', 'JD shared', 'Call later'), set attemptOutcome to that exact label.",
    "22. Treat common multi-word roles as phrases: 'data engineer', 'product manager', 'project manager', 'business development'. Prefer adding the whole phrase instead of splitting into generic tokens.",
    "23. Interpret 'node developer' / 'node development' as Node.js. Prefer skill 'nodejs' and avoid using the generic word 'development' as a skill.",
    "24. Domain-sales queries: if the recruiter asks for sales profiles in finance/lending/loan/fintech, treat Sales as the required role family and treat the domain terms as an OR-group (skillsMatch = any). Example: 'finance or lending or loan sales' => role='sales', skills=['finance','lending','loan'], skillsMatch='any'.",
    "",
    "Allowed lifecycle statuses:",
    "shortlisted, offered, joined, rejected, duplicate, dropped",
    "Allowed detailed statuses:",
    "feedback awaited, screening reject, interview reject, hold, not responding, under process, aligned, not received, not reachable, busy, switch off, disconnected, call later, interested, not interested, revisit for other role",
    "",
    "Allowed assessmentStatus labels:",
    "Screening call aligned, L1 aligned, L2 aligned, L3 aligned, HR interview aligned, Feedback awaited, Shortlisted, Offered, Joined, Duplicate, Dropped, Screening reject, Interview reject, Hold",
    "Allowed attemptOutcome labels:",
    "Busy, Disconnected, Not reachable, Switch off, Not responding, JD shared, Duplicate, Screening reject, Call later, Interested, Not interested",
    "",
    `Query: ${String(query || "").trim()}`
  ].join("\n");

  const result = await callOpenAiJsonSchema({
    apiKey,
    prompt,
    model: "gpt-4.1-mini",
    schemaName: "candidate_search_interpretation",
    schema: buildCandidateSearchInterpretationSchema()
  });

  const qLower = String(query || "").toLowerCase();
  const noticeMentioned = /\b(notice|immediate|join|joining|lwd|doj)\b/i.test(qLower);
  const maxNoticeDaysValue = typeof result?.maxNoticeDays === "number" ? result.maxNoticeDays : null;
  const safeMaxNoticeDays = noticeMentioned ? maxNoticeDaysValue : null;

  const feedbackMentioned = /\b(feedback awaited|awaiting feedback|awaited feedback)\b/i.test(qLower);

  const rawLocations = Array.isArray(result?.locations)
    ? result.locations.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const safeLocations = rawLocations.filter((loc) => !looksLikeNonLocationToken(loc));

  let nextDetailedStatuses = Array.isArray(result?.detailedStatuses)
    ? result.detailedStatuses.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  if (feedbackMentioned && !nextDetailedStatuses.some((s) => String(s || "").toLowerCase() === "feedback awaited")) {
    nextDetailedStatuses = [...nextDetailedStatuses, "feedback awaited"];
  }

  return {
    raw: String(query || "").trim(),
    role: String(result?.role || "").trim(),
    roleFamilies: Array.isArray(result?.roleFamilies) && result.roleFamilies.length
      ? result.roleFamilies.map((item) => String(item || "").trim()).filter(Boolean)
      : detectRoleFamilies(String(result?.role || "").trim()),
    minExperienceYears: typeof result?.minExperienceYears === "number" ? result.minExperienceYears : null,
    maxExperienceYears: typeof result?.maxExperienceYears === "number" ? result.maxExperienceYears : null,
    location: safeLocations.length ? String(safeLocations[0] || "").trim() : "",
    locations: safeLocations,
    minCurrentCtcLpa: typeof result?.minCurrentCtcLpa === "number" ? result.minCurrentCtcLpa : null,
    maxCurrentCtcLpa: typeof result?.maxCurrentCtcLpa === "number" ? result.maxCurrentCtcLpa : null,
    minExpectedCtcLpa: typeof result?.minExpectedCtcLpa === "number" ? result.minExpectedCtcLpa : null,
    maxExpectedCtcLpa: typeof result?.maxExpectedCtcLpa === "number" ? result.maxExpectedCtcLpa : null,
    maxNoticeDays: safeMaxNoticeDays,
    skills: normalizeCandidateSearchKeywords(result?.skills || []),
    domainKeywords: normalizeCandidateSearchKeywords(result?.domainKeywords || []),
    currentCompany: String(result?.currentCompany || "").trim(),
    statuses: Array.isArray(result?.statuses) ? result.statuses.map((item) => normalizeDashboardText(item)).filter(Boolean) : [],
    detailedStatuses: nextDetailedStatuses,
    assessmentStatus: String(result?.assessmentStatus || "").trim(),
    attemptOutcome: String(result?.attemptOutcome || "").trim(),
    client: String(result?.client || "").trim(),
    targetLabel: "",
    interviewScheduled: false,
    upcomingJoinings: false,
    recruiterScope: String(result?.recruiterScope || "").trim(),
    recruiterName: String(result?.recruiterName || "").trim(),
    recruiterField: String(result?.recruiterField || "").trim(),
    sourceTypeFilter: String(result?.sourceTypeFilter || "").trim(),
    dateFrom: String(result?.dateFrom || "").trim(),
    dateTo: String(result?.dateTo || "").trim(),
    dateField: String(result?.dateField || "").trim(),
    interpretedByAi: true
  };
}

function buildNaturalSearchFallbackTokens(rawQuery = "") {
  return String(rawQuery || "")
    .toLowerCase()
    .replace(/[^\w\s+&/-]+/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) =>
      part &&
      part.length >= 2 &&
      ![
        "get", "me", "show", "all", "profiles", "profile", "candidate", "candidates",
        "in", "for", "by", "with", "this", "that", "from", "the", "and", "or",
        "those", "these", "who", "whom", "whose", "are", "is", "was", "were", "into", "within", "between",
        "week", "month", "today", "tomorrow", "last", "next"
      ].includes(part)
    );
}

const ATOMIC_SEARCH_SKILL_ALIASES = {
  ".net core": [
    ".net core",
    "dotnet core",
    "dot net core",
    "asp.net core",
    "asp net core",
    "c#",
    "c sharp",
    "mvc",
    "web api",
    "entity framework",
    "ef core"
  ],
  "asp.net core": ["asp.net core", "asp net core"],
  "spring boot": ["spring boot"],
  "core java": ["core java"],
  "react native": ["react native"],
  "node.js": ["node.js", "node js", "nodejs"],
  "next.js": ["next.js", "next js", "nextjs"],
  "angular js": ["angular js", "angularjs"],
  "sql server": ["sql server"],
  "power bi": ["power bi"],
  "machine learning": ["machine learning"],
  "data engineering": ["data engineering"],
  "business analyst": ["business analyst"],
  "manual testing": ["manual testing"],
  "automation testing": ["automation testing"]
};

const ATOMIC_SEARCH_PHRASE_PATTERNS = Object.entries(ATOMIC_SEARCH_SKILL_ALIASES).map(([canonical, variants]) => {
  const escaped = Array.from(new Set((Array.isArray(variants) ? variants : [canonical]).map((v) => normalizeDashboardText(v).toLowerCase().trim()).filter(Boolean)))
    .sort((a, b) => b.length - a.length)
    .map((v) => escapeRegex(v).replace(/\s+/g, "\\s+"));
  return {
    canonical,
    placeholder: `__atomic_${canonical.replace(/[^a-z0-9]+/gi, "_")}__`,
    regex: new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi")
  };
});

function splitCandidateSearchKeywords(value = "") {
  let normalized = String(value || "").toLowerCase().replace(/[()"]/g, " ");
  for (const atomic of ATOMIC_SEARCH_PHRASE_PATTERNS) {
    normalized = normalized.replace(atomic.regex, ` ${atomic.placeholder} `);
  }
  return String(normalized || "")
    .split(/,|\n|\/|&|\+|\band\b|\s+/i)
    .map((part) => part.trim())
    .map((part) => {
      const atomic = ATOMIC_SEARCH_PHRASE_PATTERNS.find((item) => item.placeholder === part);
      return atomic ? atomic.canonical : part;
    })
    .filter((part) =>
      part &&
      part.length >= 2 &&
      ![
        "get", "me", "show", "all", "profiles", "profile", "candidate", "candidates",
        "with", "for", "in", "from", "the", "and", "or", "at", "to", "of", "by", "find",
        "those", "these", "who", "whom", "whose", "are", "is", "was", "were", "into", "within", "between",
        "has", "have", "less", "than", "under", "below", "maximum", "max", "days", "day", "notice", "period"
      ].includes(part)
    );
}

function normalizeCandidateSearchKeywords(values = []) {
  const list = Array.isArray(values) ? values : [values];
  return Array.from(new Set(list.flatMap(splitCandidateSearchKeywords)));
}

function isGarbageRoleText(value = "") {
  const role = normalizeDashboardText(value).toLowerCase().trim();
  if (!role) return true;
  if (role.length > 80) return true;
  const hardBad = [
    "those who are",
    "who are",
    "get me",
    "show me",
    "find me",
    "candidates",
    "profiles",
    "candidate",
    "profile"
  ];
  if (hardBad.some((phrase) => role === phrase || role.startsWith(`${phrase} `) || role.endsWith(` ${phrase}`))) return true;
  if (/^(those|who|are|with|from|in|for|me|get|show|find|\s)+$/i.test(role)) return true;
  const tokens = role.split(/\s+/).filter(Boolean);
  if (!tokens.length) return true;
  const filler = new Set(["those", "who", "are", "with", "from", "in", "for", "me", "get", "show", "find", "all", "the"]);
  const fillerCount = tokens.filter((token) => filler.has(token)).length;
  return fillerCount === tokens.length || fillerCount >= Math.max(2, Math.ceil(tokens.length * 0.7));
}

function escapeRegex(value = "") {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function candidateHayMatchesTerm(hay = "", term = "") {
  const normalizedHay = String(hay || "").toLowerCase();
  const normalizedTerm = normalizeDashboardText(term).toLowerCase().trim();
  if (!normalizedHay || !normalizedTerm) return false;
  if (normalizedTerm === ".net core" || normalizedTerm === "asp.net core") {
    return /\b(\.net\s*core|dot\s*net\s*core|dotnet\s*core|asp\.?\s*net\s*core|c#|c\s*sharp|mvc|web\s*api|entity\s*framework|ef\s*core)\b/i.test(normalizedHay);
  }
  // Canonical tech matching so ".NET" / "ASP.NET" / "dot net" / "node js" do not miss deterministic filters.
  if (normalizedTerm === "dotnet") {
    return /\b(dotnet|dot\s*net|asp\.?\s*net|net\s*core|\.net)\b/i.test(normalizedHay);
  }
  if (normalizedTerm === "nodejs") {
    return /\b(nodejs|node\.?\s*js|node)\b/i.test(normalizedHay);
  }
  if (normalizedTerm === "react") {
    return /\b(react|reactjs|react\.?\s*js)\b/i.test(normalizedHay);
  }
  if (normalizedTerm === "golang") {
    return /\b(golang|go\s*lang)\b/i.test(normalizedHay);
  }
  if (normalizedTerm.includes(" ")) {
    return normalizedHay.includes(normalizedTerm);
  }
  return new RegExp(`\\b${escapeRegex(normalizedTerm)}\\b`, "i").test(normalizedHay);
}

function buildKnownUniverseLocationSet(universe = [], synonyms = DEFAULT_SYNONYMS) {
  const known = new Set();
  (Array.isArray(universe) ? universe : []).forEach((item) => {
    const loc = String(item?.location || "").trim();
    if (!loc) return;
    const normalized = normalizeDashboardText(loc).toLowerCase();
    if (normalized) known.add(normalized);
    const alias = mapLocationAlias(normalized, synonyms);
    if (alias?.canonical) known.add(String(alias.canonical).toLowerCase());
    (alias?.variants || []).forEach((v) => {
      const token = String(v || "").trim().toLowerCase();
      if (token) known.add(token);
    });
  });
  return known;
}

function levenshteinDistance(a = "", b = "") {
  const s = String(a || "");
  const t = String(b || "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  const v0 = new Array(t.length + 1);
  const v1 = new Array(t.length + 1);
  for (let i = 0; i <= t.length; i += 1) v0[i] = i;
  for (let i = 0; i < s.length; i += 1) {
    v1[0] = i + 1;
    for (let j = 0; j < t.length; j += 1) {
      const cost = s[i] === t[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    for (let j = 0; j <= t.length; j += 1) v0[j] = v1[j];
  }
  return v0[t.length];
}

function coerceToKnownLocation(token = "", knownLocations = new Set()) {
  const raw = normalizeDashboardText(token).toLowerCase().trim();
  if (!raw) return "";
  if (knownLocations.has(raw)) return raw;
  // Only try fuzzy match for reasonably short tokens to avoid random text getting mapped.
  if (raw.length < 3 || raw.length > 24) return raw;
  let best = "";
  let bestDist = Infinity;
  for (const candidate of knownLocations) {
    const c = String(candidate || "").trim().toLowerCase();
    if (!c) continue;
    // Fast path: prefix/contains for common truncations.
    if (c.startsWith(raw) || raw.startsWith(c)) return c;
    const dist = levenshteinDistance(raw, c);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
      if (bestDist === 1) break;
    }
  }
  // Allow small typos like "hyerabad" -> "hyderabad"
  if (best && bestDist <= 2) return best;
  return raw;
}

function looksLikeNonLocationToken(value = "") {
  const token = normalizeDashboardText(value).toLowerCase();
  if (!token) return true;
  if (token.length >= 48) return true;
  if (/\d/.test(token)) return true;
  if (/\b(attempt|outcome|status|captured|assessment|notes?|applied|duplicate)\b/.test(token)) return true;
  if (/\bfrom\b/.test(token) && token.split(/\s+/).length > 2) return true;
  // Obvious role/skill words that should never be treated as a geography filter.
  if (/\b(sales|developer|engineer|programmer|manager|executive|account|loan|lending|fintech|saas|b2b|b2c|backend|frontend|fullstack|dotnet|node|nodejs|react|java|spring|golang)\b/.test(token)) {
    return true;
  }
  return false;
}

function sanitizeCandidateSearchFilters(filters, normalizedQuery = "", universe = [], synonyms = DEFAULT_SYNONYMS) {
  const next = filters && typeof filters === "object" ? { ...filters } : {};
  const qLower = String(normalizedQuery || "").toLowerCase();
  const qNormalized = normalizeDashboardText(qLower).toLowerCase();
  const searchScopeStopwords = new Set([
    "get", "show", "find", "me", "all", "profiles", "profile", "candidates", "candidate",
    "those", "who", "are", "is", "in", "from", "for", "with", "where", "under", "role",
    "captured", "notes", "note", "applied", "assessment", "assessments", "shared", "converted",
    "attempt", "outcome", "status", "duplicate", "busy", "interested", "not", "received", "responding"
  ]);
  const hasExplicitExperienceIntent =
    /\b\d+(?:\.\d+)?\s*\+?\s*years?\b/i.test(qLower)
    || /\b(?:fresher|entry level|junior|mid level|senior|lead|architect)\b/i.test(qLower);
  if (!hasExplicitExperienceIntent) {
    next.minExperienceYears = null;
    next.maxExperienceYears = null;
  }
  next.domainKeywords = normalizeCandidateSearchKeywords(next.domainKeywords || []);
  next.mustHaveSkills = Boolean(next.mustHaveSkills);
  if (Array.isArray(next.skills)) {
    const hasDotNetCore = next.skills.some((s) => {
      const t = normalizeDashboardText(s).toLowerCase().trim();
      return t === ".net core" || t === "asp.net core";
    });
    if (hasDotNetCore || /\b(\.net\s*core|dot\s*net\s*core|dotnet\s*core|asp\.?\s*net\s*core)\b/i.test(qLower)) {
      next.skills = [".NET Core"];
      next.skillsMatch = "all";
      next.mustHaveSkills = true;
      if (!resolveKnownRole(next.role)) next.role = "dotnet developer";
      next.roleFamilies = detectRoleFamilies(next.role);
      next.fallbackKeywords = normalizeCandidateSearchKeywords(
        [...(Array.isArray(next.fallbackKeywords) ? next.fallbackKeywords : []), ".NET Core"]
      ).filter((token) => String(token || "").toLowerCase() !== "core");
    }
  }
  const knownRole = resolveKnownRole(next.role);
  if (!knownRole || isGarbageRoleText(knownRole)) {
    next.role = "";
    if (!Array.isArray(next.roleFamilies) || !next.roleFamilies.length || next.roleFamilies.every((f) => !String(f || "").trim())) {
      next.roleFamilies = [];
    }
  } else {
    next.role = knownRole;
  }

  const knownLocations = buildKnownUniverseLocationSet(universe, synonyms);
  const knownRecruiterLabels = Array.from(
    new Set(
      (Array.isArray(universe) ? universe : [])
        .flatMap((item) => [item?.ownerRecruiter, item?.recruiterName, item?.sourcedRecruiter])
        .map((label) => String(label || "").trim())
        .filter(Boolean)
        .filter((label) => !/^unassigned$/i.test(label) && !/^website apply$/i.test(label))
    )
  );
  const knownClientLabels = Array.from(
    new Set(
      (Array.isArray(universe) ? universe : [])
        .map((item) => String(item?.clientName || "").trim())
        .filter(Boolean)
        .filter((label) => !/^unmapped candidates$/i.test(label))
    )
  );
  const knownTargetLabels = Array.from(
    new Set(
      (Array.isArray(universe) ? universe : [])
        .map((item) => String(item?.position || "").trim())
        .filter(Boolean)
    )
  );
  const queryMentionsAnyRecruiterLabel = () => {
    if (!knownRecruiterLabels.length) return false;
    const ranked = [...knownRecruiterLabels].sort((a, b) => b.length - a.length);
    return ranked.some((label) => {
      const needle = normalizeDashboardText(label).toLowerCase().trim();
      if (!needle) return false;
      const pattern = new RegExp(`\\b${escapeRegex(needle).replace(/\s+/g, "\\s+")}\\b`, "i");
      return pattern.test(qNormalized);
    });
  };

  const findKnownClientFromQuery = () => {
    if (!knownClientLabels.length) return "";
    const ranked = [...knownClientLabels].sort((a, b) => b.length - a.length);
    for (const label of ranked) {
      const needle = normalizeDashboardText(label).toLowerCase().trim();
      if (!needle) continue;
      const pattern = new RegExp(`\\b${escapeRegex(needle).replace(/\s+/g, "\\s+")}\\b`, "i");
      if (pattern.test(qNormalized)) return label;
    }
    return "";
  };

  const resolveRecruiterFromUniverse = (rawValue = "") => {
    if (!knownRecruiterLabels.length) return "";
    const raw = normalizeDashboardText(String(rawValue || "")).toLowerCase().trim();
    const queryText = qNormalized;

    const stripTail = (value) =>
      String(value || "")
        .replace(/\b(and|are|with|who|whose|where|that|from|for|in)\b.*$/i, "")
        .replace(/\b(not responding|not received|busy|duplicate|interested|not interested|screening reject|interview reject|call later|jd shared|feedback awaited)\b.*$/i, "")
        .trim();

    const cleanedRaw = normalizeDashboardText(stripTail(raw)).toLowerCase().trim();
    const candidates = [cleanedRaw, raw].filter(Boolean);

    const byNorm = new Map(
      knownRecruiterLabels.map((label) => [normalizeDashboardText(label).toLowerCase().trim(), label])
    );

    for (const token of candidates) {
      const exact = byNorm.get(token);
      if (exact) return exact;
    }
    for (const token of candidates) {
      const partial = Array.from(byNorm.entries()).find(([norm]) => token && (norm.includes(token) || token.includes(norm)));
      if (partial?.[1]) return partial[1];
    }

    const ranked = [...knownRecruiterLabels].sort((a, b) => b.length - a.length);
    for (const label of ranked) {
      const needle = normalizeDashboardText(label).toLowerCase().trim();
      if (!needle) continue;
      const pattern = new RegExp(`\\b${escapeRegex(needle).replace(/\s+/g, "\\s+")}\\b`, "i");
      if (pattern.test(queryText)) return label;
    }
    return "";
  };

  const inferTargetLabelFromQuery = () => {
    if (!knownTargetLabels.length) return "";
    const hasTargetIntent =
      /\b(jd|job|role|position|title|opening|openings)\b/i.test(qLower) ||
      /\bc2h\b/i.test(qLower) ||
      /\bcontract to hire\b/i.test(qLower);
    if (!hasTargetIntent) return "";
    const hasC2h = /\bc2h\b/i.test(qLower);
    if (hasC2h) return "c2h";

    const clientNorm = normalizeDashboardText(String(next.client || "")).toLowerCase().trim();
    const queryTokens = Array.from(
      new Set(
        qNormalized
          .split(/\s+/)
          .map((token) => String(token || "").trim())
          .filter((token) => token && token.length >= 3 && !searchScopeStopwords.has(token) && token !== clientNorm)
      )
    );
    if (!queryTokens.length) return "";

    let bestLabel = "";
    let bestScore = 0;
    for (const label of knownTargetLabels) {
      const labelNorm = normalizeDashboardText(label).toLowerCase().trim();
      if (!labelNorm) continue;
      if (clientNorm && !labelNorm.includes(clientNorm)) {
        // Keep scanning: target label can still be found without client token.
      }
      const score = queryTokens.reduce((count, token) => (labelNorm.includes(token) ? count + 1 : count), 0);
      if (score > bestScore) {
        bestScore = score;
        bestLabel = label;
      }
    }
    // Avoid weak random picks.
    if (bestScore >= 2) return bestLabel;
    return "";
  };

  if (!String(next.client || "").trim()) {
    const inferredClient = findKnownClientFromQuery();
    if (inferredClient) next.client = inferredClient;
  }

  if (!String(next.targetLabel || "").trim()) {
    const inferredTarget = inferTargetLabelFromQuery();
    if (inferredTarget) next.targetLabel = inferredTarget;
  }

  const recruiterIntentMentioned =
    /\b(assigned to|owned by|owner|under|sourced by|captured by|by)\b/i.test(qLower) ||
    Boolean(String(next.recruiterName || "").trim());
  const explicitRecruiterIntent =
    /\b(assigned to|owned by|owner|under|sourced by|captured by|by)\b/i.test(qLower) ||
    queryMentionsAnyRecruiterLabel();
  // Prevent accidental defaulting to actor/current recruiter in generic queries.
  if (!explicitRecruiterIntent && String(next.recruiterName || "").trim()) {
    next.recruiterName = "";
    next.recruiterField = "";
  }
  if (recruiterIntentMentioned) {
    const resolvedRecruiter = resolveRecruiterFromUniverse(String(next.recruiterName || "").trim());
    if (resolvedRecruiter) {
      next.recruiterName = resolvedRecruiter;
    } else if (String(next.recruiterName || "").trim()) {
      // Never keep garbage recruiter tails.
      next.recruiterName = "";
    }
  }

  const noiseSkillTokens = new Set([
    "not", "received", "feedback", "awaited", "awaiting", "responding", "response", "nr",
    "screening", "interview", "reject", "rejected", "aligned", "hold", "busy", "disconnected",
    "reachable", "switch", "off", "call", "later", "duplicate", "dropped", "shortlisted", "offered", "joined",
    "jd", "shared", "interested", "revisit"
  ]);

  // Interview list queries like "Interviews from 13th April 2026 to 19th April 2026" should not
  // accidentally inherit/introduce role/skill/company/location filters from AI interpretation.
  // These are "source-only" queries over assessments using the interview date field.
  const isInterviewIntentQuery = /\binterviews?\b/i.test(qLower) || /\binterview\s+aligned\b/i.test(qLower) || /\bscheduled\s+interview\b/i.test(qLower);
  if (isInterviewIntentQuery) {
    const remainder = qLower
      .replace(/\binterviews?\b/g, " ")
      .replace(/\baligned\b|\bscheduled\b|\bschedule\b/g, " ")
      .replace(/\bfrom\b|\bto\b|\bbetween\b|\band\b/g, " ")
      .replace(/\b(last|this|next)\b/g, " ")
      .replace(/\b(days?|weeks?|months?|month|week|today|tomorrow|yesterday)\b/g, " ")
      .replace(/\b\d{1,4}(?:st|nd|rd|th)?\b/g, " ")
      .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/g, " ")
      .replace(/[^\w\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const hasExtraConstraints = Boolean(remainder);
    if (!hasExtraConstraints) {
      next.role = "";
      next.skills = [];
      next.currentCompany = "";
      next.client = "";
      next.location = "";
      next.locations = [];
      next.statuses = [];
      next.detailedStatuses = [];
      next.recruiterName = "";
      next.recruiterField = "";
      next.recruiterScope = "";
      next.minExperienceYears = null;
      next.maxExperienceYears = null;
      next.minCurrentCtcLpa = null;
      next.maxCurrentCtcLpa = null;
      next.minExpectedCtcLpa = null;
      next.maxExpectedCtcLpa = null;
      next.maxNoticeDays = null;

      // Ensure interview window uses assessment interview dates.
      next.sourceTypeFilter = String(next.sourceTypeFilter || "").trim() || "assessment";
      next.dateField = "interview";
    }
  }

  // Recruiter-only queries like "Profiles sourced by Nike" or "Profiles assigned to Sakeena"
  // should not inherit unrelated AI filters like location/company/notice buckets.
  const recruiterOnlyIntent = Boolean(String(next.recruiterName || "").trim());
  if (recruiterOnlyIntent) {
    const remainder = qLower
      .replace(/\bprofiles?\b|\bcandidates?\b|\bshow\b|\bget\b|\bme\b|\ball\b/g, " ")
      .replace(/\bself\b|\bsourced\b|\bcaptured\b|\bassigned\b|\bowned\b|\bowner\b|\bby\b|\bto\b|\bof\b|\bfor\b/g, " ")
      .replace(new RegExp(`\\b${String(next.recruiterName || "").trim().toLowerCase().replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "g"), " ")
      .replace(/[^\w\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const hasExtraConstraints = Boolean(remainder);
    if (!hasExtraConstraints) {
      next.role = "";
      next.skills = [];
      next.currentCompany = "";
      next.client = "";
      next.location = "";
      next.locations = [];
      next.statuses = [];
      next.detailedStatuses = [];
      next.minExperienceYears = null;
      next.maxExperienceYears = null;
      next.minCurrentCtcLpa = null;
      next.maxCurrentCtcLpa = null;
      next.minExpectedCtcLpa = null;
      next.maxExpectedCtcLpa = null;
      next.maxNoticeDays = null;
      next.dateFrom = "";
      next.dateTo = "";
      next.dateField = "";
      // Don't accidentally narrow recruiter-only queries down to "captured" only.
      // Default is "all sources" unless the recruiter explicitly says applied/captured/assessments/converted.
      if (!/\b(applied|applicants?|website\s+apply|hosted\s+apply|captured\s+notes?|assessments?|converted|shared)\b/i.test(qLower)) {
        next.sourceTypeFilter = "";
      }
    }
  }

  const noticeMentioned = /\b(notice|immediate|join|joining|lwd|doj)\b/i.test(qLower);
  if (!noticeMentioned && (next.maxNoticeDays === 0 || String(next.maxNoticeDays || "").trim() === "0")) {
    next.maxNoticeDays = null;
  }

  // If the recruiter explicitly asked for a source bucket, honor it even if AI guessed wrong.
  // This is critical for queries like "duplicate ... in captured notes" which must not get forced to assessment-only.
  const capturedNotesMentioned = /\bcaptured\s+notes?\b|\bnotes?\s+captured\b|\bcaptured\s+note\b/i.test(qLower);
  const appliedMentioned = /\bapplied\b|\bapplicants?\b|\bwebsite\s+apply\b|\bhosted\s+apply\b/i.test(qLower);
  const assessmentsMentioned = /\bassessments?\b|\bconverted\b|\bshared\b|\bcv shared\b|\bcv to be shared\b/i.test(qLower);
  if (capturedNotesMentioned) next.sourceTypeFilter = "captured";
  else if (appliedMentioned) next.sourceTypeFilter = "applied";
  else if (assessmentsMentioned && String(next.sourceTypeFilter || "").trim() === "") next.sourceTypeFilter = "assessment";

  const rawLocation = String(next.location || "").trim();
  if (rawLocation) {
    const normalized = normalizeDashboardText(rawLocation).toLowerCase();
    const alias = mapLocationAlias(normalized, synonyms);
    const canonical = coerceToKnownLocation(String(alias?.canonical || normalized), knownLocations);
    // Do NOT require location to exist in current universe. New cities (or formatting differences like "Delhi / NCR")
    // should still be accepted as long as it doesn't look like a role/skill phrase.
    if (looksLikeNonLocationToken(rawLocation)) {
      // Don't let a bad AI location guess zero out the result set.
      // If it looks like a role/skill phrase, keep it searchable via skills instead.
      const extraSkills = splitCandidateSearchKeywords(rawLocation);
      if (extraSkills.length) {
        next.skills = normalizeCandidateSearchKeywords([...(Array.isArray(next.skills) ? next.skills : []), ...extraSkills]);
      }
      next.location = "";
    } else {
      next.location = canonical;
    }
  }

  const locations = Array.isArray(next.locations) ? next.locations : [];
  const cleanedLocations = locations
    .map((loc) => String(loc || "").trim())
    .filter(Boolean)
    .filter((loc) => {
      const normalized = normalizeDashboardText(loc).toLowerCase();
      const alias = mapLocationAlias(normalized, synonyms);
      const canonical = coerceToKnownLocation(String(alias?.canonical || normalized), knownLocations);
      if (!canonical) return false;
      if (looksLikeNonLocationToken(loc)) return false;
      return true;
    })
    .map((loc) => {
      const normalized = normalizeDashboardText(loc).toLowerCase();
      const alias = mapLocationAlias(normalized, synonyms);
      return coerceToKnownLocation(String(alias?.canonical || normalized), knownLocations);
    });
  next.locations = Array.from(new Set(cleanedLocations));
  // IMPORTANT:
  // If multiple locations are present, do NOT also set `location` (single) because
  // candidateMatchesNaturalFilter checks `location` first and would accidentally turn
  // the intended OR into an AND (must match the first location).
  if (next.locations.length >= 2) {
    next.location = "";
  } else if (!next.location && next.locations.length) {
    next.location = String(next.locations[0] || "").trim();
  }

  // Source-only queries like "profiles in assessments" should not force role/skills filters.
  const stripped = qLower.replace(/[^\w\s]+/g, " ").replace(/\s+/g, " ").trim();
  const tokens = stripped.split(/\s+/).filter(Boolean);
  const sourceOnlyTokens = new Set([
    "get", "me", "show", "all", "profiles", "profile", "candidate", "candidates",
    "in", "of", "the", "a", "an",
    "assessment", "assessments", "converted", "shared", "captured", "sourced", "applied"
  ]);
  const isSourceOnlyQuery = tokens.length && tokens.every((t) => sourceOnlyTokens.has(t));
  if (isSourceOnlyQuery) {
    next.role = "";
    next.skills = [];
    if (!/\bin\s+[a-z]/i.test(qLower)) {
      next.location = "";
      next.locations = [];
    }
  }

  // If the query is primarily about a status (attempt outcome / assessment status),
  // don't let those status words become required skills keywords.
  if (Array.isArray(next.detailedStatuses) && next.detailedStatuses.length && Array.isArray(next.skills) && next.skills.length) {
    const cleaned = next.skills
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .filter((s) => !noiseSkillTokens.has(normalizeDashboardText(s).toLowerCase()));
    next.skills = cleaned;
  }

  // If the query mentions a status term that exists in both worlds:
  // - captured notes attempt outcomes (attemptOutcome)
  // - assessment statuses (assessmentStatus)
  // then requiring BOTH creates false "zero result" scenarios.
  // Example: "duplicate for Attentive" should return:
  // - captured notes with attempt outcome Duplicate
  // - assessments with status Duplicate
  // So we convert it into a single detailedStatuses term (union) and clear the strict fields.
  const hasBothStatusWorlds = Boolean(String(next.assessmentStatus || "").trim()) && Boolean(String(next.attemptOutcome || "").trim());
  if (hasBothStatusWorlds) {
    const explicitAttemptScope = /\battempt\s+outcome\b|\bfrom\s+attempt\b|\bcaptured\s+notes?\b/.test(qLower);
    const explicitAssessmentScope = /\bassessment\s+status\b|\bfrom\s+assessment\b|\bassessments?\b|\bconverted\b|\bshared\b/.test(qLower);
    if (explicitAttemptScope && !explicitAssessmentScope) {
      next.assessmentStatus = "";
    } else if (explicitAssessmentScope && !explicitAttemptScope) {
      next.attemptOutcome = "";
    } else {
      const normalizedTerm = normalizeDashboardText(String(next.assessmentStatus || next.attemptOutcome || "")).toLowerCase().trim();
      if (normalizedTerm) {
        const existing = Array.isArray(next.detailedStatuses) ? next.detailedStatuses : [];
        const merged = Array.from(new Set([...existing.map((s) => normalizeDashboardText(s).toLowerCase().trim()).filter(Boolean), normalizedTerm]));
        next.detailedStatuses = merged;
      }
      next.assessmentStatus = "";
      next.attemptOutcome = "";
    }
  }

  // Domain + Sales intent:
  // Queries like "finance or lending or loan sales profiles from Gurugram or Delhi" should mean:
  // - Sales is REQUIRED (role family)
  // - Domain keywords are an OR-group (finance/lending/loan/fintech)
  // Without this, "sales" and "development" tokens create noisy matches or over-filtering.
  const hasSalesIntent =
    /\bsales\b/i.test(qLower) ||
    /\bbusiness\s+development\b/i.test(qLower) ||
    /\baccount\s+(?:executive|manager)\b/i.test(qLower) ||
    /\brelationship\s+manager\b/i.test(qLower);
  const hasFinanceDomainIntent = /\b(finance|fintech|lending|loan)\b/i.test(qLower);
  if (hasSalesIntent && hasFinanceDomainIntent) {
    const rawSkills = Array.isArray(next.skills) ? next.skills : [];
    const normalizedSkills = normalizeCandidateSearchKeywords(rawSkills);
    const domainSet = new Set(["finance", "fintech", "lending", "loan"]);
    const domainTermsFromSkills = normalizedSkills.filter((t) => domainSet.has(String(t || "").toLowerCase().trim()));
    // Even if AI/heuristics failed to put domain tokens into skills, the query text itself is a strong signal.
    // This makes "lending or fintech or finance sales" behave like an OR, not an accidental AND.
    const domainTermsFromQuery = Array.from(
      new Set((qLower.match(/\b(finance|fintech|lending|loan)\b/g) || []).map((m) => String(m || "").trim().toLowerCase()))
    ).filter(Boolean);
    const domainTerms = Array.from(new Set([...(domainTermsFromSkills || []), ...(domainTermsFromQuery || []), ...next.domainKeywords]));

    // IMPORTANT:
    // `roleFamilies=["sales"]` can be too strict because many "sales" roles are stored as AE/AM/BDM/RM etc
    // without containing the literal word "sales" in the saved hay. That makes OR queries look worse than
    // single-domain queries, which is exactly what users are reporting.
    //
    // So we express sales intent as an OR-group of sales-family terms, and keep domain terms as another OR-group.
    // This yields:
    // - MUST match at least one finance domain term (finance|lending|loan|fintech)
    // - MUST match at least one sales-family term (sales|business development|AE|AM|RM|BDM...)
    next.roleFamilies = [];
    next.role = "";

    const salesFamilyTerms = [
      "sales",
      "business development",
      "account executive",
      "account manager",
      "enterprise sales",
      "corporate sales",
      "inside sales",
      "relationship manager",
      "bdm",
      "bdr",
      "sdr",
      "client acquisition",
      "key account",
      "key accounts"
    ];

    next.skills = [];
    next.mustSkills = [];
    // Use OR semantics for domain terms.
    if (domainTerms.length >= 2) next.skillsMatch = "any";
    next.anyOfSkillGroups = domainTerms.length ? [domainTerms, salesFamilyTerms] : [salesFamilyTerms];
  }

  // Generic domain keyword support (not only finance/sales).
  // Keep deterministic extraction as OR-group and avoid poisoning `skills` with noisy tokens.
  if (Array.isArray(next.domainKeywords) && next.domainKeywords.length) {
    const existingGroups = Array.isArray(next.anyOfSkillGroups) ? next.anyOfSkillGroups.filter((group) => Array.isArray(group) && group.length) : [];
    const hasDomainGroup = existingGroups.some((group) =>
      group.some((term) => next.domainKeywords.includes(String(term || "").toLowerCase().trim()))
    );
    if (!hasDomainGroup) {
      existingGroups.push(Array.from(new Set(next.domainKeywords)));
    }
    next.anyOfSkillGroups = existingGroups;
    if (Array.isArray(next.skills) && next.skills.length) {
      next.skills = next.skills.filter((token) => !next.domainKeywords.includes(String(token || "").toLowerCase().trim()));
    }
  }

  // Keep location OR semantics explicit for "x and y" / "x or y" queries.
  if (next.locations.length >= 2) next.location = "";

  // If someone asks for "duplicate" without explicitly scoping to assessments,
  // don't let AI accidentally force `sourceTypeFilter="assessment"` which hides captured duplicates.
  const normalizedDetailed = Array.isArray(next.detailedStatuses)
    ? next.detailedStatuses.map((s) => normalizeDashboardText(s).toLowerCase().trim()).filter(Boolean)
    : [];
  const normalizedStatuses = Array.isArray(next.statuses)
    ? next.statuses.map((s) => normalizeDashboardText(s).toLowerCase().trim()).filter(Boolean)
    : [];
  const hasDuplicateIntent =
    normalizedDetailed.includes("duplicate") ||
    normalizedStatuses.includes("duplicate") ||
    /\bduplicate\b/i.test(qLower) ||
    normalizeDashboardText(String(next.assessmentStatus || "")).toLowerCase().includes("duplicate") ||
    normalizeDashboardText(String(next.attemptOutcome || "")).toLowerCase().includes("duplicate");
  if (hasDuplicateIntent) {
    const explicitAssessmentScope = /\b(assessment|assessments|converted|shared|pipeline)\b/i.test(qLower);
    if (!explicitAssessmentScope && String(next.sourceTypeFilter || "").trim() === "assessment") {
      next.sourceTypeFilter = "";
    }
  }

  // Scope phrases like "from captured notes" / "in assessments" indicate source bucket,
  // not a date field. Avoid polluting dateField with "captured" in such queries unless
  // a real date intent is present.
  const hasExplicitDateIntent =
    /\b(today|yesterday|tomorrow|this week|last week|this month|last month|last\s+\d+\s+days|from\s+\d|between\s+\d|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(qLower);
  if (!hasExplicitDateIntent) {
    const hasSourceScopeOnly = /\b(from|in)\s+(captured\s+notes?|captured\s+note|assessments?|applied|applicants?)\b/i.test(qLower);
    if (hasSourceScopeOnly && ["captured", "shared", "interview", "joined"].includes(String(next.dateField || "").trim())) {
      next.dateField = "";
    }
  }

  // If query is primarily status + source/client scoping (no role intent),
  // drop noisy skill tokens that AI may hallucinate from sentence grammar.
  const hasStatusIntent =
    Boolean(String(next.attemptOutcome || "").trim()) ||
    Boolean(String(next.assessmentStatus || "").trim()) ||
    (Array.isArray(next.detailedStatuses) && next.detailedStatuses.length > 0);
  const hasRoleIntent = Boolean(String(next.role || "").trim()) || (Array.isArray(next.roleFamilies) && next.roleFamilies.length > 0);
  const hasSourceScopeIntent = /\b(captured\s+notes?|captured\s+note|assessments?|assessment\s+status|attempt\s+outcome|applied|applicants?)\b/i.test(qLower);
  if (hasStatusIntent && hasSourceScopeIntent && !hasRoleIntent) {
    next.skills = [];
    next.mustSkills = [];
    next.anyOfSkillGroups = [];
  }

  return next;
}

function isLikelyDatePhraseToken(value = "") {
  const text = normalizeDashboardText(value).toLowerCase().trim();
  if (!text) return false;
  if (/\b(today|tomorrow|yesterday|next week|last week|this week|next month|last month|this month|next year|last year)\b/.test(text)) return true;
  if (/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/.test(text)) return true;
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(text)) return true;
  if (/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\b/.test(text)) return true;
  if (/\b\d{1,2}(st|nd|rd|th)\b/.test(text)) return true;
  return false;
}

function uniqStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((v) => String(v || "").trim()).filter(Boolean)));
}

function validateOpenAiPrimaryFilters(filters, { query = "", universe = [], synonyms = DEFAULT_SYNONYMS } = {}) {
  const qLower = normalizeDashboardText(query).toLowerCase();
  const next = filters && typeof filters === "object" ? { ...filters } : {};
  const knownLocations = buildKnownUniverseLocationSet(universe, synonyms);
  const knownRecruiters = uniqStrings(
    (Array.isArray(universe) ? universe : []).flatMap((item) => [item?.ownerRecruiter, item?.recruiterName, item?.sourcedRecruiter])
  ).filter((label) => !/^unassigned$/i.test(label) && !/^website apply$/i.test(label));
  const hasExplicitTargetIntent = /\b(jd|job|role|position|title|opening|openings|under)\b/i.test(qLower);
  const hasExplicitRecruiterIntent = /\b(assigned to|owned by|owner|sourced by|captured by|by|under)\b/i.test(qLower);

  next.skills = normalizeCandidateSearchKeywords(uniqStrings(next.skills));
  next.domainKeywords = normalizeCandidateSearchKeywords(uniqStrings(next.domainKeywords));
  next.fallbackKeywords = normalizeCandidateSearchKeywords(uniqStrings(next.fallbackKeywords));
  next.jobTitleKeywords = uniqStrings(next.jobTitleKeywords);
  next.statuses = uniqStrings(next.statuses).map((s) => normalizeDashboardText(s)).filter(Boolean);
  next.detailedStatuses = uniqStrings(next.detailedStatuses).map((s) => normalizeDashboardText(s)).filter(Boolean);
  next.locations = uniqStrings(next.locations);
  next.roleFamilies = uniqStrings(next.roleFamilies);

  const rawRole = String(next.role || "").trim();
  const resolvedRole = resolveKnownRole(rawRole);
  if (!resolvedRole || isGarbageRoleText(rawRole)) {
    if (rawRole) next.fallbackKeywords = normalizeCandidateSearchKeywords([...next.fallbackKeywords, rawRole]);
    next.role = "";
    next.roleFamilies = [];
  } else {
    next.role = resolvedRole;
    if (!next.roleFamilies.length) next.roleFamilies = detectRoleFamilies(resolvedRole);
  }

  // Role phrases should never leak into locations.
  const sanitizeLocationToken = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (isLikelyDatePhraseToken(raw) || looksLikeNonLocationToken(raw)) return "";
    const normalized = normalizeDashboardText(raw).toLowerCase();
    const alias = mapLocationAlias(normalized, synonyms);
    const canonical = coerceToKnownLocation(String(alias?.canonical || normalized), knownLocations);
    return canonical;
  };

  const singleLocation = sanitizeLocationToken(next.location);
  const multiLocations = uniqStrings(next.locations.map(sanitizeLocationToken)).filter(Boolean);
  next.locations = uniqStrings([...(singleLocation ? [singleLocation] : []), ...multiLocations]).filter((loc) => !isLikelyDatePhraseToken(loc));
  if (next.locations.length >= 2) next.location = "";
  else next.location = next.locations.length === 1 ? next.locations[0] : singleLocation;
  if (!next.location) next.location = "";
  if (!next.locations.length && next.location) next.locations = [next.location];

  // OpenAI is primary: recruiter name only if explicitly in query and maps to known recruiter.
  const recruiterToken = normalizeDashboardText(String(next.recruiterName || "")).toLowerCase().trim();
  if (!hasExplicitRecruiterIntent || !recruiterToken) {
    next.recruiterName = "";
    next.recruiterField = "";
    next.recruiterScope = "";
  } else {
    const match = knownRecruiters.find((label) => {
      const norm = normalizeDashboardText(label).toLowerCase();
      return recruiterToken && (norm === recruiterToken || norm.includes(recruiterToken) || recruiterToken.includes(norm));
    });
    if (match) {
      next.recruiterName = match;
    } else {
      next.recruiterName = "";
      next.recruiterField = "";
      next.recruiterScope = "";
    }
  }

  if (!hasExplicitTargetIntent) next.targetLabel = "";
  if (!hasExplicitTargetIntent && next.jobTitleKeywords?.length) {
    next.fallbackKeywords = normalizeCandidateSearchKeywords([...next.fallbackKeywords, ...next.jobTitleKeywords]);
  }

  // Keep unknown useful tokens in fallback instead of forcing wrong fields.
  if (!next.role && !next.skills.length && next.domainKeywords.length) {
    next.fallbackKeywords = normalizeCandidateSearchKeywords([...next.fallbackKeywords, ...next.domainKeywords]);
  }

  // Deterministic intent for shared/interview/stale should enforce deterministic path-friendly fields.
  if (next.sharedOnly && !next.sourceTypeFilter) next.sourceTypeFilter = "assessment";
  if (next.interviewScheduled && !next.dateField) next.dateField = "interview";
  if (String(next.dateField || "").trim() === "last_contacted") next.sourceTypeFilter = next.sourceTypeFilter || "captured";

  return next;
}

function resolveSearchIntentRoute(intent = "") {
  const key = String(intent || "").trim().toLowerCase();
  const operationalIntents = new Set([
    "interview_schedule_search",
    "shared_profiles_search",
    "stale_candidates",
    "reports",
    "recruiter_activity_report"
  ]);
  if (operationalIntents.has(key)) {
    return {
      intent: key,
      semanticAllowed: false,
      chosenSearchMode: "deterministic_only",
      searchPath: "deterministic_db_filter"
    };
  }
  return {
    intent: key || "candidate_search",
    semanticAllowed: true,
    chosenSearchMode: "candidate_discovery",
    searchPath: "deterministic_db_filter_with_optional_semantic_rerank"
  };
}

function isPlainCandidateLookupQuery(rawQuery = "") {
  const value = normalizeDashboardText(rawQuery).replace(/[^\w\s+&/-]+/g, " ").replace(/\s+/g, " ").trim();
  if (!value) return false;
  if (/\bAND\b|\bOR\b/i.test(String(rawQuery || ""))) return false;
  if (/\b(?:under|below|max|minimum|min|years?|ctc|notice|profiles?|candidates?|sales|saas|b2b|developer|engineer|recruiter|sourced|captured|shared|converted|assessment|interview|joined|offered|rejected|location|company|client|role|skill)\b/.test(value)) return false;
  const tokens = value.split(/\s+/).filter(Boolean);
  return tokens.length >= 1 && tokens.length <= 4;
}

function splitBooleanTerms(raw = "") {
  const normalized = String(raw || "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'");
  const matches = normalized.match(/"[^"]+"|'[^']+'|\S+/g) || [];
  return matches
    .map((part) => String(part || "").trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

const BOOLEAN_TERM_SYNONYMS = {
  saas: ["saas", "\"software as a service\"", "software"],
  sales: ["sales", "\"business development\"", "\"account executive\"", "\"account manager\"", "\"enterprise sales\"", "\"corporate sales\""],
  b2b: ["b2b", "\"enterprise sales\"", "\"corporate sales\"", "\"business development\""],
  ae: ["ae", "\"account executive\"", "\"account manager\""],
  hr: ["hr", "\"human resources\"", "\"talent acquisition\""],
  node: ["node", "nodejs", "\"node js\"", "\"node.js\""],
  react: ["react", "reactjs", "\"react js\"", "\"react.js\""],
  golang: ["golang", "go", "\"go lang\"", "\"go-language\""],
  ".net": [".net", "dotnet", "\"dot net\"", "asp.net", "aspnet", "c#", "csharp"],
  dotnet: ["dotnet", ".net", "\"dot net\"", "asp.net", "aspnet", "c#", "csharp"],
  frontend: ["frontend", "\"front end\"", "\"front-end\""],
  backend: ["backend", "\"back end\"", "\"back-end\""],
  devops: ["devops", "\"dev ops\"", "\"dev ops engineer\""]
};

function expandBooleanTerm(term = "") {
  const normalized = normalizeDashboardText(term);
  const synonyms = BOOLEAN_TERM_SYNONYMS[normalized];
  if (!synonyms) return [normalized].filter(Boolean);
  return Array.from(new Set([normalized, ...synonyms.map((item) => normalizeDashboardText(item))].filter(Boolean)));
}

function parseBooleanSearchQuery(rawQuery = "") {
  const query = String(rawQuery || "").trim();
  if (!query) return [];
  const compact = query.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
  if (!compact) return [];
  if (/\bAND\b|\bOR\b/i.test(compact)) {
    return compact
      .split(/\bAND\b/i)
      .map((group) => splitBooleanTerms(group.split(/\bOR\b/i).join(" ")))
      .map((group) => group.filter(Boolean))
      .filter((group) => group.length);
  }
  return splitBooleanTerms(compact).map((term) => [term]);
}

function quoteBooleanTerm(term = "") {
  const raw = String(term || "").trim();
  if (!raw) return "";
  if (/^[a-z0-9_.#+-]+$/i.test(raw) && !/\s/.test(raw)) return raw;
  return `"${raw.replace(/"/g, '\\"')}"`;
}

function uniqNormalizedBooleanTerms(list = []) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const raw = String(item || "").trim();
    if (!raw) continue;
    const key = normalizeDashboardText(raw).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
  }
  return out;
}

function buildBooleanQueryFromFilters(rawQuery = "", filters = {}) {
  const f = filters && typeof filters === "object" ? filters : {};
  const clauses = [];

  const addOrClause = (terms = []) => {
    const uniqTerms = uniqNormalizedBooleanTerms(terms).map(quoteBooleanTerm).filter(Boolean);
    if (!uniqTerms.length) return;
    if (uniqTerms.length === 1) clauses.push(uniqTerms[0]);
    else clauses.push(`(${uniqTerms.join(" OR ")})`);
  };

  const addAndGroupClause = (groups = []) => {
    const normalizedGroups = Array.isArray(groups) ? groups : [];
    normalizedGroups.forEach((group) => {
      const terms = uniqNormalizedBooleanTerms(group);
      if (!terms.length) return;
      addOrClause(terms);
    });
  };

  if (Array.isArray(f.anyOfSkillGroups) && f.anyOfSkillGroups.length) {
    addAndGroupClause(f.anyOfSkillGroups);
  } else if (Array.isArray(f.mustSkills) && f.mustSkills.length) {
    const terms = uniqNormalizedBooleanTerms(f.mustSkills);
    terms.forEach((term) => clauses.push(quoteBooleanTerm(term)));
  } else if (Array.isArray(f.skills) && f.skills.length) {
    if (String(f.skillsMatch || "").toLowerCase() === "all") {
      uniqNormalizedBooleanTerms(f.skills).forEach((term) => clauses.push(quoteBooleanTerm(term)));
    } else {
      addOrClause(f.skills);
    }
  }

  if (Array.isArray(f.domainKeywords) && f.domainKeywords.length) addOrClause(f.domainKeywords);
  if (f.role) addOrClause([f.role]);
  if (f.currentCompany) addOrClause([f.currentCompany]);
  if (f.client) addOrClause([f.client]);
  if (f.targetLabel) addOrClause([f.targetLabel]);
  if (Array.isArray(f.jobTitleKeywords) && f.jobTitleKeywords.length) addOrClause(f.jobTitleKeywords);
  if (Array.isArray(f.fallbackKeywords) && f.fallbackKeywords.length) addOrClause(f.fallbackKeywords);

  const locTerms = Array.isArray(f.locations) && f.locations.length ? f.locations : (f.location ? [f.location] : []);
  if (locTerms.length) addOrClause(locTerms);

  if (!clauses.length) {
    const fallback = String(rawQuery || "").trim();
    return fallback || "";
  }
  return clauses.join(" AND ");
}

function candidateMatchesBooleanQuery(item, rawQuery = "") {
  const groups = parseBooleanSearchQuery(rawQuery);
  if (!groups.length) return true;
  const hay = buildCandidateSearchHay(item);
  const matchesVariant = (variant = "") => {
    const needle = String(variant || "").trim();
    if (!needle) return false;
    // Phrase match: keep substring semantics.
    if (needle.includes(" ") || needle.startsWith(".") || /[^a-z0-9]/i.test(needle)) {
      return hay.includes(needle);
    }
    // Short acronyms/terms like "ats" should match whole words only (avoid substring noise).
    if (needle.length <= 3) {
      try {
        return new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\b`, "i").test(hay);
      } catch {
        return hay.includes(needle);
      }
    }
    return hay.includes(needle);
  };
  return groups.every((group) =>
    group.some((term) => expandBooleanTerm(term).some((variant) => matchesVariant(variant)))
  );
}

function candidateMatchesLooseNaturalTokens(item, rawQuery = "") {
  const tokens = buildNaturalSearchFallbackTokens(rawQuery);
  if (!tokens.length) return true;
  const hay = buildCandidateSearchHay(item);
  const matchedCount = tokens.filter((token) => hay.includes(normalizeDashboardText(token))).length;
  if (!matchedCount) return false;
  if (tokens.length === 1) return matchedCount >= 1;
  if (tokens.length === 2) return matchedCount >= 1;
  return matchedCount >= Math.max(2, Math.ceil(tokens.length * 0.5));
}

function buildCandidateSearchHay(item = {}) {
  const persisted = String(item?.raw?.metadata?.searchDocV1 || item?.raw?.metadata?.search_doc_v1 || "").trim();
  if (persisted) {
    const dynamic = normalizeDashboardText([
      item.candidateStatus || "",
      item.pipelineStage || "",
      item.workflowStatus || "",
      item.attemptStatus || ""
    ].join(" "));
    const cvExcerpt = String(item?.hiddenCvText || "").trim();
    return normalizeCandidateSearchDocText(`${persisted} ${dynamic} ${cvExcerpt}`);
  }
  const base = normalizeDashboardText([
    item.candidateName || "",
    item.raw?.candidate?.phone || "",
    item.raw?.candidate?.email || "",
    item.raw?.assessment?.phoneNumber || "",
    item.raw?.assessment?.emailId || "",
    item.role || "",
    item.position || "",
    item.company || "",
    item.location || "",
    item.clientName || "",
    item.recruiterName || "",
    item.sourcedRecruiter || "",
    item.ownerRecruiter || "",
    item.currentCtc || "",
    item.expectedCtc || "",
    item.noticePeriod || "",
    item.totalExperience || "",
    item.currentOrgTenure || "",
    item.highestEducation || "",
    Array.isArray(item.skills) ? item.skills.join(" ") : "",
    Array.isArray(item.inferredTags) ? item.inferredTags.join(" ") : "",
    item.hiddenCvText || "",
    item.notesText || "",
    item.candidateStatus || "",
    item.pipelineStage || "",
    item.workflowStatus || "",
    item.attemptStatus || ""
  ].join(" "));
  // Make common tech keywords searchable even when punctuation/format differs in JSON CV text.
  return normalizeCandidateSearchDocText(base);
}

function deriveInterviewAtFromHistory(assessment) {
  if (!assessment || typeof assessment !== "object") return "";
  const history = Array.isArray(assessment.statusHistory) ? assessment.statusHistory : [];
  if (!history.length) return "";
  const candidates = history.filter((entry) => {
    const status = String(entry?.status || "").trim();
    if (!status) return false;
    if (isInterviewAlignedStatus(status)) return true;
    if (String(status).toLowerCase() === "feedback awaited") return true;
    return false;
  });
  if (!candidates.length) return "";
  const toTs = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return 0;
    const parsed = parseIsoDateValue(raw);
    return parsed ? parsed.getTime() : 0;
  };
  const best = candidates
    .map((entry) => ({
      entry,
      ts: Math.max(toTs(entry?.at), toTs(entry?.updatedAt), toTs(entry?.updated_at))
    }))
    .sort((a, b) => b.ts - a.ts)[0];
  const picked = best?.entry || null;
  if (!picked) return "";
  return String(picked.at || picked.updatedAt || picked.updated_at || "").trim();
}

function buildCandidateSearchUniverse(candidates = [], assessments = [], jobs = []) {
  const assessmentsById = new Map((assessments || []).map((item) => [String(item?.id || "").trim(), item]));
  const universe = [];
  const seenAssessmentIds = new Set();
  const knownJdTitles = buildKnownJdTitleSet(jobs);
  const jobById = buildJobIndexById(jobs);
  const jobByTitle = buildJobIndexByTitle(jobs);

  const canonicalCandidates = (() => {
    const looseCandidates = [];
    const bestByAssessment = new Map();
    for (const candidate of Array.isArray(candidates) ? candidates : []) {
      const linkedAssessment = getCanonicalLinkedAssessmentForCandidate(candidate, assessmentsById) || null;
      const assessmentId = String(linkedAssessment?.id || "").trim();
      if (!assessmentId) {
        looseCandidates.push(candidate);
        continue;
      }
      const existing = bestByAssessment.get(assessmentId) || null;
      if (!existing) {
        bestByAssessment.set(assessmentId, candidate);
        continue;
      }
      const prevScore = candidateRowQualityScore(existing);
      const nextScore = candidateRowQualityScore(candidate);
      if (nextScore > prevScore) bestByAssessment.set(assessmentId, candidate);
    }
    return [...looseCandidates, ...Array.from(bestByAssessment.values())];
  })();

  for (const candidate of canonicalCandidates) {
    const candidateMeta = decodeApplicantMetadata(candidate);
    const candidateSource = normalizeDashboardText(candidate?.source || candidateMeta?.sourcePlatform || "");
    const candidateDraftPayload = normalizeJsonObjectInput(candidate?.draft_payload || candidate?.draftPayload || {});
    const candidateScreeningAnswers = normalizeJsonObjectInput(candidate?.screening_answers || candidate?.screeningAnswers || {});
    const metaScreeningAnswers = normalizeJsonObjectInput(
      candidateMeta?.jdScreeningAnswers
        || candidateMeta?.jd_screening_answers
        || candidateMeta?.jdScreeninganswers
        || {}
    );
    const draftScreeningAnswers = normalizeJsonObjectInput(
      candidateDraftPayload?.jdScreeningAnswers
        || candidateDraftPayload?.jd_screening_answers
        || {}
    );
    const combinedScreeningText = [
      screeningAnswersToSearchText(candidateScreeningAnswers),
      screeningAnswersToSearchText(draftScreeningAnswers),
      screeningAnswersToSearchText(metaScreeningAnswers)
    ].filter(Boolean).join("\n");
    const cachedCvResult = getVersionedCvAnalysisResult(candidateMeta) || {};
    const linkedAssessment = getCanonicalLinkedAssessmentForCandidate(candidate, assessmentsById) || null;
    const assessmentId = String(linkedAssessment?.id || "").trim();
    const isConverted = Boolean(assessmentId);
    if (assessmentId) seenAssessmentIds.add(assessmentId);
    const resolvedJob = resolveJobForDashboardLoose(candidate, linkedAssessment || {}, jobById, jobByTitle);

    // Evidence for keeping strict tech tags (avoid false positives from generic "backend"/"front").
    const techTagEvidenceText = [
      candidate?.notes || "",
      candidate?.recruiter_context_notes || "",
      candidate?.other_pointers || "",
      combinedScreeningText,
      linkedAssessment?.recruiterNotes || "",
      linkedAssessment?.otherPointers || "",
      linkedAssessment?.callbackNotes || "",
      JSON.stringify(cachedCvResult || {})
    ].filter(Boolean).join("\n");
    const rawSource = String(candidate?.source || "").trim().toLowerCase();
    const isApplicantSource = rawSource === "website" || rawSource === "website_apply" || rawSource === "hosted_apply";
    const rawPosition = String(candidate?.assigned_jd_title || candidate?.assignedJdTitle || candidate?.jd_title || candidate?.jdTitle || "").trim();
    const isUnmappedApplicant = isApplicantSource && !resolvedJob && Boolean(rawPosition);
    universe.push({
      id: String(candidate?.id || linkedAssessment?.id || "").trim(),
      candidateName: String(candidate?.name || linkedAssessment?.candidateName || "").trim(),
      role: String(
        candidate?.role
          || linkedAssessment?.currentDesignation
          || linkedAssessment?.current_designation
          || cachedCvResult?.currentDesignation
          || ""
      ).trim(),
      position: isUnmappedApplicant ? rawPosition : (resolvedJob?.title || getPositionLabel(candidate, linkedAssessment || {}, knownJdTitles)),
      company: String(
        candidate?.company
          || linkedAssessment?.currentCompany
          || linkedAssessment?.current_company
          || cachedCvResult?.currentCompany
          || ""
      ).trim(),
      totalExperience: String(
        candidate?.experience
          || linkedAssessment?.totalExperience
          || linkedAssessment?.total_experience
          || cachedCvResult?.exactTotalExperience
          || ""
      ).trim(),
      location: String(candidate?.location || linkedAssessment?.location || linkedAssessment?.candidate_location || "").trim(),
      currentCtc: String(candidate?.current_ctc || linkedAssessment?.currentCtc || linkedAssessment?.current_ctc || "").trim(),
      expectedCtc: String(candidate?.expected_ctc || linkedAssessment?.expectedCtc || linkedAssessment?.expected_ctc || "").trim(),
      noticePeriod: String(candidate?.notice_period || linkedAssessment?.noticePeriod || linkedAssessment?.notice_period || "").trim(),
      currentOrgTenure: String(linkedAssessment?.currentOrgTenure || linkedAssessment?.current_org_tenure || cachedCvResult?.currentOrgTenure || "").trim(),
      highestEducation: String(candidate?.highest_education || linkedAssessment?.highestEducation || linkedAssessment?.highest_education || cachedCvResult?.highestEducation || "").trim(),
      skills: filterTechSearchTags(Array.isArray(candidate?.skills) ? candidate.skills : [], techTagEvidenceText),
      inferredTags: filterTechSearchTags(Array.isArray(candidateMeta?.inferredSearchTags) ? candidateMeta.inferredSearchTags : [], techTagEvidenceText),
      clientName: isUnmappedApplicant ? "Unmapped candidates" : (resolvedJob?.clientName || getClientLabel(candidate, linkedAssessment || {})),
      // For UI/presets: "Recruiter" should mean currently assigned/owned recruiter.
      recruiterName: getOwnerRecruiterLabel(candidate, linkedAssessment || {}),
      // Keep captured-by separately for internal debugging (may be overwritten in legacy rows).
      sourcedRecruiter: getRecruiterLabel(candidate, linkedAssessment || {}),
      ownerRecruiter: getOwnerRecruiterLabel(candidate, linkedAssessment || {}),
      candidateStatus: String(linkedAssessment?.candidateStatus || linkedAssessment?.candidate_status || linkedAssessment?.assessment_status || linkedAssessment?.status || "").trim(),
      pipelineStage: "",
      workflowStatus: String(linkedAssessment?.status || candidate?.status || "").trim(),
      attemptStatus: String(candidate?.last_contact_outcome || "").trim(),
      interviewAt: normalizeDateOutput(
        linkedAssessment?.interviewAt
          || linkedAssessment?.interview_at
          || deriveInterviewAtFromHistory(linkedAssessment)
          || ""
      ),
      followUpAt: normalizeDateOutput(linkedAssessment?.followUpAt || linkedAssessment?.follow_up_at || candidate?.next_follow_up_at || ""),
      offerDoj: normalizeDateOutput(linkedAssessment?.offerDoj || linkedAssessment?.offer_doj || ""),
      createdAt: normalizeDateOutput(getCandidateCreatedAt(candidate)),
      sharedAt: isConverted ? normalizeDateOutput(getCandidateConvertedAt(candidate, linkedAssessment || {})) : "",
      sourceType: isConverted
        ? "captured_and_converted"
        : (candidateSource === "website_apply" || candidateSource === "hosted_apply" || candidateSource === "google_sheet"
          ? "applied"
          : "captured_note"),
      hiddenCvText: JSON.stringify(cachedCvResult || {}),
      notesText: [
        candidate?.notes || "",
        candidate?.recruiter_context_notes || "",
        candidate?.other_pointers || "",
        combinedScreeningText,
        linkedAssessment?.recruiterNotes || "",
        linkedAssessment?.otherPointers || "",
        linkedAssessment?.callbackNotes || ""
      ].filter(Boolean).join("\n"),
      raw: {
        candidate,
        assessment: linkedAssessment,
        metadata: candidateMeta
      }
    });
  }

  for (const assessment of assessments || []) {
    const assessmentId = String(assessment?.id || "").trim();
    if (!assessmentId || seenAssessmentIds.has(assessmentId)) continue;
    const assessmentPayload = assessment?.payload && typeof assessment.payload === "object" ? assessment.payload : {};
    const resolvedJob = resolveJobForDashboardLoose({}, assessment || {}, jobById, jobByTitle);
    const assessmentScreeningAnswers = normalizeJsonObjectInput(
      assessment?.jdScreeningAnswers
        || assessment?.jd_screening_answers
        || assessmentPayload?.jdScreeningAnswers
        || assessmentPayload?.jd_screening_answers
        || assessment?.screening_answers
        || assessment?.screeningAnswers
        || {}
    );
    const assessmentScreeningText = screeningAnswersToSearchText(assessmentScreeningAnswers);
    universe.push({
      id: assessmentId,
      candidateName: String(assessment?.candidateName || "").trim(),
      role: String(assessment?.currentDesignation || assessment?.current_designation || "").trim(),
      position: resolvedJob?.title || getPositionLabel({}, assessment, knownJdTitles),
      company: String(assessment?.currentCompany || assessment?.current_company || "").trim(),
      totalExperience: String(assessment?.totalExperience || assessment?.total_experience || "").trim(),
      location: String(assessment?.location || "").trim(),
      currentCtc: String(assessment?.currentCtc || assessment?.current_ctc || "").trim(),
      expectedCtc: String(assessment?.expectedCtc || assessment?.expected_ctc || "").trim(),
      noticePeriod: String(assessment?.noticePeriod || assessment?.notice_period || "").trim(),
      currentOrgTenure: String(assessment?.currentOrgTenure || assessment?.current_org_tenure || "").trim(),
      highestEducation: String(assessment?.highestEducation || assessment?.highest_education || "").trim(),
      skills: [],
      inferredTags: [],
      clientName: resolvedJob?.clientName || getClientLabel({}, assessment),
      recruiterName: getRecruiterLabel({}, assessment),
      sourcedRecruiter: getRecruiterLabel({}, assessment),
      ownerRecruiter: getOwnerRecruiterLabel({}, assessment),
      candidateStatus: String(assessment?.candidateStatus || assessment?.candidate_status || assessment?.assessment_status || assessment?.status || "").trim(),
      pipelineStage: "",
      workflowStatus: String(assessment?.status || "").trim(),
      attemptStatus: "",
      interviewAt: normalizeDateOutput(
        assessment?.interviewAt
          || assessment?.interview_at
          || deriveInterviewAtFromHistory(assessment)
          || ""
      ),
      followUpAt: normalizeDateOutput(assessment?.followUpAt || assessment?.follow_up_at || ""),
      offerDoj: normalizeDateOutput(assessment?.offerDoj || assessment?.offer_doj || ""),
      createdAt: "",
      sharedAt: normalizeDateOutput(getCandidateConvertedAt({}, assessment)),
      sourceType: "assessment_only",
      hiddenCvText: "",
      notesText: [
        assessmentScreeningText,
        assessment?.recruiterNotes || "",
        assessment?.otherPointers || "",
        assessment?.callbackNotes || ""
      ].filter(Boolean).join("\n"),
      raw: {
        candidate: null,
        assessment,
        metadata: null
      }
    });
  }

  return universe;
}

function candidateMatchesNaturalFilter(item, filters, actor = null) {
  if (!item) return false;
  const normalizeLabel = (value) => normalizeDashboardText(String(value || "")).toLowerCase().trim();
  const normalizeAttemptOutcomeLabel = (value) => {
    const v = normalizeLabel(value);
    if (!v) return "";
    const map = {
      "jd shared": "jd shared",
      "shared jd": "jd shared",
      "call later": "call later",
      "call back later": "call later",
      "callback later": "call later",
      "switch off": "switch off",
      "switched off": "switch off",
      "not reachable": "not reachable",
      "unreachable": "not reachable",
      "not responding": "not responding",
      "no response": "not responding",
      "no answer": "not responding",
      "nr": "not responding",
      "screening reject": "screening reject",
      "interview reject": "interview reject",
      "duplicate": "duplicate",
      "disconnected": "disconnected",
      "busy": "busy",
      "interested": "interested",
      "not interested": "not interested",
      "revisit for other role": "revisit for other role",
      "revisit": "revisit for other role"
    };
    return map[v] || v;
  };
  if (filters.role) {
    const roleHay = buildCandidateSearchHay(item);
    const normalizedRolePhrase = normalizeDashboardText(String(filters.role || ""))
      .toLowerCase()
      .replace(/\b\.net\b/g, "dotnet")
      .replace(/\bdot net\b/g, "dotnet")
      .replace(/\bnode js\b/g, "nodejs")
      .trim();
    const techMustTokens = [];
    if (/\bdotnet|asp net|c#|c sharp\b/i.test(normalizedRolePhrase)) techMustTokens.push("dotnet");
    if (/\bnodejs|node js|node\b/i.test(normalizedRolePhrase)) techMustTokens.push("nodejs");
    if (/\breact|reactjs\b/i.test(normalizedRolePhrase)) techMustTokens.push("react");
    if (/\bangular\b/i.test(normalizedRolePhrase)) techMustTokens.push("angular");
    if (/\bjava\b/i.test(normalizedRolePhrase)) techMustTokens.push("java");
    if (/\bpython\b/i.test(normalizedRolePhrase)) techMustTokens.push("python");
    if (/\bgolang|go lang|go\b/i.test(normalizedRolePhrase)) techMustTokens.push("golang");
    if (techMustTokens.length && !techMustTokens.every((token) => candidateHayMatchesTerm(roleHay, token))) {
      return false;
    }
    if (!candidateHayMatchesTerm(roleHay, normalizedRolePhrase)) {
      const roleTokens = normalizedRolePhrase
        .split(/\s+/)
        .map((token) => String(token || "").trim())
        .filter((token) => token && token.length >= 3);
      const roleStop = new Set([
        "developer", "engineer", "manager", "executive", "analyst", "recruiter",
        "consultant", "specialist", "lead", "senior", "junior", "sales", "role", "profiles", "candidates"
      ]);
      const discriminative = roleTokens.filter((token) => !roleStop.has(token));
      const mustMatch = discriminative.length ? discriminative : roleTokens;
      if (mustMatch.length && !mustMatch.every((token) => candidateHayMatchesTerm(roleHay, token))) {
        return false;
      }
    }
  }
  if (Array.isArray(filters.roleFamilies) && filters.roleFamilies.length) {
    const candidateRoleFamilies = detectRoleFamilies(buildCandidateSearchHay(item));
    if (!candidateRoleFamilies.length || !filters.roleFamilies.some((family) => candidateRoleFamilies.includes(family))) {
      return false;
    }
  }
  if (filters.location) {
    if (!String(item.location || "").toLowerCase().includes(filters.location.toLowerCase())) return false;
  }
  if (Array.isArray(filters.locations) && filters.locations.length) {
    const itemLocation = String(item.location || "").toLowerCase();
    if (!filters.locations.some((location) => itemLocation.includes(String(location || "").toLowerCase()))) return false;
  }
  if (filters.client) {
    const needle = String(filters.client || "").toLowerCase().trim();
    const clientHay = String(item.clientName || "").toLowerCase();
    if (needle && !clientHay.includes(needle)) {
      // Backward-compatible fallback:
      // Some captured notes may not have a resolved clientName yet (JD missing / unmapped),
      // but the JD/position text still contains the client label (e.g. "AE - Attentive").
      // Allow matching against position / raw JD title so "in Attentive from captured notes"
      // doesn't return 0 just because clientName is "Unassigned".
      const rawCandidate = item?.raw?.candidate && typeof item.raw.candidate === "object" ? item.raw.candidate : {};
      const jdText = String(
        item.position
          || rawCandidate?.assigned_jd_title
          || rawCandidate?.assignedJdTitle
          || rawCandidate?.jd_title
          || rawCandidate?.jdTitle
          || ""
      ).toLowerCase();
      if (!jdText.includes(needle)) return false;
    }
  }
  if (filters.targetLabel) {
    const targetHay = `${item.clientName || ""} ${item.position || ""}`.toLowerCase();
    if (!targetHay.includes(String(filters.targetLabel || "").toLowerCase())) return false;
  }
  if (filters.minExperienceYears != null) {
    const years = parseExperienceToYears(item.totalExperience);
    if (years == null || years < filters.minExperienceYears) return false;
  }
  if (filters.maxExperienceYears != null) {
    const years = parseExperienceToYears(item.totalExperience);
    if (years == null || years > filters.maxExperienceYears) return false;
  }
  if (filters.minCurrentCtcLpa != null) {
    const currentCtc = parseAmountToLpa(item.currentCtc);
    if (currentCtc == null || currentCtc < filters.minCurrentCtcLpa) return false;
  }
  if (filters.maxCurrentCtcLpa != null) {
    const currentCtc = parseAmountToLpa(item.currentCtc);
    if (currentCtc == null || currentCtc > filters.maxCurrentCtcLpa) return false;
  }
  if (filters.minExpectedCtcLpa != null) {
    const expectedCtc = parseAmountToLpa(item.expectedCtc);
    if (expectedCtc == null || expectedCtc < filters.minExpectedCtcLpa) return false;
  }
  if (filters.maxExpectedCtcLpa != null) {
    const expectedCtc = parseAmountToLpa(item.expectedCtc);
    if (expectedCtc == null || expectedCtc > filters.maxExpectedCtcLpa) return false;
  }
  if (filters.maxNoticeDays != null) {
    const noticeDays = parseNoticePeriodToDays(item.noticePeriod);
    if (noticeDays == null || noticeDays > filters.maxNoticeDays) return false;
  }
  if (filters.currentCompany) {
    const companyHay = `${item.company || ""} ${item.hiddenCvText || ""}`.toLowerCase();
    if (!companyHay.includes(filters.currentCompany.toLowerCase())) return false;
  }
  if (Array.isArray(filters.skills) && filters.skills.length) {
    const hay = buildCandidateSearchHay(item);
    const requiredSkills = normalizeCandidateSearchKeywords(filters.skills);
    const matchMode = String(filters.skillsMatch || "").trim().toLowerCase();
    const mustHaveSkills = Boolean(filters.mustHaveSkills);
    if (requiredSkills.length) {
      const matched = requiredSkills.filter((skill) => candidateHayMatchesTerm(hay, skill));
      if (mustHaveSkills) {
        if (!matched.length) return false;
      } else if (matchMode === "any") {
        if (!matched.length) return false;
      } else {
        if (matched.length !== requiredSkills.length) return false;
      }
    }
  }
  // First-class OR-groups (additive): mustSkills AND anyOfSkillGroups.
  if (Array.isArray(filters.mustSkills) && filters.mustSkills.length) {
    const hay = buildCandidateSearchHay(item);
    const must = normalizeCandidateSearchKeywords(filters.mustSkills);
    if (must.length && !must.every((skill) => candidateHayMatchesTerm(hay, skill))) return false;
  }
  if (Array.isArray(filters.anyOfSkillGroups) && filters.anyOfSkillGroups.length) {
    const hay = buildCandidateSearchHay(item);
    for (const group of filters.anyOfSkillGroups) {
      const terms = normalizeCandidateSearchKeywords(Array.isArray(group) ? group : []);
      if (terms.length && !terms.some((skill) => candidateHayMatchesTerm(hay, skill))) return false;
    }
  }
  // Explicit status filters (assessment status + captured-attempt outcome) for AI search.
  // Use substring semantics so things like "L1 aligned tomorrow 5 PM" still match "L1 aligned".
  if (filters.assessmentStatus) {
    const needle = normalizeLabel(filters.assessmentStatus);
    const hay = normalizeLabel(item.candidateStatus || item.workflowStatus || item.pipelineStage || "");
    if (needle && !hay.includes(needle)) return false;
  }
  if (filters.attemptOutcome) {
    const needle = normalizeAttemptOutcomeLabel(filters.attemptOutcome);
    const hay = normalizeAttemptOutcomeLabel(item.attemptStatus || "");
    if (needle && (!hay || !hay.includes(needle))) return false;
  }
  if (Array.isArray(filters.statuses) && filters.statuses.length) {
    const lifecycleBucket = getAssessmentLifecycleBucket(item);
    const lifecycleTerms = new Set([
      "sourced",
      "applied",
      "shared",
      "under_interview_process",
      "under_process",
      "hold",
      "rejected",
      "duplicate",
      "dropped",
      "shortlisted",
      "offered",
      "joined"
    ]);
    const normalizedStatuses = filters.statuses
      .map((status) => normalizeDashboardText(status).toLowerCase().trim())
      .filter(Boolean);
    const strictLifecycleStatuses = normalizedStatuses.filter((status) => lifecycleTerms.has(status));
    const nonLifecycleStatuses = normalizedStatuses.filter((status) => !lifecycleTerms.has(status));

    if (strictLifecycleStatuses.length && !strictLifecycleStatuses.includes(lifecycleBucket)) return false;

    if (nonLifecycleStatuses.length) {
      const detailedHay = normalizeDashboardText(
        [
          item.candidateStatus || "",
          item.pipelineStage || "",
          item.workflowStatus || "",
          item.attemptStatus || ""
        ].join(" ")
      );
      const detailedOk = nonLifecycleStatuses.every((statusTerm) => {
        if (statusTerm === "not received") return /\bnot received|no response|not responding|no answer|nr\b/.test(detailedHay);
        if (statusTerm === "not responding") return /\bnot responding|did not attend|did not join|no response|no answer|nr\b/.test(detailedHay);
        if (statusTerm === "busy") return /\bbusy\b/.test(detailedHay);
        if (statusTerm === "call later") return /\bcall back later|call later\b/.test(detailedHay);
        if (statusTerm === "switch off") return /\bswitch off|switched off\b/.test(detailedHay);
        return detailedHay.includes(statusTerm);
      });
      if (!detailedOk) return false;
    }
  }
  if (Array.isArray(filters.detailedStatuses) && filters.detailedStatuses.length) {
    const detailedHay = normalizeDashboardText(
      [
        item.candidateStatus || "",
        item.pipelineStage || "",
        item.workflowStatus || "",
        item.attemptStatus || ""
      ].join(" ")
    );
    const detailedMatches = filters.detailedStatuses.every((statusTerm) => {
      const term = normalizeDashboardText(statusTerm);
      if (term === "aligned") return /\balign|interview scheduled|interview\b/.test(detailedHay) || Boolean(item.interviewAt);
      if (term === "not received") return /\bnot received|no response|not responding|no answer|nr\b/.test(detailedHay);
      if (term === "not responding") return /\bnot responding|did not attend|did not join|no response|no answer|nr\b/.test(detailedHay);
      if (term === "call later") return /\bcall back later|call later\b/.test(detailedHay);
      if (term === "switch off") return /\bswitch off|switched off\b/.test(detailedHay);
      if (term === "under process") return getAssessmentLifecycleBucket(item) === "under_process";
      return detailedHay.includes(term);
    });
    if (!detailedMatches) return false;
  }
  if (filters.interviewScheduled) {
    const statusHay = `${item.candidateStatus || ""} ${item.pipelineStage || ""} ${item.workflowStatus || ""}`.toLowerCase();
    if (!item.interviewAt && !/\balign|interview\b/.test(statusHay)) return false;
  }
  if (filters.upcomingJoinings) {
    const lifecycleBucket = getAssessmentLifecycleBucket(item);
    if (!["offered", "joined"].includes(lifecycleBucket)) return false;
    if (!item.offerDoj) return false;
  }
  if (filters.recruiterScope === "me" && actor) {
    const actorName = String(actor.name || "").trim().toLowerCase();
    const recruiterValue =
      filters.recruiterField === "sourced"
        ? String(item.sourcedRecruiter || "").trim().toLowerCase()
        : String(item.ownerRecruiter || item.recruiterName || "").trim().toLowerCase();
    if (!actorName || recruiterValue !== actorName) return false;
  }
  if (filters.recruiterName) {
    const recruiterNeedle = String(filters.recruiterName || "").trim().toLowerCase();
    const recruiterValue =
      filters.recruiterField === "sourced"
        ? String(item.sourcedRecruiter || "").trim().toLowerCase()
        : String(item.ownerRecruiter || item.recruiterName || "").trim().toLowerCase();
    if (!recruiterValue.includes(recruiterNeedle)) return false;
  }
  if (filters.sourceTypeFilter === "converted") {
    if (item.sourceType === "captured_note" || !item.sharedAt) return false;
  }
  if (filters.sourceTypeFilter === "captured") {
    if (item.sourceType !== "captured_note") return false;
  }
  if (filters.sourceTypeFilter === "applied") {
    if (item.sourceType !== "applied") return false;
  }
  if (filters.sourceTypeFilter === "assessment") {
    if (item.sourceType !== "assessment_only" && item.sourceType !== "captured_and_converted") return false;
  }
  if (filters.dateFrom || filters.dateTo) {
    const valuesToCheck =
      filters.dateField === "shared"
        ? [item.sharedAt]
        : filters.dateField === "joined"
          ? [item.offerDoj]
        : filters.dateField === "interview"
          ? [item.interviewAt]
        : filters.dateField === "captured"
          ? [item.createdAt]
          : [item.sharedAt, item.createdAt];
    if (!valuesToCheck.some((value) => isDateWithinRange(value, filters.dateFrom, filters.dateTo))) return false;
  }
  return true;
}

function itemMatchesDashboardMetric(item, metric, dateFrom = "", dateTo = "") {
  const bucket = getAssessmentLifecycleBucket(item);
  const hasLinkedAssessment = Boolean(item?.raw?.assessment || item?.assessment || item?.assessmentId);
  const isSharedAssessment = item?.sourceType === "captured_and_converted" && hasLinkedAssessment;
  const rawSource = String(item?.raw?.candidate?.source || item?.source || "").trim().toLowerCase();
  const isApplicantSource = rawSource === "website" || rawSource === "website_apply" || rawSource === "hosted_apply" || rawSource === "google_sheet";
  if (metric === "all") {
    if (!dateFrom && !dateTo) return true;
    return (
      isDateWithinRange(item.createdAt, dateFrom, dateTo) ||
      isDateWithinRange(item.sharedAt, dateFrom, dateTo)
    );
  }
  if (metric === "sourced") {
    return !isApplicantSource && isDateWithinRange(item.createdAt, dateFrom, dateTo);
  }
  if (metric === "applied") {
    return isApplicantSource && isDateWithinRange(item.createdAt, dateFrom, dateTo);
  }
  if (metric === "converted") {
    return isSharedAssessment && isDateWithinRange(item.sharedAt, dateFrom, dateTo);
  }
  if (!isSharedAssessment) return false;
  if (!isDateWithinRange(item.sharedAt, dateFrom, dateTo)) return false;
  if (metric === "under_interview_process") return isInterviewAlignedStatus(item?.candidateStatus || item?.status || "");
  if (metric === "rejected") return bucket === "rejected";
  if (metric === "duplicate") return bucket === "duplicate";
  if (metric === "dropped") return bucket === "dropped";
  if (metric === "shortlisted") return bucket === "shortlisted";
  if (metric === "offered") return bucket === "offered";
  if (metric === "joined") return bucket === "joined";
  return false;
}

function itemMatchesDashboardGroup(item, groupType, params = {}) {
  const clientLabel = String(params.clientLabel || "").trim();
  const recruiterLabel = String(params.recruiterLabel || "").trim();
  const positionLabel = String(params.positionLabel || "").trim();
  if (!groupType || groupType === "all") return true;
  if (groupType === "ownerRecruiter" || groupType === "recruiter") return String(item.ownerRecruiter || "").trim() === recruiterLabel;
  if (groupType === "client") return String(item.clientName || "").trim() === clientLabel;
  if (groupType === "clientPosition" || groupType === "position") {
    return String(item.clientName || "").trim() === clientLabel && String(item.position || "").trim() === positionLabel;
  }
  if (groupType === "clientPositionOwner" || groupType === "recruiter_position") {
    return (
      String(item.clientName || "").trim() === clientLabel &&
      String(item.position || "").trim() === positionLabel &&
      String(item.ownerRecruiter || "").trim() === recruiterLabel
    );
  }
  return false;
}

function itemMatchesClientPortalMetric(item, metric, dateFrom = "", dateTo = "") {
  const sharedAt = String(item?.sharedAt || "").trim();
  if (!sharedAt || item?.sourceType === "captured_note" || !isDateWithinRange(sharedAt, dateFrom, dateTo)) return false;
  if (metric === "total_shared") return true;
  return getClientPortalLifecycleBucket(item) === metric;
}

function itemMatchesAllowedPositions(item, allowedPositions = []) {
  const allowed = Array.isArray(allowedPositions) ? allowedPositions.map((value) => String(value || "").trim()).filter(Boolean) : [];
  if (!allowed.length) return true;
  const position = String(item?.position || item?.jdTitle || item?.role || "").trim();
  return allowed.includes(position);
}

function filterUniverseForClientUser(universe = [], clientUser = {}) {
  const clientName = String(clientUser?.clientName || "").trim();
  const allowedPositions = Array.isArray(clientUser?.allowedPositions) ? clientUser.allowedPositions : [];
  return (Array.isArray(universe) ? universe : []).filter((item) =>
    String(item?.clientName || "").trim() === clientName && itemMatchesAllowedPositions(item, allowedPositions)
  );
}

function parseSkillListFromText(text) {
  return String(text || "")
    .split(/\n|,|\/|;|\|| and /i)
    .map((item) => String(item || "").trim())
    .filter((item) => item && item.length >= 2)
    .slice(0, 20);
}

const JD_ROLE_STOPWORDS = new Set([
  "developer",
  "engineer",
  "executive",
  "manager",
  "lead",
  "leader",
  "head",
  "senior",
  "junior",
  "associate",
  "specialist",
  "analyst",
  "consultant",
  "officer",
  "intern",
  "principal"
]);

const ROLE_FAMILY_KEYWORDS = {
  tech: ["developer", "engineer", "backend", "frontend", "fullstack", "nodejs", "node", "react", "angular", "java", "python", "devops", "sre", "cloud", "software", "qa", "testing", "automation"],
  sales: ["sales", "business development", "bd", "account executive", "account manager", "inside sales", "field sales", "relationship manager"],
  recruitment: ["recruiter", "talent", "sourcing", "headhunter", "hr recruiter"],
  marketing: ["marketing", "growth", "seo", "performance marketing", "brand"],
  product: ["product manager", "product owner", "product"],
  finance: ["finance", "accounting", "accounts", "fp&a", "audit"],
  operations: ["operations", "ops", "supply chain", "logistics"],
  hr: ["human resources", "hrbp", "hr", "people ops"]
};

function normalizeJdSearchToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/node\.?js/g, "nodejs")
    .replace(/\bnode js\b/g, "nodejs")
    .replace(/\bnode\b/g, "nodejs")
    .replace(/java\s*script/g, "javascript")
    .replace(/\baccount\s+executive\b/g, "account executive")
    .replace(/\bbusiness\s+development\b/g, "business development")
    .replace(/[\W_]+/g, " ")
    .trim();
}

function buildNormalizedTokenSet(text) {
  return new Set(
    normalizeJdSearchToken(text)
      .split(/\s+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 2)
  );
}

function extractMandatoryRoleTokens(text) {
  const normalized = normalizeJdSearchToken(text);
  return Array.from(buildNormalizedTokenSet(normalized)).filter((token) => token.length >= 3 && !JD_ROLE_STOPWORDS.has(token));
}

function detectRoleFamilies(text) {
  const hay = normalizeJdSearchToken(text);
  return Object.entries(ROLE_FAMILY_KEYWORDS)
    .filter(([, keywords]) => keywords.some((keyword) => hay.includes(normalizeJdSearchToken(keyword))))
    .map(([family]) => family);
}

function parseJdCompensationRange(text) {
  const lower = normalizeDashboardText(text);
  if (!lower) return { minLpa: null, maxLpa: null };
  const betweenMatch = lower.match(/\b(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)\b/i);
  if (betweenMatch) {
    return {
      minLpa: parseAmountToLpa(`${betweenMatch[1]} ${betweenMatch[3]}`),
      maxLpa: parseAmountToLpa(`${betweenMatch[2]} ${betweenMatch[3]}`)
    };
  }
  const underMatch = lower.match(/\b(?:upto|up to|under|max(?:imum)?(?: ctc)?(?: budget)?(?: is)?|budget(?: is)?)\s*(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)\b/i);
  if (underMatch) {
    return {
      minLpa: null,
      maxLpa: parseAmountToLpa(`${underMatch[1]} ${underMatch[2]}`)
    };
  }
  const aboveMatch = lower.match(/\b(?:above|minimum|at least|min(?:imum)?(?: ctc)?(?: budget)?(?: is)?)\s*(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)\b/i);
  if (aboveMatch) {
    return {
      minLpa: parseAmountToLpa(`${aboveMatch[1]} ${aboveMatch[2]}`),
      maxLpa: null
    };
  }
  return { minLpa: null, maxLpa: null };
}

function matchesCompensationRange(item, jd) {
  if (jd.minCtcLpa == null && jd.maxCtcLpa == null) return true;
  const values = [parseAmountToLpa(item.currentCtc), parseAmountToLpa(item.expectedCtc)].filter((value) => value != null);
  if (!values.length) return false;
  return values.some((value) => (jd.minCtcLpa == null || value >= jd.minCtcLpa) && (jd.maxCtcLpa == null || value <= jd.maxCtcLpa));
}

function getBestCompensationMatch(item, jd) {
  const values = [parseAmountToLpa(item.currentCtc), parseAmountToLpa(item.expectedCtc)].filter((value) => value != null);
  if (!values.length) return null;
  const target = jd.maxCtcLpa ?? jd.minCtcLpa;
  if (target == null) return values[0];
  return values.reduce((best, value) => (Math.abs(value - target) < Math.abs(best - target) ? value : best), values[0]);
}

function parseJdMatchPayload(raw = {}) {
  const input = raw && typeof raw === "object" ? raw : {};
  const explicitTitle = String(input.jdTitle || input.title || "").trim();
  const mustHaveSkills = String(input.mustHaveSkills || "").trim();
  const jobDescription = String(input.jobDescription || input.jdText || input.text || "").trim();
  const inferredTitle = !explicitTitle && jobDescription && jobDescription.length <= 80 && !/[\n,:;]/.test(jobDescription)
    ? jobDescription
    : "";
  const jdTitle = explicitTitle || inferredTitle;
  const combined = [jdTitle, mustHaveSkills, jobDescription].filter(Boolean).join("\n");
  const expMatch = combined.match(/(\d+(?:\.\d+)?)\s*\+?\s*years?/i);
  const locationMatch = combined.match(/\b(?:location|based in|based out of|work location)\s*[:\-]?\s*([A-Za-z][A-Za-z\s,/-]{1,60})/i);
  const mustHaveSkillList = parseSkillListFromText(mustHaveSkills);
  const skills = Array.from(new Set([...(mustHaveSkillList || []), ...parseSkillListFromText(jobDescription)]));
  const noticeMatch = combined.match(/\b(?:notice(?: period)?(?: up to| under| max)?|join(?:ing)? in)\s+(\d+(?:\.\d+)?)\s*(days?|months?)\b/i);
  const ctcRange = parseJdCompensationRange(combined);
  return {
    jdTitle,
    mustHaveSkills,
    jobDescription,
    minExperienceYears: expMatch ? Number(expMatch[1]) : null,
    location: locationMatch ? String(locationMatch[1] || "").trim() : "",
    skills,
    mustHaveSkillList,
    mandatoryRoleTokens: extractMandatoryRoleTokens(jdTitle),
    roleFamilies: detectRoleFamilies(jdTitle),
    minCtcLpa: ctcRange.minLpa,
    maxCtcLpa: ctcRange.maxLpa,
    maxNoticeDays: noticeMatch ? parseNoticePeriodToDays(`${noticeMatch[1]} ${noticeMatch[2]}`) : null
  };
}

function scoreCandidateAgainstJd(item, jd) {
  let score = 0;
  const reasons = [];
  let hasCoreMatch = false;
  let hasRoleMatch = false;
  const roleHay = normalizeJdSearchToken(`${item.role || ""} ${item.position || ""} ${item.hiddenCvText || ""}`);
  const companyHay = `${item.company || ""}`.toLowerCase();
  const skillHay = normalizeJdSearchToken(`${item.role || ""} ${item.position || ""} ${companyHay} ${(item.skills || []).join(" ")} ${item.hiddenCvText || ""} ${item.notesText || ""}`);
  const candidateFamilies = detectRoleFamilies(`${item.role || ""} ${item.position || ""}`);
  let roleAlignmentScore = 0;
  let skillsMatchScore = 0;
  let locationScore = 0;
  let noticeScore = 0;
  let budgetScore = 0;
  let budgetDistance = Number.MAX_SAFE_INTEGER;
  let matchedSkillLabels = [];
  if (jd.roleFamilies.length && candidateFamilies.length && !jd.roleFamilies.some((family) => candidateFamilies.includes(family))) {
    return { score: 0, reasons: [], hasCoreMatch: false, hasRoleMatch: false, noticeDays: parseNoticePeriodToDays(item.noticePeriod), roleAlignmentScore: 0, skillsMatchScore: 0, locationScore: 0, noticeScore: 0, budgetScore: 0, budgetDistance };
  }
  if (Array.isArray(jd.mandatoryRoleTokens) && jd.mandatoryRoleTokens.length) {
    const matchedMandatory = jd.mandatoryRoleTokens.filter((token) => roleHay.includes(token) || skillHay.includes(token));
    if (!matchedMandatory.length) {
      return { score: 0, reasons: [], hasCoreMatch: false, hasRoleMatch: false, noticeDays: parseNoticePeriodToDays(item.noticePeriod), roleAlignmentScore: 0, skillsMatchScore: 0, locationScore: 0, noticeScore: 0, budgetScore: 0, budgetDistance };
    }
  }
  if (jd.jdTitle) {
    const normalizedTitle = normalizeJdSearchToken(jd.jdTitle);
    const titleWords = Array.from(buildNormalizedTokenSet(normalizedTitle)).filter((part) => part.length >= 3);
    const titleMatches = titleWords.filter((part) => roleHay.includes(part));
    if (normalizedTitle && roleHay.includes(normalizedTitle)) {
      roleAlignmentScore = 25;
      reasons.push(`Role fit: strong alignment with ${jd.jdTitle}`);
      hasCoreMatch = true;
      hasRoleMatch = true;
    } else if (titleMatches.length >= Math.max(1, Math.ceil(titleWords.length / 2))) {
      roleAlignmentScore = 18;
      reasons.push(`Role fit: aligns with ${jd.jdTitle}`);
      hasCoreMatch = true;
      hasRoleMatch = true;
    } else if (titleMatches.length) {
      roleAlignmentScore = 10;
      reasons.push(`Role fit: partial overlap with ${jd.jdTitle}`);
      hasCoreMatch = true;
      hasRoleMatch = true;
    }
  }
  const mustHaveMatches = Array.isArray(jd.mustHaveSkillList) && jd.mustHaveSkillList.length
    ? jd.mustHaveSkillList.filter((skill) => skillHay.includes(normalizeJdSearchToken(skill)))
    : [];
  const matchedSkills = Array.isArray(jd.skills) && jd.skills.length
    ? jd.skills.filter((skill) => skillHay.includes(normalizeJdSearchToken(skill)))
    : [];
  matchedSkillLabels = Array.from(new Set([...(mustHaveMatches || []), ...(matchedSkills || [])]));
  if (Array.isArray(jd.skills) && jd.skills.length) {
    const denominator = Math.max(jd.mustHaveSkillList?.length || 0, jd.skills.length, 1);
    const ratio = matchedSkillLabels.length / denominator;
    skillsMatchScore = Math.min(40, Math.max(mustHaveMatches.length ? 20 : 0, Math.round(ratio * 40)));
    if (matchedSkillLabels.length) {
      reasons.push(`Skills matched: ${matchedSkillLabels.slice(0, 6).join(", ")}`);
      hasCoreMatch = true;
    }
  } else if (mustHaveMatches.length) {
    skillsMatchScore = Math.min(40, Math.max(20, mustHaveMatches.length * 10));
    reasons.push(`Skills matched: ${mustHaveMatches.slice(0, 6).join(", ")}`);
    hasCoreMatch = true;
  }
  if (jd.location && String(item.location || "").toLowerCase().includes(jd.location.toLowerCase())) {
    locationScore = 10;
    reasons.push(`Location fit: ${item.location || "-"} matches ${jd.location}`);
    hasCoreMatch = true;
  }
  if (!matchesCompensationRange(item, jd)) {
    return { score: 0, reasons: [], hasCoreMatch: false, hasRoleMatch, noticeDays: parseNoticePeriodToDays(item.noticePeriod), roleAlignmentScore, skillsMatchScore, locationScore, noticeScore: 0, budgetScore: 0, budgetDistance };
  }
  if (jd.minCtcLpa != null || jd.maxCtcLpa != null) {
    const bestCtc = getBestCompensationMatch(item, jd);
    if (bestCtc != null) {
      const target = jd.maxCtcLpa ?? jd.minCtcLpa ?? bestCtc;
      budgetDistance = Math.abs(bestCtc - target);
      if (budgetDistance <= 1) budgetScore = 10;
      else if (budgetDistance <= 2) budgetScore = 8;
      else if (budgetDistance <= 4) budgetScore = 6;
      else budgetScore = 4;
      const ctcLabel = `${jd.minCtcLpa != null ? `${jd.minCtcLpa} - ` : "up to "}${jd.maxCtcLpa != null ? `${jd.maxCtcLpa}` : ""} LPA`.replace(" -  LPA", " LPA");
      reasons.push(`CTC fit: near ${ctcLabel}`);
      hasCoreMatch = true;
    }
  }
  const noticeDays = parseNoticePeriodToDays(item.noticePeriod);
  if (jd.maxNoticeDays != null) {
    if (noticeDays == null || noticeDays > jd.maxNoticeDays) {
      return { score: 0, reasons: [], hasCoreMatch: false, hasRoleMatch, noticeDays, roleAlignmentScore, skillsMatchScore, locationScore, noticeScore: 0, budgetScore, budgetDistance };
    }
    if (noticeDays <= Math.min(15, jd.maxNoticeDays)) noticeScore = 15;
    else if (noticeDays <= Math.min(30, jd.maxNoticeDays)) noticeScore = 12;
    else if (noticeDays <= Math.min(60, jd.maxNoticeDays)) noticeScore = 8;
    else noticeScore = 4;
    reasons.push(`Notice fit: ${noticeDays} day${noticeDays === 1 ? "" : "s"}`);
    hasCoreMatch = true;
  } else if (noticeDays != null) {
    if (noticeDays <= 15) noticeScore = 15;
    else if (noticeDays <= 30) noticeScore = 12;
    else if (noticeDays <= 60) noticeScore = 8;
    else if (noticeDays <= 90) noticeScore = 4;
    if (noticeScore) reasons.push(`Notice fit: ${noticeDays} day${noticeDays === 1 ? "" : "s"}`);
  }
  score = skillsMatchScore + roleAlignmentScore + locationScore + noticeScore + budgetScore;
  return {
    score,
    reasons,
    hasCoreMatch,
    hasRoleMatch,
    noticeDays,
    roleAlignmentScore,
    skillsMatchScore,
    locationScore,
    noticeScore,
    budgetScore,
    budgetDistance,
    matchedSkills: matchedSkillLabels
  };
}

function matchCandidatesToJd(universe = [], jdPayload = {}) {
  const jd = parseJdMatchPayload(jdPayload);
  const items = (universe || [])
    .map((item) => {
      const scored = scoreCandidateAgainstJd(item, jd);
      return {
        ...item,
        matchScore: scored.score,
        matchReasons: scored.reasons,
        hasCoreMatch: scored.hasCoreMatch,
        hasRoleMatch: scored.hasRoleMatch,
        noticeDays: scored.noticeDays,
        roleAlignmentScore: scored.roleAlignmentScore,
        skillsMatchScore: scored.skillsMatchScore,
        locationScore: scored.locationScore,
        noticeScore: scored.noticeScore,
        budgetScore: scored.budgetScore,
        budgetDistance: scored.budgetDistance,
        matchedSkills: scored.matchedSkills || []
      };
    })
    .filter((item) => item.matchScore > 0 && item.hasCoreMatch && item.hasRoleMatch)
    .sort((a, b) =>
      b.matchScore - a.matchScore ||
      (a.noticeDays ?? Number.MAX_SAFE_INTEGER) - (b.noticeDays ?? Number.MAX_SAFE_INTEGER) ||
      (a.budgetDistance ?? Number.MAX_SAFE_INTEGER) - (b.budgetDistance ?? Number.MAX_SAFE_INTEGER) ||
      b.roleAlignmentScore - a.roleAlignmentScore ||
      a.candidateName.localeCompare(b.candidateName)
    )
    .slice(0, 200);
  return {
    jd,
    total: items.length,
    items
  };
}

function sanitizeCandidateSavePayload(rawCandidate, actor) {
  const input = rawCandidate && typeof rawCandidate === "object" ? rawCandidate : {};
  const screeningAnswers = normalizeJsonObjectInput(input.screening_answers || input.screeningAnswers);
  const draftPayload = normalizeJsonObjectInput(input.draft_payload || input.draftPayload);
  const normalizedGender = String(input.gender || input.candidate_gender || "").trim();
  if (normalizedGender) {
    draftPayload.gender = normalizedGender;
  }
  const candidate = {
    id: String(input.id || "").trim() || undefined,
    company_id: String(actor.companyId || "").trim() || undefined,
    source: String(input.source || input.sourceValue || "").trim() || undefined,
    name: String(input.name || "").trim() || undefined,
    company: String(input.company || "").trim() || undefined,
    role: String(input.role || "").trim() || undefined,
    experience: String(input.experience || "").trim() || undefined,
    skills: Array.isArray(input.skills) ? input.skills : undefined,
    phone: String(input.phone || "").trim() || undefined,
    email: String(input.email || "").trim() || undefined,
    location: String(input.location || "").trim() || undefined,
    highest_education: String(input.highest_education || input.highestEducation || "").trim() || undefined,
    current_ctc: String(input.current_ctc || "").trim() || undefined,
    expected_ctc: String(input.expected_ctc || "").trim() || undefined,
    notice_period: String(input.notice_period || "").trim() || undefined,
    lwd_or_doj: String(input.lwd_or_doj || input.lwdOrDoj || "").trim() || undefined,
    notes: String(input.notes || "").trim() || undefined,
    recruiter_context_notes: String(input.recruiter_context_notes || input.recruiterContextNotes || "").trim() || undefined,
    other_pointers: String(input.other_pointers || input.otherPointers || "").trim() || undefined,
    next_action: String(input.next_action || "").trim() || undefined,
    linkedin: String(input.linkedin || "").trim() || undefined,
    client_name: String(input.client_name || "").trim() || undefined,
    jd_title: String(input.jd_title || "").trim() || undefined,
    recruiter_id: actor.id,
    recruiter_name: actor.name,
    assigned_to_user_id: String(input.assigned_to_user_id || "").trim() || undefined,
    assigned_to_name: String(input.assigned_to_name || "").trim() || undefined,
    assigned_by_user_id: String(input.assigned_by_user_id || "").trim() || undefined,
    assigned_by_name: String(input.assigned_by_name || "").trim() || undefined,
    assigned_jd_id: String(input.assigned_jd_id || "").trim() || undefined,
    assigned_jd_title: String(input.assigned_jd_title || "").trim() || undefined,
    assigned_at: String(input.assigned_at || "").trim() || undefined,
    last_contact_outcome: String(input.last_contact_outcome || "").trim() || undefined,
    last_contact_notes: String(input.last_contact_notes || "").trim() || undefined,
    last_contact_at: String(input.last_contact_at || "").trim() || undefined,
    next_follow_up_at: String(input.next_follow_up_at || "").trim() || undefined,
    hidden_from_captured: input.hidden_from_captured === true,
    screening_answers: screeningAnswers,
    draft_payload: draftPayload,
    used_in_assessment: input.used_in_assessment === true,
    assessment_id: String(input.assessment_id || "").trim() || undefined,
    created_at: String(input.created_at || "").trim() || undefined,
    updated_at: new Date().toISOString(),
    raw_note: String(input.raw_note || "").trim() || undefined
  };

  [
    "id",
    "assessment_id",
    "assigned_to_user_id",
    "assigned_by_user_id",
    "assigned_jd_id"
  ].forEach((key) => {
    if (String(candidate[key] || "").trim() === "") {
      delete candidate[key];
    }
  });

  [
    "assigned_at",
    "last_contact_at",
    "next_follow_up_at",
    "created_at",
    "updated_at"
  ].forEach((key) => {
    if (String(candidate[key] || "").trim() === "") {
      delete candidate[key];
    }
  });

  if (Array.isArray(candidate.skills)) {
    candidate.skills = candidate.skills.map((item) => String(item || "").trim()).filter(Boolean);
    if (!candidate.skills.length) {
      delete candidate.skills;
    }
  } else if (candidate.skills == null || String(candidate.skills || "").trim() === "") {
    delete candidate.skills;
  }

  Object.keys(candidate).forEach((key) => {
    if (candidate[key] == null) {
      delete candidate[key];
    }
  });

  return candidate;
}

function scoreTimelineRows(timeline) {
  return (timeline || []).reduce((score, item) => {
    let rowScore = 0;
    if (item?.company) rowScore += 2;
    if (item?.title) rowScore += 2;
    if (item?.start) rowScore += 2;
    if (item?.end) rowScore += 2;
    if (item?.duration) rowScore += 1;
    return score + rowScore;
  }, 0);
}

function sortTimelineByRecency(timeline) {
  return [...(timeline || [])].sort((left, right) => {
    const leftIsCurrent = /^(present|current|till date|to date)$/i.test(String(left?.end || "").trim());
    const rightIsCurrent = /^(present|current|till date|to date)$/i.test(String(right?.end || "").trim());
    if (leftIsCurrent !== rightIsCurrent) {
      return leftIsCurrent ? -1 : 1;
    }

    const leftEnd = monthIndex(parseMonthYear(left?.end, true));
    const rightEnd = monthIndex(parseMonthYear(right?.end, true));
    if (leftEnd !== rightEnd) {
      return (rightEnd ?? -Infinity) - (leftEnd ?? -Infinity);
    }

    const leftStart = monthIndex(parseMonthYear(left?.start));
    const rightStart = monthIndex(parseMonthYear(right?.start));
    if (leftStart !== rightStart) {
      return (rightStart ?? -Infinity) - (leftStart ?? -Infinity);
    }

    return 0;
  });
}

function isValidEmail(value) {
  const email = String(value || "").trim();
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitizeEmailToken(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  let token = raw
    .replace(/^[<(\[{'"`]+/, "")
    .replace(/[>)\]}'"`.,;:]+$/, "")
    .trim();
  if (!token) return "";
  const angleMatch = token.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (angleMatch && angleMatch[1]) token = String(angleMatch[1] || "").trim();
  return token;
}

function parseEmailListOrThrow(raw, { label = "Email", required = false } = {}) {
  const input = String(raw || "").trim();
  if (!input) {
    if (required) throw new Error(`${label} is required.`);
    return [];
  }
  const list = input
    .split(/[,\n;]+/)
    .map((item) => sanitizeEmailToken(item))
    .filter(Boolean);
  if (required && !list.length) throw new Error(`${label} is required.`);
  const invalid = list.filter((email) => !isValidEmail(email));
  if (invalid.length) throw new Error(`Invalid ${label.toLowerCase()}: ${invalid.join(", ")}`);
  return Array.from(new Set(list.map((email) => email.toLowerCase())));
}

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d+]/g, "");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "";
  if (compact.startsWith("+")) return `+${digits}`;
  return digits;
}

function looksMaskedContactValue(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  // Treat only strong masking tokens as masked; do not reject normal names/emails containing x.
  if (/[*�•_]/.test(text)) return true;
  return /(?:^|[^a-zA-Z])[xX]{3,}(?:[^a-zA-Z]|$)/.test(text);
}

function extractBestEmailFromRawText(rawText = "") {
  const raw = String(rawText || "").trim();
  if (!raw) return "";
  const direct = extractEmailAddress(raw);
  if (direct) return String(direct).toLowerCase();
  const normalized = raw
    .replace(/\s*\(?\s*at\s*\)?\s*/gi, "@")
    .replace(/\s*\(?\s*dot\s*\)?\s*/gi, ".")
    .replace(/\s+/g, "");
  const fromNormalized = extractEmailAddress(normalized);
  return fromNormalized ? String(fromNormalized).toLowerCase() : "";
}

function extractBestPhoneFromRawText(rawText = "") {
  const raw = String(rawText || "");
  if (!raw) return "";
  const matches = raw.match(/(?:\+?\d[\d\s().-]{8,}\d)/g) || [];
  for (const match of matches) {
    const normalized = normalizePhone(match);
    if (normalized) return normalized;
  }
  return "";
}

function choosePreferredScalar(...args) {
  let validator = null;
  if (typeof args[args.length - 1] === "function") {
    validator = args.pop();
  }

  for (const candidate of args) {
    const value = String(candidate || "").trim();
    if (!value) continue;
    if (!validator || validator(value)) return value;
  }
  return "";
}

function isValidCurrentCompanyValue(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/@/.test(text)) return false;
  if (/\b(e-?mail|email|contact\s*(no|number)?|phone|mobile|mob|linkedin)\b/i.test(text)) return false;
  if (/\+?\d[\d\s().-]{8,}/.test(text)) return false;
  if (/^(exact\s+responsibilities?|responsibilities?)\s*:?\s*$/i.test(text)) return false;
  return true;
}

function isValidCurrentDesignationValue(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/@/.test(text)) return false;
  if (/\b(e-?mail|email|contact\s*(no|number)?|phone|mobile|mob|linkedin)\b/i.test(text)) return false;
  if (/\+?\d[\d\s().-]{8,}/.test(text)) return false;
  if (/^(exact\s+responsibilities?|responsibilities?)\s*:?\s*$/i.test(text)) return false;
  // Reject bullet-like action sentences that are not role titles.
  if (/[.!?]$/.test(text) && /\s/.test(text)) return false;
  if (/\b(reducing|handling|managed|managing|responsible\s+for|worked\s+on|onboarded|built|acted\s+as|provided)\b/i.test(text) && /\s/.test(text)) {
    return false;
  }
  // Reject overly long sentence-style values.
  if (text.split(/\s+/).length > 8) return false;
  return true;
}

function isGenericDesignationValue(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  return [
    /^role$/,
    /^position$/,
    /^designation$/,
    /^profile$/,
    /^job$/,
    /^employee$/,
    /^team member$/,
    /^member$/,
    /^staff$/,
    /^professional$/,
    /^consultant$/,
    /^executive$/
  ].some((pattern) => pattern.test(text));
}

function choosePreferredDesignation(...args) {
  const candidates = args
    .map((value) => String(value || "").trim())
    .filter((value) => value && isValidCurrentDesignationValue(value));
  if (!candidates.length) return "";
  const nonGeneric = candidates.find((value) => !isGenericDesignationValue(value));
  return nonGeneric || candidates[0];
}

function looksLikeCompanyText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/\b(pvt|private|ltd|limited|llp|inc|corp|corporation|technologies|solutions|labs|consulting|systems)\b/i.test(text)) return true;
  return text.split(/\s+/).length <= 5;
}

function splitRoleCompanyComposite(value) {
  const raw = String(value || "").trim();
  if (!raw || !raw.includes("|")) return null;
  const parts = raw.split("|").map((item) => String(item || "").trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { left: parts[0], right: parts[1] };
}

function extractHighestEducationFromRawText(rawText) {
  const text = String(rawText || "");
  if (!text.trim()) return "";
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-•*]+/, "").trim())
    .filter(Boolean);
  const educationLine = lines.find((line) =>
    /\b(m\.?\s*b\.?\s*a|b\.?\s*b\.?\s*a|b\.?\s*com|m\.?\s*sc|b\.?\s*tech|m\.?\s*tech|b\.?\s*e|m\.?\s*e|b\.?\s*a|m\.?\s*a|ph\.?\s*d|graduat(?:ion)?)\b/i.test(line)
  );
  if (!educationLine) return "";
  return educationLine.replace(/\s+/g, " ").trim();
}

function isValidHighestEducationText(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.split(/\s+/).length > 12) return false;
  if (/(scope\s+of\s+(the\s+)?project|roles?\s*&?\s*responsibilities?|to\s+work\s+with|career\s+objective|reviewed|managed|developed|prepared)/i.test(text)) return false;
  return /\b(b\.?\s*tech|b\.?\s*e\.?|m\.?\s*tech|m\.?\s*e\.?|bachelor|master|mba|mca|bca|b\.?\s*sc|m\.?\s*sc|b\.?\s*com|m\.?\s*com|graduat(?:ion)?|diploma|ph\.?\s*d|hsc|ssc|12th|10th)\b/i.test(text);
}

function scoreEducationLevel(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return 0;
  if (/\b(ph\.?\s*d|doctorate)\b/.test(text)) return 90;
  if (/\b(master|m\.?\s*tech|m\.?\s*e\.?|m\.?\s*sc|m\.?\s*com|m\.?\s*a|mba|mca|pgdm|post\s*graduat)\b/.test(text)) return 80;
  if (/\b(bachelor|b\.?\s*tech|b\.?\s*e\.?|b\.?\s*sc|b\.?\s*com|b\.?\s*a|graduat(?:ion)?|be\b|btech)\b/.test(text)) return 70;
  if (/\b(diploma|polytechnic|iti)\b/.test(text)) return 55;
  if (/\b(12th|hsc|intermediate)\b/.test(text)) return 35;
  if (/\b(10th|ssc|matric)\b/.test(text)) return 25;
  return 10;
}

function pickHighestEducationFromHistory(educationHistory = [], fallbackValue = "") {
  const rows = Array.isArray(educationHistory) ? educationHistory : [];
  const getRowYear = (row = {}) => {
    const candidates = [
      String(row?.end_date || "").trim(),
      String(row?.year || "").trim(),
      String(row?.start_date || "").trim(),
      String(row?.raw_line || "").trim()
    ].join(" ");
    const years = Array.from(candidates.matchAll(/\b(19\d{2}|20\d{2})\b/g)).map((m) => Number(m[1])).filter(Number.isFinite);
    return years.length ? Math.max(...years) : 0;
  };
  let best = String(fallbackValue || "").trim();
  let bestScore = scoreEducationLevel(best);
  let bestYear = 0;
  for (const row of rows) {
    const degree = String(row?.degree || "").trim();
    if (!degree || !isValidHighestEducationText(degree)) continue;
    const score = scoreEducationLevel(degree);
    const year = getRowYear(row);
    if (score > bestScore || (score === bestScore && year > bestYear)) {
      best = degree;
      bestScore = score;
      bestYear = year;
    }
  }
  return best;
}

function buildDeterministicEducationHistory(rawText = "", highestEducation = "", educationSectionText = "") {
  const sectionText = String(educationSectionText || "").trim();
  const text = sectionText || String(rawText || "");
  if (!text.trim()) {
    return highestEducation
      ? [{ degree: String(highestEducation || "").trim(), institution: "", start_date: "", end_date: "", grade: "", raw_line: String(highestEducation || "").trim(), confidence: 0.55 }]
      : [];
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => String(line || "").replace(/^[\s\-•*]+/, "").trim())
    .filter(Boolean);
  const looksLikeEducationNoise = (value = "") => {
    const v = String(value || "").trim().toLowerCase();
    if (!v) return true;
    if (/(scope\s+of\s+(the\s+)?project|roles?\s*&?\s*responsibilities?|business\s+growth|market\s+expansion|demolished|replaced|facilities|manufacturing)/i.test(v)) return true;
    if (/^(managed|handling|working|worked|executed|execution|created|building|supporting)\b/i.test(v)) return true;
    return false;
  };
  const degreeRegex = /\b(b\.?\s*tech|b\.?\s*e\.?|m\.?\s*tech|m\.?\s*e\.?|b\.?\s*sc|m\.?\s*sc|b\.?\s*com|m\.?\s*com|b\.?\s*a|m\.?\s*a|mba|pgdm|diploma|ph\.?\s*d)\b/i;
  const yearRegex = /\b(19\d{2}|20\d{2})\b/g;
  const history = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (looksLikeEducationNoise(line)) continue;
    if (!degreeRegex.test(line)) continue;
    const years = Array.from(line.matchAll(yearRegex)).map((m) => Number(m[1])).filter(Number.isFinite);
    const next = String(lines[i + 1] || "").trim();
    const institution = (!looksLikeEducationNoise(next) && /\b(university|college|institute|school|iit|nit)\b/i.test(next)) ? next : "";
    history.push({
      degree: line.replace(/\s+/g, " ").trim(),
      institution: institution.replace(/\s+/g, " ").trim(),
      start_date: years.length >= 2 ? `${years[0]}-01` : "",
      end_date: years.length >= 1 ? `${years[years.length - 1]}-12` : "",
      grade: "",
      raw_line: line,
      confidence: institution ? 0.82 : 0.68
    });
  }
  if (!history.length && highestEducation) {
    history.push({
      degree: String(highestEducation || "").trim(),
      institution: "",
      start_date: "",
      end_date: "",
      grade: "",
      raw_line: String(highestEducation || "").trim(),
      confidence: 0.6
    });
  }
  return history;
}

function applyEmailTldSafeguard(email, rawText) {
  const source = String(email || "").trim();
  if (!source) return "";
  if (!/\.co$/i.test(source)) return source;
  const upgraded = source.replace(/\.co$/i, ".com");
  const raw = String(rawText || "");
  if (raw && raw.toLowerCase().includes(upgraded.toLowerCase())) {
    return upgraded;
  }
  return source;
}

function parseMonthYear(text, allowPresent = false) {
  const value = String(text || "").trim();
  if (!value) return null;
  if (allowPresent && /^(present|current|till date|to date)$/i.test(value)) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }

  const normalizedValue = value
    .replace(/\s*-\s*/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();

  const monthNameMatch = normalizedValue.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,'/-]*((\d{4})|(\d{2}))/i);
  if (monthNameMatch) {
    const month = MONTH_INDEX[String(monthNameMatch[1] || "").toLowerCase()];
    const year = monthNameMatch[4] ? 2000 + Number(monthNameMatch[4]) : Number(monthNameMatch[3] || monthNameMatch[2]);
    if (Number.isInteger(month) && Number.isInteger(year)) {
      return { year, month };
    }
  }

  const monthNumericMatch = normalizedValue.match(/\b(\d{1,2})[/-](\d{4})\b/);
  if (monthNumericMatch) {
    const month = Number(monthNumericMatch[1]) - 1;
    const year = Number(monthNumericMatch[2]);
    if (month >= 0 && month <= 11 && Number.isInteger(year)) {
      return { year, month };
    }
  }

  const isoLikeMatch = normalizedValue.match(/\b(\d{4})[/-](\d{1,2})(?:[/-]\d{1,2})?\b/);
  if (isoLikeMatch) {
    const year = Number(isoLikeMatch[1]);
    const month = Number(isoLikeMatch[2]) - 1;
    if (month >= 0 && month <= 11 && Number.isInteger(year)) {
      return { year, month };
    }
  }

  const yearOnlyMatch = normalizedValue.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearOnlyMatch) {
    const year = Number(yearOnlyMatch[1]);
    return { year, month: allowPresent ? 11 : 0 };
  }

  return null;
}

function monthIndex(value) {
  if (!value || !Number.isInteger(value.year) || !Number.isInteger(value.month)) return null;
  return value.year * 12 + value.month;
}

function formatTotalExperience(totalMonths) {
  const months = Math.max(0, Number(totalMonths || 0));
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  if (years && remainingMonths) {
    return `${years} years ${remainingMonths} months`;
  }
  if (years) {
    return years === 1 ? "1 year" : `${years} years`;
  }
  return remainingMonths === 1 ? "1 month" : `${remainingMonths} months`;
}

function formatMonthYearLabel(value) {
  if (!value || !Number.isInteger(value.year) || !Number.isInteger(value.month)) return "";
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[value.month]} ${value.year}`;
}

function parseDurationMonths(text) {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return 0;

  const decimalYearsMatch = value.match(/(\d+(?:\.\d+)?)\s*(?:year|years|yr|yrs)\b/);
  if (decimalYearsMatch && value.includes(".")) {
    return Math.max(0, Math.round(Number(decimalYearsMatch[1]) * 12));
  }

  const yearsMatch = value.match(/(\d+)\s*(?:year|years|yr|yrs)\b/);
  const monthsMatch = value.match(/(\d+)\s*(?:month|months|mo|mos)\b/);
  const years = yearsMatch ? Number(yearsMatch[1]) : 0;
  const months = monthsMatch ? Number(monthsMatch[1]) : 0;
  const total = years * 12 + months;
  if (total) return total;

  const compactMatch = value.match(/(\d+)\s*y(?:\s+|$).*?(\d+)\s*m\b/);
  if (compactMatch) {
    return Number(compactMatch[1]) * 12 + Number(compactMatch[2]);
  }

  return 0;
}

function getRowMonths(item) {
  const start = monthIndex(parseMonthYear(item?.start));
  const end = monthIndex(parseMonthYear(item?.end, true));
  if (start !== null && end !== null && end >= start) {
    return end - start + 1;
  }
  return parseDurationMonths(item?.duration);
}

function calculateTotalExperienceMonths(timeline) {
  const ranges = [];
  let hasAmbiguousRange = false;
  for (const item of timeline || []) {
    const start = monthIndex(parseMonthYear(item?.start));
    const end = monthIndex(parseMonthYear(item?.end, true));
    if (start === null || end === null || end < start) {
      hasAmbiguousRange = true;
      continue;
    }
    ranges.push([start, end]);
  }

  if (!ranges.length) {
    return { months: 0, hasAmbiguousRange };
  }

  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i += 1) {
    const current = ranges[i];
    const last = merged[merged.length - 1];
    if (current[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], current[1]);
      continue;
    }
    merged.push(current);
  }

  const mergedMonths = merged.reduce((sum, [start, end]) => sum + (end - start + 1), 0);
  return { months: mergedMonths, hasAmbiguousRange };
}

function calculateTotalExperienceFromTimeline(timeline) {
  const totalMonths = calculateTotalExperienceMonths(timeline)?.months || 0;
  if (!totalMonths) return "";
  return formatTotalExperience(totalMonths);
}

function calculateAverageTenurePerCompany(timeline) {
  const rows = (timeline || []).filter((item) => item?.company);
  if (!rows.length) return "";
  const totalMonths = rows.reduce((sum, item) => sum + getRowMonths(item), 0);
  if (!totalMonths) return "";
  return formatTotalExperience(Math.round(totalMonths / rows.length));
}

function calculateCurrentOrgTenure(timeline, currentCompany = "") {
  const orderedTimeline = mergeConsecutiveSameCompanyRows(sortTimelineByRecency(timeline));
  const currentRow =
    orderedTimeline.find((item) => /^(present|current|till date|to date)$/i.test(String(item?.end || "").trim())) ||
    (currentCompany
      ? orderedTimeline.find((item) => getTimelineRowCompany(item).toLowerCase() === String(currentCompany).trim().toLowerCase())
      : null);
  const latestRow = currentRow || (orderedTimeline.length ? orderedTimeline[0] : null);
  if (!latestRow) return "";
  const months = getRowMonths(latestRow);
  if (!months) return "";
  // Keep tenure as pure duration only; do not append "left in ..." style text.
  return formatTotalExperience(months);
}

function getCurrentCompanyContiguousSpan(timeline) {
  const ordered = sortTimelineByRecency(timeline);
  if (!ordered.length) return { months: 0, start: "", row: null };
  const currentIndex = ordered.findIndex((item) => /^(present|current|till date|to date)$/i.test(String(item?.end || "").trim()));
  const seedIndex = currentIndex >= 0 ? currentIndex : 0;
  const seed = ordered[seedIndex] || null;
  if (!seed) return { months: 0, start: "", row: null };
  const seedCompany = normalizeTimelineIdentity(getTimelineRowCompany(seed));
  if (!seedCompany) return { months: 0, start: String(seed?.start || "").trim(), row: seed };

  let totalMonths = 0;
  let earliestStart = String(seed?.start || "").trim();
  for (let idx = seedIndex; idx < ordered.length; idx += 1) {
    const row = ordered[idx];
    const rowCompany = normalizeTimelineIdentity(getTimelineRowCompany(row));
    if (!rowCompany || rowCompany !== seedCompany) break;
    totalMonths += getRowMonths(row);
    const rowStart = parseMonthYear(row?.start);
    const bestStart = parseMonthYear(earliestStart);
    const rowStartIdx = monthIndex(rowStart);
    const bestStartIdx = monthIndex(bestStart);
    if (rowStartIdx != null && (bestStartIdx == null || rowStartIdx < bestStartIdx)) {
      earliestStart = String(row?.start || earliestStart || "").trim();
    }
  }
  return { months: totalMonths, start: earliestStart, row: seed };
}

function getCurrentRoleFromTimeline(timeline) {
  const orderedTimeline = sortTimelineByRecency(timeline);
  const mergedTimeline = mergeConsecutiveSameCompanyRows(orderedTimeline);
  return (
    mergedTimeline.find((item) => /^(present|current|till date|to date)$/i.test(String(item?.end || "").trim())) ||
    (mergedTimeline.length ? mergedTimeline[0] : null)
  );
}

function normalizeTimelineIdentity(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isPresentLikeEnd(value) {
  return /^(present|current|till date|to date)$/i.test(String(value || "").trim());
}

function shouldPreferFallbackTimelineForCv(normalizedTimeline, fallbackTimeline) {
  const aiCurrent = getCurrentRoleFromTimeline(normalizedTimeline);
  const fallbackCurrent = getCurrentRoleFromTimeline(fallbackTimeline);
  if (!aiCurrent || !fallbackCurrent) return false;

  const aiCompany = normalizeTimelineIdentity(aiCurrent.company);
  const fallbackCompany = normalizeTimelineIdentity(fallbackCurrent.company);
  const aiTitle = normalizeTimelineIdentity(aiCurrent.title);
  const fallbackTitle = normalizeTimelineIdentity(fallbackCurrent.title);

  const aiStart = monthIndex(parseMonthYear(aiCurrent.start));
  const fallbackStart = monthIndex(parseMonthYear(fallbackCurrent.start));
  const aiEndPresent = isPresentLikeEnd(aiCurrent.end);
  const fallbackEndPresent = isPresentLikeEnd(fallbackCurrent.end);

  if (aiCompany && fallbackCompany && aiCompany !== fallbackCompany && fallbackStart !== null && aiStart !== null && fallbackStart > aiStart) {
    return true;
  }

  if (aiEndPresent && !fallbackEndPresent && aiCompany && fallbackCompany && aiCompany === fallbackCompany && aiTitle === fallbackTitle) {
    return true;
  }

  return false;
}

function shouldExcludeCvTimelineRowFromMetrics(item) {
  const roleText = String(item?.title || item?.designation || "").trim().toLowerCase();
  const companyText = String(item?.company || "").trim().toLowerCase();
  const combined = `${roleText} ${companyText}`.trim();
  if (!combined) return false;

  return [
    /\bintern(ship)?\b/,
    /\bself[-\s]?employed\b/,
    /\bpart[-\s]?time\b/,
    /\bapprentice(ship)?\b/,
    /\bcareer\s+break\b/,
    /\bcareer\s+gap\b/,
    /\bfreelanc(?:e|er|ing)\b/
  ].some((pattern) => pattern.test(combined));
}

function getCvCareerTimeline(timeline) {
  return (timeline || []).filter((item) => !shouldExcludeCvTimelineRowFromMetrics(item));
}

function dedupeTimelineRows(timeline) {
  const seen = new Set();
  return (timeline || []).filter((item) => {
    const key = [
      normalizeTimelineIdentity(item?.company),
      normalizeTimelineIdentity(item?.title),
      String(item?.start || "").trim().toLowerCase(),
      String(item?.end || "").trim().toLowerCase(),
      String(item?.duration || "").trim().toLowerCase()
    ].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCvCompanyCoverageSupplements(primaryTimeline, fallbackTimeline) {
  const primaryRows = getCvCareerTimeline(primaryTimeline).filter((item) => item?.company);
  const fallbackRows = getCvCareerTimeline(fallbackTimeline).filter((item) => item?.company);
  if (!primaryRows.length || !fallbackRows.length) return [];

  const supplements = [];
  for (const fallbackRow of fallbackRows) {
    const fallbackCompany = normalizeTimelineIdentity(fallbackRow.company);
    if (!fallbackCompany) continue;

    const sameCompanyPrimaryRows = primaryRows.filter(
      (item) => normalizeTimelineIdentity(item.company) === fallbackCompany
    );
    if (!sameCompanyPrimaryRows.length) continue;

    const fallbackStart = monthIndex(parseMonthYear(fallbackRow.start));
    const fallbackEnd = monthIndex(parseMonthYear(fallbackRow.end, true));
    if (fallbackStart == null || fallbackEnd == null || fallbackEnd < fallbackStart) continue;

    const overlapsCompanyCoverage = sameCompanyPrimaryRows.some((item) => {
      const start = monthIndex(parseMonthYear(item.start));
      const end = monthIndex(parseMonthYear(item.end, true));
      if (start == null || end == null || end < start) return false;
      return fallbackStart <= end + 1 && fallbackEnd >= start - 1;
    });
    if (!overlapsCompanyCoverage) continue;

    const earliestPrimaryStart = Math.min(
      ...sameCompanyPrimaryRows
        .map((item) => monthIndex(parseMonthYear(item.start)))
        .filter((value) => value != null)
    );

    if (fallbackStart < earliestPrimaryStart) {
      supplements.push(fallbackRow);
    }
  }

  return dedupeTimelineRows(supplements);
}

function getCvMetricTimeline(timeline, fallbackTimeline = []) {
  const careerTimeline = getCvCareerTimeline(timeline);
  const datedRows = careerTimeline.filter((item) => String(item?.start || "").trim() && String(item?.end || "").trim());
  const primaryRows = datedRows.length ? datedRows : careerTimeline;
  const supplementedRows = dedupeTimelineRows([
    ...primaryRows,
    ...getCvCompanyCoverageSupplements(primaryRows, fallbackTimeline)
  ]);
  return sortTimelineByRecency(supplementedRows);
}

function pickTimelineForCv(normalizedTimeline, fallbackTimeline) {
  const aiCount = normalizedTimeline.length;
  const fallbackCount = fallbackTimeline.length;
  const aiScore = scoreTimelineRows(normalizedTimeline);
  const fallbackScore = scoreTimelineRows(fallbackTimeline);

  if (!aiCount && !fallbackCount) {
    return { timeline: [], source: "none", reason: "timeline_empty" };
  }

  if (!aiCount) {
    return { timeline: fallbackTimeline, source: "fallback", reason: "fallback_only" };
  }

  if (!fallbackCount) {
    return { timeline: normalizedTimeline, source: "ai", reason: "ai_only" };
  }

  if (aiCount === 1 && fallbackCount >= 2) {
    return { timeline: fallbackTimeline, source: "fallback", reason: "fallback_richer_than_single_ai_row" };
  }

  if (fallbackCount >= aiCount + 2 && fallbackScore >= aiScore) {
    return { timeline: fallbackTimeline, source: "fallback", reason: "fallback_much_richer" };
  }

  if (fallbackScore > aiScore + 4) {
    return { timeline: fallbackTimeline, source: "fallback", reason: "fallback_better_scored" };
  }

  if (shouldPreferFallbackTimelineForCv(normalizedTimeline, fallbackTimeline)) {
    return { timeline: fallbackTimeline, source: "fallback", reason: "fallback_current_role_more_consistent" };
  }

  return { timeline: normalizedTimeline, source: "ai", reason: "ai_primary" };
}

function supportsOpenAiFileParse(file = {}) {
  const filename = String(file?.filename || "").trim().toLowerCase();
  const mimeType = String(file?.mimeType || "").trim().toLowerCase();

  if (filename.endsWith(".pdf")) return true;
  if (filename.endsWith(".doc")) return true;
  if (filename.endsWith(".txt")) return true;
  if (filename.endsWith(".html") || filename.endsWith(".htm")) return true;
  if (filename.endsWith(".xml")) return true;
  if (filename.endsWith(".csv")) return true;

  return [
    "application/pdf",
    "application/msword",
    "text/plain",
    "text/html",
    "application/xml",
    "text/xml",
    "text/csv"
  ].includes(mimeType);
}

function validateParseResult({
  finalTimeline,
  fallbackTimeline,
  currentCompany,
  totalExperience,
  averageTenurePerCompany,
  currentOrgTenure,
  emailId,
  phoneNumber,
  parseDebug
}) {
  const reasons = [];
  const finalCompanyCount = new Set(
    (finalTimeline || [])
      .map((item) => String(item?.company || "").trim().toLowerCase())
      .filter(Boolean)
  ).size;
  const fallbackCompanyCount = new Set(
    (fallbackTimeline || [])
      .map((item) => String(item?.company || "").trim().toLowerCase())
      .filter(Boolean)
  ).size;

  const totalMonths = parseDurationMonths(totalExperience);
  const currentOrgMonths = parseDurationMonths(currentOrgTenure);
  const avgMonths = parseDurationMonths(averageTenurePerCompany);

  if (!isValidEmail(emailId)) {
    reasons.push({
      field: "emailId",
      level: emailId ? "warning" : "info",
      code: "email_needs_review",
      message: emailId ? "Email may need manual review." : "Email was not confidently found in this CV."
    });
  }

  if (!normalizePhone(phoneNumber)) {
    reasons.push({
      field: "phoneNumber",
      level: phoneNumber ? "warning" : "info",
      code: "phone_needs_review",
      message: phoneNumber ? "Phone number may need manual review." : "Phone number was not confidently found in this CV."
    });
  }

  if (!currentCompany) {
    reasons.push({
      field: "currentCompany",
      level: "warning",
      code: "current_company_missing",
      message: "Current company needs review."
    });
  }

  if ((parseDebug?.sourceType || "") === "cv" && !finalTimeline.length) {
    reasons.push({
      field: "timeline",
      level: "warning",
      code: "timeline_missing",
      message: "Work timeline could not be confidently extracted from this CV."
    });
  }

  if (
    (parseDebug?.sourceType || "") === "cv" &&
    parseDebug?.finalTimelineSource === "ai" &&
    (parseDebug?.aiTimelineCount || 0) <= 1 &&
    (parseDebug?.fallbackTimelineCount || 0) >= 2
  ) {
    reasons.push({
      field: "timeline",
      level: "warning",
      code: "timeline_incomplete",
      message: "AI timeline looked shorter than the raw extracted CV timeline, so timeline metrics may need review."
    });
  }

  if ((parseDebug?.sourceType || "") === "cv" && parseDebug?.hasAmbiguousTimelineRange) {
    reasons.push({
      field: "timeline",
      level: "warning",
      code: "timeline_ambiguous_range",
      message: "Some job date ranges were ambiguous, so total experience was kept conservative."
    });
  }

  if (totalMonths && currentOrgMonths && currentOrgMonths > totalMonths) {
    reasons.push({
      field: "currentOrgTenure",
      level: "warning",
      code: "current_org_gt_total",
      message: "Current org tenure cannot be higher than total experience."
    });
  }

  if (
    totalMonths &&
    currentOrgMonths &&
    totalMonths === currentOrgMonths &&
    Math.max(finalCompanyCount, fallbackCompanyCount) >= 2
  ) {
    reasons.push({
      field: "metrics",
      level: "warning",
      code: "all_experience_equals_current_org",
      message: "Current org tenure matched total experience even though multiple companies were detected."
    });
  }

  if (totalMonths && avgMonths && finalCompanyCount >= 2 && avgMonths > totalMonths) {
    reasons.push({
      field: "averageTenurePerCompany",
      level: "warning",
      code: "avg_tenure_gt_total",
      message: "Average tenure per company cannot be higher than total experience."
    });
  }

  return {
    needsReview: reasons.length > 0,
    reasons
  };
}

function buildCandidateParseResponse(baseResult, normalizedResult, parseMeta = {}) {
  const normalizedTimeline = sanitizeTimelineRows(normalizedResult?.timeline);
  const fallbackTimeline = sanitizeTimelineRows(baseResult?.timeline);
  const normalizedGaps = sanitizeGapRows(normalizedResult?.gaps);
  const fallbackGaps = sanitizeGapRows(baseResult?.gaps);
  const sourceType = String(baseResult?.sourceType || "").trim().toLowerCase();
  const timelineChoice =
    sourceType === "cv"
      ? pickTimelineForCv(normalizedTimeline, fallbackTimeline)
      : scoreTimelineRows(normalizedTimeline) >= scoreTimelineRows(fallbackTimeline)
        ? {
            timeline: normalizedTimeline.length ? normalizedTimeline : fallbackTimeline,
            source: normalizedTimeline.length ? "ai" : "fallback",
            reason: "best_score"
          }
          : { timeline: fallbackTimeline, source: "fallback", reason: "best_score" };
  const finalTimeline = timelineChoice.timeline;
  const cvCareerTimeline = sourceType === "cv" ? getCvCareerTimeline(finalTimeline) : finalTimeline;
  const currentRole = getCurrentRoleFromTimeline(cvCareerTimeline);
  const currentCompany = choosePreferredScalar(
    currentRole?.company,
    normalizedResult?.currentCompany,
    baseResult?.currentCompany,
    isValidCurrentCompanyValue
  );
  const currentDesignation = choosePreferredScalar(
    choosePreferredDesignation(currentRole?.title, normalizedResult?.currentDesignation, baseResult?.currentDesignation),
    currentRole?.title,
    normalizedResult?.currentDesignation,
    baseResult?.currentDesignation,
    isValidCurrentDesignationValue
  );
  let normalizedCurrentCompany = currentCompany;
  let normalizedCurrentDesignation = currentDesignation;

  // Fix composite leaks like "Technical Lead | Pine Labs" landing in a single field.
  const companyComposite = splitRoleCompanyComposite(normalizedCurrentCompany);
  if (companyComposite && isValidCurrentDesignationValue(companyComposite.left) && isValidCurrentCompanyValue(companyComposite.right)) {
    normalizedCurrentCompany = companyComposite.right;
    if (!isValidCurrentDesignationValue(normalizedCurrentDesignation)) {
      normalizedCurrentDesignation = companyComposite.left;
    }
  }
  const designationComposite = splitRoleCompanyComposite(normalizedCurrentDesignation);
  if (designationComposite && looksLikeCompanyText(designationComposite.right) && isValidCurrentDesignationValue(designationComposite.left)) {
    normalizedCurrentDesignation = designationComposite.left;
    if (!isValidCurrentCompanyValue(normalizedCurrentCompany)) {
      normalizedCurrentCompany = designationComposite.right;
    }
  }
  const metricTimeline = sourceType === "cv" ? getCvMetricTimeline(finalTimeline, fallbackTimeline) : finalTimeline;
  const totalMonthsInfo = calculateTotalExperienceMonths(metricTimeline);
  const computedTotalExperience = totalMonthsInfo?.months ? formatTotalExperience(totalMonthsInfo.months) : "";
  const averageTenurePerCompany = calculateAverageTenurePerCompany(metricTimeline);
  const computedCurrentOrgTenure = calculateCurrentOrgTenure(metricTimeline, normalizedCurrentCompany);
  const aiTotalExperience = String(normalizedResult?.totalExperience || "").trim();
  const aiCurrentOrgTenure = String(normalizedResult?.currentOrgTenure || "").trim();
  let candidateTotalExperience =
    sourceType === "cv"
      ? choosePreferredScalar(computedTotalExperience, aiTotalExperience)
      : choosePreferredScalar(computedTotalExperience, aiTotalExperience);
  const candidateCurrentOrgTenure =
    sourceType === "cv"
      ? String(computedCurrentOrgTenure || "").trim()
      : choosePreferredScalar(computedCurrentOrgTenure, aiCurrentOrgTenure);
  // Cross-channel deterministic contract:
  // for CV source we always keep timeline-derived total experience
  // so Captured Notes and Interview Panel produce identical totals.
  const rawTextForSearch = String(baseResult?.rawText || "").trim();
  // Do not auto-hide/blank contact details. Keep best available value;
  // reviewers can still see warning flags from validateParseResult.
  const preferredEmailRaw = choosePreferredScalar(normalizedResult?.emailId, baseResult?.emailId);
  const extractedEmailFromRaw = extractBestEmailFromRawText(rawTextForSearch);
  const emailCandidate = (
    !preferredEmailRaw || !isValidEmail(preferredEmailRaw) || looksMaskedContactValue(preferredEmailRaw)
  ) ? (extractedEmailFromRaw || preferredEmailRaw) : preferredEmailRaw;
  const emailId = applyEmailTldSafeguard(emailCandidate, rawTextForSearch);

  const preferredPhoneRaw = choosePreferredScalar(normalizedResult?.phoneNumber, baseResult?.phoneNumber);
  const extractedPhoneFromRaw = extractBestPhoneFromRawText(rawTextForSearch);
  const normalizedPreferredPhone = normalizePhone(preferredPhoneRaw);
  const normalizedExtractedPhone = normalizePhone(extractedPhoneFromRaw);
  const phoneNumber = normalizedPreferredPhone
    || normalizedExtractedPhone
    || "";
  const linkedinUrl = choosePreferredScalar(
    normalizedResult?.linkedinUrl,
    baseResult?.linkedinUrl
  );
  const highestEducationRaw = choosePreferredScalar(
    baseResult?.highestQualification,
    normalizedResult?.highestEducation,
    baseResult?.highestEducation,
    extractHighestEducationFromRawText(rawTextForSearch)
  );
  const highestEducationInitial = isValidHighestEducationText(highestEducationRaw) ? String(highestEducationRaw || "").trim() : "";
  const parseDebug = {
    sourceType,
    aiNormalizationUsed: Boolean(normalizedResult),
    aiParseMode: parseMeta.aiParseMode || (normalizedResult ? "fast_text_ai" : "fallback_only"),
    aiParseReason: parseMeta.aiParseReason || (normalizedResult ? "Fast text-based AI normalization completed." : "AI normalization was not used."),
    aiTimelineCount: normalizedTimeline.length,
    fallbackTimelineCount: fallbackTimeline.length,
    finalTimelineSource: timelineChoice.source,
    finalTimelineReason: timelineChoice.reason,
    excludedMetricTimelineCount: Math.max(0, finalTimeline.length - metricTimeline.length),
    currentCompanySource: normalizedResult?.currentCompany ? "ai" : (baseResult?.currentCompany ? "fallback" : "none"),
    totalExperienceSource:
      candidateTotalExperience && candidateTotalExperience === aiTotalExperience ? "ai" : (candidateTotalExperience ? "timeline" : "none"),
    currentOrgTenureSource:
      candidateCurrentOrgTenure && candidateCurrentOrgTenure === aiCurrentOrgTenure ? "ai" : (candidateCurrentOrgTenure ? "timeline" : "none"),
    contactSource:
      emailId === String(normalizedResult?.emailId || "").trim() || phoneNumber === String(normalizedResult?.phoneNumber || "").trim()
        ? "ai"
        : "fallback",
    hasAmbiguousTimelineRange: Boolean(totalMonthsInfo?.hasAmbiguousRange)
  };
  const guardrailChanges = [];
  const pushGuardrailChange = (field, originalValue, correctedValue, reason, evidence) => {
    if (String(originalValue || "") === String(correctedValue || "")) return;
    guardrailChanges.push({
      field,
      original_value: originalValue ?? null,
      corrected_value: correctedValue ?? null,
      reason,
      raw_evidence: evidence || null
    });
  };
  if (currentCompany !== normalizedCurrentCompany) {
    pushGuardrailChange("current_company", currentCompany, normalizedCurrentCompany, "split_role_company_composite", String(currentCompany || ""));
  }
  if (currentDesignation !== normalizedCurrentDesignation) {
    pushGuardrailChange("current_designation", currentDesignation, normalizedCurrentDesignation, "split_role_company_composite", String(currentDesignation || ""));
  }
  const validation = validateParseResult({
    finalTimeline,
    fallbackTimeline,
    currentCompany: normalizedCurrentCompany,
    totalExperience: candidateTotalExperience,
    averageTenurePerCompany,
    currentOrgTenure: candidateCurrentOrgTenure,
    emailId,
    phoneNumber,
    parseDebug
  });
  const hasTimelineRisk = validation.reasons.some((item) => item.field === "timeline");
  const hasMetricsRisk = validation.reasons.some((item) => item.field === "metrics");
  const hasCurrentOrgRisk = validation.reasons.some((item) => item.field === "currentOrgTenure");
  const hasAvgTenureRisk = validation.reasons.some((item) => item.field === "averageTenurePerCompany");
  const timelineConfidenceLevel =
    sourceType !== "cv"
      ? "high"
      : !finalTimeline.length || hasTimelineRisk
        ? "low"
        : finalTimeline.length >= 2
          ? "high"
          : "medium";
  const timelineConfidenceLabel =
    timelineConfidenceLevel === "high"
      ? "Timeline confidence high"
      : timelineConfidenceLevel === "medium"
        ? "Timeline confidence mid"
        : "Timeline confidence low";
  parseDebug.timelineConfidence = timelineConfidenceLevel;
  parseDebug.timelineConfidenceLabel = timelineConfidenceLabel;

  const finalTotalExperience = hasMetricsRisk || hasTimelineRisk
    ? ""
    : candidateTotalExperience;
  const finalAverageTenure = hasAvgTenureRisk || hasMetricsRisk || hasTimelineRisk
    ? ""
    : averageTenurePerCompany;
  const finalCurrentOrgTenure = hasCurrentOrgRisk || hasMetricsRisk || hasTimelineRisk
    ? ""
    : candidateCurrentOrgTenure;
  const totalMonthsSafe = totalMonthsInfo?.months || 0;
  const totalExperienceObject = {
    years: Math.floor(totalMonthsSafe / 12),
    months: totalMonthsSafe % 12,
    calculation_source: "backend_date_ranges",
    warnings: [
      ...(totalMonthsInfo?.hasAmbiguousRange ? ["ambiguous_ranges_ignored"] : []),
      ...(validation.reasons || []).filter((item) => item.field === "timeline").map((item) => String(item.code || "timeline_warning"))
    ]
  };

  const currentRoleForCurrentExp = getCurrentRoleFromTimeline(metricTimeline);
  const currentRoleStart = parseMonthYear(currentRoleForCurrentExp?.start || "");
  const now = new Date();
  const currentIdx = now.getFullYear() * 12 + now.getMonth();
  const currentStartIdx = monthIndex(currentRoleStart);
  const currentMonths = currentStartIdx != null ? Math.max(0, currentIdx - currentStartIdx + 1) : 0;
  const currentExperienceObject = {
    company_name: normalizedCurrentCompany || null,
    designation: normalizedCurrentDesignation || null,
    years: Math.floor(currentMonths / 12),
    months: currentMonths % 12,
    start_date:
      currentRoleStart && Number.isInteger(currentRoleStart.year) && Number.isInteger(currentRoleStart.month)
        ? `${currentRoleStart.year}-${String(currentRoleStart.month + 1).padStart(2, "0")}`
        : null,
    warnings: currentMonths ? [] : ["current_experience_unresolved"]
  };

  const includeVerboseParseDebug = String(process.env.CV_PARSE_VERBOSE_DEBUG || "").trim().toLowerCase() === "true";
  const rawTextPreview = rawTextForSearch ? rawTextForSearch.slice(0, includeVerboseParseDebug ? 2200 : 300) : "";
  const searchKeywords = (() => {
    if (!includeVerboseParseDebug) return "";
    if (!rawTextForSearch) return "";
    const normalized = rawTextForSearch
      .toLowerCase()
      .replace(/\basp\s*\.?\s*net\b/g, "asp.net")
      .replace(/\b\.net\b/g, "dotnet")
      .replace(/[^a-z0-9+.#\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized) return "";
    const tokens = normalized.split(" ").map((t) => t.trim()).filter(Boolean);
    const seen = new Set();
    const kept = [];
    for (const token of tokens) {
      if (token.length < 3) continue;
      if (seen.has(token)) continue;
      seen.add(token);
      kept.push(token);
      if (kept.length >= 2500) break;
    }
    return kept.join(" ");
  })();
  const parserConfidence = {
    company_designation: normalizedCurrentCompany && normalizedCurrentDesignation ? 0.88 : 0.52,
    experience: timelineConfidenceLevel === "high" ? 0.9 : (timelineConfidenceLevel === "medium" ? 0.74 : 0.45),
    education: highestEducationInitial ? 0.82 : 0.45
  };
  parserConfidence.overall = Number(
    (((parserConfidence.company_designation + parserConfidence.experience + parserConfidence.education) / 3).toFixed(2))
  );
  const manualReviewRequired =
    parserConfidence.company_designation < 0.75
    || parserConfidence.experience < 0.75
    || parserConfidence.education < 0.7
    || !normalizedCurrentCompany
    || !totalMonthsSafe;
  parseDebug.guardrailChanges = guardrailChanges;
  if (includeVerboseParseDebug) {
    parseDebug.detectedSections = baseResult?.detectedSections || {};
    parseDebug.workExperienceSection = String(baseResult?.workExperienceSection || "");
    parseDebug.rawJobBlocks = Array.isArray(baseResult?.rawJobBlocks) ? baseResult.rawJobBlocks : [];
    parseDebug.parsedEmploymentHistory = Array.isArray(baseResult?.employmentHistory) ? baseResult.employmentHistory : [];
  }

  const experienceHistorySource = Array.isArray(baseResult?.experienceTimeline) && baseResult.experienceTimeline.length
    ? baseResult.experienceTimeline.map((item) => ({
        designation: String(item?.designation || "").trim(),
        company_name: String(item?.company || "").trim(),
        start_date: String(item?.startDate || "").trim(),
        end_date: String(item?.endDate || "").trim(),
        duration: "",
        raw_line: String(item?.sourceText || "").trim(),
        confidence: String(item?.confidence || "").toLowerCase() === "high" ? 0.9 : 0.68
      }))
    : (Array.isArray(baseResult?.employmentHistory) ? baseResult.employmentHistory : []);
  const experienceHistory = experienceHistorySource
    .map((item) => ({
      designation: String(item?.designation || "").trim(),
      company_name: String(item?.company_name || "").trim(),
      start_date: String(item?.start_date || "").trim(),
      end_date: String(item?.end_date || "").trim(),
      duration: String(item?.raw_duration_text || "").trim(),
      location: String(item?.location || "").trim(),
      description: "",
      raw_line: String(item?.raw_line || item?.source_line || "").trim(),
      confidence: Number(item?.confidence || 0) || 0
    }))
    .filter((item) => item.designation || item.company_name || item.start_date || item.end_date);
  const educationSectionText = String(baseResult?.detectedSections?.education || baseResult?.detectedSections?.education_qualification || "").trim();
  const educationHistory = Array.isArray(baseResult?.education) && baseResult.education.length
    ? baseResult.education.map((item) => ({
        degree: String(item?.degree || item?.qualification || item?.course || "").trim(),
        institution: String(item?.institution || item?.university || item?.school || "").trim(),
        start_date: String(item?.startDate || item?.start_date || "").trim(),
        end_date: String(item?.endDate || item?.end_date || "").trim(),
        year: String(item?.year || "").trim(),
        grade: String(item?.score || item?.grade || "").trim(),
        raw_line: String(item?.rawText || item?.raw_line || "").trim(),
        confidence: String(item?.confidence || "").toLowerCase() === "high" ? 0.9 : 0.68
      }))
    : buildDeterministicEducationHistory(rawTextForSearch, highestEducationInitial, educationSectionText);
  const highestEducation = pickHighestEducationFromHistory(educationHistory, highestEducationInitial);
  const resolvedCvLocation = resolveCandidateLocationFromCv({
    experienceHistory,
    normalizedLocation: String(normalizedResult?.location || baseResult?.location || "").trim(),
    rawText: rawTextForSearch
  });
  const fixedSchema = {
    summary: {
      candidate_name: String(normalizedResult?.candidateName || baseResult?.candidateName || "").trim(),
      email: emailId,
      phone: phoneNumber,
      linkedin: linkedinUrl,
      location: resolvedCvLocation,
      current_company: normalizedCurrentCompany,
      current_designation: normalizedCurrentDesignation,
      total_experience: String(finalTotalExperience || normalizedResult?.totalExperience || baseResult?.totalExperience || "").trim(),
      highest_education: highestEducation
    },
    experience_history: experienceHistory,
    education_history: educationHistory
  };

  // Canonical current-role/tenure must come from final repaired experience_history,
  // not from intermediate fallback timeline variants.
  const canonicalTimelineForCurrent = (sourceType === "cv" ? cvCareerTimeline : finalTimeline)
    .map((item) => ({
      company: String(item?.company || item?.company_name || "").trim(),
      title: String(item?.title || item?.designation || "").trim(),
      start: String(item?.start || item?.start_date || "").trim(),
      end: String(item?.end || item?.end_date || "").trim()
    }))
    .filter((row) => row.company || row.title || row.start || row.end);
  const canonicalSpan = getCurrentCompanyContiguousSpan(canonicalTimelineForCurrent);
  const canonicalCurrentRole = canonicalSpan.row || getCurrentRoleFromTimeline(canonicalTimelineForCurrent) || null;
  const canonicalCurrentMonths = Number(canonicalSpan.months || 0);
  const canonicalCurrentOrgTenure = canonicalCurrentMonths ? formatTotalExperience(canonicalCurrentMonths) : finalCurrentOrgTenure;
  const canonicalCurrentRoleStart = parseMonthYear(canonicalSpan.start || canonicalCurrentRole?.start || "");
  const canonicalCurrentExperienceObject = {
    company_name: String(canonicalCurrentRole?.company || normalizedCurrentCompany || "").trim() || null,
    designation: String(canonicalCurrentRole?.title || normalizedCurrentDesignation || "").trim() || null,
    years: Math.floor((canonicalCurrentMonths || 0) / 12),
    months: (canonicalCurrentMonths || 0) % 12,
    start_date:
      canonicalCurrentRoleStart && Number.isInteger(canonicalCurrentRoleStart.year) && Number.isInteger(canonicalCurrentRoleStart.month)
        ? `${canonicalCurrentRoleStart.year}-${String(canonicalCurrentRoleStart.month + 1).padStart(2, "0")}`
        : null,
    warnings: canonicalCurrentMonths ? [] : ["current_experience_unresolved"]
  };

    return {
      candidateName: String(
        normalizedResult?.candidateName || baseResult?.candidateName || ""
      ).trim(),
    totalExperience: String(
      finalTotalExperience || normalizedResult?.totalExperience || baseResult?.totalExperience || ""
    ).trim(),
    currentCompany: normalizedCurrentCompany,
    currentDesignation: normalizedCurrentDesignation,
      emailId,
      phoneNumber,
      linkedinUrl,
      location: resolvedCvLocation,
      highestEducation,
      sourceType: String(baseResult?.sourceType || "").trim(),
    filename: String(baseResult?.filename || "").trim(),
    timeline: sourceType === "cv" ? cvCareerTimeline : finalTimeline,
    employmentHistory: includeVerboseParseDebug ? (Array.isArray(baseResult?.employmentHistory) ? baseResult.employmentHistory : []) : [],
    gaps: normalizedGaps.length ? normalizedGaps : fallbackGaps,
    averageTenurePerCompany: finalAverageTenure,
    currentOrgTenure: canonicalCurrentOrgTenure,
    total_experience: totalExperienceObject,
    current_experience: canonicalCurrentExperienceObject,
    parser_confidence: parserConfidence,
    manual_review_required: manualReviewRequired,
    shortStints: Array.isArray(baseResult?.shortStints) ? baseResult.shortStints : [],
    highlights: Array.isArray(baseResult?.highlights) ? baseResult.highlights : [],
    rawTextPreview,
    searchKeywords,
    parseDebug,
    fixed_schema: fixedSchema,
    experience_history: experienceHistory,
    education_history: educationHistory,
    timelineConfidence: {
      level: timelineConfidenceLevel,
      label: timelineConfidenceLabel
    },
    validation,
    parser_warnings: [
      ...(Array.isArray(baseResult?.parserWarnings) ? baseResult.parserWarnings : []),
      ...(validation.reasons || []).map((item) => item.message).filter(Boolean)
    ].filter(Boolean),
    debug: includeVerboseParseDebug
      ? {
          raw_cv_text: String(baseResult?.rawText || ""),
          detected_sections: baseResult?.detectedSections || {},
          work_experience_section: String(baseResult?.workExperienceSection || ""),
          raw_job_blocks: Array.isArray(baseResult?.rawJobBlocks) ? baseResult.rawJobBlocks : [],
          parsed_employment_history: Array.isArray(baseResult?.employmentHistory) ? baseResult.employmentHistory : [],
          parsed_education: highestEducation ? [{ degree: highestEducation }] : [],
          guardrail_changes: guardrailChanges,
          backend_experience_calculation: totalExperienceObject,
          final_parsed_output: {
            current_company: normalizedCurrentCompany || null,
            current_designation: normalizedCurrentDesignation || null,
            total_experience: totalExperienceObject,
            current_experience: canonicalCurrentExperienceObject,
            highest_qualification: highestEducation || null
          },
          parser_warnings: (validation.reasons || []).map((item) => item.message).filter(Boolean),
          openai_raw_response: parseMeta?.openAiRawResponse || null
        }
      : {
          guardrail_changes: guardrailChanges,
          backend_experience_calculation: totalExperienceObject,
          parser_warnings: (validation.reasons || []).map((item) => item.message).filter(Boolean)
        }
  };
}

function looksLikeDateMetaText(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^\d{4}\s*[-\u2013\u2014\u2212]\s*(\d{4}|present|current)$/i.test(text)) return true;
  if (/^\d{1,2}[/-]\d{4}\s*[-\u2013\u2014\u2212]\s*(\d{1,2}[/-]\d{4}|present|current)$/i.test(text)) return true;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i.test(text) && /present|current|\d{2,4}/i.test(text)) return true;
  if (/present|current/.test(text.toLowerCase()) && /\b(19|20)\d{2}\b/.test(text)) return true;
  return false;
}

function sanitizeCvCandidateLocation(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const lower = text.toLowerCase();
  if (/^(present|current|ongoing|till\s*date|to\s*date|now)$/i.test(text)) return "";
  // Reject responsibility/project fragments often captured after the word "location".
  if (/(scouting|set\s+design|post-?production|production|responsib|collaborat|coordinat|managed|developed|worked|assisted)/i.test(lower)) {
    return "";
  }
  if (/[.!?]/.test(text)) return "";
  if (text.length > 48) return "";
  // Keep practical city-like values only.
  if (!/^[a-zA-Z][a-zA-Z\s,/-]{1,47}$/.test(text)) return "";
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 5) return "";
  return text;
}

const KNOWN_INDIAN_CITY_ALIASES = [
  { canonical: "New Delhi", variants: ["new delhi", "delhi"] },
  { canonical: "Gurugram", variants: ["gurugram", "gurgaon"] },
  { canonical: "Noida", variants: ["noida"] },
  { canonical: "Ghaziabad", variants: ["ghaziabad"] },
  { canonical: "Bengaluru", variants: ["bengaluru", "bangalore", "bangaluru"] },
  { canonical: "Hyderabad", variants: ["hyderabad"] },
  { canonical: "Chennai", variants: ["chennai"] },
  { canonical: "Kolkata", variants: ["kolkata", "calcutta"] },
  { canonical: "Mumbai", variants: ["mumbai", "bombay"] },
  { canonical: "Pune", variants: ["pune"] },
  { canonical: "Ahmedabad", variants: ["ahmedabad"] },
  { canonical: "Jaipur", variants: ["jaipur"] },
  { canonical: "Indore", variants: ["indore"] },
  { canonical: "Lucknow", variants: ["lucknow"] },
  { canonical: "Noida", variants: ["noida, uttar pradesh"] },
  { canonical: "Ghaziabad", variants: ["ghaziabad, uttar pradesh"] }
];

function extractKnownIndianCity(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  for (const city of KNOWN_INDIAN_CITY_ALIASES) {
    const variants = Array.isArray(city?.variants) ? city.variants : [];
    for (const variant of variants) {
      const token = String(variant || "").trim().toLowerCase();
      if (!token) continue;
      const safe = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|[^a-z])${safe}([^a-z]|$)`, "i");
      if (pattern.test(text)) return String(city.canonical || "").trim();
    }
  }
  return "";
}

function extractLocationFromExperienceRawLine(rawLine = "") {
  const raw = String(rawLine || "").trim();
  if (!raw) return "";
  const knownDirect = extractKnownIndianCity(raw);
  if (knownDirect) return knownDirect;
  const pieces = raw.split(/\s+[|@,-]\s+|\s{2,}/).map((part) => String(part || "").trim()).filter(Boolean);
  for (let i = pieces.length - 1; i >= 0; i -= 1) {
    const candidate = sanitizeCvCandidateLocation(pieces[i]);
    if (!candidate) continue;
    if (/\b(india|private|pvt|ltd|limited|llp|inc|corp|technologies|solutions)\b/i.test(candidate)) continue;
    return candidate;
  }
  return "";
}

function extractHeaderFooterLocation(rawText = "") {
  const lines = String(rawText || "").replace(/\r/g, "").split("\n").map((line) => String(line || "").trim()).filter(Boolean);
  if (!lines.length) return "";
  const scope = [...lines.slice(0, 40), ...lines.slice(-20)];
  for (const line of scope) {
    const match = line.match(/\blocation\s*[:\-]\s*([A-Za-z][A-Za-z\s,/-]{1,48})/i);
    if (!match) continue;
    const fromKnown = extractKnownIndianCity(String(match[1] || "").trim());
    if (fromKnown) return fromKnown;
    const location = sanitizeCvCandidateLocation(String(match[1] || "").trim());
    if (location) return location;
  }
  for (const line of scope) {
    const city = extractKnownIndianCity(line);
    if (city) return city;
  }
  return "";
}

function resolveCandidateLocationFromCv({ experienceHistory = [], normalizedLocation = "", rawText = "" }) {
  const rows = Array.isArray(experienceHistory) ? experienceHistory : [];
  const companyTokens = new Set(
    rows
      .map((item) => String(item?.company_name || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const designationTokens = new Set(
    rows
      .map((item) => String(item?.designation || "").trim().toLowerCase())
      .filter(Boolean)
  );
  const pickCityFromCompoundLocation = (value = "") => {
    const rawValue = String(value || "").trim();
    if (!rawValue) return "";
    const parts = rawValue.split(",").map((part) => String(part || "").trim()).filter(Boolean);
    if (parts.length < 2) return rawValue;
    const left = parts[0].toLowerCase();
    const right = parts.slice(1).join(", ").trim();
    if (!right) return rawValue;
    if (companyTokens.has(left) || designationTokens.has(left)) {
      return right;
    }
    return rawValue;
  };
  const current = getCurrentRoleFromTimeline(
    rows
      .map((item) => ({
        company: String(item?.company_name || "").trim(),
        title: String(item?.designation || "").trim(),
        start: String(item?.start_date || "").trim(),
        end: String(item?.end_date || "").trim()
      }))
      .filter((row) => row.company || row.title || row.start || row.end)
  );
  if (current) {
    const match = rows.find((item) =>
      String(item?.company_name || "").trim() === String(current.company || "").trim()
      && String(item?.designation || "").trim() === String(current.title || "").trim()
      && String(item?.start_date || "").trim() === String(current.start || "").trim()
      && String(item?.end_date || "").trim() === String(current.end || "").trim()
    );
    const fromCurrentRow = sanitizeCvCandidateLocation(String(match?.location || "").trim());
    if (fromCurrentRow) {
      const known = extractKnownIndianCity(fromCurrentRow);
      if (known) return known;
    }
    const fromCurrentRawLine = extractLocationFromExperienceRawLine(String(match?.raw_line || "").trim());
    if (fromCurrentRawLine) {
      const known = extractKnownIndianCity(fromCurrentRawLine);
      if (known) return known;
    }
  }
  // If parser attached city inside company/location fields of experience rows
  // (common in compact CVs), prefer those before header/footer fallback.
  for (const row of rows) {
    const fromCompanyField = extractKnownIndianCity(String(row?.company_name || "").trim());
    if (fromCompanyField) return fromCompanyField;
    const fromLocationField = extractKnownIndianCity(String(row?.location || "").trim());
    if (fromLocationField) return fromLocationField;
  }
  for (const row of rows) {
    const fromRowRaw = extractLocationFromExperienceRawLine(String(row?.raw_line || "").trim());
    if (!fromRowRaw) continue;
    const known = extractKnownIndianCity(fromRowRaw);
    if (known) return known;
  }
  const explicit = pickCityFromCompoundLocation(
    sanitizeCvCandidateLocation(String(normalizedLocation || "").trim())
  );
  const explicitKnownCity = extractKnownIndianCity(explicit);
  if (explicitKnownCity) return explicitKnownCity;
  // Multi-column CV fallback:
  // try to recover city shown near current company block even when it is not attached to role raw line.
  const raw = String(rawText || "");
  if (raw && current?.company) {
    const companyNeedle = String(current.company || "").trim();
    if (companyNeedle) {
      const lines = raw.replace(/\r/g, "").split("\n").map((line) => String(line || "").trim()).filter(Boolean);
      const idx = lines.findIndex((line) => line.toLowerCase().includes(companyNeedle.toLowerCase()));
      if (idx >= 0) {
        const window = lines.slice(Math.max(0, idx - 3), Math.min(lines.length, idx + 8));
        for (const line of window) {
          const pipeLocation = line.match(/\|\s*([A-Za-z][A-Za-z\s,/-]{2,})$/);
          if (pipeLocation?.[1]) {
            const candidate = pickCityFromCompoundLocation(
              sanitizeCvCandidateLocation(String(pipeLocation[1] || "").trim())
            );
            const known = extractKnownIndianCity(candidate);
            if (known) return known;
          }
          const candidate = pickCityFromCompoundLocation(sanitizeCvCandidateLocation(line));
          const known = extractKnownIndianCity(candidate);
          if (known) return known;
        }
      }
    }
  }
  const headerFooter = extractHeaderFooterLocation(rawText);
  const knownFromHeaderFooter = extractKnownIndianCity(headerFooter);
  return knownFromHeaderFooter || "";
}

function normalizeMarketingHeaderKey(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function pickMarketingRowValue(row = {}, aliases = []) {
  const source = row && typeof row === "object" ? row : {};
  const aliasSet = new Set((Array.isArray(aliases) ? aliases : []).map((item) => normalizeMarketingHeaderKey(item)).filter(Boolean));
  if (!aliasSet.size) return "";
  const entries = Object.entries(source || {});
  for (const [key, value] of entries) {
    if (!aliasSet.has(normalizeMarketingHeaderKey(key))) continue;
    const text = String(value == null ? "" : value).trim();
    if (text) return text;
  }
  return "";
}

function looksLikeTaglineText(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  if (/\b(b2b saas platform serving|global font and brand technology company|marketing automation saas platform|edtech platform connecting)\b/.test(text)) return true;
  if (text.split(/\s+/).length >= 8 && /\b(platform|serving|technology company|brand technology|market segment|business summary|product)\b/.test(text)) return true;
  return false;
}

function looksLikeResponsibilityText(value = "") {
  return /^(built|led|managed|developed|created|executed|driving|working|maintaining|collaborating|generated|achieved|provided|used|implemented|designed|delivered|owned|applied|partnered)\b/i.test(String(value || "").trim());
}

function detectParseRedFlags(parsedResult = {}) {
  const flags = [];
  const currentCompany = String(parsedResult?.currentCompany || "").trim();
  const currentDesignation = String(parsedResult?.currentDesignation || "").trim();
  const timeline = Array.isArray(parsedResult?.experienceTimeline) ? parsedResult.experienceTimeline : [];
  const warnings = Array.isArray(parsedResult?.parserWarnings) ? parsedResult.parserWarnings : [];
  const education = Array.isArray(parsedResult?.education) ? parsedResult.education : [];
  const educationSection = String(parsedResult?.detectedSections?.education || parsedResult?.detectedSections?.education_qualification || "").trim();

  if (!currentCompany) flags.push("current_company_missing");
  if (!currentDesignation) flags.push("current_designation_missing");
  if (!timeline.length) flags.push("experience_empty");
  if (warnings.length) flags.push("parser_warnings_present");

  let blankCompanies = 0;
  for (const row of timeline) {
    const company = String(row?.company || "").trim();
    if (!company) blankCompanies += 1;
    if (looksLikeDateMetaText(company)) flags.push("company_looks_like_date_line");
    if (looksLikeTaglineText(company)) flags.push("company_looks_like_tagline");
    if (looksLikeResponsibilityText(company)) flags.push("company_looks_like_responsibility");
  }
  if (timeline.length && blankCompanies >= Math.max(2, Math.ceil(timeline.length * 0.5))) {
    flags.push("too_many_blank_companies");
  }

  const presentRows = timeline.filter((row) => String(row?.endDate || "").trim().toLowerCase() === "present");
  if (presentRows.length > 1) flags.push("multiple_current_tenures");

  const parseYm = (value = "") => {
    const m = String(value || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return null;
    const y = Number(m[1]); const mo = Number(m[2]);
    if (!Number.isFinite(y) || !Number.isFinite(mo)) return null;
    return y * 12 + mo;
  };
  let dateOrderMismatch = false;
  for (const row of timeline) {
    const s = parseYm(row?.startDate);
    const eRaw = String(row?.endDate || "").trim();
    const e = eRaw.toLowerCase() === "present" ? null : parseYm(eRaw);
    if (s != null && e != null && e < s) {
      dateOrderMismatch = true;
      break;
    }
  }
  if (dateOrderMismatch) flags.push("date_range_mismatch");

  if (!educationSection && education.length > 0) {
    flags.push("education_section_suspicious");
  }

  return Array.from(new Set(flags));
}

function getTimelineRowCompany(item) {
  return String(item?.company || item?.company_name || "").trim();
}

function getTimelineRowTitle(item) {
  return String(item?.title || item?.designation || "").trim();
}

function mergeConsecutiveSameCompanyRows(timeline) {
  const rows = Array.isArray(timeline) ? timeline : [];
  if (!rows.length) return [];
  const merged = [];
  for (const row of rows) {
    const prev = merged[merged.length - 1] || null;
    if (!prev) {
      merged.push(row);
      continue;
    }
    const prevCompany = normalizeTimelineIdentity(getTimelineRowCompany(prev));
    const rowCompany = normalizeTimelineIdentity(getTimelineRowCompany(row));
    if (!prevCompany || !rowCompany || prevCompany !== rowCompany) {
      merged.push(row);
      continue;
    }
    const prevStart = parseMonthYear(prev.start);
    const rowStart = parseMonthYear(row.start);
    const prevEnd = parseMonthYear(prev.end, true);
    const rowEnd = parseMonthYear(row.end, true);
    const prevStartIdx = monthIndex(prevStart);
    const rowStartIdx = monthIndex(rowStart);
    const prevEndIdx = monthIndex(prevEnd);
    const rowEndIdx = monthIndex(rowEnd);
    const shouldMerge =
      (prevStartIdx != null && rowEndIdx != null && rowEndIdx <= prevStartIdx + 1) ||
      (rowStartIdx != null && prevEndIdx != null && prevEndIdx >= rowStartIdx - 1) ||
      (!rowStartIdx && !prevEndIdx) ||
      (!prevStartIdx && !rowEndIdx);
    if (!shouldMerge) {
      merged.push(row);
      continue;
    }
    const earlierStart = (rowStartIdx != null && (prevStartIdx == null || rowStartIdx < prevStartIdx)) ? row.start : prev.start;
    const laterEnd = (() => {
      const prevPresent = isPresentLikeEnd(prev.end);
      const rowPresent = isPresentLikeEnd(row.end);
      if (prevPresent || rowPresent) return "Present";
      if (prevEndIdx == null) return row.end;
      if (rowEndIdx == null) return prev.end;
      return rowEndIdx > prevEndIdx ? row.end : prev.end;
    })();
    merged[merged.length - 1] = {
      ...prev,
      start: String(earlierStart || prev.start || row.start || "").trim(),
      end: String(laterEnd || prev.end || row.end || "").trim(),
      title: getTimelineRowTitle(prev) || getTimelineRowTitle(row),
      company: getTimelineRowCompany(prev) || getTimelineRowCompany(row)
    };
  }
  return merged;
}

function buildCvAutofillPatch(candidateRow, cvResult) {
  const candidate = candidateRow && typeof candidateRow === "object" ? candidateRow : {};
  const result = cvResult && typeof cvResult === "object" ? cvResult : {};
  const isBlank = (value) => !String(value || "").trim();

  const patch = {};
  const nextName = String(result.candidateName || "").trim();
  const nextEmail = String(result.emailId || "").trim();
  const nextPhone = String(result.phoneNumber || "").trim();
  const nextCompany = String(result.currentCompany || "").trim();
  const nextRole = String(result.currentDesignation || "").trim();
  const nextExp = String(result.totalExperience || "").trim();
  const nextEdu = String(result.highestEducation || result.highestQualification || "").trim();
  const nextLinkedIn = String(result.linkedinUrl || "").trim();
  const nextOrgTenure = String(result.currentOrgTenure || "").trim();
  const timelineConfidence = String(
    result?.timelineConfidence?.level || result?.parseDebug?.timelineConfidence || ""
  ).trim().toLowerCase();

  if (isBlank(candidate.name) && nextName) patch.name = nextName;
  if (isBlank(candidate.email) && nextEmail) patch.email = nextEmail;
  if (isBlank(candidate.phone) && nextPhone) patch.phone = nextPhone;
  if (isBlank(candidate.company) && nextCompany) patch.company = nextCompany;
  if (isBlank(candidate.role) && nextRole) patch.role = nextRole;
  if (isBlank(candidate.experience) && nextExp) patch.experience = nextExp;
  if (isBlank(candidate.highest_education) && nextEdu) patch.highest_education = nextEdu;
  if (isBlank(candidate.linkedin) && nextLinkedIn) patch.linkedin = nextLinkedIn;

  const existingDraft = normalizeJsonObjectInput(candidate.draft_payload || candidate.draftPayload || {});
  const nextDraft = { ...existingDraft };
  const setBlank = (key, value) => {
    if (!value) return;
    if (isBlank(nextDraft[key])) nextDraft[key] = value;
  };

  setBlank("candidateName", nextName);
  setBlank("emailId", nextEmail);
  setBlank("phoneNumber", nextPhone);
  setBlank("currentCompany", nextCompany);
  setBlank("currentDesignation", nextRole);
  if (timelineConfidence === "high") {
    setBlank("totalExperience", nextExp);
  }
  setBlank("highestEducation", nextEdu);
  setBlank("linkedin", nextLinkedIn);
  // Guardrail: current org tenure is timeline-derived and error-prone on weak CV parses.
  // Auto-fill it only when parser marks timeline confidence as high.
  if (timelineConfidence === "high") {
    setBlank("currentOrgTenure", nextOrgTenure);
  }

  // Only write draft_payload when we actually changed something to avoid noisy updates.
  const draftChanged = JSON.stringify(existingDraft) !== JSON.stringify(nextDraft);
  if (draftChanged) {
    patch.draft_payload = nextDraft;
  }
  return patch;
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    sendJson(res, 404, { ok: false, error: "Not found." });
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, buildResponseHeaders(req, { "Content-Length": 0 }));
    res.end();
    return;
  }

  // Render/Cloudflare health check endpoint: keep it fast and dependency-free.
  // This helps reduce transient 502s during deploys/restarts by letting the platform
  // know when the service is ready to serve traffic.
  if (req.method === "GET" && (requestUrl.pathname === "/health" || requestUrl.pathname === "/healthz")) {
    sendJson(res, 200, { ok: true, ts: new Date().toISOString() });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/app-version") {
    const info = getPortalBuildInfo();
    sendJson(res, 200, {
      ok: true,
      app: "portal",
      buildId: info.buildId,
      builtAt: info.builtAt || null,
      ts: new Date().toISOString()
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/stream/captured") {
    try {
      const streamToken = String(requestUrl.searchParams.get("token") || "").trim();
      const actor = await requireSessionUser(streamToken || getBearerToken(req));
      const companyId = String(actor?.companyId || "").trim();
      if (!companyId) throw new Error("Invalid session.");

      const headers = buildResponseHeaders(req, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      res.writeHead(200, headers);
      res.write(`event: connected\n`);
      res.write(`data: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);

      const client = { res, companyId };
      addCapturedStreamClient(companyId, client);
      const keepAlive = setInterval(() => {
        try {
          res.write(`event: ping\n`);
          res.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
        } catch {
          // handled by close/error cleanup
        }
      }, 25000);

      const cleanup = () => {
        try { clearInterval(keepAlive); } catch {}
        removeCapturedStreamClient(companyId, client);
      };
      req.on("close", cleanup);
      req.on("error", cleanup);
      return;
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error?.message || error) });
      return;
    }
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/stream/assessments") {
    try {
      const streamToken = String(requestUrl.searchParams.get("token") || "").trim();
      const actor = await requireSessionUser(streamToken || getBearerToken(req));
      const companyId = String(actor?.companyId || "").trim();
      if (!companyId) throw new Error("Invalid session.");

      const headers = buildResponseHeaders(req, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      });
      res.writeHead(200, headers);
      res.write(`event: connected\n`);
      res.write(`data: ${JSON.stringify({ ok: true, at: new Date().toISOString() })}\n\n`);

      const client = { res, companyId };
      addAssessmentStreamClient(companyId, client);
      const keepAlive = setInterval(() => {
        try {
          res.write(`event: ping\n`);
          res.write(`data: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
        } catch {}
      }, 25000);

      const cleanup = () => {
        try { clearInterval(keepAlive); } catch {}
        removeAssessmentStreamClient(companyId, client);
      };
      req.on("close", cleanup);
      req.on("error", cleanup);
      return;
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error?.message || error) });
      return;
    }
  }

  if (req.method === "POST" && requestUrl.pathname === "/internal/marketing/worker/tick") {
    try {
      const secret = String(process.env.MARKETING_WORKER_CRON_SECRET || "").trim();
      const provided = String(requestUrl.searchParams.get("key") || "").trim();
      if (!secret || !provided || !timingSafeEqualString(secret, provided)) {
        sendJson(res, 403, { ok: false, error: "Invalid cron key." });
        return;
      }

      const companyIdFilter = String(requestUrl.searchParams.get("company_id") || "").trim();
      const batchPerCampaign = Math.max(1, Math.min(50, Number(requestUrl.searchParams.get("batch_per_campaign") || 1)));
      let totalSent = 0;
      let companiesProcessed = 0;

      let campaigns = await supabaseTableFetch("marketing_campaigns", "?select=id,company_id,status&status=eq.active&limit=5000");
      campaigns = Array.isArray(campaigns) ? campaigns : [];
      const companyIds = Array.from(new Set(campaigns.map((row) => String(row?.company_id || "").trim()).filter(Boolean)));
      const filteredCompanyIds = companyIdFilter ? companyIds.filter((id) => id === companyIdFilter) : companyIds;
      if (!filteredCompanyIds.length) {
        sendJson(res, 200, {
          ok: true,
          result: { sent: 0, companiesProcessed: 0, skipped: "no_active_campaigns", batchPerCampaign }
        });
        return;
      }

      for (const companyId of filteredCompanyIds) {
        const users = await listCompanyUsers(companyId).catch(() => []);
        const actorUser =
          (Array.isArray(users) ? users : []).find((user) => String(user?.role || "").trim().toLowerCase() === "admin" && String(user?.email || "").trim()) ||
          (Array.isArray(users) ? users : []).find((user) => String(user?.email || "").trim()) ||
          null;
        if (!actorUser) continue;
        const actor = {
          id: String(actorUser.id || "").trim(),
          name: String(actorUser.name || "Marketing Bot").trim(),
          email: String(actorUser.email || "").trim(),
          role: String(actorUser.role || "admin").trim().toLowerCase() || "admin",
          companyId: String(companyId || "").trim()
        };
        if (!actor.id || !actor.companyId || !actor.email) continue;
        const result = await processMarketingWorkerTickForActor(actor, { batchPerCampaign });
        totalSent += Number(result?.sent || 0);
        companiesProcessed += 1;
      }

      sendJson(res, 200, { ok: true, result: { sent: totalSent, companiesProcessed, batchPerCampaign } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "")) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "index.html"));
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/auth/verify-email") {
    const token = String(requestUrl.searchParams.get("token") || "").trim();
    const payload = readSignedEmailVerifyToken(token);
    if (!payload) {
      sendText(req, res, 400, "Invalid or expired verification link.");
      return;
    }
    try {
      await verifyUserEmail({
        userId: String(payload.userId || "").trim(),
        companyId: String(payload.companyId || "").trim(),
        email: String(payload.email || "").trim()
      });
      await writeAuditLogSafe({
        companyId: String(payload.companyId || "").trim(),
        actorUserId: String(payload.userId || "").trim(),
        actorEmail: String(payload.email || "").trim(),
        actorName: String(payload.email || "").trim(),
        action: "email_verified",
        module: "auth",
        entity: "user",
        entityId: String(payload.userId || "").trim(),
        detail: "Email verification completed"
      });
      const body = `<!doctype html><html><head><meta charset="utf-8"/><title>Email Verified</title></head><body style="font-family:Arial,sans-serif;padding:24px;"><h2>Email verified successfully</h2><p>Your RecruitDesk AI account is now activated.</p><p>You can close this tab and login in the app.</p></body></html>`;
      sendText(req, res, 200, body, "text/html; charset=utf-8");
    } catch (error) {
      sendText(req, res, 400, `Verification failed: ${escapeHtml(String(error?.message || error))}`);
    }
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/quick-capture" || requestUrl.pathname === "/quick-capture/")) {
    serveStaticFile(res, path.join(QUICK_CAPTURE_PUBLIC_DIR, "index.html"));
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/portal" || requestUrl.pathname === "/portal/")) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "portal-app", "index.html"));
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/portal-app" || requestUrl.pathname === "/portal-app/")) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "portal-app", "index.html"));
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/upgrade" || requestUrl.pathname === "/upgrade/")) {
    const token = String(requestUrl.searchParams.get("token") || "").trim();
    const payload = readSignedUpgradeToken(token);
    if (!payload) {
      sendText(req, res, 403, "Invalid or expired upgrade link.");
      return;
    }
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "upgrade.html"));
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/upgrade/context") {
    try {
      const token = String(requestUrl.searchParams.get("token") || "").trim();
      const payload = readSignedUpgradeToken(token);
      if (!payload) throw new Error("Invalid or expired upgrade link.");
      sendJson(res, 200, {
        ok: true,
        result: {
          planCode: String(payload.planCode || "").trim(),
          companyId: String(payload.companyId || "").trim(),
          email: String(payload.email || "").trim(),
          source: String(payload.source || "extension").trim(),
          expiresAt: payload.expiresAt || null,
          razorpayEnabled: isRazorpayConfigured()
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/upgrade/create-order") {
    try {
      const body = await readJsonBody(req);
      const token = String(body.token || "").trim();
      const payload = readSignedUpgradeToken(token);
      if (!payload) throw new Error("Invalid or expired upgrade link.");
      if (!isRazorpayConfigured()) throw new Error("Razorpay is not configured.");
      const planCode = String(payload.planCode || "").trim();
      const amountInr = Number(UPGRADE_PLAN_AMOUNT_INR[planCode] || 0);
      if (!amountInr) throw new Error("Invalid plan amount.");
      const receipt = `rd_${String(payload.companyId || "").slice(0, 8)}_${Date.now()}`;
      const order = await createRazorpayOrder({
        amountInr,
        receipt,
        notes: {
          companyId: String(payload.companyId || "").trim(),
          planCode,
          source: "upgrade_link"
        }
      });
      sendJson(res, 200, {
        ok: true,
        result: {
          orderId: String(order.id || "").trim(),
          amount: Number(order.amount || 0),
          currency: String(order.currency || "INR").trim(),
          keyId: String(process.env.RAZORPAY_KEY_ID || "").trim(),
          companyId: String(payload.companyId || "").trim(),
          planCode
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/upgrade/verify-payment") {
    try {
      const body = await readJsonBody(req);
      const token = String(body.token || "").trim();
      const payload = readSignedUpgradeToken(token);
      if (!payload) throw new Error("Invalid or expired upgrade link.");
      const orderId = String(body.razorpay_order_id || "").trim();
      const paymentId = String(body.razorpay_payment_id || "").trim();
      const signature = String(body.razorpay_signature || "").trim();
      if (!orderId || !paymentId || !signature) throw new Error("Missing payment verification fields.");
      const keySecret = String(process.env.RAZORPAY_KEY_SECRET || "").trim();
      if (!keySecret) throw new Error("Razorpay is not configured.");
      const signedPayload = `${orderId}|${paymentId}`;
      const expected = crypto.createHmac("sha256", keySecret).update(signedPayload).digest("hex");
      if (!timingSafeEqualString(signature, expected)) {
        throw new Error("Payment signature verification failed.");
      }

      const companyId = String(payload.companyId || "").trim();
      const planCode = String(payload.planCode || "").trim();
      const license = await getCompanyLicense(companyId).catch(() => null);
      const users = await listCompanyUsers(companyId).catch(() => []);
      const tokenUserId = String(payload.userId || "").trim();
      const ownerAdminUserId = String(license?.ownerAdminUserId || "").trim();
      const adminUserIds = (users || [])
        .filter((item) => String(item?.role || "").trim().toLowerCase() === "admin")
        .map((item) => String(item?.id || "").trim())
        .filter(Boolean);
      const anyUserIds = (users || [])
        .map((item) => String(item?.id || "").trim())
        .filter(Boolean);

      const actorCandidates = Array.from(
        new Set([tokenUserId, ownerAdminUserId, ...adminUserIds, ...anyUserIds].filter(Boolean))
      );
      if (!actorCandidates.length) {
        throw new Error("Could not identify any company user for plan activation.");
      }

      let upgraded = null;
      let lastActivationError = null;
      for (const actorUserId of actorCandidates) {
        try {
          upgraded = await setCompanyExtensionPlan({
            actorUserId,
            companyId,
            planCode,
            paidAt: new Date().toISOString(),
            months: 1,
            paymentOrderId: orderId,
            paymentId,
            paymentSignature: signature
          });
          lastActivationError = null;
          break;
        } catch (error) {
          lastActivationError = error;
        }
      }
      if (!upgraded) {
        throw new Error(
          `Payment verified but plan activation failed. ${String(lastActivationError?.message || "No eligible admin actor found.")}`
        );
      }
      try {
        const adminEmails = (users || [])
          .filter((item) => String(item?.role || "").trim().toLowerCase() === "admin")
          .map((item) => String(item?.email || "").trim())
          .filter(Boolean);
        const to = String(payload.email || "").trim() || adminEmails[0] || "";
        const cc = adminEmails.filter((email) => email && email !== to).join(",");
        if (to) {
          const companyName = String(users?.[0]?.companyName || "").trim();
          const purchaseMail = buildPlanPurchaseMail({
            companyName,
            planCode,
            subscriptionEndsAt: String(upgraded?.subscriptionEndsAt || "").trim()
          });
          await sendPlatformTransactionalMail({
            to,
            cc,
            subject: purchaseMail.subject,
            html: purchaseMail.html,
            text: purchaseMail.text
          });
        }
      } catch (error) {
        console.log("[mail] plan purchase mail failed:", String(error?.message || error));
      }
      sendJson(res, 200, { ok: true, result: { activated: true, license: upgraded } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && (
    requestUrl.pathname === "/client-portal" ||
    requestUrl.pathname === "/client-portal/" ||
    requestUrl.pathname === "/client-login" ||
    requestUrl.pathname === "/client-login/" ||
    requestUrl.pathname === "/client" ||
    requestUrl.pathname === "/client/"
  )) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "portal-app", "index.html"));
    return;
  }

  if (req.method === "GET" && (
    requestUrl.pathname === "/employee-portal" ||
    requestUrl.pathname === "/employee-portal/" ||
    requestUrl.pathname === "/employee-login" ||
    requestUrl.pathname === "/employee-login/" ||
    requestUrl.pathname === "/employee" ||
    requestUrl.pathname === "/employee/"
  )) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "portal-app", "index.html"));
    return;
  }

  if (req.method === "GET" && (
    requestUrl.pathname === "/payroll" ||
    requestUrl.pathname === "/payroll/" ||
    requestUrl.pathname === "/payroll-login" ||
    requestUrl.pathname === "/payroll-login/" ||
    requestUrl.pathname.startsWith("/payroll/")
  )) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "portal-app", "index.html"));
    return;
  }

  if (req.method === "GET" && (
    requestUrl.pathname === "/marketing" ||
    requestUrl.pathname === "/marketing/" ||
    requestUrl.pathname === "/marketing-module" ||
    requestUrl.pathname === "/marketing-module/" ||
    requestUrl.pathname.startsWith("/marketing/")
  )) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "portal-app", "index.html"));
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/apply" || requestUrl.pathname === "/apply/")) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "apply.html"));
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/apply-public" || requestUrl.pathname === "/apply-public/")) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "apply.html"));
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/shared/candidate") {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "candidate.html"));
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/shared/candidate/data") {
    try {
      const token = String(requestUrl.searchParams.get("token") || "").trim();
      const payload = readSignedCandidateShareToken(token);
      if (!payload) throw new Error("Invalid or expired candidate share link.");
      const candidateId = String(payload.candidateId || "").trim();
      const companyId = String(payload.companyId || "").trim();
      if (!candidateId || !companyId) throw new Error("Invalid share token payload.");
      const candidate = (await listCandidates({ id: candidateId, companyId, limit: 1 }))[0] || null;
      if (!candidate) throw new Error("Candidate not found.");

      const assessmentId = String(candidate?.assessment_id || "").trim();
      const assessment = assessmentId ? await getAssessmentById({ companyId, assessmentId }).catch(() => null) : null;

      // If CV exists, generate a short-lived download link via existing CV share token mechanism.
      const meta = candidate ? decodeApplicantMetadata(candidate) : {};
      const cachedStoredFile = meta?.cvAnalysisCache?.storedFile && typeof meta.cvAnalysisCache.storedFile === "object"
        ? meta.cvAnalysisCache.storedFile
        : null;
      const fileProvider = meta.fileProvider || cachedStoredFile?.provider || "";
      const fileKey = meta.fileKey || cachedStoredFile?.key || "";
      const fileUrl = meta.fileUrl || cachedStoredFile?.url || "";
      const filename = meta.filename || cachedStoredFile?.filename || "resume.pdf";
      const mimeType = meta.mimeType || cachedStoredFile?.mimeType || "application/octet-stream";
      let cvShareUrl = "";
      if (fileProvider || fileKey || fileUrl) {
        const sharedSettings = await getCompanySharedExportPresets(companyId).catch(() => ({}));
        const resumeFormatting = sharedSettings?.resumeFormatting && typeof sharedSettings.resumeFormatting === "object"
          ? sharedSettings.resumeFormatting
          : {};
        const profile = buildSharedCandidateProfile({ candidate, assessment });
        const roleForHeader = String(
          profile?.jdTitle
          || profile?.currentDesignation
          || ""
        ).trim();
        const headerValues = {
          candidate_name: String(profile?.candidateName || candidate?.name || "").trim(),
          target_role: roleForHeader,
          current_designation: String(profile?.currentDesignation || "").trim(),
          email: String(profile?.email || candidate?.email || "").trim(),
          phone: String(profile?.phone || candidate?.phone || "").trim(),
          location: String(profile?.location || candidate?.location || "").trim(),
          notice_period: String(profile?.noticePeriod || candidate?.notice_period || "").trim(),
          total_experience: String(profile?.totalExperience || candidate?.experience || "").trim(),
          current_company: String(profile?.currentCompany || candidate?.company || "").trim()
        };
        const requestedHeaderLine = buildResumeHeaderLineFromValues(headerValues, resumeFormatting)
          || buildResumeHeaderLineFromCandidate(candidate || {}, resumeFormatting);
        const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
        const cvToken = createSignedCvShareToken({
          type: "shared_cv",
          companyId,
          candidateId: String(candidate?.id || candidateId || "").trim(),
          candidateName: String(profile?.candidateName || candidate?.name || "").trim(),
          headerLine: requestedHeaderLine,
          headerValues,
          companyName: String(candidate?.company_name || candidate?.companyName || "Your Company").trim() || "Your Company",
          branded: Boolean(
            assessment?.shareBrandedCv
            || assessment?.share_branded_cv
            || candidate?.shareBrandedCv
            || candidate?.share_branded_cv
          ),
          fileProvider,
          fileKey,
          fileUrl,
          filename,
          mimeType,
          expiresAt
        });
        const baseUrl = getRequestBaseUrl(req);
        cvShareUrl = `${baseUrl}/shared/cv?token=${encodeURIComponent(cvToken)}`;
      }

      sendJson(res, 200, {
        ok: true,
        result: {
          profile: buildSharedCandidateProfile({ candidate, assessment }),
          cvShareUrl
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/apply/")) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "apply.html"));
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/apply-public/")) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "apply.html"));
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/jobs" || requestUrl.pathname === "/jobs/" || requestUrl.pathname.startsWith("/jobs/"))) {
    if (requestUrl.pathname.startsWith("/jobs/company/")) {
      serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "jobs-board.html"));
      return;
    }
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "apply.html"));
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/quick-capture/")) {
    const assetPath = requestUrl.pathname.replace(/^\/quick-capture\//, "");
    const safeRelativePath = path.normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const resolvedPath = path.join(QUICK_CAPTURE_PUBLIC_DIR, safeRelativePath);
    serveStaticFile(res, resolvedPath);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/portal-app/")) {
    const assetPath = requestUrl.pathname.replace(/^\/portal-app\//, "");
    const safeRelativePath = path.normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const resolvedPath = path.join(ROOT_PUBLIC_DIR, "portal-app", safeRelativePath);
    serveStaticFile(res, resolvedPath);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/public/jobs/")) {
    try {
      const jobId = String(requestUrl.pathname.replace(/^\/public\/jobs\//, "").replace(/\/+$/, "")).trim();
      if (!jobId) throw new Error("Job not found.");
      const job = await getPublicCompanyJob(jobId);
      const mode = String(requestUrl.searchParams.get("mode") || "").trim().toLowerCase();
      const isPublic = mode === "public" || mode === "anonymous";
      const sharedSettings = await getCompanySharedExportPresets(String(job?.companyId || "").trim()).catch(() => ({}));
      const boardSettings = sharedSettings?.jobBoard && typeof sharedSettings.jobBoard === "object" ? sharedSettings.jobBoard : {};

      const rawClientName = String(job.clientName || "").trim();
      const publicCompanyLine = String(
        job.publicCompanyLine
        || job.public_company_line
        || job.publicCompany
        || job.public_company
        || ""
      ).trim();
      const publicTitle = String(job.publicTitle || job.public_title || "").trim();

      const redactClientName = (text) => {
        const value = String(text || "");
        if (!isPublic) return value;
        if (!rawClientName) return value;
        try {
          const escaped = rawClientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return value.replace(new RegExp(escaped, "gi"), "Confidential Client");
        } catch {
          return value;
        }
      };

      sendJson(res, 200, {
        ok: true,
        result: {
          id: job.id,
          companyId: job.companyId,
          title: isPublic ? (publicTitle || redactClientName(job.title || "")) : (job.title || ""),
          clientName: isPublic ? "" : (job.clientName || ""),
          aboutCompany: isPublic ? (publicCompanyLine || "Confidential company") : (job.aboutCompany || ""),
          location: job.location || "",
          workMode: job.workMode || "",
          jobDescription: isPublic ? redactClientName(job.jobDescription || "") : (job.jobDescription || ""),
          mustHaveSkills: job.mustHaveSkills || "",
          redFlags: job.redFlags || "",
          jobApplyFields: Array.isArray(sharedSettings?.jobApplyFields) ? sharedSettings.jobApplyFields : [],
          jobBoard: boardSettings
        }
      });
    } catch (error) {
      sendJson(res, 404, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/public/") && !requestUrl.pathname.startsWith("/public/company-jobs/")) {
    const assetPath = requestUrl.pathname.replace(/^\/public\//, "");
    const safeRelativePath = path.normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const resolvedPath = path.join(ROOT_PUBLIC_DIR, safeRelativePath);
    serveStaticFile(res, resolvedPath);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    const authSummary = await listCompaniesAndUsersSummary();
    sendJson(res, 200, {
      ok: true,
      service: "recruiter-backend",
      version: "0.1.0",
      routes: [
        "/health",
        "/auth/bootstrap-admin",
        "/platform/login",
        "/platform/me",
        "/platform/companies",
        "/auth/login",
        "/auth/me",
        "/company/users",
        "/company/users/password",
        "/company/jds",
        "/company/assessments",
        "/company/dashboard",
        "/company/candidates/search-natural",
        "/quick-capture",
        "/parse-note",
        "/candidates",
        "/candidates/assign",
        "/contact-attempts",
        "/webhook",
        "/whatsapp/notes",
        "/parse-candidate",
        "/generate-questions"
      ],
      auth: {
        ...authSummary,
        platformLoginConfigured: Boolean(
          String(process.env.PLATFORM_COMPANY_CREATOR_EMAILS || "").trim() &&
          String(process.env.PLATFORM_COMPANY_CREATOR_PASSWORD || "").trim()
        )
      }
    });
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/webhook") {
    const mode = requestUrl.searchParams.get("hub.mode");
    const token = requestUrl.searchParams.get("hub.verify_token");
    const challenge = requestUrl.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token && token === WHATSAPP_VERIFY_TOKEN) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(challenge || "");
      return;
    }

    sendJson(res, 403, { ok: false, error: "Webhook verification failed." });
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/webhook") {
    try {
      const body = await readJsonBody(req);
      const messages = extractIncomingWhatsAppMessages(body).filter((item) => item.type === "text" && item.text);
      const processed = [];

      for (const message of messages) {
        const saved = await processIncomingWhatsappMessage(message, {});
        processed.push(saved);

        try {
          await sendWhatsappConfirmation({
            to: message.from,
            message: `Saved note${saved?.name ? ` for ${saved.name}` : ""}. Action: ${saved?.action_items || "Noted"}.`
          });
        } catch {
          // Confirmation is optional. Storage success should not fail because reply send failed.
        }
      }

      sendJson(res, 200, {
        ok: true,
        result: {
          received: messages.length,
          processed: processed.length,
          notes: processed
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/whatsapp/notes") {
    try {
      const limit = Number(requestUrl.searchParams.get("limit") || 100);
      const notes = listWhatsappStructuredNotes(limit);
      sendJson(res, 200, { ok: true, result: { notes } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/auth/bootstrap-admin") {
    try {
      const body = await readJsonBody(req);
      const result = await bootstrapAdmin({
        companyName: String(body.companyName || "").trim(),
        adminName: String(body.adminName || "").trim(),
        email: String(body.email || "").trim(),
        password: String(body.password || "")
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && (requestUrl.pathname === "/platform/login" || req.url === "/platform/login")) {
    try {
      const body = await readJsonBody(req);
      const result = await loginPlatformCreator({
        email: String(body.email || "").trim(),
        password: String(body.password || "")
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/platform/me" || req.url === "/platform/me")) {
    try {
      const user = await requirePlatformSessionUser(getBearerToken(req));
      sendJson(res, 200, { ok: true, result: { user } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && (requestUrl.pathname === "/platform/companies" || req.url === "/platform/companies")) {
    try {
      const body = await readJsonBody(req);
      const platformSecret = getPlatformCreateCompanySecret(req, body);
      let platformActor = null;
      let platformSessionActor = null;
      try {
        platformActor = await requireSessionUser(getBearerToken(req));
      } catch {
        platformActor = null;
      }
      try {
        platformSessionActor = await getPlatformSessionUser(getBearerToken(req));
      } catch {
        platformSessionActor = null;
      }
      const result = await createCompanyWithAdmin({
        companyName: String(body.companyName || "").trim(),
        adminName: String(body.adminName || "").trim(),
        email: String(body.email || "").trim(),
        password: String(body.password || ""),
        platformSecret,
        actor: platformActor,
        platformActor: platformSessionActor
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      const message = String(error.message || error);
      let status = 400;
      if (/Login required/i.test(message)) status = 401;
      else if (
        /Company creation is locked|not in PLATFORM_COMPANY_CREATOR_EMAILS|Invalid or missing platform secret|Not allowed to create companies/i.test(
          message
        )
      ) {
        status = 403;
      }
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/auth/login") {
    let attemptedEmail = "";
    try {
      const body = await readJsonBody(req);
      attemptedEmail = String(body.email || "").trim();
      const result = await login({
        email: attemptedEmail,
        password: String(body.password || "")
      });
      // Global portal hard-gate removed: allow login for trial and extension plans.
      // Feature-level restrictions are enforced separately where needed.
      await maybeSendPlanExpiryReminder(result?.user?.companyId || "");
      await writeAuditLogSafe({
        companyId: String(result?.user?.companyId || "").trim(),
        actorUserId: String(result?.user?.id || "").trim(),
        actorEmail: String(result?.user?.email || "").trim(),
        actorName: String(result?.user?.name || "").trim(),
        action: "login_success",
        module: "auth",
        entity: "session",
        entityId: "",
        detail: "Recruiter login successful"
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      const message = String(error.message || error);
      const email = String(attemptedEmail || "").trim().toLowerCase();
      const userForCompany = email ? await getPortalUserByEmailForReset(email).catch(() => null) : null;
      await writeAuditLogSafe({
        companyId: String(userForCompany?.companyId || "").trim(),
        actorUserId: "",
        actorEmail: email,
        actorName: email,
        action: "login_failed",
        module: "auth",
        entity: "session",
        entityId: "",
        detail: message
      });
      sendJson(res, 400, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/auth/forgot-password") {
    try {
      const body = await readJsonBody(req);
      const email = String(body?.email || "").trim().toLowerCase();
      console.log("[auth][forgot-password] request received", { email });
      if (!email || !email.includes("@")) {
        sendJson(res, 200, {
          ok: true,
          result: { message: "If this email exists, a reset link has been sent." }
        });
        return;
      }

      const portalUser = await getPortalUserByEmailForReset(email).catch(() => null);
      if (portalUser?.id && portalUser?.companyId) {
        const token = createSignedPasswordResetToken({
          type: "password_reset",
          userId: String(portalUser.id || "").trim(),
          companyId: String(portalUser.companyId || "").trim(),
          email,
          expiresAt: Date.now() + 30 * 60 * 1000
        });
        const resetUrl = `${requestUrl.origin}/auth/reset-password?token=${encodeURIComponent(token)}`;
        const mail = buildPasswordResetMail({
          adminName: portalUser.name || "",
          resetUrl
        });
        await sendPlatformTransactionalMail({
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text
        }).catch((error) => {
          console.log("[mail] password reset mail failed:", String(error?.message || error));
        });
        console.log("[auth][forgot-password] processed", { email, foundUser: true });
        await writeAuditLogSafe({
          companyId: String(portalUser.companyId || "").trim(),
          actorUserId: String(portalUser.id || "").trim(),
          actorEmail: email,
          actorName: String(portalUser.name || email).trim(),
          action: "forgot_password_requested",
          module: "auth",
          entity: "user",
          entityId: String(portalUser.id || "").trim(),
          detail: "Password reset link generated"
        });
      }

      sendJson(res, 200, {
        ok: true,
        result: { message: "If this email exists, a reset link has been sent." }
      });
    } catch (error) {
      console.log("[auth][forgot-password] failed", String(error?.message || error));
      sendJson(res, 200, {
        ok: true,
        result: { message: "If this email exists, a reset link has been sent." }
      });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/auth/reset-password") {
    const token = String(requestUrl.searchParams.get("token") || "").trim();
    const payload = readSignedPasswordResetToken(token);
    const safeToken = escapeHtml(token);
    const expired = !payload;
    const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Reset Password</title><style>body{font-family:Arial,sans-serif;background:#f6f8fc;color:#0f172a;margin:0;padding:24px}.card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #dbe3f3;border-radius:12px;padding:20px}.title{font-size:22px;font-weight:700;margin:0 0 8px}.sub{font-size:14px;color:#475569;margin:0 0 16px}label{display:block;margin:10px 0 6px;font-weight:600}input{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:10px}button{margin-top:14px;background:#2563eb;color:#fff;border:0;border-radius:8px;padding:10px 14px;font-weight:700;cursor:pointer}.msg{margin-top:12px;font-size:14px}.ok{color:#166534}.err{color:#b91c1c}</style></head><body><div class="card"><h1 class="title">Reset password</h1><p class="sub">Set a new password for your RecruitDesk AI account.</p>${expired ? '<p class="msg err">Reset link is invalid or expired. Request a new link from extension login.</p>' : `<form method="POST" action="/auth/reset-password"><input type="hidden" name="token" value="${safeToken}"/><label>New password</label><input name="password" type="password" minlength="8" required placeholder="Minimum 8 characters"/><button type="submit">Update password</button></form>`}<div id="result" class="msg"></div></div></body></html>`;
    sendHtml(res, 200, html);
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/auth/reset-password") {
    try {
      const contentType = String(req.headers["content-type"] || "").toLowerCase();
      let token = "";
      let password = "";
      if (contentType.includes("application/json")) {
        const body = await readJsonBody(req);
        token = String(body?.token || "").trim();
        password = String(body?.password || "");
      } else {
        const raw = await readRawBody(req);
        const params = new URLSearchParams(raw);
        token = String(params.get("token") || "").trim();
        password = String(params.get("password") || "");
      }
      const payload = readSignedPasswordResetToken(token);
      if (!payload) throw new Error("Invalid or expired reset link.");
      await resetPortalUserPasswordByToken({
        userId: payload.userId,
        companyId: payload.companyId,
        email: payload.email,
        newPassword: password
      });
      await writeAuditLogSafe({
        companyId: String(payload.companyId || "").trim(),
        actorUserId: String(payload.userId || "").trim(),
        actorEmail: String(payload.email || "").trim(),
        actorName: String(payload.email || "").trim(),
        action: "password_reset_completed",
        module: "auth",
        entity: "user",
        entityId: String(payload.userId || "").trim(),
        detail: "Password reset successful"
      });
      if (String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
        sendJson(res, 200, { ok: true, result: { message: "Password reset successful." } });
      } else {
        sendHtml(res, 200, `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Password Updated</title><style>body{font-family:Arial,sans-serif;background:#f6f8fc;color:#0f172a;margin:0;padding:24px}.card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #dbe3f3;border-radius:12px;padding:20px}.ok{color:#166534;font-weight:700}</style></head><body><div class="card"><p class="ok">Password updated successfully. You can now login from extension.</p></div></body></html>`);
      }
    } catch (error) {
      const message = String(error?.message || error);
      if (String(req.headers["content-type"] || "").toLowerCase().includes("application/json")) {
        sendJson(res, 400, { ok: false, error: message });
      } else {
        sendHtml(res, 400, `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Reset Failed</title><style>body{font-family:Arial,sans-serif;background:#f6f8fc;color:#0f172a;margin:0;padding:24px}.card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #dbe3f3;border-radius:12px;padding:20px}.err{color:#b91c1c;font-weight:700}</style></head><body><div class="card"><p class="err">${escapeHtml(message)}</p></div></body></html>`);
      }
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/webhook/mail-events/sendgrid") {
    try {
      const body = await readJsonBody(req);
      const events = Array.isArray(body) ? body : [];
      let marked = 0;
      for (const event of events) {
        const type = String(event?.event || "").trim().toLowerCase();
        const email = String(event?.email || "").trim();
        if (["bounce", "blocked", "dropped", "spamreport", "invalid_email"].includes(type)) {
          if (markEmailBounced(email, `sendgrid:${type}`)) marked += 1;
        }
      }
      sendJson(res, 200, { ok: true, result: { received: events.length, marked } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/webhook/mail-events/postmark") {
    try {
      const body = await readJsonBody(req);
      const rawType = String(body?.Type || body?.RecordType || body?.type || "").trim().toLowerCase();
      const email = String(body?.Email || body?.Recipient || body?.email || "").trim();
      const isBounceLike = /bounce|dropped|blocked|spam/i.test(rawType);
      const marked = isBounceLike && markEmailBounced(email, `postmark:${rawType}`) ? 1 : 0;
      sendJson(res, 200, { ok: true, result: { marked } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/auth/trial-signup") {
    try {
      const body = await readJsonBody(req);
      console.log("[auth][trial-signup] request received", {
        email: String(body?.email || "").trim().toLowerCase(),
        companyName: String(body?.companyName || "").trim()
      });
      const created = await createTrialCompanyWithAdmin({
        companyName: String(body.companyName || "").trim(),
        adminName: String(body.adminName || "").trim(),
        email: String(body.email || "").trim(),
        password: String(body.password || "")
      });
      const verifyToken = createSignedEmailVerifyToken({
        type: "email_verify",
        userId: String(created?.user?.id || "").trim(),
        companyId: String(created?.company?.id || created?.user?.companyId || "").trim(),
        email: String(body.email || "").trim(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      });
      const verifyUrl = `${requestUrl.origin}/auth/verify-email?token=${encodeURIComponent(verifyToken)}`;
      const signupMail = buildSignupMail({
        companyName: String(body.companyName || "").trim(),
        adminName: String(body.adminName || "").trim(),
        verifyUrl
      });
      let mailSent = false;
      let mailError = "";
      try {
        await sendPlatformTransactionalMail({
          to: String(body.email || "").trim(),
          subject: signupMail.subject,
          html: signupMail.html,
          text: signupMail.text
        });
        mailSent = true;
      } catch (error) {
        mailError = String(error?.message || error || "Unknown mail error");
        console.log("[mail] trial signup mail failed:", mailError);
      }
      console.log("[auth][trial-signup] processed", {
        email: String(body?.email || "").trim().toLowerCase(),
        mailSent,
        mailError: mailError || null
      });
      await writeAuditLogSafe({
        companyId: String(created?.company?.id || created?.user?.companyId || "").trim(),
        actorUserId: String(created?.user?.id || "").trim(),
        actorEmail: String(body.email || "").trim(),
        actorName: String(body.adminName || body.email || "").trim(),
        action: "signup_created",
        module: "auth",
        entity: "company",
        entityId: String(created?.company?.id || "").trim(),
        detail: "Trial signup created with pending email verification"
      });
      sendJson(res, 200, {
        ok: true,
        result: {
          pendingVerification: true,
          mailSent,
          mailError: mailError || null,
          message: mailSent
            ? "Verification email sent. Please verify email before login."
            : "Signup created, but verification email could not be sent. Please fix system mail and retry send verification.",
          email: String(body.email || "").trim()
        }
      });
    } catch (error) {
      console.log("[auth][trial-signup] failed", String(error?.message || error));
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/client-auth/login") {
    try {
      const body = await readJsonBody(req);
      const result = await loginClient({
        username: String(body.username || "").trim(),
        password: String(body.password || "")
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/payroll-auth/login") {
    try {
      const body = await readJsonBody(req);
      const result = await loginPayrollAdmin({
        email: String(body.email || "").trim(),
        password: String(body.password || "")
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && (req.url === "/employee-auth/login" || req.url === "/employer-auth/login")) {
    try {
      const body = await readJsonBody(req);
      const result = await loginEmployee({
        username: String(body.username || body.employeeCode || "").trim(),
        password: String(body.password || "")
      });
      // Guardrail: ensure the token we issue is immediately verifiable on this server.
      const probe = await getEmployeeSessionUser(result?.token || "");
      if (!probe) throw new Error("Employee token verification failed right after login.");
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/auth/me") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      sendJson(res, 200, { ok: true, result: { user } });
    } catch (error) {
      const message = String(error.message || error);
      sendJson(res, 401, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/license/me") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const license = await getCompanyLicense(user.companyId);
      await maybeSendPlanExpiryReminder(user.companyId);
      sendJson(res, 200, { ok: true, result: { license } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/client-auth/me") {
    try {
      const user = await requireClientSessionUser(getBearerToken(req));
      sendJson(res, 200, { ok: true, result: { user } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (requestUrl.pathname.startsWith("/company/marketing")) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      if (!isMarketingOwnerEmail(actor?.email)) {
        sendJson(res, 403, { ok: false, error: "Marketing module is restricted." });
        return;
      }
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error?.message || error) });
      return;
    }
  }

  if (req.method === "GET" && req.url === "/company/users") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const users = await listCompanyUsers(user.companyId);
      sendJson(res, 200, { ok: true, result: { companyId: user.companyId, users } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/users") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const createdUser = await createUser({
        actorUserId: actor.id,
        companyId: actor.companyId,
        name: String(body.name || "").trim(),
        email: String(body.email || "").trim(),
        phone: String(body.phone || "").trim(),
        password: String(body.password || ""),
        role: String(body.role || "team").trim()
      });
      sendJson(res, 200, { ok: true, result: createdUser });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && req.url === "/company/users") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await deleteUser({
        actorUserId: actor.id,
        companyId: actor.companyId,
        userId: String(body.userId || "").trim()
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/users/password") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await resetUserPassword({
        actorUserId: actor.id,
        companyId: actor.companyId,
        userId: String(body.userId || "").trim(),
        newPassword: String(body.newPassword || "")
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/client-users") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSuiteModulesAccess(actor, "Client module");
      const clientUsers = await getCompanyClientUsers(actor.companyId);
      sendJson(res, 200, { ok: true, result: { companyId: actor.companyId, clientUsers } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/client-users") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSuiteModulesAccess(actor, "Client module");
      const body = await readJsonBody(req);
      const createdUser = await createClientUser({
        actorUserId: actor.id,
        companyId: actor.companyId,
        username: String(body.username || "").trim(),
        password: String(body.password || ""),
        clientName: String(body.clientName || "").trim(),
        allowedPositions: Array.isArray(body.allowedPositions) ? body.allowedPositions : String(body.allowedPositions || "").split(/\r?\n|,/)
      });
      sendJson(res, 200, { ok: true, result: createdUser });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/client-users/password") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSuiteModulesAccess(actor, "Client module");
      const body = await readJsonBody(req);
      const result = await resetClientUserPassword({
        actorUserId: actor.id,
        companyId: actor.companyId,
        clientUserId: String(body.clientUserId || "").trim(),
        newPassword: String(body.newPassword || "")
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/marketing/overview") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const companyId = encodeURIComponent(String(actor.companyId || "").trim());
      const isAdmin = isAdminActor(actor);
      const ownerUserId = encodeURIComponent(String(actor.id || "").trim());
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const fromIso = dateFrom ? `${dateFrom}T00:00:00.000Z` : "";
      const toIso = dateTo ? `${dateTo}T23:59:59.999Z` : "";
      const queueDateFilters = [
        fromIso ? `updated_at=gte.${encodeURIComponent(fromIso)}` : "",
        toIso ? `updated_at=lte.${encodeURIComponent(toIso)}` : ""
      ].filter(Boolean).join("&");
      const eventDateFilters = [
        fromIso ? `event_at=gte.${encodeURIComponent(fromIso)}` : "",
        toIso ? `event_at=lte.${encodeURIComponent(toIso)}` : ""
      ].filter(Boolean).join("&");
      const campaigns = await supabaseTableFetch(
        "marketing_campaigns",
        `?select=id,status&company_id=eq.${companyId}${isAdmin ? "" : `&sender_user_id=eq.${ownerUserId}`}&limit=5000`
      );
      const campaignIds = (Array.isArray(campaigns) ? campaigns : []).map((item) => String(item?.id || "").trim()).filter(Boolean);
      const campaignInClause = campaignIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
      const [prospects, queue, events] = await Promise.all([
        supabaseTableFetch(
          "marketing_prospects",
          `?select=id,status&company_id=eq.${companyId}${isAdmin ? "" : `&created_by=eq.${ownerUserId}`}&source=neq.db_campaign_only&limit=5000`
        ),
        campaignIds.length
          ? supabaseTableFetch("marketing_campaign_prospects", `?select=id,state&company_id=eq.${companyId}&campaign_id=in.(${campaignInClause})${queueDateFilters ? `&${queueDateFilters}` : ""}&limit=5000`)
          : [],
        campaignIds.length
          ? supabaseTableFetch("marketing_message_events", `?select=id,event_type&company_id=eq.${companyId}&campaign_id=in.(${campaignInClause})${eventDateFilters ? `&${eventDateFilters}` : ""}&limit=5000`)
          : []
      ]);
      const summarize = (rows = [], key = "status") => (Array.isArray(rows) ? rows : []).reduce((acc, item) => {
        const label = String(item?.[key] || "unknown").trim().toLowerCase() || "unknown";
        acc[label] = Number(acc[label] || 0) + 1;
        return acc;
      }, {});
      sendJson(res, 200, {
        ok: true,
        result: {
          prospects: { total: Array.isArray(prospects) ? prospects.length : 0, byStatus: summarize(prospects, "status") },
          campaigns: { total: Array.isArray(campaigns) ? campaigns.length : 0, byStatus: summarize(campaigns, "status") },
          queue: { total: Array.isArray(queue) ? queue.length : 0, byStatus: summarize(queue, "state") },
          events: { total: Array.isArray(events) ? events.length : 0, byType: summarize(events, "event_type") },
          dateFilter: { dateFrom, dateTo }
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/marketing/prospects") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const companyId = encodeURIComponent(String(actor.companyId || "").trim());
      const limit = Math.max(1, Math.min(100, Number(requestUrl.searchParams.get("limit") || 100)));
      const page = Math.max(1, Number(requestUrl.searchParams.get("page") || 1));
      const offset = (page - 1) * limit;
      const q = String(requestUrl.searchParams.get("q") || "").trim().toLowerCase();
      const categoryFilter = String(requestUrl.searchParams.get("category") || "").trim().toLowerCase();
      const rows = await supabaseTableFetch(
        "marketing_prospects",
        `?select=id,name,email,phone,company_name,designation,category,categories,status,updated_at,source&company_id=eq.${companyId}${buildMarketingOwnerFilter(actor, "created_by")}&source=neq.db_campaign_only&order=updated_at.desc&limit=5000`
      );
      const filtered = (Array.isArray(rows) ? rows : []).filter((item) => {
        if (categoryFilter) {
          const currentCategory = String(item?.category || "").trim().toLowerCase();
          if (currentCategory !== categoryFilter) return false;
        }
        if (!q) return true;
        const hay = `${item?.name || ""} ${item?.email || ""} ${item?.company_name || ""} ${item?.designation || ""} ${item?.category || ""}`.toLowerCase();
        return hay.includes(q);
      });
      const total = filtered.length;
      const items = filtered.slice(offset, offset + limit);
      sendJson(res, 200, {
        ok: true,
        result: {
          items,
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          hasMore: (offset + items.length) < total
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "PATCH" && req.url === "/company/users") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await updateUserProfile({
        actorUserId: actor.id,
        companyId: actor.companyId,
        userId: String(body.userId || "").trim(),
        role: String(body.role || "").trim(),
        phone: body.phone
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/marketing/prospects") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const now = toIsoNow();
      const item = {
        id: crypto.randomUUID(),
        company_id: actor.companyId,
        name: String(body.name || "").trim(),
        email: normalizeMarketingEmail(body.email),
        phone: String(body.phone || "").trim(),
        company_name: String(body.companyName || body.company_name || "").trim(),
        designation: String(body.designation || "").trim(),
        category: String(body.category || "").trim(),
        categories: normalizeMarketingCategories(body.categories || body.category || ""),
        source: String(body.source || "manual").trim() || "manual",
        status: "active",
        tags: Array.isArray(body.tags) ? body.tags : [],
        notes: String(body.notes || "").trim(),
        created_by: actor.id,
        created_at: now,
        updated_at: now
      };
      if (!item.name || !item.email) throw new Error("Name and email are required.");
      const existingRows = await supabaseTableFetch(
        "marketing_prospects",
        `?select=id,name,email&company_id=eq.${encodeURIComponent(actor.companyId)}&email=eq.${encodeURIComponent(item.email)}${buildMarketingOwnerFilter(actor, "created_by")}&limit=1`
      ).catch(() => []);
      if (Array.isArray(existingRows) && existingRows.length) {
        throw new Error("Prospect already exists for this email. Use existing record or attach it to a campaign.");
      }
      const saved = await supabaseTableFetch("marketing_prospects", "?select=*", { method: "POST", body: item, prefer: "return=representation" });
      sendJson(res, 200, { ok: true, result: (Array.isArray(saved) ? saved[0] : saved) || item });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "PATCH" && /^\/company\/marketing\/prospects\/[^/]+$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const prospectId = String(requestUrl.pathname.replace(/^\/company\/marketing\/prospects\//, "")).trim();
      if (!prospectId) throw new Error("Prospect id is required.");
      const body = await readJsonBody(req);
      const patch = {
        name: String(body.name || "").trim() || undefined,
        email: body.email !== undefined ? normalizeMarketingEmail(body.email) : undefined,
        phone: body.phone !== undefined ? String(body.phone || "").trim() : undefined,
        company_name: body.companyName !== undefined || body.company_name !== undefined ? String(body.companyName || body.company_name || "").trim() : undefined,
        designation: body.designation !== undefined ? String(body.designation || "").trim() : undefined,
        category: body.category !== undefined ? String(body.category || "").trim() : undefined,
        categories: body.categories !== undefined ? normalizeMarketingCategories(body.categories) : undefined,
        status: body.status !== undefined ? String(body.status || "").trim() : undefined,
        notes: body.notes !== undefined ? String(body.notes || "").trim() : undefined,
        updated_at: toIsoNow()
      };
      Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);
      if (!Object.keys(patch).length) throw new Error("Nothing to update.");
      const updated = await supabaseTableFetch(
        "marketing_prospects",
        `?id=eq.${encodeURIComponent(prospectId)}&company_id=eq.${encodeURIComponent(actor.companyId)}${buildMarketingOwnerFilter(actor, "created_by")}&select=*`,
        { method: "PATCH", body: patch, prefer: "return=representation" }
      );
      sendJson(res, 200, { ok: true, result: Array.isArray(updated) && updated.length ? updated[0] : null });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && /^\/company\/marketing\/prospects\/[^/]+$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const prospectId = String(requestUrl.pathname.replace(/^\/company\/marketing\/prospects\//, "")).trim();
      if (!prospectId) throw new Error("Prospect id is required.");
      await supabaseTableFetch(
        "marketing_campaign_prospects",
        `?prospect_id=eq.${encodeURIComponent(prospectId)}&company_id=eq.${encodeURIComponent(actor.companyId)}&select=id`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      await supabaseTableFetch(
        "marketing_message_events",
        `?prospect_id=eq.${encodeURIComponent(prospectId)}&company_id=eq.${encodeURIComponent(actor.companyId)}&select=id`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      await supabaseTableFetch(
        "marketing_prospects",
        `?id=eq.${encodeURIComponent(prospectId)}&company_id=eq.${encodeURIComponent(actor.companyId)}${buildMarketingOwnerFilter(actor, "created_by")}&select=id`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      sendJson(res, 200, { ok: true, result: { deleted: true } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/marketing/prospects/import") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const filename = String(body.filename || "").trim().toLowerCase();
      const fileData = String(body.fileData || "").trim();
      const mode = String(body.mode || "commit").trim().toLowerCase();
      const importAction = String(body.importAction || "new_only").trim().toLowerCase();
      const campaignId = String(body.campaignId || "").trim();
      const includeExistingForCampaign = Boolean(body.includeExistingForCampaign) || importAction === "new_and_use_existing";
      const rows = fileData
        ? parseMarketingSpreadsheetBase64(fileData, filename)
        : parseMarketingCsv(String(body.csv || ""));
      if (!rows.length) throw new Error("CSV content is empty.");
      const now = toIsoNow();
      const normalizedRowsRaw = rows
        .map((row) => {
          const nameValue = pickMarketingRowValue(row, [
            "name",
            "full name",
            "candidate name",
            "prospect name",
            "contact name"
          ]);
          const emailValue = pickMarketingRowValue(row, [
            "email",
            "email id",
            "email address",
            "mail",
            "work email"
          ]);
          const phoneValue = pickMarketingRowValue(row, [
            "phone",
            "mobile",
            "mobile number",
            "phone number",
            "contact number",
            "whatsapp",
            "whatsapp number"
          ]);
          const companyValue = pickMarketingRowValue(row, [
            "company",
            "company name",
            "organization",
            "organisation",
            "current company"
          ]);
          const designationValue = pickMarketingRowValue(row, [
            "designation",
            "role",
            "title",
            "job title",
            "current designation"
          ]);
          const categoryValue = pickMarketingRowValue(row, [
            "category",
            "segment",
            "vertical",
            "industry",
            "function"
          ]);
          const categoriesValue = pickMarketingRowValue(row, [
            "categories",
            "category list",
            "segments",
            "segment list",
            "tags"
          ]);
          return {
            name: String(nameValue || "").trim(),
            email: normalizeMarketingEmail(emailValue || ""),
            phone: String(phoneValue || "").trim(),
            company_name: String(companyValue || "").trim(),
            designation: String(designationValue || "").trim(),
            category: String(categoryValue || "").trim(),
            categories: normalizeMarketingCategories(categoriesValue || categoryValue || ""),
            source: "csv_import",
            status: "active",
            tags: [],
            notes: "",
            created_by: actor.id
          };
        });
      const normalizedRows = normalizedRowsRaw.filter((item) => item.name && item.email);
      const invalidRows = Math.max(0, normalizedRowsRaw.length - normalizedRows.length);
      if (!normalizedRows.length) throw new Error("No valid rows found (need name + email).");

      // Deduplicate within upload by email (latest row wins).
      const byEmail = new Map();
      normalizedRows.forEach((item) => byEmail.set(String(item.email || "").toLowerCase(), item));
      const dedupedRows = Array.from(byEmail.values());
      const emailKeys = Array.from(byEmail.keys()).filter(Boolean);

      // Pre-read existing emails to support preview and campaign attach decisions.
      const existingByEmail = new Map();
      if (emailKeys.length) {
        const companyId = encodeURIComponent(String(actor.companyId || "").trim());
        const inClause = emailKeys.map((email) => `"${String(email || "").replace(/"/g, "")}"`).join(",");
        const existingRows = await supabaseTableFetch(
          "marketing_prospects",
          `?select=id,name,email&company_id=eq.${companyId}&email=in.(${inClause})&limit=5000`
        ).catch(() => []);
        (Array.isArray(existingRows) ? existingRows : []).forEach((row) => {
          const existingEmail = String(row?.email || "").trim().toLowerCase();
          if (existingEmail) existingByEmail.set(existingEmail, row);
        });
      }
      const existingEmailSet = new Set(Array.from(existingByEmail.keys()));
      const existingCount = emailKeys.filter((email) => existingEmailSet.has(email)).length;
      const newCount = Math.max(0, dedupedRows.length - existingCount);

      if (mode === "preview") {
        const duplicatePreview = dedupedRows
          .filter((item) => existingEmailSet.has(String(item.email || "").toLowerCase()))
          .slice(0, 20)
          .map((item) => {
            const email = String(item.email || "").toLowerCase();
            const existing = existingByEmail.get(email) || {};
            return {
              email: String(item.email || "").trim(),
              uploadName: String(item.name || "").trim(),
              existingId: String(existing?.id || "").trim(),
              existingName: String(existing?.name || "").trim()
            };
          });
        sendJson(res, 200, {
          ok: true,
          result: {
            totalRows: rows.length,
            validRows: normalizedRows.length,
            invalidRows,
            totalAccepted: dedupedRows.length,
            duplicateRowsCollapsed: Math.max(0, normalizedRows.length - dedupedRows.length),
            newCount,
            existingCount,
            duplicatePreview
          }
        });
        return;
      }

      const rowsToInsert = importAction === "new_and_use_existing"
        ? dedupedRows.filter((item) => !existingEmailSet.has(String(item.email || "").toLowerCase()))
        : dedupedRows.filter((item) => !existingEmailSet.has(String(item.email || "").toLowerCase()));
      const payload = rowsToInsert.map((item) => ({
        id: crypto.randomUUID(),
        company_id: actor.companyId,
        ...item,
        created_at: now,
        updated_at: now
      }));

      const saved = payload.length
        ? await supabaseTableFetch(
          "marketing_prospects",
          "?on_conflict=company_id,email&select=*",
          {
            method: "POST",
            body: payload,
            prefer: "resolution=merge-duplicates,return=representation"
          }
        )
        : [];
      const insertedRows = Array.isArray(saved) ? saved : [];
      const inserted = insertedRows.length;
      const updated = existingCount;

      let campaignLinked = 0;
      if (campaignId) {
        const attachIds = [];
        insertedRows.forEach((row) => {
          const id = String(row?.id || "").trim();
          if (id) attachIds.push(id);
        });
        if (includeExistingForCampaign) {
          existingByEmail.forEach((row) => {
            const id = String(row?.id || "").trim();
            if (id) attachIds.push(id);
          });
        }
        const uniqueAttachIds = Array.from(new Set(attachIds));
        if (uniqueAttachIds.length) {
          const links = uniqueAttachIds.map((prospectId) => ({
            id: crypto.randomUUID(),
            company_id: actor.companyId,
            campaign_id: campaignId,
            prospect_id: prospectId,
            state: "ready",
            created_at: now,
            updated_at: now
          }));
          const linked = await supabaseTableFetch("marketing_campaign_prospects", "?on_conflict=campaign_id,prospect_id&select=id", {
            method: "POST",
            body: links,
            prefer: "resolution=merge-duplicates,return=representation"
          }).catch(() => []);
          campaignLinked = Array.isArray(linked) ? linked.length : 0;
        }
      }
      sendJson(res, 200, {
        ok: true,
        result: {
          inserted,
          updated,
          totalAccepted: dedupedRows.length,
          invalidRows,
          newCount,
          existingCount,
          campaignLinked,
          duplicateRowsCollapsed: Math.max(0, normalizedRows.length - dedupedRows.length),
          saved: insertedRows.length
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/marketing/campaigns") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const companyId = encodeURIComponent(String(actor.companyId || "").trim());
      const items = await supabaseTableFetch("marketing_campaigns", `?select=id,name,category,status,sender_user_id,send_gap_minutes,daily_cap,updated_at,created_at&company_id=eq.${companyId}${buildMarketingOwnerFilter(actor, "sender_user_id")}&order=updated_at.desc&limit=100`);
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const fromIso = dateFrom ? `${dateFrom}T00:00:00.000Z` : "";
      const toIso = dateTo ? `${dateTo}T23:59:59.999Z` : "";
      const eventDateFilters = [
        fromIso ? `event_at=gte.${encodeURIComponent(fromIso)}` : "",
        toIso ? `event_at=lte.${encodeURIComponent(toIso)}` : ""
      ].filter(Boolean).join("&");
      const events = await supabaseTableFetch(
        "marketing_message_events",
        `?select=campaign_id,event_type&company_id=eq.${companyId}${eventDateFilters ? `&${eventDateFilters}` : ""}&limit=10000`
      ).catch(() => []);
      const byCampaign = {};
      (Array.isArray(events) ? events : []).forEach((row) => {
        const id = String(row?.campaign_id || "").trim();
        if (!id) return;
        const type = String(row?.event_type || "").trim().toLowerCase();
        if (!byCampaign[id]) byCampaign[id] = { sent: 0, bounced: 0, replies: 0, total: 0 };
        byCampaign[id].total += 1;
        if (type === "sent") byCampaign[id].sent += 1;
        if (type === "bounce" || type === "bounced" || type === "failed") byCampaign[id].bounced += 1;
        if (type === "reply" || type === "replied") byCampaign[id].replies += 1;
      });
      const nextItems = (Array.isArray(items) ? items : []).map((item) => ({
        ...item,
        stats: byCampaign[String(item?.id || "").trim()] || { sent: 0, bounced: 0, replies: 0, total: 0 }
      }));
      sendJson(res, 200, { ok: true, result: { items: nextItems, dateFilter: { dateFrom, dateTo } } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/marketing/campaigns") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const now = toIsoNow();
      const item = {
        id: crypto.randomUUID(),
        company_id: actor.companyId,
        name: String(body.name || "").trim(),
        category: String(body.category || "").trim(),
        status: "draft",
        sender_user_id: actor.id,
        send_gap_minutes: Math.max(1, Number(body.sendGapMinutes || 5)),
        daily_cap: Math.max(10, Number(body.dailyCap || 50)),
        created_at: now,
        updated_at: now
      };
      if (!item.name) throw new Error("Campaign name is required.");
      const saved = await supabaseTableFetch("marketing_campaigns", "?select=*", { method: "POST", body: item, prefer: "return=representation" });
      sendJson(res, 200, { ok: true, result: (Array.isArray(saved) ? saved[0] : saved) || item });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "PATCH" && /^\/company\/marketing\/campaigns\/[^/]+$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const campaignId = String(requestUrl.pathname.replace(/^\/company\/marketing\/campaigns\//, "")).trim();
      if (!campaignId) throw new Error("Campaign id is required.");
      const body = await readJsonBody(req);
      const patch = {
        name: body.name !== undefined ? String(body.name || "").trim() : undefined,
        category: body.category !== undefined ? String(body.category || "").trim() : undefined,
        status: body.status !== undefined ? String(body.status || "").trim() : undefined,
        send_gap_minutes: body.sendGapMinutes !== undefined ? Math.max(1, Number(body.sendGapMinutes || 5)) : undefined,
        daily_cap: body.dailyCap !== undefined ? Math.max(10, Number(body.dailyCap || 50)) : undefined,
        updated_at: toIsoNow()
      };
      Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);
      if (!Object.keys(patch).length) throw new Error("Nothing to update.");
      const updated = await supabaseTableFetch(
        "marketing_campaigns",
        `?id=eq.${encodeURIComponent(campaignId)}&company_id=eq.${encodeURIComponent(actor.companyId)}${buildMarketingOwnerFilter(actor, "sender_user_id")}&select=*`,
        { method: "PATCH", body: patch, prefer: "return=representation" }
      );
      sendJson(res, 200, { ok: true, result: Array.isArray(updated) && updated.length ? updated[0] : null });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && /^\/company\/marketing\/campaigns\/[^/]+$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const campaignId = String(requestUrl.pathname.replace(/^\/company\/marketing\/campaigns\//, "")).trim();
      if (!campaignId) throw new Error("Campaign id is required.");
      await supabaseTableFetch(
        "marketing_campaign_prospects",
        `?campaign_id=eq.${encodeURIComponent(campaignId)}&company_id=eq.${encodeURIComponent(actor.companyId)}&select=id`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      await supabaseTableFetch(
        "marketing_templates",
        `?campaign_id=eq.${encodeURIComponent(campaignId)}&company_id=eq.${encodeURIComponent(actor.companyId)}&select=id`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      await supabaseTableFetch(
        "marketing_message_events",
        `?campaign_id=eq.${encodeURIComponent(campaignId)}&company_id=eq.${encodeURIComponent(actor.companyId)}&select=id`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      await supabaseTableFetch(
        "marketing_campaigns",
        `?id=eq.${encodeURIComponent(campaignId)}&company_id=eq.${encodeURIComponent(actor.companyId)}${buildMarketingOwnerFilter(actor, "sender_user_id")}&select=id`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      sendJson(res, 200, { ok: true, result: { deleted: true } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && /^\/company\/marketing\/campaigns\/[^/]+\/prospects$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const campaignId = String(requestUrl.pathname.replace(/^\/company\/marketing\/campaigns\//, "").replace(/\/prospects$/, "")).trim();
      const campaignAccess = await getMarketingCampaignForActor(actor, campaignId);
      if (!campaignAccess) throw new Error("Campaign not found or not accessible.");
      const body = await readJsonBody(req);
      const prospectIds = Array.isArray(body.prospectIds) ? body.prospectIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
      if (!prospectIds.length) throw new Error("prospectIds required.");
      const uniqueProspectIds = Array.from(new Set(prospectIds));
      const now = toIsoNow();
      const links = uniqueProspectIds.map((prospectId) => ({
        id: crypto.randomUUID(),
        company_id: actor.companyId,
        campaign_id: campaignId,
        prospect_id: prospectId,
        state: "ready",
        created_at: now,
        updated_at: now
      }));
      const saved = await supabaseTableFetch("marketing_campaign_prospects", "?on_conflict=campaign_id,prospect_id&select=*", {
        method: "POST",
        body: links,
        prefer: "resolution=merge-duplicates,return=representation"
      });
      sendJson(res, 200, { ok: true, result: { linked: Array.isArray(saved) ? saved.length : 0 } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "GET" && /^\/company\/marketing\/campaigns\/[^/]+\/prospects$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const rawCampaignId = String(requestUrl.pathname.replace(/^\/company\/marketing\/campaigns\//, "").replace(/\/prospects$/, "")).trim();
      const campaignAccess = await getMarketingCampaignForActor(actor, rawCampaignId);
      if (!campaignAccess) throw new Error("Campaign not found or not accessible.");
      const campaignId = encodeURIComponent(rawCampaignId);
      const companyId = encodeURIComponent(String(actor.companyId || "").trim());
      const limit = Math.max(1, Math.min(100, Number(requestUrl.searchParams.get("limit") || 100)));
      const page = Math.max(1, Number(requestUrl.searchParams.get("page") || 1));
      const offset = (page - 1) * limit;
      const rows = await supabaseTableFetch(
        "marketing_campaign_prospects",
        `?select=id,state,last_sent_at,updated_at,prospect_id&company_id=eq.${companyId}&campaign_id=eq.${campaignId}&order=updated_at.desc&offset=${offset}&limit=${limit}`
      );
      const queueRows = Array.isArray(rows) ? rows : [];
      const prospectIds = Array.from(new Set(queueRows.map((row) => String(row?.prospect_id || "").trim()).filter(Boolean)));
      const prospectMap = new Map();
      if (prospectIds.length) {
        const inClause = prospectIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
        const prospects = await supabaseTableFetch(
          "marketing_prospects",
          `?select=id,name,email,phone,company_name,designation,category,categories,status&company_id=eq.${companyId}&id=in.(${inClause})&limit=100`
        );
        (Array.isArray(prospects) ? prospects : []).forEach((item) => {
          const id = String(item?.id || "").trim();
          if (!id) return;
          prospectMap.set(id, item);
        });
      }
      const items = queueRows.map((row) => ({
        id: row?.id,
        state: String(row?.state || "").trim(),
        lastSentAt: String(row?.last_sent_at || "").trim(),
        updatedAt: String(row?.updated_at || "").trim(),
        prospectId: String(row?.prospect_id || "").trim(),
        prospect: prospectMap.get(String(row?.prospect_id || "").trim()) || null
      }));
      sendJson(res, 200, { ok: true, result: { items, page, limit, hasMore: items.length >= limit } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "GET" && /^\/company\/marketing\/campaigns\/[^/]+\/template$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const rawCampaignId = String(requestUrl.pathname.replace(/^\/company\/marketing\/campaigns\//, "").replace(/\/template$/, "")).trim();
      const campaignAccess = await getMarketingCampaignForActor(actor, rawCampaignId);
      if (!campaignAccess) throw new Error("Campaign not found or not accessible.");
      const campaignId = encodeURIComponent(rawCampaignId);
      const companyId = encodeURIComponent(String(actor.companyId || "").trim());
      const rows = await supabaseTableFetch("marketing_templates", `?select=*&company_id=eq.${companyId}&campaign_id=eq.${campaignId}&limit=1`);
      const row = Array.isArray(rows) && rows.length ? normalizeMarketingTemplateRow(rows[0]) : null;
      sendJson(res, 200, { ok: true, result: row });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && /^\/company\/marketing\/campaigns\/[^/]+\/template$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const campaignId = String(requestUrl.pathname.replace(/^\/company\/marketing\/campaigns\//, "").replace(/\/template$/, "")).trim();
      const campaignAccess = await getMarketingCampaignForActor(actor, campaignId);
      if (!campaignAccess) throw new Error("Campaign not found or not accessible.");
      const body = await readJsonBody(req);
      const now = toIsoNow();
      const bodyTextClean = String(body.bodyText || body.body_text || "").trim();
      const attachment = sanitizeMarketingTemplateAttachment(body.attachment || null);
      const bodyWithAttachment = applyMarketingTemplateAttachment(bodyTextClean, attachment);
      const item = {
        id: crypto.randomUUID(),
        company_id: actor.companyId,
        campaign_id: campaignId,
        subject: String(body.subject || "").trim(),
        body_text: bodyWithAttachment,
        target_categories: normalizeMarketingCategories(body.targetCategories || body.target_categories || ""),
        updated_by: actor.id,
        created_at: now,
        updated_at: now
      };
      if (!item.subject || !bodyTextClean) throw new Error("Template subject and body are required.");
      const saved = await supabaseTableFetch("marketing_templates", "?on_conflict=campaign_id&select=*", {
        method: "POST",
        body: item,
        prefer: "resolution=merge-duplicates,return=representation"
      });
      const result = normalizeMarketingTemplateRow((Array.isArray(saved) ? saved[0] : saved) || item);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/marketing/templates") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const companyId = encodeURIComponent(String(actor.companyId || "").trim());
      const rows = await supabaseTableFetch("marketing_templates", `?select=id,campaign_id,subject,body_text,target_categories,updated_at,created_at,updated_by&company_id=eq.${companyId}${buildMarketingOwnerFilter(actor, "updated_by")}&order=updated_at.desc&limit=100`);
      const items = (Array.isArray(rows) ? rows : []).map((row) => normalizeMarketingTemplateRow(row));
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && /^\/company\/marketing\/campaigns\/[^/]+\/prospects$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const campaignId = String(requestUrl.pathname.replace(/^\/company\/marketing\/campaigns\//, "").replace(/\/prospects$/, "")).trim();
      const campaignAccess = await getMarketingCampaignForActor(actor, campaignId);
      if (!campaignAccess) throw new Error("Campaign not found or not accessible.");
      const body = await readJsonBody(req).catch(() => ({}));
      const scope = String(body?.scope || "ready_only").trim().toLowerCase();
      const stateFilter = scope === "all" ? "" : "&state=eq.ready";
      const rows = await supabaseTableFetch(
        "marketing_campaign_prospects",
        `?select=id&company_id=eq.${encodeURIComponent(actor.companyId)}&campaign_id=eq.${encodeURIComponent(campaignId)}${stateFilter}&limit=10000`
      );
      const count = Array.isArray(rows) ? rows.length : 0;
      if (!count) {
        sendJson(res, 200, { ok: true, result: { removed: 0, campaignId, scope } });
        return;
      }
      await supabaseTableFetch(
        "marketing_campaign_prospects",
        `?company_id=eq.${encodeURIComponent(actor.companyId)}&campaign_id=eq.${encodeURIComponent(campaignId)}${stateFilter}&select=id`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      sendJson(res, 200, { ok: true, result: { removed: count, campaignId, scope } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && requestUrl.pathname === "/company/marketing/queue") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req).catch(() => ({}));
      const scope = String(body?.scope || "paused_ready_only").trim().toLowerCase();
      const onlyPaused = scope !== "all_campaigns_all_states";
      const onlyReady = scope !== "all_campaigns_all_states" && scope !== "paused_all_states";
      const campaigns = await supabaseTableFetch(
        "marketing_campaigns",
        `?select=id,status&company_id=eq.${encodeURIComponent(actor.companyId)}${buildMarketingOwnerFilter(actor, "sender_user_id")}&limit=5000`
      );
      const scopedCampaigns = (Array.isArray(campaigns) ? campaigns : []).filter((item) => {
        if (!onlyPaused) return true;
        return String(item?.status || "").trim().toLowerCase() === "paused";
      });
      const campaignIds = scopedCampaigns.map((item) => String(item?.id || "").trim()).filter(Boolean);
      if (!campaignIds.length) {
        sendJson(res, 200, { ok: true, result: { removed: 0, scope } });
        return;
      }
      const inClause = campaignIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
      const stateFilter = onlyReady ? "&state=eq.ready" : "";
      const rows = await supabaseTableFetch(
        "marketing_campaign_prospects",
        `?select=id&company_id=eq.${encodeURIComponent(actor.companyId)}&campaign_id=in.(${inClause})${stateFilter}&limit=10000`
      );
      const count = Array.isArray(rows) ? rows.length : 0;
      if (!count) {
        sendJson(res, 200, { ok: true, result: { removed: 0, scope } });
        return;
      }
      await supabaseTableFetch(
        "marketing_campaign_prospects",
        `?company_id=eq.${encodeURIComponent(actor.companyId)}&campaign_id=in.(${inClause})${stateFilter}&select=id`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      sendJson(res, 200, { ok: true, result: { removed: count, scope } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && /^\/company\/marketing\/campaigns\/[^/]+\/attach-candidates$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const campaignId = String(requestUrl.pathname.replace(/^\/company\/marketing\/campaigns\//, "").replace(/\/attach-candidates$/, "")).trim();
      const campaignAccess = await getMarketingCampaignForActor(actor, campaignId);
      if (!campaignAccess) throw new Error("Campaign not found or not accessible.");
      const body = await readJsonBody(req);
      const candidateIds = Array.isArray(body.candidateIds) ? body.candidateIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
      if (!candidateIds.length) throw new Error("candidateIds required.");
      const uniqueCandidateIds = Array.from(new Set(candidateIds));

      const candidates = await listCandidatesForUser(actor, { limit: 5000, scope: "company" });
      const candidateById = new Map((Array.isArray(candidates) ? candidates : []).map((item) => [String(item?.id || "").trim(), item]));
      const picked = uniqueCandidateIds.map((id) => candidateById.get(id)).filter(Boolean);
      if (!picked.length) throw new Error("No accessible candidates found.");

      const normalized = picked
        .map((item) => ({
          candidateId: String(item?.id || "").trim(),
          name: String(item?.name || item?.candidateName || "").trim(),
          email: normalizeMarketingEmail(item?.email || ""),
          phone: String(item?.phone || item?.phoneNumber || "").trim(),
          company_name: String(item?.company || item?.currentCompany || "").trim(),
          designation: String(item?.role || item?.currentDesignation || item?.jdTitle || "").trim()
        }))
        .filter((item) => item.name && item.email);
      if (!normalized.length) throw new Error("No valid candidates found (name + email required).");

      const now = toIsoNow();
      const emailKeys = Array.from(new Set(normalized.map((item) => String(item.email || "").toLowerCase())));
      const companyId = encodeURIComponent(String(actor.companyId || "").trim());
      const ownerFilter = buildMarketingOwnerFilter(actor, "created_by");
      const existingByEmail = new Map();
      if (emailKeys.length) {
        const inClause = emailKeys.map((email) => `"${String(email || "").replace(/"/g, "")}"`).join(",");
        const rows = await supabaseTableFetch(
          "marketing_prospects",
          `?select=id,email,name,source&company_id=eq.${companyId}${ownerFilter}&email=in.(${inClause})&limit=5000`
        ).catch(() => []);
        (Array.isArray(rows) ? rows : []).forEach((row) => {
          const key = String(row?.email || "").trim().toLowerCase();
          if (key) existingByEmail.set(key, row);
        });
      }

      const createPayload = [];
      const attachProspectIds = [];
      let reusedExisting = 0;
      normalized.forEach((row) => {
        const key = String(row.email || "").toLowerCase();
        const existing = existingByEmail.get(key);
        if (existing?.id) {
          attachProspectIds.push(String(existing.id || "").trim());
          reusedExisting += 1;
          return;
        }
        const prospectId = crypto.randomUUID();
        createPayload.push({
          id: prospectId,
          company_id: actor.companyId,
          name: row.name,
          email: row.email,
          phone: row.phone,
          company_name: row.company_name,
          designation: row.designation,
          category: "",
          categories: [],
          source: "db_campaign_only",
          status: "active",
          tags: [`candidate_id:${row.candidateId}`],
          notes: "",
          created_by: actor.id,
          created_at: now,
          updated_at: now
        });
        attachProspectIds.push(prospectId);
      });

      if (createPayload.length) {
        await supabaseTableFetch("marketing_prospects", "?select=id", {
          method: "POST",
          body: createPayload,
          prefer: "resolution=merge-duplicates,return=minimal"
        });
      }

      const uniqueAttachIds = Array.from(new Set(attachProspectIds.filter(Boolean)));
      const links = uniqueAttachIds.map((prospectId) => ({
        id: crypto.randomUUID(),
        company_id: actor.companyId,
        campaign_id: campaignId,
        prospect_id: prospectId,
        state: "ready",
        created_at: now,
        updated_at: now
      }));
      const linked = links.length
        ? await supabaseTableFetch("marketing_campaign_prospects", "?on_conflict=campaign_id,prospect_id&select=id", {
          method: "POST",
          body: links,
          prefer: "resolution=merge-duplicates,return=representation"
        }).catch(() => [])
        : [];
      sendJson(res, 200, {
        ok: true,
        result: {
          selected: uniqueCandidateIds.length,
          valid: normalized.length,
          createdCampaignOnlyProspects: createPayload.length,
          reusedExistingProspects: reusedExisting,
          campaignLinked: Array.isArray(linked) ? linked.length : 0,
          attachProspectIds: uniqueAttachIds
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/marketing/templates/preview") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const subject = String(body.subject || "").trim();
      const bodyTextRaw = String(body.bodyText || body.body_text || "").trim();
      const bodyText = stripMarketingTemplateAttachment(bodyTextRaw).cleanBody;
      const prospectId = String(body.prospectId || "").trim();
      if (!subject && !bodyText) throw new Error("Template subject/body is required for preview.");

      let prospect = null;
      if (prospectId) {
        const rows = await supabaseTableFetch(
          "marketing_prospects",
          `?select=id,name,email,phone,company_name,designation,category,categories,status&company_id=eq.${encodeURIComponent(actor.companyId)}&id=eq.${encodeURIComponent(prospectId)}&limit=1`
        ).catch(() => []);
        prospect = Array.isArray(rows) && rows.length ? rows[0] : null;
      }
      if (!prospect) {
        prospect = {
          name: "Prospect Name",
          email: "prospect@example.com",
          phone: "9999999999",
          company_name: "Sample Company",
          designation: "Sample Role",
          category: "Sample Segment",
          categories: ["Sample Segment"]
        };
      }

      const renderedSubject = renderMarketingTemplate(subject, prospect, {
        senderName: String(actor?.name || "").trim(),
        senderEmail: String(actor?.email || "").trim()
      });
      const renderedBody = renderMarketingTemplate(bodyText, prospect, {
        senderName: String(actor?.name || "").trim(),
        senderEmail: String(actor?.email || "").trim()
      });
      const isHtml = /<[^>]+>/.test(renderedBody);
      sendJson(res, 200, {
        ok: true,
        result: {
          subject: renderedSubject,
          bodyHtml: isHtml ? renderedBody : escapeHtml(renderedBody).replace(/\n/g, "<br/>"),
          bodyText: isHtml ? stripHtmlForText(renderedBody) : renderedBody,
          previewProspect: prospect
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "PATCH" && /^\/company\/marketing\/templates\/[^/]+$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const templateId = String(requestUrl.pathname.replace(/^\/company\/marketing\/templates\//, "")).trim();
      if (!templateId) throw new Error("Template id is required.");
      const body = await readJsonBody(req);
      const currentRows = await supabaseTableFetch(
        "marketing_templates",
        `?id=eq.${encodeURIComponent(templateId)}&company_id=eq.${encodeURIComponent(actor.companyId)}&select=id,body_text&limit=1`
      );
      const currentTemplate = Array.isArray(currentRows) && currentRows.length ? currentRows[0] : null;
      if (!currentTemplate?.id) throw new Error("Template not found.");
      const currentParsed = stripMarketingTemplateAttachment(String(currentTemplate.body_text || ""));
      let nextAttachment = currentParsed.attachment;
      if (body.attachment !== undefined) {
        nextAttachment = sanitizeMarketingTemplateAttachment(body.attachment || null);
      }
      const bodyTextFromPatch = body.bodyText !== undefined ? String(body.bodyText || "").trim() : currentParsed.cleanBody;
      const patch = {
        campaign_id: body.campaignId !== undefined ? String(body.campaignId || "").trim() : undefined,
        subject: body.subject !== undefined ? String(body.subject || "").trim() : undefined,
        body_text: (body.bodyText !== undefined || body.attachment !== undefined) ? applyMarketingTemplateAttachment(bodyTextFromPatch, nextAttachment) : undefined,
        target_categories: body.targetCategories !== undefined ? normalizeMarketingCategories(body.targetCategories || "") : undefined,
        updated_at: toIsoNow(),
        updated_by: actor.id
      };
      Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);
      if (patch.campaign_id !== undefined && !patch.campaign_id) throw new Error("campaignId cannot be empty.");
      if (!Object.keys(patch).length) throw new Error("Nothing to update.");
      const updated = await supabaseTableFetch(
        "marketing_templates",
        `?id=eq.${encodeURIComponent(templateId)}&company_id=eq.${encodeURIComponent(actor.companyId)}&select=*`,
        { method: "PATCH", body: patch, prefer: "return=representation" }
      );
      sendJson(res, 200, { ok: true, result: normalizeMarketingTemplateRow(Array.isArray(updated) && updated.length ? updated[0] : null) });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && /^\/company\/marketing\/templates\/[^/]+$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const templateId = String(requestUrl.pathname.replace(/^\/company\/marketing\/templates\//, "")).trim();
      if (!templateId) throw new Error("Template id is required.");
      await supabaseTableFetch(
        "marketing_templates",
        `?id=eq.${encodeURIComponent(templateId)}&company_id=eq.${encodeURIComponent(actor.companyId)}&select=id`,
        { method: "DELETE", prefer: "return=minimal" }
      );
      sendJson(res, 200, { ok: true, result: { deleted: true } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && /^\/company\/marketing\/campaigns\/[^/]+\/(start|pause|resume)$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const action = String((requestUrl.pathname.match(/(start|pause|resume)$/) || [])[1] || "").trim();
      const campaignId = String(requestUrl.pathname.replace(/^\/company\/marketing\/campaigns\//, "").replace(/\/(start|pause|resume)$/, "")).trim();
      const campaignAccess = await getMarketingCampaignForActor(actor, campaignId);
      if (!campaignAccess) throw new Error("Campaign not found or not accessible.");
      const status = action === "pause" ? "paused" : action === "resume" ? "active" : "active";
      const updated = await supabaseTableFetch("marketing_campaigns", `?id=eq.${encodeURIComponent(campaignId)}&company_id=eq.${encodeURIComponent(actor.companyId)}&select=*`, {
        method: "PATCH",
        body: { status, updated_at: toIsoNow() },
        prefer: "return=representation"
      });
      sendJson(res, 200, { ok: true, result: Array.isArray(updated) && updated.length ? updated[0] : null });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && /^\/company\/marketing\/campaigns\/[^/]+\/followups$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const campaignId = String(requestUrl.pathname.replace(/^\/company\/marketing\/campaigns\//, "").replace(/\/followups$/, "")).trim();
      const campaignAccess = await getMarketingCampaignForActor(actor, campaignId);
      if (!campaignAccess) throw new Error("Campaign not found or not accessible.");
      const body = await readJsonBody(req);
      const waitDays = Math.max(1, Number(body.waitDays || 7));
      const maxFollowups = Math.max(1, Number(body.maxFollowups || 2));
      const companyId = encodeURIComponent(String(actor.companyId || "").trim());
      const cutoffMs = Date.now() - (waitDays * 24 * 60 * 60 * 1000);

      const queueRows = await supabaseTableFetch(
        "marketing_campaign_prospects",
        `?select=id,prospect_id,state,last_sent_at,updated_at&company_id=eq.${companyId}&campaign_id=eq.${encodeURIComponent(campaignId)}&state=eq.sent&limit=5000`
      );
      const candidateRows = Array.isArray(queueRows) ? queueRows : [];
      const prospectIds = Array.from(new Set(candidateRows.map((row) => String(row?.prospect_id || "").trim()).filter(Boolean)));
      const prospectStatusMap = new Map();
      if (prospectIds.length) {
        const inClause = prospectIds.map((id) => `"${id.replace(/"/g, "")}"`).join(",");
        const prospectRows = await supabaseTableFetch(
          "marketing_prospects",
          `?select=id,status&company_id=eq.${companyId}&id=in.(${inClause})&limit=5000`
        );
        (Array.isArray(prospectRows) ? prospectRows : []).forEach((row) => {
          const pid = String(row?.id || "").trim();
          if (!pid) return;
          prospectStatusMap.set(pid, String(row?.status || "").trim().toLowerCase());
        });
      }
      if (!candidateRows.length) {
        sendJson(res, 200, { ok: true, result: { queued: 0, examined: 0 } });
        return;
      }

      const events = await supabaseTableFetch(
        "marketing_message_events",
        `?select=prospect_id,event_type,event_at&company_id=eq.${companyId}&campaign_id=eq.${encodeURIComponent(campaignId)}&limit=10000`
      );
      const eventRows = Array.isArray(events) ? events : [];
      const eventMap = new Map();
      eventRows.forEach((row) => {
        const pid = String(row?.prospect_id || "").trim();
        if (!pid) return;
        if (!eventMap.has(pid)) eventMap.set(pid, []);
        eventMap.get(pid).push({
          type: String(row?.event_type || "").trim().toLowerCase(),
          at: String(row?.event_at || "").trim()
        });
      });

      const rowsToQueue = [];
      for (const row of candidateRows) {
        const pid = String(row?.prospect_id || "").trim();
        if (!pid) continue;
        const prospectStatus = String(prospectStatusMap.get(pid) || "").trim().toLowerCase();
        if (prospectStatus !== "active") continue;
        const lastSentAt = String(row?.last_sent_at || row?.updated_at || "").trim();
        const lastSentMs = lastSentAt ? Date.parse(lastSentAt) : NaN;
        if (!Number.isFinite(lastSentMs) || lastSentMs > cutoffMs) continue;
        const history = eventMap.get(pid) || [];
        const hasReply = history.some((item) => item.type === "reply" || item.type === "replied");
        const hasBounce = history.some((item) => item.type === "bounce" || item.type === "bounced" || item.type === "failed");
        const sentCount = history.filter((item) => item.type === "sent").length;
        if (hasReply || hasBounce) continue;
        if (sentCount >= (maxFollowups + 1)) continue;
        rowsToQueue.push(String(row?.id || "").trim());
      }

      let queued = 0;
      for (const rowId of rowsToQueue) {
        if (!rowId) continue;
        await supabaseTableFetch("marketing_campaign_prospects", `?id=eq.${encodeURIComponent(rowId)}&company_id=eq.${companyId}&select=*`, {
          method: "PATCH",
          body: { state: "ready", updated_at: toIsoNow() },
          prefer: "return=minimal"
        });
        queued += 1;
      }
      sendJson(res, 200, { ok: true, result: { queued, examined: candidateRows.length, waitDays, maxFollowups } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/marketing/worker/tick") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req).catch(() => ({}));
      const batchPerCampaign = Math.max(1, Math.min(50, Number(body?.batchPerCampaign || 1)));
      const result = await processMarketingWorkerTickForActor(actor, { batchPerCampaign });
      const sent = Number(result?.sent || 0);
      sendJson(res, 200, { ok: true, result: { sent, batchPerCampaign } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/jds") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const includeArchivedRaw = String(requestUrl.searchParams.get("includeArchived") || "").trim().toLowerCase();
      const includeArchived = includeArchivedRaw === "1" || includeArchivedRaw === "true" || includeArchivedRaw === "yes";
      const jobs = await listCompanyJobs(user.companyId, user.id, { includeArchived });
      const personalShortcuts = await getCompanyPersonalShortcuts({
        companyId: user.companyId,
        userId: user.id
      }).catch(() => ({}));
      sendJson(res, 200, { ok: true, result: { jobs, personalShortcuts } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/shared-export-presets") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const settings = await getCompanySharedExportPresets(user.companyId);
      sendJson(res, 200, { ok: true, result: settings });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/shared-export-presets") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const settings = await saveCompanySharedExportPresets({
        actorUserId: actor.id,
        companyId: actor.companyId,
        settings: body.settings || body,
        saveAsSuggestedGlobal: body?.saveAsSuggestedGlobal === true
      });
      sendJson(res, 200, { ok: true, result: settings });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/public/company-jobs/")) {
    try {
      const companySlug = String(requestUrl.pathname.replace(/^\/public\/company-jobs\//, "").replace(/\/+$/, "")).trim().toLowerCase();
      if (!companySlug) throw new Error("Company slug is required.");
      const displayMode = String(requestUrl.searchParams.get("mode") || "").trim().toLowerCase() === "client" ? "client" : "anonymous";
      const result = await getPublicCompanyJobsBySlug(companySlug);
      const sharedSettings = await getCompanySharedExportPresets(String(result?.companyId || "").trim()).catch(() => ({}));
      const boardSettings = sharedSettings?.jobBoard && typeof sharedSettings.jobBoard === "object" ? sharedSettings.jobBoard : {};
      const resumeSettings = sharedSettings?.resumeFormatting && typeof sharedSettings.resumeFormatting === "object" ? sharedSettings.resumeFormatting : {};
      const boardLogoDataUrl = String(boardSettings.logoDataUrl || resumeSettings.logoDataUrl || "").trim();
      const companyName = String(result?.companyName || "").trim();
      const formatBoardText = (template, fallback) => {
        const raw = String(template || "").trim();
        const source = raw && raw.toLowerCase() !== "jobs" ? raw : fallback;
        return String(source || fallback || "")
          .replace(/\{\{\s*company_name\s*\}\}/gi, companyName || "Company")
          .replace(/\{\s*company_name\s*\}/gi, companyName || "Company")
          .replace(/\[COMPANY NAME\]/gi, companyName || "Company")
          .trim();
      };
      const jobs = (Array.isArray(result?.jobs) ? result.jobs : []).map((job) => {
        const clientName = String(job?.clientName || job?.client_name || "").trim();
        const rawTitle = String(job?.title || "").trim();
        const redactClientName = (text) => {
          const value = String(text || "").trim();
          if (displayMode !== "anonymous" || !clientName) return value;
          try {
            const variants = Array.from(new Set([
              clientName,
              clientName.replace(/\.(ai|com|in|co|io)$/i, ""),
              clientName.split(/\s+/)[0] || ""
            ].map((item) => String(item || "").trim()).filter((item) => item.length >= 3)));
            let output = value;
            variants.forEach((variant) => {
              const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              output = output.replace(new RegExp(escaped, "gi"), "");
            });
            return output.replace(/\s{2,}/g, " ").replace(/\s+-\s+$/g, "").replace(/^\s+-\s+/g, "").replace(/\(\s*\)/g, "").trim();
          } catch {
            return value;
          }
        };
        const anonymousLine = String(
          job?.publicCompanyLine
          || job?.public_company_line
          || job?.aboutCompany
          || job?.about_company
          || "Confidential hiring partner"
        ).trim();
        return {
          id: String(job?.id || "").trim(),
          title: redactClientName(rawTitle) || String(job?.publicTitle || job?.public_title || rawTitle).trim(),
          companyLine: displayMode === "client" ? (clientName || anonymousLine) : anonymousLine,
          location: String(job?.location || "").trim(),
          workMode: String(job?.workMode || "").trim(),
          applyLink: `${getRequestBaseUrl(req)}/apply-public/${encodeURIComponent(String(job?.id || "").trim())}`,
          publicApplyLink: `${getRequestBaseUrl(req)}/apply-public/${encodeURIComponent(String(job?.id || "").trim())}`
        };
      }).filter((job) => job.id && job.title);
      sendJson(res, 200, {
        ok: true,
        result: {
          companyId: String(result?.companyId || "").trim(),
          companyName: String(result?.companyName || "").trim(),
          companySlug: String(result?.companySlug || companySlug).trim(),
          displayMode,
          logoDataUrl: boardLogoDataUrl,
          faviconDataUrl: String(boardSettings.faviconDataUrl || boardLogoDataUrl || "").trim(),
          primaryColor: String(boardSettings.primaryColor || "#2485a5").trim(),
          buttonColor: String(boardSettings.buttonColor || boardSettings.primaryColor || "#2485a5").trim(),
          backgroundColor: String(boardSettings.backgroundColor || "#ffffff").trim(),
          cardBackgroundColor: String(boardSettings.cardBackgroundColor || "#fffef8").trim(),
          textColor: String(boardSettings.textColor || "#112143").trim(),
          mutedTextColor: String(boardSettings.mutedTextColor || "#7a8496").trim(),
          pageTitle: formatBoardText(boardSettings.pageTitle, "{{company_name}} Jobs"),
          pageSubtitle: String(boardSettings.pageSubtitle || "Explore active openings and apply directly.").trim(),
          jobs
        }
      });
    } catch (error) {
      sendJson(res, 404, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/resume-formatting/sample-docx") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const copySettings = body?.copySettings && typeof body.copySettings === "object" ? body.copySettings : {};
      const resumeFormatting = copySettings?.resumeFormatting && typeof copySettings.resumeFormatting === "object"
        ? copySettings.resumeFormatting
        : {};
      const companyName = String(actor?.companyName || actor?.company_name || "").trim() || "Your Company";
      const buffer = await buildResumeFormattingSampleDocxBuffer({ companyName, resumeFormatting });
      if (!buffer || !Buffer.isBuffer(buffer)) throw new Error("DOCX generator is not available.");
      const filename = `resume-format-sample-${new Date().toISOString().slice(0, 10)}.docx`;
      sendBuffer(req, res, 200, buffer, {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename=\"${filename}\"`
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/resume-formatting/branded-pdf") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const copySettings = body?.copySettings && typeof body.copySettings === "object" ? body.copySettings : {};
      const resumeFormatting = copySettings?.resumeFormatting && typeof copySettings.resumeFormatting === "object"
        ? copySettings.resumeFormatting
        : {};
      const companyName = String(actor?.companyName || actor?.company_name || "").trim() || "Your Company";
      const filenameRaw = String(body?.filename || "branded-cv.pdf").trim() || "branded-cv.pdf";
      const candidateId = String(body?.candidateId || "").trim();
      let candidateName = String(body?.candidateName || "").trim();
      let headerLine = String(body?.headerLine || "").trim();
      if (candidateId && (!candidateName || !headerLine)) {
        const candidate = (await listCandidatesForUser(actor, { id: candidateId, limit: 1 }))[0] || null;
        if (candidate && !candidateName) {
          candidateName = String(candidate?.name || "").trim();
        }
        if (candidate && !headerLine) {
          const role = String(candidate?.role || candidate?.jd_title || "").trim();
          const currentDesignation = String(candidate?.current_designation || candidate?.currentDesignation || "").trim();
          const email = String(candidate?.email || "").trim();
          const phone = String(candidate?.phone || "").trim();
          const location = String(candidate?.location || "").trim();
          const notice = String(candidate?.notice_period || "").trim();
          const exp = String(candidate?.experience || "").trim();
          const company = String(candidate?.company || "").trim();
          const fields = Array.isArray(resumeFormatting?.headerShowFields) ? resumeFormatting.headerShowFields : [];
          const map = {
            candidate_name: String(candidate?.name || "").trim(),
            candidate_role: role,
            target_role: role,
            current_designation: currentDesignation,
            email,
            phone,
            location,
            notice_period: notice,
            total_experience: exp,
            current_company: company
          };
          headerLine = fields.map((key) => String(map[key] || "").trim()).filter(Boolean).join(" | ");
        }
      }
      candidateName = candidateName || "Candidate Name";
      const pdfBase64Raw = String(body?.pdfBase64 || "").trim();
      const pdfBufferForCache = Buffer.from(pdfBase64Raw, "base64");
      const cacheKey = buildBrandedCvResponseCacheKey({
        route: "/company/resume-formatting/branded-pdf",
        companyId: String(actor.companyId || "").trim(),
        candidateId,
        forceDownload: true,
        companyName,
        candidateName,
        headerLine,
        resumeFormatting,
        fileBuffer: pdfBufferForCache,
        assessmentId: ""
      });
      const contentDisposition = `attachment; filename="${(filenameRaw.toLowerCase().endsWith(".pdf") ? filenameRaw : `${filenameRaw}.pdf`).replace(/"/g, "")}"`;
      const cachedBrandedPdf = getBrandedCvResponseFromCache(cacheKey);
      if (cachedBrandedPdf?.buffer && cachedBrandedPdf?.etag) {
        sendConditionalBuffer(req, res, 200, cachedBrandedPdf.buffer, {
          "Content-Type": cachedBrandedPdf.contentType || "application/pdf",
          "Content-Disposition": cachedBrandedPdf.contentDisposition || contentDisposition,
          "Cache-Control": cachedBrandedPdf.cacheControl || "private, max-age=0, must-revalidate",
          "ETag": cachedBrandedPdf.etag,
          "X-Branded-Fallback-Used": cachedBrandedPdf.brandedFallbackUsed ? "1" : "0"
        });
        return;
      }
      const brandedPdf = await buildBrandedPdfBuffer({
        pdfBase64: pdfBase64Raw,
        companyName,
        resumeFormatting,
        candidateName,
        headerLine
      });
      if (brandedPdf?.brandedFallbackUsed) {
        console.warn("[branded-cv] branded_fallback_used=true route=/company/resume-formatting/branded-pdf");
      }
      const downloadName = filenameRaw.toLowerCase().endsWith(".pdf") ? filenameRaw : `${filenameRaw}.pdf`;
      const brandedEtag = `"${sha256Hex(brandedPdf.buffer)}"`;
      const cacheControl = "private, max-age=0, must-revalidate";
      setBrandedCvResponseCache(cacheKey, {
        buffer: brandedPdf.buffer,
        etag: brandedEtag,
        cacheControl,
        contentType: "application/pdf",
        contentDisposition,
        brandedFallbackUsed: brandedPdf?.brandedFallbackUsed
      });
      sendConditionalBuffer(req, res, 200, brandedPdf.buffer, {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition,
        "Cache-Control": cacheControl,
        "ETag": brandedEtag,
        "X-Branded-Fallback-Used": brandedPdf?.brandedFallbackUsed ? "1" : "0"
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/jds") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const job = await saveCompanyJob({
        actorUserId: actor.id,
        companyId: actor.companyId,
        job: body.job || body
      });
      sendJson(res, 200, { ok: true, result: job });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/jds/send-email") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(actor, "JD share email");
      const body = await readJsonBody(req);
      const jobId = String(body.jobId || "").trim();
      const toRaw = String(body.to || "").trim();
      const ccRaw = String(body.cc || "").trim();
      const subject = String(body.subject || "").trim();
      const introText = String(body.introText || "").trim();
      const signatureText = String(body.signatureText || "").trim();
      const signatureLinks = Array.isArray(body.signatureLinks) ? body.signatureLinks : [];
      const attachJdFile = Boolean(body.attachJdFile);
      if (!jobId) throw new Error("jobId is required.");
      const recipients = parseEmailListOrThrow(toRaw, { label: "Recipient email", required: true });
      if (!recipients.length) throw new Error("Recipient email is required.");
      const ccRecipients = parseEmailListOrThrow(ccRaw, { label: "CC email", required: false });
      const jobs = await listCompanyJobs(actor.companyId, actor.id);
      const job = (Array.isArray(jobs) ? jobs : []).find((item) => String(item?.id || "").trim() === jobId) || null;
      if (!job) throw new Error("JD not found.");

      const mail = buildJobShareEmail({
        job,
        introText,
        senderName: String(actor?.name || "").trim(),
        signatureText,
        signatureLinks
      });
      const finalSubject = subject || `JD: ${String(job?.title || "Job Description").trim()}`;
      const attachments = [];
      if (attachJdFile) {
        if (!docxLib) throw new Error("DOCX attachment is not available on the server yet. Please redeploy and try again.");
        const docxBuffer = await buildJobShareDocxBuffer({
          job,
          introText,
          senderName: String(actor?.name || "").trim()
        });
        if (!docxBuffer) throw new Error("DOCX generation failed. Please try again.");
        attachments.push({
          filename: `${finalSubject.replace(/[^\w\s.-]+/g, "").slice(0, 80) || "job-description"}.docx`,
          content: docxBuffer,
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        });
      }

      await sendJdEmailAsActor(actor, {
        to: recipients.join(", "),
        cc: ccRecipients.join(", "),
        subject: finalSubject,
        html: mail.html,
        text: mail.text,
        attachments
      });

      sendJson(res, 200, { ok: true, result: { sent: true, to: recipients, subject: finalSubject } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/email/send") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(actor, "Direct Share");
      const allowZohoApiThreading = isTruthyEnv(process.env.ZOHO_API_THREADED_DIRECT_SHARE_ENABLED);
      const body = await readJsonBody(req);
      const toRaw = String(body.to || "").trim();
      const ccRaw = String(body.cc || "").trim();
      const subject = String(body.subject || "").trim();
      const html = String(body.html || "").trim();
      const text = String(body.text || "").trim();
      const forceNewThread = Boolean(body.forceNewThread);
      const threadContext = body.threadContext && typeof body.threadContext === "object" ? body.threadContext : {};
      const cvAttachmentsRaw = Array.isArray(body.cvAttachments) ? body.cvAttachments : [];
      if (!subject) throw new Error("Subject is required.");
      if (!html && !text) throw new Error("Email content missing.");
      const recipients = parseEmailListOrThrow(toRaw, { label: "Recipient email", required: true });
      if (!recipients.length) throw new Error("Recipient email is required.");
      const ccRecipients = parseEmailListOrThrow(ccRaw, { label: "CC email", required: false });
      const conversationKey = buildConversationKey({
        to: recipients.join(", "),
        clientLabel: String(threadContext.clientLabel || "").trim(),
        role: String(threadContext.role || "").trim()
      });
      const existingThread = !forceNewThread && conversationKey
        ? await getCompanyEmailThreadByKey(actor.companyId, conversationKey).catch(() => null)
        : null;
      const inReplyTo = String(
        existingThread?.last_internet_message_id ||
        existingThread?.lastInternetMessageId ||
        existingThread?.last_message_id ||
        existingThread?.lastMessageId ||
        ""
      ).trim();
      const anchorMailIdRaw = String(existingThread?.last_mail_id || existingThread?.lastMailId || "").trim();
      const anchorMailId = isInternetMessageId(anchorMailIdRaw) ? "" : anchorMailIdRaw;
      const references = inReplyTo ? [inReplyTo] : [];
      const attachmentLimitBytes = 20 * 1024 * 1024;
      let attachmentBytes = 0;
      const resolvedAttachments = [];
      for (const row of cvAttachmentsRaw.slice(0, 20)) {
        try {
          const provider = String(row?.provider || "").trim();
          const key = String(row?.key || "").trim();
          const url = String(row?.url || "").trim();
          const signedUrl = String(row?.signedUrl || "").trim();
          const filename = String(row?.filename || "").trim() || `candidate-${String(row?.candidateId || "cv").trim()}.pdf`;
          const mimeType = String(row?.mimeType || "").trim() || "application/pdf";
          let loaded = null;
          if (provider && key) {
            loaded = await loadStoredFile({ provider, key, filename, mimeType, url: signedUrl || url || "" });
          } else if (signedUrl || url) {
            loaded = await loadAttachmentFromUrl(signedUrl || url, filename, mimeType);
          }
          if (!loaded?.buffer || !Buffer.isBuffer(loaded.buffer)) continue;
          const nextBytes = attachmentBytes + loaded.buffer.length;
          if (nextBytes > attachmentLimitBytes) break;
          attachmentBytes = nextBytes;
          resolvedAttachments.push({
            filename: String(loaded.filename || filename || "cv.pdf").trim() || "cv.pdf",
            content: loaded.buffer,
            contentType: String(loaded.mimeType || mimeType || "application/octet-stream").trim() || "application/octet-stream"
          });
        } catch {
          // Skip problematic attachment, keep mail send resilient.
        }
      }
      const sendMeta = await sendJdEmailAsActor(actor, {
        to: recipients.join(", "),
        cc: ccRecipients.join(", "),
        subject,
        html: html || `<pre>${escapeHtml(text).replace(/\n/g, "<br/>")}</pre>`,
        text: text || "",
        attachments: resolvedAttachments,
        allowZohoApiThreading,
        threading: {
          anchorMailId: anchorMailId || "",
          inReplyTo: inReplyTo || "",
          references
        }
      });
      if (conversationKey) {
        const persistedMessageId =
          String(sendMeta?.messageId || "").trim() ||
          String(existingThread?.last_message_id || existingThread?.lastMessageId || "").trim();
        const persistedThreadId =
          String(sendMeta?.threadId || "").trim() ||
          String(existingThread?.last_thread_id || existingThread?.lastThreadId || "").trim();
        const candidateMailId = String(sendMeta?.mailId || "").trim();
        const fallbackMailId = String(existingThread?.last_mail_id || existingThread?.lastMailId || "").trim();
        const persistedMailId = isInternetMessageId(candidateMailId)
          ? (isInternetMessageId(fallbackMailId) ? "" : fallbackMailId)
          : (candidateMailId || (isInternetMessageId(fallbackMailId) ? "" : fallbackMailId));
        const persistedInternetMessageId =
          (isInternetMessageId(String(sendMeta?.internetMessageId || "").trim())
            ? String(sendMeta?.internetMessageId || "").trim()
            : "") ||
          (isInternetMessageId(String(sendMeta?.messageId || "").trim())
            ? String(sendMeta?.messageId || "").trim()
            : "") ||
          String(existingThread?.last_internet_message_id || existingThread?.lastInternetMessageId || "").trim();
        await upsertCompanyEmailThread({
          companyId: actor.companyId,
          actorUserId: actor.id,
          conversationKey,
          providerMode: String(sendMeta?.providerMode || "").trim(),
          subject,
          to: recipients.join(", "),
          cc: ccRecipients.join(", "),
          messageId: persistedMessageId,
          threadId: persistedThreadId,
          mailId: persistedMailId,
          internetMessageId: persistedInternetMessageId
        }).catch(() => null);
      }
      sendJson(res, 200, {
        ok: true,
        result: {
          sent: true,
          to: recipients,
          subject,
          forceNewThread,
          threaded: Boolean(sendMeta?.threadedApplied),
          attachedCvCount: resolvedAttachments.length,
          conversationKey: conversationKey || ""
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && req.url === "/company/jds") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await deleteCompanyJob({
        actorUserId: actor.id,
        companyId: actor.companyId,
        jobId: String(body.jobId || "").trim()
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/email-settings") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const settings = await getUserSmtpSettings({ companyId: actor.companyId, userId: actor.id }).catch(() => null);
      sendJson(res, 200, {
        ok: true,
        result: settings
          ? {
              host: settings.host,
              port: settings.port,
              secure: settings.secure,
              user: settings.user,
              from: settings.from,
              hasPassword: Boolean(settings.pass),
              signatureText: String(settings.signatureText || "").trim(),
              signatureHtml: String(settings.signatureHtml || "").trim(),
              signatureLinkLabel: String(settings.signatureLinkLabel || "").trim(),
              signatureLinkUrl: String(settings.signatureLinkUrl || "").trim(),
              signatureLinkLabel2: String(settings.signatureLinkLabel2 || "").trim(),
              signatureLinkUrl2: String(settings.signatureLinkUrl2 || "").trim()
            }
          : {
              host: "",
              port: 587,
              secure: false,
              user: actor.email || "",
              from: actor.email ? `${actor.name || "Recruiter"} <${actor.email}>` : "",
              hasPassword: false,
              signatureText: "",
              signatureHtml: "",
              signatureLinkLabel: "",
              signatureLinkUrl: "",
              signatureLinkLabel2: "",
              signatureLinkUrl2: ""
            }
      });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/jds/shortcuts") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const jobId = String(body?.jobId || "").trim();
      const shortcuts = String(body?.shortcuts || "");
      const savedShortcuts = await saveCompanyJobRecruiterShortcuts({
        actorUserId: actor.id,
        companyId: actor.companyId,
        jobId,
        shortcuts
      });
      sendJson(res, 200, { ok: true, result: { jobId, jdShortcuts: savedShortcuts } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/personal-shortcuts") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const shortcuts = await getCompanyPersonalShortcuts({
        companyId: user.companyId,
        userId: user.id
      });
      sendJson(res, 200, { ok: true, result: { shortcuts } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/personal-shortcuts") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const shortcuts = await saveCompanyPersonalShortcuts({
        actorUserId: actor.id,
        companyId: actor.companyId,
        shortcuts: body?.shortcuts || {}
      });
      sendJson(res, 200, { ok: true, result: { shortcuts } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/billing/plans") {
    try {
      await requireSessionUser(getBearerToken(req));
      sendJson(res, 200, { ok: true, result: { plans: getPlanCatalog() } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/billing/overview") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      if (String(actor?.role || "").toLowerCase() !== "admin") {
        throw new Error("Only admin can view billing overview.");
      }
      const license = await getCompanyLicense(actor.companyId);
      const isFullAccess = getPortalApprovedCompanyIds().has(String(actor.companyId || "").trim());
      const overview = buildBillingOverview({
        license,
        companyId: actor.companyId,
        isFullAccess
      });
      sendJson(res, 200, { ok: true, result: overview });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /only admin/i.test(message) ? 403 : 401;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/email-bounces") {
    try {
      await requireSessionUser(getBearerToken(req));
      const items = Array.from(BOUNCED_EMAIL_CACHE.values()).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      sendJson(res, 200, { ok: true, result: { total: items.length, items } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/company/email-settings/zoho/connect-url" || requestUrl.pathname === "/company/email-settings/oauth/connect-url")) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const provider = String(requestUrl.searchParams.get("provider") || "zoho").trim().toLowerCase();
      const hostHint = String(requestUrl.searchParams.get("host") || "zohoapi.com").trim() || "zohoapi.com";
      const redirectUri = String(getEmailOauthRedirectUri(provider, req)).trim();
      if (!redirectUri) throw new Error(`Missing ${provider} redirect URI.`);
      let authUrl = "";
      let providerHost = "";
      if (provider === "zoho") {
        const clientId = String(process.env.ZOHO_CLIENT_ID || "").trim();
        if (!clientId) throw new Error("ZOHO_CLIENT_ID is not set on backend.");
        const { accountsBase } = resolveZohoBases({ host: hostHint, from: actor.email || "", user: actor.email || "" });
        providerHost = String(hostHint || "zohoapi.com").trim() || "zohoapi.com";
        const now = Date.now();
        const expiresAt = now + (15 * 60 * 1000);
        const state = createSignedEmailOauthState({
          type: "email_oauth_connect",
          provider: "zoho",
          userId: String(actor.id || "").trim(),
          companyId: String(actor.companyId || "").trim(),
          email: String(actor.email || "").trim(),
          hostHint: providerHost,
          redirectUri,
          issuedAt: now,
          expiresAt
        });
        authUrl = `${accountsBase}/oauth/v2/auth?scope=${encodeURIComponent("ZohoMail.messages.CREATE,ZohoMail.accounts.READ")}&client_id=${encodeURIComponent(clientId)}&response_type=code&access_type=offline&prompt=consent&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
        sendJson(res, 200, { ok: true, result: { authUrl, expiresAt, hostHint: providerHost, redirectUri, provider: "zoho" } });
        return;
      }
      if (provider === "google") {
        const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
        if (!clientId) throw new Error("GOOGLE_OAUTH_CLIENT_ID is not set on backend.");
        providerHost = "googleapi.com";
        const now = Date.now();
        const expiresAt = now + (15 * 60 * 1000);
        const state = createSignedEmailOauthState({
          type: "email_oauth_connect",
          provider: "google",
          userId: String(actor.id || "").trim(),
          companyId: String(actor.companyId || "").trim(),
          email: String(actor.email || "").trim(),
          hostHint: providerHost,
          redirectUri,
          issuedAt: now,
          expiresAt
        });
        authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent("openid email profile https://mail.google.com/")}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
        sendJson(res, 200, { ok: true, result: { authUrl, expiresAt, hostHint: providerHost, redirectUri, provider: "google" } });
        return;
      }
      if (provider === "microsoft") {
        const clientId = String(process.env.MICROSOFT_OAUTH_CLIENT_ID || "").trim();
        const tenant = String(process.env.MICROSOFT_OAUTH_TENANT_ID || "common").trim() || "common";
        if (!clientId) throw new Error("MICROSOFT_OAUTH_CLIENT_ID is not set on backend.");
        providerHost = "microsoftapi.com";
        const now = Date.now();
        const expiresAt = now + (15 * 60 * 1000);
        const state = createSignedEmailOauthState({
          type: "email_oauth_connect",
          provider: "microsoft",
          userId: String(actor.id || "").trim(),
          companyId: String(actor.companyId || "").trim(),
          email: String(actor.email || "").trim(),
          hostHint: providerHost,
          redirectUri,
          issuedAt: now,
          expiresAt
        });
        authUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${encodeURIComponent("offline_access openid profile email https://graph.microsoft.com/Mail.Send")}&prompt=select_account&state=${encodeURIComponent(state)}`;
        sendJson(res, 200, { ok: true, result: { authUrl, expiresAt, hostHint: providerHost, redirectUri, provider: "microsoft" } });
        return;
      }
      throw new Error("Unsupported provider for one-click connect.");
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/company/audit-logs")) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const isAdmin = String(actor?.role || "").trim().toLowerCase() === "admin";
      if (!isAdmin) throw new Error("Only admin can view audit logs.");
      const limit = Math.max(1, Math.min(1000, Number(requestUrl.searchParams.get("limit") || 200) || 200));
      const items = await listCompanyAuditLogs({ companyId: actor.companyId, limit });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /only admin/i.test(message) ? 403 : 401;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/zoho/oauth/callback" || requestUrl.pathname === "/email/oauth/callback")) {
    const postResultPage = (ok, message) => {
      const safeMessage = escapeHtml(String(message || "").trim());
      const body = `<!doctype html><html><head><meta charset="utf-8"/><title>Mail Connect</title></head><body style="font-family:Arial,sans-serif;padding:20px;"><h2>${ok ? "Mail connected" : "Mail connect failed"}</h2><p>${safeMessage}</p><script>try{if(window.opener){window.opener.postMessage({type:"RSD_MAIL_CONNECTED",ok:${ok ? "true" : "false"},message:${JSON.stringify(String(message || ""))}}, "*");}}catch(_){ }try{window.close();}catch(_){ }</script></body></html>`;
      sendText(req, res, 200, body, "text/html; charset=utf-8");
    };
    try {
      const oauthError = String(requestUrl.searchParams.get("error") || "").trim();
      if (oauthError) throw new Error(oauthError);
      const code = String(requestUrl.searchParams.get("code") || "").trim();
      const stateToken = String(requestUrl.searchParams.get("state") || "").trim();
      const state = readSignedEmailOauthState(stateToken);
      if (!state) throw new Error("Invalid or expired connect state.");
      const provider = String(state.provider || "zoho").trim().toLowerCase();
      let resolvedHost = "zohoapi.com";
      let refreshToken = "";
      let resolvedMailboxEmail = String(state.email || "").trim();
      if (provider === "zoho") {
        const exchanged = await exchangeZohoAuthCode({
          code,
          redirectUri: String(state.redirectUri || "").trim(),
          hostHint: String(state.hostHint || "zohoapi.com").trim() || "zohoapi.com"
        });
        resolvedHost = String(state.hostHint || "zohoapi.com").trim() || "zohoapi.com";
        refreshToken = String(exchanged.refreshToken || "").trim();
        const mailboxEmail = await resolveZohoMailboxFromAccessToken({
          accessToken: String(exchanged.accessToken || "").trim(),
          hostHint: resolvedHost
        }).catch(() => "");
        if (mailboxEmail) resolvedMailboxEmail = mailboxEmail;
      } else if (provider === "google") {
        const clientId = String(process.env.GOOGLE_OAUTH_CLIENT_ID || "").trim();
        const clientSecret = String(process.env.GOOGLE_OAUTH_CLIENT_SECRET || "").trim();
        const redirectUri = String(state.redirectUri || "").trim();
        if (!clientId || !clientSecret) throw new Error("Google OAuth client is not configured.");
        const form = new URLSearchParams();
        form.set("code", code);
        form.set("client_id", clientId);
        form.set("client_secret", clientSecret);
        form.set("redirect_uri", redirectUri);
        form.set("grant_type", "authorization_code");
        const tokenRes = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString()
        }, 20000);
        const tokenRaw = await tokenRes.text();
        let tokenJson = {};
        try { tokenJson = tokenRaw ? JSON.parse(tokenRaw) : {}; } catch { tokenJson = {}; }
        if (!tokenRes.ok || !String(tokenJson?.refresh_token || "").trim()) {
          throw new Error(String(tokenJson?.error_description || tokenJson?.error || tokenRaw || "Google token exchange failed."));
        }
        resolvedHost = "googleapi.com";
        refreshToken = String(tokenJson.refresh_token || "").trim();
        resolvedMailboxEmail = String(state.email || "").trim();
      } else if (provider === "microsoft") {
        const clientId = String(process.env.MICROSOFT_OAUTH_CLIENT_ID || "").trim();
        const clientSecret = String(process.env.MICROSOFT_OAUTH_CLIENT_SECRET || "").trim();
        const tenant = String(process.env.MICROSOFT_OAUTH_TENANT_ID || "common").trim() || "common";
        const redirectUri = String(state.redirectUri || "").trim();
        if (!clientId || !clientSecret) throw new Error("Microsoft OAuth client is not configured.");
        const form = new URLSearchParams();
        form.set("code", code);
        form.set("client_id", clientId);
        form.set("client_secret", clientSecret);
        form.set("redirect_uri", redirectUri);
        form.set("grant_type", "authorization_code");
        form.set("scope", "offline_access openid profile email https://graph.microsoft.com/Mail.Send");
        const tokenRes = await fetchWithTimeout(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: form.toString()
        }, 20000);
        const tokenRaw = await tokenRes.text();
        let tokenJson = {};
        try { tokenJson = tokenRaw ? JSON.parse(tokenRaw) : {}; } catch { tokenJson = {}; }
        if (!tokenRes.ok || !String(tokenJson?.refresh_token || "").trim()) {
          throw new Error(String(tokenJson?.error_description || tokenJson?.error || tokenRaw || "Microsoft token exchange failed."));
        }
        resolvedHost = "microsoftapi.com";
        refreshToken = String(tokenJson.refresh_token || "").trim();
        resolvedMailboxEmail = String(state.email || "").trim();
      } else {
        throw new Error("Unsupported provider in callback.");
      }
      const existing = await getUserSmtpSettings({
        companyId: String(state.companyId || "").trim(),
        userId: String(state.userId || "").trim()
      }).catch(() => null);
      await saveUserSmtpSettings({
        actorUserId: String(state.userId || "").trim(),
        companyId: String(state.companyId || "").trim(),
        userId: String(state.userId || "").trim(),
        settings: {
          host: resolvedHost,
          port: 443,
          secure: true,
          user: String(resolvedMailboxEmail || state.email || "").trim(),
          from: String(resolvedMailboxEmail || state.email || "").trim(),
          pass: refreshToken,
          keepPass: false,
          signatureText: String(existing?.signatureText || "").trim(),
          signatureHtml: String(existing?.signatureHtml || "").trim(),
          signatureLinkLabel: String(existing?.signatureLinkLabel || "").trim(),
          signatureLinkUrl: String(existing?.signatureLinkUrl || "").trim(),
          signatureLinkLabel2: String(existing?.signatureLinkLabel2 || "").trim(),
          signatureLinkUrl2: String(existing?.signatureLinkUrl2 || "").trim()
        }
      });
      postResultPage(true, `${provider[0].toUpperCase()}${provider.slice(1)} mail connected successfully. You can go back to RecruitDesk.`);
    } catch (error) {
      postResultPage(false, String(error?.message || error));
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/email-settings") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const saved = await saveUserSmtpSettings({
        actorUserId: actor.id,
        companyId: actor.companyId,
        userId: actor.id,
        settings: body.settings || body
      });
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/license/plan") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const license = await setCompanyExtensionPlan({
        actorUserId: actor.id,
        companyId: actor.companyId,
        planCode: String(body.planCode || body.plan || "").trim(),
        paidAt: String(body.paidAt || body.paid_at || "").trim(),
        months: Number(body.months || 1)
      });
      await writeAuditLogSafe({
        companyId: String(actor.companyId || "").trim(),
        actorUserId: String(actor.id || "").trim(),
        actorEmail: String(actor.email || "").trim(),
        actorName: String(actor.name || "").trim(),
        action: "plan_changed",
        module: "billing",
        entity: "license",
        entityId: String(actor.companyId || "").trim(),
        detail: `Plan set to ${String(body.planCode || body.plan || "").trim()}`
      });
      sendJson(res, 200, { ok: true, result: { license } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/license/upgrade-link") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const planCode = String(body.planCode || body.plan || "").trim();
      if (!UPGRADE_ALLOWED_PLANS.has(planCode)) {
        throw new Error("Invalid plan selected.");
      }
      const now = Date.now();
      const expiresAt = now + (10 * 60 * 1000);
      const token = createSignedUpgradeToken({
        type: "shared_upgrade_link",
        companyId: String(actor.companyId || "").trim(),
        userId: String(actor.id || "").trim(),
        email: String(actor.email || "").trim(),
        planCode,
        source: "extension",
        issuedAt: now,
        expiresAt
      });
      const base = String(process.env.PUBLIC_PORTAL_BASE_URL || getRequestBaseUrl(req) || "").trim().replace(/\/+$/, "");
      if (!base) throw new Error("Could not build upgrade URL.");
      const upgradeUrl = `${base}/upgrade?token=${encodeURIComponent(token)}`;
      sendJson(res, 200, { ok: true, result: { upgradeUrl, expiresAt } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/payroll-auth/me") {
    try {
      const user = await requirePayrollSessionUser(getBearerToken(req));
      sendJson(res, 200, { ok: true, result: { user } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/employees") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      await requireSuiteModulesAccess(actor, "Employee module");
      const employees = await listCompanyEmployees(actor.companyId);
      sendJson(res, 200, { ok: true, result: { companyId: actor.companyId, employees } });
    } catch (error) {
      const message = String(error?.message || error);
      let status = 500;
      if (/invalid|missing session|unauthorized|401/i.test(message)) status = 401;
      else if (/only an admin|not allowed|forbidden|403/i.test(message)) status = 403;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && (req.url === "/company/employees" || req.url === "/company/createemployee")) {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      await requireSuiteModulesAccess(actor, "Employee module");
      const body = await readJsonBody(req);
      const result = await createEmployeeUser({
        actorUserId: actor.id,
        companyId: actor.companyId,
        employeeCode: String(body.employeeCode || body.employee_code || "").trim(),
        username: String(body.username || "").trim(),
        password: String(body.password || ""),
        fullName: String(body.fullName || body.full_name || "").trim(),
        profile: {
          personalEmail: String(body.personalEmail || body.personal_email || "").trim(),
          phone: String(body.phone || "").trim(),
          designation: String(body.designation || "").trim(),
          employmentType: String(body.employmentType || body.employment_type || "c2h").trim(),
          joiningDate: String(body.joiningDate || body.joining_date || "").trim(),
          reportingManagerName: String(body.reportingManagerName || body.reporting_manager_name || "").trim(),
          clientName: String(body.clientName || body.client_name || "").trim(),
          workMode: String(body.workMode || body.work_mode || "").trim(),
          status: String(body.status || "active").trim(),
          payload: body.payload && typeof body.payload === "object" ? body.payload : {}
        },
        workSite: body.workSite && typeof body.workSite === "object" ? body.workSite : {}
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      const message = String(error?.message || error);
      let status = 400;
      if (/invalid|missing session|unauthorized|401/i.test(message)) status = 401;
      else if (/only an admin|not allowed|forbidden|403/i.test(message)) status = 403;
      else if (/timed out|timeout|supabase.*failed|failed/i.test(message)) status = 500;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/employees/update") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      await requireSuiteModulesAccess(actor, "Employee module");
      const body = await readJsonBody(req);
      const employeeId = String(body.employeeId || body.employee_id || "").trim();
      const result = await updateEmployeeProfileAndWorkSite({
        actorUserId: actor.id,
        companyId: actor.companyId,
        employeeId,
        profile: {
          id: employeeId,
          employeeCode: String(body.employeeCode || body.employee_code || "").trim(),
          fullName: String(body.fullName || body.full_name || "").trim(),
          personalEmail: String(body.personalEmail || body.personal_email || "").trim(),
          phone: String(body.phone || "").trim(),
          designation: String(body.designation || "").trim(),
          employmentType: String(body.employmentType || body.employment_type || "c2h").trim(),
          joiningDate: String(body.joiningDate || body.joining_date || "").trim(),
          reportingManagerName: String(body.reportingManagerName || body.reporting_manager_name || "").trim(),
          clientName: String(body.clientName || body.client_name || "").trim(),
          workMode: String(body.workMode || body.work_mode || "").trim(),
          status: String(body.status || "active").trim(),
          payload: body.payload && typeof body.payload === "object" ? body.payload : {}
        },
        workSite: body.workSite && typeof body.workSite === "object" ? body.workSite : {}
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      const message = String(error?.message || error);
      let status = 400;
      if (/invalid|missing session|unauthorized|401/i.test(message)) status = 401;
      else if (/only an admin|not allowed|forbidden|403/i.test(message)) status = 403;
      else if (/timed out|timeout|supabase.*failed|failed/i.test(message)) status = 500;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/employees/password") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      await requireSuiteModulesAccess(actor, "Employee module");
      const body = await readJsonBody(req);
      const result = await resetEmployeeUserPassword({
        actorUserId: actor.id,
        companyId: actor.companyId,
        employeeUserId: String(body.employeeUserId || body.employee_user_id || "").trim(),
        newPassword: String(body.newPassword || "")
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/employee/me") {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerToken(req));
      const profile = await getEmployeeProfile(employeeUser.companyId, employeeUser.employeeId);
      sendJson(res, 200, { ok: true, result: { user: profile || employeeUser } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url.startsWith("/employee/dashboard")) {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerToken(req));
      const today = new Date().toISOString().slice(0, 10);
      const attendance = await listEmployeeAttendance({
        companyId: employeeUser.companyId,
        employeeId: employeeUser.employeeId,
        dateFrom: today,
        dateTo: today
      });
      sendJson(res, 200, {
        ok: true,
        result: {
          user: employeeUser,
          todayAttendance: attendance[0] || null
        }
      });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/employee/payroll-docs") {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerToken(req));
      const payrollMonth = Number(requestUrl.searchParams.get("payrollMonth") || 0);
      const payrollYear = Number(requestUrl.searchParams.get("payrollYear") || 0);
      const items = await listPayrollPayslips({
        actorUserId: employeeUser.id,
        companyId: employeeUser.companyId,
        payrollMonth,
        payrollYear,
        employeeId: employeeUser.employeeId
      });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/employee/payroll/fbp-heads") {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerTokenFromRequest(req, requestUrl));
      const items = await listEmployeeCompanyFbpHeads({ employeeUser, activeOnly: true });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/employee/payroll/payslip") {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerTokenFromRequest(req, requestUrl));
      const payslipId = String(requestUrl.searchParams.get("id") || "").trim();
      if (!payslipId) throw new Error("Payslip id is required.");
      const items = await listPayrollPayslips({
        actorUserId: employeeUser.id,
        companyId: employeeUser.companyId,
        employeeId: employeeUser.employeeId
      });
      const doc = (items || []).find((item) => String(item.id || "") === payslipId);
      if (!doc) throw new Error("Payslip not found.");
      const p = doc.payload && typeof doc.payload === "object" ? doc.payload : {};
      const currency = (n) => Number(n || 0).toFixed(2);
      const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Payslip ${doc.payrollMonth}/${doc.payrollYear}</title><style>
      body{font-family:Arial,sans-serif;padding:20px;color:#111} h1{font-size:22px;margin:0 0 6px} .muted{color:#555;margin-bottom:12px}
      table{border-collapse:collapse;width:100%;margin-top:10px} th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}
      th{background:#f7f9fc} .right{text-align:right}
      </style></head><body>
      <h1>Payslip</h1>
      <div class="muted">${employeeUser.fullName || ""} | ${employeeUser.employeeCode || ""} | ${doc.payrollMonth}/${doc.payrollYear}</div>
      <table><tbody>
      <tr><th>Total Days</th><td>${p.totalDays ?? p.total_days ?? "-"}</td><th>Payable Days</th><td>${p.payableDays ?? p.payable_days ?? "-"}</td></tr>
      <tr><th>Paid Leave</th><td>${p.paidLeaveDays ?? p.paid_leave_days ?? "-"}</td><th>LOP Days</th><td>${p.lopDays ?? p.lop_days ?? "-"}</td></tr>
      <tr><th>LOP Deduction</th><td>${currency(p.lopAmount ?? p.lop_amount ?? 0)}</td><th>Net Salary</th><td>${currency(p.netSalary ?? p.net_salary ?? 0)}</td></tr>
      </tbody></table>
      <table><thead><tr><th>Earnings</th><th class="right">Amount</th><th>Deductions</th><th class="right">Amount</th></tr></thead><tbody>
      <tr><td>Basic</td><td class="right">${currency(p.proratedBasic)}</td><td>Employee PF</td><td class="right">${currency(p.employeePf)}</td></tr>
      <tr><td>HRA</td><td class="right">${currency(p.proratedHra)}</td><td>Employee ESI</td><td class="right">${currency(p.employeeEsi)}</td></tr>
      <tr><td>FBP</td><td class="right">${currency(p.proratedFbp)}</td><td>Employee LWF</td><td class="right">${currency(p.employeeLwf)}</td></tr>
      <tr><td>Special Allowance</td><td class="right">${currency(p.proratedSpecialAllowance)}</td><td>Professional Tax</td><td class="right">${currency(p.professionalTax)}</td></tr>
      <tr><td>Other Earnings</td><td class="right">${currency(p.otherEarnings)}</td><td>TDS</td><td class="right">${currency(p.tds)}</td></tr>
      <tr><td>Approved Reimbursements</td><td class="right">${currency(p.approvedReimbursements)}</td><td>Other Deductions</td><td class="right">${currency(p.otherDeductions)}</td></tr>
      <tr><th>Gross Earnings</th><th class="right">${currency(p.grossEarnings)}</th><th>Gross Deductions</th><th class="right">${currency(p.grossDeductions)}</th></tr>
      <tr><th colspan="3">Net Pay</th><th class="right">${currency(p.netSalary ?? p.net_salary ?? 0)}</th></tr>
      </tbody></table>
      <div class="muted" style="margin-top:10px">Use browser Print -> Save as PDF for PDF copy.</div>
      </body></html>`;
      res.writeHead(200, buildResponseHeaders(req, { "Content-Type": "text/html; charset=utf-8" }));
      res.end(html);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/employee/payroll/fbp-declarations") {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerToken(req));
      const payrollMonth = Number(requestUrl.searchParams.get("payrollMonth") || 0);
      const payrollYear = Number(requestUrl.searchParams.get("payrollYear") || 0);
      const items = await listEmployeeFbpDeclarations({
        employeeUser,
        payrollMonth,
        payrollYear
      });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/employee/payroll/fbp-declarations") {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const saved = await saveEmployeeFbpDeclaration({
        employeeUser,
        declaration: body?.declaration && typeof body.declaration === "object" ? body.declaration : body
      });
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/employee/payroll/fbp-doc/upload") {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const uploadedFile = body?.file && typeof body.file === "object" ? body.file : null;
      const fileData = String(uploadedFile?.fileData || "").trim();
      if (!fileData) throw new Error("file.fileData is required.");
      const filename = String(uploadedFile?.filename || uploadedFile?.name || "fbp-proof.bin").trim();
      const mimeType = String(uploadedFile?.mimeType || uploadedFile?.type || "application/octet-stream").trim();
      const stored = await storeUploadedFile(
        { filename, mimeType, fileData },
        { objectPrefix: `payroll-fbp/${String(employeeUser.companyId || "").trim()}/${String(employeeUser.employeeId || "").trim()}` }
      );
      sendJson(res, 200, {
        ok: true,
        result: {
          provider: String(stored?.provider || "").trim(),
          key: String(stored?.key || "").trim(),
          url: String(stored?.url || "").trim(),
          filename: String(stored?.filename || filename).trim(),
          mimeType: String(stored?.mimeType || mimeType).trim(),
          sizeBytes: Number(stored?.sizeBytes || 0) || 0
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/employee/attendance") {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerToken(req));
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const items = await listEmployeeAttendance({
        companyId: employeeUser.companyId,
        employeeId: employeeUser.employeeId,
        dateFrom,
        dateTo
      });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/employee/attendance/check-in") {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await markEmployeeAttendance({
        employeeUser,
        action: "check_in",
        latitude: body.latitude,
        longitude: body.longitude,
        accuracyMeters: body.accuracyMeters,
        addressLabel: body.addressLabel,
        note: body.note,
        devicePayload: body.device && typeof body.device === "object" ? body.device : {}
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/employee/attendance/check-out") {
    try {
      const employeeUser = await requireEmployeeSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await markEmployeeAttendance({
        employeeUser,
        action: "check_out",
        latitude: body.latitude,
        longitude: body.longitude,
        accuracyMeters: body.accuracyMeters,
        addressLabel: body.addressLabel,
        note: body.note,
        devicePayload: body.device && typeof body.device === "object" ? body.device : {}
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/employee-attendance") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const employeeId = String(requestUrl.searchParams.get("employeeId") || "").trim();
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      if (!employeeId) throw new Error("employeeId is required.");
      const items = await listEmployeeAttendance({ companyId: actor.companyId, employeeId, dateFrom, dateTo });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/employee-auth/me") {
    try {
      const user = await requireEmployeeSessionUser(getBearerToken(req));
      sendJson(res, 200, { ok: true, result: { user } });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /invalid|missing employee session|unauthorized|401/i.test(message) ? 401 : 500;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (requestUrl.pathname.startsWith("/company/payroll") || requestUrl.pathname === "/company/employee-attendance") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      await requireSuiteModulesAccess(actor, "Payroll and employee modules");
    } catch (error) {
      const message = String(error?.message || error);
      const status = /invalid|missing session|unauthorized|401/i.test(message) ? 401 : 403;
      sendJson(res, status, { ok: false, error: message });
      return;
    }
  }

  if (req.method === "GET" && req.url === "/company/payroll/settings") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const settings = await getCompanyPayrollSettings({ actorUserId: actor.id, companyId: actor.companyId });
      sendJson(res, 200, { ok: true, result: settings });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/payroll/settings") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const settings = await saveCompanyPayrollSettings({
        actorUserId: actor.id,
        companyId: actor.companyId,
        settings: body?.settings && typeof body.settings === "object" ? body.settings : body
      });
      sendJson(res, 200, { ok: true, result: settings });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/payroll/access-control") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const result = await getCompanyPayrollAccessControl({ actorUserId: actor.id, companyId: actor.companyId });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /not authorized|restricted|admin access|required|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/payroll/access-control") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await saveCompanyPayrollAccessControl({
        actorUserId: actor.id,
        companyId: actor.companyId,
        payrollLiteEnabled: Boolean(body?.payrollLiteEnabled),
        payrollAuthorizedUserIds: Array.isArray(body?.payrollAuthorizedUserIds) ? body.payrollAuthorizedUserIds : [],
        payrollApproverUserIds: Array.isArray(body?.payrollApproverUserIds) ? body.payrollApproverUserIds : [],
        payrollAccessManagerUserIds: Array.isArray(body?.payrollAccessManagerUserIds) ? body.payrollAccessManagerUserIds : []
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /not authorized|restricted|admin access|required|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/payroll/compensation") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const employeeId = String(requestUrl.searchParams.get("employeeId") || "").trim();
      const activeOnly = String(requestUrl.searchParams.get("activeOnly") || "").trim() === "true";
      const items = await listEmployeeCompensationStructures({
        actorUserId: actor.id,
        companyId: actor.companyId,
        employeeId,
        activeOnly
      });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/payroll/compensation") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const saved = await saveEmployeeCompensationStructure({
        actorUserId: actor.id,
        companyId: actor.companyId,
        compensation: body?.compensation && typeof body.compensation === "object" ? body.compensation : body
      });
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/payroll/fbp-heads") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const activeOnly = String(requestUrl.searchParams.get("activeOnly") || "").trim() === "true";
      const items = await listCompanyFbpHeads({ actorUserId: actor.id, companyId: actor.companyId, activeOnly });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/payroll/fbp-heads") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const saved = await saveCompanyFbpHead({
        actorUserId: actor.id,
        companyId: actor.companyId,
        head: body?.head && typeof body.head === "object" ? body.head : body
      });
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "DELETE" && requestUrl.pathname === "/company/payroll/fbp-heads") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const headId = String(requestUrl.searchParams.get("headId") || "").trim();
      const result = await removeCompanyFbpHead({ actorUserId: actor.id, companyId: actor.companyId, headId });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/payroll/fbp-declarations") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const payrollMonth = Number(requestUrl.searchParams.get("payrollMonth") || 0);
      const payrollYear = Number(requestUrl.searchParams.get("payrollYear") || 0);
      const employeeId = String(requestUrl.searchParams.get("employeeId") || "").trim();
      const items = await listFbpDeclarations({
        actorUserId: actor.id,
        companyId: actor.companyId,
        payrollMonth,
        payrollYear,
        employeeId
      });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/fbp-doc/upload") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      if (String(actor?.role || "").toLowerCase() !== "admin") {
        throw new Error("Admin access required.");
      }
      const body = await readJsonBody(req);
      const uploadedFile = body?.file && typeof body.file === "object" ? body.file : null;
      const fileData = String(uploadedFile?.fileData || "").trim();
      if (!fileData) throw new Error("file.fileData is required.");
      const filename = String(uploadedFile?.filename || uploadedFile?.name || "fbp-proof.bin").trim();
      const mimeType = String(uploadedFile?.mimeType || uploadedFile?.type || "application/octet-stream").trim();
      const stored = await storeUploadedFile(
        { filename, mimeType, fileData },
        { objectPrefix: `payroll-fbp/${String(actor.companyId || "").trim()}` }
      );
      sendJson(res, 200, {
        ok: true,
        result: {
          provider: String(stored?.provider || "").trim(),
          key: String(stored?.key || "").trim(),
          url: String(stored?.url || "").trim(),
          filename: String(stored?.filename || filename).trim(),
          mimeType: String(stored?.mimeType || mimeType).trim(),
          sizeBytes: Number(stored?.sizeBytes || 0) || 0
        }
      });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/fbp-declarations") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const saved = await saveFbpDeclaration({
        actorUserId: actor.id,
        companyId: actor.companyId,
        declaration: body?.declaration && typeof body.declaration === "object" ? body.declaration : body
      });
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      const message = String(error?.message || error);
      sendJson(res, 400, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/fbp-declarations/approve") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const saved = await reviewFbpDeclaration({
        actorUserId: actor.id,
        companyId: actor.companyId,
        declarationId: String(body?.declarationId || "").trim(),
        action: "approve",
        approvedAmount: body?.approvedAmount
      });
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      const message = String(error?.message || error);
      sendJson(res, 400, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/fbp-declarations/reject") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const saved = await reviewFbpDeclaration({
        actorUserId: actor.id,
        companyId: actor.companyId,
        declarationId: String(body?.declarationId || "").trim(),
        action: "reject",
        rejectionReason: String(body?.rejectionReason || "").trim()
      });
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      const message = String(error?.message || error);
      sendJson(res, 400, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/payslips/publish") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await publishPayrollPayslips({
        actorUserId: actor.id,
        companyId: actor.companyId,
        payrollRunId: String(body?.payrollRunId || "").trim(),
        payrollMonth: Number(body?.payrollMonth || 0),
        payrollYear: Number(body?.payrollYear || 0)
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      const message = String(error?.message || error);
      sendJson(res, 400, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/payroll/payslips") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const payrollMonth = Number(requestUrl.searchParams.get("payrollMonth") || 0);
      const payrollYear = Number(requestUrl.searchParams.get("payrollYear") || 0);
      const employeeId = String(requestUrl.searchParams.get("employeeId") || "").trim();
      const items = await listPayrollPayslips({
        actorUserId: actor.id,
        companyId: actor.companyId,
        payrollMonth,
        payrollYear,
        employeeId
      });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      const message = String(error?.message || error);
      sendJson(res, 400, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/payroll/templates") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const activeOnly = String(requestUrl.searchParams.get("activeOnly") || "").trim() === "true";
      const items = await listCompanySalaryTemplates({ actorUserId: actor.id, companyId: actor.companyId, activeOnly });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/templates") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const saved = await saveCompanySalaryTemplate({
        actorUserId: actor.id,
        companyId: actor.companyId,
        template: body?.template && typeof body.template === "object" ? body.template : body
      });
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/payroll/inputs") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const payrollMonth = Number(requestUrl.searchParams.get("payrollMonth") || 0);
      const payrollYear = Number(requestUrl.searchParams.get("payrollYear") || 0);
      const employeeId = String(requestUrl.searchParams.get("employeeId") || "").trim();
      const items = await listPayrollInputs({ actorUserId: actor.id, companyId: actor.companyId, payrollMonth, payrollYear, employeeId });
      sendJson(res, 200, { ok: true, result: { items } });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/inputs") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const saved = await savePayrollInput({
        actorUserId: actor.id,
        companyId: actor.companyId,
        input: body?.input && typeof body.input === "object" ? body.input : body
      });
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/payroll/runs") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const runId = String(requestUrl.searchParams.get("runId") || "").trim();
      if (runId) {
        const detail = await getPayrollRunDetail({ actorUserId: actor.id, companyId: actor.companyId, payrollRunId: runId });
        sendJson(res, 200, { ok: true, result: detail });
      } else {
        const payrollMonth = Number(requestUrl.searchParams.get("payrollMonth") || 0);
        const payrollYear = Number(requestUrl.searchParams.get("payrollYear") || 0);
        const items = await listPayrollRuns({ actorUserId: actor.id, companyId: actor.companyId, payrollMonth, payrollYear });
        sendJson(res, 200, { ok: true, result: { items } });
      }
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/runs/draft") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const run = await createPayrollRunDraft({
        actorUserId: actor.id,
        companyId: actor.companyId,
        payrollMonth: Number(body?.payrollMonth || 0),
        payrollYear: Number(body?.payrollYear || 0)
      });
      sendJson(res, 200, { ok: true, result: run });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/runs/calculate") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const detail = await calculatePayrollRun({
        actorUserId: actor.id,
        companyId: actor.companyId,
        payrollRunId: String(body?.payrollRunId || "").trim()
      });
      sendJson(res, 200, { ok: true, result: detail });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/runs/approve") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const run = await approvePayrollRun({
        actorUserId: actor.id,
        companyId: actor.companyId,
        payrollRunId: String(body?.payrollRunId || "").trim()
      });
      sendJson(res, 200, { ok: true, result: run });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/runs/lock") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const run = await lockPayrollRun({
        actorUserId: actor.id,
        companyId: actor.companyId,
        payrollRunId: String(body?.payrollRunId || "").trim(),
        reason: String(body?.reason || "").trim()
      });
      sendJson(res, 200, { ok: true, result: run });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/runs/set-status") {
    try {
      const actor = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const body = await readJsonBody(req);
      const run = await setPayrollRunStatus({
        actorUserId: actor.id,
        companyId: actor.companyId,
        payrollRunId: String(body?.payrollRunId || "").trim(),
        status: String(body?.status || "").trim(),
        reason: String(body?.reason || "").trim()
      });
      sendJson(res, 200, { ok: true, result: run });
    } catch (error) {
      const message = String(error?.message || error);
      const status = /admin access required|forbidden|not allowed|403/i.test(message) ? 403 : 400;
      sendJson(res, status, { ok: false, error: message });
    }
    return;
  }
  if (req.method === "POST" && requestUrl.pathname === "/company/payroll/runs/delete") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await deletePayrollRun({
        actorUserId: actor.id,
        companyId: actor.companyId,
        payrollRunId: String(body?.payrollRunId || "").trim()
      });
      return sendJson(res, 200, result);
    } catch (error) {
      return sendJson(res, 400, { error: String(error?.message || error) });
    }
  }

  if (req.method === "POST" && req.url === "/company/email-settings/test") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const sendTestMail = Boolean(body?.sendTestMail);
      const overrideTo = String(body?.to || "").trim();
      const { transport, cfg } = await createActorSmtpTransport(actor);
      const usingZohoApi = isZohoApiMode(cfg);
      const usingSendgridApi = isSendgridApiMode(cfg);
      const usingPostmarkApi = isPostmarkApiMode(cfg);
      const usingGoogleApi = isGoogleApiMode(cfg);
      const usingMicrosoftApi = isMicrosoftApiMode(cfg);
      if (!usingZohoApi && !usingSendgridApi && !usingPostmarkApi && !usingGoogleApi && !usingMicrosoftApi) {
        await transport.verify();
      } else {
        if (usingZohoApi) {
          await getZohoAccessToken(cfg);
        } else if (usingGoogleApi) {
          await getGoogleAccessToken(cfg);
        } else if (usingMicrosoftApi) {
          await getMicrosoftAccessToken(cfg);
        } else if (usingSendgridApi || usingPostmarkApi) {
          if (!String(cfg?.pass || "").trim()) {
            throw new Error(usingSendgridApi ? "SendGrid API key missing." : "Postmark server token missing.");
          }
        }
      }
      let testMailSent = false;
      let sentTo = "";
      if (sendTestMail) {
        const to = overrideTo || String(actor?.email || cfg.user || "").trim();
        if (!to) throw new Error("No email address available for test mail.");
        if (usingZohoApi) {
          await sendZohoEmailWithCfg(cfg, {
            to,
            subject: "RecruitDesk Zoho API test",
            text: "Zoho API test successful. Your RecruitDesk mail settings are working.",
            html: "<p>Zoho API test successful. Your RecruitDesk mail settings are working.</p>"
          });
        } else if (usingSendgridApi) {
          await sendSendgridEmailWithCfg(cfg, {
            to,
            subject: "RecruitDesk SendGrid test",
            text: "SendGrid API test successful. Your RecruitDesk mail settings are working.",
            html: "<p>SendGrid API test successful. Your RecruitDesk mail settings are working.</p>"
          });
        } else if (usingPostmarkApi) {
          await sendPostmarkEmailWithCfg(cfg, {
            to,
            subject: "RecruitDesk Postmark test",
            text: "Postmark API test successful. Your RecruitDesk mail settings are working.",
            html: "<p>Postmark API test successful. Your RecruitDesk mail settings are working.</p>"
          });
        } else if (usingGoogleApi) {
          await sendGoogleEmailWithCfg(cfg, {
            to,
            subject: "RecruitDesk Google API test",
            text: "Google API test successful. Your RecruitDesk mail settings are working.",
            html: "<p>Google API test successful. Your RecruitDesk mail settings are working.</p>"
          });
        } else if (usingMicrosoftApi) {
          await sendMicrosoftEmailWithCfg(cfg, {
            to,
            subject: "RecruitDesk Microsoft API test",
            text: "Microsoft API test successful. Your RecruitDesk mail settings are working.",
            html: "<p>Microsoft API test successful. Your RecruitDesk mail settings are working.</p>"
          });
        } else {
          await transport.sendMail({
            from: String(cfg.from || "").trim(),
            to,
            subject: "RecruitDesk SMTP test",
            text: "SMTP test successful. Your RecruitDesk mail settings are working.",
            html: "<p>SMTP test successful. Your RecruitDesk mail settings are working.</p>"
          });
        }
        testMailSent = true;
        sentTo = to;
      }
      sendJson(res, 200, {
        ok: true,
        result: {
          verified: true,
          host: String(cfg.host || "").trim(),
          port: Number(cfg.port || 587),
          secure: Boolean(cfg.secure),
          mode: usingZohoApi ? "zoho_api" : usingSendgridApi ? "sendgrid_api" : usingPostmarkApi ? "postmark_api" : usingGoogleApi ? "google_api" : usingMicrosoftApi ? "microsoft_api" : "smtp",
          user: String(cfg.user || "").trim(),
          from: String(cfg.from || "").trim(),
          testMailSent,
          sentTo
        }
      });
    } catch (error) {
      const rawMessage = String(error?.message || "");
      const message = /zoho/i.test(rawMessage)
        ? formatZohoApiError(error)
        : /sendgrid|postmark|google|microsoft|graph/i.test(rawMessage)
          ? formatProviderApiError(error)
          : formatSmtpError(error);
      sendJson(res, 400, { ok: false, error: message });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/assessments") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const assessments = await listAssessments({
        actorUserId: user.id,
        companyId: user.companyId
      });
      sendJson(res, 200, { ok: true, result: { assessments } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/assessments/list") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const result = await listAssessmentsForUser(user, {
        page: Number(requestUrl.searchParams.get("page") || 1),
        limit: Number(requestUrl.searchParams.get("limit") || 25),
        sortBy: String(requestUrl.searchParams.get("sortBy") || "updated").trim() || "updated",
        filters: {
          q: String(requestUrl.searchParams.get("q") || "").trim(),
          dateFrom: String(requestUrl.searchParams.get("dateFrom") || "").trim(),
          dateTo: String(requestUrl.searchParams.get("dateTo") || "").trim(),
          clients: String(requestUrl.searchParams.get("clients") || "").trim(),
          jds: String(requestUrl.searchParams.get("jds") || "").trim(),
          recruiters: String(requestUrl.searchParams.get("recruiters") || "").trim(),
          outcomes: String(requestUrl.searchParams.get("outcomes") || "").trim(),
          lane: String(requestUrl.searchParams.get("lane") || "active").trim() || "active"
        }
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/assessments/stats") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const result = await getAssessmentStatsForUser(user, {
        filters: {
          q: String(requestUrl.searchParams.get("q") || "").trim(),
          dateFrom: String(requestUrl.searchParams.get("dateFrom") || "").trim(),
          dateTo: String(requestUrl.searchParams.get("dateTo") || "").trim(),
          clients: String(requestUrl.searchParams.get("clients") || "").trim(),
          jds: String(requestUrl.searchParams.get("jds") || "").trim(),
          recruiters: String(requestUrl.searchParams.get("recruiters") || "").trim(),
          outcomes: String(requestUrl.searchParams.get("outcomes") || "").trim()
        }
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  // Service-role backed exports for factual analytics (interviews aligned/done, offered, etc.).
  // This avoids relying on free-text notes inside status history and remains stable over time.
  if (req.method === "GET" && requestUrl.pathname === "/company/assessment-events") {
    try {
      const user = await requireCompanySessionOrPayrollSession(getBearerToken(req));
      const kind = String(requestUrl.searchParams.get("kind") || "").trim();
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const limit = Number(requestUrl.searchParams.get("limit") || 10000) || 10000;

      // Recruiters should only see their own candidates/events. Admin sees company-wide.
      const isAdmin = String(user.role || "").toLowerCase() === "admin";
      // When the portal asks for "all events" (no kind), we need company-wide rows so it can
      // compute correct derived timestamps even after reassignment. Restrict only for specific
      // analytics kinds.
      const recruiterId = isAdmin ? "" : (kind ? String(user.id || "").trim() : "");

      const rows = await listAssessmentEvents({
        companyId: user.companyId,
        recruiterId,
        kind,
        dateFrom,
        dateTo,
        limit
      });

      sendJson(res, 200, { ok: true, result: { rows } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/candidates/backfill-assessment-links") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      if (String(user.role || "").toLowerCase() !== "admin") {
        throw new Error("Only an admin can run backfill-assessment-links.");
      }
      const result = await backfillCandidateAssessmentLinks(user);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/assessments/repair-links") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      if (String(actor.role || "").toLowerCase() !== "admin") {
        throw new Error("Only an admin can repair assessment links.");
      }
      const [candidates, assessments] = await Promise.all([
        listCandidatesForUser(actor, { limit: 5000, scope: "company" }),
        listAssessments({ actorUserId: actor.id, companyId: actor.companyId })
      ]);
      const normalizeEmail = (value) => String(value || "").trim().toLowerCase();
      const normalizePhone = (value) => {
        const digits = String(value || "").replace(/[^\d]/g, "");
        return digits.length > 10 ? digits.slice(-10) : digits;
      };

      const candidatesById = new Map((candidates || []).map((c) => [String(c?.id || "").trim(), c]));
      const emailToCandidateIds = new Map();
      const phoneToCandidateIds = new Map();
      for (const c of candidates || []) {
        const id = String(c?.id || "").trim();
        if (!id) continue;
        const email = normalizeEmail(c?.email || c?.emailId || "");
        const phone = normalizePhone(c?.phone || c?.phoneNumber || "");
        if (email) emailToCandidateIds.set(email, (emailToCandidateIds.get(email) || []).concat(id));
        if (phone) phoneToCandidateIds.set(phone, (phoneToCandidateIds.get(phone) || []).concat(id));
      }
      const pickUnique = (arr) => (Array.isArray(arr) && arr.length === 1 ? arr[0] : "");

      const assessmentsById = new Map((assessments || []).map((a) => [String(a?.id || "").trim(), a]));
      let repairedAssessments = 0;
      let repairedCandidates = 0;
      let clearedCandidates = 0;

      // 1) Ensure every assessment has candidate_id and every linked candidate points back to the assessment.
      for (const assessment of assessments || []) {
        const assessmentId = String(assessment?.id || "").trim();
        if (!assessmentId) continue;
        let candidateId = String(
          assessment?.candidateId ||
          assessment?.candidate_id ||
          assessment?.payload?.candidateId ||
          assessment?.payload?.candidate_id ||
          ""
        ).trim();
        if (candidateId && !candidatesById.has(candidateId)) candidateId = "";
        if (!candidateId) {
          const email = normalizeEmail(assessment?.emailId || assessment?.email_id || assessment?.payload?.emailId || "");
          const phone = normalizePhone(assessment?.phoneNumber || assessment?.phone_number || assessment?.payload?.phoneNumber || "");
          if (email) candidateId = pickUnique(emailToCandidateIds.get(email));
          if (!candidateId && phone) candidateId = pickUnique(phoneToCandidateIds.get(phone));
        }
        if (!candidateId) continue;

        const canonicalCandidateId = String(candidateId).trim();
        const existingCandidateId = String(assessment?.candidateId || assessment?.candidate_id || "").trim();
        if (existingCandidateId !== canonicalCandidateId) {
          await patchAssessmentCandidateLink({
            actorUserId: actor.id,
            companyId: actor.companyId,
            assessmentId,
            candidateId: canonicalCandidateId
          });
          repairedAssessments += 1;
        }

        const candidate = candidatesById.get(canonicalCandidateId) || null;
        const currentAssessmentId = String(candidate?.assessment_id || candidate?.assessmentId || "").trim();
        if (candidate && currentAssessmentId !== assessmentId) {
          await linkCandidateToAssessment(canonicalCandidateId, assessmentId, { companyId: actor.companyId });
          repairedCandidates += 1;
        }
      }

      // 2) Clear any candidate.assessment_id that points to a missing/mismatched assessment.
      for (const candidate of candidates || []) {
        const candidateId = String(candidate?.id || "").trim();
        const assessmentId = String(candidate?.assessment_id || candidate?.assessmentId || "").trim();
        if (!candidateId || !assessmentId) continue;
        const assessment = assessmentsById.get(assessmentId) || null;
        const linkedCandidateId = String(
          assessment?.candidateId ||
          assessment?.candidate_id ||
          assessment?.payload?.candidateId ||
          assessment?.payload?.candidate_id ||
          ""
        ).trim();
        if (!assessment || !linkedCandidateId || linkedCandidateId !== candidateId) {
          await patchCandidate(candidateId, { assessment_id: "", used_in_assessment: false }, { companyId: actor.companyId });
          clearedCandidates += 1;
        }
      }

      sendJson(res, 200, { ok: true, result: { repairedAssessments, repairedCandidates, clearedCandidates } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/candidates/backfill-search-embeddings") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      if (String(actor.role || "").toLowerCase() !== "admin") {
        throw new Error("Only an admin can backfill candidate embeddings.");
      }
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
      if (!apiKey) throw new Error("Missing OPENAI_API_KEY on server.");

      const body = await readJsonBody(req);
      const limit = Math.max(1, Math.min(2000, Number(body?.limit || 300) || 300));
      const force = body?.force === true;

      const candidates = await listCandidatesForUser(actor, { limit: 5000, scope: "company" });
      let updated = 0;
      let skipped = 0;
      let failed = 0;

      for (const candidate of Array.isArray(candidates) ? candidates : []) {
        if (updated >= limit) break;
        const existingDraft = candidate?.draft_payload && typeof candidate.draft_payload === "object" ? candidate.draft_payload : {};
        const existingEmbedding = Array.isArray(existingDraft?.search_embedding_v1) ? existingDraft.search_embedding_v1 : Array.isArray(existingDraft?.searchEmbeddingV1) ? existingDraft.searchEmbeddingV1 : null;
        const existingHash = String(existingDraft?.search_embedding_text_hash || existingDraft?.searchEmbeddingTextHash || "").trim();

        const universeItem = buildCandidateSearchUniverse([candidate], [], [])[0] || null;
        const embeddingText = buildCandidateSemanticText(universeItem || { raw: { candidate }, notesText: candidate?.notes || "" });
        const textHash = hashText(embeddingText);

        if (!force && existingEmbedding && existingEmbedding.length && existingHash && existingHash === textHash) {
          skipped += 1;
          continue;
        }

        try {
          const embedding = await createEmbedding({ apiKey, text: embeddingText });
          if (!embedding.length) {
            skipped += 1;
            continue;
          }
          const nextDraft = {
            ...existingDraft,
            search_embedding_v1: embedding,
            search_embedding_model: String(process.env.OPENAI_EMBEDDINGS_MODEL || "text-embedding-3-small").trim(),
            search_embedding_text_hash: textHash,
            search_embedding_updated_at: new Date().toISOString()
          };
          await patchCandidate(String(candidate.id || "").trim(), { draft_payload: nextDraft }, { companyId: actor.companyId });
          updated += 1;
        } catch (error) {
          failed += 1;
          console.warn("Embedding backfill failed:", error?.message || error);
        }
      }

      sendJson(res, 200, { ok: true, result: { updated, skipped, failed, limit } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/candidates/backfill-skills") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const result = await backfillCandidateSkillsFromMetadata(user);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/dashboard") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const clientFilter = String(requestUrl.searchParams.get("clientLabel") || "").trim();
      const recruiterFilter = String(requestUrl.searchParams.get("recruiterLabel") || "").trim();
      const [candidates, assessments, jobs] = await Promise.all([
        listCandidatesForUser(user, { limit: 5000 }),
        listAssessments({ actorUserId: user.id, companyId: user.companyId }),
        listCompanyJobs(user.companyId, user.id)
      ]);
      const summary = buildDashboardSummary({ candidates, assessments, jobs, dateFrom, dateTo, clientFilter, recruiterFilter, actor: user });
      const availableClients = Array.from(
        new Set((Array.isArray(candidates) ? candidates : []).map((candidate) => getClientLabel(candidate, {})).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
      const actorIsAdmin = String(user?.role || "").toLowerCase() === "admin";
      const actorName = String(user?.name || "").trim();
      const availableRecruiters = Array.from(
        new Set((Array.isArray(candidates) ? candidates : []).map((candidate) => {
          const source = String(candidate?.source || "").trim().toLowerCase();
          const isApplicant = source === "website" || source === "website_apply" || source === "hosted_apply";
          const owner = getOwnerRecruiterLabel(candidate, {});
          if (actorIsAdmin && actorName && isApplicant && owner === "Unassigned") return actorName;
          return owner;
        }).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
      sendJson(res, 200, {
        ok: true,
        result: {
          role: user.role,
          recruiterName: user.name,
          companyName: user.companyName,
          availableClients,
          availableRecruiters,
          summary
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/client-portal") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      await requireSuiteModulesAccess(user, "Client module");
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const clientFilter = String(requestUrl.searchParams.get("clientLabel") || "").trim();
      const [candidates, assessments, jobs] = await Promise.all([
        listCandidatesForUser(user, { limit: 5000 }),
        listAssessments({ actorUserId: user.id, companyId: user.companyId }),
        listCompanyJobs(user.companyId, user.id)
      ]);
      const summary = buildClientPortalSummary({ candidates, assessments, jobs, dateFrom, dateTo, clientFilter });
      const availableClients = Array.from(
        new Set((Array.isArray(candidates) ? candidates : []).map((candidate) => getClientLabel(candidate, {})).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
      sendJson(res, 200, {
        ok: true,
        result: {
          summary,
          availableClients
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/applicants/list") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(user, "applied candidates pipeline");
      const limit = Math.max(1, Math.min(1000, Number(requestUrl.searchParams.get("limit") || 50)));
      const page = Math.max(1, Number(requestUrl.searchParams.get("page") || 1));
      const includeConverted = String(requestUrl.searchParams.get("includeConverted") || "false").trim().toLowerCase() === "true";
      const filters = {
        q: String(requestUrl.searchParams.get("q") || "").trim(),
        dateFrom: String(requestUrl.searchParams.get("dateFrom") || "").trim(),
        dateTo: String(requestUrl.searchParams.get("dateTo") || "").trim(),
        clients: String(requestUrl.searchParams.get("clients") || "").trim(),
        jds: String(requestUrl.searchParams.get("jds") || "").trim(),
        locations: String(requestUrl.searchParams.get("locations") || "").trim(),
        ownedBy: String(requestUrl.searchParams.get("ownedBy") || "").trim(),
        assignedTo: String(requestUrl.searchParams.get("assignedTo") || "").trim(),
        activeStates: String(requestUrl.searchParams.get("activeStates") || "").trim()
      };
      const listResult = await listApplicantsForUser(user, { limit, page, includeConverted, filters });
      sendJson(res, 200, {
        ok: true,
        result: {
          page: Number(listResult?.page || page),
          limit: Number(listResult?.limit || limit),
          total: Number(listResult?.total || 0),
          totalPages: Number(listResult?.totalPages || 1),
          items: Array.isArray(listResult?.items) ? listResult.items : []
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/captured/list") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(user, "captured notes pipeline");
      const limit = Math.max(1, Math.min(200, Number(requestUrl.searchParams.get("limit") || 25)));
      const page = Math.max(1, Number(requestUrl.searchParams.get("page") || 1));
      const filters = {
        q: String(requestUrl.searchParams.get("q") || "").trim(),
        view: String(requestUrl.searchParams.get("view") || "all").trim(),
        dateFrom: String(requestUrl.searchParams.get("dateFrom") || "").trim(),
        dateTo: String(requestUrl.searchParams.get("dateTo") || "").trim(),
        clients: String(requestUrl.searchParams.get("clients") || "").trim(),
        jds: String(requestUrl.searchParams.get("jds") || "").trim(),
        assignedTo: String(requestUrl.searchParams.get("assignedTo") || "").trim(),
        capturedBy: String(requestUrl.searchParams.get("capturedBy") || "").trim(),
        sources: String(requestUrl.searchParams.get("sources") || "").trim(),
        outcomes: String(requestUrl.searchParams.get("outcomes") || "").trim(),
        activeStates: String(requestUrl.searchParams.get("activeStates") || "").trim()
      };
      const listResult = await listCapturedForUser(user, { limit, page, filters });
      sendJson(res, 200, {
        ok: true,
        result: {
          page: Number(listResult?.page || page),
          limit: Number(listResult?.limit || limit),
          total: Number(listResult?.total || 0),
          totalPages: Number(listResult?.totalPages || 1),
          items: Array.isArray(listResult?.items) ? listResult.items : []
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/captured/stats") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(user, "captured notes pipeline");
      const filters = {
        q: String(requestUrl.searchParams.get("q") || "").trim(),
        view: String(requestUrl.searchParams.get("view") || "all").trim(),
        dateFrom: String(requestUrl.searchParams.get("dateFrom") || "").trim(),
        dateTo: String(requestUrl.searchParams.get("dateTo") || "").trim(),
        clients: String(requestUrl.searchParams.get("clients") || "").trim(),
        jds: String(requestUrl.searchParams.get("jds") || "").trim(),
        assignedTo: String(requestUrl.searchParams.get("assignedTo") || "").trim(),
        capturedBy: String(requestUrl.searchParams.get("capturedBy") || "").trim(),
        sources: String(requestUrl.searchParams.get("sources") || "").trim(),
        outcomes: String(requestUrl.searchParams.get("outcomes") || "").trim(),
        activeStates: String(requestUrl.searchParams.get("activeStates") || "").trim()
      };
      const stats = await getCapturedStatsForUser(user, { filters });
      sendJson(res, 200, { ok: true, result: stats });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/applicants/stats") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(user, "applied candidates pipeline");
      const filters = {
        q: String(requestUrl.searchParams.get("q") || "").trim(),
        dateFrom: String(requestUrl.searchParams.get("dateFrom") || "").trim(),
        dateTo: String(requestUrl.searchParams.get("dateTo") || "").trim(),
        clients: String(requestUrl.searchParams.get("clients") || "").trim(),
        jds: String(requestUrl.searchParams.get("jds") || "").trim(),
        locations: String(requestUrl.searchParams.get("locations") || "").trim(),
        ownedBy: String(requestUrl.searchParams.get("ownedBy") || "").trim(),
        assignedTo: String(requestUrl.searchParams.get("assignedTo") || "").trim(),
        activeStates: String(requestUrl.searchParams.get("activeStates") || "").trim()
      };
      const stats = await getApplicantStatsForUser(user, { filters });
      sendJson(res, 200, { ok: true, result: stats });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/applicants") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(user, "applied candidates pipeline");
      const limit = Math.max(1, Math.min(1000, Number(requestUrl.searchParams.get("limit") || 50)));
      const page = Math.max(1, Number(requestUrl.searchParams.get("page") || 1));
      const includeConverted = String(requestUrl.searchParams.get("includeConverted") || "false").trim().toLowerCase() === "true";
      const filters = {
        q: String(requestUrl.searchParams.get("q") || "").trim(),
        dateFrom: String(requestUrl.searchParams.get("dateFrom") || "").trim(),
        dateTo: String(requestUrl.searchParams.get("dateTo") || "").trim(),
        clients: String(requestUrl.searchParams.get("clients") || "").trim(),
        jds: String(requestUrl.searchParams.get("jds") || "").trim(),
        locations: String(requestUrl.searchParams.get("locations") || "").trim(),
        ownedBy: String(requestUrl.searchParams.get("ownedBy") || "").trim(),
        assignedTo: String(requestUrl.searchParams.get("assignedTo") || "").trim(),
        activeStates: String(requestUrl.searchParams.get("activeStates") || "").trim()
      };
      const [listResult, stats] = await Promise.all([
        listApplicantsForUser(user, { limit, page, includeConverted, filters }),
        getApplicantStatsForUser(user, { filters })
      ]);
      sendJson(res, 200, {
        ok: true,
        result: {
          page: Number(listResult?.page || page),
          limit: Number(listResult?.limit || limit),
          items: Array.isArray(listResult?.items) ? listResult.items : [],
          stats,
          total: Number(listResult?.total || stats?.total || 0),
          totalPages: Number(listResult?.totalPages || 1)
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/linkedin-assist/screenshot") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const uploadedFile = body.file || body.uploadedFile || null;
      if (!uploadedFile?.fileData) {
        throw new Error("Missing screenshot file.");
      }
      const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
      if (!apiKey) throw new Error("Missing OPENAI_API_KEY on server.");

      const extracted = await extractLinkedInAssistFromScreenshotWithAi({
        apiKey,
        model: String(body.model || "").trim() || "gpt-4o-mini",
        uploadedFile: {
          filename: uploadedFile.filename || uploadedFile.name || "screenshot.png",
          mimeType: uploadedFile.mimeType || uploadedFile.type || "image/png",
          fileData: String(uploadedFile.fileData || "").replace(/^data:[^;]+;base64,/i, "")
        }
      });

      const name = String(extracted?.name || "").trim();
      const company = String(extracted?.company || "").trim();
      const role = String(extracted?.role || "").trim();
      const location = String(extracted?.location || "").trim();
      const linkedin = String(extracted?.linkedin || "").trim();
      const email = String(extracted?.email || "").trim();
      const phone = String(extracted?.phone || "").trim();
      const currentCtc = String(extracted?.currentCtc || "").trim();
      const expectedCtc = String(extracted?.expectedCtc || "").trim();
      const noticePeriod = String(extracted?.noticePeriod || "").trim();
      const highestEducation = String(extracted?.highestEducation || "").trim();
      const totalExperience = String(extracted?.totalExperience || "").trim();

      const query = [name, role, company, location, totalExperience].filter(Boolean).join(" ");
      const finalQuery = query ? `"${query.replace(/\"/g, " ").trim()}" site:linkedin.com/in` : "site:linkedin.com/in";
      const url = linkedin && /linkedin\.com\/in\//i.test(linkedin)
        ? String(linkedin).replace(/^http:\/\//i, "https://")
        : `https://www.google.com/search?q=${encodeURIComponent(finalQuery)}`;

      sendJson(res, 200, {
        ok: true,
        result: {
          extracted: {
            name: extracted?.name ?? null,
            company: extracted?.company ?? null,
            role: extracted?.role ?? null,
            location: extracted?.location ?? null,
            linkedin: extracted?.linkedin ?? null,
            email: email || null,
            phone: phone || null,
            currentCtc: currentCtc || null,
            expectedCtc: expectedCtc || null,
            noticePeriod: noticePeriod || null,
            highestEducation: highestEducation || null,
            totalExperience: totalExperience || null
          },
          query: finalQuery,
          url
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/applicant-intake-secret") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(actor, "job apply links");
      const result = await getCompanyApplicantIntakeSecret(actor.companyId);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && /^\/company\/candidates\/[^/]+\/share-profile-link$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(actor, "Direct Share");
      const candidateId = String(requestUrl.pathname.replace(/^\/company\/candidates\//, "").replace(/\/share-profile-link$/, "")).trim();
      const candidate = (await listCandidatesForUser(actor, { id: candidateId, limit: 1 }))[0] || null;
      if (!candidate) throw new Error("Candidate not found or not allowed.");
      const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 45;
      const token = createSignedCandidateShareToken({
        type: "shared_candidate",
        companyId: actor.companyId,
        candidateId: String(candidate?.id || candidateId || "").trim(),
        candidateName: String(candidate?.name || "").trim(),
        expiresAt
      });
      const baseUrl = getRequestBaseUrl(req);
      sendJson(res, 200, {
        ok: true,
        result: {
          token,
          expiresAt: new Date(expiresAt).toISOString(),
          url: `${baseUrl}/shared/candidate?token=${encodeURIComponent(token)}`
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && /^\/company\/jobs\/[^/]+\/apply-link-signatures$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(actor, "job apply links");
      const jobId = String(requestUrl.pathname.replace(/^\/company\/jobs\//, "").replace(/\/apply-link-signatures$/, "")).trim();
      if (!jobId) throw new Error("Missing job id.");
      const jobs = await listCompanyJobs(actor.companyId, actor.id);
      const job = (jobs || []).find((item) => String(item?.id || "").trim() === jobId) || null;
      if (!job) throw new Error("Job not found in this company.");
      const secretInfo = await getCompanyApplicantIntakeSecret(actor.companyId);
      const secret = String(secretInfo?.applicantIntakeSecret || "").trim();
      if (!secret) throw new Error("Applicant intake secret is not configured yet.");

      const recruiterSeeds = Array.isArray(job.assignedRecruiters) && job.assignedRecruiters.length
        ? job.assignedRecruiters
        : job.ownerRecruiterId
          ? [{ id: job.ownerRecruiterId, name: job.ownerRecruiterName || "", primary: true }]
          : [];
      const recruiterIds = recruiterSeeds.map((item) => String(item?.id || "").trim()).filter(Boolean);
      const actorRole = String(actor.role || "").trim().toLowerCase();
      const actorId = String(actor.id || "").trim();
      if (actorRole !== "admin") {
        const actorAllowed = actorId && recruiterIds.includes(actorId);
        if (!actorAllowed) {
          throw new Error("You are not assigned to this JD.");
        }
      }
      const allUsers = await listCompanyUsers(actor.companyId);
      const items = recruiterIds
        .map((rid) => {
          const user = (allUsers || []).find((u) => String(u?.id || "").trim() === rid) || null;
          if (!user) return null;
          const sigFull = signRecruiterApplyLink({ companyId: actor.companyId, jobId, recruiterId: rid, secret });
          const sig = sigFull ? sigFull.slice(0, 12) : "";
          if (!sig) return null;
          return { recruiterId: rid, recruiterName: String(user.name || "").trim(), sig };
        })
        .filter(Boolean);
      const filteredItems = actorRole === "admin"
        ? items
        : items.filter((item) => String(item?.recruiterId || "").trim() === actorId);
      sendJson(res, 200, { ok: true, result: { jobId, items: filteredItems } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && /^\/company\/candidates\/[^/]+\/cv$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerTokenFromRequest(req, requestUrl));
      const candidateId = String(requestUrl.pathname.replace(/^\/company\/candidates\//, "").replace(/\/cv$/, "")).trim();
      const wantBranded = ["1", "true", "yes", "branded"].includes(String(requestUrl.searchParams.get("mode") || "").trim().toLowerCase());
      const forceDownload = ["1", "true", "yes", "download", "attachment"].includes(String(requestUrl.searchParams.get("download") || "").trim().toLowerCase());
      const requestedCandidateName = String(requestUrl.searchParams.get("candidate_name") || "").trim();
      const requestedHeaderLine = String(requestUrl.searchParams.get("header_line") || "").trim();
      const candidate = (await listCandidatesForUser(actor, { id: candidateId, limit: 1 }))[0] || null;
      const meta = candidate ? decodeApplicantMetadata(candidate) : {};
      const cachedStoredFile = meta?.cvAnalysisCache?.storedFile && typeof meta.cvAnalysisCache.storedFile === "object"
        ? meta.cvAnalysisCache.storedFile
        : null;
      const fallbackFileRef = inferStoredFileRefFromUrl(actor, requestUrl);
      const fileRef = (meta.fileProvider || meta.fileKey || meta.fileUrl)
        ? {
            provider: meta.fileProvider,
            key: meta.fileKey,
            url: meta.fileUrl,
            filename: meta.filename,
            mimeType: meta.mimeType
          }
        : (cachedStoredFile && (cachedStoredFile.key || cachedStoredFile.url))
          ? {
              provider: cachedStoredFile.provider,
              key: cachedStoredFile.key,
              url: cachedStoredFile.url,
              filename: cachedStoredFile.filename,
              mimeType: cachedStoredFile.mimeType
            }
        : fallbackFileRef;
      if (!fileRef || (!fileRef.key && !fileRef.url)) {
        if (!candidate) throw new Error("Candidate not found in this company.");
        throw new Error("CV file not available for this candidate.");
      }
      const file = await loadStoredFile(fileRef);
      const isPdf = String(file.mimeType || "").toLowerCase().includes("pdf") || /\.pdf$/i.test(String(file.filename || ""));
      const fileEtag = `"${sha256Hex(file.buffer)}"`;
      if (wantBranded) {
        if (!isPdf) throw new Error("Branded CV is available only for PDF files.");
        const brandedCtx = await resolveBrandedCvContext({
          companyId: String(actor.companyId || "").trim(),
          companyName: String(actor?.companyName || actor?.company_name || "").trim() || "Your Company",
          candidate,
          assessment: null
        });
        let headerLine = String(brandedCtx.headerLine || "").trim();
        if (!headerLine && requestedHeaderLine) headerLine = requestedHeaderLine;
        const candidateName = String(brandedCtx.candidateName || requestedCandidateName || "").trim() || "Candidate Name";
        const cacheKey = buildBrandedCvResponseCacheKey({
          route: "/company/candidates/:id/cv",
          companyId: String(actor.companyId || "").trim(),
          candidateId,
          forceDownload,
          companyName: brandedCtx.companyName,
          candidateName,
          headerLine,
          resumeFormatting: brandedCtx.resumeFormatting,
          fileBuffer: file.buffer
        });
        const brandedName = `${toSafeCvFilenameBase(candidateName)}_CV.pdf`;
        const contentDisposition = `${forceDownload ? "attachment" : "inline"}; filename="${brandedName.replace(/"/g, "")}"`;
        const cachedBrandedPdf = getBrandedCvResponseFromCache(cacheKey);
        if (cachedBrandedPdf?.buffer && cachedBrandedPdf?.etag) {
          sendConditionalBuffer(req, res, 200, cachedBrandedPdf.buffer, {
            "Content-Type": cachedBrandedPdf.contentType || "application/pdf",
            "Content-Disposition": cachedBrandedPdf.contentDisposition || contentDisposition,
            "Cache-Control": cachedBrandedPdf.cacheControl || "private, max-age=0, must-revalidate",
            "ETag": cachedBrandedPdf.etag,
            "X-Branded-Fallback-Used": cachedBrandedPdf.brandedFallbackUsed ? "1" : "0"
          });
          return;
        }
        const brandedPdf = await buildBrandedPdfBuffer({
          pdfBase64: file.buffer.toString("base64"),
          companyName: brandedCtx.companyName,
          resumeFormatting: brandedCtx.resumeFormatting,
          candidateName,
          headerLine
        });
        if (brandedPdf?.brandedFallbackUsed) {
          console.warn("[branded-cv] branded_fallback_used=true route=/company/candidates/cv");
        }
        const brandedEtag = `"${sha256Hex(brandedPdf.buffer)}"`;
        const cacheControl = "private, max-age=0, must-revalidate";
        setBrandedCvResponseCache(cacheKey, {
          buffer: brandedPdf.buffer,
          etag: brandedEtag,
          cacheControl,
          contentType: "application/pdf",
          contentDisposition,
          brandedFallbackUsed: brandedPdf?.brandedFallbackUsed
        });
        sendConditionalBuffer(req, res, 200, brandedPdf.buffer, {
          "Content-Type": "application/pdf",
          "Content-Disposition": contentDisposition,
          "Cache-Control": cacheControl,
          "ETag": brandedEtag,
          "X-Branded-Fallback-Used": brandedPdf?.brandedFallbackUsed ? "1" : "0"
        });
        return;
      }
      const downloadName = String(file.filename || "resume.pdf").replace(/"/g, "");
      sendConditionalBuffer(req, res, 200, file.buffer, {
        "Content-Type": String(file.mimeType || "application/octet-stream").trim(),
        "Content-Disposition": `${forceDownload ? "attachment" : "inline"}; filename="${downloadName}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "ETag": fileEtag
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/shared/cv") {
    try {
      const token = String(requestUrl.searchParams.get("token") || "").trim();
      const payload = readSignedCvShareToken(token);
      if (!payload) throw new Error("Invalid or expired CV share link.");
      const wantBranded = ["1", "true", "yes", "branded"].includes(String(requestUrl.searchParams.get("mode") || "").trim().toLowerCase())
        || payload?.branded === true;
      const file = await loadStoredFile({
        provider: payload.fileProvider,
        key: payload.fileKey,
        url: payload.fileUrl,
        filename: payload.filename,
        mimeType: payload.mimeType
      });
      const fileEtag = `"${sha256Hex(file.buffer)}"`;
      if (wantBranded && String(file.mimeType || payload.mimeType || "").toLowerCase().includes("pdf")) {
        const scopedCompanyId = String(payload.companyId || "").trim();
        let resolvedCandidateName = String(payload.candidateName || "Candidate Name").trim() || "Candidate Name";
        let resolvedHeaderLine = String(payload.headerLine || "").trim();
        let resolvedResumeFormatting = {};
        const payloadCandidateId = String(payload.candidateId || "").trim();
        if (payloadCandidateId && scopedCompanyId) {
          const candidate = (await listCandidates({
            id: payloadCandidateId,
            companyId: scopedCompanyId,
            limit: 1
          }).catch(() => []))[0] || null;
          const brandedCtx = await resolveBrandedCvContext({
            companyId: scopedCompanyId,
            companyName: String(payload.companyName || "Your Company").trim() || "Your Company",
            candidate,
            assessment: null
          });
          resolvedResumeFormatting = brandedCtx.resumeFormatting;
          resolvedCandidateName = String(brandedCtx.candidateName || resolvedCandidateName).trim() || resolvedCandidateName;
          resolvedHeaderLine = String(brandedCtx.headerLine || resolvedHeaderLine).trim() || resolvedHeaderLine;
        } else {
          const sharedSettings = await getCompanySharedExportPresets(scopedCompanyId).catch(() => ({}));
          resolvedResumeFormatting = sharedSettings?.resumeFormatting && typeof sharedSettings.resumeFormatting === "object"
            ? sharedSettings.resumeFormatting
            : {};
        }
        const brandedName = `${toSafeCvFilenameBase(resolvedCandidateName)}_CV.pdf`;
        const cacheKey = buildBrandedCvResponseCacheKey({
          route: "/shared/cv",
          companyId: scopedCompanyId,
          candidateId: payloadCandidateId,
          assessmentId: String(payload.assessmentId || "").trim(),
          forceDownload: false,
          companyName: String(payload.companyName || "Your Company").trim() || "Your Company",
          candidateName: resolvedCandidateName,
          headerLine: resolvedHeaderLine,
          resumeFormatting: resolvedResumeFormatting,
          fileBuffer: file.buffer
        });
        const contentDisposition = `inline; filename="${brandedName.replace(/"/g, "")}"`;
        const cachedBrandedPdf = getBrandedCvResponseFromCache(cacheKey);
        if (cachedBrandedPdf?.buffer && cachedBrandedPdf?.etag) {
          sendConditionalBuffer(req, res, 200, cachedBrandedPdf.buffer, {
            "Content-Type": cachedBrandedPdf.contentType || "application/pdf",
            "Content-Disposition": cachedBrandedPdf.contentDisposition || contentDisposition,
            "Cache-Control": cachedBrandedPdf.cacheControl || "private, max-age=0, must-revalidate",
            "ETag": cachedBrandedPdf.etag,
            "X-Branded-Fallback-Used": cachedBrandedPdf.brandedFallbackUsed ? "1" : "0"
          });
          return;
        }
        const brandedPdf = await buildBrandedPdfBuffer({
          pdfBase64: file.buffer.toString("base64"),
          companyName: String(payload.companyName || "Your Company").trim() || "Your Company",
          resumeFormatting: resolvedResumeFormatting,
          candidateName: resolvedCandidateName,
          headerLine: resolvedHeaderLine
        });
        if (brandedPdf?.brandedFallbackUsed) {
          console.warn("[branded-cv] branded_fallback_used=true route=/shared/cv");
        }
        const brandedEtag = `"${sha256Hex(brandedPdf.buffer)}"`;
        const cacheControl = "private, max-age=0, must-revalidate";
        setBrandedCvResponseCache(cacheKey, {
          buffer: brandedPdf.buffer,
          etag: brandedEtag,
          cacheControl,
          contentType: "application/pdf",
          contentDisposition,
          brandedFallbackUsed: brandedPdf?.brandedFallbackUsed
        });
        sendConditionalBuffer(req, res, 200, brandedPdf.buffer, {
          "Content-Type": "application/pdf",
          "Content-Disposition": contentDisposition,
          "Cache-Control": cacheControl,
          "ETag": brandedEtag,
          "X-Branded-Fallback-Used": brandedPdf?.brandedFallbackUsed ? "1" : "0"
        });
        return;
      }
      const downloadName = String(file.filename || payload.filename || "resume.pdf").replace(/"/g, "");
      sendConditionalBuffer(req, res, 200, file.buffer, {
        "Content-Type": String(file.mimeType || payload.mimeType || "application/octet-stream").trim(),
        "Content-Disposition": `inline; filename="${downloadName}"`,
        "Cache-Control": "private, max-age=0, must-revalidate",
        "ETag": fileEtag
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/assessments/by-id") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const assessmentId = String(requestUrl.searchParams.get("assessmentId") || "").trim();
      if (!assessmentId) throw new Error("assessmentId is required.");
      const assessment = await getAssessmentById({
        companyId: user.companyId,
        assessmentId
      });
      if (!assessment) throw new Error("Assessment not found.");
      sendJson(res, 200, { ok: true, result: assessment });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/applicant-intake-secret") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(actor, "job apply links");
      const body = await readJsonBody(req);
      const result = await setCompanyApplicantIntakeSecret({
        actorUserId: actor.id,
        companyId: actor.companyId,
        applicantIntakeSecret: body.applicantIntakeSecret || body.applicant_intake_secret || body.secret
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && requestUrl.pathname === "/company/applicants") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(actor, "applied candidates pipeline");
      if (actor.role !== "admin") {
        throw new Error("Only an admin can remove applicants.");
      }
      const candidateId = String(requestUrl.searchParams.get("id") || "").trim();
      const result = await deleteCandidate(candidateId, { companyId: actor.companyId });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && /^\/company\/candidates\/[^/]+$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const candidateId = String(requestUrl.pathname.replace(/^\/company\/candidates\//, "")).trim();
      const result = await deleteCandidate(candidateId, { companyId: actor.companyId });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/applicants/link-assessment") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(actor, "applied candidates pipeline");
      if (actor.role !== "admin") {
        throw new Error("Only an admin can convert applicants.");
      }
      const body = await readJsonBody(req);
      const result = await linkCandidateToAssessment(body.id || body.candidateId, body.assessment_id || body.assessmentId, { companyId: actor.companyId });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/applicants/assign") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(actor, "applied candidates pipeline");
      if (actor.role !== "admin") {
        throw new Error("Only an admin can assign applicants.");
      }
      const body = await readJsonBody(req);
      const result = await assignCandidate(body.id || body.candidateId, {
        assigned_to_user_id: body.assigned_to_user_id || body.assignedToUserId,
        assigned_to_name: body.assigned_to_name || body.assignedToName,
        assigned_by_user_id: actor.id,
        assigned_by_name: actor.name,
        assigned_jd_id: body.assigned_jd_id || body.assignedJdId,
        assigned_jd_title: body.assigned_jd_title || body.assignedJdTitle,
        jd_title: body.jd_title || body.jdTitle,
        client_name: body.client_name || body.clientName
      }, { companyId: actor.companyId });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && /^\/company\/candidates\/[^/]+\/share-cv-link$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const candidateId = String(requestUrl.pathname.replace(/^\/company\/candidates\//, "").replace(/\/share-cv-link$/, "")).trim();
      const candidate = (await listCandidatesForUser(actor, { id: candidateId, limit: 1 }))[0] || null;
      const meta = candidate ? decodeApplicantMetadata(candidate) : {};
      const cachedStoredFile = meta?.cvAnalysisCache?.storedFile && typeof meta.cvAnalysisCache.storedFile === "object"
        ? meta.cvAnalysisCache.storedFile
        : null;
      const fallbackFileRef = inferStoredFileRefFromUrl(actor, requestUrl);
      const fileProvider = meta.fileProvider || cachedStoredFile?.provider || fallbackFileRef?.provider || "";
      const fileKey = meta.fileKey || cachedStoredFile?.key || fallbackFileRef?.key || "";
      const fileUrl = meta.fileUrl || cachedStoredFile?.url || fallbackFileRef?.url || "";
      const filename = meta.filename || cachedStoredFile?.filename || fallbackFileRef?.filename || "resume.pdf";
      const mimeType = meta.mimeType || cachedStoredFile?.mimeType || fallbackFileRef?.mimeType || "application/octet-stream";
      if (!fileProvider && !fileKey && !fileUrl) {
        throw new Error("CV file not available for this candidate.");
      }
      const wantBranded = ["1", "true", "yes"].includes(String(requestUrl.searchParams.get("branded") || "").trim().toLowerCase());
      const sharedSettings = wantBranded ? await getCompanySharedExportPresets(actor.companyId).catch(() => ({})) : {};
      const resumeFormatting = sharedSettings?.resumeFormatting && typeof sharedSettings.resumeFormatting === "object"
        ? sharedSettings.resumeFormatting
        : {};
      const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 45;
      const token = createSignedCvShareToken({
        type: "shared_cv",
        companyId: actor.companyId,
        candidateId: String(candidate?.id || candidateId || "").trim(),
        candidateName: String(candidate?.name || requestUrl.searchParams.get("candidate_name") || "").trim(),
        headerLine: buildResumeHeaderLineFromCandidate(candidate || {}, resumeFormatting),
        companyName: String(actor?.companyName || actor?.company_name || "Your Company").trim() || "Your Company",
        branded: wantBranded,
        fileProvider,
        fileKey,
        fileUrl,
        filename,
        mimeType,
        expiresAt
      });
      const baseUrl = getRequestBaseUrl(req);
      sendJson(res, 200, {
        ok: true,
        result: {
          token,
          expiresAt: new Date(expiresAt).toISOString(),
          url: `${baseUrl}/shared/cv?token=${encodeURIComponent(token)}${wantBranded ? "&mode=branded" : ""}`
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/share-cv-link") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const candidateId = String(requestUrl.searchParams.get("candidate_id") || "").trim();
      const candidateName = String(requestUrl.searchParams.get("candidate_name") || "").trim();
      const candidateEmail = String(requestUrl.searchParams.get("candidate_email") || "").trim();
      const candidatePhone = String(requestUrl.searchParams.get("candidate_phone") || "").trim();
      const candidateJdTitle = String(requestUrl.searchParams.get("jd_title") || "").trim();
      const fallbackFileRef = inferStoredFileRefFromUrl(actor, requestUrl);
      let matchedCandidate = null;
      if (!fallbackFileRef) {
        const candidatePool = await listCandidatesForUser(actor, { limit: 5000 });
        matchedCandidate = findBestCandidateByIdentity(candidatePool, {
          candidateId,
          email: candidateEmail,
          phone: candidatePhone,
          name: candidateName,
          jdTitle: candidateJdTitle
        });
      }
      const matchedMeta = decodeApplicantMetadata(matchedCandidate || {});
      const matchedStoredFile = matchedMeta?.cvAnalysisCache?.storedFile && typeof matchedMeta.cvAnalysisCache.storedFile === "object"
        ? matchedMeta.cvAnalysisCache.storedFile
        : null;
      const fileProvider = String(requestUrl.searchParams.get("cv_provider") || matchedMeta.fileProvider || matchedStoredFile?.provider || fallbackFileRef?.provider || "").trim();
      const fileKey = String(requestUrl.searchParams.get("cv_key") || matchedMeta.fileKey || matchedStoredFile?.key || fallbackFileRef?.key || "").trim();
      const fileUrl = String(requestUrl.searchParams.get("cv_url") || matchedMeta.fileUrl || matchedStoredFile?.url || fallbackFileRef?.url || "").trim();
      const filename = String(requestUrl.searchParams.get("cv_filename") || matchedMeta.filename || matchedStoredFile?.filename || fallbackFileRef?.filename || "resume.pdf").trim();
      const mimeType = String(requestUrl.searchParams.get("cv_mime_type") || matchedMeta.mimeType || matchedStoredFile?.mimeType || fallbackFileRef?.mimeType || "application/octet-stream").trim();
      if (!fileProvider && !fileKey && !fileUrl) {
        throw new Error("CV file not available for sharing.");
      }
      const wantBranded = ["1", "true", "yes"].includes(String(requestUrl.searchParams.get("branded") || "").trim().toLowerCase());
      const sharedSettings = wantBranded ? await getCompanySharedExportPresets(actor.companyId).catch(() => ({})) : {};
      const resumeFormatting = sharedSettings?.resumeFormatting && typeof sharedSettings.resumeFormatting === "object"
        ? sharedSettings.resumeFormatting
        : {};
      const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 45;
      const token = createSignedCvShareToken({
        type: "shared_cv",
        companyId: actor.companyId,
        candidateId: String(matchedCandidate?.id || candidateId || "").trim(),
        candidateName: String(matchedCandidate?.name || candidateName || "").trim(),
        headerLine: buildResumeHeaderLineFromCandidate(matchedCandidate || {}, resumeFormatting),
        companyName: String(actor?.companyName || actor?.company_name || "Your Company").trim() || "Your Company",
        branded: wantBranded,
        fileProvider,
        fileKey,
        fileUrl,
        filename,
        mimeType,
        expiresAt
      });
      const baseUrl = getRequestBaseUrl(req);
      sendJson(res, 200, {
        ok: true,
        result: {
          token,
          expiresAt: new Date(expiresAt).toISOString(),
          url: `${baseUrl}/shared/cv?token=${encodeURIComponent(token)}${wantBranded ? "&mode=branded" : ""}`
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && /^\/company\/candidates\/[^/]+\/interview-cv$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const candidateId = String(requestUrl.pathname.replace(/^\/company\/candidates\//, "").replace(/\/interview-cv$/, "")).trim();
      if (!candidateId) throw new Error("Candidate not found.");
      const candidate = (await listCandidatesForUser(actor, { id: candidateId, limit: 1 }))[0] || null;
      if (!candidate) throw new Error("Candidate not found in this company.");
      const existingMeta = decodeApplicantMetadata(candidate);
      const nextMeta = { ...(existingMeta || {}) };
      delete nextMeta.filename;
      delete nextMeta.mimeType;
      delete nextMeta.fileProvider;
      delete nextMeta.fileKey;
      delete nextMeta.fileUrl;
      delete nextMeta.cvAnalysisCache;
      await patchCandidate(candidate.id, {
        raw_note: encodeApplicantMetadata(nextMeta)
      }, { companyId: actor.companyId });
      sendJson(res, 200, { ok: true, result: { removed: true } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/public/applicants/intake") {
    try {
      const body = await readJsonBody(req);
      const companyId = String(body?.companyId || body?.company_id || "").trim();
      if (!companyId) throw new Error("Company context missing.");
      if (!(await isPortalCompanyApproved(companyId))) {
        throw new Error("Job apply link is available on SaaS Unlimited (Rs 4999).");
      }
      const result = await ingestApplicantSubmission(body, req);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && /\/public\/jobs\/[^/]+\/apply$/.test(requestUrl.pathname)) {
    try {
      const jobId = String(requestUrl.pathname.replace(/^\/public\/jobs\//, "").replace(/\/apply$/, "").replace(/\/+$/, "")).trim();
      if (!jobId) throw new Error("Job not found.");
      const job = await getPublicCompanyJob(jobId);
      if (!(await isPortalCompanyApproved(job.companyId))) {
        throw new Error("Job apply link is available on SaaS Unlimited (Rs 4999).");
      }
      const body = await readJsonBody(req);
      const payload = {
        ...(body || {}),
        companyId: job.companyId,
        jdTitle: String(body?.jdTitle || job.title || "").trim(),
        clientName: String(body?.clientName || job.clientName || "").trim(),
        jobId: job.id,
        sourcePlatform: String(body?.sourcePlatform || "hosted_apply").trim(),
        sourceLabel: String(body?.sourceLabel || "RecruitDesk Apply Link").trim(),
        parseWithAi: body?.parseWithAi !== false
      };
      const result = await ingestApplicantSubmission(payload, {
        ...req,
        headers: {
          ...(req.headers || {}),
          "x-applicant-intake-secret": String((await getCompanyApplicantIntakeSecret(job.companyId))?.applicantIntakeSecret || "")
        }
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/candidates/search-natural") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(user, "database save and search");
      const query = String(requestUrl.searchParams.get("q") || "").trim();
      const queryMode = String(requestUrl.searchParams.get("mode") || "natural").trim().toLowerCase();
      const debug = String(requestUrl.searchParams.get("debug") || "").trim() === "1";
      const semanticEnabled = String(requestUrl.searchParams.get("semantic") || "").trim() !== "0";
      const normalized = normalizeRecruiterQuery(query, DEFAULT_SYNONYMS);
      const heuristic = parseNaturalLanguageCandidateQuery(normalized.normalized || query);
      const ruleParsed = { ...(heuristic || {}), raw: query };
      let filters = ruleParsed;
      let parsedQueryJson = null;
      let mergedBeforeValidation = { ...filters };
      let chosenSearchMode = queryMode === "ai" ? "ai_primary_parser" : "rule_parser";
      let searchPathUsed = "deterministic_db_filter";
      let intentRoute = resolveSearchIntentRoute("candidate_search");
      if (query && queryMode === "ai") {
        const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
        if (apiKey) {
          try {
            parsedQueryJson = await parseRecruiterQueryWithOpenAI(normalized.normalized || query, { apiKey, actor: user });
            filters = mapOpenAiParsedToDeterministicFilters(parsedQueryJson);
            filters.raw = query;
            mergedBeforeValidation = { ...filters };
            intentRoute = resolveSearchIntentRoute(parsedQueryJson?.intent);
            chosenSearchMode = intentRoute.chosenSearchMode;
            searchPathUsed = intentRoute.searchPath;
          } catch (error) {
            console.warn("AI query interpretation failed, falling back to heuristic parser:", error?.message || error);
            filters = { ...ruleParsed };
            mergedBeforeValidation = { ...filters };
            chosenSearchMode = "rule_fallback_after_ai_error";
          }
        } else {
          filters = { ...ruleParsed };
          mergedBeforeValidation = { ...filters };
          chosenSearchMode = "rule_fallback_no_openai_key";
        }
      }

      // Legacy parser stays as fallback only. OpenAI output remains primary and is never overwritten.
      if (queryMode !== "ai" || !parsedQueryJson) {
        if (heuristic) {
          if (!filters.dateFrom && heuristic.dateFrom) filters.dateFrom = heuristic.dateFrom;
          if (!filters.dateTo && heuristic.dateTo) filters.dateTo = heuristic.dateTo;
          if (!filters.dateField && heuristic.dateField) filters.dateField = heuristic.dateField;
          if (!filters.sourceTypeFilter && heuristic.sourceTypeFilter) filters.sourceTypeFilter = heuristic.sourceTypeFilter;
          if (!filters.recruiterScope && heuristic.recruiterScope) filters.recruiterScope = heuristic.recruiterScope;
          if (!filters.recruiterName && heuristic.recruiterName) filters.recruiterName = heuristic.recruiterName;
          if (!filters.recruiterField && heuristic.recruiterField) filters.recruiterField = heuristic.recruiterField;
          if (!filters.location && heuristic.location) filters.location = heuristic.location;
          if (!filters.attemptOutcome && heuristic.attemptOutcome) filters.attemptOutcome = heuristic.attemptOutcome;
          if (!filters.assessmentStatus && heuristic.assessmentStatus) filters.assessmentStatus = heuristic.assessmentStatus;
          if ((!Array.isArray(filters.locations) || !filters.locations.length) && Array.isArray(heuristic.locations) && heuristic.locations.length) {
            filters.locations = heuristic.locations;
          }
          if ((!Array.isArray(filters.domainKeywords) || !filters.domainKeywords.length) && Array.isArray(heuristic.domainKeywords) && heuristic.domainKeywords.length) {
            filters.domainKeywords = heuristic.domainKeywords;
          }
          if (String(filters.skillsMatch || "").trim() === "" && heuristic.skillsMatch) filters.skillsMatch = heuristic.skillsMatch;
        }
      }

      // Normalize location aliases even in AI mode.
      if (filters.location) {
        const alias = mapLocationAlias(filters.location, DEFAULT_SYNONYMS);
        if (alias?.canonical) filters.location = alias.canonical;
        const existing = Array.isArray(filters.locations) ? filters.locations : [];
        const merged = Array.from(new Set([...existing, ...(alias?.variants || []), alias?.canonical].filter(Boolean).map((v) => String(v).trim())));
        if (merged.length) filters.locations = merged;
      }

      // Post-normalization patches:
      // The AI interpreter can sometimes miss obvious skill tokens (e.g. "golang").
      // Keep behavior backward compatible by only adding skills when they are explicitly present in the normalized query.
      if (normalized?.normalized) {
        const qLower = String(normalized.normalized || "").toLowerCase();
        const nextSkills = Array.isArray(filters?.skills) ? [...filters.skills] : [];
        if (/\bgolang\b/.test(qLower) && !nextSkills.some((s) => String(s || "").toLowerCase() === "golang")) {
          nextSkills.push("golang");
        }
        filters.skills = normalizeCandidateSearchKeywords(nextSkills);
      }

      const queryDateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const queryDateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const clientFilter = String(requestUrl.searchParams.get("clientLabel") || "").trim();
      const recruiterFilter = String(requestUrl.searchParams.get("recruiterLabel") || "").trim();
      if (queryDateFrom && !filters.dateFrom) filters.dateFrom = queryDateFrom;
      if (queryDateTo && !filters.dateTo) filters.dateTo = queryDateTo;
      if (clientFilter && !filters.client) filters.client = clientFilter;
      const [candidates, assessments, jobs] = await Promise.all([
        listCandidatesForUser(user, { limit: 5000, scope: "company" }),
        listAssessments({ actorUserId: user.id, companyId: user.companyId }),
        listCompanyJobs(user.companyId, user.id)
      ]);
      const universe = buildCandidateSearchUniverse(candidates, assessments, jobs);

      // Optional: attach persisted search-docs (if table exists). This improves boolean/AI matching
      // without changing any workflow behavior. Missing table/rows are treated as a no-op.
      try {
        const docs = await listCandidateSearchDocsForCompany(user.companyId);
        const byId = new Map((docs || []).map((row) => [String(row?.candidate_id || "").trim(), row]));
        for (const item of universe) {
          const candidateId = String(item?.raw?.candidate?.id || item?.id || "").trim();
          if (!candidateId) continue;
          const doc = byId.get(candidateId) || null;
          if (!doc) continue;
          if (!item.raw || typeof item.raw !== "object") item.raw = { candidate: item?.raw?.candidate || null, assessment: item?.raw?.assessment || null, metadata: null };
          if (!item.raw.metadata || typeof item.raw.metadata !== "object") item.raw.metadata = {};
          if (doc?.doc_v1) item.raw.metadata.searchDocV1 = String(doc.doc_v1 || "").trim();
          // Provide a safe excerpt for semantic text building (avoid loading huge payloads into UI).
          if (!item.hiddenCvText && doc?.cv_text_full) {
            const cvText = String(doc.cv_text_full || "");
            item.hiddenCvText = cvText.length > 60000 ? `${cvText.slice(0, 60000)}...` : cvText;
          }
        }
      } catch (_) {}

      // Disambiguate "in <client>" vs "in <location>" when the token matches a known client label.
      // Example: "sourced by Ankit in Faircent" should treat Faircent as client, not a city.
      if (!filters.client) {
        const clientMap = new Map();
        universe.forEach((item) => {
          const label = String(item?.clientName || "").trim();
          if (!label) return;
          clientMap.set(normalizeDashboardText(label).toLowerCase(), label);
        });
        const locToken = String(filters.location || "").trim();
        if (locToken) {
          const matchedClient = clientMap.get(normalizeDashboardText(locToken).toLowerCase()) || "";
          if (matchedClient) {
            filters.client = matchedClient;
            filters.location = "";
            filters.locations = [];
          }
        }
      }

      // Final validation/conflict resolver pass.
      if (queryMode === "ai" && parsedQueryJson) {
        filters = validateOpenAiPrimaryFilters(filters, {
          query: normalized.normalized || query,
          universe,
          synonyms: DEFAULT_SYNONYMS
        });
      } else {
        filters = sanitizeCandidateSearchFilters(filters, normalized.normalized || query, universe, DEFAULT_SYNONYMS);
      }
      const finalValidatedFilters = { ...filters };

      const scopedUniverse = universe.filter((item) => !recruiterFilter || String(item.ownerRecruiter || "").trim() === recruiterFilter);
      const semanticAllowedByIntent = intentRoute.semanticAllowed;
      const useSemantic = semanticEnabled && semanticAllowedByIntent;
      if (useSemantic) {
        searchPathUsed = "deterministic_db_filter_with_semantic_rerank";
      } else if (queryMode === "ai" && parsedQueryJson) {
        searchPathUsed = "deterministic_db_filter_only";
      }
      const searchingAsBoolean = "";
      const effectiveQueryMode = queryMode;
      const effectiveRawQuery = query;
      const apiKey = useSemantic ? String(process.env.OPENAI_API_KEY || "").trim() : "";
      const hybrid = await hybridSearchCandidates({
        universe: scopedUniverse,
        actor: user,
        rawQuery: effectiveRawQuery,
        normalizedQuery: normalized.normalized,
        filters,
        queryMode: effectiveQueryMode,
        apiKey,
        synonyms: DEFAULT_SYNONYMS,
        helpers: {
          buildHay: buildCandidateSearchHay,
          matchesNatural: candidateMatchesNaturalFilter,
          matchesBoolean: candidateMatchesBooleanQuery,
          matchesLooseTokens: candidateMatchesLooseNaturalTokens
        },
        options: {
          debug,
          semantic: useSemantic,
          semanticTopK: 80,
          parseExperienceToYears,
          isPlainLookup: isPlainCandidateLookupQuery,
          buildNaturalSearchFallbackTokens,
          normalizeDashboardText
        }
      });
      let finalHybrid = hybrid;
      if (
        query &&
        queryMode === "ai" &&
        semanticAllowedByIntent &&
        Array.isArray(hybrid?.items) &&
        hybrid.items.length === 0 &&
        parsedQueryJson?.filters &&
        (
          (Array.isArray(parsedQueryJson.filters.fallbackKeywords) && parsedQueryJson.filters.fallbackKeywords.length > 0) ||
          (Array.isArray(parsedQueryJson.filters.jobTitleKeywords) && parsedQueryJson.filters.jobTitleKeywords.length > 0)
        )
      ) {
        const fallbackTokens = normalizeCandidateSearchKeywords(
          Array.from(
            new Set([
              ...(Array.isArray(parsedQueryJson.filters.fallbackKeywords) ? parsedQueryJson.filters.fallbackKeywords : []),
              ...(Array.isArray(parsedQueryJson.filters.jobTitleKeywords) ? parsedQueryJson.filters.jobTitleKeywords : [])
            ])
          )
        );
          if (fallbackTokens.length > 0) {
            const fallbackFilters = sanitizeCandidateSearchFilters(
              {
                ...filters,
                role: "",
                roleFamilies: [],
              skills: fallbackTokens,
              skillsMatch: "any"
            },
            normalized.normalized || query,
            universe,
            DEFAULT_SYNONYMS
          );
          finalHybrid = await hybridSearchCandidates({
            universe: scopedUniverse,
            actor: user,
            rawQuery: effectiveRawQuery,
            normalizedQuery: normalized.normalized,
            filters: fallbackFilters,
            queryMode: effectiveQueryMode,
            apiKey,
            synonyms: DEFAULT_SYNONYMS,
            helpers: {
              buildHay: buildCandidateSearchHay,
              matchesNatural: candidateMatchesNaturalFilter,
              matchesBoolean: candidateMatchesBooleanQuery,
              matchesLooseTokens: candidateMatchesLooseNaturalTokens
            },
            options: {
              debug,
              semantic: useSemantic,
              semanticTopK: 80,
              parseExperienceToYears,
              isPlainLookup: isPlainCandidateLookupQuery,
              buildNaturalSearchFallbackTokens,
              normalizeDashboardText
            }
          });
          filters = fallbackFilters;
        }
      }
      const matches = (finalHybrid.items || []).map((item) => {
        // Keep backward-compatible "universe" shape but also flatten the most-used candidate fields
        // so exports/indicators do not depend on raw.candidate.
        const candidate = item?.raw?.candidate && typeof item.raw.candidate === "object" ? item.raw.candidate : {};
        const assessment = item?.raw?.assessment && typeof item.raw.assessment === "object" ? item.raw.assessment : {};
        const draftPayload = candidate?.draft_payload && typeof candidate.draft_payload === "object"
          ? candidate.draft_payload
          : candidate?.draftPayload && typeof candidate.draftPayload === "object"
            ? candidate.draftPayload
            : {};
        const screeningAnswers = candidate?.screening_answers && typeof candidate.screening_answers === "object"
          ? candidate.screening_answers
          : candidate?.screeningAnswers && typeof candidate.screeningAnswers === "object"
            ? candidate.screeningAnswers
            : {};
        return {
          ...item,
          // core contact fields
          phone: String(candidate?.phone || assessment?.phoneNumber || assessment?.phone || "").trim(),
          email: String(candidate?.email || assessment?.emailId || assessment?.email || "").trim(),
          linkedin: String(candidate?.linkedin || assessment?.linkedinUrl || "").trim(),
          // common indicator fields
          current_ctc: String(candidate?.current_ctc || assessment?.currentCtc || "").trim(),
          expected_ctc: String(candidate?.expected_ctc || assessment?.expectedCtc || "").trim(),
          notice_period: String(candidate?.notice_period || assessment?.noticePeriod || "").trim(),
          lwd_or_doj: String(candidate?.lwd_or_doj || assessment?.lwdOrDoj || assessment?.offerDoj || "").trim(),
          // structured Q/A sources used by Screening remarks indicator
          draft_payload: draftPayload,
          screening_answers: screeningAnswers,
          other_standard_questions: String(candidate?.last_contact_notes || candidate?.other_standard_questions || assessment?.other_standard_questions || "").trim()
        };
      });
      sendJson(res, 200, {
        ok: true,
        result: {
          query,
          queryMode,
          searchingAsBoolean,
          normalizedQuery: normalized.normalized,
          filters: finalHybrid.filters || filters,
          interpretation: parsedQueryJson,
          ...(debug ? {
            debug: {
              rawQuery: query,
              openAiParsed: parsedQueryJson,
              ruleParsed,
              mergedBeforeValidation,
              finalValidatedFilters,
              chosenSearchMode,
              sqlOrSearchPath: searchPathUsed,
              semanticAllowedByIntent,
              semanticRequested: semanticEnabled,
              semanticUsed: useSemantic,
              hybridDebug: finalHybrid.debug || null
            }
          } : {}),
          total: matches.length,
          items: matches
        }
      });
      if (query && queryMode === "ai") {
        console.info(
          "[ai-query-parser]",
          JSON.stringify({
            rawQuery: query,
            normalizedQuery: normalized.normalized,
            parsed: parsedQueryJson,
            resultCount: matches.length
          })
        );
      }
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/candidates/search-parse-feedback") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      if (String(user?.role || "").toLowerCase() !== "admin") {
        throw new Error("Only admin can submit parse feedback.");
      }
      const body = await readJsonBody(req);
      const queryText = String(body?.query || "").trim();
      const mode = String(body?.mode || "").trim().toLowerCase();
      const semantic = body?.semantic === true;
      const note = String(body?.note || "").trim();
      const parseDebug = body?.parseDebug && typeof body.parseDebug === "object" ? body.parseDebug : {};
      if (!queryText) throw new Error("Query is required.");

      let persisted = false;
      let warning = "";
      try {
        await insertSearchParseFeedback({
          companyId: user.companyId,
          userId: user.id,
          userName: user.name,
          mode,
          semantic,
          query: queryText,
          note,
          parseDebug
        });
        persisted = true;
      } catch (error) {
        warning = String(error?.message || error || "Could not persist parse feedback.");
        console.warn("Search parse feedback persistence failed:", warning);
        try {
          const logDir = path.join(__dirname, "logs");
          if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
          fs.appendFileSync(
            path.join(logDir, "search-parse-feedback.log"),
            `${JSON.stringify({
              at: new Date().toISOString(),
              companyId: user.companyId,
              userId: user.id,
              userName: user.name,
              mode,
              semantic,
              query: queryText,
              note,
              parseDebug
            })}\n`,
            "utf8"
          );
        } catch (inner) {
          console.warn("Search parse feedback local log fallback failed:", String(inner?.message || inner || ""));
        }
      }

      sendJson(res, 200, {
        ok: true,
        result: {
          persisted,
          warning
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/dashboard/drilldown") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const metric = String(requestUrl.searchParams.get("metric") || "").trim();
      const groupType = String(requestUrl.searchParams.get("groupType") || "").trim();
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const clientFilter = String(requestUrl.searchParams.get("clientFilter") || "").trim();
      const recruiterFilter = String(requestUrl.searchParams.get("recruiterFilter") || "").trim();
      const params = {
        clientLabel: String(requestUrl.searchParams.get("clientLabel") || "").trim(),
        recruiterLabel: String(requestUrl.searchParams.get("recruiterLabel") || "").trim(),
        positionLabel: String(requestUrl.searchParams.get("positionLabel") || "").trim()
      };
      const [candidates, assessments, jobs] = await Promise.all([
        listCandidatesForUser(user, { limit: 5000 }),
        listAssessments({ actorUserId: user.id, companyId: user.companyId }),
        listCompanyJobs(user.companyId, user.id)
      ]);
      const actorIsAdmin = String(user?.role || "").toLowerCase() === "admin";
      const actorName = String(user?.name || "").trim();
      const universe = buildCandidateSearchUniverse(candidates, assessments, jobs)
        .map((item) => {
          if (!actorIsAdmin || !actorName) return item;
          const rawSource = String(item?.raw?.candidate?.source || item?.source || "").trim().toLowerCase();
          const isApplicant = rawSource === "website" || rawSource === "website_apply" || rawSource === "hosted_apply";
          if (!isApplicant) return item;
          if (String(item?.ownerRecruiter || "").trim() !== "Unassigned") return item;
          return { ...item, ownerRecruiter: actorName };
        });
      const items = universe
        .filter((item) => item.sourceType !== "assessment_only")
        .filter((item) => !clientFilter || String(item.clientName || "").trim() === clientFilter)
        .filter((item) => !recruiterFilter || String(item.ownerRecruiter || "").trim() === recruiterFilter)
        .filter((item) => itemMatchesDashboardGroup(item, groupType, params))
        .filter((item) => itemMatchesDashboardMetric(item, metric, dateFrom, dateTo))
        .slice(0, 300);
      sendJson(res, 200, {
        ok: true,
        result: {
          metric,
          groupType,
          params,
          total: items.length,
          items
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/client-portal/drilldown") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      await requireSuiteModulesAccess(user, "Client module");
      const metric = String(requestUrl.searchParams.get("metric") || "").trim();
      const groupType = String(requestUrl.searchParams.get("groupType") || "").trim();
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const params = {
        clientLabel: String(requestUrl.searchParams.get("clientLabel") || "").trim(),
        positionLabel: String(requestUrl.searchParams.get("positionLabel") || "").trim()
      };
      const [candidates, assessments, jobs] = await Promise.all([
        listCandidatesForUser(user, { limit: 5000 }),
        listAssessments({ actorUserId: user.id, companyId: user.companyId }),
        listCompanyJobs(user.companyId, user.id)
      ]);
      const universe = buildCandidateSearchUniverse(candidates, assessments, jobs);
      const items = universe
        .filter((item) => item.sourceType !== "assessment_only")
        .filter((item) => itemMatchesDashboardGroup(item, groupType, params))
        .filter((item) => itemMatchesClientPortalMetric(item, metric, dateFrom, dateTo))
        .slice(0, 300);
      sendJson(res, 200, {
        ok: true,
        result: {
          metric,
          groupType,
          params,
          total: items.length,
          items
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/client-portal/summary") {
    try {
      const clientUser = await requireClientSessionUser(getBearerToken(req));
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const [candidates, assessments, jobs, copySettings] = await Promise.all([
        listCandidatesForUser({ id: "__client_scope__", companyId: clientUser.companyId, role: "admin" }, { limit: 5000 }),
        listAssessments({ actorUserId: "__client_scope__", companyId: clientUser.companyId }).catch(async () => {
          const allRecruiters = await listCompanyUsers(clientUser.companyId);
          const adminUser = (allRecruiters || []).find((item) => String(item?.role || "").toLowerCase() === "admin") || allRecruiters?.[0];
          if (!adminUser?.id) return [];
          return listAssessments({ actorUserId: adminUser.id, companyId: clientUser.companyId });
        }),
        listCompanyJobs(clientUser.companyId),
        getCompanySharedExportPresets(clientUser.companyId).catch(() => ({}))
      ]);
      const scopedUniverse = filterUniverseForClientUser(buildCandidateSearchUniverse(candidates, assessments, jobs), clientUser);
      const summary = buildClientPortalSummary({
        candidates: [],
        assessments: [],
        jobs: [],
        dateFrom,
        dateTo,
        clientFilter: clientUser.clientName
      });
      summary.overall = createClientPortalBucket();
      summary.byClient = [];
      summary.byClientPosition = [];
      summary.byStatus = [];
      const byPosition = new Map();
      const byStatus = new Map();
      const dateRange = { from: dateFrom, to: dateTo };
      for (const item of scopedUniverse.filter((entry) => entry.sourceType !== "assessment_only")) {
        if (!addClientPortalMetrics(summary.overall, item, dateRange)) continue;
        const statusBucket = getClientPortalLifecycleBucket(item);
        byStatus.set(statusBucket, Number(byStatus.get(statusBucket) || 0) + 1);
        const key = `${item.clientName}|||${item.position || "Unassigned"}`;
        if (!byPosition.has(key)) byPosition.set(key, { clientLabel: item.clientName, positionLabel: item.position || "Unassigned", metrics: createClientPortalBucket() });
        addClientPortalMetrics(byPosition.get(key).metrics, item, dateRange);
      }
      summary.byClient = [{ label: clientUser.clientName, metrics: summary.overall }];
      summary.byClientPosition = Array.from(byPosition.values()).sort((a, b) => `${a.clientLabel} ${a.positionLabel}`.localeCompare(`${b.clientLabel} ${b.positionLabel}`));
      summary.byStatus = Array.from(byStatus.entries()).map(([label, count]) => ({ label, count })).sort((a, b) => String(a.label).localeCompare(String(b.label)));
      const agenda = buildClientPortalAgenda(scopedUniverse, dateRange);
      sendJson(res, 200, { ok: true, result: { summary, agenda, user: clientUser, copySettings } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/client-portal/cv") {
    try {
      const clientUser = await requireClientSessionUser(getBearerTokenFromRequest(req, requestUrl));
      const assessmentId = String(requestUrl.searchParams.get("assessmentId") || requestUrl.searchParams.get("assessment_id") || "").trim();
      if (!assessmentId) throw new Error("assessmentId is required.");
      const allRecruiters = await listCompanyUsers(clientUser.companyId);
      const adminUser = (allRecruiters || []).find((item) => String(item?.role || "").toLowerCase() === "admin") || allRecruiters?.[0];
      if (!adminUser?.id) throw new Error("No recruiter found for this company.");
      const [assessments, candidates] = await Promise.all([
        listAssessments({ actorUserId: adminUser.id, companyId: clientUser.companyId }),
        listCandidatesForUser(adminUser, { limit: 5000 })
      ]);
      const assessment = (assessments || []).find((item) => String(item?.id || "") === assessmentId);
      if (!assessment) throw new Error("Assessment not found.");
      if (String(assessment.clientName || "").trim() !== String(clientUser.clientName || "").trim()) throw new Error("Not allowed for this client.");
      if (!itemMatchesAllowedPositions({ position: assessment.jdTitle || assessment.currentDesignation || "" }, clientUser.allowedPositions || [])) {
        throw new Error("Not allowed for this role.");
      }
      const matchedCandidate = findBestCandidateByIdentity(candidates || [], {
        candidateId: assessment.candidateId,
        email: assessment.emailId,
        phone: assessment.phoneNumber,
        name: assessment.candidateName,
        jdTitle: assessment.jdTitle
      });
      const meta = decodeApplicantMetadata(matchedCandidate || {});
      const storedFile = meta?.cvAnalysisCache?.storedFile && typeof meta.cvAnalysisCache.storedFile === "object" ? meta.cvAnalysisCache.storedFile : null;
      const fileRef = {
        provider: meta.fileProvider || storedFile?.provider || "",
        key: meta.fileKey || storedFile?.key || "",
        url: meta.fileUrl || storedFile?.url || "",
        filename: meta.filename || storedFile?.filename || "resume.pdf",
        mimeType: meta.mimeType || storedFile?.mimeType || "application/octet-stream"
      };
      if (!fileRef.provider && !fileRef.key && !fileRef.url) {
        throw new Error("CV file not available for this candidate.");
      }
      const file = await loadStoredFile(fileRef);
      const downloadName = String(file.filename || fileRef.filename || "resume.pdf").replace(/"/g, "");
      sendBuffer(req, res, 200, file.buffer, {
        "Content-Type": String(file.mimeType || fileRef.mimeType || "application/octet-stream").trim(),
        "Content-Disposition": `inline; filename="${downloadName}"`,
        "Cache-Control": "private, max-age=300"
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/client-portal/drilldown") {
    try {
      const clientUser = await requireClientSessionUser(getBearerToken(req));
      const metric = String(requestUrl.searchParams.get("metric") || "").trim();
      const groupType = String(requestUrl.searchParams.get("groupType") || "").trim();
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const params = {
        clientLabel: clientUser.clientName,
        positionLabel: String(requestUrl.searchParams.get("positionLabel") || "").trim()
      };
      const allRecruiters = await listCompanyUsers(clientUser.companyId);
      const adminUser = (allRecruiters || []).find((item) => String(item?.role || "").toLowerCase() === "admin") || allRecruiters?.[0];
      const [candidates, assessments, jobs] = await Promise.all([
        listCandidatesForUser(adminUser || { id: "__client_scope__", companyId: clientUser.companyId, role: "admin" }, { limit: 5000 }),
        adminUser?.id ? listAssessments({ actorUserId: adminUser.id, companyId: clientUser.companyId }) : [],
        listCompanyJobs(clientUser.companyId)
      ]);
      const items = filterUniverseForClientUser(buildCandidateSearchUniverse(candidates, assessments, jobs), clientUser)
        .filter((item) => item.sourceType !== "assessment_only")
        .filter((item) => itemMatchesDashboardGroup(item, groupType || "client", params))
        .filter((item) => itemMatchesClientPortalMetric(item, metric, dateFrom, dateTo))
        .slice(0, 300);
      sendJson(res, 200, { ok: true, result: { metric, groupType, params, total: items.length, items } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/client-portal/feedback") {
    try {
      const clientUser = await requireClientSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const assessmentId = String(body.assessmentId || "").trim();
      if (!assessmentId) throw new Error("assessmentId is required.");
      const allRecruiters = await listCompanyUsers(clientUser.companyId);
      const adminUser = (allRecruiters || []).find((item) => String(item?.role || "").toLowerCase() === "admin") || allRecruiters?.[0];
      if (!adminUser?.id) throw new Error("No recruiter found for this company.");
      const assessments = await listAssessments({ actorUserId: adminUser.id, companyId: clientUser.companyId });
      const assessment = (assessments || []).find((item) => String(item?.id || "") === assessmentId);
      if (!assessment) throw new Error("Assessment not found.");
      if (String(assessment.clientName || "").trim() !== String(clientUser.clientName || "").trim()) throw new Error("Not allowed for this client.");
      if (!itemMatchesAllowedPositions({ position: assessment.jdTitle || assessment.currentDesignation || "" }, clientUser.allowedPositions || [])) {
        throw new Error("Not allowed for this role.");
      }
      const nextStatus = String(body.status || assessment.candidateStatus || "").trim();
      const timestamp = new Date().toISOString();
      const nextInterviewAt = String(body.interviewAt || "").trim();
      const trimmedFeedback = String(body.feedback || "").trim();
      const nextHistory = [
        ...(Array.isArray(assessment.clientFeedbackHistory) ? assessment.clientFeedbackHistory : []),
        {
          status: nextStatus,
          feedback: trimmedFeedback,
          interviewAt: nextInterviewAt,
          updatedAt: timestamp,
          updatedBy: clientUser.username
        }
      ];
      const ownerRecruiter = (allRecruiters || []).find((item) => String(item?.id || "") === String(assessment.recruiterId || "").trim()) || adminUser;
      const saved = await saveAssessment({
        actorUserId: ownerRecruiter.id,
        companyId: clientUser.companyId,
        assessment: {
          ...assessment,
          candidateStatus: nextStatus,
          pipelineStage: assessment.pipelineStage || "Submitted",
          interviewAt: isInterviewAlignedStatus(nextStatus) ? (nextInterviewAt || assessment.interviewAt || "") : assessment.interviewAt,
          clientFeedback: trimmedFeedback,
          clientFeedbackStatus: nextStatus,
          clientFeedbackUpdatedAt: timestamp,
          clientFeedbackUpdatedBy: clientUser.username,
          clientFeedbackHistory: nextHistory
        }
      });
      if (saved?.id) {
        emitAssessmentStreamEvent(clientUser.companyId, "assessment_saved", {
          assessmentId: String(saved.id || "").trim(),
          candidateId: String(saved.candidateId || assessment?.candidateId || assessment?.candidate_id || "").trim(),
          assessment: saved
        });
      }
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/client-portal/agenda/complete") {
    try {
      const clientUser = await requireClientSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const assessmentId = String(body.assessmentId || body.assessment_id || "").trim();
      const kind = String(body.kind || "").trim().toLowerCase() === "joining" ? "joining" : "interview";
      if (!assessmentId) throw new Error("assessmentId is required.");
      const allRecruiters = await listCompanyUsers(clientUser.companyId);
      const adminUser = (allRecruiters || []).find((item) => String(item?.role || "").toLowerCase() === "admin") || allRecruiters?.[0];
      if (!adminUser?.id) throw new Error("No recruiter found for this company.");
      const assessments = await listAssessments({ actorUserId: adminUser.id, companyId: clientUser.companyId });
      const assessment = (assessments || []).find((item) => String(item?.id || "") === assessmentId);
      if (!assessment) throw new Error("Assessment not found.");
      if (String(assessment.clientName || "").trim() !== String(clientUser.clientName || "").trim()) throw new Error("Not allowed for this client.");
      if (!itemMatchesAllowedPositions({ position: assessment.jdTitle || assessment.currentDesignation || "" }, clientUser.allowedPositions || [])) {
        throw new Error("Not allowed for this role.");
      }
      const timestamp = new Date().toISOString();
      const nextStatus = kind === "joining" ? "Joined" : "Feedback Awaited";
      const note = kind === "joining"
        ? "Joining marked complete from client portal."
        : "Interview marked done from client portal.";
      const ownerRecruiter = (allRecruiters || []).find((item) => String(item?.id || "") === String(assessment.recruiterId || "").trim()) || adminUser;
      const nextStatusHistory = [
        ...(Array.isArray(assessment.statusHistory) ? assessment.statusHistory : []),
        {
          status: nextStatus,
          notes: note,
          updatedAt: timestamp,
          at: timestamp,
          updatedBy: clientUser.username
        }
      ];
      const nextFeedbackHistory = [
        ...(Array.isArray(assessment.clientFeedbackHistory) ? assessment.clientFeedbackHistory : []),
        {
          status: nextStatus,
          feedback: note,
          updatedAt: timestamp,
          updatedBy: clientUser.username
        }
      ];
      const saved = await saveAssessment({
        actorUserId: ownerRecruiter.id,
        companyId: clientUser.companyId,
        assessment: {
          ...assessment,
          candidateStatus: nextStatus,
          pipelineStage: assessment.pipelineStage || "Submitted",
          interviewAt: kind === "interview" ? "" : assessment.interviewAt,
          offerDoj: kind === "joining" ? "" : assessment.offerDoj,
          followUpAt: kind === "joining" ? "" : assessment.followUpAt,
          dateOfJoining: kind === "joining" ? (assessment.offerDoj || assessment.dateOfJoining || timestamp) : assessment.dateOfJoining,
          clientFeedback: note,
          clientFeedbackStatus: nextStatus,
          clientFeedbackUpdatedAt: timestamp,
          clientFeedbackUpdatedBy: clientUser.username,
          clientFeedbackHistory: nextFeedbackHistory,
          statusHistory: nextStatusHistory
        }
      });
      if (saved?.id) {
        emitAssessmentStreamEvent(clientUser.companyId, "assessment_saved", {
          assessmentId: String(saved.id || "").trim(),
          candidateId: String(saved.candidateId || assessment?.candidateId || assessment?.candidate_id || "").trim(),
          assessment: saved
        });
      }
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/candidates/search-jd-match") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(user, "database save and search");
      const body = await readJsonBody(req);
      const [candidates, assessments, jobs] = await Promise.all([
        listCandidatesForUser(user, { limit: 5000 }),
        listAssessments({ actorUserId: user.id, companyId: user.companyId }),
        listCompanyJobs(user.companyId, user.id)
      ]);
      const universe = buildCandidateSearchUniverse(candidates, assessments, jobs);
      const result = matchCandidatesToJd(universe, body || {});
      sendJson(res, 200, {
        ok: true,
        result
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/privacy/export") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      if (user.role !== "admin") {
        throw new Error("Only an admin can export company data.");
      }
      const [users, jobs, assessments, quickCapture] = await Promise.all([
        listCompanyUsers(user.companyId),
        listCompanyJobs(user.companyId, user.id),
        listAssessments({ actorUserId: user.id, companyId: user.companyId }),
        exportCompanyQuickCaptureData(user.companyId)
      ]);
      sendJson(res, 200, {
        ok: true,
        result: {
          exportedAt: new Date().toISOString(),
          companyId: user.companyId,
          users,
          jobs,
          assessments,
          candidates: quickCapture.candidates,
          contactAttempts: quickCapture.contactAttempts
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/assessments/search") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const assessments = await searchAssessments({
        actorUserId: user.id,
        companyId: user.companyId,
        q: String(requestUrl.searchParams.get("q") || "").trim(),
        limit: Number(requestUrl.searchParams.get("limit") || 25)
      });
      sendJson(res, 200, { ok: true, result: { assessments } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/assessments") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const incomingAssessment = body.assessment || body || {};
      const incomingCandidateId = String(incomingAssessment.candidateId || incomingAssessment.candidate_id || "").trim();
      if (!incomingCandidateId) {
        throw new Error("candidateId is required to create/update an assessment.");
      }
      // Ensure the candidate exists and is visible to the actor (admin can see all; recruiters see assigned/owned).
      const linkedCandidate = await ensureCandidateVisibleToActor(actor, incomingCandidateId);
      if (linkedCandidate?.hidden_from_captured) {
        throw new Error("This note is hidden/inactive. Restore to active first, then create/update an assessment.");
      }
      const assessment = await saveAssessment({
        actorUserId: actor.id,
        companyId: actor.companyId,
        assessment: { ...incomingAssessment, candidateId: incomingCandidateId }
      });
      if (assessment?.id) {
        // Canonical 1:1 link: candidates.assessment_id must always point to the assessment.id
        await linkCandidateToAssessment(incomingCandidateId, assessment.id, { companyId: actor.companyId });
        emitAssessmentStreamEvent(actor.companyId, "assessment_saved", {
          assessmentId: String(assessment.id || "").trim(),
          candidateId: incomingCandidateId,
          assessment
        });
      }
      sendJson(res, 200, { ok: true, result: assessment });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  // Lightweight endpoint to fetch latest CV parse result (stored in hidden metadata),
  // used by the portal to auto-fill blank draft fields after background parsing completes.
  if (req.method === "GET" && /^\/company\/candidates\/[^/]+\/cv-analysis$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerTokenFromRequest(req, requestUrl));
      const candidateId = String(requestUrl.pathname.replace(/^\/company\/candidates\//, "").replace(/\/cv-analysis$/, "")).trim();
      if (!candidateId) throw new Error("Candidate not found.");
      await ensureCandidateVisibleToActor(actor, candidateId);
      const candidate = (await listCandidatesForUser(actor, { id: candidateId, limit: 1 }))[0] || null;
      if (!candidate) throw new Error("Candidate not found in this company.");
      const meta = decodeApplicantMetadata(candidate);
      const cache = meta?.cvAnalysisCache && typeof meta.cvAnalysisCache === "object" ? meta.cvAnalysisCache : null;
      const storedFile = cache?.storedFile && typeof cache.storedFile === "object" ? cache.storedFile : null;
      const result = cache?.result && typeof cache.result === "object" ? cache.result : null;
      sendJson(res, 200, {
        ok: true,
        result: {
          parsePending: Boolean(cache?.parsePending),
          storedFile,
          analysis: result
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/assessments/restore") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const assessmentId = String(body.assessmentId || body.assessment_id || "").trim();
      if (!assessmentId) throw new Error("assessmentId is required.");

      const existing = await getAssessmentById({ companyId: actor.companyId, assessmentId });
      if (!existing) throw new Error("Assessment not found.");

      const candidateId = String(existing.candidateId || existing.candidate_id || "").trim();
      if (!candidateId) throw new Error("candidateId is required to restore an assessment.");

      const jdScreeningAnswers = normalizeJsonObjectInput(
        existing.jdScreeningAnswers
          || existing.jd_screening_answers
          || existing.payload?.jdScreeningAnswers
          || existing.payload?.jd_screening_answers
          || {}
      );
      const cvAnalysis = existing.cvAnalysis && typeof existing.cvAnalysis === "object"
        ? existing.cvAnalysis
        : existing.payload?.cvAnalysis && typeof existing.payload.cvAnalysis === "object"
          ? existing.payload.cvAnalysis
          : null;

      const draftPayload = {
        candidateName: String(existing.candidateName || "").trim(),
        phoneNumber: String(existing.phoneNumber || "").trim(),
        emailId: String(existing.emailId || "").trim(),
        linkedin: String(existing.linkedinUrl || "").trim(),
        location: String(existing.location || "").trim(),
        currentCtc: String(existing.currentCtc || "").trim(),
        expectedCtc: String(existing.expectedCtc || "").trim(),
        noticePeriod: String(existing.noticePeriod || "").trim(),
        offerInHand: String(existing.offerAmount || existing.offerInHand || "").trim(),
        lwdOrDoj: String(existing.lwdOrDoj || existing.lwd_or_doj || "").trim(),
        currentCompany: String(existing.currentCompany || "").trim(),
        currentDesignation: String(existing.currentDesignation || "").trim(),
        totalExperience: String(existing.totalExperience || "").trim(),
        relevantExperience: String(existing.relevantExperience || "").trim(),
        highestEducation: String(existing.highestEducation || "").trim(),
        currentOrgTenure: String(existing.currentOrgTenure || "").trim(),
        experienceTimeline: String(existing.experienceTimeline || existing.experience_timeline || "").trim(),
        reasonForChange: String(existing.reasonForChange || existing.reason_for_change || "").trim(),
        cautiousIndicators: String(existing.cautiousIndicators || existing.cautious_indicators || "").trim(),
        clientName: String(existing.clientName || "").trim(),
        jdTitle: String(existing.jdTitle || "").trim(),
        recruiterNotes: String(existing.recruiterNotes || existing.recruiterContextNotes || "").trim(),
        callbackNotes: String(existing.callbackNotes || "").trim(),
        otherPointers: String(existing.otherPointers || "").trim(),
        tags: String(existing.tags || "").trim(),
        candidateStatus: String(existing.candidateStatus || "").trim(),
        followUpAt: String(existing.followUpAt || "").trim(),
        interviewAt: String(existing.interviewAt || "").trim(),
        pipelineStage: String(existing.pipelineStage || "").trim(),
        statusHistory: Array.isArray(existing.statusHistory) ? existing.statusHistory : [],
        jdScreeningAnswers,
        cvAnalysis,
        cvAnalysisApplied: Boolean(existing.cvAnalysisApplied)
      };

      // If the candidate row was deleted, recreate a minimal one so restore doesn't fail.
      // We keep it assigned/owned by the actor so they can operate on it immediately.
      const candidate = await listCandidates({ id: candidateId, limit: 1, companyId: actor.companyId }).then((rows) => (rows && rows[0] ? rows[0] : null)).catch(() => null);
      if (!candidate) {
        const nextMeta = {
          jdScreeningAnswers,
          ...(cvAnalysis ? { cvAnalysisCache: { result: cvAnalysis, storedFile: cvAnalysis?.storedFile || null } } : {}),
          cautiousIndicators: draftPayload.cautiousIndicators || ""
        };
        await saveCandidate(
          {
            id: candidateId,
            company_id: actor.companyId,
            source: "restored_assessment",
            name: existing.candidateName || "",
            company: existing.currentCompany || "",
            role: existing.currentDesignation || existing.jdTitle || "",
            experience: existing.totalExperience || "",
            phone: existing.phoneNumber || "",
            email: existing.emailId || "",
            linkedin: existing.linkedinUrl || "",
            location: existing.location || "",
            recruiter_id: actor.id,
            recruiter_name: actor.name,
            assigned_to_user_id: actor.id,
            assigned_to_name: actor.name,
            used_in_assessment: true,
            assessment_id: assessmentId,
            jd_title: existing.jdTitle || "",
            client_name: existing.clientName || "",
            // Backfill rich draft data so trackers/search keep working after a restore.
            draft_payload: draftPayload,
            screening_answers: jdScreeningAnswers,
            raw_note: encodeApplicantMetadata(nextMeta)
          },
          { companyId: actor.companyId }
        );
      } else {
        const existingMeta = decodeApplicantMetadata(candidate || {});
        const nextMeta = {
          ...(existingMeta && typeof existingMeta === "object" ? existingMeta : {}),
          jdScreeningAnswers: Object.keys(jdScreeningAnswers).length ? jdScreeningAnswers : (existingMeta?.jdScreeningAnswers || {}),
          cautiousIndicators: draftPayload.cautiousIndicators || existingMeta?.cautiousIndicators || existingMeta?.cautious_indicators || "",
          ...(cvAnalysis ? { cvAnalysisCache: { ...(existingMeta?.cvAnalysisCache && typeof existingMeta.cvAnalysisCache === "object" ? existingMeta.cvAnalysisCache : {}), result: cvAnalysis, storedFile: cvAnalysis?.storedFile || existingMeta?.cvAnalysisCache?.storedFile || null } } : {})
        };
        await patchCandidate(candidateId, {
          used_in_assessment: true,
          assessment_id: assessmentId,
          jd_title: existing.jdTitle || candidate.jd_title || "",
          client_name: existing.clientName || candidate.client_name || "",
          recruiter_context_notes: draftPayload.recruiterNotes || candidate.recruiter_context_notes || "",
          other_pointers: draftPayload.otherPointers || candidate.other_pointers || "",
          draft_payload: draftPayload,
          screening_answers: jdScreeningAnswers,
          raw_note: encodeApplicantMetadata(nextMeta),
          updated_at: new Date().toISOString()
        }, { companyId: actor.companyId });
      }

      // Now restore assessment and relink canonically.
      const restored = await saveAssessment({
        actorUserId: actor.id,
        companyId: actor.companyId,
        assessment: {
          ...existing,
          id: assessmentId,
          candidateId,
          archived: false,
          archivedAt: "",
          archivedBy: ""
        }
      });
      if (restored?.id) {
        await linkCandidateToAssessment(candidateId, restored.id, { companyId: actor.companyId });
        emitAssessmentStreamEvent(actor.companyId, "assessment_restored", {
          assessmentId: String(restored.id || "").trim(),
          candidateId,
          assessment: restored
        });
      }
      sendJson(res, 200, { ok: true, result: restored });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && req.url === "/company/assessments") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const assessmentId = String(body.assessmentId || "").trim();
      const existing = assessmentId ? await getAssessmentById({ companyId: actor.companyId, assessmentId }).catch(() => null) : null;
      const result = await deleteAssessment({
        actorUserId: actor.id,
        companyId: actor.companyId,
        assessmentId
      });
      await unlinkAssessmentFromCompanyCandidates(actor.companyId, assessmentId);
      emitAssessmentStreamEvent(actor.companyId, "assessment_deleted", {
        assessmentId,
        candidateId: String(existing?.candidateId || existing?.candidate_id || "").trim(),
        assessment: existing || null
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/candidates") {
    try {
      const sessionUser = await requireSessionUser(getBearerToken(req));
      const limit = Math.max(1, Math.min(5000, Number(requestUrl.searchParams.get("limit") || 100)));
      const page = Math.max(1, Number(requestUrl.searchParams.get("page") || 1));
      const includeMeta = String(requestUrl.searchParams.get("includeMeta") || "").trim() === "1";
      const listOptions = {
        limit: includeMeta ? limit + 1 : limit,
        page,
        q: String(requestUrl.searchParams.get("q") || "").trim(),
        id: String(requestUrl.searchParams.get("id") || "").trim(),
        scope: String(requestUrl.searchParams.get("scope") || "").trim()
      };
      const result = await listCandidatesForUser(sessionUser, listOptions);
      if (includeMeta) {
        const rows = Array.isArray(result) ? result : [];
        const hasMore = rows.length > limit;
        sendJson(res, 200, { ok: true, result: { items: hasMore ? rows.slice(0, limit) : rows, page, limit, hasMore } });
        return;
      }
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/candidates/stats") {
    try {
      const sessionUser = await requireSessionUser(getBearerToken(req));
      const result = await getCandidateStatsForUser(sessionUser, {
        q: String(requestUrl.searchParams.get("q") || "").trim(),
        scope: String(requestUrl.searchParams.get("scope") || "").trim(),
        sourceScope: String(requestUrl.searchParams.get("source") || "").trim()
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "PATCH" && /^\/company\/candidates\/[^/]+$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const candidateId = String(requestUrl.pathname.replace(/^\/company\/candidates\//, "")).trim();
      const body = await readJsonBody(req);
      const input = body.patch || body || {};
      const screeningAnswers = Object.prototype.hasOwnProperty.call(input, "screening_answers") || Object.prototype.hasOwnProperty.call(input, "screeningAnswers")
        ? normalizeJsonObjectInput(input.screening_answers || input.screeningAnswers)
        : undefined;
      const draftPayload = Object.prototype.hasOwnProperty.call(input, "draft_payload") || Object.prototype.hasOwnProperty.call(input, "draftPayload")
        ? normalizeJsonObjectInput(input.draft_payload || input.draftPayload)
        : undefined;
      if (draftPayload && typeof draftPayload === "object") {
        const tenureValue = String(
          draftPayload.currentOrgTenure
          || draftPayload.current_org_tenure
          || ""
        ).trim();
        if (tenureValue) {
          draftPayload.currentOrgTenure = tenureValue;
          draftPayload.current_org_tenure = tenureValue;
        }
      }
      const fieldValueOrUndefined = (...keys) => {
        const hasAny = keys.some((key) => Object.prototype.hasOwnProperty.call(input, key));
        if (!hasAny) return undefined;
        const first = keys.find((key) => Object.prototype.hasOwnProperty.call(input, key));
        return String(input[first] ?? "").trim();
      };

      const patch = {
        name: fieldValueOrUndefined("name", "candidateName"),
        notes: fieldValueOrUndefined("notes"),
        recruiter_context_notes: fieldValueOrUndefined("recruiter_context_notes", "recruiterContextNotes"),
        other_pointers: fieldValueOrUndefined("other_pointers", "otherPointers"),
        company: fieldValueOrUndefined("company", "currentCompany"),
        role: fieldValueOrUndefined("role", "currentDesignation"),
        experience: fieldValueOrUndefined("experience", "totalExperience"),
        location: fieldValueOrUndefined("location"),
        current_ctc: fieldValueOrUndefined("current_ctc", "currentCtc"),
        expected_ctc: fieldValueOrUndefined("expected_ctc", "expectedCtc"),
        notice_period: fieldValueOrUndefined("notice_period", "noticePeriod"),
        lwd_or_doj: fieldValueOrUndefined("lwd_or_doj", "lwdOrDoj"),
        phone: fieldValueOrUndefined("phone", "phoneNumber"),
        email: fieldValueOrUndefined("email", "emailId"),
        linkedin: fieldValueOrUndefined("linkedin", "linkedinUrl"),
        highest_education: fieldValueOrUndefined("highest_education", "highestEducation", "highestQualification"),
        last_contact_outcome: fieldValueOrUndefined("last_contact_outcome", "lastContactOutcome"),
        last_contact_notes: fieldValueOrUndefined("last_contact_notes", "lastContactNotes"),
        last_contact_at: fieldValueOrUndefined("last_contact_at", "lastContactAt"),
        next_follow_up_at: Object.prototype.hasOwnProperty.call(input, "next_follow_up_at")
          ? normalizeNullableTimestampInput(input.next_follow_up_at)
          : Object.prototype.hasOwnProperty.call(input, "nextFollowUpAt")
            ? normalizeNullableTimestampInput(input.nextFollowUpAt)
            : undefined,
        hidden_from_captured: input.hidden_from_captured === true ? true : input.hidden_from_captured === false ? false : undefined,
        screening_answers: screeningAnswers,
        draft_payload: draftPayload,
        jd_title: fieldValueOrUndefined("jd_title", "jdTitle"),
        client_name: fieldValueOrUndefined("client_name", "clientName"),
        assigned_to_user_id: fieldValueOrUndefined("assigned_to_user_id", "assignedToUserId"),
        assigned_to_name: fieldValueOrUndefined("assigned_to_name", "assignedToName"),
        assigned_jd_id: fieldValueOrUndefined("assigned_jd_id", "assignedJdId"),
        assigned_jd_title: fieldValueOrUndefined("assigned_jd_title", "assignedJdTitle"),
        raw_note: fieldValueOrUndefined("raw_note", "rawNote")
      };
      if (Object.prototype.hasOwnProperty.call(input, "used_in_assessment")) {
        patch.used_in_assessment = input.used_in_assessment === true;
      }
      if (Object.prototype.hasOwnProperty.call(input, "assessment_id")) {
        const nextAssessmentId = input.assessment_id;
        patch.assessment_id = nextAssessmentId === null || nextAssessmentId === false || String(nextAssessmentId || "").trim() === ""
          ? null
          : String(nextAssessmentId).trim();
      }
      if (patch.hidden_from_captured === true) {
        patch.used_in_assessment = false;
        patch.assessment_id = null;
      }
      Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);
      const patchKeys = Object.keys(patch);
      const hideOnlyPatch = patchKeys.length === 1 && patchKeys[0] === "hidden_from_captured";
      if (hideOnlyPatch) {
        const result = await patchCandidate(candidateId, patch, { companyId: actor.companyId });
        emitCapturedStreamEvent(actor.companyId, "candidate_changed", { candidateId });
        sendJson(res, 200, { ok: true, result });
        return;
      }
      const existing = (await listCandidatesForUser(actor, { id: candidateId, limit: 1 }))[0] || null;
      if (existing) {
        if (Object.prototype.hasOwnProperty.call(patch, "draft_payload")) {
          patch.draft_payload = mergeDraftPayloadPreservingExisting(
            existing?.draft_payload || existing?.draftPayload || {},
            patch.draft_payload || {}
          );
        }
        const existingMeta = decodeApplicantMetadata(existing);
        const incomingMeta = Object.prototype.hasOwnProperty.call(patch, "raw_note")
          ? decodeApplicantMetadata({ raw_note: patch.raw_note })
          : {};
        const cvResult = existingMeta?.cvAnalysisCache?.result && typeof existingMeta.cvAnalysisCache.result === "object"
          ? existingMeta.cvAnalysisCache.result
          : null;
        const inferredSearchTags = deriveInferredSearchTags({
          cvResult,
          recruiterNotes: patch.recruiter_context_notes ?? existing.recruiter_context_notes ?? "",
          otherPointers: patch.other_pointers ?? existing.other_pointers ?? "",
          tags: Array.isArray(input.skills) ? input.skills : (Array.isArray(existing.skills) ? existing.skills : [])
        });
        const mergedMeta = {
          ...(existingMeta || {}),
          ...(incomingMeta || {}),
          inferredSearchTags
        };
        const mergedCandidate = { ...(existing || {}), ...(patch || {}) };
        const mergedDraft = patch.draft_payload && typeof patch.draft_payload === "object"
          ? patch.draft_payload
          : existing?.draft_payload && typeof existing.draft_payload === "object"
            ? existing.draft_payload
            : {};
        const mergedScreening = patch.screening_answers && typeof patch.screening_answers === "object"
          ? patch.screening_answers
          : existing?.screening_answers && typeof existing.screening_answers === "object"
            ? existing.screening_answers
            : {};
        const mergedCvResult = mergedMeta?.cvAnalysisCache?.result && typeof mergedMeta.cvAnalysisCache.result === "object"
          ? mergedMeta.cvAnalysisCache.result
          : cvResult && typeof cvResult === "object"
            ? cvResult
            : null;
        mergedMeta.searchDocV1 = deriveCandidateSearchDocV1FromParts({
          candidate: mergedCandidate,
          meta: mergedMeta,
          draftPayload: mergedDraft,
          screeningAnswers: mergedScreening,
          cvResult: mergedCvResult,
          inferredSearchTags
        });
        mergedMeta.searchDocUpdatedAt = new Date().toISOString();
        patch.raw_note = encodeApplicantMetadata({
          ...(mergedMeta || {})
        });
      }
      const result = await patchCandidate(candidateId, patch, { companyId: actor.companyId });
      emitCapturedStreamEvent(actor.companyId, "candidate_changed", { candidateId });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/candidates") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const candidate = sanitizeCandidateSavePayload(body.candidate || body || {}, actor);
      // Always keep a single "current owner". If caller didn't choose an assignee,
      // default to the current actor (admin can later assign to team).
      if (!String(candidate.assigned_to_user_id || "").trim() && !String(candidate.assigned_to_name || "").trim()) {
        candidate.assigned_to_user_id = actor.id;
        candidate.assigned_to_name = actor.name;
      }

      // Persist deterministic search doc for new saves (no backfill). This improves boolean/AI retrieval
      // while keeping current behavior for older records (computed on the fly).
      {
        const meta = decodeApplicantMetadata(candidate);
        const cvResult = meta?.cvAnalysisCache?.result && typeof meta.cvAnalysisCache.result === "object" ? meta.cvAnalysisCache.result : null;
        const inferredSearchTags = deriveInferredSearchTags({
          cvResult,
          recruiterNotes: candidate.recruiter_context_notes || "",
          otherPointers: candidate.other_pointers || "",
          tags: Array.isArray(candidate.skills) ? candidate.skills : []
        });
        const nextMeta = {
          ...(meta || {}),
          inferredSearchTags
        };
        nextMeta.searchDocV1 = deriveCandidateSearchDocV1FromParts({
          candidate,
          meta: nextMeta,
          draftPayload: candidate.draft_payload && typeof candidate.draft_payload === "object" ? candidate.draft_payload : {},
          screeningAnswers: candidate.screening_answers && typeof candidate.screening_answers === "object" ? candidate.screening_answers : {},
          cvResult,
          inferredSearchTags
        });
        nextMeta.searchDocUpdatedAt = new Date().toISOString();
        candidate.raw_note = encodeApplicantMetadata(nextMeta);
      }
      const duplicate = await findDuplicateCandidate(candidate, { companyId: actor.companyId });
      if (duplicate) {
        sendJson(res, 200, {
          ok: true,
          duplicate: true,
          duplicateBy: duplicate.matchBy,
          result: duplicate.existing
        });
        return;
      }
      const licenseBeforeSave = await getCompanyLicense(actor.companyId);
      if (!licenseBeforeSave.canCapture) {
        sendJson(res, 402, { ok: false, error: "Trial limit reached. Upgrade required to save more captures.", result: { license: licenseBeforeSave } });
        return;
      }
      const result = await saveCandidate(candidate, { companyId: actor.companyId });
      const license = await incrementCompanyCaptureUsage(actor.companyId, 1);
      emitCapturedStreamEvent(actor.companyId, "candidate_created", { candidateId: String(result?.id || "").trim() || undefined });
      sendJson(res, 200, { ok: true, result, license });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && requestUrl.pathname === "/candidates") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const candidateId = String(requestUrl.searchParams.get("id") || "").trim();
      const result = await deleteCandidate(candidateId, { companyId: actor.companyId });
      emitCapturedStreamEvent(actor.companyId, "candidate_deleted", { candidateId });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/candidates/link-assessment") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      await ensureCandidateVisibleToActor(actor, body.id);
      const result = await linkCandidateToAssessment(body.id, body.assessment_id || body.assessmentId, { companyId: actor.companyId });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/candidates/assign") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      if (actor.role !== "admin") {
        throw new Error("Only an admin can assign candidates.");
      }
      const body = await readJsonBody(req);
      await ensureCandidateVisibleToActor(actor, body.id || body.candidateId);
      const result = await assignCandidate(body.id || body.candidateId, {
        assigned_to_user_id: body.assigned_to_user_id || body.assignedToUserId,
        assigned_to_name: body.assigned_to_name || body.assignedToName,
        assigned_by_user_id: actor.id,
        assigned_by_name: actor.name,
        assigned_jd_id: body.assigned_jd_id || body.assignedJdId,
        assigned_jd_title: body.assigned_jd_title || body.assignedJdTitle,
        jd_title: body.jd_title || body.jdTitle,
        client_name: body.client_name || body.clientName
      }, { companyId: actor.companyId });
      emitCapturedStreamEvent(actor.companyId, "candidate_assigned", { candidateId: String(body.id || body.candidateId || "").trim() || undefined });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/candidates/claim") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const candidateId = body.id || body.candidateId;
      await ensureCandidateVisibleToActor(actor, candidateId);
      const result = await assignCandidate(candidateId, {
        assigned_to_user_id: actor.id,
        assigned_to_name: actor.name,
        assigned_by_user_id: actor.id,
        assigned_by_name: actor.name,
        assigned_jd_id: body.assigned_jd_id || body.assignedJdId,
        assigned_jd_title: body.assigned_jd_title || body.assignedJdTitle,
        jd_title: body.jd_title || body.jdTitle,
        client_name: body.client_name || body.clientName
      }, { companyId: actor.companyId });
      emitCapturedStreamEvent(actor.companyId, "candidate_assigned", { candidateId: String(candidateId || "").trim() || undefined });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/database-candidates") {
    try {
      const sessionUser = await requireSessionUser(getBearerToken(req));
      await requireSaasAccess(sessionUser, "database save and search");
      const listOptions = {
        limit: Number(requestUrl.searchParams.get("limit") || 100),
        q: String(requestUrl.searchParams.get("q") || "").trim(),
        id: String(requestUrl.searchParams.get("id") || "").trim(),
        scope: String(requestUrl.searchParams.get("scope") || "company").trim()
      };
      const result = await listDatabaseCandidatesForUser(sessionUser, listOptions);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/contact-attempts") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const candidateId = String(requestUrl.searchParams.get("candidate_id") || requestUrl.searchParams.get("candidateId") || "").trim();
      await ensureCandidateVisibleToActor(actor, candidateId);
      const result = await listContactAttempts(
        candidateId,
        Number(requestUrl.searchParams.get("limit") || 20),
        { companyId: actor.companyId }
      );
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/contact-attempts") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await saveContactAttempt(body.candidate_id || body.candidateId, {
        recruiter_id: actor.id,
        recruiter_name: actor.name,
        jd_id: body.jd_id || body.jdId,
        jd_title: body.jd_title || body.jdTitle,
        outcome: body.outcome,
        notes: body.notes,
        next_follow_up_at: body.next_follow_up_at || body.nextFollowUpAt
      }, { companyId: actor.companyId });
      emitCapturedStreamEvent(actor.companyId, "candidate_attempt", { candidateId: String(body.candidate_id || body.candidateId || "").trim() || undefined });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && /^\/company\/candidates\/[^/]+\/interview-cv$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
      const candidateId = String(requestUrl.pathname.replace(/^\/company\/candidates\//, "").replace(/\/interview-cv$/, "")).trim();
      const body = await readJsonBody(req);
      const effectiveAiParsingEnabled = await getEffectiveInterviewAiParsingEnabled(actor.companyId);
      const uploadedFile = body.file || null;
      const deferParse = body.deferParse === true || body.defer_parse === true;
      if (!candidateId) throw new Error("Candidate not found.");
      if (!uploadedFile?.fileData) throw new Error("Missing CV file.");
      let candidate = (await listCandidatesForUser(actor, { id: candidateId, limit: 1 }))[0] || null;
      if (!candidate) {
        const bodyName = String(body.candidateName || "").trim().toLowerCase();
        const bodyEmail = String(body.emailId || body.email || "").trim().toLowerCase();
        const bodyPhone = String(body.phoneNumber || body.phone || "").replace(/[^\d]/g, "");
        const candidatePool = await listCandidatesForUser(actor, { limit: 500 });
        candidate = candidatePool.find((item) => {
          const itemName = String(item?.name || "").trim().toLowerCase();
          const itemEmail = String(item?.email || "").trim().toLowerCase();
          const itemPhone = String(item?.phone || "").replace(/[^\d]/g, "");
          if (bodyEmail && itemEmail && bodyEmail === itemEmail) return true;
          if (bodyPhone && itemPhone && bodyPhone === itemPhone) return true;
          if (bodyName && itemName && bodyName === itemName) return true;
          return false;
        }) || null;
      }
      if (!candidate) throw new Error("Candidate not found in this company.");

      const existingMeta = decodeApplicantMetadata(candidate);
      const fileFingerprint = buildUploadedFileFingerprint(uploadedFile);
      const cachedCvAnalysis = existingMeta?.cvAnalysisCache && typeof existingMeta.cvAnalysisCache === "object"
        ? existingMeta.cvAnalysisCache
        : null;
      const cachedFingerprint = String(cachedCvAnalysis?.fingerprint || "").trim();
      const cachedVersion = String(cachedCvAnalysis?.parseVersion || "").trim();
      const sameFingerprintAsCached = Boolean(fileFingerprint) && cachedFingerprint === fileFingerprint;
      const isCurrentParserVersionCached = cachedVersion === CV_PARSE_RESULT_VERSION;

      if (
        fileFingerprint &&
        cachedCvAnalysis &&
        sameFingerprintAsCached &&
        isCurrentParserVersionCached &&
        cachedCvAnalysis.result
      ) {
        sendJson(res, 200, {
          ok: true,
          result: {
            ...cachedCvAnalysis.result,
            cached: true,
            storedFile: cachedCvAnalysis.storedFile || {
              provider: existingMeta.fileProvider || "",
              key: existingMeta.fileKey || "",
              url: existingMeta.fileUrl || "",
              filename: existingMeta.filename || "",
              mimeType: existingMeta.mimeType || ""
            }
          }
        });
        return;
      }

      const storedFile = await storeUploadedFile(uploadedFile, {
        filename: uploadedFile.filename,
        objectPrefix: `candidates/${actor.companyId}/${candidate.id}`
      });

      // Persist stored file pointers immediately so the CV link becomes available right away in trackers/shares.
      const storedFilePayload = {
        provider: storedFile?.provider || "",
        key: storedFile?.key || "",
        url: storedFile?.url || "",
        filename: storedFile?.filename || "",
        mimeType: storedFile?.mimeType || ""
      };
      const immediateMeta = {
        ...(existingMeta || {}),
        filename: storedFilePayload.filename || existingMeta.filename || "",
        mimeType: storedFilePayload.mimeType || existingMeta.mimeType || "",
        fileProvider: storedFilePayload.provider || existingMeta.fileProvider || "",
        fileKey: storedFilePayload.key || existingMeta.fileKey || "",
        fileUrl: storedFilePayload.url || existingMeta.fileUrl || "",
        cvAnalysisCache: {
          ...(existingMeta?.cvAnalysisCache && typeof existingMeta.cvAnalysisCache === "object" ? existingMeta.cvAnalysisCache : {}),
          fingerprint: fileFingerprint,
          // Keep parser version stamp on pending cache so UI/backend know this upload targets current parser contract.
          parseVersion: CV_PARSE_RESULT_VERSION,
          storedAt: new Date().toISOString(),
          storedFile: storedFilePayload,
          parsePending: true,
          updatedAt: new Date().toISOString()
        }
      };
      if (
        immediateMeta?.cvAnalysisCache &&
        (sameFingerprintAsCached || !isCurrentParserVersionCached)
      ) {
        // Force one fresh parse chance:
        // do not carry forward old cached result when parser version changed
        // (or when same fingerprint is explicitly re-uploaded).
        delete immediateMeta.cvAnalysisCache.result;
        delete immediateMeta.cvAnalysisCache.timelineConfidence;
        delete immediateMeta.cvAnalysisCache.timelineConfidenceLabel;
      }
      await patchCandidate(candidate.id, {
        raw_note: encodeApplicantMetadata(immediateMeta)
      }, { companyId: actor.companyId });

      if (deferParse) {
        // Fast response, parse continues in the background.
        sendJson(res, 200, { ok: true, result: { queued: true, cached: false, storedFile: storedFilePayload } });

        setImmediate(async () => {
          try {
            const hybrid = await parseCandidateHybrid({
              payload: {
                sourceType: "cv",
                candidateName: "",
                totalExperience: "",
                file: uploadedFile
              },
              apiKey: body.apiKey || process.env.OPENAI_API_KEY || "",
              model: String(body.model || "").trim(),
              normalizeWithAi: effectiveAiParsingEnabled
            });
            const aiParseMode = hybrid.meta.aiMode;
            const aiParseReason = hybrid.meta.aiPrimaryUsed
              ? "AI primary parse used with deterministic validation."
              : (hybrid.meta.aiParseAttempted
                ? "AI output failed deterministic checks, rule parser fallback/reference used."
                : "OpenAI key unavailable, rule parser used with deterministic validation.");
            const result = finalizeCvParseResult({ hybrid, aiParseMode, aiParseReason });
            const refreshed = (await listCandidatesForUser(actor, { id: candidate.id, limit: 1 }))[0] || null;
            const refreshedMeta = refreshed ? decodeApplicantMetadata(refreshed) : immediateMeta;
            const nextMeta = {
              ...(refreshedMeta || immediateMeta || {}),
              filename: storedFilePayload.filename || refreshedMeta?.filename || "",
              mimeType: storedFilePayload.mimeType || refreshedMeta?.mimeType || "",
              fileProvider: storedFilePayload.provider || refreshedMeta?.fileProvider || "",
              fileKey: storedFilePayload.key || refreshedMeta?.fileKey || "",
              fileUrl: storedFilePayload.url || refreshedMeta?.fileUrl || "",
              cvAnalysisCache: {
                fingerprint: fileFingerprint,
                parseVersion: CV_PARSE_RESULT_VERSION,
                storedAt: new Date().toISOString(),
                storedFile: storedFilePayload,
                result,
                parsePending: false,
                updatedAt: new Date().toISOString()
              },
              inferredSearchTags: deriveInferredSearchTags({
                cvResult: result,
                recruiterNotes: refreshed?.recruiter_context_notes || candidate?.recruiter_context_notes || "",
                otherPointers: refreshed?.other_pointers || candidate?.other_pointers || "",
                tags: Array.isArray(refreshed?.skills) ? refreshed.skills : Array.isArray(candidate?.skills) ? candidate.skills : []
              })
            };

            const draftPayload = refreshed?.draft_payload && typeof refreshed.draft_payload === "object" ? refreshed.draft_payload : {};
            const screeningAnswers = refreshed?.screening_answers && typeof refreshed.screening_answers === "object" ? refreshed.screening_answers : {};
            nextMeta.searchDocV1 = deriveCandidateSearchDocV1FromParts({
              candidate: refreshed || candidate,
              meta: nextMeta,
              draftPayload,
              screeningAnswers,
              cvResult: result,
              inferredSearchTags: nextMeta.inferredSearchTags
            });
            nextMeta.searchDocUpdatedAt = new Date().toISOString();

            const shouldApplyAutofill = effectiveAiParsingEnabled;
            await patchCandidate(candidate.id, {
              raw_note: encodeApplicantMetadata(nextMeta),
              ...(shouldApplyAutofill ? buildCvAutofillPatch(refreshed || candidate, result) : {})
            }, { companyId: actor.companyId });

            // Best-effort persistence of unified search-doc + full CV text (if table exists).
            try {
              await upsertCandidateSearchDocV1({
                companyId: actor.companyId,
                candidateId: candidate.id,
          docV1: nextMeta.searchDocV1,
          cvTextFull: String(hybrid?.parsed?.rawText || "")
              });
            } catch (_) {}
          } catch (error) {
            console.warn("Background CV parse failed:", error?.message || error);
            try {
              const refreshed = (await listCandidatesForUser(actor, { id: candidate.id, limit: 1 }))[0] || null;
              const refreshedMeta = refreshed ? decodeApplicantMetadata(refreshed) : immediateMeta;
              const nextMeta = {
                ...(refreshedMeta || immediateMeta || {}),
                cvAnalysisCache: {
                  ...(refreshedMeta?.cvAnalysisCache && typeof refreshedMeta.cvAnalysisCache === "object" ? refreshedMeta.cvAnalysisCache : {}),
                  parsePending: false,
                  parseError: String(error?.message || error || "Unknown background parse error."),
                  updatedAt: new Date().toISOString()
                }
              };
              await patchCandidate(candidate.id, {
                raw_note: encodeApplicantMetadata(nextMeta)
              }, { companyId: actor.companyId });
            } catch (inner) {
              console.warn("Could not persist background parse error:", inner?.message || inner);
            }
          }
        });
        return;
      }

      const hybrid = await parseCandidateHybrid({
        payload: {
          sourceType: "cv",
          candidateName: "",
          totalExperience: "",
          file: uploadedFile
        },
        apiKey: body.apiKey || process.env.OPENAI_API_KEY || "",
        model: String(body.model || "").trim(),
        normalizeWithAi: effectiveAiParsingEnabled
      });
      const aiParseMode = hybrid.meta.aiMode;
      const aiParseReason = hybrid.meta.aiPrimaryUsed
        ? "AI primary parse used with deterministic validation."
        : (hybrid.meta.aiParseAttempted
          ? "AI output failed deterministic checks, rule parser fallback/reference used."
          : "OpenAI key unavailable, rule parser used with deterministic validation.");
      const result = finalizeCvParseResult({ hybrid, aiParseMode, aiParseReason });

      const inferredSearchTags = deriveInferredSearchTags({
        cvResult: result,
        recruiterNotes: candidate?.recruiter_context_notes || "",
        otherPointers: candidate?.other_pointers || "",
        tags: Array.isArray(candidate?.skills) ? candidate.skills : []
      });

      const nextMeta = {
        ...(immediateMeta || existingMeta || {}),
        filename: storedFilePayload.filename || existingMeta.filename || "",
        mimeType: storedFilePayload.mimeType || existingMeta.mimeType || "",
        fileProvider: storedFilePayload.provider || existingMeta.fileProvider || "",
        fileKey: storedFilePayload.key || existingMeta.fileKey || "",
        fileUrl: storedFilePayload.url || existingMeta.fileUrl || "",
        cvAnalysisCache: {
          fingerprint: fileFingerprint,
          parseVersion: CV_PARSE_RESULT_VERSION,
          storedAt: new Date().toISOString(),
          storedFile: storedFilePayload,
          result,
          parsePending: false,
          updatedAt: new Date().toISOString()
        },
        inferredSearchTags
      };
      nextMeta.searchDocV1 = deriveCandidateSearchDocV1FromParts({
        candidate,
        meta: nextMeta,
        draftPayload: candidate?.draft_payload && typeof candidate.draft_payload === "object" ? candidate.draft_payload : {},
        screeningAnswers: candidate?.screening_answers && typeof candidate.screening_answers === "object" ? candidate.screening_answers : {},
        cvResult: result,
        inferredSearchTags
      });
      nextMeta.searchDocUpdatedAt = new Date().toISOString();

      const shouldApplyAutofill = effectiveAiParsingEnabled;
      await patchCandidate(candidate.id, {
        raw_note: encodeApplicantMetadata(nextMeta),
        ...(shouldApplyAutofill ? buildCvAutofillPatch(candidate, result) : {})
      }, { companyId: actor.companyId });

      // Best-effort persistence of unified search-doc + full CV text (if table exists).
      try {
        await upsertCandidateSearchDocV1({
          companyId: actor.companyId,
          candidateId: candidate.id,
          docV1: nextMeta.searchDocV1,
          cvTextFull: String(hybrid?.parsed?.rawText || "")
        });
      } catch (_) {}

      sendJson(res, 200, {
        ok: true,
        result: {
          ...result,
          storedFile: storedFilePayload
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/parse-note") {
    try {
      const body = await readJsonBody(req);
      const sessionUser = await requireSessionUser(getBearerToken(req));
      const noteText = String(body.text || body.noteText || body.note || "").trim();
      if (!noteText) {
        throw new Error("Missing note text.");
      }

      const fastModeRequested = body?.fast_mode === true || body?.fastMode === true;
      const fastModel = String(process.env.QUICK_CAPTURE_FAST_MODEL || "").trim() || "gpt-4.1-nano";
      const defaultModel = String(process.env.QUICK_CAPTURE_MODEL || "").trim() || "gpt-4.1-mini";
      const parsed = await parseCandidateQuickNote({
        apiKey: process.env.OPENAI_API_KEY || "",
        model: fastModeRequested ? fastModel : defaultModel,
        noteText,
        metadata: {
          id: String(body.id || body.candidateId || "").trim() || null,
          created_at: String(body.created_at || body.createdAt || "").trim() || null,
          linkedin: String(body.linkedin || body.linkedinUrl || body.profileUrl || "").trim() || null,
          source: String(body.source || "").trim() || null,
          company_id: sessionUser.companyId || null,
          client_name: String(body.client_name || body.clientName || "").trim() || null,
          jd_title: String(body.jd_title || body.jdTitle || "").trim() || null,
          recruiter_id: sessionUser?.id || String(body.recruiter_id || body.recruiterId || "").trim() || null,
          recruiter_name: sessionUser?.name || String(body.recruiter_name || body.recruiterName || "").trim() || null
        }
      });
      if (body.preview === true || body.dry_run === true || body.dryRun === true) {
        sendJson(res, 200, { ok: true, preview: true, result: parsed });
        return;
      }
      const duplicate = await findDuplicateCandidate(parsed, { companyId: sessionUser.companyId });
      if (duplicate) {
        sendJson(res, 200, {
          ok: true,
          duplicate: true,
          duplicateBy: duplicate.matchBy,
          result: duplicate.existing
        });
        return;
      }

      // Persist deterministic search doc for newly captured notes (no backfill).
      {
        const meta = decodeApplicantMetadata(parsed);
        const cvResult = meta?.cvAnalysisCache?.result && typeof meta.cvAnalysisCache.result === "object" ? meta.cvAnalysisCache.result : null;
        const inferredSearchTags = deriveInferredSearchTags({
          cvResult,
          recruiterNotes: parsed?.recruiter_context_notes || parsed?.recruiterContextNotes || "",
          otherPointers: parsed?.other_pointers || parsed?.otherPointers || "",
          tags: Array.isArray(parsed?.skills) ? parsed.skills : []
        });
        const nextMeta = { ...(meta || {}), inferredSearchTags };
        nextMeta.searchDocV1 = deriveCandidateSearchDocV1FromParts({
          candidate: parsed,
          meta: nextMeta,
          draftPayload: parsed?.draft_payload && typeof parsed.draft_payload === "object" ? parsed.draft_payload : {},
          screeningAnswers: parsed?.screening_answers && typeof parsed.screening_answers === "object" ? parsed.screening_answers : {},
          cvResult,
          inferredSearchTags
        });
        nextMeta.searchDocUpdatedAt = new Date().toISOString();
        parsed.raw_note = encodeApplicantMetadata(nextMeta);
      }
      const saved = await saveCandidate(parsed, { companyId: sessionUser.companyId });
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/parse-candidate") {
    try {
      const body = await readJsonBody(req);
      let cacheCompanyId = "";
      let effectiveAiParsingEnabled = body?.normalizeWithAi !== false;
      try {
        const actor = await requireSessionUser(getBearerToken(req));
        cacheCompanyId = String(actor?.companyId || "").trim();
        effectiveAiParsingEnabled = await getEffectiveInterviewAiParsingEnabled(cacheCompanyId);
      } catch (_) {}
      const effectiveBody = { ...(body || {}), normalizeWithAi: effectiveAiParsingEnabled };
      const cacheKey = buildParseCandidateCacheKey(effectiveBody, cacheCompanyId);
      const cachedEntry = cacheKey ? PARSE_CANDIDATE_CACHE.get(cacheKey) : null;
      if (cachedEntry?.payload) {
        sendJson(res, 200, { ok: true, result: { ...cachedEntry.payload, cached: true } });
        return;
      }
      const hybrid = await parseCandidateHybrid({
        payload: String(effectiveBody?.sourceType || "").trim().toLowerCase() === "cv"
          ? {
              ...effectiveBody,
              candidateName: "",
              totalExperience: ""
            }
          : effectiveBody,
        apiKey: effectiveBody.apiKey || process.env.OPENAI_API_KEY || "",
        model: String(effectiveBody.model || "").trim(),
        normalizeWithAi: effectiveAiParsingEnabled
      });
      const aiParseMode = hybrid.meta.aiMode;
      const aiParseReason = hybrid.meta.aiPrimaryUsed
        ? "AI primary parse used with deterministic validation."
        : (hybrid.meta.aiParseAttempted
          ? "AI output failed deterministic checks, rule parser fallback/reference used."
          : "OpenAI key unavailable, rule parser used with deterministic validation.");
      const result = finalizeCvParseResult({ hybrid, aiParseMode, aiParseReason });
      if (cacheKey) setParseCandidateCache(cacheKey, result);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/spreadsheet/parse-rows") {
    try {
      await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const filename = String(body?.filename || "").trim();
      const fileData = String(body?.fileData || "").trim();
      if (!filename) throw new Error("filename is required.");
      if (!fileData) throw new Error("fileData is required.");
      const lower = filename.toLowerCase();
      if (!(lower.endsWith(".xlsx") || lower.endsWith(".xls"))) {
        throw new Error("Only .xlsx/.xls files are supported on this endpoint.");
      }
      const rows = parseGenericSpreadsheetBase64ToRows(fileData, filename);
      sendJson(res, 200, {
        ok: true,
        result: {
          rows: rows.slice(0, 1000),
          totalRows: rows.length
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/extract-document-text") {
    try {
      await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const parsed = await parseCandidatePayload({
        ...body,
        sourceType: body?.sourceType || "jd_upload"
      });
      sendJson(res, 200, {
        ok: true,
        result: {
          filename: parsed.filename || "",
          rawText: parsed.rawText || ""
        }
      });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/generate-questions") {
    try {
      const body = await readJsonBody(req);
      const result = await callOpenAiQuestions({
        apiKey: body.apiKey || process.env.OPENAI_API_KEY || "",
        prompt: String(body.prompt || "").trim(),
        model: String(body.model || "").trim()
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: "Route not found." });
});

server.listen(PORT, () => {
  console.log(`Recruiter backend listening on http://localhost:${PORT}`);
});





