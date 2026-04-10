create table if not exists public.client_portal_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_name text,
  username text not null unique,
  password_hash text not null,
  client_name text not null,
  allowed_positions text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists client_portal_users_company_id_idx
  on public.client_portal_users(company_id);

create index if not exists client_portal_users_client_name_idx
  on public.client_portal_users(company_id, client_name);
