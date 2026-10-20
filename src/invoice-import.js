const { PDFParse } = require("pdf-parse");

function clean(value = "") {
  return String(value || "").replace(/\r/g, "\n").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
}

function amount(value = "") {
  const parsed = Number(String(value || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isoDate(value = "") {
  const raw = clean(value).replace(/(\d)(st|nd|rd|th)/i, "$1");
  const direct = raw.match(/\b(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)\b/);
  if (direct) return `${direct[1]}-${String(direct[2]).padStart(2, "0")}-${String(direct[3]).padStart(2, "0")}`;
  const named = raw.match(/\b([0-3]?\d)\s+([A-Za-z]{3,9})[,]?\s+(20\d{2})\b/);
  if (named) {
    const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
    const month = months[named[2].slice(0, 4).toLowerCase()] || months[named[2].slice(0, 3).toLowerCase()];
    if (month) return `${named[3]}-${String(month).padStart(2, "0")}-${String(named[1]).padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return "";
}

function allMatches(text, pattern) {
  return Array.from(text.matchAll(pattern), (match) => clean(match[1])).filter(Boolean);
}

async function extractHistoricalInvoice(file = {}, settings = {}) {
  const buffer = Buffer.from(String(file.fileData || ""), "base64");
  if (!buffer.length || buffer.length > 12 * 1024 * 1024 || buffer.subarray(0, 4).toString() !== "%PDF") {
    throw new Error("Please upload a valid text PDF smaller than 12 MB.");
  }
  const parser = new PDFParse({ data: buffer });
  let rawText = "";
  try {
    rawText = String((await parser.getText())?.text || "");
  } finally {
    await parser.destroy().catch(() => {});
  }
  const text = clean(rawText);
  if (text.length < 30) throw new Error("No readable text found in this PDF.");

  const knownClients = Object.keys(settings?.invoiceClientProfiles || {}).sort((a, b) => b.length - a.length);
  const knownClient = knownClients.find((name) => text.toLowerCase().includes(name.toLowerCase())) || "";
  const invoiceNumber = firstMatch(text, [
    /Invoice\s*(?:No\.?|Number)\s*[:#-]?\s*([A-Z0-9][A-Z0-9\/-]{3,})/i,
    /(?:^|\n)\s*Invoice\s+([A-Z0-9][A-Z0-9\/-]{3,})/im,
    /\b((?:[A-Z]{1,5}[\/-])?\d{2}[\/-]\d{2}[\/-]\d{3,})\b/i
  ]);
  const dateText = firstMatch(text, [
    /Invoice\s*Date\s*[:#-]?\s*([^\n]{6,24})/i,
    /Date\s*[:#-]?\s*([^\n]{6,24})/i
  ]);
  const candidateNames = allMatches(text, /Candidate\s*:\s*([^\n]+)/gi);
  const annualCtcs = allMatches(text, /(?:Annual\s*)?CTC\s*:\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/gi).map(amount);
  const feeMatches = allMatches(text, /(?:Recruitment\s*)?Fee\s*:?\s*([\d.]+)\s*%/gi).map(amount);
  const taxableAmount = amount(firstMatch(text, [
    /Taxable(?:\s+Amount)?\s*[:#-]?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/i
  ]));
  const cgst = amount(firstMatch(text, [/CGST\s*:?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/i]));
  const sgst = amount(firstMatch(text, [/SGST\s*:?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/i]));
  const igst = amount(firstMatch(text, [/IGST\s*:?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/i]));
  const total = amount(firstMatch(text, [
    /Rounded\s+Total\s*:?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /Grand\s+Total\s*:?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/i,
    /Total\s*:?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d+)?)/i
  ]));
  const taxMode = igst > 0 ? "igst" : (cgst > 0 || sgst > 0 ? "cgst_sgst" : "none");
  const gstAmount = igst || (cgst + sgst);
  const inferredTaxable = taxableAmount || (total > gstAmount ? total - gstAmount : 0);
  const gstRate = inferredTaxable > 0 && gstAmount > 0 ? Number(((gstAmount / inferredTaxable) * 100).toFixed(2)) : 18;
  const clientName = knownClient || firstMatch(text, [/(?:Details\s+of\s+Receiver|Billed\s+To)[\s\S]{0,80}\n\s*([^\n]+)/i]);
  const items = (candidateNames.length ? candidateNames : [""]).map((candidateName, index) => ({
    candidateName,
    serviceDescription: "HR Consulting Services",
    annualCtc: annualCtcs[index] || 0,
    feePercent: feeMatches[index] || 0,
    taxableAmount: candidateNames.length === 1 ? inferredTaxable : 0
  }));
  const required = { invoiceNumber, invoiceDate: isoDate(dateText), clientName, taxableAmount: inferredTaxable };
  const missingFields = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (!candidateNames.length) missingFields.push("candidateName");
  return {
    filename: String(file.filename || "invoice.pdf"),
    invoice: {
      invoiceNumber,
      invoiceDate: required.invoiceDate,
      clientName,
      candidateName: items[0]?.candidateName || "",
      annualCtc: items[0]?.annualCtc || 0,
      feePercent: items[0]?.feePercent || 0,
      taxableAmount: inferredTaxable,
      gstRate,
      taxMode,
      items
    },
    missingFields,
    status: missingFields.length ? "needs_review" : "ready"
  };
}

module.exports = { extractHistoricalInvoice, isoDate };
