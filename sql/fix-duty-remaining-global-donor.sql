-- Kalan 12 yan görev: önce aynı category (tüm DB), yoksa ab354 5 şık şablonu
-- diagnose-duty-remaining-12 sonrası — Supabase SQL Editor → postgres

-- Bilinen çift: Rehber 4 şık → e968412a (5 şık) — clone script bunu da kapsar

do $$
declare
  rec record;
  tpl_qid uuid := 'ab354f7a-108a-4d5a-bb65-a6d7c6dc15f3';
  n_cat int := 0;
  n_tpl int := 0;
  n_skip int := 0;
  n_fail int := 0;
begin
  -- A) Aynı category_id — tüm soru bankasında 5+ şıklı donor
  for rec in
    with target_periods as (select id as period_id from evaluation_periods where status = 'active'),
    duty_incomplete as (
      select distinct q.id as target_id, q.category_id
      from target_periods tp
      join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
      join questions q on q.category_id = epdc.category_id
      union
      select distinct q.id, q.category_id
      from target_periods tp
      join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
      join questions q on q.id = epdq.question_id
    ),
    inc as (
      select target_id, category_id
      from duty_incomplete di
      where (select count(*) from question_answers qa where qa.question_id = di.target_id and qa.is_active is not false) < 5
    ),
  donor_global as (
    select distinct on (q.category_id)
      q.category_id,
      q.id as donor_id
    from questions q
    where (select count(*) from question_answers qa where qa.question_id = q.id and qa.is_active is not false) >= 5
      and exists (
        select 1 from question_answers qa
        where qa.question_id = q.id and qa.is_active is not false
          and (trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
            or lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion')
      )
    order by q.category_id, q.id
  )
    select i.target_id, i.category_id, dg.donor_id
    from inc i
    join donor_global dg on dg.category_id = i.category_id
    where i.target_id <> dg.donor_id
  loop
    begin
      insert into question_answers (id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active)
      select gen_random_uuid(), rec.target_id, src.text, src.text_fr, src.level, src.std_score, src.reel_score,
        src.sort_order, true
      from question_answers src
      where src.question_id = rec.donor_id and src.is_active is not false
        and not exists (
          select 1 from question_answers t
          where t.question_id = rec.target_id and t.is_active is not false
            and coalesce(t.sort_order, 0) = coalesce(src.sort_order, 0)
        );
      n_cat := n_cat + 1;
      raise notice 'category clone % <- %', rec.target_id, rec.donor_id;
    exception when others then
      n_fail := n_fail + 1;
      raise notice 'FAIL cat %: %', rec.target_id, sqlerrm;
    end;
  end loop;

  -- B) Hâlâ <5: ab354 şablonundan 5 şık (metinler şablon; sort_order 1–5)
  for rec in
    with target_periods as (select id as period_id from evaluation_periods where status = 'active'),
    duty_targets as (
      select distinct q.id as target_id
      from target_periods tp
      join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
      join questions q on q.category_id = epdc.category_id
      union
      select distinct epdq.question_id
      from target_periods tp
      join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
    )
    select target_id from duty_targets dt
    where (select count(*) from question_answers qa where qa.question_id = dt.target_id and qa.is_active is not false) < 5
  loop
    begin
      insert into question_answers (id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active)
      select gen_random_uuid(), rec.target_id, src.text, src.text_fr, src.level, src.std_score, src.reel_score,
        coalesce(src.sort_order, 0), true
      from question_answers src
      where src.question_id = tpl_qid and src.is_active is not false
        and not exists (
          select 1 from question_answers t
          where t.question_id = rec.target_id and t.is_active is not false
            and coalesce(t.sort_order, 0) = coalesce(src.sort_order, 0)
        );

      if (select count(*) from question_answers qa where qa.question_id = rec.target_id and qa.is_active is not false) < 5
         and not exists (
           select 1 from question_answers qa where qa.question_id = rec.target_id and qa.is_active is not false
             and trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
         )
      then
        insert into question_answers (id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active)
        values (gen_random_uuid(), rec.target_id, 'Bilgim yok.', 'Je ne sais pas.', 'no_opinion', 0, 0, 5, true);
      end if;

      n_tpl := n_tpl + 1;
      raise notice 'template fill %', rec.target_id;
    exception when others then
      n_fail := n_fail + 1;
      raise notice 'FAIL tpl %: %', rec.target_id, sqlerrm;
    end;
  end loop;

  raise notice 'SONUC category_clone=% template_fill=% fail=%', n_cat, n_tpl, n_fail;
end $$;

-- Snapshot (tüm yan görev)
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
    and not exists (select 1 from evaluation_period_answers_snapshot s where s.period_id = dq.period_id and s.id = qa.id)
  returning id
)
select count(*) as snapshot_eklendi from ins;
commit;

-- Özet
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
  count(*) filter (where coalesce(l.live, 0) >= 5) as canli_5_plus,
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
