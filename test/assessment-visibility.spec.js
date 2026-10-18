const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

async function run() {
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const actor = { id: "admin", companyId: "company", role: "admin" };
  // Synthetic records: one linked candidate, one legacy assessment, one archived,
  // and a record assigned to another recruiter. No production data is used.
  const rows = [
    { id: "linked", candidateId: "c1", recruiterName: "Manaswi" },
    { id: "legacy", candidateId: "legacy-candidate", recruiterName: "Manaswi" },
    { id: "archived", recruiterName: "Manaswi", archived: true },
    { id: "other", recruiterName: "Other recruiter" }
  ];
  const context = vm.createContext({
    normalizeAssessmentStatusLabel: (value) => String(value || ""),
    getAssessmentsUniverseForUser: async (user) => { assert.equal(user, actor); return rows; },
    resolveAssessmentCandidateIdsForAssignees: async () => ["c1"]
  });
  for (const name of ["normalizeAssessmentFilterOptions", "isAssessmentArchivedLocal", "getAssessmentFilterFieldValues", "applyAssessmentFiltersLocal", "sortAssessmentsForList", "listAssessmentsForUser", "getAssessmentStatsForUser"]) {
    const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
    const end = source.indexOf("\n}", start) + 2;
    assert.ok(start >= 0 && end > start, name);
    vm.runInContext(source.slice(start, end), context);
  }
  const options = { filters: { recruiters: ["Manaswi"] } };
  const list = await context.listAssessmentsForUser(actor, options);
  const stats = await context.getAssessmentStatsForUser(actor, options);
  assert.equal(list.total, 2, "Recruiter filter must retain assessments without a matching candidate assignment");
  assert.equal(list.total, stats.active, "List and active count must use the same recruiter filter");
  assert.deepEqual(Array.from(list.items, (row) => row.id).sort(), ["legacy", "linked"]);
  const archived = await context.listAssessmentsForUser(actor, { filters: { recruiters: ["Manaswi"], lane: "archived" } });
  assert.equal(archived.total, 1);
  assert.equal(archived.items[0].id, "archived");
  const unfiltered = await context.listAssessmentsForUser(actor);
  assert.equal(unfiltered.total, 3);
  const page = await context.listAssessmentsForUser(actor, { ...options, limit: 1, page: 2 });
  assert.equal(page.total, 2);
  assert.equal(page.items.length, 1);
}

module.exports = { run };
if (require.main === module) run().then(() => console.log("ok assessment-visibility")).catch((error) => { console.error(error); process.exitCode = 1; });
