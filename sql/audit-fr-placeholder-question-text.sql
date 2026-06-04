-- FR soru metni kalite denetimi (yalnız rapor, veri yazmaz)
-- Amaç:
-- 1) text_fr şablon/generic mi? (Question 1, Q2, vb.)
-- 2) text_fr, TR metninin birebir kopyası mı?
-- 3) Snapshot tablolarında da aynı sorun var mı?

with q_live as (
  select
    q.id as question_id,
    trim(coalesce(q.text, '')) as text_tr,
    trim(coalesce(q.text_fr, '')) as text_fr
  from questions q
),
q_live_flag as (
  select
    question_id,
    text_tr,
    text_fr,
    case
      when text_fr = '' then 'FR_EMPTY'
      when lower(text_fr) ~ '^(question|q)\s*[0-9]+\s*$' then 'FR_PLACEHOLDER'
      when lower(text_fr) = lower(text_tr) then 'FR_EQUALS_TR'
      else 'OK'
    end as durum
  from q_live
),
snap as (
  select
    s.period_id,
    s.id as snapshot_question_id,
    trim(coalesce(s.text, '')) as text_tr,
    trim(coalesce(s.text_fr, '')) as text_fr
  from evaluation_period_questions_snapshot s
),
snap_flag as (
  select
    period_id,
    snapshot_question_id,
    text_tr,
    text_fr,
    case
      when text_fr = '' then 'FR_EMPTY'
      when lower(text_fr) ~ '^(question|q)\s*[0-9]+\s*$' then 'FR_PLACEHOLDER'
      when lower(text_fr) = lower(text_tr) then 'FR_EQUALS_TR'
      else 'OK'
    end as durum
  from snap
)
select
  'LIVE' as source,
  null::uuid as period_id,
  lf.question_id as row_id,
  lf.durum,
  lf.text_tr,
  lf.text_fr
from q_live_flag lf
where lf.durum <> 'OK'

union all

select
  'SNAPSHOT' as source,
  sf.period_id,
  sf.snapshot_question_id as row_id,
  sf.durum,
  sf.text_tr,
  sf.text_fr
from snap_flag sf
where sf.durum <> 'OK'
order by source, durum, row_id;

