-- Paul GEORGES + Ender ÜSTÜNGEL: tüm sınıf öğretmenleri (sinif_ogretmeni görev matrisi)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Sınıf matrisi: Paul/Ender/Şule sütununda tüm satırlar = 1
-- Genel + rehber + zümre + … ayrı kalır; bu script yalnızca sinif_ogretmeni ekler

begin;

delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id in (
      '6350a539-e0aa-49b7-8895-9ee572124bfe',
      '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
    )
    and matrix_context = 'sinif_ogretmeni'
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id in (
    '6350a539-e0aa-49b7-8895-9ee572124bfe',
    '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
  )
  and matrix_context = 'sinif_ogretmeni';

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  gp.evaluator_id,
  gp.target_id,
  'sinif_ogretmeni',
  'pending'
from (
  select distinct evaluator_id, target_id
  from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id in (
      '6350a539-e0aa-49b7-8895-9ee572124bfe',
      '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
    )
    and coalesce(matrix_context, 'genel') = 'genel'
) gp
join evaluation_period_user_duties epud
  on epud.user_id = gp.target_id and epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
join evaluation_duties epd on epd.id = epud.duty_id
  and (lower(epd.name) like '%sınıf%' or lower(epd.name) like '%sinif%')
where not exists (
  select 1 from evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = gp.evaluator_id
    and ea.target_id = gp.target_id
    and ea.matrix_context = 'sinif_ogretmeni'
);

commit;

select u.name as degerlendiren, coalesce(ea.matrix_context, 'genel') as matris, count(*) as n
from users u
join evaluation_assignments ea on ea.evaluator_id = u.id
  and ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
where u.name in ('Paul GEORGES', 'Ender ÜSTÜNGEL')
group by u.name, coalesce(ea.matrix_context, 'genel')
order by 1, 3 desc;
