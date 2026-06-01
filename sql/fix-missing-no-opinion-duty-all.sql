-- Yan görev: canlı 5. şık + TÜM cevapları snapshot’a (snap_active=0 sorununu çözer)
-- Önce audit §3 çıktısı alındıysa bunu çalıştırın → sonra audit tekrar
-- Supabase SQL Editor → postgres

-- ═══ 1) CANLI: eksik 5. şık (aktif < 5 veya aktif no_opinion yok) ═══
do $$
declare
  qid uuid;
  active_n int;
  n_ok int := 0;
  n_skip int := 0;
  n_fail int := 0;
  n_no_answers int := 0;
begin
  for qid in
    with target_periods as (select id as period_id from evaluation_periods where status = 'active'),
    duty_q as (
      select distinct epdq.question_id
      from target_periods tp
      join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
      union
      select distinct q.id
      from target_periods tp
      join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
      join questions q on q.category_id = epdc.category_id
    )
    select question_id from duty_q
  loop
    select count(*) into active_n
    from question_answers qa
    where qa.question_id = qid and qa.is_active is not false;

    if active_n = 0 then
      n_no_answers := n_no_answers + 1;
      raise notice 'ATLA (cevap yok): %', qid;
      continue;
    end if;

    if active_n >= 5 and exists (
      select 1 from question_answers qa
      where qa.question_id = qid and qa.is_active is not false
        and (trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
          or lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion')
    ) then
      n_skip := n_skip + 1;
      continue;
    end if;

    begin
      update question_answers qa
      set is_active = true, text = 'Bilgim yok.', text_fr = 'Je ne sais pas.',
        level = 'no_opinion', std_score = 0, reel_score = 0, sort_order = 5
      where qa.id = (
        select qa2.id from question_answers qa2
        where qa2.question_id = qid and qa2.is_active is false
        order by coalesce(qa2.sort_order, 0) desc, qa2.id limit 1
      );

      if not exists (
        select 1 from question_answers qa
        where qa.question_id = qid and qa.is_active is not false
          and (trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
            or lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion')
      ) then
        insert into question_answers (
          id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
        ) values (
          gen_random_uuid(), qid, 'Bilgim yok.', 'Je ne sais pas.', 'no_opinion', 0, 0, 5, true
        );
      end if;
      n_ok := n_ok + 1;
    exception when others then
      begin
        insert into question_answers (
          id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
        ) values (
          gen_random_uuid(), qid, 'Bilgim yok.', 'Je ne sais pas.', 'no_opinion', 0, 0, 5, true
        );
        n_ok := n_ok + 1;
      exception when others then
        n_fail := n_fail + 1;
        raise notice 'FAIL canli %: %', qid, sqlerrm;
      end;
    end;
  end loop;
  raise notice 'canli: ok=% skip=% fail=% cevap_yok=%', n_ok, n_skip, n_fail, n_no_answers;
end $$;

-- ═══ 2) SNAPSHOT: yan görev sorularının TÜM aktif cevapları (sadece no_opinion değil) ═══
begin;

with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
duty_q as (
  select distinct tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct tp.period_id, q.id as question_id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
),
inserted_all as (
  insert into evaluation_period_answers_snapshot (
    period_id, id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active, snapshotted_at
  )
  select
    dq.period_id,
    qa.id,
    qa.question_id,
    qa.text,
    null::text,
    qa.text_fr,
    qa.level::text,
    qa.std_score,
    qa.reel_score,
    coalesce(qa.sort_order, 0),
    coalesce(qa.is_active, true),
    now()
  from duty_q dq
  join question_answers qa on qa.question_id = dq.question_id
  where qa.is_active is not false
    and not exists (
      select 1 from evaluation_period_answers_snapshot s
      where s.period_id = dq.period_id and s.id = qa.id
    )
  returning id
)
select count(*) as snapshot_satir_eklendi from inserted_all;

commit;

-- ═══ 3) Hızlı özet (yan görev) ═══
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
  select
    count(*) filter (where qa.is_active is not false) as live,
    count(*) filter (
      where qa.is_active is not false
        and (trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
          or lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion')
    ) as no_info
  from question_answers qa where qa.question_id = dq.question_id
) l on true
left join lateral (
  select
    count(*) filter (where coalesce(s.is_active, true)) as snap,
    count(*) filter (
      where coalesce(s.is_active, true)
        and (trim(coalesce(s.text, '')) ilike 'Bilgim yok%'
          or lower(trim(coalesce(s.level::text, ''))) = 'no_opinion')
    ) as no_info
  from evaluation_period_answers_snapshot s
  where s.period_id = dq.period_id and s.question_id = dq.question_id
) s on true;
