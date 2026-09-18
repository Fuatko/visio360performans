-- KVKK / Ops: integration_logs retention & cleanup (idempotent)
-- Amaç: entegrasyon loglarını sınırlı süre (varsayılan 90 gün) tut, eskileri sil.
-- integration_logs; user_email (düz) + payload/error (kişisel veri içerebilir) tutar
-- ve önceden otomatik silme YOKTU (süresiz büyüyordu). Bu betik onu kapatır.
-- Yeniden çalıştırılabilir (idempotent). pg_cron ile/olmadan çalışır.

-- created_at'e göre purge için yardımcı index (opsiyonel)
create index if not exists integration_logs_created_at_idx
  on public.integration_logs (created_at desc);

create or replace function public.integration_logs_cleanup(p_keep_days integer default 90)
returns void
language plpgsql
security definer
as $$
begin
  if to_regclass('public.integration_logs') is not null then
    delete from public.integration_logs
     where created_at < now() - make_interval(days => greatest(p_keep_days, 1));
  end if;
end;
$$;

revoke all on function public.integration_logs_cleanup(integer) from public;

-- Bir kerelik: mevcut 90 günden eski kayıtları hemen temizle
select public.integration_logs_cleanup(90);

-- Opsiyonel: pg_cron etkinse günlük 03:20'de otomatik temizlik
do $$
begin
  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'integration_logs_cleanup_daily') then
      perform cron.schedule(
        'integration_logs_cleanup_daily',
        '20 3 * * *',
        $cmd$select public.integration_logs_cleanup(90);$cmd$
      );
    end if;
  end if;
end
$$;
