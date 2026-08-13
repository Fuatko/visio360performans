// ============================================================================
// Merkezi DB backend seçimi — pg göçü Yol B (kademeli, fallback-korumalı)
// ============================================================================
// AMAÇ: "pg mi Supabase mi" kararını TEK yerde ver; 589 çağrıda tekrarlama.
//
// KARAR:
//   PG_DATABASE_URL set  → { mode: 'pg' }        → yeni Türkiye DB (lib/db.ts pool)
//   PG_DATABASE_URL yok  → { mode: 'supabase' }  → mevcut Supabase service-role (BUGÜNKÜ davranış)
//   ikisi de yoksa       → null                  → çağıran 503 döner
//
// DEPLOY GÜVENLİĞİ: Vercel'de PG_DATABASE_URL YOK → her yerde 'supabase' seçilir →
// mevcut kod aynen çalışır. pg yolu yalnızca env set edilince (dev/kesiş sonrası) aktifleşir.
//
// KULLANIM (her route'ta tek desen):
//   const backend = resolveBackend()
//   if (!backend) return NextResponse.json({ success:false, error:'...' }, { status:503 })
//   if (backend.mode === 'pg') { ...pg SQL (withActor + parametreli)... }
//   else { const supabase = backend.supabase; ...MEVCUT Supabase kodu AYNEN... }
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@supabase/supabase-js'
import { isPgEnabled } from '@/lib/db'

/**
 * Merkezi Supabase service-role client. (Bugüne kadar her admin route'un kendi
 * kopyasını taşıdığı getSupabaseAdmin — tek yere alındı; ileride diğer route'lar
 * da buradan alacak.) RLS bypass; yetki/kapsam kontrolü çağıran route'ta yapılır.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const service = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  if (!url || !service) return null
  return createClient(url.replace(/\/$/, ''), service)
}

export type DbBackend =
  | { mode: 'pg' }
  | { mode: 'supabase'; supabase: SupabaseClient }

/** Merkezi fallback kararı — yukarıdaki mantık. */
export function resolveBackend(): DbBackend | null {
  if (isPgEnabled()) return { mode: 'pg' }
  const supabase = getSupabaseAdmin()
  return supabase ? { mode: 'supabase', supabase } : null
}
