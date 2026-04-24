const { DEFAULT_SYNONYMS, expandSkillTerms, inferExperienceRangeFromText, mapLocationAlias, normalizeToken } = require("./synonyms");
const { createEmbedding, cosineSimilarity, hashText } = require("./embedding-service");

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function buildCandidateSemanticText(item) {
  const skills = Array.isArray(item?.skills) ? item.skills.join(", ") : "";
  const inferred = Array.isArray(item?.inferredTags) ? item.inferredTags.join(", ") : "";
  const core = [
    item?.candidateName || "",
    item?.role || "",
    item?.position || "",
    item?.company || "",
    item?.location || "",
    skills,
    inferred,
    item?.notesText || ""
  ].filter(Boolean).join("\n");
  const cvJson = String(item?.hiddenCvText || "").trim();
  const cvTrimmed = cvJson.length > 4000 ? `${cvJson.slice(0, 4000)}...` : cvJson;
  return [core, cvTrimmed].filter(Boolean).join("\n");
}

function readCandidateEmbedding(item) {
  const meta = item?.raw?.metadata && typeof item.raw.metadata === "object" ? item.raw.metadata : null;
  const draftPayload = item?.raw?.candidate?.draft_payload && typeof item.raw.candidate.draft_payload === "object"
    ? item.raw.candidate.draft_payload
    : item?.raw?.candidate?.draftPayload && typeof item.raw.candidate.draftPayload === "object"
      ? item.raw.candidate.draftPayload
      : null;

  const embedding = meta?.searchEmbeddingV1
    || draftPayload?.searchEmbeddingV1
    || draftPayload?.search_embedding_v1;
  const model = String(meta?.searchEmbeddingModel || draftPayload?.searchEmbeddingModel || draftPayload?.search_embedding_model || "").trim();
  const textHash = String(meta?.searchEmbeddingTextHash || draftPayload?.searchEmbeddingTextHash || draftPayload?.search_embedding_text_hash || "").trim();
  if (!Array.isArray(embedding) || !embedding.length) return null;
  return { embedding, model, textHash };
}

function scoreCandidate({ item, filters, expandedSkills, normalizedQuery, semanticScore = 0 }) {
  const hay = String(item?.hay || "").trim();
  const locationHay = String(item?.location || "").toLowerCase();
  const companyHay = String(item?.company || "").toLowerCase();

  const reasons = [];
  let score = 0;

  // Skill matching (highest weight)
  if (expandedSkills.length) {
    const matched = expandedSkills.filter((skill) => hay.includes(normalizeToken(skill)));
    const exact = (filters?.skills || []).map((s) => normalizeToken(s)).filter(Boolean);
    const exactMatched = exact.filter((skill) => hay.includes(skill));
    if (exactMatched.length) {
      score += 120 * exactMatched.length;
      reasons.push(`skills_exact:${exactMatched.join(",")}`);
    }
    const synonymOnly = matched.filter((m) => !exact.includes(normalizeToken(m)));
    if (synonymOnly.length) {
      score += 70 * Math.min(4, synonymOnly.length);
      reasons.push(`skills_syn:${synonymOnly.slice(0, 4).join(",")}`);
    }
  }

  // Location (medium)
  const requestedLocations = Array.isArray(filters?.locations) && filters.locations.length
    ? filters.locations
    : filters?.location
      ? [filters.location]
      : [];
  if (requestedLocations.length) {
    const matched = requestedLocations.some((loc) => locationHay.includes(String(loc || "").toLowerCase()));
    if (matched) {
      score += 65;
      reasons.push("location");
    }
  }

  // Experience (medium-high)
  if (filters?.minExperienceYears != null || filters?.maxExperienceYears != null) {
    const years = Number(item?.years ?? NaN);
    if (Number.isFinite(years)) {
      if (filters.minExperienceYears != null && years >= Number(filters.minExperienceYears)) score += 45;
      if (filters.maxExperienceYears != null && years <= Number(filters.maxExperienceYears)) score += 45;
    }
  }

  // Current company (small)
  if (filters?.currentCompany) {
    const token = String(filters.currentCompany || "").toLowerCase();
    if (token && companyHay.includes(token)) {
      score += 20;
      reasons.push("company");
    }
  }

  // Semantic match (high, but bounded)
  if (semanticScore > 0) {
    const scaled = clamp(semanticScore, 0, 1);
    score += Math.round(180 * scaled);
    reasons.push(`semantic:${scaled.toFixed(3)}`);
  }

  // Recency / completeness (small)
  const completeness = [
    item?.raw?.candidate?.phone,
    item?.raw?.candidate?.email,
    Array.isArray(item?.skills) && item.skills.length ? "skills" : "",
    item?.notesText
  ].filter(Boolean).length;
  score += completeness * 4;
  if (completeness) reasons.push(`complete:${completeness}`);

  // Slight boost if query tokens present anywhere.
  if (normalizedQuery) {
    const tokenMatches = normalizedQuery
      .split(/\s+/)
      .map((t) => normalizeToken(t))
      .filter((t) => t.length >= 3)
      .filter((t) => hay.includes(t)).length;
    score += Math.min(20, tokenMatches * 3);
    if (tokenMatches) reasons.push(`tokens:${tokenMatches}`);
  }

  return { score, reasons, semanticScore };
}

async function hybridSearchCandidates({
  universe,
  actor,
  rawQuery,
  normalizedQuery,
  filters,
  queryMode,
  apiKey,
  synonyms = DEFAULT_SYNONYMS,
  helpers,
  options = {}
}) {
  const {
    buildHay,
    matchesNatural,
    matchesBoolean,
    matchesLooseTokens
  } = helpers || {};

  const debug = options.debug === true;
  const semanticEnabled = Boolean(apiKey) && options.semantic !== false;

  // Expand skills and normalize location filters using configured synonyms.
  const expandedSkills = expandSkillTerms(filters?.skills || [], synonyms);
  const locationAlias = filters?.location ? mapLocationAlias(filters.location, synonyms) : { canonical: "", variants: [] };
  const normalizedLocations = Array.from(
    new Set([
      ...(Array.isArray(filters?.locations) ? filters.locations : []),
      ...(filters?.location ? [filters.location] : []),
      ...(locationAlias.canonical ? [locationAlias.canonical] : []),
      ...(locationAlias.variants || [])
    ].map((v) => String(v || "").trim()).filter(Boolean))
  );
  const experienceFromLevel = inferExperienceRangeFromText(normalizedQuery || rawQuery, synonyms);

  const matchingFilters = {
    ...(filters || {}),
    locations: normalizedLocations,
    location: locationAlias.canonical || filters?.location || "",
    minExperienceYears: filters?.minExperienceYears != null
      ? filters.minExperienceYears
      : experienceFromLevel?.min ?? null,
    maxExperienceYears: filters?.maxExperienceYears != null
      ? filters.maxExperienceYears
      : experienceFromLevel?.max ?? null,
    // Keep original skill list for structured matching so we don't accidentally
    // tighten existing AND semantics. Synonyms/variants are used for scoring.
    skills: Array.isArray(filters?.skills) ? filters.skills : []
  };

  const baseUniverse = Array.isArray(universe) ? universe : [];
  const prepared = baseUniverse.map((item) => ({
    item,
    hay: buildHay(item),
    years: options.parseExperienceToYears ? options.parseExperienceToYears(item.totalExperience) : null
  }));

  // 1) Keep existing filter semantics (backward compatible)
  let structuredMatches = [];
  const enforceBooleanDeterministic = options.enforceDeterministicFiltersWithBoolean === true;
  if (queryMode === "boolean") {
    structuredMatches = prepared
      .filter(({ item }) => {
        if (!matchesBoolean(item, rawQuery)) return false;
        if (enforceBooleanDeterministic && typeof matchesNatural === "function") {
          return matchesNatural(item, matchingFilters, actor);
        }
        return true;
      })
      .slice(0, 500);
    if (
      !structuredMatches.length &&
      options.isPlainLookup &&
      options.isPlainLookup(rawQuery) &&
      typeof options.buildNaturalSearchFallbackTokens === "function" &&
      typeof options.normalizeDashboardText === "function"
    ) {
      const fallbackTokens = options.buildNaturalSearchFallbackTokens(rawQuery);
      structuredMatches = prepared
        .filter(({ item }) => {
          const hay = buildHay(item);
          return fallbackTokens.length && fallbackTokens.every((token) => hay.includes(options.normalizeDashboardText(token)));
        })
        .slice(0, 200);
    }
  } else {
    structuredMatches = prepared
      .filter(({ item }) => matchesNatural(item, matchingFilters, actor))
      .slice(0, 500);
    if (!structuredMatches.length && rawQuery) {
      const relaxed = { ...matchingFilters, role: "", roleFamilies: [], targetLabel: "", currentCompany: "", skills: [] };
      structuredMatches = prepared
        .filter(({ item }) => matchesNatural(item, relaxed, actor))
        .filter(({ item }) => matchesLooseTokens(item, rawQuery))
        .slice(0, 500);
    }
  }

  // 2) Semantic retrieval (optional / additive)
  let semantic = { used: false, candidateCount: 0, queryHash: "", topScore: 0 };
  const semanticScores = new Map();
  if (semanticEnabled && rawQuery) {
    try {
      const queryHash = hashText(normalizedQuery || rawQuery);
      const queryEmbedding = await createEmbedding({ apiKey, text: normalizedQuery || rawQuery });
      if (queryEmbedding.length) {
        let topScore = 0;
        for (const entry of prepared) {
          const stored = readCandidateEmbedding(entry.item);
          if (!stored?.embedding?.length) continue;
          const sim = cosineSimilarity(queryEmbedding, stored.embedding);
          if (!Number.isFinite(sim)) continue;
          semanticScores.set(entry.item.id, sim);
          if (sim > topScore) topScore = sim;
        }
        semantic = { used: true, candidateCount: semanticScores.size, queryHash, topScore };
      }
    } catch (error) {
      if (debug) {
        console.warn("Semantic search disabled due to embedding failure:", error?.message || error);
      }
    }
  }

  const structuredIds = new Set(structuredMatches.map((m) => String(m.item?.id || "").trim()).filter(Boolean));

  // Pull additional semantic-only candidates if available.
  let semanticOnly = [];
  if (semantic.used && semanticScores.size) {
    semanticOnly = prepared
      .filter(({ item }) => !structuredIds.has(String(item?.id || "").trim()))
      .map(({ item, hay, years }) => ({ item, hay, years, semanticScore: semanticScores.get(item.id) || 0 }))
      .sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0))
      .slice(0, Number(options.semanticTopK || 80));
  }

  const combined = [
    ...structuredMatches.map(({ item, hay, years }) => ({ item, hay, years, semanticScore: semanticScores.get(item.id) || 0 })),
    ...semanticOnly
  ];

  const scored = combined.map(({ item, hay, years, semanticScore }) => {
    const result = scoreCandidate({
      item: { ...item, hay, years },
      filters: matchingFilters,
      expandedSkills,
      normalizedQuery: normalizedQuery || "",
      semanticScore
    });
    return {
      ...item,
      _rank: {
        score: result.score,
        reasons: result.reasons,
        semantic: result.semanticScore
      }
    };
  });

  scored.sort((a, b) => (b?._rank?.score || 0) - (a?._rank?.score || 0));

  return {
    filters: matchingFilters,
    items: scored.slice(0, 200),
    debug: debug ? { semantic, expandedSkills, normalizedLocations, experienceFromLevel } : null
  };
}

function upsertCandidateEmbeddingInMetadata(candidate, embedding, { model, textHash }) {
  const raw = candidate || {};
  const meta = raw?.raw_note && typeof raw.raw_note === "string" ? raw.raw_note : "";
  // Caller owns decode/encode; this helper only returns metadata patch.
  return {
    searchEmbeddingV1: Array.isArray(embedding) ? embedding : [],
    searchEmbeddingModel: String(model || "").trim(),
    searchEmbeddingTextHash: String(textHash || "").trim(),
    searchEmbeddingUpdatedAt: new Date().toISOString()
  };
}

module.exports = {
  buildCandidateSemanticText,
  hybridSearchCandidates,
  readCandidateEmbedding,
  upsertCandidateEmbeddingInMetadata,
  hashText
};
