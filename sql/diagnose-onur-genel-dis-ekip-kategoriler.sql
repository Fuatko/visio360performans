-- Onur ERMAN — kendi ekibi DIŞINDA genel değerlendirme: 7 kategori kontrolü
-- (Veli İletişimi ve Öğrenci İlişkileri ve Empati OLMAMALI)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

with period as (
  select 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id
),
onur as (
  select u.id as evaluator_id
  from users u, period p
  where u.name = 'Onur ERMAN'
  limit 1
),
kendi_ekip(name) as (
  values
    ('Oğuzhan ÇETİN'),
    ('Gülen ERMAN'),
    ('Ayşegül KAZMAZ'),
    ('Baran YILDIZ')
),
beklenen_kategori(name) as (
  values
    ('Mesleki Sorumluluk'),
    ('Pedagojik Yetkinlik'),
    ('Ölçme ve Değerlendirme'),
    ('Teknolojik Yetkinlikler'),
    ('Proje, Etkinlik ve Kurumsal Katkı'),
    ('Kurum içi İletişim ve İşbirliği'),
    ('Mesleki Gelişim')
),
yasak_kategori(name) as (
  values
    ('Veli İletişimi'),
    ('Öğrenci İlişkileri ve Empati')
),
kategori_eslesme(beklenen, snapshot_ad, category_id) as (
  select b.name, cs.name, cs.id
  from beklenen_kategori b
  cross join period p
  left join evaluation_period_categories_snapshot cs
    on cs.period_id = p.period_id
   and (
     cs.name = b.name
     or (b.name = 'Kurum içi İletişim ve İşbirliği' and cs.name ilike 'Kurum%İletişim%')
     or (b.name = 'Proje, Etkinlik ve Kurumsal Katkı' and cs.name ilike 'Proje%')
   )
),
dis_ekip_hedefler as (
  select tg.id as target_id, tg.name as hedef
  from evaluation_assignments ea
  join onur o on o.evaluator_id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  cross join period p
  where ea.period_id = p.period_id
    and coalesce(ea.matrix_context, 'genel') = 'genel'
    and not exists (select 1 from kendi_ekip k where k.name = tg.name)
),
hedef_kategori as (
  select
    d.hedef,
    cs.name as kategori
  from dis_ekip_hedefler d
  join onur o on true
  cross join period p
  left join evaluation_period_evaluator_target_categories tc
    on tc.period_id = p.period_id
   and tc.evaluator_id = o.evaluator_id
   and tc.target_id = d.target_id
   and tc.matrix_context = 'genel'
   and tc.scope_kind = 'period'
   and tc.is_active = true
  left join evaluation_period_categories_snapshot cs
    on cs.id = tc.category_id and cs.period_id = p.period_id
  where cs.name is not null
),
hedef_ozet as (
  select
    hedef,
    count(*) as kategori_sayisi,
    count(*) filter (
      where kategori = 'Veli İletişimi' or kategori = 'Öğrenci İlişkileri ve Empati'
    ) as yasak_var
  from hedef_kategori
  group by hedef
),
ozet as (
  select
    (select count(*) from dis_ekip_hedefler) as dis_ekip_hedef,
    (select count(*) from hedef_ozet where kategori_sayisi = 7 and yasak_var = 0) as tamam_7,
    (select count(*) from hedef_ozet where kategori_sayisi <> 7 or yasak_var > 0) as hatali,
    (select count(*) from kategori_eslesme where category_id is null) as snapshot_eksik
)
select * from (
  select 'OZET' as rapor, null::text as hedef, null::text as kategori,
    format(
      'dis_ekip=%s, tamam_7_kategori=%s, hatali=%s, snapshot_eksik=%s',
      dis_ekip_hedef, tamam_7, hatali, snapshot_eksik
    ) as detay
  from ozet

  union all

  select 'BEKLENEN7_LISTE', null, beklenen, coalesce(snapshot_ad, 'SNAPSHOT YOK')
  from kategori_eslesme

  union all

  select 'HATALI_HEDEF', hedef, null,
    format('kategori=%s, yasak_var=%s', kategori_sayisi, yasak_var)
  from hedef_ozet
  where kategori_sayisi <> 7 or yasak_var > 0
  order by hedef
  limit 20
) q
order by
  case rapor
    when 'OZET' then 1
    when 'BEKLENEN7_LISTE' then 2
    else 3
  end,
  hedef nulls first,
  kategori nulls first;
