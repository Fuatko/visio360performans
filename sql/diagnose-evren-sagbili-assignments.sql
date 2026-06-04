-- Evren SAĞBİLİ — 2026 EĞİTMEN döneminde değerlendirme atamaları (hedef olarak)
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6

-- 1) Kullanıcı
select id, name, email, title
from users
where name = 'Evren SAĞBİLİ';

-- 2) Dönem görev ünvanları (matris yeniden üretiminde kullanılır)
select epd.name as gorev
from evaluation_period_user_duties epud
join evaluation_duties epd on epd.id = epud.duty_id
join users u on u.id = epud.user_id
where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and u.name = 'Evren SAĞBİLİ';

-- 3) Tüm atamalar (değerlendiren × matris)
select ev.name as degerlendiren,
  coalesce(ea.matrix_context, 'genel') as matris,
  ea.status,
  ea.id as assignment_id
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tg.name = 'Evren SAĞBİLİ'
order by ev.name, matris;

-- 4) Özet
select coalesce(ea.matrix_context, 'genel') as matris,
  count(*) as atama,
  count(distinct ev.id) as degerlendiren_sayisi
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tg.name = 'Evren SAĞBİLİ'
group by 1
order by 1;

-- 5) Yanıt / skor (silmeden önce kontrol)
select
  (select count(*) from evaluation_responses er
   join evaluation_assignments ea on ea.id = er.assignment_id
   join users tg on tg.id = ea.target_id
   where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and tg.name = 'Evren SAĞBİLİ') as yanit,
  (select count(*) from international_standard_scores iss
   join evaluation_assignments ea on ea.id = iss.assignment_id
   join users tg on tg.id = ea.target_id
   where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6' and tg.name = 'Evren SAĞBİLİ') as skor;

-- 6) Hedef özel kapsam kayıtları
select 'target_scope' as tur, count(*) as n
from evaluation_period_evaluator_target_scope s
join users tg on tg.id = s.target_id
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tg.name = 'Evren SAĞBİLİ'
union all
select 'target_categories', count(*)
from evaluation_period_evaluator_target_categories tc
join users tg on tg.id = tc.target_id
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tg.name = 'Evren SAĞBİLİ';

-- 7) Evren değerlendiren olarak (olmamalı)
select count(*) as evren_degerlendiren_atama
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Evren SAĞBİLİ';
