'use client'

import { Badge, Card, CardBody, CardHeader, CardTitle } from '@/components/ui'
import { MatrixSliceCategoryAccordions } from '@/components/admin/matrix-slice-category-accordions'
import { ReportPurposeNote } from '@/components/admin/report-purpose-note'

export interface PersonReportSlice {
  periodId: string
  periodName: string
  assessmentKind: string
  assessmentLabel: string
  matrixContext: string
  matrixLabel: string
  isDutyMatrix?: boolean
  overallAvg: number
  peerAvg: number
  peerAvgTrimmed?: number
  overallAvgTrimmed?: number
  score100?: number | null
  score100Trimmed?: number | null
  evaluatorCount: number
  peerEvaluatorCount?: number
  standardAvg: number
  swot: { peer: { strengths: { name: string; score: number }[]; weaknesses: { name: string; score: number }[] } }
  aiSummary: string
  categoryCompare?: { name: string; self?: number; peer: number; diff?: number; peerTrimmed?: number }[]
}

export interface PersonReportPeriodGroup {
  periodId: string
  periodName: string
  startDate?: string | null
  endDate?: string | null
  assessmentKind: string
  assessmentLabel: string
  slices: PersonReportSlice[]
}

export interface PersonReportCardData {
  person: { id: string; name: string; department?: string | null; title?: string | null }
  periodGroups?: PersonReportPeriodGroup[]
  cards: PersonReportSlice[]
  summary: {
    narrative: string
    commonStrengths: { name: string; count: number }[]
    commonRisks: { name: string; count: number }[]
  }
}

function scoreColorClass(score: number) {
  if (score >= 4) return 'text-emerald-600'
  if (score >= 3) return 'text-blue-600'
  if (score >= 2) return 'text-amber-600'
  return 'text-red-600'
}

function groupPeriods(data: PersonReportCardData): PersonReportPeriodGroup[] {
  if (data.periodGroups?.length) return data.periodGroups
  return Object.values(
    (data.cards || []).reduce(
      (acc, slice) => {
        const pid = slice.periodId
        if (!acc[pid]) {
          acc[pid] = {
            periodId: pid,
            periodName: slice.periodName,
            assessmentKind: slice.assessmentKind,
            assessmentLabel: slice.assessmentLabel,
            slices: [],
          }
        }
        acc[pid].slices.push(slice)
        return acc
      },
      {} as Record<string, PersonReportPeriodGroup>
    )
  )
}

export function PersonReportCardPanel({
  data,
  onClose,
  embedded = false,
}: {
  data: PersonReportCardData
  onClose?: () => void
  embedded?: boolean
}) {
  const groups = groupPeriods(data)

  return (
    <Card className={embedded ? 'border-[var(--border)]' : 'mb-0 shadow-2xl'}>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 w-full">
          <div className="min-w-0">
            <CardTitle id="person-report-card-title">Karşılaştırmalı Kişi Karnesi</CardTitle>
            <ReportPurposeNote purposeKey="reportPurpose_karsiKarne" />
            <div className="text-sm text-[var(--muted)] mt-1">
              {data.person?.name}
              {data.person?.department ? ` • ${data.person.department}` : ''}
              {data.person?.title ? ` • ${data.person.title}` : ''}
            </div>
          </div>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface)]"
            >
              Kapat
            </button>
          ) : null}
        </div>
      </CardHeader>
      <CardBody>
        <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
          <div className="text-sm font-semibold text-[var(--foreground)]">Yönetici özeti</div>
          <p className="text-sm text-[var(--muted)] mt-1">{data.summary?.narrative}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
            <div>
              <div className="text-xs font-semibold text-[var(--muted)] mb-1">Ortak güçlü alanlar</div>
              <div className="flex flex-wrap gap-2">
                {(data.summary?.commonStrengths || []).length ? (
                  data.summary.commonStrengths.map((x) => (
                    <Badge key={x.name} variant="success">
                      {x.name} ({x.count})
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-[var(--muted)]">Yeterli veri yok</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--muted)] mb-1">Ortak gelişim/risk alanları</div>
              <div className="flex flex-wrap gap-2">
                {(data.summary?.commonRisks || []).length ? (
                  data.summary.commonRisks.map((x) => (
                    <Badge key={x.name} variant="warning">
                      {x.name} ({x.count})
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-[var(--muted)]">Yeterli veri yok</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.periodId} className="border border-[var(--border)] rounded-2xl p-4 bg-[var(--surface)]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <div className="font-semibold text-lg text-[var(--foreground)]">{group.periodName}</div>
                  <Badge variant={group.assessmentKind === 'job_evaluation' ? 'warning' : 'info'} className="mt-1">
                    {group.assessmentLabel}
                  </Badge>
                </div>
                <div className="text-xs text-[var(--muted)]">
                  {group.slices.length} rapor dilimi — genel ve yan görevler yan yana
                </div>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
                {group.slices.map((slice) => (
                  <div
                    key={`${slice.periodId}-${slice.matrixContext}`}
                    className={`min-w-[280px] max-w-[320px] flex-shrink-0 snap-start rounded-2xl border p-4 ${
                      slice.isDutyMatrix
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-[var(--brand)]/30 bg-[var(--surface-2)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-[var(--foreground)] leading-tight">{slice.matrixLabel}</div>
                        <div className="text-[10px] uppercase tracking-wide text-[var(--muted)] mt-1">
                          {slice.isDutyMatrix ? 'Yan görev' : 'Genel değerlendirme'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`text-2xl font-bold ${scoreColorClass(slice.overallAvgTrimmed || slice.overallAvg || 0)}`}
                        >
                          {(slice.overallAvgTrimmed || slice.overallAvg || 0).toFixed(1)}
                        </div>
                        <div className="text-[10px] text-[var(--muted)]">trim ort.</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div className="rounded-lg bg-[var(--surface)] p-2">
                        <div className="text-[10px] text-[var(--muted)]">Ekip</div>
                        <div className="font-bold text-sm">{(slice.peerAvg || 0).toFixed(1)}</div>
                      </div>
                      <div className="rounded-lg bg-[var(--surface)] p-2">
                        <div className="text-[10px] text-[var(--muted)]">/100 trim</div>
                        <div className="font-bold text-sm">
                          {slice.score100Trimmed != null ? Number(slice.score100Trimmed).toFixed(0) : '—'}
                        </div>
                      </div>
                      <div className="rounded-lg bg-[var(--surface)] p-2">
                        <div className="text-[10px] text-[var(--muted)]">Değerlendirici</div>
                        <div className="font-bold text-sm">{slice.peerEvaluatorCount ?? slice.evaluatorCount ?? 0}</div>
                      </div>
                      <div className="rounded-lg bg-[var(--surface)] p-2">
                        <div className="text-[10px] text-[var(--muted)]">Standart</div>
                        <div className="font-bold text-sm">{(slice.standardAvg || 0).toFixed(1)}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-2 mt-3">
                      <div>
                        <div className="text-[10px] font-semibold text-[var(--muted)] mb-1">SWOT — Güçlü</div>
                        <div className="space-y-0.5">
                          {(slice.swot?.peer?.strengths || []).slice(0, 3).map((x) => (
                            <div key={x.name} className="text-xs flex justify-between gap-1">
                              <span className="truncate">{x.name}</span>
                              <span className="font-semibold shrink-0">{x.score.toFixed(1)}</span>
                            </div>
                          ))}
                          {!(slice.swot?.peer?.strengths || []).length ? (
                            <span className="text-xs text-[var(--muted)]">—</span>
                          ) : null}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-[var(--muted)] mb-1">SWOT — Gelişim</div>
                        <div className="space-y-0.5">
                          {(slice.swot?.peer?.weaknesses || []).slice(0, 3).map((x) => (
                            <div key={x.name} className="text-xs flex justify-between gap-1">
                              <span className="truncate">{x.name}</span>
                              <span className="font-semibold shrink-0">{x.score.toFixed(1)}</span>
                            </div>
                          ))}
                          {!(slice.swot?.peer?.weaknesses || []).length ? (
                            <span className="text-xs text-[var(--muted)]">—</span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 text-[11px] text-[var(--muted)] border-t border-[var(--border)] pt-2 line-clamp-3">
                      {slice.aiSummary}
                    </div>
                  </div>
                ))}
              </div>
              <MatrixSliceCategoryAccordions slices={group.slices} showSelf={false} defaultOpenFirst />
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  )
}
