-- Değerlendiren kapsamı / Teknolojik Yetkinlikler kontrolü (salt okunur)
-- Örnek: UTKU AYTAÇ için period_id'yi değiştirin.

-- 1) Dönemdeki alt kategoriler (ana başlık ile)
select
  c.name as alt_kategori,
  m.name as ana_kategori,
  count(q.id) as soru_sayisi
from evaluation_period_categories_snapshot c
left join evaluation_period_main_categories_snapshot m on m.id = c.main_category_id and m.period_id = c.period_id
left join evaluation_period_questions_snapshot q on q.category_id = c.id and q.period_id = c.period_id
where c.period_id = 'PERIOD_ID_BURAYA'
group by c.name, m.name
order by m.name, c.name;

-- 2) Değerlendiren → hedef kapsamındaki seçili kategoriler
select
  ev.name as degerlendiren,
  tg.name as hedef,
  s.matrix_context,
  array_agg(distinct coalesce(cs.name, c.name) order by coalesce(cs.name, c.name)) as secili_kategoriler
from evaluation_period_evaluator_target_scope s
join users ev on ev.id = s.evaluator_id
join users tg on tg.id = s.target_id
left join evaluation_period_evaluator_target_categories tc
  on tc.period_id = s.period_id
  and tc.evaluator_id = s.evaluator_id
  and tc.target_id = s.target_id
  and tc.matrix_context = s.matrix_context
  and tc.scope_kind = 'period'
left join evaluation_period_categories_snapshot cs on cs.id = tc.category_id and cs.period_id = s.period_id
left join categories c on c.id = tc.category_id
where s.period_id = 'PERIOD_ID_BURAYA'
  and ev.name ilike '%utku%aytac%'
group by ev.name, tg.name, s.matrix_context;
