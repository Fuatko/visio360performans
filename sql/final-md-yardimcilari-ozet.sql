-- Final özet — müdür yardımcıları (2026 EĞİTMEN)
-- Dönem: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6
-- Kapsam: Paul, Ender, Ebru, Gülnaz, Berna, Yaprak, Rengin

select
  u.name as degerlendiren,
  count(*) filter (where coalesce(ea.matrix_context, 'genel') = 'genel') as genel,
  count(*) filter (where ea.matrix_context = 'sinif_ogretmeni') as sinif_ogretmeni,
  count(*) filter (where ea.matrix_context = 'rehberlik_ogretmeni') as rehberlik_ogretmeni,
  count(*) filter (where ea.matrix_context = 'zumre') as zumre,
  count(*) filter (where ea.matrix_context = 'kulup_ogretmeni') as kulup_ogretmeni,
  count(*) filter (where ea.matrix_context = 'nobetci_ogretmeni') as nobetci_ogretmeni,
  count(*) filter (where ea.matrix_context = 'yasam_koordinatoru') as yasam_koordinatoru,
  count(*) filter (where ea.matrix_context = 'formator') as formator,
  count(*) filter (where ea.matrix_context = 'bilimsel_etkinlik_koordinatoru') as bilimsel_etkinlik_koordinatoru,
  count(*) as toplam_atama
from evaluation_assignments ea
join users u on u.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and u.name in (
    'Paul GEORGES',
    'Ender ÜSTÜNGEL',
    'Ebru AKTİMUR',
    'Gülnaz PEKİN',
    'Berna SÖĞÜTLÜ',
    'Yaprak BENER CHAPDELAINE',
    'Rengin TAMKAN DOĞAN'
  )
group by u.name
order by u.name;

-- İsteğe bağlı: tek satır toplam
select
  count(*) filter (where coalesce(ea.matrix_context, 'genel') = 'genel') as genel,
  count(*) filter (where ea.matrix_context = 'sinif_ogretmeni') as sinif_ogretmeni,
  count(*) filter (where ea.matrix_context = 'rehberlik_ogretmeni') as rehberlik_ogretmeni,
  count(*) filter (where ea.matrix_context = 'zumre') as zumre,
  count(*) filter (where ea.matrix_context = 'kulup_ogretmeni') as kulup_ogretmeni,
  count(*) filter (where ea.matrix_context = 'nobetci_ogretmeni') as nobetci_ogretmeni,
  count(*) filter (where ea.matrix_context = 'yasam_koordinatoru') as yasam_koordinatoru,
  count(*) filter (where ea.matrix_context = 'formator') as formator,
  count(*) filter (where ea.matrix_context = 'bilimsel_etkinlik_koordinatoru') as bilimsel_etkinlik_koordinatoru,
  count(*) as toplam_atama
from evaluation_assignments ea
join users u on u.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and u.name in (
    'Paul GEORGES',
    'Ender ÜSTÜNGEL',
    'Ebru AKTİMUR',
    'Gülnaz PEKİN',
    'Berna SÖĞÜTLÜ',
    'Yaprak BENER CHAPDELAINE',
    'Rengin TAMKAN DOĞAN'
  );

