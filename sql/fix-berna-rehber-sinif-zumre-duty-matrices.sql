-- Berna SÖĞÜTLÜ (10.Sınıf md. yrd.): sınıf (8) + rehber (1) + zümre (12)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Sınıf 8: Excel sınıf matrisi satır 16–23 (Berna sütunu = 1)

begin;

delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
    and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre');

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  'e6d63576-949b-480a-b19a-c7113f0bee01',
  u.id,
  v.ctx,
  'pending'
from users u
cross join (values
  ('Arman KOMBIYIKYAN', 'sinif_ogretmeni'),
  ('Didem TEKİN', 'sinif_ogretmeni'),
  ('Şeyma DOĞRUER', 'sinif_ogretmeni'),
  ('Sabriye ÇAVDARCIOĞLU TOPUZ', 'sinif_ogretmeni'),
  ('Simge ŞENAY', 'sinif_ogretmeni'),
  ('Seda UĞUR', 'sinif_ogretmeni'),
  ('Oğuzhan ÇETİN', 'sinif_ogretmeni'),
  ('Gülen ERMAN', 'sinif_ogretmeni'),
  ('Doruk ATIŞKAN', 'rehberlik_ogretmeni'),
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
      and g.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
      and g.target_id = u.id
      and coalesce(g.matrix_context, 'genel') = 'genel'
  );

commit;

select matrix_context, count(*) as n
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
group by 1 order by 1;

select matrix_context, u.name as hedef
from evaluation_assignments ea
join users u on u.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = 'e6d63576-949b-480a-b19a-c7113f0bee01'
  and ea.matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
order by 1, 2;
