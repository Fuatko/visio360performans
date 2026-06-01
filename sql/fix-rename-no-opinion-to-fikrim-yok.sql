-- Aktif no_opinion metnini «Fikrim yok.» yap (Bilgim yok → Fikrim yok) — canlı + snapshot
-- Dönem soruları. Supabase: TÜM dosyayı Run

drop table if exists _fix_pq;
drop table if exists _fix_periods;

create temp table _fix_periods as
select id as period_id from evaluation_periods where status = 'active';

create temp table _fix_pq as
select distinct question_id from (
  select epq.question_id from _fix_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select epdq.question_id from _fix_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
  union
  select q.id from _fix_periods tp
  join evaluation_period_duty_categories epdc on epdc.period_id = tp.period_id and epdc.is_active = true
  join questions q on q.category_id = epdc.category_id
) x;

update question_answers qa
set
  text = 'Fikrim yok.',
  text_fr = coalesce(nullif(trim(qa.text_fr), ''), 'Je ne sais pas.'),
  level = 'no_opinion',
  std_score = 0,
  reel_score = 0
where qa.question_id in (select question_id from _fix_pq)
  and coalesce(qa.is_active, true)
  and (
    lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
    or trim(coalesce(qa.text, '')) ~* 'fikrim\s*yok|bilgim\s*yok'
  );

update evaluation_period_answers_snapshot s
set
  text = 'Fikrim yok.',
  text_fr = coalesce(nullif(trim(s.text_fr), ''), 'Je ne sais pas.'),
  level = 'no_opinion',
  std_score = 0,
  reel_score = 0
from _fix_periods tp
where s.period_id = tp.period_id
  and s.question_id in (select question_id from _fix_pq)
  and coalesce(s.is_active, true)
  and (
    lower(trim(coalesce(s.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
    or trim(coalesce(s.text, '')) ~* 'fikrim\s*yok|bilgim\s*yok'
  );

select
  count(*) filter (where trim(coalesce(qa.text, '')) ilike 'Fikrim yok%') as canli_fikrim,
  count(*) filter (where trim(coalesce(qa.text, '')) ilike 'Bilgim yok%') as canli_bilgim_kalan
from question_answers qa
where qa.question_id in (select question_id from _fix_pq)
  and coalesce(qa.is_active, true)
  and (
    lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion'
    or trim(coalesce(qa.text, '')) ~* 'fikrim\s*yok|bilgim\s*yok'
  );
