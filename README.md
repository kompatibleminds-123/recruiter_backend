# Recruiter Backend MVP

This is the first backend service for `Recruiter Speed Desk`.

## What it does today

- exposes `GET /health`
- exposes `POST /auth/bootstrap-admin`
- exposes `POST /auth/login`
- exposes `GET /auth/me`
- exposes `GET /company/users`
- exposes `POST /company/users`
- exposes `POST /parse-candidate`
- exposes `GET /webhook`
- exposes `POST /webhook`
- exposes `GET /whatsapp/notes`
- accepts recruiter-supplied candidate text, page text, or structured experience
- returns:
  - candidate name
  - exact/visible total experience when found
  - experience timeline rows
  - gaps
  - short stints
  - recruiter-relevant highlights

## Run locally

Requirements:

- Node.js 18+

Commands:

```bash
cd recruiter-backend
npm start
```

Server runs on:

```text
http://localhost:8787
```

## Routes

### `GET /health`

Returns backend status.

### `POST /auth/bootstrap-admin`

Creates the first company and lead recruiter account.

Example request:

```json
{
  "companyName": "Kompatible Minds",
  "adminName": "Nike Disoza",
  "email": "nike@kompatibleminds.com",
  "password": "choose-a-strong-password"
}
```

### `POST /auth/login`

Logs in a recruiter and returns a bearer token.

Example request:

```json
{
  "email": "nike@kompatibleminds.com",
  "password": "choose-a-strong-password"
}
```

### `GET /auth/me`

Returns the current signed-in recruiter from the bearer token.

### `GET /company/users`

Returns users for the current company.

### `POST /company/users`

Admin-only route to create team recruiter accounts.

Example request:

```json
{
  "name": "Aditi Recruiter",
  "email": "aditi@kompatibleminds.com",
  "password": "temporary-password",
  "role": "team"
}
```

### `POST /parse-candidate`

Example request:

```json
{
  "sourceType": "linkedin",
  "candidateName": "",
  "totalExperience": "",
  "pageText": "Akhilesh Agrawal\nAccount Executive\nLeadSquared\nAug 2024 - Aug 2025 · 1 year 1 month\n...",
  "structuredExperience": "Title: Account Executive | Company: LeadSquared | Dates: Aug 2024 - Aug 2025 | 1 year 1 month"
}
```

Example response:

```json
{
  "ok": true,
  "result": {
    "candidateName": "Akhilesh Agrawal",
    "totalExperience": "5 years 7 months",
    "sourceType": "linkedin",
    "timeline": [
      {
        "title": "Account Executive",
        "company": "LeadSquared",
        "start": "Aug 2024",
        "end": "Aug 2025",
        "duration": "1 year 1 month",
        "rawDates": "Aug 2024 - Aug 2025 | 1 year 1 month",
        "isCurrent": false
      }
    ],
    "gaps": [],
    "shortStints": [
      {
        "company": "LeadSquared",
        "duration": "1 year 1 month",
        "start": "Aug 2024",
        "end": "Aug 2025"
      }
    ],
    "highlights": [
      "SaaS exposure mentioned"
    ],
    "rawTextPreview": "..."
  }
}
```

## Lead Recruiter vs Team Recruiter

- `admin`
  - bootstraps the company account
  - creates team recruiter accounts
  - will later own JD setup, standard questions, and shared shortcuts

- `team`
  - logs in
  - will later consume admin-defined JDs and screening questions
  - runs interviews, CV analysis, and assessments

## What comes next

Next backend upgrades:

1. extension login UI
2. shared company JDs in backend
3. admin-only JD editing
4. team recruiter read/use access
5. database-backed persistence instead of local JSON file
6. Google Sheets push from backend
7. user usage limits

## Mobile-First WhatsApp Note Capture

This backend can also receive recruiter notes from WhatsApp and structure them using AI.

### Flow

WhatsApp Message -> Meta Cloud API -> `POST /webhook` -> AI structuring -> database/local store

### Required environment variables

```text
OPENAI_API_KEY=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
```

Optional:

```text
WHATSAPP_NOTES_MODEL=gpt-4.1-mini
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Webhook routes

- `GET /webhook`
  - Meta verification endpoint
- `POST /webhook`
  - receives WhatsApp Cloud API messages
- `GET /whatsapp/notes`
  - returns stored structured notes

### AI note structuring

Example input:

```text
met akhilesh ex highradius good enterprise sales candidate follow up next week
```

Example stored output:

## Candidate Quick Capture PWA

This backend also ships with a mobile-first web app for fast recruiter note capture.

### What it does

- `GET /quick-capture`
  - mobile-first note capture page
- `POST /parse-note`
  - converts raw note text into structured JSON with OpenAI
  - stores the result in Supabase `candidates` table
  - falls back to local JSON storage if Supabase is not configured
- `GET /candidates`
  - returns saved candidates for the list view
- `GET /quick-capture/list.html`
  - card-based saved candidate list

### Required environment variables

```text
OPENAI_API_KEY=...
```

Optional:

```text
QUICK_CAPTURE_MODEL=gpt-4.1-mini
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

### Supabase table

Run this SQL in Supabase:

```sql
\i sql/candidates.sql
```

Or paste the contents of:

- `C:\Users\dell\Desktop\Codex\recruiter-backend\sql\candidates.sql`

### Run locally

```bash
cd recruiter-backend
npm start
```

Then open:

- `http://localhost:8787/quick-capture`
- `http://localhost:8787/quick-capture/list.html`

```json
{
  "id": "uuid",
  "phone_number": "919876543210",
  "name": "Akhilesh",
  "company": "HighRadius",
  "role": "Enterprise Sales",
  "notes": "Strong enterprise sales candidate",
  "action_items": "Follow up next week",
  "raw_message": "met akhilesh ex highradius good enterprise sales candidate follow up next week",
  "source": "whatsapp_cloud_api",
  "created_at": "2026-03-21T12:00:00.000Z"
}
```

### Storage

- If `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured:
  - notes are inserted into `public.whatsapp_notes`
- Otherwise:
  - notes are stored locally in `data/whatsapp-notes.json`

Supabase/Postgres schema example:

- [whatsapp_notes.sql](/C:/Users/dell/Desktop/Codex/recruiter-backend/sql/whatsapp_notes.sql)

## Important current limitation

This backend auth/company layer is currently a lightweight local-file MVP:

- data is stored in `recruiter-backend/data/store.json`
- good for local beta and architecture setup
- not yet production deployment quality

This MVP parse API is strongest when the extension sends:

- clean page text
- structured experience text

It does **not yet** parse raw PDF/DOCX binaries by itself. That is the next step after this parse API base.
