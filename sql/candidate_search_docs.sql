create extension if not exists pgcrypto;

-- Persisted, unified search document for candidates.
-- This is NOT required for core workflows; it only improves Database search reliability/speed.
-- RLS is enabled with no policies so only the service role key (backend) can access it.
create table if not exists public.candidate_search_docs (
  candidate_id uuid primary key references public.candidates(id) on delete cascade,
  company_id uuid not null,
  doc_v1 text not null default '',
  doc_updated_at timestamptz,
  cv_text_full text,
  cv_text_hash text,
  cv_text_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_candidate_search_docs_company_id on public.candidate_search_docs(company_id);
create index if not exists idx_candidate_search_docs_updated_at on public.candidate_search_docs(updated_at desc);

alter table public.candidate_search_docs enable row level security;

