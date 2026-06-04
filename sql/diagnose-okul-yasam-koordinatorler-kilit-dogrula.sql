-- Okul yaşam koordinatörleri — kilit doğrulama (beklenen sayılar)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)

with beklenen(degerlendiren, okul_yasam, formator, kategori_notu) as (
  values
    ('Simgenur GÜDEBERK KORKMAZ', 81, 0, 'Proje'),
    ('Jennifer COLOMB ŞENER', 81, 0, 'Proje'),
    ('Aslı Deniz DELİKANLI', 81, 0, 'Proje'),
    ('Müge SARUHAN ALTINKAYA', 81, 4, 'Kurum+Mesleki Gelişim'),
    ('Utku AYTAÇ', 80, 0, 'Teknolojik+Proje')
),
db_ozet as (
  select
    ev.name as degerlendiren,
    count(*) filter (where ea.matrix_context = 'okul_yasam') as okul_yasam,
    count(*) filter (where ea.matrix_context = 'formator') as formator
  from evaluation_assignments ea
  join users ev on ev.id = ea.evaluator_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ev.name in (select degerlendiren from beklenen)
  group by ev.name
)
select
  b.degerlendiren,
  b.okul_yasam as beklenen_okul_yasam,
  d.okul_yasam as db_okul_yasam,
  b.formator as beklenen_formator,
  d.formator as db_formator,
  b.kategori_notu,
  case
    when d.okul_yasam = b.okul_yasam and coalesce(d.formator, 0) = b.formator then 'OK'
    else 'HATA'
  end as durum
from beklenen b
left join db_ozet d on d.degerlendiren = b.degerlendiren
order by b.degerlendiren;
