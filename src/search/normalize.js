const { mapLocationAlias, normalizeToken } = require("./synonyms");

const NUMBER_WORDS = new Map([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12]
]);

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function standardizeExperienceExpressions(text) {
  let next = normalizeWhitespace(text).toLowerCase();
  if (!next) return "";

  // Convert "<number word> years" => "<digit> years"
  NUMBER_WORDS.forEach((num, word) => {
    next = next.replace(new RegExp(`\\b${word}\\s+years?\\b`, "gi"), `${num} years`);
    next = next.replace(new RegExp(`\\b${word}\\s+yrs?\\b`, "gi"), `${num} years`);
  });

  // Normalize "yrs" => "years"
  next = next.replace(/\b(\d+(?:\.\d+)?)\s*yrs?\b/gi, "$1 years");
  next = next.replace(/\b(\d+(?:\.\d+)?)\s*year\b/gi, "$1 years");

  // Normalize "+ years" spacing.
  next = next.replace(/\b(\d+(?:\.\d+)?)\s*\+\s*years\b/gi, "$1+ years");

  return next;
}

function standardizeLocationAliases(text, synonyms) {
  const lower = normalizeWhitespace(text).toLowerCase();
  if (!lower) return "";

  // Replace only whole-word aliases to avoid mangling emails/urls.
  let next = lower;
  const aliases = Object.keys((synonyms?.locations || {})).sort((a, b) => b.length - a.length);
  for (const alias of aliases) {
    const { canonical } = mapLocationAlias(alias, synonyms);
    if (!canonical) continue;
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`\\b${escaped}\\b`, "gi"), canonical);
  }
  return next;
}

function standardizeSkillAliases(text) {
  // Keep conservative: only normalize common punctuation/spacing.
  let next = normalizeWhitespace(text).toLowerCase();
  next = next.replace(/\bnode\s*\.?\s*js\b/gi, "nodejs");
  next = next.replace(/\breact\s*\.?\s*js\b/gi, "react");
  next = next.replace(/\bnext\s*\.?\s*js\b/gi, "nextjs");
  next = next.replace(/\bspring\s*boot\b/gi, "spring boot");
  // golang aliases
  next = next.replace(/\bgo\s*[-]?\s*lang\b/gi, "golang");
  next = next.replace(/\bgo\s*[-]?\s*language\b/gi, "golang");
  // dotnet aliases
  next = next.replace(/\basp\s*\.?\s*net\b/gi, "asp.net");
  next = next.replace(/\basp\s*\.?\s*net\s*core\b/gi, "asp.net core");
  next = next.replace(/\b\.net\s*core\b/gi, "dotnet core");
  next = next.replace(/\bdot\s*net\b/gi, "dotnet");
  next = next.replace(/\b\.net\b/gi, "dotnet");
  next = next.replace(/\bc\s*sharp\b/gi, "c#");
  return next;
}

function normalizeRecruiterQuery(rawQuery, synonyms) {
  const raw = String(rawQuery || "");
  let normalized = raw;
  normalized = normalizeWhitespace(normalized);
  normalized = standardizeExperienceExpressions(normalized);
  normalized = standardizeSkillAliases(normalized);
  normalized = standardizeLocationAliases(normalized, synonyms);
  normalized = normalizeWhitespace(normalized).toLowerCase();

  return {
    raw,
    normalized,
    tokens: normalized ? normalized.split(/\s+/).map((t) => normalizeToken(t)).filter(Boolean) : []
  };
}

module.exports = {
  normalizeRecruiterQuery,
  normalizeWhitespace,
  standardizeExperienceExpressions,
  standardizeLocationAliases,
  standardizeSkillAliases
};
