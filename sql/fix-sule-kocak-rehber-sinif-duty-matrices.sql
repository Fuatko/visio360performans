-- Şule KOÇAK: 4 kategori kapsamı + rehber (6) + sınıf öğretmeni (39) — TAM genel değerlendirme YOK
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- «genel» satırı = matris ilişkisi; formda yalnızca 4 alt kategori (restrict_period + evaluation_period_evaluator_categories):
--   Mesleki Sorumluluk, Ölçme & Değerlendirme, Veli İletişimi, Öğrenci İlişkileri ve Empati
-- Ayrı kartlar: rehberlik_ogretmeni (6), sinif_ogretmeni (39). Zümre başkanı ayrı zumre matrisi YOK.

begin;

delete from evaluation_responses
where assignment_id in (
  select id from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
    and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni')
);

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
  and matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni');

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '6b73c2a6-afb2-437d-b9cc-1c789e13344c',
  gp.target_id,
  td.duty_preset,
  'pending'
from (
  select distinct evaluator_id, target_id
  from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
    and coalesce(matrix_context, 'genel') = 'genel'
) gp
join (
  select epud.user_id as target_id,
    case
      when lower(epd.name) like '%rehber%' then 'rehberlik_ogretmeni'
      when lower(epd.name) like '%sınıf%' or lower(epd.name) like '%sinif%' then 'sinif_ogretmeni'
    end as duty_preset
  from evaluation_period_user_duties epud
  join evaluation_duties epd on epd.id = epud.duty_id
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
) td on td.target_id = gp.target_id
where td.duty_preset in ('rehberlik_ogretmeni', 'sinif_ogretmeni')
  and gp.target_id != '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
  and not exists (
    select 1 from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = gp.evaluator_id
      and ea.target_id = gp.target_id
      and ea.matrix_context = td.duty_preset
  );

commit;

-- Kategori kapsamı (4)
select s.name as kategori
from evaluation_period_evaluator_categories eec
join evaluation_period_categories_snapshot s on s.id = eec.category_id
where eec.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and eec.evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
order by s.sort_order;

-- Özet matrisler
select coalesce(matrix_context, 'genel') as matris, count(*) as n
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
group by 1
order by 2 desc;

-- Rehber + sınıf listesi
select matrix_context, u.name as hedef
from evaluation_assignments ea
join users u on u.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
  and ea.matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni')
order by 1, 2;
