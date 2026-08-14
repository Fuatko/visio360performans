// ============================================================================
// Route okuma (read) fallback yardımcıları — pg göçü hibrit pattern
// ============================================================================
// HİBRİT KARAR (route fazı):
//   - OKUMA sorguları: isPgEnabled() + parametreli SQL (bu modül). RLS gerekmez;
//     org-scope açık WHERE ile korunur. env yok → çağıran supabase yolunu kullanır.
//   - YAZMA / DESTRUCTIVE: withActor()/secure-query (RLS org-context, DB seviyesi).
//
// Kullanım (route içinde):
//   import { isPgEnabled } from '@/lib/db'
//   import { pgReadOne, pgRead } from '@/lib/server/pg-read'
//   const { data, error } = isPgEnabled()
//     ? await pgReadOne('select ... where id = $1 limit 1', [id])   // maybeSingle karşılığı
//     : await supabase.from('...').select('...').eq('id', id).maybeSingle()
// ============================================================================

import { query as pgQuery } from '@/lib/db'

/** supabase-uyumlu { data, error } (çok satır). Hata fırlatmaz → .error'a taşır. */
export async function pgRead<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<{ data: T[]; error: any }> {
  try {
    const { rows } = await pgQuery<T>(text, params)
    return { data: rows, error: null }
  } catch (e) {
    return { data: [], error: e }
  }
}

/** maybeSingle() karşılığı: ilk satır veya null. */
export async function pgReadOne<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<{ data: T | null; error: any }> {
  const r = await pgRead<T>(text, params)
  return { data: r.data[0] ?? null, error: r.error }
}
