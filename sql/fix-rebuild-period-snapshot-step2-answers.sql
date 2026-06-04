-- STEP 2/2: Period answer snapshot rebuild
-- Step 1 tamamlandıktan sonra çalıştırın.
-- period_id: 2026 EĞİTMEN

begin;

-- 1) Answer snapshot temizle (sadece hedef dönem)
delete from public.evaluation_period_answers_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

-- 2) Bu dönemde snapshot'a alınmış soru id seti
create temp table _period_qids (question_id uuid primary key) on commit drop;

insert into _period_qids(question_id)
select q.id
from public.evaluation_period_questions_snapshot q
where q.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

-- 3) Cevap kaynaklarını birleştir (schema-safe)
create temp table _ans_src on commit drop as
select
  qa.id,
  qa.question_id,
  qa.text,
  qa.text_en,
  qa.text_fr,
  nullif(to_jsonb(qa)->>'level', '') as level,
  nullif(to_jsonb(qa)->>'std_score', '')::numeric as std_score,
  nullif(to_jsonb(qa)->>'reel_score', '')::numeric as reel_score,
  coalesce(nullif(to_jsonb(qa)->>'sort_order', '')::int, nullif(to_jsonb(qa)->>'order_num', '')::int, 0) as sort_order,
  coalesce(nullif(to_jsonb(qa)->>'is_active', '')::boolean, true) as is_active
from public.question_answers qa
join _period_qids p on p.question_id = qa.question_id

union

select
  a.id,
  a.question_id,
  a.text,
  a.text_en,
  a.text_fr,
  nullif(to_jsonb(a)->>'level', '') as level,
  nullif(to_jsonb(a)->>'std_score', '')::numeric as std_score,
  nullif(to_jsonb(a)->>'reel_score', '')::numeric as reel_score,
  coalesce(nullif(to_jsonb(a)->>'sort_order', '')::int, nullif(to_jsonb(a)->>'order_num', '')::int, 0) as sort_order,
  coalesce(nullif(to_jsonb(a)->>'is_active', '')::boolean, true) as is_active
from public.answers a
join _period_qids p on p.question_id = a.question_id;

-- 4) id bazlı tekilleştirip snapshot'a yaz
insert into public.evaluation_period_answers_snapshot (
  id, period_id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active, snapshotted_at
)
select distinct on (s.id)
  s.id,
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid,
  s.question_id,
  s.text,
  s.text_en,
  s.text_fr,
  s.level,
  s.std_score,
  s.reel_score,
  s.sort_order,
  s.is_active,
  now()
from _ans_src s
where s.id is not null
order by s.id, s.sort_order desc;

commit;

-- Doğrulama
select
  (select count(*) from public.evaluation_period_answers_snapshot where period_id='a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid) as snap_answers,
  (select count(*) from public.evaluation_period_answers_snapshot where period_id='a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid and trim(coalesce(text_fr,''))='') as a_fr_empty;

