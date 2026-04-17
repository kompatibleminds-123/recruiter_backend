/* eslint-disable no-console */

const { parseExperienceTimelineTextToStructured } = require("../src/timeline-utils");

function cfg() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { on: Boolean(url && key), url, key };
}

function enc(v) { return encodeURIComponent(String(v || "").trim()); }

async function sb(method, rel, body = null, headers = {}) {
  const { on, url, key } = cfg();
  if (!on) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  const res = await fetch(`${url}${rel}`, { method, headers: { apikey: key, Authorization: `Bearer ${key}`, ...headers }, body });
  if (!res.ok) throw new Error(`Supabase request failed: ${res.status} ${await res.text()}`);
  if (method === "HEAD" || res.status === 204) return null;
  return String(res.headers.get("content-type") || "").includes("application/json") ? res.json() : res.text();
}

const sbSel = (t, q) => sb("GET", `/rest/v1/${t}?${q}`);
const sbPatch = (t, f, p) => sb("PATCH", `/rest/v1/${t}?${f}`, JSON.stringify(p), { "Content-Type": "application/json", Prefer: "return=representation" });

function hasTimelineJson(row) {
  const value = row?.experience_timeline_json;
  return Array.isArray(value) && value.length > 0;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = Math.max(1, Number(limitArg ? limitArg.split("=")[1] : 200) || 200);

  const rows = await sbSel(
    "assessments",
    `select=id,company_id,experience_timeline,experience_timeline_json,payload,updated_at&order=updated_at.desc&limit=${enc(limit)}`
  );

  const candidates = (rows || []).filter((row) => {
    const timelineText = String(row?.experience_timeline || "").trim();
    return timelineText && !hasTimelineJson(row);
  });

  console.log(`Loaded ${rows.length} assessments, ${candidates.length} missing experience_timeline_json.`);
  if (!candidates.length) return;

  let patchedCount = 0;
  for (const row of candidates) {
    const timelineText = String(row?.experience_timeline || "").trim();
    const structured = parseExperienceTimelineTextToStructured(timelineText);
    if (!structured.length) continue;

    const id = String(row?.id || "").trim();
    const companyId = String(row?.company_id || "").trim();
    if (!id || !companyId) continue;

    console.log(`- ${id}: ${structured.length} row(s)`);
    if (!apply) continue;

    const payload = row?.payload && typeof row.payload === "object" ? { ...row.payload } : {};
    payload.experienceTimelineJson = structured;

    await sbPatch(
      "assessments",
      `id=eq.${enc(id)}&company_id=eq.${enc(companyId)}`,
      { experience_timeline_json: structured, payload, updated_at: new Date().toISOString() }
    );
    patchedCount += 1;
  }

  console.log(apply ? `Done. Patched ${patchedCount} assessment(s).` : "Dry-run only. Re-run with --apply to persist changes.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

