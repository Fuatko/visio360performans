-- Paul GEORGES — kulüp öğretmeni matrisi 46'ya tamamlama
-- Eksik kişi: Paul GEORGES (kendi kulüp görevi)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  u.id,
  u.id,
  'kulup_ogretmeni',
  'pending'
from users u
where u.name = 'Paul GEORGES'
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = u.id
      and ea.target_id = u.id
      and ea.matrix_context = 'kulup_ogretmeni'
  );

-- Kontrol
select count(*) as paul_kulup_sayisi
from evaluation_assignments ea
join users u on u.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and u.name = 'Paul GEORGES'
  and ea.matrix_context = 'kulup_ogretmeni';

