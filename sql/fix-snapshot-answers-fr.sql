-- FR eksik cevapları düzelt (canlı tablo + yaygın iş değerlendirmesi şıkları)
-- Önce: sql/diagnose-snapshot-answers-fr.sql
-- period_id: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6

begin;

-- A) Canlı question_answers → snapshot
update public.evaluation_period_answers_snapshot snap
set text_fr = qa.text_fr
from public.question_answers qa
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and snap.id = qa.id
  and coalesce(nullif(trim(qa.text_fr), ''), '') <> ''
  and coalesce(nullif(trim(snap.text_fr), ''), '') = '';

-- B) Canlı answers (alternatif tablo) → snapshot
update public.evaluation_period_answers_snapshot snap
set text_fr = a.text_fr
from public.answers a
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and snap.id = a.id
  and coalesce(nullif(trim(a.text_fr), ''), '') <> ''
  and coalesce(nullif(trim(snap.text_fr), ''), '') = '';

-- C) Canlı tablolara yaygın TR → FR (snapshot + canlı)
create temp table _answer_fr_patch (a_tr text, a_fr text) on commit drop;
insert into _answer_fr_patch (a_tr, a_fr) values
  ('Fikrim yok', 'Aucune idée'),
  ('Fikrim yok.', 'Aucune idée'),
  ('Bilgim yok', 'Je ne sais pas'),
  ('Bilgim yok.', 'Je ne sais pas'),
  ('5', '5'),
  ('3', '3'),
  ('1', '1'),
  ('0', '0'),
  ('3 (Beklentiyi karşılar)', 'Répond aux attentes'),
  ('Beklentiyi karşılar', 'Répond aux attentes'),
  ('Beklentiyi Karşılar', 'Répond aux attentes'),
  ('İyi', 'Forte'),
  ('Iyi', 'Forte'),
  ('Zayıf', 'Faible'),
  ('Zayif', 'Faible'),
  ('Orta', 'Moyen'),
  ('Orta (Beklentiyi Karşılar)', 'Répond aux attentes');

-- question_answers
update public.question_answers qa
set text_fr = p.a_fr
from _answer_fr_patch p
where coalesce(nullif(trim(qa.text_fr), ''), '') = ''
  and trim(qa.text) = p.a_tr;

-- answers
update public.answers a
set text_fr = p.a_fr
from _answer_fr_patch p
where coalesce(nullif(trim(a.text_fr), ''), '') = ''
  and trim(a.text) = p.a_tr;

-- snapshot (eşleşen TR metin)
update public.evaluation_period_answers_snapshot snap
set text_fr = p.a_fr
from _answer_fr_patch p
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(nullif(trim(snap.text_fr), ''), '') = ''
  and trim(snap.text) = p.a_tr;

-- D) Uzun performans metinleri (std_score ile)
update public.evaluation_period_answers_snapshot snap
set text_fr = case snap.std_score::int
  when 5 then 'Forte'
  when 3 then 'Répond aux attentes'
  when 1 then 'Faible'
  when 0 then 'Aucune idée'
  else snap.text_fr
end
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(nullif(trim(snap.text_fr), ''), '') = ''
  and snap.std_score is not null
  and snap.reel_score = snap.std_score
  and snap.std_score::int in (5, 3, 1, 0)
  and length(trim(snap.text)) <= 80;

update public.question_answers qa
set text_fr = case qa.std_score::int
  when 5 then 'Forte'
  when 3 then 'Répond aux attentes'
  when 1 then 'Faible'
  when 0 then 'Aucune idée'
  else qa.text_fr
end
where coalesce(nullif(trim(qa.text_fr), ''), '') = ''
  and qa.std_score is not null
  and qa.reel_score = qa.std_score
  and qa.std_score::int in (5, 3, 1, 0)
  and length(trim(qa.text)) <= 80;

-- E) Uzun metin / reel farkı: yalnızca std_score (snapshot + canlı)
update public.evaluation_period_answers_snapshot snap
set text_fr = case round(snap.std_score)::int
  when 5 then 'Forte'
  when 3 then 'Répond aux attentes'
  when 1 then 'Faible'
  when 0 then 'Aucune idée'
  else snap.text_fr
end
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(nullif(trim(snap.text_fr), ''), '') = ''
  and snap.std_score is not null
  and round(snap.std_score)::int in (5, 3, 1, 0);

update public.question_answers qa
set text_fr = case round(qa.std_score)::int
  when 5 then 'Forte'
  when 3 then 'Répond aux attentes'
  when 1 then 'Faible'
  when 0 then 'Aucune idée'
  else qa.text_fr
end
where coalesce(nullif(trim(qa.text_fr), ''), '') = ''
  and qa.std_score is not null
  and round(qa.std_score)::int in (5, 3, 1, 0);

-- F) «Fikrim/Bilgim yok» ve level (kısmi eşleşme)
update public.evaluation_period_answers_snapshot snap
set text_fr = case
  when snap.text ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok' then 'Aucune idée'
  when snap.text ~* 'beklentiyi\s*kar[sş]ılar|beklentiyi\s*karsilar' then 'Répond aux attentes'
  when snap.text ~* '^iyi$|^\s*iyi\s*$' then 'Forte'
  when snap.text ~* '^zay[iı]f$' then 'Faible'
  when snap.text ~* '^orta(\s*\(|$)' then 'Moyen'
  else snap.text_fr
end
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(nullif(trim(snap.text_fr), ''), '') = '';

update public.question_answers qa
set text_fr = case
  when qa.text ~* 'fikrim\s*yok|bilgim\s*yok|bilgi\s*yok' then 'Aucune idée'
  when qa.text ~* 'beklentiyi\s*kar[sş]ılar|beklentiyi\s*karsilar' then 'Répond aux attentes'
  when lower(qa.level::text) in ('no_opinion', 'fikrim_yok', 'bilgim_yok', 'no_info', 'bilgim-yok') then 'Aucune idée'
  else qa.text_fr
end
where coalesce(nullif(trim(qa.text_fr), ''), '') = '';

-- G) Son çare: tek eksik kayıt — önce teşhis sorgusunu çalıştırın (alttaki SELECT)

-- Kontrol
select 'answers' as kind,
  count(*) filter (where coalesce(is_active, true)) as active_total,
  count(*) filter (where coalesce(is_active, true) and coalesce(nullif(trim(text_fr), ''), '') = '') as missing_fr
from public.evaluation_period_answers_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

commit;

-- Hâlâ missing_fr > 0 ise diagnose çıktısındaki text_tr değerlerini paylaşın (manuel FR eklenir).
