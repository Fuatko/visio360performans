-- Onur ERMAN — ekip genel / ekip dışı okul_yasam doğrulama (salt okunur)
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- Beklenen: genel=4 (ekip), okul_yasam=72, her okul_yasam hedefte 5 kategori

with onur as (
  select id as evaluator_id from users where name = 'Onur ERMAN' limit 1
),
ekip_hedef as (
  select tg.id, tg.name
  from users tg
  where tg.name in ('Oğuzhan ÇETİN', 'Gülen ERMAN', 'Ayşegül KAZMAZ', 'Baran YILDIZ')
)
select 'OZET' as rapor,
  (select count(*) from evaluation_assignments ea
   join onur o on o.evaluator_id = ea.evaluator_id
   join ekip_hedef e on e.id = ea.target_id
   where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and ea.matrix_context = 'genel') as ekip_genel,
  (select count(*) from evaluation_assignments ea
   join onur o on o.evaluator_id = ea.evaluator_id
   where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and ea.matrix_context = 'okul_yasam'
     and not exists (select 1 from ekip_hedef e where e.id = ea.target_id)) as dis_okul_yasam;

-- Örnek: ekip dışı bir hedefte kategori listesi
with onur as (select id as evaluator_id from users where name = 'Onur ERMAN' limit 1)
select count(distinct tc.category_id) as kategori_sayisi,
  array_agg(distinct cs.name order by cs.name) as kategoriler
from evaluation_period_evaluator_target_categories tc
join onur o on o.evaluator_id = tc.evaluator_id
join users tg on tg.id = tc.target_id and tg.name = 'Altan KILIÇ'
left join evaluation_period_categories_snapshot cs
  on cs.id = tc.category_id and cs.period_id = tc.period_id
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.matrix_context = 'okul_yasam';

-- Ekip: genel kapsamı kısıtsız mı?
with onur as (select id as evaluator_id from users where name = 'Onur ERMAN' limit 1)
select tg.name, ts.restrict_period, count(tc.category_id) as kategori_satir
from evaluation_period_evaluator_target_scope ts
join onur o on o.evaluator_id = ts.evaluator_id
join users tg on tg.id = ts.target_id
left join evaluation_period_evaluator_target_categories tc
  on tc.period_id = ts.period_id and tc.evaluator_id = ts.evaluator_id
 and tc.target_id = ts.target_id and tc.matrix_context = 'genel'
where ts.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ts.matrix_context = 'genel'
  and tg.name in ('Oğuzhan ÇETİN', 'Gülen ERMAN', 'Ayşegül KAZMAZ', 'Baran YILDIZ')
group by tg.name, ts.restrict_period
order by tg.name;
