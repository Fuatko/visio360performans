-- Gülnaz PEKİN doğrulama
-- 1) Genel değerlendirme sayısı 32 mi?
-- 2) Sınıf/Rehber/Zümre sayıları + isimleri doğru mu?
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Gülnaz ID: b70802b2-6c38-4461-b30b-2af73f2e58e6

-- A) Genel sayısı (hedef 32)
select
  count(*) as gulnaz_genel_sayisi,
  case when count(*) = 32 then 'OK (32)' else 'UYARI (32 degil)' end as durum
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
  and coalesce(matrix_context, 'genel') = 'genel';

-- B) Genel listesi (isimler)
select tg.name as genel_hedef
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
order by tg.name;

-- C) Sınıf/Rehber/Zümre beklenen listeye göre eksik/fazla
with expected(target_name, ctx) as (
  values
    -- sinif_ogretmeni (6)
    ('Özcan AKÇAKAYA', 'sinif_ogretmeni'),
    ('Volkan OĞUZ', 'sinif_ogretmeni'),
    ('Selin YILMAZ', 'sinif_ogretmeni'),
    ('Tanya ERGÜNEŞ UĞUR', 'sinif_ogretmeni'),
    ('Ilgın AYDIN', 'sinif_ogretmeni'),
    ('Şükran TOY', 'sinif_ogretmeni'),
    -- rehberlik_ogretmeni (1)
    ('Sevcan ÖZKILINÇ', 'rehberlik_ogretmeni'),
    -- zumre (14) - güncel liste
    ('Ebru AKTİMUR', 'zumre'),
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
assigned as (
  select tg.name as target_name, ea.matrix_context as ctx
  from evaluation_assignments ea
  join users tg on tg.id = ea.target_id
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = 'b70802b2-6c38-4461-b30b-2af73f2e58e6'
    and ea.matrix_context in ('sinif_ogretmeni', 'rehberlik_ogretmeni', 'zumre')
)
select rapor, matris, isim, detay
from (
  select
    1 as ord,
    'SAYIM'::text as rapor,
    x.ctx as matris,
    null::text as isim,
    format('beklenen=%s atanan=%s eksik=%s fazla=%s', x.exp_cnt, x.asg_cnt, x.missing_cnt, x.extra_cnt) as detay
  from (
    select
      c.ctx,
      count(*) filter (where c.src = 'exp') as exp_cnt,
      count(*) filter (where c.src = 'asg') as asg_cnt,
      count(*) filter (where c.src = 'missing') as missing_cnt,
      count(*) filter (where c.src = 'extra') as extra_cnt
    from (
      select e.ctx, e.target_name, 'exp'::text as src from expected e
      union all
      select a.ctx, a.target_name, 'asg' from assigned a
      union all
      select e.ctx, e.target_name, 'missing'
      from expected e
      where not exists (select 1 from assigned a where a.ctx = e.ctx and a.target_name = e.target_name)
      union all
      select a.ctx, a.target_name, 'extra'
      from assigned a
      where not exists (select 1 from expected e where e.ctx = a.ctx and e.target_name = a.target_name)
    ) c
    group by c.ctx
  ) x
  union all
  select 2, 'EKSIK', e.ctx, e.target_name, 'Beklenen listede var, atama yok'
  from expected e
  where not exists (select 1 from assigned a where a.ctx = e.ctx and a.target_name = e.target_name)
  union all
  select 3, 'FAZLA', a.ctx, a.target_name, 'Atama var, beklenen listede yok'
  from assigned a
  where not exists (select 1 from expected e where e.ctx = a.ctx and e.target_name = a.target_name)
) q
order by ord, matris, isim nulls first;

