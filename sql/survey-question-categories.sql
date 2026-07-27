-- VISIO360 - Anket sorularına konu başlığı / kategori alanı
-- Amaç: Anket sorularını konu başlığına (kategori) göre gruplayabilmek ve
-- Excel içe aktarmada "Kategori/Başlık" sütununu taşıyabilmek.
-- Serbest metin başlık (ayrı tablo gerektirmez) — hafif ve geriye dönük uyumlu.
-- Idempotent: birden fazla kez güvenle çalıştırılabilir; mevcut veriyi değiştirmez.

alter table if exists public.survey_questions
  add column if not exists category text null;

-- Anket içinde başlığa göre hızlı süzme/gruplama için indeks.
create index if not exists survey_questions_survey_category_idx
  on public.survey_questions(survey_id, category);
