-- TÜM SORULAR — canlı + snapshot «Bilgim yok» denetimi (salt okunur)
-- Supabase SQL Editor → postgres → TAMAMINI çalıştırın
-- Sonuç: özet satırı + yalnızca HATALI sorular (boş tablo = her şey tamam)

-- ─── 1) ÖZET ───
with target_periods as (
  select id as period_id, name as period_name
  from evaluation_periods
  where status = 'active'
),
period_questions as (
  select tp.period_id, tp.period_name, epq.question_id, 'genel' as kaynak
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union all
  select tp.period_id, tp.period_name, epdq.question_id, 'duty' as kaynak
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
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
    pq.question_id,
    coalesce(lf.live_active, 0) as live_active,
    coalesce(lf.live_no_info, 0) as live_no_info,
    coalesce(sf.snap_active, 0) as snap_active,
    coalesce(sf.snap_no_info, 0) as snap_no_info,
    case
      when coalesce(lf.live_active, 0) >= 5 and coalesce(lf.live_no_info, 0) >= 1
       and coalesce(sf.snap_active, 0) >= 5 and coalesce(sf.snap_no_info, 0) >= 1
        then 'OK'
      when coalesce(lf.live_active, 0) < 5 then 'HATA_canli_eksik_sik'
      when coalesce(lf.live_no_info, 0) < 1 then 'HATA_canli_bilgim_yok_yok'
      when coalesce(sf.snap_active, 0) < 5 then 'HATA_snapshot_eksik_sik'
      when coalesce(sf.snap_no_info, 0) < 1 then 'HATA_snapshot_bilgim_yok_yok'
      else 'HATA_diger'
    end as durum
  from period_questions pq
  left join live_flags lf on lf.question_id = pq.question_id
  left join snap_flags sf on sf.period_id = pq.period_id and sf.question_id = pq.question_id
)
select
  count(*) as toplam_soru,
  count(*) filter (where durum = 'OK') as tamam,
  count(*) filter (where durum <> 'OK') as hatali,
  round(100.0 * count(*) filter (where durum = 'OK') / nullif(count(*), 0), 1) as tamam_yuzde
from per_question;

-- ─── 2) HATALI SORULAR (boş = launch OK) ───
with target_periods as (
  select id as period_id, name as period_name
  from evaluation_periods
  where status = 'active'
),
period_questions as (
  select tp.period_id, tp.period_name, epq.question_id, 'genel' as kaynak
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union all
  select tp.period_id, tp.period_name, epdq.question_id, 'duty' as kaynak
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
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
    pq.question_id,
    coalesce(lf.live_active, 0) as live_active,
    coalesce(lf.live_no_info, 0) as live_no_info,
    coalesce(sf.snap_active, 0) as snap_active,
    coalesce(sf.snap_no_info, 0) as snap_no_info,
    case
      when coalesce(lf.live_active, 0) >= 5 and coalesce(lf.live_no_info, 0) >= 1
       and coalesce(sf.snap_active, 0) >= 5 and coalesce(sf.snap_no_info, 0) >= 1
        then 'OK'
      when coalesce(lf.live_active, 0) < 5 then 'HATA_canli_eksik_sik'
      when coalesce(lf.live_no_info, 0) < 1 then 'HATA_canli_bilgim_yok_yok'
      when coalesce(sf.snap_active, 0) < 5 then 'HATA_snapshot_eksik_sik'
      when coalesce(sf.snap_no_info, 0) < 1 then 'HATA_snapshot_bilgim_yok_yok'
      else 'HATA_diger'
    end as durum
  from period_questions pq
  left join live_flags lf on lf.question_id = pq.question_id
  left join snap_flags sf on sf.period_id = pq.period_id and sf.question_id = pq.question_id
)
select period_name, kaynak, question_id, live_active, live_no_info, snap_active, snap_no_info, durum
from per_question
where durum <> 'OK'
order by durum, period_name, kaynak, question_id
limit 200;
