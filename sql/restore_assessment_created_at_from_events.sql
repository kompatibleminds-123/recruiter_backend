-- Purpose: restore `assessments.created_at` (aka generatedAt) when it was accidentally
-- collapsed to a single timestamp (e.g. 2026-04-26 20:20:47) by bulk upserts.
--
-- Strategy:
-- 1) Prefer the earliest factual assessment event as the "creation/share" moment.
--    We look for the first status_updated event with previousStatus empty and status CV shared.
-- 2) If events are missing (older rows), fall back to the earliest `statusHistory.at` in
--    `assessments.payload` when it indicates conversion ("CV shared"/converted note).
--
-- Review the SELECT first, then run the UPDATE.

-- 1) Preview candidates for restore
with first_share_event as (
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
),
first_share_payload as (
  select
    a.id as assessment_id,
    min((elem->>'at')::timestamptz) as first_shared_at
  from public.assessments a
  cross join lateral jsonb_array_elements(coalesce(a.payload->'statusHistory', '[]'::jsonb)) as elem
  where
    (elem ? 'at')
    and (
      lower(coalesce(elem->>'status','')) = 'cv shared'
      or position('converted into assessment' in lower(coalesce(elem->>'notes',''))) > 0
    )
  group by a.id
),
first_share as (
  select
    a.id as assessment_id,
    coalesce(ev.first_shared_at, pl.first_shared_at) as first_shared_at
  from public.assessments a
  left join first_share_event ev on ev.assessment_id = a.id
  left join first_share_payload pl on pl.assessment_id = a.id
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
-- with first_share_event as (
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
-- ),
-- first_share_payload as (
--   select
--     a.id as assessment_id,
--     min((elem->>'at')::timestamptz) as first_shared_at
--   from public.assessments a
--   cross join lateral jsonb_array_elements(coalesce(a.payload->'statusHistory', '[]'::jsonb)) as elem
--   where
--     (elem ? 'at')
--     and (
--       lower(coalesce(elem->>'status','')) = 'cv shared'
--       or position('converted into assessment' in lower(coalesce(elem->>'notes',''))) > 0
--     )
--   group by a.id
-- ),
-- first_share as (
--   select
--     a.id as assessment_id,
--     coalesce(ev.first_shared_at, pl.first_shared_at) as first_shared_at
--   from public.assessments a
--   left join first_share_event ev on ev.assessment_id = a.id
--   left join first_share_payload pl on pl.assessment_id = a.id
-- )
-- update public.assessments a
-- set created_at = fs.first_shared_at
-- from first_share fs
-- where fs.assessment_id = a.id;
