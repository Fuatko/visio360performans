-- Genel atama: eski hata = dönemdeki TÜM sorular forma girer (ör. 69), kullanıcı ~21 genel cevaplar,
-- kalan (ör. 48) «cevaplanmamış» uyarısı = yan görev paketine bağlı KATEGORİLERDEKİ dönem soruları.
-- Yeni kod: genel kartta yalnızca görev kategorisi DIŞINDAKİ dönem soruları (G:21).
-- Supabase SQL Editor: dosyanın tamamını tek seferde çalıştırın.
-- period_id: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6

drop table if exists _genel_form_bug;
create temp table _genel_form_bug as
with period_questions as (
  select distinct epq.question_id::text as question_id
  from public.evaluation_period_questions epq
  where epq.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and epq.is_active = true
),
duty_category_ids as (
  select distinct epdc.category_id::text as category_id
  from public.evaluation_period_duty_categories epdc
  where epdc.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and epdc.is_active = true
),
period_q_with_cat as (
  select
    pq.question_id,
    q.category_id::text as category_id,
    case
      when q.category_id::text in (select category_id from duty_category_ids) then 'yanlis_genel_formda'
      else 'dogru_genel'
    end as bucket
  from period_questions pq
  join public.questions q on q.id::text = pq.question_id
),
period_totals as (
  select
    count(*)::int as toplam_donem_soru,
    count(*) filter (where bucket = 'dogru_genel')::int as beklenen_genel_soru,
    count(*) filter (where bucket = 'yanlis_genel_formda')::int as eski_hatali_fazla_soru
  from period_q_with_cat
),
genel_assignments as (
  select
    ea.id as assignment_id,
    ea.evaluator_id,
    ea.target_id,
    ea.status,
    pt.toplam_donem_soru,
    pt.beklenen_genel_soru,
    pt.eski_hatali_fazla_soru
  from public.evaluation_assignments ea
  cross join period_totals pt
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
    and coalesce(ea.matrix_context, 'genel') = 'genel'
)
select * from genel_assignments;

-- 1) Dönem özeti (Dilara dahil herkes aynı 48’i görür — hedefe özel değil)
select
  toplam_donem_soru,
  beklenen_genel_soru,
  eski_hatali_fazla_soru,
  eski_hatali_fazla_soru as tipik_uyari_sayisi
from _genel_form_bug
limit 1;

-- 2) Genel atama özeti
select
  count(*) as toplam_genel_atama,
  count(*) filter (where status <> 'completed') as bekleyen,
  count(*) filter (where status = 'completed') as tamamlanan,
  max(eski_hatali_fazla_soru) as max_fazla,
  min(eski_hatali_fazla_soru) as min_fazla
from _genel_form_bug;

-- 3) Tam 48 «fazla» uyarısı olan atamalar (eski sürüm — hepsi aynı sayı olmalı)
select
  ev.name as degerlendiren,
  tg.name as hedef,
  g.status,
  g.beklenen_genel_soru,
  g.eski_hatali_fazla_soru,
  g.assignment_id
from _genel_form_bug g
join public.users ev on ev.id = g.evaluator_id
join public.users tg on tg.id = g.target_id
where g.eski_hatali_fazla_soru = 48
order by g.status, ev.name, tg.name;

-- 4) Bekleyen genel atamalar (deploy sonrası tekrar denenecekler) — ilk 100
select
  ev.name as degerlendiren,
  tg.name as hedef,
  g.status,
  g.beklenen_genel_soru as formda_olmasi_gereken,
  g.eski_hatali_fazla_soru as eski_uyari_fazla,
  g.assignment_id
from _genel_form_bug g
join public.users ev on ev.id = g.evaluator_id
join public.users tg on tg.id = g.target_id
where g.status <> 'completed'
order by ev.name, tg.name
limit 100;

-- 5) Dilara ADAŞ — tüm genel atamalar
select
  ev.name as degerlendiren,
  g.status,
  g.beklenen_genel_soru,
  g.eski_hatali_fazla_soru,
  g.assignment_id
from _genel_form_bug g
join public.users ev on ev.id = g.evaluator_id
join public.users tg on tg.id = g.target_id
where tg.name ilike '%Dilara%ADAŞ%'
order by ev.name;
