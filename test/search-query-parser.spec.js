const assert = require("node:assert/strict");

const { DEFAULT_SYNONYMS } = require("../src/search/synonyms");
const { parseDeterministicRecruiterQuery, resolveKnownRole } = require("../src/search/query-parser");

function run() {
  const q1 = parseDeterministicRecruiterQuery("Get me Node developers from Gurgaon", DEFAULT_SYNONYMS);
  assert.equal(q1.role, "nodejs developer");
  assert.deepEqual(q1.locations, ["gurgaon"]);
  assert.deepEqual(q1.skills, ["nodejs"]);

  const q2 = parseDeterministicRecruiterQuery("Get me Node developers in Gurgaon", DEFAULT_SYNONYMS);
  assert.equal(q2.role, "nodejs developer");
  assert.deepEqual(q2.locations, ["gurgaon"]);

  const q3 = parseDeterministicRecruiterQuery("Get me Node developers in Gurgaon, Hyderabad, Bangalore", DEFAULT_SYNONYMS);
  assert.deepEqual(q3.locations, ["gurgaon", "hyderabad", "bangalore"]);

  const q4 = parseDeterministicRecruiterQuery("get me nodejs developers who has less than 15 days notice period", DEFAULT_SYNONYMS);
  assert.equal(q4.role, "nodejs developer");
  assert.equal(q4.maxNoticeDays, 15);
  assert.equal(q4.skills.includes("nodejs"), true);
  assert.equal(q4.skills.includes("has"), false);
  assert.equal(q4.skills.includes("less"), false);

  const q5 = parseDeterministicRecruiterQuery("GET ME Fintech or finance or lending sales profiles in Gurugram", DEFAULT_SYNONYMS);
  assert.equal(q5.role, "sales");
  assert.equal(q5.roleFamilies.includes("sales"), true);
  assert.deepEqual(q5.locations, ["gurgaon"]);
  assert.deepEqual(q5.domainKeywords.sort(), ["finance", "fintech", "lending"].sort());

  const q6 = parseDeterministicRecruiterQuery("React developer immediate joiner in Noida", DEFAULT_SYNONYMS);
  assert.equal(q6.role, "react developer");
  assert.deepEqual(q6.locations, ["noida"]);
  assert.equal(q6.maxNoticeDays, 0);

  const q7 = parseDeterministicRecruiterQuery("Java developer under 30 days notice in Pune", DEFAULT_SYNONYMS);
  assert.equal(q7.role, "java developer");
  assert.deepEqual(q7.locations, ["pune"]);
  assert.equal(q7.maxNoticeDays, 30);

  const q8 = parseDeterministicRecruiterQuery("Sales profiles in Gurgaon", DEFAULT_SYNONYMS);
  assert.equal(q8.role, "sales");
  assert.deepEqual(q8.locations, ["gurgaon"]);

  const q9 = parseDeterministicRecruiterQuery("Finance sales profiles in Gurgaon", DEFAULT_SYNONYMS);
  assert.equal(q9.role, "sales");
  assert.deepEqual(q9.locations, ["gurgaon"]);
  assert.deepEqual(q9.domainKeywords, ["finance"]);

  const q10 = parseDeterministicRecruiterQuery("Lending sales manager in Hyderabad", DEFAULT_SYNONYMS);
  assert.equal(q10.role, "sales manager");
  assert.deepEqual(q10.locations, ["hyderabad"]);
  assert.deepEqual(q10.domainKeywords, ["lending"]);

  const q11 = parseDeterministicRecruiterQuery("Get me duplicate in Attentive from captured notes", DEFAULT_SYNONYMS);
  assert.equal(q11.sourceTypeFilter, "captured");
  assert.equal(q11.detailedStatuses.includes("duplicate"), true);
  assert.equal(q11.attemptOutcome, "Duplicate");

  const q12 = parseDeterministicRecruiterQuery("Get me candidates in fintech sales from Hyderabad and Delhi", DEFAULT_SYNONYMS);
  assert.deepEqual(q12.locations, ["hyderabad", "delhi"]);
  assert.equal(q12.role, "sales");
  assert.deepEqual(q12.domainKeywords, ["fintech"]);

  assert.equal(resolveKnownRole("Node Developer"), "nodejs developer");
  assert.equal(resolveKnownRole(".NET Developer"), "dotnet developer");
  assert.equal(resolveKnownRole("those who are"), "");
}

module.exports = { run };
