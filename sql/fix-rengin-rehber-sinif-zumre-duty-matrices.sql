-- Rengin TAMKAN DOĞAN (12.Sınıf md. yrd.): sınıf (8) + rehber (2) + zümre (12)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Sınıf: satır 33–40 (8. kişi Berna BENER). Zeynep DEDEBAŞ yalnızca zumre (sınıf değil).
-- Rehber: Şule YENAL + Murat KAZANOĞLU (Şule ayrıca sınıf öğretmeni matrisinde)

begin;

delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
    and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre');

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '7d85b402-77f1-4959-bbec-1b62f0d5e894',
  u.id,
  v.ctx,
  'pending'
from users u
cross join (values
  ('Gülnur TİRYAKİ', 'sinif_ogretmeni'),
  ('Mesude YILDIRIM', 'sinif_ogretmeni'),
  ('Gökhan BÜYÜKENGEZ', 'sinif_ogretmeni'),
  ('Ayhan YAĞIZ', 'sinif_ogretmeni'),
  ('Şule YENAL', 'sinif_ogretmeni'),
  ('Patrice CARINO', 'sinif_ogretmeni'),
  ('Elif CANDEMİR', 'sinif_ogretmeni'),
  ('Berna BENER', 'sinif_ogretmeni'),
  ('Şule YENAL', 'rehberlik_ogretmeni'),
  ('Murat KAZANOĞLU', 'rehberlik_ogretmeni'),
  ('Altan KILIÇ', 'zumre'),
  ('Ayhan YAĞIZ', 'zumre'),
  ('Berna BENER', 'zumre'),
  ('Gökçe TAYLAN', 'zumre'),
  ('Gökhan BÜYÜKENGEZ', 'zumre'),
  ('Onur ERMAN', 'zumre'),
  ('Peggy MOREL ÖZDEMİR', 'zumre'),
  ('Stanislaw EON DU VAL', 'zumre'),
  ('Şule KOÇAK', 'zumre'),
  ('Yeliz ERARSLAN', 'zumre'),
  ('Yonca İŞLEK', 'zumre'),
  ('Zeynep DEDEBAŞ', 'zumre')
) as v(hedef_adi, ctx)
where u.name = v.hedef_adi
  and exists (
    select 1 from evaluation_assignments g
    where g.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and g.evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
      and g.target_id = u.id
      and coalesce(g.matrix_context, 'genel') = 'genel'
  );

commit;

select matrix_context, count(*) as n
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
group by 1 order by 1;

select matrix_context, u.name as hedef
from evaluation_assignments ea
join users u on u.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
  and ea.matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
order by 1, 2;
