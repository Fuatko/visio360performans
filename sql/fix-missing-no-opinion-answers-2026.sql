-- Eksik 5. şık: «Bilgim yok» / Je ne sais pas (4 performans şıkkı olan sorulara ekler)
-- Veri: mevcut 4 şıkkı SİLMEZ; yalnızca eksik no_opinion INSERT
-- Önce §1 önizleme → §2 (commit) → §2b → §3 (commit) → §4 doğrulama
-- §2 ve §3 AYRI transaction: snapshot hatası canlı INSERT’i geri almaz
-- Supabase SQL Editor → postgres

-- ═══════════════════════════════════════════════════════════════
-- §0 — Dönem (aktif dönem otomatik; isterseniz sabitleyin)
-- ═══════════════════════════════════════════════════════════════
-- select id, name from evaluation_periods where status = 'active';

-- ═══════════════════════════════════════════════════════════════
-- §1 — ÖNİZLEME: kaç soruya 5. şık eklenecek?
-- ═══════════════════════════════════════════════════════════════
with target_period as (
  select id as period_id, name as period_name
  from evaluation_periods
  where status = 'active'
  order by created_at desc
  limit 1
),
period_questions as (
  select tp.period_id, tp.period_name, epq.question_id
  from target_period tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select tp.period_id, tp.period_name, epdq.question_id
  from target_period tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
answer_flags as (
  select
    pq.period_id,
    pq.period_name,
    pq.question_id,
    qa.id as answer_id,
    coalesce(qa.is_active, true) as is_active,
    round(coalesce(qa.std_score, 0))::int as std_i,
    round(coalesce(qa.reel_score, 0))::int as reel_i,
    lower(trim(coalesce(qa.level::text, ''))) as lvl,
    trim(coalesce(qa.text, '')) as text_tr,
    trim(coalesce(qa.text_fr, '')) as text_fr,
    coalesce(qa.sort_order, 0) as ord
  from period_questions pq
  join question_answers qa on qa.question_id = pq.question_id
),
per_question as (
  select
    period_id,
    period_name,
    question_id,
    count(*) filter (where is_active) as active_count,
    count(*) filter (
      where is_active
        and std_i in (5, 3, 1, 0)
        and std_i = reel_i
    ) as perf_count,
    count(distinct std_i) filter (
      where is_active and std_i in (5, 3, 1, 0) and std_i = reel_i
    ) as perf_distinct,
    count(*) filter (
      where is_active
        and (
          lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
          or text_tr ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
          or text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
        )
    ) as no_info_count,
    coalesce(max(ord) filter (where is_active), 0) as max_ord
  from answer_flags
  group by period_id, period_name, question_id
)
select
  period_name,
  count(*) as questions_to_fix,
  min(active_count) as min_answers,
  max(active_count) as max_answers
from per_question
where active_count = 4
  and no_info_count = 0
group by period_name;

-- Detay (ilk 30 soru)
with target_period as (
  select id as period_id, name as period_name
  from evaluation_periods
  where status = 'active'
  order by created_at desc
  limit 1
),
period_questions as (
  select tp.period_id, tp.period_name, epq.question_id
  from target_period tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select tp.period_id, tp.period_name, epdq.question_id
  from target_period tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
answer_flags as (
  select
    pq.period_id,
    pq.period_name,
    pq.question_id,
    coalesce(qa.is_active, true) as is_active,
    round(coalesce(qa.std_score, 0))::int as std_i,
    round(coalesce(qa.reel_score, 0))::int as reel_i,
    lower(trim(coalesce(qa.level::text, ''))) as lvl,
    trim(coalesce(qa.text, '')) as text_tr,
    trim(coalesce(qa.text_fr, '')) as text_fr
  from period_questions pq
  join question_answers qa on qa.question_id = pq.question_id
),
per_question as (
  select
    period_id,
    period_name,
    question_id,
    count(*) filter (where is_active) as active_count,
    count(*) filter (where is_active and std_i in (5, 3, 1, 0) and std_i = reel_i) as perf_count,
    count(distinct std_i) filter (where is_active and std_i in (5, 3, 1, 0) and std_i = reel_i) as perf_distinct,
    count(*) filter (
      where is_active
        and (
          lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
          or text_tr ~* 'fikrim\s*yok|bilgim\s*yok'
          or text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis'
        )
    ) as no_info_count
  from answer_flags
  group by period_id, period_name, question_id
)
select period_name, question_id, active_count, perf_distinct, no_info_count
from per_question
where active_count = 4 and no_info_count = 0
order by question_id
limit 30;

-- ═══════════════════════════════════════════════════════════════
-- §1b — Neden §2 eşleşmedi? (§4’te hâlâ 4 görünen sorular)
-- ═══════════════════════════════════════════════════════════════
with target_period as (
  select id as period_id, name as period_name
  from evaluation_periods
  where status = 'active'
  order by created_at desc
  limit 1
),
period_questions as (
  select tp.period_id, tp.period_name, epq.question_id
  from target_period tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select tp.period_id, tp.period_name, epdq.question_id
  from target_period tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
answer_flags as (
  select
    pq.question_id,
    coalesce(qa.is_active, true) as is_active,
    round(coalesce(qa.std_score, 0))::int as std_i,
    round(coalesce(qa.reel_score, 0))::int as reel_i,
    lower(trim(coalesce(qa.level::text, ''))) as lvl,
    trim(coalesce(qa.text, '')) as text_tr,
    trim(coalesce(qa.text_fr, '')) as text_fr
  from period_questions pq
  join question_answers qa on qa.question_id = pq.question_id
),
per_question as (
  select
    question_id,
    count(*) filter (where is_active) as active_count,
    count(*) filter (where is_active and std_i in (5, 3, 1, 0) and std_i = reel_i) as perf_count,
    count(distinct std_i) filter (
      where is_active and std_i in (5, 3, 1, 0) and std_i = reel_i
    ) as perf_distinct,
    count(*) filter (
      where is_active
        and (
          lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
          or text_tr ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
          or text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
        )
    ) as no_info_count
  from answer_flags
  group by question_id
)
select
  pq.question_id,
  pq.active_count,
  pq.perf_count,
  pq.perf_distinct,
  pq.no_info_count,
  case
    when pq.active_count <> 4 then 'skip:not_4_active'
    when pq.no_info_count > 0 then 'skip:already_has_no_info'
    else 'eligible_for_insert'
  end as fix_status
from per_question pq
where pq.active_count < 5
order by fix_status, pq.question_id;

-- ═══════════════════════════════════════════════════════════════
-- §2 — UYGULA: question_answers’a 5. şık ekle (AYRI transaction)
-- Not: level sütunu prod’da integer olabilir; metin (Bilgim yok.) yeterli — level §2b’de
-- ═══════════════════════════════════════════════════════════════
begin;

with target_period as (
  select id as period_id
  from evaluation_periods
  where status = 'active'
  order by created_at desc
  limit 1
),
period_questions as (
  select tp.period_id, epq.question_id
  from target_period tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select tp.period_id, epdq.question_id
  from target_period tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
answer_flags as (
  select
    pq.question_id,
    coalesce(qa.is_active, true) as is_active,
    lower(trim(coalesce(qa.level::text, ''))) as lvl,
    trim(coalesce(qa.text, '')) as text_tr,
    trim(coalesce(qa.text_fr, '')) as text_fr,
    coalesce(qa.sort_order, 0) as ord
  from period_questions pq
  join question_answers qa on qa.question_id = pq.question_id
),
needs_no_info as (
  select
    question_id,
    coalesce(max(ord) filter (where is_active), 4) + 1 as next_ord
  from answer_flags
  group by question_id
  having count(*) filter (where is_active) = 4
     and count(*) filter (
       where is_active
         and (
           lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
           or text_tr ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
           or text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
         )
     ) = 0
),
inserted as (
  insert into question_answers (
    id,
    question_id,
    text,
    text_fr,
    std_score,
    reel_score,
    sort_order,
    is_active
  )
  select
    gen_random_uuid(),
    n.question_id,
    'Bilgim yok.',
    'Je ne sais pas.',
    0,
    0,
    n.next_ord,
    true
  from needs_no_info n
  where not exists (
    select 1
    from question_answers qa
    where qa.question_id = n.question_id
      and (
        lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
        or trim(coalesce(qa.text, '')) ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
        or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis'
      )
  )
  returning question_id
)
select count(*) as rows_inserted_live from inserted;

commit;

-- §2b — level text ise no_opinion işaretle (integer level’da atlayın; uygulama metinden tanır)
do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'question_answers'
      and c.column_name = 'level'
      and c.data_type in ('text', 'character varying', 'varchar')
  ) then
    update question_answers qa
    set level = 'no_opinion'
    where trim(coalesce(qa.text, '')) = 'Bilgim yok.'
      and coalesce(qa.is_active, true)
      and lower(trim(coalesce(qa.level::text, ''))) not in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info');
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- §3 — Snapshot (AYRI transaction; question_answers’ta text_en olmayabilir)
-- ═══════════════════════════════════════════════════════════════
begin;

with target_period as (
  select id as period_id
  from evaluation_periods
  where status = 'active'
  order by created_at desc
  limit 1
),
period_questions as (
  select tp.period_id, epq.question_id
  from target_period tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select tp.period_id, epdq.question_id
  from target_period tp
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
  where coalesce(qa.is_active, true) = true
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

-- ═══════════════════════════════════════════════════════════════
-- §4 — Doğrulama (5 şık / soru)
-- ═══════════════════════════════════════════════════════════════
with period_q as (
  select epq.period_id, epq.question_id
  from evaluation_period_questions epq
  join evaluation_periods p on p.id = epq.period_id and p.status = 'active'
  where epq.is_active = true
)
select
  pq.question_id,
  count(qa.id) filter (where coalesce(qa.is_active, true)) as live_answers
from period_q pq
left join question_answers qa on qa.question_id = pq.question_id
group by pq.question_id
having count(qa.id) filter (where coalesce(qa.is_active, true)) < 5
order by live_answers
limit 30;
