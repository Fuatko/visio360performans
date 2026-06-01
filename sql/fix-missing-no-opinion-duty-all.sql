-- Yan görev sorularının TAMAMI: canlı 5. şık + snapshot (genel dışı dahil)
-- Önce: sql/audit-no-opinion-full-report.sql §0–§3
-- Supabase SQL Editor → postgres

-- ─── Canlı: aktif 4 şık + no_opinion yok → ab354 şablonu ───
do $$
declare
  qid uuid;
  n_ok int := 0;
  n_fail int := 0;
begin
  for qid in
    with target_periods as (
      select id as period_id from evaluation_periods where status = 'active'
    ),
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
    select dq.question_id from duty_q dq
    where (select count(*) from question_answers qa where qa.question_id = dq.question_id and qa.is_active is not false) = 4
      and not exists (
        select 1 from question_answers qa
        where qa.question_id = dq.question_id and qa.is_active is not false
          and (trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
            or lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion')
      )
  loop
    begin
      update question_answers qa
      set is_active = true, text = 'Bilgim yok.', text_fr = 'Je ne sais pas.',
        level = 'no_opinion', std_score = 0, reel_score = 0, sort_order = 5
      where qa.question_id = qid and qa.is_active is false
        and coalesce(qa.sort_order, 0) = 5;

      if not exists (
        select 1 from question_answers qa
        where qa.question_id = qid and qa.is_active is not false
          and lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion'
      ) then
        insert into question_answers (
          id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
        ) values (
          gen_random_uuid(), qid, 'Bilgim yok.', 'Je ne sais pas.', 'no_opinion', 0, 0, 5, true
        );
      end if;
      n_ok := n_ok + 1;
    exception when others then
      n_fail := n_fail + 1;
      raise notice 'FAIL duty %: %', qid, sqlerrm;
    end;
  end loop;
  raise notice 'duty canli: ok=% fail=%', n_ok, n_fail;
end $$;

-- ─── Snapshot: eksik no_opinion satırları ───
begin;

with target_periods as (
  select id as period_id from evaluation_periods where status = 'active'
),
duty_q as (
  select distinct tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select distinct tp.period_id, q.id
  from target_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
),
inserted as (
  insert into evaluation_period_answers_snapshot (
    period_id, id, question_id, text, text_en, text_fr, level, std_score, reel_score, sort_order, is_active, snapshotted_at
  )
  select
    dq.period_id, qa.id, qa.question_id, qa.text, null::text, qa.text_fr, qa.level::text,
    qa.std_score, qa.reel_score, coalesce(qa.sort_order, 5), true, now()
  from duty_q dq
  join question_answers qa on qa.question_id = dq.question_id
  where qa.is_active is not false
    and lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion'
    and not exists (
      select 1 from evaluation_period_answers_snapshot s
      where s.period_id = dq.period_id and s.id = qa.id
    )
  returning id
)
select count(*) as duty_snapshot_eklendi from inserted;

commit;
