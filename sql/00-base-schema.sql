-- VISIO360 - Temel Şema
-- Diğer tüm migration'lardan ÖNCE çalıştırılmalı.
-- organizations ve users tablolarını oluşturur.
-- Idempotent: birden fazla kez çalıştırılabilir.

create extension if not exists pgcrypto;

-- 1) Kurumlar
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_base64 text null,
  logo_url text null,
  created_at timestamptz not null default now()
);

-- 2) Kullanıcılar
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text null,
  organization_id uuid null references public.organizations(id) on delete set null,
  title text null,
  department text null,
  manager_id uuid null,
  position_level text not null default 'peer' check (position_level in ('executive','manager','peer','subordinate')),
  role text not null default 'user' check (role in ('super_admin','org_admin','user')),
  status text not null default 'active' check (status in ('active','inactive')),
  preferred_language text not null default 'tr' check (preferred_language in ('tr','en','fr')),
  created_at timestamptz not null default now()
);

create index if not exists users_org_idx on public.users(organization_id);
create index if not exists users_email_idx on public.users(email);

-- 3) Değerlendirme dönemleri
create table if not exists public.evaluation_periods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text null,
  name_fr text null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status text not null default 'inactive' check (status in ('active','inactive','completed')),
  created_at timestamptz not null default now()
);

create index if not exists evaluation_periods_org_idx on public.evaluation_periods(organization_id);
