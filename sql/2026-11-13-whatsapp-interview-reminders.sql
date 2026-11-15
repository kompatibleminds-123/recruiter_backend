begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.companies') is null
     or to_regclass('public.users') is null
     or to_regclass('public.candidates') is null
     or to_regclass('public.assessments') is null
     or to_regclass('public.company_jobs') is null then
    raise exception 'WhatsApp interview reminders require companies, users, candidates, assessments and company_jobs tables.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'candidates' and column_name = 'company_id' and data_type = 'uuid'
  ) then
    raise exception 'WhatsApp interview reminders require candidates.company_id uuid.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'assessments' and column_name = 'candidate_id' and data_type = 'uuid'
  ) then
    raise exception 'WhatsApp interview reminders require assessments.candidate_id uuid.';
  end if;
end;
$$;

create table if not exists public.whatsapp_interview_reminders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  assigned_jd_id uuid references public.company_jobs(id) on delete set null,
  recruiter_id uuid references public.users(id) on delete set null,
  recruiter_name text not null default '',
  candidate_name text not null,
  candidate_wa_id text not null,
  job_title text not null,
  company_name text not null,
  phone_number_id text not null,
  interview_at timestamptz not null,
  interview_timezone text not null default 'Asia/Kolkata',
  scheduled_send_at timestamptz not null,
  enabled boolean not null default true,
  status text not null default 'scheduled' check (status in (
    'scheduled', 'sending', 'awaiting_response', 'confirmed', 'review_required',
    'skipped', 'failed', 'superseded', 'cancelled'
  )),
  template_name text not null default 'km_interview_reminder',
  template_language text not null default 'en',
  initial_message_id text,
  claim_token uuid,
  claimed_at timestamptz,
  sent_at timestamptz,
  confirmed_at timestamptz,
  review_required_at timestamptz,
  review_reason text,
  review_resolved_at timestamptz,
  review_resolved_by uuid references public.users(id) on delete set null,
  resolution_note text,
  skipped_reason text,
  failed_at timestamptz,
  last_error text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  superseded_at timestamptz,
  superseded_by_id uuid references public.whatsapp_interview_reminders(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_id, interview_at)
);

create index if not exists whatsapp_interview_reminders_due_idx
  on public.whatsapp_interview_reminders (status, enabled, scheduled_send_at);

create index if not exists whatsapp_interview_reminders_assessment_idx
  on public.whatsapp_interview_reminders (company_id, assessment_id, created_at desc);

create index if not exists whatsapp_interview_reminders_lookup_idx
  on public.whatsapp_interview_reminders (phone_number_id, candidate_wa_id, status, updated_at desc);

create unique index if not exists whatsapp_interview_reminders_message_id_idx
  on public.whatsapp_interview_reminders (initial_message_id)
  where initial_message_id is not null;

create table if not exists public.whatsapp_interview_reminder_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  reminder_id uuid not null references public.whatsapp_interview_reminders(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  candidate_id uuid not null references public.candidates(id) on delete cascade,
  assigned_jd_id uuid references public.company_jobs(id) on delete set null,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender_type text not null check (sender_type in ('candidate', 'automation', 'recruiter')),
  message_type text not null default 'text',
  body text not null default '',
  meta_message_id text,
  webhook_event_key text,
  delivery_status text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists whatsapp_interview_reminder_messages_meta_id_idx
  on public.whatsapp_interview_reminder_messages (meta_message_id)
  where meta_message_id is not null;

create unique index if not exists whatsapp_interview_reminder_messages_event_key_idx
  on public.whatsapp_interview_reminder_messages (webhook_event_key)
  where webhook_event_key is not null;

create index if not exists whatsapp_interview_reminder_messages_reminder_idx
  on public.whatsapp_interview_reminder_messages (reminder_id, created_at asc);

create table if not exists public.whatsapp_interview_event_processing (
  event_key text primary key,
  reminder_id uuid references public.whatsapp_interview_reminders(id) on delete set null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'ignored', 'failed')),
  attempt_count integer not null default 1,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.whatsapp_interview_event_processing
  add column if not exists attempt_count integer not null default 1;

create or replace function public.enforce_whatsapp_interview_reminder_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  linked_company_id uuid;
  linked_candidate_id uuid;
begin
  select company_id, candidate_id into linked_company_id, linked_candidate_id
  from public.assessments
  where id = new.assessment_id;
  if linked_company_id is distinct from new.company_id then
    raise exception 'WhatsApp interview reminder assessment must belong to the same company.';
  end if;
  if linked_candidate_id is distinct from new.candidate_id then
    raise exception 'WhatsApp interview reminder candidate must match the assessment candidate.';
  end if;
  select company_id into linked_company_id from public.candidates where id = new.candidate_id;
  if linked_company_id is distinct from new.company_id then
    raise exception 'WhatsApp interview reminder candidate must belong to the same company.';
  end if;
  if new.assigned_jd_id is not null then
    select company_id into linked_company_id from public.company_jobs where id = new.assigned_jd_id;
    if linked_company_id is distinct from new.company_id then
      raise exception 'WhatsApp interview reminder job must belong to the same company.';
    end if;
  end if;
  if new.recruiter_id is not null then
    select company_id into linked_company_id from public.users where id = new.recruiter_id;
    if linked_company_id is distinct from new.company_id then
      raise exception 'WhatsApp interview reminder recruiter must belong to the same company.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.claim_whatsapp_interview_reminder_event(
  p_event_key text,
  p_reminder_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_row jsonb;
begin
  insert into public.whatsapp_interview_event_processing (
    event_key,
    reminder_id,
    status,
    attempt_count,
    created_at,
    updated_at
  ) values (
    p_event_key,
    p_reminder_id,
    'processing',
    1,
    now(),
    now()
  )
  on conflict (event_key) do update
  set
    reminder_id = coalesce(excluded.reminder_id, public.whatsapp_interview_event_processing.reminder_id),
    status = 'processing',
    attempt_count = public.whatsapp_interview_event_processing.attempt_count + 1,
    error_message = null,
    processed_at = null,
    updated_at = now()
  where (
    public.whatsapp_interview_event_processing.status = 'failed'
    or (
      public.whatsapp_interview_event_processing.status = 'processing'
      and public.whatsapp_interview_event_processing.updated_at < now() - interval '5 minutes'
    )
  )
  and public.whatsapp_interview_event_processing.attempt_count < 10
  returning jsonb_build_object(
    'event_key', public.whatsapp_interview_event_processing.event_key,
    'attempt_count', public.whatsapp_interview_event_processing.attempt_count
  ) into claimed_row;

  return claimed_row;
end;
$$;

drop trigger if exists whatsapp_interview_reminder_tenant_guard on public.whatsapp_interview_reminders;
create trigger whatsapp_interview_reminder_tenant_guard
before insert or update on public.whatsapp_interview_reminders
for each row execute function public.enforce_whatsapp_interview_reminder_tenant();

create or replace function public.enforce_whatsapp_interview_message_tenant()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  linked_reminder public.whatsapp_interview_reminders%rowtype;
begin
  select * into linked_reminder from public.whatsapp_interview_reminders where id = new.reminder_id;
  if linked_reminder.id is null
     or linked_reminder.company_id is distinct from new.company_id
     or linked_reminder.assessment_id is distinct from new.assessment_id
     or linked_reminder.candidate_id is distinct from new.candidate_id
     or linked_reminder.assigned_jd_id is distinct from new.assigned_jd_id then
    raise exception 'WhatsApp interview message must match its reminder tenant and links.';
  end if;
  return new;
end;
$$;

drop trigger if exists whatsapp_interview_message_tenant_guard on public.whatsapp_interview_reminder_messages;
create trigger whatsapp_interview_message_tenant_guard
before insert or update on public.whatsapp_interview_reminder_messages
for each row execute function public.enforce_whatsapp_interview_message_tenant();

create or replace function public.claim_due_whatsapp_interview_reminders(
  p_now timestamptz,
  p_window_start timestamptz,
  p_limit integer,
  p_claim_token uuid
)
returns setof public.whatsapp_interview_reminders
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id
    from public.whatsapp_interview_reminders
    where enabled = true
      and status = 'scheduled'
      and scheduled_send_at <= p_now
      and scheduled_send_at >= p_window_start
    order by scheduled_send_at asc
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 25), 100))
  )
  update public.whatsapp_interview_reminders reminder
  set status = 'sending',
      claim_token = p_claim_token,
      claimed_at = p_now,
      updated_at = p_now
  from due
  where reminder.id = due.id
  returning reminder.*;
end;
$$;

alter table public.whatsapp_interview_reminders enable row level security;
alter table public.whatsapp_interview_reminder_messages enable row level security;
alter table public.whatsapp_interview_event_processing enable row level security;

revoke all on table public.whatsapp_interview_reminders from anon, authenticated;
revoke all on table public.whatsapp_interview_reminder_messages from anon, authenticated;
revoke all on table public.whatsapp_interview_event_processing from anon, authenticated;
revoke all on function public.claim_due_whatsapp_interview_reminders(timestamptz, timestamptz, integer, uuid) from public, anon, authenticated;
revoke all on function public.claim_whatsapp_interview_reminder_event(text, uuid) from public, anon, authenticated;

grant select, insert, update on table public.whatsapp_interview_reminders to service_role;
grant select, insert, update, delete on table public.whatsapp_interview_reminder_messages to service_role;
grant select, insert, update, delete on table public.whatsapp_interview_event_processing to service_role;
grant execute on function public.claim_due_whatsapp_interview_reminders(timestamptz, timestamptz, integer, uuid) to service_role;
grant execute on function public.claim_whatsapp_interview_reminder_event(text, uuid) to service_role;

commit;
