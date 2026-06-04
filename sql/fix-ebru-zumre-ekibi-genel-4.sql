-- Ebru AKTİMUR — zümre ekibi genel değerlendirme eksiklerini tamamla
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Beklenen ekip: Jean-Marie DOLL, Léa JACQUOT, Charbel JBEILY, Farhad POURMIR
-- Not: Bu script yalnızca eksik atamaları ekler, mevcut genel atamaları silmez.

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'genel',
  'pending'
from users ev
join users tg
  on tg.name in ('Jean-Marie DOLL', 'Léa JACQUOT', 'Charbel JBEILY', 'Farhad POURMIR')
where ev.name = 'Ebru AKTİMUR'
  and ev.id <> tg.id
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

-- Kontrol (zümre ekip 4/4)
with beklenen(name) as (
  values
    ('Jean-Marie DOLL'),
    ('Léa JACQUOT'),
    ('Charbel JBEILY'),
    ('Farhad POURMIR')
),
ebru_genel as (
  select tg.name
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name = 'Ebru AKTİMUR'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select
  (select count(*) from beklenen) as beklenen,
  (select count(*) from ebru_genel g where exists (select 1 from beklenen b where b.name = g.name)) as ebru_ekipte_atanan,
  (select count(*) from beklenen b where not exists (select 1 from ebru_genel g where g.name = b.name)) as eksik,
  (select count(*) from ebru_genel) as ebru_toplam_genel;
