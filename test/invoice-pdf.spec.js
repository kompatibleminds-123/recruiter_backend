const assert = require("assert");
const { PDFDocument } = require("pdf-lib");
const { formatInvoiceDate, generateInvoicePdf, indianNumberWords, normalizeInvoiceInput } = require("../src/invoice-pdf");

async function run() {
  const settings = {
    invoiceProfile: {
      legalName: "Example Recruitment Private Limited",
      address: "New Delhi",
      state: "Delhi",
      stateCode: "07",
      defaultGstRate: 18,
      defaultHsnSac: "998311"
    },
    invoiceClientProfiles: {
      "Example Client": { legalName: "Example Client Limited", address: "Gurugram", state: "Haryana", stateCode: "06" }
    }
  };
  const input = {
    invoiceNumber: "TEST/26-27/001",
    invoiceDate: "2026-10-19",
    clientName: "Example Client",
    candidateName: "Sample Candidate",
    annualCtc: 1200000,
    feePercent: 10,
    gstRate: 18
  };
  const normalized = normalizeInvoiceInput(input, settings);
  assert.strictEqual(normalized.taxableAmount, 120000);
  assert.strictEqual(normalized.igst, 21600);
  assert.strictEqual(normalized.roundedTotal, 141600);
  assert.strictEqual(indianNumberWords(141600), "One Lakh Forty One Thousand Six Hundred Only");
  assert.strictEqual(formatInvoiceDate("2026-10-19"), "19th Oct, 2026");
  assert.strictEqual(formatInvoiceDate("2026-10-01"), "1st Oct, 2026");
  assert.strictEqual(formatInvoiceDate("2026-10-12"), "12th Oct, 2026");
  const result = await generateInvoicePdf(input, settings);
  assert.strictEqual(result.mimeType, "application/pdf");
  assert.strictEqual(result.filename, "TEST-26-27-001.pdf");
  const bytes = Buffer.from(result.fileData, "base64");
  assert.strictEqual(bytes.subarray(0, 4).toString(), "%PDF");
  const doc = await PDFDocument.load(bytes);
  assert.strictEqual(doc.getPageCount(), 1);

  const multi = normalizeInvoiceInput({
    ...input,
    items: [
      { candidateName: "Candidate One", annualCtc: 1000000, feePercent: 10 },
      { candidateName: "Candidate Two", annualCtc: 1500000, feePercent: 8 }
    ]
  }, settings);
  assert.strictEqual(multi.items.length, 2);
  assert.strictEqual(multi.taxableAmount, 220000);
  assert.strictEqual(multi.igst, 39600);
  assert.strictEqual(multi.total, 259600);
  const multiResult = await generateInvoicePdf({ ...input, items: multi.items }, settings);
  const multiDoc = await PDFDocument.load(Buffer.from(multiResult.fileData, "base64"));
  assert.strictEqual(multiDoc.getPageCount(), 1);
}

module.exports = { run };

if (require.main === module) {
  run().then(() => process.stdout.write("invoice-pdf.spec passed\n")).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
