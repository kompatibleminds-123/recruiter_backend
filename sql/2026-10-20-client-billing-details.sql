begin;

alter table public.company_clients
  add column if not exists billing_legal_name text not null default '',
  add column if not exists billing_address text not null default '',
  add column if not exists billing_gstin text not null default '',
  add column if not exists billing_state text not null default '',
  add column if not exists billing_state_code text not null default '';

commit;
