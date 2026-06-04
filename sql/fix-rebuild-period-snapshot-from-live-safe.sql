-- Aktif dönemin snapshot tablolarını canlı kaynaklardan güvenli yeniden oluşturur.
-- Amaç: karışmış/tekrarlayan/bozuk lokalize metinleri (özellikle FR) resetlemek.
-- Not: Sadece period_id kapsamını etkiler.
--
-- KULLANIM:
-- 1) period_id değerini doğrulayın (varsayılan: 2026 EĞİTMEN)
-- 2) Dosyanın tamamını Supabase SQL Editor'de çalıştırın.

begin;

-- 0) Hedef dönem
with target_period as (
  select 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id
)
select period_id from target_period;

-- 1) Snapshot verisini sadece hedef dönem için temizle
delete from public.evaluation_period_answers_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

delete from public.evaluation_period_questions_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

delete from public.evaluation_period_categories_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

delete from public.evaluation_period_main_categories_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

-- 2) Main categories snapshot
insert into public.evaluation_period_main_categories_snapshot (
  id, period_id, name, name_en, name_fr, sort_order, is_active, status, snapshotted_at
)
select
  mc.id,
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id,
  mc.name,
  mc.name_en,
  mc.name_fr,
  coalesce(nullif(to_jsonb(mc)->>'sort_order', '')::int, 0),
  coalesce(nullif(to_jsonb(mc)->>'is_active', '')::boolean, true),
  nullif(to_jsonb(mc)->>'status', ''),
  now()
from public.main_categories mc;

-- 3) Döneme bağlı soru id seti (aktif period soruları + aktif duty bağları)
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

-- 4) Categories snapshot (sadece kullanılan kategoriler)
insert into public.evaluation_period_categories_snapshot (
  id, period_id, main_category_id, name, name_en, name_fr, sort_order, is_active, snapshotted_at
)
select distinct
  c.id,
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id,
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

-- 5) Questions snapshot
insert into public.evaluation_period_questions_snapshot (
  id, period_id, category_id, text, text_en, text_fr, sort_order, is_active, snapshotted_at
)
select
  q.id,
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id,
  q.category_id,
  q.text,
  q.text_en,
  q.text_fr,
  coalesce(nullif(to_jsonb(q)->>'sort_order', '')::int, nullif(to_jsonb(q)->>'order_num', '')::int, 0),
  coalesce(nullif(to_jsonb(q)->>'is_active', '')::boolean, true),
  now()
from public.questions q
join _period_qids p on p.question_id = q.id;

-- 6) Answers snapshot (question_answers + answers, id bazlı tekilleştirme)
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

insert into public.evaluation_period_answers_snapshot (
  id, period_id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active, snapshotted_at
)
select distinct on (s.id)
  s.id,
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id,
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

-- 7) Doğrulama özeti
select
  (select count(*) from public.evaluation_period_questions_snapshot where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid) as snap_questions,
  (select count(*) from public.evaluation_period_answers_snapshot where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid) as snap_answers,
  (select count(*) from public.evaluation_period_questions_snapshot where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid and trim(coalesce(text_fr,'')) = '') as q_fr_empty,
  (select count(*) from public.evaluation_period_answers_snapshot where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid and trim(coalesce(text_fr,'')) = '') as a_fr_empty;

