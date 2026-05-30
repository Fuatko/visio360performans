'use client'

import { Card, CardBody } from '@/components/ui'
import { SlidersHorizontal } from 'lucide-react'
import { EvaluatorScopeEditor } from '@/components/admin/evaluator-scope-editor'
import type { MatrixProfileId } from '@/lib/org-matrix-profile'

export function EvaluatorScopePanel({
  periodId,
  matrixProfileId = 'school_full',
  scopePanelHint,
}: {
  periodId: string
  matrixProfileId?: MatrixProfileId
  scopePanelHint?: string
}) {
  return (
    <Card className="mb-6 border-violet-200/80 bg-violet-50/25">
      <CardBody className="space-y-4">
        <div>
          <div className="font-semibold text-sm text-gray-900 flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-violet-700" />
            Değerlendiren soru kapsamı (toplu)
          </div>
          <p className="text-xs text-gray-600 mt-1 max-w-3xl">
            {scopePanelHint ||
              'Önce kapsam şablonu ile toplu uygulayın; matris Excel ile karışmasın. Satır bazlı istisna için listeden Soru kapsamı.'}
          </p>
        </div>
        <EvaluatorScopeEditor periodId={periodId} matrixProfileId={matrixProfileId} />
      </CardBody>
    </Card>
  )
}
