-- Yalnızca §3: canlı «Bilgim yok» satırlarını dönem snapshot’ına ekler
-- Önce: sql/fix-missing-no-opinion-copy-from-ab354.sql ile canlı tablo 5 şık olmalı
-- Supabase SQL Editor → postgres (bu dosyanın TAMAMINI seçin)

begin;

with target_periods as (
  select id as period_id
  from evaluation_periods
  where status = 'active'
),
period_questions as (
  select tp.period_id, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
inserted_snap as (
  insert into evaluation_period_answers_snapshot (
    period_id,
    id,
    question_id,
    text,
    text_en,
    text_fr,
    level,
    std_score,
    reel_score,
    sort_order,
    is_active,
    snapshotted_at
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
    coalesce(qa.sort_order, 5),
    coalesce(qa.is_active, true),
    now()
  from period_questions pq
  join question_answers qa on qa.question_id = pq.question_id
  where qa.is_active is not false
    and (
      lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
      or trim(coalesce(qa.text, '')) ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
      or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
    )
    and not exists (
      select 1
      from evaluation_period_answers_snapshot s
      where s.period_id = pq.period_id
        and s.id = qa.id
    )
  returning id
)
select count(*) as rows_inserted_snapshot from inserted_snap;

commit;

-- Kontrol: soru başına snapshot şık sayısı (aktif dönem)
with period_q as (
  select distinct epq.period_id, epq.question_id
  from evaluation_period_questions epq
  join evaluation_periods p on p.id = epq.period_id and p.status = 'active'
  where epq.is_active = true
)
select pq.question_id, count(*) as snap_answers
from period_q pq
join evaluation_period_answers_snapshot s
  on s.period_id = pq.period_id and s.question_id = pq.question_id
  and coalesce(s.is_active, true)
group by pq.question_id
having count(*) < 5
order by count(*)
limit 30;
