'use client'

import { EvaluatorScopeEditor } from '@/components/admin/evaluator-scope-editor'
import { X } from 'lucide-react'

export function EvaluatorScopeModal({
  open,
  onClose,
  periodId,
  evaluatorId,
  targetId,
  matrixContext = '',
  evaluatorName,
  targetName,
}: {
  open: boolean
  onClose: () => void
  periodId: string
  evaluatorId: string
  targetId: string
  matrixContext?: string
  evaluatorName: string
  targetName: string
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold text-gray-900">Soru kapsamı</h2>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">
          <EvaluatorScopeEditor
            key={`${periodId}-${evaluatorId}-${targetId}-${matrixContext || 'genel'}`}
            periodId={periodId}
            initialEvaluatorId={evaluatorId}
            initialTargetId={targetId}
            initialMatrixContext={matrixContext}
            lockEvaluator
            evaluatorLabel={evaluatorName}
            targetLabel={targetName}
            compact
          />
        </div>
      </div>
    </div>
  )
}
