#!/usr/bin/env node
/** Matris yapı raporunda puanlanamayan hedefleri listeler. */
import { getSupabaseClient } from './_load-env.mjs'
import { buildMatrixStructureReport } from '../src/lib/server/matrix-structure-report-build.ts'

const PERIOD = process.env.PERIOD_ID || 'a5bd7005-260f-4ac7-b864-ccc31ca0a5f6'

async function main() {
  const sb = await getSupabaseClient()
  const { data: period, error } = await sb
    .from('evaluation_periods')
    .select('organization_id')
    .eq('id', PERIOD)
    .single()
  if (error || !period) throw new Error(error?.message || 'Dönem bulunamadı')

  const report = await buildMatrixStructureReport(sb, {
    periodId: PERIOD,
    orgId: period.organization_id,
    lang: 'tr',
  })

  const s = report.periodSummary
  console.log(`Hedef: ${s.targetCount} | Puanlanan: ${s.targetsWithScores} | Puanlanamayan: ${s.unscoredCount}`)
  console.log('')
  if (!report.unscoredTargets.length) {
    console.log('Puanlanamayan kişi yok.')
    return
  }
  for (const u of report.unscoredTargets) {
    console.log(
      `- ${u.targetName} | ${u.targetDept} | ${u.reason} | tamamlanan ekip: ${u.completedPeerAssignments} | bekleyen: ${u.pendingPeerAssignments}`
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
