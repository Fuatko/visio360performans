-- Paul GEORGES — rehberlik_ogretmeni değerlendirme kontrolü
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

with paul_rehber as (
  select tg.name as hedef
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Paul GEORGES'
    and ea.matrix_context = 'rehberlik_ogretmeni'
)
select 'SAYIM' as rapor, null::text as isim, format('paul_rehberlik=%s', (select count(*) from paul_rehber)) as detay
union all
select 'LISTE' as rapor, hedef as isim, 'rehberlik_ogretmeni hedefi' as detay
from paul_rehber
order by rapor, isim;
