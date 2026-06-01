-- Tüm dönem soruları: 4 şık = 5, 3, 1 + TEK «Bilgim yok» (Fikrim yok kaldırılır / birleştirilir)
-- Snapshot eski satırları kapatılır — Ender vb. formlarda 5 şık sorunu
-- Supabase: TÜM dosyayı Run → sonra audit-duplicate-fikrim-bilgim-by-category.sql

drop table if exists _fix_pq;
drop table if exists _fix_periods;

create temp table _fix_periods as
select id as period_id from evaluation_periods where status = 'active';

create temp table _fix_pq as
select distinct question_id
from (
  select epq.question_id
  from _fix_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select epdq.question_id
  from _fix_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select q.id
  from _fix_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
) x;

-- ========== 1) CANLI: çift no_info — Bilgim yok kalır ==========
with flagged as (
  select
    qa.id,
    qa.question_id,
    coalesce(qa.sort_order, 0) as ord,
    (
      lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
      or trim(coalesce(qa.text, '')) ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok|fikrim\s*bulunmuyor'
      or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
    ) as is_no_info,
    trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok' as is_bilgim
  from question_answers qa
  where qa.question_id in (select question_id from _fix_pq)
    and coalesce(qa.is_active, true)
),
ranked_no as (
  select
    id,
    row_number() over (
      partition by question_id
      order by is_bilgim desc, ord desc, id
    ) as rn
  from flagged
  where is_no_info
),
to_off as (
  select id from ranked_no where rn > 1
  union
  select f.id
  from flagged f
  where not f.is_no_info
    and exists (
      select 1 from flagged f2
      where f2.question_id = f.question_id and f2.is_no_info
    )
    and (
      select round(coalesce(qa.std_score, 0))::int
      from question_answers qa where qa.id = f.id
    ) = 0
)
update question_answers qa
set is_active = false
where qa.id in (select id from to_off);

-- Tek no_info metni standart
update question_answers qa
set
  text = 'Bilgim yok.',
  text_fr = coalesce(nullif(trim(qa.text_fr), ''), 'Je ne sais pas.'),
  level = 'no_opinion',
  std_score = 0,
  reel_score = 0,
  sort_order = 4
where qa.question_id in (select question_id from _fix_pq)
  and coalesce(qa.is_active, true)
  and (
    lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
    or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
  );

-- Fazla performans / yinelenen 5-3-1
with flagged as (
  select
    qa.id,
    qa.question_id,
    round(coalesce(qa.std_score, 0))::int as std_i,
    coalesce(qa.sort_order, 0) as ord,
    (
      lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
      or trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
    ) as is_no_info
  from question_answers qa
  where qa.question_id in (select question_id from _fix_pq)
    and coalesce(qa.is_active, true)
),
ranked as (
  select
    id,
    row_number() over (
      partition by question_id,
      case
        when is_no_info then 'no'
        when std_i in (5, 3, 1) then 'p' || std_i::text
        else 'other'
      end
      order by ord, id
    ) as rn
  from flagged
),
to_off2 as (
  select id from ranked where rn > 1
  union
  select f.id from flagged f
  where not f.is_no_info and (f.std_i = 0 or f.std_i not in (5, 3, 1))
)
update question_answers qa
set is_active = false
where qa.id in (select id from to_off2);

-- Sıra 1–4
update question_answers qa
set sort_order = case
  when round(coalesce(qa.std_score, 0)) = 5 then 1
  when round(coalesce(qa.std_score, 0)) = 3 then 2
  when round(coalesce(qa.std_score, 0)) = 1 then 3
  else 4
end
where qa.question_id in (select question_id from _fix_pq)
  and coalesce(qa.is_active, true);

-- Eksik Bilgim yok
insert into question_answers (
  id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
)
select
  gen_random_uuid(), pq.question_id, 'Bilgim yok.', 'Je ne sais pas.', 'no_opinion', 0, 0, 4, true
from _fix_pq pq
where not exists (
  select 1 from question_answers qa
  where qa.question_id = pq.question_id
    and coalesce(qa.is_active, true)
    and (
      lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion'
      or trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
    )
);

-- ========== 2) SNAPSHOT: yalnızca canlı 4 şık aktif ==========
update evaluation_period_answers_snapshot s
set is_active = false
from _fix_periods tp
where s.period_id = tp.period_id
  and s.question_id in (select question_id from _fix_pq)
  and not exists (
    select 1 from question_answers qa
    where qa.id = s.id
      and qa.question_id = s.question_id
      and coalesce(qa.is_active, true)
  );

-- Snapshot içi çift no_info (farklı id)
with snap_flag as (
  select
    s.period_id,
    s.id,
    s.question_id,
    (
      lower(trim(coalesce(s.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
      or trim(coalesce(s.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
    ) as is_no_info,
    trim(coalesce(s.text, '')) ~* 'bilgim\s*yok' as is_bilgim,
    coalesce(s.sort_order, 0) as ord
  from evaluation_period_answers_snapshot s
  join _fix_periods tp on tp.period_id = s.period_id
  where s.question_id in (select question_id from _fix_pq)
    and coalesce(s.is_active, true)
),
snap_rank as (
  select
    id,
    period_id,
    row_number() over (
      partition by period_id, question_id
      order by is_bilgim desc, ord desc, id
    ) as rn
  from snap_flag
  where is_no_info
)
update evaluation_period_answers_snapshot s
set is_active = false
from snap_rank r
where s.id = r.id and s.period_id = r.period_id and r.rn > 1;

-- Canlıdan snapshot güncelle / ekle
with period_q as (
  select tp.period_id, pq.question_id
  from _fix_pq pq
  cross join _fix_periods tp
)
update evaluation_period_answers_snapshot s
set
  is_active = true,
  sort_order = coalesce(qa.sort_order, s.sort_order),
  level = qa.level::text,
  std_score = qa.std_score,
  reel_score = qa.reel_score,
  text = qa.text,
  text_fr = qa.text_fr
from question_answers qa
join period_q pq on pq.question_id = qa.question_id
where s.period_id = pq.period_id
  and s.id = qa.id
  and coalesce(qa.is_active, true);

insert into evaluation_period_answers_snapshot (
  period_id, id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active, snapshotted_at
)
select
  tp.period_id,
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
from _fix_pq q
cross join _fix_periods tp
join question_answers qa on qa.question_id = q.question_id and coalesce(qa.is_active, true)
where not exists (
  select 1 from evaluation_period_answers_snapshot s
  where s.period_id = tp.period_id and s.id = qa.id
);

-- ========== 3) Özet ==========
select
  count(*) filter (
    where canli_aktif = 4 and perf_531 = 3 and no_info_n = 1
  ) as tamam_4_sik,
  count(*) filter (where no_info_n > 1) as cift_no_info_kalan,
  count(*) as toplam_soru
from (
  select
    pq.question_id,
    count(*) filter (where coalesce(qa.is_active, true)) as canli_aktif,
    count(*) filter (
      where coalesce(qa.is_active, true)
        and round(coalesce(qa.std_score, 0)) in (5, 3, 1)
        and trim(coalesce(qa.text, '')) !~* 'bilgim\s*yok|fikrim\s*yok'
    ) as perf_531,
    count(*) filter (
      where coalesce(qa.is_active, true)
        and trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
    ) as no_info_n
  from _fix_pq pq
  left join question_answers qa on qa.question_id = pq.question_id
  group by pq.question_id
) t;
