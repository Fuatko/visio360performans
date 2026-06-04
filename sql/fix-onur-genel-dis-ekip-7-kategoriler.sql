-- Onur ERMAN — ekip dışı genel değerlendirme: 7 kategori (Veli + Öğrenci İlişkileri YOK)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Kendi ekibi hariç: Oğuzhan ÇETİN, Gülen ERMAN, Ayşegül KAZMAZ, Baran YILDIZ

begin;

create temp table _onur_dis_ekip_targets(target_id uuid) on commit drop;
insert into _onur_dis_ekip_targets(target_id)
select distinct tg.id
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Onur ERMAN'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and tg.name not in ('Oğuzhan ÇETİN', 'Gülen ERMAN', 'Ayşegül KAZMAZ', 'Baran YILDIZ');

create temp table _beklenen7(category_id uuid, name text) on commit drop;
insert into _beklenen7(category_id, name)
select distinct on (wanted)
  cs.id,
  cs.name
from (
  values
    ('Mesleki Sorumluluk'),
    ('Pedagojik Yetkinlik'),
    ('Ölçme ve Değerlendirme'),
    ('Teknolojik Yetkinlikler'),
    ('Proje, Etkinlik ve Kurumsal Katkı'),
    ('Kurum içi İletişim ve İşbirliği'),
    ('Mesleki Gelişim')
) as v(wanted)
join evaluation_period_categories_snapshot cs
  on cs.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
 and (
   cs.name = v.wanted
   or (v.wanted = 'Pedagojik Yetkinlik' and cs.name ilike 'pedagojik%')
   or (v.wanted = 'Ölçme ve Değerlendirme' and (cs.name ilike 'ölçme%' or cs.name ilike 'olcme%'))
   or (v.wanted = 'Kurum içi İletişim ve İşbirliği' and cs.name ilike 'Kurum%İletişim%')
   or (v.wanted = 'Proje, Etkinlik ve Kurumsal Katkı' and cs.name ilike 'Proje%')
 )
order by wanted, cs.name;

-- Hedef özel kapsam: restrict_period + 7 kategori
insert into evaluation_period_evaluator_target_scope
  (period_id, evaluator_id, target_id, matrix_context, restrict_period, duty_mode, duty_package_ids, updated_at)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  t.target_id,
  'genel',
  true,
  'none',
  '{}'::uuid[],
  now()
from _onur_dis_ekip_targets t
cross join (select id from users where name = 'Onur ERMAN' limit 1) ev
on conflict (period_id, evaluator_id, target_id, matrix_context)
do update set
  restrict_period = true,
  duty_mode = 'none',
  duty_package_ids = '{}'::uuid[],
  updated_at = now();

delete from evaluation_period_evaluator_target_categories tc
using _onur_dis_ekip_targets t
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = (select id from users where name = 'Onur ERMAN' limit 1)
  and tc.target_id = t.target_id
  and tc.matrix_context = 'genel'
  and tc.scope_kind = 'period';

insert into evaluation_period_evaluator_target_categories
  (period_id, evaluator_id, target_id, matrix_context, category_id, scope_kind, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  t.target_id,
  'genel',
  b.category_id,
  'period',
  true
from _onur_dis_ekip_targets t
cross join (select id from users where name = 'Onur ERMAN' limit 1) ev
cross join _beklenen7 b
on conflict do nothing;

-- Değerlendirici varsayılan: Veli / Öğrenci İlişkileri kaldır, 7 kategoriyi tamamla
delete from evaluation_period_evaluator_categories ec
using evaluation_period_categories_snapshot cs
where ec.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ec.evaluator_id = (select id from users where name = 'Onur ERMAN' limit 1)
  and ec.scope_kind = 'period'
  and cs.id = ec.category_id
  and cs.period_id = ec.period_id
  and (
    cs.name = 'Veli İletişimi'
    or cs.name = 'Öğrenci İlişkileri ve Empati'
  );

insert into evaluation_period_evaluator_scope
  (period_id, evaluator_id, restrict_period, duty_mode, duty_package_ids, updated_at)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  true,
  'none',
  '{}'::uuid[],
  now()
from (select id from users where name = 'Onur ERMAN' limit 1) ev
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
  ev.id,
  b.category_id,
  'period',
  true
from (select id from users where name = 'Onur ERMAN' limit 1) ev
cross join _beklenen7 b
where not exists (
  select 1
  from evaluation_period_evaluator_categories ec
  where ec.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ec.evaluator_id = ev.id
    and ec.category_id = b.category_id
    and ec.scope_kind = 'period'
)
on conflict do nothing;

-- Kontrol (commit öncesi)
select
  count(*) filter (where kategori_sayisi = 7 and yasak = 0) as tamam_7,
  count(*) filter (where kategori_sayisi <> 7 or yasak > 0) as hatali
from (
  select
    t.target_id,
    count(tc.category_id) as kategori_sayisi,
    count(*) filter (
      where cs.name in ('Veli İletişimi', 'Öğrenci İlişkileri ve Empati')
    ) as yasak
  from _onur_dis_ekip_targets t
  join users ev on ev.name = 'Onur ERMAN'
  left join evaluation_period_evaluator_target_categories tc
    on tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
   and tc.evaluator_id = ev.id
   and tc.target_id = t.target_id
   and tc.matrix_context = 'genel'
   and tc.scope_kind = 'period'
   and tc.is_active = true
  left join evaluation_period_categories_snapshot cs
    on cs.id = tc.category_id and cs.period_id = tc.period_id
  group by t.target_id
) x;

commit;
