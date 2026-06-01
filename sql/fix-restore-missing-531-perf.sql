-- Eksik performans şıkkı: active_total=3, perf_531=2, bilgim_yok=1 → 5 veya 3 veya 1 geri yükle
-- Önce pasif satırı aç; yoksa ab354 şablonundan ekle. Sonra audit tekrar.
-- Supabase: TÜM dosyayı seç → Run

-- Hangi puan eksik? (önizleme)
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_questions as (
  select distinct epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
),
scores as (select unnest(array[5, 3, 1]) as need_score),
incomplete as (
  select pq.question_id
  from period_questions pq
  where (
    select count(*) from question_answers qa
    where qa.question_id = pq.question_id and coalesce(qa.is_active, true)
  ) < 4
),
missing as (
  select i.question_id, s.need_score
  from incomplete i
  cross join scores s
  where not exists (
    select 1
    from question_answers qa
    where qa.question_id = i.question_id
      and coalesce(qa.is_active, true)
      and round(coalesce(qa.std_score, 0)) = s.need_score
      and lower(trim(coalesce(qa.level::text, ''))) not in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
      and trim(coalesce(qa.text, '')) !~* 'bilgim\s*yok|fikrim\s*yok'
  )
)
select question_id, need_score as eksik_puan
from missing
order by question_id, need_score desc;

-- ========== 1) Pasif satırı tekrar aç ==========
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_questions as (
  select distinct epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
),
scores as (select unnest(array[5, 3, 1]) as need_score),
missing as (
  select pq.question_id, s.need_score
  from period_questions pq
  cross join scores s
  where not exists (
    select 1 from question_answers qa
    where qa.question_id = pq.question_id
      and coalesce(qa.is_active, true)
      and round(coalesce(qa.std_score, 0)) = s.need_score
      and lower(trim(coalesce(qa.level::text, ''))) not in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
      and trim(coalesce(qa.text, '')) !~* 'bilgim\s*yok|fikrim\s*yok'
  )
),
pick as (
  select distinct on (m.question_id, m.need_score)
    qa.id as answer_id,
    m.need_score
  from missing m
  join question_answers qa on qa.question_id = m.question_id
  where coalesce(qa.is_active, true) = false
    and round(coalesce(qa.std_score, 0)) = m.need_score
    and lower(trim(coalesce(qa.level::text, ''))) not in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
    and trim(coalesce(qa.text, '')) !~* 'bilgim\s*yok|fikrim\s*yok'
  order by m.question_id, m.need_score, coalesce(qa.sort_order, 0), qa.id
)
update question_answers qa
set
  is_active = true,
  sort_order = case p.need_score when 5 then 1 when 3 then 2 when 1 then 3 else qa.sort_order end,
  level = coalesce(nullif(trim(qa.level::text), ''), 'job_evaluation')
from pick p
where qa.id = p.answer_id;

-- ========== 2) Hâlâ eksikse ab354 şablonundan ekle (5 / 3 / 1) ==========
with tpl as (
  select distinct on (round(coalesce(src.std_score, 0)))
    round(coalesce(src.std_score, 0))::int as std_i,
    src.text,
    src.text_fr,
    src.level,
    src.std_score,
    src.reel_score
  from question_answers src
  where src.question_id = 'ab354f7a-108a-4d5a-bb65-a6d7c6dc15f3'
    and coalesce(src.is_active, true)
    and round(coalesce(src.std_score, 0)) in (5, 3, 1)
    and lower(trim(coalesce(src.level::text, ''))) not in ('no_opinion', 'fikrim_yok', 'bilgim_yok')
    and trim(coalesce(src.text, '')) !~* 'bilgim\s*yok|fikrim\s*yok'
  order by round(coalesce(src.std_score, 0)), coalesce(src.sort_order, 0), src.id
),
target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_questions as (
  select distinct epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
),
scores as (select unnest(array[5, 3, 1]) as need_score),
missing as (
  select pq.question_id, s.need_score
  from period_questions pq
  cross join scores s
  where not exists (
    select 1 from question_answers qa
    where qa.question_id = pq.question_id
      and coalesce(qa.is_active, true)
      and round(coalesce(qa.std_score, 0)) = s.need_score
      and lower(trim(coalesce(qa.level::text, ''))) not in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
      and trim(coalesce(qa.text, '')) !~* 'bilgim\s*yok|fikrim\s*yok'
  )
)
insert into question_answers (
  id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
)
select
  gen_random_uuid(),
  m.question_id,
  t.text,
  t.text_fr,
  coalesce(nullif(trim(t.level::text), ''), 'job_evaluation'),
  t.std_score,
  t.reel_score,
  case m.need_score when 5 then 1 when 3 then 2 when 1 then 3 else 4 end,
  true
from missing m
join tpl t on t.std_i = m.need_score;

-- ========== 3) Snapshot hizala ==========
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_q as (
  select distinct tp.period_id, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct tp.period_id, q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
)
insert into evaluation_period_answers_snapshot (
  period_id, id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active, snapshotted_at
)
select
  pq.period_id,
  qa.id,
  qa.question_id,
  qa.text,
  null::text,
  qa.text_fr,
  qa.level::text,
  qa.std_score,
  qa.reel_score,
  coalesce(qa.sort_order, 0),
  true,
  now()
from period_q pq
join question_answers qa on qa.question_id = pq.question_id and coalesce(qa.is_active, true)
where not exists (
  select 1 from evaluation_period_answers_snapshot s
  where s.period_id = pq.period_id and s.id = qa.id
);

with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_q as (
  select distinct tp.period_id, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct tp.period_id, q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
)
update evaluation_period_answers_snapshot s
set
  is_active = coalesce(qa.is_active, true),
  sort_order = coalesce(qa.sort_order, s.sort_order),
  std_score = qa.std_score,
  reel_score = qa.reel_score,
  level = qa.level::text,
  text = qa.text,
  text_fr = qa.text_fr
from question_answers qa
join period_q pq on pq.question_id = qa.question_id
where s.period_id = pq.period_id and s.id = qa.id;

-- ========== 4) Doğrulama ==========
drop table if exists _verify_flags;

create temp table _verify_flags as
with target_periods as (
  select id as period_id, name as period_name from evaluation_periods where status = 'active'
),
all_questions as (
  select distinct tp.period_name, 'genel' as kaynak, null::text as duty_name, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct tp.period_name, 'yan_gorev', d.name, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  join evaluation_duties d on d.id = epdq.duty_id
  union
  select distinct tp.period_name, 'yan_gorev', d.name, q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join evaluation_duties d on d.id = epdc.duty_id
  join questions q on q.category_id = epdc.category_id
)
select
  aq.period_name,
  aq.kaynak,
  aq.duty_name,
  aq.question_id,
  count(*) filter (where coalesce(qa.is_active, true)) as active_total,
  count(*) filter (
    where coalesce(qa.is_active, true)
      and round(coalesce(qa.std_score, 0)) in (5, 3, 1)
      and lower(trim(coalesce(qa.level::text, ''))) not in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
      and trim(coalesce(qa.text, '')) !~* 'bilgim\s*yok|fikrim\s*yok'
  ) as perf_531_count,
  count(*) filter (
    where coalesce(qa.is_active, true)
      and (
        lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
        or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
      )
  ) as no_info_count
from all_questions aq
left join question_answers qa on qa.question_id = aq.question_id
group by aq.period_name, aq.kaynak, aq.duty_name, aq.question_id;

select
  kaynak,
  count(*) filter (where active_total = 4 and perf_531_count = 3 and no_info_count = 1) as tamam,
  count(*) filter (where not (active_total = 4 and perf_531_count = 3 and no_info_count = 1)) as hatali
from _verify_flags
group by kaynak;

select period_name, kaynak, duty_name, question_id, active_total, perf_531_count, no_info_count
from _verify_flags
where not (active_total = 4 and perf_531_count = 3 and no_info_count = 1)
order by kaynak
limit 30;
