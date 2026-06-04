-- Ebru AKTİMUR — zümre başkanı olarak değerlendirilmesi (hedef) + ekip değerlendirmesi (değerlendiren)
-- Excel: fix-ebru-rehber-sinif-duty-matrices.sql ile uyumlu
-- Önceki audit fix yanlışlıkla "hedef Ebru + zumre" atamalarını silmişti; bu script geri yükler.
--
-- 1) Ebru görev profili: Zümre Başkanı (başkaları onu zümre görevi için değerlendirebilsin)
-- 2) Bekleyen atamalar: md.yrd. grubunun Ebru→zümre satırları (genel ataması olan çiftler)

begin;

-- Zümre Başkanı duty_id = 0a63eda7-0c2d-465c-bdbc-41a33725cbe0
insert into evaluation_period_user_duties (period_id, user_id, duty_id, is_active)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'::uuid,
  '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'::uuid,
  '0a63eda7-0c2d-465c-bdbc-41a33725cbe0'::uuid,
  true
where not exists (
  select 1 from evaluation_period_user_duties epud
  where epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and epud.user_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
    and epud.duty_id = '0a63eda7-0c2d-465c-bdbc-41a33725cbe0'
);

-- Ebru'yu zümre başkanı olarak değerlendirenler (genel matrisi olan md.yrd. grubu)
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d',
  'zumre',
  'pending'
from users ev
where ev.name in (
  'Ender ÜSTÜNGEL',
  'Paul GEORGES',
  'Yaprak BENER CHAPDELAINE',
  'Rengin TAMKAN DOĞAN',
  'Gülnaz PEKİN',
  'Berna SÖĞÜTLÜ'
)
and exists (
  select 1 from evaluation_assignments g
  where g.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and g.evaluator_id = ev.id
    and g.target_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
    and coalesce(g.matrix_context, 'genel') = 'genel'
)
and not exists (
  select 1 from evaluation_assignments ea
  where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
    and ea.evaluator_id = ev.id
    and ea.target_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
    and ea.matrix_context = 'zumre'
);

commit;

-- Ebru değerlendiren → ekip (zümre hedefleri) — eksikse fix-ebru-rehber-sinif-duty-matrices.sql çalıştırın
select 'Ebru gorev' as rapor, d.name
from evaluation_period_user_duties epud
join evaluation_duties d on d.id = epud.duty_id
where epud.user_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
  and epud.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6';

select ev.name as degerlendiren, ea.matrix_context, ea.status
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.target_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
  and ea.matrix_context = 'zumre'
order by ev.name;

select matrix_context, count(*) from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '63c3c8cf-df01-40f5-aaa4-1d0768b4d21d'
  and matrix_context in ('sinif_ogretmeni','rehberlik_ogretmeni','zumre')
group by 1;
