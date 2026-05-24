'use client'

import { X, ListChecks } from 'lucide-react'
import type { MatrixScopeReportRow } from '@/app/api/admin/matrix-scope-report/route'
import { matrixEvaluationContextLabel } from '@/lib/matrix-evaluation-context'

export function MatrixScopePreviewModal({
  open,
  onClose,
  row,
  onEditScope,
}: {
  open: boolean
  onClose: () => void
  row: MatrixScopeReportRow | null
  onEditScope?: () => void
}) {
  if (!open || !row) return null

  const p = row.preview
  const mctx = row.matrix_context || p.matrix_context
  const matrixTitle = mctx && mctx !== 'genel' ? matrixEvaluationContextLabel(mctx) : null
  const periodRows = p.breakdown.filter((b) => b.scope_kind === 'period')
  const dutyRows = p.breakdown.filter((b) => b.scope_kind === 'duty')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ListChecks className="w-5 h-5 text-violet-600" />
              Puanlanacak içerik
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              <strong>{row.evaluator_name}</strong>
              <span className="text-gray-400 mx-1">→</span>
              <strong>{row.target_name}</strong>
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3">
            <div className="text-2xl font-bold text-violet-900">{p.question_count} soru</div>
            <div className="text-xs text-violet-800 mt-1">
              Genel: {p.period_question_count} · Yan görev: {p.duty_question_count}
            </div>
            {matrixTitle ? (
              <div className="text-xs font-medium text-violet-900 mt-2">Matris: {matrixTitle}</div>
            ) : null}
            <div className="text-xs text-gray-700 mt-2">
              <strong>Kapsam:</strong> {p.scope_label}
            </div>
          </div>

          {p.duty_package_labels.length > 0 ? (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Bu değerlendirmede puanlanan yan görev paketi
              </div>
              <p className="text-gray-800">{p.duty_package_labels.join(' · ')}</p>
            </div>
          ) : null}

          {p.target_duty_names.length > 0 ? (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Hedefin tüm görev atamaları (bilgi — Excel)
              </div>
              <p className="text-gray-600 text-xs">{p.target_duty_names.join(', ')}</p>
              {p.duty_package_labels.length > 0 && p.target_duty_names.length > p.duty_package_labels.length ? (
                <p className="text-xs text-gray-500 mt-1">
                  Sınıf öğretmeni vb. diğer paketler bu matris satırında puanlanmaz.
                </p>
              ) : null}
            </div>
          ) : null}

          {p.period_category_labels.length > 0 ? (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Seçili genel alt kategoriler (kapsam)
              </div>
              <p className="text-gray-800">{p.period_category_labels.join(' · ')}</p>
            </div>
          ) : null}

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Formda görünecek kategoriler (puanlanacak)
            </div>
            {p.breakdown.length === 0 ? (
              <p className="text-gray-500 text-xs">Bu çift için soru bulunamadı veya önizleme hesaplanamadı.</p>
            ) : (
              <ul className="space-y-2">
                {periodRows.length > 0 ? (
                  <li>
                    <div className="font-medium text-gray-800 mb-1">Genel değerlendirme</div>
                    <ul className="pl-3 border-l-2 border-blue-200 space-y-1">
                      {periodRows.map((b) => (
                        <li key={`p-${b.category_id}`} className="flex justify-between gap-2 text-gray-700">
                          <span>{b.category_name}</span>
                          <span className="font-mono text-xs text-gray-500 shrink-0">{b.question_count} soru</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : null}
                {dutyRows.length > 0 ? (
                  <li>
                    <div className="font-medium text-gray-800 mb-1">Yan görev / ek görev</div>
                    <ul className="pl-3 border-l-2 border-violet-200 space-y-1">
                      {dutyRows.map((b) => (
                        <li key={`d-${b.category_id}`} className="flex justify-between gap-2 text-gray-700">
                          <span>{b.category_name}</span>
                          <span className="font-mono text-xs text-gray-500 shrink-0">{b.question_count} soru</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ) : null}
              </ul>
            )}
          </div>

          {onEditScope ? (
            <button
              type="button"
              onClick={onEditScope}
              className="text-sm text-violet-700 hover:underline font-medium"
            >
              Soru kapsamını düzenle →
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
