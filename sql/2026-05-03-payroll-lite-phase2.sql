-- Payroll Lite Phase 2 (inputs + runs + run items)
-- Additive migration.

create table if not exists public.payroll_inputs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  payroll_month integer not null check (payroll_month between 1 and 12),
  payroll_year integer not null check (payroll_year >= 2000 and payroll_year <= 2100),
  total_calendar_days numeric(10,2) not null default 0,
  working_days numeric(10,2) not null default 0,
  payable_days numeric(10,2) not null default 0,
  paid_leave_days numeric(10,2) not null default 0,
  unpaid_leave_days numeric(10,2) not null default 0,
  absent_days numeric(10,2) not null default 0,
  holidays numeric(10,2) not null default 0,
  overtime_amount numeric(14,2) not null default 0,
  arrears_amount numeric(14,2) not null default 0,
  bonus_amount numeric(14,2) not null default 0,
  other_earnings numeric(14,2) not null default 0,
  other_deductions numeric(14,2) not null default 0,
  professional_tax numeric(14,2) not null default 0,
  tds_amount numeric(14,2) not null default 0,
  approved_reimbursements numeric(14,2) not null default 0,
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

create unique index if not exists payroll_inputs_company_employee_month_year_idx
  on public.payroll_inputs(company_id, employee_id, payroll_month, payroll_year);

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_month integer not null check (payroll_month between 1 and 12),
  payroll_year integer not null check (payroll_year >= 2000 and payroll_year <= 2100),
  status text not null default 'draft' check (status in ('draft','calculated','approved','locked','paid')),
  total_gross numeric(16,2) not null default 0,
  total_deductions numeric(16,2) not null default 0,
  total_net_pay numeric(16,2) not null default 0,
  total_employer_cost numeric(16,2) not null default 0,
  lock_reason text not null default '',
  locked_at timestamptz,
  approved_by uuid references public.users(id) on delete set null,
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_runs_company_month_year_idx
  on public.payroll_runs(company_id, payroll_year desc, payroll_month desc, created_at desc);

create table if not exists public.payroll_run_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  gross_earnings numeric(16,2) not null default 0,
  gross_deductions numeric(16,2) not null default 0,
  net_salary numeric(16,2) not null default 0,
  employer_cost numeric(16,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_run_items_run_idx
  on public.payroll_run_items(company_id, payroll_run_id, employee_id);

