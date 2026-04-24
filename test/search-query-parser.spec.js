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

  const matrix = [
    ["need .NET developers in Gurugram and delhi with 4 years", { mustSkill: "dotnet", mustLocs: ["gurgaon", "delhi"] }],
    ["Get me Node developers from Gurgaon", { mustSkill: "nodejs", mustLocs: ["gurgaon"] }],
    ["Get me nodejs engineers in ggn", { mustSkill: "nodejs", mustLocs: ["gurgaon"] }],
    ["react developer in noida", { mustSkill: "react", mustLocs: ["noida"] }],
    ["java spring profiles in pune", { mustSkill: "java", mustLocs: ["pune"] }],
    ["golang backend in bangalore", { mustSkill: "golang", mustLocs: ["bangalore"] }],
    ["python django in hyderabad", { mustSkill: "python", mustLocs: ["hyderabad"] }],
    ["dot net core in delhi ncr", { mustSkill: "dotnet" }],
    ["node js dev in blr", { mustSkill: "nodejs", mustLocs: ["bangalore"] }],
    ["react js in bombay", { mustSkill: "react", mustLocs: ["mumbai"] }],
    ["java developer under 30 days notice in pune", { mustRole: "java developer", maxNotice: 30 }],
    ["react developer immediate joiner in noida", { mustRole: "react developer", maxNotice: 0 }],
    ["nodejs developers less than 15 days notice", { mustRole: "nodejs developer", maxNotice: 15 }],
    ["sales profiles in gurgaon", { mustRole: "sales", mustLocs: ["gurgaon"] }],
    ["finance sales profiles in gurgaon", { mustRole: "sales", mustDomain: ["finance"] }],
    ["lending sales manager in hyderabad", { mustRole: "sales manager", mustDomain: ["lending"] }],
    ["fintech or finance or lending sales profiles in gurugram", { mustRole: "sales", mustDomain: ["fintech", "finance", "lending"] }],
    ["Get me duplicate in Attentive from captured notes", { source: "captured", attempt: "Duplicate" }],
    ["Get me duplicate in Attentive from assessments", { source: "assessment", assessment: "Duplicate" }],
    ["show busy candidates", { attempt: "Busy" }],
    ["show not responding candidates", { attempt: "Not responding" }],
    ["show not reachable profiles", { attempt: "Not reachable" }],
    ["show disconnected profiles", { attempt: "Disconnected" }],
    ["show call later profiles", { attempt: "Call later" }],
    ["show feedback awaited candidates", { assessment: "Feedback awaited" }],
    ["show candidates in mumbai, hyderabad, bangalore", { mustLocs: ["mumbai", "hyderabad", "bangalore"] }],
    ["show candidates from gurgaon and hyderabad", { mustLocs: ["gurgaon", "hyderabad"] }],
    ["show candidates gurgaon/hyderabad/bangalore", { mustLocs: ["gurgaon", "hyderabad", "bangalore"] }],
    ["node dev from delhi", { mustSkill: "nodejs", mustLocs: ["delhi"] }],
    ["dotnet developer gurugram", { mustSkill: "dotnet", mustLocs: ["gurgaon"] }],
    ["react engineer noida", { mustSkill: "react", mustLocs: ["noida"] }],
    ["go lang engineer in pune", { mustSkill: "golang", mustLocs: ["pune"] }],
    ["python flask remote", { mustSkill: "python" }],
    ["accounts executive in mumbai", { mustLocs: ["mumbai"] }],
    ["technical recruiter in delhi", { mustLocs: ["delhi"] }],
    ["business development in gurgaon", { mustLocs: ["gurgaon"] }],
    ["fintech profiles in delhi", { mustDomain: ["fintech"], mustLocs: ["delhi"] }],
    ["loan sales profiles in gurgaon", { mustRole: "sales", mustDomain: ["loan"], mustLocs: ["gurgaon"] }],
    ["edtech recruiter in noida", { mustDomain: ["edtech"], mustLocs: ["noida"] }],
    ["healthcare sales in mumbai", { mustDomain: ["healthcare"], mustLocs: ["mumbai"] }],
    ["proptech inside sales in gurgaon", { mustDomain: ["proptech"], mustLocs: ["gurgaon"] }],
    ["profiles shared in easyrewardz c2h role", { source: "assessment" }],
    ["profiles shared under lead marketing in livlong", { source: "assessment" }],
    ["profiles in assessments", { source: "assessment" }],
    ["profiles in captured notes", { source: "captured" }],
    ["profiles in applied candidates", { source: "applied" }],
    ["show me profiles sourced by nike this week", {}],
    ["show me profiles assigned to sakeena", {}],
    ["show profiles in delhi or gurgaon for nodejs", { mustSkill: "nodejs", mustLocs: ["delhi", "gurgaon"] }],
    ["show java in gurgaon, noida and delhi", { mustSkill: "java", mustLocs: ["gurgaon", "noida", "delhi"] }],
    ["show .net core and c# in hyderabad", { mustSkill: "dotnet", mustLocs: ["hyderabad"] }],
    ["show duplicate candidates in captured notes for attentive", { source: "captured", attempt: "Duplicate" }],
    ["show duplicate candidates in assessments for attentive", { source: "assessment", assessment: "Duplicate" }]
  ];

  const badRoleFragments = ["those who are", "who are", "profiles", "candidates", "people", "has less", "from in"];
  const badSkillTokens = ["has", "less", "than", "who", "are", "profiles", "candidates"];

  for (const [query, expected] of matrix) {
    const parsed = parseDeterministicRecruiterQuery(query, DEFAULT_SYNONYMS);
    const roleLower = String(parsed.role || "").toLowerCase();
    badRoleFragments.forEach((frag) => assert.equal(roleLower.includes(frag), false, `bad role fragment "${frag}" in query: ${query}`));
    (parsed.skills || []).forEach((skill) => {
      assert.equal(badSkillTokens.includes(String(skill || "").toLowerCase()), false, `bad skill token "${skill}" in query: ${query}`);
    });
    if (expected.mustRole) assert.equal(parsed.role, expected.mustRole, `role mismatch for query: ${query}`);
    if (expected.mustSkill) assert.equal((parsed.skills || []).includes(expected.mustSkill), true, `skill mismatch for query: ${query}`);
    if (expected.mustDomain) {
      expected.mustDomain.forEach((d) => assert.equal((parsed.domainKeywords || []).includes(d), true, `domain mismatch (${d}) for query: ${query}`));
    }
    if (expected.mustLocs) {
      expected.mustLocs.forEach((loc) => assert.equal((parsed.locations || []).includes(loc), true, `location mismatch (${loc}) for query: ${query}`));
    }
    if (typeof expected.maxNotice === "number") assert.equal(parsed.maxNoticeDays, expected.maxNotice, `notice mismatch for query: ${query}`);
    if (expected.source) assert.equal(parsed.sourceTypeFilter, expected.source, `source mismatch for query: ${query}`);
    if (expected.attempt) assert.equal(parsed.attemptOutcome, expected.attempt, `attempt mismatch for query: ${query}`);
    if (expected.assessment) assert.equal(parsed.assessmentStatus, expected.assessment, `assessment mismatch for query: ${query}`);
  }

  assert.equal(resolveKnownRole("Node Developer"), "nodejs developer");
  assert.equal(resolveKnownRole(".NET Developer"), "dotnet developer");
  assert.equal(resolveKnownRole("those who are"), "");
}

module.exports = { run };
