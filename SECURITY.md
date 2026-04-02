# RecruitDesk AI Security Summary

This backend is designed for an initial customer-ready privacy posture for small agency deployments.

## Current controls

- Company-scoped authentication for backend workflows
- Company-scoped access for users, jobs, assessments, candidates, and contact attempts
- Password hashing with PBKDF2-SHA512 and per-user salt
- Bearer-token session model
- HTTPS expected in production
- Restricted CORS by allowed origin list
- Basic security headers on API/static responses
- Admin-only company data export endpoint: `GET /company/privacy/export`

## Data isolation

- Every company has its own `company_id`
- Recruiters only access data belonging to their authenticated company
- Team recruiters are limited to their own/assigned candidate views where applicable
- Admin actions are limited to the admin of the same company

## AI data handling

- Candidate/JD data is processed only to generate requested outputs
- Customer data is not used by this backend to train public models
- If OpenAI API is configured, data sent for parsing/question generation is processed by that API provider

## Operational notes

- Production secrets must be stored in environment variables, not source code
- `SUPABASE_SERVICE_ROLE_KEY` must remain server-side only
- `ALLOWED_ORIGINS` should be set explicitly in production
- Run the SQL in [privacy_hardening.sql](/C:/Users/dell/Desktop/Codex/recruiter-backend/sql/privacy_hardening.sql) before using multi-tenant candidate/contact data in production

## Current limitations

- No SOC 2 / ISO 27001 posture yet
- No SSO yet
- No customer-managed encryption keys
- No automated audit-event store yet
- Company data deletion is currently a controlled support/admin operation, not a self-serve endpoint
