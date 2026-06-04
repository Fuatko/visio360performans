-- Snapshot: soru başına yalnızca canlıdaki 4 aktif cevap kalsın (formda 5 şık sorunu)
-- Canlı zaten OK (69/69) ama snap_aktif > 4 ise bunu çalıştırın
-- Supabase: TÜM dosyayı Run

drop table if exists _fix_periods;
drop table if exists _fix_pq;

create temp table _fix_periods as
select id as period_id from evaluation_periods where status = 'active';

create temp table _fix_pq as
select distinct question_id from (
  select epq.question_id from _fix_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select epdq.question_id from _fix_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select q.id from _fix_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
) x;

create temp table _canonical_live as
select qa.question_id, qa.id as answer_id
from question_answers qa
where qa.question_id in (select question_id from _fix_pq)
  and coalesce(qa.is_active, true);

-- Pasif: snapshot satırı canlı 4 şıkta yok
update evaluation_period_answers_snapshot s
set is_active = false
from _fix_periods tp
where s.period_id = tp.period_id
  and s.question_id in (select question_id from _fix_pq)
  and coalesce(s.is_active, true)
  and not exists (
    select 1 from _canonical_live c
    where c.question_id = s.question_id and c.answer_id = s.id
  );

-- Aktif kalan snapshot = canlı ile aynı metin/puan
update evaluation_period_answers_snapshot s
set
  is_active = true,
  text = qa.text,
  text_fr = qa.text_fr,
  level = qa.level::text,
  std_score = qa.std_score,
  reel_score = qa.reel_score,
  sort_order = coalesce(qa.sort_order, s.sort_order)
from question_answers qa
join _fix_periods tp on tp.period_id = s.period_id
where s.id = qa.id
  and s.question_id = qa.question_id
  and qa.question_id in (select question_id from _fix_pq)
  and coalesce(qa.is_active, true);

-- Eksik snapshot satırı ekle
insert into evaluation_period_answers_snapshot (
  period_id, id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active, snapshotted_at
)
select
  tp.period_id,
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
from _fix_pq pq
cross join _fix_periods tp
join question_answers qa on qa.question_id = pq.question_id and coalesce(qa.is_active, true)
where not exists (
  select 1 from evaluation_period_answers_snapshot s
  where s.period_id = tp.period_id and s.id = qa.id
);

-- Doğrulama
select
  count(distinct pq.question_id) as soru,
  count(*) filter (where snap_n = 4) as snap_tam_4,
  count(*) filter (where snap_n > 4) as snap_fazla,
  count(*) filter (where snap_n < 4) as snap_eksik
from _fix_pq pq
join lateral (
  select count(*) filter (where coalesce(s.is_active, true)) as snap_n
  from evaluation_period_answers_snapshot s
  cross join _fix_periods tp
  where s.period_id = tp.period_id and s.question_id = pq.question_id
) x on true;
