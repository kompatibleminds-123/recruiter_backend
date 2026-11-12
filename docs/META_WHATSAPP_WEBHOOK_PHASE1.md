# Meta WhatsApp Cloud API webhook — Phase 1

Phase 1 only verifies and stores inbound Meta webhook events. It does not send WhatsApp messages, call OpenAI, update candidates, create contact attempts, or change recruitment statuses.

## Endpoint

Production callback URL:

```text
https://recruiter-backend-yvex.onrender.com/webhooks/meta/whatsapp
```

Routes:

- `GET /webhooks/meta/whatsapp` — Meta verification challenge.
- `POST /webhooks/meta/whatsapp` — signed event receiver for inbound messages and delivery statuses.

The existing `/webhook` and `/whatsapp/notes` routes are separate legacy functionality and are not modified by this integration.

## Required environment variables

Set these only in the Render backend service:

```text
META_WHATSAPP_VERIFY_TOKEN=<a-long-random-value-you-create>
META_APP_SECRET=<Meta App Dashboard > App settings > Basic > App secret>
SUPABASE_URL=<existing-value>
SUPABASE_SERVICE_ROLE_KEY=<existing-value>
```

Do not prefix these variables with `VITE_`, put them in React code, commit them, or paste their values into logs.

`WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` are not required for Phase 1 because the server does not send messages.

## Supabase migration

Run the following file in the Supabase SQL editor before configuring Meta:

```text
sql/2026-11-12-whatsapp-webhook-events.sql
```

The migration creates a new `whatsapp_webhook_events` table. It does not alter existing recruitment tables. RLS is enabled, `anon` and `authenticated` receive no table access, and the backend service role receives only `SELECT` and `INSERT` grants.

The unique `event_key` plus `on_conflict=event_key` prevents repeated Meta deliveries from creating duplicate rows.

## Render deployment

1. Run the Supabase migration.
2. Add `META_WHATSAPP_VERIFY_TOKEN` and `META_APP_SECRET` to the Render backend service environment.
3. Confirm the existing `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` variables are present.
4. Deploy the backend commit to Render.
5. Confirm `GET https://recruiter-backend-yvex.onrender.com/healthz` returns HTTP 200.
6. Do not expose either secret in frontend environment variables.

## Meta configuration

1. Open Meta App Dashboard → WhatsApp → Configuration.
2. Set Callback URL to `https://recruiter-backend-yvex.onrender.com/webhooks/meta/whatsapp`.
3. Enter the same value configured as `META_WHATSAPP_VERIFY_TOKEN` in Render.
4. Select **Verify and save**.
5. Subscribe the WhatsApp Business Account webhook to the `messages` field. Inbound messages and message delivery/read/failed statuses arrive through that field.

## Security and response behavior

- GET verification compares the configured verification token and returns the raw `hub.challenge` only on a match.
- POST requests require `X-Hub-Signature-256`, verified as HMAC-SHA256 over the exact request bytes using `META_APP_SECRET`.
- Invalid signatures are rejected before JSON parsing or database access.
- Valid events are inserted in one Supabase request and acknowledged after persistence.
- Database failures return a server error so Meta can retry the delivery.
- Payloads and secrets are not logged.
