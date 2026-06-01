-- KESİN DÜZELTME — 16 soru hâlâ 4 aktif ise (tek blok, postgres rolü)
-- Çalıştırınca NOTICE: ok=16 fail=0 görmelisiniz. Sonra §3 snapshot.

-- 0) Ortam
select
  current_database() as db,
  current_user as db_user,
  c.relname,
  c.relkind
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('question_answers', 'answers');

-- 1) Çalışan şablon (ab354f7a — 5 şıklı soru)
select id, question_id, is_active, sort_order, level::text, text, text_fr, std_score, reel_score
from question_answers
where question_id = 'ab354f7a-108a-4d5a-bb65-a6d7c6dc15f3'
order by sort_order nulls last;

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
  tpl record;
  new_id uuid;
  active_n int;
  n_ok int := 0;
  n_skip int := 0;
  n_fail int := 0;
begin
  select qa.* into tpl
  from question_answers qa
  where qa.question_id = 'ab354f7a-108a-4d5a-bb65-a6d7c6dc15f3'
    and qa.is_active is not false
    and (
      trim(coalesce(qa.text, '')) ilike 'Bilgim yok%'
      or trim(coalesce(qa.text, '')) ilike 'Fikrim yok%'
      or trim(coalesce(qa.text_fr, '')) ilike 'Je ne sais%'
      or lower(trim(coalesce(qa.level::text, ''))) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info')
    )
  order by qa.sort_order desc nulls last
  limit 1;

  if tpl.id is null then
    tpl.text := 'Bilgim yok.';
    tpl.text_fr := 'Je ne sais pas.';
    tpl.level := 'no_opinion';
    tpl.std_score := 0;
    tpl.reel_score := 0;
    raise notice 'ab354 sablonu bulunamadi; varsayilan metin kullaniliyor';
  end if;

  foreach qid in array qids loop
    begin
      select count(*) into active_n
      from question_answers qa
      where qa.question_id = qid
        and qa.is_active is not false;

      if active_n >= 5 then
        n_skip := n_skip + 1;
        continue;
      end if;

      -- Pasif satır varsa aç (metin ne olursa olsun — tek pasif satır)
      if active_n = 4 then
        update question_answers qa
        set
          is_active = true,
          text = coalesce(nullif(trim(tpl.text), ''), 'Bilgim yok.'),
          text_fr = coalesce(nullif(trim(tpl.text_fr), ''), 'Je ne sais pas.'),
          level = tpl.level,
          std_score = tpl.std_score,
          reel_score = tpl.reel_score
        where qa.id = (
          select qa2.id
          from question_answers qa2
          where qa2.question_id = qid
            and qa2.is_active is false
          order by qa2.sort_order desc nulls last, qa2.id
          limit 1
        );

        if found then
          select count(*) into active_n
          from question_answers qa
          where qa.question_id = qid and qa.is_active is not false;
          if active_n >= 5 then
            n_ok := n_ok + 1;
            continue;
          end if;
        end if;
      end if;

      insert into question_answers (
        id,
        question_id,
        text,
        text_fr,
        level,
        std_score,
        reel_score,
        sort_order,
        is_active
      )
      values (
        gen_random_uuid(),
        qid,
        coalesce(nullif(trim(tpl.text), ''), 'Bilgim yok.'),
        coalesce(nullif(trim(tpl.text_fr), ''), 'Je ne sais pas.'),
        coalesce(tpl.level, 'no_opinion'),
        coalesce(tpl.std_score, 0),
        coalesce(tpl.reel_score, 0),
        coalesce((select max(qa.sort_order) from question_answers qa where qa.question_id = qid), 0) + 1,
        true
      )
      returning id into new_id;

      n_ok := n_ok + 1;
      raise notice 'OK % -> %', qid, new_id;
    exception
      when others then
        n_fail := n_fail + 1;
        raise notice 'FAIL % : % (SQLSTATE %)', qid, sqlerrm, sqlstate;
    end;
  end loop;

  raise notice 'SONUC ok=% skip=% fail=% (fail>0 ise mesaji paylasin)', n_ok, n_skip, n_fail;
end $$;

-- Doğrulama
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
