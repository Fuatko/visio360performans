import { isPgEnabled } from '@/lib/db'
import { withActor, type Actor } from '@/lib/server/secure-query'
import { getSupabaseAdmin } from '@/lib/server/admin-db'
import { isEmployeeResultsVisibleSetting } from '@/lib/employee-result-visibility'

/**
 * Kurum kademesi anahtarı — SUNUCUDA her istekte okunur (ekranda gizlemek
 * yetmez). Okuma hatasında ya da ayar yoksa KAPALI döner (güvenli taraf).
 */
export async function loadOrgEmployeeResultsVisible(orgId: string | null | undefined, actor: Actor): Promise<boolean> {
  const id = String(orgId || '').trim()
  if (!id) return false
  try {
    if (isPgEnabled()) {
      const r = await withActor(actor, (c) =>
        c.query<{ settings: unknown }>('select settings from organizations where id = $1 limit 1', [id])
      )
      return isEmployeeResultsVisibleSetting(r.rows[0]?.settings)
    }
    const supabase = getSupabaseAdmin()
    if (!supabase) return false
    const { data, error } = await supabase.from('organizations').select('settings').eq('id', id).maybeSingle()
    if (error) return false
    return isEmployeeResultsVisibleSetting((data as { settings?: unknown } | null)?.settings)
  } catch {
    return false
  }
}

/** Oturumdaki kişinin kurumu (users FORCE RLS → kurum henüz bilinmediği için sistem aktörüyle tek satır). */
export async function loadUserOrgId(uid: string): Promise<string | null> {
  const id = String(uid || '').trim()
  if (!id) return null
  try {
    if (isPgEnabled()) {
      const r = await withActor({ role: 'super_admin', orgId: null, userId: id }, (c) =>
        c.query<{ organization_id: string | null }>('select organization_id from users where id = $1 limit 1', [id])
      )
      return r.rows[0]?.organization_id ? String(r.rows[0].organization_id) : null
    }
    const supabase = getSupabaseAdmin()
    if (!supabase) return null
    const { data } = await supabase.from('users').select('organization_id').eq('id', id).maybeSingle()
    return (data as { organization_id?: string | null } | null)?.organization_id ?? null
  } catch {
    return null
  }
}
