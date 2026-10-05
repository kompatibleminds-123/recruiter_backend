const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { calculateIncentive, nextSalaryMonth, buildRecruiterIncentives } = require("../src/recruiter-incentives");

async function run() {
  for (const [ctc, incentive] of [[0, 0], [10, 0], [10.01, 500], [15, 500], [15.01, 1000], [20, 1000], [20.01, 1500], [25, 1500], [26, 1600], [27, 1700], [32, 2200], [26.5, 1650]]) {
    assert.equal(calculateIncentive(ctc), incentive, `CTC ${ctc}`);
  }
  assert.equal(nextSalaryMonth("2026-08"), "2026-09");
  assert.equal(nextSalaryMonth("2026-12"), "2027-01");
  const joining = (id, ctc, extra = {}) => ({ assessmentId: id, candidateId: id, recruiterId: "r1", recruiterName: "Recruiter", joinedOn: "2026-08-05", ctcLakhs: ctc, client: "Client", position: "Engineer", ...extra });
  const result = buildRecruiterIncentives([
    joining("a", 12), joining("b", 14), joining("a", 12, { assessmentId: "duplicate" }),
    joining("c", 32, { recruiterId: "r2" }), joining("d", 15, { joinedOn: "2026-09-01" }),
    joining("e", 20, { joinedOn: "" })
  ]);
  const august = result.rows.find((row) => row.month === "2026-08" && row.recruiterId === "r1");
  assert.equal(august.joined, 2);
  assert.equal(august.totalCtcLakhs, 26);
  assert.equal(august.incentiveInr, 1600);
  assert.equal(august.salaryMonth, "2026-09");
  assert.equal(result.rows.find((row) => row.recruiterId === "r2").incentiveInr, 2200);
  assert.equal(result.rows.find((row) => row.month === "2026-09").incentiveInr, 500);
  assert.equal(result.missingJoiningDate, 1);
  const pending = buildRecruiterIncentives([joining("a", 26), joining("b", 0)]).rows[0];
  assert.equal(pending.ctcPending, 1);
  assert.equal(pending.incentiveInr, null);
  assert.equal(buildRecruiterIncentives([joining("a", 26, { recruiterId: "" })]).rows[0].incentiveInr, null);
  assert.equal(buildRecruiterIncentives([joining("a", 26, { joinedOn: "2026-02-31" })]).missingJoiningDate, 1);

  // Exercise the actual HTTP route with isolated data access, including its authorization.
  const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const start = source.indexOf('  if (requestUrl.pathname === "/company/reports/recruiter-incentives")');
  const end = source.indexOf('  if (requestUrl.pathname === "/company/reports/commercial-billing")', start);
  assert.ok(start >= 0 && end > start);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  async function request(role, method = "GET") {
    let response;
    let reads = 0;
    const context = {
      req: { method }, res: {}, requestUrl: new URL("https://example.com/company/reports/recruiter-incentives"),
      requireSessionUser: async () => ({ id: "admin", companyId: "company", role }), getBearerToken: () => "test",
      sendJson: (_res, status, body) => { response = { status, body }; },
      listAssessments: async (scope) => {
        reads++;
        assert.deepEqual(scope, { actorUserId: "admin", companyId: "company" });
        return [
          { id: "1", candidateId: "1", candidateStatus: "Joined", recruiterName: "Alex", offerAmount: "26", commercialBillingMonth: "2026-10", statusHistory: [{ status: "Joined", statusAt: "2026-08-01T00:00:00Z" }] },
          { id: "2", candidateStatus: "Offered", recruiterName: "Alex", offerAmount: "50", dateOfJoining: "2026-08-02" },
          { id: "3", candidateStatus: "Joined", recruiterName: "Alex", offerAmount: "50", expectedDoj: "2026-08-02" }
        ];
      },
      listCompanyUsers: async (companyId) => { assert.equal(companyId, "company"); return [{ id: "r1", name: "Alex" }]; },
      normalizeAssessmentStatusLabel: (value) => String(value || ""),
      normalizeDateOutput: (value) => value ? new Date(value).toISOString() : "",
      findCommercialOfferAmount: (row) => row.offerAmount,
      parseCommercialCtcLakhs: Number, buildRecruiterIncentives
    };
    await new AsyncFunction(...Object.keys(context), source.slice(start, end))(...Object.values(context));
    return { ...response, reads };
  }
  const forbidden = await request("recruiter");
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.reads, 0);
  assert.equal((await request("admin", "POST")).status, 405);
  const report = await request("admin");
  assert.equal(report.status, 200);
  assert.equal(report.body.result.rows.length, 1);
  assert.equal(report.body.result.rows[0].month, "2026-08");
  assert.equal(report.body.result.rows[0].salaryMonth, "2026-09");
  assert.equal(report.body.result.rows[0].incentiveInr, 1600);
  assert.equal(report.body.result.missingJoiningDate, 1);
}
module.exports = { run };
if (require.main === module) run().then(() => console.log("ok recruiter-incentives")).catch((error) => { console.error(error); process.exitCode = 1; });
