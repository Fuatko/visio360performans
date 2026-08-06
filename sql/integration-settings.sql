-- Integration settings — per-platform connection config (InspiraSuite, ...)
-- Idempotent migration.
--
-- NOT: Bu repoda admin erişimi service-role anahtarıyla + kendi oturum çerezi
-- (visio360_session) üzerinden yapılır; Supabase Auth (auth.uid) kullanılmaz.
-- Bu yüzden RLS açık tutulur ama public policy tanımlanmaz — tüm okuma/yazma
-- yalnızca sunucudaki service-role route'ları üzerinden (super_admin doğrulaması ile) gider.

create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  platform text unique not null,
  base_url text,
  api_key text,
  webhook_secret text,
  is_active boolean default false,
  settings jsonb default '{}'::jsonb,
  last_tested_at timestamptz,
  last_test_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.integration_settings enable row level security;

-- Başlangıç verisi
insert into public.integration_settings (platform, base_url, is_active)
values ('inspirasuite', 'https://www.inspirasuite.com', false)
on conflict (platform) do nothing;
