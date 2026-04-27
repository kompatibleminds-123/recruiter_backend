-- Run this in Supabase SQL editor (service role) once after deploying code.
-- This only adds the columns required for first-assignment tracking.
--
-- NOTE:
-- We intentionally do NOT backfill `first_assigned_*` for old rows because that
-- would destroy any chance of correctly detecting reassignments for candidates
-- that are already mid-workflow. After this schema is present, the backend will
-- set `first_assigned_*` on the next assign/reassign using the previously-stored
-- `assigned_*` values when available.

alter table public.candidates add column if not exists first_assigned_to_user_id uuid;
alter table public.candidates add column if not exists first_assigned_to_name text;
alter table public.candidates add column if not exists first_assigned_at timestamptz;
alter table public.candidates add column if not exists first_assigned_by_user_id uuid;
alter table public.candidates add column if not exists first_assigned_by_name text;
