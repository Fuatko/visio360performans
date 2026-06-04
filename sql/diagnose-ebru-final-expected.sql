-- Ebru AKTİMUR — final beklenen listeye göre eksik/fazla kontrolü
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Kural: self yok (Ebru kendini değerlendirmez)

with expected(target_name, ctx) as (
  values
    -- sinif_ogretmeni (8)
    ('Belgin ŞİMŞEK', 'sinif_ogretmeni'),
    ('Elif DİVİTÇİOĞLU', 'sinif_ogretmeni'),
    ('Elif KAZAN', 'sinif_ogretmeni'),
    ('Hande KAHRAMAN', 'sinif_ogretmeni'),
    ('Leyla CİDAL ALTINAYAR', 'sinif_ogretmeni'),
    ('Mişelin TAGAN', 'sinif_ogretmeni'),
    ('Selin KARAKOÇ', 'sinif_ogretmeni'),
    ('Zeliha BARLAS', 'sinif_ogretmeni'),

    -- rehberlik_ogretmeni (1)
    ('Elçin KONUK', 'rehberlik_ogretmeni'),

    -- zumre (13) - self yok, Erkan dahil
    ('Altan KILIÇ', 'zumre'),
    ('Ayhan YAĞIZ', 'zumre'),
    ('Berna BENER', 'zumre'),
    ('Gökçe TAYLAN', 'zumre'),
    ('Gökhan BÜYÜKENGEZ', 'zumre'),
    ('Onur ERMAN', 'zumre'),
    ('Peggy MOREL ÖZDEMİR', 'zumre'),
    ('Stanislaw EON DU VAL', 'zumre'),
    ('Şule KOÇAK', 'zumre'),
    ('Yeliz ERARSLAN', 'zumre'),
    ('Yonca İŞLEK', 'zumre'),
    ('Zeynep DEDEBAŞ', 'zumre'),
    ('Erkan YILMAZ', 'zumre')
),
ebru as (
  select id from users where name = 'Ebru AKTİMUR' limit 1
),
assigned as (
  select tg.name as target_name, ea.matrix_context as ctx
  from evaluation_assignments ea
  join ebru e on e.id = ea.evaluator_id
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
)
select rapor, ctx as matris, isim, detay
from (
  -- sayım satırları
  select
    1 as ord,
    'SAYIM'::text as rapor,
    x.ctx,
    null::text as isim,
    format(
      'beklenen=%s atanan=%s eksik=%s fazla=%s',
      x.exp_cnt, x.assigned_cnt, x.missing_cnt, x.extra_cnt
    ) as detay
  from (
    select
      c.ctx,
      count(*) filter (where src = 'expected') as exp_cnt,
      count(*) filter (where src = 'assigned') as assigned_cnt,
      count(*) filter (where src = 'missing') as missing_cnt,
      count(*) filter (where src = 'extra') as extra_cnt
    from (
      select e.ctx, e.target_name, 'expected'::text as src from expected e
      union all
      select a.ctx, a.target_name, 'assigned' from assigned a
      union all
      select e.ctx, e.target_name, 'missing'
      from expected e
      where not exists (
        select 1 from assigned a where a.ctx = e.ctx and a.target_name = e.target_name
      )
      union all
      select a.ctx, a.target_name, 'extra'
      from assigned a
      where not exists (
        select 1 from expected e where e.ctx = a.ctx and e.target_name = a.target_name
      )
    ) c
    group by c.ctx
  ) x

  union all

  -- eksik satırlar
  select
    2 as ord,
    'EKSIK',
    e.ctx,
    e.target_name as isim,
    'Beklenen listede var, atama yok'
  from expected e
  where not exists (
    select 1 from assigned a where a.ctx = e.ctx and a.target_name = e.target_name
  )

  union all

  -- fazla satırlar
  select
    3 as ord,
    'FAZLA',
    a.ctx,
    a.target_name as isim,
    'Atama var, beklenen listede yok'
  from assigned a
  where not exists (
    select 1 from expected e where e.ctx = a.ctx and e.target_name = a.target_name
  )
) q
order by ord, matris, isim nulls first;

