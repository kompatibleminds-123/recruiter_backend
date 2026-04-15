const assert = require("node:assert/strict");

const {
  DEFAULT_SYNONYMS,
  expandSkillTerms,
  inferExperienceRangeFromText,
  mapLocationAlias
} = require("../src/search/synonyms");
const { normalizeRecruiterQuery } = require("../src/search/normalize");

function run() {
  const normalized = normalizeRecruiterQuery("Find NodeJS dev in Bombay with four yrs exp", DEFAULT_SYNONYMS);
  assert.equal(normalized.normalized.includes("4 years"), true);
  assert.equal(normalized.normalized.includes("mumbai"), true);
  assert.equal(normalized.normalized.includes("nodejs"), true);

  const expanded = expandSkillTerms(["node developer"], DEFAULT_SYNONYMS);
  assert.equal(expanded.includes("node developer"), true);
  assert.equal(expanded.includes("nodejs"), true);

  assert.deepEqual(inferExperienceRangeFromText("need senior react developer", DEFAULT_SYNONYMS), { min: 6, max: null, label: "senior" });
  assert.deepEqual(inferExperienceRangeFromText("junior java dev", DEFAULT_SYNONYMS), { min: 0, max: 2, label: "junior" });

  const mapped = mapLocationAlias("delhi ncr", DEFAULT_SYNONYMS);
  // Canonical uses a real city name so strict `filters.location` checks don't fail in search.
  assert.equal(mapped.canonical, "delhi");
  assert.deepEqual(mapped.variants.sort(), ["delhi", "gurgaon", "noida"].sort());
}

module.exports = { run };
