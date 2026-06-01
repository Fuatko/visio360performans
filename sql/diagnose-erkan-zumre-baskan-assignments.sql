-- Erkan YILMAZ — zümre başkanı matrisi önizleme (tüm aktif dönemler)
-- TÜM dosyayı tek seferde Run

drop table if exists _diag_erkan;
drop table if exists _diag_periods;

create temp table _diag_erkan as
select id as user_id from users where trim(name) = 'Erkan YILMAZ';

create temp table _diag_periods as
select id as period_id from evaluation_periods where status = 'active';

select 'KONTROL' as rapor,
  (select count(*) from _diag_erkan) as erkan_kullanici,
  (select count(*) from _diag_periods) as aktif_donem;

select 'ERKAN_ZUMRE_DEGERLENDIREN' as rapor, ep.name as donem, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context
from evaluation_assignments ea
cross join _diag_periods p
join evaluation_periods ep on ep.id = p.period_id
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = p.period_id
  and ea.evaluator_id in (select user_id from _diag_erkan)
  and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'zumre'
order by ep.name, tg.name;

select 'ERKAN_ZUMRE_HEDEF' as rapor, ep.name as donem, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context
from evaluation_assignments ea
cross join _diag_periods p
join evaluation_periods ep on ep.id = p.period_id
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = p.period_id
  and ea.target_id in (select user_id from _diag_erkan)
  and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'zumre'
order by ep.name, ev.name;

select 'ERKAN_GENEL_KENDI_EKIP' as rapor, ep.name as donem, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context
from evaluation_assignments ea
cross join _diag_periods p
join evaluation_periods ep on ep.id = p.period_id
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = p.period_id
  and ea.evaluator_id in (select user_id from _diag_erkan)
  and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'genel'
order by ep.name, tg.name;

select 'OZET' as rapor,
  (select count(*) from evaluation_assignments ea
   where ea.period_id in (select period_id from _diag_periods)
     and ea.evaluator_id in (select user_id from _diag_erkan)
     and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'zumre') as erkan_zumre_degerlendiren,
  (select count(*) from evaluation_assignments ea
   where ea.period_id in (select period_id from _diag_periods)
     and ea.target_id in (select user_id from _diag_erkan)
     and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'zumre') as erkan_zumre_hedef,
  (select count(*) from evaluation_assignments ea
   where ea.period_id in (select period_id from _diag_periods)
     and ea.evaluator_id in (select user_id from _diag_erkan)
     and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'genel') as erkan_genel_kendi_ekip,
  (select count(*) from evaluation_assignments ea
   where ea.period_id in (select period_id from _diag_periods)
     and ea.target_id in (select user_id from _diag_erkan)
     and lower(trim(coalesce(ea.matrix_context, 'genel'))) = 'genel') as erkan_genel_hedef_kalacak;
