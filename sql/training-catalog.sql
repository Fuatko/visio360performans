-- Training Catalog (Eğitim Kataloğu)
-- Idempotent migration for Supabase Postgres.

create extension if not exists pgcrypto;

create table if not exists public.training_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete cascade,
  area text not null default '',
  title text not null,
  provider text null,
  url text null,
  language text null, -- 'tr' | 'en' | 'fr' (optional)
  duration_weeks int null,
  hours int null,
  level text null, -- beginner/intermediate/advanced (optional)
  tags text[] null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists training_catalog_org_idx on public.training_catalog(organization_id);
create index if not exists training_catalog_area_idx on public.training_catalog(area);
create index if not exists training_catalog_active_idx on public.training_catalog(is_active);

