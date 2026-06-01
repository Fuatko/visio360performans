-- Erkan YILMAZ — zümre başkanı matrisi önizleme (salt okunur)
-- TÜM dosyayı tek seferde Run

drop table if exists _diag_erkan;
drop table if exists _diag_period;

create temp table _diag_erkan as
select id as user_id, name from users where name = 'Erkan YILMAZ' limit 1;

create temp table _diag_period as
select id as period_id, name from evaluation_periods where status = 'active' limit 1;

-- 1) Erkan zümre değerlendiren
select 'ERKAN_ZUMRE_DEGERLENDIREN' as rapor, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context, ea.status
from evaluation_assignments ea
cross join _diag_erkan e
cross join _diag_period p
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = p.period_id
  and ea.evaluator_id = e.user_id
  and coalesce(ea.matrix_context, 'genel') = 'zumre'
order by tg.name;

-- 2) Erkan zümre hedef
select 'ERKAN_ZUMRE_HEDEF' as rapor, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context, ea.status
from evaluation_assignments ea
cross join _diag_erkan e
cross join _diag_period p
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = p.period_id
  and ea.target_id = e.user_id
  and coalesce(ea.matrix_context, 'genel') = 'zumre'
order by ev.name;

-- 3) Erkan genel kendi ekip (silinecek)
select 'ERKAN_GENEL_KENDI_EKIP' as rapor, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context, ea.status
from evaluation_assignments ea
cross join _diag_erkan e
cross join _diag_period p
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = p.period_id
  and ea.evaluator_id = e.user_id
  and coalesce(ea.matrix_context, 'genel') = 'genel'
order by tg.name;

-- 4) Özet
select 'OZET' as rapor,
  (select count(*) from evaluation_assignments ea
   cross join _diag_erkan e cross join _diag_period p
   where ea.period_id = p.period_id and ea.evaluator_id = e.user_id
     and coalesce(ea.matrix_context, 'genel') = 'zumre') as erkan_zumre_degerlendiren,
  (select count(*) from evaluation_assignments ea
   cross join _diag_erkan e cross join _diag_period p
   where ea.period_id = p.period_id and ea.target_id = e.user_id
     and coalesce(ea.matrix_context, 'genel') = 'zumre') as erkan_zumre_hedef,
  (select count(*) from evaluation_assignments ea
   cross join _diag_erkan e cross join _diag_period p
   where ea.period_id = p.period_id and ea.evaluator_id = e.user_id
     and coalesce(ea.matrix_context, 'genel') = 'genel') as erkan_genel_kendi_ekip,
  (select count(*) from evaluation_assignments ea
   cross join _diag_erkan e cross join _diag_period p
   where ea.period_id = p.period_id and ea.target_id = e.user_id
     and coalesce(ea.matrix_context, 'genel') = 'genel') as erkan_genel_hedef_kalacak;

-- 5) Görev ünvanı
select 'GOREV_UNVANI' as rapor, d.name as gorev, epud.is_active
from evaluation_period_user_duties epud
cross join _diag_erkan e
cross join _diag_period p
join evaluation_duties d on d.id = epud.duty_id
where epud.period_id = p.period_id
  and epud.user_id = e.user_id
  and (lower(d.name) like '%zümre%' or lower(d.name) like '%zumre%');
