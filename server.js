const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseCandidatePayload } = require("./src/parser");
const { callOpenAiJsonSchema, callOpenAiQuestions, normalizeCandidateFileWithAi, normalizeCandidateWithAi, extractLinkedInAssistFromScreenshotWithAi } = require("./src/ai");
const { storeUploadedFile, loadStoredFile } = require("./src/storage");
const {
  assignCandidate,
  deleteCandidate,
  exportCompanyQuickCaptureData,
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
  getPublicCompanyJob,
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
  resetClientUserPassword,
  resetEmployeeUserPassword,
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
  saveCompanySharedExportPresets,
  setCompanyExtensionPlan,
  setCompanyApplicantIntakeSecret
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildJobShareEmail({ job, introText = "", senderName = "", signatureText = "", signatureLinks = [] }) {
  const title = String(job?.title || "").trim();
  const client = String(job?.clientName || "").trim();
  const location = String(job?.location || "").trim();
  const workMode = String(job?.workMode || "").trim();
  const aboutCompany = String(job?.aboutCompany || "").trim();
  const mustHave = String(job?.mustHaveSkills || "").trim();
  const jd = String(job?.jobDescription || "").trim();
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
  const jd = String(job?.jobDescription || "").trim();
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
  if (!nodemailer) throw new Error("Email sending is not available.");
  const cfg = await getUserSmtpSettings({ companyId: actor.companyId, userId: actor.id });
  if (!cfg || !cfg.host || !cfg.user || !cfg.pass || !cfg.from) {
    throw new Error("Email settings not configured. Go to Settings â†’ Email settings.");
  }
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port || 587),
    secure: Boolean(cfg.secure),
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    dnsTimeout: 10000
  });
  return { transport, cfg };
}

async function sendJdEmailAsActor(actor, { to, cc = "", subject, html, text, attachments = [] }) {
  const { transport, cfg } = await createActorSmtpTransport(actor);
  const ccValue = String(cc || "").trim();
  await transport.sendMail({
    from: String(cfg.from || "").trim(),
    to,
    ...(ccValue ? { cc: ccValue } : {}),
    subject,
    text,
    html,
    attachments: Array.isArray(attachments) ? attachments : []
  });
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
  "ext_499_1_user",
  "ext_999_3_users",
  "ext_1999_7_users",
  "saas_4999_unlimited"
]);

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
    Object.keys(safeCv).length ? JSON.stringify(safeCv) : ""
  ].filter(Boolean);

  // Keep a hard cap to avoid raw_note metadata blowups.
  const joined = chunks.join(" \n ");
  const capped = joined.length > 24000 ? joined.slice(0, 24000) : joined;
  return normalizeCandidateSearchDocText(capped);
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
      if (candidate?.used_in_assessment) return false;
      return source === "website_apply" || source === "hosted_apply";
    })
    .map(sanitizeApplicantCandidate);
}

function getSupabaseServiceConfig() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { on: Boolean(url && key), url, key };
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
      recruiter_context_notes: payload.screeningAnswers || existing.recruiter_context_notes || null,
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
    return sanitizeApplicantCandidate(updated);
  }

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
      recruiter_context_notes: payload.screeningAnswers || null,
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
      assessmentStatus: { type: "string" },
      attemptOutcome: { type: "string" },
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
          "statuses", "detailedStatuses", "attemptOutcome", "assessmentStatus", "sourceTypeFilter",
          "sharedOnly", "interviewScheduled", "upcomingJoinings", "minExperienceYears", "maxExperienceYears",
          "maxNoticeDays", "dateFrom", "dateTo", "dateField", "recruiterName", "recruiterScope", "fallbackKeywords"
        ],
        properties: {
          role: { type: "string" },
          skills: { type: "array", items: { type: "string" }, maxItems: 20 },
          skillsMatch: { type: "string", enum: ["all", "any"] },
          mustHaveSkills: { type: "boolean" },
          location: { type: "string" },
          locations: { type: "array", items: { type: "string" }, maxItems: 12 },
          client: { type: "string" },
          company: { type: "string" },
          jobTitleKeywords: { type: "array", items: { type: "string" }, maxItems: 12 },
          statuses: { type: "array", items: { type: "string" }, maxItems: 12 },
          detailedStatuses: { type: "array", items: { type: "string" }, maxItems: 20 },
          attemptOutcome: { type: "string" },
          assessmentStatus: { type: "string" },
          sourceTypeFilter: { type: "string" },
          sharedOnly: { type: "boolean" },
          interviewScheduled: { type: "boolean" },
          upcomingJoinings: { type: "boolean" },
          minExperienceYears: { type: ["number", "null"] },
          maxExperienceYears: { type: ["number", "null"] },
          maxNoticeDays: { type: ["number", "null"] },
          dateFrom: { type: "string" },
          dateTo: { type: "string" },
          dateField: { type: "string" },
          recruiterName: { type: "string" },
          recruiterScope: { type: "string" },
          fallbackKeywords: { type: "array", items: { type: "string" }, maxItems: 20 }
        }
      }
    }
  };
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

  const result = await callOpenAiJsonSchema({
    apiKey,
    prompt,
    model: "gpt-4.1-mini",
    schemaName: "recruiter_query_parser",
    schema: buildRecruiterQueryParserSchema()
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
    const cachedCvResult = candidateMeta?.cvAnalysisCache?.result && typeof candidateMeta.cvAnalysisCache.result === "object"
      ? candidateMeta.cvAnalysisCache.result
      : {};
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

  const rawTextForSearch = String(baseResult?.rawText || "").trim();
  const rawTextPreview = rawTextForSearch ? rawTextForSearch.slice(0, 2200) : "";
  const searchKeywords = (() => {
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
    rawTextPreview,
    searchKeywords,
    parseDebug,
    validation
  };
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
  const nextEdu = String(result.highestEducation || "").trim();
  const nextLinkedIn = String(result.linkedinUrl || "").trim();
  const nextOrgTenure = String(result.currentOrgTenure || "").trim();

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
  setBlank("totalExperience", nextExp);
  setBlank("highestEducation", nextEdu);
  setBlank("linkedin", nextLinkedIn);
  setBlank("currentOrgTenure", nextOrgTenure);

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
          expiresAt: payload.expiresAt || null
        }
      });
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

  if (req.method === "GET" && requestUrl.pathname.startsWith("/apply-public/")) {
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
      const mode = String(requestUrl.searchParams.get("mode") || "").trim().toLowerCase();
      const isPublic = mode === "public" || mode === "anonymous";

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
      const jobs = await listCompanyJobs(user.companyId, user.id);
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

  if (req.method === "POST" && req.url === "/company/jds/send-email") {
    try {
      const actor = await requireSessionUser(getBearerToken(req));
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
      if (!toRaw) throw new Error("Recipient email is required.");
      const recipients = toRaw
        .split(/,|;|\s+/)
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      if (!recipients.length) throw new Error("Recipient email is required.");
      const ccRecipients = ccRaw
        ? ccRaw
            .split(/,|;|\s+/)
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [];
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
      const body = await readJsonBody(req);
      const toRaw = String(body.to || "").trim();
      const ccRaw = String(body.cc || "").trim();
      const subject = String(body.subject || "").trim();
      const html = String(body.html || "").trim();
      const text = String(body.text || "").trim();
      if (!toRaw) throw new Error("Recipient email is required.");
      if (!subject) throw new Error("Subject is required.");
      if (!html && !text) throw new Error("Email content missing.");
      const recipients = toRaw
        .split(/,|;|\s+/)
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      if (!recipients.length) throw new Error("Recipient email is required.");
      const ccRecipients = ccRaw
        ? ccRaw
            .split(/,|;|\s+/)
            .map((item) => String(item || "").trim())
            .filter(Boolean)
        : [];
      await sendJdEmailAsActor(actor, {
        to: recipients.join(", "),
        cc: ccRecipients.join(", "),
        subject,
        html: html || `<pre>${escapeHtml(text).replace(/\n/g, "<br/>")}</pre>`,
        text: text || ""
      });
      sendJson(res, 200, { ok: true, result: { sent: true, to: recipients, subject } });
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
      await transport.verify();
      let testMailSent = false;
      let sentTo = "";
      if (sendTestMail) {
        const to = overrideTo || String(actor?.email || cfg.user || "").trim();
        if (!to) throw new Error("No email address available for test mail.");
        await transport.sendMail({
          from: String(cfg.from || "").trim(),
          to,
          subject: "RecruitDesk SMTP test",
          text: "SMTP test successful. Your RecruitDesk mail settings are working.",
          html: "<p>SMTP test successful. Your RecruitDesk mail settings are working.</p>"
        });
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
          user: String(cfg.user || "").trim(),
          from: String(cfg.from || "").trim(),
          testMailSent,
          sentTo
        }
      });
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

      const query = [name, role, company, location].filter(Boolean).join(" ");
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
            linkedin: extracted?.linkedin ?? null
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
        assigned_jd_id: String(input.assigned_jd_id || input.assignedJdId || "").trim() || undefined,
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
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/company/database-candidates") {
    try {
      const sessionUser = await requireSessionUser(getBearerToken(req));
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

            await patchCandidate(candidate.id, {
              raw_note: encodeApplicantMetadata(nextMeta),
              ...buildCvAutofillPatch(refreshed || candidate, result)
            }, { companyId: actor.companyId });

            // Best-effort persistence of unified search-doc + full CV text (if table exists).
            try {
              await upsertCandidateSearchDocV1({
                companyId: actor.companyId,
                candidateId: candidate.id,
                docV1: nextMeta.searchDocV1,
                cvTextFull: String(parsed?.rawText || "")
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

      await patchCandidate(candidate.id, {
        raw_note: encodeApplicantMetadata(nextMeta),
        ...buildCvAutofillPatch(candidate, result)
      }, { companyId: actor.companyId });

      // Best-effort persistence of unified search-doc + full CV text (if table exists).
      try {
        await upsertCandidateSearchDocV1({
          companyId: actor.companyId,
          candidateId: candidate.id,
          docV1: nextMeta.searchDocV1,
          cvTextFull: String(parsed?.rawText || "")
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
