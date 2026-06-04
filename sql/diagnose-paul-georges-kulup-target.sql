-- Paul GEORGES — kulüp hedef / görev kontrolü
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

select 'GOREV' as tip, d.name as detay
from evaluation_period_user_duties epud
join evaluation_duties d on d.id = epud.duty_id
join users u on u.id = epud.user_id
where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and u.name = 'Paul GEORGES'
  and (lower(d.name) like '%kulüp%' or lower(d.name) like '%kulup%');

select 'ATAMA' as tip, ev.name as degerlendiren, ea.status, ea.id
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tg.name = 'Paul GEORGES'
  and ea.matrix_context = 'kulup_ogretmeni'
order by ev.name;
