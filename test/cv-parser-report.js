const fs = require("node:fs");
const path = require("node:path");

const { parseCandidateHybrid } = require("../src/hybrid-candidate-service");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_CV_DIR = path.join(ROOT, "tests", "cv-parser", "resumes");
const FALLBACK_CV_DIR = path.join(ROOT, "..", "Test CVs");
const DEFAULT_GOLDEN_PATH = path.join(ROOT, "tests", "cv-parser", "cv_golden_dataset.json");
const FALLBACK_GOLDEN_PATH = path.join(FALLBACK_CV_DIR, "cv_golden_dataset.json");
const REPORT_DIR = path.join(ROOT, "tests", "cv-parser", "reports");
const JSON_REPORT_PATH = path.join(REPORT_DIR, "mismatch-report.json");
const MD_REPORT_PATH = path.join(REPORT_DIR, "mismatch-report.md");
const CSV_REPORT_PATH = path.join(FALLBACK_CV_DIR, "mismatch-report-hybrid.csv");

function formatText(value) {
  return String(value || "").trim();
}

function normalizeFilename(name = "") {
  return String(name || "")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\s*\(\d+\)\s*$/g, "")
    .replace(/\s*-\s*copy\s*$/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function normalizeText(value) {
  return String(value || "")
    .replace(/[\u2018\u2019`´]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/[.,;:!?()[\]{}]/g, " ")
    .replace(/\bprivate\s+limited\b/gi, "pvt ltd")
    .replace(/\bpvt\.?\s*ltd\.?\b/gi, "pvt ltd")
    .replace(/\blimited\b/gi, "ltd")
    .replace(/\bpvt\s+ltd\b/gi, "")
    .replace(/\bltd\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeDesignation(value) {
  return normalizeText(value).replace(/\b(sr|senior)\b/g, "senior").trim();
}

function normalizeDateWord(value = "") {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^(present|current|ongoing)$/i.test(v)) return "Present";
  return v;
}

function normalizeRows(rows = []) {
  return (rows || []).map((row) => ({
    company: formatText(row?.company || row?.company_name),
    designation: formatText(row?.designation),
    startDate: formatText(row?.startDate || row?.start_date),
    endDate: normalizeDateWord(formatText(row?.endDate || row?.end_date))
  }));
}

function equalNormalizedCompany(a, b) {
  return normalizeText(a) === normalizeText(b);
}

function equalNormalizedDesignation(a, b) {
  return normalizeDesignation(a) === normalizeDesignation(b);
}

function equalNormalizedGeneric(a, b) {
  return normalizeText(a) === normalizeText(b);
}

function uniqueByNormalized(values = [], normalizer = normalizeText) {
  const out = new Map();
  for (const v of values) {
    const raw = formatText(v);
    const key = normalizer(raw);
    if (!key) continue;
    if (!out.has(key)) out.set(key, raw);
  }
  return out;
}

function findBestFileMatch(expectedFile, cvFiles) {
  const exact = cvFiles.find((f) => f === expectedFile);
  if (exact) return { file: exact, mode: "exact" };
  const nExpected = normalizeFilename(expectedFile);
  const normalizedMatches = cvFiles.filter((f) => normalizeFilename(f) === nExpected);
  if (normalizedMatches.length === 1) return { file: normalizedMatches[0], mode: "normalized" };
  if (normalizedMatches.length > 1) return { file: normalizedMatches[0], mode: "normalized-ambiguous" };
  return { file: null, mode: "missing" };
}

function resolveDatasetPaths() {
  const cvDir = fs.existsSync(DEFAULT_CV_DIR) ? DEFAULT_CV_DIR : FALLBACK_CV_DIR;
  const goldenPath = fs.existsSync(DEFAULT_GOLDEN_PATH) ? DEFAULT_GOLDEN_PATH : FALLBACK_GOLDEN_PATH;
  return { cvDir, goldenPath };
}

async function parsePdfFromFileHybrid(absPath, logicalName) {
  const fileData = fs.readFileSync(absPath).toString("base64");
  const hybrid = await parseCandidateHybrid({
    payload: {
      sourceType: "cv",
      normalizeWithAi: true,
      model: String(process.env.OPENAI_MODEL || "").trim(),
      file: {
        filename: logicalName,
        mimeType: "application/pdf",
        fileData
      }
    },
    apiKey: String(process.env.OPENAI_API_KEY || "").trim(),
    model: String(process.env.OPENAI_MODEL || "").trim(),
    normalizeWithAi: true
  });
  return hybrid;
}

function csvEscape(value) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildMarkdown(report) {
  const s = report.summary;
  const lines = [];
  lines.push("# CV Parser Regression Mismatch Report (Hybrid Pipeline)");
  lines.push("");
  lines.push(`- Generated at: ${report.generatedAt}`);
  lines.push(`- CV source dir: ${report.cvSourceDir}`);
  lines.push(`- Golden file: ${report.goldenDatasetPath}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total CVs tested: ${s.totalMappedCVs}`);
  lines.push(`- Pass count: ${s.passCount}`);
  lines.push(`- Fail count: ${s.failCount}`);
  lines.push(`- CurrentCompany missing: ${s.currentCompanyMissingCount}`);
  lines.push(`- Experience count mismatch: ${s.experienceCountMismatchCount}`);
  lines.push(`- Missing previous companies: ${s.missingPreviousCompaniesCount}`);
  lines.push(`- Extra wrong companies: ${s.extraWrongCompaniesCount}`);
  lines.push(`- AI fallback triggered count: ${s.aiFallbackTriggeredCount}`);
  lines.push(`- Rule parser clean pass count: ${s.ruleParserCleanPassCount}`);
  lines.push(`- NeedsReview count: ${s.needsReviewCount}`);
  lines.push("");
  lines.push("## Per CV");
  lines.push("");
  for (const r of report.results) {
    lines.push(`### ${r.fileName}`);
    lines.push(`- mappedFile: ${r.mappedFile || "-"}`);
    lines.push(`- rule parser used: ${r.ruleParserUsed ? "yes" : "no"}`);
    lines.push(`- ai fallback triggered: ${r.aiFallbackTriggered ? "yes" : "no"}`);
    lines.push(`- status: ${r.status}`);
    lines.push(`- expected currentCompany vs actual: ${r.expectedVsActual.currentCompany.expected || ""} | ${r.expectedVsActual.currentCompany.actual || ""}`);
    lines.push(`- expected currentDesignation vs actual: ${r.expectedVsActual.currentDesignation.expected || ""} | ${r.expectedVsActual.currentDesignation.actual || ""}`);
    lines.push(`- expected experience count vs actual: ${r.expectedVsActual.experienceCount.expected} | ${r.expectedVsActual.experienceCount.actual}`);
    lines.push(`- missing companies: ${r.missingCompanies.join("; ") || "-"}`);
    lines.push(`- extra wrong companies: ${r.extraOrWrongCompanies.join("; ") || "-"}`);
    lines.push(`- wrong date ranges: ${r.wrongDateRanges.join("; ") || "-"}`);
    lines.push(`- mismatch summary: ${r.mismatchSummary || "none"}`);
    lines.push(`- final output: ${JSON.stringify(r.finalOutputCompact)}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function run() {
  const { cvDir, goldenPath } = resolveDatasetPaths();
  const golden = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  const cvFiles = fs.readdirSync(cvDir).filter((f) => /\.pdf$/i.test(f));
  const results = [];

  for (const expected of golden) {
    const fileName = expected.file;
    const mapped = findBestFileMatch(fileName, cvFiles);
    const baseEntry = {
      fileName,
      mappedFile: mapped.file,
      mappingMode: mapped.mode,
      status: "PASS",
      ruleParserUsed: true,
      aiFallbackTriggered: false,
      expectedVsActual: {
        currentCompany: { expected: formatText(expected.currentCompany), actual: "" },
        currentDesignation: { expected: formatText(expected.currentDesignation), actual: "" },
        experienceCount: { expected: (expected.experienceTimeline || []).length, actual: 0 }
      },
      missingCompanies: [],
      extraOrWrongCompanies: [],
      wrongDateRanges: [],
      mismatchSummary: "",
      finalOutputCompact: {}
    };

    if (!mapped.file) {
      baseEntry.status = "DATASET_MISSING";
      baseEntry.mismatchSummary = "missing CV file for golden entry";
      results.push(baseEntry);
      continue;
    }

    const absPath = path.join(cvDir, mapped.file);
    let hybrid;
    try {
      hybrid = await parsePdfFromFileHybrid(absPath, mapped.file);
    } catch (err) {
      baseEntry.status = "FAIL";
      baseEntry.mismatchSummary = `parser runtime failure: ${err?.message || String(err)}`;
      results.push(baseEntry);
      continue;
    }

    const actual = hybrid.finalOutput || {};
    const actualTimeline = normalizeRows(actual.experienceTimeline || []);
    const expectedTimeline = normalizeRows(expected.experienceTimeline || []);

    baseEntry.ruleParserUsed = Boolean(hybrid?.meta?.ruleParserUsed);
    baseEntry.aiFallbackTriggered = Boolean(hybrid?.meta?.aiFallbackTriggered);
    baseEntry.expectedVsActual.currentCompany.actual = formatText(actual.currentCompany);
    baseEntry.expectedVsActual.currentDesignation.actual = formatText(actual.currentDesignation);
    baseEntry.expectedVsActual.experienceCount.actual = actualTimeline.length;

    const expCompanyMap = uniqueByNormalized(expectedTimeline.map((x) => x.company), normalizeText);
    const actCompanyMap = uniqueByNormalized(actualTimeline.map((x) => x.company), normalizeText);
    for (const [k, v] of expCompanyMap.entries()) if (!actCompanyMap.has(k)) baseEntry.missingCompanies.push(v);
    for (const [k, v] of actCompanyMap.entries()) if (!expCompanyMap.has(k)) baseEntry.extraOrWrongCompanies.push(v);

    const maxRows = Math.max(expectedTimeline.length, actualTimeline.length);
    for (let i = 0; i < maxRows; i += 1) {
      const exp = expectedTimeline[i] || {};
      const act = actualTimeline[i] || {};
      const expDate = `${exp.startDate || ""} -> ${exp.endDate || ""}`;
      const actDate = `${act.startDate || ""} -> ${act.endDate || ""}`;
      if (!equalNormalizedGeneric(expDate, actDate)) {
        baseEntry.wrongDateRanges.push(`row ${i + 1}: expected [${expDate}] actual [${actDate}]`);
      }
    }

    const companyMismatch = !equalNormalizedCompany(expected.currentCompany, actual.currentCompany);
    const designationMismatch = !equalNormalizedDesignation(expected.currentDesignation, actual.currentDesignation);
    const experienceCountMismatch = expectedTimeline.length !== actualTimeline.length;

    const failures = [];
    if (companyMismatch) failures.push("currentCompany mismatch");
    if (designationMismatch) failures.push("currentDesignation mismatch");
    if (experienceCountMismatch) failures.push("experience count mismatch");
    if (baseEntry.missingCompanies.length) failures.push("missing previous companies");
    if (baseEntry.extraOrWrongCompanies.length) failures.push("extra wrong companies");
    if (baseEntry.wrongDateRanges.length) failures.push("date range mismatch");

    if (failures.length) {
      baseEntry.status = "FAIL";
      baseEntry.mismatchSummary = failures.join("; ");
    }

    baseEntry.finalOutputCompact = {
      currentCompany: formatText(actual.currentCompany),
      currentDesignation: formatText(actual.currentDesignation),
      totalExperience: formatText(actual.totalExperience),
      highestQualification: formatText(actual.highestQualification),
      experience: actual.experienceTimeline || [],
      education: actual.education || [],
      skills: actual.skills || [],
      needsReview: Boolean(actual.needsReview)
    };

    results.push(baseEntry);
  }

  const mapped = results.filter((r) => r.status !== "DATASET_MISSING");
  const fails = mapped.filter((r) => r.status === "FAIL");

  const summary = {
    totalGoldenEntries: results.length,
    totalMappedCVs: mapped.length,
    passCount: mapped.filter((r) => r.status === "PASS").length,
    failCount: fails.length,
    currentCompanyMissingCount: mapped.filter((r) => !formatText(r.expectedVsActual.currentCompany.actual)).length,
    experienceCountMismatchCount: mapped.filter((r) => r.expectedVsActual.experienceCount.expected !== r.expectedVsActual.experienceCount.actual).length,
    missingPreviousCompaniesCount: mapped.filter((r) => r.missingCompanies.length > 0).length,
    extraWrongCompaniesCount: mapped.filter((r) => r.extraOrWrongCompanies.length > 0).length,
    aiFallbackTriggeredCount: mapped.filter((r) => r.aiFallbackTriggered).length,
    ruleParserCleanPassCount: mapped.filter((r) => r.ruleParserUsed && !r.aiFallbackTriggered && r.status === "PASS").length,
    needsReviewCount: mapped.filter((r) => Boolean(r.finalOutputCompact?.needsReview)).length,
    fileMissingCount: results.filter((r) => r.status === "DATASET_MISSING").length
  };

  const report = {
    generatedAt: new Date().toISOString(),
    cvSourceDir: cvDir,
    goldenDatasetPath: goldenPath,
    summary,
    results
  };

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(report, null, 2));
  fs.writeFileSync(MD_REPORT_PATH, buildMarkdown(report));

  const csvHeaders = [
    "fileName",
    "mappedFile",
    "status",
    "ruleParserUsed",
    "aiFallbackTriggered",
    "expectedCurrentCompany",
    "actualCurrentCompany",
    "expectedCurrentDesignation",
    "actualCurrentDesignation",
    "expectedExperienceCount",
    "actualExperienceCount",
    "missingCompanies",
    "extraWrongCompanies",
    "wrongDateRanges",
    "mismatchSummary"
  ];
  const csvRows = [csvHeaders.join(",")];
  for (const r of results) {
    csvRows.push([
      csvEscape(r.fileName),
      csvEscape(r.mappedFile || ""),
      csvEscape(r.status),
      csvEscape(String(r.ruleParserUsed)),
      csvEscape(String(r.aiFallbackTriggered)),
      csvEscape(r.expectedVsActual.currentCompany.expected),
      csvEscape(r.expectedVsActual.currentCompany.actual),
      csvEscape(r.expectedVsActual.currentDesignation.expected),
      csvEscape(r.expectedVsActual.currentDesignation.actual),
      csvEscape(String(r.expectedVsActual.experienceCount.expected)),
      csvEscape(String(r.expectedVsActual.experienceCount.actual)),
      csvEscape(r.missingCompanies.join(" | ")),
      csvEscape(r.extraOrWrongCompanies.join(" | ")),
      csvEscape(r.wrongDateRanges.join(" | ")),
      csvEscape(r.mismatchSummary || "")
    ].join(","));
  }
  fs.writeFileSync(CSV_REPORT_PATH, csvRows.join("\n"));

  process.stdout.write("Hybrid CV parser mismatch report generated.\n");
  process.stdout.write(`total CVs tested: ${summary.totalMappedCVs}\n`);
  process.stdout.write(`pass count: ${summary.passCount}\n`);
  process.stdout.write(`fail count: ${summary.failCount}\n`);
  process.stdout.write(`currentCompany missing: ${summary.currentCompanyMissingCount}\n`);
  process.stdout.write(`experience count mismatch: ${summary.experienceCountMismatchCount}\n`);
  process.stdout.write(`missing previous companies: ${summary.missingPreviousCompaniesCount}\n`);
  process.stdout.write(`extra wrong companies: ${summary.extraWrongCompaniesCount}\n`);
  process.stdout.write(`AI fallback triggered count: ${summary.aiFallbackTriggeredCount}\n`);
  process.stdout.write(`rule parser clean pass count: ${summary.ruleParserCleanPassCount}\n`);
  process.stdout.write(`needsReview count: ${summary.needsReviewCount}\n`);
  process.stdout.write(`json report: ${JSON_REPORT_PATH}\n`);
  process.stdout.write(`markdown report: ${MD_REPORT_PATH}\n`);
  process.stdout.write(`csv report: ${CSV_REPORT_PATH}\n`);
}

run().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
