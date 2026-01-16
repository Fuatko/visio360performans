-- VISIO360 - Skorlama Ayarları (Güven Katsayısı + Sapma Düzeltme)
-- Supabase SQL Editor'da bir kez çalıştırın.

create extension if not exists "pgcrypto";

-- 1) Güven ayarları
create table if not exists public.confidence_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  min_high_confidence_evaluator_count smallint not null default 5, -- 5 ve üzeri = yüksek güven
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

-- 2) Sapma düzeltme ayarları
-- Basit kural: evaluator ortalaması, peer ortalamasından çok saparsa çarpan uygula.
create table if not exists public.deviation_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lenient_diff_threshold numeric not null default 0.75, -- eval - peerMean > threshold => "yumuşak"
  harsh_diff_threshold numeric not null default 0.75,   -- peerMean - eval > threshold => "sert"
  lenient_multiplier numeric not null default 0.85,     -- yumuşak düzeltme
  harsh_multiplier numeric not null default 1.15,       -- sert düzeltme
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id)
);

