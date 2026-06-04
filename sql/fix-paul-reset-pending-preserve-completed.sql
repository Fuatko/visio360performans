-- ⚠️ DİKKAT — scope tablosu eksikse Paul'un çoğu atamasını SİLER.
-- Önce: sql/fix-paul-restore-ender-parity.sql (Ender ile hizalama)
-- Bu dosyayı yalnızca scope satır sayısı Ender ile aynı seviyedeyken kullanın.
--
-- Paul GEORGES için güvenli reset:
-- - COMPLETED atamalar korunur
-- - Pending atamalar + bağlı response kayıtları temizlenir
-- - evaluation_period_evaluator_target_scope kaynağından yeniden pending üretilir
--
-- Period: 2026 EĞİTMEN
-- SADECE Paul GEORGES (6350a539…). Paul LAFORGE'a dokunulmaz.

begin;

-- 0) Sabitler — isim araması yok (LAFORGE ile karışmaz)
create temp table _ctx on commit drop as
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id,
  '6350a539-e0aa-49b7-8895-9ee572124bfe'::uuid as evaluator_id;

do $$
declare
  v_name text;
begin
  select u.name into v_name
  from _ctx c
  join public.users u on u.id = c.evaluator_id;
  if v_name is distinct from 'Paul GEORGES' then
    raise exception 'Güvenlik: evaluator_id Paul GEORGES değil (%)', v_name;
  end if;
end $$;

do $$
declare
  v_paul_scope int;
  v_ender_scope int;
begin
  select count(*) into v_paul_scope
  from public.evaluation_period_evaluator_target_scope s, _ctx c
  where s.period_id = c.period_id and s.evaluator_id = c.evaluator_id;

  select count(*) into v_ender_scope
  from public.evaluation_period_evaluator_target_scope s, _ctx c
  where s.period_id = c.period_id
    and s.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'::uuid;

  if v_ender_scope > 0 and v_paul_scope < (v_ender_scope * 0.5) then
    raise exception
      'Paul scope çok eksik (% / %). Önce fix-paul-restore-ender-parity.sql çalıştırın.',
      v_paul_scope, v_ender_scope;
  end if;
end $$;

-- 1) Korunacak completed çiftleri
create temp table _keep_completed on commit drop as
select
  ea.target_id,
  coalesce(ea.matrix_context, 'genel') as matrix_context
from public.evaluation_assignments ea, _ctx c
where ea.period_id = c.period_id
  and ea.evaluator_id = c.evaluator_id
  and ea.status = 'completed';

-- 2) Silinecek pending assignment id'leri
create temp table _drop_assignments on commit drop as
select ea.id
from public.evaluation_assignments ea, _ctx c
where ea.period_id = c.period_id
  and ea.evaluator_id = c.evaluator_id
  and coalesce(ea.status, 'pending') <> 'completed';

-- 3) Pending bağlı verileri temizle
delete from public.evaluation_responses
where assignment_id in (select id from _drop_assignments);

-- opsiyonel tablo olabilir
do $$
begin
  if to_regclass('public.international_standard_scores') is not null then
    execute $q$
      delete from public.international_standard_scores
      where assignment_id in (select id from _drop_assignments)
    $q$;
  end if;
end $$;

delete from public.evaluation_assignments
where id in (select id from _drop_assignments);

-- 4) Kaynak scope seti (bu tablo period matrix import/scope sonucunu taşır)
create temp table _scope_src on commit drop as
select distinct
  s.target_id,
  coalesce(s.matrix_context, 'genel') as matrix_context
from public.evaluation_period_evaluator_target_scope s, _ctx c
where s.period_id = c.period_id
  and s.evaluator_id = c.evaluator_id;

-- 5) COMPLETED dışındakileri yeniden pending üret
insert into public.evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  c.period_id,
  c.evaluator_id,
  ss.target_id,
  ss.matrix_context,
  'pending'
from _scope_src ss
cross join _ctx c
left join _keep_completed kc
  on kc.target_id = ss.target_id
 and kc.matrix_context = ss.matrix_context
where kc.target_id is null
  and not exists (
    select 1
    from public.evaluation_assignments ea
    where ea.period_id = c.period_id
      and ea.evaluator_id = c.evaluator_id
      and ea.target_id = ss.target_id
      and coalesce(ea.matrix_context, 'genel') = ss.matrix_context
  );

-- 6) Özet (COMMIT öncesi — _ctx on commit drop ile düşer)
select
  coalesce(ea.matrix_context, 'genel') as matrix_context,
  count(*) filter (where ea.status = 'completed') as completed_n,
  count(*) filter (where ea.status <> 'completed') as pending_n
from public.evaluation_assignments ea, _ctx c
where ea.period_id = c.period_id
  and ea.evaluator_id = c.evaluator_id
group by coalesce(ea.matrix_context, 'genel')
order by matrix_context;

commit;

-- 7) İsteğe bağlı: sadece özet (script zaten çalıştıysa veya tek başına kontrol)
-- select
--   coalesce(ea.matrix_context, 'genel') as matrix_context,
--   count(*) filter (where ea.status = 'completed') as completed_n,
--   count(*) filter (where ea.status <> 'completed') as pending_n
-- from public.evaluation_assignments ea
-- cross join (
--   select
--     'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id,
--     (select id from public.users where name = 'Paul GEORGES' limit 1) as evaluator_id
-- ) c
-- where ea.period_id = c.period_id
--   and ea.evaluator_id = c.evaluator_id
-- group by coalesce(ea.matrix_context, 'genel')
-- order by matrix_context;

