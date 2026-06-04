-- Paul GEORGES — kulüp öğretmeni matrisi eksik/fazla kontrolü
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

with expected_kulup as (
  select distinct u.id, u.name
  from evaluation_period_user_duties epud
  join evaluation_duties d on d.id = epud.duty_id
  join users u on u.id = epud.user_id
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and (lower(d.name) like '%kulüp%' or lower(d.name) like '%kulup%')
),
paul_kulup as (
  select distinct u.id, u.name
  from evaluation_assignments ea
  join users u on u.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
    and ea.matrix_context = 'kulup_ogretmeni'
)
select 'SAYIM' as rapor, null::text as isim,
  format(
    'beklenen_kulup=%s, paul_atanan_kulup=%s, eksik=%s, fazla=%s',
    (select count(*) from expected_kulup),
    (select count(*) from paul_kulup),
    (select count(*) from expected_kulup e where not exists (select 1 from paul_kulup p where p.id = e.id)),
    (select count(*) from paul_kulup p where not exists (select 1 from expected_kulup e where e.id = p.id))
  ) as detay
union all
select 'EKSIK', e.name, 'Görev var ama Paul kulüp ataması yok'
from expected_kulup e
where not exists (select 1 from paul_kulup p where p.id = e.id)
union all
select 'FAZLA', p.name, 'Paul kulüp ataması var ama görev listesinde yok'
from paul_kulup p
where not exists (select 1 from expected_kulup e where e.id = p.id)
order by rapor, isim nulls first;

