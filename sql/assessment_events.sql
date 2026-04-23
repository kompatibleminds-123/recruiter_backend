create extension if not exists pgcrypto;

-- Assessment events for factual, time-bound analytics:
-- interviews aligned/done, offers, joins, and general status changes.
-- RLS enabled with no policies (service role backend only).
create table if not exists public.assessment_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  candidate_id uuid references public.candidates(id) on delete set null,
  recruiter_id uuid,
  recruiter_name text,
  client_name text,
  jd_title text,
  event_type text not null,
  status text,
  event_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_assessment_events_company_id on public.assessment_events(company_id);
create index if not exists idx_assessment_events_assessment_id on public.assessment_events(assessment_id);
create index if not exists idx_assessment_events_candidate_id on public.assessment_events(candidate_id);
create index if not exists idx_assessment_events_event_at on public.assessment_events(event_at desc);
create index if not exists idx_assessment_events_created_at on public.assessment_events(created_at desc);

alter table public.assessment_events enable row level security;

