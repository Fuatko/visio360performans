-- Rengin TAMKAN DOĞAN — detaylı kapsam teşhisi
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Rengin ID: 7d85b402-77f1-4959-bbec-1b62f0d5e894
--
-- Çıktılar:
--  1) Mevcut matris dağılımı (genel dahil)
--  2) Genel hedef isim listesi
--  3) Sınıf/Rehber/Zümre beklenen listeye göre eksik/fazla
--  4) Kulüp/Nöbetçi/Yaşam/Formatör/Bilimsel görev tablosu bazlı beklenen/atanan

-- 1) Mevcut matris dağılımı
select
  coalesce(ea.matrix_context, 'genel') as matris,
  count(*) as n
from evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
group by 1
order by n desc, matris;

-- 2) Genel hedef isim listesi
select tg.name as genel_hedef
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
order by tg.name;

-- 3) Sınıf/Rehber/Zümre beklenen listeye göre kontrol
with expected(target_name, ctx) as (
  values
    -- sinif_ogretmeni (8)
    ('Gülnur TİRYAKİ', 'sinif_ogretmeni'),
    ('Mesude YILDIRIM', 'sinif_ogretmeni'),
    ('Gökhan BÜYÜKENGEZ', 'sinif_ogretmeni'),
    ('Ayhan YAĞIZ', 'sinif_ogretmeni'),
    ('Şule YENAL', 'sinif_ogretmeni'),
    ('Patrice CARINO', 'sinif_ogretmeni'),
    ('Elif CANDEMİR', 'sinif_ogretmeni'),
    ('Berna BENER', 'sinif_ogretmeni'),
    -- rehberlik_ogretmeni (2)
    ('Şule YENAL', 'rehberlik_ogretmeni'),
    ('Murat KAZANOĞLU', 'rehberlik_ogretmeni'),
    -- zumre (12)
    ('Altan KILIÇ', 'zumre'),
    ('Ayhan YAĞIZ', 'zumre'),
    ('Berna BENER', 'zumre'),
    ('Gökçe TAYLAN', 'zumre'),
    ('Gökhan BÜYÜKENGEZ', 'zumre'),
    ('Onur ERMAN', 'zumre'),
    ('Peggy MOREL ÖZDEMİR', 'zumre'),
    ('Stanislaw EON DU VAL', 'zumre'),
    ('Şule KOÇAK', 'zumre'),
    ('Yeliz ERARSLAN', 'zumre'),
    ('Yonca İŞLEK', 'zumre'),
    ('Zeynep DEDEBAŞ', 'zumre')
),
assigned as (
  select tg.name as target_name, ea.matrix_context as ctx
  from evaluation_assignments ea
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
    and ea.matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
)
select rapor, matris, isim, detay
from (
  select
    1 as ord,
    'SAYIM'::text as rapor,
    x.ctx as matris,
    null::text as isim,
    format('beklenen=%s atanan=%s eksik=%s fazla=%s', x.exp_cnt, x.asg_cnt, x.missing_cnt, x.extra_cnt) as detay
  from (
    select
      c.ctx,
      count(*) filter (where c.src = 'exp') as exp_cnt,
      count(*) filter (where c.src = 'asg') as asg_cnt,
      count(*) filter (where c.src = 'missing') as missing_cnt,
      count(*) filter (where c.src = 'extra') as extra_cnt
    from (
      select e.ctx, e.target_name, 'exp'::text as src from expected e
      union all
      select a.ctx, a.target_name, 'asg' from assigned a
      union all
      select e.ctx, e.target_name, 'missing'
      from expected e
      where not exists (select 1 from assigned a where a.ctx = e.ctx and a.target_name = e.target_name)
      union all
      select a.ctx, a.target_name, 'extra'
      from assigned a
      where not exists (select 1 from expected e where e.ctx = a.ctx and e.target_name = a.target_name)
    ) c
    group by c.ctx
  ) x
  union all
  select 2, 'EKSIK', e.ctx, e.target_name, 'Beklenen listede var, atama yok'
  from expected e
  where not exists (select 1 from assigned a where a.ctx = e.ctx and a.target_name = e.target_name)
  union all
  select 3, 'FAZLA', a.ctx, a.target_name, 'Atama var, beklenen listede yok'
  from assigned a
  where not exists (select 1 from expected e where e.ctx = a.ctx and e.target_name = a.target_name)
) q
order by ord, matris, isim nulls first;

-- 4) Diğer yan görevler görev tablosu bazlı kontrol (self hariç)
with duty_expected as (
  select distinct
    epud.user_id as target_id,
    case
      when lower(d.name) like '%kulüp%' or lower(d.name) like '%kulup%' then 'kulup_ogretmeni'
      when lower(d.name) like '%nöbet%' or lower(d.name) like '%nobet%' then 'nobetci_ogretmeni'
      when lower(d.name) like '%yaşam koordinat%' or lower(d.name) like '%yasam koordinat%' then 'yasam_koordinatoru'
      when lower(d.name) like '%formatör%' or lower(d.name) like '%formator%' then 'formator'
      when lower(d.name) like '%bilimsel etkinlik%' then 'bilimsel_etkinlik_koordinatoru'
    end as ctx
  from evaluation_period_user_duties epud
  join evaluation_duties d on d.id = epud.duty_id
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
),
expected_filtered as (
  select target_id, ctx
  from duty_expected
  where ctx is not null
    and target_id <> '7d85b402-77f1-4959-bbec-1b62f0d5e894'::uuid -- self yok
),
assigned as (
  select distinct target_id, matrix_context as ctx
  from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
    and matrix_context in ('kulup_ogretmeni', 'nobetci_ogretmeni', 'yasam_koordinatoru', 'formator', 'bilimsel_etkinlik_koordinatoru')
)
select
  ef.ctx as matris,
  count(*) as beklenen,
  count(*) filter (where exists (
    select 1 from assigned a where a.target_id = ef.target_id and a.ctx = ef.ctx
  )) as atanan,
  count(*) filter (where not exists (
    select 1 from assigned a where a.target_id = ef.target_id and a.ctx = ef.ctx
  )) as eksik
from expected_filtered ef
group by ef.ctx
order by ef.ctx;

