-- Değerlendiren × matris × hedef denetimi — 2026 EĞİTMEN
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- Supabase SQL Editor'da bölüm bölüm çalıştırın.

-- 1) Tüm değerlendirenler — matris sayıları
select u.name as degerlendiren,
  count(*) filter (where coalesce(ea.matrix_context, 'genel') = 'genel') as genel,
  count(*) filter (where ea.matrix_context = 'sinif_ogretmeni') as sinif,
  count(*) filter (where ea.matrix_context = 'rehberlik_ogretmeni') as rehber,
  count(*) filter (where ea.matrix_context = 'zumre') as zumre,
  count(*) filter (where ea.matrix_context = 'kulup_ogretmeni') as kulup,
  count(*) filter (where ea.matrix_context = 'nobetci_ogretmeni') as nobetci,
  count(*) filter (where ea.matrix_context = 'yasam_koordinatoru') as yasam,
  count(*) filter (where ea.matrix_context = 'formator') as formator,
  count(*) filter (where ea.matrix_context = 'bilimsel_etkinlik_koordinatoru') as bilimsel,
  count(*) as toplam
from evaluation_assignments ea
join users u on u.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
group by u.name
order by toplam desc;

-- 2) Tek değerlendiren — kim hangi matriste (isim listesi)
-- :evaluator_name örn. 'Şule KOÇAK'
select coalesce(ea.matrix_context, 'genel') as matris,
  string_agg(tg.name, ', ' order by tg.name) as hedefler,
  count(*) as n
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Şule KOÇAK'  -- değiştirin
group by 1
order by n desc;

-- 3) Genel kapsam — değerlendiren varsayılan kategori sayısı
select u.name, s.restrict_period, s.duty_mode,
  (select count(*) from evaluation_period_evaluator_categories c
   where c.evaluator_id = u.id and c.period_id = s.period_id) as kategori_sayisi
from evaluation_period_evaluator_scope s
join users u on u.id = s.evaluator_id
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6';

-- 4) Hedef özel genel kategori (5 kategori istisnaları)
select ev.name as degerlendiren, tg.name as hedef, count(*) as kategori
from evaluation_period_evaluator_target_categories tc
join users ev on ev.id = tc.evaluator_id
join users tg on tg.id = tc.target_id
where tc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and tc.matrix_context = 'genel'
  and tc.scope_kind = 'period'
group by 1, 2
having count(*) between 1 and 8
order by 1, 2;

-- 5) Tutarlılık uyarısı: genel var ama beklenen görev matrisi yok
-- (Kasıtlı istisnalar: Şule→kulup/nobet/zumre yok sayılır — sonuçları elle yorumlayın)
with genel_pairs as (
  select ev.name as degerlendiren, tg.name as hedef, ea.evaluator_id, ea.target_id
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and coalesce(ea.matrix_context, 'genel') = 'genel'
),
duty as (
  select epud.user_id as target_id,
    case
      when lower(epd.name) like '%rehber%' then 'rehberlik_ogretmeni'
      when lower(epd.name) like '%sınıf%' or lower(epd.name) like '%sinif%' then 'sinif_ogretmeni'
      when lower(epd.name) like '%zümre%' or lower(epd.name) like '%zumre%' then 'zumre'
      when lower(epd.name) like '%kulüp%' or lower(epd.name) like '%kulup%' then 'kulup_ogretmeni'
      when lower(epd.name) like '%nöbet%' or lower(epd.name) like '%nobet%' then 'nobetci_ogretmeni'
      when lower(epd.name) like '%yaşam%' or lower(epd.name) like '%yasam%' then 'yasam_koordinatoru'
    end as beklenen_matris
  from evaluation_period_user_duties epud
  join evaluation_duties epd on epd.id = epud.duty_id
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
)
select g.degerlendiren, g.hedef, d.beklenen_matris
from genel_pairs g
join duty d on d.target_id = g.target_id
where d.beklenen_matris is not null
  and not exists (
    select 1 from evaluation_assignments ea2
    where ea2.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea2.evaluator_id = g.evaluator_id
      and ea2.target_id = g.target_id
      and ea2.matrix_context = d.beklenen_matris
  )
order by 1, 2, 3;
