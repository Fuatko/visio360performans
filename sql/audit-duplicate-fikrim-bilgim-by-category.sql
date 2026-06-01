-- Çift Fikrim yok + Bilgim yok / 5 şık — kategori bazlı denetim (salt okunur)
-- Supabase: TÜM dosyayı Run

drop table if exists _audit_pq;
drop table if exists _audit_flags;

create temp table _audit_pq as
with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
)
select distinct
  q.id as question_id,
  coalesce(cs.name, qc.name, '—') as kategori,
  coalesce(cs.main_category_id::text, 'genel') as kaynak_grup
from target_periods tp
join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
join questions q on q.id = epq.question_id
left join question_categories qc on qc.id = q.category_id
left join evaluation_period_categories_snapshot cs
  on cs.period_id = tp.period_id and cs.id = q.category_id
union
select distinct
  q.id,
  coalesce(cs.name, qc.name, d.name, '—'),
  coalesce(d.name, 'yan_gorev')
from target_periods tp
join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
join evaluation_duties d on d.id = epdc.duty_id
join questions q on q.category_id = epdc.category_id
left join question_categories qc on qc.id = q.category_id
left join evaluation_period_categories_snapshot cs
  on cs.period_id = tp.period_id and cs.id = q.category_id
union
select distinct
  q.id,
  coalesce(cs.name, qc.name, d.name, '—'),
  coalesce(d.name, 'yan_gorev')
from target_periods tp
join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
join evaluation_duties d on d.id = epdq.duty_id
join questions q on q.id = epdq.question_id
left join question_categories qc on qc.id = q.category_id
left join evaluation_period_categories_snapshot cs
  on cs.period_id = tp.period_id and cs.id = q.category_id;

create temp table _audit_flags as
select
  pq.kategori,
  pq.kaynak_grup,
  pq.question_id,
  count(*) filter (where coalesce(qa.is_active, true)) as canli_aktif,
  count(*) filter (
    where coalesce(qa.is_active, true)
      and round(coalesce(qa.std_score, 0)) in (5, 3, 1)
      and lower(trim(coalesce(qa.level::text, ''))) not in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
      and trim(coalesce(qa.text, '')) !~* 'bilgim\s*yok|fikrim\s*yok'
  ) as perf_531,
  count(*) filter (
    where coalesce(qa.is_active, true)
      and (
        lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
        or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok|fikrim\s*bulunmuyor'
      )
  ) as no_info_n,
  count(*) filter (
    where coalesce(qa.is_active, true)
      and trim(coalesce(qa.text, '')) ~* 'fikrim\s*yok'
  ) as fikrim_n,
  count(*) filter (
    where coalesce(qa.is_active, true)
      and trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok'
  ) as bilgim_n,
  (
    select count(*) filter (where coalesce(s.is_active, true))
    from evaluation_period_answers_snapshot s
    join evaluation_periods ep on ep.id = s.period_id and ep.status = 'active'
    where s.question_id = pq.question_id
  ) as snap_aktif
from _audit_pq pq
left join question_answers qa on qa.question_id = pq.question_id
group by pq.kategori, pq.kaynak_grup, pq.question_id;

-- 1) Kategori özeti
select
  kategori,
  count(*) as soru,
  count(*) filter (where canli_aktif = 4 and perf_531 = 3 and no_info_n = 1) as tamam,
  count(*) filter (where no_info_n > 1 or fikrim_n > 0 and bilgim_n > 0) as cift_fikrim_bilgim,
  count(*) filter (where canli_aktif > 4 or snap_aktif > 4) as bes_plus_sik,
  count(*) filter (
    where not (canli_aktif = 4 and perf_531 = 3 and no_info_n = 1)
  ) as hatali
from _audit_flags
group by kategori
order by hatali desc, kategori;

-- 2) Sorunlu sorular (ilk 50)
select
  kategori,
  kaynak_grup,
  question_id,
  canli_aktif,
  perf_531,
  no_info_n,
  fikrim_n,
  bilgim_n,
  snap_aktif,
  case
    when no_info_n > 1 or (fikrim_n > 0 and bilgim_n > 0) then 'CIFT_FIKRIM_BILGIM'
    when canli_aktif > 4 or snap_aktif > 4 then 'FAZLA_SIK'
    when canli_aktif < 4 or perf_531 < 3 or no_info_n < 1 then 'EKSIK'
    else 'DIGER'
  end as durum
from _audit_flags
where not (canli_aktif = 4 and perf_531 = 3 and no_info_n = 1)
order by durum, kategori, question_id
limit 50;
