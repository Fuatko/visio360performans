-- Erkan YILMAZ — zümre başkanı değil (v2 — tüm aktif dönemler, güvenli silme)
-- Supabase: TÜM dosyayı tek seferde Run
-- Sonra: sql/diagnose-erkan-zumre-baskan-assignments.sql (OZET)

-- 0) Erkan kullanıcı ve dönem kontrolü
select 'KONTROL' as rapor,
  (select count(*) from users where trim(name) = 'Erkan YILMAZ') as erkan_kullanici_sayisi,
  (select string_agg(id::text, ', ') from users where trim(name) = 'Erkan YILMAZ') as erkan_user_ids,
  (select count(*) from evaluation_periods where status = 'active') as aktif_donem_sayisi;

drop table if exists _erkan_ids;
drop table if exists _active_periods;
drop table if exists _erkan_del;

create temp table _erkan_ids as
select id as user_id from users where trim(name) = 'Erkan YILMAZ';

create temp table _active_periods as
select id as period_id from evaluation_periods where status = 'active';

create temp table _erkan_del as
select ea.id as assignment_id
from evaluation_assignments ea
where ea.period_id in (select period_id from _active_periods)
  and exists (select 1 from _erkan_ids e where e.user_id = ea.evaluator_id)
  and lower(trim(coalesce(ea.matrix_context, 'genel'))) in ('zumre', 'genel')
union
select ea.id
from evaluation_assignments ea
where ea.period_id in (select period_id from _active_periods)
  and exists (select 1 from _erkan_ids e where e.user_id = ea.target_id)
  and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'zumre';

select 'SILINECEK' as rapor, count(*) as atama_sayisi from _erkan_del;

delete from evaluation_responses er
where er.assignment_id in (select assignment_id from _erkan_del);

do $body$
begin
  delete from international_standard_scores iss
  where iss.assignment_id in (select assignment_id from _erkan_del);
exception
  when undefined_table then null;
end $body$;

delete from evaluation_assignments ea
where ea.id in (select assignment_id from _erkan_del);

delete from evaluation_period_evaluator_target_categories tc
where tc.period_id in (select period_id from _active_periods)
  and tc.evaluator_id in (select user_id from _erkan_ids);

delete from evaluation_period_evaluator_target_scope s
where s.period_id in (select period_id from _active_periods)
  and s.evaluator_id in (select user_id from _erkan_ids);

delete from evaluation_period_user_duties epud
using evaluation_duties d
where epud.period_id in (select period_id from _active_periods)
  and epud.user_id in (select user_id from _erkan_ids)
  and epud.duty_id = d.id
  and (lower(d.name) like '%zümre%' or lower(d.name) like '%zumre%');

-- Doğrulama (tüm aktif dönemler)
select 'dogrulama' as rapor,
  (select count(*) from evaluation_assignments ea
   join users u on u.id = ea.evaluator_id
   join evaluation_periods ep on ep.id = ea.period_id and ep.status = 'active'
   where trim(u.name) = 'Erkan YILMAZ'
     and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'zumre') as erkan_zumre_deg,
  (select count(*) from evaluation_assignments ea
   join users u on u.id = ea.target_id
   join evaluation_periods ep on ep.id = ea.period_id and ep.status = 'active'
   where trim(u.name) = 'Erkan YILMAZ'
     and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'zumre') as erkan_zumre_hedef,
  (select count(*) from evaluation_assignments ea
   join users u on u.id = ea.evaluator_id
   join evaluation_periods ep on ep.id = ea.period_id and ep.status = 'active'
   where trim(u.name) = 'Erkan YILMAZ'
     and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'genel') as erkan_genel_deg,
  (select count(*) from evaluation_assignments ea
   join users u on u.id = ea.target_id
   join evaluation_periods ep on ep.id = ea.period_id and ep.status = 'active'
   where trim(u.name) = 'Erkan YILMAZ'
     and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'genel') as erkan_genel_hedef_ok;
