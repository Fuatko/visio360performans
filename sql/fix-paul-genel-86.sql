-- Paul GEORGES genel matris → 85 kişi (Şerife çıkarıldı)
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- Paul ID: 6350a539-e0aa-49b7-8895-9ee572124bfe
--
-- Özet (karşılaştırma sonucu):
--   • FAZLA (çıkar): Evren SAĞBİLİ — listede yok
--   • EKLE: Dilara ADAŞ, Fadime ALPARSLAN, Farhad POURMIR
--   • Yazım (zaten DB'de, işlem yok): Arman KOMBIYIKYAN, Loïc VERTUAUX, Mişelin TAGAN

begin;

-- 0) Şerife EKİZOĞLU listeden çıkarıldı: Paul genelde varsa temizle
delete from evaluation_responses
where assignment_id in (
  select ea.id
  from evaluation_assignments ea
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
    and (
      tg.name ilike 'Şerife %EKİZOĞLU'
      or tg.name ilike 'Serife %EKIZOGLU'
      or (tg.name ilike '%EKİZOĞLU%' and tg.name ilike '%şerife%')
    )
);

delete from evaluation_period_evaluator_target_categories
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and matrix_context = 'genel'
  and target_id in (
    select id from users
    where name ilike 'Şerife %EKİZOĞLU'
       or name ilike 'Serife %EKIZOGLU'
       or (name ilike '%EKİZOĞLU%' and name ilike '%şerife%')
  );

delete from evaluation_period_evaluator_target_scope
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and matrix_context = 'genel'
  and target_id in (
    select id from users
    where name ilike 'Şerife %EKİZOĞLU'
       or name ilike 'Serife %EKIZOGLU'
       or (name ilike '%EKİZOĞLU%' and name ilike '%şerife%')
  );

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and coalesce(matrix_context, 'genel') = 'genel'
  and target_id in (
    select id from users
    where name ilike 'Şerife %EKİZOĞLU'
       or name ilike 'Serife %EKIZOGLU'
       or (name ilike '%EKİZOĞLU%' and name ilike '%şerife%')
  );

-- 1) Evren SAĞBİLİ — Paul genel'den kaldır
delete from evaluation_responses
where assignment_id in (
  select ea.id
  from evaluation_assignments ea
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
    and tg.name = 'Evren SAĞBİLİ'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
);

delete from evaluation_period_evaluator_target_categories
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and target_id = (select id from users where name = 'Evren SAĞBİLİ' limit 1)
  and matrix_context = 'genel';

delete from evaluation_period_evaluator_target_scope
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and target_id = (select id from users where name = 'Evren SAĞBİLİ' limit 1)
  and matrix_context = 'genel';

delete from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
  and target_id = (select id from users where name = 'Evren SAĞBİLİ' limit 1)
  and coalesce(matrix_context, 'genel') = 'genel';

-- 2) Eksik 3 kişiyi ekle
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '6350a539-e0aa-49b7-8895-9ee572124bfe',
  u.id,
  'genel',
  'pending'
from users u
where u.name in ('Dilara ADAŞ', 'Fadime ALPARSLAN', 'Farhad POURMIR')
and not exists (
  select 1 from evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe'
    and ea.target_id = u.id
    and coalesce(ea.matrix_context, 'genel') = 'genel'
);

commit;

-- Doğrulama (85 olmalı)
select count(*) filter (where coalesce(matrix_context, 'genel') = 'genel') as paul_genel_sayisi
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '6350a539-e0aa-49b7-8895-9ee572124bfe';
