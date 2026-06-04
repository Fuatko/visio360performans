-- 19 uyarı (38 satır): hedef görev profili ↔ matrix_context uyumsuzluğu
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- READ-ONLY teşhis

-- A) Paul LAFORGE — kulüp ataması var, görev profili boş
select 'Paul LAFORGE görev profili' as kontrol, d.name as gorev
from evaluation_period_user_duties epud
join evaluation_duties d on d.id = epud.duty_id
join users u on u.id = epud.user_id
where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and u.name = 'Paul LAFORGE'
  and epud.is_active = true;

select ev.name as degerlendiren, ea.status, ea.id
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tg.name = 'Paul LAFORGE'
  and ea.matrix_context = 'kulup_ogretmeni'
order by ev.name;

-- B) Ebru AKTİMUR — zümre ataması, görev yok
select ev.name, ea.matrix_context, ea.status, ea.id
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tg.name = 'Ebru AKTİMUR'
  and ea.matrix_context = 'zumre';

-- C) Şule KOÇAK — rehber ataması (hedef), profilde yalnızca zümre
select d.name from evaluation_period_user_duties epud
join evaluation_duties d on d.id = epud.duty_id
join users u on u.id = epud.user_id
where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and u.name = 'Şule KOÇAK';

select ev.name, ea.status, ea.id
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tg.name = 'Şule KOÇAK'
  and ea.matrix_context = 'rehberlik_ogretmeni';

-- D) Gökhan BÜYÜKENGEZ — sınıf ataması, sınıf görevi yok
select ev.name, ea.status, ea.id
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tg.name = 'Gökhan BÜYÜKENGEZ'
  and ea.matrix_context = 'sinif_ogretmeni';
