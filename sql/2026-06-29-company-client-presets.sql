alter table public.company_clients
  add column if not exists preset_label text not null default '',
  add column if not exists preset_columns text not null default '',
  add column if not exists preset_updated_at timestamptz null,
  add column if not exists preset_updated_by text not null default '';
