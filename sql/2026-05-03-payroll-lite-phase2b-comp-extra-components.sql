-- Phase 2b: extend compensation structure for ESI/LWF/PT component support.

alter table if exists public.employee_compensation_structures
  add column if not exists employer_esi_monthly numeric(14,2) not null default 0,
  add column if not exists employer_esi_annual numeric(14,2) not null default 0,
  add column if not exists employee_esi_monthly numeric(14,2) not null default 0,
  add column if not exists employee_esi_annual numeric(14,2) not null default 0,
  add column if not exists employer_lwf_monthly numeric(14,2) not null default 0,
  add column if not exists employer_lwf_annual numeric(14,2) not null default 0,
  add column if not exists employee_lwf_monthly numeric(14,2) not null default 0,
  add column if not exists employee_lwf_annual numeric(14,2) not null default 0,
  add column if not exists professional_tax_monthly numeric(14,2) not null default 0,
  add column if not exists professional_tax_annual numeric(14,2) not null default 0;

