create table if not exists public.search_parse_feedback (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid null,
  user_name text null,
  mode text null,
  semantic boolean null,
  query_text text not null,
  note text null,
  parse_debug jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_search_parse_feedback_company_created
  on public.search_parse_feedback(company_id, created_at desc);

create index if not exists idx_search_parse_feedback_company_user
  on public.search_parse_feedback(company_id, user_id);
