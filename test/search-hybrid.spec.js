const assert = require("node:assert/strict");

const { hybridSearchCandidates } = require("../src/search/hybrid-search");
const { DEFAULT_SYNONYMS } = require("../src/search/synonyms");

function buildHay(item) {
  return String([
    item.candidateName,
    item.role,
    item.location,
    Array.isArray(item.skills) ? item.skills.join(" ") : "",
    item.notesText
  ].filter(Boolean).join(" ")).toLowerCase();
}

function matchesNatural(item, filters) {
  const hay = buildHay(item);
  if (filters.location && !hay.includes(String(filters.location).toLowerCase())) return false;
  if (Array.isArray(filters.skills) && filters.skills.length) {
    return filters.skills.some((s) => hay.includes(String(s).toLowerCase()));
  }
  return true;
}

function matchesBoolean(item, q) {
  const hay = buildHay(item);
  return hay.includes(String(q || "").toLowerCase());
}

function matchesLooseTokens(item, q) {
  const tokens = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
  const hay = buildHay(item);
  return tokens.some((t) => hay.includes(t));
}

async function run() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ data: [{ embedding: [1, 0] }] })
  });

  try {
    const universe = [
      {
        id: "a",
        candidateName: "A",
        role: "NodeJS Developer",
        location: "mumbai",
        skills: ["nodejs"],
        notesText: "backend engineer",
        totalExperience: "4 years",
        raw: { candidate: { draft_payload: { search_embedding_v1: [0.9, 0.1], search_embedding_text_hash: "x" } }, metadata: {} }
      },
      {
        id: "b",
        candidateName: "B",
        role: "React Developer",
        location: "mumbai",
        skills: ["react"],
        notesText: "frontend engineer",
        totalExperience: "4 years",
        raw: { candidate: { draft_payload: { search_embedding_v1: [0, 1], search_embedding_text_hash: "y" } }, metadata: {} }
      }
    ];

    const res = await hybridSearchCandidates({
      universe,
      actor: { id: "u", companyId: "c" },
      rawQuery: "nodejs developer mumbai",
      normalizedQuery: "nodejs developer mumbai",
      filters: { skills: ["nodejs"], location: "mumbai", locations: [] },
      queryMode: "natural",
      apiKey: "dummy",
      synonyms: DEFAULT_SYNONYMS,
      helpers: { buildHay, matchesNatural, matchesBoolean, matchesLooseTokens },
      options: { semanticTopK: 10, semantic: true, debug: true }
    });

    assert.equal(res.items[0].id, "a");
    assert.equal(typeof res.items[0]._rank.score, "number");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

module.exports = { run };

