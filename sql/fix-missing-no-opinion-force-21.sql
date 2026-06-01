-- Eksik 5. şık — v3 (16 soru hâlâ 4 aktif ise: A→B→C→D→E sırayla)
-- E: snapshot — fix-missing-no-opinion-answers-2026.sql §3

-- A) question_answers tablo mu view mü?
select
  c.relname,
  c.relkind,
  case c.relkind when 'r' then 'table' when 'v' then 'view' else c.relkind::text end as tur
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('question_answers', 'answers');

-- B) Takılı sorular — satır satır (pasif 5. şık var mı?)
with stuck_ids as (
  select unnest(array[
    '0135c890-0803-46e9-9c34-797857df8073'::uuid,
    '0498193e-ab43-4862-ae27-8707cca6cc4d'::uuid,
    '09c4b0ed-1b9e-44cb-909a-d0749950557b'::uuid,
    '299b8cd9-b131-495a-b98e-3ac08ca59e33'::uuid,
    '567de0ad-8cfe-4d4e-b272-5b37d78b3ea6'::uuid,
    '6023366f-af17-41d5-a8c1-c493f4a62b33'::uuid,
    '7744ca7d-ec90-4a0f-93b2-c4a0ea516efb'::uuid,
    '80aa6938-c901-4616-8286-e08c3824a2c2'::uuid,
    '80c0859b-c85d-48b6-8972-6a903fa31a68'::uuid,
    '89c8ce93-68c6-4a3d-a7b9-22e5908cbda9'::uuid,
    '8a563fb2-5087-4201-be91-5cdcc6876a88'::uuid,
    '8e476597-ee0d-4aaa-ae08-14c32b1dcf11'::uuid,
    'bf59369c-1ef4-4620-b323-f150382856ff'::uuid,
    'dad3b8d6-9f2f-4c5f-9c31-17a591b92cfc'::uuid,
    'eb263094-7edf-4e73-ac3e-4002f7a5d380'::uuid,
    'f570d48e-8e3d-458c-858f-7d6593f5c4c3'::uuid
  ]) as question_id
)
select
  qa.question_id,
  qa.id,
  coalesce(qa.is_active, true) as is_active,
  qa.sort_order,
  qa.level::text as level,
  left(trim(coalesce(qa.text, '')), 50) as text_tr,
  left(trim(coalesce(qa.text_fr, '')), 50) as text_fr,
  qa.std_score,
  qa.reel_score
from question_answers qa
join stuck_ids s on s.question_id = qa.question_id
order by qa.question_id, coalesce(qa.sort_order, 999), coalesce(qa.is_active, true) desc;

-- C) Tam 4 aktif + pasif satır var → pasifi aç (no-info öncelikli)
with active_counts as (
  select
    qa.question_id,
    count(*) filter (where coalesce(qa.is_active, true)) as active_n
  from question_answers qa
  group by qa.question_id
),
need_fix as (
  select question_id from active_counts where active_n = 4
),
pick_inactive as (
  select distinct on (qa.question_id)
    qa.id
  from question_answers qa
  join need_fix nf on nf.question_id = qa.question_id
  where not coalesce(qa.is_active, true)
  order by
    qa.question_id,
    case
      when trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok|bilgi\s*yok' then 0
      when trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée' then 0
      when lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info') then 0
      when round(coalesce(qa.std_score, -1)) = 0 and round(coalesce(qa.reel_score, -1)) = 0 then 1
      else 2
    end,
    coalesce(qa.sort_order, 0) desc,
    qa.id
)
update question_answers qa
set
  is_active = true,
  text = case
    when trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok|bilgi\s*yok' then qa.text
    when trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais' then qa.text
    else 'Bilgim yok.'
  end,
  text_fr = case
    when trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais' then qa.text_fr
    else coalesce(nullif(trim(qa.text_fr), ''), 'Je ne sais pas.')
  end
from pick_inactive p
where qa.id = p.id;

-- D) Hâlâ 4 aktif olanlara YENİ satır (sort_order = tüm satırların max+1)
do $$
declare
  tgt text := 'question_answers';
  ord_col text := 'sort_order';
  has_level boolean;
  level_is_text boolean;
  level_sql text := '';
  level_val text := '';
  n int;
begin
  if not exists (
    select 1 from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'question_answers' and c.relkind in ('r', 'p')
  ) then
    tgt := 'answers';
    ord_col := case
      when exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'answers' and column_name = 'sort_order'
      ) then 'sort_order'
      else 'order_num'
    end;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = tgt and column_name = 'level'
  ) into has_level;

  if has_level then
    select c.data_type in ('text', 'character varying', 'varchar')
    into level_is_text
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = tgt and c.column_name = 'level';

    level_sql := ', level';
    level_val := case when level_is_text then ', ''no_opinion''::text' else ', 0' end;
  end if;

  execute format($f$
    with active_counts as (
      select question_id, count(*) filter (where coalesce(is_active, true)) as active_n
      from %I
      group by question_id
    ),
    need_insert as (
      select ac.question_id
      from active_counts ac
      where ac.active_n = 4
        and not exists (
          select 1 from %I qa
          where qa.question_id = ac.question_id
            and coalesce(qa.is_active, true)
            and (
              trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok|bilgi\s*yok'
              or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée'
              or lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
            )
        )
    )
    insert into %I (id, question_id, text, text_fr, std_score, reel_score, %I, is_active%s)
    select
      gen_random_uuid(),
      ni.question_id,
      'Bilgim yok.',
      'Je ne sais pas.',
      0,
      0,
      coalesce((select max(a.%I) from %I a where a.question_id = ni.question_id), 0) + 1,
      true%s
    from need_insert ni
  $f$, tgt, tgt, tgt, ord_col, level_sql, ord_col, tgt, level_val);

  get diagnostics n = row_count;
  raise notice 'INSERT tablo=% satir=%', tgt, n;
end $$;

-- E) Doğrulama (question_answers)
with stuck_ids as (
  select unnest(array[
    '0135c890-0803-46e9-9c34-797857df8073'::uuid,
    '0498193e-ab43-4862-ae27-8707cca6cc4d'::uuid,
    '09c4b0ed-1b9e-44cb-909a-d0749950557b'::uuid,
    '299b8cd9-b131-495a-b98e-3ac08ca59e33'::uuid,
    '567de0ad-8cfe-4d4e-b272-5b37d78b3ea6'::uuid,
    '6023366f-af17-41d5-a8c1-c493f4a62b33'::uuid,
    '7744ca7d-ec90-4a0f-93b2-c4a0ea516efb'::uuid,
    '80aa6938-c901-4616-8286-e08c3824a2c2'::uuid,
    '80c0859b-c85d-48b6-8972-6a903fa31a68'::uuid,
    '89c8ce93-68c6-4a3d-a7b9-22e5908cbda9'::uuid,
    '8a563fb2-5087-4201-be91-5cdcc6876a88'::uuid,
    '8e476597-ee0d-4aaa-ae08-14c32b1dcf11'::uuid,
    'bf59369c-1ef4-4620-b323-f150382856ff'::uuid,
    'dad3b8d6-9f2f-4c5f-9c31-17a591b92cfc'::uuid,
    'eb263094-7edf-4e73-ac3e-4002f7a5d380'::uuid,
    'f570d48e-8e3d-458c-858f-7d6593f5c4c3'::uuid
  ]) as question_id
)
select s.question_id, count(*) filter (where coalesce(qa.is_active, true)) as active_answers
from stuck_ids s
left join question_answers qa on qa.question_id = s.question_id
group by s.question_id
having count(*) filter (where coalesce(qa.is_active, true)) < 5
order by active_answers, s.question_id;
