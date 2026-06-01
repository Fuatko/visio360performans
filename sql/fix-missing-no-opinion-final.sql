-- KESİN DÜZELTME v2 — ab354 şablonu: sort_order=5, level=no_opinion
-- 16 soruda genelde 5,3,1,0 vardır; ikinci std_score=0 unique hatası olabilir → pasif satır aç / NULL dene

-- A) Kısıtlar
select conname, pg_get_constraintdef(c.oid) as tanim
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public' and t.relname = 'question_answers';

-- B) Örnek takılı soru — satırları (0135c890)
select id, is_active, sort_order, level::text, left(text, 30) as text_tr, std_score, reel_score
from question_answers
where question_id = '0135c890-0803-46e9-9c34-797857df8073'
order by sort_order nulls last;

-- C) ab354 şablon (sort_order 5, no_opinion)
select id, sort_order, level::text, text, text_fr, std_score, reel_score
from question_answers
where question_id = 'ab354f7a-108a-4d5a-bb65-a6d7c6dc15f3'
  and lower(trim(coalesce(level::text, ''))) = 'no_opinion'
order by sort_order desc
limit 1;

do $$
declare
  qids uuid[] := array[
    '0135c890-0803-46e9-9c34-797857df8073',
    '0498193e-ab43-4862-ae27-8707cca6cc4d',
    '09c4b0ed-1b9e-44cb-909a-d0749950557b',
    '299b8cd9-b131-495a-b98e-3ac08ca59e33',
    '567de0ad-8cfe-4d4e-b272-5b37d78b3ea6',
    '6023366f-af17-41d5-a8c1-c493f4a62b33',
    '7744ca7d-ec90-4a0f-93b2-c4a0ea516efb',
    '80aa6938-c901-4616-8286-e08c3824a2c2',
    '80c0859b-c85d-48b6-8972-6a903fa31a68',
    '89c8ce93-68c6-4a3d-a7b9-22e5908cbda9',
    '8a563fb2-5087-4201-be91-5cdcc6876a88',
    '8e476597-ee0d-4aaa-ae08-14c32b1dcf11',
    'bf59369c-1ef4-4620-b323-f150382856ff',
    'dad3b8d6-9f2f-4c5f-9c31-17a591b92cfc',
    'eb263094-7edf-4e73-ac3e-4002f7a5d380',
    'f570d48e-8e3d-458c-858f-7d6593f5c4c3'
  ];
  qid uuid;
  new_id uuid;
  active_n int;
  total_n int;
  std_nullable boolean;
  n_ok int := 0;
  n_skip int := 0;
  n_fail int := 0;
begin
  select c.is_nullable = 'YES'
  into std_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'question_answers'
    and c.column_name = 'std_score';

  foreach qid in array qids loop
    begin
      select
        count(*) filter (where qa.is_active is not false),
        count(*)
      into active_n, total_n
      from question_answers qa
      where qa.question_id = qid;

      if active_n >= 5 then
        n_skip := n_skip + 1;
        continue;
      end if;

      -- 1) Pasif / false / text-false satırı aç (sort_order büyük olan)
      update question_answers qa
      set
        is_active = true,
        text = 'Bilgim yok.',
        text_fr = 'Je ne sais pas.',
        level = 'no_opinion',
        std_score = 0,
        reel_score = 0,
        sort_order = 5
      where qa.id = (
        select qa2.id
        from question_answers qa2
        where qa2.question_id = qid
          and (
            qa2.is_active is false
            or lower(trim(coalesce(qa2.is_active::text, 'true'))) in ('false', '0', 'no')
          )
        order by coalesce(qa2.sort_order, 0) desc, qa2.id
        limit 1
      );

      select count(*) into active_n
      from question_answers qa
      where qa.question_id = qid and qa.is_active is not false;

      if active_n >= 5 then
        n_ok := n_ok + 1;
        raise notice 'OK % (pasif acildi)', qid;
        continue;
      end if;

      -- 2) Zaten no_opinion pasif değil ama aktif no_info var mı?
      if exists (
        select 1 from question_answers qa
        where qa.question_id = qid
          and qa.is_active is not false
          and lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion'
      ) then
        n_skip := n_skip + 1;
        continue;
      end if;

      -- 3) INSERT sort_order=5 (ab354 ile aynı)
      begin
        insert into question_answers (
          id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
        )
        values (
          gen_random_uuid(), qid,
          'Bilgim yok.', 'Je ne sais pas.', 'no_opinion',
          0, 0, 5, true
        )
        returning id into new_id;
        n_ok := n_ok + 1;
        raise notice 'OK % insert 0/0 sort=5 -> %', qid, new_id;
      exception
        when unique_violation then
          if std_nullable then
            insert into question_answers (
              id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
            )
            values (
              gen_random_uuid(), qid,
              'Bilgim yok.', 'Je ne sais pas.', 'no_opinion',
              null, null, 5, true
            )
            returning id into new_id;
            n_ok := n_ok + 1;
            raise notice 'OK % insert NULL score sort=5 -> %', qid, new_id;
          else
            raise;
          end if;
      end;
    exception
      when others then
        n_fail := n_fail + 1;
        raise notice 'FAIL % total=% active=% : % (%)', qid, total_n, active_n, sqlerrm, sqlstate;
    end;
  end loop;

  raise notice 'SONUC ok=% skip=% fail=%', n_ok, n_skip, n_fail;
end $$;

-- D) Doğrulama
select s.qid as question_id, count(*) filter (where qa.is_active is not false) as active_answers
from unnest(array[
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
]) as s(qid)
left join question_answers qa on qa.question_id = s.qid
group by s.qid
having count(*) filter (where qa.is_active is not false) < 5
order by active_answers, s.qid;
