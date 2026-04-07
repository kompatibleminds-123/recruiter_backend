alter table if exists public.companies
  add column if not exists applicant_intake_secret text;

