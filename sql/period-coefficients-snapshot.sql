-- VISIO360 - Dönem Bazlı Katsayı Snapshot (Kilitleme)
-- Supabase SQL Editor'da çalıştırın. İdempotent olacak şekilde yazılmıştır.

create extension if not exists "pgcrypto";

-- 1) Dönem bazlı değerlendirici ağırlıkları
create table if not exists public.evaluation_period_evaluator_weights (
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  position_level text not null,
  weight numeric not null default 1,
  description text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (period_id, position_level)
);

-- 2) Dönem bazlı kategori ağırlıkları
create table if not exists public.evaluation_period_category_weights (
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  category_name text not null,
  weight numeric not null default 1,
  is_critical boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (period_id, category_name)
);

-- 3) Dönem bazlı skorlama ayarları (güven + sapma + standart etkisi)
create table if not exists public.evaluation_period_scoring_settings (
  period_id uuid primary key references public.evaluation_periods(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  min_high_confidence_evaluator_count smallint not null default 5,
  lenient_diff_threshold numeric not null default 0.75,
  harsh_diff_threshold numeric not null default 0.75,
  lenient_multiplier numeric not null default 0.85,
  harsh_multiplier numeric not null default 1.15,
  standard_weight numeric not null default 0.15,
  snapshotted_at timestamptz not null default now()
);

-- 4) Snapshot fonksiyonu: dönem için mevcut org katsayılarını/ayarlarını kopyalar
-- Not: org override varsa onu alır, yoksa default (organization_id is null) kullanır.
create or replace function public.snapshot_period_coefficients(p_period_id uuid, p_overwrite boolean default true)
returns void
language plpgsql
security definer
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id
  from public.evaluation_periods
  where id = p_period_id;

  if v_org_id is null then
    raise exception 'Period not found: %', p_period_id;
  end if;

  if p_overwrite then
    delete from public.evaluation_period_evaluator_weights where period_id = p_period_id;
    delete from public.evaluation_period_category_weights where period_id = p_period_id;
    delete from public.evaluation_period_scoring_settings where period_id = p_period_id;
  end if;

  -- evaluator weights (distinct per position_level, prefer org, newest wins)
  insert into public.evaluation_period_evaluator_weights(period_id, position_level, weight, description)
  select
    p_period_id as period_id,
    x.position_level,
    x.weight,
    x.description
  from (
    select distinct on (position_level)
      position_level,
      weight,
      description
    from (
      select position_level, weight, description, 0 as prio, created_at
      from public.evaluator_weights
      where organization_id = v_org_id
      union all
      select position_level, weight, description, 1 as prio, created_at
      from public.evaluator_weights
      where organization_id is null
    ) t
    order by position_level, prio asc, created_at desc
  ) x;

  -- category weights (distinct per category_name, prefer org)
  insert into public.evaluation_period_category_weights(period_id, category_name, weight, is_critical)
  select
    p_period_id as period_id,
    x.category_name,
    x.weight,
    x.is_critical
  from (
    select distinct on (category_name)
      category_name,
      weight,
      is_critical
    from (
      select category_name, weight, is_critical, 0 as prio, created_at
      from public.category_weights
      where organization_id = v_org_id
      union all
      select category_name, weight, is_critical, 1 as prio, created_at
      from public.category_weights
      where organization_id is null
    ) t
    order by category_name, prio asc, created_at desc
  ) x;

  -- scoring settings (org row, fall back to defaults)
  insert into public.evaluation_period_scoring_settings(
    period_id,
    organization_id,
    min_high_confidence_evaluator_count,
    lenient_diff_threshold,
    harsh_diff_threshold,
    lenient_multiplier,
    harsh_multiplier,
    standard_weight,
    snapshotted_at
  )
  select
    p_period_id,
    v_org_id,
    coalesce(c.min_high_confidence_evaluator_count, 5),
    coalesce(d.lenient_diff_threshold, 0.75),
    coalesce(d.harsh_diff_threshold, 0.75),
    coalesce(d.lenient_multiplier, 0.85),
    coalesce(d.harsh_multiplier, 1.15),
    0.15,
    now()
  from (select 1) one
  left join public.confidence_settings c on c.organization_id = v_org_id
  left join public.deviation_settings d on d.organization_id = v_org_id;
end;
$$;

-- 5) KVKK/Security: client rollerine kapat (service_role server-side kullanır)
alter table public.evaluation_period_evaluator_weights enable row level security;
alter table public.evaluation_period_category_weights enable row level security;
alter table public.evaluation_period_scoring_settings enable row level security;

do $$
begin
  -- deny-all policies
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_period_evaluator_weights') then
    create policy "deny all" on public.evaluation_period_evaluator_weights for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_period_category_weights') then
    create policy "deny all" on public.evaluation_period_category_weights for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_period_scoring_settings') then
    create policy "deny all" on public.evaluation_period_scoring_settings for all using (false) with check (false);
  end if;
exception when others then
  -- ignore if policies already exist with same name in some environments
  null;
end $$;

revoke all on public.evaluation_period_evaluator_weights from anon, authenticated;
revoke all on public.evaluation_period_category_weights from anon, authenticated;
revoke all on public.evaluation_period_scoring_settings from anon, authenticated;
