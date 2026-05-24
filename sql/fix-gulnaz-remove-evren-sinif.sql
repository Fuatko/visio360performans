-- Gülnaz: Evren SAĞBİLİ sınıf öğretmeni atamasını kaldır (matriste 0 olmalı)

delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
    and target_id = (select id from users where name = 'Evren SAĞBİLİ' limit 1)
    and matrix_context = 'sinif_ogretmeni'
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
  and target_id = (select id from users where name = 'Evren SAĞBİLİ' limit 1)
  and matrix_context = 'sinif_ogretmeni';

-- Evren için Gülnaz: yalnızca genel/kulüp vb. kalmalı
select coalesce(matrix_context, 'genel') as matris, count(*)
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
  and target_id = (select id from users where name = 'Evren SAĞBİLİ' limit 1)
group by 1;
