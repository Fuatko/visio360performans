import {
  matrixEvaluationContextLabel,
  normalizeMatrixContext,
} from '@/lib/matrix-evaluation-context'

/** Genel dilim birleştirmede yanıt önceliği: genel > okul yaşam > diğer */
export function coreMatrixResponsePriority(matrixContext: string): number {
  const v = normalizeMatrixContext(matrixContext)
  if (v === 'genel') return 0
  if (v === 'okul_yasam') return 1
  return 2
}

export function mergedReportSliceLabel(sliceContext: string): string {
  return sliceContext === 'genel'
    ? matrixEvaluationContextLabel('genel')
    : matrixEvaluationContextLabel(sliceContext)
}

export function mergeResponsesByQuestionPriority(
  entries: Array<{ matrixContext: string; responses: any[] }>
): any[] {
  const byQ = new Map<string, { r: any; p: number }>()
  for (const { matrixContext, responses } of entries) {
    const p = coreMatrixResponsePriority(matrixContext)
    for (const r of responses) {
      const qid = String(r?.question_id || '').trim()
      if (!qid) continue
      const cur = byQ.get(qid)
      if (!cur || p < cur.p) byQ.set(qid, { r, p })
    }
  }
  return [...byQ.values()].map((x) => x.r)
}

export function coverageRowRank(row: { status: string; hasScorableResponses: boolean }): number {
  if (row.hasScorableResponses) return 3
  if (row.status === 'completed') return 2
  if (row.status === 'pending') return 1
  return 0
}

/** Aynı dilimde (genel+okul yaşam birleşik) tek değerlendiren satırı */
export function mergeEvaluatorCoverageRows(
  a: { status: string; hasScorableResponses: boolean; matrixContext: string },
  b: { status: string; hasScorableResponses: boolean; matrixContext: string }
): { status: string; hasScorableResponses: boolean; matrixContext: string } {
  const ra = coverageRowRank(a)
  const rb = coverageRowRank(b)
  if (ra !== rb) {
    const pick = ra > rb ? a : b
    return { status: pick.status, hasScorableResponses: pick.hasScorableResponses, matrixContext: pick.matrixContext }
  }
  const pick =
    coreMatrixResponsePriority(a.matrixContext) <= coreMatrixResponsePriority(b.matrixContext) ? a : b
  return { status: pick.status, hasScorableResponses: pick.hasScorableResponses, matrixContext: pick.matrixContext }
}

/** Birleştirilmiş satırdan dilim özeti */
export function coverageRowBucket(row: { status: string; hasScorableResponses: boolean }): 'scorable' | 'no_opinion' | 'pending' {
  if (row.status !== 'completed') return 'pending'
  if (row.hasScorableResponses) return 'scorable'
  return 'no_opinion'
}
