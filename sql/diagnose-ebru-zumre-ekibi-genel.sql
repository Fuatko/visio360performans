-- Zümre Başkanı Ebru AKTİMUR — zümre ekibi genel değerlendirme kontrolü
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Beklenen zümre ekip listesi (paylaşılan görsel):
-- Jean-Marie DOLL, Léa JACQUOT, Charbel JBEILY, Farhad POURMIR

with beklenen(name) as (
  values
    ('Jean-Marie DOLL'),
    ('Léa JACQUOT'),
    ('Charbel JBEILY'),
    ('Farhad POURMIR')
),
ebru_genel as (
  select tg.name
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Ebru AKTİMUR'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select 'SAYIM' as rapor, null::text as isim,
  format(
    'zümre_ekip_beklenen=4, ebru_ekipte_atanan=%s, eksik=%s, ebru_toplam_genel=%s',
    (select count(*) from ebru_genel g where exists (select 1 from beklenen b where b.name = g.name)),
    (select count(*) from beklenen b where not exists (select 1 from ebru_genel g where g.name = b.name)),
    (select count(*) from ebru_genel)
  ) as detay
union all
select 'EKSIK', b.name, 'Zümre ekip listesinde var — Ebru genel ataması yok'
from beklenen b
where not exists (select 1 from ebru_genel g where g.name = b.name)
union all
select 'LISTE', g.name, 'Ebru genel ataması var'
from ebru_genel g
where exists (select 1 from beklenen b where b.name = g.name)
union all
select 'USERS_YOK', b.name, 'users tablosunda bu isim yok'
from beklenen b
where not exists (select 1 from users u where u.name = b.name)
order by rapor, isim;
