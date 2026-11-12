begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.companies') is null
     or to_regclass('public.users') is null
     or to_regclass('public.candidates') is null
     or to_regclass('public.company_jobs') is null then
    raise exception 'WhatsApp screening migration requires companies, users, candidates and company_jobs tables.';
  end if;

  if to_regclass('public.whatsapp_webhook_events') is null then
    raise exception 'Run the Meta WhatsApp Phase 1 webhook migration before WhatsApp screening automation.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'candidates' and column_name = 'company_id' and data_type = 'uuid'
  ) then
    raise exception 'candidates.company_id uuid is required before WhatsApp screening automation.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'candidates' and column_name = 'assigned_jd_id' and data_type = 'uuid'
  ) then
    raise exception 'candidates.assigned_jd_id uuid is required before WhatsApp screening automation.';
  end if;
end;
$$;

create table if not exists public.whatsapp_contact_consents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  phone_e164 text not null,
  purpose text not null default 'job_opportunity_screening',
  consent_status text not null default 'granted' check (consent_status in ('granted', 'revoked')),
  consent_source text not null,
  consent_evidence text not null default '',
  consented_at timestamptz not null,
  revoked_at timestamptz,
  recorded_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_contact_consents_candidate_idx
  on public.whatsapp_contact_consents (company_id, candidate_id, consented_at desc);

create table if not exists public.whatsapp_screening_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  assigned_jd_id uuid references public.company_jobs(id) on delete set null,
  assigned_jd_title text not null,
  assigned_to_user_id uuid references public.users(id) on delete set null,
  assigned_to_name text not null default '',
  created_by_user_id uuid references public.users(id) on delete set null,
  phone_number_id text not null,
  candidate_wa_id text not null,
  consent_id uuid references public.whatsapp_contact_consents(id) on delete restrict,
  client_visibility text not null default 'anonymous' check (client_visibility in ('anonymous', 'named')),
  template_name text not null,
  template_language text not null default 'en',
  status text not null default 'creating',
  current_question text not null default 'interest',
  paused_from_status text,
  proposed_answers jsonb not null default '{}'::jsonb,
  confirmed_answers jsonb not null default '{}'::jsonb,
  conflicts jsonb not null default '{}'::jsonb,
  candidate_snapshot jsonb not null default '{}'::jsonb,
  job_snapshot jsonb not null default '{}'::jsonb,
  initial_message_id text,
  needs_recruiter_follow_up boolean not null default false,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  expires_at timestamptz,
  completed_at timestamptz,
  retention_until timestamptz,
  history_purged_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_screening_sessions_candidate_idx
  on public.whatsapp_screening_sessions (company_id, candidate_id, created_at desc);

create index if not exists whatsapp_screening_sessions_lookup_idx
  on public.whatsapp_screening_sessions (phone_number_id, candidate_wa_id, updated_at desc);

create unique index if not exists whatsapp_screening_one_interactive_session_idx
  on public.whatsapp_screening_sessions (phone_number_id, candidate_wa_id)
  where status in (
    'creating', 'template_sent', 'awaiting_interest', 'awaiting_current_ctc',
    'awaiting_expected_ctc', 'awaiting_notice_period', 'awaiting_recruiter_call',
    'awaiting_confirmation', 'human_takeover'
  );

create table if not exists public.whatsapp_screening_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  screening_session_id uuid not null references public.whatsapp_screening_sessions(id) on delete cascade,
  assigned_jd_id uuid references public.company_jobs(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('candidate', 'automation', 'recruiter')),
  message_type text not null default 'text',
  body text not null default '',
  question_context text,
  meta_message_id text,
  webhook_event_key text,
  delivery_status text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_screening_messages_meta_id_idx
  on public.whatsapp_screening_messages (meta_message_id)
  where meta_message_id is not null;

create unique index if not exists whatsapp_screening_messages_event_key_idx
  on public.whatsapp_screening_messages (webhook_event_key)
  where webhook_event_key is not null;

create index if not exists whatsapp_screening_messages_session_idx
  on public.whatsapp_screening_messages (screening_session_id, created_at asc);

create table if not exists public.whatsapp_screening_event_processing (
  event_key text primary key,
  webhook_event_id uuid references public.whatsapp_webhook_events(id) on delete set null,
  screening_session_id uuid references public.whatsapp_screening_sessions(id) on delete set null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'ignored', 'ambiguous', 'failed')),
  attempt_count integer not null default 1,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.enforce_whatsapp_consent_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  linked_company_id uuid;
begin
  select company_id into linked_company_id
  from public.candidates
  where id = new.candidate_id;
  if linked_company_id is distinct from new.company_id then
    raise exception 'WhatsApp consent candidate must belong to the same company.';
  end if;

  if new.recorded_by is not null then
    select company_id into linked_company_id
    from public.users
    where id = new.recorded_by;
    if linked_company_id is distinct from new.company_id then
      raise exception 'WhatsApp consent recorder must belong to the same company.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_whatsapp_screening_session_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  linked_company_id uuid;
begin
  select company_id into linked_company_id
  from public.candidates
  where id = new.candidate_id;
  if linked_company_id is distinct from new.company_id then
    raise exception 'WhatsApp screening candidate must belong to the same company.';
  end if;

  if new.assigned_jd_id is not null then
    select company_id into linked_company_id
    from public.company_jobs
    where id = new.assigned_jd_id;
    if linked_company_id is distinct from new.company_id then
      raise exception 'WhatsApp screening job must belong to the same company.';
    end if;
  end if;

  if new.assigned_to_user_id is not null then
    select company_id into linked_company_id
    from public.users
    where id = new.assigned_to_user_id;
    if linked_company_id is distinct from new.company_id then
      raise exception 'WhatsApp screening recruiter must belong to the same company.';
    end if;
  end if;

  if new.created_by_user_id is not null then
    select company_id into linked_company_id
    from public.users
    where id = new.created_by_user_id;
    if linked_company_id is distinct from new.company_id then
      raise exception 'WhatsApp screening creator must belong to the same company.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_whatsapp_screening_message_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  linked_company_id uuid;
  linked_candidate_id uuid;
  linked_jd_id uuid;
begin
  select company_id, candidate_id, assigned_jd_id
    into linked_company_id, linked_candidate_id, linked_jd_id
  from public.whatsapp_screening_sessions
  where id = new.screening_session_id;

  if linked_company_id is distinct from new.company_id
     or linked_candidate_id is distinct from new.candidate_id then
    raise exception 'WhatsApp screening message must match its session company and candidate.';
  end if;

  if new.assigned_jd_id is not null then
    if linked_jd_id is distinct from new.assigned_jd_id then
      raise exception 'WhatsApp screening message must match its session job.';
    end if;
    select company_id into linked_company_id
    from public.company_jobs
    where id = new.assigned_jd_id;
    if linked_company_id is distinct from new.company_id then
      raise exception 'WhatsApp screening message job must belong to the same company.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_consent_tenant_guard on public.whatsapp_contact_consents;
create trigger whatsapp_consent_tenant_guard
before insert or update on public.whatsapp_contact_consents
for each row execute function public.enforce_whatsapp_consent_tenant();

drop trigger if exists whatsapp_screening_session_tenant_guard on public.whatsapp_screening_sessions;
create trigger whatsapp_screening_session_tenant_guard
before insert or update on public.whatsapp_screening_sessions
for each row execute function public.enforce_whatsapp_screening_session_tenant();

drop trigger if exists whatsapp_screening_message_tenant_guard on public.whatsapp_screening_messages;
create trigger whatsapp_screening_message_tenant_guard
before insert or update on public.whatsapp_screening_messages
for each row execute function public.enforce_whatsapp_screening_message_tenant();

create or replace function public.claim_whatsapp_screening_event(
  p_event_key text,
  p_webhook_event_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_row jsonb;
begin
  insert into public.whatsapp_screening_event_processing (
    event_key,
    webhook_event_id,
    status,
    attempt_count,
    created_at,
    updated_at
  ) values (
    p_event_key,
    p_webhook_event_id,
    'processing',
    1,
    now(),
    now()
  )
  on conflict (event_key) do update
  set
    webhook_event_id = coalesce(excluded.webhook_event_id, public.whatsapp_screening_event_processing.webhook_event_id),
    status = 'processing',
    attempt_count = public.whatsapp_screening_event_processing.attempt_count + 1,
    error_message = null,
    processed_at = null,
    updated_at = now()
  where (
    public.whatsapp_screening_event_processing.status = 'failed'
    or (
      public.whatsapp_screening_event_processing.status = 'processing'
      and public.whatsapp_screening_event_processing.updated_at < now() - interval '5 minutes'
    )
  )
  and public.whatsapp_screening_event_processing.attempt_count < 10
  returning jsonb_build_object(
    'event_key', public.whatsapp_screening_event_processing.event_key,
    'attempt_count', public.whatsapp_screening_event_processing.attempt_count
  ) into claimed_row;

  return claimed_row;
end;
$$;

alter table public.whatsapp_contact_consents enable row level security;
alter table public.whatsapp_screening_sessions enable row level security;
alter table public.whatsapp_screening_messages enable row level security;
alter table public.whatsapp_screening_event_processing enable row level security;

revoke all on table public.whatsapp_contact_consents from anon, authenticated;
revoke all on table public.whatsapp_screening_sessions from anon, authenticated;
revoke all on table public.whatsapp_screening_messages from anon, authenticated;
revoke all on table public.whatsapp_screening_event_processing from anon, authenticated;

grant select, insert, update on table public.whatsapp_contact_consents to service_role;
grant select, insert, update on table public.whatsapp_screening_sessions to service_role;
grant select, insert, update, delete on table public.whatsapp_screening_messages to service_role;
grant select, insert, update, delete on table public.whatsapp_screening_event_processing to service_role;
grant delete on table public.whatsapp_webhook_events to service_role;

revoke all on function public.claim_whatsapp_screening_event(text, uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_screening_event(text, uuid) to service_role;

commit;
