-- Erkan YILMAZ — zümre başkanı değil: zümre matrisinden çıkar + kendi ekibini değerlendirmez
-- Dönem: aktif (2026 EĞİTMEN)
--
-- SİLİNİR:
--   • matrix_context = zumre  → Erkan değerlendiren veya hedef
--   • matrix_context = genel → Erkan değerlendiren (8 kişilik «kendi ekip» genel ataması)
--   • Dönem görevi: Zümre Başkanı ünvanı (varsa)
--
-- KALIR:
--   • Erkan başkaları tarafından genel değerlendirmede HEDEF olabilir (normal öğretmen)
--
-- Önce: sql/diagnose-erkan-zumre-baskan-assignments.sql
-- Supabase SQL Editor → postgres → TÜM dosyayı Run

begin;

create temp table _erkan(user_id uuid) on commit drop;
insert into _erkan(user_id)
select id from users where name = 'Erkan YILMAZ' limit 1;

create temp table _period(period_id uuid) on commit drop;
insert into _period(period_id)
select id from evaluation_periods where status = 'active' limit 1;

create temp table _to_delete(assignment_id uuid) on commit drop;
insert into _to_delete(assignment_id)
select ea.id
from evaluation_assignments ea
cross join _erkan e
cross join _period p
where ea.period_id = p.period_id
  and (
    (ea.evaluator_id = e.user_id and coalesce(ea.matrix_context, 'genel') in ('zumre', 'genel'))
    or (ea.target_id = e.user_id and coalesce(ea.matrix_context, 'genel') = 'zumre')
  );

delete from evaluation_responses er
using _to_delete d
where er.assignment_id = d.assignment_id;

do $body$
begin
  delete from international_standard_scores iss
  using _to_delete d
  where iss.assignment_id = d.assignment_id;
exception
  when undefined_table then null;
end $body$;

delete from evaluation_assignments ea
using _to_delete d
where ea.id = d.assignment_id;

-- Erkan değerlendiren olarak kategori kapsamı (zümre başkanı genel modeli)
delete from evaluation_period_evaluator_target_categories tc
using _erkan e, _period p
where tc.period_id = p.period_id
  and tc.evaluator_id = e.user_id;

delete from evaluation_period_evaluator_target_scope s
using _erkan e, _period p
where s.period_id = p.period_id
  and s.evaluator_id = e.user_id;

-- Zümre başkanı görev ünvanı
delete from evaluation_period_user_duties epud
using _erkan e, _period p, evaluation_duties d
where epud.period_id = p.period_id
  and epud.user_id = e.user_id
  and epud.duty_id = d.id
  and (lower(d.name) like '%zümre%' or lower(d.name) like '%zumre%');

select
  (select count(*) from _to_delete) as silinen_atama,
  (select count(*) from evaluation_assignments ea
   cross join _erkan e cross join _period p
   where ea.period_id = p.period_id
     and ea.evaluator_id = e.user_id
     and coalesce(ea.matrix_context, 'genel') = 'zumre') as kalan_erkan_zumre_deg,
  (select count(*) from evaluation_assignments ea
   cross join _erkan e cross join _period p
   where ea.period_id = p.period_id
     and ea.target_id = e.user_id
     and coalesce(ea.matrix_context, 'genel') = 'zumre') as kalan_erkan_zumre_hedef,
  (select count(*) from evaluation_assignments ea
   cross join _erkan e cross join _period p
   where ea.period_id = p.period_id
     and ea.evaluator_id = e.user_id
     and coalesce(ea.matrix_context, 'genel') = 'genel') as kalan_erkan_genel_deg;

commit;

-- Doğrulama (ayrı sonuç — hepsi 0 olmalı, genel_deg hariç hedef kalabilir)
select 'dogrulama' as rapor,
  (select count(*) from evaluation_assignments ea
   join users u on u.id = ea.evaluator_id
   join evaluation_periods ep on ep.id = ea.period_id and ep.status = 'active'
   where u.name = 'Erkan YILMAZ'
     and coalesce(ea.matrix_context, 'genel') = 'zumre') as erkan_zumre_deg,
  (select count(*) from evaluation_assignments ea
   join users u on u.id = ea.target_id
   join evaluation_periods ep on ep.id = ea.period_id and ep.status = 'active'
   where u.name = 'Erkan YILMAZ'
     and coalesce(ea.matrix_context, 'genel') = 'zumre') as erkan_zumre_hedef,
  (select count(*) from evaluation_assignments ea
   join users u on u.id = ea.evaluator_id
   join evaluation_periods ep on ep.id = ea.period_id and ep.status = 'active'
   where u.name = 'Erkan YILMAZ'
     and coalesce(ea.matrix_context, 'genel') = 'genel') as erkan_genel_deg,
  (select count(*) from evaluation_assignments ea
   join users u on u.id = ea.target_id
   join evaluation_periods ep on ep.id = ea.period_id and ep.status = 'active'
   where u.name = 'Erkan YILMAZ'
     and coalesce(ea.matrix_context, 'genel') = 'genel') as erkan_genel_hedef_ok;
