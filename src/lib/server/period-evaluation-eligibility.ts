import {
  isPeriodSummaryMatrixContext,
  matrixEvaluationContextLabel,
  normalizeMatrixContext,
} from '@/lib/matrix-evaluation-context'
import { splitResponsesByScope } from '@/lib/server/evaluation-response-scope'
import { canonicalUuid } from '@/lib/server/question-text-resolve'

export type PeriodEligibilityLang = 'tr' | 'en' | 'fr'

/** Genel 360 için yanıtlanan benzersiz dönem soruları (fikrim yok dahil). */
export function distinctPeriodQuestionIdsFromEvaluations(
  evaluations: any[],
  onlyGenelMatrix = true
): Set<string> {
  const ids = new Set<string>()
  for (const e of evaluations || []) {
    if (onlyGenelMatrix && !isPeriodSummaryMatrixContext(e?.matrixContext)) continue
    const rawRows = (e.periodRawResponses || []) as any[]
    if (rawRows.length) {
      rawRows.forEach((r) => {
        const qid = canonicalUuid(r?.question_id) || String(r?.question_id || '').trim()
        if (qid) ids.add(qid)
      })
      continue
    }
    ;((e.answeredQuestionIds || []) as string[]).forEach((raw) => {
      const qid = canonicalUuid(raw) || String(raw || '').trim()
      if (qid) ids.add(qid)
    })
  }
  return ids
}

/**
 * Genel değerlendirme puanına dahil: genel matriste en az bir puanlanabilir cevap
 * ve dönemdeki tüm temel sorular (ör. 21) yanıtlanmış olmalı.
 */
export function qualifiesForCorePeriodEvaluation(
  evaluations: any[],
  expectedPeriodQuestionCount: number
): boolean {
  const genelEvals = (evaluations || []).filter((e) => isPeriodSummaryMatrixContext(e?.matrixContext))
  if (!genelEvals.some((e) => e.hasScorableResponses)) return false
  if (!expectedPeriodQuestionCount || expectedPeriodQuestionCount <= 0) {
    return genelEvals.some((e) => e.hasScorableResponses)
  }
  const ids = distinctPeriodQuestionIdsFromEvaluations(genelEvals, false)
  return ids.size >= expectedPeriodQuestionCount
}

export function clearTargetPeriodScores(r: Record<string, any>) {
  r.hasCorePeriodEvaluation = false
  r.selfScore = 0
  r.peerAvg = 0
  r.overallAvg = 0
  r.overallAvgTrimmed = 0
  r.peerAvgTrimmed = 0
  r.score100 = null
  r.score100Trimmed = null
  r.peerTrimEligible = false
  r.questionCountPeriod = 0
  r.categoryCompare = []
  r.categoryQuestions = {}
  r.swot = {
    self: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
    peer: { strengths: [], weaknesses: [], opportunities: [], recommendations: [] },
  }
  if (Array.isArray(r.matrixSlices)) {
    r.matrixSlices = r.matrixSlices.filter(
      (s: any) => !isPeriodSummaryMatrixContext(String(s?.matrixContext || ''))
    )
  }
  if (Array.isArray(r.evaluations)) {
    r.evaluations = r.evaluations.filter((e: any) => !isPeriodSummaryMatrixContext(e?.matrixContext))
  }
  if (Array.isArray(r.evaluationsAll)) {
    r.evaluationsAll = r.evaluationsAll.filter((e: any) => !isPeriodSummaryMatrixContext(e?.matrixContext))
  }
}

/** Genel atama kartı aslında kısmi / yan görev ise etiketi düzelt. */
export function resolveAssignmentMatrixDisplay(opts: {
  matrixContext: string
  responses: any[]
  dutyOnlyQuestionIds: Set<string>
  expectedPeriodQuestionCount: number
  lang: PeriodEligibilityLang
  primaryDutyLabel?: string | null
}): { matrixContext: string; matrixLabel: string; isCoreGeneralEvaluation: boolean } {
  const mctx = normalizeMatrixContext(opts.matrixContext)
  const { period: periodRows, duty: dutyRows } = splitResponsesByScope(
    opts.responses,
    opts.dutyOnlyQuestionIds
  )
  const periodIds = new Set(
    periodRows
      .map((r) => canonicalUuid(r?.question_id) || String(r?.question_id || '').trim())
      .filter(Boolean)
  )

  if (!isPeriodSummaryMatrixContext(mctx)) {
    return {
      matrixContext: mctx,
      matrixLabel: matrixEvaluationContextLabel(mctx),
      isCoreGeneralEvaluation: false,
    }
  }

  const expected = opts.expectedPeriodQuestionCount
  const full = expected > 0 && periodIds.size >= expected
  if (full) {
    return {
      matrixContext: 'genel',
      matrixLabel: matrixEvaluationContextLabel('genel'),
      isCoreGeneralEvaluation: true,
    }
  }

  if (opts.primaryDutyLabel) {
    return {
      matrixContext: mctx,
      matrixLabel: opts.primaryDutyLabel,
      isCoreGeneralEvaluation: false,
    }
  }

  const answered = periodIds.size || dutyRows.length
  const partialLabel =
    opts.lang === 'en'
      ? `Partial scope (${answered}/${expected || '?'})`
      : opts.lang === 'fr'
        ? `Périmètre partiel (${answered}/${expected || '?'})`
        : `Kısmi kapsam (${answered}/${expected || '?'})`

  return {
    matrixContext: mctx,
    matrixLabel: partialLabel,
    isCoreGeneralEvaluation: false,
  }
}
