-- Ayşegül KAZMAZ — genel OUT atamalarını okul_yasam grubuna taşı (Okul İçi Yaşam Koordinatörü)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Onur ERMAN dokunulmaz (ekip dışı zaten oy; ekip içi 4 genel kasıtlı).
--
-- Uygulama: node scripts/fix-aysegul-genel-to-okul-yasam.mjs --apply
-- Alternatif: bu SQL dosyasını Supabase SQL Editor'de çalıştırın.

begin;

create temp table _aysegul(id uuid) on commit drop;
insert into _aysegul(id)
select id from users where name = 'Ayşegül KAZMAZ' limit 1;

-- 1) Atamalar: genel → okul_yasam (yan görev kartları hariç)
update evaluation_assignments ea
set matrix_context = 'okul_yasam'
from _aysegul a
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = a.id
  and coalesce(ea.matrix_context, 'genel') = 'genel';

-- 2) Hedef kapsamı: genel → okul_yasam
insert into evaluation_period_evaluator_target_scope
  (period_id, evaluator_id, target_id, matrix_context, restrict_period, duty_mode, duty_package_ids, updated_at)
select
  s.period_id,
  s.evaluator_id,
  s.target_id,
  'okul_yasam',
  s.restrict_period,
  s.duty_mode,
  coalesce(s.duty_package_ids, '{}'::uuid[]),
  now()
from evaluation_period_evaluator_target_scope s
join _aysegul a on a.id = s.evaluator_id
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and s.matrix_context = 'genel'
on conflict (period_id, evaluator_id, target_id, matrix_context)
do update set
  restrict_period = excluded.restrict_period,
  duty_mode = excluded.duty_mode,
  duty_package_ids = excluded.duty_package_ids,
  updated_at = now();

insert into evaluation_period_evaluator_target_categories
  (period_id, evaluator_id, target_id, matrix_context, category_id, scope_kind, is_active)
select
  c.period_id,
  c.evaluator_id,
  c.target_id,
  'okul_yasam',
  c.category_id,
  c.scope_kind,
  c.is_active
from evaluation_period_evaluator_target_categories c
join _aysegul a on a.id = c.evaluator_id
where c.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and c.matrix_context = 'genel'
  and c.is_active = true
on conflict do nothing;

delete from evaluation_period_evaluator_target_categories c
using _aysegul a
where c.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and c.evaluator_id = a.id
  and c.matrix_context = 'genel';

delete from evaluation_period_evaluator_target_scope s
using _aysegul a
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and s.evaluator_id = a.id
  and s.matrix_context = 'genel';

commit;

-- Doğrulama
select
  ev.name,
  count(*) filter (where ea.matrix_context = 'okul_yasam') as okul_yasam,
  count(*) filter (where ea.matrix_context = 'genel') as genel,
  count(*) as toplam
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Ayşegül KAZMAZ'
group by ev.name;
