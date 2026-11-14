const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  buildJobShareMessage,
  buildConfirmedCandidatePatch,
  buildScreeningTemplatePayload,
  extractMetaStatusError,
  formatConfirmation,
  listCandidateScreenings,
  normalizeWhatsAppPhone,
  parseCombinedScreeningAnswers,
  parseInterest,
  parseYesNo
} = require("../src/whatsapp-screening");

async function run() {
  assert.equal(normalizeWhatsAppPhone("98765 43210"), "919876543210");
  assert.equal(normalizeWhatsAppPhone("+44 7700 900123"), "447700900123");
  assert.equal(normalizeWhatsAppPhone("123"), "");

  assert.equal(parseInterest("Interested"), "interested");
  assert.equal(parseInterest("Please share the JD"), "share_jd");
  assert.equal(parseInterest("Not interested"), "not_interested");
  assert.equal(parseInterest("STOP"), "opt_out");
  assert.equal(parseYesNo("haan"), true);
  assert.equal(parseYesNo("nahi"), false);
  assert.equal(parseYesNo("", "ws:session:call_yes"), true);
  assert.equal(parseYesNo("", "ws:session:call_no"), false);
  assert.equal(
    extractMetaStatusError({ payload: { status: { errors: [{ code: 131026, title: "Message undeliverable", error_data: { details: "Recipient is unavailable." } }] } } }),
    "Meta error 131026: Message undeliverable: Recipient is unavailable."
  );

  assert.deepEqual(
    parseCombinedScreeningAnswers("Current CTC: 12 LPA, Expected CTC: 16 LPA; Notice period: 30 days"),
    { current_ctc: "12 LPA", expected_ctc: "16 LPA", notice_period: "30 days" }
  );

  const requestedUrls = [];
  await listCandidateScreenings("candidate-1", "company-1", {
    jobId: "job-1",
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "test-service-key",
    fetchImpl: async (url) => {
      requestedUrls.push(String(url));
      return { ok: true, status: 200, text: async () => "[]" };
    }
  });
  assert.ok(requestedUrls.some((url) => url.includes("candidate_id=eq.candidate-1") && url.includes("assigned_jd_id=eq.job-1")));

  const anonymousJd = buildJobShareMessage({
    client_visibility: "anonymous",
    assigned_jd_title: "Backend Engineer",
    job_snapshot: {
      title: "Backend Engineer - Secret Client",
      publicPostingTitle: "Backend Engineer",
      publicCompanyLine: "A leading AI infrastructure company",
      clientName: "Secret Client",
      jobDescription: "<strong>Secret Client</strong><br><ul><li>Node.js</li><li>PostgreSQL</li></ul>",
      publicApplyLink: "https://example.com/apply-public/job-1"
    }
  });
  assert.ok(!anonymousJd.includes("Secret Client"));
  assert.ok(anonymousJd.includes("*Company:* A leading AI infrastructure company"));
  assert.ok(anonymousJd.includes("• Node.js"));
  assert.ok(!anonymousJd.includes("<strong>"));
  assert.ok(anonymousJd.includes("https://example.com/apply-public/job-1"));
  assert.ok(formatConfirmation({ current_ctc: "12 LPA", expected_ctc: "16 LPA", notice_period: "30 days", recruiter_call_requested: true, preferred_call_time: "Tomorrow after 4 PM" }).includes("Preferred call time: Tomorrow after 4 PM"));

  assert.deepEqual(
    buildConfirmedCandidatePatch(
      { current_ctc: "10 LPA", expected_ctc: "14 LPA", notice_period: "60 days" },
      { current_ctc: "12 LPA", expected_ctc: "16 LPA", notice_period: "30 days" }
    ),
    {
      patch: { current_ctc: "12 LPA", expected_ctc: "16 LPA", notice_period: "30 days" },
      replacedValues: {
        current_ctc: { existing: "10 LPA", confirmed: "12 LPA", resolution: "candidate_confirmed_overwrite" },
        expected_ctc: { existing: "14 LPA", confirmed: "16 LPA", resolution: "candidate_confirmed_overwrite" },
        notice_period: { existing: "60 days", confirmed: "30 days", resolution: "candidate_confirmed_overwrite" }
      }
    }
  );

  const templatePayload = buildScreeningTemplatePayload({
    id: "screening-session-1",
    candidate_wa_id: "919876543210",
    client_visibility: "anonymous",
    assigned_jd_title: "Senior Backend Engineer",
    job_snapshot: {
      title: "Senior Backend Engineer - Secret Client",
      publicPostingTitle: "Senior Backend Engineer",
      clientName: "Secret Client"
    }
  }, { name: "Asha Sharma" });
  assert.equal(templatePayload.template.name, "km_job_opportunity_screening");
  assert.equal(templatePayload.template.language.code, "en");
  assert.equal(templatePayload.template.components.some((component) => component.type === "header"), false);
  assert.deepEqual(templatePayload.template.components[0], {
    type: "body",
    parameters: [
      { type: "text", parameter_name: "candidate_name", text: "Asha" },
      { type: "text", parameter_name: "job_title", text: "Senior Backend Engineer" }
    ]
  });
  assert.deepEqual(
    templatePayload.template.components.slice(1).map((component) => ({ index: component.index, payload: component.parameters[0].payload })),
    [
      { index: "0", payload: "ws:screening-session-1:interested" },
      { index: "1", payload: "ws:screening-session-1:share_jd" },
      { index: "2", payload: "ws:screening-session-1:not_interested" }
    ]
  );

  const legacyLanguagePayload = buildScreeningTemplatePayload({
    id: "screening-session-2",
    candidate_wa_id: "919876543210",
    client_visibility: "named",
    assigned_jd_title: "Senior Backend Engineer",
    job_snapshot: { title: "Senior Backend Engineer" }
  }, { name: "Asha Sharma" }, { templateLanguage: "en_US" });
  assert.equal(legacyLanguagePayload.template.language.code, "en");

  const migration = fs.readFileSync(path.join(__dirname, "..", "sql", "2026-11-13-whatsapp-screening-automation.sql"), "utf8");
  assert.match(migration, /create table if not exists public\.whatsapp_screening_sessions/i);
  assert.match(migration, /create unique index if not exists whatsapp_screening_one_interactive_session_idx/i);
  assert.match(migration, /create trigger whatsapp_screening_session_tenant_guard/i);
  assert.match(migration, /create or replace function public\.claim_whatsapp_screening_event/i);
  assert.match(migration, /assigned_jd_id uuid references public\.company_jobs\(id\) on delete set null/i);
  assert.match(migration, /revoke all on table public\.whatsapp_screening_messages from anon, authenticated/i);
  assert.match(migration, /grant select, insert, update on table public\.whatsapp_screening_sessions to service_role/i);
  const callTimeMigration = fs.readFileSync(path.join(__dirname, "..", "sql", "2026-11-14-whatsapp-screening-call-time-state.sql"), "utf8");
  assert.match(callTimeMigration, /awaiting_call_time/i);
}

if (require.main === module) {
  run().then(() => {
    process.stdout.write("whatsapp-screening.spec passed\n");
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { run };
