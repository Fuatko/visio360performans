-- Yaşam koordinatörleri genel 8 kategori — kilit doğrulama (tek satır özet)

with beklenen8 as (
  select array_agg(category_id order by category_id) as want
  from (
    select distinct on (wanted) cs.id as category_id
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
  ) x
),
pairs as (
  select ev.name as degerlendiren,
    array_agg(tc.category_id order by tc.category_id) as have
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  left join evaluation_period_evaluator_target_categories tc
    on tc.period_id = ea.period_id
   and tc.evaluator_id = ea.evaluator_id
   and tc.target_id = ea.target_id
   and tc.matrix_context = 'genel'
   and tc.scope_kind = 'period'
   and tc.is_active
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
    and ev.name in ('Onur ERMAN', 'Ayşegül KAZMAZ')
  group by ev.name, tg.id
),
md_hedef as (
  select ev.name as degerlendiren, tg.name as hedef, count(tc.category_id) as n
  from evaluation_period_evaluator_target_categories tc
  join users ev on ev.id = tc.evaluator_id
  join users tg on tg.id = tc.target_id
  where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and tc.matrix_context = 'genel'
    and tc.is_active
    and ev.name in ('Paul GEORGES', 'Ender ÜSTÜNGEL', 'Şule KOÇAK')
    and tg.name in ('Onur ERMAN', 'Ayşegül KAZMAZ')
  group by ev.name, tg.name
)
select
  p.degerlendiren,
  count(*) as genel_hedef,
  count(*) filter (where p.have = (select want from beklenen8)) as tam_8,
  case
    when count(*) filter (where p.have is distinct from (select want from beklenen8)) = 0
    then 'OK'
    else 'HATA'
  end as durum
from pairs p
group by p.degerlendiren
union all
select
  'MD→' || m.degerlendiren || '→' || m.hedef,
  m.n,
  m.n,
  case when m.n = 5 then 'OK' else 'HATA' end
from md_hedef m
order by 1;
