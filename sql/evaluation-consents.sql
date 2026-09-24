-- ============================================================================
-- Gizlilik / veri işleme TAAHHÜT onayı — dönem bazlı kayıt tablosu
-- ============================================================================
-- Değerlendirici bir formu açmadan önce taahhüt metnini onaylar. Onay dönem
-- bazlı tek kayıttır (period_id + user_id UNIQUE); metin sürümü (text_version)
-- değişirse onay yeniden istenir (upsert accepted_at/ip/version'ı günceller).
--
-- ÇALIŞTIRMA:
--   scp -P 35342 sql/evaluation-consents.sql root@185.149.103.48:/tmp/
--   ssh -p 35342 root@185.149.103.48 "sudo -u postgres psql -v ON_ERROR_STOP=1 -P pager=off -d visio360_prod -f /tmp/evaluation-consents.sql"
--
-- NOT: Additive DDL — mevcut değerlendirme verisine dokunmaz (veri dondurma ile uyumlu).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.evaluation_consents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id       uuid NOT NULL REFERENCES public.evaluation_periods(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  ip_address      text,
  text_version    text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Dönem başına kullanıcı tek kayıt → upsert anahtarı
CREATE UNIQUE INDEX IF NOT EXISTS evaluation_consents_period_user_uidx
  ON public.evaluation_consents (period_id, user_id);
CREATE INDEX IF NOT EXISTS evaluation_consents_period_idx ON public.evaluation_consents (period_id);
CREATE INDEX IF NOT EXISTS evaluation_consents_user_idx   ON public.evaluation_consents (user_id);
CREATE INDEX IF NOT EXISTS evaluation_consents_org_idx    ON public.evaluation_consents (organization_id);

-- RLS: org izolasyonu (faz0-rls-org-isolation.sql deseni). ENABLE + FORCE.
-- Yazma değerlendirici bağlamında formLoadActor=super_admin ile yapılır (RLS bypass,
-- user_id=uid elle zorlanır); admin raporu buildActor ile org-scoped okur.
ALTER TABLE public.evaluation_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON public.evaluation_consents;
CREATE POLICY org_isolation ON public.evaluation_consents FOR ALL TO visio360_app
  USING (public.app_is_super() OR organization_id::text = public.app_org())
  WITH CHECK (public.app_is_super() OR organization_id::text = public.app_org());
ALTER TABLE public.evaluation_consents FORCE ROW LEVEL SECURITY;

COMMIT;

-- Doğrulama
\d public.evaluation_consents
