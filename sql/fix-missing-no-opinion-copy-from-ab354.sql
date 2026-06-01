-- ab354 5. şık şablonu (29301fda) → 16 soruya kopyala
-- Önce pasif sort_order=5 aç; olmazsa INSERT; unique ise NULL skor dene

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
  n_ok int := 0;
  n_fail int := 0;
begin
  foreach qid in array qids loop
    begin
      if exists (
        select 1 from question_answers qa
        where qa.question_id = qid
          and qa.is_active is not false
          and lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion'
      ) then
        n_ok := n_ok + 1;
        continue;
      end if;

      update question_answers qa
      set
        is_active = true,
        text = 'Bilgim yok.',
        text_fr = 'Je ne sais pas.',
        level = 'no_opinion',
        std_score = 0,
        reel_score = 0,
        sort_order = 5
      where qa.question_id = qid
        and coalesce(qa.sort_order, 0) = 5
        and qa.is_active is false;

      if exists (
        select 1 from question_answers qa
        where qa.question_id = qid
          and qa.is_active is not false
          and lower(trim(coalesce(qa.level::text, ''))) = 'no_opinion'
      ) then
        n_ok := n_ok + 1;
        continue;
      end if;

      insert into question_answers (
        id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
      )
      values (
        gen_random_uuid(), qid,
        'Bilgim yok.', 'Je ne sais pas.', 'no_opinion',
        0, 0, 5, true
      );

      n_ok := n_ok + 1;
    exception
      when unique_violation then
        insert into question_answers (
          id, question_id, text, text_fr, level, std_score, reel_score, sort_order, is_active
        )
        values (
          gen_random_uuid(), qid,
          'Bilgim yok.', 'Je ne sais pas.', 'no_opinion',
          null, null, 5, true
        );
        n_ok := n_ok + 1;
      when others then
        n_fail := n_fail + 1;
        raise notice 'FAIL %: %', qid, sqlerrm;
    end;
  end loop;
  raise notice 'bitti ok=% fail=%', n_ok, n_fail;
end $$;

select question_id, count(*) filter (where is_active is not false) as active_n
from question_answers
where question_id = '0135c890-0803-46e9-9c34-797857df8073'
group by 1;
