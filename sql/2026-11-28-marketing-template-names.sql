alter table marketing_templates
  add column if not exists template_name text;

update marketing_templates
set template_name = subject
where coalesce(trim(template_name), '') = ''
  and coalesce(trim(subject), '') <> '';
