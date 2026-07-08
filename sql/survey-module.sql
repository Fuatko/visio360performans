-- VISIO360 - Anket Yönetimi Modülü (Survey Management)
-- Bağımsız modül: mevcut tablolara (users, evaluation_*, questions ...) DOKUNMAZ.
-- Sadece yeni `surveys` / `survey_*` tabloları oluşturur.
-- Idempotent: birden fazla kez güvenle çalıştırılabilir.
--
-- organizations ve users'a referanslar YALNIZCA `on delete set null` /
-- `on delete cascade` ile kurulmuştur; ana veriye zarar vermez.

create extension if not exists pgcrypto;

-- 1) Anketler
create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid null references public.organizations(id) on delete set null,
  slug text not null unique,
  title text not null,
  title_en text null,
  title_fr text null,
  description text null,
  description_en text null,
  description_fr text null,
  status text not null default 'draft' check (status in ('draft','active','closed')),
  -- Kimler doldurabilir: iç kullanıcı / anonim public link / ikisi de
  access_type text not null default 'both' check (access_type in ('internal','public','both')),
  is_anonymous boolean not null default false,
  start_date date null,
  end_date date null,
  created_by uuid null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists surveys_org_idx on public.surveys(organization_id);
create index if not exists surveys_status_idx on public.surveys(status);

-- 2) Anket soruları
create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  -- likert | single | multi | text | nps | yesno | date | rank
  question_type text not null default 'text'
    check (question_type in ('likert','single','multi','text','nps','yesno','date','rank')),
  text text not null,
  text_en text null,
  text_fr text null,
  -- single/multi/rank için seçenekler; likert/nps için etiketler vb.
  options jsonb null,
  scale_min integer null,
  scale_max integer null,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists survey_questions_survey_idx on public.survey_questions(survey_id);

-- 3) Anket yanıtları (bir katılımcının tek gönderimi)
create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  -- anonim yanıtlarda null kalır
  respondent_user_id uuid null references public.users(id) on delete set null,
  -- 'internal' | 'public'
  source text not null default 'public' check (source in ('internal','public')),
  -- ip-hash, dil, user-agent özeti vb. (PII saklamayız)
  meta jsonb null,
  submitted_at timestamptz not null default now()
);

create index if not exists survey_responses_survey_idx on public.survey_responses(survey_id);
create index if not exists survey_responses_user_idx on public.survey_responses(respondent_user_id);

-- 4) Yanıt kalemleri (soru bazında cevap)
create table if not exists public.survey_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.survey_responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  value_num numeric null,      -- likert / nps / yesno(0-1) / rank pozisyonu
  value_text text null,        -- açık uçlu metin
  value_json jsonb null,       -- multi seçim, sıralama listesi, tarih vb.
  created_at timestamptz not null default now()
);

create index if not exists survey_answers_response_idx on public.survey_answers(response_id);
create index if not exists survey_answers_question_idx on public.survey_answers(question_id);

-- 5) AI analiz önbelleği (maliyet kontrolü — sonuçlar cache'lenir)
create table if not exists public.survey_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  -- swot | sentiment | summary | recommend | trend
  kind text not null check (kind in ('swot','sentiment','summary','recommend','trend')),
  payload jsonb not null,
  model text null,
  response_count integer null,  -- analiz hangi yanıt sayısında üretildi (bayatlama tespiti)
  created_at timestamptz not null default now()
);

create index if not exists survey_ai_analyses_survey_kind_idx
  on public.survey_ai_analyses(survey_id, kind, created_at desc);
