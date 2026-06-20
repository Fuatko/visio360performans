'use client'

import { Fragment, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui'
import { t } from '@/lib/i18n'
import type { MatrixStructurePersonScore } from '@/lib/server/matrix-structure-scoring'

export function scoreBadgeVariant(score: number): 'success' | 'warning' | 'danger' | 'info' | 'gray' {
  if (score >= 4) return 'success'
  if (score >= 3.5) return 'info'
  if (score >= 3) return 'warning'
  if (score > 0) return 'danger'
  return 'gray'
}

export function matrixContextDisplayLabel(ctx: string, lang: 'tr' | 'en' | 'fr') {
  if (ctx === 'okul_yasam') return t('matrixStructureMatrixContextOkulYasam', lang)
  if (ctx === 'genel') return t('matrixStructureMatrixContextGenel', lang)
  return ctx
}

type MatrixPersonScoreCardProps = {
  row: MatrixStructurePersonScore
  rank?: number
  showRank?: boolean
  categoryColumns: Array<{ key: string; label: string }>
  expanded: boolean
  onToggle: () => void
  lang: 'tr' | 'en' | 'fr'
  sectionLabel?: string
  nested?: boolean
}

export function MatrixPersonScoreCard({
  row,
  rank,
  showRank = true,
  categoryColumns,
  expanded,
  onToggle,
  lang,
  sectionLabel,
  nested = false,
}: MatrixPersonScoreCardProps) {
  const catByKey = new Map(row.categories.map((c) => [c.categoryKey, c.peerAvg]))
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null)

  useEffect(() => {
    if (!expanded) setExpandedQuestionId(null)
  }, [expanded])

  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden ${
        nested ? 'border-dashed' : ''
      }`}
    >
      {sectionLabel ? (
        <div className="px-3 py-2 sm:px-4 bg-amber-500/5 border-b border-[var(--border)]/60 text-xs font-semibold text-amber-900 dark:text-amber-200">
          {sectionLabel}
        </div>
      ) : null}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-3 sm:px-4 border-b border-[var(--border)]/60 bg-[var(--surface-2)]/30">
        {showRank && rank != null ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sky-500/10 text-xs font-bold text-sky-800 dark:text-sky-200">
            {rank}
          </span>
        ) : null}
        {!showRank && !sectionLabel ? (
          <div className="min-w-0 flex-1 basis-[12rem]">
            <div className="text-xs text-[var(--muted)]">{row.targetName}</div>
          </div>
        ) : null}
        {showRank ? (
          <div className="min-w-0 flex-1 basis-[12rem]">
            <div className="font-semibold text-[var(--foreground)] leading-snug">{row.targetName}</div>
            <div className="text-xs text-[var(--muted)] mt-0.5 leading-snug">{row.targetDept}</div>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2 shrink-0 ml-auto">
          <div className="text-center px-1">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
              {lang === 'en' ? 'Score' : lang === 'fr' ? 'Score' : 'Puan'}
            </div>
            <Badge variant={scoreBadgeVariant(row.overallPeerAvg)} className="mt-0.5 tabular-nums">
              {row.overallPeerAvg.toFixed(2)}
            </Badge>
          </div>
          <div className="text-center px-1">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">
              {lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Soru'}
            </div>
            <div className="text-sm font-semibold tabular-nums mt-1">{row.answeredQuestionCount}</div>
          </div>
          {row.questions.length > 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              onClick={onToggle}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {lang === 'en' ? 'Questions' : lang === 'fr' ? 'Questions' : 'Sorular'}
            </button>
          ) : null}
        </div>
      </div>

      {categoryColumns.length > 0 ? (
        <div className="px-3 py-3 sm:px-4">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">
            {lang === 'en' ? 'Category scores' : lang === 'fr' ? 'Scores par catégorie' : 'Kategori puanları'}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2">
            {categoryColumns.map((c) => {
              const v = catByKey.get(c.key)
              return (
                <div
                  key={c.key}
                  className="rounded-lg border border-[var(--border)]/80 bg-[var(--surface-2)]/40 px-2 py-2 text-center min-w-0"
                  title={c.label}
                >
                  <div className="text-[10px] leading-snug text-[var(--muted)] line-clamp-2 min-h-[2.5em] flex items-center justify-center">
                    {c.label}
                  </div>
                  <div
                    className={`text-sm font-bold tabular-nums mt-1 ${
                      v != null && v > 0
                        ? v >= 4
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : v >= 3.5
                            ? 'text-sky-700 dark:text-sky-400'
                            : 'text-[var(--foreground)]'
                        : 'text-[var(--muted)] font-normal'
                    }`}
                  >
                    {v != null && v > 0 ? v.toFixed(2) : '—'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {expanded && row.questions.length > 0 ? (
        <div className="px-3 pb-3 sm:px-4 sm:pb-4 border-t border-[var(--border)]/60 bg-[var(--surface-2)]/20">
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mb-2">
            <div className="text-[10px] font-semibold text-[var(--muted)] uppercase tracking-wide">
              {lang === 'en' ? 'Question-level averages' : lang === 'fr' ? 'Moyennes par question' : 'Soru bazlı ortalamalar'}
            </div>
            <div className="text-[10px] text-[var(--muted)]">{t('matrixStructureClickQuestionHint', lang)}</div>
          </div>
          <div className="rounded-lg border border-[var(--border)] overflow-hidden max-h-[28rem] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--surface-2)] sticky top-0">
                <tr>
                  <th className="text-left py-2 px-3 w-6" />
                  <th className="text-left py-2 px-3">{lang === 'en' ? 'Category' : lang === 'fr' ? 'Catégorie' : 'Kategori'}</th>
                  <th className="text-left py-2 px-3">{lang === 'en' ? 'Question' : lang === 'fr' ? 'Question' : 'Soru'}</th>
                  <th className="text-center py-2 px-3 whitespace-nowrap">{lang === 'en' ? 'Exact' : lang === 'fr' ? 'Exact' : 'Tam'}</th>
                  <th className="text-center py-2 px-3">{lang === 'en' ? 'Avg' : lang === 'fr' ? 'Moy.' : 'Ort.'}</th>
                  <th className="text-center py-2 px-3">n</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]/60">
                {row.questions.map((q) => {
                  const hasScorers = (q.scorers?.length || 0) > 0
                  const questionExpanded = expandedQuestionId === q.questionId
                  return (
                    <Fragment key={q.questionId}>
                      <tr
                        className={
                          hasScorers
                            ? 'cursor-pointer hover:bg-[var(--surface-2)]/70 transition-colors'
                            : ''
                        }
                        onClick={() => {
                          if (!hasScorers) return
                          setExpandedQuestionId(questionExpanded ? null : q.questionId)
                        }}
                      >
                        <td className="py-1.5 px-2 text-[var(--muted)] align-top">
                          {hasScorers ? (
                            <ChevronRight
                              className={`w-3.5 h-3.5 transition-transform ${questionExpanded ? 'rotate-90' : ''}`}
                            />
                          ) : null}
                        </td>
                        <td className="py-1.5 px-3 text-[var(--muted)] align-top">{q.categoryLabel}</td>
                        <td className="py-1.5 px-3 text-[var(--foreground)] align-top leading-snug">{q.questionText}</td>
                        <td className="py-1.5 px-3 text-center font-mono text-[10px] text-[var(--muted)] whitespace-nowrap align-top">
                          {q.peerAvgExact.toFixed(6)}
                        </td>
                        <td className="py-1.5 px-3 text-center font-semibold align-top">{q.peerAvg.toFixed(2)}</td>
                        <td className="py-1.5 px-3 text-center text-[var(--muted)] align-top">{q.scorerCount}</td>
                      </tr>
                      {questionExpanded && hasScorers ? (
                        <tr className="bg-sky-500/5">
                          <td colSpan={6} className="px-3 py-2">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-1.5 pl-5">
                              {t('matrixStructureQuestionScorersTitle', lang)} ({q.scorers!.length})
                            </div>
                            <div className="pl-5 space-y-1">
                              {q.scorers!.map((scorer) => (
                                <div
                                  key={scorer.evaluatorId}
                                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[var(--border)]/70 bg-[var(--surface)] px-2.5 py-1.5"
                                >
                                  <span className="font-medium text-[var(--foreground)] min-w-0 flex-1">
                                    {scorer.evaluatorName}
                                  </span>
                                  <Badge variant={scoreBadgeVariant(scorer.score)} className="tabular-nums shrink-0">
                                    {scorer.score.toFixed(2)}
                                  </Badge>
                                  <span className="text-[10px] text-[var(--muted)] shrink-0">
                                    {matrixContextDisplayLabel(scorer.matrixContext, lang)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  )
}
