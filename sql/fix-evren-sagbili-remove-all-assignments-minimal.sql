-- Evren SAĞBİLİ — minimal silme (tek seferde, Supabase SQL Editor)
-- Tüm dosyayı seçip Run. Sonuç: silinen=21, kalan=0

with evren as (
  select id from users where name = 'Evren SAĞBİLİ' limit 1
),
ids as (
  select ea.id
  from evaluation_assignments ea, evren e
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.target_id = e.id
),
del_resp as (
  delete from evaluation_responses er using ids where er.assignment_id = ids.id returning 1
),
del_assign as (
  delete from evaluation_assignments ea using evren e
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.target_id = e.id
  returning ea.id
),
del_scope as (
  delete from evaluation_period_evaluator_target_scope s using evren e
  where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and s.target_id = e.id
  returning 1
),
del_cats as (
  delete from evaluation_period_evaluator_target_categories tc using evren e
  where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and tc.target_id = e.id
  returning 1
),
del_duty as (
  delete from evaluation_period_user_duties epud using evren e
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and epud.user_id = e.id
  returning 1
)
select
  (select count(*) from del_assign) as silinen_atama,
  (select count(*) from del_duty) as silinen_gorev;

-- ↑ silinen_atama = 21 ise başarılı. Doğrulama için AYRI çalıştırın (kalan_atama CTE içinde yanıltıcı olabilir):
-- select count(*) as kalan_atama from evaluation_assignments ea
-- join users tg on tg.id = ea.target_id
-- where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and tg.name = 'Evren SAĞBİLİ';
