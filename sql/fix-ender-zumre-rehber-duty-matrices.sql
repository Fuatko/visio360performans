-- Ender ÜSTÜNGEL: eksik zümre + rehberlik görev matrisleri (Paul ile aynı mantık)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

begin;

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '5ec438f5-1eb2-41a0-ab19-4b2a549991cd',
  gp.target_id,
  td.duty_preset,
  'pending'
from (
  select distinct target_id
  from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
    and coalesce(matrix_context, 'genel') = 'genel'
) gp
join (
  select epud.user_id as target_id,
    case
      when lower(epd.name) like '%zümre%' or lower(epd.name) like '%zumre%' then 'zumre'
      when lower(epd.name) like '%rehber%' then 'rehberlik_ogretmeni'
      when lower(epd.name) like '%yaşam koordinat%' or lower(epd.name) like '%yasam koordinat%' then 'yasam_koordinatoru'
    end as duty_preset
  from evaluation_period_user_duties epud
  join evaluation_duties epd on epd.id = epud.duty_id
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
) td on td.target_id = gp.target_id
where td.duty_preset in ('zumre', 'rehberlik_ogretmeni', 'yasam_koordinatoru')
  and not exists (
    select 1 from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
      and ea.target_id = gp.target_id
      and ea.matrix_context = td.duty_preset
  );

commit;

select coalesce(matrix_context, 'genel') as matris, count(*) as n
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
group by 1
order by n desc;
