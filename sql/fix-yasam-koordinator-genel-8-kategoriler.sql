-- Yaşam koordinatörleri (Onur ERMAN, Ayşegül KAZMAZ) — genel değerlendirme: 8 kategori
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
--
-- Çalıştırma: Supabase Dashboard → SQL Editor (postgres rolü).
-- visio360_backup salt-okunur; bu script yazma gerektirir.
-- Alternatif: SUPABASE_SERVICE_ROLE_KEY ile scripts/apply-yasam-koordinator-genel-8.mjs
-- Tüm genel hedefler (77): Pedagojik, Ölçme, Teknolojik, Veli, Öğrenci dahil; Mesleki Gelişim YOK
-- Dokunulmaz: Paul / Ender / Şule → Onur & Ayşegül hedef (5 kategori, fix-onur-aysegul-genel-5-categories.sql)

begin;

create temp table _yasam_koord(evaluator_id uuid) on commit drop;
insert into _yasam_koord(evaluator_id)
select id from users
where name in ('Onur ERMAN', 'Ayşegül KAZMAZ');

create temp table _genel_hedefler(evaluator_id uuid, target_id uuid) on commit drop;
insert into _genel_hedefler(evaluator_id, target_id)
select distinct ea.evaluator_id, ea.target_id
from evaluation_assignments ea
join _yasam_koord yk on yk.evaluator_id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and coalesce(ea.matrix_context, 'genel') = 'genel';

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

-- Hedef özel kapsam
insert into evaluation_period_evaluator_target_scope
  (period_id, evaluator_id, target_id, matrix_context, restrict_period, duty_mode, duty_package_ids, updated_at)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  h.evaluator_id,
  h.target_id,
  'genel',
  true,
  'none',
  '{}'::uuid[],
  now()
from _genel_hedefler h
on conflict (period_id, evaluator_id, target_id, matrix_context)
do update set
  restrict_period = true,
  duty_mode = 'none',
  duty_package_ids = '{}'::uuid[],
  updated_at = now();

delete from evaluation_period_evaluator_target_categories tc
using _genel_hedefler h
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = h.evaluator_id
  and tc.target_id = h.target_id
  and tc.matrix_context = 'genel'
  and tc.scope_kind = 'period';

insert into evaluation_period_evaluator_target_categories
  (period_id, evaluator_id, target_id, matrix_context, category_id, scope_kind, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  h.evaluator_id,
  h.target_id,
  'genel',
  b.category_id,
  'period',
  true
from _genel_hedefler h
cross join _beklenen8 b
on conflict do nothing;

-- Değerlendirici varsayılan: yalnızca 8 kategori
delete from evaluation_period_evaluator_categories ec
using _yasam_koord yk, evaluation_period_categories_snapshot cs
where ec.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ec.evaluator_id = yk.evaluator_id
  and ec.scope_kind = 'period'
  and cs.id = ec.category_id
  and cs.period_id = ec.period_id
  and ec.category_id not in (select category_id from _beklenen8);

insert into evaluation_period_evaluator_scope
  (period_id, evaluator_id, restrict_period, duty_mode, duty_package_ids, updated_at)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  yk.evaluator_id,
  true,
  'none',
  '{}'::uuid[],
  now()
from _yasam_koord yk
on conflict (period_id, evaluator_id)
do update set
  restrict_period = true,
  duty_mode = 'none',
  duty_package_ids = '{}'::uuid[],
  updated_at = now();

insert into evaluation_period_evaluator_categories
  (period_id, evaluator_id, category_id, scope_kind, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  yk.evaluator_id,
  b.category_id,
  'period',
  true
from _yasam_koord yk
cross join _beklenen8 b
where not exists (
  select 1
  from evaluation_period_evaluator_categories ec
  where ec.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ec.evaluator_id = yk.evaluator_id
    and ec.category_id = b.category_id
    and ec.scope_kind = 'period'
)
on conflict do nothing;

-- Commit öncesi özet
select ev.name as degerlendiren,
  count(distinct h.target_id) as hedef,
  count(*) filter (where kat = 8) as tam_8,
  count(*) filter (where kat <> 8) as hatali
from _genel_hedefler h
join users ev on ev.id = h.evaluator_id
left join lateral (
  select count(*)::int as kat
  from evaluation_period_evaluator_target_categories tc
  where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and tc.evaluator_id = h.evaluator_id
    and tc.target_id = h.target_id
    and tc.matrix_context = 'genel'
    and tc.scope_kind = 'period'
    and tc.is_active
) k on true
group by ev.name
order by ev.name;

commit;
