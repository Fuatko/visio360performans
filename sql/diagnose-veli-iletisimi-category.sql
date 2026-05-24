-- Veli İletişimi: neden "Genel" altında alt kategori görünmüyor?
-- Supabase SQL Editor'da çalıştırın (tüm dosya veya sorgu sorgu).

-- 1a) question_categories (Admin → Sorular burayı kullanır)
select
  'question_categories' as kaynak,
  c.id,
  c.name,
  c.name_fr,
  c.is_active,
  mc.name as ana_baslik
from public.question_categories c
left join public.main_categories mc on mc.id::text = c.main_category_id::text
where c.name ilike 'Veli%';

-- 1b) categories (eski şema — ana başlık sütunu olmayabilir)
select
  'categories' as kaynak,
  c.id,
  c.name,
  c.name_fr
from public.categories c
where c.name ilike 'Veli%';

-- 2) Veli soruları — category_id hangi tabloya gidiyor?
select
  q.id,
  left(q.text, 70) as soru,
  q.category_id::text as category_id,
  qc.name as question_categories_adi,
  qcm.name as qc_ana_baslik,
  cat.name as categories_adi
from public.questions q
left join public.question_categories qc on qc.id::text = q.category_id::text
left join public.main_categories qcm on qcm.id::text = qc.main_category_id::text
left join public.categories cat on cat.id::text = q.category_id::text
where q.text ilike 'Veli ile%'
   or qc.name ilike 'Veli%'
   or cat.name ilike 'Veli%';

-- 3) Genel alt kategoriler — categories (sizin kurulumda büyük ihtimalle burada)
select
  c.name as alt_kategori,
  c.name_fr,
  count(q.id) as soru_sayisi
from public.categories c
left join public.questions q on q.category_id::text = c.id::text
where c.name in (
  'Mesleki Sorumluluk',
  'Pedagojik Yetkinlik',
  'Ölçme ve Değerlendirme',
  'Veli İletişimi',
  'Öğrenci İlişkileri ve Empati'
)
group by c.name, c.name_fr
order by c.name;

-- 3b) Aynı liste — question_categories (varsa)
select
  mc.name as ana_baslik,
  c.name as alt_kategori,
  count(q.id) as soru_sayisi
from public.question_categories c
left join public.main_categories mc on mc.id::text = c.main_category_id::text
left join public.questions q on q.category_id::text = c.id::text
where c.name in (
  'Mesleki Sorumluluk',
  'Pedagojik Yetkinlik',
  'Ölçme ve Değerlendirme',
  'Veli İletişimi',
  'Öğrenci İlişkileri ve Empati'
)
group by mc.name, c.name
order by mc.name, c.name;

-- 4) Veli satırı question_categories'de yok mu?
select case
  when exists (select 1 from public.question_categories where name = 'Veli İletişimi')
  then 'Veli İletişimi question_categories''de VAR'
  else 'Veli İletişimi question_categories''de YOK — fix-veli-iletisimi-category-link.sql çalıştırın'
end as durum;

-- 5) Dönemde Veli soruları seçili mi? (period_id UUID yazın)
-- select pq.period_id, left(q.text, 60) as soru, pq.is_active
-- from public.evaluation_period_questions pq
-- join public.questions q on q.id::text = pq.question_id::text
-- where pq.period_id = 'BURAYA-PERIOD-UUID'
--   and q.text ilike 'Veli ile%';
