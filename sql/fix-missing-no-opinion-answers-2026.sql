-- Eksik 5. şık: «Bilgim yok» / Je ne sais pas (4 performans şıkkı olan sorulara ekler)
-- Veri: mevcut 4 şıkkı SİLMEZ; yalnızca eksik no_opinion INSERT
-- Önce §1 önizleme → §2 (commit) → §2b → §3 (commit) → §4 doğrulama
-- §2 ve §3 AYRI transaction: snapshot hatası canlı INSERT’i geri almaz
-- Supabase SQL Editor → postgres

-- ═══════════════════════════════════════════════════════════════
-- §0 — Aktif dönemler (birden fazla active varsa §2 eskiden yalnızca 1’ini hedefliyordu)
-- ═══════════════════════════════════════════════════════════════
select id, name, status, created_at
from evaluation_periods
where status = 'active'
order by created_at desc;

-- Tek dönem sabitlemek için (isteğe bağlı):
-- and name ilike '%2026 EĞİTMEN%'

-- ═══════════════════════════════════════════════════════════════
-- §1 — ÖNİZLEME: kaç soruya 5. şık eklenecek?
-- ═══════════════════════════════════════════════════════════════
with target_periods as (
  select id as period_id, name as period_name
  from evaluation_periods
  where status = 'active'
),
period_questions as (
  select tp.period_id, tp.period_name, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select tp.period_id, tp.period_name, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
answer_flags as (
  select
    pq.period_id,
    pq.period_name,
    pq.question_id,
    qa.id as answer_id,
    coalesce(qa.is_active, true) as is_active,
    round(coalesce(qa.std_score, 0))::int as std_i,
    round(coalesce(qa.reel_score, 0))::int as reel_i,
    lower(trim(coalesce(qa.level::text, ''))) as lvl,
    trim(coalesce(qa.text, '')) as text_tr,
    trim(coalesce(qa.text_fr, '')) as text_fr,
    coalesce(qa.sort_order, 0) as ord
  from period_questions pq
  join question_answers qa on qa.question_id = pq.question_id
),
per_question as (
  select
    period_id,
    period_name,
    question_id,
    count(*) filter (where is_active) as active_count,
    count(*) filter (
      where is_active
        and std_i in (5, 3, 1, 0)
        and std_i = reel_i
    ) as perf_count,
    count(distinct std_i) filter (
      where is_active and std_i in (5, 3, 1, 0) and std_i = reel_i
    ) as perf_distinct,
    count(*) filter (
      where is_active
        and (
          lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
          or text_tr ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
          or text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
        )
    ) as no_info_count,
    coalesce(max(ord) filter (where is_active), 0) as max_ord
  from answer_flags
  group by period_id, period_name, question_id
)
select
  period_name,
  count(*) as questions_to_fix,
  min(active_count) as min_answers,
  max(active_count) as max_answers
from per_question
where active_count = 4
  and no_info_count = 0
group by period_name;

-- Detay (ilk 30 soru)
with target_periods as (
  select id as period_id, name as period_name
  from evaluation_periods
  where status = 'active'
),
period_questions as (
  select tp.period_id, tp.period_name, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select tp.period_id, tp.period_name, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
answer_flags as (
  select
    pq.period_id,
    pq.period_name,
    pq.question_id,
    coalesce(qa.is_active, true) as is_active,
    round(coalesce(qa.std_score, 0))::int as std_i,
    round(coalesce(qa.reel_score, 0))::int as reel_i,
    lower(trim(coalesce(qa.level::text, ''))) as lvl,
    trim(coalesce(qa.text, '')) as text_tr,
    trim(coalesce(qa.text_fr, '')) as text_fr
  from period_questions pq
  join question_answers qa on qa.question_id = pq.question_id
),
per_question as (
  select
    period_id,
    period_name,
    question_id,
    count(*) filter (where is_active) as active_count,
    count(*) filter (where is_active and std_i in (5, 3, 1, 0) and std_i = reel_i) as perf_count,
    count(distinct std_i) filter (where is_active and std_i in (5, 3, 1, 0) and std_i = reel_i) as perf_distinct,
    count(*) filter (
      where is_active
        and (
          lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
          or text_tr ~* 'fikrim\s*yok|bilgim\s*yok'
          or text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis'
        )
    ) as no_info_count
  from answer_flags
  group by period_id, period_name, question_id
)
select period_name, question_id, active_count, perf_distinct, no_info_count
from per_question
where active_count = 4 and no_info_count = 0
order by question_id
limit 30;

-- ═══════════════════════════════════════════════════════════════
-- §1b — Neden §2 eşleşmedi? (§4’te hâlâ 4 görünen sorular)
-- ═══════════════════════════════════════════════════════════════
with target_periods as (
  select id as period_id, name as period_name
  from evaluation_periods
  where status = 'active'
),
period_questions as (
  select tp.period_id, tp.period_name, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select tp.period_id, tp.period_name, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
answer_flags as (
  select
    pq.question_id,
    coalesce(qa.is_active, true) as is_active,
    round(coalesce(qa.std_score, 0))::int as std_i,
    round(coalesce(qa.reel_score, 0))::int as reel_i,
    lower(trim(coalesce(qa.level::text, ''))) as lvl,
    trim(coalesce(qa.text, '')) as text_tr,
    trim(coalesce(qa.text_fr, '')) as text_fr
  from period_questions pq
  join question_answers qa on qa.question_id = pq.question_id
),
per_question as (
  select
    question_id,
    count(*) filter (where is_active) as active_count,
    count(*) filter (where is_active and std_i in (5, 3, 1, 0) and std_i = reel_i) as perf_count,
    count(distinct std_i) filter (
      where is_active and std_i in (5, 3, 1, 0) and std_i = reel_i
    ) as perf_distinct,
    count(*) filter (
      where is_active
        and (
          lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
          or text_tr ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
          or text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
        )
    ) as no_info_count
  from answer_flags
  group by question_id
)
select
  pq.question_id,
  pq.active_count,
  pq.perf_count,
  pq.perf_distinct,
  pq.no_info_count,
  case
    when pq.active_count <> 4 then 'skip:not_4_active'
    when pq.no_info_count > 0 then 'skip:already_has_no_info'
    else 'eligible_for_insert'
  end as fix_status
from per_question pq
where pq.active_count < 5
order by fix_status, pq.question_id;

-- ═══════════════════════════════════════════════════════════════
-- §2 — UYGULA (DO: yazılabilir tablo + level NOT NULL + tüm active dönemler)
-- Çıktı: NOTICE satırlarında insert_sayisi / hedef_tablo
-- ═══════════════════════════════════════════════════════════════
do $$
declare
  tgt text;
  qa_kind "char";
  ans_kind "char";
  has_level boolean;
  level_is_text boolean;
  level_not_null boolean;
  has_sort_order boolean;
  has_order_num boolean;
  order_col text;
  level_sql text := '';
  ins_sql text;
  n int;
begin
  select c.relkind into qa_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'question_answers';

  select c.relkind into ans_kind
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'answers';

  if qa_kind in ('r', 'p') then
    tgt := 'question_answers';
  elsif ans_kind in ('r', 'p') then
    tgt := 'answers';
  else
    raise exception 'Yazılabilir cevap tablosu bulunamadı (question_answers / answers)';
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = tgt and column_name = 'level'
  ) into has_level;

  if has_level then
    select c.data_type in ('text', 'character varying', 'varchar'), c.is_nullable = 'NO'
    into level_is_text, level_not_null
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = tgt and c.column_name = 'level';

    if level_is_text or level_not_null then
      level_sql := ', level';
    end if;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = tgt and column_name = 'sort_order'
  ) into has_sort_order;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = tgt and column_name = 'order_num'
  ) into has_order_num;

  if has_sort_order then
    order_col := 'sort_order';
  elsif has_order_num then
    order_col := 'order_num';
  else
    order_col := null;
  end if;

  ins_sql := format($q$
    with target_periods as (
      select id as period_id from evaluation_periods where status = 'active'
    ),
    period_questions as (
      select distinct epq.question_id
      from target_periods tp
      join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
      union
      select distinct epdq.question_id
      from target_periods tp
      join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
    ),
    answer_flags as (
      select
        pq.question_id,
        coalesce(qa.is_active, true) as is_active,
        lower(trim(coalesce(qa.level::text, ''))) as lvl,
        trim(coalesce(qa.text, '')) as text_tr,
        trim(coalesce(qa.text_fr, '')) as text_fr,
        coalesce(%s, 0) as ord
      from period_questions pq
      join %I qa on qa.question_id = pq.question_id
    ),
    needs_no_info as (
      select
        question_id,
        coalesce(max(ord) filter (where is_active), 4) + 1 as next_ord
      from answer_flags
      group by question_id
      having count(*) filter (where is_active) = 4
         and count(*) filter (
           where is_active
             and (
               lvl in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok')
               or text_tr ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
               or text_fr ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
             )
         ) = 0
    )
    insert into %I (
      id, question_id, text, text_fr, std_score, reel_score%s%s, is_active
    )
    select
      gen_random_uuid(),
      n.question_id,
      'Bilgim yok.',
      'Je ne sais pas.',
      0,
      0%s%s,
      true
    from needs_no_info n
    where (
      select count(*) from %I qa2
      where qa2.question_id = n.question_id and coalesce(qa2.is_active, true)
    ) = 4
    and not exists (
      select 1 from %I qa
      where qa.question_id = n.question_id
        and coalesce(qa.is_active, true)
        and (
          lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
          or trim(coalesce(qa.text, '')) ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
          or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis'
        )
    )
  $q$,
    case when order_col is not null then format('qa.%I', order_col) else '0' end,
    tgt,
    tgt,
    case when order_col is not null then format(', %I', order_col) else '' end,
    level_sql,
    case when order_col is not null then ', n.next_ord' else '' end,
    case
      when level_sql <> '' and level_is_text then ', ''no_opinion''::text'
      when level_sql <> '' and not level_is_text then ', 0'
      else ''
    end,
    tgt,
    tgt
  );

  execute ins_sql;
  get diagnostics n = row_count;
  raise notice '§2 hedef_tablo=% satir_eklendi=%', tgt, n;
  if n = 0 then
    raise notice '§2: 0 satir — §1b (eligible?) ve §0 (kac active donem?) kontrol edin; gerekirse §2-FORCE';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- §3 — Snapshot (AYRI transaction; question_answers’ta text_en olmayabilir)
-- ═══════════════════════════════════════════════════════════════
begin;

with target_periods as (
  select id as period_id
  from evaluation_periods
  where status = 'active'
),
period_questions as (
  select tp.period_id, epq.question_id
  from target_periods tp
  join evaluation_period_questions epq on epq.period_id = tp.period_id and epq.is_active = true
  union
  select tp.period_id, epdq.question_id
  from target_periods tp
  join evaluation_period_duty_questions epdq on epdq.period_id = tp.period_id and epdq.is_active = true
),
inserted_snap as (
  insert into evaluation_period_answers_snapshot (
    period_id,
    id,
    question_id,
    text,
    text_en,
    text_fr,
    level,
    std_score,
    reel_score,
    sort_order,
    is_active,
    snapshotted_at
  )
  select
    pq.period_id,
    qa.id,
    qa.question_id,
    qa.text,
    null::text,
    qa.text_fr,
    qa.level::text,
    qa.std_score,
    qa.reel_score,
    coalesce(qa.sort_order, 5),
    coalesce(qa.is_active, true),
    now()
  from period_questions pq
  join question_answers qa on qa.question_id = pq.question_id
  where coalesce(qa.is_active, true) = true
    and (
      lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
      or trim(coalesce(qa.text, '')) ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok'
      or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais|aucune\s+idée|sans\s+avis|pas\s+d''avis'
    )
    and not exists (
      select 1
      from evaluation_period_answers_snapshot s
      where s.period_id = pq.period_id
        and s.id = qa.id
    )
  returning id
)
select count(*) as rows_inserted_snapshot from inserted_snap;

commit;

-- ═══════════════════════════════════════════════════════════════
-- §4 — Doğrulama (5 şık / soru; question_answers + answers birleşik)
-- ═══════════════════════════════════════════════════════════════
with period_q as (
  select distinct epq.question_id
  from evaluation_period_questions epq
  join evaluation_periods p on p.id = epq.period_id and p.status = 'active'
  where epq.is_active = true
),
live_union as (
  select qa.id, qa.question_id, coalesce(qa.is_active, true) as is_active
  from question_answers qa
  where qa.question_id in (select question_id from period_q)
  union
  select a.id, a.question_id, true as is_active
  from answers a
  where to_regclass('public.answers') is not null
    and a.question_id in (select question_id from period_q)
)
select
  pq.question_id,
  count(distinct lu.id) filter (where lu.is_active) as live_answers
from period_q pq
left join live_union lu on lu.question_id = pq.question_id
group by pq.question_id
having count(distinct lu.id) filter (where lu.is_active) < 5
order by live_answers
limit 50;

-- ═══════════════════════════════════════════════════════════════
-- §2-FORCE — §2 sıfır satır dönerse: 21 soruya doğrudan 5. şık (tek blok)
-- ═══════════════════════════════════════════════════════════════
/*
do $$
declare tgt text := 'question_answers';
begin
  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'question_answers' and c.relkind in ('r','p')
  ) then
    tgt := 'answers';
  end if;
  execute format($f$
    insert into %I (id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active)
    select gen_random_uuid(), qid, 'Bilgim yok.', 'Je ne sais pas.', 'no_opinion', 0, 0,
      coalesce((select max(sort_order) from %I x where x.question_id = qid), 4) + 1,
      true
    from unnest(array[
      'ab354f7a-108a-4d5a-bb65-a6d7c6dc15f3'::uuid,
      '567de0ad-8cfe-4d4e-b272-5b37d78b3ea6'::uuid,
      'f570d48e-8e3d-458c-858f-7d6593f5c4c3'::uuid,
      '89c8ce93-68c6-4a3d-a7b9-22e5908cbda9'::uuid,
      '5e752a3d-f5df-455b-b4fa-1df93fc580a1'::uuid,
      'bf59369c-1ef4-4620-b323-f150382856ff'::uuid,
      '8e476597-ee0d-4aaa-ae08-14c32b1dcf11'::uuid,
      '7744ca7d-ec90-4a0f-93b2-c4a0ea516efb'::uuid,
      '9de5a286-57b6-4875-a8e8-714c4fd2f495'::uuid,
      '0135c890-0803-46e9-9c34-797857df8073'::uuid,
      'dad3b8d6-9f2f-4c5f-9c31-17a591b92cfc'::uuid,
      '6023366f-af17-41d5-a8c1-c493f4a62b33'::uuid,
      '0498193e-ab43-4862-ae27-8707cca6cc4d'::uuid,
      '7f5b610c-cbfa-43f1-9bb8-3472b3db3cca'::uuid,
      'eb263094-7edf-4e73-ac3e-4002f7a5d380'::uuid,
      '09c4b0ed-1b9e-44cb-909a-d0749950557b'::uuid,
      '299b8cd9-b131-495a-b98e-3ac08ca59e33'::uuid,
      '80aa6938-c901-4616-8286-e08c3824a2c2'::uuid,
      'd291cb24-f7ee-49be-bc73-ef29d2e73605'::uuid,
      '80c0859b-c85d-48b6-8972-6a903fa31a68'::uuid,
      '8a563fb2-5087-4201-be91-5cdcc6876a88'::uuid
    ]) as qid
    where not exists (
      select 1 from %I qa where qa.question_id = qid
        and (trim(coalesce(qa.text,'')) ~* 'bilgim\s*yok|fikrim\s*yok'
          or trim(coalesce(qa.text_fr,'')) ~* 'je\s+ne\s+sais')
    )
  $f$, tgt, tgt, tgt);
end $$;
*/
