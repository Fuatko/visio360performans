-- Kurum bazlı matris arayüz profili (additive, mevcut veriyi bozmaz)
-- Supabase SQL Editor → postgres rolü

alter table public.organizations
  add column if not exists settings jsonb null;

comment on column public.organizations.settings is
  'Kurum tercihleri: { "matrix_profile": "school_full" | "standard_360" }';

-- Mevcut kurumlar: okul senaryosu (bugünkü davranış)
update public.organizations
set settings = coalesce(settings, '{}'::jsonb) || '{"matrix_profile":"school_full"}'::jsonb
where settings is null
   or settings->>'matrix_profile' is null;
