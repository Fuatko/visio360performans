-- Ebru AKTİMUR — kapsam kontrolü (eksik/fazla)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

-- 1) Ebru mevcut atama sayıları (matris bazlı)
select
  coalesce(ea.matrix_context, 'genel') as matris,
  count(*) as n
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Ebru AKTİMUR'
group by 1
order by n desc, matris;

-- 2) Görev tablosuna göre beklenen vs Ebru atanan (self hariç)
with ebru as (
  select id from users where name = 'Ebru AKTİMUR' limit 1
),
expected as (
  select distinct
    epud.user_id as target_id,
    case
      when lower(d.name) like '%sınıf%' or lower(d.name) like '%sinif%' then 'sinif_ogretmeni'
      when lower(d.name) like '%rehber%' then 'rehberlik_ogretmeni'
      when lower(d.name) like '%zümre%' or lower(d.name) like '%zumre%' then 'zumre'
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
  select e.target_id, e.ctx
  from expected e
  cross join ebru eb
  where e.ctx is not null
    and e.target_id <> eb.id
),
ebru_assigned as (
  select distinct ea.target_id, ea.matrix_context as ctx
  from evaluation_assignments ea
  join ebru eb on eb.id = ea.evaluator_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.matrix_context is not null
)
select
  ef.ctx as matris,
  count(*) as beklenen,
  count(*) filter (where exists (
    select 1 from ebru_assigned a
    where a.target_id = ef.target_id and a.ctx = ef.ctx
  )) as atanan,
  count(*) filter (where not exists (
    select 1 from ebru_assigned a
    where a.target_id = ef.target_id and a.ctx = ef.ctx
  )) as eksik
from expected_filtered ef
group by ef.ctx
order by ef.ctx;

-- 3) Eksik kişiler (matris + isim)
with ebru as (
  select id from users where name = 'Ebru AKTİMUR' limit 1
),
expected as (
  select distinct
    epud.user_id as target_id,
    case
      when lower(d.name) like '%sınıf%' or lower(d.name) like '%sinif%' then 'sinif_ogretmeni'
      when lower(d.name) like '%rehber%' then 'rehberlik_ogretmeni'
      when lower(d.name) like '%zümre%' or lower(d.name) like '%zumre%' then 'zumre'
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
  select e.target_id, e.ctx
  from expected e
  cross join ebru eb
  where e.ctx is not null
    and e.target_id <> eb.id
),
ebru_assigned as (
  select distinct ea.target_id, ea.matrix_context as ctx
  from evaluation_assignments ea
  join ebru eb on eb.id = ea.evaluator_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.matrix_context is not null
)
select ef.ctx as matris, u.name as eksik_kisi
from expected_filtered ef
join users u on u.id = ef.target_id
where not exists (
  select 1 from ebru_assigned a
  where a.target_id = ef.target_id and a.ctx = ef.ctx
)
order by ef.ctx, u.name;

