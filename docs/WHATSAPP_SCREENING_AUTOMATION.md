# WhatsApp candidate screening automation

This feature extends the existing signed Meta webhook at `/webhooks/meta/whatsapp`. It does not replace the legacy `/webhook` recruiter-note workflow and does not create a general WhatsApp inbox.

## Database migration

Run this migration in Supabase before deploying the application code:

`sql/2026-11-13-whatsapp-screening-automation.sql`

The migration creates service-role-only tables for consent evidence, screening sessions, session messages, and webhook processing claims. Candidate and job records remain in their existing tables.

## Required backend environment variables

- `META_WHATSAPP_VERIFY_TOKEN` — existing webhook verification token.
- `META_APP_SECRET` — existing webhook signature secret.
- `META_WHATSAPP_ACCESS_TOKEN` — permanent system-user token used only by the backend. The existing `WHATSAPP_ACCESS_TOKEN` is accepted as a compatibility fallback.
- `META_WHATSAPP_PHONE_NUMBER_ID` — sender phone-number ID. The existing `WHATSAPP_PHONE_NUMBER_ID` is accepted as a compatibility fallback.
- `META_WHATSAPP_SCREENING_TEMPLATE_NAME` — approved opportunity template name. Defaults to `km_job_opportunity_screening`.
- `META_WHATSAPP_SCREENING_TEMPLATE_LANGUAGE` — approved template language code. Use `en` for the approved English translation. Legacy `en_US` is normalized to `en` for `km_job_opportunity_screening`.
- `META_WHATSAPP_GRAPH_VERSION` — optional Graph API version. Defaults to `v22.0`.
- `WHATSAPP_SCREENING_RETENTION_DAYS` — optional chat/raw-event retention period, from 30 to 730 days. Defaults to `180`.

Never add these values to the React build or expose them through portal endpoints.

## Meta template contract

Create and approve the `km_job_opportunity_screening` marketing template in `en` with:

- No header component.
- Named body variable `{{candidate_name}}`: candidate first name.
- Named body variable `{{job_title}}`: candidate-facing job title.
- Quick-reply button index `0`: `Interested`.
- Quick-reply button index `1`: `Share JD`.
- Quick-reply button index `2`: `Not Interested`.

The template should identify Kompatible Minds, explain why the candidate is receiving the message, and include an opt-out instruction. Meta determines the final template category and approval status.

## Portal workflow

1. Assign an existing candidate to a JD.
2. Open Captured Notes and choose **WhatsApp screening**.
3. Record the opt-in source/evidence and choose named or anonymous client visibility.
4. Send the approved template.
5. Use the same popup to view session-specific messages, pause/resume automation, or send a manual reply during the open 24-hour service window.

The system never creates a candidate from an inbound WhatsApp message. A plain inbound reply is processed only when exactly one active session matches the Meta sender number and business phone-number ID.

Expired chat messages, raw webhook events and processing claims are purged opportunistically when screening history is accessed. The non-message session outcome remains for audit, while candidate/job snapshots and answer payloads are cleared after the configured retention period.

## Confirmed field updates

The deterministic state machine collects current CTC, expected CTC, notice period, and recruiter-call preference. It asks the candidate to confirm the summary before writing anything.

- Blank answers never overwrite candidate data.
- A confirmed value updates the corresponding candidate field so Captured Notes and later drafts use the latest candidate-provided information.
- When a confirmed value replaces an existing value, the previous and confirmed values remain in the screening session audit data.
- Interest history uses the existing `contact_attempts` flow.
- Recruiter identity and candidate/JD assignments are never changed by screening automation.

## Anonymous JD sharing

Anonymous mode uses the public posting title and `Public company line (anonymous apply link)` when present, and removes the known client name from the title and job-description text before sending. Named mode displays the actual client name. JD HTML is converted to compact WhatsApp text and includes the public apply link. Recruiters should still review job descriptions for indirect client-identifying information before using anonymous mode.

## Interactive screening flow

- After **Share JD**, the candidate receives **Interested** and **Not Interested** buttons.
- Current CTC, expected CTC and notice period accept free-form answers.
- Recruiter-call preference uses **Yes** and **No** buttons.
- A **Yes** response asks for **Today**, **Tomorrow**, or **Choose date/time**. Custom time remains free text and is not silently converted into a calendar appointment.
- Final review uses **Confirm** and **Edit** buttons. Edit restarts from Current CTC while preserving the original values for the recruiter-note audit.
- A confirmed call request and preferred time are saved in screening answers and displayed in the Captured Notes follow-up indicator.

The `2026-11-14-whatsapp-screening-call-time-state.sql` follow-up migration extends the active-session uniqueness guard to the preferred-call-time step. Run it once after the original screening migration.

## Deployment order

1. Run the Supabase migration.
2. Create/approve the Meta template with the exact component contract above.
3. Add the backend environment variables in Render.
4. Deploy the backend/portal build.
5. Test with an opted-in internal number and a non-production candidate record.
6. Verify template delivery, each reply branch, field confirmation, conflict review, duplicate webhook delivery, manual takeover, tenant access, and opt-out.

Do not test by sending opportunity messages to candidates who have not opted in.
