-- Evren SAĞBİLİ — 2026 EĞİTMEN: tüm değerlendirme atamalarını kaldır (hedef olarak)
-- Gerekçe: önümüzdeki dönemde kurumda olmayacak; hiçbir matris/kategoride değerlendirilmemeli.
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
--
-- Çalıştırma: Supabase SQL Editor (postgres rolü).
-- Önce: sql/diagnose-evren-sagbili-assignments.sql
-- Sonra: aşağıdaki doğrulama (atama = 0).

begin;

create temp table _evren(target_id uuid) on commit drop;
insert into _evren(target_id)
select id from users where name = 'Evren SAĞBİLİ' limit 1;

create temp table _evren_assignments(assignment_id uuid) on commit drop;
insert into _evren_assignments(assignment_id)
select ea.id
from evaluation_assignments ea
cross join _evren e
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.target_id = e.target_id;

-- Yanıtlar ve skorlar (varsa)
delete from evaluation_responses er
using _evren_assignments a
where er.assignment_id = a.assignment_id;

-- Tablo yoksa tüm transaction geri alınmasın
do $body$
begin
  delete from international_standard_scores iss
  using _evren_assignments a
  where iss.assignment_id = a.assignment_id;
exception
  when undefined_table then null;
end $body$;

-- Hedef özel kategori / kapsam
delete from evaluation_period_evaluator_target_categories tc
using _evren e
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.target_id = e.target_id;

delete from evaluation_period_evaluator_target_scope s
using _evren e
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and s.target_id = e.target_id;

-- Atamalar
delete from evaluation_assignments ea
using _evren e
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.target_id = e.target_id;

-- Dönem görev ünvanları (kulüp/sınıf) — matris senkronu tekrar eklemesin
delete from evaluation_period_user_duties epud
using _evren e
where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and epud.user_id = e.target_id;

-- Doğrulama (commit öncesi)
select
  (select count(*) from evaluation_assignments ea cross join _evren e
   where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and ea.target_id = e.target_id) as kalan_atama,
  (select count(*) from evaluation_period_user_duties epud cross join _evren e
   where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and epud.user_id = e.target_id) as kalan_gorev,
  (select count(*) from _evren_assignments) as silinen_atama;

commit;

-- Commit sonrası (beklenen: 0 / 0)
select count(*) as hedef_atama_kaldi
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tg.name = 'Evren SAĞBİLİ';
