-- Per-recruiter SMTP settings storage (Zoho, etc.)
-- Run this once in Supabase SQL editor for the RecruitDesk project.

create table if not exists public.user_smtp_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

create unique index if not exists user_smtp_settings_company_user_unique
  on public.user_smtp_settings (company_id, user_id);

-- Optional: keep timestamps fresh
create or replace function public.touch_user_smtp_settings_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_touch_user_smtp_settings_updated_at on public.user_smtp_settings;
create trigger trg_touch_user_smtp_settings_updated_at
before update on public.user_smtp_settings
for each row execute procedure public.touch_user_smtp_settings_updated_at();

