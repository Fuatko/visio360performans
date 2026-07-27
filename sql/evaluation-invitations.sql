-- VISIO360 - Değerlendirme davet takibi (onay sonrası e-posta gönderimi)
-- Amaç: Bir dönemde değerlendirenlere gönderilen "değerlendirme daveti"
-- e-postalarının kaydı. Admin panelden onaylayıp gönderdikçe buraya yazılır;
-- böylece kime/ne zaman gönderildiği bilinir ve yanlışlıkla tekrar gönderim
-- önlenir. E-posta yalnızca admin "Onayla ve gönder" dediğinde çıkar.
--
-- Idempotent: birden fazla kez güvenle çalıştırılabilir. Mevcut atama/dönem
-- verisine DOKUNMAZ; yalnızca yeni evaluation_invitations tablosu ekler.

create extension if not exists pgcrypto;

create table if not exists public.evaluation_invitations (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  organization_id uuid null references public.organizations(id) on delete set null,
  evaluator_id uuid not null references public.users(id) on delete cascade,
  email text null,
  assignment_count integer not null default 0,
  status text not null default 'sent' check (status in ('sent', 'failed')),
  provider text null,
  sent_by uuid null references public.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Dönem başına bir değerlendirenin tek davet kaydı (tekrar gönderim update eder)
  unique (period_id, evaluator_id)
);

create index if not exists evaluation_invitations_period_idx
  on public.evaluation_invitations(period_id);
create index if not exists evaluation_invitations_evaluator_idx
  on public.evaluation_invitations(evaluator_id);

alter table public.evaluation_invitations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'evaluation_invitations' and policyname = 'deny all'
  ) then
    create policy "deny all" on public.evaluation_invitations for all using (false) with check (false);
  end if;
exception when others then
  null;
end $$;

revoke all on public.evaluation_invitations from anon, authenticated;
