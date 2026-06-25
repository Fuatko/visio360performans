-- Platform geneli: kurum admini sonuç raporları bakım modu (süper admin API ile aç/kapa).
-- Son kullanıcı kendi raporu: evaluation_periods.results_released (Dönemler → Sonuçları yayınla).
-- Supabase SQL Editor → postgres rolü ile bir kez çalıştırın.

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null references public.users(id) on delete set null
);

comment on table public.platform_settings is
  'Platform ayarları (yalnızca service role / admin API). key=admin_reports_maintenance → {"enabled":true|false}';

alter table public.platform_settings enable row level security;

drop policy if exists platform_settings_deny_all on public.platform_settings;
create policy platform_settings_deny_all on public.platform_settings
  for all to authenticated, anon using (false) with check (false);

insert into public.platform_settings (key, value)
values
  ('admin_reports_maintenance', '{"enabled":false}'::jsonb),
  ('admin_reports_catalog_config', '{"sections":{}}'::jsonb)
on conflict (key) do nothing;
