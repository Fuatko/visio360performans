-- Gülnaz PEKİN — zümre matrisini 14 kişilik güncel listeye tamamla
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'zumre',
  'pending'
from users ev
join users tg on tg.name in (
  'Ebru AKTİMUR',
  'Altan KILIÇ',
  'Ayhan YAĞIZ',
  'Berna BENER',
  'Gökçe TAYLAN',
  'Gökhan BÜYÜKENGEZ',
  'Onur ERMAN',
  'Peggy MOREL ÖZDEMİR',
  'Stanislaw EON DU VAL',
  'Şule KOÇAK',
  'Yeliz ERARSLAN',
  'Yonca İŞLEK',
  'Zeynep DEDEBAŞ',
  'Erkan YILMAZ'
)
where ev.name = 'Gülnaz PEKİN'
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and ea.matrix_context = 'zumre'
  );

-- Kontrol
select count(*) as gulnaz_zumre_toplam
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Gülnaz PEKİN'
  and ea.matrix_context = 'zumre';

