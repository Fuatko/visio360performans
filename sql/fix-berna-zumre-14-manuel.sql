-- Berna SÖĞÜTLÜ — zümre sayısını 14'e tamamla
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Berna ID: e6d63576-949b-480a-b19a-c7113f0bee01
-- Eksik 2 kişi: Ebru AKTİMUR, Erkan YILMAZ

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'zumre',
  'pending'
from users ev
join users tg on tg.name in ('Ebru AKTİMUR', 'Erkan YILMAZ')
where ev.name = 'Berna SÖĞÜTLÜ'
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and ea.matrix_context = 'zumre'
  );

-- Kontrol
select
  count(*) as berna_zumre_toplam
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Berna SÖĞÜTLÜ'
  and ea.matrix_context = 'zumre';

