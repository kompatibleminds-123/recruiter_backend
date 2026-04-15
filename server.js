const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseCandidatePayload } = require("./src/parser");
const { callOpenAiJsonSchema, callOpenAiQuestions, normalizeCandidateFileWithAi, normalizeCandidateWithAi } = require("./src/ai");
const { storeUploadedFile, loadStoredFile } = require("./src/storage");
const {
  assignCandidate,
  deleteCandidate,
  exportCompanyQuickCaptureData,
  findDuplicateCandidate,
  linkCandidateToAssessment,
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
  createCompanyWithAdmin,
  createTrialCompanyWithAdmin,
  createUser,
  deleteUser,
  deleteAssessment,
  deleteCompanyJob,
  getCompanyApplicantIntakeSecret,
  getCompanyClientUsers,
  getCompanyLicense,
  getClientSessionUser,
  getSessionUser,
  getPlatformSessionUser,
  getCompanySharedExportPresets,
  getPublicCompanyJob,
  listCompaniesAndUsersSummary,
  listAssessments,
  getAssessmentById,
  searchAssessments,
  listCompanyJobs,
  listCompanyUsers,
  loginClient,
  loginPlatformCreator,
  login,
  incrementCompanyCaptureUsage,
  requirePlatformSessionUser,
  requireClientSessionUser,
  requireSessionUser,
  resetClientUserPassword,
  resetUserPassword,
  saveAssessment,
  saveCompanyJob,
  saveCompanySharedExportPresets,
  setCompanyApplicantIntakeSecret
} = require("./src/auth-store");

const { DEFAULT_SYNONYMS } = require("./src/search/synonyms");
const { normalizeRecruiterQuery } = require("./src/search/normalize");
const { hybridSearchCandidates, buildCandidateSemanticText } = require("./src/search/hybrid-search");
const { createEmbedding, hashText } = require("./src/search/embedding-service");

const PORT = Number(process.env.PORT || 8787);
const WHATSAPP_VERIFY_TOKEN = String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
const QUICK_CAPTURE_PUBLIC_DIR = path.join(__dirname, "public", "quick-capture");
const ROOT_PUBLIC_DIR = path.join(__dirname, "public");
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

  const cvResult = meta?.cvAnalysisCache?.result && typeof meta.cvAnalysisCache.result === "object" ? meta.cvAnalysisCache.result : {};
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
  const experienceTimeline = String(a?.experienceTimeline || a?.experience_timeline || draftPayload.experienceTimeline || "").trim();
  const otherPointers = String(a?.otherPointers || c.other_pointers || draftPayload.otherPointers || "").trim();
  const recruiterNotes = String(a?.recruiterNotes || c.recruiter_context_notes || draftPayload.recruiterNotes || "").trim();
  const callbackNotes = String(a?.callbackNotes || c.notes || draftPayload.callbackNotes || "").trim();

  const screeningPointers = otherStandardQuestions
    ? otherStandardQuestions
      .split(/\r?\n+/)
      .map((line) => String(line || "").trim())
      .filter(Boolean)
      .filter((line) => !/^\s*(reason\s+of\s+change)\s*:/i.test(line))
      .join("\n")
    : "";

  const screeningRemarksParts = [];
  if (strongPoints.length) {
    screeningRemarksParts.push("Strong points:");
    strongPoints.forEach((p, idx) => screeningRemarksParts.push(`${idx + 1}. *${p}*`));
  }
  if (screeningPointers) {
    if (screeningRemarksParts.length) screeningRemarksParts.push("");
    screeningRemarksParts.push("Screening pointers:");
    screeningRemarksParts.push(screeningPointers);
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

  if (experienceTimeline) {
    sections.push({
      title: "Previous Experience (timeline)",
      rows: [{ label: "Experience timeline", value: experienceTimeline }]
    });
  }

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
    statusText: [candidateStatus ? `Status: ${candidateStatus}` : "", pipelineStage ? `Pipeline: ${pipelineStage}` : ""].filter(Boolean).join(" | "),
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
  res.writeHead(200, buildResponseHeaders(req, {
    "Content-Type": contentType,
    "Content-Length": body.length,
    "Cache-Control": contentType.startsWith("image/") ? "public, max-age=86400" : "no-store"
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

function buildUploadedFileFingerprint(file = {}) {
  const fileData = String(file?.fileData || "").trim();
  if (!fileData) return "";
  return crypto.createHash("sha1").update(fileData).digest("hex");
}

const INFERRED_SEARCH_TAG_RULES = [
  { tag: "saas", patterns: [/\bsaas\b/i, /\bsoftware as a service\b/i, /\bcrm\b/i, /\bproduct company\b/i] },
  { tag: "b2b", patterns: [/\bb2b\b/i, /\benterprise\b/i, /\bcorporate sales\b/i, /\bchannel partner\b/i, /\bbusiness development\b/i] },
  { tag: "fintech", patterns: [/\bfintech\b/i, /\bpayments\b/i, /\blending\b/i, /\bloans?\b/i, /\bnbfc\b/i, /\bfinancial services\b/i] },
  { tag: "lending", patterns: [/\bloans?\b/i, /\blap\b/i, /\bhome loan\b/i, /\bpersonal loan\b/i, /\bmortgage\b/i] },
  { tag: "healthtech", patterns: [/\bhealthtech\b/i, /\bhealth care\b/i, /\bhospital\b/i, /\bpharma\b/i] },
  { tag: "enterprise sales", patterns: [/\benterprise sales\b/i, /\baccount executive\b/i, /\baccount manager\b/i, /\bbusiness development\b/i] },
  { tag: "node backend", patterns: [/\bnode\.?js\b/i, /\bnode js\b/i, /\bbackend\b/i] },
  { tag: "react frontend", patterns: [/\breact\.?js\b/i, /\breact js\b/i, /\bfrontend\b/i, /\bfront end\b/i] }
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

function summarizeApplicantNotes(payload = {}) {
  return [
    payload?.sourcePlatform ? `Source: ${payload.sourcePlatform}` : "",
    payload?.jobPageUrl ? `Apply URL: ${payload.jobPageUrl}` : "",
    payload?.screeningAnswers ? `Screening: ${payload.screeningAnswers}` : ""
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
    createdAt: String(candidate?.created_at || "").trim(),
    updatedAt: String(candidate?.updated_at || "").trim(),
    usedInAssessment: Boolean(candidate?.used_in_assessment),
    applicantState: String(meta.applicantState || "").trim() || (candidate?.used_in_assessment ? "converted" : "new")
  };
}

async function listApplicantsForUser(user, options = {}) {
  const rows = await listCandidatesForUser(user, { limit: Number(options.limit || 500), q: String(options.q || "").trim() });
  return rows
    .filter((candidate) => {
      const source = String(candidate?.source || "").trim();
      return source === "website_apply" || source === "hosted_apply";
    })
    .map(sanitizeApplicantCandidate);
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
    await patchCandidate(candidateId, {
      used_in_assessment: false,
      assessment_id: "",
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
    fileProvider: storedFile?.provider || "",
    fileKey: storedFile?.key || "",
    fileUrl: storedFile?.url || "",
    filename: storedFile?.filename || "",
    mimeType: storedFile?.mimeType || "",
    sizeBytes: storedFile?.sizeBytes || 0,
    jobId: payload.jobId,
    jobPageUrl: payload.jobPageUrl,
    screeningAnswers: payload.screeningAnswers,
    applicantState: "new"
  };

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

  const candidate = await saveCandidate(
    {
      id: "",
      company_id: payload.companyId,
      source: "website_apply",
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
      recruiter_context_notes: payload.screeningAnswers || null,
      other_pointers: normalized?.timeline?.length ? `Timeline entries: ${normalized.timeline.length}` : null,
      next_action: merged.next_action,
      client_name: payload.clientName || null,
      jd_title: payload.jdTitle || null,
      recruiter_name: payload.recruiterName || "Website Apply",
      assigned_to_user_id: linkAssignedRecruiter?.id || matchedJob?.ownerRecruiterId || null,
      assigned_to_name: linkAssignedRecruiter?.name || matchedJob?.ownerRecruiterName || null,
      assigned_jd_id: matchedJob?.id || null,
      assigned_jd_title: matchedJob?.title || payload.jdTitle || null,
      linkedin: merged.linkedin || null,
      raw_note: encodeApplicantMetadata(metadata)
    },
    { companyId: payload.companyId }
  );

  return sanitizeApplicantCandidate(candidate);
}

function sanitizeTimelineRows(timeline) {
  if (!Array.isArray(timeline)) return [];
  return timeline
    .map((item) => ({
      company: String(item?.company || "").trim(),
      title: String(item?.designation || item?.title || "").trim(),
      start: String(item?.start || "").trim(),
      end: String(item?.end || "").trim(),
      duration: String(item?.duration || "").trim()
    }))
    .filter((item) => item.company || item.title || item.start || item.end || item.duration);
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
  const status = normalizeDashboardText(item?.candidateStatus || item?.candidate_status || item?.status || "");
  const pipeline = normalizeDashboardText(item?.pipelineStage || item?.pipeline_stage || "");
  const combined = `${status} ${pipeline}`.trim();
  if (combined.includes("duplicate")) return "duplicate";
  if (combined.includes("joined")) return "joined";
  if (combined.includes("offer") || status === "offered") return "offered";
  if (combined.includes("shortlist")) return "shortlisted";
  if (DASHBOARD_REJECTED_STATUSES.has(status)) return "rejected";
  if (DASHBOARD_DROPPED_STATUSES.has(status)) return "dropped";
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
    String(candidate.recruiter_name || candidate.recruiterName || "").trim() ||
    String(assessment.recruiterName || assessment.recruiter_name || "").trim() ||
    "Unassigned"
  );
}

function getOwnerRecruiterLabel(candidate = {}, assessment = {}) {
  const assigned = String(candidate.assigned_to_name || candidate.assignedToName || "").trim();
  if (assigned) return assigned;
  return "Unassigned";
}

function buildKnownJdTitleSet(jobs = []) {
  return new Set(
    (Array.isArray(jobs) ? jobs : [])
      .map((job) => String(job?.title || job?.jdTitle || job?.jd_title || "").trim().toLowerCase())
      .filter(Boolean)
  );
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
  const stamp = new Date(text).getTime();
  if (!Number.isFinite(stamp)) return null;
  return new Date(stamp);
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

function getCandidateConvertedAt(candidate = {}, assessment = {}) {
  return String(
    assessment.generatedAt ||
      assessment.generated_at ||
      assessment.created_at ||
      assessment.createdAt ||
      assessment.updatedAt ||
      assessment.updated_at ||
      candidate.updated_at ||
      candidate.updatedAt ||
      candidate.created_at ||
      candidate.createdAt ||
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

function getRelativeMonthRange(monthOffset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 0, 23, 59, 59, 999);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
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
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
  };
}

function getRelativeNamedDayRange(dayOffset = 0) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + dayOffset);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
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
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
  };
}

function getNamedMonthRange(monthName, year = new Date().getFullYear()) {
  const names = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
  const monthIndex = names.indexOf(String(monthName || "").trim().toLowerCase());
  if (monthIndex < 0) return { from: "", to: "" };
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10)
  };
}

function parseFreeformDateText(raw) {
  const text = String(raw || "").trim().replace(/\.$/, "");
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
      assignedApplicants: 0,
      directApplicants: 0
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
  if (!candidate?.used_in_assessment || !linkedAssessment) return changed;
  const convertedAt = getCandidateConvertedAt(candidate, linkedAssessment || {});
  if (!isDateWithinRange(convertedAt, dateRange.from, dateRange.to)) return changed;
  incrementDashboardMetric(target, "converted");
  changed = true;
  const bucket = getAssessmentLifecycleBucket(linkedAssessment || {});
  if (isInterviewAlignedStatus(linkedAssessment?.candidateStatus || linkedAssessment?.candidate_status || linkedAssessment?.status || "")) {
    incrementDashboardMetric(target, "under_interview_process");
  }
  if (bucket === "rejected") incrementDashboardMetric(target, "rejected");
  if (bucket === "duplicate") incrementDashboardMetric(target, "duplicate");
  if (bucket === "dropped") incrementDashboardMetric(target, "dropped");
  if (bucket === "shortlisted") incrementDashboardMetric(target, "shortlisted");
  if (bucket === "offered") incrementDashboardMetric(target, "offered");
  if (bucket === "joined") incrementDashboardMetric(target, "joined");
  return changed;
}

function addRecruiterOwnershipMetrics(target, recruiterLabel, candidate, linkedAssessment, dateRange = {}) {
  if (!target || !recruiterLabel || recruiterLabel === "Unassigned") return;
  const createdAt = getCandidateCreatedAt(candidate);
  if (!isDateWithinRange(createdAt, dateRange.from, dateRange.to)) return;
  const source = String(candidate?.source || "").trim().toLowerCase();
  const isApplicant = source === "website_apply" || source === "hosted_apply";
  const assignedLabel = getOwnerRecruiterLabel(candidate, linkedAssessment || {});
  const sourcedLabel = getRecruiterLabel(candidate, linkedAssessment || {});
  if (isApplicant) {
    if (assignedLabel === recruiterLabel) {
      const wasManuallyAssigned = Boolean(
        String(candidate?.assigned_by_user_id || candidate?.assignedByUserId || "").trim()
        || String(candidate?.assigned_by_name || candidate?.assignedByName || "").trim()
      );
      const key = wasManuallyAssigned ? "assignedApplicants" : "directApplicants";
      target.ownership[key] = Number(target.ownership[key] || 0) + 1;
    }
    return;
  }
  if (assignedLabel === recruiterLabel) {
    target.ownership.assignedSourcing = Number(target.ownership.assignedSourcing || 0) + 1;
  }
  if (sourcedLabel === recruiterLabel) {
    target.ownership.selfSourced = Number(target.ownership.selfSourced || 0) + 1;
  }
}

function toDashboardBreakdownMap(itemsMap) {
  return Array.from(itemsMap.entries())
    .map(([label, metrics]) => ({ label, metrics }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function isInterviewAlignedStatus(status) {
  return /\b(screening call aligned|l1 aligned|l2 aligned|l3 aligned|hr interview aligned|aligned for interview|interview scheduled)\b/i.test(String(status || ""));
}

function buildDashboardSummary({ candidates = [], assessments = [], jobs = [], dateFrom = "", dateTo = "", clientFilter = "", recruiterFilter = "" }) {
  const overall = createDashboardBucket();
  const byClient = new Map();
  const byOwnerRecruiter = new Map();
  const byClientRecruiter = new Map();
  const byClientPosition = new Map();
  const knownJdTitles = buildKnownJdTitleSet(jobs);
  const assessmentsById = new Map(
    (Array.isArray(assessments) ? assessments : []).map((item) => [String(item?.id || "").trim(), item])
  );

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const linkedAssessment = assessmentsById.get(String(candidate?.assessment_id || candidate?.assessmentId || "").trim()) || null;
    const clientLabel = getClientLabel(candidate, linkedAssessment || {});
    if (clientFilter && clientLabel !== clientFilter) continue;
    const ownerRecruiterLabel = getOwnerRecruiterLabel(candidate, linkedAssessment || {});
    if (recruiterFilter && ownerRecruiterLabel !== recruiterFilter) continue;
    const positionLabel = getPositionLabel(candidate, linkedAssessment || {}, knownJdTitles);
    const dateRange = { from: dateFrom, to: dateTo };
    const contributes = addCandidateMetrics(overall, candidate, linkedAssessment, dateRange);
    if (!contributes) continue;
    if (!byClient.has(clientLabel)) byClient.set(clientLabel, createDashboardBucket());
    if (!byOwnerRecruiter.has(ownerRecruiterLabel)) byOwnerRecruiter.set(ownerRecruiterLabel, createDashboardRecruiterBucket());
    addCandidateMetrics(byClient.get(clientLabel), candidate, linkedAssessment, dateRange);
    addCandidateMetrics(byOwnerRecruiter.get(ownerRecruiterLabel).metrics, candidate, linkedAssessment, dateRange);
    addRecruiterOwnershipMetrics(byOwnerRecruiter.get(ownerRecruiterLabel), ownerRecruiterLabel, candidate, linkedAssessment, dateRange);
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
      addCandidateMetrics(byClientRecruiter.get(matrixKey).metrics, candidate, linkedAssessment, dateRange);
      addCandidateMetrics(byClientPosition.get(clientPositionKey).metrics, candidate, linkedAssessment, dateRange);
    }
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
  const pipeline = normalizeDashboardText(item?.pipelineStage || item?.pipeline_stage || "");
  const combined = `${status} ${pipeline}`.trim();
  if (combined.includes("duplicate")) return "duplicates";
  if (DASHBOARD_REJECTED_STATUSES.has(status)) return "rejected";
  if (DASHBOARD_DROPPED_STATUSES.has(status)) return "interview_dropout";
  if (status === "hold" || combined.includes("on hold")) return "put_on_hold";
  if (!status || status === "cv shared" || status === "cv to be shared" || status === "feedback awaited" || pipeline === "submitted") return "to_be_reviewed";
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
      cvResult: meta?.cvAnalysisCache?.result || null,
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
  const upcomingJoiningsIntent = /\bupcoming\s+joining(?:s)?\b/i.test(lower);
  const minExperienceMatch = lower.match(/(\d+(?:\.\d+)?)\s*\+?\s*years?/);
  const maxExperienceMatch = lower.match(/\b(?:under|less than|max)\s+(\d+(?:\.\d+)?)\s*years?/);
  const locationMatch = lower.match(/\b(?:based out of|based in|located in|in)\s+([a-z][a-z\s]+?)(?:\s+\bwith\b|\s+\bunder\b|\s+\bbelow\b|\s+\bfor\b|$)/i);
  const ctcAboveMatch = lower.match(/\b(?:current\s+ctc\s+(?:above|over|more than|min|minimum)|ctc\s+(?:above|over|more than|min|minimum)|package\s+(?:above|over|more than|min|minimum)|more than)\s+(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)?\b/i);
  const ctcUnderMatch = lower.match(/\b(?:current\s+ctc\s+under|ctc\s+under|under|below)\s+(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)?\b/i);
  const expectedCtcAboveMatch = lower.match(/\b(?:expected\s+ctc\s+(?:above|over|more than|min|minimum))\s+(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)?\b/i);
  const expectedCtcUnderMatch = lower.match(/\b(?:expected\s+ctc\s+under)\s+(\d+(?:\.\d+)?)\s*(l|lpa|lakhs?|lac|cr|crore|k)?\b/i);
  const noticeMatch = lower.match(/\b(?:notice\s+period\s+under|notice\s+under|notice period of)\s+(\d+(?:\.\d+)?)\s*(days?|months?)\b/i);
  const skillMatch = lower.match(/\b(?:with skills?|skills?|having)\s+([a-z0-9,+/&\s-]+?)(?:\bwith\b|\bbased\b|\bfor\b|$)/i);
  const currentCompanyMatch = lower.match(/\b(?:from current company|in current company|currently at)\s+([a-z0-9][a-z0-9\s&.-]+?)(?:\bwith\b|\bbased\b|$)/i);
  const locationListMatch =
    lower.match(/\b(?:in|from|based in|based out of|located in)\s+([a-z][a-z\s]+(?:\s+(?:or|and)\s+[a-z][a-z\s]+)+)\b/i) ||
    null;
  const interviewIntent = /\b(?:aligned|interview(?:s)?|scheduled)\b/i.test(lower);
  const recruiterScopeMe = /\b(?:i|me|my)\s+(?:sourced|captured|shared|converted)\b/i.test(lower) || /\bthat i (?:sourced|captured|shared|converted)\b/i.test(lower);
  const sourcedIntent = /\b(?:sourced|captured)\b/i.test(lower);
  const convertedIntent = /\b(?:shared|converted|cv shared|cv to be shared|assessment)\b/i.test(lower);
  const recruiterNameMatch = lower.match(/\bby\s+([a-z][a-z\s.-]+?)(?:\s+for\b|\s+in\b|\s+this\b|\s+last\b|\s+today\b|\s+tomorrow\b|$)/i);
  const targetLabelMatch = lower.match(/\bfor\s+([a-z0-9][a-z0-9\s&.-]+?)(?:\s+across roles|\s+this week|\s+tomorrow|\s+today|\s+last month|\s+this month|\s+from\s|\s+with\s|\s+under\b|$)/i);
  const statusTerms = [];
  const detailedStatusTerms = [];
  if (/\bshortlisted\b/i.test(lower)) statusTerms.push("shortlisted");
  if (/\boffered\b|\boffer\b/i.test(lower)) statusTerms.push("offered");
  if (/\bjoined\b/i.test(lower)) statusTerms.push("joined");
  if (/\breject(?:ed)?\b/i.test(lower)) statusTerms.push("rejected");
  if (/\bduplicate\b/i.test(lower)) statusTerms.push("duplicate");
  if (/\bdropped\b|\bdid not attend\b|\bnot responding\b|\bno response\b|\bno answer\b|\bnr\b/i.test(lower)) statusTerms.push("dropped");
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
  const explicitRangeMatch =
    lower.match(/\bfrom\s+([a-z0-9,/\- ]+?)\s+to\s+([a-z0-9,/\- ]+?)(?:\bwith\b|\bfor\b|$)/i) ||
    lower.match(/\bbetween\s+([a-z0-9,/\- ]+?)\s+and\s+([a-z0-9,/\- ]+?)(?:\bwith\b|\bfor\b|$)/i);
  const monthOnlyMatch = lower.match(/\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  const clientMatch = lower.match(/\b(?:for client|for)\s+([a-z0-9][a-z0-9\s&.-]+)$/i);
  let dateFrom = "";
  let dateTo = "";
  if (/\blast month\b/i.test(lower)) {
    const range = getRelativeMonthRange(-1);
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
  roleText = roleText.replace(/\bcandidates?\b/gi, "").trim();
  roleText = roleText.replace(/\bprofiles?\b/gi, "").trim();
  const locations = locationListMatch
    ? String(locationListMatch[1] || "")
        .split(/\s+(?:or|and)\s+/i)
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
  let derivedLocation = locationMatch ? String(locationMatch[1] || "").trim() : "";
  if (!derivedLocation && !locations.length) {
    const trailingLocationMatch = roleText.match(/\b([a-z][a-z\s]{2,})$/i);
    if (trailingLocationMatch && roleText.split(/\s+/).length >= 2) {
      derivedLocation = String(trailingLocationMatch[1] || "").trim();
      roleText = roleText.slice(0, roleText.length - derivedLocation.length).trim();
    }
  }
  const explicitSkills = skillMatch
    ? String(skillMatch[1] || "")
        .split(/,| and |\/|&/i)
        .map((item) => String(item || "").trim())
        .filter(Boolean)
    : [];
  const derivedSkills = explicitSkills.length ? explicitSkills : splitCandidateSearchKeywords(roleText);

  return {
    raw: query,
    role: roleText,
    roleFamilies: detectRoleFamilies(roleText),
    minExperienceYears: minExperienceMatch ? Number(minExperienceMatch[1]) : null,
    maxExperienceYears: maxExperienceMatch ? Number(maxExperienceMatch[1]) : null,
    location: derivedLocation,
    locations,
    minCurrentCtcLpa: ctcAboveMatch ? parseAmountToLpa(`${ctcAboveMatch[1]} ${ctcAboveMatch[2] || "lpa"}`) : null,
    maxCurrentCtcLpa: ctcUnderMatch ? parseAmountToLpa(`${ctcUnderMatch[1]} ${ctcUnderMatch[2] || "lpa"}`) : null,
    minExpectedCtcLpa: expectedCtcAboveMatch ? parseAmountToLpa(`${expectedCtcAboveMatch[1]} ${expectedCtcAboveMatch[2] || "lpa"}`) : null,
    maxExpectedCtcLpa: expectedCtcUnderMatch ? parseAmountToLpa(`${expectedCtcUnderMatch[1]} ${expectedCtcUnderMatch[2] || "lpa"}`) : null,
    maxNoticeDays: noticeMatch ? parseNoticePeriodToDays(`${noticeMatch[1]} ${noticeMatch[2]}`) : null,
    skills: Array.from(new Set(derivedSkills)),
    currentCompany: currentCompanyMatch ? String(currentCompanyMatch[1] || "").trim() : "",
    statuses: statusTerms,
    detailedStatuses: detailedStatusTerms,
    client: clientMatch ? String(clientMatch[1] || "").trim() : "",
    targetLabel: targetLabelMatch ? String(targetLabelMatch[1] || "").trim() : "",
    interviewScheduled: interviewIntent,
    upcomingJoinings: upcomingJoiningsIntent,
    recruiterScope: recruiterScopeMe ? "me" : "",
    recruiterName: recruiterNameMatch ? String(recruiterNameMatch[1] || "").trim() : "",
    recruiterField: sourcedIntent ? "sourced" : convertedIntent ? "owner" : "",
    sourceTypeFilter: convertedIntent ? "converted" : sourcedIntent ? "captured" : "",
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
      "skills",
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
      role: { type: "string" },
      skills: { type: "array", items: { type: "string" }, maxItems: 12 },
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
      client: { type: "string" },
      recruiterName: { type: "string" },
      recruiterScope: { type: "string", enum: ["", "me"] },
      recruiterField: { type: "string", enum: ["", "sourced", "owner"] },
      sourceTypeFilter: { type: "string", enum: ["", "captured", "converted", "applied", "assessment"] },
      dateFrom: { type: "string" },
      dateTo: { type: "string" },
      dateField: { type: "string", enum: ["", "captured", "shared", "interview", "joined"] },
      currentCompany: { type: "string" }
    }
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
    "6. Extract locations exactly as mentioned.",
    "7. Convert 'under 20 L' like phrases into maxCurrentCtcLpa when no expected CTC is specified.",
    "8. Convert 'more than 20 L' / 'above 20 L' / 'package more than 20 L' into minCurrentCtcLpa when no expected CTC is specified.",
    "9. Convert experience range phrases into minExperienceYears and maxExperienceYears.",
    "10. Convert phrases like 'SaaS Sales' into separate skills/keywords: ['saas','sales'], not one combined phrase.",
    "11. If a query looks like a person name, keep it in role or skills as searchable keywords.",
    "12. Convert notice constraints into maxNoticeDays.",
    "13. If they mention a recruiter name, set recruiterName.",
    "14. If they mean 'profiles sourced by X', recruiterField = sourced.",
    "15. If they mean 'profiles under X' or assigned/owned by X, recruiterField = owner.",
    "16. If they ask for 'my' profiles, recruiterScope = me.",
    "17. Keep arrays empty and strings blank if not specified.",
    `18. Current recruiter is "${String(actor?.name || "").trim()}".`,
    "",
    "Allowed lifecycle statuses:",
    "shortlisted, offered, joined, rejected, duplicate, dropped",
    "Allowed detailed statuses:",
    "screening reject, interview reject, hold, not responding, under process, aligned, not received, not reachable, busy, switch off, disconnected, call later, interested, not interested, revisit for other role",
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

  return {
    raw: String(query || "").trim(),
    role: String(result?.role || "").trim(),
    roleFamilies: detectRoleFamilies(String(result?.role || "").trim()),
    minExperienceYears: typeof result?.minExperienceYears === "number" ? result.minExperienceYears : null,
    maxExperienceYears: typeof result?.maxExperienceYears === "number" ? result.maxExperienceYears : null,
    location: Array.isArray(result?.locations) && result.locations.length ? String(result.locations[0] || "").trim() : "",
    locations: Array.isArray(result?.locations) ? result.locations.map((item) => String(item || "").trim()).filter(Boolean) : [],
    minCurrentCtcLpa: typeof result?.minCurrentCtcLpa === "number" ? result.minCurrentCtcLpa : null,
    maxCurrentCtcLpa: typeof result?.maxCurrentCtcLpa === "number" ? result.maxCurrentCtcLpa : null,
    minExpectedCtcLpa: typeof result?.minExpectedCtcLpa === "number" ? result.minExpectedCtcLpa : null,
    maxExpectedCtcLpa: typeof result?.maxExpectedCtcLpa === "number" ? result.maxExpectedCtcLpa : null,
    maxNoticeDays: typeof result?.maxNoticeDays === "number" ? result.maxNoticeDays : null,
    skills: normalizeCandidateSearchKeywords(result?.skills || []),
    currentCompany: String(result?.currentCompany || "").trim(),
    statuses: Array.isArray(result?.statuses) ? result.statuses.map((item) => normalizeDashboardText(item)).filter(Boolean) : [],
    detailedStatuses: Array.isArray(result?.detailedStatuses) ? result.detailedStatuses.map((item) => String(item || "").trim()).filter(Boolean) : [],
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
        "week", "month", "today", "tomorrow", "last", "next"
      ].includes(part)
    );
}

function splitCandidateSearchKeywords(value = "") {
  return String(value || "")
    .toLowerCase()
    .replace(/[()"]/g, " ")
    .split(/,|\n|\/|&|\+|\band\b|\s+/i)
    .map((part) => part.trim())
    .filter((part) =>
      part &&
      part.length >= 2 &&
      ![
        "get", "me", "show", "all", "profiles", "profile", "candidate", "candidates",
        "with", "for", "in", "from", "the", "and", "or"
      ].includes(part)
    );
}

function normalizeCandidateSearchKeywords(values = []) {
  const list = Array.isArray(values) ? values : [values];
  return Array.from(new Set(list.flatMap(splitCandidateSearchKeywords)));
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
  const matches = String(raw || "").match(/"[^"]+"|\S+/g) || [];
  return matches
    .map((part) => String(part || "").trim().replace(/^"|"$/g, ""))
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

function candidateMatchesBooleanQuery(item, rawQuery = "") {
  const groups = parseBooleanSearchQuery(rawQuery);
  if (!groups.length) return true;
  const hay = buildCandidateSearchHay(item);
  return groups.every((group) =>
    group.some((term) => expandBooleanTerm(term).some((variant) => hay.includes(variant)))
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
  return normalizeDashboardText([
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
}

function buildCandidateSearchUniverse(candidates = [], assessments = [], jobs = []) {
  const assessmentsById = new Map((assessments || []).map((item) => [String(item?.id || "").trim(), item]));
  const universe = [];
  const seenAssessmentIds = new Set();
  const knownJdTitles = buildKnownJdTitleSet(jobs);

  for (const candidate of candidates || []) {
    const candidateMeta = decodeApplicantMetadata(candidate);
    const candidateSource = normalizeDashboardText(candidate?.source || candidateMeta?.sourcePlatform || "");
    const cachedCvResult = candidateMeta?.cvAnalysisCache?.result && typeof candidateMeta.cvAnalysisCache.result === "object"
      ? candidateMeta.cvAnalysisCache.result
      : {};
    const linkedAssessment = assessmentsById.get(String(candidate?.assessment_id || "").trim()) || null;
    if (linkedAssessment?.id) seenAssessmentIds.add(String(linkedAssessment.id));
    universe.push({
      id: String(candidate?.id || linkedAssessment?.id || "").trim(),
      candidateName: String(candidate?.name || linkedAssessment?.candidateName || "").trim(),
      role: String(candidate?.role || linkedAssessment?.currentDesignation || cachedCvResult?.currentDesignation || "").trim(),
      position: getPositionLabel(candidate, linkedAssessment || {}, knownJdTitles),
      company: String(candidate?.company || linkedAssessment?.currentCompany || cachedCvResult?.currentCompany || "").trim(),
      totalExperience: String(candidate?.experience || linkedAssessment?.totalExperience || cachedCvResult?.exactTotalExperience || "").trim(),
      location: String(candidate?.location || linkedAssessment?.location || "").trim(),
      currentCtc: String(candidate?.current_ctc || linkedAssessment?.currentCtc || "").trim(),
      expectedCtc: String(candidate?.expected_ctc || linkedAssessment?.expectedCtc || "").trim(),
      noticePeriod: String(candidate?.notice_period || linkedAssessment?.noticePeriod || "").trim(),
      currentOrgTenure: String(linkedAssessment?.currentOrgTenure || cachedCvResult?.currentOrgTenure || "").trim(),
      highestEducation: String(candidate?.highest_education || linkedAssessment?.highestEducation || cachedCvResult?.highestEducation || "").trim(),
      skills: Array.isArray(candidate?.skills) ? candidate.skills : [],
      inferredTags: Array.isArray(candidateMeta?.inferredSearchTags) ? candidateMeta.inferredSearchTags : [],
      clientName: getClientLabel(candidate, linkedAssessment || {}),
      recruiterName: getRecruiterLabel(candidate, linkedAssessment || {}),
      sourcedRecruiter: getRecruiterLabel(candidate, linkedAssessment || {}),
      ownerRecruiter: getOwnerRecruiterLabel(candidate, linkedAssessment || {}),
      candidateStatus: String(linkedAssessment?.candidateStatus || "").trim(),
      pipelineStage: String(linkedAssessment?.pipelineStage || "").trim(),
      workflowStatus: String(linkedAssessment?.status || candidate?.status || "").trim(),
      attemptStatus: String(candidate?.last_contact_outcome || "").trim(),
      interviewAt: normalizeDateOutput(linkedAssessment?.interviewAt || linkedAssessment?.interview_at || ""),
      followUpAt: normalizeDateOutput(linkedAssessment?.followUpAt || linkedAssessment?.follow_up_at || candidate?.next_follow_up_at || ""),
      offerDoj: normalizeDateOutput(linkedAssessment?.offerDoj || linkedAssessment?.offer_doj || ""),
      createdAt: normalizeDateOutput(getCandidateCreatedAt(candidate)),
      sharedAt: normalizeDateOutput(getCandidateConvertedAt(candidate, linkedAssessment || {})),
      sourceType: candidate?.used_in_assessment
        ? "captured_and_converted"
        : (candidateSource === "website_apply" || candidateSource === "hosted_apply" || candidateSource === "google_sheet"
          ? "applied"
          : "captured_note"),
      hiddenCvText: JSON.stringify(cachedCvResult || {}),
      notesText: [
        candidate?.notes || "",
        candidate?.recruiter_context_notes || "",
        candidate?.other_pointers || "",
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
    universe.push({
      id: assessmentId,
      candidateName: String(assessment?.candidateName || "").trim(),
      role: String(assessment?.currentDesignation || "").trim(),
      position: getPositionLabel({}, assessment, knownJdTitles),
      company: String(assessment?.currentCompany || "").trim(),
      totalExperience: String(assessment?.totalExperience || "").trim(),
      location: String(assessment?.location || "").trim(),
      currentCtc: String(assessment?.currentCtc || "").trim(),
      expectedCtc: String(assessment?.expectedCtc || "").trim(),
      noticePeriod: String(assessment?.noticePeriod || "").trim(),
      currentOrgTenure: String(assessment?.currentOrgTenure || "").trim(),
      highestEducation: String(assessment?.highestEducation || "").trim(),
      skills: [],
      inferredTags: [],
      clientName: getClientLabel({}, assessment),
      recruiterName: getRecruiterLabel({}, assessment),
      sourcedRecruiter: getRecruiterLabel({}, assessment),
      ownerRecruiter: getOwnerRecruiterLabel({}, assessment),
      candidateStatus: String(assessment?.candidateStatus || "").trim(),
      pipelineStage: String(assessment?.pipelineStage || "").trim(),
      workflowStatus: String(assessment?.status || "").trim(),
      attemptStatus: "",
      interviewAt: normalizeDateOutput(assessment?.interviewAt || assessment?.interview_at || ""),
      followUpAt: normalizeDateOutput(assessment?.followUpAt || assessment?.follow_up_at || ""),
      offerDoj: normalizeDateOutput(assessment?.offerDoj || assessment?.offer_doj || ""),
      createdAt: "",
      sharedAt: normalizeDateOutput(getCandidateConvertedAt({}, assessment)),
      sourceType: "assessment_only",
      hiddenCvText: "",
      notesText: [
        assessment?.recruiterNotes || "",
        assessment?.otherPointers || "",
        assessment?.callbackNotes || ""
      ].filter(Boolean).join("\n"),
      raw: {
        candidate: null,
        assessment
      }
    });
  }

  return universe;
}

function candidateMatchesNaturalFilter(item, filters, actor = null) {
  if (!item) return false;
  if (filters.role) {
    const roleHay = buildCandidateSearchHay(item);
    const roleTokens = splitCandidateSearchKeywords(filters.role);
    if (roleTokens.length) {
      const allRoleTokensMatched = roleTokens.every((token) => roleHay.includes(normalizeDashboardText(token)));
      if (!allRoleTokensMatched) return false;
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
    if (!String(item.clientName || "").toLowerCase().includes(filters.client.toLowerCase())) return false;
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
    if (requiredSkills.length && !requiredSkills.every((skill) => hay.includes(skill))) return false;
  }
  if (Array.isArray(filters.statuses) && filters.statuses.length) {
    const lifecycleBucket = getAssessmentLifecycleBucket(item);
    if (!filters.statuses.includes(lifecycleBucket)) return false;
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
  const isApplicantSource = rawSource === "website_apply" || rawSource === "hosted_apply" || rawSource === "google_sheet";
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

function normalizePhone(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const compact = raw.replace(/[^\d+]/g, "");
  const digits = compact.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return "";
  if (compact.startsWith("+")) return `+${digits}`;
  return digits;
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

function parseMonthYear(text, allowPresent = false) {
  const value = String(text || "").trim();
  if (!value) return null;
  if (allowPresent && /^(present|current|till date|to date)$/i.test(value)) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }

  const monthNameMatch = value.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,'/-]*((\d{4})|(\d{2}))/i);
  if (monthNameMatch) {
    const month = MONTH_INDEX[String(monthNameMatch[1] || "").toLowerCase()];
    const year = monthNameMatch[4] ? 2000 + Number(monthNameMatch[4]) : Number(monthNameMatch[3] || monthNameMatch[2]);
    if (Number.isInteger(month) && Number.isInteger(year)) {
      return { year, month };
    }
  }

  const monthNumericMatch = value.match(/\b(\d{1,2})[/-](\d{4})\b/);
  if (monthNumericMatch) {
    const month = Number(monthNumericMatch[1]) - 1;
    const year = Number(monthNumericMatch[2]);
    if (month >= 0 && month <= 11 && Number.isInteger(year)) {
      return { year, month };
    }
  }

  const isoLikeMatch = value.match(/\b(\d{4})[/-](\d{1,2})\b/);
  if (isoLikeMatch) {
    const year = Number(isoLikeMatch[1]);
    const month = Number(isoLikeMatch[2]) - 1;
    if (month >= 0 && month <= 11 && Number.isInteger(year)) {
      return { year, month };
    }
  }

  const yearOnlyMatch = value.match(/\b(19\d{2}|20\d{2})\b/);
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
  let fallbackDurationMonths = 0;
  for (const item of timeline || []) {
    const start = monthIndex(parseMonthYear(item?.start));
    const end = monthIndex(parseMonthYear(item?.end, true));
    if (start === null || end === null || end < start) {
      fallbackDurationMonths += parseDurationMonths(item?.duration);
      continue;
    }
    ranges.push([start, end]);
  }

  if (!ranges.length) return fallbackDurationMonths;

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
  return Math.max(mergedMonths, fallbackDurationMonths);
}

function calculateTotalExperienceFromTimeline(timeline) {
  const totalMonths = calculateTotalExperienceMonths(timeline);
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
  const orderedTimeline = sortTimelineByRecency(timeline);
  const currentRow =
    orderedTimeline.find((item) => /^(present|current|till date|to date)$/i.test(String(item?.end || "").trim())) ||
    (currentCompany
      ? orderedTimeline.find((item) => String(item?.company || "").trim().toLowerCase() === String(currentCompany).trim().toLowerCase())
      : null);
  const latestRow = currentRow || (orderedTimeline.length ? orderedTimeline[0] : null);
  if (!latestRow) return "";
  const months = getRowMonths(latestRow);
  if (!months) return "";
  const base = formatTotalExperience(months);
  const endText = String(latestRow.end || "").trim();
  if (/^(present|current|till date|to date)$/i.test(endText)) {
    return base;
  }
  const endValue = parseMonthYear(endText);
  const leftLabel = formatMonthYearLabel(endValue);
  return leftLabel ? `${base}, left in ${leftLabel}` : base;
}

function getCurrentRoleFromTimeline(timeline) {
  const orderedTimeline = sortTimelineByRecency(timeline);
  return (
    orderedTimeline.find((item) => /^(present|current|till date|to date)$/i.test(String(item?.end || "").trim())) ||
    (orderedTimeline.length ? orderedTimeline[0] : null)
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
      message: emailId ? "Email looked unreliable, so it was cleared for review." : "Email was not confidently found in this CV."
    });
  }

  if (!normalizePhone(phoneNumber)) {
    reasons.push({
      field: "phoneNumber",
      level: phoneNumber ? "warning" : "info",
      code: "phone_needs_review",
      message: phoneNumber ? "Phone number looked unreliable, so it was cleared for review." : "Phone number was not confidently found in this CV."
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
    (value) => Boolean(String(value || "").trim()) && !/[|,]/.test(String(value || "").trim())
  );
  const currentDesignation = choosePreferredScalar(
    currentRole?.title,
    normalizedResult?.currentDesignation,
    baseResult?.currentDesignation
  );
  const metricTimeline = sourceType === "cv" ? getCvMetricTimeline(finalTimeline, fallbackTimeline) : finalTimeline;
  const computedTotalExperience = calculateTotalExperienceFromTimeline(metricTimeline);
  const averageTenurePerCompany = calculateAverageTenurePerCompany(metricTimeline);
  const computedCurrentOrgTenure = calculateCurrentOrgTenure(metricTimeline, currentCompany);
  const aiTotalExperience = String(normalizedResult?.totalExperience || "").trim();
  const aiCurrentOrgTenure = String(normalizedResult?.currentOrgTenure || "").trim();
  const candidateTotalExperience =
    sourceType === "cv"
      ? choosePreferredScalar(computedTotalExperience, aiTotalExperience)
      : choosePreferredScalar(computedTotalExperience, aiTotalExperience);
  const candidateCurrentOrgTenure =
    sourceType === "cv"
      ? (String(computedCurrentOrgTenure || "").trim() || choosePreferredScalar("", aiCurrentOrgTenure))
      : choosePreferredScalar(computedCurrentOrgTenure, aiCurrentOrgTenure);
  const emailId = choosePreferredScalar(normalizedResult?.emailId, baseResult?.emailId, isValidEmail);
  const phoneNumber = choosePreferredScalar(
    normalizedResult?.phoneNumber,
    baseResult?.phoneNumber,
    (value) => Boolean(normalizePhone(value))
  );
  const linkedinUrl = choosePreferredScalar(
    normalizedResult?.linkedinUrl,
    baseResult?.linkedinUrl,
    (value) => /linkedin\.com\/in\//i.test(String(value || ""))
  );
  const highestEducation = choosePreferredScalar(normalizedResult?.highestEducation, baseResult?.highestEducation);
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
        : "fallback"
  };
  const validation = validateParseResult({
    finalTimeline,
    fallbackTimeline,
    currentCompany,
    totalExperience: candidateTotalExperience,
    averageTenurePerCompany,
    currentOrgTenure: candidateCurrentOrgTenure,
    emailId,
    phoneNumber,
    parseDebug
  });
  const finalTotalExperience = validation.reasons.some((item) => item.field === "metrics")
    ? ""
    : candidateTotalExperience;
  const finalAverageTenure = validation.reasons.some(
    (item) => item.field === "averageTenurePerCompany" || item.field === "metrics" || item.field === "timeline"
  )
    ? ""
    : averageTenurePerCompany;
  const finalCurrentOrgTenure = validation.reasons.some(
    (item) => item.field === "currentOrgTenure" || item.field === "metrics"
  )
    ? ""
    : candidateCurrentOrgTenure;

    return {
      candidateName: String(
        normalizedResult?.candidateName || baseResult?.candidateName || ""
      ).trim(),
    totalExperience: String(
      finalTotalExperience || normalizedResult?.totalExperience || baseResult?.totalExperience || ""
    ).trim(),
    currentCompany,
      currentDesignation,
      emailId,
      phoneNumber: normalizePhone(phoneNumber),
      linkedinUrl,
      highestEducation,
      sourceType: String(baseResult?.sourceType || "").trim(),
    filename: String(baseResult?.filename || "").trim(),
    timeline: sourceType === "cv" ? cvCareerTimeline : finalTimeline,
    gaps: normalizedGaps.length ? normalizedGaps : fallbackGaps,
    averageTenurePerCompany: finalAverageTenure,
    currentOrgTenure: finalCurrentOrgTenure,
    shortStints: Array.isArray(baseResult?.shortStints) ? baseResult.shortStints : [],
    highlights: Array.isArray(baseResult?.highlights) ? baseResult.highlights : [],
    parseDebug,
    validation
  };
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

  if (req.method === "GET" && (requestUrl.pathname === "/" || requestUrl.pathname === "")) {
    serveStaticFile(res, path.join(ROOT_PUBLIC_DIR, "index.html"));
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

  if (req.method === "GET" && (requestUrl.pathname === "/apply" || requestUrl.pathname === "/apply/")) {
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
        const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
        const cvToken = createSignedCvShareToken({
          type: "shared_cv",
          companyId,
          candidateId: String(candidate?.id || candidateId || "").trim(),
          candidateName: String(candidate?.name || "").trim(),
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

  if (req.method === "GET" && (requestUrl.pathname === "/jobs" || requestUrl.pathname === "/jobs/" || requestUrl.pathname.startsWith("/jobs/"))) {
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
      sendJson(res, 200, {
        ok: true,
        result: {
          id: job.id,
          companyId: job.companyId,
          title: job.title || "",
          clientName: job.clientName || "",
          aboutCompany: job.aboutCompany || "",
          location: job.location || "",
          workMode: job.workMode || "",
          jobDescription: job.jobDescription || "",
          mustHaveSkills: job.mustHaveSkills || "",
          redFlags: job.redFlags || ""
        }
      });
    } catch (error) {
      sendJson(res, 404, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/public/")) {
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
    try {
      const body = await readJsonBody(req);
      const result = await login({
        email: String(body.email || "").trim(),
        password: String(body.password || "")
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/auth/trial-signup") {
    try {
      const body = await readJsonBody(req);
      await createTrialCompanyWithAdmin({
        companyName: String(body.companyName || "").trim(),
        adminName: String(body.adminName || "").trim(),
        email: String(body.email || "").trim(),
        password: String(body.password || "")
      });
      const result = await login({
        email: String(body.email || "").trim(),
        password: String(body.password || "")
      });
      const license = await getCompanyLicense(result.user.companyId);
      sendJson(res, 200, { ok: true, result: { ...result, license } });
    } catch (error) {
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

  if (req.method === "GET" && req.url === "/auth/me") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      sendJson(res, 200, { ok: true, result: { user } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/license/me") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const license = await getCompanyLicense(user.companyId);
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

  if (req.method === "GET" && req.url === "/company/jds") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const jobs = await listCompanyJobs(user.companyId);
      sendJson(res, 200, { ok: true, result: { jobs } });
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
        settings: body.settings || body
      });
      sendJson(res, 200, { ok: true, result: settings });
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

  if (req.method === "POST" && req.url === "/company/candidates/backfill-assessment-links") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const result = await backfillCandidateAssessmentLinks(user);
      sendJson(res, 200, { ok: true, result });
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
        listCompanyJobs(user.companyId)
      ]);
      const summary = buildDashboardSummary({ candidates, assessments, jobs, dateFrom, dateTo, clientFilter, recruiterFilter });
      const availableClients = Array.from(
        new Set((Array.isArray(candidates) ? candidates : []).map((candidate) => getClientLabel(candidate, {})).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));
      const availableRecruiters = Array.from(
        new Set((Array.isArray(candidates) ? candidates : []).map((candidate) => getOwnerRecruiterLabel(candidate, {})).filter(Boolean))
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
      const dateFrom = String(requestUrl.searchParams.get("dateFrom") || "").trim();
      const dateTo = String(requestUrl.searchParams.get("dateTo") || "").trim();
      const clientFilter = String(requestUrl.searchParams.get("clientLabel") || "").trim();
      const [candidates, assessments, jobs] = await Promise.all([
        listCandidatesForUser(user, { limit: 5000 }),
        listAssessments({ actorUserId: user.id, companyId: user.companyId }),
        listCompanyJobs(user.companyId)
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

  if (req.method === "GET" && requestUrl.pathname === "/company/applicants") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const q = String(requestUrl.searchParams.get("q") || "").trim();
      const items = await listApplicantsForUser(user, { q, limit: 500 });
      sendJson(res, 200, { ok: true, result: { total: items.length, items } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/applicant-intake-secret") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
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
      if (String(actor.role || "").toLowerCase() !== "admin") {
        throw new Error("Only an admin can generate recruiter-specific apply links.");
      }
      const jobId = String(requestUrl.pathname.replace(/^\/company\/jobs\//, "").replace(/\/apply-link-signatures$/, "")).trim();
      if (!jobId) throw new Error("Missing job id.");
      const jobs = await listCompanyJobs(actor.companyId);
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
      sendJson(res, 200, { ok: true, result: { jobId, items } });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && /^\/company\/candidates\/[^/]+\/cv$/.test(requestUrl.pathname)) {
    try {
      const actor = await requireSessionUser(getBearerTokenFromRequest(req, requestUrl));
      const candidateId = String(requestUrl.pathname.replace(/^\/company\/candidates\//, "").replace(/\/cv$/, "")).trim();
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
      const downloadName = String(file.filename || "resume.pdf").replace(/"/g, "");
      sendBuffer(req, res, 200, file.buffer, {
        "Content-Type": String(file.mimeType || "application/octet-stream").trim(),
        "Content-Disposition": `inline; filename="${downloadName}"`
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
      const file = await loadStoredFile({
        provider: payload.fileProvider,
        key: payload.fileKey,
        url: payload.fileUrl,
        filename: payload.filename,
        mimeType: payload.mimeType
      });
      const downloadName = String(file.filename || payload.filename || "resume.pdf").replace(/"/g, "");
      sendBuffer(req, res, 200, file.buffer, {
        "Content-Type": String(file.mimeType || payload.mimeType || "application/octet-stream").trim(),
        "Content-Disposition": `inline; filename="${downloadName}"`,
        "Cache-Control": "private, max-age=300"
      });
    } catch (error) {
      sendJson(req, res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/applicant-intake-secret") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
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
        assigned_jd_title: body.assigned_jd_title || body.assignedJdTitle
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
      const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 45;
      const token = createSignedCvShareToken({
        type: "shared_cv",
        companyId: actor.companyId,
        candidateId: String(candidate?.id || candidateId || "").trim(),
        candidateName: String(candidate?.name || requestUrl.searchParams.get("candidate_name") || "").trim(),
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
          url: `${baseUrl}/shared/cv?token=${encodeURIComponent(token)}`
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
      const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 45;
      const token = createSignedCvShareToken({
        type: "shared_cv",
        companyId: actor.companyId,
        candidateId: String(matchedCandidate?.id || candidateId || "").trim(),
        candidateName: String(matchedCandidate?.name || candidateName || "").trim(),
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
          url: `${baseUrl}/shared/cv?token=${encodeURIComponent(token)}`
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
      const query = String(requestUrl.searchParams.get("q") || "").trim();
      const queryMode = String(requestUrl.searchParams.get("mode") || "natural").trim().toLowerCase();
      const debug = String(requestUrl.searchParams.get("debug") || "").trim() === "1";
      const semanticEnabled = String(requestUrl.searchParams.get("semantic") || "").trim() !== "0";
      const normalized = normalizeRecruiterQuery(query, DEFAULT_SYNONYMS);
      let filters = parseNaturalLanguageCandidateQuery(normalized.normalized || query);
      filters.raw = query;
      if (query && queryMode === "ai") {
        const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
        if (apiKey) {
          try {
            filters = await interpretCandidateSearchQueryWithAi({ apiKey, query: normalized.normalized || query, actor: user });
            filters.raw = query;
          } catch (error) {
            console.warn("AI query interpretation failed, falling back to heuristic parser:", error?.message || error);
          }
        }
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
        listCompanyJobs(user.companyId)
      ]);
      const universe = buildCandidateSearchUniverse(candidates, assessments, jobs);

      const scopedUniverse = universe.filter((item) => !recruiterFilter || String(item.ownerRecruiter || "").trim() === recruiterFilter);
      const apiKey = semanticEnabled ? String(process.env.OPENAI_API_KEY || "").trim() : "";
      const hybrid = await hybridSearchCandidates({
        universe: scopedUniverse,
        actor: user,
        rawQuery: query,
        normalizedQuery: normalized.normalized,
        filters,
        queryMode,
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
          semantic: semanticEnabled,
          semanticTopK: 80,
          parseExperienceToYears,
          isPlainLookup: isPlainCandidateLookupQuery,
          buildNaturalSearchFallbackTokens,
          normalizeDashboardText
        }
      });
      const matches = hybrid.items || [];
      sendJson(res, 200, {
        ok: true,
        result: {
          query,
          queryMode,
          normalizedQuery: normalized.normalized,
          filters: hybrid.filters || filters,
          ...(debug && hybrid.debug ? { debug: hybrid.debug } : {}),
          total: matches.length,
          items: matches
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
        listCompanyJobs(user.companyId)
      ]);
      const universe = buildCandidateSearchUniverse(candidates, assessments, jobs);
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
        listCompanyJobs(user.companyId)
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
      sendJson(res, 200, { ok: true, result: saved });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/company/candidates/search-jd-match") {
    try {
      const user = await requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const [candidates, assessments, jobs] = await Promise.all([
        listCandidatesForUser(user, { limit: 5000 }),
        listAssessments({ actorUserId: user.id, companyId: user.companyId }),
        listCompanyJobs(user.companyId)
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
        listCompanyJobs(user.companyId),
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
      const assessment = await saveAssessment({
        actorUserId: actor.id,
        companyId: actor.companyId,
        assessment: incomingAssessment
      });
      const linkedCandidateId = String(incomingAssessment.candidateId || incomingAssessment.candidate_id || "").trim();
      if (linkedCandidateId && assessment?.id) {
        await linkCandidateToAssessment(linkedCandidateId, assessment.id, { companyId: actor.companyId }).catch(() => null);
      }
      sendJson(res, 200, { ok: true, result: assessment });
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
      const result = await deleteAssessment({
        actorUserId: actor.id,
        companyId: actor.companyId,
        assessmentId
      });
      await unlinkAssessmentFromCompanyCandidates(actor.companyId, assessmentId);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/candidates") {
    try {
      const sessionUser = await requireSessionUser(getBearerToken(req));
      const listOptions = {
        limit: Number(requestUrl.searchParams.get("limit") || 100),
        q: String(requestUrl.searchParams.get("q") || "").trim(),
        id: String(requestUrl.searchParams.get("id") || "").trim(),
        scope: String(requestUrl.searchParams.get("scope") || "").trim()
      };
      const result = await listCandidatesForUser(sessionUser, listOptions);
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
      const patch = {
        name: String(input.name || input.candidateName || "").trim() || undefined,
        notes: String(input.notes || "").trim() || undefined,
        recruiter_context_notes: String(input.recruiter_context_notes || input.recruiterContextNotes || "").trim() || undefined,
        other_pointers: String(input.other_pointers || input.otherPointers || "").trim() || undefined,
        company: String(input.company || input.currentCompany || "").trim() || undefined,
        role: String(input.role || input.currentDesignation || "").trim() || undefined,
        experience: String(input.experience || input.totalExperience || "").trim() || undefined,
        location: String(input.location || "").trim() || undefined,
        current_ctc: String(input.current_ctc || input.currentCtc || "").trim() || undefined,
        expected_ctc: String(input.expected_ctc || input.expectedCtc || "").trim() || undefined,
        notice_period: String(input.notice_period || input.noticePeriod || "").trim() || undefined,
        lwd_or_doj: String(input.lwd_or_doj || input.lwdOrDoj || "").trim() || undefined,
        phone: String(input.phone || input.phoneNumber || "").trim() || undefined,
        email: String(input.email || input.emailId || "").trim() || undefined,
        linkedin: String(input.linkedin || input.linkedinUrl || "").trim() || undefined,
        highest_education: String(input.highest_education || input.highestEducation || "").trim() || undefined,
        last_contact_outcome: String(input.last_contact_outcome || input.lastContactOutcome || "").trim() || undefined,
        last_contact_notes: String(input.last_contact_notes || input.lastContactNotes || "").trim() || undefined,
        last_contact_at: String(input.last_contact_at || input.lastContactAt || "").trim() || undefined,
        next_follow_up_at: Object.prototype.hasOwnProperty.call(input, "next_follow_up_at")
          ? normalizeNullableTimestampInput(input.next_follow_up_at)
          : Object.prototype.hasOwnProperty.call(input, "nextFollowUpAt")
            ? normalizeNullableTimestampInput(input.nextFollowUpAt)
            : undefined,
        hidden_from_captured: input.hidden_from_captured === true ? true : input.hidden_from_captured === false ? false : undefined,
        screening_answers: screeningAnswers,
        draft_payload: draftPayload,
        jd_title: String(input.jd_title || input.jdTitle || "").trim() || undefined,
        client_name: String(input.client_name || input.clientName || "").trim() || undefined,
        assigned_to_user_id: String(input.assigned_to_user_id || input.assignedToUserId || "").trim() || undefined,
        assigned_to_name: String(input.assigned_to_name || input.assignedToName || "").trim() || undefined,
        assigned_jd_title: String(input.assigned_jd_title || input.assignedJdTitle || "").trim() || undefined,
        raw_note: String(input.raw_note || input.rawNote || "").trim() || undefined
      };
      Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);
      const existing = (await listCandidatesForUser(actor, { id: candidateId, limit: 1 }))[0] || null;
      if (existing) {
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
        patch.raw_note = encodeApplicantMetadata({
          ...(existingMeta || {}),
          ...(incomingMeta || {}),
          inferredSearchTags
        });
      }
      const result = await patchCandidate(candidateId, patch, { companyId: actor.companyId });
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
        assigned_jd_title: body.assigned_jd_title || body.assignedJdTitle
      }, { companyId: actor.companyId });
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

      if (
        fileFingerprint &&
        cachedCvAnalysis &&
        String(cachedCvAnalysis.fingerprint || "").trim() === fileFingerprint &&
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
          storedAt: new Date().toISOString(),
          storedFile: storedFilePayload,
          parsePending: true,
          updatedAt: new Date().toISOString()
        }
      };
      await patchCandidate(candidate.id, {
        raw_note: encodeApplicantMetadata(immediateMeta)
      }, { companyId: actor.companyId });

      if (deferParse) {
        // Fast response, parse continues in the background.
        sendJson(res, 200, { ok: true, result: { queued: true, cached: false, storedFile: storedFilePayload } });

        setImmediate(async () => {
          try {
            const parsed = await parseCandidatePayload({
              sourceType: "cv",
              candidateName: body.candidateName || candidate.name || "",
              totalExperience: body.totalExperience || candidate.experience || "",
              file: uploadedFile
            });

            const apiKey = body.apiKey || process.env.OPENAI_API_KEY || "";
            let normalized = null;
            let aiParseMode = "fallback_only";
            let aiParseReason = "AI normalization was not used.";

            if (apiKey && body.normalizeWithAi !== false) {
              const fallbackFields = {
                candidateName: parsed.candidateName,
                totalExperience: parsed.totalExperience,
                currentCompany: parsed.currentCompany,
                currentDesignation: parsed.currentDesignation,
                emailId: parsed.emailId,
                phoneNumber: parsed.phoneNumber,
                timeline: parsed.timeline,
                gaps: parsed.gaps
              };
              const canUseFileAi = uploadedFile?.fileData && supportsOpenAiFileParse(uploadedFile);
              if (canUseFileAi) {
                aiParseMode = "deep_file_ai";
                aiParseReason = "Direct file-based AI parsing was used for interview-panel CV upload (background).";
                normalized = await normalizeCandidateFileWithAi({
                  apiKey,
                  model: String(body.model || "").trim(),
                  uploadedFile,
                  sourceType: parsed.sourceType,
                  filename: parsed.filename,
                  fallbackFields
                });
              }
            }

            const result = buildCandidateParseResponse(parsed, normalized, { aiParseMode, aiParseReason });
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

            await patchCandidate(candidate.id, {
              raw_note: encodeApplicantMetadata(nextMeta)
            }, { companyId: actor.companyId });
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

      const parsed = await parseCandidatePayload({
        sourceType: "cv",
        candidateName: body.candidateName || candidate.name || "",
        totalExperience: body.totalExperience || candidate.experience || "",
        file: uploadedFile
      });

      const apiKey = body.apiKey || process.env.OPENAI_API_KEY || "";
      let normalized = null;
      let aiParseMode = "fallback_only";
      let aiParseReason = "AI normalization was not used.";

      if (apiKey && body.normalizeWithAi !== false) {
        const fallbackFields = {
          candidateName: parsed.candidateName,
          totalExperience: parsed.totalExperience,
          currentCompany: parsed.currentCompany,
          currentDesignation: parsed.currentDesignation,
          emailId: parsed.emailId,
          phoneNumber: parsed.phoneNumber,
          timeline: parsed.timeline,
          gaps: parsed.gaps
        };

        const canUseFileAi = uploadedFile?.fileData && supportsOpenAiFileParse(uploadedFile);
        if (canUseFileAi) {
          aiParseMode = "deep_file_ai";
          aiParseReason = "Direct file-based AI parsing was used for interview-panel CV upload.";
          normalized = await normalizeCandidateFileWithAi({
            apiKey,
            model: String(body.model || "").trim(),
            uploadedFile,
            sourceType: parsed.sourceType,
            filename: parsed.filename,
            fallbackFields
          });
        }
      }

      const result = buildCandidateParseResponse(parsed, normalized, {
        aiParseMode,
        aiParseReason
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
          storedAt: new Date().toISOString(),
          storedFile: storedFilePayload,
          result,
          parsePending: false,
          updatedAt: new Date().toISOString()
        },
        inferredSearchTags: deriveInferredSearchTags({
          cvResult: result,
          recruiterNotes: candidate?.recruiter_context_notes || "",
          otherPointers: candidate?.other_pointers || "",
          tags: Array.isArray(candidate?.skills) ? candidate.skills : []
        })
      };

      await patchCandidate(candidate.id, {
        raw_note: encodeApplicantMetadata(nextMeta)
      }, { companyId: actor.companyId });

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

      const parsed = await parseCandidateQuickNote({
        apiKey: process.env.OPENAI_API_KEY || "",
        model: String(process.env.QUICK_CAPTURE_MODEL || "").trim() || "gpt-4.1-mini",
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
      const parsed = await parseCandidatePayload(body);
      const apiKey = body.apiKey || process.env.OPENAI_API_KEY || "";
      let normalized = null;
      let aiParseMode = "fallback_only";
      let aiParseReason = "AI normalization was not used.";

      if (apiKey && body.normalizeWithAi !== false) {
        const fallbackFields = {
          candidateName: parsed.candidateName,
          totalExperience: parsed.totalExperience,
          currentCompany: parsed.currentCompany,
          currentDesignation: parsed.currentDesignation,
          emailId: parsed.emailId,
          phoneNumber: parsed.phoneNumber,
          timeline: parsed.timeline,
          gaps: parsed.gaps
        };

        const canUseFileAi =
          parsed.sourceType === "cv" &&
          body.file?.fileData &&
          supportsOpenAiFileParse(body.file);

        const shouldUsePrimaryFileAiForCv = canUseFileAi && !parsed.rawText;

        if (parsed.rawText) {
          aiParseMode = "fast_text_ai";
          aiParseReason = "Fast text-based AI normalization was used first.";
          normalized = await normalizeCandidateWithAi({
            apiKey,
            model: String(body.model || "").trim(),
            rawText: parsed.rawText,
            sourceType: parsed.sourceType,
            filename: parsed.filename,
            fallbackFields
          });
        } else if (shouldUsePrimaryFileAiForCv) {
          aiParseMode = "deep_file_ai_primary";
          aiParseReason = "Direct file-based AI parsing was used because no usable raw CV text was available.";
          normalized = await normalizeCandidateFileWithAi({
            apiKey,
            model: String(body.model || "").trim(),
            uploadedFile: body.file,
            sourceType: parsed.sourceType,
            filename: parsed.filename,
            fallbackFields
          });
        }

        const normalizedTimelineCount = Array.isArray(normalized?.timeline) ? normalized.timeline.length : 0;
        const fallbackTimelineCount = Array.isArray(parsed.timeline) ? parsed.timeline.length : 0;
        const shouldUseFileAiForCv =
          !shouldUsePrimaryFileAiForCv &&
          parsed.sourceType === "cv" &&
          body.file?.fileData &&
          canUseFileAi &&
          (
            !normalized ||
            normalizedTimelineCount < 2 ||
            !String(normalized?.currentCompany || "").trim() ||
            !String(normalized?.currentDesignation || "").trim() ||
            (fallbackTimelineCount >= 4 && normalizedTimelineCount + 1 < fallbackTimelineCount)
          );

        if (shouldUseFileAiForCv) {
          aiParseMode = "deep_file_ai";
          aiParseReason = "Deep file-based AI fallback was used because the fast parse looked incomplete or missed visible experience rows.";
          normalized = await normalizeCandidateFileWithAi({
            apiKey,
            model: String(body.model || "").trim(),
            uploadedFile: body.file,
            sourceType: parsed.sourceType,
            filename: parsed.filename,
            fallbackFields
          });
        }
      }

      const result = buildCandidateParseResponse(parsed, normalized, {
        aiParseMode,
        aiParseReason
      });
      sendJson(res, 200, { ok: true, result });
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
