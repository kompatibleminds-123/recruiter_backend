create table if not exists public.company_clients (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  about_company text not null default '',
  public_company_line text not null default '',
  public_posting_title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

create index if not exists company_clients_company_id_idx
  on public.company_clients(company_id);

create index if not exists company_clients_company_name_idx
  on public.company_clients(company_id, name);

insert into public.company_clients (
  id,
  company_id,
  name,
  status,
  about_company,
  public_company_line,
  public_posting_title,
  created_at,
  updated_at,
  updated_by
)
select distinct on (j.company_id, lower(trim(j.client_name)))
  gen_random_uuid(),
  j.company_id,
  trim(j.client_name) as name,
  'active' as status,
  coalesce(j.about_company, '') as about_company,
  coalesce(j.public_company_line, '') as public_company_line,
  coalesce(j.public_title, '') as public_posting_title,
  coalesce(j.created_at, now()) as created_at,
  coalesce(j.updated_at, j.created_at, now()) as updated_at,
  coalesce(j.updated_by, '') as updated_by
from public.company_jobs j
where coalesce(trim(j.client_name), '') <> ''
  and coalesce(trim(j.client_name), '') <> '__system__'
  and not exists (
    select 1
    from public.company_clients c
    where c.company_id = j.company_id
      and lower(trim(c.name)) = lower(trim(j.client_name))
  )
order by j.company_id, lower(trim(j.client_name)), coalesce(j.updated_at, j.created_at, now()) desc;

insert into public.company_clients (
  id,
  company_id,
  name,
  status,
  created_at,
  updated_at,
  updated_by
)
select distinct on (u.company_id, lower(trim(u.client_name)))
  gen_random_uuid(),
  u.company_id,
  trim(u.client_name) as name,
  'active' as status,
  coalesce(u.created_at, now()) as created_at,
  coalesce(u.updated_at, u.created_at, now()) as updated_at,
  coalesce(u.updated_by, '') as updated_by
from public.client_portal_users u
where coalesce(trim(u.client_name), '') <> ''
  and not exists (
    select 1
    from public.company_clients c
    where c.company_id = u.company_id
      and lower(trim(c.name)) = lower(trim(u.client_name))
  )
order by u.company_id, lower(trim(u.client_name)), coalesce(u.updated_at, u.created_at, now()) desc;
