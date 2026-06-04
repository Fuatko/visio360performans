-- Şule KOÇAK — rehberlik_ogretmeni (5 kişi, kendisi hariç)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

with beklenen(name) as (
  values
    ('Elçin KONUK'),
    ('Sevcan ÖZKILINÇ'),
    ('Doruk ATIŞKAN'),
    ('Tolga ÇAKIROĞLU'),
    ('Murat KAZANOĞLU')
),
db_rehber as (
  select tg.name
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Şule KOÇAK'
    and ea.matrix_context = 'rehberlik_ogretmeni'
)
select 'SAYIM' as rapor, null::text as isim,
  format(
    'beklenen=5 db=%s eksik=%s fazla=%s',
    (select count(*) from db_rehber),
    (select count(*) from beklenen b where not exists (select 1 from db_rehber d where d.name = b.name)),
    (select count(*) from db_rehber d where not exists (select 1 from beklenen b where b.name = d.name))
  ) as detay
union all
select 'EKSIK', b.name, 'Listede var — Şule rehber ataması yok'
from beklenen b
where not exists (select 1 from db_rehber d where d.name = b.name)
union all
select 'FAZLA', d.name, 'DB''de var — 5 kişilik listede yok (veya kendi kendine)'
from db_rehber d
where not exists (select 1 from beklenen b where b.name = d.name)
union all
select 'USERS_YOK', b.name, 'users tablosunda bu isim yok'
from beklenen b
where not exists (select 1 from users u where u.name = b.name)
order by rapor, isim;
