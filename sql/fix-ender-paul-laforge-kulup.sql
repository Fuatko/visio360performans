-- Ender ÜSTÜNGEL -> Paul LAFORGE kulüp öğretmeni ataması kontrol + düzeltme
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'kulup_ogretmeni',
  'pending'
from users ev
join users tg on tg.name = 'Paul LAFORGE'
where ev.name = 'Ender ÜSTÜNGEL'
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and ea.matrix_context = 'kulup_ogretmeni'
  );

-- Kontrol
select
  ev.name as degerlendiren,
  tg.name as hedef,
  ea.matrix_context,
  ea.status
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Ender ÜSTÜNGEL'
  and tg.name = 'Paul LAFORGE'
  and ea.matrix_context = 'kulup_ogretmeni';

