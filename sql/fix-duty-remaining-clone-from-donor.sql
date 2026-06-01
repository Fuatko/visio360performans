-- Kalan yan görev soruları: aynı category_id’de 5 şıklı donor sorudan cevapları kopyala
-- Önce: diagnose-duty-remaining-12.sql (donor_soru dolu mu?)
-- Supabase SQL Editor → postgres

do $$
declare
  rec record;
  n_clone int := 0;
  n_skip int := 0;
  n_fail int := 0;
begin
  for rec in
    with target_periods as (select id as period_id from evaluation_periods where status = 'active'),
    duty_q as (
      select distinct q.id as question_id, q.category_id
      from target_periods tp
      join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
      join questions q on q.category_id = epdc.category_id
      union
      select distinct epdq.question_id, q.category_id
      from target_periods tp
      join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
      join questions q on q.id = epdq.question_id
    ),
    incomplete as (
      select dq.question_id as target_id, dq.category_id
      from duty_q dq
      where (select count(*) from question_answers qa where qa.question_id = dq.question_id and qa.is_active is not false) < 5
    ),
    donor_ranked as (
      select
        dq.category_id,
        dq.question_id as donor_id,
        count(*) filter (where qa.is_active is not false) as live_n,
        row_number() over (
          partition by dq.category_id
          order by count(*) filter (where qa.is_active is not false) desc
        ) as rn
      from duty_q dq
      join question_answers qa on qa.question_id = dq.question_id
      group by dq.category_id, dq.question_id
      having count(*) filter (where qa.is_active is not false) >= 5
        and count(*) filter (
          where qa.is_active is not false
            and (trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
              or lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion')
        ) >= 1
    ),
    pairs as (
      select i.target_id, i.category_id, dr.donor_id
      from incomplete i
      join donor_ranked dr on dr.category_id = i.category_id and dr.rn = 1
      where i.target_id <> dr.donor_id
    )
    select * from pairs
  loop
    begin
      insert into question_answers (
        id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
      )
      select
        gen_random_uuid(),
        rec.target_id,
        src.text,
        src.text_fr,
        src.level,
        src.std_score,
        src.reel_score,
        src.sort_order,
        true
      from question_answers src
      where src.question_id = rec.donor_id
        and src.is_active is not false
        and not exists (
          select 1 from question_answers tgt
          where tgt.question_id = rec.target_id
            and tgt.is_active is not false
            and coalesce(tgt.sort_order, 0) = coalesce(src.sort_order, 0)
            and round(coalesce(tgt.std_score, -1)) = round(coalesce(src.std_score, -1))
        );

      n_clone := n_clone + 1;
      raise notice 'OK clone % <- donor % (cat %)', rec.target_id, rec.donor_id, rec.category_id;
    exception when others then
      n_fail := n_fail + 1;
      raise notice 'FAIL %: %', rec.target_id, sqlerrm;
    end;
  end loop;

  raise notice 'clone: ok=% fail=%', n_clone, n_fail;
end $$;

-- Snapshot sync (kalanlar)
begin;

with target_periods as (select id as period_id from evaluation_periods where status = 'active'),
duty_q as (
  select distinct tp.period_id, q.id as question_id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
  union
  select distinct tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
ins as (
  insert into evaluation_period_answers_snapshot (
    period_id, id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active, snapshotted_at
  )
  select dq.period_id, qa.id, qa.question_id, qa.text, null::text, qa.text_fr, qa.level::text,
    qa.std_score, qa.reel_score, coalesce(qa.sort_order, 0), true, now()
  from duty_q dq
  join question_answers qa on qa.question_id = dq.question_id
  where qa.is_active is not false
    and not exists (
      select 1 from evaluation_period_answers_snapshot s
      where s.period_id = dq.period_id and s.id = qa.id
    )
  returning id
)
select count(*) as snapshot_eklendi from ins;

commit;

-- Özet (duty-all §3 ile aynı)
with target_periods as (select id as period_id from evaluation_periods where status = 'active'),
duty_q as (
  select distinct tp.period_id, q.id as question_id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
  union
  select distinct tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
)
select
  count(*) as yan_gorev_soru,
  count(*) filter (where coalesce(l.live, 0) >= 5 and coalesce(l.no_info, 0) >= 1) as canli_tamam,
  count(*) filter (where coalesce(s.snap, 0) >= 5 and coalesce(s.no_info, 0) >= 1) as snap_tamam,
  count(*) filter (where coalesce(l.live, 0) < 5 or coalesce(s.snap, 0) < 5) as hala_eksik
from duty_q dq
left join lateral (
  select count(*) filter (where qa.is_active is not false) as live,
    count(*) filter (where qa.is_active is not false and trim(coalesce(qa.text, '')) ilike 'Bilgim yok%') as no_info
  from question_answers qa where qa.question_id = dq.question_id
) l on true
left join lateral (
  select count(*) filter (where coalesce(s.is_active, true)) as snap,
    count(*) filter (where coalesce(s.is_active, true) and trim(coalesce(s.text, '')) ilike 'Bilgim yok%') as no_info
  from evaluation_period_answers_snapshot s
  where s.period_id = dq.period_id and s.question_id = dq.question_id
) s on true;
