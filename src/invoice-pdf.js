const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const TEXT = rgb(0.08, 0.12, 0.2);
const MUTED = rgb(0.35, 0.4, 0.48);
const BORDER = rgb(0.65, 0.69, 0.75);
const NAVY = rgb(0.04, 0.14, 0.28);
const PALE = rgb(0.94, 0.97, 1);

function text(value = "") {
  return String(value ?? "").replace(/\r\n/g, "\n").trim();
}

function number(value) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function safeFilename(value = "invoice") {
  return text(value).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "") || "invoice";
}

function parseDataUrl(value = "") {
  const match = String(value || "").match(/^data:(image\/(?:png|jpe?g));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (!buffer.length || buffer.length > 2 * 1024 * 1024) return null;
  return { mimeType: match[1].toLowerCase(), buffer };
}

async function embedDataUrlImage(doc, value) {
  const parsed = parseDataUrl(value);
  if (!parsed) return null;
  try {
    return parsed.mimeType.includes("png")
      ? await doc.embedPng(parsed.buffer)
      : await doc.embedJpg(parsed.buffer);
  } catch {
    return null;
  }
}

function wrapText(value, font, size, maxWidth, maxLines = 20) {
  const paragraphs = String(value || "").replace(/\r\n/g, "\n").split("\n");
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth || !current) current = next;
      else {
        lines.push(current);
        current = word;
      }
      if (lines.length >= maxLines) break;
    }
    if (current && lines.length < maxLines) lines.push(current);
    if (lines.length >= maxLines) break;
  }
  return lines.slice(0, maxLines);
}

function drawLines(page, lines, { x, y, font, size = 8, color = TEXT, lineHeight = 11, maxLines = 20 }) {
  let nextY = y;
  lines.slice(0, maxLines).forEach((line) => {
    page.drawText(String(line || ""), { x, y: nextY, font, size, color });
    nextY -= lineHeight;
  });
  return nextY;
}

function drawCell(page, { x, y, width, height, fill = null, border = BORDER, borderWidth = 0.6 }) {
  page.drawRectangle({ x, y, width, height, color: fill || undefined, borderColor: border, borderWidth });
}

function indianNumberWords(value) {
  const n = Math.max(0, Math.round(number(value)));
  if (n === 0) return "Zero Only";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const belowThousand = (num) => {
    const parts = [];
    if (num >= 100) {
      parts.push(`${ones[Math.floor(num / 100)]} Hundred`);
      num %= 100;
    }
    if (num >= 20) {
      parts.push(tens[Math.floor(num / 10)]);
      if (num % 10) parts.push(ones[num % 10]);
    } else if (num > 0) parts.push(ones[num]);
    return parts.join(" ");
  };
  let remaining = n;
  const parts = [];
  const crore = Math.floor(remaining / 10000000);
  if (crore) { parts.push(`${belowThousand(crore)} Crore`); remaining %= 10000000; }
  const lakh = Math.floor(remaining / 100000);
  if (lakh) { parts.push(`${belowThousand(lakh)} Lakh`); remaining %= 100000; }
  const thousand = Math.floor(remaining / 1000);
  if (thousand) { parts.push(`${belowThousand(thousand)} Thousand`); remaining %= 1000; }
  if (remaining) parts.push(belowThousand(remaining));
  return `${parts.join(" ")} Only`;
}

function normalizeInvoiceInput(input = {}, savedSettings = {}) {
  const profile = savedSettings?.invoiceProfile && typeof savedSettings.invoiceProfile === "object"
    ? savedSettings.invoiceProfile : {};
  const clients = savedSettings?.invoiceClientProfiles && typeof savedSettings.invoiceClientProfiles === "object"
    ? savedSettings.invoiceClientProfiles : {};
  const clientName = text(input.clientName);
  const client = clients[clientName] && typeof clients[clientName] === "object" ? clients[clientName] : {};
  const annualCtc = Math.max(0, number(input.annualCtc));
  const feePercent = Math.max(0, number(input.feePercent));
  const calculatedTaxable = annualCtc > 0 && feePercent > 0 ? annualCtc * feePercent / 100 : 0;
  const taxableAmount = Math.max(0, number(input.taxableAmount) || calculatedTaxable);
  const gstRate = Math.max(0, number(input.gstRate || profile.defaultGstRate || 18));
  const sellerStateCode = text(profile.stateCode);
  const clientStateCode = text(client.stateCode);
  const taxModeRaw = text(input.taxMode).toLowerCase();
  const taxMode = ["igst", "cgst_sgst", "none"].includes(taxModeRaw)
    ? taxModeRaw
    : (sellerStateCode && clientStateCode && sellerStateCode === clientStateCode ? "cgst_sgst" : "igst");
  const totalGst = taxMode === "none" ? 0 : taxableAmount * gstRate / 100;
  const cgst = taxMode === "cgst_sgst" ? totalGst / 2 : 0;
  const sgst = taxMode === "cgst_sgst" ? totalGst / 2 : 0;
  const igst = taxMode === "igst" ? totalGst : 0;
  const total = taxableAmount + totalGst;
  return {
    invoiceNumber: text(input.invoiceNumber),
    invoiceDate: text(input.invoiceDate),
    reverseCharge: text(input.reverseCharge || "No"),
    profile,
    client: { ...client, name: text(client.legalName || client.name || clientName) || clientName },
    clientName,
    candidateName: text(input.candidateName),
    serviceDescription: text(input.serviceDescription || "HR Consulting Services"),
    annualCtc,
    feePercent,
    hsnSac: text(input.hsnSac || profile.defaultHsnSac || "998311"),
    taxableAmount,
    gstRate,
    taxMode,
    cgst,
    sgst,
    igst,
    totalGst,
    total,
    roundedTotal: Math.round(total),
    notes: text(input.notes)
  };
}

function validateInvoice(invoice) {
  const missing = [];
  if (!invoice.invoiceNumber) missing.push("invoice number");
  if (!invoice.invoiceDate) missing.push("invoice date");
  if (!text(invoice.profile.legalName)) missing.push("company legal name");
  if (!invoice.clientName) missing.push("client");
  if (!invoice.candidateName) missing.push("candidate/service reference");
  if (!(invoice.taxableAmount > 0)) missing.push("taxable amount");
  if (missing.length) throw new Error(`Missing required invoice fields: ${missing.join(", ")}.`);
}

async function generateInvoicePdf(input = {}, savedSettings = {}) {
  const invoice = normalizeInvoiceInput(input, savedSettings);
  validateInvoice(invoice);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedDataUrlImage(doc, invoice.profile.logoDataUrl);
  const signature = await embedDataUrlImage(doc, invoice.profile.signatureDataUrl);
  const left = 34;
  const width = 544;

  page.drawText("TAX INVOICE", { x: left, y: 748, font: bold, size: 18, color: NAVY });
  page.drawText(`Invoice ${invoice.invoiceNumber}`, { x: left, y: 728, font: regular, size: 9, color: MUTED });
  if (logo) {
    const scale = Math.min(95 / logo.width, 48 / logo.height);
    page.drawImage(logo, { x: 483, y: 716, width: logo.width * scale, height: logo.height * scale });
  } else {
    page.drawText(text(invoice.profile.tradeName || invoice.profile.legalName), { x: 420, y: 736, font: bold, size: 10, color: NAVY });
  }

  drawCell(page, { x: left, y: 610, width: 325, height: 98, fill: PALE });
  drawCell(page, { x: left + 325, y: 610, width: 219, height: 98 });
  let y = 690;
  page.drawText(text(invoice.profile.legalName), { x: left + 10, y, font: bold, size: 9, color: TEXT });
  y -= 14;
  y = drawLines(page, wrapText(invoice.profile.address, regular, 8, 300, 3), { x: left + 10, y, font: regular, size: 8, lineHeight: 11, maxLines: 3 });
  const sellerIds = [
    invoice.profile.cin ? `CIN: ${text(invoice.profile.cin)}` : "",
    invoice.profile.pan ? `PAN: ${text(invoice.profile.pan)}` : "",
    invoice.profile.gstin ? `GSTIN: ${text(invoice.profile.gstin)}` : ""
  ].filter(Boolean);
  drawLines(page, sellerIds, { x: left + 10, y: y - 2, font: regular, size: 7.5, lineHeight: 10 });
  page.drawText(`Invoice No: ${invoice.invoiceNumber}`, { x: left + 337, y: 688, font: bold, size: 9, color: TEXT });
  page.drawText(`Invoice Date: ${invoice.invoiceDate}`, { x: left + 337, y: 672, font: regular, size: 8, color: TEXT });
  page.drawText(`Reverse Charge: ${invoice.reverseCharge}`, { x: left + 337, y: 656, font: regular, size: 8, color: TEXT });
  page.drawText(`State: ${text(invoice.profile.state) || "-"}`, { x: left + 337, y: 636, font: regular, size: 8, color: TEXT });
  page.drawText(`State Code: ${text(invoice.profile.stateCode) || "-"}`, { x: left + 337, y: 621, font: regular, size: 8, color: TEXT });

  drawCell(page, { x: left, y: 466, width, height: 126 });
  page.drawRectangle({ x: left, y: 572, width, height: 20, color: NAVY });
  page.drawText("DETAILS OF RECEIVER / BILLED TO", { x: left + 8, y: 578, font: bold, size: 8, color: rgb(1, 1, 1) });
  page.drawText(text(invoice.client.name || invoice.clientName), { x: left + 10, y: 556, font: bold, size: 9, color: TEXT });
  drawLines(page, wrapText(invoice.client.address, regular, 8, 500, 5), { x: left + 10, y: 542, font: regular, size: 8, lineHeight: 11, maxLines: 5 });
  const clientMeta = [
    invoice.client.gstin ? `GSTIN: ${text(invoice.client.gstin)}` : "GSTIN: -",
    `State: ${text(invoice.client.state) || "-"}`,
    `State Code: ${text(invoice.client.stateCode) || "-"}`
  ];
  drawLines(page, clientMeta, { x: left + 330, y: 542, font: regular, size: 8, lineHeight: 13 });

  const cols = [32, 196, 58, 56, 76, 62, 64];
  const headers = ["Sr.", "Product / Service", "HSN/SAC", "Fee", "Taxable", "GST", "Total"];
  let x = left;
  for (let i = 0; i < cols.length; i += 1) {
    drawCell(page, { x, y: 428, width: cols[i], height: 38, fill: PALE });
    drawLines(page, wrapText(headers[i], bold, 7.3, cols[i] - 8, 2), { x: x + 4, y: 450, font: bold, size: 7.3, lineHeight: 9, maxLines: 2 });
    x += cols[i];
  }
  x = left;
  const serviceLabel = [invoice.serviceDescription, invoice.candidateName ? `Candidate: ${invoice.candidateName}` : "", invoice.annualCtc ? `Annual CTC: Rs. ${money(invoice.annualCtc)}` : ""].filter(Boolean).join("\n");
  const rowValues = [
    "1",
    serviceLabel,
    invoice.hsnSac,
    invoice.feePercent ? `${invoice.feePercent}%` : "-",
    `Rs. ${money(invoice.taxableAmount)}`,
    invoice.taxMode === "none" ? "Nil" : `${invoice.gstRate}%`,
    `Rs. ${money(invoice.total)}`
  ];
  for (let i = 0; i < cols.length; i += 1) {
    drawCell(page, { x, y: 318, width: cols[i], height: 110 });
    drawLines(page, wrapText(rowValues[i], i === 1 ? regular : bold, 7.2, cols[i] - 8, 7), { x: x + 4, y: 410, font: i === 1 ? regular : bold, size: 7.2, lineHeight: 10, maxLines: 7 });
    x += cols[i];
  }

  drawCell(page, { x: left, y: 253, width: 360, height: 65, fill: PALE });
  drawCell(page, { x: left + 360, y: 253, width: 184, height: 65 });
  page.drawText("Amount in words", { x: left + 8, y: 301, font: bold, size: 7.5, color: MUTED });
  drawLines(page, wrapText(indianNumberWords(invoice.roundedTotal), bold, 8.5, 340, 3), { x: left + 8, y: 285, font: bold, size: 8.5, lineHeight: 11, maxLines: 3 });
  const taxLines = invoice.taxMode === "cgst_sgst"
    ? [`CGST: Rs. ${money(invoice.cgst)}`, `SGST: Rs. ${money(invoice.sgst)}`]
    : invoice.taxMode === "igst" ? [`IGST: Rs. ${money(invoice.igst)}`] : ["GST: Nil"];
  drawLines(page, [...taxLines, `Rounded Total: Rs. ${invoice.roundedTotal.toLocaleString("en-IN")}`], { x: left + 370, y: 300, font: bold, size: 8, lineHeight: 15 });

  drawCell(page, { x: left, y: 78, width: 280, height: 157 });
  drawCell(page, { x: left + 280, y: 78, width: 264, height: 157 });
  page.drawText("BANK DETAILS", { x: left + 8, y: 218, font: bold, size: 8.5, color: NAVY });
  const bankLines = [
    invoice.profile.bankAccountName ? `Account Name: ${text(invoice.profile.bankAccountName)}` : "",
    invoice.profile.bankAccountNumber ? `Account No: ${text(invoice.profile.bankAccountNumber)}` : "",
    invoice.profile.bankIfsc ? `IFSC: ${text(invoice.profile.bankIfsc)}` : "",
    invoice.profile.bankName ? `Bank: ${text(invoice.profile.bankName)}` : "",
    invoice.profile.bankBranch ? `Branch: ${text(invoice.profile.bankBranch)}` : ""
  ].filter(Boolean);
  drawLines(page, bankLines, { x: left + 8, y: 198, font: regular, size: 8, lineHeight: 14, maxLines: 7 });
  if (invoice.notes) {
    page.drawText("Terms / Notes", { x: left + 8, y: 112, font: bold, size: 7.5, color: NAVY });
    drawLines(page, wrapText(invoice.notes, regular, 7, 258, 2), { x: left + 8, y: 98, font: regular, size: 7, lineHeight: 9, maxLines: 2 });
  }
  page.drawText("Certified that the particulars given above are true and correct", { x: left + 292, y: 218, font: regular, size: 7.2, color: MUTED });
  page.drawText(text(invoice.profile.legalName), { x: left + 292, y: 200, font: bold, size: 8, color: TEXT });
  if (signature) {
    const scale = Math.min(150 / signature.width, 62 / signature.height);
    page.drawImage(signature, { x: left + 335, y: 112, width: signature.width * scale, height: signature.height * scale });
  }
  page.drawText("Authorized Signatory", { x: left + 355, y: 92, font: regular, size: 8, color: TEXT });
  page.drawText("Original for Recipient", { x: left, y: 54, font: regular, size: 7, color: MUTED });

  const bytes = await doc.save();
  return {
    filename: `${safeFilename(invoice.invoiceNumber)}.pdf`,
    mimeType: "application/pdf",
    fileData: Buffer.from(bytes).toString("base64"),
    totals: {
      taxableAmount: invoice.taxableAmount,
      cgst: invoice.cgst,
      sgst: invoice.sgst,
      igst: invoice.igst,
      total: invoice.total,
      roundedTotal: invoice.roundedTotal,
      taxMode: invoice.taxMode
    }
  };
}

module.exports = {
  generateInvoicePdf,
  indianNumberWords,
  normalizeInvoiceInput
};
