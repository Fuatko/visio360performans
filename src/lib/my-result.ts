/**
 * "Sonucum" — çalışanın KENDİ dönem özeti ve onayı.
 *
 * Bu dosya veritabanına dokunmaz: uç (/api/my-result) bağımlılıkları verir,
 * buradaki fonksiyonlar kuralları uygular ve yanıtı İZİN LİSTESİYLE kurar.
 *
 * ŞARTNAME — çalışana ASLA gönderilmeyecekler (yeni alan eklerken bakılacak):
 *  - değerlendiricilerin kimliği, kimin hangi puanı verdiği
 *  - soru bazında değerlendirici dağılımı
 *  - kurum içi sıralama / yüzdelik dilim
 *  - başka kişilerin puanları, birim / kadro ortalamaları
 *  - yan görev değerlendirmelerinin kişi bazlı detayı
 *  - potansiyel notu
 * Yanıt kaynak nesneden kopyalanmaz; yalnız aşağıdaki tiplerde adı geçen alanlar
 * tek tek yazılır. "Gizlemek değil, göndermemek."
 */
import type { MatrixKarnePeriodBlock } from '@/lib/server/matrix-karne-build'
import {
  evaluateEmployeeResultVisibility,
  MIN_EVALUATORS_FOR_EMPLOYEE_RESULT,
  type EmployeeResultBlockReason,
} from '@/lib/employee-result-visibility'

/** Bir dönem için kişinin hesaplanmış sonucu (mevcut hesaplardan daraltılmış). */
export type MyResultCore = {
  overall: number
  categories: Array<{ name: string; score: number; self: number | null }>
  self: number | null
  /** Öz hariç, puan vermiş tekil değerlendirici sayısı. */
  evaluatorCount: number
}

export type MyResultPeriod = {
  id: string
  name: string
  assessmentKind: string
  released: boolean
  createdAt: string
}

export type MyResultSummary = {
  periodId: string
  periodName: string
  assessmentKind: string
  overall: number
  categories: Array<{ name: string; score: number; self: number | null }>
  self: number | null
  /** Ekip − öz. */
  selfGap: number | null
  // Değerlendirici sayısı gönderilmez: 4 kişilik ekipte "3 kişi değerlendirdi" neredeyse herkesi ele verir (3 kişi kuralıyla aynı amaç).
  previous: { periodName: string; overall: number; delta: number } | null
}

export type MyResultResponse = {
  success: true
  /** Yalnız yayınlanmış dönemler (kurum ayarı kapalıysa boş). */
  periods: Array<{ id: string; name: string; assessmentKind: string }>
  selectedPeriodId: string | null
  status: { visible: boolean; reason: EmployeeResultBlockReason | null }
  summary: MyResultSummary | null
  acknowledgement: { acknowledgedAt: string } | null
}

export const MY_RESULT_NOTE_MAX = 2000

const r2 = (n: number) => Math.round(n * 100) / 100
const pos = (n: unknown): number | null => {
  const v = Number(n)
  return Number.isFinite(v) && v > 0 ? v : null
}

/**
 * İş değerlendirmesi (MATRIX): KARNE'nin çekirdek dilimi — yönetimin kişi
 * karnesinde gösterdiği hesap. Yan görev dilimleri (dutySlices) KULLANILMAZ.
 */
export function coreFromKarneBlock(block: MatrixKarnePeriodBlock, selfUid: string): MyResultCore | null {
  const core = block.core
  if (!core) return null
  const overall = pos(core.score.overallPeerAvg)
  if (overall == null) return null
  const selfMap = core.selfCategoryByKey || {}
  const categories = (core.score.categories || [])
    .filter((c) => pos(c.peerAvg) != null)
    .map((c) => ({ name: String(c.categoryLabel || ''), score: r2(Number(c.peerAvg)), self: pos(selfMap[c.categoryKey]) }))
  const selfVals = Object.values(selfMap).map(pos).filter((v): v is number => v != null)
  const evaluators = new Set<string>()
  for (const q of core.score.questions || []) {
    for (const sc of q.scorers || []) {
      const id = String(sc?.evaluatorId || '').trim()
      if (id && id !== String(selfUid)) evaluators.add(id)
    }
  }
  return {
    overall: r2(overall),
    categories,
    self: selfVals.length ? r2(selfVals.reduce((a, b) => a + b, 0) / selfVals.length) : null,
    evaluatorCount: evaluators.size,
  }
}

/**
 * Kişisel gelişim (360): çalışanın "Sonuçlarım" hesabının dönem nesnesi
 * (computeSelfPeriodResults) — ekip puanı = peerAvg.
 */
export function coreFromSelfPeriodResult(p: {
  peerAvg?: unknown
  selfScore?: unknown
  peerContributorsInAverage?: unknown
  categoryCompare?: Array<{ name?: unknown; peer?: unknown; self?: unknown }>
}): MyResultCore | null {
  const overall = pos(p.peerAvg)
  if (overall == null) return null
  const categories = (p.categoryCompare || [])
    .filter((c) => pos(c?.peer) != null)
    .map((c) => ({ name: String(c?.name || ''), score: r2(Number(c.peer)), self: pos(c?.self) }))
  const self = pos(p.selfScore)
  return {
    overall: r2(overall),
    categories,
    self: self == null ? null : r2(self),
    evaluatorCount: Math.max(0, Math.floor(Number(p.peerContributorsInAverage) || 0)),
  }
}

/** Aynı türde, bu dönemden önce oluşturulmuş en yakın dönem. */
export function previousSameKindPeriod(all: MyResultPeriod[], current: MyResultPeriod): MyResultPeriod | null {
  const earlier = all
    .filter((p) => p.id !== current.id && p.assessmentKind === current.assessmentKind && p.createdAt < current.createdAt)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  return earlier[0] || null
}

export type MyResultDeps = {
  /** Kişinin kurumu — kimlik OTURUMDAN gelir; buraya dışarıdan kimlik verilmez. */
  loadUserOrg(): Promise<string | null>
  loadOrgVisible(orgId: string): Promise<boolean>
  /** Kurumun bütün dönemleri (yayın durumuyla). */
  loadOrgPeriods(orgId: string): Promise<MyResultPeriod[]>
  /** Verilen dönemler için kişinin sonucu; sonucu olmayan dönem haritada yer almaz. */
  computeCores(orgId: string, periods: MyResultPeriod[]): Promise<Map<string, MyResultCore>>
  loadAck(periodId: string): Promise<{ acknowledgedAt: string } | null>
  /** Onayı yazar; kayıt zaten onaylıysa DEĞİŞTİRMEZ ve false döner. */
  insertAck(row: { organizationId: string; periodId: string; note: string | null }): Promise<{ acknowledgedAt: string } | null>
}

const blocked = (
  reason: EmployeeResultBlockReason,
  periods: MyResultResponse['periods'] = [],
  selectedPeriodId: string | null = null,
  acknowledgement: MyResultResponse['acknowledgement'] = null
): MyResultResponse => ({
  success: true,
  periods,
  selectedPeriodId,
  status: { visible: false, reason },
  summary: null,
  acknowledgement,
})

export async function getMyResult(deps: MyResultDeps, input: { periodId?: string | null }): Promise<MyResultResponse> {
  const orgId = await deps.loadUserOrg()
  if (!orgId) return blocked('no_result')

  // 1) Kurum kademesi — kapalıysa dönem listesi bile verilmez.
  if (!(await deps.loadOrgVisible(orgId))) return blocked('org_disabled')

  const all = await deps.loadOrgPeriods(orgId)
  const released = all.filter((p) => p.released).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
  const periodList = released.map((p) => ({ id: p.id, name: p.name, assessmentKind: p.assessmentKind }))

  const wanted = String(input.periodId || '').trim()
  const target = wanted ? all.find((p) => p.id === wanted) || null : released[0] || null
  // 2) Dönem kademesi
  if (!target || !target.released) return blocked('not_released', periodList, target?.id || wanted || null)

  const prev = previousSameKindPeriod(all, target)
  const cores = await deps.computeCores(orgId, prev ? [target, prev] : [target])
  const core = cores.get(target.id) || null
  // 3) sonuç var mı · 4) en az 3 değerlendirici
  const gate = evaluateEmployeeResultVisibility({
    orgVisible: true,
    released: true,
    hasResult: !!core,
    evaluatorCount: core?.evaluatorCount ?? 0,
  })
  if (!gate.visible || !core) return blocked(gate.reason || 'no_result', periodList, target.id)

  // Önceki dönem değişimi yalnız o dönem de çalışana açıkken (yayında + ≥3) — yoksa
  // fark, gizli kalması gereken önceki puanı açığa çıkarır.
  const prevCore = prev ? cores.get(prev.id) || null : null
  const previous =
    prev && prev.released && prevCore && prevCore.evaluatorCount >= MIN_EVALUATORS_FOR_EMPLOYEE_RESULT
      ? { periodName: prev.name, overall: prevCore.overall, delta: r2(core.overall - prevCore.overall) }
      : null

  const ack = await deps.loadAck(target.id)
  return {
    success: true,
    periods: periodList,
    selectedPeriodId: target.id,
    status: { visible: true, reason: null },
    summary: {
      periodId: target.id,
      periodName: target.name,
      assessmentKind: target.assessmentKind,
      overall: core.overall,
      categories: core.categories.map((c) => ({ name: c.name, score: c.score, self: c.self })),
      self: core.self,
      selfGap: core.self == null ? null : r2(core.overall - core.self),
      previous,
    },
    acknowledgement: ack ? { acknowledgedAt: ack.acknowledgedAt } : null,
  }
}

export type AckResult =
  | { status: 201; body: { success: true; acknowledgedAt: string } }
  | { status: 400 | 403 | 409; body: { success: false; error: string; reason?: EmployeeResultBlockReason | null } }

/**
 * Onay: yalnız görünürlük koşulları sağlanıyorsa ("görmediği bir şeyi gördüm
 * diyemez"); ikinci kez → 409, mevcut kayıt değişmez. Gövdeden yalnız
 * period_id ve note okunur.
 */
export async function acknowledgeMyResult(
  deps: MyResultDeps,
  input: { periodId?: unknown; note?: unknown }
): Promise<AckResult> {
  const periodId = typeof input.periodId === 'string' ? input.periodId.trim() : ''
  if (!periodId) return { status: 400, body: { success: false, error: 'period_id gerekli' } }
  const rawNote = typeof input.note === 'string' ? input.note.trim() : ''
  const note = rawNote ? rawNote.slice(0, MY_RESULT_NOTE_MAX) : null

  const view = await getMyResult(deps, { periodId })
  if (!view.status.visible || !view.summary) {
    return { status: 403, body: { success: false, error: 'not_visible', reason: view.status.reason } }
  }
  if (view.acknowledgement) return { status: 409, body: { success: false, error: 'already_acknowledged' } }

  const orgId = await deps.loadUserOrg()
  if (!orgId) return { status: 403, body: { success: false, error: 'not_visible', reason: 'no_result' } }
  const saved = await deps.insertAck({ organizationId: orgId, periodId, note })
  if (!saved) return { status: 409, body: { success: false, error: 'already_acknowledged' } }
  return { status: 201, body: { success: true, acknowledgedAt: saved.acknowledgedAt } }
}

// ---------------------------------------------------------------------------
// İK listesi — satır serileştirme. employee_note YALNIZ super_admin / org_admin.
// ---------------------------------------------------------------------------

export const ACK_NOTE_ROLES = new Set(['super_admin', 'org_admin'])

export type AckAdminRowInput = {
  userId: string
  name: string
  department: string
  canSee: boolean
  reason: EmployeeResultBlockReason | null
  acknowledgedAt: string | null
  meetingAt: string | null
  meetingNote: string | null
  employeeNote: string | null
}

export type AckAdminRow = Omit<AckAdminRowInput, 'employeeNote'> & { employeeNote?: string | null }

export function serializeAckAdminRow(row: AckAdminRowInput, role: string | null | undefined): AckAdminRow {
  const out: AckAdminRow = {
    userId: row.userId,
    name: row.name,
    department: row.department,
    canSee: row.canSee,
    reason: row.reason,
    acknowledgedAt: row.acknowledgedAt,
    meetingAt: row.meetingAt,
    meetingNote: row.meetingNote,
  }
  // Alan diğer rollerde HİÇ yazılmaz (boş değil, yok).
  if (ACK_NOTE_ROLES.has(String(role || ''))) out.employeeNote = row.employeeNote
  return out
}
