-- Ek görev (duty) vs dönem (period) yanıt ayrımı — idempotent
-- Kıyaslama: yalnızca aynı kapsamdaki sorular birlikte ortalanır.

alter table public.evaluation_responses
  add column if not exists question_scope text;

alter table public.evaluation_responses
  add column if not exists duty_id uuid;

do $$
begin
  if to_regclass('public.evaluation_responses') is not null then
    alter table public.evaluation_responses drop constraint if exists evaluation_responses_question_scope_chk;
    alter table public.evaluation_responses
      add constraint evaluation_responses_question_scope_chk
      check (question_scope is null or question_scope in ('period', 'duty'));
  end if;
end $$;

create index if not exists evaluation_responses_scope_idx
  on public.evaluation_responses (assignment_id, question_scope);

comment on column public.evaluation_responses.question_scope is
  'period = dönem temel soruları; duty = hedefe özel ek görev soruları';
comment on column public.evaluation_responses.duty_id is
  'question_scope=duty ise evaluation_duties.id';
