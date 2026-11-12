begin;

create extension if not exists pgcrypto;

create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  object_type text not null default 'whatsapp_business_account',
  event_type text not null check (event_type in ('message', 'status', 'change')),
  waba_id text,
  phone_number_id text,
  meta_message_id text,
  sender_wa_id text,
  recipient_wa_id text,
  message_type text,
  delivery_status text,
  event_timestamp timestamptz,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_events_received_at_idx
  on public.whatsapp_webhook_events (received_at desc);

create index if not exists whatsapp_webhook_events_phone_number_id_idx
  on public.whatsapp_webhook_events (phone_number_id, received_at desc);

create index if not exists whatsapp_webhook_events_meta_message_id_idx
  on public.whatsapp_webhook_events (meta_message_id)
  where meta_message_id is not null;

alter table public.whatsapp_webhook_events enable row level security;

revoke all on table public.whatsapp_webhook_events from anon, authenticated;
grant select, insert on table public.whatsapp_webhook_events to service_role;

commit;
