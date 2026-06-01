-- Kalan yan görev soruları (canli_tamam / snap_tamam dışı kalanlar)
-- fix-missing-no-opinion-duty-all.sql §3 sonrası çalıştırın

with target_periods as (select id as period_id, name as period_name from evaluation_periods where status = 'active'),
duty_q as (
  select distinct tp.period_id, tp.period_name, d.id as duty_id, d.name as duty_name, d.code as duty_code,
    q.id as question_id, q.category_id, left(q.text, 60) as question_text
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join evaluation_duties d on d.id = epdc.duty_id
  join questions q on q.category_id = epdc.category_id
  union
  select distinct tp.period_id, tp.period_name, d.id, d.name, d.code,
    q.id, q.category_id, left(q.text, 60)
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  join evaluation_duties d on d.id = epdq.duty_id
  join questions q on q.id = epdq.question_id
),
scored as (
  select
    dq.*,
    coalesce(l.live, 0) as live_active,
    coalesce(l.no_info, 0) as live_no_info,
    coalesce(s.snap, 0) as snap_active,
    coalesce(s.no_info, 0) as snap_no_info
  from duty_q dq
  left join lateral (
    select
      count(*) filter (where qa.is_active is not false) as live,
      count(*) filter (
        where qa.is_active is not false
          and (trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
            or lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion')
      ) as no_info
    from question_answers qa where qa.question_id = dq.question_id
  ) l on true
  left join lateral (
    select
      count(*) filter (where coalesce(s.is_active, true)) as snap,
      count(*) filter (
        where coalesce(s.is_active, true)
          and (trim(coalesce(s.text, '')) ilike 'Bilgim yok%'
            or lower(trim(coalesce(s.level::text, ''))) = 'no_opinion')
      ) as no_info
    from evaluation_period_answers_snapshot s
    where s.period_id = dq.period_id and s.question_id = dq.question_id
  ) s on true
)
select
  period_name,
  duty_name,
  duty_code,
  question_id,
  category_id,
  question_text,
  live_active,
  live_no_info,
  snap_active,
  snap_no_info,
  case
    when live_active = 0 then 'CEVAP_YOK_import_gerekli'
    when live_active < 5 and live_no_info = 0 then 'EKSİK_SIK_import_gerekli'
    when live_active < 5 and live_no_info >= 1 then 'EKSİK_PERFORMANS_siklari'
    when live_active >= 5 and snap_active < 5 then 'SNAPSHOT_tekrar_sync'
    else 'DIGER'
  end as oneri
from scored
where live_active < 5 or snap_active < 5 or live_no_info < 1 or snap_no_info < 1
order by duty_name, live_active, question_id;

-- Aynı kategoride tam (5 şık) donor soru var mı?
with target_periods as (select id as period_id from evaluation_periods where status = 'active'),
duty_q as (
  select distinct q.id as question_id, q.category_id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
  union
  select distinct epdq.question_id, q.category_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  join questions q on q.id = epdq.question_id
),
incomplete as (
  select dq.question_id, dq.category_id
  from duty_q dq
  where (select count(*) from question_answers qa where qa.question_id = dq.question_id and qa.is_active is not false) < 5
),
donors as (
  select dq.question_id, dq.category_id
  from duty_q dq
  where (select count(*) from question_answers qa where qa.question_id = dq.question_id and qa.is_active is not false) >= 5
    and exists (
      select 1 from question_answers qa
      where qa.question_id = dq.question_id and qa.is_active is not false
        and (trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
          or lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion')
    )
)
select
  i.question_id as eksik_soru,
  i.category_id,
  d.question_id as donor_soru,
  (select count(*) from question_answers qa where qa.question_id = i.question_id and qa.is_active is not false) as eksik_live,
  (select count(*) from question_answers qa where qa.question_id = d.question_id and qa.is_active is not false) as donor_live
from incomplete i
left join donors d on d.category_id = i.category_id
order by i.category_id, d.question_id nulls last;
