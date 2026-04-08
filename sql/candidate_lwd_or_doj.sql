alter table if exists public.candidates
  add column if not exists lwd_or_doj text;
