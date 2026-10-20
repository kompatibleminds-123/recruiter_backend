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

function formatInvoiceDate(value) {
  const raw = text(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  const day = date.getUTCDate();
  const mod100 = day % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[day % 10] || "th");
  const month = date.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${day}${suffix} ${month}, ${date.getUTCFullYear()}`;
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

function drawCenteredCellText(page, value, { x, y, width, height, font, size = 8, color = TEXT, lineHeight = 11, maxLines = 20 }) {
  const lines = wrapText(value, font, size, Math.max(1, width - 8), maxLines);
  const visibleLines = lines.slice(0, maxLines);
  const blockHeight = Math.max(size, (visibleLines.length - 1) * lineHeight + size);
  let baselineY = y + ((height + blockHeight) / 2) - size;
  visibleLines.forEach((line) => {
    const lineWidth = font.widthOfTextAtSize(String(line || ""), size);
    page.drawText(String(line || ""), {
      x: x + Math.max(4, (width - lineWidth) / 2),
      y: baselineY,
      font,
      size,
      color
    });
    baselineY -= lineHeight;
  });
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
  const savedProfile = savedSettings?.invoiceProfile && typeof savedSettings.invoiceProfile === "object"
    ? savedSettings.invoiceProfile : {};
  const submittedProfile = input.profileDetails && typeof input.profileDetails === "object" ? input.profileDetails : {};
  const profile = { ...savedProfile, ...submittedProfile };
  const clients = savedSettings?.invoiceClientProfiles && typeof savedSettings.invoiceClientProfiles === "object"
    ? savedSettings.invoiceClientProfiles : {};
  const clientName = text(input.clientName);
  const savedClient = clients[clientName] && typeof clients[clientName] === "object" ? clients[clientName] : {};
  const submittedClient = input.clientDetails && typeof input.clientDetails === "object" ? input.clientDetails : {};
  const client = { ...savedClient, ...submittedClient };
  const rawItems = Array.isArray(input.items) && input.items.length ? input.items : [input];
  const items = rawItems.map((item = {}) => {
    const annualCtc = Math.max(0, number(item.annualCtc));
    const feePercent = Math.max(0, number(item.feePercent));
    const calculatedTaxable = annualCtc > 0 && feePercent > 0 ? annualCtc * feePercent / 100 : 0;
    return {
      assessmentId: text(item.assessmentId),
      candidateId: text(item.candidateId),
      candidateName: text(item.candidateName),
      serviceDescription: text(item.serviceDescription || input.serviceDescription || "HR Consulting Services"),
      annualCtc,
      feePercent,
      hsnSac: text(item.hsnSac || input.hsnSac || profile.defaultHsnSac || "998311"),
      taxableAmount: Math.max(0, number(item.taxableAmount) || calculatedTaxable)
    };
  });
  const taxableAmount = items.reduce((sum, item) => sum + item.taxableAmount, 0);
  const annualCtc = items.reduce((sum, item) => sum + item.annualCtc, 0);
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
    candidateName: items.map((item) => item.candidateName).filter(Boolean).join(", "),
    serviceDescription: items.length === 1 ? items[0].serviceDescription : "Recruitment Services",
    annualCtc,
    feePercent: items.length === 1 ? items[0].feePercent : 0,
    hsnSac: items.length === 1 ? items[0].hsnSac : text(input.hsnSac || profile.defaultHsnSac || "998311"),
    items,
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
  if (!invoice.items.length || invoice.items.some((item) => !item.candidateName)) missing.push("candidate/service reference");
  if (invoice.items.length > 4) missing.push("maximum 4 candidates per invoice");
  if (invoice.items.some((item) => !(item.taxableAmount > 0))) missing.push("taxable amount for every candidate");
  if (!(invoice.taxableAmount > 0)) missing.push("taxable amount");
  if (missing.length) throw new Error(`Missing required invoice fields: ${missing.join(", ")}.`);
}

async function generateInvoicePdf(input = {}, savedSettings = {}) {
  const invoice = normalizeInvoiceInput(input, savedSettings);
  validateInvoice(invoice);
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 842]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedDataUrlImage(doc, invoice.profile.logoDataUrl);
  const signature = await embedDataUrlImage(doc, invoice.profile.signatureDataUrl);
  const left = 34;
  const width = 544;

  page.drawText("TAX INVOICE", { x: left, y: 798, font: bold, size: 18, color: NAVY });
  page.drawText(`Invoice ${invoice.invoiceNumber}`, { x: left, y: 778, font: regular, size: 9, color: MUTED });
  if (logo) {
    const scale = Math.min(130 / logo.width, 68 / logo.height);
    const logoWidth = logo.width * scale;
    const logoHeight = logo.height * scale;
    page.drawImage(logo, { x: 568 - logoWidth, y: 754, width: logoWidth, height: logoHeight });
  } else {
    drawLines(page, wrapText(invoice.profile.tradeName || invoice.profile.legalName, bold, 8, 130, 2), { x: 438, y: 792, font: bold, size: 8, color: NAVY, lineHeight: 10, maxLines: 2 });
  }

  drawCell(page, { x: left, y: 610, width, height: 138 });
  page.drawRectangle({ x: left, y: 728, width, height: 20, color: NAVY });
  page.drawText("DETAILS OF SUPPLIER / BILLED BY", { x: left + 8, y: 734, font: bold, size: 8, color: rgb(1, 1, 1) });
  page.drawLine({ start: { x: left + 325, y: 610 }, end: { x: left + 325, y: 728 }, thickness: 0.6, color: BORDER });
  let y = 710;
  page.drawText(text(invoice.profile.legalName), { x: left + 10, y, font: bold, size: 9, color: TEXT });
  y -= 14;
  y = drawLines(page, wrapText(invoice.profile.address, regular, 8.5, 300, 3), { x: left + 10, y, font: regular, size: 8.5, lineHeight: 12, maxLines: 3 });
  const sellerIds = [
    invoice.profile.cin ? `CIN: ${text(invoice.profile.cin)}` : "",
    invoice.profile.pan ? `PAN: ${text(invoice.profile.pan)}` : "",
    invoice.profile.gstin ? `GSTIN: ${text(invoice.profile.gstin)}` : "",
    `State: ${text(invoice.profile.state) || "-"}`,
    `State Code: ${text(invoice.profile.stateCode) || "-"}`
  ].filter(Boolean);
  drawLines(page, sellerIds, { x: left + 10, y: y - 2, font: regular, size: 8.5, lineHeight: 12 });
  page.drawText(`Invoice No: ${invoice.invoiceNumber}`, { x: left + 337, y: 710, font: bold, size: 9, color: TEXT });
  page.drawText(`Invoice Date: ${formatInvoiceDate(invoice.invoiceDate)}`, { x: left + 337, y: 692, font: regular, size: 8.5, color: TEXT });
  page.drawText(`Reverse Charge: ${invoice.reverseCharge}`, { x: left + 337, y: 674, font: regular, size: 8.5, color: TEXT });

  drawCell(page, { x: left, y: 440, width, height: 152 });
  page.drawRectangle({ x: left, y: 572, width, height: 20, color: NAVY });
  page.drawText("DETAILS OF RECEIVER / BILLED TO", { x: left + 8, y: 578, font: bold, size: 8, color: rgb(1, 1, 1) });
  page.drawText(text(invoice.client.name || invoice.clientName), { x: left + 10, y: 556, font: bold, size: 9, color: TEXT });
  drawLines(page, wrapText(invoice.client.address, regular, 8.5, 310, 8), { x: left + 10, y: 542, font: regular, size: 8.5, lineHeight: 12, maxLines: 8 });
  const clientMeta = [
    invoice.client.gstin ? `GSTIN: ${text(invoice.client.gstin)}` : "GSTIN: -",
    `State: ${text(invoice.client.state) || "-"}`,
    `State Code: ${text(invoice.client.stateCode) || "-"}`
  ];
  drawLines(page, clientMeta, { x: left + 330, y: 542, font: regular, size: 8.5, lineHeight: 15 });

  const cols = [28, 176, 50, 44, 68, 45, 68, 65];
  const headers = ["Sr.", "Product / Service", "HSN/SAC", "Fee", "Taxable", "GST rate", "Tax amount", "Total"];
  let x = left;
  for (let i = 0; i < cols.length; i += 1) {
    drawCell(page, { x, y: 402, width: cols[i], height: 38, fill: PALE });
    drawCenteredCellText(page, headers[i], { x, y: 402, width: cols[i], height: 38, font: bold, size: 7.1, lineHeight: 9, maxLines: 2 });
    x += cols[i];
  }
  x = left;
  const rowHeight = 120 / invoice.items.length;
  invoice.items.forEach((item, itemIndex) => {
    const rowY = 402 - ((itemIndex + 1) * rowHeight);
    const itemGst = invoice.taxMode === "none" ? 0 : item.taxableAmount * invoice.gstRate / 100;
    const itemTotal = item.taxableAmount + itemGst;
    const itemTaxLabel = invoice.taxMode === "cgst_sgst"
      ? `CGST: ${money(itemGst / 2)}\nSGST: ${money(itemGst / 2)}`
      : invoice.taxMode === "igst" ? `IGST: ${money(itemGst)}` : "Nil";
    const serviceLabel = [item.serviceDescription, `Candidate: ${item.candidateName}`, item.annualCtc ? `CTC: Rs. ${money(item.annualCtc)}` : ""].filter(Boolean).join("\n");
    const rateLabel = invoice.taxMode === "cgst_sgst" ? `CGST ${Number(invoice.gstRate / 2)}%\nSGST ${Number(invoice.gstRate / 2)}%` : invoice.taxMode === "none" ? "Nil" : `${invoice.gstRate}%`;
    const rowValues = [String(itemIndex + 1), serviceLabel, item.hsnSac, item.feePercent ? `${item.feePercent}%` : "-", `Rs. ${money(item.taxableAmount)}`, rateLabel, itemTaxLabel, `Rs. ${money(itemTotal)}`];
    x = left;
    for (let i = 0; i < cols.length; i += 1) {
      drawCell(page, { x, y: rowY, width: cols[i], height: rowHeight });
      const compact = invoice.items.length > 2;
      drawCenteredCellText(page, rowValues[i], { x, y: rowY, width: cols[i], height: rowHeight, font: i === 1 ? regular : bold, size: compact ? 6.5 : (i === 1 ? 8.2 : 7.5), lineHeight: compact ? 7.5 : (i === 1 ? 13 : 10), maxLines: compact ? 4 : 8 });
      x += cols[i];
    }
  });

  drawCell(page, { x: left, y: 215, width: 360, height: 67, fill: PALE });
  drawCell(page, { x: left + 360, y: 215, width: 184, height: 67 });
  page.drawText("Amount in words", { x: left + 8, y: 265, font: bold, size: 7.5, color: MUTED });
  drawLines(page, wrapText(indianNumberWords(invoice.roundedTotal), bold, 8.5, 340, 3), { x: left + 8, y: 249, font: bold, size: 8.5, lineHeight: 11, maxLines: 3 });
  const taxLines = invoice.taxMode === "cgst_sgst"
    ? [`CGST: Rs. ${money(invoice.cgst)}`, `SGST: Rs. ${money(invoice.sgst)}`]
    : invoice.taxMode === "igst" ? [`IGST: Rs. ${money(invoice.igst)}`] : ["GST: Nil"];
  drawLines(page, [...taxLines, `Rounded Total: Rs. ${invoice.roundedTotal.toLocaleString("en-IN")}`], { x: left + 370, y: 264, font: bold, size: 8, lineHeight: 15 });

  drawCell(page, { x: left, y: 38, width: 280, height: 160 });
  drawCell(page, { x: left + 280, y: 38, width: 264, height: 160 });
  page.drawText("BANK DETAILS", { x: left + 8, y: 181, font: bold, size: 8.5, color: NAVY });
  const bankLines = [
    invoice.profile.bankAccountName ? `Account Name: ${text(invoice.profile.bankAccountName)}` : "",
    invoice.profile.bankAccountNumber ? `Account No: ${text(invoice.profile.bankAccountNumber)}` : "",
    invoice.profile.bankIfsc ? `IFSC: ${text(invoice.profile.bankIfsc)}` : "",
    invoice.profile.bankName ? `Bank: ${text(invoice.profile.bankName)}` : "",
    invoice.profile.bankBranch ? `Branch: ${text(invoice.profile.bankBranch)}` : ""
  ].filter(Boolean);
  drawLines(page, bankLines, { x: left + 8, y: 161, font: regular, size: 8, lineHeight: 14, maxLines: 7 });
  if (invoice.notes) {
    page.drawText("Terms / Notes", { x: left + 8, y: 72, font: bold, size: 7.5, color: NAVY });
    drawLines(page, wrapText(invoice.notes, regular, 7, 258, 2), { x: left + 8, y: 58, font: regular, size: 7, lineHeight: 9, maxLines: 2 });
  }
  page.drawText("Certified that the particulars given above are true and correct", { x: left + 292, y: 181, font: regular, size: 7.2, color: MUTED });
  drawLines(page, wrapText(invoice.profile.legalName, bold, 8, 242, 2), { x: left + 292, y: 163, font: bold, size: 8, color: TEXT, lineHeight: 10, maxLines: 2 });
  if (signature) {
    const scale = Math.min(205 / signature.width, 88 / signature.height);
    const signatureWidth = signature.width * scale;
    const signatureHeight = signature.height * scale;
    page.drawImage(signature, { x: left + 412 - (signatureWidth / 2), y: 62, width: signatureWidth, height: signatureHeight });
  }
  page.drawText("Authorized Signatory", { x: left + 355, y: 49, font: regular, size: 8, color: TEXT });
  page.drawText("Original for Recipient", { x: left, y: 19, font: regular, size: 7, color: MUTED });

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

async function generateCreditNotePdf(input = {}, savedSettings = {}) {
  const profile = savedSettings?.invoiceProfile || {};
  const clientProfiles = savedSettings?.invoiceClientProfiles || {};
  const clientName = text(input.clientName);
  const client = clientProfiles[clientName] || {};
  const noteNumber = text(input.creditNoteNumber);
  const noteDate = text(input.creditNoteDate);
  const originalInvoiceNumber = text(input.originalInvoiceNumber);
  const taxableAmount = Math.max(0, number(input.taxableAmount));
  const gstRate = Math.max(0, number(input.gstRate || profile.defaultGstRate || 18));
  const taxMode = ["igst", "cgst_sgst", "none"].includes(text(input.taxMode)) ? text(input.taxMode) : "igst";
  if (!noteNumber || !noteDate || !clientName || !originalInvoiceNumber || !(taxableAmount > 0)) throw new Error("Credit note number, date, client, original invoice and taxable amount are required.");
  const tax = taxMode === "none" ? 0 : taxableAmount * gstRate / 100;
  const cgst = taxMode === "cgst_sgst" ? tax / 2 : 0;
  const sgst = taxMode === "cgst_sgst" ? tax / 2 : 0;
  const igst = taxMode === "igst" ? tax : 0;
  const total = taxableAmount + tax;
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 842]);
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const left = 38; const width = 536;
  page.drawText("CREDIT NOTE", { x: left, y: 790, font: bold, size: 19, color: NAVY });
  page.drawText(`Credit Note ${noteNumber}`, { x: left, y: 770, font: regular, size: 9, color: MUTED });
  drawCell(page, { x: left, y: 635, width, height: 110 });
  page.drawRectangle({ x: left, y: 725, width, height: 20, color: NAVY });
  page.drawText("SUPPLIER / ISSUER", { x: left + 8, y: 731, font: bold, size: 8, color: rgb(1, 1, 1) });
  page.drawText(text(profile.legalName), { x: left + 10, y: 706, font: bold, size: 9, color: TEXT });
  drawLines(page, wrapText(profile.address, regular, 8.5, 290, 4), { x: left + 10, y: 690, font: regular, size: 8.5, lineHeight: 11, maxLines: 4 });
  page.drawLine({ start: { x: left + 320, y: 635 }, end: { x: left + 320, y: 725 }, thickness: 0.6, color: BORDER });
  drawLines(page, [`Credit Note No: ${noteNumber}`, `Date: ${formatInvoiceDate(noteDate)}`, `Against Invoice: ${originalInvoiceNumber}`], { x: left + 334, y: 704, font: regular, size: 8.5, lineHeight: 19 });
  drawCell(page, { x: left, y: 510, width, height: 92 });
  page.drawRectangle({ x: left, y: 582, width, height: 20, color: NAVY });
  page.drawText("BILLED TO", { x: left + 8, y: 588, font: bold, size: 8, color: rgb(1, 1, 1) });
  page.drawText(text(client.legalName || clientName), { x: left + 10, y: 562, font: bold, size: 9, color: TEXT });
  drawLines(page, wrapText(client.address, regular, 8.5, 500, 4), { x: left + 10, y: 546, font: regular, size: 8.5, lineHeight: 11, maxLines: 4 });
  const rows = [["Reason", text(input.reason) || "Billing adjustment"], ["Taxable adjustment", `Rs. ${money(taxableAmount)}`], ["GST adjustment", taxMode === "cgst_sgst" ? `CGST Rs. ${money(cgst)} + SGST Rs. ${money(sgst)}` : taxMode === "igst" ? `IGST Rs. ${money(igst)}` : "Nil"], ["Total credit", `Rs. ${money(total)}`]];
  let y = 430;
  rows.forEach(([label, value]) => { drawCell(page, { x: left, y, width: 180, height: 35, fill: PALE }); drawCell(page, { x: left + 180, y, width: 356, height: 35 }); page.drawText(label, { x: left + 9, y: y + 13, font: bold, size: 8.5, color: TEXT }); drawLines(page, wrapText(value, regular, 8.5, 336, 2), { x: left + 190, y: y + 13, font: regular, size: 8.5, lineHeight: 10, maxLines: 2 }); y -= 35; });
  page.drawText("This credit note adjusts the above referenced invoice.", { x: left, y: 230, font: regular, size: 8.5, color: MUTED });
  page.drawText(text(profile.legalName), { x: 370, y: 115, font: bold, size: 8, color: TEXT });
  page.drawText("Authorized Signatory", { x: 400, y: 70, font: regular, size: 8, color: TEXT });
  const bytes = await doc.save();
  return { filename: `${safeFilename(noteNumber)}.pdf`, mimeType: "application/pdf", fileData: Buffer.from(bytes).toString("base64"), totals: { taxableAmount, cgst, sgst, igst, total, taxMode } };
}

module.exports = {
  generateInvoicePdf,
  formatInvoiceDate,
  indianNumberWords,
  normalizeInvoiceInput,
  generateCreditNotePdf
};
