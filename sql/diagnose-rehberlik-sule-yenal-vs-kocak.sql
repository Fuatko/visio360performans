-- Rehberlik matrisi: Şule YENAL vs Şule KOÇAK kontrolü (tüm değerlendiriciler)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

with rehber as (
  select ev.name as degerlendiren, tg.name as hedef
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.matrix_context = 'rehberlik_ogretmeni'
)
select
  'SAYIM' as rapor,
  null::text as degerlendiren,
  format(
    'sule_yenal=%s, sule_kocak=%s',
    (select count(*) from rehber where hedef = 'Şule YENAL'),
    (select count(*) from rehber where hedef = 'Şule KOÇAK')
  ) as detay
union all
select
  'YENAL_LISTE' as rapor,
  r.degerlendiren,
  'rehberlik hedefi = Şule YENAL'
from rehber r
where r.hedef = 'Şule YENAL'
union all
select
  'KOCAK_LISTE' as rapor,
  r.degerlendiren,
  'rehberlik hedefi = Şule KOÇAK'
from rehber r
where r.hedef = 'Şule KOÇAK'
order by rapor, degerlendiren;
