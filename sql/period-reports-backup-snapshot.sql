-- ============================================================
-- VISIO360 - Dönem Bazlı Rapor Yedeği (Snapshot / Backup)
-- ============================================================
-- Amaç:
-- - Kişi bazlı "karne" ve değerlendirme ham verisini dönem bazında arşivlemek.
-- - Canlı kullanımda mevcut akışa dokunmadan, sadece ek tablo + API ile güvenli yedek.
--
-- Not:
-- - Bu snapshot "rapor PDF" değil; raporu yeniden üretmeye yetecek JSON ham verisidir.
-- - KVKK/RLS: tablo client rollerine kapalıdır; sadece service_role server-side erişir.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.evaluation_period_user_report_snapshots (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid null references public.organizations(id) on delete cascade,
  snapshot_type text not null default 'raw' check (snapshot_type in ('raw','results','development')),
  payload jsonb not null,
  snapshotted_at timestamptz not null default now(),
  created_by uuid null references public.users(id) on delete set null
);

create unique index if not exists evaluation_period_user_report_snapshots_uidx
  on public.evaluation_period_user_report_snapshots(period_id, target_id, snapshot_type);

create index if not exists evaluation_period_user_report_snapshots_period_idx
  on public.evaluation_period_user_report_snapshots(period_id);

create index if not exists evaluation_period_user_report_snapshots_target_idx
  on public.evaluation_period_user_report_snapshots(target_id);

alter table public.evaluation_period_user_report_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='evaluation_period_user_report_snapshots'
  ) then
    create policy "deny all" on public.evaluation_period_user_report_snapshots
      for all using (false) with check (false);
  end if;
exception when others then
  null;
end $$;

revoke all on public.evaluation_period_user_report_snapshots from anon, authenticated;

