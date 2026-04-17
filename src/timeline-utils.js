function looksLikeDuration(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return false;
  return /\b(\d+(\.\d+)?\s*(years?|yrs?|months?|mos?)|yr|yrs|mo|mos)\b/i.test(raw);
}

function looksLikeDateRange(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (!raw.includes("-")) return false;
  return /\b(present|current|till|to\s+date)\b/i.test(raw) || /\b\d{4}\b/.test(raw) || /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(raw);
}

function splitPossibleEntries(text = "") {
  return String(text || "")
    .split(/\r?\n+/)
    .flatMap((line) => String(line || "").split(/\s*;\s*/g))
    .map((line) => String(line || "").trim())
    .filter(Boolean);
}

function splitPipeParts(line = "") {
  // Prefer the exact delimiter used by the extension/editor: " | "
  const raw = String(line || "").trim();
  if (!raw) return [];
  if (raw.includes(" | ")) return raw.split(" | ").map((p) => String(p || "").trim()).filter(Boolean);
  if (raw.includes("|")) return raw.split("|").map((p) => String(p || "").trim()).filter(Boolean);
  return [raw];
}

function parseStartEnd(rangeText = "") {
  const raw = String(rangeText || "").trim();
  if (!raw) return { start: "", end: "" };
  const parts = raw.split(/\s*-\s*/).map((p) => String(p || "").trim()).filter(Boolean);
  if (parts.length >= 2) return { start: parts[0], end: parts.slice(1).join(" - ") };
  return { start: raw, end: "" };
}

function parseTitleAndCompany(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return { title: "", company: "" };
  const match = raw.match(/\s+at\s+(.+)$/i);
  if (match) {
    const company = String(match[1] || "").trim();
    const title = raw.slice(0, match.index).trim();
    return { title, company };
  }
  return { title: raw, company: "" };
}

function normalizeTimelineRow(row = {}) {
  return {
    company: String(row?.company || "").trim(),
    title: String(row?.title || row?.designation || "").trim(),
    start: String(row?.start || "").trim(),
    end: String(row?.end || "").trim(),
    duration: String(row?.duration || "").trim()
  };
}

function parseExperienceTimelineTextToStructured(text = "") {
  const entries = splitPossibleEntries(text);
  const rows = [];

  for (const entry of entries) {
    const parts = splitPipeParts(entry);
    if (!parts.length) continue;

    let title = "";
    let company = "";
    let start = "";
    let end = "";
    let duration = "";

    // Common editor format: title | company | start - end | duration
    if (parts.length >= 4) {
      title = parts[0];
      company = parts[1];
      ({ start, end } = parseStartEnd(parts[2]));
      duration = parts.slice(3).join(" | ");
    } else if (parts.length === 3) {
      // title | company | start - end
      // OR title | start - end | duration
      // OR title at company | start - end | duration
      const [a, b, c] = parts;
      if (looksLikeDateRange(b) && looksLikeDuration(c)) {
        ({ title, company } = parseTitleAndCompany(a));
        ({ start, end } = parseStartEnd(b));
        duration = c;
      } else if (looksLikeDateRange(c)) {
        title = a;
        company = b;
        ({ start, end } = parseStartEnd(c));
      } else if (looksLikeDateRange(b)) {
        ({ title, company } = parseTitleAndCompany(a));
        ({ start, end } = parseStartEnd(b));
        duration = c;
      } else {
        title = a;
        company = b;
        duration = c;
      }
    } else if (parts.length === 2) {
      const [a, b] = parts;
      if (looksLikeDateRange(b)) {
        ({ title, company } = parseTitleAndCompany(a));
        ({ start, end } = parseStartEnd(b));
      } else if (looksLikeDuration(b)) {
        ({ title, company } = parseTitleAndCompany(a));
        duration = b;
      } else {
        ({ title, company } = parseTitleAndCompany(a));
        company = company || b;
      }
    } else {
      ({ title, company } = parseTitleAndCompany(parts[0]));
    }

    const normalized = normalizeTimelineRow({ title, company, start, end, duration });
    if (!normalized.company && !normalized.title && !normalized.start && !normalized.end && !normalized.duration) continue;
    rows.push(normalized);
  }

  // Drop truly empty rows; keep partial rows (company-only etc) since CVs can be messy.
  return rows.filter((row) => row.company || row.title || row.start || row.end || row.duration);
}

module.exports = {
  parseExperienceTimelineTextToStructured,
  normalizeTimelineRow
};

