-- Boş soru metni denetimi (TR/EN/FR) — veri yazmaz, sadece raporlar.
-- Kapsam: aktif period soruları + duty soruları (assignment matrix_context kırılımıyla)

with active_period as (
  select id
  from evaluation_periods
  where status = 'active'
  order by created_at desc
  limit 1
),
period_questions as (
  select distinct epq.question_id
  from evaluation_period_questions epq
  join active_period ap on ap.id = epq.period_id
  where epq.is_active = true
    and epq.question_id is not null
),
duty_questions as (
  select distinct epdq.question_id
  from evaluation_period_duty_questions epdq
  join active_period ap on ap.id = epdq.period_id
  where epdq.is_active = true
    and epdq.question_id is not null
  union
  select distinct q.id
  from evaluation_period_duty_categories epdc
  join active_period ap on ap.id = epdc.period_id
  join questions q on q.category_id = epdc.category_id
  where epdc.is_active = true
),
all_scope_questions as (
  select question_id from period_questions
  union
  select question_id from duty_questions
),
question_text_state as (
  select
    q.id as question_id,
    q.category_id,
    trim(coalesce(q.text, '')) as tr_text,
    trim(coalesce(q.text_en, '')) as en_text,
    trim(coalesce(q.text_fr, '')) as fr_text
  from questions q
  join all_scope_questions s on s.question_id = q.id
),
assignment_scope as (
  select
    ea.id as assignment_id,
    coalesce(ea.matrix_context, 'genel') as matrix_context
  from evaluation_assignments ea
  join active_period ap on ap.id = ea.period_id
  where ea.status in ('pending', 'completed')
)
select
  qts.question_id,
  qts.category_id,
  case when qts.tr_text = '' then 1 else 0 end as tr_missing,
  case when qts.en_text = '' then 1 else 0 end as en_missing,
  case when qts.fr_text = '' then 1 else 0 end as fr_missing,
  case
    when qts.tr_text = '' and qts.en_text = '' and qts.fr_text = '' then 'ALL_EMPTY'
    when qts.fr_text = '' then 'FR_EMPTY'
    when qts.en_text = '' then 'EN_EMPTY'
    when qts.tr_text = '' then 'TR_EMPTY'
    else 'OK'
  end as durum
from question_text_state qts
where qts.tr_text = '' or qts.en_text = '' or qts.fr_text = ''
order by
  case
    when qts.tr_text = '' and qts.en_text = '' and qts.fr_text = '' then 0
    when qts.fr_text = '' then 1
    when qts.en_text = '' then 2
    else 3
  end,
  qts.question_id;

