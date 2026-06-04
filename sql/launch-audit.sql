-- VISIO360 — Yayın öncesi matris / görev / FR denetimi
-- Supabase SQL Editor'da çalıştırın. period_id'yi güncelleyin.

-- period_id: a5bd7005-260f-4ac7-b864-ccc31ca0a5f6

-- 1) Atamalar matrix_context dağılımı
select coalesce(matrix_context, 'genel') as matrix_context, status, count(*) as n
from public.evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
group by 1, 2
order by n desc;

-- 2) Yinelenen (aynı dönem + değerlendiren + hedef + context)
select period_id, evaluator_id, target_id, matrix_context, count(*) as n
from public.evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
group by 1, 2, 3, 4
having count(*) > 1;

-- 3) Aynı çiftte birden fazla matris bağlamı (beklenen: genel + yan görev matrisleri)
with pairs as (
  select
    evaluator_id,
    target_id,
    array_agg(distinct coalesce(matrix_context, 'genel') order by coalesce(matrix_context, 'genel')) as contexts,
    count(*) as n
  from public.evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  group by 1, 2
)
select count(*) filter (where array_length(contexts, 1) > 1) as coklu_context_cift,
       count(*) as toplam_cift
from pairs;

-- 4) Hedef görevleri (dönem)
create temp table if not exists _audit_target_duties on commit drop as
select
  epud.user_id as target_id,
  epd.id as duty_id,
  epd.name as duty_name,
  case
    when lower(epd.name) like '%zümre%' or lower(epd.name) like '%zumre%' then 'zumre'
    when lower(epd.name) like '%rehberlik%' or lower(epd.name) like '%rehber %' then 'rehberlik_ogretmeni'
    when lower(epd.name) like '%sınıf%' or lower(epd.name) like '%sinif%' then 'sinif_ogretmeni'
    when lower(epd.name) like '%nöbet%' or lower(epd.name) like '%nobet%' then 'nobetci_ogretmeni'
    when lower(epd.name) like '%kulüp%' or lower(epd.name) like '%kulup%' then 'kulup_ogretmeni'
    when lower(epd.name) like '%formatör%' or lower(epd.name) like '%formator%' then 'formator'
    when lower(epd.name) like '%yaşam koordinat%' or lower(epd.name) like '%yasam koordinat%' then 'yasam_koordinatoru'
    when lower(epd.name) like '%bilimsel%' then 'bilimsel_etkinlik_koordinatoru'
    else null
  end as duty_preset
from public.evaluation_period_user_duties epud
join public.evaluation_duties epd on epd.id = epud.duty_id
where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

-- 5) matrix_context=genel ama hedefte yan görev var — karışık form riski
select
  ea.id as assignment_id,
  ev.name as evaluator,
  tg.name as target,
  coalesce(ea.matrix_context, 'genel') as ctx,
  array_agg(distinct td.duty_preset) filter (where td.duty_preset is not null and td.duty_preset <> 'sinif_ogretmeni') as yan_presets
from public.evaluation_assignments ea
join public.users ev on ev.id = ea.evaluator_id
join public.users tg on tg.id = ea.target_id
left join _audit_target_duties td on td.target_id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(ea.matrix_context, 'genel') = 'genel'
group by ea.id, ev.name, tg.name, ea.matrix_context
having count(td.duty_preset) filter (where td.duty_preset is not null and td.duty_preset <> 'sinif_ogretmeni') > 0
order by evaluator, target
limit 100;

-- 6) Yan görev matrisi bağlamı eksik (genel atama var, özel matris yok)
-- Örnek: hedefte bilimsel görev + genel satır, bilimsel_etkinlik_koordinatoru satırı yok
with target_yan as (
  select target_id, array_agg(distinct duty_preset) filter (where duty_preset is not null and duty_preset <> 'sinif_ogretmeni') as yan
  from _audit_target_duties
  group by 1
),
assign_ctx as (
  select evaluator_id, target_id, array_agg(distinct coalesce(matrix_context, 'genel')) as contexts
  from public.evaluation_assignments
  where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  group by 1, 2
)
select
  ev.name as evaluator,
  tg.name as target,
  ty.yan as hedef_yan_gorevleri,
  ac.contexts as mevcut_contextler
from assign_ctx ac
join target_yan ty on ty.target_id = ac.target_id
join public.users ev on ev.id = ac.evaluator_id
join public.users tg on tg.id = ac.target_id
where 'genel' = any(ac.contexts)
  and ty.yan is not null
  and array_length(ty.yan, 1) >= 1
  and not (ty.yan <@ ac.contexts) -- hedef yan görevlerinden biri context'te yok
order by 1, 2
limit 200;

-- 7) Duty matrisi bağlamı var ama hedefte o görev yok
select
  ea.id,
  ea.matrix_context,
  ev.name as evaluator,
  tg.name as target
from public.evaluation_assignments ea
join public.users ev on ev.id = ea.evaluator_id
join public.users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.matrix_context in (
    'zumre', 'sinif_ogretmeni', 'rehberlik_ogretmeni',
    'nobetci_ogretmeni', 'kulup_ogretmeni', 'formator',
    'yasam_koordinatoru', 'bilimsel_etkinlik_koordinatoru'
  )
  and not exists (
    select 1 from _audit_target_duties td
    where td.target_id = ea.target_id and td.duty_preset = ea.matrix_context
  )
limit 100;

-- 8) Paul → Binnaz (örnek kontrol)
select ea.id, ea.matrix_context, ea.status, ev.name, tg.name
from public.evaluation_assignments ea
join public.users ev on ev.id = ea.evaluator_id
join public.users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ev.name ilike '%paul%'
  and tg.name ilike '%binnaz%';

-- 9) Fransızca kullanıcılar
select preferred_language, count(*) from public.users
where organization_id = (select organization_id from public.evaluation_periods where id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid)
group by 1;

-- 10) Snapshot FR eksikleri (aktif)
select 'questions' as kind,
  count(*) filter (where coalesce(is_active, true)) as active_total,
  count(*) filter (where coalesce(is_active, true) and coalesce(nullif(trim(text_fr), ''), '') = '') as missing_fr
from public.evaluation_period_questions_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
union all
select 'answers', count(*) filter (where coalesce(is_active, true)),
  count(*) filter (where coalesce(is_active, true) and coalesce(nullif(trim(text_fr), ''), '') = '')
from public.evaluation_period_answers_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
union all
select 'categories', count(*) filter (where coalesce(is_active, true)),
  count(*) filter (where coalesce(is_active, true) and coalesce(nullif(trim(name_fr), ''), '') = '')
from public.evaluation_period_categories_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
union all
select 'main_categories', count(*) filter (where coalesce(is_active, true)),
  count(*) filter (where coalesce(is_active, true) and coalesce(nullif(trim(name_fr), ''), '') = '')
from public.evaluation_period_main_categories_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

-- 11) FR eksik örnek sorular (ilk 15)
select left(text, 100) as text_tr, left(text_fr, 100) as text_fr
from public.evaluation_period_questions_snapshot
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(is_active, true)
  and coalesce(nullif(trim(text_fr), ''), '') = ''
limit 15;

-- 12) FR eksik cevaplar (tam liste — genelde 5 kayıt)
select
  snap.id,
  left(snap.text, 100) as text_tr,
  snap.std_score,
  left(q.text, 60) as question_tr
from public.evaluation_period_answers_snapshot snap
join public.evaluation_period_questions_snapshot q
  on q.period_id = snap.period_id and q.id = snap.question_id
where snap.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and coalesce(snap.is_active, true)
  and coalesce(nullif(trim(snap.text_fr), ''), '') = ''
order by q.sort_order nulls last, snap.sort_order nulls last;
