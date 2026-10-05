const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Isolate the production billing calculation from server startup and data access.
const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const start = source.indexOf("function normalizeCommercialStatus(");
const end = source.indexOf("function itemMatchesClientPortalMetric(", start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({
  normalizeAssessmentStatusLabel: (value) => String(value).trim(),
  buildJobIndexById: () => new Map(),
  buildJobIndexByClientTitle: () => new Map(),
  normalizeJobClientTitleKey: (client, title) => `${client}:${title}`,
  getDashboardDrilldownScope: (_candidate, assessment) => ({
    clientLabel: assessment.clientName, positionLabel: "Consultant", recruiterLabel: "Recruiter"
  }),
  isDashboardRowInActorScope: () => true,
  isDateWithinRange: () => true,
  normalizeDateOutput: (value) => value,
  resolveAssessmentDateOfJoiningRaw: () => ""
});
vm.runInContext(source.slice(start, end), context);

function run() {
  const make = (id, status, clientName, ctc, extra = {}) => ({
    id, candidateName: id, candidateStatus: status, clientName,
    offerAmount: ctc, generatedAt: "2026-09-15T12:00:00Z", ...extra
  });
  const assessments = [
    make("joined-percent", "Joined", "Percentage", "20 L", { expectedCtc: "30 L" }),
    make("offered", "Offered", "Percentage", "30 L"),
    make("shortlisted", "Shortlisted", "Percentage", "10 L"),
    make("joined-flat", "Joined", "Flat", ""),
    make("offered-flat", "Offered", "Flat", ""),
    make("pending", "Joined", "Percentage", ""),
    make("no-rule", "Joined", "No rule", "12 L"),
    make("rejected", "Rejected", "Percentage", "50 L"),
    make("override", "Joined", "Percentage", "5 L", { commercialBillingMonth: "2026-10" })
  ];
  const options = { assessments, billingRules: {
    Percentage: { type: "percentage", value: 8.33 }, Flat: { type: "flat", value: 50000 }
  } };
  const rows = context.buildCommercialBillingReport(options);
  const september = rows.find((row) => row.month === "2026-09");
  assert.equal(september.expectedBillingInr, 599800);
  assert.equal(september.assuredBillingInr, 216600);
  assert.equal(rows.find((row) => row.month === "2026-10").assuredBillingInr, 41650);
  assert.equal(september.candidates.find((row) => row.assessmentId === "pending").ctcPending, true);
  for (const id of ["offered", "shortlisted", "offered-flat", "pending", "no-rule"]) {
    assert.equal(september.candidates.find((row) => row.assessmentId === id).assuredBillingInr, 0);
  }
  assert.equal(context.buildCommercialBillingReport({ ...options, clientFilter: "Flat" })[0].assuredBillingInr, 50000);
  const offeredOnly = context.buildCommercialBillingReport({ ...options, assessments: [assessments[1]] })[0];
  assert.equal(offeredOnly.assuredBillingInr, 0);
  const nowJoined = context.buildCommercialBillingReport({ ...options, assessments: [{ ...assessments[1], candidateStatus: "Joined" }] })[0];
  assert.equal(nowJoined.assuredBillingInr, 249900);
  assert.equal(nowJoined.expectedBillingInr, offeredOnly.expectedBillingInr);
}

module.exports = { run };
if (require.main === module) { run(); console.log("ok commercial-billing"); }
