const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  buildInterviewReminderTemplatePayload,
  buildInterviewConfirmationFollowUp,
  formatInterviewDate,
  formatInterviewTime,
  reminderConfig,
  reminderScheduleForInterview,
  sendInterviewReminderNow
} = require("../src/whatsapp-interview-reminders");

function run() {
  const afterTen = reminderScheduleForInterview("2026-11-15T16:30:00+05:30");
  assert.equal(afterTen.interviewAt, "2026-11-15T11:00:00.000Z");
  assert.equal(afterTen.scheduledSendAt, "2026-11-15T04:30:00.000Z");
  assert.equal(afterTen.interviewAfterTen, true);
  assert.equal(reminderScheduleForInterview("2026-11-15T10:00:00+05:30").interviewAfterTen, false);
  assert.equal(formatInterviewDate(afterTen.interviewAt), "15th Nov");
  assert.equal(formatInterviewTime(afterTen.interviewAt), "4:30 PM");

  const payload = buildInterviewReminderTemplatePayload({
    id: "4f7596f2-bcb5-4acf-a6e6-bbc7e0562225",
    candidate_wa_id: "919876543210",
    candidate_name: "Rahul",
    job_title: "Senior SAP Consultant",
    company_name: "Attentive.ai",
    interview_at: afterTen.interviewAt,
    template_name: "km_interview_reminder",
    template_language: "en"
  });
  assert.equal(payload.template.name, "km_interview_reminder");
  assert.equal(payload.template.language.code, "en");
  assert.equal(payload.template.components.some((component) => component.type === "header"), false);
  assert.deepEqual(payload.template.components[0].parameters, [
    { type: "text", parameter_name: "candidate_name", text: "Rahul" },
    { type: "text", parameter_name: "job_title", text: "Senior SAP Consultant" },
    { type: "text", parameter_name: "company_name", text: "Attentive.ai" },
    { type: "text", parameter_name: "interview_date", text: "15th Nov" },
    { type: "text", parameter_name: "interview_time", text: "4:30 PM" }
  ]);
  assert.equal(payload.template.components[1].parameters[0].payload, "wi:4f7596f2-bcb5-4acf-a6e6-bbc7e0562225:confirm");
  assert.equal(reminderConfig({ templateLanguage: "en_US" }).templateLanguage, "en");
  assert.equal(typeof sendInterviewReminderNow, "function");
  assert.equal(
    buildInterviewConfirmationFollowUp(
      { company_name: "ARISE IIP" },
      { aboutCompany: "<p>Global industrial ecosystem developer &amp; operator.</p>" }
    ),
    "Thank you for confirming your interview.\n\nBest of luck!\n\nYou can read more about ARISE IIP:\nGlobal industrial ecosystem developer & operator."
  );

  const migration = fs.readFileSync(path.join(__dirname, "..", "sql", "2026-11-13-whatsapp-interview-reminders.sql"), "utf8");
  assert.match(migration, /create table if not exists public\.whatsapp_interview_reminders/i);
  assert.match(migration, /create table if not exists public\.whatsapp_interview_reminder_messages/i);
  assert.match(migration, /unique \(assessment_id, interview_at\)/i);
  assert.match(migration, /create or replace function public\.claim_due_whatsapp_interview_reminders/i);
  assert.match(migration, /create or replace function public\.claim_whatsapp_interview_reminder_event/i);
  assert.match(migration, /for update skip locked/i);
  assert.match(migration, /attempt_count integer not null default 1/i);
  assert.match(migration, /candidate must match the assessment candidate/i);
  assert.match(migration, /revoke all on table public\.whatsapp_interview_reminders from anon, authenticated/i);
}

if (require.main === module) {
  try {
    run();
    process.stdout.write("whatsapp-interview-reminders.spec passed\n");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = { run };
