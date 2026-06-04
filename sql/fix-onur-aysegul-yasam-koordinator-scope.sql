-- Onur ERMAN & Ayşegül KAZMAZ — yasam_koordinatoru kartında yalnızca Okul İçi Yaşam Koordinatörü soruları
-- Değerlendirenler: Paul GEORGES, Ender ÜSTÜNGEL, Şule KOÇAK (ve diğerleri — ataması olan herkes)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Yaşam görev paketi: e8fa6928-4a58-4dd4-aa1e-2352bf3bbdae → gorev_4 (Okul İçi Yaşam Koordinatörü)
--
-- Uygulama: node scripts/fix-onur-aysegul-yasam-koordinator-scope.mjs --apply

begin;

create temp table _targets(id uuid) on commit drop;
insert into _targets(id)
select id from users where name in ('Onur ERMAN', 'Ayşegül KAZMAZ');

create temp table _yasam_assignments(id uuid, evaluator_id uuid, target_id uuid) on commit drop;
insert into _yasam_assignments(id, evaluator_id, target_id)
select ea.id, ea.evaluator_id, ea.target_id
from evaluation_assignments ea
join _targets tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.matrix_context = 'yasam_koordinatoru';

insert into evaluation_period_evaluator_target_scope
  (period_id, evaluator_id, target_id, matrix_context, restrict_period, duty_mode, duty_package_ids, updated_at)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  a.evaluator_id,
  a.target_id,
  'yasam_koordinatoru',
  true,
  'categories',
  array['e8fa6928-4a58-4dd4-aa1e-2352bf3bbdae'::uuid],
  now()
from _yasam_assignments a
on conflict (period_id, evaluator_id, target_id, matrix_context)
do update set
  restrict_period = true,
  duty_mode = 'categories',
  duty_package_ids = array['e8fa6928-4a58-4dd4-aa1e-2352bf3bbdae'::uuid],
  updated_at = now();

delete from evaluation_period_evaluator_target_categories tc
using _yasam_assignments a
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.evaluator_id = a.evaluator_id
  and tc.target_id = a.target_id
  and tc.matrix_context = 'yasam_koordinatoru';

commit;

-- Doğrulama
select ev.name as degerlendiren, tg.name as hedef, s.duty_mode, s.duty_package_ids
from evaluation_period_evaluator_target_scope s
join users ev on ev.id = s.evaluator_id
join users tg on tg.id = s.target_id
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and s.matrix_context = 'yasam_koordinatoru'
  and tg.name in ('Onur ERMAN', 'Ayşegül KAZMAZ')
order by 1, 2;
