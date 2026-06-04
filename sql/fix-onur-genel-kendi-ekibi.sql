-- Onur ERMAN — kendi ekibi için genel değerlendirme ataması
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Onur ekibi (paylaşılan liste): Oğuzhan ÇETİN, Gülen ERMAN, Ayşegül KAZMAZ, Baran YILDIZ

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'genel',
  'pending'
from users ev
join users tg on tg.name in ('Oğuzhan ÇETİN', 'Gülen ERMAN', 'Ayşegül KAZMAZ', 'Baran YILDIZ')
where ev.name = 'Onur ERMAN'
  and ev.id <> tg.id
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

-- Kontrol: Onur'un ekip genel listesi
select tg.name as hedef
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Onur ERMAN'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and tg.name in ('Oğuzhan ÇETİN', 'Gülen ERMAN', 'Ayşegül KAZMAZ', 'Baran YILDIZ')
order by tg.name;

