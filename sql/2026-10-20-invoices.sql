begin;

create table if not exists public.invoices (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  financial_year text not null,
  invoice_number text not null,
  invoice_date date not null,
  client_id uuid null references public.company_clients(id) on delete set null,
  client_name text not null,
  candidate_name text not null default '',
  source text not null default 'generated' check (source in ('generated', 'historical')),
  status text not null default 'finalized' check (status in ('draft', 'finalized', 'cancelled')),
  service_description text not null default '',
  annual_ctc numeric(16,2) not null default 0,
  fee_percent numeric(8,4) not null default 0,
  taxable_amount numeric(16,2) not null default 0,
  gst_rate numeric(8,4) not null default 0,
  tax_mode text not null default 'none' check (tax_mode in ('igst', 'cgst_sgst', 'none')),
  cgst_amount numeric(16,2) not null default 0,
  sgst_amount numeric(16,2) not null default 0,
  igst_amount numeric(16,2) not null default 0,
  total_amount numeric(16,2) not null default 0,
  rounded_total numeric(16,2) not null default 0,
  company_snapshot jsonb not null default '{}'::jsonb,
  client_snapshot jsonb not null default '{}'::jsonb,
  invoice_snapshot jsonb not null default '{}'::jsonb,
  file_provider text not null default '',
  file_key text not null default '',
  file_url text not null default '',
  file_name text not null default '',
  file_mime_type text not null default 'application/pdf',
  file_size_bytes bigint not null default 0,
  file_sha256 text not null default '',
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, financial_year, invoice_number)
);

create index if not exists invoices_company_fy_date_idx
  on public.invoices(company_id, financial_year, invoice_date desc);

create index if not exists invoices_company_client_idx
  on public.invoices(company_id, client_id);

create table if not exists public.invoice_items (
  id uuid primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  assessment_id uuid null,
  candidate_id uuid null,
  candidate_name text not null default '',
  description text not null default '',
  annual_ctc numeric(16,2) not null default 0,
  fee_percent numeric(8,4) not null default 0,
  taxable_amount numeric(16,2) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists invoice_items_invoice_id_idx
  on public.invoice_items(invoice_id);

alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;

commit;
