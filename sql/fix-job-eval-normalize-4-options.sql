-- 4 şık: 5 (İyi) + 3 (Orta) + 1 (Zayıf) + Fikrim yok
-- Supabase SQL Editor: dosyanın TAMAMINI seç → Run (tek seferde)
-- Sonra: sql/audit-answer-scale-business-rule.sql

-- ========== ADIM 1: Fazla cevapları pasifleştir ==========
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_questions as (
  select distinct epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
),
flagged as (
  select
    qa.id,
    qa.question_id,
    round(coalesce(qa.std_score, 0))::int as std_i,
    coalesce(qa.sort_order, 0) as ord,
    (
      lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
      or trim(coalesce(qa.text, '')) ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
      or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
    ) as is_no_info
  from question_answers qa
  where qa.question_id in (select question_id from period_questions)
    and coalesce(qa.is_active, true)
),
ranked as (
  select
    f.id,
    row_number() over (
      partition by f.question_id,
      case
        when f.is_no_info then 'no_info'
        when f.std_i in (5, 3, 1) then 'perf_' || f.std_i::text
        else 'perf_other'
      end
      order by f.ord, f.id
    ) as rn
  from flagged f
),
to_deactivate as (
  select id from ranked where rn > 1
  union
  select f.id
  from flagged f
  where not f.is_no_info and (f.std_i = 0 or f.std_i not in (5, 3, 1))
)
update question_answers qa
set is_active = false
where qa.id in (select id from to_deactivate);

-- ========== ADIM 2: Sıra 1-4 ==========
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_questions as (
  select distinct epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
)
update question_answers qa
set sort_order = case
  when round(coalesce(qa.std_score, 0)) = 5 then 1
  when round(coalesce(qa.std_score, 0)) = 3 then 2
  when round(coalesce(qa.std_score, 0)) = 1 then 3
  else 4
end
where qa.question_id in (select question_id from period_questions)
  and coalesce(qa.is_active, true);

-- ========== ADIM 3: Bilgim yok metni / level ==========
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_questions as (
  select distinct epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
)
update question_answers qa
set
  level = 'no_opinion',
  text = coalesce(nullif(trim(qa.text), ''), 'Fikrim yok.'),
  text_fr = coalesce(nullif(trim(qa.text_fr), ''), 'Je ne sais pas.'),
  std_score = 0,
  reel_score = 0,
  sort_order = 4
where qa.question_id in (select question_id from period_questions)
  and coalesce(qa.is_active, true)
  and (
    lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
    or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
    or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais'
  );

-- ========== ADIM 4: Eksik Bilgim yok ekle ==========
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_questions as (
  select distinct epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
)
insert into question_answers (
  id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
)
select
  gen_random_uuid(),
  pq.question_id,
  'Fikrim yok.',
  'Je ne sais pas.',
  'no_opinion',
  0,
  0,
  4,
  true
from period_questions pq
where not exists (
  select 1
  from question_answers qa
  where qa.question_id = pq.question_id
    and coalesce(qa.is_active, true)
    and (
      lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion'
      or trim(coalesce(qa.text, '')) ~* 'fikrim\s*yok|bilgim\s*yok'
    )
);

-- ========== ADIM 5: Snapshot güncelle ==========
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_q as (
  select distinct tp.period_id, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct tp.period_id, q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
)
update evaluation_period_answers_snapshot s
set
  is_active = coalesce(qa.is_active, true),
  sort_order = coalesce(qa.sort_order, s.sort_order),
  level = qa.level::text,
  std_score = qa.std_score,
  reel_score = qa.reel_score,
  text = qa.text,
  text_fr = qa.text_fr
from question_answers qa
join period_q pq on pq.question_id = qa.question_id
where s.period_id = pq.period_id
  and s.id = qa.id;

with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_q as (
  select distinct tp.period_id, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct tp.period_id, q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
)
insert into evaluation_period_answers_snapshot (
  period_id, id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active, snapshotted_at
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
  coalesce(qa.sort_order, 0),
  true,
  now()
from period_q pq
join question_answers qa on qa.question_id = pq.question_id and coalesce(qa.is_active, true)
where not exists (
  select 1
  from evaluation_period_answers_snapshot s
  where s.period_id = pq.period_id and s.id = qa.id
);

-- Pasif kalan snapshot satırları (canlıda pasif olanlar)
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
period_q as (
  select distinct tp.period_id, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct tp.period_id, q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
)
update evaluation_period_answers_snapshot s
set is_active = false
from question_answers qa
join period_q pq on pq.question_id = qa.question_id
where s.period_id = pq.period_id
  and s.id = qa.id
  and coalesce(qa.is_active, true) = false;

-- ========== ADIM 6: Doğrulama özeti ==========
with target_periods as (
  select id as period_id, name as period_name from evaluation_periods where status = 'active'
),
all_questions as (
  select distinct tp.period_name, 'genel' as kaynak, null::text as duty_name, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct tp.period_name, 'yan_gorev', d.name, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  join evaluation_duties d on d.id = epdq.duty_id
  union
  select distinct tp.period_name, 'yan_gorev', d.name, q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join evaluation_duties d on d.id = epdc.duty_id
  join questions q on q.category_id = epdc.category_id
),
flags as (
  select
    aq.kaynak,
    aq.question_id,
    count(*) filter (where coalesce(qa.is_active, true)) as active_total,
    count(*) filter (
      where coalesce(qa.is_active, true)
        and not (
          lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
          or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
        )
        and round(coalesce(qa.std_score, 0)) in (5, 3, 1)
    ) as perf_531,
    count(*) filter (
      where coalesce(qa.is_active, true)
        and (
          lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
          or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
        )
    ) as no_info_n
  from all_questions aq
  left join question_answers qa on qa.question_id = aq.question_id
  group by aq.kaynak, aq.question_id
)
select
  kaynak,
  count(*) as soru,
  count(*) filter (
    where active_total = 4 and perf_531 = 3 and no_info_n = 1
  ) as tamam_4_sik,
  count(*) filter (
    where not (active_total = 4 and perf_531 = 3 and no_info_n = 1)
  ) as hatali
from flags
group by kaynak
order by kaynak;
