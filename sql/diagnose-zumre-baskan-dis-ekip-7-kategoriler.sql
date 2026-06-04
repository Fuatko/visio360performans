-- Zümre başkanları — ekip dışı genel: 7 kategori doğrulama (Veli / Öğrenci İlişkileri yok)

with kendi_ekip(evaluator_name, hedef_name) as (
  values
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
),
dis_ekip as (
  select ev.name as degerlendiren, tg.name as hedef, ev.id as evaluator_id, tg.id as target_id
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
    and not exists (
      select 1 from kendi_ekip k
      where k.evaluator_name = ev.name and k.hedef_name = tg.name
    )
),
hedef_kat as (
  select
    d.degerlendiren,
    d.hedef,
    count(tc.category_id) as kategori_sayisi,
    count(*) filter (
      where cs.name in ('Veli İletişimi', 'Öğrenci İlişkileri ve Empati')
    ) as yasak_var
  from dis_ekip d
  left join evaluation_period_evaluator_target_categories tc
    on tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
   and tc.evaluator_id = d.evaluator_id
   and tc.target_id = d.target_id
   and tc.matrix_context = 'genel'
   and tc.scope_kind = 'period'
   and tc.is_active = true
  left join evaluation_period_categories_snapshot cs
    on cs.id = tc.category_id and cs.period_id = tc.period_id
  group by d.degerlendiren, d.hedef
)
select * from (
  select 'OZET' as rapor, degerlendiren, null::text as hedef,
    format(
      'dis_ekip=%s, tamam_7=%s, hatali=%s',
      count(*),
      count(*) filter (where kategori_sayisi = 7 and yasak_var = 0),
      count(*) filter (where kategori_sayisi <> 7 or yasak_var > 0)
    ) as detay
  from hedef_kat
  group by degerlendiren

  union all

  select 'HATALI', degerlendiren, hedef,
    format('kategori=%s, yasak=%s', kategori_sayisi, yasak_var)
  from hedef_kat
  where kategori_sayisi <> 7 or yasak_var > 0
  order by degerlendiren, hedef
  limit 30
) q
order by
  case rapor when 'OZET' then 1 else 2 end,
  degerlendiren,
  hedef nulls first;
