-- ============================================================
-- Dönem bazlı görev ve görev bazlı soru paketleri
-- ============================================================
-- Mevcut dönem/soru/cevap verisini değiştirmez.
-- Her hedef kişi, sadece o dönemde atanmış görevlerine göre ek
-- kategori veya tekil soruları görür.
-- ============================================================

create table if not exists public.evaluation_duties (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  name_en text null,
  name_fr text null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(period_id, code)
);

create table if not exists public.evaluation_period_user_duties (
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  duty_id uuid not null references public.evaluation_duties(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(period_id, duty_id, user_id)
);

create table if not exists public.evaluation_period_duty_categories (
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  duty_id uuid not null references public.evaluation_duties(id) on delete cascade,
  category_id uuid not null,
  category_source text not null default 'question_categories'
    check (category_source in ('question_categories', 'categories')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(period_id, duty_id, category_id, category_source)
);

create table if not exists public.evaluation_period_duty_questions (
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  duty_id uuid not null references public.evaluation_duties(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key(period_id, duty_id, question_id)
);

create index if not exists idx_eval_duties_period on public.evaluation_duties(period_id, is_active, sort_order);
create index if not exists idx_eval_period_user_duties_user on public.evaluation_period_user_duties(period_id, user_id, is_active);
create index if not exists idx_eval_period_duty_categories_duty on public.evaluation_period_duty_categories(period_id, duty_id, is_active);
create index if not exists idx_eval_period_duty_questions_duty on public.evaluation_period_duty_questions(period_id, duty_id, is_active);

alter table public.evaluation_duties enable row level security;
alter table public.evaluation_period_user_duties enable row level security;
alter table public.evaluation_period_duty_categories enable row level security;
alter table public.evaluation_period_duty_questions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_duties' and policyname='deny all') then
    create policy "deny all" on public.evaluation_duties for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_period_user_duties' and policyname='deny all') then
    create policy "deny all" on public.evaluation_period_user_duties for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_period_duty_categories' and policyname='deny all') then
    create policy "deny all" on public.evaluation_period_duty_categories for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='evaluation_period_duty_questions' and policyname='deny all') then
    create policy "deny all" on public.evaluation_period_duty_questions for all using (false) with check (false);
  end if;
exception when others then
  -- Ignore duplicate policy names in environments with existing custom policies.
  null;
end $$;

revoke all on public.evaluation_duties from anon, authenticated;
revoke all on public.evaluation_period_user_duties from anon, authenticated;
revoke all on public.evaluation_period_duty_categories from anon, authenticated;
revoke all on public.evaluation_period_duty_questions from anon, authenticated;
