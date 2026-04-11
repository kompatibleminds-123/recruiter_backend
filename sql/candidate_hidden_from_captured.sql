alter table if exists public.candidates
  add column if not exists hidden_from_captured boolean not null default false;
