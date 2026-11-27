alter table marketing_campaigns
  add column if not exists audience_type text not null default 'prospect',
  add column if not exists provider text not null default 'legacy',
  add column if not exists brevo_campaign_id bigint,
  add column if not exists brevo_audience_list_id bigint,
  add column if not exists sent_at timestamptz;

create index if not exists idx_marketing_campaigns_brevo_campaign
  on marketing_campaigns(company_id, brevo_campaign_id)
  where brevo_campaign_id is not null;
