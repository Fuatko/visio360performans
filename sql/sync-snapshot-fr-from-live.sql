-- Dönem snapshot'ındaki FR alanlarını canlı soru tablolarından günceller (metin değişmez, sadece çeviri)
-- Ardından Admin → Dönemler → İçerik kilitle ile tam snapshot yenilemek daha güvenlidir.

-- period_id değiştirin:
-- a5bd7005-260f-4ac7-b864-ccc31ca0a5f6

update public.evaluation_period_questions_snapshot snap
set text_fr = q.text_fr
from public.questions q
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and snap.id = q.id
  and coalesce(nullif(trim(q.text_fr), ''), '') <> ''
  and coalesce(nullif(trim(snap.text_fr), ''), '') = '';

update public.evaluation_period_answers_snapshot snap
set text_fr = qa.text_fr
from public.question_answers qa
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and snap.id = qa.id
  and coalesce(nullif(trim(qa.text_fr), ''), '') <> ''
  and coalesce(nullif(trim(snap.text_fr), ''), '') = '';

update public.evaluation_period_answers_snapshot snap
set text_fr = a.text_fr
from public.answers a
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and snap.id = a.id
  and coalesce(nullif(trim(a.text_fr), ''), '') <> ''
  and coalesce(nullif(trim(snap.text_fr), ''), '') = '';

update public.evaluation_period_categories_snapshot snap
set name_fr = c.name_fr
from public.question_categories c
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and snap.id = c.id
  and coalesce(nullif(trim(c.name_fr), ''), '') <> '';

update public.evaluation_period_main_categories_snapshot snap
set name_fr = m.name_fr
from public.main_categories m
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and snap.id = m.id
  and coalesce(nullif(trim(m.name_fr), ''), '') <> '';

select 'questions' as kind,
  count(*) filter (where coalesce(is_active, true) and coalesce(nullif(trim(text_fr), ''), '') = '') as still_missing_fr
from public.evaluation_period_questions_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;
