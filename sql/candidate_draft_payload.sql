alter table public.candidates
  add column if not exists screening_answers jsonb not null default '{}'::jsonb;

alter table public.candidates
  add column if not exists draft_payload jsonb not null default '{}'::jsonb;
