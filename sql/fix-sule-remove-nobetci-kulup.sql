-- Şule KOÇAK: nöbetçi ve kulüp öğretmeni matrisleri YOK (Paul/Ender yapar; Şule yalnızca genel 4 kategori + sınıf + rehber + yaşam koord.)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Yanıt yok (0); güvenle silinir.

begin;

delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
    and matrix_context in ('nobetci_ogretmeni', 'kulup_ogretmeni')
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
  and matrix_context in ('nobetci_ogretmeni', 'kulup_ogretmeni');

commit;

-- Doğrulama (nöbetçi/kulüp 0 olmalı)
select coalesce(matrix_context, 'genel') as matris, count(*) as n
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
group by 1
order by 2 desc;
