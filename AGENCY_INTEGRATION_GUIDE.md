# Agency Integration Guide

This guide explains how an agency can send inbound applicants into RecruitDesk.

The same intake API can be used for:

- website forms
- WordPress forms
- webhooks
- automations
- custom backend integrations

## Integration Flow

1. Candidate applies on the agency's website or channel
2. Agency system sends applicant data to RecruitDesk
3. Applicant lands in `Applied Candidates`
4. Admin assigns the applicant
5. Applicant moves into `Captured Notes`
6. Existing RecruitDesk workflow continues

## Endpoint

`POST /public/applicants/intake`

Example base URL:

`https://recruiter-backend-yvex.onrender.com/public/applicants/intake`

## Security

Every integration must send:

`x-applicant-intake-secret`

Example:

```text
x-applicant-intake-secret: km_applicant_intake_2026_secure_7419
```

Recommended model:

- every agency/company gets its own `companyId`
- every agency/company gets its own applicant intake secret
- the same intake endpoint is reused for all agencies

Admin secret endpoints:

- `GET /company/applicant-intake-secret`
- `POST /company/applicant-intake-secret`

## Minimum Required Fields

These are enough for a basic integration:

```json
{
  "companyId": "c0a7d2c9-4ddb-4add-9d4a-24cdd1caba7c",
  "jdTitle": "Call Centre Manager (Team Lead)",
  "candidateName": "Ankit Garg",
  "email": "ankit@example.com",
  "phone": "07027962853",
  "location": "Gurugram",
  "sourcePlatform": "website"
}
```

## Recommended Full Payload

```json
{
  "companyId": "c0a7d2c9-4ddb-4add-9d4a-24cdd1caba7c",
  "clientName": "",
  "jdTitle": "Call Centre Manager (Team Lead)",
  "jobId": "call-centre-manager-team-lead",
  "sourcePlatform": "website",
  "sourceLabel": "Agency Website",
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
    "fileData": "BASE64_FILE_DATA"
  }
}
```

## Connector Types

### 1. Basic connector

Use when the website can only send form fields.

Supports:

- candidate details
- role/JD
- source information

Does not guarantee:

- CV forwarding

### 2. Advanced connector

Use when the website or backend can send file bytes or a file URL.

Supports:

- candidate details
- role/JD
- source information
- CV

### 3. Hosted apply form

Later RecruitDesk can offer a hosted form that also posts into the same endpoint.

## WordPress Example

WordPress can forward website form data into the intake API.

Current practical model:

- applicant details are sent reliably
- CV support depends on how the WordPress form exposes file uploads

This still works as a valid basic connector.

## Webhook Example

Any webhook-capable tool can post into RecruitDesk.

Example use cases:

- custom website backend
- Make
- Zapier
- internal automation layer

## cURL Test

Use this from a terminal to test the intake API directly:

```bash
curl -X POST "https://recruiter-backend-yvex.onrender.com/public/applicants/intake" \
  -H "Content-Type: application/json" \
  -H "x-applicant-intake-secret: km_applicant_intake_2026_secure_7419" \
  -d '{
    "companyId": "c0a7d2c9-4ddb-4add-9d4a-24cdd1caba7c",
    "jdTitle": "API Test Role",
    "jobId": "api-test-role",
    "sourcePlatform": "webhook",
    "sourceLabel": "Manual API Test",
    "candidateName": "Test Applicant",
    "email": "test@applicant.com",
    "phone": "9999999999",
    "location": "Gurugram",
    "currentCompany": "Test Company",
    "currentDesignation": "Test Role",
    "totalExperience": "2-4 years",
    "skills": ["Testing"]
  }'
```

Expected success response:

```json
{
  "ok": true,
  "result": {
    "id": "..."
  }
}
```

## PowerShell Test

Use this in PowerShell on Windows:

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "x-applicant-intake-secret" = "km_applicant_intake_2026_secure_7419"
}

$body = @{
  companyId = "c0a7d2c9-4ddb-4add-9d4a-24cdd1caba7c"
  jdTitle = "API Test Role"
  jobId = "api-test-role"
  sourcePlatform = "webhook"
  sourceLabel = "Manual API Test"
  candidateName = "Test Applicant"
  email = "test@applicant.com"
  phone = "9999999999"
  location = "Gurugram"
  currentCompany = "Test Company"
  currentDesignation = "Test Role"
  totalExperience = "2-4 years"
  skills = @("Testing")
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method POST `
  -Uri "https://recruiter-backend-yvex.onrender.com/public/applicants/intake" `
  -Headers $headers `
  -Body $body
```

## How To Test End-To-End

### Test 1: API intake

1. Send a manual request using cURL or PowerShell
2. Confirm response is:
   - `"ok": true`
3. Open RecruitDesk
4. Go to `Applied Candidates`
5. Check that the applicant is visible

### Test 1A: Fetch current company intake secret

Use the logged-in company admin session to call:

`GET /company/applicant-intake-secret`

This should return:

- `company.id`
- `company.name`
- `applicantIntakeSecret`
- `source`

If `source = global_fallback`, run the SQL migration:

- [company_applicant_intake_secret.sql](C:\Users\dell\Desktop\Codex\recruiter-backend\sql\company_applicant_intake_secret.sql)

### Test 2: Assign flow

1. In `Applied Candidates`, assign the applicant
2. Confirm the applicant disappears from `Applied Candidates`
3. Go to `Captured Notes`
4. Confirm the applicant now appears there

### Test 3: Remove flow

1. Create another test applicant
2. Use `Remove`
3. Refresh dashboard
4. Confirm the applicant does not reappear

### Test 4: CV flow

1. Send a payload with `file`
2. Confirm applicant detail shows:
   - `CV filename`
   - `CV URL`
3. Confirm storage/parsing behavior

## Success Criteria

The integration is correct when:

1. external form or channel can call the intake API
2. applicant appears in `Applied Candidates`
3. admin can assign the applicant
4. assigned applicant moves into `Captured Notes`
5. normal RecruitDesk workflow continues
