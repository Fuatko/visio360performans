-- Berna SÖĞÜTLÜ — detaylı kapsam teşhisi
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Berna ID: e6d63576-949b-480a-b19a-c7113f0bee01
--
-- Çıktılar:
--  1) Mevcut tüm matris sayıları (genel dahil)
--  2) Sınıf/Rehber/Zümre isim bazlı beklenen/atanan (eksik-fazla)
--  3) Diğer yan görevler (kulüp/nöbet/yaşam/formatör/bilimsel) görev tablosu bazlı kontrol

-- 0) BERNA ANA ÖZET (tek satır)
select
  count(*) filter (where coalesce(ea.matrix_context, 'genel') = 'genel') as genel,
  count(*) filter (where ea.matrix_context = 'sinif_ogretmeni') as sinif_ogretmeni,
  count(*) filter (where ea.matrix_context = 'rehberlik_ogretmeni') as rehberlik_ogretmeni,
  count(*) filter (where ea.matrix_context = 'zumre') as zumre
from evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01';

-- 1) Mevcut matris dağılımı
select
  coalesce(ea.matrix_context, 'genel') as matris,
  count(*) as n
from evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
group by 1
order by n desc, matris;

-- 1b) Genel değerlendirme listesi (isim)
select tg.name as genel_hedef
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
order by tg.name;

-- 2) Sınıf/Rehber/Zümre beklenen listeye göre kontrol
with expected(target_name, ctx) as (
  values
    -- sinif_ogretmeni (8)
    ('Arman KOMBIYIKYAN', 'sinif_ogretmeni'),
    ('Didem TEKİN', 'sinif_ogretmeni'),
    ('Şeyma DOĞRUER', 'sinif_ogretmeni'),
    ('Sabriye ÇAVDARCIOĞLU TOPUZ', 'sinif_ogretmeni'),
    ('Simge ŞENAY', 'sinif_ogretmeni'),
    ('Seda UĞUR', 'sinif_ogretmeni'),
    ('Oğuzhan ÇETİN', 'sinif_ogretmeni'),
    ('Gülen ERMAN', 'sinif_ogretmeni'),
    -- rehberlik_ogretmeni (1)
    ('Doruk ATIŞKAN', 'rehberlik_ogretmeni'),
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
    and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
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

-- 3) Diğer yan görevler görev tablosu bazlı kontrol (self hariç)
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
    and target_id <> 'e6d63576-949b-480a-b19a-c7113f0bee01'::uuid -- self yok
),
assigned as (
  select distinct target_id, matrix_context as ctx
  from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
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

