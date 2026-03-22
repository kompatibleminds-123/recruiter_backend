const http = require("http");
const { URL } = require("url");
const fs = require("fs");
const path = require("path");
const { parseCandidatePayload } = require("./src/parser");
const { callOpenAiQuestions, normalizeCandidateFileWithAi, normalizeCandidateWithAi } = require("./src/ai");
const {
  assignCandidate,
  deleteCandidate,
  findDuplicateCandidate,
  linkCandidateToAssessment,
  listCandidatesForUser,
  listCandidates,
  listContactAttempts,
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
  createUser,
  deleteUser,
  deleteAssessment,
  deleteCompanyJob,
  getSessionUser,
  listCompaniesAndUsersSummary,
  listAssessments,
  listCompanyJobs,
  listCompanyUsers,
  login,
  requireSessionUser,
  resetUserPassword,
  saveAssessment,
  saveCompanyJob
} = require("./src/auth-store");

const PORT = Number(process.env.PORT || 8787);
const WHATSAPP_VERIFY_TOKEN = String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
const QUICK_CAPTURE_PUBLIC_DIR = path.join(__dirname, "public", "quick-capture");
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

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function serveStaticFile(res, filePath) {
  if (!filePath.startsWith(QUICK_CAPTURE_PUBLIC_DIR)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = STATIC_MIME_TYPES[ext] || "application/octet-stream";
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": body.length
  });
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

  const monthNameMatch = value.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,'/-]*((\d{2})|(\d{4}))/i);
  if (monthNameMatch) {
    const month = MONTH_INDEX[String(monthNameMatch[1] || "").toLowerCase()];
    const year = monthNameMatch[3] ? 2000 + Number(monthNameMatch[3]) : Number(monthNameMatch[4] || monthNameMatch[2]);
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
  const currentRole = getCurrentRoleFromTimeline(finalTimeline);
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
  const computedTotalExperience = calculateTotalExperienceFromTimeline(finalTimeline);
  const averageTenurePerCompany = calculateAverageTenurePerCompany(finalTimeline);
  const computedCurrentOrgTenure = calculateCurrentOrgTenure(finalTimeline, currentCompany);
  const aiTotalExperience = String(normalizedResult?.totalExperience || "").trim();
  const aiCurrentOrgTenure = String(normalizedResult?.currentOrgTenure || "").trim();
  const candidateTotalExperience =
    sourceType === "cv"
      ? choosePreferredScalar(computedTotalExperience, aiTotalExperience)
      : choosePreferredScalar(computedTotalExperience, aiTotalExperience);
  const candidateCurrentOrgTenure =
    sourceType === "cv"
      ? choosePreferredScalar(computedCurrentOrgTenure, aiCurrentOrgTenure)
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
    timeline: finalTimeline,
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
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && (requestUrl.pathname === "/quick-capture" || requestUrl.pathname === "/quick-capture/")) {
    serveStaticFile(res, path.join(QUICK_CAPTURE_PUBLIC_DIR, "index.html"));
    return;
  }

  if (req.method === "GET" && requestUrl.pathname.startsWith("/quick-capture/")) {
    const assetPath = requestUrl.pathname.replace(/^\/quick-capture\//, "");
    const safeRelativePath = path.normalize(assetPath).replace(/^(\.\.(\/|\\|$))+/, "");
    const resolvedPath = path.join(QUICK_CAPTURE_PUBLIC_DIR, safeRelativePath);
    serveStaticFile(res, resolvedPath);
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/health") {
    const authSummary = listCompaniesAndUsersSummary();
    sendJson(res, 200, {
      ok: true,
      service: "recruiter-backend",
      version: "0.1.0",
      routes: [
        "/health",
        "/auth/bootstrap-admin",
        "/auth/login",
        "/auth/me",
        "/company/users",
        "/company/users/password",
        "/company/jds",
        "/company/assessments",
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
      auth: authSummary
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
      const result = bootstrapAdmin({
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

  if (req.method === "POST" && req.url === "/auth/login") {
    try {
      const body = await readJsonBody(req);
      const result = login({
        email: String(body.email || "").trim(),
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
      const user = requireSessionUser(getBearerToken(req));
      sendJson(res, 200, { ok: true, result: { user } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && req.url === "/company/users") {
    try {
      const user = requireSessionUser(getBearerToken(req));
      const users = listCompanyUsers(user.companyId);
      sendJson(res, 200, { ok: true, result: { companyId: user.companyId, users } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/users") {
    try {
      const actor = requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const createdUser = createUser({
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
      const actor = requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = deleteUser({
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
      const actor = requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = resetUserPassword({
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

  if (req.method === "GET" && req.url === "/company/jds") {
    try {
      const user = requireSessionUser(getBearerToken(req));
      const jobs = listCompanyJobs(user.companyId);
      sendJson(res, 200, { ok: true, result: { jobs } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/jds") {
    try {
      const actor = requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const job = saveCompanyJob({
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
      const actor = requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = deleteCompanyJob({
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
      const user = requireSessionUser(getBearerToken(req));
      const assessments = listAssessments({
        actorUserId: user.id,
        companyId: user.companyId
      });
      sendJson(res, 200, { ok: true, result: { assessments } });
    } catch (error) {
      sendJson(res, 401, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && req.url === "/company/assessments") {
    try {
      const actor = requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const assessment = saveAssessment({
        actorUserId: actor.id,
        companyId: actor.companyId,
        assessment: body.assessment || body
      });
      sendJson(res, 200, { ok: true, result: assessment });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && req.url === "/company/assessments") {
    try {
      const actor = requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = deleteAssessment({
        actorUserId: actor.id,
        companyId: actor.companyId,
        assessmentId: String(body.assessmentId || "").trim()
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/candidates") {
    try {
      const sessionUser = getSessionUser(getBearerToken(req));
      const listOptions = {
        limit: Number(requestUrl.searchParams.get("limit") || 100),
        q: String(requestUrl.searchParams.get("q") || "").trim()
      };
      const result = sessionUser
        ? await listCandidatesForUser(sessionUser, listOptions)
        : await listCandidates(listOptions);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/candidates") {
    try {
      const actor = requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const candidate = {
        ...(body.candidate || body || {}),
        recruiter_id: actor.id,
        recruiter_name: actor.name,
        updated_at: new Date().toISOString()
      };
      const duplicate = await findDuplicateCandidate(candidate);
      if (duplicate) {
        sendJson(res, 200, {
          ok: true,
          duplicate: true,
          duplicateBy: duplicate.matchBy,
          result: duplicate.existing
        });
        return;
      }
      const result = await saveCandidate(candidate);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "DELETE" && requestUrl.pathname === "/candidates") {
    try {
      const candidateId = String(requestUrl.searchParams.get("id") || "").trim();
      const result = await deleteCandidate(candidateId);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/candidates/link-assessment") {
    try {
      const body = await readJsonBody(req);
      const result = await linkCandidateToAssessment(body.id, body.assessment_id || body.assessmentId);
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/candidates/assign") {
    try {
      const actor = requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await assignCandidate(body.id || body.candidateId, {
        assigned_to_user_id: body.assigned_to_user_id || body.assignedToUserId,
        assigned_to_name: body.assigned_to_name || body.assignedToName,
        assigned_by_user_id: actor.id,
        assigned_by_name: actor.name,
        assigned_jd_id: body.assigned_jd_id || body.assignedJdId,
        assigned_jd_title: body.assigned_jd_title || body.assignedJdTitle
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "GET" && requestUrl.pathname === "/contact-attempts") {
    try {
      requireSessionUser(getBearerToken(req));
      const result = await listContactAttempts(
        String(requestUrl.searchParams.get("candidate_id") || requestUrl.searchParams.get("candidateId") || "").trim(),
        Number(requestUrl.searchParams.get("limit") || 20)
      );
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/contact-attempts") {
    try {
      const actor = requireSessionUser(getBearerToken(req));
      const body = await readJsonBody(req);
      const result = await saveContactAttempt(body.candidate_id || body.candidateId, {
        recruiter_id: actor.id,
        recruiter_name: actor.name,
        jd_id: body.jd_id || body.jdId,
        jd_title: body.jd_title || body.jdTitle,
        outcome: body.outcome,
        notes: body.notes,
        next_follow_up_at: body.next_follow_up_at || body.nextFollowUpAt
      });
      sendJson(res, 200, { ok: true, result });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: String(error.message || error) });
    }
    return;
  }

  if (req.method === "POST" && requestUrl.pathname === "/parse-note") {
    try {
      const body = await readJsonBody(req);
      const sessionUser = getSessionUser(getBearerToken(req));
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
          client_name: String(body.client_name || body.clientName || "").trim() || null,
          jd_title: String(body.jd_title || body.jdTitle || "").trim() || null,
          recruiter_id: sessionUser?.id || String(body.recruiter_id || body.recruiterId || "").trim() || null,
          recruiter_name: sessionUser?.name || String(body.recruiter_name || body.recruiterName || "").trim() || null
        }
      });
      const duplicate = await findDuplicateCandidate(parsed);
      if (duplicate) {
        sendJson(res, 200, {
          ok: true,
          duplicate: true,
          duplicateBy: duplicate.matchBy,
          result: duplicate.existing
        });
        return;
      }
      if (body.preview === true || body.dry_run === true || body.dryRun === true) {
        sendJson(res, 200, { ok: true, preview: true, result: parsed });
        return;
      }
      const saved = await saveCandidate(parsed);
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

        const shouldUsePrimaryFileAiForCv = canUseFileAi;

        if (shouldUsePrimaryFileAiForCv) {
          aiParseMode = "deep_file_ai_primary";
          aiParseReason = "Direct file-based AI parsing was used as the primary CV parsing path.";
          normalized = await normalizeCandidateFileWithAi({
            apiKey,
            model: String(body.model || "").trim(),
            uploadedFile: body.file,
            sourceType: parsed.sourceType,
            filename: parsed.filename,
            fallbackFields
          });
        } else if (parsed.rawText) {
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
