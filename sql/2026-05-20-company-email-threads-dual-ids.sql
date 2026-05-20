alter table if exists public.company_email_threads
  add column if not exists last_mail_id text;

alter table if exists public.company_email_threads
  add column if not exists last_internet_message_id text;

create index if not exists company_email_threads_last_mail_id_idx
  on public.company_email_threads (last_mail_id);
