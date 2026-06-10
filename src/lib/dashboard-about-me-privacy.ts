import {
  DEFAULT_MATRIX_EVALUATION_CONTEXT,
  matrixEvaluationContextLabel,
  normalizeMatrixContext,
} from '@/lib/matrix-evaluation-context'
import { userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'

export type AboutMeAssignmentPublic = {
  id: string
  period_id?: string
  target_id?: string
  status?: string
  slug?: string | null
  completed_at?: string | null
  created_at?: string | null
  matrix_context?: string | null
  isSelf: boolean
  displayLabel: string
  evaluation_periods?: {
    name?: string | null
    name_en?: string | null
    name_fr?: string | null
    status?: string | null
  } | null
}

function msg(lang: string, tr: string, en: string, fr: string) {
  if (lang === 'fr') return fr
  if (lang === 'en') return en
  return tr
}

/** Değerlendirilen kişiye gösterilecek anonim etiket — değerlendiren adı asla dönmez. */
export function aboutMeDisplayLabel(
  assignment: { evaluator_id?: string | null; target_id?: string | null; matrix_context?: string | null },
  lang = 'tr'
): string {
  const isSelf = userIdsEqualForSelfEval(assignment.evaluator_id, assignment.target_id)
  if (isSelf) {
    return msg(lang, 'Öz değerlendirme', 'Self evaluation', 'Auto-évaluation')
  }
  const ctx = normalizeMatrixContext(assignment.matrix_context)
  const slice = matrixEvaluationContextLabel(ctx)
  if (ctx === DEFAULT_MATRIX_EVALUATION_CONTEXT) {
    return msg(lang, 'Ekip değerlendirmesi (anonim)', 'Team evaluation (anonymous)', 'Évaluation d’équipe (anonyme)')
  }
  return msg(
    lang,
    `${slice} değerlendirmesi (anonim)`,
    `${slice} evaluation (anonymous)`,
    `Évaluation ${slice} (anonyme)`
  )
}

export function sanitizeAboutMeAssignmentsForUser(
  rows: any[],
  lang = 'tr'
): AboutMeAssignmentPublic[] {
  return (rows || []).map((a) => ({
    id: String(a.id || ''),
    period_id: a.period_id,
    target_id: a.target_id,
    status: a.status,
    slug: a.slug ?? null,
    completed_at: a.completed_at ?? null,
    created_at: a.created_at ?? null,
    matrix_context: a.matrix_context ?? null,
    isSelf: userIdsEqualForSelfEval(a.evaluator_id, a.target_id),
    displayLabel: aboutMeDisplayLabel(a, lang),
    evaluation_periods: a.evaluation_periods ?? null,
  }))
}
