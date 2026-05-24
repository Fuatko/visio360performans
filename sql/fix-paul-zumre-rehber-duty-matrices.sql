-- Paul GEORGES: genel ataması olan hedeflerde eksik zümre / rehberlik görev matrisleri
-- (yaşam koordinatörü zaten var). Dönem: 2026 EĞİTMEN

begin;

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '6350a539-e0aa-49b7-8895-9ee572124bfe',
  gp.target_id,
  td.duty_preset,
  'pending'
from (
  select distinct evaluator_id, target_id
  from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
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
      and ea.evaluator_id = gp.evaluator_id
      and ea.target_id = gp.target_id
      and ea.matrix_context = td.duty_preset
  );

commit;

-- Paul özeti
select coalesce(matrix_context, 'genel') as matris, count(*) as n
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
group by 1
order by 2 desc;
