-- Paul LAFORGE — Kulüp Öğretmeni atamasını ilgili tüm değerlendirenlere ekle
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
--
-- Kapsam (hedef): 9 değerlendiren
--   1) Paul GEORGES, Ender ÜSTÜNGEL
--   2) Unvanında "Müdür Yardımcısı" geçen 5 kişi
--   3) Yaşam koordinatörü: Onur ERMAN, Ayşegül KAZMAZ
--
-- Not: Var olan kulup_ogretmeni atamalarını tekrar eklemez (idempotent).

begin;

with period_ctx as (
  select 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id
),
target as (
  select u.id, u.name
  from users u
  where u.name = 'Paul LAFORGE'
  limit 1
),
evaluator_pool as (
  select distinct u.id, u.name
  from users u
  where
    u.name in ('Paul GEORGES', 'Ender ÜSTÜNGEL')
    or u.name in ('Onur ERMAN', 'Ayşegül KAZMAZ')
    or coalesce(u.title, '') ilike '%müdür yardımcısı%'
),
eligible_evaluators as (
  select ep.id, ep.name
  from evaluator_pool ep
  where ep.id is not null
)
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  p.period_id,
  ev.id,
  t.id,
  'kulup_ogretmeni',
  'pending'
from period_ctx p
join eligible_evaluators ev on true
join target t on true
where not exists (
  select 1
  from evaluation_assignments ea
  where ea.period_id = p.period_id
    and ea.evaluator_id = ev.id
    and ea.target_id = t.id
    and ea.matrix_context = 'kulup_ogretmeni'
);

commit;

-- Doğrulama: Paul LAFORGE için kulüp ataması olan değerlendirenler
with period_ctx as (
  select 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id
)
select ev.name as degerlendiren, coalesce(ev.title, '-') as unvan
from evaluation_assignments ea
join period_ctx p on p.period_id = ea.period_id
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where tg.name = 'Paul LAFORGE'
  and ea.matrix_context = 'kulup_ogretmeni'
order by ev.name;

-- Hızlı sayı kontrolü
with period_ctx as (
  select 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid as period_id
)
select count(*) as paul_laforge_kulup_evaluator_sayisi
from evaluation_assignments ea
join period_ctx p on p.period_id = ea.period_id
join users tg on tg.id = ea.target_id
where tg.name = 'Paul LAFORGE'
  and ea.matrix_context = 'kulup_ogretmeni';

-- Beklenen 9 kişi karşılaştırma (eksik/fazla)
with beklenen(name) as (
  values
    ('Paul GEORGES'),
    ('Ender ÜSTÜNGEL'),
    ('Onur ERMAN'),
    ('Ayşegül KAZMAZ'),
    ('Ebru AKTİMUR'),
    ('Gülnaz PEKİN'),
    ('Berna SÖĞÜTLÜ'),
    ('Yaprak BENER CHAPDELAINE'),
    ('Rengin TAMKAN DOĞAN')
),
mevcut as (
  select ev.name
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and tg.name = 'Paul LAFORGE'
    and ea.matrix_context = 'kulup_ogretmeni'
)
select 'EKSIK' as rapor, b.name
from beklenen b
where not exists (select 1 from mevcut m where m.name = b.name)
union all
select 'FAZLA', m.name
from mevcut m
where not exists (select 1 from beklenen b where b.name = m.name)
order by 1, 2;

