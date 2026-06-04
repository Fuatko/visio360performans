-- Kalan 1 FR eksik cevap
-- period_id: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6

-- 1) Hangi kayıt?
select
  snap.id,
  snap.text as text_tr,
  snap.std_score,
  snap.reel_score,
  snap.level,
  left(q.text, 100) as question_tr
from public.evaluation_period_answers_snapshot snap
join public.evaluation_period_questions_snapshot q
  on q.period_id = snap.period_id and q.id = snap.question_id
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(snap.is_active, true)
  and coalesce(nullif(trim(snap.text_fr), ''), '') = '';

-- 2) Otomatik düzelt
with missing as (
  select
    snap.id,
    snap.text,
    snap.std_score,
    coalesce(nullif(trim(qa.text_fr), ''), nullif(trim(a2.text_fr), '')) as live_fr
  from public.evaluation_period_answers_snapshot snap
  left join public.question_answers qa on qa.id = snap.id
  left join public.answers a2 on a2.id = snap.id
  where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and coalesce(snap.is_active, true)
    and coalesce(nullif(trim(snap.text_fr), ''), '') = ''
)
update public.evaluation_period_answers_snapshot snap
set text_fr = coalesce(
  m.live_fr,
  case round(m.std_score)::int
    when 5 then 'Forte'
    when 3 then 'Répond aux attentes'
    when 1 then 'Faible'
    when 0 then 'Aucune idée'
    else null
  end,
  case
    when m.text ~* 'fikrim\s*yok|bilgim\s*yok' then 'Aucune idée'
    when m.text ~* 'beklentiyi\s*kar' then 'Répond aux attentes'
    else null
  end
)
from missing m
where snap.id = m.id
  and coalesce(
    m.live_fr,
    case round(m.std_score)::int when 5 then 'x' when 3 then 'x' when 1 then 'x' when 0 then 'x' else null end,
    case when m.text ~* 'fikrim\s*yok|bilgim\s*yok|beklentiyi\s*kar' then 'x' else null end
  ) is not null;

update public.question_answers qa
set text_fr = snap.text_fr
from public.evaluation_period_answers_snapshot snap
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and snap.id = qa.id
  and coalesce(nullif(trim(qa.text_fr), ''), '') = ''
  and coalesce(nullif(trim(snap.text_fr), ''), '') <> '';

-- 3) Kontrol (missing_fr = 0 olmalı)
select count(*) as missing_fr
from public.evaluation_period_answers_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(is_active, true)
  and coalesce(nullif(trim(text_fr), ''), '') = '';
