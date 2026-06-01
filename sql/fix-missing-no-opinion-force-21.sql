-- Acil: §2 sıfır satır / §4 hâlâ 4 ise — 21 soruya doğrudan 5. şık
-- Supabase SQL Editor → postgres. Sonra §3 snapshot (ana dosyadan) + §4 doğrulama.

do $$
declare
  tgt text;
  ord_col text;
  n int;
begin
  if exists (
    select 1 from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    where ns.nspname = 'public' and c.relname = 'question_answers' and c.relkind in ('r', 'p')
  ) then
    tgt := 'question_answers';
  else
    tgt := 'answers';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = tgt and column_name = 'sort_order'
  ) then
    ord_col := 'sort_order';
  else
    ord_col := 'order_num';
  end if;

  execute format($f$
    insert into %I (id, question_id, text, text_fr, level, std_score, reel_score, %I, is_active)
    select
      gen_random_uuid(),
      qid,
      'Bilgim yok.',
      'Je ne sais pas.',
      'no_opinion',
      0,
      0,
      coalesce((select max(a.%I) from %I a where a.question_id = qid), 4) + 1,
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
      select 1 from %I qa
      where qa.question_id = qid
        and (
          trim(coalesce(qa.text, '')) ~* 'bilgim\s*yok|fikrim\s*yok'
          or trim(coalesce(qa.text_fr, '')) ~* 'je\s+ne\s+sais'
        )
    )
  $f$, tgt, ord_col, ord_col, tgt, tgt);

  get diagnostics n = row_count;
  raise notice 'FORCE insert: tablo=% satir=%', tgt, n;
end $$;

-- Hızlı kontrol (tek soru)
select question_id, count(*) filter (where coalesce(is_active, true)) as n
from question_answers
where question_id = 'ab354f7a-108a-4d5a-bb65-a6d7c6dc15f3'
group by 1;
