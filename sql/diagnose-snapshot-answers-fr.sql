-- Snapshot'ta FR eksik cevapları listele + canlı tabloda FR var mı?
-- period_id: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6

-- 1) Eksik 5 cevap (detay)
select
  snap.id as answer_id,
  snap.question_id,
  left(snap.text, 120) as text_tr,
  snap.std_score,
  snap.reel_score,
  snap.level,
  left(q.text, 80) as question_tr,
  coalesce(nullif(trim(qa.text_fr), ''), nullif(trim(a2.text_fr), '')) as live_text_fr,
  snap.source_table
from public.evaluation_period_answers_snapshot snap
join public.evaluation_period_questions_snapshot q
  on q.period_id = snap.period_id and q.id = snap.question_id
left join public.question_answers qa on qa.id = snap.id
left join public.answers a2 on a2.id = snap.id
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(snap.is_active, true)
  and coalesce(nullif(trim(snap.text_fr), ''), '') = ''
order by q.sort_order nulls last, snap.sort_order nulls last;

-- 2) Özet (canlıda FR var / yok)
select
  count(*) as missing_in_snapshot,
  count(*) filter (where coalesce(nullif(trim(qa.text_fr), ''), nullif(trim(a2.text_fr), '')) is not null) as fixable_from_live,
  count(*) filter (where coalesce(nullif(trim(qa.text_fr), ''), nullif(trim(a2.text_fr), '')) is null) as missing_in_live_too
from public.evaluation_period_answers_snapshot snap
left join public.question_answers qa on qa.id = snap.id
left join public.answers a2 on a2.id = snap.id
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(snap.is_active, true)
  and coalesce(nullif(trim(snap.text_fr), ''), '') = '';
