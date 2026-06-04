-- Paul GEORGES — canlı soru/cevap/kategori FR kalitesi (2026 dönemi soruları)
-- Paul LAFORGE hesabına dokunmaz.

with period_q as (
  select distinct epq.question_id
  from public.evaluation_period_questions epq
  where epq.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and epq.is_active = true
),
q as (
  select
    q.id,
    left(trim(q.text), 80) as text_tr,
    left(trim(coalesce(q.text_fr, '')), 80) as text_fr
  from public.questions q
  join period_q pq on pq.question_id = q.id
)
select
  count(*) as soru_sayisi,
  count(*) filter (where text_fr = '') as fr_bos,
  count(*) filter (where text_fr <> '' and lower(text_fr) = lower(text_tr)) as fr_tr_ayni
from q;

select
  count(*) filter (where trim(coalesce(c.name_fr, '')) = '') as kategori_fr_bos
from public.question_categories c
where exists (
  select 1 from public.questions q
  join period_q pq on pq.question_id = q.id
  where q.category_id = c.id
);

select id, name, name_fr
from public.users
where name in ('Paul GEORGES', 'Paul LAFORGE');
