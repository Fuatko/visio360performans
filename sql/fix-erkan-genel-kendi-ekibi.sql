-- DEPRECATED — Erkan zümre başkanı değil. Kullanmayın.
-- Yerine: sql/fix-erkan-remove-zumre-baskan-role.sql (mevcut atamaları siler)
--
-- Erkan YILMAZ — kendi ekibi için genel değerlendirme ataması (8 kişi)
-- Dönem: 2026 EĞİTMEN (a5bd7005-260f-4ac7-b864-ccc31ca0a5f6)
-- Kendi ekibi: Utku AYTAÇ, Patrice CARINO, Yaprak BENER CHAPDELAINE, Şahan İZGİ,
--   Nesrin KARAKAŞ, Arman KOMBIYIKYAN, Gülnur TİRYAKİ, Şule YENAL
-- Erkan kendini değerlendirmez.

insert into evaluation_assignments (period_id, evaluator_id, target_id, matrix_context, status)
select
  'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6',
  ev.id,
  tg.id,
  'genel',
  'pending'
from users ev
join users tg on tg.name in (
  'Utku AYTAÇ',
  'Patrice CARINO',
  'Yaprak BENER CHAPDELAINE',
  'Şahan İZGİ',
  'Nesrin KARAKAŞ',
  'Arman KOMBIYIKYAN',
  'Gülnur TİRYAKİ',
  'Şule YENAL'
)
where ev.name = 'Erkan YILMAZ'
  and ev.id <> tg.id
  and not exists (
    select 1
    from evaluation_assignments ea
    where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
      and ea.evaluator_id = ev.id
      and ea.target_id = tg.id
      and coalesce(ea.matrix_context, 'genel') = 'genel'
  );

-- Kontrol
select tg.name as hedef
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
join users tg on tg.id = ea.target_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Erkan YILMAZ'
  and coalesce(ea.matrix_context, 'genel') = 'genel'
order by tg.name;

select count(*) as erkan_genel_sayisi
from evaluation_assignments ea
join users ev on ev.id = ea.evaluator_id
where ea.period_id = 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'
  and ev.name = 'Erkan YILMAZ'
  and coalesce(ea.matrix_context, 'genel') = 'genel';
