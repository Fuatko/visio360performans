-- Rengin TAMKAN DOĞAN final hizalama
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Hedef:
--   1) Genel liste = kullanıcı tarafından paylaşılan 37 kişi
--   2) Zümre = 14 (Ebru AKTİMUR + Erkan YILMAZ dahil)
--   3) Kulüp = Paul LAFORGE dahil (self yok)

begin;

-- -----------------------------
-- A) GENEL 37 LISTE HIZALAMA
-- -----------------------------
create temp table _beklenen_rengin_genel37(name text) on commit drop;
insert into _beklenen_rengin_genel37(name) values
  ('Onur ERMAN'),
  ('Ayşegül KAZMAZ'),
  ('Laurent CHAPDELAINE'),
  ('Yeliz ERARSLAN'),
  ('Ayhan YAĞIZ'),
  ('Kerem KESEPARA'),
  ('Altan KILIÇ'),
  ('Uğur ÖZEN'),
  ('Ebru AKTİMUR'),
  ('Léa JACQUOT'),
  ('Dilara ADAŞ'),
  ('Şeyma DOĞRUER'),
  ('Stanislaw EON DU VAL'),
  ('Paul GEORGES'),
  ('Zeliha Mine NART'),
  ('Gülnaz PEKİN'),
  ('Olivier ROBERT'),
  ('Erhan ATASEVER'),
  ('Yonca İŞLEK'),
  ('Volkan OĞUZ'),
  ('Ebru ÖZGÖREN'),
  ('Seda UĞUR'),
  ('Ayfer AKAYDIN'),
  ('Maral BASMA'),
  ('Berna BENER'),
  ('Patrice CARINO'),
  ('Arman KOMBIYIKYAN'),
  ('Gülnur TİRYAKİ'),
  ('Şule YENAL'),
  ('Gökhan BÜYÜKENGEZ'),
  ('Sabriye ÇAVDARCIOĞLU TOPUZ'),
  ('Esin ALPAN'),
  ('Elif CANDEMİR'),
  ('Zeynep DEDEBAŞ'),
  ('Zuhal KILIÇASLAN'),
  ('Didem TEKİN'),
  ('Mesude YILDIRIM');

create temp table _to_remove_rengin_genel37(id uuid) on commit drop;
insert into _to_remove_rengin_genel37(id)
select ea.id
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and not exists (select 1 from _beklenen_rengin_genel37 b where b.name = tg.name);

create temp table _to_add_rengin_genel37(target_id uuid) on commit drop;
insert into _to_add_rengin_genel37(target_id)
select tg.id
from users tg
where exists (select 1 from _beklenen_rengin_genel37 b where b.name = tg.name)
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894'
      and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

delete from evaluation_responses er
where er.assignment_id in (select id from _to_remove_rengin_genel37);

delete from international_standard_scores iss
where iss.assignment_id in (select id from _to_remove_rengin_genel37);

delete from evaluation_assignments ea
where ea.id in (select id from _to_remove_rengin_genel37);

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '7d85b402-77f1-4959-bbec-1b62f0d5e894',
  a.target_id,
  'genel',
  'pending'
from _to_add_rengin_genel37 a;

-- -----------------------------
-- B) ZUMRE 14'E TAMAMLA
-- -----------------------------
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'zumre',
  'pending'
from users ev
join users tg on tg.name in (
  'Ebru AKTİMUR',
  'Altan KILIÇ',
  'Ayhan YAĞIZ',
  'Berna BENER',
  'Gökçe TAYLAN',
  'Gökhan BÜYÜKENGEZ',
  'Onur ERMAN',
  'Peggy MOREL ÖZDEMİR',
  'Stanislaw EON DU VAL',
  'Şule KOÇAK',
  'Yeliz ERARSLAN',
  'Yonca İŞLEK',
  'Zeynep DEDEBAŞ',
  'Erkan YILMAZ'
)
where ev.name = 'Rengin TAMKAN DOĞAN'
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and ea.matrix_context = 'zumre'
  );

-- -----------------------------
-- C) KULUP: Paul LAFORGE EKLE
-- -----------------------------
insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'kulup_ogretmeni',
  'pending'
from users ev
join users tg on tg.name = 'Paul LAFORGE'
where ev.name = 'Rengin TAMKAN DOĞAN'
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and ea.matrix_context = 'kulup_ogretmeni'
  );

-- Son hızlı kontrol
select
  count(*) filter (where coalesce(matrix_context,'genel') = 'genel') as genel,
  count(*) filter (where matrix_context = 'sinif_ogretmeni') as sinif_ogretmeni,
  count(*) filter (where matrix_context = 'rehberlik_ogretmeni') as rehberlik_ogretmeni,
  count(*) filter (where matrix_context = 'zumre') as zumre,
  count(*) filter (where matrix_context = 'kulup_ogretmeni') as kulup_ogretmeni
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '7d85b402-77f1-4959-bbec-1b62f0d5e894';

commit;

