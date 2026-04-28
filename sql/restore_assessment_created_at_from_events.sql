-- Purpose: restore `assessments.created_at` (aka generatedAt) when it was accidentally
-- collapsed to a single timestamp (e.g. 2026-04-26 20:20:47) by bulk upserts.
--
-- Strategy: use the earliest factual assessment event as the "creation/share" moment.
-- We look for the first status_updated event with previousStatus empty and status CV shared.
--
-- Review the SELECT first, then run the UPDATE.

-- 1) Preview candidates for restore
with first_share as (
  select
    assessment_id,
    min(event_at) as first_shared_at
  from public.assessment_events
  where event_type = 'status_updated'
    and lower(coalesce(status, '')) = 'cv shared'
    and (
      payload->>'previousStatus' is null
      or btrim(payload->>'previousStatus') = ''
    )
    and event_at is not null
  group by assessment_id
)
select
  a.id as assessment_id,
  a.created_at as current_created_at,
  fs.first_shared_at as restored_created_at
from public.assessments a
join first_share fs on fs.assessment_id = a.id
where a.created_at is not null
order by a.created_at desc
limit 200;

-- 2) Update (uncomment when ready)
-- with first_share as (
--   select
--     assessment_id,
--     min(event_at) as first_shared_at
--   from public.assessment_events
--   where event_type = 'status_updated'
--     and lower(coalesce(status, '')) = 'cv shared'
--     and (
--       payload->>'previousStatus' is null
--       or btrim(payload->>'previousStatus') = ''
--     )
--     and event_at is not null
--   group by assessment_id
-- )
-- update public.assessments a
-- set created_at = fs.first_shared_at
-- from first_share fs
-- where fs.assessment_id = a.id;

