create extension if not exists pgcrypto;

create table if not exists marketing_prospects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  email text not null,
  phone text default '',
  company_name text default '',
  designation text default '',
  source text not null default 'manual',
  status text not null default 'active',
  tags jsonb not null default '[]'::jsonb,
  notes text default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, email)
);

create table if not exists marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  name text not null,
  category text default '',
  status text not null default 'draft',
  sender_user_id uuid,
  send_gap_minutes int not null default 5,
  daily_cap int not null default 50,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists marketing_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  campaign_id uuid not null,
  subject text not null,
  body_text text not null,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id)
);

create table if not exists marketing_campaign_prospects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  campaign_id uuid not null,
  prospect_id uuid not null,
  state text not null default 'ready',
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_id, prospect_id)
);

create table if not exists marketing_message_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  campaign_id uuid not null,
  prospect_id uuid not null,
  event_type text not null,
  event_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists idx_marketing_prospects_company on marketing_prospects(company_id, updated_at desc);
create index if not exists idx_marketing_campaigns_company on marketing_campaigns(company_id, updated_at desc);
create index if not exists idx_marketing_campaign_prospects_campaign on marketing_campaign_prospects(campaign_id, state, updated_at asc);
create index if not exists idx_marketing_message_events_campaign on marketing_message_events(campaign_id, event_at desc);
