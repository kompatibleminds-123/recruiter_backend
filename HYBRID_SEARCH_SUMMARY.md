# Hybrid Candidate Search Upgrade

## Old Flow (Before This Change)

1. UI calls `GET /company/candidates/search-natural?q=...&mode=natural|ai|boolean`.
2. Backend builds a full in-memory `universe` by loading:
   - `candidates` (captured notes / drafts)
   - `assessments`
   - `company_jobs`
3. Natural mode:
   - `parseNaturalLanguageCandidateQuery(query)` produces structured filters.
   - `candidateMatchesNaturalFilter(item, filters)` filters the universe.
4. Boolean mode:
   - `candidateMatchesBooleanQuery(item, query)` filters the universe.
   - Fallback token matching runs for simple “lookup” queries.
5. Response returns `{ filters, items }` with no ranking beyond the universe’s natural ordering.

## New Flow (Hybrid, Backward Compatible)

We keep the same endpoint + response shape, but add:

1. **Query normalization** (lowercase, whitespace cleanup, experience phrasing standardization, conservative skill/location standardization).
2. **Configurable synonyms layer** for:
   - skills (nodejs/react/spring boot variants)
   - experience levels (junior/mid/senior)
   - location aliases (bombay->mumbai, etc.)
3. **Hybrid retrieval**
   - Structured filtering remains the “core” behavior.
   - Optional semantic retrieval (embeddings) adds extra relevant candidates and improves ranking.
4. **Ranking / reranking**
   - Weighted scoring prefers exact skill matches, then synonym/semantic matches, then location/experience, with small boosts for completeness and query token hits.
5. **Observability**
   - Response now also includes `normalizedQuery`.
   - `debug=1` adds a `debug` payload with semantic usage and expansions.

## Files Changed / Added

- `server.js`
  - upgraded `/company/candidates/search-natural` to use hybrid orchestration
  - added `POST /company/candidates/backfill-search-embeddings` (admin-only)
- `src/search/normalize.js`
  - query normalization
- `src/search/synonyms.js`
  - synonym config + expansion helpers
- `src/search/embedding-service.js`
  - OpenAI embeddings call + cosine similarity + hashing
- `src/search/hybrid-search.js`
  - hybrid retrieval + scoring + ranking (additive)
- `scripts/backfill-candidate-embeddings.mjs`
  - CLI script to login + trigger embeddings backfill endpoint
- `test/*`
  - lightweight regression tests (no external test runner dependency)

## How Hybrid Ranking Works (High Level)

Each candidate gets a `_rank.score`:

- Exact skill match: highest weight
- Synonym skill match: high weight
- Semantic similarity (if embeddings exist): high weight (bounded)
- Location: medium weight
- Experience range match: medium weight
- Company match: small weight
- Completeness/token hits: small boosts

Results are returned sorted by `_rank.score` (top 200).

## Extending Synonyms Later

Edit `src/search/synonyms.js`:

- Add skill variants under `DEFAULT_SYNONYMS.skills`
- Add location aliases under `DEFAULT_SYNONYMS.locations`
- Add experience labels under `DEFAULT_SYNONYMS.experienceLevels`

No other code changes are required (the orchestrator consumes this config).

