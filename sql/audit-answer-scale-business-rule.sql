-- İş kuralı: her soruda 4 şık = 5, 3, 1 (İyi-Orta-Zayıf) + Bilgim yok (puanlamaya girmez)
-- Eski veri: 5 satır (5,3,1,0 performans + Bilgim yok) → UYARI_5_sik
-- Genel + yan görev — salt okunur
-- Tüm dosyayı tek seferde çalıştırın (2 sonuç tablosu: özet + detay)

drop table if exists _audit_scale_classified;

create temp table _audit_scale_classified as
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
is_no_info as (
  select
    ad.*,
    (
      ad.lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
      or ad.text_tr ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
      or ad.text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
    ) as no_info
  from answer_detail ad
),
flags as (
  select
    aq.period_name,
    aq.kaynak,
    aq.duty_name,
    aq.question_id,
    count(*) filter (where ni.is_active) as active_total,
    count(*) filter (where ni.is_active and not ni.no_info) as perf_count,
    count(*) filter (
      where ni.is_active and not ni.no_info and ni.std_i in (5, 3, 1) and ni.std_i = ni.reel_i
    ) as perf_531_count,
    count(*) filter (
      where ni.is_active and not ni.no_info and ni.std_i = 0 and ni.std_i = ni.reel_i
    ) as perf_0_count,
    count(*) filter (where ni.is_active and ni.no_info) as no_info_count
  from all_questions aq
  left join is_no_info ni on ni.question_id = aq.question_id
  group by aq.period_name, aq.kaynak, aq.duty_name, aq.question_id
)
select
  f.period_name,
  f.kaynak,
  f.duty_name,
  f.question_id,
  f.active_total,
  f.perf_531_count,
  f.perf_0_count,
  f.no_info_count,
  case
    when f.active_total = 4 and f.perf_531_count = 3 and f.no_info_count = 1 and f.perf_0_count = 0 then 'OK_4_sik'
    when f.active_total = 5 and f.perf_531_count >= 3 and f.no_info_count = 1 and f.perf_0_count >= 1 then 'UYARI_5_sik_ekstra_0'
    when f.no_info_count = 0 then 'BILGIM_YOK_YOK'
    when f.active_total < 4 then 'TOPLAM_EKSIK'
    when f.active_total > 5 then 'FAZLA_SIK'
    when f.perf_531_count < 3 then 'PUAN_5_3_1_EKSIK'
    else 'DIGER'
  end as durum
from flags f;

-- 1) Özet
select
  kaynak,
  count(*) as soru_sayisi,
  count(*) filter (where durum = 'OK_4_sik') as tam_4_sik,
  count(*) filter (where durum = 'UYARI_5_sik_ekstra_0') as uyari_5_sik,
  count(*) filter (where durum not in ('OK_4_sik', 'UYARI_5_sik_ekstra_0')) as hatali
from _audit_scale_classified
group by kaynak
order by kaynak;

-- 2) Hatalı / uyarılı sorular (ilk 100)
select
  period_name,
  kaynak,
  duty_name,
  question_id,
  active_total,
  perf_531_count,
  perf_0_count,
  no_info_count,
  durum
from _audit_scale_classified
where durum not in ('OK_4_sik')
order by kaynak, durum, period_name, duty_name nulls first
limit 100;
