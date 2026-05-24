'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { Card, CardHeader, CardBody, CardTitle, Button, Select, Badge, toast } from '@/components/ui'
import { EvaluationPeriod, Organization, User, AssignmentWithRelations } from '@/types/database'
import {
  RefreshCw,
  Search,
  List,
  User as UserIcon,
  Building2,
  Plus,
  Trash2,
  Loader2,
  Wand2,
  FileSpreadsheet,
  Download,
  SlidersHorizontal,
  ListChecks,
  Eye,
} from 'lucide-react'
import { MatrixScopePreviewModal } from '@/components/admin/matrix-scope-preview-modal'
import type { MatrixScopeReportRow } from '@/app/api/admin/matrix-scope-report/route'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { EvaluatorScopePanel } from '@/components/admin/evaluator-scope-panel'
import { EvaluatorScopeModal } from '@/components/admin/evaluator-scope-modal'
import {
  UNSPECIFIED_DEPARTMENT,
  departmentsFromUsers,
  userDepartment,
  userMatchesDepartment,
  usersHaveUnspecifiedDepartment,
} from '@/lib/user-departments'
import { parseMatrixExcelInBrowser } from '@/lib/matrix-import-client'
import { MATRIX_PARSER_VERSION } from '@/lib/matrix-assignment-import'
import { resolveMatrixContextFromImport } from '@/lib/matrix-evaluation-context'

const MATRIX_PAGE_BUILD = `ui-${MATRIX_PARSER_VERSION}`

type ViewMode = 'list' | 'person' | 'dept' | 'scope'

function scopePairKey(evaluatorId: string, targetId: string, matrixContext = 'genel') {
  return `${evaluatorId}:${targetId}:${matrixContext}`
}

function normalizePeriodConfirm(raw: string) {
  return raw
    .trim()
    .replace(/\u0130/g, 'I')
    .replace(/\u0131/g, 'i')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .toLocaleUpperCase('en-US')
}

/** SIL (ASCII I) veya Türkçe klavyede SİL */
function isPeriodClearSilConfirm(raw: string | null | undefined): boolean {
  if (raw == null) return false
  return normalizePeriodConfirm(raw) === 'SIL'
}

/** GOREV veya GÖREV */
function isPeriodClearGorevConfirm(raw: string | null | undefined): boolean {
  if (raw == null) return false
  return normalizePeriodConfirm(raw) === 'GOREV'
}
type LangKey = 'tr' | 'en' | 'fr'

// Admin sayfaları tamamen client-side çalışıyor; build sırasında prerender denemelerini engelle.
export const dynamic = 'force-dynamic'

function positionLevelLabel(level: string | undefined, lang: LangKey) {
  const key =
    level === 'executive'
      ? 'positionLevelExecutive'
      : level === 'manager'
        ? 'positionLevelManager'
        : level === 'peer'
          ? 'positionLevelPeer'
          : level === 'subordinate'
            ? 'positionLevelSubordinate'
            : null
  return key ? t(key, lang) : level || '—'
}

function PersonRoleCard({
  user,
  lang,
  accent,
}: {
  user: User | undefined
  lang: LangKey
  accent: 'blue' | 'emerald'
}) {
  const border = accent === 'blue' ? 'border-blue-200 bg-blue-50/60' : 'border-emerald-200 bg-emerald-50/60'
  if (!user) {
    return (
      <div className={`rounded-xl border border-dashed p-3 text-sm text-gray-500 ${border}`}>
        {t('matrixSelectPersonToSeeRole', lang)}
      </div>
    )
  }
  return (
    <div className={`rounded-xl border p-3 text-sm space-y-1 ${border}`}>
      <div className="font-semibold text-gray-900">{user.name}</div>
      <div>
        <span className="text-gray-500">{t('emailLabel', lang)}: </span>
        <span className="text-gray-800">{user.email?.trim() || '—'}</span>
      </div>
      <div>
        <span className="text-gray-500">{t('departmentLabel', lang)}: </span>
        <span className="text-gray-800">{user.department || t('unspecified', lang)}</span>
      </div>
      <div>
        <span className="text-gray-500">{t('titleLabel', lang)}: </span>
        <span className="text-gray-800">{user.title?.trim() || '—'}</span>
      </div>
      <div>
        <span className="text-gray-500">{t('matrixPositionLevel', lang)}: </span>
        <span className="text-gray-800">{positionLevelLabel(user.position_level, lang)}</span>
      </div>
    </div>
  )
}

export default function MatrixPage() {

  const lang = useLang()
  const searchParams = useSearchParams()
  const { organizationId } = useAdminContextStore()
  const periodLabel = (p: any) => {
    if (!p) return ''
    if (lang === 'fr') return String(p.name_fr || p.name || '')
    if (lang === 'en') return String(p.name_en || p.name || '')
    return String(p.name || '')
  }
  const [periods, setPeriods] = useState<EvaluationPeriod[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [assignments, setAssignments] = useState<AssignmentWithRelations[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [selectedOrg, setSelectedOrg] = useState('')
  const [selectedDept, setSelectedDept] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  
  const [loading, setLoading] = useState(true)
  const [newEvaluator, setNewEvaluator] = useState('')
  const [newTarget, setNewTarget] = useState('')
  /** Yeni atama: değerlendiren / değerlendirilecek kişi listesi birim filtresi */
  const [pickerEvaluatorDept, setPickerEvaluatorDept] = useState('')
  const [pickerTargetDept, setPickerTargetDept] = useState('')
  const [matrixImportFile, setMatrixImportFile] = useState<File | null>(null)
  const [matrixImportPreview, setMatrixImportPreview] = useState<any>(null)
  const [matrixImportLoading, setMatrixImportLoading] = useState(false)
  const [matrixReplacePending, setMatrixReplacePending] = useState(true)
  const [matrixAssignZumreDuty, setMatrixAssignZumreDuty] = useState(false)
  const [matrixAssignSinifDuty, setMatrixAssignSinifDuty] = useState(false)
  const [matrixAssignRehberDuty, setMatrixAssignRehberDuty] = useState(false)
  const [matrixAssignNobetciDuty, setMatrixAssignNobetciDuty] = useState(false)
  const [matrixAssignKulupDuty, setMatrixAssignKulupDuty] = useState(false)
  const [matrixAssignFormatorDuty, setMatrixAssignFormatorDuty] = useState(false)
  const [matrixAssignYasamKoordinatoruDuty, setMatrixAssignYasamKoordinatoruDuty] = useState(false)
  const [matrixApplyCategoryColumn, setMatrixApplyCategoryColumn] = useState(true)
  const [matrixServerBuild, setMatrixServerBuild] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/period-matrix-import?meta=1', { credentials: 'include' })
      .then((r) => r.json())
      .then((p) => {
        if (p?.parser_version) setMatrixServerBuild(String(p.parser_version))
      })
      .catch(() => setMatrixServerBuild(null))
  }, [])

  const setMatrixDutyPresetOnly = (
    which: 'zumre' | 'sinif' | 'rehber' | 'nobetci' | 'kulup' | 'formator' | 'yasam_koordinatoru' | null
  ) => {
    setMatrixAssignZumreDuty(which === 'zumre')
    setMatrixAssignSinifDuty(which === 'sinif')
    setMatrixAssignRehberDuty(which === 'rehber')
    setMatrixAssignNobetciDuty(which === 'nobetci')
    setMatrixAssignKulupDuty(which === 'kulup')
    setMatrixAssignFormatorDuty(which === 'formator')
    setMatrixAssignYasamKoordinatoruDuty(which === 'yasam_koordinatoru')
  }
  const [clearPeriodLoading, setClearPeriodLoading] = useState(false)
  const [clearDutyLoading, setClearDutyLoading] = useState(false)
  const [clearScopeToo, setClearScopeToo] = useState(true)
  const [scopeModal, setScopeModal] = useState<{
    evaluatorId: string
    targetId: string
    evaluatorName: string
    targetName: string
  } | null>(null)
  const [scopeReportByKey, setScopeReportByKey] = useState<Record<string, MatrixScopeReportRow>>({})
  const [scopeReportStats, setScopeReportStats] = useState<{
    avg_questions: number
    min_questions: number
    max_questions: number
    unscoped_count: number
    target_override_count?: number
  } | null>(null)
  const [scopeReportLoading, setScopeReportLoading] = useState(false)
  const [scopeReportError, setScopeReportError] = useState<string | null>(null)
  const scopeReportLoadGen = useRef(0)
  const [previewModalRow, setPreviewModalRow] = useState<MatrixScopeReportRow | null>(null)
  const [pickerPreview, setPickerPreview] = useState<MatrixScopeReportRow | null>(null)
  const [pickerPreviewLoading, setPickerPreviewLoading] = useState(false)

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    pending: 0,
    rate: 0,
  })

  useEffect(() => {
    loadInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId])

  useEffect(() => {
    const pid = (searchParams.get('period_id') || '').trim()
    if (pid) setSelectedPeriod(pid)
  }, [searchParams])

  useEffect(() => {
    if (selectedPeriod && organizationId) {
      void (async () => {
        await loadAssignments()
        await loadScopeReport()
      })()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedOrg, organizationId])

  useEffect(() => {
    if (!selectedPeriod || !newEvaluator || !newTarget) {
      setPickerPreview(null)
      return
    }
    const timer = window.setTimeout(async () => {
      setPickerPreviewLoading(true)
      try {
        const qs = new URLSearchParams({
          period_id: selectedPeriod,
          evaluator_id: newEvaluator,
          target_id: newTarget,
        })
        const resp = await matrixFetch(`/api/admin/matrix-scope-report?${qs}`)
        const payload = (await resp.json().catch(() => ({}))) as { success?: boolean; rows?: MatrixScopeReportRow[] }
        if (resp.ok && payload.success && payload.rows?.[0]) setPickerPreview(payload.rows[0])
        else setPickerPreview(null)
      } catch {
        setPickerPreview(null)
      } finally {
        setPickerPreviewLoading(false)
      }
    }, 400)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, newEvaluator, newTarget])

  // Kullanıcılar sayfasından dönünce liste güncellensin
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible' || !organizationId) return
      if (selectedPeriod) void loadAssignments()
      else void loadInitialData()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, selectedPeriod])

  // KVKK: org context seçilince sayfa içi filtreyi sabitle
  useEffect(() => {
    if (!organizationId) return
    if (selectedOrg !== organizationId) setSelectedOrg(organizationId)
  }, [organizationId, selectedOrg])

  // Üstteki departman filtresi ↔ yeni atama birimleri (her iki yönde senkron)
  useEffect(() => {
    setPickerEvaluatorDept(selectedDept)
    setPickerTargetDept(selectedDept)
  }, [selectedDept])

  const departmentOptions = (() => {
    const opts = departments.map((d) => ({ value: d, label: d }))
    if (usersHaveUnspecifiedDepartment(users)) {
      opts.push({ value: UNSPECIFIED_DEPARTMENT, label: t('unspecified', lang) })
    }
    return opts
  })()

  const usersForEvaluatorPicker = users.filter((u) => userMatchesDepartment(u, pickerEvaluatorDept))
  const usersForTargetPicker = users.filter((u) => userMatchesDepartment(u, pickerTargetDept))

  const selectedEvaluatorUser = users.find((u) => u.id === newEvaluator)
  const selectedTargetUser = users.find((u) => u.id === newTarget)

  const userOption = (u: User) => {
    const titlePart = u.title?.trim() ? ` — ${u.title.trim()}` : ''
    const emailPart = u.email?.trim() ? ` · ${u.email.trim()}` : ''
    return {
      value: u.id,
      label: `${u.name}${titlePart}${emailPart} (${userDepartment(u) || t('unspecified', lang)})`,
    }
  }

  const onPickerEvaluatorDeptChange = (dept: string) => {
    setPickerEvaluatorDept(dept)
    if (newEvaluator && !users.some((u) => u.id === newEvaluator && userMatchesDepartment(u, dept))) {
      setNewEvaluator('')
    }
  }

  const onPickerTargetDeptChange = (dept: string) => {
    setPickerTargetDept(dept)
    if (newTarget && !users.some((u) => u.id === newTarget && userMatchesDepartment(u, dept))) {
      setNewTarget('')
    }
  }

  const applyMatrixPayload = (payload: any) => {
    const nextUsers = (payload.users || []) as User[]
    setUsers(nextUsers)
    setDepartments((payload.departments || departmentsFromUsers(nextUsers)) as string[])
    if (payload.assignments_loaded) {
      setAssignments((payload.assignments || []) as AssignmentWithRelations[])
      setStats(payload.stats || { total: 0, completed: 0, pending: 0, rate: 0 })
    }
  }

  const matrixFetch = (url: string) =>
    fetch(url, { credentials: 'include', cache: 'no-store' })

  const loadInitialData = async () => {
    try {
      if (!organizationId) {
        setPeriods([])
        setOrganizations([])
        setUsers([])
        setDepartments([])
        return
      }
      setLoading(true)
      const resp = await matrixFetch(`/api/admin/matrix-data?org_id=${encodeURIComponent(organizationId)}`)
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        if (resp.status === 401 || resp.status === 403) toast(t('sessionMissingReLogin', lang), 'warning')
        throw new Error(payload?.error || t('assignmentsLoadFailed', lang))
      }
      setPeriods(((payload.periods || []) as any[]).map((p) => ({ ...p, name: periodLabel(p) })) as any)
      setOrganizations((payload.organizations || []) as any)
      applyMatrixPayload(payload)
    } catch (error) {
      console.error('Initial load error:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadAssignments = async () => {
    if (!selectedPeriod || !organizationId) return
    
    setLoading(true)
    try {
      const resp = await matrixFetch(
        `/api/admin/matrix-data?org_id=${encodeURIComponent(organizationId)}&period_id=${encodeURIComponent(selectedPeriod)}`
      )
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        if (resp.status === 401 || resp.status === 403) toast(t('sessionMissingReLogin', lang), 'warning')
        throw new Error(payload?.error || t('assignmentsLoadFailed', lang))
      }
      applyMatrixPayload(payload)
    } catch (error: unknown) {
      console.error('Load assignments error:', error)
      toast(t('dataLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadScopeReport = useCallback(async () => {
    if (!selectedPeriod) {
      setScopeReportByKey({})
      setScopeReportStats(null)
      setScopeReportError(null)
      return
    }
    const gen = ++scopeReportLoadGen.current
    setScopeReportLoading(true)
    setScopeReportError(null)
    try {
      const qs = new URLSearchParams({ period_id: selectedPeriod })
      if (organizationId) qs.set('org_id', organizationId)
      const resp = await matrixFetch(`/api/admin/matrix-scope-report?${qs}`)
      const payload = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        rows?: MatrixScopeReportRow[]
        stats?: typeof scopeReportStats
        truncated?: boolean
      }
      if (gen !== scopeReportLoadGen.current) return

      if (!resp.ok || !payload.success) {
        const errMsg =
          payload.error || (payload as { detail?: string }).detail || 'Kapsam raporu yüklenemedi'
        setScopeReportError(errMsg)
        toast(errMsg, 'error')
        setScopeReportByKey({})
        setScopeReportStats(null)
        return
      }
      const byKey: Record<string, MatrixScopeReportRow> = {}
      ;(payload.rows || []).forEach((row) => {
        const ctx = String((row as { matrix_context?: string }).matrix_context || 'genel')
        byKey[scopePairKey(row.evaluator_id, row.target_id, ctx)] = row
      })
      setScopeReportByKey(byKey)
      setScopeReportStats(payload.stats || null)
      const n = (payload.rows || []).length
      const msg = (payload as { message?: string }).message
      if (n > 0) {
        toast(msg || `${n} atama için kapsam raporu hazır`, 'success')
      } else {
        toast(
          msg || 'Bu dönemde hesaplanacak atama yok — önce matris ataması ekleyin veya birim filtresini kontrol edin',
          'warning'
        )
      }
      if (payload.truncated) toast('Kapsam raporu satır limitine takıldı (ilk 2000 atama)', 'warning')
    } catch (e) {
      if (gen !== scopeReportLoadGen.current) return
      console.error('Scope report error:', e)
      const errMsg = 'Kapsam raporu yüklenemedi (ağ veya zaman aşımı)'
      setScopeReportError(errMsg)
      toast(errMsg, 'error')
    } finally {
      if (gen === scopeReportLoadGen.current) setScopeReportLoading(false)
    }
  }, [selectedPeriod, organizationId])

  const openScopeView = () => {
    setViewMode('scope')
    if (selectedPeriod) void loadScopeReport()
  }

  const exportScopeReportCsv = () => {
    const rows = scopeReportRowsForView.length ? scopeReportRowsForView : Object.values(scopeReportByKey)
    if (!rows.length) {
      toast('Önce kapsam raporunu yükleyin', 'warning')
      return
    }
    const header = [
      'Değerlendiren',
      'Değerlendiren unvan',
      'Değerlendirilen',
      'Değerlendirilen unvan',
      'Toplam soru',
      'Genel soru',
      'Yan görev soru',
      'Kapsam',
      'Genel kategoriler (kapsam)',
      'Yan görev başlıkları',
      'Hedef görev Excel',
      'Puanlanacak kategoriler',
    ]
    const lines = rows.map((r) => {
      const cats = r.preview.breakdown.map((b) => `${b.category_name} (${b.question_count})`).join('; ')
      return [
        r.evaluator_name,
        r.evaluator_title || '',
        r.target_name,
        r.target_title || '',
        String(r.preview.question_count),
        String(r.preview.period_question_count),
        String(r.preview.duty_question_count),
        r.preview.scope_label,
        r.preview.period_category_labels.join('; '),
        r.preview.duty_package_labels.join('; '),
        r.preview.target_duty_names.join('; '),
        cats,
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(',')
    })
    const csv = [header.join(','), ...lines].join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `matris_kapsam_raporu_${selectedPeriod.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const scopeReportRowsSorted = useMemo(() => {
    return Object.values(scopeReportByKey).sort((a, b) => a.preview.question_count - b.preview.question_count)
  }, [scopeReportByKey])

  const filteredAssignments = assignments.filter(a => {
    const evalName = a.evaluator?.name?.toLowerCase() || ''
    const targetName = a.target?.name?.toLowerCase() || ''
    
    const matchesDept =
      !selectedDept ||
      userMatchesDepartment(a.evaluator || {}, selectedDept) ||
      userMatchesDepartment(a.target || {}, selectedDept)
    const matchesSearch = !searchTerm || 
      evalName.includes(searchTerm.toLowerCase()) || 
      targetName.includes(searchTerm.toLowerCase())
    
    return matchesDept && matchesSearch
  })

  /** Kapsam raporu sekmesi: arama + birim filtresi doğrudan rapor satırına (liste filtresiyle kaybolmasın) */
  const scopeReportRowsForView = useMemo(() => {
    const key = searchTerm.trim().toLowerCase()
    return scopeReportRowsSorted.filter((row) => {
      const matchesSearch =
        !key ||
        row.evaluator_name.toLowerCase().includes(key) ||
        row.target_name.toLowerCase().includes(key) ||
        String(row.evaluator_title || '').toLowerCase().includes(key) ||
        String(row.target_title || '').toLowerCase().includes(key)
      if (!matchesSearch) return false
      if (!selectedDept) return true
      const evDept = row.evaluator_department || ''
      const tgDept = row.target_department || ''
      return evDept === selectedDept || tgDept === selectedDept
    })
  }, [scopeReportRowsSorted, searchTerm, selectedDept])

  const scopeReportNeedsReload =
    !scopeReportLoading &&
    !!selectedPeriod &&
    assignments.length > 0 &&
    Object.keys(scopeReportByKey).length === 0

  const addAssignment = async () => {
    if (!selectedPeriod || !newEvaluator || !newTarget) {
      toast(t('selectPeriodEvaluatorTarget', lang), 'error')
      return
    }

    // Check if exists
    const exists = assignments.find(a => 
      a.evaluator_id === newEvaluator && a.target_id === newTarget
    )
    if (exists) {
      toast(t('assignmentAlreadyExists', lang), 'error')
      return
    }

    try {
      // Preferred: server-side admin API (KVKK)
      const resp = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ period_id: selectedPeriod, evaluator_id: newEvaluator, target_id: newTarget }),
      })
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}))
        if (resp.status === 401 || resp.status === 403) {
          toast(t('sessionMissingReLogin', lang), 'warning')
          return
        }
        if ((payload as any)?.error) toast(String((payload as any).error), 'error')
        else toast(t('addFailed', lang), 'error')
        return
      }

      const evId = newEvaluator
      const tgId = newTarget
      const evName = users.find((u) => u.id === evId)?.name || '-'
      const tgName = users.find((u) => u.id === tgId)?.name || '-'
      toast(t('assignmentAdded', lang), 'success')
      await loadAssignments()
      void loadScopeReport()
      setNewEvaluator('')
      setNewTarget('')
      setScopeModal({
        evaluatorId: evId,
        targetId: tgId,
        evaluatorName: evName,
        targetName: tgName,
      })
    } catch (error: unknown) {
      console.error('Add assignment error:', error)
      toast(t('addFailed', lang), 'error')
    }
  }

  const ensureSelfAssignments = async () => {
    if (!selectedPeriod || !organizationId) return
    setLoading(true)
    try {
      const resp = await fetch('/api/admin/ensure-self-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_id: selectedPeriod, organization_id: organizationId }),
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          toast(t('sessionMissingReLogin', lang), 'warning')
          return
        }
        if ((payload as any)?.error) toast(String((payload as any).error), 'error')
        else toast(t('selfAssignmentsFailed', lang), 'error')
        return
      } else {
        const created = Number((payload as any)?.created || 0)
        if (created > 0) toast(t('selfAssignmentsCreated', lang).replace('{n}', String(created)), 'success')
        else toast(t('selfAssignmentsAlreadyExist', lang), 'info')
        await loadAssignments()
      }
    } catch (err: any) {
      console.error('ensureSelfAssignments error:', err)
      toast(err?.message || t('selfAssignmentsFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }

  const clearPeriodAssignments = async () => {
    if (!selectedPeriod) {
      toast('Önce dönem seçin', 'error')
      return
    }
    const typed = window.prompt(
      'TÜM atamalar silinecek (bekleyen + tamamlanmış). Devam için kutuya SIL yazın (Türkçe klavyede SİL de kabul):',
      ''
    )
    if (!isPeriodClearSilConfirm(typed)) {
      if (typed !== null) toast('İptal — onay için SIL veya SİL yazın', 'warning')
      return
    }
    if (
      !confirm(
        clearScopeToo
          ? 'Son onay: Bu dönemdeki tüm matris atamaları ve kayıtlı soru kapsamları silinecek. Emin misiniz?'
          : 'Son onay: Bu dönemdeki tüm matris atamaları silinecek. Emin misiniz?'
      )
    ) {
      return
    }
    setClearPeriodLoading(true)
    try {
      const resp = await fetch('/api/admin/assignments/clear-period', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          period_id: selectedPeriod,
          ...(organizationId ? { organization_id: organizationId } : {}),
          confirm: 'SIL',
          clear_scope: clearScopeToo,
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        message?: string
        deleted_assignments?: number
        remaining_assignments?: number
      }
      if (!resp.ok || !payload.success) {
        const detail =
          payload.remaining_assignments != null
            ? ` (kalan: ${payload.remaining_assignments})`
            : resp.status === 404
              ? ' — Bu özellik sunucuda yok; sayfayı yenileyin veya destek ile deploy edin.'
              : ''
        toast(`${payload.error || 'Sıfırlama başarısız'}${detail}`, 'error')
        return
      }
      const n = payload.deleted_assignments ?? 0
      toast(
        payload.message || `${n} atama silindi`,
        'success'
      )
      setScopeModal(null)
      setPreviewModalRow(null)
      setScopeReportByKey({})
      setScopeReportStats(null)
      setMatrixImportPreview(null)
      await loadAssignments()
      if (n === 0) {
        toast('Bu dönemde zaten atama yoktu — liste boş olmalı', 'warning')
      }
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Sıfırlama hatası', 'error')
    } finally {
      setClearPeriodLoading(false)
    }
  }

  const clearPeriodDutyData = async () => {
    if (!selectedPeriod) {
      toast('Önce dönem seçin', 'error')
      return
    }
    const typed = window.prompt(
      'Bu dönemdeki TÜM yan görev kayıtları silinecek (kişi–görev Excel + kapsamdaki görev seçimleri). Matris atamaları kalır. Devam için GOREV yazın (GÖREV de olur):',
      ''
    )
    if (!isPeriodClearGorevConfirm(typed)) {
      if (typed !== null) toast('İptal — onay için GOREV veya GÖREV yazın', 'warning')
      return
    }
    if (
      !confirm(
        'Son onay: Yan görev atamaları ve görev kapsamı seçimleri silinecek. Genel matris ve genel soru kapsamı korunur. Emin misiniz?'
      )
    ) {
      return
    }
    setClearDutyLoading(true)
    try {
      const resp = await fetch('/api/admin/period-duty-clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          period_id: selectedPeriod,
          ...(organizationId ? { organization_id: organizationId } : {}),
          confirm: 'GOREV',
        }),
      })
      const payload = (await resp.json().catch(() => ({}))) as {
        success?: boolean
        error?: string
        message?: string
        deleted_user_duty_rows?: number
      }
      if (!resp.ok || !payload.success) {
        toast(String(payload.error || 'Yan görev sıfırlama başarısız'), 'error')
        return
      }
      toast(payload.message || 'Yan görev verileri sıfırlandı', 'success')
      setScopeReportByKey({})
      setScopeReportStats(null)
      if (viewMode === 'scope') void loadScopeReport()
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Yan görev sıfırlama hatası', 'error')
    } finally {
      setClearDutyLoading(false)
    }
  }

  const matrixImportContext = useMemo(
    () =>
      resolveMatrixContextFromImport({
        applyCategoryScope: matrixApplyCategoryColumn,
        dutyPreset: matrixAssignYasamKoordinatoruDuty
          ? 'yasam_koordinatoru'
          : matrixAssignFormatorDuty
            ? 'formator'
            : matrixAssignKulupDuty
              ? 'kulup_ogretmeni'
              : matrixAssignNobetciDuty
                ? 'nobetci_ogretmeni'
                : matrixAssignZumreDuty
                  ? 'zumre'
                  : matrixAssignSinifDuty
                    ? 'sinif_ogretmeni'
                    : matrixAssignRehberDuty
                      ? 'rehberlik_ogretmeni'
                      : null,
      }),
    [
      matrixApplyCategoryColumn,
      matrixAssignYasamKoordinatoruDuty,
      matrixAssignFormatorDuty,
      matrixAssignKulupDuty,
      matrixAssignNobetciDuty,
      matrixAssignZumreDuty,
      matrixAssignSinifDuty,
      matrixAssignRehberDuty,
    ]
  )

  const runMatrixImport = async (dryRun: boolean) => {
    if (!selectedPeriod) {
      toast('Önce dönem seçin', 'error')
      return
    }
    if (!matrixImportFile) {
      toast('Excel dosyası seçin', 'error')
      return
    }
    if (!dryRun && matrixReplacePending && stats.completed > 0) {
      if (
        !confirm(
          `Bu dönemde ${stats.completed} tamamlanmış değerlendirme var. Bekleyen atamalar Excel ile yenilenecek; tamamlananlar korunur. Devam?`
        )
      ) {
        return
      }
    }
    if (!dryRun && matrixReplacePending && stats.completed === 0) {
      if (!confirm('Mevcut bekleyen tüm atamalar silinip Excel matrisi uygulanacak. Devam?')) return
    }
    setMatrixImportLoading(true)
    if (dryRun) setMatrixImportPreview(null)
    try {
      const existingPairs = assignments.map((a) => ({
        evaluator_id: a.evaluator_id,
        target_id: a.target_id,
        matrix_context: (a as { matrix_context?: string }).matrix_context || 'genel',
      }))
      const importUsers = users.map((u) => ({ id: u.id, name: u.name, email: u.email }))
      const clientParsed = await parseMatrixExcelInBrowser(
        matrixImportFile,
        importUsers,
        existingPairs,
        matrixImportContext
      )

      if (dryRun) {
        setMatrixImportPreview({
          ...clientParsed.preview,
          grid_meta: clientParsed.gridMeta,
        })
        const st = clientParsed.preview.stats
        toast(
          st
            ? `Önizleme (tarayıcı): ${st.evaluatorColumns} değerlendiren, ${st.unknownEvaluators} hatalı sütun`
            : 'Önizleme hazır',
          st.unknownEvaluators === 0 ? 'success' : 'warning'
        )
        return
      }

      const fd = new FormData()
      fd.append('period_id', selectedPeriod)
      fd.append('file', matrixImportFile)
      fd.append('dry_run', 'false')
      fd.append('replace_pending', matrixReplacePending ? 'true' : 'false')
      fd.append('assign_zumre_duty', matrixAssignZumreDuty ? 'true' : 'false')
      fd.append('assign_sinif_duty', matrixAssignSinifDuty ? 'true' : 'false')
      fd.append('assign_rehber_duty', matrixAssignRehberDuty ? 'true' : 'false')
      fd.append('assign_nobetci_duty', matrixAssignNobetciDuty ? 'true' : 'false')
      fd.append('assign_kulup_duty', matrixAssignKulupDuty ? 'true' : 'false')
      fd.append('assign_formator_duty', matrixAssignFormatorDuty ? 'true' : 'false')
      fd.append('assign_yasam_koordinatoru_duty', matrixAssignYasamKoordinatoruDuty ? 'true' : 'false')
      fd.append('apply_evaluator_scope_from_matrix', matrixApplyCategoryColumn ? 'true' : 'false')
      if (matrixApplyCategoryColumn && clientParsed.categoryScopes.length) {
        fd.append('category_scopes_json', JSON.stringify(clientParsed.categoryScopes))
      }
      const resp = await fetch('/api/admin/period-matrix-import', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        setMatrixImportPreview({
          ...clientParsed.preview,
          grid_meta: clientParsed.gridMeta,
        })
        toast(String((payload as any)?.error || 'Matris içe aktarma başarısız'), 'error')
        return
      }
      setMatrixImportPreview({
        ...clientParsed.preview,
        grid_meta: clientParsed.gridMeta,
      })
      const ins = (payload as any).applied?.inserted ?? 0
      const del = (payload as any).applied?.deleted_pending ?? 0
      const md = (payload as any).applied?.matrix_duty
      const ecs = (payload as any).applied?.evaluator_category_scopes as
        | Array<{ evaluator_label: string; category_labels: string[] }>
        | undefined
      if (ecs?.length) {
        toast(
          `Kapsam: ${ecs.map((r) => `${r.evaluator_label} (${r.category_labels.length} kategori)`).join(', ')}`,
          'success'
        )
      }
      if (md?.ok) {
        toast(
          `${md.duty_name || 'Görev'}: ${md.duties_added} kişiye eklendi (${md.targets_in_matrix} hedef). Kapsam raporunu yenileyin.`,
          'success'
        )
      }
      toast(
        matrixReplacePending
          ? `${ins} atama eklendi, ${del} bekleyen silindi`
          : `${ins} yeni atama eklendi`,
        'success'
      )
      setMatrixImportFile(null)
      setMatrixImportPreview(null)
      await loadAssignments()
      if (
        matrixAssignZumreDuty ||
        matrixAssignSinifDuty ||
        matrixAssignRehberDuty ||
        matrixAssignNobetciDuty ||
        matrixAssignKulupDuty ||
        matrixAssignFormatorDuty ||
        matrixAssignYasamKoordinatoruDuty ||
        matrixApplyCategoryColumn
      ) {
        setScopeReportByKey({})
        setScopeReportStats(null)
        void loadScopeReport()
      }
    } catch (e: any) {
      toast(e?.message || 'Matris içe aktarma hatası', 'error')
    } finally {
      setMatrixImportLoading(false)
    }
  }

  const deleteAssignment = async (id: string) => {
    if (!confirm(t('confirmDeleteAssignment', lang))) return

    try {
      const resp = await fetch('/api/admin/assignments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id }),
      })
      if (!resp.ok) {
        const payload = await resp.json().catch(() => ({}))
        if (resp.status === 401 || resp.status === 403) {
          toast(t('sessionMissingReLogin', lang), 'warning')
          return
        }
        if ((payload as any)?.error) toast(String((payload as any).error), 'error')
        else toast(t('deleteError', lang), 'error')
        return
      }
      toast(t('assignmentDeleted', lang), 'success')
      loadAssignments()
    } catch (error: unknown) {
      console.error('Delete assignment error:', error)
      toast(t('deleteError', lang), 'error')
    }
  }

  // Group by person
  const groupByPerson = () => {
    const byPerson: Record<string, { 
      name: string
      dept: string
      willEvaluate: AssignmentWithRelations[]
      willBeEvaluatedBy: AssignmentWithRelations[]
    }> = {}

    filteredAssignments.forEach(a => {
      const evalId = a.evaluator_id
      const evalName = a.evaluator?.name || '-'
      const evalDept = a.evaluator?.department || '-'

      if (!byPerson[evalId]) {
        byPerson[evalId] = { name: evalName, dept: evalDept, willEvaluate: [], willBeEvaluatedBy: [] }
      }
      byPerson[evalId].willEvaluate.push(a)
    })

    filteredAssignments.forEach(a => {
      const targetId = a.target_id
      const targetName = a.target?.name || '-'
      const targetDept = a.target?.department || '-'

      if (!byPerson[targetId]) {
        byPerson[targetId] = { name: targetName, dept: targetDept, willEvaluate: [], willBeEvaluatedBy: [] }
      }
      byPerson[targetId].willBeEvaluatedBy.push(a)
    })

    return byPerson
  }

  // Group by department
  const groupByDept = () => {
    const byDept: Record<string, {
      assignments: AssignmentWithRelations[]
      persons: Set<string>
      completed: number
      pending: number
    }> = {}

    filteredAssignments.forEach(a => {
      const dept = a.evaluator?.department || t('unspecified', lang)
      
      if (!byDept[dept]) {
        byDept[dept] = { assignments: [], persons: new Set(), completed: 0, pending: 0 }
      }
      byDept[dept].assignments.push(a)
      byDept[dept].persons.add(a.evaluator_id)
      if (a.status === 'completed') byDept[dept].completed++
      else byDept[dept].pending++
    })

    return byDept
  }

  return (
    <RequireSelection
      enabled={!organizationId}
      title={t('kvkkSecurityTitle', lang)}
      message={t('kvkkSelectOrgToContinue', lang)}
    >
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🎯 {t('matrix', lang)}</h1>
        <p className="text-gray-500 mt-1">{t('matrixSubtitle', lang)}</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>🔍 {t('filters', lang)}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="w-64">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('period', lang)}</label>
              <Select
                options={periods.map(p => ({ value: p.id, label: p.name }))}
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                placeholder={t('selectPeriodPlaceholder', lang)}
              />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('organization', lang)}</label>
              <Select
                options={organizations.map(o => ({ value: o.id, label: o.name }))}
                value={selectedOrg}
                onChange={() => {}}
                placeholder={t('orgFixedKvkkHint', lang)}
              />
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('departmentLabel', lang)}</label>
              <Select
                options={departmentOptions}
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                placeholder={t('allDepartments', lang)}
              />
              <p className="text-xs text-gray-500 mt-1">{t('matrixFilterListHint', lang)}</p>
            </div>
            <div className="w-48">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('searchPersonLabel', lang)}</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('searchPersonPlaceholder', lang)}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
            <Button onClick={loadAssignments} variant="secondary">
              <RefreshCw className="w-4 h-4" />
              {t('refresh', lang)}
            </Button>
            <Button
              onClick={() => void loadScopeReport()}
              variant="secondary"
              disabled={!selectedPeriod || scopeReportLoading}
            >
              {scopeReportLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ListChecks className="w-4 h-4" />
              )}
              Kapsam raporu
            </Button>
            <Button
              variant="secondary"
              disabled={loading || !selectedPeriod}
              onClick={async () => {
                if (!selectedPeriod || !organizationId) return
                if (!confirm(t('reopenEmptyAssignmentsConfirm', lang))) return
                setLoading(true)
                try {
                  const resp = await fetch('/api/admin/assignments/reopen-empty', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ period_id: selectedPeriod, organization_id: organizationId }),
                  })
                  const payload = (await resp.json().catch(() => ({}))) as any
                  if (!resp.ok || !payload?.success) {
                    if (resp.status === 401 || resp.status === 403) toast(t('sessionMissingReLogin', lang), 'warning')
                    else toast(String(payload?.error || t('dataLoadFailed', lang)), 'error')
                    return
                  }
                  const n = Number(payload.reopened ?? 0)
                  toast(
                    n > 0
                      ? t('reopenEmptyAssignmentsDone', lang).replace('{n}', String(n))
                      : t('reopenEmptyAssignmentsNone', lang),
                    n > 0 ? 'success' : 'info'
                  )
                  await loadAssignments()
                } catch (e: any) {
                  toast(String(e?.message || t('dataLoadFailed', lang)), 'error')
                } finally {
                  setLoading(false)
                }
              }}
            >
              <Wand2 className="w-4 h-4" />
              {t('reopenEmptyAssignments', lang)}
            </Button>
          </div>
        </CardBody>
      </Card>

      {selectedPeriod ? (
        <Card className="mb-6 border-red-200/90 bg-red-50/40">
          <CardBody className="space-y-3">
            <div className="font-semibold text-sm text-red-900">Bugün — sıfırdan genel değerlendirme (adım adım)</div>
            <ol className="text-xs text-red-900/90 list-decimal pl-5 space-y-1 max-w-3xl">
              <li>
                <strong>1. Sıfırla</strong> — aşağıdaki düğme (tüm atamalar + isteğe bağlı kapsam kayıtları)
              </li>
              <li>
                <strong>2. Dönemler</strong> — soru seçimi + içerik kilitle (genel sorular)
              </li>
              <li>
                <strong>3. Genel matris Excel</strong> — önizle → uygula (senkron işaretli)
              </li>
              <li>
                <strong>4. Kapsam</strong> — Paul / Ender / md. yrd. / zümre (toplu panel; satır satır değil)
              </li>
              <li>
                <strong>5. Kapsam raporu + 1 test formu</strong> — sonra kullanıcılara açın
              </li>
            </ol>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={clearScopeToo}
                onChange={(e) => setClearScopeToo(e.target.checked)}
              />
              <span className="text-red-900">
                Soru kapsamı kayıtlarını da sil (önerilir — karışık kapsam kalmasın)
              </span>
            </label>
            <Button
              variant="secondary"
              size="sm"
              disabled={clearPeriodLoading || !selectedPeriod}
              onClick={() => void clearPeriodAssignments()}
              className="border-red-300 text-red-800 hover:bg-red-100"
            >
              {clearPeriodLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              1 — Dönem atamalarını sıfırla (SIL)
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {selectedPeriod ? (
        <Card className="mb-6 border-amber-200/90 bg-amber-50/50">
          <CardBody className="space-y-3">
            <div className="font-semibold text-sm text-amber-950">Yan görev — sıfırdan (genel matris kalır)</div>
            <ol className="text-xs text-amber-950/90 list-decimal pl-5 space-y-1 max-w-3xl">
              <li>
                <strong>A. GOREV</strong> — kişi–görev Excel + kapsamdaki yan görev seçimlerini sil (aşağı)
              </li>
              <li>
                <strong>B. Dönemler</strong> — Görev Soruları paketleri (Zümre, Kulüp…) tanımlı/kilitli
              </li>
              <li>
                <strong>C. Zümre / Sınıf / Rehber / Nöbetçi matrisi</strong> — ilgili renkli kutu işaretli → önizle → uygula
                (senkron kapalı)
              </li>
              <li>
                <strong>D. Kapsam</strong> — 7 değerlendiren: genel + «Yan görev yok» → Kaydet
              </li>
              <li>
                <strong>E. Kapsam raporu</strong> — zümre hedeflerde G:21 + Y:zümre
              </li>
            </ol>
            <p className="text-xs text-amber-900/80">
              Matristeki kim-kimi değerlendirir satırları <strong>silinmez</strong>. Y: ek sorular kaybolur; genel G:21
              kalır (kapsam kayıtlıysa).
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={clearDutyLoading || !selectedPeriod}
              onClick={() => void clearPeriodDutyData()}
              className="border-amber-400 text-amber-950 hover:bg-amber-100"
            >
              {clearDutyLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              A — Yan görev verilerini sıfırla (GOREV)
            </Button>
          </CardBody>
        </Card>
      ) : null}

      {selectedPeriod ? (
        <Card className="mb-6 border-indigo-200/80 bg-indigo-50/30">
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-700" />
                  2 — Genel matris Excel (0 / 1)
                </div>
                <p className="text-xs text-gray-600 mt-1 max-w-2xl">
                  Sol sütun: değerlendirilecek kişiler. Üst satır: değerlendirenler. Hücre <strong>1</strong> = atama
                  oluşturulur. İsimler Kullanıcılar kaydıyla aynı olmalı (tercihen sistemdeki ad soyad).
                </p>
                <p className="text-xs mt-1 font-mono text-teal-900">
                  Sayfa: {MATRIX_PAGE_BUILD}
                  {matrixServerBuild ? ` · Sunucu: ${matrixServerBuild}` : ' · Sunucu: ?'}
                  {matrixServerBuild && matrixServerBuild !== MATRIX_PARSER_VERSION ? (
                    <span className="text-red-700"> — sunucu eski, yine de tarayıcı önizlemesi kullanılır</span>
                  ) : null}
                </p>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open('/api/admin/period-matrix-import', '_blank')}
              >
                <Download className="w-4 h-4" />
                Şablon
              </Button>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white"
              onChange={(e) => {
                setMatrixImportFile(e.target.files?.[0] || null)
                setMatrixImportPreview(null)
              }}
            />
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={matrixReplacePending}
                onChange={(e) => setMatrixReplacePending(e.target.checked)}
              />
              <span>
                <span className="font-medium text-gray-900">Bekleyen atamaları Excel ile senkronize et</span>
                <span className="block text-xs text-gray-500">
                  İşaretli: bekleyen atamalar silinir, «1» hücreleri yeniden yazılır (tamamlanan değerlendirmeler korunur).
                  İşaretsiz: yalnızca yeni «1» hücreleri eklenir.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-violet-300 bg-violet-50/80 px-3 py-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={matrixAssignZumreDuty}
                onChange={(e) => setMatrixDutyPresetOnly(e.target.checked ? 'zumre' : null)}
              />
              <span>
                <span className="font-medium text-violet-950">Zümre başkanı matrisi — hedeflere otomatik görev ata</span>
                <span className="block text-xs text-violet-900/90 mt-0.5">
                  Sol sütundaki hedeflere <strong>Zümre Başkanı</strong> görevini yazar. Senkron kapalı; zümre ve sınıf
                  kutusu aynı anda seçilmez.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-sky-300 bg-sky-50/80 px-3 py-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={matrixAssignSinifDuty}
                onChange={(e) => setMatrixDutyPresetOnly(e.target.checked ? 'sinif' : null)}
              />
              <span>
                <span className="font-medium text-sky-950">Sınıf öğretmeni matrisi — hedeflere otomatik görev ata</span>
                <span className="block text-xs text-sky-900/90 mt-0.5">
                  Sol sütundaki hedeflere <strong>Sınıf Öğretmeni</strong> görevini yazar (Y: soruları için). Değerlendiren
                  sütununda 1 olan satırlar atama olarak eklenir.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-teal-300 bg-teal-50/80 px-3 py-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={matrixApplyCategoryColumn}
                onChange={(e) => setMatrixApplyCategoryColumn(e.target.checked)}
              />
              <span>
                <span className="font-medium text-teal-950">Sağ sütun: değerlendiren kapsamı (kategori listesi)</span>
                <span className="block text-xs text-teal-900/90 mt-0.5">
                  Sol: hedefler, orta: değerlendiren sütunları (1), sağ: alt alta kategori adları. Kategoriler{' '}
                  <strong>her matris satırı (değerlendiren→hedef)</strong> için ayrı kaydedilir — aynı kişinin
                  zümre ve okul yaşam gibi farklı görevleri birbirini ezmez.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-emerald-300 bg-emerald-50/80 px-3 py-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={matrixAssignRehberDuty}
                onChange={(e) => setMatrixDutyPresetOnly(e.target.checked ? 'rehber' : null)}
              />
              <span>
                <span className="font-medium text-emerald-950">Rehberlik öğretmeni matrisi — hedeflere otomatik görev ata</span>
                <span className="block text-xs text-emerald-900/90 mt-0.5">
                  Sol sütundaki hedeflere <strong>Rehberlik Öğretmeni</strong> görevini yazar (Y: soruları için). Zümre / sınıf
                  kutusu ile aynı anda seçilmez; senkron kapalı kalsın.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-orange-300 bg-orange-50/80 px-3 py-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={matrixAssignNobetciDuty}
                onChange={(e) => setMatrixDutyPresetOnly(e.target.checked ? 'nobetci' : null)}
              />
              <span>
                <span className="font-medium text-orange-950">Nöbetçi öğretmen matrisi — hedeflere otomatik görev ata</span>
                <span className="block text-xs text-orange-900/90 mt-0.5">
                  Sol sütundaki nöbetçi öğretmenlere <strong>Nöbetçi Öğretmen</strong> görevini yazar (Y: soruları için). Turkuaz
                  kutu kapalı; senkron kapalı (mevcut matrise ekle). Değerlendirenlerde genel kapsam tanımlı olmalı.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-fuchsia-300 bg-fuchsia-50/80 px-3 py-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={matrixAssignKulupDuty}
                onChange={(e) => setMatrixDutyPresetOnly(e.target.checked ? 'kulup' : null)}
              />
              <span>
                <span className="font-medium text-fuchsia-950">Kulüp öğretmeni matrisi — hedeflere otomatik görev ata</span>
                <span className="block text-xs text-fuchsia-900/90 mt-0.5">
                  Sol sütundaki kulüp öğretmenlerine <strong>Kulüp Öğretmeni</strong> görevini yazar (Y: soruları için). Turkuaz
                  kapalı; senkron kapalı (genel / okul yaşam / nöbetçi matrisleri kalır). Aynı kişi çifti için ayrı{' '}
                  <strong>kulup_ogretmeni</strong> ataması oluşur.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-violet-300 bg-violet-50/80 px-3 py-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={matrixAssignFormatorDuty}
                onChange={(e) => setMatrixDutyPresetOnly(e.target.checked ? 'formator' : null)}
              />
              <span>
                <span className="font-medium text-violet-950">Formatör matrisi — hedeflere otomatik görev ata</span>
                <span className="block text-xs text-violet-900/90 mt-0.5">
                  Sol sütundaki formatörlere <strong>Formatör</strong> görevini yazar (Y: soruları için). Turkuaz kapalı;
                  senkron kapalı (diğer matrisler kalır). Aynı kişi çifti için ayrı <strong>formator</strong> ataması
                  oluşur.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg border border-teal-300 bg-teal-50/80 px-3 py-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={matrixAssignYasamKoordinatoruDuty}
                onChange={(e) => setMatrixDutyPresetOnly(e.target.checked ? 'yasam_koordinatoru' : null)}
              />
              <span>
                <span className="font-medium text-teal-950">
                  Okul içi yaşam koordinatörü matrisi — hedeflere otomatik görev ata
                </span>
                <span className="block text-xs text-teal-900/90 mt-0.5">
                  Sol sütundaki koordinatörlere <strong>Okul İçi Yaşam Koordinatörü</strong> görevini yazar (Y: soruları
                  için). Turkuaz kapalı; senkron kapalı (diğer matrisler kalır). Aynı kişi çifti için ayrı{' '}
                  <strong>yasam_koordinatoru</strong> ataması oluşur.
                </span>
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={matrixImportLoading || !matrixImportFile}
                onClick={() => runMatrixImport(true)}
              >
                {matrixImportLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Önizle
              </Button>
              <Button
                size="sm"
                disabled={
                  matrixImportLoading ||
                  !matrixImportFile ||
                  (!matrixReplacePending &&
                    !matrixImportPreview?.pairs?.length &&
                    !matrixAssignZumreDuty &&
                    !matrixAssignSinifDuty &&
                    !matrixAssignRehberDuty &&
                    !matrixAssignNobetciDuty &&
                    !matrixAssignKulupDuty &&
                    !matrixAssignFormatorDuty &&
                    !matrixAssignYasamKoordinatoruDuty &&
                    !matrixApplyCategoryColumn)
                }
                onClick={() => runMatrixImport(false)}
              >
                Matrisi uygula
              </Button>
            </div>
            {matrixImportPreview?.stats ? (
              <div className="text-xs text-indigo-900/90 flex flex-wrap gap-x-4 gap-y-1">
                {(matrixImportPreview as { parser_version?: string }).parser_version ? (
                  <span className="text-teal-800 font-medium">
                    Parser: {(matrixImportPreview as { parser_version?: string }).parser_version}
                    {(matrixImportPreview as { preview_source?: string }).preview_source === 'browser'
                      ? ' (tarayıcı önizleme)'
                      : ''}
                  </span>
                ) : (
                  <span className="text-amber-800 font-medium">Parser: eski (Ctrl+Shift+R)</span>
                )}
                <span>Hedef satır: {matrixImportPreview.stats.targetRows}</span>
                <span>Değerlendiren sütun: {matrixImportPreview.stats.evaluatorColumns}</span>
                <span>«1» hücre: {matrixImportPreview.stats.cellsWithOne}</span>
                <span>Yeni atama: {matrixImportPreview.stats.assignmentsToAdd}</span>
                <span>Zaten var: {matrixImportPreview.stats.alreadyExists}</span>
                <span>Hedef bulunamadı: {matrixImportPreview.stats.unknownTargets}</span>
                <span>Değerlendiren bulunamadı: {matrixImportPreview.stats.unknownEvaluators}</span>
              </div>
            ) : null}
            {matrixImportPreview?.pairs?.length ? (
              <div className="max-h-36 overflow-y-auto rounded-lg border border-indigo-200/60 bg-white text-xs">
                <table className="w-full">
                  <thead className="bg-indigo-100/50 sticky top-0">
                    <tr>
                      <th className="text-left py-2 px-2">Değerlendiren</th>
                      <th className="text-left py-2 px-2">Hedef</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixImportPreview.pairs.slice(0, 40).map((m: any, i: number) => (
                      <tr key={`${m.evaluatorId}-${m.targetId}-${i}`} className="border-t border-indigo-100/80">
                        <td className="py-1.5 px-2">{m.evaluatorLabel}</td>
                        <td className="py-1.5 px-2">{m.targetLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {matrixImportPreview.pairs.length > 40 ? (
                  <div className="p-2 text-gray-500">+{matrixImportPreview.pairs.length - 40} atama daha…</div>
                ) : null}
              </div>
            ) : null}
            {matrixImportPreview?.warnings?.length ? (
              <ul className="text-xs text-amber-800 list-disc pl-4 space-y-0.5 max-h-28 overflow-y-auto">
                {matrixImportPreview.warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {selectedPeriod ? (
        <>
          <p className="text-xs text-violet-800 mb-2 font-medium">4 — Değerlendiren soru kapsamı (matris yüklendikten sonra)</p>
          <EvaluatorScopePanel periodId={selectedPeriod} />
        </>
      ) : null}

      {selectedPeriod && scopeModal ? (
        <EvaluatorScopeModal
          open
          onClose={() => {
            setScopeModal(null)
            void loadScopeReport()
          }}
          periodId={selectedPeriod}
          evaluatorId={scopeModal.evaluatorId}
          targetId={scopeModal.targetId}
          evaluatorName={scopeModal.evaluatorName}
          targetName={scopeModal.targetName}
        />
      ) : null}

      <MatrixScopePreviewModal
        open={!!previewModalRow}
        onClose={() => setPreviewModalRow(null)}
        row={previewModalRow}
        onEditScope={
          previewModalRow
            ? () => {
                setPreviewModalRow(null)
                setScopeModal({
                  evaluatorId: previewModalRow.evaluator_id,
                  targetId: previewModalRow.target_id,
                  evaluatorName: previewModalRow.evaluator_name,
                  targetName: previewModalRow.target_name,
                })
              }
            : undefined
        }
      />

      {/* Stats */}
      {selectedPeriod && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
            <div className="text-3xl font-bold text-slate-900">{stats.total}</div>
            <div className="text-sm text-slate-500">{t('totalAssignments', lang)}</div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
            <div className="text-3xl font-bold text-slate-900">{stats.completed}</div>
            <div className="text-sm text-slate-500">{t('completedShort', lang)}</div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
            <div className="text-3xl font-bold text-slate-900">{stats.pending}</div>
            <div className="text-sm text-slate-500">{t('pending', lang)}</div>
          </div>
          <div className="bg-[var(--surface)] border border-[var(--border)] p-5 rounded-2xl">
            <div className="text-3xl font-bold text-slate-900">{stats.rate}%</div>
            <div className="text-sm text-slate-500">{t('completionRate', lang)}</div>
          </div>
        </div>
      )}

      {selectedPeriod && scopeReportStats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4">
            <div className="text-2xl font-bold text-violet-900">{scopeReportStats.avg_questions}</div>
            <div className="text-xs text-violet-800">Ortalama soru / atama</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-2xl font-bold text-gray-900">{scopeReportStats.min_questions}</div>
            <div className="text-xs text-gray-500">En az soru</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="text-2xl font-bold text-gray-900">{scopeReportStats.max_questions}</div>
            <div className="text-xs text-gray-500">En çok soru</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="text-2xl font-bold text-amber-900">{scopeReportStats.unscoped_count}</div>
            <div className="text-xs text-amber-800">Kapsam tanımsız (tüm sorular)</div>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
            <div className="text-2xl font-bold text-emerald-900">
              {scopeReportStats.max_questions - scopeReportStats.min_questions}
            </div>
            <div className="text-xs text-emerald-800">Fark (max − min)</div>
          </div>
        </div>
      ) : null}

      {/* View Mode Toggle & List */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>📊 {t('evaluationListTitle', lang)}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button 
              size="sm" 
              variant={viewMode === 'list' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('list')}
            >
              <List className="w-4 h-4" />
              {t('listView', lang)}
            </Button>
            <Button 
              size="sm" 
              variant={viewMode === 'person' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('person')}
            >
              <UserIcon className="w-4 h-4" />
              {t('viewPersonBased', lang)}
            </Button>
            <Button 
              size="sm" 
              variant={viewMode === 'dept' ? 'primary' : 'secondary'}
              onClick={() => setViewMode('dept')}
            >
              <Building2 className="w-4 h-4" />
              {t('viewDeptBased', lang)}
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'scope' ? 'primary' : 'secondary'}
              onClick={openScopeView}
            >
              <ListChecks className="w-4 h-4" />
              Kapsam raporu
            </Button>
            {viewMode === 'scope' ? (
              <Button size="sm" variant="secondary" onClick={exportScopeReportCsv} disabled={!scopeReportRowsForView.length}>
                <Download className="w-4 h-4" />
                CSV
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardBody>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          ) : !selectedPeriod ? (
            <p className="text-center text-gray-500 py-12">{t('matrixSelectPeriod', lang)}</p>
          ) : viewMode === 'list' ? (
            // List View
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">{t('evaluatorLabel', lang)}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">{t('departmentLabel', lang)}</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-600 text-sm">→</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">{t('targetLabel', lang)}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">{t('departmentLabel', lang)}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">{t('typeLabel', lang)}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">{t('statusLabel', lang)}</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-600 text-sm">Puanlanacak</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-600 text-sm">{t('actionLabel', lang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-gray-500">{t('assignmentNotFound', lang)}</td>
                    </tr>
                  ) : (
                    filteredAssignments.map((a) => {
                      const isSelf = a.evaluator_id === a.target_id
                      const reportRow = scopeReportByKey[
                        scopePairKey(
                          a.evaluator_id,
                          a.target_id,
                          (a as { matrix_context?: string }).matrix_context || 'genel'
                        )
                      ]
                      return (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-900">{a.evaluator?.name || '-'}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {a.evaluator?.title?.trim() || '—'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500">{a.evaluator?.department || '-'}</td>
                          <td className="py-3 px-4 text-center text-gray-400">→</td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-gray-900">{a.target?.name || '-'}</div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {a.target?.title?.trim() || '—'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-500">{a.target?.department || '-'}</td>
                          <td className="py-3 px-4">
                            <Badge variant={isSelf ? 'info' : 'gray'}>
                              {isSelf ? `🔵 ${t('selfShort', lang)}` : `👥 ${t('teamShort', lang)}`}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            <Badge variant={a.status === 'completed' ? 'success' : 'warning'}>
                              {a.status === 'completed' ? `✅ ${t('doneLabel', lang)}` : `⏳ ${t('pending', lang)}`}
                            </Badge>
                          </td>
                          <td className="py-3 px-4">
                            {scopeReportLoading ? (
                              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                            ) : reportRow ? (
                              <button
                                type="button"
                                onClick={() => setPreviewModalRow(reportRow)}
                                className="text-left text-sm rounded-lg border border-violet-200 bg-violet-50/80 px-2.5 py-1.5 hover:bg-violet-100 max-w-[200px]"
                                title={reportRow.preview.scope_label}
                              >
                                <span className="font-semibold text-violet-900">{reportRow.preview.question_count} soru</span>
                                <span className="block text-[10px] text-violet-800 truncate">
                                  G:{reportRow.preview.period_question_count} · Y:{reportRow.preview.duty_question_count}
                                </span>
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">—</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {reportRow ? (
                                <button
                                  type="button"
                                  title="Puanlanacak sorular — detay"
                                  onClick={() => setPreviewModalRow(reportRow)}
                                  className="p-2 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg"
                                >
                                  <Eye className="w-4 h-4" />
                                </button>
                              ) : null}
                              <button
                                type="button"
                                title="Soru kapsamı — hangi kategoriler / sorular"
                                onClick={() =>
                                  setScopeModal({
                                    evaluatorId: a.evaluator_id,
                                    targetId: a.target_id,
                                    evaluatorName: a.evaluator?.name || '-',
                                    targetName: a.target?.name || '-',
                                  })
                                }
                                className="p-2 text-violet-600 hover:text-violet-800 hover:bg-violet-50 rounded-lg"
                              >
                                <SlidersHorizontal className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteAssignment(a.id)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
              <p className="text-sm text-gray-500 mt-4">
                {t('assignmentsShown', lang).replace('{n}', String(filteredAssignments.length))}
              </p>
            </div>
          ) : viewMode === 'person' ? (
            // Person View
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Object.entries(groupByPerson()).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([personId, data]) => {
                const evalCount = data.willEvaluate.length
                const beEvalCount = data.willBeEvaluatedBy.length
                const completedEval = data.willEvaluate.filter(a => a.status === 'completed').length
                
                return (
                  <div key={personId} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-semibold text-gray-900">{data.name}</h4>
                        <p className="text-sm text-gray-500">{data.dept}</p>
                      </div>
                      <Badge variant="info">{completedEval}/{evalCount}</Badge>
                    </div>
                    
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-blue-600 mb-2">
                        {t('willEvaluateTitle', lang)} ({evalCount})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {data.willEvaluate.slice(0, 8).map(a => {
                          const statusColor = a.status === 'completed' ? '#10b981' : '#f59e0b'
                          const isSelf = a.evaluator_id === a.target_id
                          return (
                            <span 
                              key={a.id} 
                              className="text-xs px-2 py-1 rounded-full bg-white border"
                              style={{ borderLeftColor: statusColor, borderLeftWidth: 3 }}
                            >
                              {a.target?.name?.split(' ')[0]}{isSelf ? ` (${t('selfShort', lang)})` : ''}
                            </span>
                          )
                        })}
                        {evalCount > 8 && <span className="text-xs text-gray-400">+{evalCount - 8}</span>}
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-xs font-semibold text-emerald-600 mb-2">
                        {t('evaluatorsTitle', lang)} ({beEvalCount})
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {data.willBeEvaluatedBy.slice(0, 8).map(a => {
                          const statusColor = a.status === 'completed' ? '#10b981' : '#f59e0b'
                          return (
                            <span 
                              key={a.id} 
                              className="text-xs px-2 py-1 rounded-full bg-white border"
                              style={{ borderLeftColor: statusColor, borderLeftWidth: 3 }}
                            >
                              {a.evaluator?.name?.split(' ')[0]}
                            </span>
                          )
                        })}
                        {beEvalCount > 8 && <span className="text-xs text-gray-400">+{beEvalCount - 8}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : viewMode === 'scope' ? (
            <div className="space-y-3">
              {scopeReportLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
                </div>
              ) : scopeReportRowsForView.length === 0 ? (
                <div className="text-center text-gray-500 py-12 space-y-3">
                  <p className="font-medium text-gray-700">Kapsam raporu satırı yok.</p>
                  {scopeReportError ? (
                    <p className="text-sm text-red-600">{scopeReportError}</p>
                  ) : null}
                  <p className="text-xs max-w-md mx-auto">
                    {Object.keys(scopeReportByKey).length > 0 && (selectedDept || searchTerm)
                      ? 'Üstteki birim veya arama filtresi tüm satırları gizliyor olabilir — filtreyi temizleyin.'
                      : scopeReportNeedsReload
                        ? `Matriste ${assignments.length} atama var; rapor henüz hesaplanmadı veya istek zaman aşımına uğradı.`
                        : assignments.length > 0
                          ? 'Rapor boş döndü — yeniden deneyin.'
                          : 'Bu dönemde matris ataması yok. Önce atama ekleyin.'}
                  </p>
                  {selectedPeriod && assignments.length > 0 ? (
                    <Button size="sm" variant="primary" onClick={() => void loadScopeReport()} disabled={scopeReportLoading}>
                      {scopeReportLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4" />
                      )}
                      Kapsam raporunu hesapla
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-violet-50 border-b border-violet-100">
                      <tr>
                        <th className="text-left py-2 px-3 font-semibold text-gray-700">Değerlendiren</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-700">Değerlendirilen</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">Soru</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-700">Kapsam</th>
                        <th className="text-left py-2 px-3 font-semibold text-gray-700">Özet</th>
                        <th className="text-right py-2 px-3 font-semibold text-gray-700">Detay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {scopeReportRowsForView.map((row) => (
                        <tr key={row.assignment_id} className="hover:bg-gray-50">
                          <td className="py-2 px-3">
                            <div className="font-medium">{row.evaluator_name}</div>
                            <div className="text-xs text-gray-500">{row.evaluator_title || '—'}</div>
                          </td>
                          <td className="py-2 px-3">
                            <div className="font-medium">{row.target_name}</div>
                            <div className="text-xs text-gray-500">{row.target_title || '—'}</div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-violet-900">
                            {row.preview.question_count}
                          </td>
                          <td className="py-2 px-3 text-xs text-gray-600 max-w-[180px]">{row.preview.scope_label}</td>
                          <td className="py-2 px-3 text-xs text-gray-600 max-w-[240px]">
                            {row.preview.breakdown
                              .slice(0, 4)
                              .map((b) => `${b.category_name} (${b.question_count})`)
                              .join(' · ')}
                            {row.preview.breakdown.length > 4 ? '…' : ''}
                          </td>
                          <td className="py-2 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => setPreviewModalRow(row)}
                              className="text-violet-700 hover:underline text-xs font-medium"
                            >
                              Puanlanacaklar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-gray-500 mt-3">
                    Gösterilen: {scopeReportRowsForView.length} satır
                    {scopeReportRowsForView.length !== scopeReportRowsSorted.length
                      ? ` (toplam ${scopeReportRowsSorted.length})`
                      : ''}
                    . Ortalama {scopeReportStats?.avg_questions ?? '—'} soru; min{' '}
                    {scopeReportStats?.min_questions ?? '—'}, max {scopeReportStats?.max_questions ?? '—'}.
                    {scopeReportStats?.target_override_count
                      ? ` · ${scopeReportStats.target_override_count} hedefe özel kapsam.`
                      : ''}
                  </p>
                </div>
              )}
            </div>
          ) : (
            // Department View
            <div className="space-y-4">
              {Object.entries(groupByDept()).sort((a, b) => a[0].localeCompare(b[0])).map(([dept, data]) => {
                const total = data.assignments.length
                const rate = Math.round((data.completed / total) * 100)
                const barColor = rate >= 70 ? '#10b981' : rate >= 40 ? '#f59e0b' : '#ef4444'
                
                return (
                  <div key={dept} className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h4 className="font-semibold text-gray-900">🏢 {dept}</h4>
                        <p className="text-sm text-gray-500">
                          {t('peopleAssignmentsShort', lang)
                            .replace('{people}', String(data.persons.size))
                            .replace('{assignments}', String(total))}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-bold" style={{ color: barColor }}>{rate}%</div>
                        <p className="text-xs text-gray-500">
                          {t('completedOutOfShort', lang)
                            .replace('{completed}', String(data.completed))
                            .replace('{total}', String(total))}
                        </p>
                      </div>
                    </div>
                    <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-300"
                        style={{ width: `${rate}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Add New Assignment */}
      <Card>
        <CardHeader>
          <CardTitle>➕ {t('addAssignmentTitle', lang)}</CardTitle>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3 rounded-2xl border border-blue-100 bg-white p-4">
              <h3 className="font-semibold text-blue-900">{t('matrixEvaluatorPanel', lang)}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('matrixPickerEvaluatorDept', lang)}
                  </label>
                  <Select
                    options={departmentOptions}
                    value={pickerEvaluatorDept}
                    onChange={(e) => onPickerEvaluatorDeptChange(e.target.value)}
                    placeholder={t('allDepartments', lang)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('evaluatorLabel', lang)}
                  </label>
                  <Select
                    options={usersForEvaluatorPicker.map(userOption)}
                    value={newEvaluator}
                    onChange={(e) => setNewEvaluator(e.target.value)}
                    placeholder={
                      usersForEvaluatorPicker.length
                        ? t('selectPerson', lang)
                        : t('matrixSelectUnitFirst', lang)
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('matrixPeopleInUnit', lang).replace('{n}', String(usersForEvaluatorPicker.length))}
                  </p>
                </div>
              </div>
              <PersonRoleCard user={selectedEvaluatorUser} lang={lang} accent="blue" />
            </div>

            <div className="space-y-3 rounded-2xl border border-emerald-100 bg-white p-4">
              <h3 className="font-semibold text-emerald-900">{t('matrixTargetPanel', lang)}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('matrixPickerTargetDept', lang)}
                  </label>
                  <Select
                    options={departmentOptions}
                    value={pickerTargetDept}
                    onChange={(e) => onPickerTargetDeptChange(e.target.value)}
                    placeholder={t('allDepartments', lang)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('targetLabel', lang)}
                  </label>
                  <Select
                    options={usersForTargetPicker.map(userOption)}
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    placeholder={
                      usersForTargetPicker.length
                        ? t('selectPerson', lang)
                        : t('matrixSelectUnitFirst', lang)
                    }
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('matrixPeopleInUnit', lang).replace('{n}', String(usersForTargetPicker.length))}
                  </p>
                </div>
              </div>
              <PersonRoleCard user={selectedTargetUser} lang={lang} accent="emerald" />
            </div>
          </div>

          {selectedPeriod && newEvaluator && newTarget ? (
            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50/50 p-4 text-sm">
              <div className="font-semibold text-violet-900 mb-2 flex items-center gap-2">
                <ListChecks className="w-4 h-4" />
                Bu atamada puanlanacaklar (önizleme)
              </div>
              {pickerPreviewLoading ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Hesaplanıyor…
                </div>
              ) : pickerPreview ? (
                <div className="space-y-2">
                  <p>
                    <strong>{pickerPreview.preview.question_count} soru</strong> (genel:{' '}
                    {pickerPreview.preview.period_question_count}, yan görev:{' '}
                    {pickerPreview.preview.duty_question_count}) — {pickerPreview.preview.scope_label}
                  </p>
                  <ul className="text-xs text-gray-700 list-disc pl-4 space-y-0.5">
                    {pickerPreview.preview.breakdown.map((b) => (
                      <li key={`${b.scope_kind}-${b.category_id}`}>
                        {b.scope_kind === 'duty' ? 'Yan görev' : 'Genel'}: {b.category_name} — {b.question_count}{' '}
                        soru
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="text-violet-700 text-xs font-medium hover:underline"
                    onClick={() => setPreviewModalRow(pickerPreview)}
                  >
                    Tam liste →
                  </button>
                </div>
              ) : (
                <p className="text-gray-500 text-xs">Önizleme alınamadı (dönem / kullanıcı kontrolü).</p>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-gray-100">
            <Button onClick={addAssignment} variant="success">
              <Plus className="w-4 h-4" />
              {t('addLabel', lang)}
            </Button>
            <Button onClick={ensureSelfAssignments} variant="secondary" disabled={!selectedPeriod}>
              <Wand2 className="w-4 h-4" />
              {t('createSelfAssignments', lang)}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
    </RequireSelection>
  )
}
