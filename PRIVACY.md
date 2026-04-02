# RecruitDesk AI Privacy Notes

## Customer-facing summary

- Each agency/company's data is separated by `company_id`
- Authenticated users can access only their own company data
- We do not use customer recruiting data to train public AI models
- Customer data is processed only to provide requested recruiting workflows
- Company admins can request/export their company data

## Data stored

- Recruiter users and roles
- Company job descriptions and shared presets
- Assessments and recruiter notes
- Quick-capture candidates
- Contact-attempt history

## Subprocessors / external services

- OpenAI API, when AI parsing/question generation is enabled
- Supabase/Postgres, when configured for persistent storage

## Retention / deletion

- Data remains until removed by the customer or support/admin process
- Candidate/contact data deletion is company-scoped
- Company-wide deletion should be handled as an explicit administrative/support task

## Support access

- Production data access should be restricted to the operator when necessary for debugging/support
- Customer data should not be browsed casually or used outside support/product operation needs
