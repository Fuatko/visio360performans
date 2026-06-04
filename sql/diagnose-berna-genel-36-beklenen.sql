-- Berna SÖĞÜTLÜ — genel değerlendirme 36 kişi listesi kontrolü
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

with beklenen(name) as (
  values
    ('Oğuzhan ÇETİN'),
    ('Gülen ERMAN'),
    ('Baran YILDIZ'),
    ('Tanya ERGÜNEŞ UĞUR'),
    ('Simge ŞENAY'),
    ('Şükran TOY'),
    ('Ayhan YAĞIZ'),
    ('Gökhan KARAMAN'),
    ('Uğur ÖZEN'),
    ('Jean-Marie DOLL'),
    ('Charbel JBEILY'),
    ('Farhad POURMIR'),
    ('Dilara ADAŞ'),
    ('Cécile BLANC'),
    ('Elif DİVİTÇİOĞLU'),
    ('Şeyma DOĞRUER'),
    ('Stanislaw EON DU VAL'),
    ('Stéphanie LEMAIRE'),
    ('Mişelin TAGAN'),
    ('Erhan ATASEVER'),
    ('Yonca İŞLEK'),
    ('Seda UĞUR'),
    ('Ilgın AYDIN'),
    ('Maral BASMA'),
    ('Binnaz BAYRAK ONUR'),
    ('Utku AYTAÇ'),
    ('Patrice CARINO'),
    ('Şahan İZGİ'),
    ('Arman KOMBIYIKYAN'),
    ('Gülnur TİRYAKİ'),
    ('Şule YENAL'),
    ('Sabriye ÇAVDARCIOĞLU TOPUZ'),
    ('Elif CANDEMİR'),
    ('Dilek KARAYAĞIZ'),
    ('Zuhal KILIÇASLAN'),
    ('Didem TEKİN')
),
db_genel as (
  select tg.name
  from evaluation_assignments ea
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select rapor, isim, detay
from (
  select 1 as ord, 'SAYIM'::text as rapor, null::text as isim,
    format(
      'beklenen=%s db=%s eksik=%s fazla=%s',
      (select count(*) from beklenen),
      (select count(*) from db_genel),
      (select count(*) from beklenen b where not exists (select 1 from db_genel d where d.name = b.name)),
      (select count(*) from db_genel d where not exists (select 1 from beklenen b where b.name = d.name))
    ) as detay
  union all
  select 2, 'EKSIK', b.name, 'Listede var — Berna genel ataması yok'
  from beklenen b
  where not exists (select 1 from db_genel d where d.name = b.name)
  union all
  select 3, 'FAZLA', d.name, 'DB''de var — 36 kişilik listede yok'
  from db_genel d
  where not exists (select 1 from beklenen b where b.name = d.name)
) q
order by ord, isim nulls first;

