-- VISIO360 - Anket kişi bazlı soru atama (esnek: başlık + tekil soru)
-- Amaç: Bir anketin sorularından, belirli bir iç kullanıcıya konu başlığına
-- (kategori) ve/veya tekil soru bazında bir alt küme atamak. Kullanıcı giriş
-- yaptığında yalnızca kendine atanmış soruları görüp cevaplar.
--
-- Etkin soru kümesi = (atanmış başlıkların soruları) ∪ (tekil eklenen sorular).
-- Idempotent: birden fazla kez güvenle çalıştırılabilir. Mevcut anket/yanıt
-- verisine dokunmaz; yalnızca yeni survey_assignment* tabloları ekler.

create extension if not exists pgcrypto;

-- 1) Atama başlığı: bir anket + bir iç kullanıcı
create table if not exists public.survey_assignments (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  -- 'category' sadece başlık, 'question' sadece tekil, 'mixed' ikisi birden
  scope_mode text not null default 'mixed'
    check (scope_mode in ('category', 'question', 'mixed')),
  status text not null default 'assigned'
    check (status in ('assigned', 'completed', 'cancelled')),
  assigned_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(survey_id, user_id)
);

create index if not exists survey_assignments_survey_idx on public.survey_assignments(survey_id);
create index if not exists survey_assignments_user_idx on public.survey_assignments(user_id, status);

-- 2) Atanmış konu başlıkları (kategori metniyle eşleşir: survey_questions.category)
create table if not exists public.survey_assignment_categories (
  assignment_id uuid not null references public.survey_assignments(id) on delete cascade,
  category text not null,
  created_at timestamptz not null default now(),
  primary key(assignment_id, category)
);

-- 3) Tekil eklenen sorular (başlık dışında ek olarak)
create table if not exists public.survey_assignment_questions (
  assignment_id uuid not null references public.survey_assignments(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(assignment_id, question_id)
);

create index if not exists survey_assignment_questions_q_idx on public.survey_assignment_questions(question_id);

-- 4) RLS: servis rolü dışında erişim kapalı (uygulama service-role ile erişir)
alter table public.survey_assignments enable row level security;
alter table public.survey_assignment_categories enable row level security;
alter table public.survey_assignment_questions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='survey_assignments' and policyname='deny all') then
    create policy "deny all" on public.survey_assignments for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='survey_assignment_categories' and policyname='deny all') then
    create policy "deny all" on public.survey_assignment_categories for all using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='survey_assignment_questions' and policyname='deny all') then
    create policy "deny all" on public.survey_assignment_questions for all using (false) with check (false);
  end if;
exception when others then
  null;
end $$;

revoke all on public.survey_assignments from anon, authenticated;
revoke all on public.survey_assignment_categories from anon, authenticated;
revoke all on public.survey_assignment_questions from anon, authenticated;
