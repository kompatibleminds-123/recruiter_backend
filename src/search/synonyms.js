const DEFAULT_SYNONYMS = {
  locations: {
    bombay: "mumbai",
    "bengaluru": "bangalore",
    "blr": "bangalore",
    "delhi ncr": ["delhi", "gurgaon", "noida"],
    "ncr": ["delhi", "gurgaon", "noida"]
  },
  experienceLevels: {
    junior: { min: 0, max: 2 },
    "entry level": { min: 0, max: 2 },
    fresher: { min: 0, max: 1 },
    "mid-level": { min: 3, max: 5 },
    midlevel: { min: 3, max: 5 },
    senior: { min: 6, max: null },
    "lead": { min: 7, max: null }
  },
  // Canonical skill -> list of variants that should be treated as the same intent.
  skills: {
    nodejs: ["node", "node js", "node.js", "node developer", "backend node engineer"],
    react: ["reactjs", "react js", "react.js", "frontend react engineer", "react developer"],
    "spring boot": ["spring", "springboot", "java spring", "java spring developer", "spring boot developer"]
  }
};

function normalizeToken(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function expandSkillTerms(terms, synonyms = DEFAULT_SYNONYMS) {
  const input = Array.isArray(terms) ? terms : [];
  const normalized = input.map((t) => normalizeToken(t)).filter(Boolean);
  const expanded = new Set();
  normalized.forEach((t) => expanded.add(t));

  const skillMap = synonyms?.skills || {};
  const canonicalByVariant = new Map();
  Object.entries(skillMap).forEach(([canonical, variants]) => {
    const key = normalizeToken(canonical);
    canonicalByVariant.set(key, key);
    (Array.isArray(variants) ? variants : []).forEach((variant) => {
      canonicalByVariant.set(normalizeToken(variant), key);
    });
  });

  normalized.forEach((t) => {
    const canonical = canonicalByVariant.get(t);
    if (canonical) expanded.add(canonical);
  });

  // If recruiter typed a canonical term, also include its variants for matching in free text.
  normalized.forEach((t) => {
    Object.entries(skillMap).forEach(([canonical, variants]) => {
      const canonicalKey = normalizeToken(canonical);
      if (t !== canonicalKey) return;
      (Array.isArray(variants) ? variants : []).forEach((variant) => expanded.add(normalizeToken(variant)));
    });
  });

  return Array.from(expanded).filter(Boolean);
}

function mapLocationAlias(value, synonyms = DEFAULT_SYNONYMS) {
  const token = normalizeToken(value);
  if (!token) return { canonical: "", variants: [] };
  const mapping = synonyms?.locations || {};
  const mapped = mapping[token];
  if (!mapped) return { canonical: token, variants: [] };
  if (Array.isArray(mapped)) return { canonical: token, variants: mapped.map((v) => normalizeToken(v)).filter(Boolean) };
  return { canonical: normalizeToken(mapped), variants: [] };
}

function inferExperienceRangeFromText(normalizedQuery, synonyms = DEFAULT_SYNONYMS) {
  const lower = normalizeToken(normalizedQuery);
  if (!lower) return null;
  const levels = synonyms?.experienceLevels || {};
  for (const [label, range] of Object.entries(levels)) {
    const token = normalizeToken(label);
    if (!token) continue;
    if (new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) {
      return { min: range?.min ?? null, max: range?.max ?? null, label: token };
    }
  }
  return null;
}

module.exports = {
  DEFAULT_SYNONYMS,
  expandSkillTerms,
  inferExperienceRangeFromText,
  mapLocationAlias,
  normalizeToken
};

