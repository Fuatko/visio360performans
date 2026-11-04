-- VISIO360 — Mükerrer eğitim kataloğu başlıklarını birleştir
--
-- "Geri Bildirim Alma ve Öz Farkındalık"  →  "Öz Farkındalık ve Geri Bildirim"
--
-- ÖNEMLİ — İKİ AŞAMALI ÇALIŞTIRMA:
--   1) Dosyayı olduğu gibi çalıştır. Sonunda ROLLBACK var, yani HİÇBİR
--      ŞEY DEĞİŞMEZ; yalnız ne olacağını gösterir.
--   2) Çıktıyı oku. Doğruysa dosyanın EN SON satırındaki `rollback;`
--      kelimesini `commit;` yap ve tekrar çalıştır.
--
-- Çalıştırma:
--   psql -v ON_ERROR_STOP=1 -f sql/temizlik-katalog-mukerrer.sql
--
-- Şema değişikliği (DDL) YOK. Yalnız mevcut satırlar üzerinde işlem.

begin;

-- Eşleşen çiftler: aynı kurumdaki (ya da ikisi de global olan) iki başlık.
create temporary table _pairs on commit drop as
select
  s.id             as survivor_id,
  d.id             as dead_id,
  s.organization_id
from public.training_catalog s
join public.training_catalog d
  on d.organization_id is not distinct from s.organization_id
where s.title = 'Öz Farkındalık ve Geri Bildirim'
  and d.title = 'Geri Bildirim Alma ve Öz Farkındalık';

-- 1) ÖNCE: ne bulundu?
select 'bulunan cift sayisi' as bilgi, count(*) as adet from _pairs;

select
  p.organization_id,
  s.title  as kalacak_baslik,  s.area as kalacak_alan,  s.tags as kalacak_etiket,
  d.title  as silinecek_baslik, d.area as silinecek_alan, d.tags as silinecek_etiket,
  (select count(*) from public.action_plan_tasks t where t.training_id = d.id) as tasinacak_gorev,
  (select count(*) from public.action_plan_tasks t where t.training_id = s.id) as mevcut_gorev
from _pairs p
join public.training_catalog s on s.id = p.survivor_id
join public.training_catalog d on d.id = p.dead_id;

-- 2) Bağlantıları taşı (silmeden ÖNCE — yoksa set null ile kaybolur).
update public.action_plan_tasks t
set    training_id = p.survivor_id
from   _pairs p
where  t.training_id = p.dead_id;

-- 3) Etiketleri birleştir (tekilleştirilmiş birleşim).
update public.training_catalog s
set    tags = (
         select array_agg(distinct x)
         from   unnest(coalesce(s.tags, '{}'::text[]) || coalesce(d.tags, '{}'::text[])) as x
       ),
       updated_at = now()
from   _pairs p
join   public.training_catalog d on d.id = p.dead_id
where  s.id = p.survivor_id
  and  coalesce(d.tags, '{}'::text[]) <> '{}'::text[];

-- 4) Kalan kayıtta boş olan alanları silinecek kayıttan doldur (bilgi kaybolmasın).
update public.training_catalog s
set    provider       = coalesce(s.provider, d.provider),
       url            = coalesce(s.url, d.url),
       language       = coalesce(s.language, d.language),
       duration_weeks = coalesce(s.duration_weeks, d.duration_weeks),
       hours          = coalesce(s.hours, d.hours),
       level          = coalesce(s.level, d.level),
       updated_at     = now()
from   _pairs p
join   public.training_catalog d on d.id = p.dead_id
where  s.id = p.survivor_id;

-- 5) Mükerrer kaydı sil.
delete from public.training_catalog c
using  _pairs p
where  c.id = p.dead_id;

-- 6) SONRA: sonuç.
select
  s.id, s.organization_id, s.title, s.area, s.tags, s.provider, s.hours,
  (select count(*) from public.action_plan_tasks t where t.training_id = s.id) as bagli_gorev
from _pairs p
join public.training_catalog s on s.id = p.survivor_id;

select 'kalan mukerrer' as bilgi, count(*) as adet
from public.training_catalog
where title = 'Geri Bildirim Alma ve Öz Farkındalık';

-- ↓↓↓ Çıktı doğruysa bu satırı `commit;` yap ve tekrar çalıştır. ↓↓↓
rollback;
