const { parseCandidatePayload } = require("./parser");
const { normalizeCandidateFileWithAi, normalizeCandidateWithAi } = require("./ai");

function normalizeText(value = "") {
  return String(value || "")
    .replace(/[\u2018\u2019`´]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDashAndSpace(value = "") {
  return String(value || "")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function normalizeCompanyName(value = "") {
  let out = normalizeDashAndSpace(value);
  out = out
    .replace(/\bPvt\.?\s*Ltd\.?\b/gi, "Pvt Ltd")
    .replace(/\bPrivate\s+Limited\b/gi, "Pvt Ltd")
    .replace(/\bLtd\.?\b/gi, "Ltd")
    .replace(/[|,;:.]+$/g, "")
    .trim();
  return out;
}

function normalizeDesignationText(value = "") {
  return normalizeDashAndSpace(String(value || "").replace(/[|,;:.]+$/g, "").trim());
}

function looksLikeGenericCompanyText(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  return /\b(framework|platform|tool|technology|automation|rpa|solution|process)\b/.test(text);
}

function extractCompanyCandidateFromDesignation(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return "";
  // Split by common separators and pick shortest title-cased chunk likely to be a company token.
  const parts = raw.split(/[@|,()/&\-]+/).map((p) => String(p || "").trim()).filter(Boolean);
  const deny = /\b(senior|software|engineer|developer|manager|lead|architect|consultant|analyst|executive|associate|intern|framework|platform|automation|rpa)\b/i;
  for (const p of parts) {
    if (p.length < 3 || p.length > 32) continue;
    if (deny.test(p)) continue;
    if (/^[A-Z][A-Za-z0-9.&\-\s]*$/.test(p) || /^[A-Za-z][A-Za-z0-9.&\-]*$/.test(p)) {
      return p;
    }
  }
  return "";
}

function looksLikeDateMetaText(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^\d{4}\s*[-\u2013\u2014\u2212]\s*(\d{4}|present|current)$/i.test(text)) return true;
  if (/^\d{1,2}[/-]\d{4}\s*[-\u2013\u2014\u2212]\s*(\d{1,2}[/-]\d{4}|present|current)$/i.test(text)) return true;
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i.test(text) && /present|current|\d{2,4}/i.test(text)) return true;
  if (/^\s*(present|current|ongoing|till date)\b/i.test(text)) return true;
  return false;
}

function looksLikeTaglineText(value = "") {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return false;
  if (/\b(b2b saas platform|global font and brand technology|marketing automation|edtech platform|serving construction companies)\b/.test(text)) return true;
  return text.split(/\s+/).length >= 8 && /\b(platform|serving|technology company|brand technology|market segment|business summary|product)\b/.test(text);
}

function looksLikeResponsibilityText(value = "") {
  return /^(built|led|managed|developed|created|executed|driving|working|maintaining|collaborating|generated|achieved|provided|used|implemented|designed|delivered|owned|applied|partnered)\b/i.test(String(value || "").trim());
}

function looksLikeSentenceLine(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 7) return false;
  return /[,.]/.test(text) || /\b(with|for|from|into|using|through|responsible|handling|managing|developing|worked|associated|experience)\b/i.test(text);
}

function looksLikeProjectDomainHeading(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  return /\b(framework|platform|project|application|system|product|module|tool|engine|service)\b/i.test(text)
    || /\b(intelligent document processing|ai agent framework|rpa)\b/i.test(text);
}

function looksLikeEducationLine(value = "") {
  return /\b(bachelor|master|b\.?tech|m\.?tech|bca|mca|mba|mph|diploma|university|college|cgpa|percentage)\b/i.test(String(value || ""));
}

function looksLikeEducationCompanyText(value = "") {
  return /\b(master|masters|bachelor|b\.?tech|b\.?e\.?|mba|mca|mph|geography|university|college|school|degree|diploma|cgpa|percentage)\b/i.test(String(value || ""));
}

function looksLikeContactLine(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/@/.test(text) && /\b(mail|email|phone|contact)\b/i.test(text)) return true;
  if (/\+?\d[\d\s\-()]{7,}/.test(text) && /\b(mail|email|phone|contact)\b/i.test(text)) return true;
  if (/linkedin\.com|github\.com/i.test(text)) return true;
  return false;
}

function looksLikeRoleOnlyLine(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (looksLikeContactLine(text) || looksLikeEducationLine(text) || looksLikeDateMetaText(text)) return false;
  return /\b(engineer|developer|manager|lead|architect|consultant|analyst|executive|associate|specialist|intern|estimator|surveyor|account executive|sales|business development|coordinator|designer|drafter|modeler|bim|mep|team)\b/i.test(text);
}

function looksLikeEmployerLine(value = "") {
  const text = normalizeCompanyName(value);
  if (!text) return false;
  if (looksLikeContactLine(text) || looksLikeEducationLine(text) || looksLikeDateMetaText(text) || looksLikeRoleOnlyLine(text)) return false;
  if (PROJECT_DOMAIN_WORDS.test(text)) return false;
  if (/\b(pvt|private|ltd|limited|inc|llc|corp|company|technologies|services|solutions|systems|consulting|studio|construction|design|architects?)\b/i.test(text)) return true;
  if (/,/.test(text)) return true;
  return /^[A-Z][A-Za-z0-9.&'()-]*(?:\s+[A-Z][A-Za-z0-9.&'()-]*){0,5}$/.test(text) && text.split(/\s+/).length <= 6;
}

function supportsOpenAiFileParse(file = {}) {
  const mimeType = String(file?.mimeType || "").toLowerCase();
  const filename = String(file?.filename || "").toLowerCase();
  return mimeType.includes("pdf") || filename.endsWith(".pdf") || mimeType.includes("wordprocessingml") || filename.endsWith(".docx");
}

function mapTimelineRows(timeline = []) {
  return (timeline || []).map((row) => ({
    company: String(row?.company || row?.company_name || "").trim(),
    designation: String(row?.designation || row?.title || "").trim(),
    startDate: String(row?.startDate || row?.start_date || row?.start || "").trim(),
    endDate: String(row?.endDate || row?.end_date || row?.end || "").trim(),
    sourceText: String(row?.sourceText || row?.raw_line || "").trim()
  }));
}

function scoreTimelineRowQuality(row = {}) {
  const company = String(row?.company || "").trim();
  const designation = String(row?.designation || "").trim();
  const startDate = String(row?.startDate || "").trim();
  const endDate = String(row?.endDate || "").trim();
  let score = 0;

  if (company && !isSuspiciousCompanyCandidate(company) && !looksLikeSentenceLine(company)) score += 4;
  else if (company) score -= 3;

  if (designation && looksLikeRoleLine(designation) && !looksLikeSentenceLine(designation)) score += 3;
  else if (designation) score -= 2;

  if (startDate) score += 2;
  if (endDate) score += 1;
  if (isPresentLike(endDate)) score += 1;

  return score;
}

function scoreTimelineQuality(rows = []) {
  return (rows || []).reduce((sum, row) => sum + scoreTimelineRowQuality(row), 0);
}

function shouldPreferBlockRowsOverAi(aiRows = [], blockRows = []) {
  const aiTimeline = mapTimelineRows(aiRows);
  const blockTimeline = mapTimelineRows(blockRows);
  if (!blockTimeline.length) return false;
  if (!aiTimeline.length) return true;

  const aiScore = scoreTimelineQuality(aiTimeline);
  const blockScore = scoreTimelineQuality(blockTimeline);

  const aiBlankCompanies = aiTimeline.filter((row) => !String(row?.company || "").trim()).length;
  const blockBlankCompanies = blockTimeline.filter((row) => !String(row?.company || "").trim()).length;

  if (blockScore >= aiScore + 4 && blockBlankCompanies <= aiBlankCompanies) return true;
  if (blockScore > aiScore && blockTimeline.length >= aiTimeline.length && blockBlankCompanies < aiBlankCompanies) return true;

  return false;
}

const PROJECT_DOMAIN_WORDS = /\b(framework|platform|project|product|application|system|module|tool|engine|service|rpa|ai agent|idp|automation framework|enterprise application)\b/i;
const ROLE_WORDS = /\b(engineer|developer|manager|lead|architect|consultant|analyst|executive|associate|specialist|intern|estimator|surveyor|account executive|sdr|bdr)\b/i;
const SECTION_END_WORDS = /\b(education|academic|qualification|skills|projects|achievements|certifications|declaration|personal details)\b/i;
const EXPERIENCE_START_WORDS = /\b(professional experience|work experience|employment history|experience)\b/i;

function hasDateRangeLike(text = "") {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/\b(present|current|ongoing|till date)\b/i.test(t) && /\b(19|20)\d{2}\b/.test(t)) return true;
  if (/\b(19|20)\d{2}\b.*[-–—].*\b(19|20)\d{2}\b/.test(t)) return true;
  if (/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}\b.*[-–—].*/i.test(t)) return true;
  if (/\b\d{1,2}[/-]\d{4}\b.*[-–—].*/.test(t)) return true;
  return false;
}

function looksLikeHeaderRow(line = "") {
  const t = String(line || "").trim();
  if (!t) return false;
  if (t.startsWith("•") || t.startsWith("-")) return false;
  if (looksLikeContactLine(t) || looksLikeEducationLine(t)) return false;
  const hasSep = /[|]|[—–-]/.test(t);
  return hasDateRangeLike(t) && hasSep && (ROLE_WORDS.test(t) || /[A-Z][A-Za-z0-9.&]+\s/.test(t));
}

function parseDateRangeFromText(text = "") {
  const t = String(text || "").trim();
  if (!t) return { startDate: "", endDate: "" };
  const cleaned = t.replace(/\s+/g, " ");
  const tokens = cleaned.split(/\s*[–—-]\s*/).map((x) => String(x || "").trim()).filter(Boolean);
  if (tokens.length < 2) return { startDate: "", endDate: "" };
  const looksDateish = (x = "") =>
    /\b(present|current|ongoing|till date|(?:19|20)\d{2}|\d{1,2}[/-]\d{4}|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[a-z]*\s+\d{4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}|\d{4}-\d{2})\b/i.test(x);
  let startTok = "";
  let endTok = "";
  for (let i = 0; i + 1 < tokens.length; i += 1) {
    if (looksDateish(tokens[i]) && looksDateish(tokens[i + 1])) {
      startTok = tokens[i];
      endTok = tokens[i + 1];
      break;
    }
  }
  if (!startTok) return { startDate: "", endDate: "" };
  const startDate = normalizeDashAndSpace(parseHeaderDateTokenToYm(startTok) || startTok || "");
  const endDateRaw = endTok || "";
  const endDate = /present|current|ongoing|till date/i.test(endDateRaw)
    ? "Present"
    : normalizeDashAndSpace(parseHeaderDateTokenToYm(endDateRaw) || endDateRaw);
  return { startDate, endDate };
}

function extractCompanyFromHeader(line = "") {
  const t = String(line || "").trim();
  if (!t) return "";
  const pipeParts = t.split("|").map((x) => String(x || "").trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    const first = pipeParts[0];
    const mid = pipeParts[1];
    // pattern: <designation> <company> | <location> | <date>
    const candidate = first.split(/\s+/).slice(-3).join(" ").trim();
    if (candidate && !PROJECT_DOMAIN_WORDS.test(candidate) && !ROLE_WORDS.test(candidate)) return candidate;
    if (mid && !looksLikeDateMetaText(mid) && !looksLikeEducationLine(mid) && !PROJECT_DOMAIN_WORDS.test(mid)) return mid;
  }
  const atMatch = t.match(/\bat\s+([A-Z][A-Za-z0-9.&\-\s]{1,80})/i);
  if (atMatch) return atMatch[1].trim();
  return "";
}

function extractDesignationFromHeader(line = "", company = "") {
  let t = String(line || "").trim();
  if (!t) return "";
  if (company) {
    const c = company.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\b${c}\\b`, "i"), " ").replace(/\s+/g, " ").trim();
  }
  if (t.includes("|")) t = t.split("|")[0].trim();
  t = t.replace(/\bat\s+[A-Z][A-Za-z0-9.&\-\s]{1,80}/i, "").trim();
  t = t.replace(/\s*[-–—]\s*(present|current|ongoing|till date|(?:19|20)\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4}).*$/i, "").trim();
  return t;
}

function buildExperienceRowsFromBlocks(rawText = "") {
  const lines = String(rawText || "").split(/\r?\n/).map((l) => String(l || "").trim()).filter(Boolean);
  if (!lines.length) return [];
  let start = lines.findIndex((l) => EXPERIENCE_START_WORDS.test(l));
  if (start < 0) start = 0;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (SECTION_END_WORDS.test(lines[i])) {
      end = i;
      break;
    }
  }
  const slice = lines.slice(start, end);
  const directRows = [];
  const headers = [];
  for (let i = 0; i < slice.length; i += 1) {
    const line = slice[i];
    const next = slice[i + 1] || "";
    const next2 = slice[i + 2] || "";
    const directDateRange = /^\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[a-z]*\s+\d{4}\s*[-\u2013\u2014\u2212]\s*(?:\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[a-z]*\s+\d{4}|present|current|ongoing|till date)$/i;
    if (directDateRange.test(line) && looksLikeEmployerLine(next)) {
      const parsedDates = parseDateRangeFromText(line);
      directRows.push({
        company: normalizeCompanyName(next),
        designation: looksLikeRoleOnlyLine(next2) ? normalizeDesignationText(next2) : "",
        startDate: parsedDates.startDate,
        endDate: parsedDates.endDate,
        sourceText: [line, next, looksLikeRoleOnlyLine(next2) ? next2 : ""].filter(Boolean).join(" | ")
      });
      i += looksLikeRoleOnlyLine(next2) ? 2 : 1;
      continue;
    }
    let headerLine = "";
    if (looksLikeHeaderRow(line)) {
      headerLine = line;
    } else if ((ROLE_WORDS.test(line) || /[|]/.test(line)) && hasDateRangeLike(next)) {
      headerLine = `${line} | ${next}`;
    } else if (hasDateRangeLike(line) && ROLE_WORDS.test(next)) {
      headerLine = `${next} | ${line}`;
    }
    if (!headerLine) continue;
    const { startDate, endDate } = parseDateRangeFromText(headerLine);
    if (!startDate && !endDate) continue;
    const company = normalizeCompanyName(extractCompanyFromHeader(headerLine));
    const designation = normalizeDesignationText(extractDesignationFromHeader(headerLine, company));
    headers.push({
      headerIndex: i,
      headerLine,
      company,
      designation,
      startDate,
      endDate
    });
  }
  const rows = [...directRows];
  for (let i = 0; i < headers.length; i += 1) {
    const h = headers[i];
    const nextIdx = headers[i + 1] ? headers[i + 1].headerIndex : slice.length;
    const body = slice.slice(h.headerIndex + 1, nextIdx).join(" | ");
    const firstBody = String(slice[h.headerIndex + 1] || "").trim();
    const company = h.company && !PROJECT_DOMAIN_WORDS.test(h.company) ? h.company : "";
    rows.push({
      company,
      designation: h.designation,
      startDate: h.startDate,
      endDate: h.endDate,
      sourceText: `${h.headerLine}${body ? ` | ${body}` : ""}`,
      _firstBodyLine: firstBody
    });
  }
  return rows;
}

function parseHeaderDateTokenToYm(text = "") {
  const t = String(text || "").trim();
  if (!t) return "";
  const m0 = t.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/i); // 1 November 2020
  if (m0) {
    const mm = toYmScore(`${m0[2]} ${m0[3]}`);
    if (mm > 0) {
      const y = Math.floor(mm / 12);
      const mo = String(mm % 12).padStart(2, "0");
      return `${y}-${mo}`;
    }
  }
  const m1 = t.match(/^(\w+)\s+(\d{4})$/i); // July 2019
  if (m1) {
    const mm = toYmScore(`${m1[1]} ${m1[2]}`);
    if (mm > 0) {
      const y = Math.floor(mm / 12);
      const mo = String(mm % 12).padStart(2, "0");
      return `${y}-${mo}`;
    }
  }
  const m2 = t.match(/^(\d{1,2})[/-](\d{4})$/); // 07/2019
  if (m2) return `${m2[2]}-${String(m2[1]).padStart(2, "0")}`;
  const m3 = t.match(/^(\d{4})-(\d{2})$/); // 2019-07
  if (m3) return `${m3[1]}-${m3[2]}`;
  return "";
}

function extractHeaderRowsFromRawText(rawText = "") {
  const lines = String(rawText || "").split(/\r?\n/).map((l) => String(l || "").trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const parts = line.split("|").map((x) => String(x || "").trim()).filter(Boolean);
    if (parts.length < 3) continue;
    const left = parts[0];
    const middle = parts[1];
    const right = parts[parts.length - 1];
    if (!/(present|current|ongoing|till date|19\d{2}|20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i.test(right)) continue;
    // Right side date range split
    const dateParts = right.split(/\s*[–—-]\s*/).map((x) => String(x || "").trim()).filter(Boolean);
    if (!dateParts.length) continue;
    const start = parseHeaderDateTokenToYm(dateParts[0]) || dateParts[0];
    const end = /present|current|ongoing|till date/i.test(dateParts.slice(1).join(" "))
      ? "Present"
      : (parseHeaderDateTokenToYm(dateParts.slice(1).join(" ")) || dateParts.slice(1).join(" "));
    // Try to split left as "<designation> <company>" using role cue.
    const tokens = left.split(/\s+/);
    const roleCue = /\b(engineer|developer|manager|lead|architect|consultant|analyst|executive|associate|specialist|intern)\b/i;
    let designation = left;
    let company = "";
    if (roleCue.test(left) && tokens.length >= 3) {
      // Find probable company tail token: last title-case token chunk
      const tail = [];
      for (let i = tokens.length - 1; i >= 0; i -= 1) {
        const tk = tokens[i];
        if (/^[A-Z][A-Za-z0-9.&-]*$/.test(tk) && !roleCue.test(tk)) {
          tail.unshift(tk);
        } else {
          break;
        }
      }
      if (tail.length) {
        company = tail.join(" ");
        designation = left.slice(0, Math.max(0, left.length - company.length)).trim().replace(/[,\-|]+$/g, "").trim();
      }
    }
    out.push({
      raw: line,
      designation: designation.trim(),
      company: company.trim(),
      location: middle,
      startDate: normalizeDashAndSpace(start),
      endDate: normalizeDashAndSpace(end)
    });
  }
  return out;
}

function findBestHeaderRepair(row = {}, headerRows = []) {
  if (!Array.isArray(headerRows) || !headerRows.length) return null;
  const rowStart = normalizeDashAndSpace(String(row?.startDate || "").trim());
  const rowEnd = normalizeDashAndSpace(String(row?.endDate || "").trim());
  const rowDesig = normalizeText(String(row?.designation || ""));
  // Prefer exact date match first.
  let match = headerRows.find((h) =>
    normalizeDashAndSpace(String(h.startDate || "")) === rowStart &&
    normalizeDashAndSpace(String(h.endDate || "")) === rowEnd &&
    String(h.company || "").trim()
  );
  if (match) return match;
  // Then by startDate + designation overlap
  match = headerRows.find((h) =>
    normalizeDashAndSpace(String(h.startDate || "")) === rowStart &&
    rowDesig &&
    normalizeText(String(h.designation || "")).includes(rowDesig.slice(0, 20))
  );
  if (match && String(match.company || "").trim()) return match;
  return null;
}

function looksLikeTableStyleCompositeRow(row = {}) {
  const src = String(row?.sourceText || "").trim();
  if (!src || !src.includes("|")) return false;
  const parts = src.split("|").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 3) return false;
  const hasEducation = parts.some((p) => looksLikeEducationLine(p));
  const hasContact = parts.some((p) => looksLikeContactLine(p));
  const hasDate = parts.some((p) => toYmScore(p) > 0 || /\b(19|20)\d{2}\b/.test(p));
  return hasDate && (hasEducation || hasContact);
}

function toYmScore(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return -1;
  if (isPresentEndDateLike(raw)) return 999999;
  const dayMonthYear = raw.match(/^(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)[a-z]*\s+(\d{4})$/i);
  if (dayMonthYear) {
    const monthMap = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
    return Number(dayMonthYear[3]) * 12 + (monthMap[String(dayMonthYear[2]).toLowerCase()] || 0);
  }
  const iso = raw.match(/^(\d{4})\s*-\s*(\d{2})$/);
  if (iso) return Number(iso[1]) * 12 + Number(iso[2]);
  const slash = raw.match(/^(\d{4})\s*\/\s*(\d{2})$/);
  if (slash) return Number(slash[1]) * 12 + Number(slash[2]);
  const mmY = raw.match(/^(\d{2})\s*-\s*(\d{4})$/);
  if (mmY) return Number(mmY[2]) * 12 + Number(mmY[1]);
  const mmYSlash = raw.match(/^(\d{2})\s*\/\s*(\d{4})$/);
  if (mmYSlash) return Number(mmYSlash[2]) * 12 + Number(mmYSlash[1]);
  const m = raw.match(/^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{4})$/i);
  if (m) {
    const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
    return Number(m[2]) * 12 + (monthMap[String(m[1]).toLowerCase()] || 0);
  }
  const y = raw.match(/^(19|20)\d{2}$/);
  if (y) return Number(raw) * 12;
  return -1;
}

function pickCurrentFromTimeline(timeline = []) {
  if (!timeline.length) return {};
  const present = timeline.find((row) => /^(present|current|ongoing|till date)$/i.test(String(row?.endDate || "").trim()));
  if (present) return present;
  const sorted = [...timeline].sort((a, b) => {
    const endDelta = toYmScore(b?.endDate) - toYmScore(a?.endDate);
    if (endDelta !== 0) return endDelta;
    return toYmScore(b?.startDate) - toYmScore(a?.startDate);
  });
  return sorted[0] || {};
}

function isPresentLike(value = "") {
  return isPresentEndDateLike(value);
}

function isPresentEndDateLike(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (!/\b(present|current|ongoing|till date)\b/i.test(text)) return false;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length <= 4) return true;
  if (/(\d{1,2}[/-]\d{4}|\d{4}[/-]\d{1,2}|(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{4})\s*[-–—]\s*(present|current|ongoing|till date)/i.test(text)) {
    return true;
  }
  return false;
}

function isSuspiciousCompanyCandidate(value = "") {
  const text = String(value || "").trim();
  if (!text) return true;
  return (
    looksLikeDateMetaText(text) ||
    looksLikeTaglineText(text) ||
    looksLikeResponsibilityText(text) ||
    looksLikeEducationLine(text) ||
    looksLikeContactLine(text)
  );
}

function resolveCurrentRoleDeterministically(rows = []) {
  const cleaned = (rows || []).filter((row) => {
    const company = String(row?.company || "").trim();
    const allowPresentBlankCompany = isPresentLike(row?.endDate) && !company;
    return (allowPresentBlankCompany || !isSuspiciousCompanyCandidate(company))
      && !looksLikeContactLine(row?.designation || "");
  });
  if (!cleaned.length) {
    return { row: null, unclear: true, reason: "no_valid_rows" };
  }

  const presentRows = cleaned.filter((row) => isPresentLike(row?.endDate));
  if (presentRows.length === 1) {
    return { row: presentRows[0], unclear: false, reason: "single_present" };
  }
  const designationRank = (value = "") => {
    const t = String(value || "").toLowerCase();
    if (/\b(founder|head|director|vice president|vp|avp|principal)\b/.test(t)) return 6;
    if (/\b(account executive|manager|lead|architect|senior|team lead)\b/.test(t)) return 5;
    if (/\b(executive|engineer|developer|analyst|consultant|specialist)\b/.test(t)) return 4;
    if (/\b(associate|coordinator|assistant)\b/.test(t)) return 3;
    if (/\b(csr|customer support|support)\b/.test(t)) return 1;
    return 2;
  };

  const sortByCurrentPriority = (a, b) => {
    const startDelta = toYmScore(b?.startDate) - toYmScore(a?.startDate);
    if (startDelta !== 0) return startDelta;
    const endDelta = toYmScore(b?.endDate) - toYmScore(a?.endDate);
    if (endDelta !== 0) return endDelta;
    const rankDelta = designationRank(b?.designation) - designationRank(a?.designation);
    if (rankDelta !== 0) return rankDelta;
    return 0;
  };

  if (presentRows.length > 1) {
    const sorted = [...presentRows].sort(sortByCurrentPriority);
    const top = sorted[0];
    const second = sorted[1];
    if (!second) {
      return { row: top, unclear: false, reason: "multi_present_latest_start" };
    }
    const sameStart = toYmScore(top?.startDate) === toYmScore(second?.startDate);
    const sameEnd = toYmScore(top?.endDate) === toYmScore(second?.endDate);
    const sameRank = designationRank(top?.designation) === designationRank(second?.designation);
    if (!(sameStart && sameEnd && sameRank)) {
      return { row: top, unclear: false, reason: "multi_present_priority_pick" };
    }
    return { row: top, unclear: true, reason: "multi_present_tie" };
  }

  const sorted = [...cleaned].sort(sortByCurrentPriority);
  const top = sorted[0];
  const second = sorted[1];
  if (second) {
    const sameStart = toYmScore(top?.startDate) === toYmScore(second?.startDate);
    const sameEnd = toYmScore(top?.endDate) === toYmScore(second?.endDate);
    const sameRank = designationRank(top?.designation) === designationRank(second?.designation);
    if (sameStart && sameEnd && sameRank) {
      return { row: top, unclear: true, reason: "latest_date_tie" };
    }
  }
  if (second && toYmScore(top?.startDate) < toYmScore(second?.startDate)) {
    return { row: second, unclear: false, reason: "latest_start_guard" };
  }
  if (second && toYmScore(top?.endDate) < toYmScore(second?.endDate)) {
    return { row: second, unclear: false, reason: "latest_end_guard" };
  }
  if (second && designationRank(top?.designation) < designationRank(second?.designation) && toYmScore(top?.startDate) === toYmScore(second?.startDate)) {
    return { row: second, unclear: false, reason: "role_rank_guard" };
  }
  if (second && toYmScore(top?.endDate) === toYmScore(second?.endDate) && toYmScore(top?.startDate) === toYmScore(second?.startDate) && designationRank(top?.designation) !== designationRank(second?.designation)) {
    return { row: top, unclear: false, reason: "role_rank_tiebreak" };
  }
  if (second && toYmScore(top?.endDate) === toYmScore(second?.endDate) && toYmScore(top?.startDate) === toYmScore(second?.startDate) && designationRank(top?.designation) === designationRank(second?.designation)) {
    return { row: top, unclear: true, reason: "latest_date_tie" };
  }
  return { row: top, unclear: false, reason: "latest_end_date" };
}

function findNearestPreviousValidEmployer(rows = [], presentRow = null) {
  if (!presentRow) return null;
  const presentStart = toYmScore(String(presentRow?.startDate || "").trim());
  if (presentStart <= 0) return null;
  const candidates = (rows || [])
    .filter((row) => !isPresentLike(row?.endDate))
    .filter((row) => {
      const company = String(row?.company || "").trim();
      return company && !isSuspiciousCompanyCandidate(company);
    })
    .map((row) => ({
      row,
      endYm: toYmScore(String(row?.endDate || "").trim()),
      startYm: toYmScore(String(row?.startDate || "").trim())
    }))
    .filter((x) => x.endYm > 0 && x.endYm <= presentStart + 1)
    .sort((a, b) => {
      const endDelta = b.endYm - a.endYm;
      if (endDelta !== 0) return endDelta;
      return b.startYm - a.startYm;
    });
  return candidates[0]?.row || null;
}

function detectTimelineConflicts(rows = [], resolvedCurrent = null) {
  const flags = [];
  const presentRows = (rows || []).filter((row) => isPresentLike(row?.endDate));
  if (presentRows.length > 1) {
    const sorted = [...presentRows].sort((a, b) => toYmScore(b?.startDate) - toYmScore(a?.startDate));
    if (sorted[1] && toYmScore(sorted[0]?.startDate) === toYmScore(sorted[1]?.startDate)) {
      flags.push("multiple_present_roles_conflict");
    }
  }

  const validRows = (rows || [])
    .map((row) => ({
      row,
      s: toYmScore(row?.startDate),
      e: toYmScore(row?.endDate)
    }))
    .filter((x) => x.s > 0 && (x.e > 0 || isPresentLike(x.row?.endDate)));

  for (const x of validRows) {
    if (x.e > 0 && x.s > x.e) flags.push("date_range_impossible");
  }

  const sortedByStart = [...validRows].sort((a, b) => b.s - a.s);
  for (let i = 0; i + 1 < sortedByStart.length; i += 1) {
    const newer = sortedByStart[i];
    const older = sortedByStart[i + 1];
    if (newer.e > 0 && older.e > 0) {
      const overlap = older.e - newer.s;
      // Bad overlap: older role ending far after newer role starts.
      if (overlap > 24) flags.push("timeline_bad_overlap");
    }
  }

  if (resolvedCurrent?.row) {
    const currentKey = [
      normalizeText(resolvedCurrent.row.company),
      normalizeText(resolvedCurrent.row.designation),
      normalizeText(resolvedCurrent.row.startDate),
      normalizeText(resolvedCurrent.row.endDate)
    ].join("|");
    const latestByDate = [...(rows || [])].sort((a, b) => {
      const endDelta = toYmScore(b?.endDate) - toYmScore(a?.endDate);
      if (endDelta !== 0) return endDelta;
      return toYmScore(b?.startDate) - toYmScore(a?.startDate);
    })[0];
    const latestKey = latestByDate
      ? [normalizeText(latestByDate.company), normalizeText(latestByDate.designation), normalizeText(latestByDate.startDate), normalizeText(latestByDate.endDate)].join("|")
      : "";
    if (latestKey && currentKey && latestKey !== currentKey && !isPresentLike(resolvedCurrent.row?.endDate)) {
      flags.push("current_role_not_latest");
    }
  }

  return Array.from(new Set(flags));
}

function dedupeExperienceRows(rows = []) {
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    const key = [
      normalizeText(row.company),
      normalizeText(row.designation),
      normalizeText(row.startDate),
      normalizeText(row.endDate)
    ].join("|");
    if (!key.replace(/\|/g, "")) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function formatExactDurationFromMonths(totalMonths = 0) {
  const months = Math.max(0, Number(totalMonths) || 0);
  if (!months) return "";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years > 0 && rem > 0) return `${years} years ${rem} months`;
  if (years > 0) return `${years} years`;
  return `${rem} months`;
}

function computeTotalExperienceFromTimeline(rows = []) {
  const now = new Date();
  const nowYm = (now.getFullYear() * 12) + (now.getMonth() + 1);
  const intervals = [];

  for (const row of (rows || [])) {
    const s = toYmScore(String(row?.startDate || "").trim());
    let e = toYmScore(String(row?.endDate || "").trim());
    if (isPresentLike(String(row?.endDate || "").trim()) || e >= 999999) e = nowYm;
    if (s > 0 && e > 0 && e >= s) intervals.push([s, e]);
  }
  if (!intervals.length) return "";

  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [s, e] of intervals) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push([s, e]);
      continue;
    }
    // Merge overlaps/adjacent ranges to avoid double counting.
    if (s <= last[1] + 1) {
      if (e > last[1]) last[1] = e;
    } else {
      merged.push([s, e]);
    }
  }

  let months = 0;
  for (const [s, e] of merged) months += (e - s + 1); // inclusive months
  return formatExactDurationFromMonths(months);
}

function isBadValidationFailure(flags = []) {
  const set = new Set(Array.isArray(flags) ? flags : []);
  const critical = [
    "current_company_missing",
    "current_designation_missing",
    "experience_empty",
    "company_looks_like_date_line",
    "company_looks_like_tagline",
    "company_looks_like_responsibility",
    "current_company_education_like",
    "date_range_impossible",
    "multiple_present_roles_conflict"
  ];
  if (critical.some((code) => set.has(code))) return true;
  return set.size >= 5;
}

function validateAndCleanOutput(candidate = {}, context = {}) {
  const flags = [];
  const timelineRaw = mapTimelineRows(candidate.experienceTimeline || []);
  const headerRows = extractHeaderRowsFromRawText(String(context?.rawText || ""));
  const cleanedTimeline = [];
  for (const row of timelineRaw) {
    const company = String(row.company || "").trim();
    const designation = String(row.designation || "").trim();
    const dropAsFakeCompany =
      !!company && (
        looksLikeDateMetaText(company) ||
        looksLikeTaglineText(company) ||
        looksLikeResponsibilityText(company) ||
        looksLikeEducationLine(company)
      );

    const nextRow = { ...row };
    if (looksLikeTableStyleCompositeRow(nextRow)) {
      // Table/export rows mixing degree/contact/date are not valid experience rows.
      nextRow.company = "";
      nextRow.designation = "";
      nextRow.startDate = "";
      nextRow.endDate = "";
      flags.push("table_row_non_experience_filtered");
    }
    if (dropAsFakeCompany) {
      nextRow.company = "";
      flags.push("company_invalid_shape");
    }
    if (looksLikeDateMetaText(nextRow.designation)) {
      nextRow.designation = "";
      flags.push("designation_invalid_shape");
    }
    if (looksLikeContactLine(nextRow.designation)) {
      nextRow.designation = "";
      flags.push("designation_looks_like_contact_line");
    }
    nextRow.company = normalizeCompanyName(nextRow.company);
    nextRow.designation = normalizeDesignationText(nextRow.designation);
    nextRow.startDate = normalizeDashAndSpace(nextRow.startDate);
    nextRow.endDate = normalizeDashAndSpace(nextRow.endDate);
    if (nextRow.startDate && nextRow.endDate) {
      const s = toYmScore(nextRow.startDate);
      const e = toYmScore(nextRow.endDate);
      if (s > 0 && e > 0 && e < s) flags.push("date_range_mismatch");
    }
    if (looksLikeProjectDomainHeading(nextRow.company)) {
      const repair = findBestHeaderRepair(nextRow, headerRows);
      if (repair?.company) {
        nextRow.company = normalizeCompanyName(repair.company);
        if (repair.designation && (!nextRow.designation || looksLikeProjectDomainHeading(nextRow.designation))) {
          nextRow.designation = normalizeDesignationText(repair.designation);
        }
        flags.push("company_repaired_from_header_line");
      } else {
        flags.push("company_project_domain_like");
      }
    }

    if (nextRow.company || nextRow.designation || nextRow.startDate || nextRow.endDate) {
      cleanedTimeline.push(nextRow);
    }
  }

  const dedupedTimeline = dedupeExperienceRows(cleanedTimeline);
  if (timelineRaw.length && dedupedTimeline.length < timelineRaw.length) {
    flags.push("experience_dedup_applied");
  }

  const resolvedCurrent = resolveCurrentRoleDeterministically(dedupedTimeline);
  const currentFromTimeline = resolvedCurrent.row || {};
  let currentCompany = normalizeCompanyName(String(currentFromTimeline.company || candidate.currentCompany || "").trim());
  let currentDesignation = normalizeDesignationText(String(currentFromTimeline.designation || candidate.currentDesignation || "").trim());

  if (isPresentLike(currentFromTimeline?.endDate || "") && !String(currentCompany || "").trim()) {
    const inferred = findNearestPreviousValidEmployer(dedupedTimeline, currentFromTimeline);
    if (inferred?.company) {
      currentCompany = normalizeCompanyName(String(inferred.company || "").trim());
      flags.push("current_company_inferred_from_previous_employer_present_blank");
    } else {
      flags.push("present_row_company_blank");
    }
  }

  // Generic guard: if current-row company is generic meta text but designation contains a company-like token,
  // prefer designation-derived company token to avoid "Framework/Platform" as current company.
  if (looksLikeGenericCompanyText(currentCompany)) {
    const fromDesignation = normalizeCompanyName(extractCompanyCandidateFromDesignation(currentDesignation));
    if (fromDesignation && !looksLikeGenericCompanyText(fromDesignation) && !isSuspiciousCompanyCandidate(fromDesignation)) {
      currentCompany = fromDesignation;
      flags.push("current_company_resolved_from_designation_token");
    }
  }

  if (looksLikeContactLine(currentDesignation)) {
    currentDesignation = "";
    flags.push("current_designation_contact_like");
  }
  if (!currentCompany) flags.push("current_company_missing");
  if (!currentDesignation) flags.push("current_designation_missing");
  if (!dedupedTimeline.length) flags.push("experience_empty");
  if (resolvedCurrent.unclear) flags.push("current_role_resolution_unclear");
  if (looksLikeEducationCompanyText(currentCompany)) flags.push("current_company_education_like");
  if (looksLikeContactLine(currentDesignation)) flags.push("current_designation_contact_like");
  if (looksLikeDateMetaText(currentCompany)) flags.push("company_looks_like_date_line");
  if (looksLikeTaglineText(currentCompany)) flags.push("company_looks_like_tagline");
  if (looksLikeResponsibilityText(currentCompany)) flags.push("company_looks_like_responsibility");

  const educationRows = Array.isArray(candidate.education) ? candidate.education : [];
  const educationSection = String(context?.detectedSections?.education || context?.detectedSections?.education_qualification || "").trim();
  if (!educationSection && educationRows.length > 0) {
    flags.push("education_section_suspicious");
  }
  const rawText = String(context?.rawText || "");
  if (!educationSection && /\b(education|academic qualification|qualifications|academics)\b/i.test(rawText)) {
    flags.push("education_section_not_detected");
  }

  let blankCompanies = 0;
  for (const row of dedupedTimeline) if (!String(row.company || "").trim()) blankCompanies += 1;
  if (dedupedTimeline.length && blankCompanies >= Math.max(2, Math.ceil(dedupedTimeline.length * 0.5))) {
    flags.push("too_many_blank_companies");
  }
  const detectedDateRanges = Number(context?.detectedDateRangeCount || 0);
  if (detectedDateRanges >= 3 && dedupedTimeline.length > 0 && dedupedTimeline.length + 1 < detectedDateRanges) {
    flags.push("experience_count_too_low_vs_detected_dates");
  }
  const timelineConflictFlags = detectTimelineConflicts(dedupedTimeline, resolvedCurrent);
  if (timelineConflictFlags.length) flags.push("timeline_chronology_suspicious");
  flags.push(...timelineConflictFlags);

  return {
    cleaned: {
      ...candidate,
      totalExperience: computeTotalExperienceFromTimeline(dedupedTimeline) || String(candidate?.totalExperience || "").trim(),
      currentCompany,
      currentDesignation,
      experienceTimeline: dedupedTimeline
    },
    flags: Array.from(new Set(flags))
  };
}

function buildFinalCandidateShape({ parsed, normalized }) {
  const aiTimeline = mapTimelineRows(normalized?.timeline || []);
  const ruleTimeline = mapTimelineRows(parsed?.experienceTimeline || []);
  const experienceTimeline = aiTimeline.length ? aiTimeline : ruleTimeline;
  const resolvedCurrent = resolveCurrentRoleDeterministically(experienceTimeline);
  const fallbackCurrent = resolvedCurrent.row || pickCurrentFromTimeline(experienceTimeline);

  return {
    candidateName: String(normalized?.candidateName || parsed?.candidateName || "").trim(),
    currentCompany: normalizeCompanyName(String(fallbackCurrent.company || parsed?.currentCompany || normalized?.currentCompany || "").trim()),
    currentDesignation: normalizeDesignationText(String(fallbackCurrent.designation || parsed?.currentDesignation || normalized?.currentDesignation || "").trim()),
    totalExperience: String(normalized?.totalExperience || parsed?.totalExperience || "").trim(),
    highestQualification: String(normalized?.highestEducation || parsed?.highestQualification || parsed?.highestEducation || "").trim(),
    experienceTimeline,
    education: Array.isArray(normalized?.education) && normalized.education.length
      ? normalized.education
      : (Array.isArray(parsed?.education) ? parsed.education : []),
    skills: Array.isArray(normalized?.skills) && normalized.skills.length
      ? normalized.skills
      : (Array.isArray(parsed?.skills) ? parsed.skills : []),
    parserWarnings: Array.isArray(parsed?.parserWarnings) ? parsed.parserWarnings : []
  };
}

async function parseCandidateHybrid({ payload, apiKey = "", model = "", normalizeWithAi = true }) {
  const parsed = await parseCandidatePayload(payload);
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

  let normalized = null;
  let aiParseAttempted = false;
  let aiPrimaryUsed = false;
  let fallbackToRuleTriggered = false;
  let aiMode = "rule_only_no_api_key";

  if (normalizeWithAi && apiKey) {
    const canUseFileAi = payload?.file?.fileData && supportsOpenAiFileParse(payload.file);
    aiParseAttempted = true;
    if (parsed.rawText) {
      normalized = await normalizeCandidateWithAi({
        apiKey,
        model: String(model || "").trim(),
        rawText: parsed.rawText,
        sourceType: parsed.sourceType,
        filename: parsed.filename,
        fallbackFields
      });
      aiMode = "ai_text_primary";
    } else if (canUseFileAi) {
      normalized = await normalizeCandidateFileWithAi({
        apiKey,
        model: String(model || "").trim(),
        uploadedFile: payload.file,
        sourceType: parsed.sourceType,
        filename: parsed.filename,
        fallbackFields
      });
      aiMode = "ai_file_primary";
    }
  }

  const aiPrimaryCandidate = buildFinalCandidateShape({ parsed, normalized });
  const aiValidation = validateAndCleanOutput(aiPrimaryCandidate, {
    detectedSections: parsed.detectedSections || {},
    rawText: parsed.rawText || "",
    detectedDateRangeCount: Array.isArray(parsed.timeline) ? parsed.timeline.length : 0
  });
  let finalCandidate = aiValidation.cleaned;
  let finalFlags = aiValidation.flags;

  if (normalized && finalFlags.length === 0) {
    aiPrimaryUsed = true;
  } else {
    fallbackToRuleTriggered = Boolean(normalized);
    const ruleOnlyCandidate = buildFinalCandidateShape({ parsed, normalized: null });
    const ruleValidation = validateAndCleanOutput(ruleOnlyCandidate, {
      detectedSections: parsed.detectedSections || {},
      rawText: parsed.rawText || "",
      detectedDateRangeCount: Array.isArray(parsed.timeline) ? parsed.timeline.length : 0
    });
    if (!normalized) {
      finalCandidate = ruleValidation.cleaned;
      finalFlags = ruleValidation.flags;
      aiMode = "rule_only_no_api_key";
    } else if (isBadValidationFailure(aiValidation.flags) && ruleValidation.flags.length < aiValidation.flags.length) {
      finalCandidate = ruleValidation.cleaned;
      finalFlags = [...ruleValidation.flags, "ai_validation_fallback_used"];
      aiMode = "rule_fallback_after_ai_validation_fail";
    } else {
      aiPrimaryUsed = true;
      aiMode = `${aiMode}_kept_with_review`;
    }
  }

  // Phase-1 block repair: build experience blocks from raw text and prefer them when meaningful.
  const blockRows = buildExperienceRowsFromBlocks(parsed.rawText || "");
  if (normalized && blockRows.length >= 1) {
    if (shouldPreferBlockRowsOverAi(normalized.timeline || [], blockRows)) {
      normalized.timeline = blockRows.map((r) => ({
        company: r.company || null,
        designation: r.designation || null,
        start: r.startDate || null,
        end: r.endDate || null,
        duration: null,
        sourceText: r.sourceText || null
      }));
    }
  } else if (!normalized && blockRows.length >= 1) {
    parsed.experienceTimeline = blockRows.map((r) => ({
      company: r.company || "",
      designation: r.designation || "",
      startDate: r.startDate || "",
      endDate: r.endDate || "",
      sourceText: r.sourceText || ""
    }));
  }

  const selectedNormalized = aiPrimaryUsed ? normalized : null;
  const recomputedCandidate = buildFinalCandidateShape({ parsed, normalized: selectedNormalized });
  const recomputedValidation = validateAndCleanOutput(recomputedCandidate, {
    detectedSections: parsed.detectedSections || {},
    rawText: parsed.rawText || "",
    detectedDateRangeCount: Array.isArray(parsed.timeline) ? parsed.timeline.length : 0
  });
  finalCandidate = recomputedValidation.cleaned;
  finalFlags = recomputedValidation.flags;
  if (aiMode === "rule_fallback_after_ai_validation_fail") {
    finalFlags = [...finalFlags, "ai_validation_fallback_used"];
  }

  // Hard education-like company rejection and safe fallback chain.
  if (looksLikeEducationCompanyText(finalCandidate.currentCompany || "")) {
    const timelineCandidate = (finalCandidate.experienceTimeline || []).find((row) => !looksLikeEducationCompanyText(row?.company || "") && !isSuspiciousCompanyCandidate(row?.company || ""));
    const ruleCompany = String(parsed?.currentCompany || "").trim();
    if (timelineCandidate?.company) {
      finalCandidate.currentCompany = normalizeCompanyName(timelineCandidate.company);
      finalCandidate.currentDesignation = normalizeDesignationText(String(timelineCandidate.designation || finalCandidate.currentDesignation || "").trim());
    } else if (ruleCompany && !looksLikeEducationCompanyText(ruleCompany) && !isSuspiciousCompanyCandidate(ruleCompany)) {
      finalCandidate.currentCompany = normalizeCompanyName(ruleCompany);
      if (!String(finalCandidate.currentDesignation || "").trim()) {
        finalCandidate.currentDesignation = normalizeDesignationText(String(parsed?.currentDesignation || "").trim());
      }
    } else {
      finalCandidate.currentCompany = "";
      finalFlags.push("current_company_missing");
    }
    finalFlags.push("current_company_education_like");
  }

  finalFlags = Array.from(new Set(finalFlags));

  return {
    parsed,
    normalized,
    finalOutput: {
      ...finalCandidate,
      needsReview: finalFlags.length > 0,
      reviewReasons: finalFlags
    },
    meta: {
      ruleParserUsed: true,
      aiParseAttempted,
      aiPrimaryUsed,
      aiFallbackTriggered: fallbackToRuleTriggered,
      aiMode,
      finalRedFlags: finalFlags
    }
  };
}

module.exports = {
  parseCandidateHybrid,
  validateAndCleanOutput
};
