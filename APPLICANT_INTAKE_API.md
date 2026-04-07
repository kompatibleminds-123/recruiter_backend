# Applicant Intake API

This module handles inbound applicants coming from website forms, apply links, and webhooks.

It is intentionally small.

The workflow is:

1. Candidate applies
2. Applicant lands in `Applied Candidates`
3. Admin assigns the applicant
4. Applicant leaves `Applied Candidates`
5. Applicant enters `Captured Notes`
6. Existing recruiter workflow continues from there

## Product Rules

- `Applied Candidates` is an admin-only inbox.
- Unassigned website applicants belong in `Applied Candidates`.
- Assigned website applicants belong in `Captured Notes`.
- `Assign` is the bridge into the existing workflow.
- `Remove` removes irrelevant applicants from the intake queue.
- CV is optional by connector type.

## Applicant States

These are the logical states for the module:

- `applied_new`
  Website applicant has landed and is not assigned yet.
- `applied_assigned`
  Website applicant has been assigned and should move into `Captured Notes`.
- `removed`
  Applicant has been removed from the intake queue and should not reappear.

These states can be represented through current fields and filters even if there is no dedicated
database enum yet.

## Data Model Expectations

Applicants are currently stored in the same `candidates` table.

Important fields:

- `id`
- `company_id`
- `source`
- `name`
- `email`
- `phone`
- `location`
- `jd_title`
- `assigned_to_user_id`
- `assigned_jd_title`
- `used_in_assessment`
- `assessment_id`
- `created_at`
- `raw_note`
- `cv_filename`
- `cv_url`
- `parse_status`

Expected source values:

- `website_apply`
- later: `webhook_apply`
- later: `hosted_apply`

## Endpoint Overview

### 1. Create Applicant

`POST /public/applicants/intake`

Purpose:
- receive an inbound applicant from a website form or webhook

Security:
- uses `x-applicant-intake-secret` for company-side integration security
- secret should be company-specific

Request body:

```json
{
  "companyId": "c0a7d2c9-4ddb-4add-9d4a-24cdd1caba7c",
  "clientName": "",
  "jdTitle": "Call Centre Manager (Team Lead)",
  "jobId": "call-centre-manager-team-lead",
  "sourcePlatform": "website",
  "sourceLabel": "Compatible Minds Website",
  "jobPageUrl": "https://example.com/jobs/call-centre-manager-team-lead",
  "candidateName": "Ankit Garg",
  "email": "ankit@example.com",
  "phone": "07027962853",
  "location": "Gurugram",
  "currentCompany": "KM-001",
  "currentDesignation": "Founder",
  "currentCtc": "",
  "noticePeriod": "",
  "totalExperience": "Fresher",
  "screeningAnswers": "",
  "skills": ["Sales"],
  "file": {
    "filename": "ankit-garg-cv.pdf",
    "mimeType": "application/pdf",
    "fileData": "base64-data-here"
  }
}
```

Notes:
- `file` is optional.
- intake must still succeed when `file` is missing.
- source should be persisted as `website_apply` for website-based applicants.
- company-specific secret should be fetched from the company record when available
- if the company table does not yet support `applicant_intake_secret`, the backend falls back to the global `APPLICANT_INTAKE_SECRET`

Success response:

```json
{
  "ok": true,
  "result": {
    "id": "28dfe7a1-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "company_id": "c0a7d2c9-4ddb-4add-9d4a-24cdd1caba7c",
    "source": "website_apply",
    "name": "Ankit Garg",
    "jd_title": "Call Centre Manager (Team Lead)",
    "assigned_to_user_id": null,
    "used_in_assessment": false
  }
}
```

### 2. List Applied Candidates

`GET /company/applicants`

Purpose:
- show the admin-only `Applied Candidates` inbox

Expected filter behavior:
- include only inbound applicants
- include only unassigned applicants
- exclude removed applicants
- exclude applicants already converted into the workflow

Equivalent logical filter:

- `source = website_apply`
- `assigned_to_user_id is null`
- `used_in_assessment = false`
- not removed

Success response:

```json
{
  "ok": true,
  "items": [
    {
      "id": "28dfe7a1-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "candidateName": "Ankit Garg",
      "jdTitle": "Call Centre Manager (Team Lead)",
      "sourcePlatform": "website",
      "createdAt": "2026-04-07T03:10:24.366112+00:00",
      "cvFilename": "",
      "cvUrl": "",
      "parseStatus": "submitted_without_cv",
      "assignedToUserId": null
    }
  ]
}
```

### 3. Assign Applicant

`POST /company/applicants/assign`

Purpose:
- assign the applicant to a recruiter
- move the applicant out of `Applied Candidates`
- make the applicant available in `Captured Notes`

Request body:

```json
{
  "id": "28dfe7a1-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "recruiter_id": "7f2c8f3a-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "jd_title": "Call Centre Manager (Team Lead)"
}
```

Required behavior:

- set `assigned_to_user_id`
- set `assigned_jd_title` if provided
- applicant must stop appearing in `GET /company/applicants`
- applicant must start appearing in `Captured Notes`

Success response:

```json
{
  "ok": true,
  "result": {
    "id": "28dfe7a1-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "assigned_to_user_id": "7f2c8f3a-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "assigned_jd_title": "Call Centre Manager (Team Lead)"
  }
}
```

### 4. Remove Applicant

`DELETE /company/applicants?id=<applicant-id>`

Purpose:
- remove an irrelevant applicant from the intake queue

Required behavior:

- applicant must stop appearing in `Applied Candidates`
- applicant must not reappear after refresh

Success response:

```json
{
  "ok": true
}
```

## Captured Notes Handoff

Assignment is the handoff into the existing workflow.

After successful assignment:

- the applicant must disappear from `Applied Candidates`
- the same record must be visible in `Captured Notes`
- recruiter continues the normal workflow from there:
  - update notes
  - create assessment
  - share candidate
  - update pipeline

## Connector Types

### Basic Connector

Supports:
- candidate details
- role/JD context
- source info

Does not guarantee:
- CV forwarding

Examples:
- Contact Form 7
- basic website webhook

### Advanced Connector

Supports:
- candidate details
- CV file or CV URL

Examples:
- custom website form
- direct API integration

### Hosted Form

Later option for guaranteed CV capture:
- RecruitDesk-hosted apply form
- best option for non-technical agencies

## Definition of Done

This module is complete when:

1. applicant lands in `Applied Candidates`
2. admin can assign the applicant
3. assigned applicant disappears from `Applied Candidates`
4. assigned applicant appears in `Captured Notes`
5. recruiter continues the existing workflow from there
6. removed applicants do not reappear
7. CV, when available, stays attached through the handoff

## Current Alignment With Existing System

This section maps the Applicant Intake module into the current RecruitDesk system so agencies can
send applicants from their website forms or other inbound channels without changing the main
workflow engine.

### Existing System Lanes

RecruitDesk already has:

- `Quick Capture / Captured Notes`
  recruiter-sourced and working-lane candidates
- `Interview Panel`
  recruiter review and assessment workflow
- `Search / JD Match / Sharing`
  downstream workflow

The Applicant Intake module should align with these lanes instead of replacing them.

### Final Lane Model

Use these two lanes:

1. `Applied Candidates`
   admin-only staging lane for inbound applicants
2. `Captured Notes`
   working lane for recruiter-owned candidates

Bridge:

- `Assign Applicant` moves a record from `Applied Candidates` into `Captured Notes`

### Current Storage Strategy

Applicants currently use the same `candidates` table.

That is acceptable for now.

The separation should be done through existing fields:

- `source = website_apply`
- `assigned_to_user_id`
- `used_in_assessment`
- optional metadata inside `raw_note`

### Required Filtering Rules

#### Applied Candidates

The admin inbox should return only:

- `source = website_apply`
- `assigned_to_user_id is null`
- `used_in_assessment = false`
- not removed

This already matches the current product intent.

#### Captured Notes

Captured Notes should include:

- normal recruiter-captured notes
- assigned inbound applicants

Captured Notes should exclude:

- unassigned `website_apply` applicants

This prevents applicants from leaking into the working lane before admin assignment.

### Existing Endpoints To Keep

These endpoints already fit the module and should remain the public contract:

- `POST /public/applicants/intake`
- `GET /company/applicants`
- `POST /company/applicants/assign`
- `DELETE /company/applicants?id=<applicant-id>`
- `GET /company/applicant-intake-secret`
- `POST /company/applicant-intake-secret`

These are enough to support:

- website forms
- webhook integrations
- non-WordPress connectors
- later hosted apply links

### Connector Model For External Agencies

Any agency website or channel should connect into the same intake API.

#### Website form

Agency website form posts to:

- `POST /public/applicants/intake`

#### Webhook / automation channel

Zapier, Make, custom backend, or other tools can post to:

- `POST /public/applicants/intake`

#### Future hosted apply links

RecruitDesk-hosted apply forms should also end at:

- `POST /public/applicants/intake`

This means all inbound channels use one common intake contract.

### Company Secret Management

Each company should ideally have:

- one `companyId`
- one `applicant intake secret`

Admin endpoints:

- `GET /company/applicant-intake-secret`
  returns the active applicant intake secret for the current company
- `POST /company/applicant-intake-secret`
  sets or rotates the company-specific applicant intake secret

If the `companies` table does not yet include `applicant_intake_secret`, run:

- [company_applicant_intake_secret.sql](C:\Users\dell\Desktop\Codex\recruiter-backend\sql\company_applicant_intake_secret.sql)

### What Must Happen After Assignment

After `POST /company/applicants/assign` succeeds:

1. the applicant must no longer be returned by `GET /company/applicants`
2. the same candidate must appear inside `Captured Notes`
3. recruiter continues the existing workflow from there

The recruiter should not need a separate applicant-only workflow after assignment.

### What Must Not Happen

These are considered incorrect behaviors:

- unassigned website applicants appearing in `Captured Notes`
- applicant review creating a working-lane note before assignment
- removed applicants returning after refresh
- assigned applicants staying in `Applied Candidates`

### Implementation Focus To Align Existing System

To align this module inside the current system:

1. keep `Applied Candidates` as admin-only staging
2. treat `Assign` as the only handoff into `Captured Notes`
3. keep `Interview Panel` and assessment flow unchanged after the handoff
4. allow external sources to feed the same intake endpoint
5. keep CV optional at intake time

### External Integration Promise

For agencies, the promise should be simple:

- if candidates apply from their website forms or other inbound channels, those channels can send
  data into `POST /public/applicants/intake`
- admin sees them in `Applied Candidates`
- admin assigns them
- assigned candidates move into `Captured Notes`
- existing RecruitDesk workflow continues from there

This keeps the Applicant Intake module generic while still fitting the current RecruitDesk system.
