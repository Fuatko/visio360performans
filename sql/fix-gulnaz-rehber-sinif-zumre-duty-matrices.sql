-- Gülnaz PEKİN: sınıf (8) + rehber (1) + zümre (12) görev matrisleri
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Sınıf 6: Gülnaz sütununda 1 (Evren SAĞBİLİ hariç — matriste 0)

begin;

delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
    and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre');

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  'b70802b2-6c38-4461-b30b-2af73f2e58e6',
  u.id,
  v.ctx,
  'pending'
from users u
cross join (values
  ('Özcan AKÇAKAYA', 'sinif_ogretmeni'),
  ('Volkan OĞUZ', 'sinif_ogretmeni'),
  ('Selin YILMAZ', 'sinif_ogretmeni'),
  ('Tanya ERGÜNEŞ UĞUR', 'sinif_ogretmeni'),
  ('Ilgın AYDIN', 'sinif_ogretmeni'),
  ('Şükran TOY', 'sinif_ogretmeni'),
  ('Sevcan ÖZKILINÇ', 'rehberlik_ogretmeni'),
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
      and g.evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
      and g.target_id = u.id
      and coalesce(g.matrix_context, 'genel') = 'genel'
  );

commit;

select matrix_context, count(*) as n
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
group by 1 order by 1;

select matrix_context, u.name as hedef
from evaluation_assignments ea
join users u on u.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
  and ea.matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
order by 1, 2;
