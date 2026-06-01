-- Erkan YILMAZ — zümre başkanı matrisi önizleme (salt okunur)
-- Beklenen silinecekler: zumre bağlamı (hedef/değerlendiren) + genel'de Erkan'ın değerlendirdiği 8 kişi (kendi ekip)

with erkan as (
  select id, name from users where name = 'Erkan YILMAZ' limit 1
),
period as (
  select id, name from evaluation_periods where status = 'active' limit 1
)
select 'ERKAN_ZUMRE_DEGERLENDIREN' as rapor, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context, ea.status
from evaluation_assignments ea
cross join erkan e
cross join period p
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = p.id
  and ea.evaluator_id = e.id
  and coalesce(ea.matrix_context, 'genel') = 'zumre'
order by tg.name;

select 'ERKAN_ZUMRE_HEDEF' as rapor, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context, ea.status
from evaluation_assignments ea
cross join erkan e
cross join period p
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = p.id
  and ea.target_id = e.id
  and coalesce(ea.matrix_context, 'genel') = 'zumre'
order by ev.name;

select 'ERKAN_GENEL_KENDI_EKIP' as rapor, ev.name as degerlendiren, tg.name as hedef, ea.matrix_context, ea.status
from evaluation_assignments ea
cross join erkan e
cross join period p
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = p.id
  and ea.evaluator_id = e.id
  and coalesce(ea.matrix_context, 'genel') = 'genel'
order by tg.name;

select 'OZET' as rapor,
  (select count(*) from evaluation_assignments ea cross join erkan e cross join period p
   where ea.period_id = p.id and ea.evaluator_id = e.id and coalesce(ea.matrix_context, 'genel') = 'zumre') as erkan_zumre_degerlendiren,
  (select count(*) from evaluation_assignments ea cross join erkan e cross join period p
   where ea.period_id = p.id and ea.target_id = e.id and coalesce(ea.matrix_context, 'genel') = 'zumre') as erkan_zumre_hedef,
  (select count(*) from evaluation_assignments ea cross join erkan e cross join period p
   where ea.period_id = p.id and ea.evaluator_id = e.id and coalesce(ea.matrix_context, 'genel') = 'genel') as erkan_genel_kendi_ekip,
  (select count(*) from evaluation_assignments ea cross join erkan e cross join period p
   where ea.period_id = p.id and ea.target_id = e.id and coalesce(ea.matrix_context, 'genel') = 'genel') as erkan_genel_hedef_kalacak;

select 'GOREV_UNVANI' as rapor, d.name as gorev, epud.is_active
from evaluation_period_user_duties epud
cross join erkan e
cross join period p
join evaluation_duties d on d.id = epud.duty_id
where epud.period_id = p.id
  and epud.user_id = e.id
  and (lower(d.name) like '%zümre%' or lower(d.name) like '%zumre%');
