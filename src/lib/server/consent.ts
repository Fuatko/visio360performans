import { isPgEnabled } from '@/lib/db'
import { withActor } from '@/lib/server/secure-query'
import { CONSENT_VERSION } from '@/lib/consent-content'

/**
 * Gizlilik taahhüt onayı — dönem bazlı okuma/yazma.
 *
 * Değerlendirici (role=user) bağlamında çalışır; evaluation form yükleme ile aynı
 * idiom: super_admin actor (RLS bypass) + user_id/period_id ELLE zorlanır. Bu sayede
 * kullanıcı yalnız kendi onayını yazar/okur (user_id = uid).
 *
 * NOT: PG kapalıysa (Supabase-only fallback deploy) tablo bulunmadığından gate
 * uygulanamaz; herkesi kilitlememek için "onaylı" kabul edilir. Prod PG olduğundan
 * gate canlıdır. Bkz. sql/evaluation-consents.sql.
 */

function actorFor(uid: string) {
  return { role: 'super_admin' as const, orgId: null, userId: String(uid || '') }
}

/** Kullanıcı bu dönem için GEÇERLİ sürümde onay vermiş mi? */
export async function hasAcceptedConsent(uid: string, periodId: string): Promise<boolean> {
  if (!isPgEnabled()) return true // Supabase-only fallback: gate uygulanamaz
  if (!uid || !periodId) return false
  try {
    const rows = await withActor(actorFor(uid), (c) =>
      c.query<{ text_version: string | null }>(
        'select text_version from evaluation_consents where period_id = $1 and user_id = $2 limit 1',
        [periodId, uid]
      )
    ).then((r) => r.rows)
    if (!rows.length) return false
    // Sürüm eşleşmezse (metin güncellendi) → yeniden onay iste
    return String(rows[0]?.text_version || '') === CONSENT_VERSION
  } catch {
    // Tablo yoksa/okuma hatası: güvenli taraf — onay iste (gate açık kalsın)
    return false
  }
}

/**
 * Onayı kaydet (upsert). Kullanıcının bu dönemde gerçekten bir ataması olmalı
 * (keyfi insert engellenir). organization_id atamanın döneminden türetilir.
 */
export async function recordConsent(
  uid: string,
  periodId: string,
  ip: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isPgEnabled()) return { ok: true } // Supabase-only: no-op
  if (!uid || !periodId) return { ok: false, error: 'Eksik parametre' }
  try {
    return await withActor(actorFor(uid), async (c) => {
      // Kullanıcı bu dönemde değerlendirici mi? + org_id'yi dönemden al
      const chk = await c.query<{ organization_id: string | null }>(
        `select ep.organization_id
           from evaluation_assignments a
           join evaluation_periods ep on ep.id = a.period_id
          where a.period_id = $1 and a.evaluator_id = $2
          limit 1`,
        [periodId, uid]
      )
      if (!chk.rows.length) return { ok: false, error: 'Bu dönemde atamanız bulunmuyor' }
      const orgId = chk.rows[0]?.organization_id || null
      await c.query(
        `insert into evaluation_consents (period_id, user_id, organization_id, ip_address, text_version, accepted_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (period_id, user_id)
         do update set accepted_at = now(), ip_address = excluded.ip_address, text_version = excluded.text_version`,
        [periodId, uid, orgId, ip || null, CONSENT_VERSION]
      )
      return { ok: true }
    })
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Onay kaydedilemedi' }
  }
}
