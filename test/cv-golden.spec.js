const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseCandidatePayload } = require("../src/parser");

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE_DIR = path.join(ROOT, "Test CVs");
const GOLDEN_PATH = path.join(FIXTURE_DIR, "cv_golden_dataset.json");

function normalizeText(value) {
  return String(value || "")
    .replace(/â€“/g, "-")
    .replace(/[–—]/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .trim()
    .toLowerCase();
}

function equalNormalized(actual, expected, label) {
  assert.equal(normalizeText(actual), normalizeText(expected), `${label}\nexpected: ${expected}\nactual: ${actual}`);
}

function normalizeExperienceRows(rows = []) {
  return (rows || []).map((row) => ({
    company: String(row?.company || "").trim(),
    designation: String(row?.designation || "").trim(),
    startDate: String(row?.startDate || "").trim(),
    endDate: String(row?.endDate || "").trim()
  }));
}

function normalizeEducationRows(rows = []) {
  return (rows || []).map((row) => ({
    degree: String(row?.degree || "").trim(),
    institution: String(row?.institution || "").trim(),
    year: String(row?.year || "").trim(),
    startDate: String(row?.startDate || "").trim(),
    endDate: String(row?.endDate || "").trim(),
    score: String(row?.score || "").trim()
  }));
}

async function parseFixturePdf(filename) {
  const filePath = path.join(FIXTURE_DIR, filename);
  const fileData = fs.readFileSync(filePath).toString("base64");
  return parseCandidatePayload({
    sourceType: "cv",
    file: {
      filename,
      mimeType: "application/pdf",
      fileData
    }
  });
}

async function run() {
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const missingFixtures = [];

  for (const item of golden) {
    const filePath = path.join(FIXTURE_DIR, item.file);
    if (!fs.existsSync(filePath)) {
      missingFixtures.push(item.file);
      continue;
    }

    const parsed = await parseFixturePdf(item.file);
    equalNormalized(parsed.candidateName, item.candidateName, `${item.file}: candidateName`);
    equalNormalized(parsed.currentCompany, item.currentCompany, `${item.file}: currentCompany`);
    equalNormalized(parsed.currentDesignation, item.currentDesignation, `${item.file}: currentDesignation`);
    equalNormalized(parsed.totalExperience, item.totalExperience, `${item.file}: totalExperience`);

    if (Object.prototype.hasOwnProperty.call(item, "location")) {
      equalNormalized(parsed.location, item.location, `${item.file}: location`);
    }

    equalNormalized(parsed.highestQualification, item.highestQualification, `${item.file}: highestQualification`);

    const actualExperience = normalizeExperienceRows(parsed.experienceTimeline);
    const expectedExperience = normalizeExperienceRows(item.experienceTimeline);
    assert.equal(actualExperience.length, expectedExperience.length, `${item.file}: experienceTimeline length mismatch`);
    expectedExperience.forEach((expectedRow, index) => {
      const actualRow = actualExperience[index] || {};
      equalNormalized(actualRow.company, expectedRow.company, `${item.file}: experience[${index}].company`);
      equalNormalized(actualRow.designation, expectedRow.designation, `${item.file}: experience[${index}].designation`);
      equalNormalized(actualRow.startDate, expectedRow.startDate, `${item.file}: experience[${index}].startDate`);
      equalNormalized(actualRow.endDate, expectedRow.endDate, `${item.file}: experience[${index}].endDate`);
    });

    const actualEducation = normalizeEducationRows(parsed.education);
    const expectedEducation = normalizeEducationRows(item.education);
    assert.equal(actualEducation.length, expectedEducation.length, `${item.file}: education length mismatch`);
    expectedEducation.forEach((expectedRow, index) => {
      const actualRow = actualEducation[index] || {};
      equalNormalized(actualRow.degree, expectedRow.degree, `${item.file}: education[${index}].degree`);
      if (expectedRow.institution) equalNormalized(actualRow.institution, expectedRow.institution, `${item.file}: education[${index}].institution`);
      if (expectedRow.year) equalNormalized(actualRow.year, expectedRow.year, `${item.file}: education[${index}].year`);
      if (expectedRow.startDate) equalNormalized(actualRow.startDate, expectedRow.startDate, `${item.file}: education[${index}].startDate`);
      if (expectedRow.endDate) equalNormalized(actualRow.endDate, expectedRow.endDate, `${item.file}: education[${index}].endDate`);
      if (expectedRow.score) equalNormalized(actualRow.score, expectedRow.score, `${item.file}: education[${index}].score`);
    });

    const actualWarnings = Array.isArray(parsed.parserWarnings) ? parsed.parserWarnings : [];
    const expectedWarnings = Array.isArray(item.parserWarnings) ? item.parserWarnings : [];
    expectedWarnings.forEach((warning, index) => {
      const found = actualWarnings.some((value) => normalizeText(value).includes(normalizeText(warning)));
      assert.equal(found, true, `${item.file}: parserWarnings[${index}] missing\nexpected warning: ${warning}\nactual warnings: ${actualWarnings.join(" | ")}`);
    });
  }

  if (missingFixtures.length) {
    process.stdout.write(`warn missing golden fixtures: ${missingFixtures.join(", ")}\n`);
  }
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}
