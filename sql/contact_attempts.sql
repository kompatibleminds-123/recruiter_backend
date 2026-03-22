create extension if not exists pgcrypto;

create table if not exists public.contact_attempts (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  recruiter_id uuid,
  recruiter_name text,
  jd_id uuid,
  jd_title text,
  outcome text not null,
  notes text,
  next_follow_up_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_attempts_candidate_id on public.contact_attempts(candidate_id);
create index if not exists idx_contact_attempts_created_at on public.contact_attempts(created_at desc);
