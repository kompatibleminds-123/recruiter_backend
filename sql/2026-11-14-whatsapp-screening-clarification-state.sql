begin;

drop index if exists public.whatsapp_screening_one_interactive_session_idx;

create unique index whatsapp_screening_one_interactive_session_idx
  on public.whatsapp_screening_sessions (phone_number_id, candidate_wa_id)
  where status in (
    'creating', 'template_sent', 'awaiting_interest', 'awaiting_current_ctc',
    'awaiting_expected_ctc', 'awaiting_notice_period', 'awaiting_recruiter_call',
    'awaiting_call_time', 'awaiting_additional_input_choice',
    'awaiting_additional_input', 'awaiting_confirmation', 'human_takeover'
  );

create or replace function public.claim_whatsapp_screening_post_completion_ack(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer := 0;
begin
  update public.whatsapp_screening_sessions
  set confirmed_answers = coalesce(confirmed_answers, '{}'::jsonb)
      || jsonb_build_object('_post_completion_ack_sent_at', now()),
      updated_at = now()
  where id = p_session_id
    and status = 'completed'
    and not (coalesce(confirmed_answers, '{}'::jsonb) ? '_post_completion_ack_sent_at');

  get diagnostics updated_count = row_count;
  return updated_count = 1;
end;
$$;

revoke all on function public.claim_whatsapp_screening_post_completion_ack(uuid) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_screening_post_completion_ack(uuid) to service_role;

commit;
