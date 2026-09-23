const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const pdfLib = require("pdf-lib");

// Exercise the production renderer without starting the HTTP server or its jobs.
const source = fs.readFileSync(path.join(__dirname, "../server.js"), "utf8");
const start = source.indexOf("function readImageBufferFromDataUrl(");
const end = source.indexOf("async function loadAttachmentFromUrl(", start);
assert.ok(start >= 0 && end > start);
const context = vm.runInThisContext(`(function (pdfLib, Buffer) {
  ${source.slice(start, end)}
  return { buildBrandedPdfBuffer, addPdfPageUriAnnotation, extractPdfPageUriAnnotations };
})`)(pdfLib, Buffer);

async function run() {
  const { PDFDocument, PDFName, PDFDict, decodePDFRawStream } = pdfLib;
  for (const blankFirst of [true, false]) {
    const input = await PDFDocument.create();
    const first = input.addPage([595, 842]);
    const second = input.addPage([612, 792]);
    const blank = blankFirst ? first : second;
    const filled = blankFirst ? second : first;
    filled.drawText("CV content must survive");
    context.addPdfPageUriAnnotation(input, blank, {
      uri: "https://example.com/profile", rect: [10, 20, 100, 40]
    });
    assert.equal(blank.node.Contents(), undefined);
    const result = await context.buildBrandedPdfBuffer({
      pdfBase64: Buffer.from(await input.save()).toString("base64"),
      companyName: "Test Company", candidateName: "Test Candidate"
    });
    const output = await PDFDocument.load(result.buffer);
    assert.equal(output.getPageCount(), 2);
    assert.deepEqual(output.getPages().map((p) => p.getSize()), [
      { width: 595, height: 842 }, { width: 612, height: 792 }
    ]);
    assert.equal(context.extractPdfPageUriAnnotations(output, output.getPage(blankFirst ? 0 : 1))[0].uri,
      "https://example.com/profile");
    for (const [index, page] of output.getPages().entries()) {
      assert.ok(page.node.Contents(), "Branding content should be present on every page");
      const objects = page.node.Resources().lookup(PDFName.of("XObject"), PDFDict);
      const embedded = output.context.lookup(objects.values()[0]);
      const body = Buffer.from(decodePDFRawStream(embedded).decode()).toString();
      if (index === (blankFirst ? 0 : 1)) assert.equal(body.replace(/[qQ\s]/g, ""), "");
      else assert.ok(body.includes(Buffer.from("CV content must survive").toString("hex").toUpperCase()));
    }
  }
}

module.exports = { run };
if (require.main === module) run().then(() => console.log("ok branded-pdf")).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
