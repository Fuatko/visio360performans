-- Training completions — InspiraSuite'ten gelen "eğitim tamamlandı" olaylarının kalıcı kaydı
-- Idempotent migration.
--
-- Inbound webhook (/api/integrations/training) her tamamlanmada buraya upsert eder.
-- Kişi + kurs bazında tekildir; tekrar gelen bildirim mevcut kaydı günceller.

create table if not exists public.training_completions (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  course_id text,
  course_title text,
  score numeric,
  certificate_no text,
  certificate_url text,
  source text not null default 'inspirasuite',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_email, course_id)
);

create index if not exists training_completions_user_email_idx on public.training_completions(user_email);
create index if not exists training_completions_completed_at_idx on public.training_completions(completed_at desc);

-- Erişim yalnızca sunucudaki service-role route'ları üzerinden; RLS açık, public policy yok.
alter table if exists public.training_completions enable row level security;
