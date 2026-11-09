import { withActor, type Actor } from '@/lib/server/secure-query'
import { getSupabaseAdmin } from '@/lib/server/admin-db'
import { buildMatrixStructureReport } from '@/lib/server/matrix-structure-report-build'

/**
 * Sonuç tebliği uygunluğu — /api/admin/result-acknowledgements ve /api/admin/benefit-card ortak.
 * (Route dosyaları yardımcı export edemediği için burada.)
 */

export async function loadPeriod(actor: Actor, periodId: string) {
  const r = await withActor(actor, (c) =>
    c.query<{ id: string; organization_id: string; results_released: boolean | null; assessment_kind: string | null }>(
      'select id, organization_id, results_released, assessment_kind from evaluation_periods where id = $1 limit 1',
      [periodId]
    )
  )
  return r.rows[0] || null
}

/** Kişi başına (öz hariç) puan vermiş değerlendirici sayısı — çalışan tarafıyla aynı tanım. */
export async function evaluatorCountsByTarget(
  actor: Actor,
  input: { periodId: string; orgId: string; kind: string; lang: 'tr' | 'en' | 'fr' }
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (input.kind === 'job_evaluation') {
    // MATRIX: yönetimin dönem raporu (soru puanlayıcılarının tekil sayısı).
    const supabase = getSupabaseAdmin()
    if (!supabase) return out
    try {
      const report = await buildMatrixStructureReport(supabase, {
        periodId: input.periodId,
        orgId: input.orgId,
        lang: input.lang,
        actor,
      })
      for (const person of report.rankings) {
        if (!(Number(person.overallPeerAvg) > 0)) continue
        const ids = new Set<string>()
        for (const q of person.questions || []) {
          for (const sc of q.scorers || []) {
            const id = String(sc?.evaluatorId || '').trim()
            if (id && id !== String(person.targetId)) ids.add(id)
          }
        }
        out.set(String(person.targetId), ids.size)
      }
    } catch {
      /* boş */
    }
    return out
  }
  // 360: tamamlanmış, öz olmayan ve en az bir puanlı cevabı olan atama sayısı.
  const r = await withActor(actor, (c) =>
    c.query<{ target_id: string; n: string | number }>(
      `select a.target_id, count(distinct a.id) as n
         from evaluation_assignments a
        where a.period_id = $1
          and a.status = 'completed'
          and a.evaluator_id is distinct from a.target_id
          and exists (
            select 1 from evaluation_responses r
             where r.assignment_id = a.id and coalesce(r.reel_score, r.std_score, 0) > 0
          )
        group by a.target_id`,
      [input.periodId]
    )
  )
  for (const row of r.rows) out.set(String(row.target_id), Number(row.n) || 0)
  return out
}
