-- DEPRECATED — Şule için nöbetçi/kulüp EKLENMEZ. Kaldırmak için: fix-sule-remove-nobetci-kulup.sql
-- Şule yalnızca: genel (4 kategori) + sinif_ogretmeni + rehberlik_ogretmeni + yasam_koordinatoru (2)
-- Yaşam koordinatörü ekleme (Onur + Ayşegül) — nöbetçi/kulüp bu dosyada YOK

begin;

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '6b73c2a6-afb2-437d-b9cc-1c789e13344c',
  gp.target_id,
  'yasam_koordinatoru',
  'pending'
from (
  select distinct evaluator_id, target_id
  from evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and evaluator_id = '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
    and coalesce(matrix_context, 'genel') = 'genel'
) gp
join evaluation_period_user_duties epud on epud.user_id = gp.target_id and epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
join evaluation_duties epd on epd.id = epud.duty_id
where lower(epd.name) like '%yaşam koordinat%' or lower(epd.name) like '%yasam koordinat%'
  and gp.target_id != '6b73c2a6-afb2-437d-b9cc-1c789e13344c'
  and not exists (
    select 1 from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = gp.evaluator_id
      and ea.target_id = gp.target_id
      and ea.matrix_context = 'yasam_koordinatoru'
  );

commit;
