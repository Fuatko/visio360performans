-- Erkan YILMAZ — kendi ekibi genel kontrolü (beklenen 8)

with beklenen(name) as (
  values
    ('Utku AYTAÇ'),
    ('Patrice CARINO'),
    ('Yaprak BENER CHAPDELAINE'),
    ('Şahan İZGİ'),
    ('Nesrin KARAKAŞ'),
    ('Arman KOMBIYIKYAN'),
    ('Gülnur TİRYAKİ'),
    ('Şule YENAL')
),
db_genel as (
  select tg.name
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Erkan YILMAZ'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select 'SAYIM' as rapor, null::text as isim,
  format('beklenen=8 db=%s eksik=%s fazla=%s',
    (select count(*) from db_genel),
    (select count(*) from beklenen b where not exists (select 1 from db_genel d where d.name = b.name)),
    (select count(*) from db_genel d where not exists (select 1 from beklenen b where b.name = d.name))
  ) as detay
union all
select 'EKSIK', b.name, 'Listede var — Erkan genel ataması yok'
from beklenen b
where not exists (select 1 from db_genel d where d.name = b.name)
union all
select 'FAZLA', d.name, 'DB''de var — 8 kişilik ekipte yok'
from db_genel d
where not exists (select 1 from beklenen b where b.name = d.name)
union all
select 'USERS_YOK', b.name, 'users tablosunda isim yok'
from beklenen b
where not exists (select 1 from users u where u.name = b.name)
order by rapor, isim;
