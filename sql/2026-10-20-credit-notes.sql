begin;

alter table public.invoices
  add column if not exists updated_by uuid null,
  add column if not exists revision_count integer not null default 0;

create table if not exists public.credit_notes (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_year text not null,
  credit_note_number text not null,
  credit_note_date date not null,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  invoice_number text not null,
  client_id uuid null references public.company_clients(id) on delete set null,
  client_name text not null,
  reason text not null default '',
  taxable_amount numeric(16,2) not null default 0,
  gst_rate numeric(8,4) not null default 0,
  tax_mode text not null default 'none' check (tax_mode in ('igst', 'cgst_sgst', 'none')),
  cgst_amount numeric(16,2) not null default 0,
  sgst_amount numeric(16,2) not null default 0,
  igst_amount numeric(16,2) not null default 0,
  total_amount numeric(16,2) not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  file_provider text not null default '',
  file_key text not null default '',
  file_url text not null default '',
  file_name text not null default '',
  file_mime_type text not null default 'application/pdf',
  file_size_bytes bigint not null default 0,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, financial_year, credit_note_number)
);

create index if not exists credit_notes_company_fy_date_idx on public.credit_notes(company_id, financial_year, credit_note_date desc);
create index if not exists credit_notes_invoice_id_idx on public.credit_notes(invoice_id);

alter table public.credit_notes enable row level security;

commit;
