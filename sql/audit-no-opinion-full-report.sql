-- TÜM SORULAR: GENEL + YAN GÖREV (kategori + doğrudan bağlantı)
-- İş kuralı: 4 şık = 5,3,1 (iyi-orta-zayıf) + Bilgim yok. Bkz. docs/cevap-olcegi-is-kurali.md
-- Supabase SQL Editor → postgres → TAMAMINI çalıştırın

-- ─── 0) Kapsam sayıları (genel vs yan görev) ───
with target_periods as (
  select id as period_id, name as period_name
  from evaluation_periods
  where status = 'active'
),
genel_q as (
  select distinct tp.period_id, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
),
duty_direct as (
  select distinct tp.period_id, epdq.duty_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
duty_via_cat as (
  select distinct tp.period_id, epdc.duty_id, q.id as question_id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
),
duty_all as (
  select period_id, duty_id, question_id from duty_direct
  union
  select period_id, duty_id, question_id from duty_via_cat
)
select
  (select count(*) from genel_q) as genel_soru_sayisi,
  (select count(distinct (period_id, question_id)) from duty_all) as yan_gorev_benzersiz_soru,
  (select count(*) from duty_all) as yan_gorev_baglanti_satiri,
  (select count(distinct d.question_id)
   from duty_all d
   where not exists (
     select 1 from genel_q g where g.period_id = d.period_id and g.question_id = d.question_id
   )) as yan_gorev_sadece_soru;

-- ─── 1) ÖZET: kaynak bazında (genel / yan_gorev) ───
with target_periods as (
  select id as period_id, name as period_name
  from evaluation_periods
  where status = 'active'
),
genel_questions as (
  select tp.period_id, tp.period_name, null::uuid as duty_id, null::text as duty_name, null::text as duty_code,
    epq.question_id, 'genel' as kaynak
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
),
duty_direct as (
  select tp.period_id, tp.period_name, d.id as duty_id, d.name as duty_name, d.code as duty_code,
    epdq.question_id, 'yan_gorev' as kaynak
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  join evaluation_duties d on d.id = epdq.duty_id
),
duty_via_cat as (
  select tp.period_id, tp.period_name, d.id as duty_id, d.name as duty_name, d.code as duty_code,
    q.id as question_id, 'yan_gorev' as kaynak
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join evaluation_duties d on d.id = epdc.duty_id
  join questions q on q.category_id = epdc.category_id
),
period_questions as (
  select * from genel_questions
  union
  select * from duty_direct
  union
  select * from duty_via_cat
),
live_flags as (
  select
    qa.question_id,
    count(*) filter (where qa.is_active is not false) as live_active,
    count(*) filter (
      where qa.is_active is not false
        and (
          lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
          or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok|bilgi\s*yok'
          or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
        )
    ) as live_no_info
  from question_answers qa
  group by qa.question_id
),
snap_flags as (
  select
    s.period_id,
    s.question_id,
    count(*) filter (where coalesce(s.is_active, true)) as snap_active,
    count(*) filter (
      where coalesce(s.is_active, true)
        and (
          lower(trim(coalesce(s.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
          or trim(coalesce(s.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok|bilgi\s*yok'
          or trim(coalesce(s.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
        )
    ) as snap_no_info
  from evaluation_period_answers_snapshot s
  join target_periods tp on tp.period_id = s.period_id
  group by s.period_id, s.question_id
),
per_question as (
  select
    pq.period_name,
    pq.kaynak,
    pq.duty_name,
    pq.duty_code,
    pq.question_id,
    coalesce(lf.live_active, 0) as live_active,
    coalesce(lf.live_no_info, 0) as live_no_info,
    coalesce(sf.snap_active, 0) as snap_active,
    coalesce(sf.snap_no_info, 0) as snap_no_info,
    case
      when coalesce(lf.live_active, 0) = 4 and coalesce(lf.live_no_info, 0) >= 1
       and coalesce(sf.snap_active, 0) = 4 and coalesce(sf.snap_no_info, 0) >= 1
        then 'OK'
      when coalesce(lf.live_active, 0) >= 5 and coalesce(lf.live_no_info, 0) >= 1
       and coalesce(sf.snap_active, 0) >= 5 and coalesce(sf.snap_no_info, 0) >= 1
        then 'UYARI_5_sik'
      when coalesce(lf.live_active, 0) < 4 then 'HATA_canli_eksik_sik'
      when coalesce(lf.live_no_info, 0) < 1 then 'HATA_canli_bilgim_yok_yok'
      when coalesce(sf.snap_active, 0) < 4 then 'HATA_snapshot_eksik_sik'
      when coalesce(sf.snap_no_info, 0) < 1 then 'HATA_snapshot_bilgim_yok_yok'
      else 'HATA_diger'
    end as durum
  from period_questions pq
  left join live_flags lf on lf.question_id = pq.question_id
  left join snap_flags sf on sf.period_id = pq.period_id and sf.question_id = pq.question_id
)
select
  kaynak,
  count(*) as toplam_satir,
  count(distinct question_id) as benzersiz_soru,
  count(*) filter (where durum = 'OK') as tamam,
  count(*) filter (where durum <> 'OK') as hatali,
  round(100.0 * count(*) filter (where durum = 'OK') / nullif(count(*), 0), 1) as tamam_yuzde
from per_question
group by kaynak
order by kaynak;

-- ─── 2) ÖZET: yan görev paketi (zümre, kulüp, …) ───
with target_periods as (
  select id as period_id, name as period_name from evaluation_periods where status = 'active'
),
duty_direct as (
  select tp.period_id, tp.period_name, d.id as duty_id, d.name as duty_name, d.code as duty_code, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  join evaluation_duties d on d.id = epdq.duty_id
),
duty_via_cat as (
  select tp.period_id, tp.period_name, d.id as duty_id, d.name as duty_name, d.code as duty_code,
    q.id as question_id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join evaluation_duties d on d.id = epdc.duty_id
  join questions q on q.category_id = epdc.category_id
),
period_questions as (
  select period_id, period_name, duty_id, duty_name, duty_code, question_id from duty_direct
  union
  select period_id, period_name, duty_id, duty_name, duty_code, question_id from duty_via_cat
),
live_flags as (
  select qa.question_id,
    count(*) filter (where qa.is_active is not false) as live_active,
    count(*) filter (
      where qa.is_active is not false
        and (lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
          or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
          or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais')
    ) as live_no_info
  from question_answers qa group by qa.question_id
),
snap_flags as (
  select s.period_id, s.question_id,
    count(*) filter (where coalesce(s.is_active, true)) as snap_active,
    count(*) filter (
      where coalesce(s.is_active, true)
        and (lower(trim(coalesce(s.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
          or trim(coalesce(s.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
          or trim(coalesce(s.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis')
    ) as snap_no_info
  from evaluation_period_answers_snapshot s
  join target_periods tp on tp.period_id = s.period_id
  group by s.period_id, s.question_id
),
per_question as (
  select pq.period_name, pq.duty_name, pq.duty_code, pq.question_id,
    coalesce(lf.live_active, 0) as live_active, coalesce(lf.live_no_info, 0) as live_no_info,
    coalesce(sf.snap_active, 0) as snap_active, coalesce(sf.snap_no_info, 0) as snap_no_info,
    case
      when coalesce(lf.live_active, 0) = 4 and coalesce(lf.live_no_info, 0) >= 1
       and coalesce(sf.snap_active, 0) = 4 and coalesce(sf.snap_no_info, 0) >= 1 then 'OK'
      when coalesce(lf.live_active, 0) >= 5 and coalesce(lf.live_no_info, 0) >= 1
       and coalesce(sf.snap_active, 0) >= 5 and coalesce(sf.snap_no_info, 0) >= 1 then 'UYARI_5_sik'
      else 'HATA'
    end as durum
  from period_questions pq
  left join live_flags lf on lf.question_id = pq.question_id
  left join snap_flags sf on sf.period_id = pq.period_id and sf.question_id = pq.question_id
)
select
  period_name,
  duty_name,
  duty_code,
  count(distinct question_id) as soru_sayisi,
  count(*) filter (where durum in ('OK', 'UYARI_5_sik')) as tamam,
  count(*) filter (where durum <> 'OK') as hatali
from per_question
group by period_name, duty_name, duty_code
order by hatali desc, period_name, duty_name;

-- ─── 3) HATALI SATIRLAR (genel + yan görev) ───
with target_periods as (
  select id as period_id, name as period_name from evaluation_periods where status = 'active'
),
genel_questions as (
  select tp.period_id, tp.period_name, null::uuid as duty_id, null::text as duty_name, null::text as duty_code,
    epq.question_id, 'genel' as kaynak
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
),
duty_direct as (
  select tp.period_id, tp.period_name, d.id as duty_id, d.name as duty_name, d.code as duty_code,
    epdq.question_id, 'yan_gorev' as kaynak
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  join evaluation_duties d on d.id = epdq.duty_id
),
duty_via_cat as (
  select tp.period_id, tp.period_name, d.id as duty_id, d.name as duty_name, d.code as duty_code,
    q.id as question_id, 'yan_gorev' as kaynak
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join evaluation_duties d on d.id = epdc.duty_id
  join questions q on q.category_id = epdc.category_id
),
period_questions as (
  select period_id, period_name, duty_id, duty_name, duty_code, question_id, kaynak from genel_questions
  union all select period_id, period_name, duty_id, duty_name, duty_code, question_id, kaynak from duty_direct
  union all select period_id, period_name, duty_id, duty_name, duty_code, question_id, kaynak from duty_via_cat
),
live_flags as (
  select qa.question_id,
    count(*) filter (where qa.is_active is not false) as live_active,
    count(*) filter (
      where qa.is_active is not false
        and (lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
          or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok|bilgi\s*yok'
          or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis')
    ) as live_no_info
  from question_answers qa group by qa.question_id
),
snap_flags as (
  select s.period_id, s.question_id,
    count(*) filter (where coalesce(s.is_active, true)) as snap_active,
    count(*) filter (
      where coalesce(s.is_active, true)
        and (lower(trim(coalesce(s.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
          or trim(coalesce(s.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok|bilgi\s*yok'
          or trim(coalesce(s.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis')
    ) as snap_no_info
  from evaluation_period_answers_snapshot s
  join target_periods tp on tp.period_id = s.period_id
  group by s.period_id, s.question_id
),
per_question as (
  select pq.period_name, pq.kaynak, pq.duty_name, pq.duty_code, pq.question_id,
    coalesce(lf.live_active, 0) as live_active, coalesce(lf.live_no_info, 0) as live_no_info,
    coalesce(sf.snap_active, 0) as snap_active, coalesce(sf.snap_no_info, 0) as snap_no_info,
    case
      when coalesce(lf.live_active, 0) = 4 and coalesce(lf.live_no_info, 0) >= 1
       and coalesce(sf.snap_active, 0) = 4 and coalesce(sf.snap_no_info, 0) >= 1 then 'OK'
      when coalesce(lf.live_active, 0) >= 5 and coalesce(lf.live_no_info, 0) >= 1
       and coalesce(sf.snap_active, 0) >= 5 and coalesce(sf.snap_no_info, 0) >= 1 then 'UYARI_5_sik'
      when coalesce(lf.live_active, 0) < 4 then 'HATA_canli_eksik_sik'
      when coalesce(lf.live_no_info, 0) < 1 then 'HATA_canli_bilgim_yok_yok'
      when coalesce(sf.snap_active, 0) < 4 then 'HATA_snapshot_eksik_sik'
      when coalesce(sf.snap_no_info, 0) < 1 then 'HATA_snapshot_bilgim_yok_yok'
      else 'HATA_diger'
    end as durum
  from period_questions pq
  left join live_flags lf on lf.question_id = pq.question_id
  left join snap_flags sf on sf.period_id = pq.period_id and sf.question_id = pq.question_id
)
select period_name, kaynak, duty_name, duty_code, question_id,
  live_active, live_no_info, snap_active, snap_no_info, durum
from per_question
where durum <> 'OK'
order by kaynak, duty_name nulls first, durum, question_id
limit 300;
