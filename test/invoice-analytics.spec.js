const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const start = source.indexOf("function readJsonObject(");
const end = source.indexOf("function normalizeCommercialBillingMonth(", start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({});
vm.runInContext(source.slice(start, end), context);

function run() {
  const rows = [
    { id: "legacy-1", invoice_date: "2026-08-05", client_name: "Client", taxable_amount: 99960, status: null },
    { id: "legacy-2", invoice_date: "2026-08-17", client_name: "Client", taxable_amount: 141610, status: "" },
    { id: "draft", invoice_date: "2026-08-20", client_name: "Client", taxable_amount: 50000, status: "draft" }
  ];
  const analytics = context.buildInvoiceAnalytics(rows, []);
  assert.equal(analytics.invoiceCount, 2);
  assert.equal(analytics.grossTaxableAmount, 241570);
  assert.equal(analytics.taxableAmount, 241570);
  assert.equal(analytics.byMonth[0].month, "2026-08");
  assert.equal(analytics.byMonth[0].taxableAmount, 241570);
  assert.equal(analytics.byClient[0].taxableAmount, 241570);
}

module.exports = { run };
if (require.main === module) { run(); console.log("ok invoice-analytics"); }
