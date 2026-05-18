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
  const iso = raw.match(/^(\d{4})-(\d{2})$/);
  if (iso) return Number(iso[1]) * 12 + Number(iso[2]);
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
  const cleaned = (rows || []).filter((row) =>
    !isSuspiciousCompanyCandidate(row?.company || "") &&
    !looksLikeContactLine(row?.designation || "")
  );
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
      totalExperience: String(candidate?.totalExperience || "").trim(),
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
