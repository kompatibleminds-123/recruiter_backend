const crypto = require("crypto");

function cfg() {
  const url = String(process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return { on: Boolean(url && key), url, key };
}

function enc(v) {
  return encodeURIComponent(String(v || "").trim());
}

function looksLikeHtml(text) {
  const raw = String(text || "").toLowerCase();
  return raw.includes("<!doctype") || raw.includes("<html") || raw.includes("<head") || raw.includes("<body");
}

function sanitizeSupabaseErrorText(text, status) {
  const raw = String(text || "").trim();
  if (!raw) return status ? `HTTP ${status}` : "Request failed.";
  if (looksLikeHtml(raw)) {
    if (status === 502) return "Temporary gateway error (502) from Supabase. Please retry.";
    if (status === 503) return "Supabase is temporarily unavailable (503). Please retry.";
    if (status === 504) return "Supabase gateway timed out (504). Please retry.";
    return status ? `Supabase returned HTTP ${status}. Please retry.` : "Supabase request failed. Please retry.";
  }
  return raw.length > 500 ? `${raw.slice(0, 500)}...` : raw;
}

async function sb(method, rel, body = null, headers = {}) {
  const { on, url, key } = cfg();
  if (!on) throw new Error("Supabase is not configured.");
  const res = await fetch(`${url}${rel}`, {
    method,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...headers },
    body
  });
  if (res.ok) {
    if (method === "HEAD" || res.status === 204) return null;
    const ct = String(res.headers.get("content-type") || "");
    return ct.includes("application/json") ? res.json() : res.text();
  }
  const errorText = await res.text();
  throw new Error(`Supabase auth failed: ${res.status} ${sanitizeSupabaseErrorText(errorText, res.status)}`);
}

const sbSel = (t, q) => sb("GET", `/rest/v1/${t}?${q}`);
const sbIns = (t, rows, { conflict = "", upsert = false, returning = "minimal" } = {}) => {
  const q = conflict ? `?on_conflict=${encodeURIComponent(conflict)}` : "";
  const prefer = [`return=${returning}`];
  if (upsert) prefer.unshift("resolution=merge-duplicates");
  return sb("POST", `/rest/v1/${t}${q}`, JSON.stringify(rows), { "Content-Type": "application/json", Prefer: prefer.join(",") });
};

function hashText(value = "") {
  const raw = String(value || "");
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

async function upsertCandidateSearchDocV1({
  companyId,
  candidateId,
  docV1,
  cvTextFull = "",
  cvTextHash = ""
} = {}) {
  const safeCompanyId = String(companyId || "").trim();
  const safeCandidateId = String(candidateId || "").trim();
  if (!safeCompanyId || !safeCandidateId) return { ok: false, skipped: true };

  const now = new Date().toISOString();
  const safeDoc = String(docV1 || "").trim();
  const safeCv = String(cvTextFull || "").trim();
  const computedHash = safeCv ? (String(cvTextHash || "").trim() || hashText(safeCv)) : String(cvTextHash || "").trim();

  const row = {
    candidate_id: safeCandidateId,
    company_id: safeCompanyId,
    doc_v1: safeDoc,
    doc_updated_at: safeDoc ? now : null,
    cv_text_full: safeCv || null,
    cv_text_hash: computedHash || null,
    cv_text_updated_at: safeCv ? now : null,
    updated_at: now
  };

  await sbIns("candidate_search_docs", [row], { conflict: "candidate_id", upsert: true, returning: "minimal" });
  return { ok: true };
}

async function listCandidateSearchDocsForCompany(companyId) {
  const safeCompanyId = String(companyId || "").trim();
  if (!safeCompanyId) return [];
  // Keep limit high enough; table is only populated for some candidates unless you choose to backfill.
  return sbSel(
    "candidate_search_docs",
    `select=candidate_id,doc_v1,cv_text_full,cv_text_hash,doc_updated_at,cv_text_updated_at&company_id=eq.${enc(safeCompanyId)}&limit=10000`
  ).catch(() => []);
}

async function insertAssessmentEvent({
  companyId,
  assessmentId,
  candidateId = "",
  recruiterId = "",
  recruiterName = "",
  clientName = "",
  jdTitle = "",
  eventType,
  status = "",
  eventAt = null,
  payload = {}
} = {}) {
  const safeCompanyId = String(companyId || "").trim();
  const safeAssessmentId = String(assessmentId || "").trim();
  const safeEventType = String(eventType || "").trim();
  if (!safeCompanyId || !safeAssessmentId || !safeEventType) return { ok: false, skipped: true };
  const row = {
    company_id: safeCompanyId,
    assessment_id: safeAssessmentId,
    candidate_id: String(candidateId || "").trim() || null,
    recruiter_id: String(recruiterId || "").trim() || null,
    recruiter_name: String(recruiterName || "").trim() || null,
    client_name: String(clientName || "").trim() || null,
    jd_title: String(jdTitle || "").trim() || null,
    event_type: safeEventType,
    status: String(status || "").trim() || null,
    event_at: eventAt ? new Date(eventAt).toISOString() : null,
    payload: payload && typeof payload === "object" ? payload : {}
  };
  await sbIns("assessment_events", [row], { conflict: "", upsert: false, returning: "minimal" });
  return { ok: true };
}

module.exports = {
  upsertCandidateSearchDocV1,
  listCandidateSearchDocsForCompany,
  insertAssessmentEvent,
  hashText
};

