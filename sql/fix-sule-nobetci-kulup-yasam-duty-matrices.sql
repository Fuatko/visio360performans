-- Şule KOÇAK: Paul/Ender ile aynı yan görev matrisleri — nöbetçi (24), kulüp (45), yaşam koordinatörü (Onur + Ayşegül)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Genel kartları (83) aynı kalır; bu görevler ayrı formlardadır.

begin;

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '6b73c2a6-afb2-437d-b9cc-1c789e13344c',
  gp.target_id,
  td.duty_preset,
  'pending'
from (
  select distinct evaluator_id, target_id
  from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
    and coalesce(matrix_context, 'genel') = 'genel'
) gp
join (
  select epud.user_id as target_id,
    case
      when lower(epd.name) like '%nöbet%' or lower(epd.name) like '%nobet%' then 'nobetci_ogretmeni'
      when lower(epd.name) like '%kulüp%' or lower(epd.name) like '%kulup%' then 'kulup_ogretmeni'
      when lower(epd.name) like '%yaşam koordinat%' or lower(epd.name) like '%yasam koordinat%' then 'yasam_koordinatoru'
    end as duty_preset
  from evaluation_period_user_duties epud
  join evaluation_duties epd on epd.id = epud.duty_id
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
) td on td.target_id = gp.target_id
where td.duty_preset in ('nobetci_ogretmeni', 'kulup_ogretmeni', 'yasam_koordinatoru')
  and gp.target_id != '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
  and not exists (
    select 1 from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = gp.evaluator_id
      and ea.target_id = gp.target_id
      and ea.matrix_context = td.duty_preset
  );

commit;

-- Özet (Paul/Ender ile karşılaştırma)
select u.name as degerlendiren, coalesce(ea.matrix_context, 'genel') as matris, count(*) as n
from evaluation_assignments ea
join users u on u.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and u.name in ('Şule KOÇAK', 'Paul GEORGES', 'Ender ÜSTÜNGEL')
group by 1, 2
order by 1, 3 desc;
