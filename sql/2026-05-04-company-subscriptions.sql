-- Company subscription/license storage (separate from company_jobs)
create table if not exists public.company_subscriptions (
  id text primary key,
  company_id text not null unique,
  company_name text default '',
  plan text not null default 'trial',
  status text not null default 'trial',
  trial_started_at timestamptz null,
  trial_ends_at timestamptz null,
  capture_limit int not null default 50,
  captures_used int not null default 0,
  subscription_started_at timestamptz null,
  subscription_ends_at timestamptz null,
  owner_admin_user_id text null,
  payroll_lite_enabled boolean not null default false,
  payroll_authorized_user_ids jsonb not null default '[]'::jsonb,
  payroll_approver_user_ids jsonb not null default '[]'::jsonb,
  payroll_access_manager_user_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_company_subscriptions_company_id on public.company_subscriptions(company_id);
create index if not exists idx_company_subscriptions_plan_status on public.company_subscriptions(plan, status);

-- One-time backfill from legacy company_jobs payload row
insert into public.company_subscriptions (
  id,
  company_id,
  company_name,
  plan,
  status,
  trial_started_at,
  trial_ends_at,
  capture_limit,
  captures_used,
  subscription_started_at,
  subscription_ends_at,
  owner_admin_user_id,
  payroll_lite_enabled,
  payroll_authorized_user_ids,
  payroll_approver_user_ids,
  payroll_access_manager_user_ids,
  metadata,
  created_at,
  updated_at
)
select
  coalesce(j.company_id, (j.payload->>'companyId')) as id,
  coalesce(j.company_id, (j.payload->>'companyId')) as company_id,
  coalesce(c.name, '') as company_name,
  coalesce(j.payload->>'plan', 'trial') as plan,
  coalesce(j.payload->>'status', 'trial') as status,
  nullif(j.payload->>'trialStartedAt', '')::timestamptz as trial_started_at,
  nullif(j.payload->>'trialEndsAt', '')::timestamptz as trial_ends_at,
  coalesce((j.payload->>'captureLimit')::int, 50) as capture_limit,
  coalesce((j.payload->>'capturesUsed')::int, 0) as captures_used,
  nullif(j.payload->>'subscriptionStartedAt', '')::timestamptz as subscription_started_at,
  nullif(j.payload->>'subscriptionEndsAt', '')::timestamptz as subscription_ends_at,
  nullif(j.payload->>'ownerAdminUserId', '') as owner_admin_user_id,
  coalesce((j.payload->>'payrollLiteEnabled')::boolean, false) as payroll_lite_enabled,
  coalesce((j.payload->'payrollAuthorizedUserIds'), '[]'::jsonb) as payroll_authorized_user_ids,
  coalesce((j.payload->'payrollApproverUserIds'), '[]'::jsonb) as payroll_approver_user_ids,
  coalesce((j.payload->'payrollAccessManagerUserIds'), '[]'::jsonb) as payroll_access_manager_user_ids,
  jsonb_build_object('migrated_from', 'company_jobs', 'legacy_job_id', j.id) as metadata,
  coalesce(j.created_at, now()) as created_at,
  coalesce(j.updated_at, now()) as updated_at
from public.company_jobs j
left join public.companies c on c.id = j.company_id
where j.title = '__company_license__'
  and coalesce(j.company_id, (j.payload->>'companyId')) is not null
on conflict (id) do nothing;
