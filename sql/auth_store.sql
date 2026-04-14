create table if not exists public.companies (
  id uuid primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.users (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  company_name text,
  name text not null,
  email text not null unique,
  role text not null default 'team',
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  token text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.company_jobs (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  client_name text,
  job_description text not null,
  must_have_skills text,
  red_flags text,
  recruiter_notes text,
  standard_questions text,
  jd_shortcuts text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.assessments (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  recruiter_id uuid not null references public.users(id) on delete cascade,
  recruiter_name text,
  recruiter_email text,
  candidate_id uuid,
  candidate_name text,
  phone_number text,
  email_id text,
  client_name text,
  highest_education text,
  current_company text,
  current_designation text,
  total_experience text,
  average_tenure_per_company text,
  current_org_tenure text,
  experience_timeline text,
  jd_title text,
  job_description text,
  must_have_skills text,
  red_flags text,
  jd_shortcuts text,
  standard_questions text,
  recruiter_notes text,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  question_mode text,
  location text,
  linkedin_url text,
  callback_notes text,
  pipeline_stage text,
  candidate_status text,
  follow_up_at text,
  interview_at text,
  offer_amount text,
  offer_doj text,
  status text,
  custom_pipeline_stages text,
  custom_candidate_statuses text,
  custom_hr_candidate_statuses text,
  page_title text,
  page_url text,
  pdf_filename text,
  sections jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  question_answer_pairs jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_users_company_id on public.users(company_id);
create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_company_jobs_company_id on public.company_jobs(company_id);
create index if not exists idx_assessments_company_id on public.assessments(company_id);
create index if not exists idx_assessments_recruiter_id on public.assessments(recruiter_id);
create index if not exists idx_assessments_candidate_id on public.assessments(candidate_id);
create index if not exists idx_assessments_generated_at on public.assessments(generated_at desc);
