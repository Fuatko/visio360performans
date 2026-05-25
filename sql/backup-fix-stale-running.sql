-- Yarım kalan backup_runs kayıtlarını kapatır (başarısız denemeler «running» kaldıysa).
-- Supabase SQL Editor'da bir kez çalıştırın; veri silinmez.

update public.backup_runs
   set status = 'failed',
       finished_at = coalesce(finished_at, now()),
       error_message = coalesce(
         nullif(trim(error_message), ''),
         'stale: job did not finish (manual cleanup)'
       )
 where status = 'running'
   and finished_at is null;

-- Kontrol
select status, started_at, finished_at, left(coalesce(error_message, ''), 80) as err
  from public.backup_runs
 order by started_at desc
 limit 5;

select public.backup_health();
