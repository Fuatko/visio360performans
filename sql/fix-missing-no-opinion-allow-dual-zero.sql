-- İsteğe bağlı: (question_id, std_score) unique iken 5,3,1,0 + Bilgim yok (ikinci 0) için
-- Kısmi unique: aynı soruda job_evaluation 0 ile no_opinion 0 birlikte olabilir
-- Önce A ile mevcut constraint adını görün, sonra B’de adı değiştirin.

-- A) Mevcut unique index / constraint
select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'question_answers';

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.question_answers'::regclass;

-- B) Örnek: question_id + std_score unique ise kaldırıp level dahil edin (ADINI KONTROL EDİN)
-- alter table question_answers drop constraint if exists question_answers_question_id_std_score_key;
-- create unique index if not exists uq_question_answers_qid_std_level
--   on question_answers (question_id, std_score, level)
--   where is_active is not false;
