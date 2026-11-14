begin;

drop index if exists public.whatsapp_screening_one_interactive_session_idx;

create unique index whatsapp_screening_one_interactive_session_idx
  on public.whatsapp_screening_sessions (phone_number_id, candidate_wa_id)
  where status in (
    'creating', 'template_sent', 'awaiting_interest', 'awaiting_current_ctc',
    'awaiting_expected_ctc', 'awaiting_notice_period', 'awaiting_recruiter_call',
    'awaiting_call_time', 'awaiting_confirmation', 'human_takeover'
  );

commit;
