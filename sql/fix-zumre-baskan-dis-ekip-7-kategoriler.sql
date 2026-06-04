-- Zümre başkanları — ekip DIŞI genel değerlendirme: hedef bazlı 7 kategori
-- (Veli İletişimi ve Öğrenci İlişkileri ve Empati YOK)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
--
-- Değerlendirenler: Onur, Yeliz, Ayhan, Altan, Stanislaw, Peggy, Yonca, Berna BENER,
--   Gökçe, Şule KOÇAK, Gökhan, Zeynep, Ebru, Erkan YILMAZ
--
-- NOT Şule KOÇAK: genel kapsamı 4 kategori (md. yrd. modeli) — bu scriptte atlanır.
-- NOT Erkan YILMAZ: genel değerlendirici ataması yok (0 hedef).

begin;

create temp table _kendi_ekip(evaluator_name text, hedef_name text) on commit drop;
insert into _kendi_ekip(evaluator_name, hedef_name) values
  -- Onur ERMAN (4)
  ('Onur ERMAN', 'Oğuzhan ÇETİN'),
  ('Onur ERMAN', 'Gülen ERMAN'),
  ('Onur ERMAN', 'Ayşegül KAZMAZ'),
  ('Onur ERMAN', 'Baran YILDIZ'),
  -- Yeliz ERARSLAN (4)
  ('Yeliz ERARSLAN', 'Laurent CHAPDELAINE'),
  ('Yeliz ERARSLAN', 'Rengin TAMKAN DOĞAN'),
  ('Yeliz ERARSLAN', 'Simge ŞENAY'),
  ('Yeliz ERARSLAN', 'Tanya ERGÜNEŞ UĞUR'),
  -- Ayhan YAĞIZ (1)
  ('Ayhan YAĞIZ', 'Şükran TOY'),
  -- Altan KILIÇ (2)
  ('Altan KILIÇ', 'Gökhan KARAMAN'),
  ('Altan KILIÇ', 'Kerem KESEPARA'),
  -- Berna BENER (4)
  ('Berna BENER', 'Ayfer AKAYDIN'),
  ('Berna BENER', 'Binnaz BAYRAK ONUR'),
  ('Berna BENER', 'Ilgın AYDIN'),
  ('Berna BENER', 'Maral BASMA'),
  -- Yonca İŞLEK (4)
  ('Yonca İŞLEK', 'Ebru ÖZGÖREN'),
  ('Yonca İŞLEK', 'Evren SAĞBİLİ'),
  ('Yonca İŞLEK', 'Seda UĞUR'),
  ('Yonca İŞLEK', 'Volkan OĞUZ'),
  -- Gökhan BÜYÜKENGEZ (2)
  ('Gökhan BÜYÜKENGEZ', 'Didem KANDİL'),
  ('Gökhan BÜYÜKENGEZ', 'Sabriye ÇAVDARCIOĞLU TOPUZ'),
  -- Gökçe TAYLAN (8)
  ('Gökçe TAYLAN', 'Arman KOMBIYIKYAN'),
  ('Gökçe TAYLAN', 'Gülnur TİRYAKİ'),
  ('Gökçe TAYLAN', 'Nesrin KARAKAŞ'),
  ('Gökçe TAYLAN', 'Patrice CARINO'),
  ('Gökçe TAYLAN', 'Şahan İZGİ'),
  ('Gökçe TAYLAN', 'Şule YENAL'),
  ('Gökçe TAYLAN', 'Utku AYTAÇ'),
  ('Gökçe TAYLAN', 'Yaprak BENER CHAPDELAINE'),
  -- Zeynep DEDEBAŞ (8)
  ('Zeynep DEDEBAŞ', 'Didem TEKİN'),
  ('Zeynep DEDEBAŞ', 'Dilek KARAYAĞIZ'),
  ('Zeynep DEDEBAŞ', 'Elif CANDEMİR'),
  ('Zeynep DEDEBAŞ', 'Esin ALPAN'),
  ('Zeynep DEDEBAŞ', 'Mesude YILDIRIM'),
  ('Zeynep DEDEBAŞ', 'Özcan AKÇAKAYA'),
  ('Zeynep DEDEBAŞ', 'Selin YILMAZ'),
  ('Zeynep DEDEBAŞ', 'Zuhal KILIÇASLAN'),
  -- Peggy MOREL ÖZDEMİR (15)
  ('Peggy MOREL ÖZDEMİR', 'Fadime ALPARSLAN'),
  ('Peggy MOREL ÖZDEMİR', 'Zeliha BARLAS'),
  ('Peggy MOREL ÖZDEMİR', 'Leyla CİDAL ALTINAYAR'),
  ('Peggy MOREL ÖZDEMİR', 'Marie Christine ÇANLI'),
  ('Peggy MOREL ÖZDEMİR', 'Eléonore DE BEAUMONT'),
  ('Peggy MOREL ÖZDEMİR', 'Elif DİVİTÇİOĞLU'),
  ('Peggy MOREL ÖZDEMİR', 'Hande KAHRAMAN'),
  ('Peggy MOREL ÖZDEMİR', 'Selin KARAKOÇ'),
  ('Peggy MOREL ÖZDEMİR', 'Elif KAZAN'),
  ('Peggy MOREL ÖZDEMİR', 'Christine KHOURY'),
  ('Peggy MOREL ÖZDEMİR', 'Stéphanie LEMAIRE'),
  ('Peggy MOREL ÖZDEMİR', 'Monique SERİM'),
  ('Peggy MOREL ÖZDEMİR', 'Belgin ŞİMŞEK'),
  ('Peggy MOREL ÖZDEMİR', 'Mişelin TAGAN'),
  ('Peggy MOREL ÖZDEMİR', 'Loïc VERTUAUX'),
  -- Stanislaw EON DU VAL (13)
  ('Stanislaw EON DU VAL', 'Berna SÖĞÜTLÜ'),
  ('Stanislaw EON DU VAL', 'Cécile BLANC'),
  ('Stanislaw EON DU VAL', 'Eléonore DE BEAUMONT'),
  ('Stanislaw EON DU VAL', 'Elif DİVİTÇİOĞLU'),
  ('Stanislaw EON DU VAL', 'Gülnaz PEKİN'),
  ('Stanislaw EON DU VAL', 'Marie Christine ÇANLI'),
  ('Stanislaw EON DU VAL', 'Mişelin TAGAN'),
  ('Stanislaw EON DU VAL', 'Olivier ROBERT'),
  ('Stanislaw EON DU VAL', 'Paul GEORGES'),
  ('Stanislaw EON DU VAL', 'Şeyma DOĞRUER'),
  ('Stanislaw EON DU VAL', 'Stéphanie LEMAIRE'),
  ('Stanislaw EON DU VAL', 'Zeliha Mine NART'),
  ('Stanislaw EON DU VAL', 'Dilara ADAŞ'),
  -- Ebru AKTİMUR — zümre ekibi genel (4)
  ('Ebru AKTİMUR', 'Jean-Marie DOLL'),
  ('Ebru AKTİMUR', 'Léa JACQUOT'),
  ('Ebru AKTİMUR', 'Charbel JBEILY'),
  ('Ebru AKTİMUR', 'Farhad POURMIR');

create temp table _beklenen7(category_id uuid, name text) on commit drop;
insert into _beklenen7(category_id, name)
select distinct on (wanted)
  cs.id,
  cs.name
from (
  values
    ('Mesleki Sorumluluk'),
    ('Pedagojik Yetkinlik'),
    ('Ölçme ve Değerlendirme'),
    ('Teknolojik Yetkinlikler'),
    ('Proje, Etkinlik ve Kurumsal Katkı'),
    ('Kurum içi İletişim ve İşbirliği'),
    ('Mesleki Gelişim')
) as v(wanted)
join evaluation_period_categories_snapshot cs
  on cs.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
 and (
   cs.name = v.wanted
   or (v.wanted = 'Pedagojik Yetkinlik' and cs.name ilike 'pedagojik%')
   or (v.wanted = 'Ölçme ve Değerlendirme' and (cs.name ilike 'ölçme%' or cs.name ilike 'olcme%'))
   or (v.wanted = 'Kurum içi İletişim ve İşbirliği' and cs.name ilike 'Kurum%İletişim%')
   or (v.wanted = 'Proje, Etkinlik ve Kurumsal Katkı' and cs.name ilike 'Proje%')
 )
order by wanted, cs.name;

create temp table _dis_ekip_targets(
  evaluator_id uuid,
  target_id uuid,
  evaluator_name text
) on commit drop;

insert into _dis_ekip_targets(evaluator_id, target_id, evaluator_name)
select distinct ev.id, tg.id, ev.name
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
    select 1
    from _kendi_ekip k
    where k.evaluator_name = ev.name
      and k.hedef_name = tg.name
  );

-- Hedef özel kapsam
insert into evaluation_period_evaluator_target_scope
  (period_id, evaluator_id, target_id, matrix_context, restrict_period, duty_mode, duty_package_ids, updated_at)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  t.evaluator_id,
  t.target_id,
  'genel',
  true,
  'none',
  '{}'::uuid[],
  now()
from _dis_ekip_targets t
on conflict (period_id, evaluator_id, target_id, matrix_context)
do update set
  restrict_period = true,
  duty_mode = 'none',
  duty_package_ids = '{}'::uuid[],
  updated_at = now();

-- Eski hedef kategorilerini temizle (ekip dışı)
delete from evaluation_period_evaluator_target_categories tc
using _dis_ekip_targets t
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = t.evaluator_id
  and tc.target_id = t.target_id
  and tc.matrix_context = 'genel'
  and tc.scope_kind = 'period';

-- 7 kategori × hedef
insert into evaluation_period_evaluator_target_categories
  (period_id, evaluator_id, target_id, matrix_context, category_id, scope_kind, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  t.evaluator_id,
  t.target_id,
  'genel',
  b.category_id,
  'period',
  true
from _dis_ekip_targets t
cross join _beklenen7 b
on conflict do nothing;

-- Kontrol (commit öncesi)
select
  d.evaluator_name as degerlendiren,
  count(*) as dis_ekip_hedef,
  count(*) filter (where coalesce(kat_sayisi, 0) = 7 and coalesce(yasak, 0) = 0) as tamam_7,
  count(*) filter (where coalesce(kat_sayisi, 0) <> 7 or coalesce(yasak, 0) > 0) as hatali
from _dis_ekip_targets d
left join lateral (
  select
    count(tc.category_id) as kat_sayisi,
    count(*) filter (
      where cs.name in ('Veli İletişimi', 'Öğrenci İlişkileri ve Empati')
    ) as yasak
  from evaluation_period_evaluator_target_categories tc
  join evaluation_period_categories_snapshot cs
    on cs.id = tc.category_id and cs.period_id = tc.period_id
  where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and tc.evaluator_id = d.evaluator_id
    and tc.target_id = d.target_id
    and tc.matrix_context = 'genel'
    and tc.scope_kind = 'period'
    and tc.is_active = true
) x on true
group by d.evaluator_name
order by d.evaluator_name;

commit;
