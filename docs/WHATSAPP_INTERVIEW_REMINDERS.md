# WhatsApp Interview Reminders

This backend feature schedules one WhatsApp reminder at 10:00 AM Asia/Kolkata on the interview date. It uses the existing Meta webhook and does not add a general WhatsApp inbox.

## Meta template

- Name: `km_interview_reminder`
- Language: `en_US`
- Static header: `Interview Reminder`
- Named body variables: `candidate_name`, `job_title`, `company_name`, `interview_date`, `interview_time`
- Quick reply button: `Confirm`

The header is static in Meta, so the API payload sends only the named body variables and quick-reply payload.

## Required environment variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `META_WHATSAPP_ACCESS_TOKEN`
- `META_WHATSAPP_PHONE_NUMBER_ID`
- `META_APP_SECRET`
- `META_WHATSAPP_INTERVIEW_REMINDER_TEMPLATE_NAME=km_interview_reminder`
- `META_WHATSAPP_INTERVIEW_REMINDER_TEMPLATE_LANGUAGE=en`
- `WHATSAPP_REMINDER_CRON_SECRET` — generate a long random value and do not expose it in frontend code.

Optional:

- `WHATSAPP_INTERVIEW_REMINDER_SEND_WINDOW_MINUTES=15`

## Deployment order

1. Wait until the Meta template is approved.
2. Run `sql/2026-11-13-whatsapp-interview-reminders.sql` once in Supabase.
3. Add the required environment variables in Render.
4. Deploy the backend.
5. Confirm the authenticated reminder APIs work before enabling the scheduler.
6. Create the cron-job.org job only after the template is approved and the migration is live.

## cron-job.org

- URL: `https://recruiter-backend-yvex.onrender.com/internal/whatsapp/interview-reminders/tick`
- Method: `POST`
- Schedule: every day at `10:00`
- Time zone: `Asia/Kolkata`
- Header: `Authorization: Bearer <WHATSAPP_REMINDER_CRON_SECRET>`

The endpoint returns aggregate counts only. It does not return candidate data.

## Safety behavior

- Reminders are linked to one company, assessment and candidate.
- Database triggers reject cross-company links and candidate/assessment mismatches.
- Concurrent cron calls claim rows with `FOR UPDATE SKIP LOCKED`.
- Webhook events are idempotent and failed/stale event claims can be retried safely.
- The same assessment and interview time cannot create two reminder rows.
- A reminder that already has a sent Meta message is not sent again.
- Interviews at or before 10:00 AM IST are skipped.
- Missed send windows are marked skipped instead of being sent late.
