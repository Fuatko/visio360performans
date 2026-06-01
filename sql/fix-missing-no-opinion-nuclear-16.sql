-- Son çare: 16 soru — NOT EXISTS yok; yalnızca tam 4 aktif satır varsa INSERT
-- §C/D işe yaramazsa çalıştırın. Hata mesajı (unique constraint) önemli.

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
select
  gen_random_uuid(),
  qid,
  'Bilgim yok.',
  'Je ne sais pas.',
  'no_opinion',
  0,
  0,
  coalesce((select max(qa.sort_order) from question_answers qa where qa.question_id = qid), 0) + 1,
  true
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
]) as qid
where (
  select count(*) from question_answers qa
  where qa.question_id = qid and coalesce(qa.is_active, true)
) = 4;

select question_id, count(*) filter (where coalesce(is_active, true)) as n
from question_answers
where question_id = '0135c890-0803-46e9-9c34-797857df8073'
group by 1;
