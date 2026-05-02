const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { insertAssessmentEvent } = require("./search/search-doc-store");

const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ companies: [], users: [], sessions: [], jobs: [], assessments: [], clientUsers: [] }, null, 2), "utf8");
  }
}
function readStore() { ensureStore(); return JSON.parse(fs.readFileSync(STORE_PATH, "utf8")); }
function writeStore(store) { ensureStore(); fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), "utf8"); }
function normalizeEmail(email) { return String(email || "").trim().toLowerCase(); }
function buildApplicantIntakeSecret(companyName = "") {
  const slug = String(companyName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24) || "company";
  return `${slug}_intake_${crypto.randomBytes(12).toString("hex")}`;
}
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password || ""), salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, passwordHash) {
  const [salt, storedHash] = String(passwordHash || "").split(":");
  if (!salt || !storedHash) return false;
  const compareHash = crypto.pbkdf2Sync(String(password || ""), salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(storedHash, "hex"), Buffer.from(compareHash, "hex"));
}
function timingSafeEqualString(a, b) {
  const x = Buffer.from(String(a || ""), "utf8");
  const y = Buffer.from(String(b || ""), "utf8");
  if (x.length !== y.length) return false;
  return crypto.timingSafeEqual(x, y);
}
function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
function getPlatformCompanyCreatorEmails() {
  return String(process.env.PLATFORM_COMPANY_CREATOR_EMAILS || "")
    .split(",")
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
}
function getPlatformCreatorPassword() {
  return String(process.env.PLATFORM_COMPANY_CREATOR_PASSWORD || "").trim();
}
function getPlatformSessionSecret() {
  return (
    String(process.env.PLATFORM_SESSION_SECRET || "").trim() ||
    String(process.env.PLATFORM_CREATE_COMPANY_SECRET || "").trim() ||
    "platform-company-session-secret"
  );
}
function createSignedPlatformToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto
    .createHmac("sha256", getPlatformSessionSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${signature}`;
}
function readSignedPlatformToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto
    .createHmac("sha256", getPlatformSessionSecret())
    .update(encoded)
    .digest("base64url");
  if (!timingSafeEqualString(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!payload?.email || payload?.type !== "platform_creator") return null;
    if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}
async function loginPlatformCreator({ email, password }) {
  const allowedEmails = getPlatformCompanyCreatorEmails();
  const normalizedEmail = normalizeEmail(email);
  const configuredPassword = getPlatformCreatorPassword();
  if (!allowedEmails.length || !configuredPassword) {
    throw new Error(
      "Platform creator login is not configured. Set PLATFORM_COMPANY_CREATOR_EMAILS and PLATFORM_COMPANY_CREATOR_PASSWORD in Render."
    );
  }
  if (!allowedEmails.includes(normalizedEmail) || !timingSafeEqualString(password, configuredPassword)) {
    throw new Error("Invalid platform creator email or password.");
  }
  const payload = {
    type: "platform_creator",
    email: normalizedEmail,
    name: normalizedEmail,
    expiresAt: Date.now() + 1000 * 60 * 60 * 12
  };
  return {
    token: createSignedPlatformToken(payload),
    user: {
      type: "platform_creator",
      email: normalizedEmail,
      name: normalizedEmail
    }
  };
}
async function getPlatformSessionUser(token) {
  const payload = readSignedPlatformToken(token);
  if (!payload) return null;
  return {
    type: "platform_creator",
    email: normalizeEmail(payload.email),
    name: payload.name || normalizeEmail(payload.email)
  };
}
async function requirePlatformSessionUser(token) {
  const user = await getPlatformSessionUser(token);
  if (!user) throw new Error("Invalid or missing platform session.");
  return user;
}
function assertCanCreatePlatformCompany(platformSecret, actor, platformActor) {
  const secret = String(process.env.PLATFORM_CREATE_COMPANY_SECRET || "").trim();
  const provided = String(platformSecret || "").trim();
  const secretOk = Boolean(secret) && timingSafeEqualString(secret, provided);

  const allow = getPlatformCompanyCreatorEmails();
  const sessionUser = actor ? sanitizeUser(actor) : null;
  const platformSessionUser = platformActor || null;
  const actorEmailAllowed = Boolean(sessionUser?.email) && allow.includes(normalizeEmail(sessionUser.email));
  const platformEmailAllowed =
    Boolean(platformSessionUser?.email) && allow.includes(normalizeEmail(platformSessionUser.email));

  if (secretOk) return;
  if (actorEmailAllowed) return;
  if (platformEmailAllowed) return;

  if (!secret && !allow.length) {
    throw new Error(
      "Company creation is locked: set PLATFORM_COMPANY_CREATOR_EMAILS and PLATFORM_COMPANY_CREATOR_PASSWORD for platform login, and/or set PLATFORM_CREATE_COMPANY_SECRET."
    );
  }
  if (!secret && allow.length && !sessionUser?.email && !platformSessionUser?.email) {
    throw new Error("Login required: use a company account or platform creator login for an email listed in PLATFORM_COMPANY_CREATOR_EMAILS.");
  }
  if (!secret && allow.length && !actorEmailAllowed && !platformEmailAllowed) {
    throw new Error("Your account is not in PLATFORM_COMPANY_CREATOR_EMAILS.");
  }
  if (secret && !secretOk && !actorEmailAllowed && !platformEmailAllowed) {
    throw new Error("Invalid or missing platform secret, or your account is not in PLATFORM_COMPANY_CREATOR_EMAILS.");
  }
  throw new Error("Not allowed to create companies.");
}
function cfg() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { on: Boolean(url && key), url, key };
}
function enc(v) { return encodeURIComponent(String(v || "").trim()); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function looksLikeHtml(text) {
  const raw = String(text || "").toLowerCase();
  return raw.includes("<!doctype") || raw.includes("<html") || raw.includes("<head") || raw.includes("<body");
}
function sanitizeSupabaseErrorText(text, status) {
  const raw = String(text || "").trim();
  if (!raw) return status ? `HTTP ${status}` : "Request failed.";
  if (looksLikeHtml(raw)) {
    if (status === 502) return "Temporary gateway error (502) from Supabase. Please retry.";
    if (status === 503) return "Supabase is temporarily unavailable (503). Please retry.";
    if (status === 504) return "Supabase gateway timed out (504). Please retry.";
    return status ? `Supabase returned HTTP ${status}. Please retry.` : "Supabase request failed. Please retry.";
  }
  return raw.length > 500 ? `${raw.slice(0, 500)}…` : raw;
}
async function sb(method, rel, body = null, headers = {}) {
  const { on, url, key } = cfg();
  if (!on) throw new Error("Supabase auth store is not configured.");
  const safeMethod = String(method || "GET").toUpperCase();
  const safeRel = String(rel || "");
  // Supabase can occasionally hang during heavy backfills or long locks.
  // Use a hard timeout so the UI never sits in "Saving..." forever.
  const timeoutMs =
    safeMethod === "GET" ? 30000
      : /\/rest\/v1\/assessments\b/i.test(safeRel) ? 60000
        : 45000;

  // Permanent-ish fix for transient 502/503/504 from Supabase/Cloudflare during deploy spikes.
  // Only retry idempotent reads to avoid accidental double-writes.
  const shouldRetry = safeMethod === "GET" || safeMethod === "HEAD";
  const maxAttempts = shouldRetry ? 3 : 1;
  let lastResponse = null;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${url}${rel}`, {
        method,
        signal: controller.signal,
        headers: { apikey: key, Authorization: `Bearer ${key}`, ...headers },
        body
      });
      lastResponse = res;

      if (res.ok) {
        if (method === "HEAD" || res.status === 204) return null;
        return String(res.headers.get("content-type") || "").includes("application/json") ? res.json() : res.text();
      }

      const retryable = shouldRetry && [502, 503, 504].includes(res.status);
      if (!retryable || attempt === maxAttempts - 1) {
        const errorText = await res.text();
        throw new Error(`Supabase auth failed: ${res.status} ${sanitizeSupabaseErrorText(errorText, res.status)}`);
      }
    } catch (error) {
      lastError = error;
      if (String(error?.name || "") === "AbortError") {
        // Timeouts could be caused by long locks; retries can amplify load, so fail fast.
        throw new Error(`Supabase request timed out (${Math.round(timeoutMs / 1000)}s) for ${safeMethod} ${safeRel}.`);
      }
      if (!shouldRetry || attempt === maxAttempts - 1) {
        throw error;
      }
    } finally {
      clearTimeout(timer);
    }

    // Retry with jittered exponential backoff.
    const backoffMs = Math.min(2500, 250 * (2 ** attempt)) + Math.floor(Math.random() * 120);
    await sleep(backoffMs);
  }

  if (lastResponse) {
    throw new Error(`Supabase auth failed: ${lastResponse.status}`);
  }
  throw lastError || new Error("Supabase auth failed.");
}
const sbSel = (t, q) => sb("GET", `/rest/v1/${t}?${q}`);
const sbIns = (t, rows, { conflict = "", upsert = false, returning = "representation" } = {}) => {
  const q = conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : "";
  const prefer = [`return=${returning}`];
  if (upsert) prefer.unshift("resolution=merge-duplicates");
  return sb("POST", `/rest/v1/${t}${q}`, JSON.stringify(rows), { "Content-Type": "application/json", Prefer: prefer.join(",") });
};
const sbPatch = (t, f, p) => sb("PATCH", `/rest/v1/${t}?${f}`, JSON.stringify(p), { "Content-Type": "application/json", Prefer: "return=representation" });
const sbDel = (t, f) => sb("DELETE", `/rest/v1/${t}?${f}`, null, { Prefer: "return=representation" });

function getEmailSettingsSecret() {
  const secret = String(process.env.EMAIL_SETTINGS_ENCRYPTION_SECRET || process.env.PLATFORM_SESSION_SECRET || "").trim();
  if (!secret) return "";
  return crypto.createHash("sha256").update(secret).digest("hex");
}
function encryptSecretString(plain) {
  const text = String(plain || "");
  if (!text) return "";
  const keyHex = getEmailSettingsSecret();
  if (!keyHex) throw new Error("EMAIL_SETTINGS_ENCRYPTION_SECRET is not set.");
  const key = Buffer.from(keyHex, "hex");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(text, "utf8")), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}
function decryptSecretString(encValue) {
  const raw = String(encValue || "").trim();
  if (!raw) return "";
  if (!raw.startsWith("enc:v1:")) return raw;
  const parts = raw.split(":");
  if (parts.length !== 5) return "";
  const iv = Buffer.from(parts[2], "base64");
  const tag = Buffer.from(parts[3], "base64");
  const data = Buffer.from(parts[4], "base64");
  const keyHex = getEmailSettingsSecret();
  if (!keyHex) return "";
  const key = Buffer.from(keyHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

async function getUserSmtpSettings({ companyId, userId }) {
  if (!companyId || !userId) return null;
  if (!cfg().on) {
    const store = readStore();
    const blob = store.smtpSettings && typeof store.smtpSettings === "object" ? store.smtpSettings[String(userId)] : null;
    if (!blob) return null;
    const payload = blob && typeof blob === "object" ? blob : {};
    return {
      host: String(payload.host || "").trim(),
      port: Number(payload.port || 587),
      secure: Boolean(payload.secure),
      user: String(payload.user || "").trim(),
      from: String(payload.from || "").trim(),
      pass: decryptSecretString(String(payload.passEnc || "")),
      signatureText: String(payload.signatureText || "").trim(),
      signatureLinkLabel: String(payload.signatureLinkLabel || "").trim(),
      signatureLinkUrl: String(payload.signatureLinkUrl || "").trim(),
      signatureLinkLabel2: String(payload.signatureLinkLabel2 || "").trim(),
      signatureLinkUrl2: String(payload.signatureLinkUrl2 || "").trim()
    };
  }
  const rows = await sbSel("user_smtp_settings", `select=payload&company_id=eq.${enc(companyId)}&user_id=eq.${enc(userId)}&limit=1`).catch(() => []);
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
  if (!payload.host) return null;
  return {
    host: String(payload.host || "").trim(),
    port: Number(payload.port || 587),
    secure: Boolean(payload.secure),
    user: String(payload.user || "").trim(),
    from: String(payload.from || "").trim(),
    pass: decryptSecretString(String(payload.passEnc || "")),
    signatureText: String(payload.signatureText || "").trim(),
    signatureLinkLabel: String(payload.signatureLinkLabel || "").trim(),
    signatureLinkUrl: String(payload.signatureLinkUrl || "").trim(),
    signatureLinkLabel2: String(payload.signatureLinkLabel2 || "").trim(),
    signatureLinkUrl2: String(payload.signatureLinkUrl2 || "").trim()
  };
}

async function saveUserSmtpSettings({ actorUserId, companyId, userId, settings }) {
  if (!companyId || !userId) throw new Error("Missing companyId/userId.");
  if (String(actorUserId || "") !== String(userId || "")) throw new Error("Only the user can update their email settings.");
  const src = settings && typeof settings === "object" ? settings : {};
  const host = String(src.host || "").trim();
  const port = Number(src.port || 587);
  const secure = Boolean(src.secure);
  const user = String(src.user || "").trim();
  const from = String(src.from || "").trim();
  const pass = String(src.pass || "").trim();
  const keepPass = Boolean(src.keepPass) && !pass;
  if (!host || !port || !user || !from) throw new Error("SMTP host, port, user and from are required.");

  const existing = await getUserSmtpSettings({ companyId, userId });
  const passToStore = keepPass ? String(existing?.pass || "") : pass;
  if (!passToStore) throw new Error("SMTP app password is required.");
  const payload = {
    host,
    port,
    secure,
    user,
    from,
    passEnc: encryptSecretString(passToStore),
    signatureText: String(src.signatureText || "").trim(),
    signatureLinkLabel: String(src.signatureLinkLabel || "").trim(),
    signatureLinkUrl: String(src.signatureLinkUrl || "").trim(),
    signatureLinkLabel2: String(src.signatureLinkLabel2 || "").trim(),
    signatureLinkUrl2: String(src.signatureLinkUrl2 || "").trim()
  };

  if (!cfg().on) {
    const store = readStore();
    store.smtpSettings = store.smtpSettings && typeof store.smtpSettings === "object" ? store.smtpSettings : {};
    store.smtpSettings[String(userId)] = payload;
    writeStore(store);
    return {
      host,
      port,
      secure,
      user,
      from,
      hasPassword: true,
      signatureText: String(payload.signatureText || "").trim(),
      signatureLinkLabel: String(payload.signatureLinkLabel || "").trim(),
      signatureLinkUrl: String(payload.signatureLinkUrl || "").trim(),
      signatureLinkLabel2: String(payload.signatureLinkLabel2 || "").trim(),
      signatureLinkUrl2: String(payload.signatureLinkUrl2 || "").trim()
    };
  }

  const now = new Date().toISOString();
  await sbIns("user_smtp_settings", [{
    id: crypto.randomUUID(),
    company_id: companyId,
    user_id: userId,
    payload,
    created_at: now,
    updated_at: now,
    updated_by: user
  }], { conflict: "company_id,user_id", upsert: true, returning: "minimal" });
  return {
    host,
    port,
    secure,
    user,
    from,
    hasPassword: true,
    signatureText: String(payload.signatureText || "").trim(),
    signatureLinkLabel: String(payload.signatureLinkLabel || "").trim(),
    signatureLinkUrl: String(payload.signatureLinkUrl || "").trim(),
    signatureLinkLabel2: String(payload.signatureLinkLabel2 || "").trim(),
    signatureLinkUrl2: String(payload.signatureLinkUrl2 || "").trim()
  };
}

function sanitizeUser(user) {
  if (!user) return null;
  return { id: user.id, companyId: user.companyId ?? user.company_id ?? null, companyName: user.companyName ?? user.company_name ?? null, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt ?? user.created_at ?? null };
}
function sanitizeCompany(company) {
  if (!company) return null;
  return {
    id: company.id,
    name: company.name || "",
    createdAt: company.createdAt ?? company.created_at ?? null,
    applicantIntakeSecret: company.applicantIntakeSecret ?? company.applicant_intake_secret ?? ""
  };
}
function sanitizeJob(job) {
  if (!job) return null;
  const p = job.payload && typeof job.payload === "object" ? job.payload : {};
  return {
    ...p,
    id: job.id,
    companyId: job.companyId ?? job.company_id ?? p.companyId ?? null,
    title: job.title ?? p.title ?? "",
    clientName: job.clientName ?? job.client_name ?? p.clientName ?? "",
    aboutCompany: job.aboutCompany ?? job.about_company ?? p.aboutCompany ?? "",
    // Anonymous/public apply link fields (stored in payload).
    publicCompanyLine: job.publicCompanyLine ?? job.public_company_line ?? p.publicCompanyLine ?? p.public_company_line ?? "",
    publicTitle: job.publicTitle ?? job.public_title ?? p.publicTitle ?? p.public_title ?? "",
    location: job.location ?? p.location ?? "",
    workMode: job.workMode ?? job.work_mode ?? p.workMode ?? "",
    jobDescription: job.jobDescription ?? job.job_description ?? p.jobDescription ?? "",
    mustHaveSkills: job.mustHaveSkills ?? job.must_have_skills ?? p.mustHaveSkills ?? "",
    redFlags: job.redFlags ?? job.red_flags ?? p.redFlags ?? "",
    recruiterNotes: job.recruiterNotes ?? job.recruiter_notes ?? p.recruiterNotes ?? "",
    standardQuestions: job.standardQuestions ?? job.standard_questions ?? p.standardQuestions ?? "",
    jdShortcuts: job.jdShortcuts ?? job.jd_shortcuts ?? p.jdShortcuts ?? "",
    ownerRecruiterId: job.ownerRecruiterId ?? job.owner_recruiter_id ?? p.ownerRecruiterId ?? "",
    ownerRecruiterName: job.ownerRecruiterName ?? job.owner_recruiter_name ?? p.ownerRecruiterName ?? "",
    assignedRecruiters: Array.isArray(job.assignedRecruiters) ? job.assignedRecruiters : Array.isArray(job.assigned_recruiters) ? job.assigned_recruiters : Array.isArray(p.assignedRecruiters) ? p.assignedRecruiters : [],
    createdAt: job.createdAt ?? job.created_at ?? p.createdAt ?? null,
    updatedAt: job.updatedAt ?? job.updated_at ?? p.updatedAt ?? null,
    updatedBy: job.updatedBy ?? job.updated_by ?? p.updatedBy ?? null
  };
}
const SHARED_EXPORT_PRESET_ROW_ID = "__shared_export_presets__";
const SHARED_EXPORT_PRESET_ROW_TITLE = "__shared_export_presets__";
const CLIENT_USERS_ROW_ID = "__client_users__";
const CLIENT_USERS_ROW_TITLE = "__client_users__";
const COMPANY_LICENSE_ROW_ID = "__company_license__";
const COMPANY_LICENSE_ROW_TITLE = "__company_license__";
const MAX_SHARED_CUSTOM_EXPORT_PRESETS = 10;
const { parseExperienceTimelineTextToStructured, normalizeTimelineRow } = require("./timeline-utils");
function isSharedExportPresetRow(job) {
  return String(job?.id || "").trim() === SHARED_EXPORT_PRESET_ROW_ID || String(job?.title || "").trim() === SHARED_EXPORT_PRESET_ROW_TITLE;
}
function isClientUsersRow(job) {
  return String(job?.id || "").trim() === CLIENT_USERS_ROW_ID || String(job?.title || "").trim() === CLIENT_USERS_ROW_TITLE;
}
function isCompanyLicenseRow(job) {
  return String(job?.id || "").trim() === COMPANY_LICENSE_ROW_ID || String(job?.title || "").trim() === COMPANY_LICENSE_ROW_TITLE;
}
function isSystemJobRow(job) {
  return isSharedExportPresetRow(job) || isClientUsersRow(job) || isCompanyLicenseRow(job);
}
function addDays(dateLike, days) {
  const date = dateLike ? new Date(dateLike) : new Date();
  const base = Number.isNaN(date.getTime()) ? new Date() : date;
  base.setDate(base.getDate() + Number(days || 0));
  return base.toISOString();
}
function sanitizeCompanyLicense(raw, company = null) {
  const source = raw && typeof raw === "object" ? raw : {};
  const payload = source.payload && typeof source.payload === "object" ? source.payload : source;
  const now = new Date().toISOString();
  const companyId = String(payload.companyId || payload.company_id || company?.id || company?.companyId || "").trim();
  const startedAt = String(payload.trialStartedAt || payload.trial_started_at || company?.createdAt || company?.created_at || now).trim() || now;
  const trialEndsAt = String(payload.trialEndsAt || payload.trial_ends_at || addDays(startedAt, 14)).trim();
  const captureLimit = Math.max(0, Number(payload.captureLimit ?? payload.capture_limit ?? 50) || 50);
  const capturesUsed = Math.max(0, Number(payload.capturesUsed ?? payload.captures_used ?? 0) || 0);
  const plan = String(payload.plan || "trial").trim().toLowerCase();
  const status = String(payload.status || "trial").trim().toLowerCase();
  const isTrial = status === "trial" || plan === "trial";
  const trialActive = isTrial && Date.now() <= new Date(trialEndsAt).getTime() && capturesUsed < captureLimit;
  const unlimited = !isTrial || status === "active" || status === "legacy";
  return {
    companyId,
    plan,
    status,
    trialStartedAt: startedAt,
    trialEndsAt,
    captureLimit,
    capturesUsed,
    capturesRemaining: unlimited ? null : Math.max(0, captureLimit - capturesUsed),
    daysRemaining: unlimited ? null : Math.max(0, Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000)),
    canCapture: unlimited || trialActive,
    updatedAt: String(payload.updatedAt || payload.updated_at || now).trim() || now
  };
}
function sanitizeSharedExportPresetSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rawLabels = source.exportPresetLabels && typeof source.exportPresetLabels === "object" ? source.exportPresetLabels : {};
  const rawColumns = source.exportPresetColumns && typeof source.exportPresetColumns === "object" ? source.exportPresetColumns : {};
  const rawCustomPresets = Array.isArray(source.customExportPresets) ? source.customExportPresets : [];
  return {
    semanticSearchEnabled: source.semanticSearchEnabled !== false && source.semantic_search_enabled !== false,
    exportPresetLabels: {
      compact_recruiter: String(rawLabels.compact_recruiter || "").trim(),
      client_tracker: String(rawLabels.client_tracker || "").trim(),
      attentive_tracker: String(rawLabels.attentive_tracker || "").trim(),
      client_submission: String(rawLabels.client_submission || "").trim(),
      screening_focus: String(rawLabels.screening_focus || "").trim(),
      custom_template: String(rawLabels.custom_template || "").trim()
    },
    exportPresetColumns: {
      compact_recruiter: String(rawColumns.compact_recruiter || "").trim(),
      client_tracker: String(rawColumns.client_tracker || "").trim(),
      attentive_tracker: String(rawColumns.attentive_tracker || "").trim(),
      client_submission: String(rawColumns.client_submission || "").trim(),
      screening_focus: String(rawColumns.screening_focus || "").trim()
    },
    excelPreset: String(source.excelPreset || source.excel_preset || "").trim(),
    whatsappTemplate: String(source.whatsappTemplate || source.whatsapp_template || "").trim(),
    emailTemplate: String(source.emailTemplate || source.email_template || "").trim(),
    clientShareIntroTemplate: String(source.clientShareIntroTemplate || source.client_share_intro_template || "").trim(),
    clientShareSignatureText: String(source.clientShareSignatureText || source.client_share_signature_text || "").trim(),
    clientShareSignatureLinkLabel: String(source.clientShareSignatureLinkLabel || source.client_share_signature_link_label || "").trim(),
    clientShareSignatureLinkUrl: String(source.clientShareSignatureLinkUrl || source.client_share_signature_link_url || "").trim(),
    customExportPresets: rawCustomPresets
      .map((item, index) => ({
        id: String(item?.id || `custom_preset_${index + 1}`).trim(),
        label: String(item?.label || item?.id || `Custom preset ${index + 1}`).trim(),
        columns: String(item?.columns || "").trim(),
        clientName: String(item?.clientName || item?.client_name || "").trim(),
        scope: String(item?.scope || "").trim()
      }))
      .filter((item) => item.id && item.label && item.columns)
      .slice(0, MAX_SHARED_CUSTOM_EXPORT_PRESETS),
    customExportColumns: String(source.customExportColumns || "").trim(),
    updatedAt: String(source.updatedAt || "").trim(),
    updatedBy: String(source.updatedBy || "").trim()
  };
}
function sanitizeAssessment(item) {
  if (!item) return null;
  const p = item.payload && typeof item.payload === "object" ? item.payload : {};
  return {
    ...p,
    id: item.id ?? p.id ?? null,
    companyId: item.companyId ?? item.company_id ?? p.companyId ?? null,
    recruiterId: item.recruiterId ?? item.recruiter_id ?? p.recruiterId ?? null,
    recruiterName: item.recruiterName ?? item.recruiter_name ?? p.recruiterName ?? null,
    recruiterEmail: item.recruiterEmail ?? item.recruiter_email ?? p.recruiterEmail ?? null,
    generatedAt: item.generatedAt ?? item.generated_at ?? item.created_at ?? p.generatedAt ?? null,
    updatedAt: item.updatedAt ?? item.updated_at ?? p.updatedAt ?? null,
    candidateId: item.candidateId ?? item.candidate_id ?? p.candidateId ?? p.candidate_id ?? "",
    candidateName: item.candidateName ?? item.candidate_name ?? p.candidateName ?? "",
    phoneNumber: item.phoneNumber ?? item.phone_number ?? p.phoneNumber ?? "",
    emailId: item.emailId ?? item.email_id ?? p.emailId ?? "",
    clientName: item.clientName ?? item.client_name ?? p.clientName ?? "",
    highestEducation: item.highestEducation ?? item.highest_education ?? p.highestEducation ?? "",
    currentCompany: item.currentCompany ?? item.current_company ?? p.currentCompany ?? "",
    currentDesignation: item.currentDesignation ?? item.current_designation ?? p.currentDesignation ?? "",
    totalExperience: item.totalExperience ?? item.total_experience ?? p.totalExperience ?? "",
    averageTenurePerCompany: item.averageTenurePerCompany ?? item.average_tenure_per_company ?? p.averageTenurePerCompany ?? "",
    currentOrgTenure: item.currentOrgTenure ?? item.current_org_tenure ?? p.currentOrgTenure ?? "",
    experienceTimeline: item.experienceTimeline ?? item.experience_timeline ?? p.experienceTimeline ?? "",
    // Disabled: DB column `experience_timeline_json` is not present in all Supabase deployments,
    // and attempting to write it breaks assessment conversion. Keep timeline as plain text only.
    experienceTimelineJson: [],
    jdTitle: item.jdTitle ?? item.jd_title ?? p.jdTitle ?? "",
    jobDescription: item.jobDescription ?? item.job_description ?? p.jobDescription ?? "",
    mustHaveSkills: item.mustHaveSkills ?? item.must_have_skills ?? p.mustHaveSkills ?? "",
    redFlags: item.redFlags ?? item.red_flags ?? p.redFlags ?? "",
    jdShortcuts: item.jdShortcuts ?? item.jd_shortcuts ?? p.jdShortcuts ?? "",
    standardQuestions: item.standardQuestions ?? item.standard_questions ?? p.standardQuestions ?? "",
    recruiterNotes: item.recruiterNotes ?? item.recruiter_notes ?? p.recruiterNotes ?? "",
    recruiterContextNotes: item.recruiterContextNotes ?? item.recruiter_context_notes ?? p.recruiterContextNotes ?? "",
    otherPointers: item.otherPointers ?? item.other_pointers ?? p.otherPointers ?? "",
    currentCtc: item.currentCtc ?? item.current_ctc ?? p.currentCtc ?? "",
    expectedCtc: item.expectedCtc ?? item.expected_ctc ?? p.expectedCtc ?? "",
    noticePeriod: item.noticePeriod ?? item.notice_period ?? p.noticePeriod ?? "",
    questionMode: item.questionMode ?? item.question_mode ?? p.questionMode ?? "",
    sections: item.sections ?? p.sections ?? {},
    result: item.result ?? p.result ?? {},
    answers: item.answers ?? p.answers ?? [],
    questionAnswerPairs: item.questionAnswerPairs ?? item.question_answer_pairs ?? p.questionAnswerPairs ?? [],
    location: item.location ?? p.location ?? "",
    linkedinUrl: item.linkedinUrl ?? item.linkedin_url ?? p.linkedinUrl ?? "",
    callbackNotes: item.callbackNotes ?? item.callback_notes ?? p.callbackNotes ?? "",
    pipelineStage: item.pipelineStage ?? item.pipeline_stage ?? p.pipelineStage ?? "",
    candidateStatus: item.candidateStatus ?? item.candidate_status ?? p.candidateStatus ?? "",
    followUpAt: item.followUpAt ?? item.follow_up_at ?? p.followUpAt ?? "",
    interviewAt: item.interviewAt ?? item.interview_at ?? p.interviewAt ?? "",
    offerAmount: item.offerAmount ?? item.offer_amount ?? p.offerAmount ?? "",
    offerDoj: item.offerDoj ?? item.offer_doj ?? p.offerDoj ?? "",
    clientFeedback: item.clientFeedback ?? item.client_feedback ?? p.clientFeedback ?? "",
    clientFeedbackStatus: item.clientFeedbackStatus ?? item.client_feedback_status ?? p.clientFeedbackStatus ?? "",
    clientFeedbackUpdatedAt: item.clientFeedbackUpdatedAt ?? item.client_feedback_updated_at ?? p.clientFeedbackUpdatedAt ?? "",
    clientFeedbackUpdatedBy: item.clientFeedbackUpdatedBy ?? item.client_feedback_updated_by ?? p.clientFeedbackUpdatedBy ?? "",
    clientFeedbackHistory: item.clientFeedbackHistory ?? item.client_feedback_history ?? p.clientFeedbackHistory ?? [],
    status: item.status ?? p.status ?? "",
    // Archive / hide support (stored in payload for backwards-compatible schema).
    archived: Boolean(item.archived ?? item.isArchived ?? item.archived_flag ?? p.archived ?? p.isArchived ?? false),
    archivedAt: String(item.archivedAt ?? item.archived_at ?? p.archivedAt ?? p.archived_at ?? "").trim(),
    archivedBy: String(item.archivedBy ?? item.archived_by ?? p.archivedBy ?? p.archived_by ?? "").trim(),
    customPipelineStages: item.customPipelineStages ?? item.custom_pipeline_stages ?? p.customPipelineStages ?? "",
    customCandidateStatuses: item.customCandidateStatuses ?? item.custom_candidate_statuses ?? p.customCandidateStatuses ?? "",
    customHrCandidateStatuses: item.customHrCandidateStatuses ?? item.custom_hr_candidate_statuses ?? p.customHrCandidateStatuses ?? "",
    interviewAttempts: item.interviewAttempts ?? p.interviewAttempts ?? [],
    pageTitle: item.pageTitle ?? item.page_title ?? p.pageTitle ?? "",
    pageUrl: item.pageUrl ?? item.page_url ?? p.pageUrl ?? "",
    pdfFilename: item.pdfFilename ?? item.pdf_filename ?? p.pdfFilename ?? ""
  };
}
function sanitizeClientUser(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    companyName: String(raw.companyName || raw.company_name || "").trim(),
    username: normalizeUsername(raw.username || raw.userName || ""),
    clientName: String(raw.clientName || raw.client_name || "").trim(),
    allowedPositions: Array.isArray(raw.allowedPositions || raw.allowed_positions)
      ? (raw.allowedPositions || raw.allowed_positions).map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim()
  };
}
function sanitizeClientUserForStorage(raw) {
  const user = sanitizeClientUser(raw);
  if (!user?.id || !user?.companyId || !user?.username || !user?.clientName) return null;
  return {
    ...user,
    passwordHash: String(raw.passwordHash || raw.password_hash || "").trim()
  };
}
function sanitizeClientUserPayload(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const users = Array.isArray(source.clientUsers) ? source.clientUsers : Array.isArray(source.client_users) ? source.client_users : [];
  return {
    clientUsers: users
      .map((item) => sanitizeClientUserForStorage(item))
      .filter((item) => item?.id && item?.username && item?.clientName && item?.passwordHash)
  };
}
function sanitizeEmployeeProfile(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    employeeCode: String(raw.employeeCode || raw.employee_code || "").trim(),
    fullName: String(raw.fullName || raw.full_name || "").trim(),
    personalEmail: String(raw.personalEmail || raw.personal_email || "").trim(),
    phone: String(raw.phone || "").trim(),
    designation: String(raw.designation || "").trim(),
    employmentType: String(raw.employmentType || raw.employment_type || "c2h").trim(),
    joiningDate: String(raw.joiningDate || raw.joining_date || "").trim(),
    reportingManagerName: String(raw.reportingManagerName || raw.reporting_manager_name || "").trim(),
    clientName: String(raw.clientName || raw.client_name || "").trim(),
    workMode: String(raw.workMode || raw.work_mode || "").trim(),
    status: String(raw.status || "active").trim(),
    taxRegimeCurrent: String(raw.taxRegimeCurrent || raw.tax_regime_current || "").trim(),
    payload: raw.payload && typeof raw.payload === "object" ? raw.payload : {},
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim(),
    updatedBy: String(raw.updatedBy || raw.updated_by || "").trim()
  };
}
function sanitizeEmployeePortalUser(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    companyName: String(raw.companyName || raw.company_name || "").trim(),
    employeeId: String(raw.employeeId || raw.employee_id || "").trim(),
    employeeCode: String(raw.employeeCode || raw.employee_code || "").trim(),
    username: normalizeUsername(raw.username || raw.userName || ""),
    fullName: String(raw.fullName || raw.full_name || "").trim(),
    passwordHash: String(raw.passwordHash || raw.password_hash || "").trim(),
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim(),
    updatedBy: String(raw.updatedBy || raw.updated_by || "").trim()
  };
}
function sanitizeEmployeeSessionUser(raw) {
  const employeeIdFromRaw = String(raw?.employeeId || raw?.employee_id || "").trim();
  // In some call-sites raw may be merged as { ...profile, ...portalUser } where portalUser.id
  // overwrites profile.id. Build a safe profile view anchored to employeeId when present.
  const profile = sanitizeEmployeeProfile({
    ...(raw || {}),
    id: employeeIdFromRaw || String(raw?.id || "").trim()
  });
  if (!profile) return null;
  const employeeUserId = String(raw?.employeeUserId || raw?.employee_user_id || raw?.id || "").trim();
  const employeeId = employeeIdFromRaw || String(profile.id || "").trim();
  return {
    id: employeeUserId,
    employeeUserId,
    employeeId,
    companyId: profile.companyId,
    companyName: String(raw.companyName || raw.company_name || "").trim() || profile.companyId,
    employeeCode: String(raw.employeeCode || raw.employee_code || "").trim() || profile.employeeCode,
    username: normalizeUsername(raw.username || raw.userName || ""),
    fullName: profile.fullName,
    personalEmail: profile.personalEmail,
    phone: profile.phone,
    designation: profile.designation,
    employmentType: profile.employmentType,
    joiningDate: profile.joiningDate,
    reportingManagerName: profile.reportingManagerName,
    clientName: profile.clientName,
    workMode: profile.workMode,
    status: profile.status,
    taxRegimeCurrent: profile.taxRegimeCurrent,
    payload: profile.payload,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt
  };
}
function sanitizeEmployeeAttendanceLog(raw) {
  if (!raw) return null;
  const payload = raw.devicePayload || raw.device_payload || {};
  const attendanceMeta = payload && typeof payload === "object" ? payload.attendanceMeta || {} : {};
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    employeeId: String(raw.employeeId || raw.employee_id || "").trim(),
    attendanceDate: String(raw.attendanceDate || raw.attendance_date || "").trim(),
    checkInAt: String(raw.checkInAt || raw.check_in_at || "").trim(),
    checkOutAt: String(raw.checkOutAt || raw.check_out_at || "").trim(),
    checkInLatitude: raw.checkInLatitude ?? raw.check_in_latitude ?? null,
    checkInLongitude: raw.checkInLongitude ?? raw.check_in_longitude ?? null,
    checkInAccuracyMeters: raw.checkInAccuracyMeters ?? raw.check_in_accuracy_meters ?? null,
    checkOutLatitude: raw.checkOutLatitude ?? raw.check_out_latitude ?? null,
    checkOutLongitude: raw.checkOutLongitude ?? raw.check_out_longitude ?? null,
    checkOutAccuracyMeters: raw.checkOutAccuracyMeters ?? raw.check_out_accuracy_meters ?? null,
    checkInAddressLabel: String(raw.checkInAddressLabel || raw.check_in_address_label || "").trim(),
    checkOutAddressLabel: String(raw.checkOutAddressLabel || raw.check_out_address_label || "").trim(),
    checkInNote: String(raw.checkInNote || raw.check_in_note || "").trim(),
    checkOutNote: String(raw.checkOutNote || raw.check_out_note || "").trim(),
    siteId: String(raw.siteId || raw.site_id || "").trim(),
    locationStatus: String(raw.locationStatus || raw.location_status || "unknown").trim(),
    distanceFromSiteMeters: raw.distanceFromSiteMeters ?? raw.distance_from_site_meters ?? null,
    checkInLocationStatus: String(raw.checkInLocationStatus || raw.check_in_location_status || attendanceMeta?.checkIn?.locationStatus || "").trim(),
    checkOutLocationStatus: String(raw.checkOutLocationStatus || raw.check_out_location_status || attendanceMeta?.checkOut?.locationStatus || "").trim(),
    checkInDistanceFromSiteMeters: raw.checkInDistanceFromSiteMeters ?? raw.check_in_distance_from_site_meters ?? attendanceMeta?.checkIn?.distanceFromSiteMeters ?? null,
    checkOutDistanceFromSiteMeters: raw.checkOutDistanceFromSiteMeters ?? raw.check_out_distance_from_site_meters ?? attendanceMeta?.checkOut?.distanceFromSiteMeters ?? null,
    devicePayload: payload && typeof payload === "object" ? payload : {},
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim()
  };
}
function sanitizePayrollSettings(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    payrollEnabled: Boolean(raw.payrollEnabled ?? raw.payroll_enabled),
    defaultFbpProofCycle: String(raw.defaultFbpProofCycle || raw.default_fbp_proof_cycle || "quarterly").trim().toLowerCase(),
    defaultMonthlyProfessionalTax: Number(raw.defaultMonthlyProfessionalTax ?? raw.default_monthly_professional_tax ?? 0) || 0,
    applyLopProration: Boolean(raw.applyLopProration ?? raw.apply_lop_proration ?? true),
    prorateHealthInsurance: Boolean(raw.prorateHealthInsurance ?? raw.prorate_health_insurance ?? false),
    defaultSalaryTemplateCode: String(raw.defaultSalaryTemplateCode || raw.default_salary_template_code || "c2h_it_standard").trim() || "c2h_it_standard",
    policyNote: String(raw.policyNote || raw.policy_note || "").trim(),
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim(),
    createdBy: String(raw.createdBy || raw.created_by || "").trim(),
    updatedBy: String(raw.updatedBy || raw.updated_by || "").trim()
  };
}
function sanitizeEmployeeCompensation(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    employeeId: String(raw.employeeId || raw.employee_id || "").trim(),
    templateCode: String(raw.templateCode || raw.template_code || "custom").trim().toLowerCase(),
    effectiveFrom: String(raw.effectiveFrom || raw.effective_from || "").trim(),
    effectiveTo: String(raw.effectiveTo || raw.effective_to || "").trim(),
    annualCtc: Number(raw.annualCtc ?? raw.annual_ctc ?? 0) || 0,
    monthlyCtc: Number(raw.monthlyCtc ?? raw.monthly_ctc ?? 0) || 0,
    basicMonthly: Number(raw.basicMonthly ?? raw.basic_monthly ?? 0) || 0,
    basicAnnual: Number(raw.basicAnnual ?? raw.basic_annual ?? 0) || 0,
    hraMonthly: Number(raw.hraMonthly ?? raw.hra_monthly ?? 0) || 0,
    hraAnnual: Number(raw.hraAnnual ?? raw.hra_annual ?? 0) || 0,
    fbpMonthly: Number(raw.fbpMonthly ?? raw.fbp_monthly ?? 0) || 0,
    fbpAnnual: Number(raw.fbpAnnual ?? raw.fbp_annual ?? 0) || 0,
    specialAllowanceMonthly: Number(raw.specialAllowanceMonthly ?? raw.special_allowance_monthly ?? 0) || 0,
    specialAllowanceAnnual: Number(raw.specialAllowanceAnnual ?? raw.special_allowance_annual ?? 0) || 0,
    employerPfMonthly: Number(raw.employerPfMonthly ?? raw.employer_pf_monthly ?? 0) || 0,
    employerPfAnnual: Number(raw.employerPfAnnual ?? raw.employer_pf_annual ?? 0) || 0,
    employeePfMonthly: Number(raw.employeePfMonthly ?? raw.employee_pf_monthly ?? 0) || 0,
    employeePfAnnual: Number(raw.employeePfAnnual ?? raw.employee_pf_annual ?? 0) || 0,
    employerEsiMonthly: Number(raw.employerEsiMonthly ?? raw.employer_esi_monthly ?? 0) || 0,
    employerEsiAnnual: Number(raw.employerEsiAnnual ?? raw.employer_esi_annual ?? 0) || 0,
    employeeEsiMonthly: Number(raw.employeeEsiMonthly ?? raw.employee_esi_monthly ?? 0) || 0,
    employeeEsiAnnual: Number(raw.employeeEsiAnnual ?? raw.employee_esi_annual ?? 0) || 0,
    employerLwfMonthly: Number(raw.employerLwfMonthly ?? raw.employer_lwf_monthly ?? 0) || 0,
    employerLwfAnnual: Number(raw.employerLwfAnnual ?? raw.employer_lwf_annual ?? 0) || 0,
    employeeLwfMonthly: Number(raw.employeeLwfMonthly ?? raw.employee_lwf_monthly ?? 0) || 0,
    employeeLwfAnnual: Number(raw.employeeLwfAnnual ?? raw.employee_lwf_annual ?? 0) || 0,
    professionalTaxMonthly: Number(raw.professionalTaxMonthly ?? raw.professional_tax_monthly ?? 0) || 0,
    professionalTaxAnnual: Number(raw.professionalTaxAnnual ?? raw.professional_tax_annual ?? 0) || 0,
    gratuityMonthly: Number(raw.gratuityMonthly ?? raw.gratuity_monthly ?? 0) || 0,
    gratuityAnnual: Number(raw.gratuityAnnual ?? raw.gratuity_annual ?? 0) || 0,
    healthInsuranceMonthly: Number(raw.healthInsuranceMonthly ?? raw.health_insurance_monthly ?? 0) || 0,
    healthInsuranceAnnual: Number(raw.healthInsuranceAnnual ?? raw.health_insurance_annual ?? 0) || 0,
    otherAllowanceMonthly: Number(raw.otherAllowanceMonthly ?? raw.other_allowance_monthly ?? 0) || 0,
    otherAllowanceAnnual: Number(raw.otherAllowanceAnnual ?? raw.other_allowance_annual ?? 0) || 0,
    isActive: Boolean(raw.isActive ?? raw.is_active),
    notes: String(raw.notes || "").trim(),
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim(),
    createdBy: String(raw.createdBy || raw.created_by || "").trim(),
    updatedBy: String(raw.updatedBy || raw.updated_by || "").trim()
  };
}
function sanitizeFbpHead(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    headName: String(raw.headName || raw.head_name || "").trim(),
    monthlyLimit: Number(raw.monthlyLimit ?? raw.monthly_limit ?? 0) || 0,
    annualLimit: Number(raw.annualLimit ?? raw.annual_limit ?? 0) || 0,
    proofRequired: Boolean(raw.proofRequired ?? raw.proof_required),
    taxableIfUnclaimed: Boolean(raw.taxableIfUnclaimed ?? raw.taxable_if_unclaimed),
    active: Boolean(raw.active ?? true),
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim(),
    createdBy: String(raw.createdBy || raw.created_by || "").trim(),
    updatedBy: String(raw.updatedBy || raw.updated_by || "").trim()
  };
}
function sanitizeSalaryTemplate(raw) {
  if (!raw) return null;
  const config = raw.config && typeof raw.config === "object" ? raw.config : {};
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    code: String(raw.code || "").trim().toLowerCase(),
    name: String(raw.name || "").trim(),
    description: String(raw.description || "").trim(),
    config,
    active: Boolean(raw.active ?? true),
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim(),
    createdBy: String(raw.createdBy || raw.created_by || "").trim(),
    updatedBy: String(raw.updatedBy || raw.updated_by || "").trim()
  };
}
function sanitizePayrollInput(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    employeeId: String(raw.employeeId || raw.employee_id || "").trim(),
    payrollMonth: Number(raw.payrollMonth ?? raw.payroll_month ?? 0) || 0,
    payrollYear: Number(raw.payrollYear ?? raw.payroll_year ?? 0) || 0,
    totalCalendarDays: Number(raw.totalCalendarDays ?? raw.total_calendar_days ?? 0) || 0,
    workingDays: Number(raw.workingDays ?? raw.working_days ?? 0) || 0,
    payableDays: Number(raw.payableDays ?? raw.payable_days ?? 0) || 0,
    paidLeaveDays: Number(raw.paidLeaveDays ?? raw.paid_leave_days ?? 0) || 0,
    unpaidLeaveDays: Number(raw.unpaidLeaveDays ?? raw.unpaid_leave_days ?? 0) || 0,
    absentDays: Number(raw.absentDays ?? raw.absent_days ?? 0) || 0,
    holidays: Number(raw.holidays ?? 0) || 0,
    overtimeAmount: Number(raw.overtimeAmount ?? raw.overtime_amount ?? 0) || 0,
    arrearsAmount: Number(raw.arrearsAmount ?? raw.arrears_amount ?? 0) || 0,
    bonusAmount: Number(raw.bonusAmount ?? raw.bonus_amount ?? 0) || 0,
    otherEarnings: Number(raw.otherEarnings ?? raw.other_earnings ?? 0) || 0,
    otherDeductions: Number(raw.otherDeductions ?? raw.other_deductions ?? 0) || 0,
    professionalTax: Number(raw.professionalTax ?? raw.professional_tax ?? 0) || 0,
    tdsAmount: Number(raw.tdsAmount ?? raw.tds_amount ?? 0) || 0,
    approvedReimbursements: Number(raw.approvedReimbursements ?? raw.approved_reimbursements ?? 0) || 0,
    remarks: String(raw.remarks || "").trim(),
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim(),
    createdBy: String(raw.createdBy || raw.created_by || "").trim(),
    updatedBy: String(raw.updatedBy || raw.updated_by || "").trim()
  };
}
function sanitizePayrollRun(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    payrollMonth: Number(raw.payrollMonth ?? raw.payroll_month ?? 0) || 0,
    payrollYear: Number(raw.payrollYear ?? raw.payroll_year ?? 0) || 0,
    status: String(raw.status || "draft").trim().toLowerCase(),
    totalGross: Number(raw.totalGross ?? raw.total_gross ?? 0) || 0,
    totalDeductions: Number(raw.totalDeductions ?? raw.total_deductions ?? 0) || 0,
    totalNetPay: Number(raw.totalNetPay ?? raw.total_net_pay ?? 0) || 0,
    totalEmployerCost: Number(raw.totalEmployerCost ?? raw.total_employer_cost ?? 0) || 0,
    lockReason: String(raw.lockReason || raw.lock_reason || "").trim(),
    lockedAt: String(raw.lockedAt || raw.locked_at || "").trim(),
    approvedBy: String(raw.approvedBy || raw.approved_by || "").trim(),
    createdBy: String(raw.createdBy || raw.created_by || "").trim(),
    updatedBy: String(raw.updatedBy || raw.updated_by || "").trim(),
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim()
  };
}
function sanitizePayrollRunItem(raw) {
  if (!raw) return null;
  return {
    id: String(raw.id || "").trim(),
    companyId: String(raw.companyId || raw.company_id || "").trim(),
    payrollRunId: String(raw.payrollRunId || raw.payroll_run_id || "").trim(),
    employeeId: String(raw.employeeId || raw.employee_id || "").trim(),
    payload: raw.payload && typeof raw.payload === "object" ? raw.payload : {},
    grossEarnings: Number(raw.grossEarnings ?? raw.gross_earnings ?? 0) || 0,
    grossDeductions: Number(raw.grossDeductions ?? raw.gross_deductions ?? 0) || 0,
    netSalary: Number(raw.netSalary ?? raw.net_salary ?? 0) || 0,
    employerCost: Number(raw.employerCost ?? raw.employer_cost ?? 0) || 0,
    createdAt: String(raw.createdAt || raw.created_at || "").trim(),
    updatedAt: String(raw.updatedAt || raw.updated_at || "").trim()
  };
}
function roundMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
function calculatePayrollLine({ compensation, payrollInput, settings }) {
  const totalDays = Math.max(1, Number(payrollInput?.totalCalendarDays || 0) || 1);
  const payableDays = Math.max(0, Number(payrollInput?.payableDays || totalDays));
  const prorate = settings?.applyLopProration !== false;
  const factor = prorate ? Math.min(1, payableDays / totalDays) : 1;
  const prorateField = (v) => roundMoney((Number(v || 0) || 0) * factor);
  const prorateHealth = settings?.prorateHealthInsurance === true;

  const basic = prorateField(compensation?.basicMonthly);
  const hra = prorateField(compensation?.hraMonthly);
  const fbp = prorateField(compensation?.fbpMonthly);
  const special = prorateField(compensation?.specialAllowanceMonthly);
  const healthInsurance = prorateHealth ? prorateField(compensation?.healthInsuranceMonthly) : roundMoney(compensation?.healthInsuranceMonthly || 0);
  const otherAllowance = prorateField(compensation?.otherAllowanceMonthly);
  const otherEarnings = roundMoney(payrollInput?.otherEarnings || 0) + roundMoney(payrollInput?.overtimeAmount || 0) + roundMoney(payrollInput?.arrearsAmount || 0) + roundMoney(payrollInput?.bonusAmount || 0);
  const approvedReimbursements = roundMoney(payrollInput?.approvedReimbursements || 0);

  const grossEarnings = roundMoney(basic + hra + fbp + special + otherAllowance + otherEarnings + approvedReimbursements);
  const employeePf = roundMoney(compensation?.employeePfMonthly || 0);
  const employeeEsi = roundMoney(compensation?.employeeEsiMonthly || 0);
  const employeeLwf = roundMoney(compensation?.employeeLwfMonthly || 0);
  const professionalTax = roundMoney(payrollInput?.professionalTax || compensation?.professionalTaxMonthly || settings?.defaultMonthlyProfessionalTax || 0);
  const tds = roundMoney(payrollInput?.tdsAmount || 0);
  const otherDeductions = roundMoney(payrollInput?.otherDeductions || 0);
  const grossDeductions = roundMoney(employeePf + employeeEsi + employeeLwf + professionalTax + tds + otherDeductions);
  const netSalary = roundMoney(grossEarnings - grossDeductions);

  const employerPf = roundMoney(compensation?.employerPfMonthly || 0);
  const employerEsi = roundMoney(compensation?.employerEsiMonthly || 0);
  const employerLwf = roundMoney(compensation?.employerLwfMonthly || 0);
  const gratuity = roundMoney(compensation?.gratuityMonthly || 0);
  // Keep employer cost aligned with CTC semantics:
  // - If monthly CTC exists, employer cost should come from monthly CTC (prorated if enabled)
  // - Otherwise, fallback to computed gross + employer contributions
  const configuredMonthlyCtcRaw = Number(compensation?.monthlyCtc || 0) || 0;
  const configuredMonthlyCtc = configuredMonthlyCtcRaw > 0
    ? roundMoney(configuredMonthlyCtcRaw * factor)
    : 0;
  const computedEmployerCost = roundMoney(grossEarnings + employerPf + employerEsi + employerLwf + gratuity + healthInsurance);
  const employerCost = configuredMonthlyCtc > 0 ? configuredMonthlyCtc : computedEmployerCost;

  return {
    proratedBasic: basic,
    proratedHra: hra,
    proratedFbp: fbp,
    proratedSpecialAllowance: special,
    otherAllowance,
    otherEarnings,
    approvedReimbursements,
    grossEarnings,
    employeePf,
    employeeEsi,
    employeeLwf,
    professionalTax,
    tds,
    otherDeductions,
    grossDeductions,
    netSalary,
    employerPf,
    employerEsi,
    employerLwf,
    gratuityProvision: gratuity,
    healthInsuranceBenefit: healthInsurance,
    totalEmployerCost: employerCost,
    configuredMonthlyCtc,
    computedEmployerCost,
    payableDays,
    totalDays,
    prorationFactor: roundMoney(factor)
  };
}
function persistedAssessmentId(rawId) {
  const v = String(rawId || "").trim();
  if (!v || /^(quick-note|assessment)-/i.test(v)) return crypto.randomUUID();
  return v;
}
function persistedJobId(rawId) {
  const v = String(rawId || "").trim();
  if (!v || /^jd-/i.test(v)) return crypto.randomUUID();
  return v;
}
function systemJobRowId(companyId, key) {
  const hex = crypto
    .createHash("sha256")
    .update(`${String(companyId || "").trim()}:${String(key || "").trim()}`)
    .digest("hex");
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}
function assessmentRow(assessment, actor, companyId) {
  const a = sanitizeAssessment(assessment);
  const id = persistedAssessmentId(a.id);
  const now = new Date().toISOString();
  const next = {
    ...a,
    id,
    companyId,
    recruiterId: actor.id,
    recruiterName: actor.name,
    recruiterEmail: actor.email,
    generatedAt: a.generatedAt || now,
    updatedAt: now
  };
  const candidateId = String(next.candidateId || "").trim();
  return {
    id,
    company_id: companyId,
    recruiter_id: actor.id,
    recruiter_name: actor.name,
    recruiter_email: actor.email,
    candidate_id: candidateId,
    candidate_name: next.candidateName || "",
    phone_number: next.phoneNumber || "",
    email_id: next.emailId || "",
    client_name: next.clientName || "",
    highest_education: next.highestEducation || "",
    current_company: next.currentCompany || "",
    current_designation: next.currentDesignation || "",
    total_experience: next.totalExperience || "",
    average_tenure_per_company: next.averageTenurePerCompany || "",
    current_org_tenure: next.currentOrgTenure || "",
    experience_timeline: next.experienceTimeline || "",
    jd_title: next.jdTitle || "",
    job_description: next.jobDescription || "",
    must_have_skills: next.mustHaveSkills || "",
    red_flags: next.redFlags || "",
    jd_shortcuts: next.jdShortcuts || "",
    standard_questions: next.standardQuestions || "",
    recruiter_notes: next.recruiterNotes || "",
    created_at: next.generatedAt,
    updated_at: next.updatedAt,
    question_mode: next.questionMode || "",
    location: next.location || "",
    linkedin_url: next.linkedinUrl || "",
    callback_notes: next.callbackNotes || "",
    pipeline_stage: "",
    candidate_status: next.candidateStatus || "",
    follow_up_at: next.followUpAt || "",
    interview_at: next.interviewAt || "",
    offer_amount: next.offerAmount || "",
    offer_doj: next.offerDoj || "",
    status: next.status || "",
    custom_pipeline_stages: next.customPipelineStages || "",
    custom_candidate_statuses: next.customCandidateStatuses || "",
    custom_hr_candidate_statuses: next.customHrCandidateStatuses || "",
    page_title: next.pageTitle || "",
    page_url: next.pageUrl || "",
    pdf_filename: next.pdfFilename || "",
    sections: next.sections || {},
    result: next.result || {},
    answers: next.answers || [],
    question_answer_pairs: next.questionAnswerPairs || [],
    payload: next
  };
}
const jobRow = (job) => {
  const j = sanitizeJob(job);
  const id = persistedJobId(j.id);
  return { id, company_id: j.companyId, title: j.title, client_name: j.clientName || "", job_description: j.jobDescription || "", must_have_skills: j.mustHaveSkills || "", red_flags: j.redFlags || "", recruiter_notes: j.recruiterNotes || "", standard_questions: j.standardQuestions || "", jd_shortcuts: j.jdShortcuts || "", created_at: j.createdAt || new Date().toISOString(), updated_at: j.updatedAt || new Date().toISOString(), updated_by: j.updatedBy || "", payload: { ...j, id } };
};

let seedPromise = null;
async function ensureSeeded() {
  if (!cfg().on) return;
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const rows = await sbSel("users", "select=id&limit=1");
    if (Array.isArray(rows) && rows.length) return;
    const store = readStore();
    if (!Array.isArray(store.users) || !store.users.length) return;
    if (store.companies.length) await sbIns("companies", store.companies.map((c) => ({ id: c.id, name: c.name, created_at: c.createdAt || c.created_at || new Date().toISOString() })), { conflict: "id", upsert: true, returning: "minimal" });
    await sbIns("users", store.users.map((u) => ({ id: u.id, company_id: u.companyId || u.company_id, company_name: u.companyName || u.company_name || "", name: u.name, email: normalizeEmail(u.email), role: u.role === "admin" ? "admin" : "team", password_hash: u.passwordHash || u.password_hash, created_at: u.createdAt || u.created_at || new Date().toISOString() })), { conflict: "id", upsert: true, returning: "minimal" });
    if (store.jobs.length) await sbIns("company_jobs", store.jobs.map(jobRow), { conflict: "id", upsert: true, returning: "minimal" });
    if (store.assessments.length) {
      const usersById = new Map(store.users.map((u) => [u.id, sanitizeUser(u)]));
      await sbIns("assessments", store.assessments.map((a) => {
        const actor = usersById.get(a.recruiterId) || usersById.get(a.recruiter_id) || { id: String(a.recruiterId || a.recruiter_id || "").trim() || crypto.randomUUID(), name: String(a.recruiterName || a.recruiter_name || "").trim() || "Unknown", email: String(a.recruiterEmail || a.recruiter_email || "").trim() || "", companyId: String(a.companyId || a.company_id || "").trim() };
        return assessmentRow(a, actor, actor.companyId || a.companyId || a.company_id);
      }), { conflict: "id", upsert: true, returning: "minimal" });
    }
  })().finally(() => { seedPromise = null; });
  return seedPromise;
}

async function getUserByEmail(email) {
  const e = normalizeEmail(email);
  if (!cfg().on) return readStore().users.find((u) => u.email === e) || null;
  await ensureSeeded();
  const rows = await sbSel("users", `select=*&email=eq.${enc(e)}&limit=1`);
  return rows[0] || null;
}
async function getUserById(userId, companyId = "") {
  const id = String(userId || "").trim();
  if (!id) return null;
  if (!cfg().on) return readStore().users.find((u) => u.id === id && (!companyId || u.companyId === companyId)) || null;
  await ensureSeeded();
  const filters = [`id=eq.${enc(id)}`];
  if (companyId) filters.push(`company_id=eq.${enc(companyId)}`);
  const rows = await sbSel("users", `select=*&${filters.join("&")}&limit=1`);
  return rows[0] || null;
}

async function listCompaniesAndUsersSummary() {
  if (!cfg().on) {
    const store = readStore();
    return { companyCount: store.companies.length, userCount: store.users.length };
  }
  await ensureSeeded();
  const [companies, users] = await Promise.all([sbSel("companies", "select=id&limit=1000"), sbSel("users", "select=id&limit=1000")]);
  return { companyCount: companies.length, userCount: users.length };
}
async function bootstrapAdmin({ companyName, adminName, email, password }) {
  const e = normalizeEmail(email);
  if (!companyName || !adminName || !e || !password) throw new Error("companyName, adminName, email, and password are required.");
  if (!cfg().on) {
    const store = readStore();
    if (store.users.length) throw new Error("Bootstrap is already completed. Use login or admin user creation instead.");
    const companyId = crypto.randomUUID();
    const company = {
      id: companyId,
      name: String(companyName).trim(),
      createdAt: new Date().toISOString(),
      applicantIntakeSecret: buildApplicantIntakeSecret(companyName)
    };
    const user = { id: crypto.randomUUID(), companyId, companyName: company.name, name: String(adminName).trim(), email: e, role: "admin", passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    store.companies.push(company); store.users.push(user); writeStore(store); return { company, user: sanitizeUser(user) };
  }
  await ensureSeeded();
  const rows = await sbSel("users", "select=id&limit=1");
  if (rows.length) throw new Error("Bootstrap is already completed. Use login or admin user creation instead.");
  const company = {
    id: crypto.randomUUID(),
    name: String(companyName).trim(),
    created_at: new Date().toISOString(),
    applicant_intake_secret: buildApplicantIntakeSecret(companyName)
  };
  const user = { id: crypto.randomUUID(), company_id: company.id, company_name: company.name, name: String(adminName).trim(), email: e, role: "admin", password_hash: hashPassword(password), created_at: new Date().toISOString() };
  try {
    await sbIns("companies", [company], { conflict: "id", upsert: true });
  } catch (error) {
    const message = String(error?.message || error);
    if (/applicant_intake_secret/i.test(message)) {
      await sbIns("companies", [{ id: company.id, name: company.name, created_at: company.created_at }], { conflict: "id", upsert: true });
    } else {
      throw error;
    }
  }
  const inserted = await sbIns("users", [user], { conflict: "id", upsert: true });
  return {
    company: {
      id: company.id,
      name: company.name,
      createdAt: company.created_at,
      applicantIntakeSecret: company.applicant_intake_secret || String(process.env.APPLICANT_INTAKE_SECRET || "").trim()
    },
    user: sanitizeUser(inserted[0] || user)
  };
}
async function createCompanyWithAdmin({ companyName, adminName, email, password, platformSecret, actor, platformActor }) {
  assertCanCreatePlatformCompany(platformSecret, actor, platformActor);
  const e = normalizeEmail(email);
  if (!companyName || !adminName || !e || !password) throw new Error("companyName, adminName, email, and password are required.");
  if (await getUserByEmail(e)) throw new Error("A user with this email already exists.");
  if (!cfg().on) {
    const store = readStore();
    const companyId = crypto.randomUUID();
    const company = {
      id: companyId,
      name: String(companyName).trim(),
      createdAt: new Date().toISOString(),
      applicantIntakeSecret: buildApplicantIntakeSecret(companyName)
    };
    const user = {
      id: crypto.randomUUID(),
      companyId,
      companyName: company.name,
      name: String(adminName).trim(),
      email: e,
      role: "admin",
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString()
    };
    store.companies.push(company);
    store.users.push(user);
    writeStore(store);
    return { company, user: sanitizeUser(user) };
  }
  await ensureSeeded();
  const company = {
    id: crypto.randomUUID(),
    name: String(companyName).trim(),
    created_at: new Date().toISOString(),
    applicant_intake_secret: buildApplicantIntakeSecret(companyName)
  };
  const user = {
    id: crypto.randomUUID(),
    company_id: company.id,
    company_name: company.name,
    name: String(adminName).trim(),
    email: e,
    role: "admin",
    password_hash: hashPassword(password),
    created_at: new Date().toISOString()
  };
  try {
    await sbIns("companies", [company], { conflict: "id", upsert: true });
  } catch (error) {
    const message = String(error?.message || error);
    if (/applicant_intake_secret/i.test(message)) {
      await sbIns("companies", [{ id: company.id, name: company.name, created_at: company.created_at }], { conflict: "id", upsert: true });
    } else {
      throw error;
    }
  }
  const inserted = await sbIns("users", [user], { conflict: "id", upsert: true });
  return {
    company: {
      id: company.id,
      name: company.name,
      createdAt: company.created_at,
      applicantIntakeSecret: company.applicant_intake_secret || String(process.env.APPLICANT_INTAKE_SECRET || "").trim()
    },
    user: sanitizeUser(inserted[0] || user)
  };
}

async function saveCompanyLicense(companyId, license) {
  const scopedCompanyId = String(companyId || "").trim();
  if (!scopedCompanyId) throw new Error("companyId is required.");
  const nextLicense = sanitizeCompanyLicense({ ...license, companyId: scopedCompanyId });
  const now = new Date().toISOString();
  if (!cfg().on) {
    const store = readStore();
    store.jobs = Array.isArray(store.jobs) ? store.jobs : [];
    const ix = store.jobs.findIndex((item) => String(item.companyId || item.company_id || "") === scopedCompanyId && isCompanyLicenseRow(item));
    const row = {
      id: COMPANY_LICENSE_ROW_ID,
      companyId: scopedCompanyId,
      title: COMPANY_LICENSE_ROW_TITLE,
      clientName: "__system__",
      jobDescription: "Company license and trial quota",
      payload: nextLicense,
      createdAt: ix >= 0 ? store.jobs[ix].createdAt : now,
      updatedAt: now
    };
    if (ix >= 0) store.jobs[ix] = row; else store.jobs.push(row);
    writeStore(store);
    return nextLicense;
  }
  await ensureSeeded();
  const row = {
    id: systemJobRowId(scopedCompanyId, COMPANY_LICENSE_ROW_ID),
    company_id: scopedCompanyId,
    title: COMPANY_LICENSE_ROW_TITLE,
    client_name: "__system__",
    job_description: "Company license and trial quota",
    created_at: now,
    updated_at: now,
    updated_by: "system",
    payload: nextLicense
  };
  const rows = await sbIns("company_jobs", [row], { conflict: "id", upsert: true });
  return sanitizeCompanyLicense(rows?.[0] || row);
}

async function getCompanyLicense(companyId) {
  const scopedCompanyId = String(companyId || "").trim();
  if (!scopedCompanyId) throw new Error("companyId is required.");
  if (!cfg().on) {
    const store = readStore();
    const company = sanitizeCompany((store.companies || []).find((item) => String(item.id || "") === scopedCompanyId));
    const row = (store.jobs || []).find((item) => String(item.companyId || item.company_id || "") === scopedCompanyId && isCompanyLicenseRow(item));
    return row ? sanitizeCompanyLicense(row, company) : sanitizeCompanyLicense({ plan: "legacy", status: "legacy", captureLimit: 0, capturesUsed: 0, companyId: scopedCompanyId }, company);
  }
  await ensureSeeded();
  const [companyRows, licenseRows] = await Promise.all([
    sbSel("companies", `select=*&id=eq.${enc(scopedCompanyId)}&limit=1`),
    sbSel("company_jobs", `select=*&company_id=eq.${enc(scopedCompanyId)}&title=eq.${enc(COMPANY_LICENSE_ROW_TITLE)}&limit=1`)
  ]);
  const company = sanitizeCompany(companyRows?.[0]);
  const row = licenseRows?.[0] || null;
  return row ? sanitizeCompanyLicense(row, company) : sanitizeCompanyLicense({ plan: "legacy", status: "legacy", captureLimit: 0, capturesUsed: 0, companyId: scopedCompanyId }, company);
}

async function incrementCompanyCaptureUsage(companyId, amount = 1) {
  const license = await getCompanyLicense(companyId);
  if (!license.canCapture) {
    throw new Error("Trial limit reached. Upgrade required to save more captures.");
  }
  if (license.status === "legacy" || license.plan === "legacy" || license.status === "active") return license;
  return saveCompanyLicense(companyId, {
    ...license,
    capturesUsed: license.capturesUsed + Math.max(1, Number(amount) || 1),
    updatedAt: new Date().toISOString()
  });
}

async function createTrialCompanyWithAdmin({ companyName, adminName, email, password }) {
  const e = normalizeEmail(email);
  if (!companyName || !adminName || !e || !password) throw new Error("companyName, adminName, email, and password are required.");
  if (await getUserByEmail(e)) throw new Error("A user with this email already exists.");
  const now = new Date().toISOString();
  if (!cfg().on) {
    const store = readStore();
    const company = { id: crypto.randomUUID(), name: String(companyName).trim(), createdAt: now, applicantIntakeSecret: buildApplicantIntakeSecret(companyName) };
    const user = { id: crypto.randomUUID(), companyId: company.id, companyName: company.name, name: String(adminName).trim(), email: e, role: "admin", passwordHash: hashPassword(password), createdAt: now };
    store.companies.push(company);
    store.users.push(user);
    writeStore(store);
    const license = await saveCompanyLicense(company.id, { companyId: company.id, plan: "trial", status: "trial", trialStartedAt: now, trialEndsAt: addDays(now, 14), captureLimit: 50, capturesUsed: 0 });
    return { company, user: sanitizeUser(user), license };
  }
  await ensureSeeded();
  const company = { id: crypto.randomUUID(), name: String(companyName).trim(), created_at: now, applicant_intake_secret: buildApplicantIntakeSecret(companyName) };
  const user = { id: crypto.randomUUID(), company_id: company.id, company_name: company.name, name: String(adminName).trim(), email: e, role: "admin", password_hash: hashPassword(password), created_at: now };
  try {
    await sbIns("companies", [company], { conflict: "id", upsert: true });
  } catch (error) {
    const message = String(error?.message || error);
    if (/applicant_intake_secret/i.test(message)) {
      await sbIns("companies", [{ id: company.id, name: company.name, created_at: company.created_at }], { conflict: "id", upsert: true });
    } else {
      throw error;
    }
  }
  const inserted = await sbIns("users", [user], { conflict: "id", upsert: true });
  const license = await saveCompanyLicense(company.id, { companyId: company.id, plan: "trial", status: "trial", trialStartedAt: now, trialEndsAt: addDays(now, 14), captureLimit: 50, capturesUsed: 0 });
  return { company: sanitizeCompany(company), user: sanitizeUser(inserted?.[0] || user), license };
}
async function createUser({ actorUserId, companyId, name, email, password, role }) {
  const e = normalizeEmail(email), r = role === "admin" ? "admin" : "team";
  if (!actorUserId || !companyId || !name || !e || !password) throw new Error("actorUserId, companyId, name, email, and password are required.");
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can create recruiter accounts.");
  if (await getUserByEmail(e)) throw new Error("A user with this email already exists.");
  const license = await getCompanyLicense(companyId).catch(() => null);
  const isTrial = license && (String(license.status || "").toLowerCase() === "trial" || String(license.plan || "").toLowerCase() === "trial");
  if (!cfg().on) {
    const store = readStore(); const company = store.companies.find((c) => c.id === companyId); if (!company) throw new Error("Company not found.");
    if (isTrial) {
      const memberCount = (store.users || []).filter((u) => u && String(u.companyId || u.company_id || "") === String(companyId) && String(u.role || "").toLowerCase() !== "client").length;
      if (memberCount >= 3) {
        throw new Error("Trial workspaces can have at most 3 team users (1 admin + 2 recruiters).");
      }
    }
    const user = { id: crypto.randomUUID(), companyId, companyName: company.name, name: String(name).trim(), email: e, role: r, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    store.users.push(user); writeStore(store); return sanitizeUser(user);
  }
  const companies = await sbSel("companies", `select=*&id=eq.${enc(companyId)}&limit=1`);
  const company = companies[0]; if (!company) throw new Error("Company not found.");
  if (isTrial) {
    const existingUsers = await sbSel("users", `select=id,role&company_id=eq.${enc(companyId)}&limit=1000`).catch(() => []);
    const memberCount = (existingUsers || []).filter((u) => u && String(u.role || "").toLowerCase() !== "client").length;
    if (memberCount >= 3) {
      throw new Error("Trial workspaces can have at most 3 team users (1 admin + 2 recruiters).");
    }
  }
  const rows = await sbIns("users", [{ id: crypto.randomUUID(), company_id: companyId, company_name: company.name, name: String(name).trim(), email: e, role: r, password_hash: hashPassword(password), created_at: new Date().toISOString() }], { conflict: "id", upsert: true });
  return sanitizeUser(rows[0]);
}
async function getCompanyApplicantIntakeSecret(companyId) {
  const id = String(companyId || "").trim();
  if (!id) throw new Error("companyId is required.");
  if (!cfg().on) {
    const company = sanitizeCompany(readStore().companies.find((item) => String(item?.id || "").trim() === id));
    if (!company) throw new Error("Company not found.");
    const secret = String(company.applicantIntakeSecret || "").trim();
    return {
      company,
      applicantIntakeSecret: secret || String(process.env.APPLICANT_INTAKE_SECRET || "").trim(),
      source: secret ? "company" : "global_fallback"
    };
  }
  await ensureSeeded();
  try {
    const rows = await sbSel("companies", `select=id,name,created_at,applicant_intake_secret&id=eq.${enc(id)}&limit=1`);
    const company = sanitizeCompany(rows?.[0]);
    if (!company) throw new Error("Company not found.");
    const secret = String(company.applicantIntakeSecret || "").trim();
    return {
      company,
      applicantIntakeSecret: secret || String(process.env.APPLICANT_INTAKE_SECRET || "").trim(),
      source: secret ? "company" : "global_fallback"
    };
  } catch (error) {
    const message = String(error?.message || error);
    if (/applicant_intake_secret/i.test(message)) {
      const rows = await sbSel("companies", `select=id,name,created_at&id=eq.${enc(id)}&limit=1`);
      const company = sanitizeCompany(rows?.[0]);
      if (!company) throw new Error("Company not found.");
      return {
        company,
        applicantIntakeSecret: String(process.env.APPLICANT_INTAKE_SECRET || "").trim(),
        source: "global_fallback"
      };
    }
    throw error;
  }
}
async function setCompanyApplicantIntakeSecret({ actorUserId, companyId, applicantIntakeSecret }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can manage applicant intake secrets.");
  const secret = String(applicantIntakeSecret || "").trim() || buildApplicantIntakeSecret(actor.companyName || "company");
  if (!cfg().on) {
    const store = readStore();
    const company = store.companies.find((item) => String(item?.id || "").trim() === String(companyId || "").trim());
    if (!company) throw new Error("Company not found.");
    company.applicantIntakeSecret = secret;
    writeStore(store);
    return {
      company: sanitizeCompany(company),
      applicantIntakeSecret: secret,
      source: "company"
    };
  }
  try {
    await sbPatch("companies", `id=eq.${enc(companyId)}`, { applicant_intake_secret: secret });
  } catch (error) {
    const message = String(error?.message || error);
    if (/applicant_intake_secret/i.test(message)) {
      throw new Error("Company applicant intake secret column is missing. Add applicant_intake_secret to the companies table first.");
    }
    throw error;
  }
  return getCompanyApplicantIntakeSecret(companyId);
}
async function deleteUser({ actorUserId, companyId, userId }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can delete recruiters.");
  const target = sanitizeUser(await getUserById(userId, companyId));
  if (!target) throw new Error("Recruiter not found.");
  if (target.role === "admin") throw new Error("Admin accounts cannot be deleted from this panel.");
  if (!cfg().on) {
    const store = readStore(); store.users = store.users.filter((u) => u.id !== userId); store.sessions = (store.sessions || []).filter((s) => s.userId !== userId); writeStore(store);
  } else {
    await sbDel("sessions", `user_id=eq.${enc(userId)}`); await sbDel("users", `id=eq.${enc(userId)}&company_id=eq.${enc(companyId)}`);
  }
  return { deleted: true, userId };
}
async function resetUserPassword({ actorUserId, companyId, userId, newPassword }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can reset recruiter passwords.");
  const target = sanitizeUser(await getUserById(userId, companyId));
  if (!target) throw new Error("Recruiter not found.");
  if (target.role === "admin") throw new Error("Admin passwords cannot be reset from this panel.");
  if (!cfg().on) {
    const store = readStore(); const row = store.users.find((u) => u.id === userId && u.companyId === companyId); row.passwordHash = hashPassword(newPassword); store.sessions = (store.sessions || []).filter((s) => s.userId !== userId); writeStore(store);
  } else {
    await sbPatch("users", `id=eq.${enc(userId)}&company_id=eq.${enc(companyId)}`, { password_hash: hashPassword(newPassword) }); await sbDel("sessions", `user_id=eq.${enc(userId)}`);
  }
  return { reset: true, userId };
}
async function login({ email, password }) {
  const e = normalizeEmail(email); const user = await getUserByEmail(e);
  if (!user || !verifyPassword(password, user.passwordHash || user.password_hash)) throw new Error("Invalid email or password.");
  const sessionUser = sanitizeUser(user); const token = crypto.randomBytes(32).toString("hex");
  if (!cfg().on) {
    const store = readStore(); store.sessions = (store.sessions || []).filter((s) => s.token !== token); store.sessions.push({ token, userId: sessionUser.id, companyId: sessionUser.companyId, createdAt: new Date().toISOString() }); writeStore(store);
  } else {
    await sbIns("sessions", [{ token, user_id: sessionUser.id, company_id: sessionUser.companyId, created_at: new Date().toISOString() }], { conflict: "token", upsert: true });
  }
  return { token, user: sessionUser };
}
async function getSessionUser(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  if (!cfg().on) {
    const store = readStore(); const session = (store.sessions || []).find((s) => s.token === t); if (!session) return null; return sanitizeUser(store.users.find((u) => u.id === session.userId));
  }
  await ensureSeeded();
  const sessions = await sbSel("sessions", `select=*&token=eq.${enc(t)}&limit=1`);
  const session = sessions[0]; if (!session) return null; return sanitizeUser(await getUserById(session.user_id, session.company_id));
}
async function requireSessionUser(token) { const user = await getSessionUser(token); if (!user) throw new Error("Invalid or missing session."); return user; }
function getClientSessionSecret() {
  return (
    String(process.env.CLIENT_PORTAL_SESSION_SECRET || "").trim() ||
    String(process.env.PLATFORM_SESSION_SECRET || "").trim() ||
    "client-portal-session-secret"
  );
}
function createSignedClientToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", getClientSessionSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function readSignedClientToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const expected = crypto.createHmac("sha256", getClientSessionSecret()).update(encoded).digest("base64url");
  if (!timingSafeEqualString(signature, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload?.type !== "client_portal") return null;
    if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}
async function listCompanyUsers(companyId) {
  if (!cfg().on) return readStore().users.filter((u) => u.companyId === companyId && String(u.role || "").toLowerCase() !== "client").map(sanitizeUser);
  await ensureSeeded(); return (await sbSel("users", `select=*&company_id=eq.${enc(companyId)}&order=created_at.asc`)).filter((u) => String(u.role || "").toLowerCase() !== "client").map(sanitizeUser);
}
async function listCompanyJobs(companyId, recruiterId = "") {
  const scopedRecruiterId = String(recruiterId || "").trim();
  if (!cfg().on) {
    const store = readStore();
    const jobs = (store.jobs || [])
      .filter((j) => j.companyId === companyId && !isSystemJobRow(j))
      .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")))
      .map(sanitizeJob);
    if (!scopedRecruiterId) return jobs;

    store.jobShortcuts = Array.isArray(store.jobShortcuts) ? store.jobShortcuts : [];
    const shortcutsMap = new Map(
      store.jobShortcuts
        .filter((row) => String(row?.companyId || "") === String(companyId) && String(row?.recruiterId || "") === scopedRecruiterId)
        .map((row) => [String(row?.jobId || "").trim(), String(row?.shortcuts || "")])
        .filter(([jobId]) => Boolean(jobId))
    );

    return jobs.map((job) => (shortcutsMap.has(String(job?.id || "")) ? { ...job, jdShortcuts: shortcutsMap.get(String(job.id)) } : job));
  }

  await ensureSeeded();
  const jobs = (await sbSel("company_jobs", `select=*&company_id=eq.${enc(companyId)}&order=updated_at.desc`))
    .filter((row) => !isSystemJobRow(row))
    .map(sanitizeJob);
  if (!scopedRecruiterId) return jobs;

  const shortcutRows = await sbSel(
    "company_job_shortcuts",
    `select=job_id,shortcuts&company_id=eq.${enc(companyId)}&recruiter_id=eq.${enc(scopedRecruiterId)}&limit=5000`
  ).catch(() => []);
  const shortcutsMap = new Map(
    (shortcutRows || [])
      .map((row) => [String(row?.job_id || "").trim(), String(row?.shortcuts || "")])
      .filter(([jobId]) => Boolean(jobId))
  );
  return jobs.map((job) => (shortcutsMap.has(String(job?.id || "")) ? { ...job, jdShortcuts: shortcutsMap.get(String(job.id)) } : job));
}
async function getPublicCompanyJob(jobId) {
  const id = String(jobId || "").trim();
  if (!id) throw new Error("jobId is required.");
  if (!cfg().on) {
    const job = sanitizeJob((readStore().jobs || []).find((j) => String(j?.id || "").trim() === id && !isSystemJobRow(j)));
    if (!job) throw new Error("Job not found.");
    return job;
  }
  await ensureSeeded();
  const rows = await sbSel("company_jobs", `select=*&id=eq.${enc(id)}&limit=1`);
  const job = sanitizeJob((rows || []).find((row) => !isSystemJobRow(row)));
  if (!job) throw new Error("Job not found.");
  return job;
}
async function saveCompanyJob({ actorUserId, companyId, job }) {
  if (!actorUserId || !companyId || !job?.title || !job?.jobDescription) throw new Error("actorUserId, companyId, job title, and job description are required.");
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor) throw new Error("Authenticated recruiter not found for this company.");
  const actorIsAdmin = String(actor.role || "").toLowerCase() === "admin";
  const incomingRecruiterShortcuts = String(job?.jdShortcuts || "").trim();
  let existingJob = null;
  const incomingJobId = String(job?.id || "").trim();
  if (!cfg().on) {
    const store = readStore(); store.jobs = Array.isArray(store.jobs) ? store.jobs : []; const now = new Date().toISOString(); const ix = store.jobs.findIndex((i) => i.id === job.id && i.companyId === companyId);
    existingJob = ix >= 0 ? sanitizeJob(store.jobs[ix]) : null;
    if (!actorIsAdmin && existingJob?.ownerRecruiterId && String(existingJob.ownerRecruiterId) !== String(actor.id)) throw new Error("Only an admin or the owner recruiter can edit this JD.");
    const globalShortcuts = existingJob ? String(existingJob.jdShortcuts || "").trim() : "";
    const ownerRecruiterId = actorIsAdmin ? String(job.ownerRecruiterId || job.owner_recruiter_id || "").trim() : String(actor.id || "").trim();
    const ownerRecruiterName = actorIsAdmin ? String(job.ownerRecruiterName || job.owner_recruiter_name || "").trim() : String(actor.name || "").trim();
    const assignedRecruiters = actorIsAdmin && Array.isArray(job.assignedRecruiters) ? job.assignedRecruiters : ownerRecruiterId ? [{ id: ownerRecruiterId, name: ownerRecruiterName, primary: true }] : [];
    const next = {
      id: persistedJobId(job.id),
      companyId,
      title: String(job.title || "").trim(),
      clientName: String(job.clientName || "").trim(),
      aboutCompany: String(job.aboutCompany || "").trim(),
      // Anonymous/public apply link fields.
      publicCompanyLine: String(job.publicCompanyLine || job.public_company_line || "").trim(),
      publicTitle: String(job.publicTitle || job.public_title || "").trim(),
      location: String(job.location || "").trim(),
      workMode: String(job.workMode || "").trim(),
      jobDescription: String(job.jobDescription || "").trim(),
      mustHaveSkills: String(job.mustHaveSkills || "").trim(),
      redFlags: String(job.redFlags || "").trim(),
      recruiterNotes: String(job.recruiterNotes || "").trim(),
      standardQuestions: String(job.standardQuestions || "").trim(),
      jdShortcuts: globalShortcuts,
      ownerRecruiterId,
      ownerRecruiterName,
      assignedRecruiters,
      createdAt: ix >= 0 ? store.jobs[ix].createdAt : now,
      updatedAt: now,
      updatedBy: actor.email
    };
    if (ix >= 0) store.jobs[ix] = next; else store.jobs.push(next);

    store.jobShortcuts = Array.isArray(store.jobShortcuts) ? store.jobShortcuts : [];
    const shortcutIx = store.jobShortcuts.findIndex((row) => row && row.companyId === companyId && row.jobId === next.id && row.recruiterId === actor.id);
    const shortcutRow = {
      companyId,
      jobId: next.id,
      recruiterId: actor.id,
      shortcuts: incomingRecruiterShortcuts,
      createdAt: shortcutIx >= 0 ? store.jobShortcuts[shortcutIx].createdAt : now,
      updatedAt: now,
      updatedBy: actor.email
    };
    if (shortcutIx >= 0) store.jobShortcuts[shortcutIx] = shortcutRow; else store.jobShortcuts.push(shortcutRow);

    writeStore(store);
    return { ...sanitizeJob(next), jdShortcuts: incomingRecruiterShortcuts };
  }
  await ensureSeeded();
  if (incomingJobId) {
    const existingRows = await sbSel("company_jobs", `select=*&id=eq.${enc(incomingJobId)}&company_id=eq.${enc(companyId)}&limit=1`);
    existingJob = sanitizeJob(existingRows?.[0]);
    if (!actorIsAdmin && existingJob?.ownerRecruiterId && String(existingJob.ownerRecruiterId) !== String(actor.id)) throw new Error("Only an admin or the owner recruiter can edit this JD.");
  }
  const globalShortcuts = existingJob ? String(existingJob.jdShortcuts || "").trim() : "";
  const ownerRecruiterId = actorIsAdmin ? String(job.ownerRecruiterId || job.owner_recruiter_id || "").trim() : String(actor.id || "").trim();
  const ownerRecruiterName = actorIsAdmin ? String(job.ownerRecruiterName || job.owner_recruiter_name || "").trim() : String(actor.name || "").trim();
  const assignedRecruiters = actorIsAdmin && Array.isArray(job.assignedRecruiters) ? job.assignedRecruiters : ownerRecruiterId ? [{ id: ownerRecruiterId, name: ownerRecruiterName, primary: true }] : [];
  const now = new Date().toISOString();
  const persistedJob = persistedJobId(job.id);
  const rows = await sbIns(
    "company_jobs",
    [jobRow({ ...job, jdShortcuts: globalShortcuts, ownerRecruiterId, ownerRecruiterName, assignedRecruiters, id: persistedJob, companyId, updatedBy: actor.email, createdAt: job.createdAt || existingJob?.createdAt || now, updatedAt: now })],
    { conflict: "id", upsert: true }
  );

  try {
    await sbIns(
      "company_job_shortcuts",
      [{
        company_id: companyId,
        job_id: persistedJob,
        recruiter_id: actor.id,
        shortcuts: incomingRecruiterShortcuts,
        created_at: now,
        updated_at: now,
        payload: { updatedBy: actor.email }
      }],
      { conflict: "job_id,recruiter_id", upsert: true, returning: "minimal" }
    );
  } catch (_) {
    // Backward-compatible: some deployments might not have the recruiter-scoped shortcuts table yet.
    // In that case, keep the JD save working and let the user apply the migration later.
  }

  return { ...sanitizeJob(rows[0]), jdShortcuts: incomingRecruiterShortcuts };
}
async function getCompanySharedExportPresets(companyId) {
  if (!companyId) throw new Error("companyId is required.");
  if (!cfg().on) {
    const row = (readStore().jobs || []).find((j) => j.companyId === companyId && isSharedExportPresetRow(j));
    return sanitizeSharedExportPresetSettings(row?.payload || row || {});
  }
  await ensureSeeded();
  const rows = await sbSel("company_jobs", `select=*&company_id=eq.${enc(companyId)}&title=eq.${enc(SHARED_EXPORT_PRESET_ROW_TITLE)}&limit=1`);
  return sanitizeSharedExportPresetSettings(rows?.[0]?.payload || rows?.[0] || {});
}
async function saveCompanySharedExportPresets({ actorUserId, companyId, settings }) {
  if (!actorUserId || !companyId) throw new Error("actorUserId and companyId are required.");
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor) throw new Error("Authenticated recruiter not found for this company.");
  if (String(actor.role || "").toLowerCase() !== "admin") {
    throw new Error("Only an admin can manage shared export presets.");
  }
  const sanitized = sanitizeSharedExportPresetSettings(settings);
  const now = new Date().toISOString();
  const payload = {
    ...sanitized,
    id: SHARED_EXPORT_PRESET_ROW_ID,
    title: SHARED_EXPORT_PRESET_ROW_TITLE,
    companyId,
    updatedAt: now,
    updatedBy: actor.email
  };
  if (!cfg().on) {
    const store = readStore();
    store.jobs = Array.isArray(store.jobs) ? store.jobs : [];
    const ix = store.jobs.findIndex((j) => j.companyId === companyId && isSharedExportPresetRow(j));
    const next = {
      id: SHARED_EXPORT_PRESET_ROW_ID,
      companyId,
      title: SHARED_EXPORT_PRESET_ROW_TITLE,
      clientName: "__system__",
      jobDescription: "Shared export presets",
      mustHaveSkills: "",
      redFlags: "",
      recruiterNotes: "",
      standardQuestions: "",
      jdShortcuts: "",
      createdAt: ix >= 0 ? store.jobs[ix].createdAt : now,
      updatedAt: now,
      updatedBy: actor.email,
      payload
    };
    if (ix >= 0) store.jobs[ix] = next; else store.jobs.push(next);
    writeStore(store);
    return sanitizeSharedExportPresetSettings(next.payload);
  }
  const rows = await sbIns("company_jobs", [{
    id: systemJobRowId(companyId, SHARED_EXPORT_PRESET_ROW_ID),
    company_id: companyId,
    title: SHARED_EXPORT_PRESET_ROW_TITLE,
    client_name: "__system__",
    job_description: "Shared export presets",
    must_have_skills: "",
    red_flags: "",
    recruiter_notes: "",
    standard_questions: "",
    jd_shortcuts: "",
    created_at: now,
    updated_at: now,
    updated_by: actor.email,
    payload
  }], { conflict: "id", upsert: true });
  return sanitizeSharedExportPresetSettings(rows?.[0]?.payload || payload);
}
async function getCompanyClientUsers(companyId) {
  if (!companyId) throw new Error("companyId is required.");
  if (!cfg().on) {
    return (readStore().clientUsers || [])
      .filter((item) => String(item.companyId || "") === String(companyId))
      .map(sanitizeClientUser);
  }
  await ensureSeeded();
  const rows = await sbSel("client_portal_users", `select=*&company_id=eq.${enc(companyId)}&order=created_at.asc`);
  return (rows || []).map(sanitizeClientUser).filter(Boolean);
}
async function getAllClientUsers() {
  if (!cfg().on) {
    return (readStore().clientUsers || []).map(sanitizeClientUserForStorage).filter(Boolean);
  }
  await ensureSeeded();
  const rows = await sbSel("client_portal_users", "select=*&limit=10000");
  return (rows || []).map(sanitizeClientUserForStorage).filter(Boolean);
}
async function saveCompanyClientUsersRow({ companyId, clientUsers, actorEmail = "" }) {
  const sanitizedUsers = (Array.isArray(clientUsers) ? clientUsers : []).map((item) => sanitizeClientUserForStorage(item)).filter(Boolean);
  if (!sanitizedUsers.length) return [];
  if (!cfg().on) {
    const store = readStore();
    store.clientUsers = Array.isArray(store.clientUsers) ? store.clientUsers : [];
    const keep = store.clientUsers.filter((item) => String(item.companyId || "") !== String(companyId));
    store.clientUsers = [...keep, ...sanitizedUsers];
    writeStore(store);
    return sanitizedUsers.map(sanitizeClientUser);
  }
  const rows = await sbIns("client_portal_users", sanitizedUsers.map((item) => ({
    id: item.id,
    company_id: item.companyId,
    company_name: item.companyName,
    username: item.username,
    client_name: item.clientName,
    allowed_positions: item.allowedPositions || [],
    password_hash: item.passwordHash,
    created_at: item.createdAt || new Date().toISOString(),
    updated_at: item.updatedAt || new Date().toISOString(),
    updated_by: String(actorEmail || "").trim()
  })), { conflict: "id", upsert: true });
  return (rows || []).map(sanitizeClientUser).filter(Boolean);
}
async function createClientUser({ actorUserId, companyId, username, password, clientName, allowedPositions = [] }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can create client accounts.");
  const normalizedUsername = normalizeUsername(username);
  const normalizedClientName = String(clientName || "").trim();
  if (!normalizedUsername || !password || !normalizedClientName) throw new Error("username, password, and clientName are required.");
  const allUsers = await getAllClientUsers();
  if (allUsers.some((item) => normalizeUsername(item?.username || "") === normalizedUsername)) throw new Error("This client username already exists.");
  const currentUsers = (await getCompanyClientUsers(companyId)).map((item) => sanitizeClientUserForStorage(item));
  const nextUser = {
    id: crypto.randomUUID(),
    companyId,
    companyName: actor.companyName || "",
    username: normalizedUsername,
    clientName: normalizedClientName,
    allowedPositions: Array.isArray(allowedPositions) ? allowedPositions.map((item) => String(item || "").trim()).filter(Boolean) : [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    passwordHash: hashPassword(password)
  };
  await saveCompanyClientUsersRow({ companyId, clientUsers: [...currentUsers, nextUser], actorEmail: actor.email || "" });
  return sanitizeClientUser(nextUser);
}
async function resetClientUserPassword({ actorUserId, companyId, clientUserId, newPassword }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can reset client passwords.");
  if (!newPassword) throw new Error("newPassword is required.");
  const currentUsers = (await getCompanyClientUsers(companyId)).map((item) => sanitizeClientUserForStorage(item));
  const ix = currentUsers.findIndex((item) => String(item?.id || "") === String(clientUserId || "").trim());
  if (ix < 0) throw new Error("Client user not found.");
  currentUsers[ix] = { ...currentUsers[ix], updatedAt: new Date().toISOString(), passwordHash: hashPassword(newPassword) };
  await saveCompanyClientUsersRow({ companyId, clientUsers: currentUsers, actorEmail: actor.email || "" });
  return { reset: true, clientUserId };
}
async function loginClient({ username, password }) {
  const normalizedUsername = normalizeUsername(username);
  const allUsers = await getAllClientUsers();
  const matched = allUsers.find((item) => normalizeUsername(item?.username || "") === normalizedUsername);
  if (!matched || !verifyPassword(password, matched.passwordHash)) throw new Error("Invalid username or password.");
  const sessionUser = sanitizeClientUser(matched);
  const token = createSignedClientToken({
    type: "client_portal",
    clientUserId: sessionUser.id,
    companyId: sessionUser.companyId,
    companyName: sessionUser.companyName,
    username: sessionUser.username,
    clientName: sessionUser.clientName,
    allowedPositions: sessionUser.allowedPositions,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7
  });
  return { token, user: sessionUser };
}
async function getClientSessionUser(token) {
  const payload = readSignedClientToken(token);
  if (!payload) return null;
  return sanitizeClientUser({
    id: payload.clientUserId,
    companyId: payload.companyId,
    companyName: payload.companyName,
    username: payload.username,
    clientName: payload.clientName,
    allowedPositions: payload.allowedPositions || []
  });
}
async function requireClientSessionUser(token) {
  const user = await getClientSessionUser(token);
  if (!user) throw new Error("Invalid or missing client session.");
  return user;
}
function getEmployeeSessionSecrets() {
  const primary = String(process.env.EMPLOYEE_PORTAL_SESSION_SECRET || "").trim();
  const platformFallback = String(process.env.PLATFORM_SESSION_SECRET || "").trim();
  const rotated = String(process.env.EMPLOYEE_PORTAL_SESSION_SECRET_PREVIOUS || "").trim();
  const secrets = [primary, platformFallback, rotated, "employee-portal-session-secret"]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  // Preserve order while removing duplicates.
  return Array.from(new Set(secrets));
}
function getEmployeeSessionSecret() {
  return getEmployeeSessionSecrets()[0];
}
function createSignedEmployeeToken(payload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", getEmployeeSessionSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}
function readSignedEmployeeToken(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const [encoded, signature] = raw.split(".");
  if (!encoded || !signature) return null;
  const matchedSecret = getEmployeeSessionSecrets().find((secret) => {
    const expected = crypto.createHmac("sha256", secret).update(encoded).digest("base64url");
    return timingSafeEqualString(signature, expected);
  });
  if (!matchedSecret) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (payload?.type !== "employee_portal") return null;
    if (payload.expiresAt && Date.now() > Number(payload.expiresAt)) return null;
    return payload;
  } catch {
    return null;
  }
}
function toIsoDateOnly(value) {
  return String(value || "").trim().slice(0, 10);
}
function haversineMeters(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat);
  const lng1 = Number(aLng);
  const lat2 = Number(bLat);
  const lng2 = Number(bLng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusMeters = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const p1 = toRad(lat1);
  const p2 = toRad(lat2);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusMeters * c * 100) / 100;
}
async function getAllEmployeePortalUsers() {
  if (!cfg().on) {
    const store = readStore();
    return (store.employeePortalUsers || []).map(sanitizeEmployeePortalUser).filter(Boolean);
  }
  await ensureSeeded();
  const rows = await sbSel("employee_portal_users", "select=*&limit=10000");
  return (rows || []).map(sanitizeEmployeePortalUser).filter(Boolean);
}
async function getCompanyEmployeeProfiles(companyId) {
  if (!companyId) throw new Error("companyId is required.");
  if (!cfg().on) {
    const store = readStore();
    return (store.employeeProfiles || [])
      .filter((item) => String(item.companyId || "") === String(companyId))
      .map(sanitizeEmployeeProfile)
      .filter(Boolean);
  }
  await ensureSeeded();
  const rows = await sbSel("employee_profiles", `select=*&company_id=eq.${enc(companyId)}&order=created_at.asc`);
  return (rows || []).map(sanitizeEmployeeProfile).filter(Boolean);
}
async function getEmployeeWorkSites(companyId, employeeId) {
  if (!companyId || !employeeId) return [];
  if (!cfg().on) {
    const store = readStore();
    return (store.employeeWorkSites || [])
      .filter((item) => String(item.companyId || "") === String(companyId) && String(item.employeeId || "") === String(employeeId))
      .map((item) => ({
        id: String(item.id || "").trim(),
        companyId: String(item.companyId || "").trim(),
        employeeId: String(item.employeeId || "").trim(),
        siteName: String(item.siteName || "").trim(),
        clientName: String(item.clientName || "").trim(),
        latitude: item.latitude ?? null,
        longitude: item.longitude ?? null,
        radiusMeters: Number(item.radiusMeters || 300),
        addressText: String(item.addressText || "").trim(),
        isPrimary: item.isPrimary !== false
      }));
  }
  await ensureSeeded();
  const rows = await sbSel("employee_work_sites", `select=*&company_id=eq.${enc(companyId)}&employee_id=eq.${enc(employeeId)}&order=created_at.asc`);
  return (rows || []).map((item) => ({
    id: String(item.id || "").trim(),
    companyId: String(item.company_id || "").trim(),
    employeeId: String(item.employee_id || "").trim(),
    siteName: String(item.site_name || "").trim(),
    clientName: String(item.client_name || "").trim(),
    latitude: item.latitude ?? null,
    longitude: item.longitude ?? null,
    radiusMeters: Number(item.radius_meters || 500),
    addressText: String(item.address_text || "").trim(),
    isPrimary: item.is_primary !== false
  }));
}
async function listCompanyEmployees(companyId) {
  const [profiles, portalUsers] = await Promise.all([
    getCompanyEmployeeProfiles(companyId),
    getAllEmployeePortalUsers()
  ]);
  const userMap = new Map(
    portalUsers
      .filter((item) => String(item.companyId || "") === String(companyId))
      .map((item) => [String(item.employeeId || "").trim(), item])
  );
  const employees = await Promise.all(profiles.map(async (profile) => {
    const sites = await getEmployeeWorkSites(companyId, profile.id).catch(() => []);
    const primarySite = (sites || []).find((item) => item.isPrimary) || (sites || [])[0] || null;
    return {
      ...profile,
      portalUserId: String(userMap.get(profile.id)?.id || "").trim(),
      username: String(userMap.get(profile.id)?.username || "").trim(),
      companyName: String(userMap.get(profile.id)?.companyName || "").trim(),
      workSite: primarySite
    };
  }));
  return employees;
}

async function updateEmployeeProfileAndWorkSite({ actorUserId, companyId, employeeId, profile = {}, workSite = {} }) {
  if (!employeeId) throw new Error("employeeId is required.");
  const savedProfile = await saveEmployeeProfile({ actorUserId, companyId, employeeId, profile });
  let savedSite = null;
  if (workSite && typeof workSite === "object" && Object.keys(workSite).length) {
    savedSite = await upsertEmployeeWorkSite({
      companyId,
      employeeId: savedProfile.id,
      workSite,
      updatedBy: String(savedProfile.updatedBy || "").trim()
    });
  }
  return {
    ...savedProfile,
    workSite: savedSite
  };
}
async function saveEmployeeProfile({ actorUserId, companyId, employeeId = "", profile = {} }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can save employee profiles.");
  const source = profile && typeof profile === "object" ? profile : {};
  const now = new Date().toISOString();
  const nextId = String(employeeId || source.id || "").trim() || crypto.randomUUID();
  const nextProfile = {
    id: nextId,
    companyId,
    employeeCode: String(source.employeeCode || source.employee_code || "").trim(),
    fullName: String(source.fullName || source.full_name || "").trim(),
    personalEmail: String(source.personalEmail || source.personal_email || "").trim(),
    phone: String(source.phone || "").trim(),
    designation: String(source.designation || "").trim(),
    employmentType: String(source.employmentType || source.employment_type || "c2h").trim(),
    joiningDate: String(source.joiningDate || source.joining_date || "").trim(),
    reportingManagerName: String(source.reportingManagerName || source.reporting_manager_name || "").trim(),
    clientName: String(source.clientName || source.client_name || "").trim(),
    workMode: String(source.workMode || source.work_mode || "").trim(),
    status: String(source.status || "active").trim(),
    taxRegimeCurrent: String(source.taxRegimeCurrent || source.tax_regime_current || "").trim(),
    payload: source.payload && typeof source.payload === "object" ? source.payload : {},
    updatedAt: now,
    updatedBy: actor.email || ""
  };
  if (!nextProfile.employeeCode || !nextProfile.fullName) {
    throw new Error("employeeCode and fullName are required.");
  }
  if (!cfg().on) {
    const store = readStore();
    store.employeeProfiles = Array.isArray(store.employeeProfiles) ? store.employeeProfiles : [];
    const ix = store.employeeProfiles.findIndex((item) => String(item.id || "") === nextId && String(item.companyId || "") === String(companyId));
    const existing = ix >= 0 ? store.employeeProfiles[ix] : null;
    const row = { ...existing, ...nextProfile, createdAt: existing?.createdAt || now };
    if (ix >= 0) store.employeeProfiles[ix] = row; else store.employeeProfiles.push(row);
    writeStore(store);
    return sanitizeEmployeeProfile(row);
  }
  await ensureSeeded();
  const rows = await sbIns("employee_profiles", [{
    id: nextId,
    company_id: companyId,
    employee_code: nextProfile.employeeCode,
    full_name: nextProfile.fullName,
    personal_email: nextProfile.personalEmail,
    phone: nextProfile.phone,
    designation: nextProfile.designation,
    employment_type: nextProfile.employmentType,
    joining_date: nextProfile.joiningDate || null,
    reporting_manager_name: nextProfile.reportingManagerName,
    client_name: nextProfile.clientName,
    work_mode: nextProfile.workMode,
    status: nextProfile.status,
    tax_regime_current: nextProfile.taxRegimeCurrent || null,
    payload: nextProfile.payload,
    created_at: now,
    updated_at: now,
    updated_by: actor.email || ""
  }], { conflict: "id", upsert: true });
  return sanitizeEmployeeProfile(rows?.[0] || nextProfile);
}
async function upsertEmployeeWorkSite({ companyId, employeeId, workSite = {}, updatedBy = "" }) {
  const source = workSite && typeof workSite === "object" ? workSite : {};
  if (!source.siteName && !source.site_name && source.latitude == null && source.longitude == null) return null;
  const now = new Date().toISOString();
  const row = {
    id: String(source.id || "").trim() || crypto.randomUUID(),
    companyId,
    employeeId,
    siteName: String(source.siteName || source.site_name || "Primary Work Site").trim(),
    clientName: String(source.clientName || source.client_name || "").trim(),
    latitude: source.latitude == null ? null : Number(source.latitude),
    longitude: source.longitude == null ? null : Number(source.longitude),
    radiusMeters: Number(source.radiusMeters || source.radius_meters || 500),
    addressText: String(source.addressText || source.address_text || "").trim(),
    isPrimary: source.isPrimary !== false
  };
  if (!cfg().on) {
    const store = readStore();
    store.employeeWorkSites = Array.isArray(store.employeeWorkSites) ? store.employeeWorkSites : [];
    const filtered = store.employeeWorkSites.filter((item) => !(String(item.companyId || "") === String(companyId) && String(item.employeeId || "") === String(employeeId)));
    filtered.push({ ...row, createdAt: now, updatedAt: now, updatedBy });
    store.employeeWorkSites = filtered;
    writeStore(store);
    return row;
  }
  await ensureSeeded();
  await sbDel("employee_work_sites", `company_id=eq.${enc(companyId)}&employee_id=eq.${enc(employeeId)}`);
  const rows = await sbIns("employee_work_sites", [{
    id: row.id,
    company_id: companyId,
    employee_id: employeeId,
    site_name: row.siteName,
    client_name: row.clientName,
    latitude: Number.isFinite(row.latitude) ? row.latitude : null,
    longitude: Number.isFinite(row.longitude) ? row.longitude : null,
    radius_meters: row.radiusMeters,
    address_text: row.addressText,
    is_primary: row.isPrimary,
    created_at: now,
    updated_at: now,
    updated_by: updatedBy
  }], { conflict: "id", upsert: true });
  return rows?.[0] || row;
}
async function getEmployeeProfile(companyId, employeeId) {
  if (!companyId || !employeeId) return null;
  const employees = await listCompanyEmployees(companyId);
  return employees.find((item) => String(item.id || "") === String(employeeId)) || null;
}
async function requireAdminForCompany({ actorUserId, companyId }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor) throw new Error("Authenticated recruiter not found for this company.");
  if (String(actor.role || "").toLowerCase() !== "admin") throw new Error("Admin access required.");
  return actor;
}
async function getCompanyPayrollSettings({ actorUserId, companyId }) {
  await requireAdminForCompany({ actorUserId, companyId });
  if (!cfg().on) {
    const store = readStore();
    const row = (store.payrollSettings || []).find((item) => String(item.companyId || "") === String(companyId)) || null;
    if (row) return sanitizePayrollSettings(row);
    return sanitizePayrollSettings({
      id: crypto.randomUUID(),
      companyId,
      payrollEnabled: false,
      defaultFbpProofCycle: "quarterly",
      defaultMonthlyProfessionalTax: 0,
      applyLopProration: true,
      prorateHealthInsurance: false,
      defaultSalaryTemplateCode: "c2h_it_standard",
      policyNote: ""
    });
  }
  await ensureSeeded();
  const rows = await sbSel("payroll_settings", `select=*&company_id=eq.${enc(companyId)}&limit=1`).catch(() => []);
  if (rows?.[0]) return sanitizePayrollSettings(rows[0]);
  return sanitizePayrollSettings({
    id: crypto.randomUUID(),
    companyId,
    payrollEnabled: false,
    defaultFbpProofCycle: "quarterly",
    defaultMonthlyProfessionalTax: 0,
    applyLopProration: true,
    prorateHealthInsurance: false,
    defaultSalaryTemplateCode: "c2h_it_standard",
    policyNote: ""
  });
}
async function saveCompanyPayrollSettings({ actorUserId, companyId, settings = {} }) {
  const actor = await requireAdminForCompany({ actorUserId, companyId });
  const now = new Date().toISOString();
  const payload = {
    payroll_enabled: Boolean(settings.payrollEnabled),
    default_fbp_proof_cycle: String(settings.defaultFbpProofCycle || "quarterly").trim().toLowerCase() || "quarterly",
    default_monthly_professional_tax: Number(settings.defaultMonthlyProfessionalTax || 0) || 0,
    apply_lop_proration: settings.applyLopProration !== false,
    prorate_health_insurance: Boolean(settings.prorateHealthInsurance),
    default_salary_template_code: String(settings.defaultSalaryTemplateCode || "c2h_it_standard").trim().toLowerCase() || "c2h_it_standard",
    policy_note: String(settings.policyNote || "").trim(),
    updated_at: now,
    updated_by: actor.id
  };
  if (!cfg().on) {
    const store = readStore();
    store.payrollSettings = Array.isArray(store.payrollSettings) ? store.payrollSettings : [];
    const ix = store.payrollSettings.findIndex((item) => String(item.companyId || "") === String(companyId));
    if (ix >= 0) {
      store.payrollSettings[ix] = { ...store.payrollSettings[ix], ...payload, companyId };
    } else {
      store.payrollSettings.push({
        id: crypto.randomUUID(),
        companyId,
        createdAt: now,
        createdBy: actor.id,
        ...payload
      });
    }
    writeStore(store);
    const row = store.payrollSettings.find((item) => String(item.companyId || "") === String(companyId));
    return sanitizePayrollSettings(row);
  }
  await ensureSeeded();
  const existing = await sbSel("payroll_settings", `select=id&company_id=eq.${enc(companyId)}&limit=1`).catch(() => []);
  if (existing?.[0]?.id) {
    const rows = await sbPatch("payroll_settings", `company_id=eq.${enc(companyId)}`, payload);
    return sanitizePayrollSettings(rows?.[0]);
  }
  const rows = await sbIns("payroll_settings", [{
    id: crypto.randomUUID(),
    company_id: companyId,
    created_at: now,
    created_by: actor.id,
    ...payload
  }], { conflict: "company_id", upsert: true });
  return sanitizePayrollSettings(rows?.[0]);
}
async function listEmployeeCompensationStructures({ actorUserId, companyId, employeeId = "", activeOnly = false }) {
  await requireAdminForCompany({ actorUserId, companyId });
  const safeEmployeeId = String(employeeId || "").trim();
  if (!cfg().on) {
    const store = readStore();
    return (store.employeeCompensationStructures || [])
      .filter((item) => String(item.companyId || "") === String(companyId))
      .filter((item) => !safeEmployeeId || String(item.employeeId || "") === safeEmployeeId)
      .filter((item) => !activeOnly || Boolean(item.isActive))
      .map(sanitizeEmployeeCompensation)
      .filter(Boolean)
      .sort((a, b) => String(b.effectiveFrom || "").localeCompare(String(a.effectiveFrom || "")));
  }
  await ensureSeeded();
  const filters = [
    `company_id=eq.${enc(companyId)}`,
    safeEmployeeId ? `employee_id=eq.${enc(safeEmployeeId)}` : "",
    activeOnly ? "is_active=eq.true" : "",
    "order=effective_from.desc"
  ].filter(Boolean).join("&");
  const rows = await sbSel("employee_compensation_structures", `select=*&${filters}`);
  return (rows || []).map(sanitizeEmployeeCompensation).filter(Boolean);
}
async function saveEmployeeCompensationStructure({ actorUserId, companyId, compensation = {} }) {
  const actor = await requireAdminForCompany({ actorUserId, companyId });
  const employeeId = String(compensation.employeeId || "").trim();
  if (!employeeId) throw new Error("employeeId is required.");
  const now = new Date().toISOString();
  const rowId = String(compensation.id || "").trim();
  const safe = sanitizeEmployeeCompensation({
    ...compensation,
    companyId,
    employeeId,
    isActive: compensation.isActive !== false
  });
  const insertPayload = {
    id: rowId || crypto.randomUUID(),
    company_id: companyId,
    employee_id: employeeId,
    template_code: safe.templateCode || "custom",
    effective_from: safe.effectiveFrom || new Date().toISOString().slice(0, 10),
    effective_to: safe.effectiveTo || null,
    annual_ctc: safe.annualCtc,
    monthly_ctc: safe.monthlyCtc,
    basic_monthly: safe.basicMonthly,
    basic_annual: safe.basicAnnual,
    hra_monthly: safe.hraMonthly,
    hra_annual: safe.hraAnnual,
    fbp_monthly: safe.fbpMonthly,
    fbp_annual: safe.fbpAnnual,
    special_allowance_monthly: safe.specialAllowanceMonthly,
    special_allowance_annual: safe.specialAllowanceAnnual,
    employer_pf_monthly: safe.employerPfMonthly,
    employer_pf_annual: safe.employerPfAnnual,
    employee_pf_monthly: safe.employeePfMonthly,
    employee_pf_annual: safe.employeePfAnnual,
    employer_esi_monthly: safe.employerEsiMonthly,
    employer_esi_annual: safe.employerEsiAnnual,
    employee_esi_monthly: safe.employeeEsiMonthly,
    employee_esi_annual: safe.employeeEsiAnnual,
    employer_lwf_monthly: safe.employerLwfMonthly,
    employer_lwf_annual: safe.employerLwfAnnual,
    employee_lwf_monthly: safe.employeeLwfMonthly,
    employee_lwf_annual: safe.employeeLwfAnnual,
    professional_tax_monthly: safe.professionalTaxMonthly,
    professional_tax_annual: safe.professionalTaxAnnual,
    gratuity_monthly: safe.gratuityMonthly,
    gratuity_annual: safe.gratuityAnnual,
    health_insurance_monthly: safe.healthInsuranceMonthly,
    health_insurance_annual: safe.healthInsuranceAnnual,
    other_allowance_monthly: safe.otherAllowanceMonthly,
    other_allowance_annual: safe.otherAllowanceAnnual,
    is_active: safe.isActive,
    notes: safe.notes,
    updated_at: now,
    updated_by: actor.id
  };
  if (!cfg().on) {
    const store = readStore();
    store.employeeCompensationStructures = Array.isArray(store.employeeCompensationStructures) ? store.employeeCompensationStructures : [];
    if (safe.isActive) {
      store.employeeCompensationStructures = store.employeeCompensationStructures.map((item) =>
        String(item.companyId || "") === String(companyId) && String(item.employeeId || "") === String(employeeId)
          ? { ...item, isActive: false, effectiveTo: item.effectiveTo || insertPayload.effective_from }
          : item
      );
    }
    const ix = store.employeeCompensationStructures.findIndex((item) => String(item.id || "") === insertPayload.id);
    if (ix >= 0) {
      store.employeeCompensationStructures[ix] = { ...store.employeeCompensationStructures[ix], ...insertPayload };
    } else {
      store.employeeCompensationStructures.push({
        ...insertPayload,
        createdAt: now,
        createdBy: actor.id
      });
    }
    writeStore(store);
    return sanitizeEmployeeCompensation(store.employeeCompensationStructures.find((item) => String(item.id || "") === insertPayload.id));
  }
  await ensureSeeded();
  if (safe.isActive) {
    await sbPatch(
      "employee_compensation_structures",
      `company_id=eq.${enc(companyId)}&employee_id=eq.${enc(employeeId)}&is_active=eq.true`,
      { is_active: false, updated_at: now, updated_by: actor.id, effective_to: insertPayload.effective_from }
    ).catch(() => []);
  }
  const rows = await sbIns("employee_compensation_structures", [{
    ...insertPayload,
    created_at: now,
    created_by: actor.id
  }], { conflict: "id", upsert: true });
  return sanitizeEmployeeCompensation(rows?.[0]);
}
async function listCompanyFbpHeads({ actorUserId, companyId, activeOnly = false }) {
  await requireAdminForCompany({ actorUserId, companyId });
  if (!cfg().on) {
    const store = readStore();
    return (store.fbpHeads || [])
      .filter((item) => String(item.companyId || "") === String(companyId))
      .filter((item) => !activeOnly || Boolean(item.active))
      .map(sanitizeFbpHead)
      .filter(Boolean)
      .sort((a, b) => String(a.headName || "").localeCompare(String(b.headName || "")));
  }
  await ensureSeeded();
  const filters = [
    `company_id=eq.${enc(companyId)}`,
    activeOnly ? "active=eq.true" : "",
    "order=head_name.asc"
  ].filter(Boolean).join("&");
  const rows = await sbSel("fbp_heads", `select=*&${filters}`);
  return (rows || []).map(sanitizeFbpHead).filter(Boolean);
}
async function saveCompanyFbpHead({ actorUserId, companyId, head = {} }) {
  const actor = await requireAdminForCompany({ actorUserId, companyId });
  const now = new Date().toISOString();
  const rowId = String(head.id || "").trim() || crypto.randomUUID();
  const name = String(head.headName || "").trim();
  if (!name) throw new Error("headName is required.");
  const payload = {
    id: rowId,
    company_id: companyId,
    head_name: name,
    monthly_limit: Number(head.monthlyLimit || 0) || 0,
    annual_limit: Number(head.annualLimit || 0) || 0,
    proof_required: head.proofRequired !== false,
    taxable_if_unclaimed: Boolean(head.taxableIfUnclaimed),
    active: head.active !== false,
    updated_at: now,
    updated_by: actor.id
  };
  if (!cfg().on) {
    const store = readStore();
    store.fbpHeads = Array.isArray(store.fbpHeads) ? store.fbpHeads : [];
    const ix = store.fbpHeads.findIndex((item) => String(item.id || "") === rowId);
    if (ix >= 0) store.fbpHeads[ix] = { ...store.fbpHeads[ix], ...payload };
    else store.fbpHeads.push({ ...payload, createdAt: now, createdBy: actor.id });
    writeStore(store);
    return sanitizeFbpHead(store.fbpHeads.find((item) => String(item.id || "") === rowId));
  }
  await ensureSeeded();
  const rows = await sbIns("fbp_heads", [{
    ...payload,
    created_at: now,
    created_by: actor.id
  }], { conflict: "id", upsert: true });
  return sanitizeFbpHead(rows?.[0]);
}
async function removeCompanyFbpHead({ actorUserId, companyId, headId }) {
  await requireAdminForCompany({ actorUserId, companyId });
  const safeHeadId = String(headId || "").trim();
  if (!safeHeadId) throw new Error("headId is required.");
  if (!cfg().on) {
    const store = readStore();
    store.fbpHeads = Array.isArray(store.fbpHeads) ? store.fbpHeads : [];
    const before = store.fbpHeads.length;
    store.fbpHeads = store.fbpHeads.filter((item) => !(String(item.id || "") === safeHeadId && String(item.companyId || "") === String(companyId)));
    writeStore(store);
    return { deleted: before !== store.fbpHeads.length, headId: safeHeadId };
  }
  await ensureSeeded();
  await sbDel("fbp_heads", `id=eq.${enc(safeHeadId)}&company_id=eq.${enc(companyId)}`);
  return { deleted: true, headId: safeHeadId };
}
async function listCompanySalaryTemplates({ actorUserId, companyId, activeOnly = false }) {
  await requireAdminForCompany({ actorUserId, companyId });
  if (!cfg().on) {
    const store = readStore();
    return (store.salaryTemplates || [])
      .filter((item) => String(item.companyId || "") === String(companyId))
      .filter((item) => !activeOnly || Boolean(item.active))
      .map(sanitizeSalaryTemplate)
      .filter(Boolean)
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }
  await ensureSeeded();
  const filters = [
    `company_id=eq.${enc(companyId)}`,
    activeOnly ? "active=eq.true" : "",
    "order=name.asc"
  ].filter(Boolean).join("&");
  const rows = await sbSel("salary_templates", `select=*&${filters}`);
  return (rows || []).map(sanitizeSalaryTemplate).filter(Boolean);
}
async function saveCompanySalaryTemplate({ actorUserId, companyId, template = {} }) {
  const actor = await requireAdminForCompany({ actorUserId, companyId });
  const now = new Date().toISOString();
  const name = String(template.name || "").trim();
  const code = String(template.code || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!name) throw new Error("Template name is required.");
  if (!code) throw new Error("Template code is required.");
  const config = template.config && typeof template.config === "object" ? template.config : {};
  const payload = {
    id: String(template.id || "").trim() || crypto.randomUUID(),
    company_id: companyId,
    code,
    name,
    description: String(template.description || "").trim(),
    config,
    active: template.active !== false,
    updated_at: now,
    updated_by: actor.id
  };
  if (!cfg().on) {
    const store = readStore();
    store.salaryTemplates = Array.isArray(store.salaryTemplates) ? store.salaryTemplates : [];
    const ix = store.salaryTemplates.findIndex((item) => String(item.id || "") === payload.id);
    if (ix >= 0) store.salaryTemplates[ix] = { ...store.salaryTemplates[ix], ...payload };
    else store.salaryTemplates.push({ ...payload, createdAt: now, createdBy: actor.id, companyId });
    writeStore(store);
    return sanitizeSalaryTemplate(store.salaryTemplates.find((item) => String(item.id || "") === payload.id));
  }
  await ensureSeeded();
  const rows = await sbIns("salary_templates", [{
    ...payload,
    created_at: now,
    created_by: actor.id
  }], { conflict: "id", upsert: true });
  return sanitizeSalaryTemplate(rows?.[0]);
}
async function listPayrollInputs({ actorUserId, companyId, payrollMonth, payrollYear, employeeId = "" }) {
  await requireAdminForCompany({ actorUserId, companyId });
  const month = Number(payrollMonth || 0);
  const year = Number(payrollYear || 0);
  const safeEmployeeId = String(employeeId || "").trim();
  if (!month || !year) throw new Error("payrollMonth and payrollYear are required.");
  if (!cfg().on) {
    const store = readStore();
    return (store.payrollInputs || [])
      .filter((item) => String(item.companyId || "") === String(companyId))
      .filter((item) => Number(item.payrollMonth || 0) === month && Number(item.payrollYear || 0) === year)
      .filter((item) => !safeEmployeeId || String(item.employeeId || "") === safeEmployeeId)
      .map(sanitizePayrollInput)
      .filter(Boolean);
  }
  await ensureSeeded();
  const filters = [
    `company_id=eq.${enc(companyId)}`,
    `payroll_month=eq.${month}`,
    `payroll_year=eq.${year}`,
    safeEmployeeId ? `employee_id=eq.${enc(safeEmployeeId)}` : "",
    "order=employee_id.asc"
  ].filter(Boolean).join("&");
  const rows = await sbSel("payroll_inputs", `select=*&${filters}`);
  return (rows || []).map(sanitizePayrollInput).filter(Boolean);
}
async function savePayrollInput({ actorUserId, companyId, input = {} }) {
  const actor = await requireAdminForCompany({ actorUserId, companyId });
  const month = Number(input.payrollMonth || 0);
  const year = Number(input.payrollYear || 0);
  const employeeId = String(input.employeeId || "").trim();
  if (!month || !year || !employeeId) throw new Error("employeeId, payrollMonth, payrollYear are required.");
  const now = new Date().toISOString();
  const payload = {
    id: String(input.id || "").trim() || crypto.randomUUID(),
    company_id: companyId,
    employee_id: employeeId,
    payroll_month: month,
    payroll_year: year,
    total_calendar_days: Number(input.totalCalendarDays || 0) || 0,
    working_days: Number(input.workingDays || 0) || 0,
    payable_days: Number(input.payableDays || 0) || 0,
    paid_leave_days: Number(input.paidLeaveDays || 0) || 0,
    unpaid_leave_days: Number(input.unpaidLeaveDays || 0) || 0,
    absent_days: Number(input.absentDays || 0) || 0,
    holidays: Number(input.holidays || 0) || 0,
    overtime_amount: Number(input.overtimeAmount || 0) || 0,
    arrears_amount: Number(input.arrearsAmount || 0) || 0,
    bonus_amount: Number(input.bonusAmount || 0) || 0,
    other_earnings: Number(input.otherEarnings || 0) || 0,
    other_deductions: Number(input.otherDeductions || 0) || 0,
    professional_tax: Number(input.professionalTax || 0) || 0,
    tds_amount: Number(input.tdsAmount || 0) || 0,
    approved_reimbursements: Number(input.approvedReimbursements || 0) || 0,
    remarks: String(input.remarks || "").trim(),
    updated_at: now,
    updated_by: actor.id
  };
  if (!cfg().on) {
    const store = readStore();
    store.payrollInputs = Array.isArray(store.payrollInputs) ? store.payrollInputs : [];
    const ix = store.payrollInputs.findIndex((item) =>
      String(item.companyId || item.company_id || "") === String(companyId) &&
      String(item.employeeId || item.employee_id || "") === employeeId &&
      Number(item.payrollMonth || item.payroll_month || 0) === month &&
      Number(item.payrollYear || item.payroll_year || 0) === year
    );
    if (ix >= 0) store.payrollInputs[ix] = { ...store.payrollInputs[ix], ...payload };
    else store.payrollInputs.push({ ...payload, companyId, employeeId, payrollMonth: month, payrollYear: year, createdAt: now, createdBy: actor.id });
    writeStore(store);
    return sanitizePayrollInput(store.payrollInputs[ix >= 0 ? ix : store.payrollInputs.length - 1]);
  }
  await ensureSeeded();
  const rows = await sbIns("payroll_inputs", [{
    ...payload,
    created_at: now,
    created_by: actor.id
  }], { conflict: "company_id,employee_id,payroll_month,payroll_year", upsert: true });
  return sanitizePayrollInput(rows?.[0]);
}
async function listPayrollRuns({ actorUserId, companyId, payrollMonth = 0, payrollYear = 0 }) {
  await requireAdminForCompany({ actorUserId, companyId });
  const month = Number(payrollMonth || 0);
  const year = Number(payrollYear || 0);
  if (!cfg().on) {
    const store = readStore();
    return (store.payrollRuns || [])
      .filter((item) => String(item.companyId || "") === String(companyId))
      .filter((item) => !month || Number(item.payrollMonth || 0) === month)
      .filter((item) => !year || Number(item.payrollYear || 0) === year)
      .map(sanitizePayrollRun)
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }
  await ensureSeeded();
  const filters = [
    `company_id=eq.${enc(companyId)}`,
    month ? `payroll_month=eq.${month}` : "",
    year ? `payroll_year=eq.${year}` : "",
    "order=created_at.desc"
  ].filter(Boolean).join("&");
  const rows = await sbSel("payroll_runs", `select=*&${filters}`);
  return (rows || []).map(sanitizePayrollRun).filter(Boolean);
}
async function createPayrollRunDraft({ actorUserId, companyId, payrollMonth, payrollYear }) {
  const actor = await requireAdminForCompany({ actorUserId, companyId });
  const month = Number(payrollMonth || 0);
  const year = Number(payrollYear || 0);
  if (!month || !year) throw new Error("payrollMonth and payrollYear are required.");
  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    company_id: companyId,
    payroll_month: month,
    payroll_year: year,
    status: "draft",
    total_gross: 0,
    total_deductions: 0,
    total_net_pay: 0,
    total_employer_cost: 0,
    lock_reason: "",
    locked_at: null,
    approved_by: null,
    created_by: actor.id,
    updated_by: actor.id,
    created_at: now,
    updated_at: now
  };
  if (!cfg().on) {
    const store = readStore();
    store.payrollRuns = Array.isArray(store.payrollRuns) ? store.payrollRuns : [];
    store.payrollRuns.push({ ...row, companyId, payrollMonth: month, payrollYear: year, status: "draft" });
    writeStore(store);
    return sanitizePayrollRun(store.payrollRuns[store.payrollRuns.length - 1]);
  }
  await ensureSeeded();
  const rows = await sbIns("payroll_runs", [row], { conflict: "id", upsert: true });
  return sanitizePayrollRun(rows?.[0]);
}
async function getPayrollRunDetail({ actorUserId, companyId, payrollRunId }) {
  await requireAdminForCompany({ actorUserId, companyId });
  const runId = String(payrollRunId || "").trim();
  if (!runId) throw new Error("payrollRunId is required.");
  if (!cfg().on) {
    const store = readStore();
    const run = sanitizePayrollRun((store.payrollRuns || []).find((item) => String(item.id || "") === runId && String(item.companyId || "") === String(companyId)));
    const items = (store.payrollRunItems || []).filter((item) => String(item.payrollRunId || "") === runId && String(item.companyId || "") === String(companyId)).map(sanitizePayrollRunItem).filter(Boolean);
    return { run, items };
  }
  await ensureSeeded();
  const runRows = await sbSel("payroll_runs", `select=*&id=eq.${enc(runId)}&company_id=eq.${enc(companyId)}&limit=1`);
  const itemRows = await sbSel("payroll_run_items", `select=*&payroll_run_id=eq.${enc(runId)}&company_id=eq.${enc(companyId)}&order=created_at.asc`);
  return { run: sanitizePayrollRun(runRows?.[0]), items: (itemRows || []).map(sanitizePayrollRunItem).filter(Boolean) };
}
async function calculatePayrollRun({ actorUserId, companyId, payrollRunId }) {
  const actor = await requireAdminForCompany({ actorUserId, companyId });
  const { run } = await getPayrollRunDetail({ actorUserId, companyId, payrollRunId });
  if (!run) throw new Error("Payroll run not found.");
  if (["locked", "paid"].includes(run.status)) throw new Error("Locked/Paid payroll run cannot be recalculated.");
  const settings = await getCompanyPayrollSettings({ actorUserId, companyId });
  const employees = await listCompanyEmployees(companyId);
  const inputs = await listPayrollInputs({ actorUserId, companyId, payrollMonth: run.payrollMonth, payrollYear: run.payrollYear });
  const activeComp = await listEmployeeCompensationStructures({ actorUserId, companyId, activeOnly: true });
  const byEmployeeInput = new Map(inputs.map((item) => [String(item.employeeId || ""), item]));
  const byEmployeeComp = new Map(activeComp.map((item) => [String(item.employeeId || ""), item]));
  const now = new Date().toISOString();
  const rows = [];
  for (const emp of employees) {
    if (String(emp?.status || "").toLowerCase() === "exited") continue;
    const employeeId = String(emp.id || "").trim();
    const input = byEmployeeInput.get(employeeId) || sanitizePayrollInput({
      companyId,
      employeeId,
      payrollMonth: run.payrollMonth,
      payrollYear: run.payrollYear,
      totalCalendarDays: 30,
      workingDays: 22,
      payableDays: 30
    });
    const comp = byEmployeeComp.get(employeeId);
    if (!comp) continue;
    const calc = calculatePayrollLine({ compensation: comp, payrollInput: input, settings });
    rows.push({
      id: crypto.randomUUID(),
      company_id: companyId,
      payroll_run_id: run.id,
      employee_id: employeeId,
      payload: {
        employeeCode: emp.employeeCode,
        employeeName: emp.fullName,
        compensationId: comp.id,
        payrollInputId: input.id || "",
        ...calc
      },
      gross_earnings: calc.grossEarnings,
      gross_deductions: calc.grossDeductions,
      net_salary: calc.netSalary,
      employer_cost: calc.totalEmployerCost,
      created_at: now,
      updated_at: now
    });
  }
  const totalGross = roundMoney(rows.reduce((sum, r) => sum + Number(r.gross_earnings || 0), 0));
  const totalDeductions = roundMoney(rows.reduce((sum, r) => sum + Number(r.gross_deductions || 0), 0));
  const totalNetPay = roundMoney(rows.reduce((sum, r) => sum + Number(r.net_salary || 0), 0));
  const totalEmployerCost = roundMoney(rows.reduce((sum, r) => sum + Number(r.employer_cost || 0), 0));
  if (!cfg().on) {
    const store = readStore();
    store.payrollRunItems = Array.isArray(store.payrollRunItems) ? store.payrollRunItems : [];
    store.payrollRunItems = store.payrollRunItems.filter((item) => !(String(item.payrollRunId || item.payroll_run_id || "") === run.id && String(item.companyId || item.company_id || "") === String(companyId)));
    store.payrollRunItems.push(...rows.map((row) => ({ ...row, companyId, payrollRunId: run.id, employeeId: row.employee_id })));
    store.payrollRuns = Array.isArray(store.payrollRuns) ? store.payrollRuns : [];
    const ix = store.payrollRuns.findIndex((item) => String(item.id || "") === run.id && String(item.companyId || "") === String(companyId));
    if (ix >= 0) {
      store.payrollRuns[ix] = { ...store.payrollRuns[ix], status: "calculated", totalGross, totalDeductions, totalNetPay, totalEmployerCost, updatedAt: now, updatedBy: actor.id };
    }
    writeStore(store);
    return getPayrollRunDetail({ actorUserId, companyId, payrollRunId: run.id });
  }
  await ensureSeeded();
  await sbDel("payroll_run_items", `payroll_run_id=eq.${enc(run.id)}&company_id=eq.${enc(companyId)}`);
  if (rows.length) await sbIns("payroll_run_items", rows, { conflict: "id", upsert: true });
  await sbPatch("payroll_runs", `id=eq.${enc(run.id)}&company_id=eq.${enc(companyId)}`, {
    status: "calculated",
    total_gross: totalGross,
    total_deductions: totalDeductions,
    total_net_pay: totalNetPay,
    total_employer_cost: totalEmployerCost,
    updated_at: now,
    updated_by: actor.id
  });
  return getPayrollRunDetail({ actorUserId, companyId, payrollRunId: run.id });
}
async function approvePayrollRun({ actorUserId, companyId, payrollRunId }) {
  const actor = await requireAdminForCompany({ actorUserId, companyId });
  const { run } = await getPayrollRunDetail({ actorUserId, companyId, payrollRunId });
  if (!run) throw new Error("Payroll run not found.");
  if (!["calculated", "approved"].includes(run.status)) throw new Error("Only calculated payroll run can be approved.");
  const now = new Date().toISOString();
  if (!cfg().on) {
    const store = readStore();
    const ix = (store.payrollRuns || []).findIndex((item) => String(item.id || "") === run.id && String(item.companyId || "") === String(companyId));
    if (ix >= 0) store.payrollRuns[ix] = { ...store.payrollRuns[ix], status: "approved", approvedBy: actor.id, updatedAt: now, updatedBy: actor.id };
    writeStore(store);
    return sanitizePayrollRun(store.payrollRuns[ix]);
  }
  await ensureSeeded();
  const rows = await sbPatch("payroll_runs", `id=eq.${enc(run.id)}&company_id=eq.${enc(companyId)}`, {
    status: "approved",
    approved_by: actor.id,
    updated_at: now,
    updated_by: actor.id
  });
  return sanitizePayrollRun(rows?.[0]);
}
async function lockPayrollRun({ actorUserId, companyId, payrollRunId, reason = "" }) {
  const actor = await requireAdminForCompany({ actorUserId, companyId });
  const { run } = await getPayrollRunDetail({ actorUserId, companyId, payrollRunId });
  if (!run) throw new Error("Payroll run not found.");
  if (!["approved", "locked"].includes(run.status)) throw new Error("Only approved payroll run can be locked.");
  const now = new Date().toISOString();
  const safeReason = String(reason || "").trim();
  if (!cfg().on) {
    const store = readStore();
    const ix = (store.payrollRuns || []).findIndex((item) => String(item.id || "") === run.id && String(item.companyId || "") === String(companyId));
    if (ix >= 0) store.payrollRuns[ix] = { ...store.payrollRuns[ix], status: "locked", lockReason: safeReason, lockedAt: now, updatedAt: now, updatedBy: actor.id };
    writeStore(store);
    return sanitizePayrollRun(store.payrollRuns[ix]);
  }
  await ensureSeeded();
  const rows = await sbPatch("payroll_runs", `id=eq.${enc(run.id)}&company_id=eq.${enc(companyId)}`, {
    status: "locked",
    lock_reason: safeReason,
    locked_at: now,
    updated_at: now,
    updated_by: actor.id
  });
  return sanitizePayrollRun(rows?.[0]);
}
async function setPayrollRunStatus({ actorUserId, companyId, payrollRunId, status, reason = "" }) {
  const actor = await requireAdminForCompany({ actorUserId, companyId });
  const { run } = await getPayrollRunDetail({ actorUserId, companyId, payrollRunId });
  if (!run) throw new Error("Payroll run not found.");
  const nextStatus = String(status || "").trim().toLowerCase();
  if (!["draft", "calculated", "approved", "locked"].includes(nextStatus)) throw new Error("Invalid target status.");
  const now = new Date().toISOString();
  const patch = {
    status: nextStatus,
    lock_reason: String(reason || "").trim(),
    updated_at: now,
    updated_by: actor.id
  };
  if (nextStatus !== "locked") patch.locked_at = null;
  if (!cfg().on) {
    const store = readStore();
    const ix = (store.payrollRuns || []).findIndex((item) => String(item.id || "") === String(run.id || "") && String(item.companyId || "") === String(companyId));
    if (ix >= 0) store.payrollRuns[ix] = { ...store.payrollRuns[ix], ...patch };
    writeStore(store);
    return sanitizePayrollRun(store.payrollRuns[ix]);
  }
  await ensureSeeded();
  const rows = await sbPatch("payroll_runs", `id=eq.${enc(run.id)}&company_id=eq.${enc(companyId)}`, patch);
  return sanitizePayrollRun(rows?.[0]);
}
async function createEmployeeUser({ actorUserId, companyId, employeeCode, username, password, fullName, profile = {}, workSite = {} }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can create employee accounts.");
  const normalizedUsername = normalizeUsername(username || employeeCode || "");
  const normalizedEmployeeCode = String(employeeCode || "").trim().toUpperCase();
  const safeFullName = String(fullName || profile.fullName || "").trim();
  if (!normalizedUsername || !normalizedEmployeeCode || !password || !safeFullName) {
    throw new Error("employeeCode, username, password, and fullName are required.");
  }
  const allUsers = await getAllEmployeePortalUsers();
  if (allUsers.some((item) => normalizeUsername(item?.username || "") === normalizedUsername)) throw new Error("This employee username already exists.");
  const existingProfiles = await getCompanyEmployeeProfiles(companyId);
  if (existingProfiles.some((item) => String(item.employeeCode || "").toUpperCase() === normalizedEmployeeCode)) {
    throw new Error("This employee code already exists.");
  }
  const savedProfile = await saveEmployeeProfile({
    actorUserId,
    companyId,
    profile: {
      ...profile,
      employeeCode: normalizedEmployeeCode,
      fullName: safeFullName
    }
  });
  await upsertEmployeeWorkSite({ companyId, employeeId: savedProfile.id, workSite, updatedBy: actor.email || "" });
  const now = new Date().toISOString();
  const portalUser = {
    id: crypto.randomUUID(),
    companyId,
    companyName: actor.companyName || "",
    employeeId: savedProfile.id,
    employeeCode: normalizedEmployeeCode,
    username: normalizedUsername,
    fullName: safeFullName,
    passwordHash: hashPassword(password),
    createdAt: now,
    updatedAt: now,
    updatedBy: actor.email || ""
  };
  if (!cfg().on) {
    const store = readStore();
    store.employeePortalUsers = Array.isArray(store.employeePortalUsers) ? store.employeePortalUsers : [];
    store.employeePortalUsers.push(portalUser);
    writeStore(store);
  } else {
    await ensureSeeded();
    await sbIns("employee_portal_users", [{
      id: portalUser.id,
      company_id: companyId,
      company_name: portalUser.companyName,
      employee_id: portalUser.employeeId,
      employee_code: portalUser.employeeCode,
      username: portalUser.username,
      password_hash: portalUser.passwordHash,
      full_name: portalUser.fullName,
      created_at: now,
      updated_at: now,
      updated_by: portalUser.updatedBy
    }], { conflict: "id", upsert: true });
  }
  return {
    ...savedProfile,
    portalUserId: portalUser.id,
    username: portalUser.username,
    companyName: portalUser.companyName
  };
}
async function resetEmployeeUserPassword({ actorUserId, companyId, employeeUserId, newPassword }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can reset employee passwords.");
  if (!newPassword) throw new Error("newPassword is required.");
  if (!cfg().on) {
    const store = readStore();
    store.employeePortalUsers = Array.isArray(store.employeePortalUsers) ? store.employeePortalUsers : [];
    const ix = store.employeePortalUsers.findIndex((item) => String(item.id || "") === String(employeeUserId || "").trim() && String(item.companyId || "") === String(companyId));
    if (ix < 0) throw new Error("Employee user not found.");
    store.employeePortalUsers[ix] = {
      ...store.employeePortalUsers[ix],
      passwordHash: hashPassword(newPassword),
      updatedAt: new Date().toISOString(),
      updatedBy: actor.email || ""
    };
    writeStore(store);
    return { reset: true, employeeUserId };
  }
  await ensureSeeded();
  const rows = await sbPatch("employee_portal_users", `id=eq.${enc(employeeUserId)}&company_id=eq.${enc(companyId)}`, {
    password_hash: hashPassword(newPassword),
    updated_at: new Date().toISOString(),
    updated_by: actor.email || ""
  });
  if (!Array.isArray(rows) || !rows.length) throw new Error("Employee user not found.");
  return { reset: true, employeeUserId };
}
async function loginEmployee({ username, password }) {
  const normalizedUsername = normalizeUsername(username);
  const allUsers = await getAllEmployeePortalUsers();
  const matched = allUsers.find((item) => normalizeUsername(item?.username || "") === normalizedUsername);
  if (!matched || !verifyPassword(password, matched.passwordHash)) throw new Error("Invalid username or password.");
  const profile = await getEmployeeProfile(matched.companyId, matched.employeeId);
  if (!profile) throw new Error("Employee profile not found.");
  const sessionUser = sanitizeEmployeeSessionUser({ ...profile, ...matched, employeeUserId: matched.id });
  const token = createSignedEmployeeToken({
    type: "employee_portal",
    employeeUserId: sessionUser.employeeUserId,
    employeeId: sessionUser.employeeId,
    companyId: sessionUser.companyId,
    companyName: sessionUser.companyName,
    employeeCode: sessionUser.employeeCode,
    username: sessionUser.username,
    fullName: sessionUser.fullName,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7
  });
  return { token, user: sessionUser };
}
async function getEmployeeSessionUser(token) {
  const payload = readSignedEmployeeToken(token);
  if (!payload) return null;
  const profile = await getEmployeeProfile(payload.companyId, payload.employeeId);
  if (!profile) return null;
  return sanitizeEmployeeSessionUser({ ...profile, ...payload, employeeUserId: payload.employeeUserId });
}
async function requireEmployeeSessionUser(token) {
  const user = await getEmployeeSessionUser(token);
  if (!user) throw new Error("Invalid or missing employee session.");
  return user;
}
async function listEmployeeAttendance({ companyId, employeeId, dateFrom = "", dateTo = "" }) {
  if (!companyId || !employeeId) return [];
  const from = toIsoDateOnly(dateFrom);
  const to = toIsoDateOnly(dateTo);
  if (!cfg().on) {
    const store = readStore();
    return (store.employeeAttendanceLogs || [])
      .filter((item) => String(item.companyId || "") === String(companyId) && String(item.employeeId || "") === String(employeeId))
      .map(sanitizeEmployeeAttendanceLog)
      .filter((item) => item && (!from || item.attendanceDate >= from) && (!to || item.attendanceDate <= to))
      .sort((a, b) => String(b.attendanceDate || "").localeCompare(String(a.attendanceDate || "")));
  }
  await ensureSeeded();
  const filters = [
    `company_id=eq.${enc(companyId)}`,
    `employee_id=eq.${enc(employeeId)}`,
    from ? `attendance_date=gte.${enc(from)}` : "",
    to ? `attendance_date=lte.${enc(to)}` : "",
    "order=attendance_date.desc"
  ].filter(Boolean).join("&");
  const rows = await sbSel("employee_attendance_logs", `select=*&${filters}`);
  return (rows || []).map(sanitizeEmployeeAttendanceLog).filter(Boolean);
}
async function markEmployeeAttendance({ employeeUser, action, latitude, longitude, accuracyMeters, addressLabel = "", note = "", devicePayload = {} }) {
  const actor = sanitizeEmployeeSessionUser(employeeUser);
  if (!actor?.companyId || !actor?.employeeId) throw new Error("Employee session is required.");
  const safeAction = String(action || "").trim().toLowerCase();
  if (!["check_in", "check_out"].includes(safeAction)) throw new Error("Invalid attendance action.");
  const today = toIsoDateOnly(new Date().toISOString());
  const now = new Date().toISOString();
  const logs = await listEmployeeAttendance({ companyId: actor.companyId, employeeId: actor.employeeId, dateFrom: today, dateTo: today });
  const openLog = logs.find((item) => item.checkInAt && !item.checkOutAt) || null;
  const sites = await getEmployeeWorkSites(actor.companyId, actor.employeeId);
  const primarySite = sites.find((item) => item.isPrimary) || sites[0] || null;
  const distance = primarySite ? haversineMeters(latitude, longitude, primarySite.latitude, primarySite.longitude) : null;
  const locationStatus = !Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))
    ? "unknown"
    : !primarySite || distance == null
      ? "remote"
      : distance <= Number(primarySite.radiusMeters || 500)
        ? "on_site"
        : "outside_radius";

  if (safeAction === "check_in" && openLog) throw new Error("You are already checked in for today.");
  if (safeAction === "check_out" && !openLog) throw new Error("No open check-in found for today.");
  const incomingDevicePayload = devicePayload && typeof devicePayload === "object" ? devicePayload : {};

  if (!cfg().on) {
    const store = readStore();
    store.employeeAttendanceLogs = Array.isArray(store.employeeAttendanceLogs) ? store.employeeAttendanceLogs : [];
    if (safeAction === "check_in") {
      const row = {
        id: crypto.randomUUID(),
        companyId: actor.companyId,
        employeeId: actor.employeeId,
        attendanceDate: today,
        checkInAt: now,
        checkOutAt: "",
        checkInLatitude: latitude,
        checkInLongitude: longitude,
        checkInAccuracyMeters: accuracyMeters,
        checkOutLatitude: null,
        checkOutLongitude: null,
        checkOutAccuracyMeters: null,
        checkInAddressLabel: String(addressLabel || "").trim(),
        checkOutAddressLabel: "",
        checkInNote: String(note || "").trim(),
        checkOutNote: "",
        siteId: String(primarySite?.id || "").trim(),
        locationStatus,
        distanceFromSiteMeters: distance,
        devicePayload: {
          ...incomingDevicePayload,
          attendanceMeta: {
            ...(incomingDevicePayload.attendanceMeta && typeof incomingDevicePayload.attendanceMeta === "object" ? incomingDevicePayload.attendanceMeta : {}),
            checkIn: {
              capturedAt: now,
              locationStatus,
              distanceFromSiteMeters: distance,
              latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
              longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
              accuracyMeters: Number.isFinite(Number(accuracyMeters)) ? Number(accuracyMeters) : null
            }
          }
        },
        createdAt: now,
        updatedAt: now
      };
      store.employeeAttendanceLogs.push(row);
      writeStore(store);
      return sanitizeEmployeeAttendanceLog(row);
    }
    const ix = store.employeeAttendanceLogs.findIndex((item) => String(item.id || "") === String(openLog.id || ""));
    if (ix < 0) throw new Error("Open attendance row not found.");
    store.employeeAttendanceLogs[ix] = {
      ...store.employeeAttendanceLogs[ix],
      checkOutAt: now,
      checkOutLatitude: latitude,
      checkOutLongitude: longitude,
      checkOutAccuracyMeters: accuracyMeters,
      checkOutAddressLabel: String(addressLabel || "").trim(),
      checkOutNote: String(note || "").trim(),
      locationStatus,
      distanceFromSiteMeters: distance,
      devicePayload: {
        ...(store.employeeAttendanceLogs[ix].devicePayload && typeof store.employeeAttendanceLogs[ix].devicePayload === "object" ? store.employeeAttendanceLogs[ix].devicePayload : {}),
        ...incomingDevicePayload,
        attendanceMeta: {
          ...((store.employeeAttendanceLogs[ix].devicePayload && typeof store.employeeAttendanceLogs[ix].devicePayload === "object" && store.employeeAttendanceLogs[ix].devicePayload.attendanceMeta && typeof store.employeeAttendanceLogs[ix].devicePayload.attendanceMeta === "object")
            ? store.employeeAttendanceLogs[ix].devicePayload.attendanceMeta
            : {}),
          checkOut: {
            capturedAt: now,
            locationStatus,
            distanceFromSiteMeters: distance,
            latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
            longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
            accuracyMeters: Number.isFinite(Number(accuracyMeters)) ? Number(accuracyMeters) : null
          }
        }
      },
      updatedAt: now
    };
    writeStore(store);
    return sanitizeEmployeeAttendanceLog(store.employeeAttendanceLogs[ix]);
  }

  await ensureSeeded();
  if (safeAction === "check_in") {
    const nextDevicePayload = {
      ...incomingDevicePayload,
      attendanceMeta: {
        ...(incomingDevicePayload.attendanceMeta && typeof incomingDevicePayload.attendanceMeta === "object" ? incomingDevicePayload.attendanceMeta : {}),
        checkIn: {
          capturedAt: now,
          locationStatus,
          distanceFromSiteMeters: distance,
          latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
          longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
          accuracyMeters: Number.isFinite(Number(accuracyMeters)) ? Number(accuracyMeters) : null
        }
      }
    };
    const rows = await sbIns("employee_attendance_logs", [{
      id: crypto.randomUUID(),
      company_id: actor.companyId,
      employee_id: actor.employeeId,
      attendance_date: today,
      check_in_at: now,
      check_in_latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
      check_in_longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
      check_in_accuracy_meters: Number.isFinite(Number(accuracyMeters)) ? Number(accuracyMeters) : null,
      check_in_address_label: String(addressLabel || "").trim(),
      check_in_note: String(note || "").trim(),
      site_id: primarySite?.id || null,
      location_status: locationStatus,
      distance_from_site_meters: distance,
      device_payload: nextDevicePayload,
      created_at: now,
      updated_at: now
    }], { conflict: "id", upsert: true });
    return sanitizeEmployeeAttendanceLog(rows?.[0]);
  }
  const openPayload = openLog?.devicePayload && typeof openLog.devicePayload === "object" ? openLog.devicePayload : {};
  const nextDevicePayload = {
    ...openPayload,
    ...incomingDevicePayload,
    attendanceMeta: {
      ...(openPayload.attendanceMeta && typeof openPayload.attendanceMeta === "object" ? openPayload.attendanceMeta : {}),
      ...(incomingDevicePayload.attendanceMeta && typeof incomingDevicePayload.attendanceMeta === "object" ? incomingDevicePayload.attendanceMeta : {}),
      checkOut: {
        capturedAt: now,
        locationStatus,
        distanceFromSiteMeters: distance,
        latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
        longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
        accuracyMeters: Number.isFinite(Number(accuracyMeters)) ? Number(accuracyMeters) : null
      }
    }
  };
  const rows = await sbPatch("employee_attendance_logs", `id=eq.${enc(openLog.id)}&company_id=eq.${enc(actor.companyId)}`, {
    check_out_at: now,
    check_out_latitude: Number.isFinite(Number(latitude)) ? Number(latitude) : null,
    check_out_longitude: Number.isFinite(Number(longitude)) ? Number(longitude) : null,
    check_out_accuracy_meters: Number.isFinite(Number(accuracyMeters)) ? Number(accuracyMeters) : null,
    check_out_address_label: String(addressLabel || "").trim(),
    check_out_note: String(note || "").trim(),
    location_status: locationStatus,
    distance_from_site_meters: distance,
    device_payload: nextDevicePayload,
    updated_at: now
  });
  return sanitizeEmployeeAttendanceLog(rows?.[0] || openLog);
}
async function deleteCompanyJob({ actorUserId, companyId, jobId }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor) throw new Error("Authenticated recruiter not found for this company.");
  const actorIsAdmin = String(actor.role || "").toLowerCase() === "admin";

  let job = null;
  if (!cfg().on) {
    job = sanitizeJob((readStore().jobs || []).find((j) => j.companyId === companyId && j.id === jobId && !isSystemJobRow(j)));
  } else {
    await ensureSeeded();
    const rows = await sbSel("company_jobs", `select=*&id=eq.${enc(jobId)}&company_id=eq.${enc(companyId)}&limit=1`);
    job = sanitizeJob((rows || []).find((row) => !isSystemJobRow(row)));
  }
  if (!job) throw new Error("Company JD not found.");
  if (!actorIsAdmin && String(job.ownerRecruiterId || "").trim() !== String(actor.id || "").trim()) {
    throw new Error("Only an admin or the owner recruiter can delete this JD.");
  }

  if (!cfg().on) {
    const store = readStore();
    store.jobs = (store.jobs || []).filter((j) => !(j.companyId === companyId && j.id === jobId));
    writeStore(store);
  } else {
    await sbDel("company_jobs", `id=eq.${enc(jobId)}&company_id=eq.${enc(companyId)}`);
  }
  return { deleted: true, jobId };
}
function parseExperienceMonths(value) {
  const text = String(value || "").toLowerCase(); if (!text) return null;
  const y = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i), m = text.match(/(\d+)\s*(?:months?|mos?)/i), total = Math.round((y ? Number(y[1]) : 0) * 12 + (m ? Number(m[1]) : 0));
  return Number.isFinite(total) && total > 0 ? total : null;
}
function buildAssessmentSearchSpec(query) {
  const raw = String(query || "").trim(), lower = raw.toLowerCase();
  const minExpMatch = lower.match(/\b(?:more than|above|over|at least|min(?:imum)? of?)\s+(\d+(?:\.\d+)?)\s+years?\b/);
  const maxExpMatch = lower.match(/\b(?:less than|below|under|at most|max(?:imum)? of?)\s+(\d+(?:\.\d+)?)\s+years?\b/);
  const locatedMatch = lower.match(/\b(?:located in|based in|from)\s+([a-z][a-z\s\/&.-]+)\b/);
  const companyMatch = lower.match(/\b(?:from|at)\s+company\s+([a-z0-9][a-z0-9\s&./-]+)\b/);
  let freeText = raw;
  [minExpMatch?.[0], maxExpMatch?.[0], locatedMatch?.[0], companyMatch?.[0]].filter(Boolean).forEach((f) => { freeText = freeText.replace(f, " "); });
  freeText = freeText.replace(/\b(get me|show me|find me|search|candidates?|profiles?)\b/gi, " ");
  return { raw, minMonths: minExpMatch ? Math.round(Number(minExpMatch[1]) * 12) : null, maxMonths: maxExpMatch ? Math.round(Number(maxExpMatch[1]) * 12) : null, location: locatedMatch ? locatedMatch[1].trim() : "", explicitCompany: companyMatch ? companyMatch[1].trim() : "", keywords: freeText.split(/[\s,]+/).map((t) => t.trim().toLowerCase()).filter((t) => t.length >= 2) };
}
async function listAssessments({ actorUserId, companyId }) {
  if (!actorUserId || !companyId) throw new Error("actorUserId and companyId are required.");
  const actor = sanitizeUser(await getUserById(actorUserId, companyId)); if (!actor) throw new Error("Authenticated recruiter not found for this company.");
  if (!cfg().on) {
    return (readStore().assessments || []).filter((i) => i.companyId === companyId && (actor.role === "admin" || i.recruiterId === actor.id)).sort((a, b) => String(b.generatedAt || b.createdAt || "").localeCompare(String(a.generatedAt || a.createdAt || ""))).map(sanitizeAssessment);
  }
  await ensureSeeded();
  const rows = await sbSel("assessments", `select=*&company_id=eq.${enc(companyId)}&order=created_at.desc&limit=500`);
  if (actor.role === "admin") return (rows || []).map(sanitizeAssessment);

  // Team recruiters should also see admin-created assessments if the underlying candidate
  // is visible to them (assigned-to or owned).
  const visibleCandidates = await sbSel(
    "candidates",
    `select=id,email,phone&company_id=eq.${enc(companyId)}&or=(recruiter_id.eq.${enc(actor.id)},assigned_to_user_id.eq.${enc(actor.id)})&limit=5000`
  ).catch(() => []);
  const visibleCandidateIds = new Set((visibleCandidates || []).map((c) => String(c?.id || "").trim()).filter(Boolean));
  const visibleEmails = new Set((visibleCandidates || []).map((c) => String(c?.email || "").trim().toLowerCase()).filter(Boolean));
  const visiblePhones = new Set((visibleCandidates || []).map((c) => normalizeAssessmentPhone(c?.phone)).filter(Boolean));

  return (rows || [])
    .filter((i) => {
      if (String(i.recruiter_id || "") === actor.id) return true;
      const payload = i?.payload && typeof i.payload === "object" ? i.payload : {};
      const candidateId = String(i.candidate_id || payload.candidateId || payload.candidate_id || "").trim();
      if (candidateId) return visibleCandidateIds.has(candidateId);

      // Fallback: candidate_id missing (bad legacy rows). Match by identity if possible.
      const email = String(i.email_id || payload.emailId || payload.email_id || "").trim().toLowerCase();
      const phone = normalizeAssessmentPhone(i.phone_number || payload.phoneNumber || payload.phone_number || "");
      if (email && visibleEmails.has(email)) return true;
      if (phone && visiblePhones.has(phone)) return true;
      return false;
    })
    .map(sanitizeAssessment);
}

// Used by signed public share links. This intentionally bypasses recruiter scoping,
// because access is controlled via a signed token that includes companyId + assessmentId.
async function getAssessmentById({ companyId, assessmentId }) {
  const safeCompanyId = String(companyId || "").trim();
  const safeAssessmentId = String(assessmentId || "").trim();
  if (!safeCompanyId || !safeAssessmentId) throw new Error("companyId and assessmentId are required.");
  if (!cfg().on) {
    const match = (readStore().assessments || []).find((i) => i.companyId === safeCompanyId && i.id === safeAssessmentId) || null;
    return match ? sanitizeAssessment(match) : null;
  }
  await ensureSeeded();
  const rows = await sbSel("assessments", `select=*&company_id=eq.${enc(safeCompanyId)}&id=eq.${enc(safeAssessmentId)}&limit=1`).catch(() => []);
  return rows && rows[0] ? sanitizeAssessment(rows[0]) : null;
}

function normalizeAssessmentKeyPart(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeAssessmentPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 10) return "";
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeAssessmentEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function assessmentsMatchSameCandidateKey(existing = {}, incoming = {}) {
  const exCandidateId = String(existing?.candidateId || existing?.candidate_id || "").trim();
  const inCandidateId = String(incoming?.candidateId || incoming?.candidate_id || "").trim();
  if (exCandidateId && inCandidateId && exCandidateId === inCandidateId) {
    const exJd = normalizeAssessmentKeyPart(existing?.jdTitle || existing?.jd_title || "");
    const inJd = normalizeAssessmentKeyPart(incoming?.jdTitle || incoming?.jd_title || "");
    const exClient = normalizeAssessmentKeyPart(existing?.clientName || existing?.client_name || "");
    const inClient = normalizeAssessmentKeyPart(incoming?.clientName || incoming?.client_name || "");
    // Prefer matching within same client + JD to avoid merging a candidate submitted to multiple roles.
    if (exJd && inJd && exJd !== inJd) return false;
    if (exClient && inClient && exClient !== inClient) return false;
    return true;
  }
  return false;
}

async function findExistingAssessmentIdForCandidate({ actorUserId, companyId, assessment }) {
  const a = sanitizeAssessment(assessment);
  const candidateId = String(a?.candidateId || "").trim();
  const emailNeedle = normalizeAssessmentEmail(a?.emailId || a?.email_id || "");
  const phoneNeedle = normalizeAssessmentPhone(a?.phoneNumber || a?.phone_number || "");
  const jdTitle = normalizeAssessmentKeyPart(a?.jdTitle || "");
  const clientName = normalizeAssessmentKeyPart(a?.clientName || "");

  if (!cfg().on) {
    const store = readStore();
    const items = Array.isArray(store.assessments) ? store.assessments.filter((i) => i.companyId === companyId) : [];
    const match = items.find((existing) => {
      if (assessmentsMatchSameCandidateKey(existing, a)) return true;
      const exEmail = normalizeAssessmentEmail(existing?.emailId || existing?.email_id || "");
      const exPhone = normalizeAssessmentPhone(existing?.phoneNumber || existing?.phone_number || "");
      const sameIdentity = (emailNeedle && exEmail && emailNeedle === exEmail) || (phoneNeedle && exPhone && phoneNeedle === exPhone);
      if (!sameIdentity) return false;
      const exJd = normalizeAssessmentKeyPart(existing?.jdTitle || existing?.jd_title || "");
      const exClient = normalizeAssessmentKeyPart(existing?.clientName || existing?.client_name || "");
      if (jdTitle && exJd && jdTitle !== exJd) return false;
      if (clientName && exClient && clientName !== exClient) return false;
      return true;
    }) || null;
    return match ? String(match.id || "").trim() : "";
  }

  await ensureSeeded();
  // Pull a small set for the candidate, then filter in JS to keep logic consistent.
  let rows = [];
  if (candidateId) {
    rows = await sbSel("assessments", `select=id,candidate_id,candidate_name,client_name,jd_title,email_id,phone_number,payload&company_id=eq.${enc(companyId)}&candidate_id=eq.${enc(candidateId)}&limit=50`).catch(() => []);
  } else if (emailNeedle || phoneNeedle) {
    const orParts = [];
    if (emailNeedle) orParts.push(`email_id.eq.${enc(emailNeedle)}`);
    if (phoneNeedle) orParts.push(`phone_number.eq.${enc(phoneNeedle)}`);
    rows = await sbSel("assessments", `select=id,candidate_id,candidate_name,client_name,jd_title,email_id,phone_number,payload&company_id=eq.${enc(companyId)}&or=(${orParts.join(",")})&limit=50`).catch(() => []);
  }
  const sanitized = (rows || []).map(sanitizeAssessment);
  const match = sanitized.find((existing) => {
    const sameCandidateId = assessmentsMatchSameCandidateKey(existing, a);
    if (!sameCandidateId) return false;
    const exJd = normalizeAssessmentKeyPart(existing?.jdTitle || "");
    const exClient = normalizeAssessmentKeyPart(existing?.clientName || "");
    if (jdTitle && exJd && jdTitle !== exJd) return false;
    if (clientName && exClient && clientName !== exClient) return false;
    return true;
  }) || null;
  if (match) return String(match.id || "").trim();

  // Fallback: if candidateId differs due to accidental duplicate candidate rows, match by phone/email instead.
  if (emailNeedle || phoneNeedle) {
    const fallbackRows = await sbSel("assessments", `select=id,candidate_id,client_name,jd_title,email_id,phone_number,payload&company_id=eq.${enc(companyId)}&limit=250`).catch(() => []);
    const fallback = (fallbackRows || []).map(sanitizeAssessment).find((existing) => {
      const exEmail = normalizeAssessmentEmail(existing?.emailId || existing?.email_id || "");
      const exPhone = normalizeAssessmentPhone(existing?.phoneNumber || existing?.phone_number || "");
      const sameIdentity = (emailNeedle && exEmail && emailNeedle === exEmail) || (phoneNeedle && exPhone && phoneNeedle === exPhone);
      if (!sameIdentity) return false;
      const exJd = normalizeAssessmentKeyPart(existing?.jdTitle || "");
      const exClient = normalizeAssessmentKeyPart(existing?.clientName || "");
      if (jdTitle && exJd && jdTitle !== exJd) return false;
      if (clientName && exClient && clientName !== exClient) return false;
      return true;
    }) || null;
    if (fallback) return String(fallback.id || "").trim();
  }
  return "";
}
async function saveAssessment({ actorUserId, companyId, assessment }) {
  if (!actorUserId || !companyId || !assessment) throw new Error("actorUserId, companyId, and assessment payload are required.");
  const actor = sanitizeUser(await getUserById(actorUserId, companyId)); if (!actor) throw new Error("Authenticated recruiter not found for this company.");
  if (!cfg().on) {
    const store = readStore(); store.assessments = Array.isArray(store.assessments) ? store.assessments : []; const now = new Date().toISOString(); const id = persistedAssessmentId(assessment.id); const ix = store.assessments.findIndex((i) => i.id === id && i.companyId === companyId);
    const next = { ...assessment, id, companyId, recruiterId: actor.id, recruiterName: actor.name, recruiterEmail: actor.email, generatedAt: assessment.generatedAt || now, updatedAt: now };
    if (ix >= 0) store.assessments[ix] = next; else store.assessments.unshift(next); writeStore(store); return sanitizeAssessment(next);
  }
  // De-duplicate: if an assessment already exists for the same candidate (and same client/JD when present),
  // reuse that id instead of creating a brand-new row. This prevents "assessment created twice" when admin
  // and recruiter both try converting the same captured note.
  const existingId = await findExistingAssessmentIdForCandidate({ actorUserId: actor.id, companyId, assessment }).catch(() => "");
  const incoming = sanitizeAssessment(assessment);
  const candidateId = String(incoming?.candidateId || incoming?.candidate_id || "").trim();
  if (!candidateId) {
    throw new Error("candidateId is required for assessments.");
  }
  const safeAssessment = existingId ? { ...incoming, id: existingId } : incoming;

  // Read previous row (best-effort) so we can create factual events (status changes, interview done, offered, etc.)
  // without breaking existing flows if the table isn't present.
  let previous = null;
  try {
    await ensureSeeded();
    const idNeedle = String(persistedAssessmentId(safeAssessment.id) || "").trim();
    if (idNeedle) {
      const rowsPrev = await sbSel(
        "assessments",
        `select=id,candidate_status,status,interview_at,offer_doj,offer_amount,updated_at,created_at,client_name,jd_title,candidate_id&company_id=eq.${enc(companyId)}&id=eq.${enc(idNeedle)}&limit=1`
      ).catch(() => []);
      previous = rowsPrev && rowsPrev[0] ? rowsPrev[0] : null;
    }
  } catch (_) {
    previous = null;
  }

  // Preserve the original created_at / generatedAt on upserts to avoid collapsing timestamps
  // when patching many assessments (e.g. migrations, link repairs, bulk edits).
  const preservedCreatedAt = String(previous?.created_at || previous?.createdAt || "").trim();
  const safeAssessmentForSave = preservedCreatedAt ? { ...safeAssessment, generatedAt: preservedCreatedAt } : safeAssessment;

  const rows = await sbIns("assessments", [assessmentRow(safeAssessmentForSave, actor, companyId)], { conflict: "id", upsert: true });
  const saved = sanitizeAssessment(rows[0]);

  // Best-effort event insert (no-op if the table doesn't exist yet).
  try {
    const prevStatus = String(previous?.candidate_status || previous?.status || "").trim().toLowerCase();
    const nextStatus = String(saved?.candidateStatus || saved?.status || "").trim();
    const nextStatusLower = nextStatus.toLowerCase();

    const statusChanged = !prevStatus || prevStatus !== nextStatusLower;
    const isOffered = nextStatusLower === "offered";
    const isJoined = nextStatusLower === "joined";

    const bestDate = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return null;
      const d = new Date(raw);
      if (Number.isFinite(d.getTime())) return d.toISOString();
      return null;
    };

    if (statusChanged) {
      // Prefer the assigned recruiter as the event owner so exports and "my events" match expectations.
      // Actor (who clicked) is tracked in payload as updatedBy.
      let ownerRecruiterId = actor.id;
      let ownerRecruiterName = actor.name;
      let ownerClientName = String(saved?.clientName || "").trim();
      let ownerJdTitle = String(saved?.jdTitle || "").trim();
      let ownerCandidateName = String(saved?.candidateName || "").trim();
      try {
        const candidateIdNeedle = String(saved?.candidateId || "").trim();
        if (candidateIdNeedle) {
          const rowsCand = await sbSel(
            "candidates",
            `select=id,name,assigned_to_user_id,assigned_to_name,client_name,jd_title&company_id=eq.${enc(companyId)}&id=eq.${enc(candidateIdNeedle)}&limit=1`
          ).catch(() => []);
          const cand = rowsCand && rowsCand[0] ? rowsCand[0] : null;
          const assignedId = String(cand?.assigned_to_user_id || "").trim();
          const assignedName = String(cand?.assigned_to_name || "").trim();
          if (assignedId) ownerRecruiterId = assignedId;
          if (assignedName) ownerRecruiterName = assignedName;
          if (!ownerCandidateName) ownerCandidateName = String(cand?.name || "").trim();
          if (!ownerClientName) ownerClientName = String(cand?.client_name || "").trim();
          if (!ownerJdTitle) ownerJdTitle = String(cand?.jd_title || "").trim();
        }
      } catch (_) {}

      const normalized = (value) => String(value || "").trim().toLowerCase();
      const stageIndex = (valueLower) => {
        if (valueLower === "screening call aligned") return 0;
        if (valueLower === "l1 aligned") return 1;
        if (valueLower === "l2 aligned") return 2;
        if (valueLower === "l3 aligned") return 3;
        if (valueLower === "hr interview aligned") return 4;
        return -1;
      };
      const stageRound = (idx) => {
        if (idx === 1) return "L1";
        if (idx === 2) return "L2";
        if (idx === 3) return "L3";
        if (idx === 4) return "HR";
        return "";
      };
      const inferDoneRound = (prevLower, nextLower) => {
        const nextIdx = stageIndex(nextLower);
        // Rule: if status becomes L2/L3/HR aligned, previous round is done.
        if (nextIdx === 2) return "L1";
        if (nextIdx === 3) return "L2";
        if (nextIdx === 4) return "L3";
        // Rule: feedback awaited => last aligned round is done (based on previous status).
        if (nextLower === "feedback awaited") {
          const prevIdx = stageIndex(prevLower);
          return stageRound(prevIdx);
        }
        // Rule: interview reject => currently running aligned round is considered done.
        if (nextLower === "interview reject") {
          const prevIdx = stageIndex(prevLower);
          return stageRound(prevIdx);
        }
        return "";
      };

      const isAligned = stageIndex(nextStatusLower) >= 0;
      const alignedRound = stageRound(stageIndex(nextStatusLower));
      const doneRound = inferDoneRound(prevStatus, nextStatusLower);

      const eventBase = {
        companyId,
        assessmentId: String(saved?.id || "").trim(),
        candidateId: String(saved?.candidateId || "").trim(),
        recruiterId: ownerRecruiterId,
        recruiterName: ownerRecruiterName,
        clientName: ownerClientName,
        jdTitle: ownerJdTitle,
        payload: {
          previousStatus: String(previous?.candidate_status || previous?.status || "").trim(),
          candidateName: ownerCandidateName,
          updatedByUserId: actor.id,
          updatedByName: actor.name,
          interviewAt: String(saved?.interviewAt || "").trim(),
          offerDoj: String(saved?.offerDoj || "").trim(),
          offerAmount: String(saved?.offerAmount || "").trim()
        }
      };

      // Always keep a factual status_updated event for analytics/debug.
      await insertAssessmentEvent({
        ...eventBase,
        eventType: "status_updated",
        status: nextStatus,
        eventAt: new Date().toISOString()
      });

      if (isAligned) {
        await insertAssessmentEvent({
          ...eventBase,
          eventType: "interview_aligned",
          status: nextStatus,
          eventAt: bestDate(saved?.interviewAt || previous?.interview_at) || new Date().toISOString(),
          payload: { ...eventBase.payload, round: alignedRound }
        });
      }

      if (doneRound) {
        const doneEventAt =
          bestDate(saved?.interviewAt || previous?.interview_at || previous?.interviewAt)
          || new Date().toISOString();
        await insertAssessmentEvent({
          ...eventBase,
          eventType: "interview_done",
          status: nextStatus,
          eventAt: doneEventAt,
          payload: { ...eventBase.payload, round: doneRound }
        });
      }

      if (isOffered) {
        await insertAssessmentEvent({
          ...eventBase,
          eventType: "offered",
          status: nextStatus,
          eventAt: new Date().toISOString()
        });
      }

      if (isJoined) {
        await insertAssessmentEvent({
          ...eventBase,
          eventType: "joined",
          status: nextStatus,
          eventAt: new Date().toISOString()
        });
      }
    }
  } catch (_) {}

  return saved;
}

async function patchAssessmentCandidateLink({ actorUserId, companyId, assessmentId, candidateId }) {
  if (!actorUserId || !companyId || !assessmentId || !candidateId) {
    throw new Error("actorUserId, companyId, assessmentId, and candidateId are required.");
  }
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor) throw new Error("Authenticated recruiter not found for this company.");
  if (String(actor.role || "").toLowerCase() !== "admin") throw new Error("Only an admin can repair assessment links.");
  if (!cfg().on) throw new Error("Supabase must be enabled to repair assessment links.");

  await ensureSeeded();
  const safeAssessmentId = String(assessmentId || "").trim();
  const safeCandidateId = String(candidateId || "").trim();
  if (!safeAssessmentId || !safeCandidateId) throw new Error("assessmentId and candidateId are required.");

  const existingRows = await sbSel(
    "assessments",
    `select=id,company_id,payload&company_id=eq.${enc(companyId)}&id=eq.${enc(safeAssessmentId)}&limit=1`
  ).catch(() => []);
  const existing = existingRows && existingRows[0] ? existingRows[0] : null;
  if (!existing) throw new Error("Assessment not found.");

  const payload = existing?.payload && typeof existing.payload === "object" ? { ...existing.payload } : {};
  payload.candidateId = safeCandidateId;
  payload.candidate_id = safeCandidateId;

  const patched = await sbPatch(
    "assessments",
    `id=eq.${enc(safeAssessmentId)}&company_id=eq.${enc(companyId)}`,
    { candidate_id: safeCandidateId, payload, updated_at: new Date().toISOString() }
  );
  return sanitizeAssessment(patched && patched[0] ? patched[0] : { ...existing, candidate_id: safeCandidateId, payload });
}
async function searchAssessments({ actorUserId, companyId, q, limit = 25 }) {
  const base = await listAssessments({ actorUserId, companyId }); const spec = buildAssessmentSearchSpec(q);
  if (!spec.raw) return base.slice(0, Math.max(1, Number(limit) || 25));
  return base.filter((item) => {
    const months = parseExperienceMonths(item.totalExperience);
    if (spec.minMonths != null && (months == null || months < spec.minMonths)) return false;
    if (spec.maxMonths != null && (months == null || months > spec.maxMonths)) return false;
    if (spec.location && !String(item.location || item.callbackNotes || "").toLowerCase().includes(spec.location.toLowerCase())) return false;
    if (spec.explicitCompany) {
      const h = `${item.currentCompany || ""} ${item.clientName || ""} ${item.jdTitle || ""}`.toLowerCase();
      if (!h.includes(spec.explicitCompany.toLowerCase())) return false;
    }
    if (!spec.keywords.length) return true;
    const hay = [item.candidateName, item.phoneNumber, item.emailId, item.jdTitle, item.clientName, item.currentCompany, item.currentDesignation, item.location, item.totalExperience, item.highestEducation, item.callbackNotes, item.recruiterNotes].filter(Boolean).join(" | ").toLowerCase();
    return spec.keywords.every((t) => hay.includes(t));
  }).slice(0, Math.max(1, Number(limit) || 25));
}
async function deleteAssessment({ actorUserId, companyId, assessmentId }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor) throw new Error("Authenticated recruiter not found for this company.");
  const actorIsAdmin = String(actor.role || "").toLowerCase() === "admin";

  const isAllowedForRecruiter = async (assessmentRow) => {
    if (actorIsAdmin) return true;
    if (!assessmentRow) return false;
    if (String(assessmentRow?.recruiter_id || assessmentRow?.recruiterId || "").trim() === String(actor.id || "").trim()) return true;

    // Recruiters can see admin-created assessments if the candidate is assigned/visible to them.
    // Allow delete under the same visibility rule to avoid "can't delete from recruiter login".
    const candidateId = String(
      assessmentRow?.candidate_id
      || assessmentRow?.candidateId
      || assessmentRow?.payload?.candidateId
      || assessmentRow?.payload?.candidate_id
      || ""
    ).trim();
    if (!candidateId) return false;

    const visibleCandidates = await sbSel(
      "candidates",
      `select=id&company_id=eq.${enc(companyId)}&or=(recruiter_id.eq.${enc(actor.id)},assigned_to_user_id.eq.${enc(actor.id)})&id=eq.${enc(candidateId)}&limit=1`
    ).catch(() => []);
    return Array.isArray(visibleCandidates) && visibleCandidates.length > 0;
  };

  if (!cfg().on) {
    const store = readStore();
    const existing = (store.assessments || []).find((i) => i.companyId === companyId && i.id === assessmentId) || null;
    const allowed = actorIsAdmin || (existing && (existing.recruiterId === actor.id || String(existing?.candidateId || "").trim() !== ""));
    if (!allowed) throw new Error("Assessment not found or not allowed.");
    const before = (store.assessments || []).length;
    store.assessments = (store.assessments || []).filter((i) => !(i.companyId === companyId && i.id === assessmentId));
    if (store.assessments.length === before) throw new Error("Assessment not found or not allowed.");
    writeStore(store);
    return { deleted: true, assessmentId };
  }

  await ensureSeeded();
  const rows = await sbSel(
    "assessments",
    `select=id,company_id,recruiter_id,candidate_id,email_id,phone_number,payload&company_id=eq.${enc(companyId)}&id=eq.${enc(assessmentId)}&limit=1`
  ).catch(() => []);
  const assessmentRow = rows && rows[0] ? rows[0] : null;
  if (!assessmentRow) throw new Error("Assessment not found or not allowed.");

  let allowed = await isAllowedForRecruiter(assessmentRow);
  if (!allowed && !actorIsAdmin) {
    // Fallback: candidate_id missing (legacy). If the assessment matches a visible candidate by identity, allow delete.
    const emailNeedle = normalizeAssessmentEmail(assessmentRow?.email_id || assessmentRow?.payload?.emailId || assessmentRow?.payload?.email_id || "");
    const phoneNeedle = normalizeAssessmentPhone(assessmentRow?.phone_number || assessmentRow?.payload?.phoneNumber || assessmentRow?.payload?.phone_number || "");
    if (emailNeedle || phoneNeedle) {
      const visible = await sbSel(
        "candidates",
        `select=id,email,phone&company_id=eq.${enc(companyId)}&or=(recruiter_id.eq.${enc(actor.id)},assigned_to_user_id.eq.${enc(actor.id)})&limit=5000`
      ).catch(() => []);
      const emailSet = new Set((visible || []).map((c) => normalizeAssessmentEmail(c?.email)).filter(Boolean));
      const phoneSet = new Set((visible || []).map((c) => normalizeAssessmentPhone(c?.phone)).filter(Boolean));
      allowed = (emailNeedle && emailSet.has(emailNeedle)) || (phoneNeedle && phoneSet.has(phoneNeedle));
    }
  }
  if (!allowed) throw new Error("Assessment not found or not allowed.");

  await sbDel("assessments", `id=eq.${enc(assessmentId)}&company_id=eq.${enc(companyId)}`);
  return { deleted: true, assessmentId };
}

module.exports = {
  bootstrapAdmin,
  createClientUser,
  createEmployeeUser,
  createTrialCompanyWithAdmin,
  getPlatformSessionUser,
  getCompanyClientUsers,
  getCompanyPayrollSettings,
  getCompanyEmployeeProfiles,
  getCompanyLicense,
  getClientSessionUser,
  getEmployeeProfile,
  getEmployeeSessionUser,
  createCompanyWithAdmin,
  createUser,
  deleteUser,
  deleteAssessment,
  deleteCompanyJob,
  getCompanyApplicantIntakeSecret,
  getCompanySharedExportPresets,
  getPublicCompanyJob,
  getSessionUser,
  incrementCompanyCaptureUsage,
  listCompanyEmployees,
  listCompanySalaryTemplates,
  listCompanyFbpHeads,
  listPayrollInputs,
  listPayrollRuns,
  listEmployeeCompensationStructures,
  listCompaniesAndUsersSummary,
  listAssessments,
  listEmployeeAttendance,
  getAssessmentById,
  listCompanyJobs,
  listCompanyUsers,
  loginClient,
  loginEmployee,
  loginPlatformCreator,
  login,
  markEmployeeAttendance,
  createPayrollRunDraft,
  calculatePayrollRun,
  approvePayrollRun,
  lockPayrollRun,
  setPayrollRunStatus,
  getPayrollRunDetail,
  requirePlatformSessionUser,
  requireClientSessionUser,
  requireEmployeeSessionUser,
  requireSessionUser,
  resetClientUserPassword,
  resetEmployeeUserPassword,
  resetUserPassword,
  removeCompanyFbpHead,
  saveEmployeeProfile,
  saveCompanyFbpHead,
  saveCompanySalaryTemplate,
  saveCompanyPayrollSettings,
  savePayrollInput,
  saveEmployeeCompensationStructure,
  updateEmployeeProfileAndWorkSite,
  saveCompanySharedExportPresets,
  setCompanyApplicantIntakeSecret,
  searchAssessments,
  saveAssessment,
  patchAssessmentCandidateLink,
  saveCompanyJob,
  getUserSmtpSettings,
  saveUserSmtpSettings
};
