-- Eksik snapshot cevaplarını canlı question_answers'tan EKLER (mevcut satırları silmez)
-- Önce: sql/diagnose-period-answer-option-counts.sql ile kontrol edin
-- Supabase SQL Editor → postgres

-- Hedef dönem id (örnek: aktif dönem)
-- \set period_id 'DONEM-UUID-BURAYA'

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
  epq.period_id,
  qa.id,
  qa.question_id,
  qa.text,
  null::text,
  qa.text_fr,
  qa.level,
  qa.std_score,
  qa.reel_score,
  coalesce(qa.sort_order, 0),
  coalesce(qa.is_active, true),
  now()
from evaluation_period_questions epq
join question_answers qa on qa.question_id = epq.question_id
where epq.period_id = 'DONEM-UUID-BURAYA' -- ← değiştirin
  and epq.is_active = true
  and coalesce(qa.is_active, true) = true
  and not exists (
    select 1
    from evaluation_period_answers_snapshot s
    where s.period_id = epq.period_id
      and s.id = qa.id
  );

-- Kontrol: soru başına şık sayısı
select question_id, count(*) as snap_answers
from evaluation_period_answers_snapshot
where period_id = 'DONEM-UUID-BURAYA'
group by question_id
having count(*) < 5
order by count(*) asc
limit 50;
