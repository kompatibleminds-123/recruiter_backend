create table if not exists public.whatsapp_notes (
  id uuid primary key,
  phone_number text not null,
  name text,
  company text,
  role text,
  notes text,
  action_items text,
  raw_message text,
  source text not null default 'whatsapp_cloud_api',
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_notes_phone_number_idx
  on public.whatsapp_notes (phone_number);

create index if not exists whatsapp_notes_created_at_idx
  on public.whatsapp_notes (created_at desc);
