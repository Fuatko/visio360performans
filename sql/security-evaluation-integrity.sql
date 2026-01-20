-- KVKK / Data integrity hardening for evaluation flows (idempotent)
-- Goal: prevent duplicate rows and make upsert targets reliable.
-- Safe to re-run. If duplicates exist, script keeps the newest row and deletes older duplicates.

-- 1) Ensure expected columns exist (some older schemas may miss them)
alter table public.evaluation_responses
  add column if not exists question_id uuid;

alter table public.evaluation_responses
  add column if not exists answer_ids uuid[];

alter table public.otp_codes
  add column if not exists code_hash text;

-- 2) De-duplicate evaluation_responses by (assignment_id, question_id)
do $$
begin
  if to_regclass('public.evaluation_responses') is not null then
    -- Delete older duplicates, keep newest by created_at (or id fallback)
    with ranked as (
      select
        id,
        row_number() over (
          partition by assignment_id, question_id
          order by created_at desc nulls last, id desc
        ) as rn
      from public.evaluation_responses
      where assignment_id is not null and question_id is not null
    )
    delete from public.evaluation_responses r
    using ranked x
    where r.id = x.id and x.rn > 1;
  end if;
end $$;

-- 3) Unique index for upsert target (assignment_id, question_id)
create unique index if not exists evaluation_responses_assignment_question_uidx
  on public.evaluation_responses (assignment_id, question_id);

create index if not exists evaluation_responses_assignment_id_idx
  on public.evaluation_responses (assignment_id);

-- 4) De-duplicate international_standard_scores by (assignment_id, standard_id)
do $$
begin
  if to_regclass('public.international_standard_scores') is not null then
    with ranked as (
      select
        id,
        row_number() over (
          partition by assignment_id, standard_id
          order by created_at desc nulls last, id desc
        ) as rn
      from public.international_standard_scores
      where assignment_id is not null and standard_id is not null
    )
    delete from public.international_standard_scores s
    using ranked x
    where s.id = x.id and x.rn > 1;
  end if;
end $$;

create unique index if not exists international_standard_scores_assignment_standard_uidx
  on public.international_standard_scores (assignment_id, standard_id);

create index if not exists international_standard_scores_assignment_id_idx
  on public.international_standard_scores (assignment_id);

