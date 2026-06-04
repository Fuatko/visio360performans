-- Eksik 2 kategori: snapshot adları farklı
--   Pedagojik Yetkinlik  → Pedagojik Yetkinlikler
--   Ölçme ve Değerlendirme → Ölçme & Değerlendirme
-- Tüm zümre başkanı ekip-dışı genel hedeflere ekler (7/7 tamamlar)

insert into evaluation_period_evaluator_target_categories
  (period_id, evaluator_id, target_id, matrix_context, category_id, scope_kind, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  d.evaluator_id,
  d.target_id,
  'genel',
  cs.id,
  'period',
  true
from (
  select distinct ev.id as evaluator_id, tg.id as target_id, ev.name as evaluator_name, tg.name as hedef_name
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
    and ev.name in (
      'Onur ERMAN', 'Yeliz ERARSLAN', 'Ayhan YAĞIZ', 'Altan KILIÇ', 'Stanislaw EON DU VAL',
      'Peggy MOREL ÖZDEMİR', 'Yonca İŞLEK', 'Berna BENER', 'Gökçe TAYLAN',
      'Gökhan BÜYÜKENGEZ', 'Zeynep DEDEBAŞ', 'Ebru AKTİMUR'
    )
) d
cross join evaluation_period_categories_snapshot cs
where cs.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and cs.name in ('Pedagojik Yetkinlikler', 'Ölçme & Değerlendirme')
  and not exists (
    select 1 from (values
      ('Onur ERMAN', 'Oğuzhan ÇETİN'), ('Onur ERMAN', 'Gülen ERMAN'),
      ('Onur ERMAN', 'Ayşegül KAZMAZ'), ('Onur ERMAN', 'Baran YILDIZ'),
      ('Yeliz ERARSLAN', 'Laurent CHAPDELAINE'), ('Yeliz ERARSLAN', 'Rengin TAMKAN DOĞAN'),
      ('Yeliz ERARSLAN', 'Simge ŞENAY'), ('Yeliz ERARSLAN', 'Tanya ERGÜNEŞ UĞUR'),
      ('Ayhan YAĞIZ', 'Şükran TOY'),
      ('Altan KILIÇ', 'Gökhan KARAMAN'), ('Altan KILIÇ', 'Kerem KESEPARA'),
      ('Berna BENER', 'Ayfer AKAYDIN'), ('Berna BENER', 'Binnaz BAYRAK ONUR'),
      ('Berna BENER', 'Ilgın AYDIN'), ('Berna BENER', 'Maral BASMA'),
      ('Yonca İŞLEK', 'Ebru ÖZGÖREN'), ('Yonca İŞLEK', 'Evren SAĞBİLİ'),
      ('Yonca İŞLEK', 'Seda UĞUR'), ('Yonca İŞLEK', 'Volkan OĞUZ'),
      ('Gökhan BÜYÜKENGEZ', 'Didem KANDİL'), ('Gökhan BÜYÜKENGEZ', 'Sabriye ÇAVDARCIOĞLU TOPUZ'),
      ('Gökçe TAYLAN', 'Arman KOMBIYIKYAN'), ('Gökçe TAYLAN', 'Gülnur TİRYAKİ'),
      ('Gökçe TAYLAN', 'Nesrin KARAKAŞ'), ('Gökçe TAYLAN', 'Patrice CARINO'),
      ('Gökçe TAYLAN', 'Şahan İZGİ'), ('Gökçe TAYLAN', 'Şule YENAL'),
      ('Gökçe TAYLAN', 'Utku AYTAÇ'), ('Gökçe TAYLAN', 'Yaprak BENER CHAPDELAINE'),
      ('Zeynep DEDEBAŞ', 'Didem TEKİN'), ('Zeynep DEDEBAŞ', 'Dilek KARAYAĞIZ'),
      ('Zeynep DEDEBAŞ', 'Elif CANDEMİR'), ('Zeynep DEDEBAŞ', 'Esin ALPAN'),
      ('Zeynep DEDEBAŞ', 'Mesude YILDIRIM'), ('Zeynep DEDEBAŞ', 'Özcan AKÇAKAYA'),
      ('Zeynep DEDEBAŞ', 'Selin YILMAZ'), ('Zeynep DEDEBAŞ', 'Zuhal KILIÇASLAN'),
      ('Peggy MOREL ÖZDEMİR', 'Fadime ALPARSLAN'), ('Peggy MOREL ÖZDEMİR', 'Zeliha BARLAS'),
      ('Peggy MOREL ÖZDEMİR', 'Leyla CİDAL ALTINAYAR'), ('Peggy MOREL ÖZDEMİR', 'Marie Christine ÇANLI'),
      ('Peggy MOREL ÖZDEMİR', 'Eléonore DE BEAUMONT'), ('Peggy MOREL ÖZDEMİR', 'Elif DİVİTÇİOĞLU'),
      ('Peggy MOREL ÖZDEMİR', 'Hande KAHRAMAN'), ('Peggy MOREL ÖZDEMİR', 'Selin KARAKOÇ'),
      ('Peggy MOREL ÖZDEMİR', 'Elif KAZAN'), ('Peggy MOREL ÖZDEMİR', 'Christine KHOURY'),
      ('Peggy MOREL ÖZDEMİR', 'Stéphanie LEMAIRE'), ('Peggy MOREL ÖZDEMİR', 'Monique SERİM'),
      ('Peggy MOREL ÖZDEMİR', 'Belgin ŞİMŞEK'), ('Peggy MOREL ÖZDEMİR', 'Mişelin TAGAN'),
      ('Peggy MOREL ÖZDEMİR', 'Loïc VERTUAUX'),
      ('Stanislaw EON DU VAL', 'Berna SÖĞÜTLÜ'), ('Stanislaw EON DU VAL', 'Cécile BLANC'),
      ('Stanislaw EON DU VAL', 'Eléonore DE BEAUMONT'), ('Stanislaw EON DU VAL', 'Elif DİVİTÇİOĞLU'),
      ('Stanislaw EON DU VAL', 'Gülnaz PEKİN'), ('Stanislaw EON DU VAL', 'Marie Christine ÇANLI'),
      ('Stanislaw EON DU VAL', 'Mişelin TAGAN'), ('Stanislaw EON DU VAL', 'Olivier ROBERT'),
      ('Stanislaw EON DU VAL', 'Paul GEORGES'), ('Stanislaw EON DU VAL', 'Şeyma DOĞRUER'),
      ('Stanislaw EON DU VAL', 'Stéphanie LEMAIRE'), ('Stanislaw EON DU VAL', 'Zeliha Mine NART'),
      ('Stanislaw EON DU VAL', 'Dilara ADAŞ'),
      ('Ebru AKTİMUR', 'Jean-Marie DOLL'), ('Ebru AKTİMUR', 'Léa JACQUOT'),
      ('Ebru AKTİMUR', 'Charbel JBEILY'), ('Ebru AKTİMUR', 'Farhad POURMIR')
    ) as k(ek, he) where k.ek = d.evaluator_name and k.he = d.hedef_name
  )
  and not exists (
    select 1 from evaluation_period_evaluator_target_categories tc
    where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and tc.evaluator_id = d.evaluator_id
      and tc.target_id = d.target_id
      and tc.matrix_context = 'genel'
      and tc.category_id = cs.id
      and tc.scope_kind = 'period'
  )
on conflict do nothing;

-- Kontrol: Ebru örnek
select tg.name as hedef, count(*) as kategori_sayisi,
  array_agg(cs.name order by cs.name) as kategoriler
from evaluation_period_evaluator_target_categories tc
join users ev on ev.id = tc.evaluator_id
join users tg on tg.id = tc.target_id
join evaluation_period_categories_snapshot cs on cs.id = tc.category_id and cs.period_id = tc.period_id
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Ebru AKTİMUR' and tg.name = 'Baran YILDIZ'
  and tc.matrix_context = 'genel' and tc.is_active = true
group by tg.name;
