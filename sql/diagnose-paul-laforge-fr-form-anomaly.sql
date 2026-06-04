-- Paul LAFORGE / sınıf_ogretmeni akışı için teşhis
-- Amaç:
-- 1) Soru seti boş mu?
-- 2) Cevaplar scope dışına düşüyor mu? (orphan)
-- 3) Fransızca soru metinlerinde tekrar / eksik var mı?
--
-- Supabase SQL Editor'de tüm dosyayı çalıştırın.

with evaluator as (
  select id, name, preferred_language
  from users
  where upper(name) like '%PAUL%LAFORGE%'
  order by created_at asc
  limit 1
),
target_duties as (
  select
    upd.period_id,
    upd.user_id as target_id,
    upd.duty_id
  from evaluation_period_user_duties upd
  where upd.is_active = true
),
duty_question_ids as (
  select distinct
    td.period_id,
    td.target_id,
    epdq.question_id
  from target_duties td
  join evaluation_period_duty_questions epdq
    on epdq.period_id = td.period_id
   and epdq.duty_id = td.duty_id
   and epdq.is_active = true
  where epdq.question_id is not null
  union
  select distinct
    td.period_id,
    td.target_id,
    q.id as question_id
  from target_duties td
  join evaluation_period_duty_categories epdc
    on epdc.period_id = td.period_id
   and epdc.duty_id = td.duty_id
   and epdc.is_active = true
  join questions q
    on q.category_id = epdc.category_id
  where q.id is not null
),
period_question_ids as (
  select distinct
    epq.period_id,
    epq.question_id
  from evaluation_period_questions epq
  where epq.is_active = true
    and epq.question_id is not null
),
assignment_base as (
  select
    ea.id as assignment_id,
    ea.slug,
    ea.period_id,
    ea.target_id,
    ea.matrix_context,
    ea.status,
    ep.duty_scope_mode
  from evaluation_assignments ea
  join evaluator e on e.id = ea.evaluator_id
  left join evaluation_periods ep on ep.id = ea.period_id
  where ea.status in ('pending', 'completed')
    and coalesce(ea.matrix_context, 'genel') = 'sinif_ogretmeni'
),
assignment_scoped_questions as (
  -- duty_only mod: sadece görev soruları
  select
    ab.assignment_id,
    dq.question_id
  from assignment_base ab
  join duty_question_ids dq
    on dq.period_id = ab.period_id
   and dq.target_id = ab.target_id
  where coalesce(ab.duty_scope_mode, 'additive') = 'duty_only'

  union

  -- additive mod: dönem soruları + görev soruları
  select
    ab.assignment_id,
    pq.question_id
  from assignment_base ab
  join period_question_ids pq
    on pq.period_id = ab.period_id
  where coalesce(ab.duty_scope_mode, 'additive') <> 'duty_only'

  union

  select
    ab.assignment_id,
    dq.question_id
  from assignment_base ab
  join duty_question_ids dq
    on dq.period_id = ab.period_id
   and dq.target_id = ab.target_id
  where coalesce(ab.duty_scope_mode, 'additive') <> 'duty_only'
),
scoped_q_counts as (
  select
    assignment_id,
    count(distinct question_id) as scoped_question_count
  from assignment_scoped_questions
  group by assignment_id
),
resp_counts as (
  select
    er.assignment_id,
    count(*) as response_row_count,
    count(distinct er.question_id) as response_question_count
  from evaluation_responses er
  join assignment_base ab on ab.assignment_id = er.assignment_id
  group by er.assignment_id
),
orphan_responses as (
  select
    er.assignment_id,
    count(*) as orphan_response_rows,
    count(distinct er.question_id) as orphan_question_count
  from evaluation_responses er
  join assignment_base ab on ab.assignment_id = er.assignment_id
  left join assignment_scoped_questions sq
    on sq.assignment_id = er.assignment_id
   and sq.question_id = er.question_id
  where sq.question_id is null
  group by er.assignment_id
),
fr_text_quality as (
  select
    sq.assignment_id,
    count(*) filter (where trim(coalesce(q.text_fr, '')) = '') as missing_fr_text_count,
    count(*) as total_scoped_questions
  from assignment_scoped_questions sq
  join questions q on q.id = sq.question_id
  group by sq.assignment_id
),
fr_duplicates as (
  select
    x.assignment_id,
    count(*) as duplicate_fr_text_groups
  from (
    select
      sq.assignment_id,
      lower(trim(coalesce(q.text_fr, ''))) as fr_text_norm,
      count(*) as n
    from assignment_scoped_questions sq
    join questions q on q.id = sq.question_id
    where trim(coalesce(q.text_fr, '')) <> ''
    group by sq.assignment_id, lower(trim(coalesce(q.text_fr, '')))
    having count(*) > 1
  ) x
  group by x.assignment_id
)
select
  ab.assignment_id,
  ab.slug,
  ab.status,
  ab.matrix_context,
  coalesce(sqc.scoped_question_count, 0) as scoped_question_count,
  coalesce(rc.response_row_count, 0) as response_row_count,
  coalesce(rc.response_question_count, 0) as response_question_count,
  coalesce(orx.orphan_response_rows, 0) as orphan_response_rows,
  coalesce(orx.orphan_question_count, 0) as orphan_question_count,
  coalesce(frq.missing_fr_text_count, 0) as missing_fr_text_count,
  coalesce(fd.duplicate_fr_text_groups, 0) as duplicate_fr_text_groups,
  case
    when coalesce(sqc.scoped_question_count, 0) = 0 then 'HATA_SCOPE_BOS'
    when coalesce(orx.orphan_response_rows, 0) > 0 then 'HATA_ORPHAN_RESPONSE'
    when coalesce(fd.duplicate_fr_text_groups, 0) > 0 then 'UYARI_FR_METIN_TEKRAR'
    when coalesce(frq.missing_fr_text_count, 0) > 0 then 'UYARI_FR_METIN_EKSIK'
    else 'OK'
  end as durum
from assignment_base ab
left join scoped_q_counts sqc on sqc.assignment_id = ab.assignment_id
left join resp_counts rc on rc.assignment_id = ab.assignment_id
left join orphan_responses orx on orx.assignment_id = ab.assignment_id
left join fr_text_quality frq on frq.assignment_id = ab.assignment_id
left join fr_duplicates fd on fd.assignment_id = ab.assignment_id
order by
  case when ab.status = 'pending' then 0 else 1 end,
  coalesce(orx.orphan_response_rows, 0) desc,
  coalesce(sqc.scoped_question_count, 0) asc,
  ab.assignment_id;

