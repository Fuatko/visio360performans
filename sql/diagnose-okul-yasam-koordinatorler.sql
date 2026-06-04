-- Okul yaşam koordinatörleri — hedef sayısı, liste, kategori kapsamı karşılaştırması
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

-- 1) Özet sayılar
select
  ev.name as degerlendiren,
  count(*) filter (where ea.matrix_context = 'okul_yasam') as okul_yasam,
  count(*) filter (where ea.matrix_context = 'formator') as formator,
  count(*) as toplam
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name in (
    'Simgenur GÜDEBERK KORKMAZ',
    'Jennifer COLOMB ŞENER',
    'Aslı Deniz DELİKANLI',
    'Müge SARUHAN ALTINKAYA',
    'Utku AYTAÇ'
  )
group by ev.name
order by ev.name;

-- 2) Kategori kapsamı (hedef bazlı — örnek bir hedeften)
with oy_ev AS (
  select unnest(array[
    'Simgenur GÜDEBERK KORKMAZ','Jennifer COLOMB ŞENER','Aslı Deniz DELİKANLI',
    'Müge SARUHAN ALTINKAYA','Utku AYTAÇ'
  ]) as ev_name
),
sample_target AS (
  select tg.id as target_id
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Simgenur GÜDEBERK KORKMAZ'
    and ea.matrix_context = 'okul_yasam'
    and tg.name not in ('Utku AYTAÇ', 'Simgenur GÜDEBERK KORKMAZ')
  limit 1
)
select
  e.ev_name as degerlendiren,
  count(distinct tc.category_id) as kategori_sayisi,
  string_agg(distinct cs.name, ', ' order by cs.name) as kategoriler
from oy_ev e
join users ev on ev.name = e.ev_name
cross join sample_target st
left join evaluation_period_evaluator_target_categories tc
  on tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
 and tc.evaluator_id = ev.id
 and tc.target_id = st.target_id
 and tc.matrix_context = 'okul_yasam'
 and tc.is_active = true
left join evaluation_period_categories_snapshot cs
  on cs.id = tc.category_id and cs.period_id = tc.period_id
group by e.ev_name
order by e.ev_name;

-- 3) Simgenur referansına göre eksik / fazla (Utku'da kendisi hariç 80 normal)
with ref as (
  select tg.name
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Simgenur GÜDEBERK KORKMAZ'
    and ea.matrix_context = 'okul_yasam'
)
select
  ev.name as degerlendiren,
  count(*) as okul_yasam,
  count(*) filter (where not exists (select 1 from ref r where r.name = tg.name)) as fazla,
  (select count(*) from ref) - count(*) as eksik_vs_simgenur
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.matrix_context = 'okul_yasam'
  and ev.name in (
    'Jennifer COLOMB ŞENER','Aslı Deniz DELİKANLI',
    'Müge SARUHAN ALTINKAYA','Utku AYTAÇ'
  )
group by ev.name
order by ev.name;

-- 4) Simgenur — tam hedef listesi (81 kişi)
select row_number() over (order by tg.name) as sira, tg.name as hedef
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Simgenur GÜDEBERK KORKMAZ'
  and ea.matrix_context = 'okul_yasam'
order by tg.name;
