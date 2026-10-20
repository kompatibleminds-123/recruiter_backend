begin;

alter table public.company_clients
  add column if not exists billing_legal_name text not null default '',
  add column if not exists billing_address text not null default '',
  add column if not exists billing_gstin text not null default '',
  add column if not exists billing_state text not null default '',
  add column if not exists billing_state_code text not null default '';

-- Backfill blank Client Master billing fields from each client's newest saved invoice.
-- Invoice snapshots themselves are never changed.
with latest_invoice_details as (
  select distinct on (i.company_id, lower(trim(i.client_name)))
    i.company_id,
    lower(trim(i.client_name)) as client_key,
    i.client_snapshot,
    i.invoice_snapshot
  from public.invoices i
  where trim(coalesce(i.client_name, '')) <> ''
  order by i.company_id, lower(trim(i.client_name)), i.updated_at desc, i.created_at desc
), source_details as (
  select
    company_id,
    client_key,
    coalesce(nullif(trim(client_snapshot ->> 'legalName'), ''), nullif(trim(invoice_snapshot -> 'clientDetails' ->> 'legalName'), '')) as legal_name,
    coalesce(nullif(trim(client_snapshot ->> 'address'), ''), nullif(trim(invoice_snapshot -> 'clientDetails' ->> 'address'), '')) as address,
    coalesce(nullif(trim(client_snapshot ->> 'gstin'), ''), nullif(trim(invoice_snapshot -> 'clientDetails' ->> 'gstin'), '')) as gstin,
    coalesce(nullif(trim(client_snapshot ->> 'state'), ''), nullif(trim(invoice_snapshot -> 'clientDetails' ->> 'state'), '')) as state,
    coalesce(nullif(trim(client_snapshot ->> 'stateCode'), ''), nullif(trim(invoice_snapshot -> 'clientDetails' ->> 'stateCode'), '')) as state_code
  from latest_invoice_details
)
update public.company_clients c
set
  billing_legal_name = case when trim(c.billing_legal_name) = '' then coalesce(s.legal_name, '') else c.billing_legal_name end,
  billing_address = case when trim(c.billing_address) = '' then coalesce(s.address, '') else c.billing_address end,
  billing_gstin = case when trim(c.billing_gstin) = '' then coalesce(s.gstin, '') else c.billing_gstin end,
  billing_state = case when trim(c.billing_state) = '' then coalesce(s.state, '') else c.billing_state end,
  billing_state_code = case when trim(c.billing_state_code) = '' then coalesce(s.state_code, '') else c.billing_state_code end,
  updated_at = now()
from source_details s
where c.company_id = s.company_id
  and lower(trim(c.name)) = s.client_key;

commit;
