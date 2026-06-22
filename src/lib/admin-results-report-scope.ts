import { normalizeAssessmentKind } from '@/lib/evaluation-period-kind'

/** Admin sonuç raporu menüsünde dönem türüne göre filtreleme */
export type AssessmentReportScope = 'job_evaluation' | 'development_360'

export function assessmentKindToReportScope(assessmentKind: unknown): AssessmentReportScope {
  return normalizeAssessmentKind(assessmentKind) === 'job_evaluation' ? 'job_evaluation' : 'development_360'
}

export function isJobEvaluationReportScope(assessmentKind: unknown): boolean {
  return assessmentKindToReportScope(assessmentKind) === 'job_evaluation'
}

export function reportSectionMatchesAssessmentKind(
  assessmentKindScope: AssessmentReportScope | undefined,
  selectedAssessmentKind: unknown
): boolean {
  if (!assessmentKindScope) return true
  if (selectedAssessmentKind == null || selectedAssessmentKind === '') return true
  return assessmentKindScope === assessmentKindToReportScope(selectedAssessmentKind)
}
