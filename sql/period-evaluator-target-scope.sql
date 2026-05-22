-- Değerlendiren + hedef (matris satırı) bazlı soru kapsamı istisnası
-- Örn. İK Müdürü → çoğu kişide 2 genel alt kategori; 3 formatörde + Formatör görev paketi

create table if not exists public.evaluation_period_evaluator_target_scope (
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  evaluator_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  restrict_period boolean not null default false,
  duty_mode text not null default 'full' check (duty_mode in ('full', 'categories', 'none')),
  duty_package_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (period_id, evaluator_id, target_id)
);

create table if not exists public.evaluation_period_evaluator_target_categories (
  id uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.evaluation_periods(id) on delete cascade,
  evaluator_id uuid not null references public.users(id) on delete cascade,
  target_id uuid not null references public.users(id) on delete cascade,
  category_id uuid not null,
  scope_kind text not null check (scope_kind in ('period', 'duty')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (period_id, evaluator_id, target_id, category_id, scope_kind)
);

create index if not exists evaluation_period_evaluator_target_scope_period_eval_idx
  on public.evaluation_period_evaluator_target_scope (period_id, evaluator_id);

revoke all on table public.evaluation_period_evaluator_target_scope from anon, authenticated;
revoke all on table public.evaluation_period_evaluator_target_categories from anon, authenticated;
