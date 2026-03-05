-- ============================================================
-- Sonuç yayınlama kontrolü (Süper Admin)
-- ============================================================
-- Dönem bazında: results_released = false iken çalışanlar
-- "Sonuçlar & Raporlar"da kendi sonuçlarını görmez.
-- Değerlendirme doldurma (matris/form) etkilenmez.
-- ============================================================

alter table public.evaluation_periods
  add column if not exists results_released boolean not null default false;

comment on column public.evaluation_periods.results_released is
  'When false, employees cannot see their evaluation results for this period until admin releases.';
