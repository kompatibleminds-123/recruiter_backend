create table if not exists public.company_email_thread_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  conversation_key text not null,
  provider_mode text not null default '',
  direction text not null default 'outbound',
  source text not null default 'platform',
  mailbox_email text not null default '',
  subject text not null default '',
  to_emails text not null default '',
  cc_emails text not null default '',
  message_id text,
  thread_id text,
  mail_id text,
  internet_message_id text,
  in_reply_to text,
  reference_ids text not null default '',
  actor_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists company_email_thread_messages_company_key_idx
  on public.company_email_thread_messages (company_id, conversation_key, created_at desc);

create index if not exists company_email_thread_messages_message_idx
  on public.company_email_thread_messages (company_id, message_id);
