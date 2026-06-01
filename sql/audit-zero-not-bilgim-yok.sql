-- 0 performans ≠ Bilgim yok — veri karışıklığı denetimi (salt okunur)
-- İyi-Orta-Zayıf (5,3,1,0) + ayrı Bilgim yok beklenir

with target_periods as (
  select id as period_id, name as period_name from evaluation_periods where status = 'active'
),
all_q as (
  select distinct epq.question_id, 'genel' as kaynak, null::text as duty_name
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct epdq.question_id, 'yan_gorev', d.name
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  join evaluation_duties d on d.id = epdq.duty_id
  union
  select distinct q.id, 'yan_gorev', d.name
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join evaluation_duties d on d.id = epdc.duty_id
  join questions q on q.category_id = epdc.category_id
),
qa as (
  select
    qa.question_id,
    qa.id,
    coalesce(qa.is_active, true) as is_active,
    round(coalesce(qa.std_score, 0))::int as std_i,
    lower(trim(coalesce(qa.level::text, ''))) as lvl,
    left(trim(coalesce(qa.text, '')), 50) as text_tr,
    coalesce(qa.sort_order, 0) as ord
  from question_answers qa
  where qa.question_id in (select question_id from all_q)
)
-- HATA A: Performans puanı 0 ama metin «bilgim/fikrim yok» (ayrı no_opinion satırı yoksa)
select
  aq.kaynak,
  aq.duty_name,
  qa.question_id,
  qa.id as answer_id,
  qa.std_i,
  qa.ord as sort_order,
  qa.text_tr,
  'HATA_0_puani_metin_bilgim_yok' as problem
from qa
join all_q aq on aq.question_id = qa.question_id
where qa.is_active
  and qa.std_i = 0
  and (
    qa.text_tr ~* 'bilgim\s*yok|fikrim\s*yok|bilgi\s*yok'
    or qa.lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok')
  )
  and not exists (
    select 1 from qa q2
    where q2.question_id = qa.question_id
      and q2.is_active
      and q2.id <> qa.id
      and (
        q2.text_tr ~* 'bilgim\s*yok|fikrim\s*yok'
        or q2.lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok')
      )
  )

union all

-- HATA B: Yalnızca 4 şık ve tek «bilgim» benzeri metin (5. şık hiç yok)
select
  aq.kaynak,
  aq.duty_name,
  qa.question_id,
  null::uuid,
  null::int,
  null::int,
  null::text,
  'HATA_4_sik_bilgim_0_karisik' as problem
from all_q aq
where (
  select count(*) from qa q where q.question_id = aq.question_id and q.is_active
) = 4
and (
  select count(*) from qa q
  where q.question_id = aq.question_id and q.is_active
    and (q.text_tr ~* 'bilgim\s*yok|fikrim\s*yok' or q.lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok'))
) >= 1
and (
  select count(distinct q.std_i) from qa q
  where q.question_id = aq.question_id and q.is_active
    and q.std_i in (5, 3, 1, 0)
    and not (q.text_tr ~* 'bilgim\s*yok|fikrim\s*yok')
) < 4

order by problem, kaynak, question_id
limit 200;
