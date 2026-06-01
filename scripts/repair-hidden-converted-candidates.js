/* eslint-disable no-console */

function cfg() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { on: Boolean(url && key), url, key };
}

function enc(value) {
  return encodeURIComponent(String(value || "").trim());
}

function getArg(name, fallback = "") {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  const ix = process.argv.findIndex((arg) => arg === exact);
  if (ix >= 0 && process.argv[ix + 1]) return process.argv[ix + 1];
  const inline = process.argv.find((arg) => String(arg || "").startsWith(prefix));
  return inline ? inline.slice(prefix.length) : fallback;
}

async function sb(method, rel, body = null, headers = {}) {
  const { on, url, key } = cfg();
  if (!on) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  const response = await fetch(`${url}${rel}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...headers
    },
    body
  });
  if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${await response.text()}`);
  if (method === "HEAD" || response.status === 204) return null;
  return String(response.headers.get("content-type") || "").includes("application/json") ? response.json() : response.text();
}

const sbSelect = (table, query) => sb("GET", `/rest/v1/${table}?${query}`);
const sbPatch = (table, filter, patch) => sb(
  "PATCH",
  `/rest/v1/${table}?${filter}`,
  JSON.stringify(patch),
  { "Content-Type": "application/json", Prefer: "return=representation" }
);

function parseTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function assessmentCreatedTime(assessment = {}) {
  const payload = assessment?.payload && typeof assessment.payload === "object" ? assessment.payload : {};
  return parseTime(
    assessment?.created_at ||
    assessment?.generated_at ||
    payload?.generatedAt ||
    payload?.createdAt ||
    payload?.created_at
  );
}

function classifyOverlap(candidate, assessment, windowMs) {
  const candidateId = String(candidate?.id || "").trim();
  const assessmentId = String(candidate?.assessment_id || "").trim();
  if (!assessmentId || !assessment) {
    return { action: "unlink", reason: "assessment link missing or assessment row not found" };
  }

  const linkedCandidateId = String(
    assessment?.candidate_id ||
    assessment?.payload?.candidateId ||
    assessment?.payload?.candidate_id ||
    ""
  ).trim();
  if (linkedCandidateId && linkedCandidateId !== candidateId) {
    return { action: "unlink", reason: "assessment points to a different candidate" };
  }

  const candidateUpdatedAt = parseTime(candidate?.updated_at || candidate?.created_at);
  const assessmentCreatedAt = assessmentCreatedTime(assessment);
  if (!candidateUpdatedAt || !assessmentCreatedAt) {
    return { action: "manual", reason: "missing timestamps for safe sequence inference" };
  }

  const deltaMs = candidateUpdatedAt - assessmentCreatedAt;
  if (deltaMs > windowMs) {
    return { action: "unlink", reason: `candidate was updated ${Math.round(deltaMs / 60000)} min after assessment creation` };
  }
  return { action: "unhide", reason: "candidate update is within conversion window" };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const companyId = String(getArg("company-id", "")).trim();
  const limit = Math.max(1, Number(getArg("limit", "500")) || 500);
  const conversionWindowMinutes = Math.max(0, Number(getArg("conversion-window-minutes", "10")) || 10);
  const windowMs = conversionWindowMinutes * 60 * 1000;

  const filters = [
    "select=id,company_id,name,email,phone,hidden_from_captured,used_in_assessment,assessment_id,created_at,updated_at",
    "hidden_from_captured=is.true",
    "or=(used_in_assessment.is.true,assessment_id.not.is.null)",
    "order=updated_at.desc",
    `limit=${limit}`
  ];
  if (companyId) filters.push(`company_id=eq.${enc(companyId)}`);

  const candidates = await sbSelect("candidates", filters.join("&"));
  const assessmentIds = Array.from(new Set((candidates || []).map((item) => String(item?.assessment_id || "").trim()).filter(Boolean)));
  const assessmentsById = new Map();

  for (let i = 0; i < assessmentIds.length; i += 100) {
    const ids = assessmentIds.slice(i, i + 100);
    const query = [
      "select=id,company_id,candidate_id,created_at,updated_at,generated_at,payload",
      `id=in.(${ids.map(enc).join(",")})`,
      `limit=${ids.length}`
    ];
    if (companyId) query.push(`company_id=eq.${enc(companyId)}`);
    const rows = await sbSelect("assessments", query.join("&")).catch(() => []);
    for (const row of rows || []) assessmentsById.set(String(row?.id || "").trim(), row);
  }

  const summary = { total: 0, unlink: 0, unhide: 0, manual: 0, applied: 0 };
  for (const candidate of candidates || []) {
    summary.total += 1;
    const candidateId = String(candidate?.id || "").trim();
    const assessmentId = String(candidate?.assessment_id || "").trim();
    const assessment = assessmentsById.get(assessmentId) || null;
    const decision = classifyOverlap(candidate, assessment, windowMs);
    summary[decision.action] += 1;
    console.log([
      `- ${decision.action.toUpperCase()}`,
      `candidate=${candidateId}`,
      `assessment=${assessmentId || "-"}`,
      `name=${String(candidate?.name || "").trim() || "-"}`,
      `reason=${decision.reason}`
    ].join(" | "));

    if (!apply || decision.action === "manual") continue;
    if (decision.action === "unlink") {
      await sbPatch(
        "candidates",
        `id=eq.${enc(candidateId)}&company_id=eq.${enc(candidate.company_id)}`,
        { used_in_assessment: false, assessment_id: "", updated_at: new Date().toISOString() }
      );
      summary.applied += 1;
    } else if (decision.action === "unhide") {
      await sbPatch(
        "candidates",
        `id=eq.${enc(candidateId)}&company_id=eq.${enc(candidate.company_id)}`,
        { hidden_from_captured: false, updated_at: new Date().toISOString() }
      );
      summary.applied += 1;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!apply) console.log("Dry-run only. Re-run with --apply after reviewing the actions.");
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
