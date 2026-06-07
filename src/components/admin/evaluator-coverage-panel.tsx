'use client'

import { Badge } from '@/components/ui'
import type { EvaluatorCoverageRow, EvaluatorCoverageSlice } from '@/lib/server/evaluation-evaluator-coverage'

type Lang = 'tr' | 'en' | 'fr'

function t(lang: Lang, tr: string, en: string, fr: string) {
  return lang === 'fr' ? fr : lang === 'en' ? en : tr
}

function statusBadge(status: string, hasScorable: boolean, lang: Lang) {
  if (status === 'completed' && hasScorable) {
    return <Badge variant="success">{t(lang, 'Tamamlandı', 'Completed', 'Terminé')}</Badge>
  }
  if (status === 'completed') {
    return <Badge variant="warning">{t(lang, 'Tamam (puansız)', 'Done (no score)', 'Terminé (sans note)')}</Badge>
  }
  return <Badge variant="gray">{t(lang, 'Bekliyor', 'Pending', 'En attente')}</Badge>
}

export function EvaluatorCoveragePanel({
  lang = 'tr',
  assigned,
  completedScorable,
  pending,
  genelCompleted,
  bySlice,
  rows,
}: {
  lang?: Lang
  assigned: number
  completedScorable: number
  pending: number
  genelCompleted: number
  bySlice: EvaluatorCoverageSlice[]
  rows: EvaluatorCoverageRow[]
}) {
  if (!assigned && !rows.length) return null

  return (
    <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="font-semibold text-[var(--foreground)]">
        {t(lang, 'Değerlendiren kapsaması', 'Evaluator coverage', 'Couverture des évaluateurs')}
      </div>
      <p className="text-xs text-[var(--muted)] mt-1 mb-3">
        {t(
          lang,
          'Benzersiz değerlendiren sayıları. Bekleyen: henüz formu tamamlamayan. Tamamlanan: puanlanabilir cevap veren.',
          'Unique evaluator counts. Pending: form not submitted. Completed: at least one scorable answer.',
          'Comptes d’évaluateurs uniques. En attente : formulaire non soumis. Terminé : au moins une réponse notée.'
        )}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {[
          { label: t(lang, 'Atanan', 'Assigned', 'Assignés'), value: assigned, variant: 'info' as const },
          {
            label: t(lang, 'Tamamlanan', 'Completed', 'Terminés'),
            value: completedScorable,
            variant: 'success' as const,
          },
          { label: t(lang, 'Bekleyen', 'Pending', 'En attente'), value: pending, variant: 'warning' as const },
          {
            label: t(lang, 'Genel dilim', 'General slice', 'Tranche générale'),
            value: genelCompleted,
            variant: 'gray' as const,
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-center">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{item.label}</div>
            <div className="text-xl font-bold text-[var(--foreground)] mt-1">{item.value}</div>
          </div>
        ))}
      </div>

      {bySlice.length > 0 ? (
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-medium">{t(lang, 'Dilim', 'Slice', 'Tranche')}</th>
                <th className="py-2 px-3 font-medium text-center">{t(lang, 'Atanan', 'Assigned', 'Assignés')}</th>
                <th className="py-2 px-3 font-medium text-center">{t(lang, 'Tamamlanan', 'Completed', 'Terminés')}</th>
                <th className="py-2 pl-3 font-medium text-center">{t(lang, 'Bekleyen', 'Pending', 'En attente')}</th>
              </tr>
            </thead>
            <tbody>
              {bySlice.map((slice) => (
                <tr key={slice.matrixContext} className="border-b border-[var(--border)]/60">
                  <td className="py-2 pr-3 font-medium text-[var(--foreground)]">{slice.matrixLabel}</td>
                  <td className="py-2 px-3 text-center">{slice.assigned}</td>
                  <td className="py-2 px-3 text-center text-emerald-700 dark:text-emerald-400">{slice.completedScorable}</td>
                  <td className="py-2 pl-3 text-center text-amber-700 dark:text-amber-400">{slice.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-[var(--brand)] hover:underline">
            {t(lang, 'Atama detayı', 'Assignment detail', 'Détail des assignations')} ({rows.length})
          </summary>
          <div className="overflow-x-auto mt-3 max-h-72 overflow-y-auto">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-[var(--surface)]">
                <tr className="text-left text-[var(--muted)] border-b border-[var(--border)]">
                  <th className="py-2 pr-2 font-medium">{t(lang, 'Değerlendiren', 'Evaluator', 'Évaluateur')}</th>
                  <th className="py-2 px-2 font-medium">{t(lang, 'Dilim', 'Slice', 'Tranche')}</th>
                  <th className="py-2 pl-2 font-medium">{t(lang, 'Durum', 'Status', 'Statut')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.evaluatorId}-${row.matrixContext}-${i}`} className="border-b border-[var(--border)]/40">
                    <td className="py-1.5 pr-2 text-[var(--foreground)]">{row.evaluatorName}</td>
                    <td className="py-1.5 px-2 text-[var(--muted)]">{row.matrixLabel}</td>
                    <td className="py-1.5 pl-2">{statusBadge(row.status, row.hasScorableResponses, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  )
}
