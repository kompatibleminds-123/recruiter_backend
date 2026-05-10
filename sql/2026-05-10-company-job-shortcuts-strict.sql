-- Make recruiter-scoped JD shortcuts the single source of truth.
-- 1) Ensure table exists
create table if not exists public.company_job_shortcuts (
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.company_jobs(id) on delete cascade,
  recruiter_id uuid not null references public.users(id) on delete cascade,
  shortcuts text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  primary key (job_id, recruiter_id)
);

create index if not exists idx_company_job_shortcuts_company_id
  on public.company_job_shortcuts(company_id);

create index if not exists idx_company_job_shortcuts_recruiter_id
  on public.company_job_shortcuts(recruiter_id);

-- 2) One-time backfill from legacy company_jobs.jd_shortcuts -> owner recruiter row
insert into public.company_job_shortcuts (
  company_id,
  job_id,
  recruiter_id,
  shortcuts,
  created_at,
  updated_at,
  payload
)
select
  j.company_id,
  j.id,
  j.owner_recruiter_id,
  coalesce(j.jd_shortcuts, ''),
  now(),
  now(),
  jsonb_build_object('source', 'legacy_jd_shortcuts_backfill')
from public.company_jobs j
where coalesce(j.jd_shortcuts, '') <> ''
  and j.owner_recruiter_id is not null
on conflict (job_id, recruiter_id) do nothing;

-- 3) Stop using legacy field for runtime reads.
-- Keep column for backward compatibility, but clear old values after backfill.
update public.company_jobs
set jd_shortcuts = ''
where coalesce(jd_shortcuts, '') <> '';
