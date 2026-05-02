-- Payroll Lite Phase 1 (foundation)
-- Additive and backward-compatible migration.

create table if not exists public.payroll_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade unique,
  payroll_enabled boolean not null default false,
  default_fbp_proof_cycle text not null default 'quarterly' check (default_fbp_proof_cycle in ('monthly','quarterly','final_settlement')),
  default_monthly_professional_tax numeric(12,2) not null default 0,
  apply_lop_proration boolean not null default true,
  prorate_health_insurance boolean not null default false,
  default_salary_template_code text not null default 'c2h_it_standard',
  policy_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

create table if not exists public.salary_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null,
  name text not null,
  description text not null default '',
  config jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null,
  unique(company_id, code)
);

create index if not exists salary_templates_company_active_idx
  on public.salary_templates(company_id, active);

create table if not exists public.employee_compensation_structures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  template_code text not null default 'custom',
  effective_from date not null,
  effective_to date,
  annual_ctc numeric(14,2) not null default 0,
  monthly_ctc numeric(14,2) not null default 0,
  basic_monthly numeric(14,2) not null default 0,
  basic_annual numeric(14,2) not null default 0,
  hra_monthly numeric(14,2) not null default 0,
  hra_annual numeric(14,2) not null default 0,
  fbp_monthly numeric(14,2) not null default 0,
  fbp_annual numeric(14,2) not null default 0,
  special_allowance_monthly numeric(14,2) not null default 0,
  special_allowance_annual numeric(14,2) not null default 0,
  employer_pf_monthly numeric(14,2) not null default 0,
  employer_pf_annual numeric(14,2) not null default 0,
  employee_pf_monthly numeric(14,2) not null default 0,
  employee_pf_annual numeric(14,2) not null default 0,
  gratuity_monthly numeric(14,2) not null default 0,
  gratuity_annual numeric(14,2) not null default 0,
  health_insurance_monthly numeric(14,2) not null default 0,
  health_insurance_annual numeric(14,2) not null default 0,
  other_allowance_monthly numeric(14,2) not null default 0,
  other_allowance_annual numeric(14,2) not null default 0,
  is_active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

create index if not exists employee_comp_struct_company_employee_idx
  on public.employee_compensation_structures(company_id, employee_id, effective_from desc);

create unique index if not exists employee_comp_struct_one_active_idx
  on public.employee_compensation_structures(company_id, employee_id)
  where is_active = true;

create table if not exists public.fbp_heads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  head_name text not null,
  monthly_limit numeric(14,2) not null default 0,
  annual_limit numeric(14,2) not null default 0,
  proof_required boolean not null default true,
  taxable_if_unclaimed boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.users(id) on delete set null,
  updated_by uuid references public.users(id) on delete set null
);

create unique index if not exists fbp_heads_company_name_idx
  on public.fbp_heads(company_id, lower(head_name));

create index if not exists fbp_heads_company_active_idx
  on public.fbp_heads(company_id, active);

create table if not exists public.payroll_audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_payload jsonb not null default '{}'::jsonb,
  new_payload jsonb not null default '{}'::jsonb,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists payroll_audit_logs_company_idx
  on public.payroll_audit_logs(company_id, created_at desc);

insert into public.salary_templates (company_id, code, name, description, config, active)
select c.id,
       'c2h_it_standard',
       'C2H IT Standard',
       'Default seed template: editable by company admins',
       jsonb_build_object(
         'basic_percent_of_ctc', 35,
         'hra_percent_of_basic', 50,
         'employer_pf_percent_of_basic', 12,
         'gratuity_percent_of_basic_annual', 4.81,
         'default_fbp_monthly', 0,
         'default_health_insurance_annual', 0
       ),
       true
from public.companies c
where not exists (
  select 1
  from public.salary_templates t
  where t.company_id = c.id
    and t.code = 'c2h_it_standard'
);

