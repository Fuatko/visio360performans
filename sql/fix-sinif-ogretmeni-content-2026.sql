-- Sınıf Öğretmeni (gorev_6) — kategori / soru / cevap metinleri (TR + FR)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Uygulama: node scripts/apply-sinif-ogretmeni-content-2026.mjs --apply
--
-- Soru id'leri:
--   ogrenci b2416236-3ebd-45d7-a771-712f19f2385a
--   bilgi   34c6b504-01d8-4ab0-a9e6-70daafe8df22
--   pdr     fbeee132-a86f-48c0-840b-7c257355ba53
--   kurul   ec68d68d-d463-451a-914c-9403b09c610b
--   karne   a3dd6b49-bcb5-4962-a503-a185f6a24f94

select 'sinif_gorev_6_kategori' as rapor, count(*) as n
from evaluation_period_duty_categories
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and duty_id = '6f89850d-8ae7-4bdd-a424-8b6415b094f9';

select c.name, c.name_fr, q.text, left(q.text_fr, 80) as text_fr_onizleme,
  (select count(*) from question_answers qa where qa.question_id = q.id and qa.is_active) as aktif_cevap
from evaluation_period_duty_categories epdc
join question_categories c on c.id = epdc.category_id
left join questions q on q.category_id = c.id and coalesce(q.is_active, true)
where epdc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and epdc.duty_id = '6f89850d-8ae7-4bdd-a424-8b6415b094f9'
order by epdc.sort_order;
