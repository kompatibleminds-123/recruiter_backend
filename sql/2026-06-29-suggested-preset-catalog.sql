create table if not exists public.preset_templates (
  id text primary key,
  label text not null default '',
  columns text not null default '',
  active boolean not null default true,
  scope text not null default 'global_suggested',
  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by text not null default ''
);

create table if not exists public.company_preset_overrides (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  preset_id text not null references public.preset_templates(id) on delete cascade,
  label text not null default '',
  columns text not null default '',
  hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  unique (company_id, preset_id)
);

create index if not exists idx_preset_templates_scope_sort
  on public.preset_templates(scope, sort_order);

create index if not exists idx_company_preset_overrides_company
  on public.company_preset_overrides(company_id);

insert into public.preset_templates (id, label, columns, active, scope, sort_order, updated_by)
values
  (
    'compact_recruiter',
    'Default recruiter exports',
    'S.No.|s_no
Name|name
Ph|phone
Email|email
Current Company|current_company
Current Designation|current_designation
Total Experience|total_experience
Tenure in current company|current_org_tenure
Location|location
Reason of change|reason_of_change
Status|status
Current CTC|current_ctc
Expected CTC|expected_ctc
Notice Period|notice_period
Other Standard Questions|other_standard_questions
Remarks|remarks
LinkedIn|linkedin',
    true,
    'global_suggested',
    0,
    'system'
  ),
  (
    'client_tracker',
    'Internal tracker',
    'Client Name|client_name
Target Role / Open Position|jd_title
Key Skills Required|key_skills_required
Assigned to|recruiter_name
Date Added|date_added
Candidate Name|name
Status|status
Contact No.|phone
Email ID|email
Location|location
Current Company|current_company
Current Designation|current_designation
Domain / Industry|domain_industry
Work Exp (Total years/months)|total_experience
Highest Education|highest_education
Current CTC|current_ctc
Expected CTC|expected_ctc
Notice Period|notice_period
Remarks / Notes|remarks
LinkedIn Profile Link (Optional)|linkedin',
    true,
    'global_suggested',
    1,
    'system'
  ),
  (
    'client_submission',
    'Client submission',
    'S.No.|s_no
Name|name
Ph|phone
Email|email
Current Company|current_company
Current Designation|current_designation
Total Experience|total_experience
Strong Points|other_pointers
Remarks|remarks',
    true,
    'global_suggested',
    2,
    'system'
  ),
  (
    'screening_focus',
    'Screening focus',
    'S.No.|s_no
Name|name
Current CTC|current_ctc
Expected CTC|expected_ctc
Notice Period|notice_period
Screening Answers|other_standard_questions
Remarks|remarks',
    true,
    'global_suggested',
    3,
    'system'
  )
on conflict (id) do update
set
  label = excluded.label,
  columns = excluded.columns,
  active = excluded.active,
  scope = excluded.scope,
  sort_order = excluded.sort_order;
