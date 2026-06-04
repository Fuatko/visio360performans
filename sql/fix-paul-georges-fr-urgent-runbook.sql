-- Paul GEORGES — acil FR veri + hesap (2026 EĞİTMEN)
-- Paul LAFORGE hesabına dokunmaz.
-- Supabase SQL Editor'de AŞAĞIDAKİ dosyaları bu sırayla, her birini tamamen çalıştırın:
--
--   1. sql/diagnose-paul-georges-fr-live-texts.sql
--   2. sql/fix-fr-placeholder-question-text-safe.sql
--   3. sql/fix-fr-empty-question-text-safe.sql
--   4. sql/fix-fr-harmonize-texts-from-existing.sql
--   5. sql/fix-fr-harmonize-category-names.sql
--   6. sql/fix-snapshot-answers-fr.sql
--   7. sql/fix-last-answer-fr-one-shot.sql
--   8. sql/sync-snapshot-fr-from-live.sql
--   9. sql/fix-paul-restore-ender-parity.sql   (Paul atama/scope + preferred_language=fr)
--
-- period_id: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- Paul GEORGES: 6350a539-e0aa-49b7-8895-9ee572124bfe
--
-- Canlı uygulama (Node): node scripts/fix-paul-georges-fr-urgent.mjs --apply
-- Kod: görev bandı FR (pickDutyDisplayName) — visio360pds deploy gerekir.

-- Hızlı doğrulama (bu blok tek başına çalıştırılabilir)
select id, name, preferred_language, role from public.users where name = 'Paul GEORGES';

select
  (select count(*) from public.evaluation_period_questions_snapshot
   where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
     and coalesce(is_active, true)
     and trim(coalesce(text_fr, '')) = '') as snap_q_fr_bos,
  (select count(*) from public.evaluation_period_answers_snapshot
   where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
     and coalesce(is_active, true)
     and trim(coalesce(text_fr, '')) = '') as snap_a_fr_bos;

select
  count(*) filter (where status <> 'completed') as paul_bekleyen,
  count(*) filter (where status = 'completed') as paul_tamamlanan
from public.evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid;
