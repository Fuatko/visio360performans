'use client'

import { Badge } from '@/components/ui'
import type { EvaluatorCoverageRow, EvaluatorCoverageSlice } from '@/lib/server/evaluation-evaluator-coverage'

type Lang = 'tr' | 'en' | 'fr'

function t(lang: Lang, tr: string, en: string, fr: string) {
  return lang === 'fr' ? fr : lang === 'en' ? en : tr
}

function statusBadge(status: string, hasScorable: boolean, lang: Lang) {
  if (status === 'completed' && hasScorable) {
    return <Badge variant="success">{t(lang, 'Değerlendi', 'Scored', 'Noté')}</Badge>
  }
  if (status === 'completed') {
    return <Badge variant="warning">{t(lang, 'Fikrim yok', 'No opinion', 'Sans avis')}</Badge>
  }
  return <Badge variant="gray">{t(lang, 'Bekliyor', 'Pending', 'En attente')}</Badge>
}

export function EvaluatorCoveragePanel({
  lang = 'tr',
  assigned,
  completedScorable,
  completedNoOpinion,
  pending,
  genelCompleted,
  bySlice,
  rows,
}: {
  lang?: Lang
  assigned: number
  completedScorable: number
  completedNoOpinion?: number
  pending: number
  genelCompleted: number
  bySlice: EvaluatorCoverageSlice[]
  rows: EvaluatorCoverageRow[]
}) {
  if (!assigned && !rows.length) return null

  const noOpinion = completedNoOpinion ?? 0

  return (
    <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="font-semibold text-[var(--foreground)]">
        {t(lang, 'Değerlendiren kapsaması', 'Evaluator coverage', 'Couverture des évaluateurs')}
      </div>
      <p className="text-xs text-[var(--muted)] mt-1 mb-1">
        {t(
          lang,
          'Üst özet benzersiz kişi sayar (10 farklı değerlendiren). Alt tablo dilim bazlıdır; aynı kişi genel + kulüp + sınıf gibi birden fazla satırda görünür — sütunları toplamayın.',
          'Top summary counts unique people. The table is per slice; the same person may appear in multiple rows — do not sum columns.',
          'Le résumé compte des personnes uniques. Le tableau est par tranche ; une même personne peut apparaître sur plusieurs lignes — ne pas additionner les colonnes.'
        )}
      </p>
      <p className="text-xs text-[var(--muted)] mb-3">
        {t(
          lang,
          'Değerlendi: en az bir dilimde puan verdi. Fikrim yok (üst): hiçbir dilimde puan vermedi, yalnızca fikrim yok ile bitirdi. Fikrim yok (tablo): yalnızca o dilimde fikrim yok ile bitirdi (başka dilimde puan vermiş olabilir).',
          'Scored: rated in at least one slice. No opinion (top): never scored, only no-opinion. No opinion (table): no-opinion in that slice only (may have scored elsewhere).',
          'Noté : au moins une tranche notée. Sans avis (haut) : jamais noté. Sans avis (tableau) : sans avis dans cette tranche seulement.'
        )}
      </p>

      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">
        {t(lang, 'Özet — benzersiz değerlendiren', 'Summary — unique evaluators', 'Résumé — évaluateurs uniques')}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
        {[
          { label: t(lang, 'Atanan', 'Assigned', 'Assignés'), value: assigned, className: 'text-[var(--foreground)]' },
          {
            label: t(lang, 'Değerlendi', 'Scored', 'Noté'),
            value: completedScorable,
            className: 'text-emerald-700 dark:text-emerald-400',
          },
          {
            label: t(lang, 'Fikrim yok', 'No opinion', 'Sans avis'),
            value: noOpinion,
            className: 'text-violet-700 dark:text-violet-400',
          },
          {
            label: t(lang, 'Bekleyen', 'Pending', 'En attente'),
            value: pending,
            className: 'text-amber-700 dark:text-amber-400',
          },
          {
            label: t(lang, 'Genel dilim', 'General slice', 'Tranche générale'),
            value: genelCompleted,
            className: 'text-[var(--foreground)]',
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-center">
            <div className="text-[10px] uppercase tracking-wide text-[var(--muted)]">{item.label}</div>
            <div className={`text-xl font-bold mt-1 ${item.className}`}>{item.value}</div>
          </div>
        ))}
      </div>

      {assigned > 0 && completedScorable + noOpinion + pending !== assigned ? (
        <p className="text-[10px] text-[var(--muted)] mb-3 -mt-2">
          {t(
            lang,
            `Toplam: ${completedScorable} değerlendi + ${noOpinion} fikrim yok + ${pending} bekleyen = ${completedScorable + noOpinion + pending} / ${assigned} atanan`,
            `Total: ${completedScorable} scored + ${noOpinion} no opinion + ${pending} pending = ${completedScorable + noOpinion + pending} / ${assigned} assigned`,
            `Total : ${completedScorable} noté + ${noOpinion} sans avis + ${pending} en attente = ${completedScorable + noOpinion + pending} / ${assigned} assignés`
          )}
        </p>
      ) : null}

      {bySlice.length > 0 ? (
        <div className="overflow-x-auto mb-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">
            {t(
              lang,
              'Dilim bazlı dağılım (satırlar toplanmaz)',
              'Per-slice breakdown (rows are not additive)',
              'Répartition par tranche (lignes non cumulables)'
            )}
          </div>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-[var(--muted)] border-b border-[var(--border)]">
                <th className="py-2 pr-3 font-medium">{t(lang, 'Dilim', 'Slice', 'Tranche')}</th>
                <th className="py-2 px-2 font-medium text-center">{t(lang, 'Atanan', 'Assigned', 'Assignés')}</th>
                <th className="py-2 px-2 font-medium text-center">{t(lang, 'Değerlendi', 'Scored', 'Noté')}</th>
                <th className="py-2 px-2 font-medium text-center">{t(lang, 'Fikrim yok', 'No opinion', 'Sans avis')}</th>
                <th className="py-2 pl-2 font-medium text-center">{t(lang, 'Bekleyen', 'Pending', 'En attente')}</th>
              </tr>
            </thead>
            <tbody>
              {bySlice.map((slice) => (
                <tr key={slice.matrixContext} className="border-b border-[var(--border)]/60">
                  <td className="py-2 pr-3 font-medium text-[var(--foreground)]">{slice.matrixLabel}</td>
                  <td className="py-2 px-2 text-center">{slice.assigned}</td>
                  <td className="py-2 px-2 text-center text-emerald-700 dark:text-emerald-400">{slice.completedScorable}</td>
                  <td className="py-2 px-2 text-center text-violet-700 dark:text-violet-400">
                    {slice.completedNoOpinion ?? 0}
                  </td>
                  <td className="py-2 pl-2 text-center text-amber-700 dark:text-amber-400">{slice.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-[var(--muted)] mt-2">
            {t(
              lang,
              `Örnek: tabloda fikrim yok toplamı ${bySlice.reduce((n, s) => n + (s.completedNoOpinion ?? 0), 0)} dilim-girişi; üst kutuda ${noOpinion} kişi hiç puan vermedi.`,
              `Example: table no-opinion sum is ${bySlice.reduce((n, s) => n + (s.completedNoOpinion ?? 0), 0)} slice entries; top box is ${noOpinion} people who never scored.`,
              `Exemple : total sans avis tableau = ${bySlice.reduce((n, s) => n + (s.completedNoOpinion ?? 0), 0)} entrées tranche ; haut = ${noOpinion} personnes jamais notées.`
            )}
          </p>
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
