-- VISIO360 - Anket sınıf/grup kanalları (sınıf bazlı link)
-- Amaç: Bir ankete sınıf bazlı linkler tanımlayıp gelen cevabın hangi
-- sınıftan geldiğini anonimliği bozmadan taşımak; sınıf kırılımı ve
-- sınıf başına katılım oranı hesaplamak.
-- Kimlik YAZILMAZ: kanal grup düzeyinde bir etikettir, kişiye bağlanmaz.
-- Idempotent: birden fazla kez güvenle çalıştırılabilir; mevcut veriyi
-- değiştirmez. survey_responses'a eklenen kolon null kabul eder ve
-- varsayılanı yoktur -> tablo yeniden yazılmaz, mevcut satırlar değişmez.

create table if not exists public.survey_channels (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  organization_id uuid not null,
  label text not null,               -- "9-A"
  group_label text null,             -- "9. sınıf" (üst kırılım)
  expected_count integer null,       -- katılım oranı için mevcut öğrenci sayısı
  token text not null unique,        -- linkteki jeton
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists survey_channels_survey_idx
  on public.survey_channels(survey_id);

-- Aynı ankette aynı sınıf etiketi iki kez tanımlanmasın.
create unique index if not exists survey_channels_survey_label_key
  on public.survey_channels(survey_id, label);

alter table if exists public.survey_responses
  add column if not exists channel_id uuid null
  references public.survey_channels(id) on delete set null;

create index if not exists survey_responses_channel_idx
  on public.survey_responses(channel_id);

-- Uygulama rolü yetkileri (rol varsa).
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'visio360_app') then
    -- Sahiplik kritik: tablo postgres'e ait kalırsa uygulama RLS'e takılır ve
    -- kanal listesi hata vermeden boş döner (surveys tablosunun sahibi de bu rol).
    execute 'alter table public.survey_channels owner to visio360_app';
    execute 'grant select, insert, update, delete on public.survey_channels to visio360_app';
  end if;
end $$;

-- RLS: surveys tablosundaki org_isolation deseniyle birebir aynı.
alter table public.survey_channels enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'survey_channels' and policyname = 'org_isolation'
  ) then
    execute $p$
      create policy org_isolation on public.survey_channels
        using (app_is_super() or organization_id::text = app_org())
        with check (app_is_super() or organization_id::text = app_org())
    $p$;
  end if;
end $$;
