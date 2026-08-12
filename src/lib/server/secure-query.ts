// ============================================================================
// Güvenli sorgu katmanı — organization_id izolasyonunu MİMARİ olarak zorunlu kılar
// ============================================================================
// AMAÇ: 589 supabase-js çağrısını pg'ye göçürürken, tek tek "WHERE org_id"
// yazmayı unutma riskini KODLA değil, MİMARİYLE engellemek. (Daha önce
// questions sayfasında yaşadığımız cross-org sızıntının bir daha imkânsız olması.)
//
// İKİ KATMAN:
//   1) UYGULAMA: Her istek bir Actor bağlamında çalışır (role + orgId + userId).
//      org_admin / user için orgId ZORUNLU — yoksa sorgu daha çalışmadan reddedilir.
//   2) VERİTABANI (asıl garanti): RLS + SET LOCAL app.current_* oturum değişkenleri.
//      visio360_app rolü BYPASSRLS DEĞİL ve tablolarda FORCE ROW LEVEL SECURITY
//      açık → bir sorgu WHERE org_id yazmayı unutsa bile DB cross-org satırları
//      filtreler. Politika SQL'i sql/faz0-rls-org-isolation.sql'de (veri-sahneleme
//      adımında, tablolar oluşunca uygulanacak).
//
// KULLANIM (ileride göçte):
//   const rows = await withActor(actor, (c) =>
//     c.query('select id, name from organizations order by name'))
//   // ^ org_admin ise DB otomatik sadece kendi org'unu döndürür; super_admin hepsini.
// ============================================================================

import type { PoolClient } from 'pg'
import { getPool } from '@/lib/db'

export type ActorRole = 'super_admin' | 'org_admin' | 'user'

export interface Actor {
  role: ActorRole
  /** super_admin için null olabilir; org_admin/user için ZORUNLU. */
  orgId: string | null
  userId: string
}

export interface ScopedClient {
  query<T = unknown>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number }>
}

/**
 * Bir Actor bağlamında transaction açar, RLS oturum değişkenlerini SET LOCAL ile
 * bağlar ve fn'i o bağlamda çalıştırır. fn içindeki TÜM sorgular actor'ın
 * org/role kapsamıyla (RLS altında) koşar. SET LOCAL sadece bu transaction'da
 * geçerlidir → havuzdaki bağlantı bir sonraki isteğe kapsam sızdırmaz.
 */
export async function withActor<T>(actor: Actor, fn: (c: ScopedClient) => Promise<T>): Promise<T> {
  validateActor(actor)
  const client: PoolClient = await getPool().connect()
  try {
    await client.query('begin')
    // set_config(name, value, is_local=true) → SET LOCAL eşdeğeri, parametreli (SQL injection'a kapalı).
    await client.query('select set_config($1, $2, true)', ['app.current_role', actor.role])
    await client.query('select set_config($1, $2, true)', ['app.current_org', actor.orgId ?? ''])
    await client.query('select set_config($1, $2, true)', ['app.current_user_id', actor.userId])

    const scoped: ScopedClient = {
      query: async <T = unknown>(text: string, params?: unknown[]) => {
        const r = await client.query(text, params as never)
        return { rows: r.rows as T[], rowCount: r.rowCount ?? 0 }
      },
    }

    const out = await fn(scoped)
    await client.query('commit')
    return out
  } catch (err) {
    await client.query('rollback').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

function validateActor(a: Actor): void {
  if (!a || !a.role) throw new Error('Actor.role zorunlu')
  if (!a.userId) throw new Error('Actor.userId zorunlu')
  if ((a.role === 'org_admin' || a.role === 'user') && !a.orgId) {
    throw new Error(`Actor.orgId zorunlu (role=${a.role}) — org kapsamı olmadan sorgu reddedilir`)
  }
}
