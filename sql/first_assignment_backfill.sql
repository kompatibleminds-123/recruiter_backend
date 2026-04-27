-- Run this in Supabase SQL editor (service role) once after deploying code.
-- It adds first-assignment fields and backfills them for already-assigned candidates.

alter table public.candidates add column if not exists first_assigned_to_user_id uuid;
alter table public.candidates add column if not exists first_assigned_to_name text;
alter table public.candidates add column if not exists first_assigned_at timestamptz;
alter table public.candidates add column if not exists first_assigned_by_user_id uuid;
alter table public.candidates add column if not exists first_assigned_by_name text;

update public.candidates
set
  first_assigned_to_user_id = assigned_to_user_id,
  first_assigned_to_name = assigned_to_name,
  first_assigned_at = assigned_at,
  first_assigned_by_user_id = assigned_by_user_id,
  first_assigned_by_name = assigned_by_name
where
  first_assigned_to_user_id is null
  and assigned_to_user_id is not null;

