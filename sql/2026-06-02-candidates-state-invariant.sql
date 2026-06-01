create or replace function public.enforce_candidate_capture_assessment_state()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.hidden_from_captured, false) then
    new.hidden_from_captured := true;
    new.used_in_assessment := false;
    new.assessment_id := null;
  elsif coalesce(new.used_in_assessment, false) or new.assessment_id is not null then
    new.hidden_from_captured := false;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_candidate_capture_assessment_state on public.candidates;

create trigger trg_enforce_candidate_capture_assessment_state
before insert or update on public.candidates
for each row
execute function public.enforce_candidate_capture_assessment_state();

-- Optional one-time cleanup for existing stale rows:
-- update public.candidates
-- set used_in_assessment = false,
--     assessment_id = null,
--     updated_at = now()
-- where hidden_from_captured = true
--   and (used_in_assessment = true or assessment_id is not null);
