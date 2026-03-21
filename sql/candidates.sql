create extension if not exists pgcrypto;

create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  name text,
  company text,
  role text,
  experience text,
  skills text[] default '{}',
  current_ctc text,
  expected_ctc text,
  notice_period text,
  notes text,
  next_action text,
  linkedin text,
  created_at timestamptz not null default now()
);
