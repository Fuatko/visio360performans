/**
 * Çalışan eylem planı (/api/dashboard/action-plans) — görünürlük kapısı.
 *
 * Plan, kişi hakkındaki ekip cevaplarından alan ortalamasıyla üretilir (baseline_score). Bu yüzden
 * Sonuçlarım ile BİREBİR aynı kapıdan geçer: kurum anahtarı + dönem yayını + ≥3 puan vermiş ekip
 * değerlendiricisi. Kapı kapalıyken plan ÜRETİLMEZ (satır yazılmaz) ve güncellenemez.
 * Route dosyası yardımcı export edemediği için burada; test: scripts/check-action-plan-gate.ts
 */
import {
  evaluateEmployeeResultVisibility,
  type EmployeeResultBlockReason,
} from '@/lib/employee-result-visibility'
import { userIdsEqualForSelfEval } from '@/lib/server/evaluation-identity'

export type ActionPlanGateFacts = {
  orgVisible: boolean
  released: boolean
  /** O dönemde kişi hakkında puan vermiş tekil ekip değerlendiricisi (öz hariç). */
  scoredPeerEvaluatorCount: number
}

export type ActionPlanGateResult = { visible: boolean; reason: EmployeeResultBlockReason | null }

export function evaluateActionPlanGate(isAdmin: boolean, facts: ActionPlanGateFacts): ActionPlanGateResult {
  if (isAdmin) return { visible: true, reason: null }
  return evaluateEmployeeResultVisibility({
    orgVisible: facts.orgVisible,
    released: facts.released,
    hasResult: true,
    evaluatorCount: facts.scoredPeerEvaluatorCount,
  })
}

/** Sonuçlarım tanımı: öz hariç, en az bir puanlı (reel/std > 0) cevabı olan tekil değerlendirici. */
export function countScoredPeerEvaluators(
  assignments: Array<{ id: string; evaluator_id: string; target_id: string }>,
  responses: Array<{ assignment_id: string; reel_score?: unknown; std_score?: unknown }>
): number {
  const scoredAssignments = new Set<string>()
  for (const r of responses) {
    if (Number(r?.reel_score || r?.std_score || 0) > 0) scoredAssignments.add(String(r.assignment_id))
  }
  const evaluators = new Set<string>()
  for (const a of assignments) {
    if (userIdsEqualForSelfEval(a.evaluator_id, a.target_id)) continue
    if (scoredAssignments.has(String(a.id))) evaluators.add(String(a.evaluator_id))
  }
  return evaluators.size
}

export type ActionPlanCandidatePeriod = { id: string; name: string; released: boolean }

/** Çalışana gösterilecek dönemler: kurum anahtarı kapalıysa hiçbiri, açıksa yalnız yayınlananlar. */
export function visibleActionPlanPeriods(
  periods: ActionPlanCandidatePeriod[],
  opts: { isAdmin: boolean; orgVisible: boolean }
): Array<{ id: string; name: string }> {
  const list = opts.isAdmin ? periods : opts.orgVisible ? periods.filter((p) => p.released) : []
  return list.map((p) => ({ id: p.id, name: p.name }))
}

type Ensured = { ok: true; plan: unknown; tasks: unknown[] } | { ok: false; error: string }

export type ActionPlanGetDeps = {
  isAdmin: boolean
  loadOrgVisible(): Promise<boolean>
  /** Kişi hakkında tamamlanmış değerlendirmesi olan kişisel gelişim dönemleri. */
  loadCandidatePeriods(): Promise<ActionPlanCandidatePeriod[]>
  countScoredPeers(periodId: string): Promise<number>
  /** Planı okur, yoksa ÜRETİR (satır yazar). Kapı kapalıyken çağrılmamalı. */
  ensurePlan(periodId: string): Promise<Ensured>
  loadPlanSummaries(periodIds: string[]): Promise<Map<string, unknown>>
}

export type HandlerResult = { status: number; body: Record<string, unknown> }

export async function handleActionPlanGet(
  deps: ActionPlanGetDeps,
  input: { flagEnabled: boolean; periodId: string; errorText: string }
): Promise<HandlerResult> {
  // Özellik kapalıysa uç yokmuş gibi davranır (varlığını sızdırmamak için 404).
  if (!input.flagEnabled) return { status: 404, body: { success: false, error: 'not_found' } }

  const orgVisible = deps.isAdmin ? true : await deps.loadOrgVisible()
  const candidates = await deps.loadCandidatePeriods()
  const periods = visibleActionPlanPeriods(candidates, { isAdmin: deps.isAdmin, orgVisible })

  if (!input.periodId) {
    const summaries = periods.length ? await deps.loadPlanSummaries(periods.map((p) => p.id)) : new Map<string, unknown>()
    return {
      status: 200,
      body: { success: true, periods: periods.map((p) => ({ ...p, plan: summaries.get(p.id) ?? null })) },
    }
  }

  const visibleTarget = periods.find((p) => p.id === input.periodId) || null
  const periodName = visibleTarget?.name || ''

  if (!deps.isAdmin) {
    const candidate = candidates.find((p) => p.id === input.periodId) || null
    const released = Boolean(candidate?.released)
    // Sayım yalnız anahtar açık ve dönem yayında iken yapılır (kapı zaten önce bunlara bakar).
    const scoredPeerEvaluatorCount = candidate && orgVisible && released ? await deps.countScoredPeers(input.periodId) : 0
    const gate = evaluateActionPlanGate(false, { orgVisible, released, scoredPeerEvaluatorCount })
    if (!gate.visible) {
      return {
        status: 200,
        body: { success: true, periods, periodName, plan: null, tasks: [], blockedReason: gate.reason },
      }
    }
  }

  const ensured = await deps.ensurePlan(input.periodId)
  if (!ensured.ok) return { status: 400, body: { success: false, error: ensured.error || input.errorText } }
  return { status: 200, body: { success: true, periods, periodName, plan: ensured.plan, tasks: ensured.tasks } }
}

export type ActionPlanPostGateDeps = {
  isAdmin: boolean
  loadPlan(planId: string): Promise<{ user_id: string; period_id: string | null } | null>
  loadOrgVisible(): Promise<boolean>
  loadPeriodReleased(periodId: string): Promise<boolean>
  countScoredPeers(periodId: string): Promise<number>
}

/** POST öncesi: bayrak → plan var mı → sahiplik (403) → kapı. ok=false ise dönen yanıt verilir. */
export async function checkActionPlanPost(
  deps: ActionPlanPostGateDeps,
  input: { flagEnabled: boolean; uid: string; planId: string; texts: { notFound: string; unauthorized: string } }
): Promise<{ ok: true } | ({ ok: false } & HandlerResult)> {
  if (!input.flagEnabled) return { ok: false, status: 404, body: { success: false, error: 'not_found' } }
  const plan = await deps.loadPlan(input.planId)
  if (!plan) return { ok: false, status: 404, body: { success: false, error: input.texts.notFound } }
  if (String(plan.user_id) !== String(input.uid)) {
    return { ok: false, status: 403, body: { success: false, error: input.texts.unauthorized } }
  }
  if (deps.isAdmin) return { ok: true }
  const periodId = String(plan.period_id || '')
  const orgVisible = await deps.loadOrgVisible()
  const released = periodId && orgVisible ? await deps.loadPeriodReleased(periodId) : false
  const scoredPeerEvaluatorCount = periodId && orgVisible && released ? await deps.countScoredPeers(periodId) : 0
  const gate = evaluateActionPlanGate(false, { orgVisible, released, scoredPeerEvaluatorCount })
  if (!gate.visible) {
    return { ok: false, status: 403, body: { success: false, error: 'not_visible', blockedReason: gate.reason } }
  }
  return { ok: true }
}
