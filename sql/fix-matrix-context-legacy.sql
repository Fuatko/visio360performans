-- Zümre / Sınıf / Rehber matrisleri yanlışlıkla matrix_context='genel' ile kaydedildiyse düzeltme
-- ÖNCE: sql/launch-audit.sql bölüm 5–6 sonuçlarına bakın.
-- SONRA: Bu dosyayı çalıştırın, ardından eksik satırlar için ilgili Excel matrislerini yeniden yükleyin.
--
-- period_id:
--   a5bd7005-260f-4ac7-b864-ccc31ca0a5f6

begin;

create temp table _target_duty_preset on commit drop as
select
  epud.user_id as target_id,
  case
    when lower(epd.name) like '%zümre%' or lower(epd.name) like '%zumre%' then 'zumre'
    when lower(epd.name) like '%rehberlik%' or lower(epd.name) like '%rehber %' then 'rehberlik_ogretmeni'
    when lower(epd.name) like '%sınıf öğretmen%' or lower(epd.name) like '%sinif ogretmen%' then 'sinif_ogretmeni'
    when lower(epd.name) like '%nöbet%' or lower(epd.name) like '%nobet%' then 'nobetci_ogretmeni'
    when lower(epd.name) like '%kulüp%' or lower(epd.name) like '%kulup%' then 'kulup_ogretmeni'
    when lower(epd.name) like '%formatör%' or lower(epd.name) like '%formator%' then 'formator'
    when lower(epd.name) like '%yaşam koordinat%' or lower(epd.name) like '%yasam koordinat%' then 'yasam_koordinatoru'
    when lower(epd.name) like '%bilimsel%' then 'bilimsel_etkinlik_koordinatoru'
    else null
  end as preset
from public.evaluation_period_user_duties epud
join public.evaluation_duties epd on epd.id = epud.duty_id
where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid;

-- Hedefte tek bir yan görev preset (sınıf hariç — çoğu öğretmende var)
create temp table _single_yan_target on commit drop as
select target_id, (array_agg(preset))[1] as preset
from _target_duty_preset
where preset is not null and preset <> 'sinif_ogretmeni'
group by target_id
having count(distinct preset) = 1;

-- Güvenli: genel → tek yan görev context (çakışma yoksa)
update public.evaluation_assignments ea
set matrix_context = sy.preset
from _single_yan_target sy
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.target_id = sy.target_id
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and sy.preset in ('zumre', 'rehberlik_ogretmeni', 'nobetci_ogretmeni', 'kulup_ogretmeni', 'formator', 'yasam_koordinatoru', 'bilimsel_etkinlik_koordinatoru')
  and not exists (
    select 1 from public.evaluation_assignments ea2
    where ea2.period_id = ea.period_id
      and ea2.evaluator_id = ea.evaluator_id
      and ea2.target_id = ea.target_id
      and ea2.matrix_context = sy.preset
      and ea2.id <> ea.id
  );

-- Kapsam tablolarını aynı bağlamla hizala (varsa)
update public.evaluation_period_evaluator_target_scope s
set matrix_context = ea.matrix_context
from public.evaluation_assignments ea
where s.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and ea.period_id = s.period_id
  and ea.evaluator_id = s.evaluator_id
  and ea.target_id = s.target_id
  and coalesce(s.matrix_context, 'genel') = 'genel'
  and ea.matrix_context <> 'genel';

update public.evaluation_period_evaluator_target_categories c
set matrix_context = s.matrix_context
from public.evaluation_period_evaluator_target_scope s
where c.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
  and s.period_id = c.period_id
  and s.evaluator_id = c.evaluator_id
  and s.target_id = c.target_id
  and coalesce(c.matrix_context, 'genel') = 'genel'
  and s.matrix_context <> 'genel';

-- Özet
select matrix_context, count(*) from public.evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid
group by 1 order by 2 desc;

commit;

-- MANUEL: Genel + Zümre aynı çift için iki ayrı satır gerekiyorsa,
-- kod deploy sonrası Admin → Matris'ten Zümre Excel'i tekrar yükleyin (replace_pending KAPALI).
