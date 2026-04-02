create extension if not exists pgcrypto;

alter table if exists public.candidates
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

create index if not exists idx_candidates_company_id on public.candidates(company_id);
create index if not exists idx_candidates_company_created_at on public.candidates(company_id, created_at desc);

alter table if exists public.contact_attempts
  add column if not exists company_id uuid references public.companies(id) on delete cascade;

create index if not exists idx_contact_attempts_company_id on public.contact_attempts(company_id);
create index if not exists idx_contact_attempts_company_created_at on public.contact_attempts(company_id, created_at desc);

update public.candidates
set company_id = u.company_id
from public.users u
where public.candidates.company_id is null
  and public.candidates.recruiter_id = u.id;

update public.contact_attempts
set company_id = c.company_id
from public.candidates c
where public.contact_attempts.company_id is null
  and public.contact_attempts.candidate_id = c.id;
