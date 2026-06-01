-- Tek sonuç: tüm aktif dönem sorularında 4 şık var mı? (5,3,1 + Bilgim yok)
-- Supabase SQL Editor → tamamını Run → tek satır beklenir: durum = OK

drop table if exists _four_opt;

create temp table _four_opt as
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
all_q as (
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
flags as (
  select
    aq.question_id,
    count(*) filter (where coalesce(qa.is_active, true)) as n_active,
    count(*) filter (
      where coalesce(qa.is_active, true)
        and round(coalesce(qa.std_score, 0)) in (5, 3, 1)
        and lower(trim(coalesce(qa.level::text, ''))) not in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
        and trim(coalesce(qa.text, '')) !~* 'bilgim\s*yok|fikrim\s*yok'
    ) as n_perf,
    count(*) filter (
      where coalesce(qa.is_active, true)
        and (
          lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
          or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
        )
    ) as n_bilgim
  from all_q aq
  left join question_answers qa on qa.question_id = aq.question_id
  group by aq.question_id
)
select
  question_id,
  n_active,
  n_perf,
  n_bilgim,
  (n_active = 4 and n_perf = 3 and n_bilgim = 1) as ok
from flags;

select
  count(*)::int as toplam_soru,
  count(*) filter (where ok)::int as tamam_4_sik,
  count(*) filter (where not ok)::int as eksik,
  case when count(*) filter (where not ok) = 0 then 'OK — acabilirsiniz' else 'EKSIK VAR' end as durum
from _four_opt;

select question_id, n_active, n_perf, n_bilgim
from _four_opt
where not ok
limit 20;
