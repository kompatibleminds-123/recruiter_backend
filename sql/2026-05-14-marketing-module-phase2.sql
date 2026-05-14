alter table if exists marketing_prospects
  add column if not exists category text default '';

alter table if exists marketing_prospects
  add column if not exists categories jsonb not null default '[]'::jsonb;

alter table if exists marketing_templates
  add column if not exists target_categories jsonb not null default '[]'::jsonb;

create index if not exists idx_marketing_prospects_category
  on marketing_prospects(company_id, category);
