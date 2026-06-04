-- Yaşam koordinatörleri — genel 8 kategori doğrulama

with beklenen8 as (
  select distinct on (wanted)
    cs.id as category_id,
    v.wanted
  from (
    values
      ('Mesleki Sorumluluk'),
      ('Pedagojik Yetkinlik'),
      ('Ölçme ve Değerlendirme'),
      ('Teknolojik Yetkinlikler'),
      ('Veli İletişimi'),
      ('Öğrenci İlişkileri ve Empati'),
      ('Proje, Etkinlik ve Kurumsal Katkı'),
      ('Kurum İçi İletişim ve İşbirliği')
  ) as v(wanted)
  join evaluation_period_categories_snapshot cs
    on cs.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
   and (
     cs.name = v.wanted
     or (v.wanted = 'Pedagojik Yetkinlik' and cs.name ilike 'pedagojik%')
     or (v.wanted = 'Ölçme ve Değerlendirme' and (cs.name ilike 'ölçme%' or cs.name ilike 'olcme%'))
     or (v.wanted = 'Kurum İçi İletişim ve İşbirliği' and cs.name ilike 'Kurum%İletişim%')
     or (v.wanted = 'Proje, Etkinlik ve Kurumsal Katkı' and cs.name ilike 'Proje%')
   )
  order by wanted, cs.name
),
hedefler as (
  select ev.name as degerlendiren, tg.name as hedef, ev.id as evaluator_id, tg.id as target_id
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
    and ev.name in ('Onur ERMAN', 'Ayşegül KAZMAZ')
),
ozet as (
  select
    h.degerlendiren,
    h.hedef,
    count(tc.category_id) as kat_sayisi,
    count(*) filter (where tc.category_id not in (select category_id from beklenen8)) as fazla,
    count(*) filter (
      where b.category_id is not null
        and tc.category_id is null
    ) as eksik
  from hedefler h
  cross join beklenen8 b
  left join evaluation_period_evaluator_target_categories tc
    on tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
   and tc.evaluator_id = h.evaluator_id
   and tc.target_id = h.target_id
   and tc.matrix_context = 'genel'
   and tc.scope_kind = 'period'
   and tc.is_active
   and tc.category_id = b.category_id
  group by h.degerlendiren, h.hedef, h.evaluator_id, h.target_id
)
select degerlendiren,
  count(*) as toplam_hedef,
  count(*) filter (where kat_sayisi = 8 and fazla = 0 and eksik = 0) as tamam,
  count(*) filter (where kat_sayisi <> 8 or fazla > 0 or eksik > 0) as hatali
from ozet
group by degerlendiren
order by degerlendiren;

-- MD → yaşam koord hedef (5 kategori korunmalı)
select ev.name as degerlendiren, tg.name as hedef,
  count(tc.category_id) as kat_sayisi,
  array_agg(cs.name order by cs.name) as kategoriler
from evaluation_period_evaluator_target_categories tc
join users ev on ev.id = tc.evaluator_id
join users tg on tg.id = tc.target_id
join evaluation_period_categories_snapshot cs on cs.id = tc.category_id and cs.period_id = tc.period_id
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.matrix_context = 'genel'
  and tc.scope_kind = 'period'
  and tc.is_active
  and ev.name in ('Paul GEORGES', 'Ender ÜSTÜNGEL', 'Şule KOÇAK')
  and tg.name in ('Onur ERMAN', 'Ayşegül KAZMAZ')
group by ev.name, tg.name
order by tg.name, ev.name;
