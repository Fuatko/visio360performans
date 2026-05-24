-- Yedekleme kurulumu kontrol (veri değiştirmez)
select public.backup_health() as durum;

select status, backup_kind, storage_provider, storage_path, started_at, finished_at, left(error_message, 200) as hata
from public.backup_runs
order by started_at desc
limit 5;
