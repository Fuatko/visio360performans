import { matrixEvaluationContextLabel } from '@/lib/matrix-evaluation-context'
import type { MatrixPersonResultsReportPayload } from '@/lib/server/matrix-person-results-report-build'

export type MatrixDutyLeaderboardPerson = {
  targetId: string
  targetName: string
  targetDept: string
  score: number
  answeredQuestionCount: number
}

export type MatrixDutyLeaderboardSection = {
  matrixContext: string
  label: string
  top: MatrixDutyLeaderboardPerson[]
  bottom: MatrixDutyLeaderboardPerson[]
  participantCount: number
}

export type MatrixDutyLeaderboardsReport = {
  sections: MatrixDutyLeaderboardSection[]
}

const DEFAULT_HIGHLIGHT_COUNT = 10

function roundScore(n: number) {
  return Math.round(n * 100) / 100
}

export function buildMatrixDutyLeaderboardsReport(
  data: Pick<MatrixPersonResultsReportPayload, 'dutyContextOrder' | 'people'> | null | undefined,
  opts?: { highlightCount?: number }
): MatrixDutyLeaderboardsReport {
  const highlightCount = opts?.highlightCount ?? DEFAULT_HIGHLIGHT_COUNT
  if (!data?.people?.length) return { sections: [] }

  const contextOrder = data.dutyContextOrder?.length
    ? [...data.dutyContextOrder]
    : [
        ...new Set(
          data.people.flatMap((p) => p.dutySlices.map((d) => d.matrixContext))
        ),
      ]

  const sections: MatrixDutyLeaderboardSection[] = []

  for (const matrixContext of contextOrder) {
    const people: MatrixDutyLeaderboardPerson[] = []
    for (const person of data.people) {
      const slice = person.dutySlices.find((d) => d.matrixContext === matrixContext)
      if (!slice) continue
      const score = Number(slice.score.overallPeerAvg || 0)
      const answeredQuestionCount = Number(slice.score.answeredQuestionCount || 0)
      if (!Number.isFinite(score) || score <= 0 || answeredQuestionCount <= 0) continue
      people.push({
        targetId: person.targetId,
        targetName: person.targetName,
        targetDept: person.targetDept,
        score: roundScore(score),
        answeredQuestionCount,
      })
    }
    if (!people.length) continue

    people.sort((a, b) => b.score - a.score || a.targetName.localeCompare(b.targetName, 'tr'))
    const label =
      data.people
        .flatMap((p) => p.dutySlices)
        .find((d) => d.matrixContext === matrixContext)?.matrixContextLabel ||
      matrixEvaluationContextLabel(matrixContext)

    sections.push({
      matrixContext,
      label,
      participantCount: people.length,
      top: people.slice(0, highlightCount),
      bottom: [...people].reverse().slice(0, highlightCount),
    })
  }

  return { sections }
}
