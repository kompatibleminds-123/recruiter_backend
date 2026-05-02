-- Payroll Lite Phase 3 (FBP declarations + payslip publishing)
-- Additive migration.

create table if not exists public.fbp_declarations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  payroll_month integer not null check (payroll_month between 1 and 12),
  payroll_year integer not null check (payroll_year >= 2000 and payroll_year <= 2100),
  head_id uuid references public.fbp_heads(id) on delete set null,
  head_name text not null,
  declared_amount numeric(14,2) not null default 0,
  approved_amount numeric(14,2) not null default 0,
  status text not null default 'submitted' check (status in ('draft','submitted','approved','rejected')),
  notes text not null default '',
  rejection_reason text not null default '',
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references public.users(id) on delete set null,
  docs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fbp_declarations_company_month_year_idx
  on public.fbp_declarations(company_id, payroll_year desc, payroll_month desc, updated_at desc);

create index if not exists fbp_declarations_company_employee_idx
  on public.fbp_declarations(company_id, employee_id, payroll_year desc, payroll_month desc);

create table if not exists public.payroll_payslips (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  payroll_month integer not null check (payroll_month between 1 and 12),
  payroll_year integer not null check (payroll_year >= 2000 and payroll_year <= 2100),
  status text not null default 'published' check (status in ('published','revoked')),
  payload jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  published_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_payslips_company_run_idx
  on public.payroll_payslips(company_id, payroll_run_id, employee_id);

create index if not exists payroll_payslips_company_employee_month_year_idx
  on public.payroll_payslips(company_id, employee_id, payroll_year desc, payroll_month desc, updated_at desc);
