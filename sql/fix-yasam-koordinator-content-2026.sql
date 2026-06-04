-- Okul İçi Yaşam Koordinatörü (gorev_4) — 9 kategori doğrulama
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- Duty: e8fa6928-4a58-4dd4-aa1e-2352bf3bbdae
-- Uygulama: node scripts/apply-yasam-koordinator-content-2026.mjs --apply
-- Scope: node scripts/fix-onur-aysegul-yasam-koordinator-scope.mjs --apply

select count(*) as gorev_4_kategori
from evaluation_period_duty_categories
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and duty_id = 'e8fa6928-4a58-4dd4-aa1e-2352bf3bbdae';

select epdc.sort_order, c.name, c.name_fr,
  (select count(*) from questions q where q.category_id = c.id) as soru,
  (select count(*) from question_answers qa
   join questions q on q.id = qa.question_id
   where q.category_id = c.id and qa.is_active) as cevap
from evaluation_period_duty_categories epdc
join question_categories c on c.id = epdc.category_id
where epdc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and epdc.duty_id = 'e8fa6928-4a58-4dd4-aa1e-2352bf3bbdae'
order by epdc.sort_order;

select count(*) as onur_aysegul_yasam_atama
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.matrix_context = 'yasam_koordinatoru'
  and tg.name in ('Onur ERMAN', 'Ayşegül KAZMAZ');
