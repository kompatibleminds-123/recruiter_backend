# Marketing Module MVP Spec

## 1) Module Boundary
- Route: `/marketing-module`
- Product boundary: logically isolated from recruitment workflows.
- Access: company users with module permission.
- Data namespace: separate tables prefixed with `marketing_`.

## 2) MVP Scope (Locked)

### Prospect ingestion
1. Excel upload (`.xlsx`, `.csv`)
2. Manual add (single prospect form)
3. Google Sheet sync pull (poll every few minutes)

Minimum prospect fields:
- `name` (required)
- `email` (required)
- `phone_number` (optional)
- `company_name` (optional)
- `designation` (optional)
- `tags` (optional)
- `source` (`excel_upload` | `manual` | `google_sheet`)

### Campaigns
- Multiple campaigns per company.
- Example categories: Banking, Recruitdesk AI, Tech HR.
- Prospect-to-campaign mapping (many-to-many).

### Templates
- Campaign-level email template.
- Variables:
  - `{{name}}`
  - `{{company}}`
  - `{{designation}}`

### Sending engine
- Zoho API integration (reuse existing email credentials flow style).
- Queue-based drip sending:
  - exactly 1 email every 5 minutes per sender mailbox.
- Daily sender cap:
  - default 50/day
  - configurable up to 100/day

### Safety
- Unsubscribe link required.
- Bounce/suppression list.
- Stop sending to a prospect if replied.

### Tracking
- Sent
- Delivered
- Bounced
- Replied
- Campaign-level dashboard

## 3) Data Model (Supabase/Postgres)

### `marketing_prospects`
- `id uuid pk`
- `company_id uuid not null`
- `name text not null`
- `email text not null`
- `phone_number text`
- `company_name text`
- `designation text`
- `tags text[] default '{}'`
- `source text not null`
- `external_ref text` (google-sheet row id optional)
- `status text default 'active'` (`active|suppressed|unsubscribed`)
- `created_by text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`
- Unique: `(company_id, lower(email))`

### `marketing_campaigns`
- `id uuid pk`
- `company_id uuid not null`
- `name text not null`
- `category text`
- `description text`
- `sender_email text not null`
- `daily_cap int default 50`
- `interval_minutes int default 5`
- `status text default 'draft'` (`draft|active|paused|completed`)
- `created_by text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `marketing_templates`
- `id uuid pk`
- `company_id uuid not null`
- `campaign_id uuid not null`
- `name text not null`
- `subject text not null`
- `body_html text not null`
- `body_text text`
- `is_default boolean default true`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `marketing_campaign_prospects`
- `id uuid pk`
- `company_id uuid not null`
- `campaign_id uuid not null`
- `prospect_id uuid not null`
- `state text default 'pending'` (`pending|scheduled|sent|delivered|bounced|replied|unsubscribed|suppressed|failed`)
- `next_run_at timestamptz`
- `last_event_at timestamptz`
- `last_error text`
- Unique: `(campaign_id, prospect_id)`

### `marketing_send_queue`
- `id uuid pk`
- `company_id uuid not null`
- `campaign_id uuid not null`
- `prospect_id uuid not null`
- `template_id uuid not null`
- `sender_email text not null`
- `scheduled_at timestamptz not null`
- `attempt_count int default 0`
- `status text default 'queued'` (`queued|sending|sent|failed|skipped`)
- `provider_message_id text`
- `error_message text`
- `created_at timestamptz default now()`
- `updated_at timestamptz default now()`

### `marketing_message_events`
- `id uuid pk`
- `company_id uuid not null`
- `campaign_id uuid not null`
- `prospect_id uuid not null`
- `queue_id uuid`
- `event_type text not null` (`sent|delivered|bounced|replied|failed|unsubscribed`)
- `provider_message_id text`
- `payload jsonb`
- `event_at timestamptz default now()`

### `marketing_suppression_list`
- `id uuid pk`
- `company_id uuid not null`
- `email text not null`
- `reason text not null` (`bounce|unsubscribe|manual|complaint`)
- `source text`
- `created_at timestamptz default now()`
- Unique: `(company_id, lower(email))`

### `marketing_google_sheet_connections`
- `id uuid pk`
- `company_id uuid not null`
- `sheet_id text not null`
- `worksheet_name text`
- `column_mapping jsonb not null`
- `last_synced_at timestamptz`
- `status text default 'active'`
- `created_at timestamptz default now()`
- Unique: `(company_id, sheet_id, coalesce(worksheet_name,''))`

## 4) API Surface (MVP)

### Prospects
- `POST /marketing/prospects/import` (excel/csv)
- `POST /marketing/prospects` (manual create)
- `GET /marketing/prospects`
- `PATCH /marketing/prospects/:id`
- `POST /marketing/prospects/:id/suppress`

### Google Sheet sync
- `POST /marketing/google-sheet/connect`
- `POST /marketing/google-sheet/sync`
- `GET /marketing/google-sheet/status`

### Campaigns & Templates
- `POST /marketing/campaigns`
- `GET /marketing/campaigns`
- `PATCH /marketing/campaigns/:id`
- `POST /marketing/campaigns/:id/prospects`
- `POST /marketing/campaigns/:id/template`
- `GET /marketing/campaigns/:id/template`

### Sending
- `POST /marketing/campaigns/:id/start`
- `POST /marketing/campaigns/:id/pause`
- `POST /marketing/campaigns/:id/resume`
- `POST /marketing/worker/tick` (scheduler trigger endpoint)

### Events
- `POST /marketing/webhooks/zoho` (delivery/bounce/reply if available)
- `GET /marketing/campaigns/:id/metrics`

## 5) Send Scheduler Rules

1. Worker pulls eligible queue rows:
- `status='queued'`
- `scheduled_at <= now()`

2. Before send:
- skip if email in suppression list
- skip if campaign-prospect already `replied|unsubscribed|suppressed`
- skip if sender hit daily cap

3. Send:
- use Zoho API
- on success:
  - queue `status='sent'`
  - write message event `sent`
  - campaign prospect `state='sent'`

4. Spacing:
- next email for same sender scheduled at `last_send_at + 5 minutes`

5. Daily cap:
- per sender per company, reset by date boundary (local timezone configurable, default IST)

## 6) UI Screens

1. `Prospects`
- upload excel/csv
- manual add form
- list with filters (status/source/tag/campaign)

2. `Campaigns`
- create campaign
- assign prospects
- attach template
- start/pause/resume

3. `Templates`
- subject/body editor
- variable insert helper
- preview for sample prospect

4. `Dashboard`
- per campaign cards:
  - queued
  - sent
  - delivered
  - bounced
  - replied
- sender cap usage today

## 7) Compliance & Safety
- Mandatory unsubscribe tokenized URL in every email.
- Unsubscribe endpoint sets:
  - suppression list
  - campaign prospect state = unsubscribed
- Bounce/reply event auto-suppresses follow-up sends.

## 8) Rollout Plan

### Phase A (MVP-Core)
- DB tables
- Prospect import/manual
- Campaign + template
- Queue + worker tick
- Zoho send
- Basic dashboard metrics

### Phase B (MVP+)
- Google Sheet connector pull
- webhook/event enrichment
- better analytics and retry controls

## 9) Non-goals (for MVP)
- open/read tracking accuracy
- multi-step branching sequences
- A/B testing
- multi-provider abstraction

## 10) Acceptance Criteria
- Can upload 100 prospects and send in drip mode without bulk blast.
- Sends respect 5-minute spacing and daily cap.
- Unsubscribe and suppression prevent further sends.
- Dashboard shows sent/delivered/bounced/replied by campaign.

