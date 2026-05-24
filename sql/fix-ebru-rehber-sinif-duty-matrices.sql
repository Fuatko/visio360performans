-- Ebru AKTİMUR: matriste Ebru sütununda 1 olan sınıf öğretmenleri + rehber + zümre
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Sınıf öğretmeni (8): Excel genel matris — Ebru=1 olan ilk 8 satır

begin;

delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
    and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre');

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d',
  u.id,
  v.ctx,
  'pending'
from users u
cross join (values
  -- Sınıf öğretmeni (Ebru matris = 1)
  ('Selin KARAKOÇ', 'sinif_ogretmeni'),
  ('Elif DİVİTÇİOĞLU', 'sinif_ogretmeni'),
  ('Zeliha BARLAS', 'sinif_ogretmeni'),
  ('Mişelin TAGAN', 'sinif_ogretmeni'),
  ('Leyla CİDAL ALTINAYAR', 'sinif_ogretmeni'),
  ('Elif KAZAN', 'sinif_ogretmeni'),
  ('Belgin ŞİMŞEK', 'sinif_ogretmeni'),
  ('Hande KAHRAMAN', 'sinif_ogretmeni'),
  -- Rehber öğretmen (1)
  ('Elçin KONUK', 'rehberlik_ogretmeni'),
  -- Zümre başkanı (genel ilişki + ayrı görev matrisi)
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
      and g.evaluator_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
      and g.target_id = u.id
      and coalesce(g.matrix_context, 'genel') = 'genel'
  );

commit;

select coalesce(matrix_context, 'genel') as matris, count(*) as n
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
group by 1
order by 1;

select matrix_context, u.name as hedef
from evaluation_assignments ea
join users u on u.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
  and ea.matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
order by matrix_context, u.name;
