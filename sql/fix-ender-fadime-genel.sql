-- Ender ÜSTÜNGEL + Fadime ALPARSLAN — genel matris düzeltmeleri
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
--
-- Ender: değerlendiren 85 tamam; değerlendirilen tarafı eksikti (yalnızca Ayşegül, kısmi 13/21).
--        Paul ile aynı değerlendirici seti + öz değerlendirme eklendi.
-- Fadime: değerlendirilen (5); değerlendiren olmamalı (0 — doğrulandı).
--
-- Canlı uygulama: node scripts/fix-ender-fadime-genel.mjs --apply
-- (Jennifer→Fadime kapsam + kısmi formların yeniden açılması script içinde)

begin;

-- Paul GEORGES → Ender ÜSTÜNGEL (genel)
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'genel',
  'pending'
from users ev
cross join users tg
where ev.name = 'Paul GEORGES'
  and tg.name = 'Ender ÜSTÜNGEL'
  and not exists (
    select 1 from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

-- Rengin, Stanislaw, öz değerlendirme
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'genel',
  'pending'
from users ev
cross join users tg
where tg.name = 'Ender ÜSTÜNGEL'
  and ev.name in ('Rengin TAMKAN DOĞAN', 'Stanislaw EON DU VAL', 'Ender ÜSTÜNGEL')
  and not exists (
    select 1 from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

-- Doğrulama
select
  (select count(*) from evaluation_assignments ea
   join users tg on tg.id = ea.target_id
   where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
     and tg.name = 'Ender ÜSTÜNGEL' and ea.matrix_context = 'genel') as ender_genel_hedef_atama,
  (select count(*) from evaluation_assignments ea
   join users ev on ev.id = ea.evaluator_id
   where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
     and ev.name = 'Ender ÜSTÜNGEL' and ea.matrix_context = 'genel') as ender_genel_degerlendiren,
  (select count(*) from evaluation_assignments ea
   join users ev on ev.id = ea.evaluator_id
   where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
     and ev.name = 'Fadime ALPARSLAN' and ea.matrix_context = 'genel') as fadime_genel_degerlendiren;

-- NOT: Ayşegül→Ender ve Jennifer→Fadime kısmi formlar script ile pending yapıldı.
-- rollback; -- idempotent insert; canlıda zaten uygulandı
