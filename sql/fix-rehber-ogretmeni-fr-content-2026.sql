-- Rehber Öğretmeni (gorev_5) — FR metin doğrulama
-- Uygulama: node scripts/apply-rehber-ogretmeni-fr-content-2026.mjs --apply

select epdc.sort_order, c.name_fr, q.sort_order as soru_sira, left(q.text_fr, 90) as soru_fr
from evaluation_period_duty_categories epdc
join question_categories c on c.id = epdc.category_id
join questions q on q.category_id = c.id
where epdc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and epdc.duty_id = 'b90674da-1e89-4cfc-93ba-dff055ab02c4'
order by epdc.sort_order, q.sort_order;
