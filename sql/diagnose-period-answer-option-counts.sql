-- Dönem sorularında şık sayısı (snapshot vs canlı) — veri değiştirmez, salt okunur
-- Supabase SQL Editor → postgres

-- 1) Aktif dönem (slug veya id ile daraltın)
-- select id, name from evaluation_periods where status = 'active' order by created_at desc limit 5;

-- 2) Snapshot var mı?
select
  p.id as period_id,
  p.name as period_name,
  (select count(*) from evaluation_period_questions_snapshot q where q.period_id = p.id) as snap_questions,
  (select count(*) from evaluation_period_answers_snapshot a where a.period_id = p.id) as snap_answers
from evaluation_periods p
where p.status = 'active'
order by p.created_at desc
limit 5;

-- 3) Soru başına canlı şık sayısı (iş değerlendirmesi dönemi soruları)
with period_q as (
  select epq.period_id, epq.question_id
  from evaluation_period_questions epq
  join evaluation_periods p on p.id = epq.period_id
  where p.status = 'active'
    and epq.is_active = true
),
live_counts as (
  select
    pq.period_id,
    pq.question_id,
    count(qa.id) filter (where coalesce(qa.is_active, true)) as live_answer_count
  from period_q pq
  left join question_answers qa on qa.question_id = pq.question_id
  group by pq.period_id, pq.question_id
),
snap_counts as (
  select
    a.period_id,
    a.question_id,
    count(*) filter (where coalesce(a.is_active, true)) as snap_answer_count
  from evaluation_period_answers_snapshot a
  join evaluation_periods p on p.id = a.period_id and p.status = 'active'
  group by a.period_id, a.question_id
)
select
  p.name as period_name,
  lc.question_id,
  coalesce(sc.snap_answer_count, 0) as snap_answers,
  lc.live_answer_count,
  case
    when lc.live_answer_count >= 5 then 'ok'
    when lc.live_answer_count = 4 then 'MISSING_NO_INFO — sql/fix-missing-no-opinion-answers-2026.sql çalıştırın'
    when lc.live_answer_count < 4 then 'INCOMPLETE_LIVE — soru bankası/import eksik'
    else 'no_answers'
  end as status
from live_counts lc
join evaluation_periods p on p.id = lc.period_id
left join snap_counts sc on sc.period_id = lc.period_id and sc.question_id = lc.question_id
where lc.live_answer_count < 5
order by lc.live_answer_count asc, p.name
limit 200;

-- 4) Görev paketi soruları (yan görev) — canlı şık sayısı
select
  p.name as period_name,
  d.name as duty_name,
  d.code as duty_code,
  epdq.question_id,
  count(qa.id) filter (where coalesce(qa.is_active, true)) as live_answers
from evaluation_period_duty_questions epdq
join evaluation_periods p on p.id = epdq.period_id and p.status = 'active'
join evaluation_duties d on d.id = epdq.duty_id
left join question_answers qa on qa.question_id = epdq.question_id
where epdq.is_active = true
group by p.name, d.name, d.code, epdq.question_id
having count(qa.id) filter (where coalesce(qa.is_active, true)) < 5
order by live_answers asc, p.name, d.name
limit 200;
