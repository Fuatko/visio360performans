-- Yaprak BENER CHAPDELAINE (11.Sınıf md. yrd.): sınıf (9) + rehber (2) + zümre (12)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Sınıf: matris bloğu 24–31 + Zeynep DEDEBAŞ (sınıf). Zeynep ayrıca zumre (Zümre Başkanı görevi).

begin;

delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '7269fdab-7412-4208-b9b4-25cfbec48228'
    and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '7269fdab-7412-4208-b9b4-25cfbec48228'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre');

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '7269fdab-7412-4208-b9b4-25cfbec48228',
  u.id,
  v.ctx,
  'pending'
from users u
cross join (values
  ('Yeliz ERARSLAN', 'sinif_ogretmeni'),
  ('Nesrin KARAKAŞ', 'sinif_ogretmeni'),
  ('Esin ALPAN', 'sinif_ogretmeni'),
  ('Kerem KESEPARA', 'sinif_ogretmeni'),
  ('Dilek KARAYAĞIZ', 'sinif_ogretmeni'),
  ('Maral BASMA', 'sinif_ogretmeni'),
  ('Binnaz BAYRAK ONUR', 'sinif_ogretmeni'),
  ('Ebru ÖZGÖREN', 'sinif_ogretmeni'),
  ('Zeynep DEDEBAŞ', 'sinif_ogretmeni'),
  ('Tolga ÇAKIROĞLU', 'rehberlik_ogretmeni'),
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
      and g.evaluator_id = '7269fdab-7412-4208-b9b4-25cfbec48228'
      and g.target_id = u.id
      and coalesce(g.matrix_context, 'genel') = 'genel'
  );

commit;

select matrix_context, count(*) as n
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '7269fdab-7412-4208-b9b4-25cfbec48228'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
group by 1 order by 1;

select matrix_context, u.name as hedef
from evaluation_assignments ea
join users u on u.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '7269fdab-7412-4208-b9b4-25cfbec48228'
  and ea.matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
order by 1, 2;
