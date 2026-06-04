-- STEP 1/2: Period snapshot (main/category/question) rebuild
-- Timeout riskini azaltmak için cevapları ayrı step'te kuracağız.
-- period_id: 2026 EĞİTMEN

begin;

-- 1) Önce sadece question-side snapshot temizle
delete from public.evaluation_period_questions_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

delete from public.evaluation_period_categories_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

delete from public.evaluation_period_main_categories_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

-- 2) Main category snapshot
insert into public.evaluation_period_main_categories_snapshot (
  id, period_id, name, name_en, name_fr, sort_order, is_active, status, snapshotted_at
)
select
  mc.id,
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid,
  mc.name,
  mc.name_en,
  mc.name_fr,
  coalesce(nullif(to_jsonb(mc)->>'sort_order', '')::int, 0),
  coalesce(nullif(to_jsonb(mc)->>'is_active', '')::boolean, true),
  nullif(to_jsonb(mc)->>'status', ''),
  now()
from public.main_categories mc;

-- 3) Dönemde kullanılacak soru id seti
create temp table _period_qids (question_id uuid primary key) on commit drop;

insert into _period_qids(question_id)
select distinct epq.question_id
from public.evaluation_period_questions epq
where epq.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(epq.is_active, true)
  and epq.question_id is not null;

insert into _period_qids(question_id)
select distinct epdq.question_id
from public.evaluation_period_duty_questions epdq
where epdq.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(epdq.is_active, true)
  and epdq.question_id is not null
on conflict do nothing;

insert into _period_qids(question_id)
select distinct q.id
from public.evaluation_period_duty_categories epdc
join public.questions q on q.category_id = epdc.category_id
where epdc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(epdc.is_active, true)
on conflict do nothing;

-- 4) Category snapshot
insert into public.evaluation_period_categories_snapshot (
  id, period_id, main_category_id, name, name_en, name_fr, sort_order, is_active, snapshotted_at
)
select distinct
  c.id,
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid,
  c.main_category_id,
  c.name,
  c.name_en,
  c.name_fr,
  coalesce(nullif(to_jsonb(c)->>'sort_order', '')::int, 0),
  coalesce(nullif(to_jsonb(c)->>'is_active', '')::boolean, true),
  now()
from public.questions q
join _period_qids p on p.question_id = q.id
join public.question_categories c on c.id = q.category_id;

-- 5) Question snapshot
insert into public.evaluation_period_questions_snapshot (
  id, period_id, category_id, text, text_en, text_fr, sort_order, is_active, snapshotted_at
)
select
  q.id,
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid,
  q.category_id,
  q.text,
  q.text_en,
  q.text_fr,
  coalesce(nullif(to_jsonb(q)->>'sort_order', '')::int, nullif(to_jsonb(q)->>'order_num', '')::int, 0),
  coalesce(nullif(to_jsonb(q)->>'is_active', '')::boolean, true),
  now()
from public.questions q
join _period_qids p on p.question_id = q.id;

commit;

-- Doğrulama
select
  (select count(*) from public.evaluation_period_questions_snapshot where period_id='a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid) as snap_questions,
  (select count(*) from public.evaluation_period_questions_snapshot where period_id='a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid and trim(coalesce(text_fr,''))='') as q_fr_empty;

