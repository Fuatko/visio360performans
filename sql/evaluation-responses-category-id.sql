-- Add persistent category reference to evaluation responses
-- Purpose: ensure multi-language category display stays correct even if category names change later.
-- Run in Supabase SQL Editor (public schema).

alter table public.evaluation_responses
  add column if not exists category_id uuid null;

alter table public.evaluation_responses
  add column if not exists category_source text null;

do $$
begin
  -- Optional guard: keep category_source within known values (or null).
  begin
    alter table public.evaluation_responses
      add constraint evaluation_responses_category_source_chk
      check (category_source is null or category_source in ('question_categories', 'categories'));
  exception
    when duplicate_object then
      null;
  end;
end $$;

-- Backfill existing rows from questions.category_id
update public.evaluation_responses er
set
  -- questions.category_id can be varchar in some deployments; cast safely to uuid
  category_id = case
    when q.category_id is null then null
    when q.category_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then q.category_id::uuid
    else null
  end,
  category_source = case
    -- Compare as text to avoid uuid/varchar operator mismatch
    when exists (select 1 from public.question_categories qc where qc.id::text = q.category_id::text) then 'question_categories'
    when exists (select 1 from public.categories c where c.id::text = q.category_id::text) then 'categories'
    else null
  end
from public.questions q
where
  er.category_id is null
  and er.question_id = q.id
  and q.category_id is not null;

create index if not exists evaluation_responses_category_id_idx
  on public.evaluation_responses (category_id);

create index if not exists evaluation_responses_question_id_idx
  on public.evaluation_responses (question_id);

