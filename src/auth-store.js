const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ companies: [], users: [], sessions: [], jobs: [], assessments: [] }, null, 2), "utf8");
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
async function sb(method, rel, body = null, headers = {}) {
  const { on, url, key } = cfg();
  if (!on) throw new Error("Supabase auth store is not configured.");
  const res = await fetch(`${url}${rel}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, ...headers }, body });
  if (!res.ok) throw new Error(`Supabase auth failed: ${res.status} ${await res.text()}`);
  if (method === "HEAD" || res.status === 204) return null;
  return String(res.headers.get("content-type") || "").includes("application/json") ? res.json() : res.text();
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
    jobDescription: job.jobDescription ?? job.job_description ?? p.jobDescription ?? "",
    mustHaveSkills: job.mustHaveSkills ?? job.must_have_skills ?? p.mustHaveSkills ?? "",
    redFlags: job.redFlags ?? job.red_flags ?? p.redFlags ?? "",
    recruiterNotes: job.recruiterNotes ?? job.recruiter_notes ?? p.recruiterNotes ?? "",
    standardQuestions: job.standardQuestions ?? job.standard_questions ?? p.standardQuestions ?? "",
    jdShortcuts: job.jdShortcuts ?? job.jd_shortcuts ?? p.jdShortcuts ?? "",
    ownerRecruiterId: job.ownerRecruiterId ?? job.owner_recruiter_id ?? p.ownerRecruiterId ?? "",
    ownerRecruiterName: job.ownerRecruiterName ?? job.owner_recruiter_name ?? p.ownerRecruiterName ?? "",
    createdAt: job.createdAt ?? job.created_at ?? p.createdAt ?? null,
    updatedAt: job.updatedAt ?? job.updated_at ?? p.updatedAt ?? null,
    updatedBy: job.updatedBy ?? job.updated_by ?? p.updatedBy ?? null
  };
}
const SHARED_EXPORT_PRESET_ROW_ID = "__shared_export_presets__";
const SHARED_EXPORT_PRESET_ROW_TITLE = "__shared_export_presets__";
const MAX_SHARED_CUSTOM_EXPORT_PRESETS = 10;
function isSharedExportPresetRow(job) {
  return String(job?.id || "").trim() === SHARED_EXPORT_PRESET_ROW_ID || String(job?.title || "").trim() === SHARED_EXPORT_PRESET_ROW_TITLE;
}
function sanitizeSharedExportPresetSettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const rawLabels = source.exportPresetLabels && typeof source.exportPresetLabels === "object" ? source.exportPresetLabels : {};
  const rawColumns = source.exportPresetColumns && typeof source.exportPresetColumns === "object" ? source.exportPresetColumns : {};
  const rawCustomPresets = Array.isArray(source.customExportPresets) ? source.customExportPresets : [];
  return {
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
    customExportPresets: rawCustomPresets
      .map((item, index) => ({
        id: String(item?.id || `custom_preset_${index + 1}`).trim(),
        label: String(item?.label || item?.id || `Custom preset ${index + 1}`).trim(),
        columns: String(item?.columns || "").trim()
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
    status: item.status ?? p.status ?? "",
    customPipelineStages: item.customPipelineStages ?? item.custom_pipeline_stages ?? p.customPipelineStages ?? "",
    customCandidateStatuses: item.customCandidateStatuses ?? item.custom_candidate_statuses ?? p.customCandidateStatuses ?? "",
    customHrCandidateStatuses: item.customHrCandidateStatuses ?? item.custom_hr_candidate_statuses ?? p.customHrCandidateStatuses ?? "",
    interviewAttempts: item.interviewAttempts ?? p.interviewAttempts ?? [],
    pageTitle: item.pageTitle ?? item.page_title ?? p.pageTitle ?? "",
    pageUrl: item.pageUrl ?? item.page_url ?? p.pageUrl ?? "",
    pdfFilename: item.pdfFilename ?? item.pdf_filename ?? p.pdfFilename ?? ""
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
function assessmentRow(assessment, actor, companyId) {
  const a = sanitizeAssessment(assessment);
  const id = persistedAssessmentId(a.id);
  const now = new Date().toISOString();
  const next = { ...a, id, companyId, recruiterId: actor.id, recruiterName: actor.name, recruiterEmail: actor.email, generatedAt: a.generatedAt || now, updatedAt: now };
  return { id, company_id: companyId, recruiter_id: actor.id, recruiter_name: actor.name, recruiter_email: actor.email, candidate_name: next.candidateName || "", phone_number: next.phoneNumber || "", email_id: next.emailId || "", client_name: next.clientName || "", highest_education: next.highestEducation || "", current_company: next.currentCompany || "", current_designation: next.currentDesignation || "", total_experience: next.totalExperience || "", average_tenure_per_company: next.averageTenurePerCompany || "", current_org_tenure: next.currentOrgTenure || "", experience_timeline: next.experienceTimeline || "", jd_title: next.jdTitle || "", job_description: next.jobDescription || "", must_have_skills: next.mustHaveSkills || "", red_flags: next.redFlags || "", jd_shortcuts: next.jdShortcuts || "", standard_questions: next.standardQuestions || "", recruiter_notes: next.recruiterNotes || "", created_at: next.generatedAt, updated_at: next.updatedAt, question_mode: next.questionMode || "", location: next.location || "", linkedin_url: next.linkedinUrl || "", callback_notes: next.callbackNotes || "", pipeline_stage: next.pipelineStage || "", candidate_status: next.candidateStatus || "", follow_up_at: next.followUpAt || "", interview_at: next.interviewAt || "", offer_amount: next.offerAmount || "", offer_doj: next.offerDoj || "", status: next.status || "", custom_pipeline_stages: next.customPipelineStages || "", custom_candidate_statuses: next.customCandidateStatuses || "", custom_hr_candidate_statuses: next.customHrCandidateStatuses || "", page_title: next.pageTitle || "", page_url: next.pageUrl || "", pdf_filename: next.pdfFilename || "", sections: next.sections || {}, result: next.result || {}, answers: next.answers || [], question_answer_pairs: next.questionAnswerPairs || [], payload: next };
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
async function createUser({ actorUserId, companyId, name, email, password, role }) {
  const e = normalizeEmail(email), r = role === "admin" ? "admin" : "team";
  if (!actorUserId || !companyId || !name || !e || !password) throw new Error("actorUserId, companyId, name, email, and password are required.");
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can create recruiter accounts.");
  if (await getUserByEmail(e)) throw new Error("A user with this email already exists.");
  if (!cfg().on) {
    const store = readStore(); const company = store.companies.find((c) => c.id === companyId); if (!company) throw new Error("Company not found.");
    const user = { id: crypto.randomUUID(), companyId, companyName: company.name, name: String(name).trim(), email: e, role: r, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
    store.users.push(user); writeStore(store); return sanitizeUser(user);
  }
  const companies = await sbSel("companies", `select=*&id=eq.${enc(companyId)}&limit=1`);
  const company = companies[0]; if (!company) throw new Error("Company not found.");
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
async function listCompanyUsers(companyId) {
  if (!cfg().on) return readStore().users.filter((u) => u.companyId === companyId).map(sanitizeUser);
  await ensureSeeded(); return (await sbSel("users", `select=*&company_id=eq.${enc(companyId)}&order=created_at.asc`)).map(sanitizeUser);
}
async function listCompanyJobs(companyId) {
  if (!cfg().on) return (readStore().jobs || []).filter((j) => j.companyId === companyId && !isSharedExportPresetRow(j)).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))).map(sanitizeJob);
  await ensureSeeded(); return (await sbSel("company_jobs", `select=*&company_id=eq.${enc(companyId)}&order=updated_at.desc`)).filter((row) => !isSharedExportPresetRow(row)).map(sanitizeJob);
}
async function getPublicCompanyJob(jobId) {
  const id = String(jobId || "").trim();
  if (!id) throw new Error("jobId is required.");
  if (!cfg().on) {
    const job = sanitizeJob((readStore().jobs || []).find((j) => String(j?.id || "").trim() === id && !isSharedExportPresetRow(j)));
    if (!job) throw new Error("Job not found.");
    return job;
  }
  await ensureSeeded();
  const rows = await sbSel("company_jobs", `select=*&id=eq.${enc(id)}&limit=1`);
  const job = sanitizeJob((rows || []).find((row) => !isSharedExportPresetRow(row)));
  if (!job) throw new Error("Job not found.");
  return job;
}
async function saveCompanyJob({ actorUserId, companyId, job }) {
  if (!actorUserId || !companyId || !job?.title || !job?.jobDescription) throw new Error("actorUserId, companyId, job title, and job description are required.");
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can save or edit company JDs.");
  if (!cfg().on) {
    const store = readStore(); store.jobs = Array.isArray(store.jobs) ? store.jobs : []; const now = new Date().toISOString(); const ix = store.jobs.findIndex((i) => i.id === job.id && i.companyId === companyId);
    const next = { id: persistedJobId(job.id), companyId, title: String(job.title || "").trim(), clientName: String(job.clientName || "").trim(), jobDescription: String(job.jobDescription || "").trim(), mustHaveSkills: String(job.mustHaveSkills || "").trim(), redFlags: String(job.redFlags || "").trim(), recruiterNotes: String(job.recruiterNotes || "").trim(), standardQuestions: String(job.standardQuestions || "").trim(), jdShortcuts: String(job.jdShortcuts || "").trim(), ownerRecruiterId: String(job.ownerRecruiterId || job.owner_recruiter_id || "").trim(), ownerRecruiterName: String(job.ownerRecruiterName || job.owner_recruiter_name || "").trim(), createdAt: ix >= 0 ? store.jobs[ix].createdAt : now, updatedAt: now, updatedBy: actor.email };
    if (ix >= 0) store.jobs[ix] = next; else store.jobs.push(next); writeStore(store); return sanitizeJob(next);
  }
  const now = new Date().toISOString(); const rows = await sbIns("company_jobs", [jobRow({ ...job, id: persistedJobId(job.id), companyId, updatedBy: actor.email, createdAt: job.createdAt || now, updatedAt: now })], { conflict: "id", upsert: true }); return sanitizeJob(rows[0]);
}
async function getCompanySharedExportPresets(companyId) {
  if (!companyId) throw new Error("companyId is required.");
  if (!cfg().on) {
    const row = (readStore().jobs || []).find((j) => j.companyId === companyId && isSharedExportPresetRow(j));
    return sanitizeSharedExportPresetSettings(row?.payload || row || {});
  }
  await ensureSeeded();
  const rows = await sbSel("company_jobs", `select=*&company_id=eq.${enc(companyId)}&id=eq.${enc(SHARED_EXPORT_PRESET_ROW_ID)}&limit=1`);
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
    id: SHARED_EXPORT_PRESET_ROW_ID,
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
async function deleteCompanyJob({ actorUserId, companyId, jobId }) {
  const actor = sanitizeUser(await getUserById(actorUserId, companyId));
  if (!actor || actor.role !== "admin") throw new Error("Only an admin for this company can delete company JDs.");
  if (!cfg().on) {
    const store = readStore(); const before = (store.jobs || []).length; store.jobs = (store.jobs || []).filter((j) => !(j.companyId === companyId && j.id === jobId)); if (store.jobs.length === before) throw new Error("Company JD not found."); writeStore(store);
  } else await sbDel("company_jobs", `id=eq.${enc(jobId)}&company_id=eq.${enc(companyId)}`);
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
  await ensureSeeded(); return (await sbSel("assessments", `select=*&company_id=eq.${enc(companyId)}&order=created_at.desc&limit=500`)).filter((i) => actor.role === "admin" || String(i.recruiter_id || "") === actor.id).map(sanitizeAssessment);
}
async function saveAssessment({ actorUserId, companyId, assessment }) {
  if (!actorUserId || !companyId || !assessment) throw new Error("actorUserId, companyId, and assessment payload are required.");
  const actor = sanitizeUser(await getUserById(actorUserId, companyId)); if (!actor) throw new Error("Authenticated recruiter not found for this company.");
  if (!cfg().on) {
    const store = readStore(); store.assessments = Array.isArray(store.assessments) ? store.assessments : []; const now = new Date().toISOString(); const id = persistedAssessmentId(assessment.id); const ix = store.assessments.findIndex((i) => i.id === id && i.companyId === companyId);
    const next = { ...assessment, id, companyId, recruiterId: actor.id, recruiterName: actor.name, recruiterEmail: actor.email, generatedAt: assessment.generatedAt || now, updatedAt: now };
    if (ix >= 0) store.assessments[ix] = next; else store.assessments.unshift(next); writeStore(store); return sanitizeAssessment(next);
  }
  const rows = await sbIns("assessments", [assessmentRow(assessment, actor, companyId)], { conflict: "id", upsert: true }); return sanitizeAssessment(rows[0]);
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
  const actor = sanitizeUser(await getUserById(actorUserId, companyId)); if (!actor) throw new Error("Authenticated recruiter not found for this company.");
  if (!cfg().on) {
    const store = readStore(); const before = (store.assessments || []).length; store.assessments = (store.assessments || []).filter((i) => !(i.companyId === companyId && i.id === assessmentId) || (actor.role !== "admin" && i.recruiterId !== actor.id)); if (store.assessments.length === before) throw new Error("Assessment not found or not allowed."); writeStore(store);
  } else {
    const filters = [`id=eq.${enc(assessmentId)}`, `company_id=eq.${enc(companyId)}`]; if (actor.role !== "admin") filters.push(`recruiter_id=eq.${enc(actor.id)}`); await sbDel("assessments", filters.join("&"));
  }
  return { deleted: true, assessmentId };
}

module.exports = {
  bootstrapAdmin,
  getPlatformSessionUser,
  createCompanyWithAdmin,
  createUser,
  deleteUser,
  deleteAssessment,
  deleteCompanyJob,
  getCompanyApplicantIntakeSecret,
  getCompanySharedExportPresets,
  getPublicCompanyJob,
  getSessionUser,
  listCompaniesAndUsersSummary,
  listAssessments,
  listCompanyJobs,
  listCompanyUsers,
  loginPlatformCreator,
  login,
  requirePlatformSessionUser,
  requireSessionUser,
  resetUserPassword,
  saveCompanySharedExportPresets,
  setCompanyApplicantIntakeSecret,
  searchAssessments,
  saveAssessment,
  saveCompanyJob
};
