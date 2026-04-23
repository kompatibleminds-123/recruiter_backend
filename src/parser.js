const { PDFParse } = require("pdf-parse");
const mammoth = require("mammoth");

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

function sanitizeText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\s\?\s/g, " - ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitLines(text) {
  return sanitizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function base64ToBuffer(base64) {
  return Buffer.from(String(base64 || ""), "base64");
}

function stripRtf(rtf) {
  return String(rtf || "")
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-fA-F]{2}/g, "")
    .replace(/\\[a-z]+\d* ?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseDateRange(text) {
  const normalized = String(text || "").replace(/[\u2013\u2014\u2212]/g, "-");

  // Prefer explicit year-only ranges like "2020-2023" or "2020 to 2023"
  // before falling back to "any year in the line" (which can be noisy in CV bullets).
  const yearRange = normalized.match(/\b(19\d{2}|20\d{2})\b\s*(?:-|to)\s*\b(19\d{2}|20\d{2}|present|current|till date)\b/i);
  if (yearRange) {
    const startYear = Number(yearRange[1]);
    const endToken = String(yearRange[2] || "").toLowerCase();
    if (endToken === "present" || endToken === "current" || endToken === "till date") {
      const now = new Date();
      return {
        start: { year: startYear, month: 0 },
        end: { year: now.getFullYear(), month: now.getMonth() },
        isCurrent: true
      };
    }
    const endYear = Number(endToken);
    if (Number.isFinite(startYear) && Number.isFinite(endYear)) {
      return { start: { year: startYear, month: 0 }, end: { year: endYear, month: 11 }, isCurrent: false };
    }
  }

  const matches = Array.from(
    normalized.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,-]+(?:'(\d{2})|(\d{4}))/ig)
  ).map((match) => ({
    month: MONTH_INDEX[String(match[1] || "").toLowerCase()],
    year: match[2] ? 2000 + Number(match[2]) : Number(match[3])
  }));

  let start = matches[0] || null;
  let end = matches[1] || null;
  let isCurrent = false;

  const yearOnlyMatches = Array.from(normalized.matchAll(/\b(19\d{2}|20\d{2})\b/g)).map((match) => Number(match[1]));
  if (!start && yearOnlyMatches.length >= 1) {
    start = { year: yearOnlyMatches[0], month: 0 };
  }
  if (!end && yearOnlyMatches.length >= 2) {
    end = { year: yearOnlyMatches[1], month: 11 };
  }

  if (/\bpresent\b|\bcurrent\b|\btill date\b/i.test(normalized)) {
    isCurrent = true;
    const now = new Date();
    end = { year: now.getFullYear(), month: now.getMonth() };
  }

  return { start, end, isCurrent };
}

function normalizeDateSeparatorText(value) {
  return String(value || "")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\s\?\s/g, " - ");
}

function monthIndex(value) {
  if (!value || !Number.isInteger(value.year) || !Number.isInteger(value.month)) return null;
  return value.year * 12 + value.month;
}

function formatMonthYear(value) {
  if (!value || !Number.isInteger(value.year) || !Number.isInteger(value.month)) return "";
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[value.month]} ${value.year}`;
}

function formatMonthCount(totalMonths) {
  const months = Number(totalMonths || 0);
  if (!months) return "";
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  if (years && remainder) return `${years} years ${remainder} months`;
  if (years) return years === 1 ? "1 year" : `${years} years`;
  return months === 1 ? "1 month" : `${months} months`;
}

function extractCandidateName(lines, rawText, hint) {
  const hintName = sanitizeText(hint);
  if (hintName && hintName.length <= 80) return hintName;

  const firstLine = String(lines[0] || "").trim();
  const firstLineBeforeParen = firstLine.split("(")[0].trim();
  if (/^[A-Z][A-Z\s'.-]{3,}$/.test(firstLineBeforeParen) && firstLineBeforeParen.length <= 80) {
    return firstLineBeforeParen.replace(/\s+/g, " ").trim();
  }

  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3}$/.test(firstLine) && firstLine.length <= 80) {
    return firstLine;
  }

  const linkedInMatch = rawText.match(/linkedin:\s*[^\n|]*\/in\/([a-z0-9-]+)/i);
  if (linkedInMatch?.[1]) {
    return linkedInMatch[1]
      .split("-")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  const profileMatch = rawText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3})\b/);
  return profileMatch?.[1] || "";
}

function extractTotalExperience(_lines, rawText, hint) {
  const cleanHint = sanitizeText(hint);
  if (cleanHint) return cleanHint;

  const text = String(rawText || "");

  // Prefer decimal years if present (e.g., "4.5 years") and normalize to years + months.
  // This avoids accidental matches like ".5 years" => "5 years".
  const decimalMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:years?|yrs?)\b/i);
  if (decimalMatch?.[1]) {
    const value = Number(decimalMatch[1]);
    if (Number.isFinite(value) && value > 0) {
      const years = Math.floor(value);
      let months = Math.round((value - years) * 12);
      let normalizedYears = years;
      if (months >= 12) {
        normalizedYears += 1;
        months = 0;
      }
      const totalMonths = normalizedYears * 12 + months;
      const formatted = formatMonthCount(totalMonths);
      if (formatted) return formatted;
    }
  }

  const patterns = [
    /\b(\d+\+?\s*(?:years?|yrs?)\s*\d*\s*(?:months?|mos?)?)\b/i,
    /\b(\d+\s*(?:years?|yrs?))\b/i,
    /\b(\d+\s*(?:months?|mos?))\b/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

function extractPrimaryEmail(rawText) {
  const text = String(rawText || "");
  const labeled = text.match(/(?:email|e-mail)\s*[:|]?\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i);
  if (labeled?.[1]) return labeled[1].trim();
  const match = text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i);
  return match?.[0] || "";
}

function extractPrimaryPhone(rawText) {
  const text = String(rawText || "");
  const labeled = text.match(/(?:phone|mobile|mob|contact|m)\s*[:|]?\s*(\+?\d[\d\s().-]{7,}\d)/i);
  if (labeled?.[1]) {
    return labeled[1].replace(/[^\d+]/g, "");
  }

  const matches = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || [];
  const normalized = matches
    .map((value) => value.replace(/[^\d+]/g, ""))
    .filter((value) => {
      const digits = value.replace(/\D/g, "");
      return digits.length >= 10 && digits.length <= 15;
    })
    .filter((value) => !/^(19|20)\d{8,}$/.test(value.replace(/\D/g, "")));

  return normalized[0] || "";
}

function extractPrimaryLinkedIn(rawText) {
  const text = String(rawText || "");
  const match = text.match(/\b(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-z0-9-_%/]+\b/i);
  if (!match?.[0]) return "";
  let value = match[0].trim().replace(/[),.;]+$/, "");
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  return value;
}

function normalizeHeadingLikeText(line) {
  return String(line || "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function isNoiseLine(line) {
  return /^(experience|workexperience|professionalsummary|profilesummary|about|skills|education|activity|certifications|projects|responsibilities|salesmethodologies&techstack|techstack|keyachievements|awards|languages|executivesummary|corecompetencies|extracurricular)$/i.test(
    normalizeHeadingLikeText(line)
  );
}

function looksLikeExperienceDate(line) {
  return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,-]+(?:'\d{2}|\d{4})\b/i.test(line) &&
    (/\bpresent\b|\bcurrent\b|\btill date\b/i.test(line) || /[-\u2013\u2014\u2212]/.test(line) || /\b\d+\s+(?:yr|yrs|year|years|mo|mos|month|months)\b/i.test(line));
}

function cleanCompanyLine(line) {
  return String(line || "")
    .split("|")[0]
    .replace(/\s+\d+\s+years?(?:\s+\d+\s+months?)?$/i, "")
    .replace(/\s+\d+\s+months?$/i, "")
    .replace(/^[^A-Za-z0-9(]+/, "")
    .trim();
}

function companyLineScore(line) {
  const value = cleanCompanyLine(line);
  if (!value) return -100;
  let score = 0;
  if (/,/.test(value)) score += 2;
  if (!/[.]$/.test(value)) score += 2;
  if (/^[A-Z]/.test(value)) score += 2;
  const titleCaseTokens = (value.match(/\b[A-Z][A-Za-z&.-]+\b/g) || []).length;
  score += Math.min(titleCaseTokens, 4);
  if (/\b(owned|achieved|drove|built|led|managed|executed|collaborated|working|worked|support|guide|identify|create|design|enable)\b/i.test(value)) {
    score -= 5;
  }
  if (/\b(goal|responsibility|project|solution|client|business|strategy)\b/i.test(value) && !/,/.test(value)) {
    score -= 2;
  }
  return score;
}

function looksLikeBulletLine(line) {
  return /^[^A-Za-z0-9(]+/.test(String(line || "").trim());
}

function isLikelyCompanyLine(line) {
  const value = cleanCompanyLine(line);
  if (!value) return false;
  if (isNoiseLine(value) || looksLikeExperienceDate(value) || looksLikeBulletLine(value)) return false;
  if (value.length > 120) return false;
  if (/[.]$/.test(value) && !/,/.test(value)) return false;
  if (/\bowned\b|\bachieved\b|\bdrove\b|\bbuilt\b|\bled\b|\bmanaged\b|\bexecuted\b|\bcollaborated\b/i.test(value)) return false;
  return true;
}

function parseTitleAndCompany(windowLines) {
  const useful = windowLines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isNoiseLine(line))
    .filter((line) => !looksLikeExperienceDate(line))
    .filter((line) => !looksLikeBulletLine(line))
    .slice(0, 3);

  const first = useful[0] || "";
  const second = useful[1] || "";
  if (first.includes(" at ")) {
    const parts = first.split(/\s+at\s+/i);
    return {
      title: parts[0]?.trim() || "",
      company: parts.slice(1).join(" at ").trim() || second
    };
  }

  return {
    title: first,
    company: second
  };
}

function extractTitleDateCompany(lines, index) {
  const line = String(lines[index] || "").trim();
  const previousLine = String(lines[index - 1] || "").trim();
  const nextLine = String(lines[index + 1] || "").trim();
  const dateMatch = line.match(/^(.*?)(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,-]+(?:'\d{2}|\d{4}).*)$/i);
  if (!dateMatch) return null;

  const prefix = dateMatch[1]
    .trim()
    .replace(/^[^A-Za-z0-9(]+/, "")
    .replace(/\s*\|\s*$/, "")
    .trim();
  const dates = dateMatch[2].trim();

  // Some CVs encode company + title in one line:
  // - "Company (Title) | Jul 2023 - Jan 2025"
  // - "Company | Location | Title | Mar 2023 - Jun 2023"
  let title = prefix;
  let companyInline = "";

  function looksLikeCompanyName(value) {
    const text = String(value || "").trim();
    if (!text) return false;
    if (/\b(pvt|private|ltd|limited|inc|llc|corp|co\.|company|technologies|services|solutions|systems|consulting|group)\b/i.test(text)) {
      return true;
    }
    const letters = text.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 6) {
      const upper = letters.replace(/[^A-Z]/g, "").length;
      const ratio = upper / letters.length;
      if (ratio >= 0.7) return true;
    }
    return false;
  }

  const paren = prefix.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (paren?.[1] && paren?.[2]) {
    // If the left side looks like a company (e.g., "MUDS ... PRIVATE LIMITED (BDM)"),
    // treat it as company. Otherwise it's likely a title (e.g., "Assistant Sales Manager (Portfolio Manager)"),
    // and the company should come from neighbor lines.
    if (looksLikeCompanyName(paren[1])) {
      companyInline = cleanCompanyLine(paren[1]);
      title = String(paren[2] || "").trim();
    } else {
      companyInline = "";
      title = prefix;
    }
  } else if (prefix.includes("|")) {
    const parts = prefix.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      companyInline = cleanCompanyLine(parts[0]);
      title = parts[parts.length - 1];
    }
  }

  const prevScore = isLikelyCompanyLine(previousLine) ? companyLineScore(previousLine) : -100;
  const nextScore = isLikelyCompanyLine(nextLine) ? companyLineScore(nextLine) : -100;
  const companyNeighbor = prevScore >= nextScore ? cleanCompanyLine(previousLine) : cleanCompanyLine(nextLine);
  const company = companyInline && isLikelyCompanyLine(companyInline) ? companyInline : companyNeighbor;
  if (!title || !company) return null;
  if (!isLikelyCompanyLine(company)) return null;

  return { title, company, dates };
}

function extractExperienceSection(rawText) {
  const text = String(rawText || "");
  const rawLines = splitLines(text);
  if (!rawLines.length) return text;

  const START_HEADINGS = new Set(["experience", "workexperience", "professionalexperience"]);
  const END_HEADINGS = new Set([
    "education",
    "projects",
    "certifications",
    "volunteering",
    "recommendations",
    "languages",
    "achievements",
    "skills"
  ]);

  // Find the first true "Experience" heading line (avoid matching "experience" inside a sentence).
  let startIdx = -1;
  for (let i = 0; i < rawLines.length; i += 1) {
    const key = normalizeHeadingLikeText(rawLines[i]).replace(/[^a-z]/g, "");
    if (START_HEADINGS.has(key)) {
      startIdx = i;
      break;
    }
  }
  if (startIdx < 0) return text;

  // Stop at the next section heading line (line-based, so "Technical Skills: ..." won't prematurely cut it).
  let endIdx = rawLines.length;
  for (let i = startIdx + 1; i < rawLines.length; i += 1) {
    const normalized = normalizeHeadingLikeText(rawLines[i]);
    const key = normalized.replace(/[^a-z]/g, "");
    if (!key) continue;

    // Heading lines tend to be short; this reduces accidental matches in long sentences.
    if (rawLines[i].length > 45) continue;

    if (END_HEADINGS.has(key)) {
      endIdx = i;
      break;
    }

    // Handle headings like "Projects (relevant...)" or "Skills & Tools".
    for (const prefix of END_HEADINGS) {
      if (key.startsWith(prefix) && key.length <= prefix.length + 18) {
        endIdx = i;
        i = rawLines.length;
        break;
      }
    }
  }

  return rawLines.slice(startIdx, endIdx).join("\n");
}

function extractTimeline(lines, rawText, structuredExperienceText) {
  const entries = [];
  const seen = new Set();

  const structuredLines = splitLines(structuredExperienceText);
  for (const line of structuredLines) {
    const title = line.match(/Title:\s*([^|]+)/i)?.[1]?.trim() || "";
    const company = line.match(/Company:\s*([^|]+)/i)?.[1]?.trim() || "";
    const dates = line.match(/Dates:\s*([^|]+)/i)?.[1]?.trim() || "";
    if (!company || !dates) continue;
    const key = `${title}|${company}|${dates}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ title, company, dates, ...parseDateRange(dates) });
  }

  for (let i = 0; i < lines.length; i += 1) {
    const direct = extractTitleDateCompany(lines, i);
    if (direct) {
      const key = `${direct.title}|${direct.company}|${direct.dates}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ ...direct, ...parseDateRange(direct.dates) });
      }
      continue;
    }

    const dates = lines[i];
    const looksLikeYearOnlyDate = /\b(?:19|20)\d{2}\s*[-\u2013\u2014\u2212]\s*(?:present|current|till date|(?:19|20)\d{2})\b/i.test(dates);
    if (!looksLikeExperienceDate(dates) && !looksLikeYearOnlyDate) continue;

    const context = lines.slice(Math.max(0, i - 4), i).reverse();
    const { title, company } = parseTitleAndCompany(context);
    if (!company || !dates || !isLikelyCompanyLine(company)) continue;

    const key = `${title}|${company}|${dates}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ title, company, dates, ...parseDateRange(dates) });
  }

  const normalized = entries
    .map((entry) => {
      const startIndex = monthIndex(entry.start);
      const endIndex = monthIndex(entry.end);
      const durationMonths = startIndex !== null && endIndex !== null ? Math.max(1, endIndex - startIndex + 1) : 0;
      return {
        title: entry.title,
        company: entry.company,
        start: formatMonthYear(entry.start),
        end: entry.isCurrent ? "Present" : formatMonthYear(entry.end),
        duration: formatMonthCount(durationMonths) || entry.dates,
        rawDates: entry.dates,
        startIndex,
        endIndex,
        isCurrent: entry.isCurrent
      };
    })
    .filter((entry) => entry.start)
    .filter((entry) => {
      const company = String(entry.company || "").trim();
      const title = String(entry.title || "").trim();
      if (!company && !title) return false;
      return true;
    })
    .sort((a, b) => (b.startIndex || 0) - (a.startIndex || 0));

  const gaps = [];
  for (let i = 0; i < normalized.length - 1; i += 1) {
    const newer = normalized[i];
    const older = normalized[i + 1];
    if (newer.startIndex === null || older.endIndex === null) continue;
    const gapMonths = newer.startIndex - older.endIndex - 1;
    if (gapMonths < 3) continue;
    gaps.push({
      from: older.end,
      to: newer.start,
      duration: formatMonthCount(gapMonths),
      afterCompany: older.company,
      beforeCompany: newer.company
    });
  }

  const shortStints = normalized
    .filter((entry) => {
      const monthsMatch = entry.duration.match(/(\d+)\s+month/i);
      const yearsMatch = entry.duration.match(/(\d+)\s+year/i);
      const months = (yearsMatch ? Number(yearsMatch[1]) * 12 : 0) + (monthsMatch ? Number(monthsMatch[1]) : 0);
      return months > 0 && months < 18;
    })
    .map((entry) => ({
      company: entry.company,
      duration: entry.duration,
      start: entry.start,
      end: entry.end
    }));

  const rawTextPreview = sanitizeText(rawText).slice(0, 4000);
  const highlights = [];
  if (/\bsaas\b/i.test(rawTextPreview)) highlights.push("SaaS exposure mentioned");
  if (/\benterprise\b/i.test(rawTextPreview)) highlights.push("Enterprise context mentioned");
  if (/\bus\b|\bcanada\b|\bnorth america\b/i.test(rawTextPreview)) highlights.push("US / North America market exposure mentioned");
  if (/\bquota\b|\btarget\b|\bpipeline\b|\barr\b|\bconversion\b/i.test(rawTextPreview)) highlights.push("Commercial metrics mentioned");

  return {
    timeline: normalized.map(({ startIndex, endIndex, ...entry }) => entry),
    gaps,
    shortStints,
    highlights
  };
}

function extractCurrentRoleFromTimeline(timeline) {
  const current = (timeline || []).find((entry) => String(entry.end || "").toLowerCase() === "present");
  if (current) {
    return {
      currentCompany: current.company || "",
      currentDesignation: current.title || ""
    };
  }
  return {
    currentCompany: "",
    currentDesignation: ""
  };
}

async function extractTextFromUploadedFile(file) {
  if (!file?.fileData) return "";

  const mimeType = String(file.mimeType || "").toLowerCase();
  const filename = String(file.filename || "").toLowerCase();
  const buffer = base64ToBuffer(file.fileData);

  if (mimeType.includes("pdf") || filename.endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const parsed = await parser.getText();
      return sanitizeText(parsed.text || "");
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (mimeType.includes("wordprocessingml") || filename.endsWith(".docx")) {
    const parsed = await mammoth.extractRawText({ buffer });
    return sanitizeText(parsed.value || "");
  }

  if (mimeType.includes("msword") || filename.endsWith(".doc")) {
    throw new Error("Legacy .doc parsing is not supported yet. Please upload PDF or DOCX.");
  }

  if (mimeType.includes("rtf") || filename.endsWith(".rtf")) {
    return sanitizeText(stripRtf(buffer.toString("utf8")));
  }

  if (mimeType.includes("text/plain") || filename.endsWith(".txt")) {
    return sanitizeText(buffer.toString("utf8"));
  }

  throw new Error("Unsupported CV file type. Please upload PDF, DOCX, RTF, or TXT.");
}

async function parseCandidatePayload(payload) {
  const sourceType = sanitizeText(payload?.sourceType || "manual") || "manual";
  const extractedFileText = await extractTextFromUploadedFile(payload?.file || null);
  const rawText = sanitizeText(payload?.rawText || payload?.pageText || payload?.text || extractedFileText || "");
  const experienceText = extractExperienceSection(rawText);
  const structuredExperienceText = sanitizeText(payload?.structuredExperience || "");
  const rawLines = splitLines(rawText);
  const lines = splitLines(experienceText);

  if (!rawText && !structuredExperienceText) {
    throw new Error("Provide candidate text, page text, or structured experience to parse.");
  }

  const candidateName = extractCandidateName(rawLines, rawText, payload?.candidateName);
  const totalExperience = extractTotalExperience(lines, rawText, payload?.totalExperience);
  const parsed = extractTimeline(lines, experienceText, structuredExperienceText);
  const currentRole = extractCurrentRoleFromTimeline(parsed.timeline);
  const emailId = extractPrimaryEmail(rawText);
  const phoneNumber = extractPrimaryPhone(rawText);
  const linkedinUrl = extractPrimaryLinkedIn(rawText);

  return {
    candidateName,
    totalExperience,
    currentCompany: currentRole.currentCompany,
    currentDesignation: currentRole.currentDesignation,
    emailId,
    phoneNumber,
    linkedinUrl,
    sourceType,
    filename: sanitizeText(payload?.file?.filename || ""),
    timeline: parsed.timeline,
    gaps: parsed.gaps,
    shortStints: parsed.shortStints,
    highlights: parsed.highlights,
    rawTextPreview: rawText.slice(0, 2000),
    rawText
  };
}

module.exports = {
  parseCandidatePayload
};
