-- Yaprak BENER CHAPDELAINE final hizalama
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Hedef:
--   1) Genel liste görseldeki yeni listeye göre (33 kişi)
--   2) Zümre = 14 (Ebru AKTİMUR + Erkan YILMAZ dahil)
--   3) Kulüp = 46 (Paul LAFORGE dahil, self yok)

begin;

-- -----------------------------
-- A) GENEL 33 LISTE HIZALAMA
-- -----------------------------
create temp table _beklenen_yaprak_genel33(name text) on commit drop;
insert into _beklenen_yaprak_genel33(name) values
  ('Gülen ERMAN'),
  ('Onur ERMAN'),
  ('Ayşegül KAZMAZ'),
  ('Baran YILDIZ'),
  ('Laurent CHAPDELAINE'),
  ('Yeliz ERARSLAN'),
  ('Rengin TAMKAN DOĞAN'),
  ('Şükran TOY'),
  ('Kerem KESEPARA'),
  ('Jean-Marie DOLL'),
  ('Charbel JBEILY'),
  ('Cécile BLANC'),
  ('Marie Christine ÇANLI'),
  ('Eléonore DE BEAUMONT'),
  ('Christine KHOURY'),
  ('Zeliha Mine NART'),
  ('Olivier ROBERT'),
  ('Ebru ÖZGÖREN'),
  ('Ilgın AYDIN'),
  ('Maral BASMA'),
  ('Berna BENER'),
  ('Binnaz BAYRAK ONUR'),
  ('Şahan İZGİ'),
  ('Nesrin KARAKAŞ'),
  ('Erkan YILMAZ'),
  ('Tunç ÖNDEMİR'),
  ('Gökhan BÜYÜKENGEZ'),
  ('Didem KANDİL'),
  ('Özcan AKÇAKAYA'),
  ('Esin ALPAN'),
  ('Zeynep DEDEBAŞ'),
  ('Dilek KARAYAĞIZ'),
  ('Mesude YILDIRIM');

create temp table _to_remove_yaprak_genel33(id uuid) on commit drop;
insert into _to_remove_yaprak_genel33(id)
select ea.id
from evaluation_assignments ea
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ea.evaluator_id = '7269fdab-7412-4208-b9b4-25cfbec48228'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
  and not exists (select 1 from _beklenen_yaprak_genel33 b where b.name = tg.name);

create temp table _to_add_yaprak_genel33(target_id uuid) on commit drop;
insert into _to_add_yaprak_genel33(target_id)
select tg.id
from users tg
where exists (select 1 from _beklenen_yaprak_genel33 b where b.name = tg.name)
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = '7269fdab-7412-4208-b9b4-25cfbec48228'
      and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

delete from evaluation_responses er
where er.assignment_id in (select id from _to_remove_yaprak_genel33);

delete from international_standard_scores iss
where iss.assignment_id in (select id from _to_remove_yaprak_genel33);

delete from evaluation_assignments ea
where ea.id in (select id from _to_remove_yaprak_genel33);

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  '7269fdab-7412-4208-b9b4-25cfbec48228',
  a.target_id,
  'genel',
  'pending'
from _to_add_yaprak_genel33 a;

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
where ev.name = 'Yaprak BENER CHAPDELAINE'
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and ea.matrix_context = 'zumre'
  );

-- -----------------------------
-- C) KULUP = 46 (Paul LAFORGE dahil, self yok)
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
where ev.name = 'Yaprak BENER CHAPDELAINE'
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and ea.matrix_context = 'kulup_ogretmeni'
  );

-- Son kontrol
select
  count(*) filter (where coalesce(matrix_context,'genel') = 'genel') as genel,
  count(*) filter (where matrix_context = 'zumre') as zumre,
  count(*) filter (where matrix_context = 'kulup_ogretmeni') as kulup_ogretmeni
from evaluation_assignments
where period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and evaluator_id = '7269fdab-7412-4208-b9b4-25cfbec48228';

commit;

