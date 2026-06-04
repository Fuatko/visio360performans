-- Paul GEORGES — zümre görev matrisi eksik/fazla kontrolü
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

with expected_zumre as (
  select distinct u.id, u.name
  from evaluation_period_user_duties epud
  join evaluation_duties d on d.id = epud.duty_id
  join users u on u.id = epud.user_id
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and (lower(d.name) like '%zümre%' or lower(d.name) like '%zumre%')
),
paul_zumre as (
  select distinct u.id, u.name
  from evaluation_assignments ea
  join users u on u.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
    and ea.matrix_context = 'zumre'
)
select 'SAYIM' as rapor, null::text as isim,
  format(
    'beklenen_zumre=%s, paul_atanan_zumre=%s, eksik=%s, fazla=%s',
    (select count(*) from expected_zumre),
    (select count(*) from paul_zumre),
    (select count(*) from expected_zumre e where not exists (select 1 from paul_zumre p where p.id = e.id)),
    (select count(*) from paul_zumre p where not exists (select 1 from expected_zumre e where e.id = p.id))
  ) as detay
union all
select 'EKSIK', e.name, 'Görev var ama Paul zümre ataması yok'
from expected_zumre e
where not exists (select 1 from paul_zumre p where p.id = e.id)
union all
select 'FAZLA', p.name, 'Paul zümre ataması var ama görev listesinde yok'
from paul_zumre p
where not exists (select 1 from expected_zumre e where e.id = p.id)
order by rapor, isim nulls first;

