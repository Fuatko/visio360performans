-- VISIO360 - Uluslararası Standartlar / Uyum Değerlendirme
-- Supabase SQL Editor'da çalıştırın (bir kez).
--
-- Amaç:
-- 1) Kurum bazlı standart tanımı (international_standards)
-- 2) Her değerlendirme (assignment) için standart puanları + gerekçe (international_standard_scores)
--
-- Not:
-- - KVKK filtrelemesini uygulama tarafında org/period seçimine göre yapıyoruz.
-- - RLS kullanıyorsanız ayrıca policy'leri tanımlamanız gerekir.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1) Standart tanımları (org bazlı)
create table if not exists public.international_standards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text null, -- örn: "1.1", "2.1" gibi
  title text not null,
  description text null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Idempotent ALTER (eski sürüm tablo varsa)
alter table public.international_standards
  add column if not exists code text null;

alter table public.international_standards
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists international_standards_org_title_uniq
  on public.international_standards(organization_id, title);

create index if not exists international_standards_org_active_sort_idx
  on public.international_standards(organization_id, is_active, sort_order);

drop trigger if exists trg_international_standards_updated_at on public.international_standards;
create trigger trg_international_standards_updated_at
before update on public.international_standards
for each row execute function public.set_updated_at();

-- 2) Her değerlendirme (assignment) için standart puanları (1..5 + gerekçe)
create table if not exists public.international_standard_scores (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.evaluation_assignments(id) on delete cascade,
  standard_id uuid not null references public.international_standards(id) on delete cascade,
  score smallint not null check (score >= 1 and score <= 5),
  justification text null,
  created_at timestamptz not null default now(),
  unique (assignment_id, standard_id)
);

alter table public.international_standard_scores
  add column if not exists justification text null;

create index if not exists international_standard_scores_assignment_idx
  on public.international_standard_scores(assignment_id);

create index if not exists international_standard_scores_standard_idx
  on public.international_standard_scores(standard_id);

