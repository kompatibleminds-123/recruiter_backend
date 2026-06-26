const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { parseCandidateHybrid } = require("../src/hybrid-candidate-service");

const ROOT = path.resolve(__dirname, "..", "..");
const FIXTURE_DIR = path.join(ROOT, "Test CVs");
const GOLDEN_PATH = path.join(FIXTURE_DIR, "cv_golden_dataset.json");
const BASELINE_PATH = path.join(__dirname, "cv-hybrid-freeze-baseline.json");

function normalizeText(value) {
  return String(value || "")
    .replace(/Ã¢â‚¬â€œ/g, "-")
    .replace(/[â€“â€”]/g, "-")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.)])/g, "$1")
    .trim()
    .toLowerCase();
}

function equalNormalized(actual, expected, label) {
  assert.equal(
    normalizeText(actual),
    normalizeText(expected),
    `${label}\nexpected: ${expected}\nactual: ${actual}`
  );
}

function normalizeExperienceRows(rows = []) {
  return (rows || []).map((row) => ({
    company: String(row?.company || "").trim(),
    designation: String(row?.designation || "").trim(),
    startDate: String(row?.startDate || row?.start || "").trim(),
    endDate: String(row?.endDate || row?.end || "").trim()
  }));
}

function normalizeEducationRows(rows = []) {
  return (rows || []).map((row) => ({
    degree: String(row?.degree || "").trim(),
    institution: String(row?.institution || "").trim(),
    year: String(row?.year || "").trim(),
    startDate: String(row?.startDate || row?.start || "").trim(),
    endDate: String(row?.endDate || row?.end || "").trim(),
    score: String(row?.score || "").trim()
  }));
}

async function parseFixturePdf(filename) {
  const filePath = path.join(FIXTURE_DIR, filename);
  const fileData = fs.readFileSync(filePath).toString("base64");
  const hybrid = await parseCandidateHybrid({
    payload: {
      sourceType: "cv",
      file: {
        filename,
        mimeType: "application/pdf",
        fileData
      }
    },
    apiKey: "",
    model: "",
    normalizeWithAi: false
  });
  return hybrid?.finalOutput || {};
}

async function run() {
  const golden = JSON.parse(fs.readFileSync(GOLDEN_PATH, "utf8"));
  const missingFixtures = [];
  const actualResults = [];

  for (const item of golden) {
    const filePath = path.join(FIXTURE_DIR, item.file);
    if (!fs.existsSync(filePath)) {
      missingFixtures.push(item.file);
      continue;
    }

    const parsed = await parseFixturePdf(item.file);
    actualResults.push({
      file: item.file,
      candidateName: String(parsed.candidateName || "").trim(),
      currentCompany: String(parsed.currentCompany || "").trim(),
      currentDesignation: String(parsed.currentDesignation || "").trim(),
      totalExperience: String(parsed.totalExperience || "").trim(),
      location: String(parsed.location || "").trim(),
      highestQualification: String(parsed.highestQualification || "").trim(),
      experienceTimeline: normalizeExperienceRows(parsed.experienceTimeline),
      education: normalizeEducationRows(parsed.education)
    });
  }

  if (missingFixtures.length) {
    process.stdout.write(`warn missing hybrid golden fixtures: ${missingFixtures.join(", ")}\n`);
  }

  if (process.env.UPDATE_CV_HYBRID_FREEZE === "1") {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(actualResults, null, 2));
    process.stdout.write(`updated ${path.basename(BASELINE_PATH)} with ${actualResults.length} entries\n`);
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
  assert.equal(actualResults.length, baseline.length, "cv hybrid freeze size mismatch");

  baseline.forEach((expected, index) => {
    const actual = actualResults[index] || {};
    const label = expected.file || actual.file || `entry-${index}`;
    equalNormalized(actual.file, expected.file, `${label}: file`);
    equalNormalized(actual.candidateName, expected.candidateName, `${label}: candidateName`);
    equalNormalized(actual.currentCompany, expected.currentCompany, `${label}: currentCompany`);
    equalNormalized(actual.currentDesignation, expected.currentDesignation, `${label}: currentDesignation`);
    equalNormalized(actual.totalExperience, expected.totalExperience, `${label}: totalExperience`);
    equalNormalized(actual.location, expected.location, `${label}: location`);
    equalNormalized(actual.highestQualification, expected.highestQualification, `${label}: highestQualification`);

    assert.equal(actual.experienceTimeline.length, expected.experienceTimeline.length, `${label}: experienceTimeline length mismatch`);
    expected.experienceTimeline.forEach((expectedRow, rowIndex) => {
      const actualRow = actual.experienceTimeline[rowIndex] || {};
      equalNormalized(actualRow.company, expectedRow.company, `${label}: experience[${rowIndex}].company`);
      equalNormalized(actualRow.designation, expectedRow.designation, `${label}: experience[${rowIndex}].designation`);
      equalNormalized(actualRow.startDate, expectedRow.startDate, `${label}: experience[${rowIndex}].startDate`);
      equalNormalized(actualRow.endDate, expectedRow.endDate, `${label}: experience[${rowIndex}].endDate`);
    });

    assert.equal(actual.education.length, expected.education.length, `${label}: education length mismatch`);
    expected.education.forEach((expectedRow, rowIndex) => {
      const actualRow = actual.education[rowIndex] || {};
      equalNormalized(actualRow.degree, expectedRow.degree, `${label}: education[${rowIndex}].degree`);
      equalNormalized(actualRow.institution, expectedRow.institution, `${label}: education[${rowIndex}].institution`);
      equalNormalized(actualRow.year, expectedRow.year, `${label}: education[${rowIndex}].year`);
      equalNormalized(actualRow.startDate, expectedRow.startDate, `${label}: education[${rowIndex}].startDate`);
      equalNormalized(actualRow.endDate, expectedRow.endDate, `${label}: education[${rowIndex}].endDate`);
      equalNormalized(actualRow.score, expectedRow.score, `${label}: education[${rowIndex}].score`);
    });
  });
}

module.exports = { run };

if (require.main === module) {
  run().catch((error) => {
    console.error(error?.stack || String(error));
    process.exit(1);
  });
}
