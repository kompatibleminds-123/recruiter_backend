const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function run() {
  const title = "Senior Analytics Consultant (Fabric and AI)";
  const server = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
  const start = server.indexOf("function buildJdFilterQueryClause(");
  const end = server.indexOf("function buildJobIdFilterQueryClause(", start);
  assert.ok(start >= 0 && end > start);
  const buildClause = vm.runInThisContext(`(${server.slice(start, end).trim()})`);
  const clause = new URLSearchParams(buildClause([title])).get("or");
  assert.equal(clause, `(jd_title.eq."${title}",jd_title.ilike."*${title}*")`);
  const special = 'Consultant "AI" \\ Data';
  const escaped = 'Consultant \\"AI\\" \\\\ Data';
  assert.equal(new URLSearchParams(buildClause([special])).get("or"),
    `(jd_title.eq."${escaped}",jd_title.ilike."*${escaped}*")`);
  assert.equal(buildClause([]), "");

  const app = fs.readFileSync(path.join(__dirname, "../portal-react/src/App.jsx"), "utf8");
  for (const name of ["buildApplicantQueryParams", "buildCapturedQueryParams", "buildAssessmentQueryParams"]) {
    const from = app.indexOf(`  function ${name}(`);
    const to = app.indexOf("\n  }", from) + 4;
    assert.ok(from >= 0 && to > from);
    const buildParams = vm.runInThisContext(`(${app.slice(from, to).trim()})`);
    const params = new URLSearchParams(buildParams({ jds: [title], clients: ["Test Client"] }, 1, 25, "active", "updated"));
    assert.equal(params.get("jds"), title);
    assert.equal(params.get("clients"), "Test Client");
    assert.equal(params.has("jdIds"), false, "Title filters must include records without job IDs");
  }
}

module.exports = { run };
if (require.main === module) { run(); console.log("ok job-title-filter"); }
