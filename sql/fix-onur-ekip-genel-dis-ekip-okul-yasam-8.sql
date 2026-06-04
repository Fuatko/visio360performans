-- Onur ERMAN — kendi ekibi: genel 21 soru | ekip dışı: okul_yasam 8 kategori
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Ekip: Oğuzhan ÇETİN, Gülen ERMAN, Ayşegül KAZMAZ, Baran YILDIZ
-- Ekip dışı 8 kategori: Mesleki Sorumluluk, Pedagojik, Ölçme, Teknolojik, Veli,
--   Öğrenci İlişkileri, Proje/Kurumsal Katkı, Kurum İçi İletişim

begin;

create temp table _onur(id uuid) on commit drop;
insert into _onur(id)
select id from users where name = 'Onur ERMAN' limit 1;

create temp table _ekip(name text) on commit drop;
insert into _ekip(name) values
  ('Oğuzhan ÇETİN'),
  ('Gülen ERMAN'),
  ('Ayşegül KAZMAZ'),
  ('Baran YILDIZ');

create temp table _ekip_ids(target_id uuid) on commit drop;
insert into _ekip_ids(target_id)
select tg.id from users tg join _ekip e on e.name = tg.name;

create temp table _dis_ekip(target_id uuid) on commit drop;
insert into _dis_ekip(target_id)
select distinct ea.target_id
from evaluation_assignments ea
join _onur o on o.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and not exists (select 1 from _ekip_ids e where e.target_id = ea.target_id);

create temp table _beklenen8(category_id uuid) on commit drop;
insert into _beklenen8(category_id)
select distinct on (wanted)
  cs.id
from (
  values
    ('Mesleki Sorumluluk'),
    ('Pedagojik Yetkinlik'),
    ('Ölçme ve Değerlendirme'),
    ('Teknolojik Yetkinlikler'),
    ('Veli İletişimi'),
    ('Öğrenci İlişkileri ve Empati'),
    ('Proje, Etkinlik ve Kurumsal Katkı'),
    ('Kurum İçi İletişim ve İşbirliği')
) as v(wanted)
join evaluation_period_categories_snapshot cs
  on cs.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
 and (
   cs.name = v.wanted
   or (v.wanted = 'Pedagojik Yetkinlik' and cs.name ilike 'pedagojik%')
   or (v.wanted = 'Ölçme ve Değerlendirme' and (cs.name ilike 'ölçme%' or cs.name ilike 'olcme%'))
   or (v.wanted = 'Kurum İçi İletişim ve İşbirliği' and cs.name ilike 'Kurum%İletişim%')
   or (v.wanted = 'Proje, Etkinlik ve Kurumsal Katkı' and cs.name ilike 'Proje%')
 )
order by wanted, cs.name;

-- 1) Ekip dışı: genel → okul_yasam (yalnızca pending, cevapsız)
delete from evaluation_responses er
using evaluation_assignments ea, _onur o, _dis_ekip d
where er.assignment_id = ea.id
  and ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = o.id
  and ea.target_id = d.target_id
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and ea.status = 'pending';

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  o.id,
  d.target_id,
  'okul_yasam',
  'pending'
from _dis_ekip d
cross join _onur o
where not exists (
  select 1 from evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = o.id
    and ea.target_id = d.target_id
    and ea.matrix_context = 'okul_yasam'
);

delete from evaluation_assignments ea
using _onur o, _dis_ekip d
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = o.id
  and ea.target_id = d.target_id
  and coalesce(ea.matrix_context, 'genel') = 'genel';

-- 2) Ekip dışı: okul_yasam kapsam 8 kategori
insert into evaluation_period_evaluator_target_scope
  (period_id, evaluator_id, target_id, matrix_context, restrict_period, duty_mode, duty_package_ids, updated_at)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  o.id,
  d.target_id,
  'okul_yasam',
  true,
  'none',
  '{}'::uuid[],
  now()
from _dis_ekip d
cross join _onur o
on conflict (period_id, evaluator_id, target_id, matrix_context)
do update set
  restrict_period = true,
  duty_mode = 'none',
  duty_package_ids = '{}'::uuid[],
  updated_at = now();

delete from evaluation_period_evaluator_target_categories tc
using _onur o, _dis_ekip d
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = o.id
  and tc.target_id = d.target_id
  and tc.matrix_context = 'okul_yasam';

insert into evaluation_period_evaluator_target_categories
  (period_id, evaluator_id, target_id, matrix_context, category_id, scope_kind, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  o.id,
  d.target_id,
  'okul_yasam',
  b.category_id,
  'period',
  true
from _dis_ekip d
cross join _onur o
cross join _beklenen8 b;

-- Ekip dışı eski genel kapsamını temizle
delete from evaluation_period_evaluator_target_categories tc
using _onur o, _dis_ekip d
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = o.id
  and tc.target_id = d.target_id
  and tc.matrix_context = 'genel';

delete from evaluation_period_evaluator_target_scope ts
using _onur o, _dis_ekip d
where ts.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ts.evaluator_id = o.id
  and ts.target_id = d.target_id
  and ts.matrix_context = 'genel';

-- 3) Kendi ekibi: genel tam 21 soru (kategori kısıtı yok)
delete from evaluation_period_evaluator_target_categories tc
using _onur o, _ekip_ids e
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = o.id
  and tc.target_id = e.target_id
  and tc.matrix_context = 'genel';

insert into evaluation_period_evaluator_target_scope
  (period_id, evaluator_id, target_id, matrix_context, restrict_period, duty_mode, duty_package_ids, updated_at)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  o.id,
  e.target_id,
  'genel',
  false,
  'none',
  '{}'::uuid[],
  now()
from _ekip_ids e
cross join _onur o
on conflict (period_id, evaluator_id, target_id, matrix_context)
do update set
  restrict_period = false,
  duty_mode = 'none',
  duty_package_ids = '{}'::uuid[],
  updated_at = now();

-- Doğrulama (commit öncesi — temp tablolar hâlâ geçerli)
select 'ekip_genel' as rapor, count(*) as adet
from evaluation_assignments ea
join _onur o on o.id = ea.evaluator_id
join _ekip_ids e on e.target_id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.matrix_context = 'genel';

select 'dis_okul_yasam' as rapor, count(*) as adet
from evaluation_assignments ea
join _onur o on o.id = ea.evaluator_id
join _dis_ekip d on d.target_id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.matrix_context = 'okul_yasam';

select 'dis_8_kategori_ornek' as rapor,
  count(distinct tc.category_id) as kategori_sayisi,
  string_agg(distinct cs.name, ', ' order by cs.name) as kategoriler
from evaluation_period_evaluator_target_categories tc
join _onur o on o.id = tc.evaluator_id
join _dis_ekip d on d.target_id = tc.target_id
left join evaluation_period_categories_snapshot cs
  on cs.id = tc.category_id and cs.period_id = tc.period_id
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.matrix_context = 'okul_yasam'
limit 1;

commit;

-- =============================================================================
-- Sadece doğrulama (commit sonrası ayrı çalıştırın — temp tablo yok)
-- Beklenen: ekip_genel=4, dis_okul_yasam=72, kategori_sayisi=8
-- =============================================================================
/*
with onur as (
  select id as evaluator_id from users where name = 'Onur ERMAN' limit 1
),
ekip as (
  select unnest(array['Oğuzhan ÇETİN','Gülen ERMAN','Ayşegül KAZMAZ','Baran YILDIZ']) as name
)
select 'ekip_genel' as rapor, count(*) as adet
from evaluation_assignments ea
join onur o on o.evaluator_id = ea.evaluator_id
join users tg on tg.id = ea.target_id
join ekip e on e.name = tg.name
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.matrix_context = 'genel';

with onur as (
  select id as evaluator_id from users where name = 'Onur ERMAN' limit 1
),
ekip as (
  select tg.id from users tg
  where tg.name in ('Oğuzhan ÇETİN','Gülen ERMAN','Ayşegül KAZMAZ','Baran YILDIZ')
)
select 'dis_okul_yasam' as rapor, count(*) as adet
from evaluation_assignments ea
join onur o on o.evaluator_id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.matrix_context = 'okul_yasam'
  and not exists (select 1 from ekip e where e.id = ea.target_id);
*/
