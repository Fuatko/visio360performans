-- Ebru AKTİMUR — genel değerlendirme 31 kişi listesi kontrolü
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
--
-- Not:
-- - Bu liste kullanıcı tarafından paylaşılan güncel "genel" listesidir.
-- - İsim yazımı varyantları (örn. Loic/Loïc) için küçük eşleştirme toleransı eklendi.

with beklenen(raw_name, match_name) as (
  values
    ('Oğuzhan ÇETİN', 'Oğuzhan ÇETİN'),
    ('Baran YILDIZ', 'Baran YILDIZ'),
    ('Laurent CHAPDELAINE', 'Laurent CHAPDELAINE'),
    ('Yeliz ERARSLAN', 'Yeliz ERARSLAN'),
    ('Rengin TAMKAN DOĞAN', 'Rengin TAMKAN DOĞAN'),
    ('Farhad POURMIR', 'Farhad POURMIR'),
    ('Fadime ALPARSLAN', 'Fadime ALPARSLAN'),
    ('Zeliha BARLAS', 'Zeliha BARLAS'),
    ('Leyla CİDAL ALTINAYAR', 'Leyla CİDAL ALTINAYAR'),
    ('Elif DİVİTÇİOĞLU', 'Elif DİVİTÇİOĞLU'),
    ('Hande KAHRAMAN', 'Hande KAHRAMAN'),
    ('Selin KARAKOÇ', 'Selin KARAKOÇ'),
    ('Elif KAZAN', 'Elif KAZAN'),
    ('Christine KHOURY', 'Christine KHOURY'),
    ('Stéphanie LEMAIRE', 'Stéphanie LEMAIRE'),
    ('Peggy MOREL ÖZDEMİR', 'Peggy MOREL ÖZDEMİR'),
    ('Monique SERİM', 'Monique SERİM'),
    ('Belgin ŞİMŞEK', 'Belgin ŞİMŞEK'),
    ('Mişelin TAGAN', 'Mişelin TAGAN'),
    ('Loic VERTUAUX', 'Loïc VERTUAUX'),
    ('Erhan ATASEVER', 'Erhan ATASEVER'),
    ('Yonca İŞLEK', 'Yonca İŞLEK'),
    ('Volkan OĞUZ', 'Volkan OĞUZ'),
    ('Seda UĞUR', 'Seda UĞUR'),
    ('Utku AYTAÇ', 'Utku AYTAÇ'),
    ('Gökçe TAYLAN', 'Gökçe TAYLAN'),
    ('Erkan YILMAZ', 'Erkan YILMAZ'),
    ('Elçin KONUK', 'Elçin KONUK'),
    ('Zuhal KILIÇASLAN', 'Zuhal KILIÇASLAN'),
    ('Didem TEKİN', 'Didem TEKİN'),
    ('Selin YILMAZ', 'Selin YILMAZ')
),
ebru as (
  select id from users where name = 'Ebru AKTİMUR' limit 1
),
db_genel as (
  select distinct u.name
  from evaluation_assignments ea
  join ebru e on e.id = ea.evaluator_id
  join users u on u.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select rapor, isim, detay
from (
  select
    1 as ord,
    'SAYIM'::text as rapor,
    null::text as isim,
    format(
      'beklenen=%s db=%s eksik=%s fazla=%s',
      (select count(*) from beklenen),
      (select count(*) from db_genel),
      (select count(*) from beklenen b where not exists (select 1 from db_genel d where d.name = b.match_name)),
      (select count(*) from db_genel d where not exists (select 1 from beklenen b where b.match_name = d.name))
    ) as detay

  union all

  select
    2,
    'EKSIK',
    b.raw_name,
    'Listede var — Ebru genel ataması yok'
  from beklenen b
  where not exists (select 1 from db_genel d where d.name = b.match_name)

  union all

  select
    3,
    'FAZLA',
    d.name,
    'DB''de var — 31 kişilik listede yok'
  from db_genel d
  where not exists (select 1 from beklenen b where b.match_name = d.name)

  union all

  select
    4,
    'USERS_YOK',
    b.raw_name,
    'users tablosunda eşleşme yok (yazım farkı olabilir)'
  from beklenen b
  where not exists (select 1 from users u where u.name = b.match_name)
) q
order by ord, isim nulls first;

