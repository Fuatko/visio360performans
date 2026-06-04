-- Zümre Başkanı Zeynep DEDEBAŞ — genel değerlendirme ekip kontrolü
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

with genel_liste as (
  select tg.name as hedef
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Zeynep DEDEBAŞ'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select 'SAYIM' as rapor, null::text as isim, format('zeynep_genel=%s', (select count(*) from genel_liste)) as detay
union all
select 'LISTE' as rapor, hedef as isim, 'genel değerlendirme hedefi' as detay
from genel_liste
order by rapor, isim;
