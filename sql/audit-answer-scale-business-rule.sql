-- İş kuralı denetimi: 4 performans (5,3,1,0) + 1 Bilgim yok = 5 aktif şık
-- Genel + yan görev (kategori bağlantılı) — salt okunur
-- Supabase SQL Editor → postgres

with target_periods as (
  select id as period_id, name as period_name from evaluation_periods where status = 'active'
),
all_questions as (
  select distinct tp.period_id, tp.period_name, 'genel' as kaynak, null::text as duty_name, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select distinct tp.period_id, tp.period_name, 'yan_gorev', d.name, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  join evaluation_duties d on d.id = epdq.duty_id
  union
  select distinct tp.period_id, tp.period_name, 'yan_gorev', d.name, q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join evaluation_duties d on d.id = epdc.duty_id
  join questions q on q.category_id = epdc.category_id
),
answer_detail as (
  select
    qa.question_id,
    coalesce(qa.is_active, true) as is_active,
    round(coalesce(qa.std_score, 0))::int as std_i,
    round(coalesce(qa.reel_score, 0))::int as reel_i,
    lower(trim(coalesce(qa.level::text, ''))) as lvl,
    trim(coalesce(qa.text, '')) as text_tr,
    trim(coalesce(qa.text_fr, '')) as text_fr
  from question_answers qa
),
flags as (
  select
    aq.period_name,
    aq.kaynak,
    aq.duty_name,
    aq.question_id,
    count(*) filter (where ad.is_active) as active_total,
    count(*) filter (
      where ad.is_active
        and not (
          ad.lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
          or ad.text_tr ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
          or ad.text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
        )
    ) as perf_count,
    count(distinct ad.std_i) filter (
      where ad.is_active
        and ad.std_i in (5, 3, 1, 0)
        and ad.std_i = ad.reel_i
        and not (
          ad.lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
          or ad.text_tr ~* 'fikrim\s*yok|bilgim\s*yok'
          or ad.text_fr ~* 'je\s+ne\s+sais'
        )
    ) as perf_distinct_scores,
    count(*) filter (
      where ad.is_active
        and (
          ad.lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
          or ad.text_tr ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
          or ad.text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
        )
    ) as no_info_count
  from all_questions aq
  left join answer_detail ad on ad.question_id = aq.question_id
  group by aq.period_name, aq.kaynak, aq.duty_name, aq.question_id
)
-- Özet
select
  kaynak,
  count(*) as soru_sayisi,
  count(*) filter (
    where active_total = 5 and perf_distinct_scores = 4 and no_info_count = 1
  ) as tam_uyum_5_sik,
  count(*) filter (where active_total < 5 or no_info_count < 1) as eksik,
  count(*) filter (where active_total > 5) as fazla_sik,
  count(*) filter (
    where active_total >= 4 and perf_distinct_scores < 4 and no_info_count >= 1
  ) as perf_eksik_no_info_var
from flags
group by kaynak
order by kaynak;

-- Hatalı / şüpheli sorular (ilk 100)
select
  period_name,
  kaynak,
  duty_name,
  question_id,
  active_total,
  perf_distinct_scores as perf_5_3_1_0_sayisi,
  no_info_count,
  case
    when active_total = 5 and perf_distinct_scores = 4 and no_info_count = 1 then 'OK'
    when active_total > 5 then 'FAZLA_SIK'
    when no_info_count = 0 then 'BILGIM_YOK_YOK'
    when perf_distinct_scores < 4 then 'PERF_5_3_1_0_EKSIK'
    when active_total < 5 then 'TOPLAM_EKSIK'
    else 'DIGER'
  end as durum
from flags
where not (active_total = 5 and perf_distinct_scores = 4 and no_info_count = 1)
order by kaynak, durum, period_name, duty_name nulls first
limit 100;
