create table if not exists public.payroll_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_name text,
  name text not null,
  email text not null,
  role text not null check (role in ('payroll_owner', 'payroll_manager')),
  password_hash text not null,
  created_at timestamptz not null default now(),
  unique (company_id, email)
);

create index if not exists payroll_users_company_id_idx
  on public.payroll_users(company_id);

create index if not exists payroll_users_company_email_idx
  on public.payroll_users(company_id, email);

create table if not exists public.payroll_sessions (
  token text primary key,
  user_id uuid not null references public.payroll_users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists payroll_sessions_user_id_idx
  on public.payroll_sessions(user_id);

create index if not exists payroll_sessions_company_id_idx
  on public.payroll_sessions(company_id);
