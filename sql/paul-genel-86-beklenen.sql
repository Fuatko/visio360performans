-- Paul GEORGES — genel 85 kişi listesi vs DB (Şerife listeden çıkarıldı)
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- Supabase: dosyanın TAMAMINI seç → Run (tek sorgu; parça parça çalıştırmayın)

with beklenen(name) as (
  values
    ('Oğuzhan ÇETİN'),
    ('Gülen ERMAN'),
    ('Onur ERMAN'),
    ('Ayşegül KAZMAZ'),
    ('Baran YILDIZ'),
    ('Ender ÜSTÜNGEL'),
    ('Laurent CHAPDELAINE'),
    ('Yeliz ERARSLAN'),
    ('Tanya ERGÜNEŞ UĞUR'),
    ('Simge ŞENAY'),
    ('Rengin TAMKAN DOĞAN'),
    ('Şükran TOY'),
    ('Ayhan YAĞIZ'),
    ('Gökhan KARAMAN'),
    ('Kerem KESEPARA'),
    ('Altan KILIÇ'),
    ('Uğur ÖZEN'),
    ('Ebru AKTİMUR'),
    ('Jean-Marie DOLL'),
    ('Léa JACQUOT'),
    ('Charbel JBEILY'),
    ('Farhad POURMIR'),
    ('Dilara ADAŞ'),
    ('Fadime ALPARSLAN'),
    ('Zeliha BARLAS'),
    ('Cécile BLANC'),
    ('Leyla CİDAL ALTINAYAR'),
    ('Marie Christine ÇANLI'),
    ('Eléonore DE BEAUMONT'),
    ('Elif DİVİTÇİOĞLU'),
    ('Şeyma DOĞRUER'),
    ('Stanislaw EON DU VAL'),
    ('Hande KAHRAMAN'),
    ('Selin KARAKOÇ'),
    ('Elif KAZAN'),
    ('Christine KHOURY'),
    ('Stéphanie LEMAIRE'),
    ('Zeliha Mine NART'),
    ('Peggy MOREL ÖZDEMİR'),
    ('Gülnaz PEKİN'),
    ('Olivier ROBERT'),
    ('Monique SERİM'),
    ('Berna SÖĞÜTLÜ'),
    ('Belgin ŞİMŞEK'),
    ('Mişelin TAĞAN'),
    ('Loic VERTUAUX'),
    ('Erhan ATASEVER'),
    ('Yonca İŞLEK'),
    ('Volkan OĞUZ'),
    ('Ebru ÖZGÖREN'),
    ('Seda UĞUR'),
    ('Ayfer AKAYDIN'),
    ('Ilgın AYDIN'),
    ('Maral BASMA'),
    ('Berna BENER'),
    ('Binnaz BAYRAK ONUR'),
    ('Utku AYTAÇ'),
    ('Patrice CARINO'),
    ('Yaprak BENER CHAPDELAINE'),
    ('Şahan İZGİ'),
    ('Nesrin KARAKAŞ'),
    ('Arman KOMBİYKİYAN'),
    ('Gökçe TAYLAN'),
    ('Gülnur TİRYAKİ'),
    ('Şule YENAL'),
    ('Erkan YILMAZ'),
    ('Tunç ÖNDEMİR'),
    ('Doruk ATIŞKAN'),
    ('Tolga ÇAKIROĞLU'),
    ('Murat KAZANOĞLU'),
    ('Şule KOÇAK'),
    ('Elçin KONUK'),
    ('Sevcan ÖZKILINÇ'),
    ('Gökhan BÜYÜKENGEZ'),
    ('Sabriye ÇAVDARCIOĞLU TOPUZ'),
    ('Didem KANDİL'),
    ('Özcan AKÇAKAYA'),
    ('Esin ALPAN'),
    ('Elif CANDEMİR'),
    ('Zeynep DEDEBAŞ'),
    ('Dilek KARAYAĞIZ'),
    ('Zuhal KILIÇASLAN'),
    ('Didem TEKİN'),
    ('Mesude YILDIRIM'),
    ('Selin YILMAZ')
),
paul as (
  select id from users where name = 'Paul GEORGES' limit 1
),
db_genel as (
  select distinct u.name
  from evaluation_assignments ea
  join paul p on p.id = ea.evaluator_id
  join users u on u.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
),
sayim as (
  select
    (select count(*) from beklenen) as beklenen_85,
    (select count(*) from db_genel) as db_genel,
    (select count(*) from beklenen b where not exists (select 1 from db_genel d where d.name = b.name)) as eksik,
    (select count(*) from db_genel d where not exists (select 1 from beklenen b where b.name = d.name)) as fazla
)
select rapor, isim, ek_bilgi
from (
  select 1 as sira, 'SAYIM'::text as rapor, null::text as isim,
    format('beklenen=%s db=%s eksik=%s fazla=%s', beklenen_85, db_genel, eksik, fazla) as ek_bilgi
  from sayim
  union all
  select 2, 'EKSIK', b.name, 'Listede var — Paul genel ataması yok'
  from beklenen b
  where not exists (select 1 from db_genel d where d.name = b.name)
  union all
  select 3, 'FAZLA', d.name, 'DB''de var — listede yok'
  from db_genel d
  where not exists (select 1 from beklenen b where b.name = d.name)
  union all
  select 4, 'USERS_YOK', b.name, 'users tablosunda bu isim yok'
  from beklenen b
  where not exists (select 1 from users u where u.name = b.name)
) x
order by sira, isim nulls first;
