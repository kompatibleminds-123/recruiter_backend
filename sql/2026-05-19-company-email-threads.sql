create table if not exists public.company_email_threads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  conversation_key text not null,
  provider_mode text not null default '',
  last_subject text not null default '',
  last_message_id text,
  last_thread_id text,
  last_to text not null default '',
  last_cc text not null default '',
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create unique index if not exists company_email_threads_company_key_idx
  on public.company_email_threads (company_id, conversation_key);

create index if not exists company_email_threads_updated_at_idx
  on public.company_email_threads (updated_at desc);
