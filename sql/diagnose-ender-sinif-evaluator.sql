-- Ender ÜSTÜNGEL — değerlendirici olarak sınıf öğretmeni (sinif_ogretmeni) atamaları
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Ender: 5ec438f5-1eb2-41a0-ab19-4b2a549991cd

select u.name as degerlendiren,
  coalesce(ea.matrix_context, 'genel') as matris,
  ea.status,
  count(*) as n
from evaluation_assignments ea
join users u on u.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and u.name = 'Ender ÜSTÜNGEL'
group by u.name, coalesce(ea.matrix_context, 'genel'), ea.status
order by matris, ea.status;

select count(*) as ender_sinif_atama,
  count(*) filter (where ea.status = 'completed') as tamamlanan,
  count(*) filter (where ea.status <> 'completed') as bekleyen
from evaluation_assignments ea
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
  and ea.matrix_context = 'sinif_ogretmeni';

select tg.name as hedef, ea.status,
  (select count(*) from evaluation_responses er where er.assignment_id = ea.id) as yanit
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '5ec438f5-1eb2-41a0-ab19-4b2a549991cd'
  and ea.matrix_context = 'sinif_ogretmeni'
order by ea.status desc, tg.name
limit 20;
