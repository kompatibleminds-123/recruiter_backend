create table if not exists public.employee_portal_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  company_name text,
  employee_id uuid not null,
  employee_code text not null unique,
  username text not null unique,
  password_hash text not null,
  full_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists employee_portal_users_company_id_idx
  on public.employee_portal_users(company_id);

create index if not exists employee_portal_users_employee_id_idx
  on public.employee_portal_users(employee_id);

create table if not exists public.employee_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_code text not null,
  full_name text not null,
  personal_email text,
  phone text,
  designation text,
  employment_type text not null default 'c2h',
  joining_date date,
  reporting_manager_name text,
  client_name text,
  work_mode text,
  status text not null default 'active',
  tax_regime_current text check (tax_regime_current in ('old', 'new')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists employee_profiles_company_code_idx
  on public.employee_profiles(company_id, employee_code);

create table if not exists public.employee_work_sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  site_name text not null,
  client_name text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  radius_meters integer not null default 300,
  address_text text,
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists employee_work_sites_company_employee_idx
  on public.employee_work_sites(company_id, employee_id);

create table if not exists public.employee_attendance_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  attendance_date date not null,
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_latitude numeric(10,7),
  check_in_longitude numeric(10,7),
  check_in_accuracy_meters numeric(10,2),
  check_out_latitude numeric(10,7),
  check_out_longitude numeric(10,7),
  check_out_accuracy_meters numeric(10,2),
  check_in_address_label text,
  check_out_address_label text,
  check_in_note text,
  check_out_note text,
  site_id uuid references public.employee_work_sites(id) on delete set null,
  location_status text not null default 'unknown',
  distance_from_site_meters numeric(10,2),
  device_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_attendance_logs_company_employee_date_idx
  on public.employee_attendance_logs(company_id, employee_id, attendance_date desc);

create table if not exists public.employee_leave_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  policy_name text not null default 'monthly_paid_leave',
  monthly_credit numeric(10,2) not null default 1.00,
  max_carry_forward numeric(10,2) not null default 0.00,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists employee_leave_policies_company_employee_active_idx
  on public.employee_leave_policies(company_id, employee_id, active);

create table if not exists public.employee_leave_ledger (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  entry_type text not null check (entry_type in ('credit', 'debit', 'adjustment')),
  quantity numeric(10,2) not null,
  effective_month date not null,
  reason text,
  leave_request_id uuid,
  created_at timestamptz not null default now(),
  created_by text
);

create index if not exists employee_leave_ledger_company_employee_month_idx
  on public.employee_leave_ledger(company_id, employee_id, effective_month desc);

create table if not exists public.employee_leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  leave_type text not null default 'paid_leave',
  start_date date not null,
  end_date date not null,
  requested_days numeric(10,2) not null default 1.00,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  approver_user_id uuid references public.users(id) on delete set null,
  approver_name text,
  approver_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_leave_requests_company_employee_idx
  on public.employee_leave_requests(company_id, employee_id, created_at desc);

create table if not exists public.employee_tax_preferences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  regime text not null check (regime in ('old', 'new')),
  effective_from date not null,
  declaration_note text,
  created_at timestamptz not null default now(),
  created_by_role text not null default 'employee'
);

create index if not exists employee_tax_preferences_company_employee_idx
  on public.employee_tax_preferences(company_id, employee_id, effective_from desc);

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employee_profiles(id) on delete cascade,
  category text not null,
  title text not null,
  visibility text not null default 'employee' check (visibility in ('employee', 'company')),
  uploaded_by_role text not null check (uploaded_by_role in ('employee', 'admin', 'recruiter')),
  uploaded_by_user_id uuid,
  uploaded_by_name text,
  file_payload jsonb not null default '{}'::jsonb,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists employee_documents_company_employee_idx
  on public.employee_documents(company_id, employee_id, created_at desc);
