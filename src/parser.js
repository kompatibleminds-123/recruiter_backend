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
    .replace(/[’‘`´]/g, "'")
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

function findEvidenceSpan(haystack, needle, section = "raw_cv_text") {
  const source = String(haystack || "");
  const token = String(needle || "").trim();
  if (!source || !token) return null;
  const idx = source.toLowerCase().indexOf(token.toLowerCase());
  if (idx < 0) return null;
  return {
    start_offset: idx,
    end_offset: idx + token.length,
    text: source.slice(idx, idx + token.length),
    section
  };
}

function detectCvSections(rawText) {
  const text = String(rawText || "");
  const lines = splitLines(text);
  if (!lines.length) {
    return {
      contact: "",
      summary_profile: "",
      skills: "",
      work_experience: "",
      projects: "",
      education_qualification: "",
      certifications: ""
    };
  }

  const sectionOrder = [
    "contact",
    "summary_profile",
    "skills",
    "work_experience",
    "projects",
    "education_qualification",
    "certifications"
  ];
  const starts = [];
  const mapHeading = (line) => {
    const key = normalizeHeadingLikeText(line).replace(/[^a-z]/g, "");
    if (!key) return "";
    if (/^(contact|contactdetails|personaldetails|profile|aboutme)$/.test(key)) return "contact";
    if (/^(summary|careerobjective|objective|profilesummary|professionalsummary)$/.test(key)) return "summary_profile";
    if (/^(skills|technicalskills|keyskills|competencies)$/.test(key)) return "skills";
    if (/^(experience|workexperience|professionalexperience|employmenthistory|workhistory|employmentprofile|professionalprofile)$/.test(key)) return "work_experience";
    if (/^(projects|projectexperience)$/.test(key)) return "projects";
    if (/^(education|qualification|educationqualification|academics|educationhistory|academicdetails|academicprofile)$/.test(key)) return "education_qualification";
    if (/^(certification|certifications|licenses|license)$/.test(key)) return "certifications";
    return "";
  };

  lines.forEach((line, index) => {
    const section = mapHeading(line);
    if (section) starts.push({ section, index });
  });

  const out = {};
  for (const key of sectionOrder) out[key] = "";
  if (!starts.length) {
    out.work_experience = extractExperienceSection(text);
    return out;
  }

  for (let i = 0; i < starts.length; i += 1) {
    const curr = starts[i];
    const next = starts[i + 1];
    const from = curr.index + 1;
    const to = next ? next.index : lines.length;
    const chunk = lines.slice(from, to).join("\n").trim();
    if (!out[curr.section]) out[curr.section] = chunk;
  }
  if (!out.work_experience) {
    out.work_experience = extractExperienceSection(text);
  }
  out.education = out.education_qualification || "";
  return out;
}

function normalizeLooseText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .trim();
}

function normalizeCompanyDisplay(value) {
  return normalizeLooseText(String(value || ""))
    .replace(/\bPVT\.?LTD\.?\b/gi, "PVT. LTD.")
    .replace(/\bPVT LTD\b/gi, "PVT. LTD.")
    .replace(/\bLTD\b(?!\.)/gi, "LTD.")
    .replace(/\b(THANE|MUMBAI|BANGALORE|BENGALURU|NOIDA|GURUGRAM|GURGAON|PUNE)\s*,?\s*INDIA$/i, "")
    .replace(/\b(THANE|MUMBAI|BANGALORE|BENGALURU|NOIDA|GURUGRAM|GURGAON|PUNE)$/i, "")
    .replace(/(\)|\bPVT\. LTD\.|\bLIMITED|\bINC\.?|\bCORP\.?|\bCORPORATION)\s+[A-Z][a-z]+,\s*India$/i, "$1")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikeCompanyName(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/\b(pvt|private|ltd|limited|inc|llc|corp|co\.|company|technologies|services|solutions|systems|consulting|group|projects|india)\b/i.test(text)) {
    return true;
  }
  const letters = text.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 6) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    const ratio = upper / letters.length;
    if (ratio >= 0.7) return true;
  }
  return isLikelyCompanyLine(text);
}

function isProjectNoiseLine(value = "") {
  const text = String(value || "").trim();
  if (!text) return true;
  if (/^[•\-◆]/.test(text)) return true;
  if (/\b(projects?\s+involved|project\s+highlights?|job\s+responsibilities|duties\s*&?\s*responsibility|responsibilities?)\b/i.test(text)) return true;
  if (/^(reviewed|prepared|developed|conducted|maintained|supported|coordinated|created|organized|checked|trained|mentored|generated|managed|led|implemented|attending|undertaking|follow-?up|raised|raising)\b/i.test(text)) return true;
  if (/\b(value engineering|cashflow forecasts?|bill of quantities|risk management|measurement standard|client requirement)\b/i.test(text)) return true;
  return false;
}

function isLikelyEducationHeadingLine(value = "") {
  return /^(education|academic qualification|educational details|qualification|qualifications|academic background|academics)\b/i.test(String(value || "").trim());
}

function isLikelySectionBoundaryLine(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  return /^(education|academic qualification|educational details|qualification|qualifications|academic background|academics|projects?|project highlights?|projects involved|skills?|technical skills|computer skills|personal details|personal vitae|declaration|languages known|contact information|career objective|summary|professional summary)\b/i.test(text);
}

function isLikelyDegreeText(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (isProjectNoiseLine(text)) return false;
  return /\b(b\.?\s*tech|b\.?\s*e\.?|bachelor|m\.?\s*b\.?\s*a|mba|pgdm|b\.?\s*b\.?\s*a|bba|b\.?\s*com|b\.?\s*m\.?\s*s|bds|mph|diploma|12th|10th|mca|m\.?\s*tech|m\.?\s*sc|ba|ma|civil engineering|computer science|management|science)\b/i.test(text);
}

function isLikelyInstitutionText(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  if (isProjectNoiseLine(text)) return false;
  return /\b(university|college|institute|school|polytechnic|board|academy)\b/i.test(text);
}

function extractInstitutionPhrase(value = "") {
  const text = normalizeLooseText(value);
  if (!text) return "";
  const match = text.match(/([A-Z][A-Za-z()'.&-]+(?:\s+[A-Z][A-Za-z0-9()'.&-]+){0,10}\s+(?:University|College|Institute|School|Polytechnic|Board|Academy)(?:[^|]{0,40})?)/i);
  return normalizeLooseText(match?.[1] || "");
}

function parseEducationYearSpan(value = "") {
  const text = String(value || "");
  const years = Array.from(text.matchAll(/\b(19\d{2}|20\d{2})\b/g)).map((m) => Number(m[1]));
  if (!years.length) return { year: "", startDate: "", endDate: "" };
  if (years.length === 1) return { year: String(years[0]), startDate: "", endDate: "" };
  return { year: "", startDate: String(years[0]), endDate: String(years[years.length - 1]) };
}

function parseEducationScore(value = "") {
  const text = String(value || "");
  const cgpa = text.match(/\bCGPA\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?(?:\/10)?)\b/i);
  if (cgpa?.[1]) return `CGPA: ${cgpa[1]}`;
  const pct = text.match(/\b([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (pct?.[1]) return `${pct[1]}%`;
  return "";
}

function degreeRank(value = "") {
  const text = String(value || "").toLowerCase();
  if (/\b(ph\.?\s*d|doctorate)\b/.test(text)) return 9;
  if (/\b(mba|pgdm|m\.?\s*tech|mca|master|m\.?\s*e\.?|m\.?\s*sc|m\.?\s*com|m\.?\s*a|mph)\b/.test(text)) return 8;
  if (/\b(b\.?\s*tech|b\.?\s*e\.?|bachelor|bds|b\.?\s*b\.?\s*a|bba|b\.?\s*m\.?\s*s|b\.?\s*sc|b\.?\s*com|bca|ba)\b/.test(text)) return 7;
  if (/\b(diploma)\b/.test(text)) return 6;
  if (/\b(12th|xii|hsc)\b/.test(text)) return 5;
  if (/\b(10th|ssc|matric)\b/.test(text)) return 4;
  return 0;
}

function looksLikeEducationNoiseLine(value = "") {
  const text = normalizeLooseText(value);
  if (!text) return true;
  if (isProjectNoiseLine(text)) return true;
  if (/\b(to work with an organization|career objective|objective|summary|scope of this project|project highlights?|job responsibilities|roles?\s*&?\s*responsibilities|projects involved)\b/i.test(text)) return true;
  if (/\b(organized|reviewed|prepared|checked|conducted|created|managed|coordinated|submitted|trained|mentored|developed|estimated|completed|led|working|worked)\b/i.test(text) && !isLikelyDegreeText(text)) return true;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length > 14 && !isLikelyDegreeText(text) && !isLikelyInstitutionText(text)) return true;
  return false;
}

function looksLikeEducationYearOrScoreLine(value = "") {
  const text = String(value || "").trim();
  if (!text) return false;
  return /\b(19\d{2}|20\d{2})\b/.test(text) || /\bCGPA\b/i.test(text) || /\b\d+(?:\.\d+)?\s*%/.test(text);
}

function buildEducationHistoryFromSection(educationSectionText = "") {
  const lines = splitLines(educationSectionText)
    .map((line) => String(line || "").replace(/^[\s\-•◆]+/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line))
    .filter((line) => !isLikelySectionBoundaryLine(line) || isLikelyEducationHeadingLine(line))
    .filter((line) => !looksLikeEducationNoiseLine(line));

  const rows = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!isLikelyDegreeText(line)) continue;
    if (degreeRank(line) <= 0) continue;

    const prev = String(lines[i - 1] || "").trim();
    const next = String(lines[i + 1] || "").trim();
    const nextTwo = String(lines[i + 2] || "").trim();
    const nextLooksLikeOwnEducationRow = isLikelyDegreeText(next) && degreeRank(next) > 0;
    const nextTwoLooksLikeOwnEducationRow = isLikelyDegreeText(nextTwo) && degreeRank(nextTwo) > 0;
    const extraLines = [];
    if (next && !nextLooksLikeOwnEducationRow && !looksLikeEducationNoiseLine(next) && (isLikelyInstitutionText(next) || looksLikeEducationYearOrScoreLine(next))) extraLines.push(next);
    if (nextTwo && !nextLooksLikeOwnEducationRow && !nextTwoLooksLikeOwnEducationRow && !looksLikeEducationNoiseLine(nextTwo) && (isLikelyInstitutionText(nextTwo) || looksLikeEducationYearOrScoreLine(nextTwo))) extraLines.push(nextTwo);
    const combined = [
      line,
      ...extraLines
    ].filter(Boolean).join(" ");
    let degree = normalizeLooseText(line);
    degree = normalizeLooseText(
      degree
        .replace(/\bfrom\b.*$/i, "")
        .replace(/\bwith\b.*$/i, "")
        .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s,'/-]*\d{2,4}.*$/i, "")
        .replace(/\b(19\d{2}|20\d{2})\b.*$/i, "")
        .replace(/\s+-\s+$/g, "")
    );
    if (degreeRank(degree) <= 0) continue;

    let institution = "";
    const fromInline = combined.match(/\bfrom\s+([^|]+?)(?:\s*-\s*with|\s+with|\s+in\s+\d{4}\b|$)/i);
    if (fromInline?.[1]) {
      institution = normalizeLooseText(fromInline[1]);
    } else if (isLikelyInstitutionText(next)) {
      institution = extractInstitutionPhrase(next) || next;
    } else if (isLikelyInstitutionText(prev)) {
      institution = extractInstitutionPhrase(prev) || prev;
    } else if (isLikelyInstitutionText(combined)) {
      institution = extractInstitutionPhrase(combined);
    }
    if (looksLikeEducationNoiseLine(institution)) institution = "";
    const years = parseEducationYearSpan(combined);
    const score = parseEducationScore(combined);
    rows.push({
      degree: normalizeLooseText(degree),
      institution: normalizeLooseText(institution),
      year: years.year,
      startDate: years.startDate,
      endDate: years.endDate,
      score,
      rawText: normalizeLooseText(combined),
      confidence: institution || years.year || years.startDate ? "high" : "medium"
    });
  }

  const deduped = [];
  const seen = new Set();
  for (const row of rows) {
    const key = [row.degree.toLowerCase(), row.institution.toLowerCase(), row.year, row.startDate, row.endDate].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }
  return deduped.sort((a, b) => {
    const rankDiff = degreeRank(b.degree) - degreeRank(a.degree);
    if (rankDiff) return rankDiff;
    const aYear = Number(a.endDate || a.year || a.startDate || 0);
    const bYear = Number(b.endDate || b.year || b.startDate || 0);
    return bYear - aYear;
  });
}

function buildEducationHistoryFallback(rawText = "") {
  const lines = splitLines(rawText)
    .map((line) => String(line || "").replace(/^[\s\-â€¢â—†ïƒ˜ïµ]+/, "").trim())
    .filter(Boolean);
  const startIndexes = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (isLikelyEducationHeadingLine(lines[i])) startIndexes.push(i);
  }
  if (!startIndexes.length) return [];
  for (const startIndex of startIndexes) {
    const bucket = [];
    for (let i = startIndex + 1; i < lines.length; i += 1) {
      const line = lines[i];
      if (i > startIndex + 1 && isLikelySectionBoundaryLine(line) && !isLikelyEducationHeadingLine(line)) break;
      bucket.push(line);
    }
    const parsed = buildEducationHistoryFromSection(bucket.join("\n"));
    if (parsed.length) return parsed;
  }
  return [];
}

function pickHighestQualificationFromEducationRows(rows = []) {
  const sorted = [...rows]
    .filter((row) => isLikelyDegreeText(row?.degree || ""))
    .sort((a, b) => {
      const rankDiff = degreeRank(b.degree) - degreeRank(a.degree);
      if (rankDiff) return rankDiff;
      const aYear = Number(a.endDate || a.year || a.startDate || 0);
      const bYear = Number(b.endDate || b.year || b.startDate || 0);
      return bYear - aYear;
    });
  return String(sorted[0]?.degree || "").trim();
}

function extractSkillsFromSections(detectedSections = {}, rawText = "") {
  const text = [detectedSections?.skills || "", rawText].filter(Boolean).join("\n");
  const tokens = new Set();
  const known = [
    "autocad", "planswift", "costx", "cost-x", "revit", "tekla", "excel", "powerpoint", "word",
    "java", "react", "nodejs", "dotnet", "spring", "golang", "python", "django", "aws", "sales", "bim"
  ];
  const hay = String(text || "").toLowerCase();
  for (const skill of known) {
    if (hay.includes(skill)) tokens.add(skill === "cost-x" ? "costx" : skill);
  }
  return Array.from(tokens);
}

function computeParserConfidenceSummary({ timeline = [], education = [], currentCompany = "", currentDesignation = "", phoneNumber = "", emailId = "" }) {
  const experienceConfidence = timeline.length >= 2 ? "high" : (timeline.length === 1 ? "medium" : "low");
  const educationConfidence = education.length ? "high" : "low";
  const contactConfidence = phoneNumber || emailId ? "high" : "medium";
  const identityConfidence = currentCompany && currentDesignation ? "high" : (currentCompany || currentDesignation ? "medium" : "low");
  const scoreMap = { low: 0.35, medium: 0.68, high: 0.9 };
  const overall = Number((((scoreMap[experienceConfidence] + scoreMap[educationConfidence] + scoreMap[contactConfidence] + scoreMap[identityConfidence]) / 4).toFixed(2)));
  return {
    overall,
    experience: experienceConfidence,
    education: educationConfidence,
    contact: contactConfidence,
    identity: identityConfidence
  };
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
  const now = new Date();
  const hasMonthToken = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s,-]*(?:\d{1,2}[\s,-]+)?(?:'\d{2}|'?\d{4})/i.test(normalized);
  const hasNumericMonthYear = /\b\d{1,2}[/-]\d{4}\b/.test(normalized);

  const parseExplicitMonthToken = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return null;
    if (/^(present|current|till date|to date|ongoing)$/i.test(raw)) {
      return { year: now.getFullYear(), month: now.getMonth(), isCurrent: true };
    }

    const named = raw.match(/\b(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s,'/-]*(\d{2,4})\b/i);
    if (named) {
      const yearRaw = Number(named[3]);
      const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
      const month = MONTH_INDEX[String(named[2] || "").toLowerCase()];
      if (Number.isInteger(year) && Number.isInteger(month)) return { year, month, isCurrent: false };
    }

    const numeric = raw.match(/\b(\d{1,2})[/-](\d{4})\b/);
    if (numeric) {
      const month = Number(numeric[1]) - 1;
      const year = Number(numeric[2]);
      if (month >= 0 && month <= 11 && Number.isInteger(year)) return { year, month, isCurrent: false };
    }

    const isoLike = raw.match(/\b(\d{4})[/-](\d{1,2})\b/);
    if (isoLike) {
      const year = Number(isoLike[1]);
      const month = Number(isoLike[2]) - 1;
      if (month >= 0 && month <= 11 && Number.isInteger(year)) return { year, month, isCurrent: false };
    }

    const yearOnly = raw.match(/\b(19\d{2}|20\d{2})\b/);
    if (yearOnly) {
      return { year: Number(yearOnly[1]), month: 0, isCurrent: false };
    }
    return null;
  };

  const splitRange = normalized.match(/(.+?)\s(?:-|to)\s(present|current|till date|to date|ongoing|.+)$/i);
  if (splitRange) {
    const startParsed = parseExplicitMonthToken(splitRange[1]);
    const endParsed = parseExplicitMonthToken(splitRange[2]);
    if (startParsed && endParsed) {
      return {
        start: { year: startParsed.year, month: startParsed.month },
        end: { year: endParsed.year, month: endParsed.month },
        isCurrent: Boolean(endParsed.isCurrent)
      };
    }
  }

  // Prefer explicit year-only ranges like "2020-2023" or "2020 to 2023"
  // before falling back to "any year in the line" (which can be noisy in CV bullets).
  // Important: do this ONLY when month-year tokens are absent.
  // Otherwise text like "Jun 2025 - Present" gets incorrectly reduced to "2025 - Present"
  // and inflates current-tenure by ~5 months.
  const yearRange = normalized.match(/\b(19\d{2}|20\d{2})\b\s*(?:-|to)\s*\b(19\d{2}|20\d{2}|present|current|till date)\b/i);
  if (yearRange && !hasMonthToken && !hasNumericMonthYear) {
    const startYear = Number(yearRange[1]);
    const endToken = String(yearRange[2] || "").toLowerCase();
    if (endToken === "present" || endToken === "current" || endToken === "till date") {
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
    normalized.matchAll(/\b(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s,-]*(?:'?(\d{4})|'(\d{2}))/ig)
  ).map((match) => ({
    month: MONTH_INDEX[String(match[2] || "").toLowerCase()],
    year: match[3] ? Number(match[3]) : (match[4] ? 2000 + Number(match[4]) : NaN)
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

  const sinceMonthMatch = normalized.match(/\bsince\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,-]*(?:'?(\d{4})|'(\d{2}))/i);
  if (sinceMonthMatch) {
    start = {
      month: MONTH_INDEX[String(sinceMonthMatch[1] || "").toLowerCase()],
      year: sinceMonthMatch[2] ? Number(sinceMonthMatch[2]) : (sinceMonthMatch[3] ? 2000 + Number(sinceMonthMatch[3]) : NaN)
    };
    end = { year: now.getFullYear(), month: now.getMonth() };
    isCurrent = true;
  }

  const sinceYearMatch = normalized.match(/\bsince\s+(19\d{2}|20\d{2})\b/i);
  if (sinceYearMatch && !sinceMonthMatch) {
    start = { year: Number(sinceYearMatch[1]), month: 0 };
    end = { year: now.getFullYear(), month: now.getMonth() };
    isCurrent = true;
  }

  if (/\bpresent\b|\bcurrent\b|\btill date\b/i.test(normalized)) {
    isCurrent = true;
    end = { year: now.getFullYear(), month: now.getMonth() };
  }

  return { start, end, isCurrent };
}

function parseMonthYearLoose(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  if (/^present$/i.test(value)) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }
  const monthMatch = value.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i);
  if (monthMatch) {
    return {
      year: Number(monthMatch[2]),
      month: MONTH_INDEX[String(monthMatch[1]).toLowerCase()]
    };
  }
  const yearMatch = value.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    return { year: Number(yearMatch[1]), month: 0 };
  }
  return null;
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

function parseDurationTextToMonths(value) {
  const text = String(value || "").toLowerCase();
  if (!text) return 0;
  const yearMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:years?|yrs?)/i);
  const monthMatch = text.match(/(\d+)\s*(?:months?|mos?)/i);
  const plusMatch = text.match(/(\d+)\+\s*(?:years?|yrs?)/i);

  if (plusMatch?.[1]) {
    const years = Number(plusMatch[1]);
    return Number.isFinite(years) ? years * 12 : 0;
  }

  let months = 0;
  if (yearMatch?.[1]) {
    const yearsValue = Number(yearMatch[1]);
    if (Number.isFinite(yearsValue) && yearsValue > 0) {
      const fullYears = Math.floor(yearsValue);
      const remainderMonths = Math.round((yearsValue - fullYears) * 12);
      months += (fullYears * 12) + remainderMonths;
    }
  }
  if (monthMatch?.[1]) {
    const m = Number(monthMatch[1]);
    if (Number.isFinite(m) && m > 0) months += m;
  }
  return months;
}

function extractCandidateName(lines, rawText, hint) {
  const hintName = sanitizeText(hint);
  if (hintName && hintName.length <= 80) return hintName;

  const firstLine = String(lines[0] || "").trim();
  const secondLine = String(lines[1] || "").trim();
  if (firstLine && secondLine && /^[A-Z][A-Z\s'.-]{1,40}$/.test(firstLine) && /^[A-Z][A-Z\s'.-]{1,40}$/.test(secondLine)) {
    const combinedUpper = `${firstLine} ${secondLine}`.replace(/\s+/g, " ").trim();
    if (combinedUpper.length <= 80) {
      return combinedUpper
        .toLowerCase()
        .replace(/\b\w/g, (ch) => ch.toUpperCase());
    }
  }
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

  const explicitPlus = text.match(/\b(?:over\s+)?(\d+)\+\s*(?:years?|yrs?)\b/i);
  if (explicitPlus?.[1]) {
    return `${Number(explicitPlus[1])}+ years`;
  }

  const overYears = text.match(/\bover\s+(\d+)\s*(?:years?|yrs?)\b/i);
  if (overYears?.[1]) {
    return `${Number(overYears[1])}+ years`;
  }

  const combo = text.match(/\b(\d+)\s*(?:years?|yrs?)\s*(\d+)\s*(?:months?|mos?)\b/i);
  if (combo?.[1]) {
    return `${combo[1]} years ${combo[2]} months`;
  }

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
  const compact = text.replace(/\s*\n\s*/g, " ").replace(/\s+/g, " ");
  const compactMatch = compact.match(/\b[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}\b/i);
  if (compactMatch?.[0]) {
    return compactMatch[0].replace(/\s+/g, "");
  }
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
  const compact = text.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ");
  const match = compact.match(/\b(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/\s*[a-z0-9-_%/]+\b/i);
  if (!match?.[0]) return "";
  let value = match[0].replace(/\s+/g, "").trim().replace(/[),.;]+$/, "");
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }
  return value;
}

function extractPrimaryLocation(lines, rawText) {
  const text = String(rawText || "");
  const labeled =
    text.match(/\b(?:location|current\s*location|residing\s*at)\s*[:|-]\s*([A-Za-z][A-Za-z\s,.-]{1,80})/i) ||
    text.match(/\b(?:city)\s*[:|-]\s*([A-Za-z][A-Za-z\s,.-]{1,60})/i);
  if (labeled?.[1]) {
    const locationValue = String(labeled[1] || "")
      .replace(/\b(experience|education|skills|projects|profile|summary)\b.*$/i, "")
      .replace(/\b(time required for joining|nationality|date of birth|passport number)\b.*$/i, "")
      .trim()
      .replace(/\s{2,}/g, " ");
    if (locationValue && !/^(indian\.?)$/i.test(locationValue)) return locationValue;
  }

  const compact = text.replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ");
  const inline = compact.match(/\b(?:location|city)\s+([A-Za-z][A-Za-z\s,.-]{1,40})/i);
  if (inline?.[1]) {
    return String(inline[1] || "")
      .replace(/\b(experience|education|skills|projects|profile|summary)\b.*$/i, "")
      .trim();
  }

  const cityHints = new Set([
    "mumbai", "pune", "bengaluru", "bangalore", "hyderabad", "delhi", "gurugram", "noida", "chennai",
    "kolkata", "ahmedabad", "jaipur", "indore", "nagpur", "lucknow", "surat", "kochi", "coimbatore"
  ]);
  const rawLines = Array.isArray(lines) ? lines : [];
  for (const line of rawLines.slice(0, 35)) {
    const value = String(line || "").trim().replace(/[|•]+/g, " ");
    if (!value || value.length > 40) continue;
    if (/@/.test(value) || /\d{4,}/.test(value) || /linkedin\.com/i.test(value)) continue;
    if (/^(experience|education|skills|projects|profile|summary|objective)$/i.test(value)) continue;
    const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
    if (cityHints.has(normalized) || cityHints.has(normalized.split(",")[0])) {
      return value;
    }
  }
  return "";
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

function looksLikeResponsibilityNoise(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/^(roles?\s*&?\s*responsibilities?|key\s+responsibilities?|scope\s+of\s+(?:the\s+)?project|business\s+growth\s*&?\s*market\s+expansion|profile\s+summary|employment\s+profile)\b/i.test(text)) return true;
  if (/^(managed|managing|handling|led|leading|responsible|working|worked|executed|execution|created|building|supporting|reviewed|extract(?:ed|ing)?|prepared|coordinated)\b/i.test(text)) return true;
  if (/^[a-z].*[.]$/.test(text) && text.split(/\s+/).length <= 6) return true;
  return false;
}

function looksLikeExperienceDate(line) {
  return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,-]*(?:'\d{2}|'?\d{4})\b/i.test(line) &&
    (/\bpresent\b|\bcurrent\b|\btill date\b|\bsince\b|\bfrom\b|\bto\b/i.test(line) || /[-\u2013\u2014\u2212]/.test(line) || /\b\d+\s+(?:yr|yrs|year|years|mo|mos|month|months)\b/i.test(line));
}

function hasContactLikeNoise(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/@/.test(text)) return true;
  if (/\b(e-?mail|email|contact\s*(no|number)?|phone|mobile|mob|linkedin)\b/i.test(text)) return true;
  if (/\+?\d[\d\s().-]{8,}/.test(text)) return true;
  return false;
}

function cleanCompanyLine(line) {
  return String(line || "")
    .split("|")[0]
    .replace(/^(?:company|employer|organization)\s*[:\-]\s*/i, "")
    .replace(/\s*\((?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[^)]*|[^)]*\b(?:19|20)\d{2}\b[^)]*)\)\s*$/i, "")
    .replace(/\s+\d+\s+years?(?:\s+\d+\s+months?)?$/i, "")
    .replace(/\s+\d+\s+months?$/i, "")
    .replace(/^[^A-Za-z0-9(]+/, "")
    .replace(/\s*[:\-]\s*$/g, "")
    .trim();
}

function cleanRoleLine(line) {
  return String(line || "")
    .replace(/^(?:role|designation|job\s*profile|position|title)\s*[:\-]\s*/i, "")
    .trim();
}

function looksLikeRoleLine(value) {
  const text = cleanRoleLine(value);
  if (!text) return false;
  if (looksLikeExperienceDate(text) || hasContactLikeNoise(text)) return false;
  if (looksLikeResponsibilityNoise(text)) return false;
  return /\b(manager|engineer|developer|executive|lead|analyst|consultant|specialist|associate|director|officer|architect|intern|trainee|coordinator|administrator|bdr|sdr|account executive|business development|estimator|surveyor|planner|designer|draftsman|detailer)\b/i.test(text);
}

function normalizeTitleCompanyPair(rawTitle, rawCompany) {
  let title = cleanRoleLine(rawTitle);
  let company = cleanCompanyLine(rawCompany);

  if (title.includes("|")) {
    const parts = title.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const left = cleanCompanyLine(parts[0]);
      const right = cleanRoleLine(parts[parts.length - 1]);
      if (isLikelyCompanyLine(left) && looksLikeRoleLine(right)) {
        company = left;
        title = right;
      }
    }
  }

  if (!title && company.includes("|")) {
    const parts = company.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      company = cleanCompanyLine(parts[0]);
      title = cleanRoleLine(parts[parts.length - 1]);
    }
  }
  if (!company && title.includes("|")) {
    const parts = title.split("|").map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      company = cleanCompanyLine(parts[0]);
      title = cleanRoleLine(parts[parts.length - 1]);
    }
  }

  // If parser inverted values, swap back.
  if (isLikelyCompanyLine(title) && looksLikeRoleLine(company) && !isLikelyCompanyLine(company)) {
    const prevTitle = title;
    title = cleanRoleLine(company);
    company = cleanCompanyLine(prevTitle);
  }
  if (!looksLikeRoleLine(title) && isLikelyCompanyLine(title) && looksLikeRoleLine(company)) {
    const prevTitle = title;
    title = cleanRoleLine(company);
    company = cleanCompanyLine(prevTitle);
  }

  return { title, company };
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
  if (/:\s*$/.test(String(line || "").trim())) return false;
  if (isNoiseLine(value) || looksLikeExperienceDate(value) || looksLikeBulletLine(value)) return false;
  if (looksLikeResponsibilityNoise(value)) return false;
  if (/^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{2,4}\s*[-\u2013\u2014\u2212]\s*(?:present|current|till date|\d{2,4})$/i.test(value)) return false;
  if (hasContactLikeNoise(value)) return false;
  if (/^(exact\s+responsibilities?|responsibilities?)\s*:?\s*$/i.test(value)) return false;
  if (/\b(manager|engineer|developer|executive|lead|analyst|consultant|specialist|associate|director|officer|architect|intern|trainee|coordinator|administrator|bdr|sdr)\b/i.test(value)
      && !/\b(pvt|private|ltd|limited|inc|llc|corp|co\.|company|technologies|services|solutions|systems|consulting|group|labs)\b/i.test(value)) {
    return false;
  }
  if (value.length > 120) return false;
  if (/[.]$/.test(value) && !/,/.test(value)) return false;
  if (/\bowned\b|\bachieved\b|\bdrove\b|\bbuilt\b|\bled\b|\bmanaged\b|\bexecuted\b|\bcollaborated\b|\bcollaborate\b/i.test(value)) return false;
  if (/\b(business\s+growth|market\s+expansion|roles?\s*&?\s*responsibilities?|scope\s+of\s+(?:the\s+)?project)\b/i.test(value)) return false;
  return true;
}

function looksLikeEducationText(value) {
  return /\b(university|college|school|bachelor|master|b\.tech|m\.tech|mba|pgdm|degree|diploma|education)\b/i.test(String(value || ""));
}

function looksLikeSpacedCapsBanner(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (!/[A-Z]/.test(text) || /[a-z]/.test(text)) return false;
  const compact = text.replace(/[^A-Z]/g, "");
  const spaced = text.match(/[A-Z]\s+[A-Z]/g);
  return compact.length >= 8 && Array.isArray(spaced) && spaced.length >= 2;
}

function looksLikeSectionHeading(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const compact = text.replace(/[^A-Za-z]/g, "").toLowerCase();
  if (!compact) return false;
  const headingLike = new Set([
    "internship",
    "internships",
    "experience",
    "workexperience",
    "professionalexperience",
    "education",
    "projects",
    "certifications",
    "skills"
  ]);
  return headingLike.has(compact);
}

function countDateLikeLines(lines = []) {
  return (lines || []).filter((line) => {
    const text = String(line || "").trim();
    return /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,-]+(?:'\d{2}|\d{4})\b/i.test(text) ||
      /\b(?:19|20)\d{2}\s*[-\u2013\u2014\u2212]\s*(?:present|current|till date|(?:19|20)\d{2})\b/i.test(text);
  }).length;
}

function calculateMonthsFromTimeline(timeline = []) {
  const ranges = [];
  for (const item of timeline) {
    const start = String(item?.start || "");
    const end = String(item?.end || "");
    const parsed = parseDateRange(`${start} - ${end}`);
    const startIndex = monthIndex(parsed.start);
    const endIndex = monthIndex(parsed.end);
    if (startIndex === null || endIndex === null || endIndex < startIndex) continue;
    ranges.push([startIndex, endIndex]);
  }
  if (!ranges.length) return 0;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [ranges[0]];
  for (let i = 1; i < ranges.length; i += 1) {
    const [s, e] = ranges[i];
    const last = merged[merged.length - 1];
    if (s <= last[1] + 1) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged.reduce((sum, [s, e]) => sum + (e - s + 1), 0);
}

function calculateTimelineSpanMonths(timeline = []) {
  let minStart = null;
  let maxEnd = null;
  for (const item of timeline) {
    const start = String(item?.start || "");
    const end = String(item?.end || "");
    const parsed = parseDateRange(`${start} - ${end}`);
    const startIndex = monthIndex(parsed.start);
    const endIndex = monthIndex(parsed.end);
    if (startIndex === null || endIndex === null || endIndex < startIndex) continue;
    if (minStart === null || startIndex < minStart) minStart = startIndex;
    if (maxEnd === null || endIndex > maxEnd) maxEnd = endIndex;
  }
  if (minStart === null || maxEnd === null || maxEnd < minStart) return 0;
  return (maxEnd - minStart + 1);
}

function calculateCurrentRoleMonths(timeline = []) {
  for (const item of timeline) {
    const end = String(item?.end || "").toLowerCase();
    if (end !== "present") continue;
    const parsed = parseDateRange(`${String(item?.start || "")} - Present`);
    const startIndex = monthIndex(parsed.start);
    const endIndex = monthIndex(parsed.end);
    if (startIndex === null || endIndex === null || endIndex < startIndex) continue;
    return endIndex - startIndex + 1;
  }
  return 0;
}

function buildTimelineConfidence({
  timeline = [],
  activeMonths = 0,
  spanMonths = 0,
  currentMonths = 0,
  claimedMonths = 0
}) {
  const timelineCount = Array.isArray(timeline) ? timeline.length : 0;
  const hasTimeline = timelineCount > 0;
  const hasCurrent = currentMonths > 0;
  const hasSpan = spanMonths > 0;
  const discrepancy = claimedMonths > 0 && hasSpan ? Math.abs(claimedMonths - spanMonths) : 0;

  let level = "high";
  let reason = "Timeline evidence is weak or missing in CV text.";

  if (hasTimeline && hasSpan && hasCurrent && (claimedMonths === 0 || discrepancy <= 18)) {
    level = "low";
    reason = "Timeline parsing is complete with current role and consistent dates.";
  } else if (hasTimeline && (hasSpan || hasCurrent)) {
    level = "medium";
    reason = discrepancy > 18
      ? "Timeline and claimed experience differ; verify manually."
      : "Timeline is partial or missing current-role clarity.";
  }

  return {
    level,
    label: `${level.toUpperCase()} risk: ${reason}`
  };
}

function pickBestTitleCompany(dateLineIndex, lines) {
  const backwardContext = lines.slice(Math.max(0, dateLineIndex - 5), dateLineIndex).reverse();
  const forwardContext = lines.slice(dateLineIndex + 1, Math.min(lines.length, dateLineIndex + 6));

  const backward = parseTitleAndCompany(backwardContext);
  const forward = parseTitleAndCompany(forwardContext);

  const backwardCompanyOk = isLikelyCompanyLine(backward.company) && !looksLikeEducationText(backward.company);
  const forwardCompanyOk = isLikelyCompanyLine(forward.company) && !looksLikeEducationText(forward.company);

  if (backwardCompanyOk && !forwardCompanyOk) return backward;
  if (!backwardCompanyOk && forwardCompanyOk) return forward;
  if (backwardCompanyOk && forwardCompanyOk) {
    const backScore = companyLineScore(backward.company);
    const forwardScore = companyLineScore(forward.company);
    return backScore >= forwardScore ? backward : forward;
  }
  return { title: "", company: "" };
}

function looksLikeSentenceLine(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length >= 9) return true;
  if (/[.,;:]/.test(text) && words.length >= 6) return true;
  return false;
}

function pickBackwardLooseTitleCompany(dateLineIndex, lines) {
  const minIndex = Math.max(1, dateLineIndex - 40);
  for (let j = dateLineIndex - 1; j >= minIndex; j -= 1) {
    const company = String(lines[j] || "").trim();
    const title = String(lines[j - 1] || "").trim();
    if (!title || !company) continue;
    if (isNoiseLine(title) || isNoiseLine(company)) continue;
    if (looksLikeExperienceDate(title) || looksLikeExperienceDate(company)) continue;
    if (looksLikeEducationText(title) || looksLikeEducationText(company)) continue;
    if (looksLikeSpacedCapsBanner(title) || looksLikeSpacedCapsBanner(company)) continue;
    if (looksLikeSentenceLine(title) || looksLikeSentenceLine(company)) continue;
    return { title, company };
  }
  return { title: "", company: "" };
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

  return normalizeTitleCompanyPair(first, second);
}

function extractTitleDateCompany(lines, index) {
  const line = String(lines[index] || "").trim();
  const previousLine = String(lines[index - 1] || "").trim();
  const nextLine = String(lines[index + 1] || "").trim();
  const next2Line = String(lines[index + 2] || "").trim();
  const companyLabelPattern = /^(?:\d+\.\s*)?company(?:\s*\([^)]*\))?\s*(?::|-)?\s*(.+)$/i;

  const findNearbyCompanyLabel = () => {
    for (let offset = 1; offset <= 3; offset += 1) {
      const prev = String(lines[index - offset] || "").trim();
      const prevMatch = prev.match(companyLabelPattern);
      if (prevMatch?.[1]) return cleanCompanyLine(prevMatch[1]);
    }
    for (let offset = 1; offset <= 2; offset += 1) {
      const next = String(lines[index + offset] || "").trim();
      const nextMatch = next.match(companyLabelPattern);
      if (nextMatch?.[1]) return cleanCompanyLine(nextMatch[1]);
    }
    return "";
  };

  // Handle "Job Profile- <Role> (<Date - Date>)" with company on nearby line.
  const jobProfileDateMatch = line.match(/^job\s*profile\s*[-:]\s*(.+?)\s*\(([^)]+)\)\s*$/i);
  if (jobProfileDateMatch) {
    const title = String(jobProfileDateMatch[1] || "").trim();
    const dates = String(jobProfileDateMatch[2] || "").trim();
    const company = findNearbyCompanyLabel();
    if (title && company && dates) return { title, company, dates };
  }

  // Handle explicit "Company: X (Date - Date)" lines in numbered CV timelines.
  // Example: "3. Company: Expertrons Academy (Sept'2021 - April'2022)"
  const companyDateParenMatch = line.match(/^(?:\d+\.\s*)?company\s*(?::|-)?\s*(.+?)\s*\(([^)]+)\)\s*$/i);
  if (companyDateParenMatch) {
    const company = cleanCompanyLine(companyDateParenMatch[1]);
    const dates = String(companyDateParenMatch[2] || "").trim();
    let title = "";
    const titleFromNext = nextLine.match(/^(?:job\s*profile)\s*[-:]\s*(.+)$/i);
    const titleFromNext2 = next2Line.match(/^(?:job\s*profile)\s*[-:]\s*(.+)$/i);
    const designationFromNext = nextLine.match(/^(?:designation|role|position|title)\s*[-:]\s*(.+)$/i);
    const designationFromNext2 = next2Line.match(/^(?:designation|role|position|title)\s*[-:]\s*(.+)$/i);
    if (titleFromNext?.[1]) title = String(titleFromNext[1]).trim();
    else if (titleFromNext2?.[1]) title = String(titleFromNext2[1]).trim();
    else if (designationFromNext?.[1]) title = String(designationFromNext[1]).trim();
    else if (designationFromNext2?.[1]) title = String(designationFromNext2[1]).trim();
    if (!title) title = "Role";
    if (company && dates) return { title, company, dates };
  }

  // Handle date-first formats:
  // - "Since Aug 2024 | Amply ... "
  // - "Sep 2023 - Mar 2024 | Signeasy | Business Development Representative"
  const dateFirstMatch = line.match(
    /^(?:(since)\s+)?((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,-]*(?:'\d{2}|'?\d{4})|\b(?:19|20)\d{2}\b)\s*(?:[-\u2013\u2014\u2212]|to)?\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,-]*(?:'\d{2}|'?\d{4})|\b(?:19|20)\d{2}\b|present|current|till date)?\s*\|\s*(.+)$/i
  );
  if (dateFirstMatch) {
    const sinceWord = String(dateFirstMatch[1] || "").trim();
    const startToken = String(dateFirstMatch[2] || "").trim();
    const endToken = String(dateFirstMatch[3] || "").trim();
    const trailing = String(dateFirstMatch[4] || "").trim();
    const parts = trailing.split("|").map((part) => String(part || "").trim()).filter(Boolean);
    let company = cleanCompanyLine(parts[0] || "");
    let title = parts.length > 1 ? String(parts[parts.length - 1] || "").trim() : "";
    if (parts.length >= 2) {
      const head = cleanCompanyLine(parts[0] || "");
      const tail = cleanRoleLine(parts[parts.length - 1] || "");
      const maybeRole = cleanRoleLine(parts[0] || "");
      const maybeCompany = cleanCompanyLine(parts[parts.length - 1] || "");
      if (!isLikelyCompanyLine(head) && isLikelyCompanyLine(tail)) {
        company = cleanCompanyLine(tail);
        title = cleanRoleLine(parts[0] || "");
      } else if (looksLikeRoleLine(maybeRole) && isLikelyCompanyLine(maybeCompany)) {
        title = maybeRole;
        company = maybeCompany;
      } else if (isLikelyCompanyLine(head) && !looksLikeRoleLine(tail)) {
        title = "";
      }
    }
    if (!title && nextLine && !looksLikeExperienceDate(nextLine) && !isNoiseLine(nextLine) && !looksLikeBulletLine(nextLine)) {
      title = nextLine;
    }
    const dates = sinceWord
      ? `Since ${startToken}`
      : `${startToken}${endToken ? ` - ${endToken}` : ""}`.trim();
    if (company && title) {
      return { title, company, dates };
    }
  }

  const dateMatch = line.match(/^(.*?)(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,-]*(?:'\d{2}|'?\d{4}).*)$/i);
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

  // Pattern: "CompanyName | <date-range>" and role on next line.
  if (isLikelyCompanyLine(prefix) && !looksLikeRoleLine(prefix)) {
    const nextRole = cleanRoleLine(nextLine);
    if (nextRole && looksLikeRoleLine(nextRole) && !looksLikeSentenceLine(nextRole)) {
      return { title: nextRole, company: cleanCompanyLine(prefix), dates };
    }
  }

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

  // Job-profile lines often contain the date while company is on previous line:
  // "Company- Whitehat Jr..."
  // "Job Profile- Sales Manager (May 2021 - Sep 2021)"
  const companyLabelPrev = previousLine.match(companyLabelPattern);
  if (/^job\s*profile\b/i.test(prefix) && companyLabelPrev?.[1]) {
    companyInline = cleanCompanyLine(companyLabelPrev[1]);
    title = String(prefix).replace(/^job\s*profile\s*[-:]\s*/i, "").trim() || title;
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

  const START_HEADINGS = new Set([
    "experience",
    "workexperience",
    "professionalexperience",
    "employmenthistory",
    "workhistory",
    "employmentprofile",
    "professionalprofile"
  ]);
  const END_HEADINGS = new Set([
    "education",
    "educationhistory",
    "academicdetails",
    "academicprofile",
    "qualification",
    "qualifications",
    "academics",
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

function normalizeExperienceDate(value = "") {
  const parsed = parseDateRange(value);
  if (!parsed?.start) return { startDate: "", endDate: "" };
  const startDate = `${parsed.start.year}-${String((parsed.start.month || 0) + 1).padStart(2, "0")}`;
  const endDate = parsed.isCurrent
    ? "Present"
    : (parsed.end ? `${parsed.end.year}-${String((parsed.end.month || 0) + 1).padStart(2, "0")}` : "");
  return { startDate, endDate };
}

function cleanExperienceTitle(value = "") {
  return normalizeLooseText(
    String(value || "")
      .replace(/^designation\s*(?::|-)?\s*/i, "")
      .replace(/^role\s*(?::|-)?\s*/i, "")
      .replace(/^position\s*(?::|-)?\s*/i, "")
      .replace(/^job\s*profile\s*(?::|-)?\s*/i, "")
      .replace(/\bhttps?:\/\/\S+/gi, "")
      .replace(/\bwww\.\S+/gi, "")
      .replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*['.,\s0-9-]*(?:present|current|\d{2,4})\b/gi, "")
      .replace(/\b\d{1,2}[/-]\d{4}\s*-\s*(?:present|current|\d{1,2}[/-]\d{4})\b/gi, "")
      .replace(/\(\s*\)$/g, "")
      .replace(/[.]+$/g, "")
  );
}

function extractCompanyAlias(value = "") {
  const text = normalizeLooseText(value);
  if (!text) return "";
  const paren = text.match(/\(([^)]+)\)/);
  if (paren?.[1] && looksLikeCompanyName(paren[1])) return normalizeCompanyDisplay(paren[1]);
  return normalizeCompanyDisplay(text);
}

function parseExperienceTimelineV2(experienceSectionText = "", rawText = "") {
  const lines = splitLines(experienceSectionText)
    .map((line) => String(line || "").replace(/^[-•◆]+\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line));
  const rows = [];
  const seen = new Set();

  const pushRow = (row) => {
    const company = normalizeCompanyDisplay(row.company);
    const designation = cleanExperienceTitle(row.designation || row.title || "");
    const sourceText = normalizeLooseText(row.sourceText || "");
    if (!company && !designation) return;
    if (isProjectNoiseLine(company) || isProjectNoiseLine(designation)) return;
    if (/\b(villa|database center|gigafactory|school building|office building|hospital building|miscellaneous projects|project highlights?)\b/i.test(company)) return;
    if (/^company\b/i.test(designation)) return;
    if (!looksLikeRoleLine(designation) && designation.split(/\s+/).length > 10) return;
    const normalizedDates = normalizeExperienceDate(row.rawDates || row.dates || "");
    if (!normalizedDates.startDate) return;
    const key = [company.toLowerCase(), designation.toLowerCase(), normalizedDates.startDate, normalizedDates.endDate].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({
      company,
      designation,
      startDate: normalizedDates.startDate,
      endDate: normalizedDates.endDate,
      sourceText,
      confidence: row.confidence || (company && designation ? "high" : "medium")
    });
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const prev = String(lines[i - 1] || "").trim();
    const next = String(lines[i + 1] || "").trim();
    const nextTwo = String(lines[i + 2] || "").trim();

    const companyDesignationPattern = line.match(/^(?:\d+\.\s*)?company\s+(.+?)\s*\(([^)]+)\)\s*$/i);
    if (companyDesignationPattern) {
      const company = normalizeCompanyDisplay(companyDesignationPattern[1]);
      let designation = "";
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j += 1) {
        const probe = String(lines[j] || "").trim();
        const m = probe.match(/^(?:designation|role|position|title)\s*(?::|-)?\s*(.+)$/i);
        if (m?.[1]) {
          designation = cleanExperienceTitle(m[1]);
          break;
        }
      }
      pushRow({
        company,
        designation,
        rawDates: companyDesignationPattern[2],
        sourceText: [line, designation].filter(Boolean).join(" | "),
        confidence: designation ? "high" : "medium"
      });
      continue;
    }

    const prevCompanyWithAlias = prev.match(/^(.*?)(?:\(([^)]+)\))?$/);
    const inlineRoleDate = line.match(/^(.+?)\s+(?:https?:\/\/\S+|www\.\S+)?\s*((?:[A-Za-z]{3,9}\.?'?\d{2,4}|\d{1,2}[/-]\d{4}).*(?:Present|Current|\d{2,4}))$/i);
    if (inlineRoleDate && prev && !isProjectNoiseLine(prev)) {
      const company = extractCompanyAlias(prevCompanyWithAlias?.[2] || prevCompanyWithAlias?.[1] || prev);
      const designation = cleanExperienceTitle(inlineRoleDate[1]);
      pushRow({
        company,
        designation,
        rawDates: inlineRoleDate[2],
        sourceText: [prev, line].join(" | "),
        confidence: company && designation ? "high" : "medium"
      });
      continue;
    }

    const titleLineCompanyDate = next.match(/^(.+?)\s*[|]\s*([^|]+?\b(?:present|current|till date|to date|(?:19|20)\d{2}|'\d{2}))$/i);
    if (titleLineCompanyDate && looksLikeRoleLine(line) && !isProjectNoiseLine(line)) {
      pushRow({
        company: titleLineCompanyDate[1],
        designation: line,
        rawDates: titleLineCompanyDate[2],
        sourceText: [line, next].join(" | "),
        confidence: "high"
      });
      continue;
    }

    if (
      looksLikeRoleLine(line) &&
      next &&
      nextTwo &&
      !isProjectNoiseLine(next) &&
      !isProjectNoiseLine(nextTwo) &&
      looksLikeCompanyName(next) &&
      /(?:present|current|till date|to date|\d{4}|\d{1,2}[/-]\d{4}|[A-Za-z]{3,9}\.?'?\d{2,4})/i.test(nextTwo)
    ) {
      pushRow({
        company: next,
        designation: line,
        rawDates: nextTwo,
        sourceText: [line, next, nextTwo].join(" | "),
        confidence: "high"
      });
      continue;
    }

    const companyTitleDate = line.match(/^(.+?)\s*[|]\s*(.+?)\s+((?:[A-Za-z]{3,9}\.?'?\d{2,4}|\d{1,2}[/-]\d{4}).*(?:Present|Current|\d{2,4}))$/i);
    if (companyTitleDate && !isProjectNoiseLine(companyTitleDate[1]) && !isProjectNoiseLine(companyTitleDate[2])) {
      pushRow({
        company: companyTitleDate[1],
        designation: companyTitleDate[2],
        rawDates: companyTitleDate[3],
        sourceText: line,
        confidence: "high"
      });
      continue;
    }

    const titleDateCompanyNext = line.match(/^(.+?)\s+((?:[A-Za-z]{3,9}\.?'?\d{2,4}|\d{1,2}[/-]\d{4}).*(?:Present|Current|\d{2,4}))$/i);
    if (titleDateCompanyNext && next && !isProjectNoiseLine(next) && !looksLikeRoleLine(next) && looksLikeCompanyName(next)) {
      pushRow({
        company: next,
        designation: titleDateCompanyNext[1],
        rawDates: titleDateCompanyNext[2],
        sourceText: [line, next].join(" | "),
        confidence: "high"
      });
      continue;
    }

    const titleDatePrevCompany = line.match(/^(.+?)\s+((?:[A-Za-z]{3,9}\.?'?\d{2,4}|\d{1,2}[/-]\d{4}).*(?:Present|Current|\d{2,4}))$/i);
    if (titleDatePrevCompany && prev && !isProjectNoiseLine(prev) && looksLikeCompanyName(prev)) {
      pushRow({
        company: extractCompanyAlias(prev),
        designation: titleDatePrevCompany[1],
        rawDates: titleDatePrevCompany[2],
        sourceText: [prev, line].join(" | "),
        confidence: "high"
      });
    }
  }

  return rows;
}

function extractTimeline(lines, rawText, structuredExperienceText) {
  const entries = [];
  const seen = new Set();

  const personalNoise = (value = "") => /\b(personal\s+vitae|date\s+of\s+birth|marital\s+status|languages?\s+known|place\s*:)\b/i.test(String(value || ""));

  const structuredLines = splitLines(structuredExperienceText);
  for (const line of structuredLines) {
    const title = line.match(/Title:\s*([^|]+)/i)?.[1]?.trim() || "";
    const company = line.match(/Company:\s*([^|]+)/i)?.[1]?.trim() || "";
    const dates = line.match(/Dates:\s*([^|]+)/i)?.[1]?.trim() || "";
    if (!company || !dates) continue;
    const normalizedPair = normalizeTitleCompanyPair(title, company);
    const key = `${normalizedPair.title}|${normalizedPair.company}|${dates}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ title: normalizedPair.title, company: normalizedPair.company, dates, ...parseDateRange(dates) });
  }

  for (let i = 0; i < lines.length; i += 1) {
    // Pattern: Company <NAME> (<date range>) then Designation ... on next 1-3 lines.
    const companyDateLine = String(lines[i] || "").trim();
    const companyDateMatch = companyDateLine.match(/^(?:\d+\.\s*)?company\s+(.+?)\s*\(([^)]+)\)\s*$/i);
    if (companyDateMatch) {
      const company = cleanCompanyLine(companyDateMatch[1]);
      const dates = String(companyDateMatch[2] || "").trim();
      let title = "";
      for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j += 1) {
        const probe = String(lines[j] || "").trim();
        const m = probe.match(/^(?:designation|role|position|title)\s*(?::|-)?\s*(.+)$/i);
        if (m?.[1]) {
          title = cleanRoleLine(m[1]);
          break;
        }
      }
      if (!title && i + 1 < lines.length) {
        const fallbackTitle = cleanRoleLine(String(lines[i + 1] || "").trim());
        if (looksLikeRoleLine(fallbackTitle) && !looksLikeSentenceLine(fallbackTitle)) title = fallbackTitle;
      }
      if (company && title && dates && !personalNoise(company) && !personalNoise(title)) {
        const normalizedPair = normalizeTitleCompanyPair(title, company);
        const key = `${normalizedPair.title}|${normalizedPair.company}|${dates}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ title: normalizedPair.title, company: normalizedPair.company, dates, ...parseDateRange(dates) });
        }
      }
      continue;
    }

    // Common CV layout:
    // Company
    // Date range
    // Designation
    const dateLine = String(lines[i] || "").trim();
    const prevLine = String(lines[i - 1] || "").trim();
    const nextLine = String(lines[i + 1] || "").trim();
    const looksLikeDateLine =
      /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\s,-]*(?:'\d{2}|'?\d{4})\b/i.test(dateLine) ||
      /\b(?:19|20)\d{2}\s*[-\u2013\u2014\u2212]\s*(?:present|current|till date|(?:19|20)\d{2})\b/i.test(dateLine);
    if (looksLikeDateLine && prevLine && nextLine) {
      const companyCandidate = cleanCompanyLine(prevLine);
      const titleCandidate = cleanRoleLine(nextLine);
      if (
        companyCandidate &&
        !looksLikeExperienceDate(companyCandidate) &&
        !looksLikeEducationText(companyCandidate) &&
        !looksLikeSentenceLine(companyCandidate) &&
        !looksLikeResponsibilityNoise(companyCandidate) &&
        looksLikeRoleLine(titleCandidate) &&
        !looksLikeEducationText(titleCandidate) &&
        !looksLikeSentenceLine(titleCandidate) &&
        !looksLikeResponsibilityNoise(titleCandidate)
      ) {
        const normalizedPair = normalizeTitleCompanyPair(titleCandidate, companyCandidate);
        const key = `${normalizedPair.title}|${normalizedPair.company}|${dateLine}`.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          entries.push({ title: normalizedPair.title, company: normalizedPair.company, dates: dateLine, ...parseDateRange(dateLine) });
        }
        continue;
      }
    }

    const direct = extractTitleDateCompany(lines, i);
    if (direct) {
      const normalizedPair = normalizeTitleCompanyPair(direct.title, direct.company);
      const key = `${normalizedPair.title}|${normalizedPair.company}|${direct.dates}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        entries.push({ title: normalizedPair.title, company: normalizedPair.company, dates: direct.dates, ...parseDateRange(direct.dates) });
      }
      continue;
    }

    const dates = lines[i];
    const looksLikeYearOnlyDate = /\b(?:19|20)\d{2}\s*[-\u2013\u2014\u2212]\s*(?:present|current|till date|(?:19|20)\d{2})\b/i.test(dates);
    if (!looksLikeExperienceDate(dates) && !looksLikeYearOnlyDate) continue;

    let { title, company } = pickBestTitleCompany(i, lines);
    if (looksLikeSentenceLine(title) || looksLikeSentenceLine(company)) {
      const loose = pickBackwardLooseTitleCompany(i, lines);
      title = loose.title || title;
      company = loose.company || company;
    }
    if (!company || !dates || !isLikelyCompanyLine(company)) continue;
    if (personalNoise(company) || personalNoise(title) || personalNoise(dates)) continue;
    if (looksLikeEducationText(title) || looksLikeEducationText(company)) continue;
    if (looksLikeResponsibilityNoise(title) || looksLikeResponsibilityNoise(company)) continue;
    if (looksLikeSpacedCapsBanner(title) || looksLikeSpacedCapsBanner(company)) continue;

    const normalizedPair = normalizeTitleCompanyPair(title, company);
    const key = `${normalizedPair.title}|${normalizedPair.company}|${dates}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ title: normalizedPair.title, company: normalizedPair.company, dates, ...parseDateRange(dates) });
  }

  // Fallback pass for CVs where role/company are separated from date lines by layout noise.
  for (let i = 0; i < lines.length; i += 1) {
    const dates = String(lines[i] || "").trim();
    const looksLikeYearOnlyDate = /\b(?:19|20)\d{2}\s*[-\u2013\u2014\u2212]\s*(?:present|current|till date|(?:19|20)\d{2})\b/i.test(dates);
    if (!looksLikeExperienceDate(dates) && !looksLikeYearOnlyDate) continue;

    const nextTitle = String(lines[i + 1] || "").trim();
    const nextCompany = String(lines[i + 2] || "").trim();
    let title = "";
    let company = "";

    if (
      nextTitle && nextCompany &&
      !isNoiseLine(nextTitle) && !isNoiseLine(nextCompany) &&
      !looksLikeExperienceDate(nextTitle) && !looksLikeExperienceDate(nextCompany) &&
      !looksLikeEducationText(nextTitle) && !looksLikeEducationText(nextCompany) &&
      !looksLikeSpacedCapsBanner(nextTitle) && !looksLikeSpacedCapsBanner(nextCompany) &&
      !looksLikeSentenceLine(nextTitle) && !looksLikeSentenceLine(nextCompany) &&
      looksLikeRoleLine(nextTitle) && isLikelyCompanyLine(nextCompany)
    ) {
      title = nextTitle;
      company = nextCompany;
    } else {
      const loose = pickBackwardLooseTitleCompany(i, lines);
      title = loose.title;
      company = loose.company;
    }

    if (!title || !company) continue;
    if (personalNoise(company) || personalNoise(title) || personalNoise(dates)) continue;
    if (!looksLikeRoleLine(title) || !isLikelyCompanyLine(company)) continue;
    if (looksLikeResponsibilityNoise(title) || looksLikeResponsibilityNoise(company)) continue;
    const normalizedPair = normalizeTitleCompanyPair(title, company);
    const key = `${normalizedPair.title}|${normalizedPair.company}|${dates}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ title: normalizedPair.title, company: normalizedPair.company, dates, ...parseDateRange(dates) });
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
      if (hasContactLikeNoise(company) || hasContactLikeNoise(title)) return false;
      if (personalNoise(company) || personalNoise(title)) return false;
      if (/^job\s*profile\b/i.test(company) && /^job\s*profile\b/i.test(title)) return false;
      if (/^(exact\s+responsibilities?|responsibilities?)\s*:?\s*$/i.test(company)) return false;
      if (/^(exact\s+responsibilities?|responsibilities?)\s*:?\s*$/i.test(title)) return false;
      if (looksLikeSectionHeading(company) || looksLikeSectionHeading(title)) return false;
      if (isNoiseLine(company) || isNoiseLine(title)) return false;
      if (looksLikeEducationText(company) || looksLikeEducationText(title)) return false;
      if (looksLikeResponsibilityNoise(company) || looksLikeResponsibilityNoise(title)) return false;
      if (looksLikeSpacedCapsBanner(company) || looksLikeSpacedCapsBanner(title)) return false;
      return true;
    })
    .sort((a, b) => (b.startIndex || 0) - (a.startIndex || 0));

  const deduped = [];
  const dedupeSeen = new Set();
  for (const entry of normalized) {
    const key = [
      String(entry.company || "").toLowerCase().trim(),
      String(entry.title || "").toLowerCase().trim(),
      Number.isFinite(entry.startIndex) ? String(entry.startIndex) : "",
      Number.isFinite(entry.endIndex) ? String(entry.endIndex) : "",
      String(entry.isCurrent ? "1" : "0")
    ].join("|");
    if (dedupeSeen.has(key)) continue;
    dedupeSeen.add(key);
    deduped.push(entry);
  }

  // Remove likely duplicate sub-roles where a shorter stint is fully covered by a broader
  // same-company range extracted from nearby lines (common in CVs with promoted-role sub-lines).
  const cleaned = deduped.filter((entry, idx, array) => {
    const companyKey = String(entry.company || "").toLowerCase().trim();
    if (!companyKey || !Number.isFinite(entry.startIndex) || !Number.isFinite(entry.endIndex)) return true;
    const coveredBySibling = array.some((other, otherIdx) => {
      if (otherIdx === idx) return false;
      if (String(other.company || "").toLowerCase().trim() !== companyKey) return false;
      if (!Number.isFinite(other.startIndex) || !Number.isFinite(other.endIndex)) return false;
      const fullyCovered = other.startIndex <= entry.startIndex && other.endIndex >= entry.endIndex;
      if (!fullyCovered) return false;
      const otherSpan = other.endIndex - other.startIndex;
      const thisSpan = entry.endIndex - entry.startIndex;
      if (otherSpan < thisSpan) return false;
      // Prefer keeping the broader one when this row looks like a year-only sub-line.
      return /\b(?:19|20)\d{2}\s*\)?\s*$/i.test(String(entry.rawDates || ""));
    });
    return !coveredBySibling;
  });
  const bestByCompanyRange = new Map();
  for (const entry of cleaned) {
    const key = [
      String(entry.company || "").toLowerCase().trim(),
      String(entry.start || "").toLowerCase().trim(),
      String(entry.end || "").toLowerCase().trim()
    ].join("|");
    const current = bestByCompanyRange.get(key);
    const score = (looksLikeRoleLine(entry.title) ? 2 : 0) + (looksLikeSentenceLine(entry.title) ? -2 : 0) + (looksLikeResponsibilityNoise(entry.title) ? -2 : 0);
    if (!current || score > current._score) {
      bestByCompanyRange.set(key, { ...entry, _score: score });
    }
  }
  const finalCleaned = Array.from(bestByCompanyRange.values()).map(({ _score, ...row }) => row);

  const gaps = [];
  for (let i = 0; i < finalCleaned.length - 1; i += 1) {
    const newer = finalCleaned[i];
    const older = finalCleaned[i + 1];
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

  const shortStints = finalCleaned
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
    timeline: finalCleaned.map(({ startIndex, endIndex, ...entry }) => entry),
    gaps,
    shortStints,
    highlights
  };
}

function buildEmploymentHistoryFromTimeline(timeline = [], rawWorkExperience = "", fullRawText = "") {
  return (timeline || []).map((item) => {
    const rawDates = String(item?.rawDates || "").trim();
    const anchor = [String(item?.title || "").trim(), String(item?.company || "").trim(), rawDates].filter(Boolean).join(" | ");
    const blockEvidence = findEvidenceSpan(rawWorkExperience, rawDates, "work_experience")
      || findEvidenceSpan(rawWorkExperience, String(item?.company || ""), "work_experience")
      || findEvidenceSpan(fullRawText, anchor, "raw_cv_text")
      || findEvidenceSpan(fullRawText, rawDates, "raw_cv_text")
      || findEvidenceSpan(fullRawText, String(item?.company || ""), "raw_cv_text");
    const startDate = parseMonthYearLoose(String(item?.start || ""));
    const endText = String(item?.end || "").trim();
    const endDate = /present/i.test(endText) ? "Present" : parseMonthYearLoose(endText);
    const normalizedStart = startDate ? `${startDate.year}-${String(startDate.month + 1).padStart(2, "0")}` : null;
    const normalizedEnd = endDate === "Present"
      ? "Present"
      : (endDate ? `${endDate.year}-${String(endDate.month + 1).padStart(2, "0")}` : null);
    const roleConfidence = String(item?.title || "").trim() && !looksLikeSentenceLine(String(item?.title || "").trim()) ? 0.86 : 0.45;
    const companyConfidence = String(item?.company || "").trim() && isLikelyCompanyLine(String(item?.company || "").trim()) ? 0.88 : 0.45;
    const confidence = Math.max(0.2, Math.min(0.99, (roleConfidence + companyConfidence) / 2));
    return {
      company_name: String(item?.company || "").trim() || null,
      designation: String(item?.title || "").trim() || null,
      start_date: normalizedStart,
      end_date: normalizedEnd,
      is_current: /present/i.test(endText),
      raw_duration_text: rawDates || String(item?.duration || "").trim() || "",
      raw_block_text: blockEvidence?.text || anchor || "",
      confidence,
      evidence: {
        company_name: findEvidenceSpan(fullRawText, String(item?.company || ""), "raw_cv_text"),
        designation: findEvidenceSpan(fullRawText, String(item?.title || ""), "raw_cv_text"),
        date_range: blockEvidence
      }
    };
  });
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

function applyDateAnchoredCompanyHints(timeline = [], experienceLines = []) {
  if (!Array.isArray(timeline) || !timeline.length || !Array.isArray(experienceLines) || !experienceLines.length) {
    return timeline;
  }
  return timeline.map((row) => {
    const rawDates = String(row?.rawDates || "").trim();
    if (!rawDates) return row;
    const dateIdx = experienceLines.findIndex((line) => {
      const t = String(line || "").trim().toLowerCase();
      const d = rawDates.toLowerCase();
      return t === d || t.includes(d) || d.includes(t);
    });
    if (dateIdx <= 0) return row;
    const prev = cleanCompanyLine(experienceLines[dateIdx - 1] || "");
    const next = cleanRoleLine(experienceLines[dateIdx + 1] || "");
    if (!prev || !next) return row;
    if (!looksLikeRoleLine(next)) return row;
    if (looksLikeExperienceDate(prev) || isNoiseLine(prev)) return row;
    const titleNow = String(row?.title || "").trim().toLowerCase();
    const titleHint = String(next || "").trim().toLowerCase();
    const canUseHint =
      !titleNow ||
      !titleHint ||
      titleNow === titleHint ||
      titleNow.includes(titleHint) ||
      titleHint.includes(titleNow);
    if (!canUseHint) return row;
    return { ...row, company: prev, title: next || row.title };
  });
}

function extractCompanyDesignationTimeline(lines = []) {
  const out = [];
  const seen = new Set();
  const personalNoise = (value = "") => /\b(personal\s+vitae|date\s+of\s+birth|marital\s+status|languages?\s+known|place\s*:)\b/i.test(String(value || ""));
  for (let i = 0; i < lines.length; i += 1) {
    const line = String(lines[i] || "").trim();
    const m = line.match(/^(?:\d+\.\s*)?company\s*(?::|-)?\s*(.+?)\s*\(([^)]+)\)\s*$/i);
    if (!m) continue;
    const company = cleanCompanyLine(m[1]);
    const dates = String(m[2] || "").trim();
    if (!company || !dates || personalNoise(company) || personalNoise(dates)) continue;
    let title = "";
    for (let j = i + 1; j <= Math.min(i + 6, lines.length - 1); j += 1) {
      const probe = String(lines[j] || "").trim();
      const roleMatch = probe.match(/^(?:designation|role|position|title)\s*(?::|-)?\s*(.+)$/i);
      if (roleMatch?.[1]) {
        title = cleanRoleLine(roleMatch[1]);
        break;
      }
    }
    if (!title || !looksLikeRoleLine(title) || personalNoise(title)) continue;
    const range = parseDateRange(dates);
    const start = formatMonthYear(range.start);
    const end = range.isCurrent ? "Present" : formatMonthYear(range.end);
    if (!start) continue;
    const sIdx = monthIndex(range.start);
    const eIdx = monthIndex(range.end);
    const duration = sIdx !== null && eIdx !== null && eIdx >= sIdx ? formatMonthCount(eIdx - sIdx + 1) : dates;
    const key = `${title}|${company}|${start}|${end}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, company, start, end, duration, rawDates: dates, isCurrent: Boolean(range.isCurrent) });
  }
  return out;
}

async function parseCandidatePayload(payload) {
  const sourceType = sanitizeText(payload?.sourceType || "manual") || "manual";
  const extractedFileText = await extractTextFromUploadedFile(payload?.file || null);
  const rawText = sanitizeText(payload?.rawText || payload?.pageText || payload?.text || extractedFileText || "");
  const detectedSections = detectCvSections(rawText);
  const experienceText = detectedSections.work_experience || extractExperienceSection(rawText);
  const structuredExperienceText = sanitizeText(payload?.structuredExperience || "");
  const rawLines = splitLines(rawText);
  const experienceLines = splitLines(experienceText);
  const lines = (experienceLines || []).length >= 3
    ? experienceLines
    : Array.from(new Set([...(experienceLines || []), ...(rawLines || [])]));

  if (!rawText && !structuredExperienceText) {
    throw new Error("Provide candidate text, page text, or structured experience to parse.");
  }

  const candidateName = extractCandidateName(rawLines, rawText, payload?.candidateName);
  const claimedTotalExperience = extractTotalExperience(lines, rawText, payload?.totalExperience);
  const parsed = extractTimeline(lines, experienceText, structuredExperienceText);
  const parserV2Timeline = parseExperienceTimelineV2(experienceText, rawText);
  const parserV2TimelineFallback = parseExperienceTimelineV2(rawText, rawText);
  parsed.timeline = applyDateAnchoredCompanyHints(parsed.timeline, experienceLines);
  if (sourceType === "cv" && (!Array.isArray(parsed.timeline) || !parsed.timeline.length)) {
    parsed.timeline = extractCompanyDesignationTimeline(experienceLines);
  }
  if (sourceType === "cv" && Array.isArray(parserV2Timeline) && parserV2Timeline.length) {
    const legacyRows = (parsed.timeline || []).map((item) => ({
      company: String(item?.company || "").trim(),
      designation: String(item?.title || "").trim(),
      startDate: normalizeExperienceDate(String(item?.rawDates || "")).startDate || "",
      endDate: normalizeExperienceDate(String(item?.rawDates || "")).endDate || "",
      sourceText: String(item?.rawDates || "").trim(),
      confidence: "medium"
    }));
    const pickScore = (rows) => rows.reduce((sum, item) => {
      const companyScore = item.company && !isProjectNoiseLine(item.company) ? 2 : 0;
      const titleScore = item.designation && looksLikeRoleLine(item.designation) ? 2 : 0;
      const dateScore = item.startDate ? 2 : 0;
      return sum + companyScore + titleScore + dateScore;
    }, 0);
    const parserV2Score = pickScore(parserV2Timeline);
    const legacyScore = pickScore(legacyRows);
    if (parserV2Score >= legacyScore) {
      parsed.timeline = parserV2Timeline.map((item) => ({
        title: item.designation,
        company: item.company,
        start: item.startDate,
        end: item.endDate,
        duration: "",
        rawDates: `${item.startDate} - ${item.endDate}`,
        isCurrent: /present/i.test(String(item.endDate || ""))
      }));
    }
  }
  if (sourceType === "cv" && (!Array.isArray(parsed.timeline) || !parsed.timeline.length) && Array.isArray(parserV2TimelineFallback) && parserV2TimelineFallback.length) {
    parsed.timeline = parserV2TimelineFallback.map((item) => ({
      title: item.designation,
      company: item.company,
      start: item.startDate,
      end: item.endDate,
      duration: "",
      rawDates: `${item.startDate} - ${item.endDate}`,
      isCurrent: /present/i.test(String(item.endDate || ""))
    }));
  }
  const employmentHistory = buildEmploymentHistoryFromTimeline(parsed.timeline, experienceText, rawText);
  const timelineActiveMonths = calculateMonthsFromTimeline(parsed.timeline);
  const timelineSpanMonths = calculateTimelineSpanMonths(parsed.timeline);
  const currentOrgTenureMonths = calculateCurrentRoleMonths(parsed.timeline);
  const claimedTotalMonths = parseDurationTextToMonths(claimedTotalExperience);
  const timelineConfidence = buildTimelineConfidence({
    timeline: parsed.timeline,
    activeMonths: timelineActiveMonths,
    spanMonths: timelineSpanMonths,
    currentMonths: currentOrgTenureMonths,
    claimedMonths: claimedTotalMonths
  });
  let totalExperience = claimedTotalExperience;
  if (!totalExperience) {
    if (timelineActiveMonths > 0) {
      totalExperience = formatMonthCount(timelineActiveMonths);
    } else if (timelineSpanMonths > 0) {
      totalExperience = formatMonthCount(timelineSpanMonths);
    }
  }
  const currentRole = extractCurrentRoleFromTimeline(parsed.timeline);
  const currentOrgTenure = currentOrgTenureMonths > 0 ? formatMonthCount(currentOrgTenureMonths) : "";
  const emailId = extractPrimaryEmail(rawText);
  const phoneNumber = extractPrimaryPhone(rawText);
  const linkedinUrl = extractPrimaryLinkedIn(rawText);
  const location = extractPrimaryLocation(rawLines, rawText);
  const educationSectionText = detectedSections.education || detectedSections.education_qualification || "";
  const education = buildEducationHistoryFromSection(educationSectionText);
  const finalEducation = education.length ? education : buildEducationHistoryFallback(rawText);
  const highestQualification = pickHighestQualificationFromEducationRows(finalEducation);
  const skills = extractSkillsFromSections(detectedSections, rawText);
  const parserWarnings = [];
  if (!educationSectionText && !finalEducation.length) {
    parserWarnings.push("No explicit education section found; do not fill education from objective/projects/responsibilities.");
  }
  if (educationSectionText && !highestQualification) {
    parserWarnings.push("Education section found but no reliable degree could be validated.");
  }
  if (/silver lake villa/i.test(rawText)) {
    parserWarnings.push("Do not treat project names such as Silver Lake Villa as companies.");
  }
  if (parsed.timeline.some((item) => !String(item?.company || "").trim())) {
    parserWarnings.push("Some company names are missing/unclear in extracted text; keep them blank instead of inventing.");
  }
  if (parsed.timeline.some((item) => !String(item?.title || "").trim())) {
    parserWarnings.push("Some designations are missing/unclear in extracted text; keep them blank instead of inventing.");
  }
  const confidence = computeParserConfidenceSummary({
    timeline: parsed.timeline,
    education: finalEducation,
    currentCompany: currentRole.currentCompany,
    currentDesignation: currentRole.currentDesignation,
    phoneNumber,
    emailId
  });
  const experienceTimeline = parsed.timeline.map((item) => {
    const normalizedDates = normalizeExperienceDate(String(item?.rawDates || ""));
    return {
      company: normalizeCompanyDisplay(String(item?.company || "")),
      designation: cleanExperienceTitle(String(item?.title || "")),
      startDate: normalizedDates.startDate || String(item?.start || ""),
      endDate: normalizedDates.endDate || String(item?.end || ""),
      sourceText: String(item?.rawDates || "").trim() || [item?.company, item?.title].filter(Boolean).join(" | "),
      confidence: "high"
    };
  });

  return {
    candidateName,
    totalExperience,
    currentCompany: normalizeCompanyDisplay(currentRole.currentCompany),
    currentDesignation: cleanExperienceTitle(currentRole.currentDesignation),
    currentOrgTenure,
    emailId,
    phoneNumber,
    linkedinUrl,
    location,
    sourceType,
    filename: sanitizeText(payload?.file?.filename || ""),
    timeline: parsed.timeline,
    employmentHistory,
    detectedSections,
    workExperienceSection: experienceText,
    rawJobBlocks: employmentHistory.map((item) => item.raw_block_text).filter(Boolean),
    gaps: parsed.gaps,
    shortStints: parsed.shortStints,
    timelineConfidence,
    experienceTimeline,
    education: finalEducation,
    highestQualification,
    skills,
    parserWarnings,
    confidence,
    experienceMetrics: {
      claimedTotalExperience,
      claimedTotalMonths,
      timelineSpanMonths,
      timelineActiveMonths,
      currentOrgTenureMonths
    },
    highlights: parsed.highlights,
    rawTextPreview: rawText.slice(0, 2000),
    rawText
  };
}

module.exports = {
  parseCandidatePayload
};
