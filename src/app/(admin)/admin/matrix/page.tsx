'use client'

import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { useAdminContextStore } from '@/store/admin-context'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { EvaluatorScopePanel } from '@/components/admin/evaluator-scope-panel'
import { EvaluatorScopeModal } from '@/components/admin/evaluator-scope-modal'

type ViewMode = 'list' | 'person' | 'dept'
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
  const [scopeModal, setScopeModal] = useState<{
    evaluatorId: string
    targetId: string
    evaluatorName: string
    targetName: string
  } | null>(null)

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
  }, [])

  useEffect(() => {
    const pid = (searchParams.get('period_id') || '').trim()
    if (pid) setSelectedPeriod(pid)
  }, [searchParams])

  useEffect(() => {
    if (selectedPeriod && organizationId) {
      loadAssignments()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPeriod, selectedOrg, organizationId])

  // KVKK: org context seçilince sayfa içi filtreyi sabitle
  useEffect(() => {
    if (!organizationId) return
    if (selectedOrg !== organizationId) setSelectedOrg(organizationId)
  }, [organizationId, selectedOrg])

  // Üstteki departman filtresi → yeni atama birimlerine öner (liste filtresi)
  useEffect(() => {
    if (selectedDept) {
      setPickerEvaluatorDept(selectedDept)
      setPickerTargetDept(selectedDept)
    }
  }, [selectedDept])

  const usersForEvaluatorPicker = users.filter(
    (u) => !pickerEvaluatorDept || (u.department || '') === pickerEvaluatorDept
  )
  const usersForTargetPicker = users.filter(
    (u) => !pickerTargetDept || (u.department || '') === pickerTargetDept
  )

  const selectedEvaluatorUser = users.find((u) => u.id === newEvaluator)
  const selectedTargetUser = users.find((u) => u.id === newTarget)

  const userOption = (u: User) => {
    const titlePart = u.title?.trim() ? ` — ${u.title.trim()}` : ''
    return {
      value: u.id,
      label: `${u.name}${titlePart} (${u.department || t('unspecified', lang)})`,
    }
  }

  const onPickerEvaluatorDeptChange = (dept: string) => {
    setPickerEvaluatorDept(dept)
    if (newEvaluator && !users.some((u) => u.id === newEvaluator && (!dept || u.department === dept))) {
      setNewEvaluator('')
    }
  }

  const onPickerTargetDeptChange = (dept: string) => {
    setPickerTargetDept(dept)
    if (newTarget && !users.some((u) => u.id === newTarget && (!dept || u.department === dept))) {
      setNewTarget('')
    }
  }

  const loadInitialData = async () => {
    try {
      if (!organizationId) {
        setPeriods([])
        setOrganizations([])
        return
      }
      const resp = await fetch(`/api/admin/matrix-data?org_id=${encodeURIComponent(organizationId)}`)
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        if (resp.status === 401 || resp.status === 403) toast(t('sessionMissingReLogin', lang), 'warning')
        throw new Error(payload?.error || t('assignmentsLoadFailed', lang))
      }
      setPeriods(((payload.periods || []) as any[]).map((p) => ({ ...p, name: periodLabel(p) })) as any)
      setOrganizations((payload.organizations || []) as any)
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
      const resp = await fetch(
        `/api/admin/matrix-data?org_id=${encodeURIComponent(organizationId)}&period_id=${encodeURIComponent(selectedPeriod)}`
      )
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) {
        if (resp.status === 401 || resp.status === 403) toast(t('sessionMissingReLogin', lang), 'warning')
        throw new Error(payload?.error || t('assignmentsLoadFailed', lang))
      }
      setUsers((payload.users || []) as any)
      setDepartments((payload.departments || []) as any)
      setAssignments((payload.assignments || []) as any)
      setStats(payload.stats || { total: 0, completed: 0, pending: 0, rate: 0 })
    } catch (error: unknown) {
      console.error('Load assignments error:', error)
      toast(t('dataLoadFailed', lang), 'error')
    } finally {
      setLoading(false)
    }
  }

  const filteredAssignments = assignments.filter(a => {
    const evalName = a.evaluator?.name?.toLowerCase() || ''
    const targetName = a.target?.name?.toLowerCase() || ''
    const evalDept = a.evaluator?.department || ''
    const targetDept = a.target?.department || ''
    
    const matchesDept = !selectedDept || evalDept === selectedDept || targetDept === selectedDept
    const matchesSearch = !searchTerm || 
      evalName.includes(searchTerm.toLowerCase()) || 
      targetName.includes(searchTerm.toLowerCase())
    
    return matchesDept && matchesSearch
  })

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

      toast(t('assignmentAdded', lang), 'success')
      loadAssignments()
      setNewEvaluator('')
      setNewTarget('')
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
      const fd = new FormData()
      fd.append('period_id', selectedPeriod)
      fd.append('file', matrixImportFile)
      fd.append('dry_run', dryRun ? 'true' : 'false')
      fd.append('replace_pending', matrixReplacePending ? 'true' : 'false')
      const resp = await fetch('/api/admin/period-matrix-import', {
        method: 'POST',
        body: fd,
        credentials: 'include',
      })
      const payload = await resp.json().catch(() => ({}))
      if (!resp.ok || !(payload as any)?.success) {
        if ((payload as any)?.preview) setMatrixImportPreview((payload as any).preview)
        toast(String((payload as any)?.error || 'Matris içe aktarma başarısız'), 'error')
        return
      }
      if ((payload as any).preview) setMatrixImportPreview((payload as any).preview)
      if (dryRun) {
        const st = (payload as any).preview?.stats
        toast(
          st
            ? `Önizleme: ${st.assignmentsToAdd} yeni, ${st.cellsWithOne} hücre «1», ${st.alreadyExists} zaten var`
            : 'Önizleme hazır',
          'success'
        )
        return
      }
      const ins = (payload as any).applied?.inserted ?? 0
      const del = (payload as any).applied?.deleted_pending ?? 0
      toast(
        matrixReplacePending
          ? `${ins} atama eklendi, ${del} bekleyen silindi`
          : `${ins} yeni atama eklendi`,
        'success'
      )
      setMatrixImportFile(null)
      setMatrixImportPreview(null)
      await loadAssignments()
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
                options={[
                  { value: '', label: t('allDepartments', lang) },
                  ...departments.map((d) => ({ value: d, label: d })),
                ]}
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
        <Card className="mb-6 border-indigo-200/80 bg-indigo-50/30">
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-semibold text-sm text-gray-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-indigo-700" />
                  Matris Excel (0 / 1)
                </div>
                <p className="text-xs text-gray-600 mt-1 max-w-2xl">
                  Sol sütun: değerlendirilecek kişiler. Üst satır: değerlendirenler. Hücre <strong>1</strong> = atama
                  oluşturulur. İsimler Kullanıcılar kaydıyla aynı olmalı (tercihen sistemdeki ad soyad).
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
                  (!matrixReplacePending && !matrixImportPreview?.pairs?.length)
                }
                onClick={() => runMatrixImport(false)}
              >
                Matrisi uygula
              </Button>
            </div>
            {matrixImportPreview?.stats ? (
              <div className="text-xs text-indigo-900/90 flex flex-wrap gap-x-4 gap-y-1">
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

      {selectedPeriod ? <EvaluatorScopePanel periodId={selectedPeriod} /> : null}

      {selectedPeriod && scopeModal ? (
        <EvaluatorScopeModal
          open
          onClose={() => setScopeModal(null)}
          periodId={selectedPeriod}
          evaluatorId={scopeModal.evaluatorId}
          targetId={scopeModal.targetId}
          evaluatorName={scopeModal.evaluatorName}
          targetName={scopeModal.targetName}
        />
      ) : null}

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

      {/* View Mode Toggle & List */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>📊 {t('evaluationListTitle', lang)}</CardTitle>
          <div className="flex gap-2">
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
                    <th className="text-right py-3 px-4 font-semibold text-gray-600 text-sm">{t('actionLabel', lang)}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-gray-500">{t('assignmentNotFound', lang)}</td>
                    </tr>
                  ) : (
                    filteredAssignments.map((a) => {
                      const isSelf = a.evaluator_id === a.target_id
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
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
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
                    options={[
                      { value: '', label: t('allDepartments', lang) },
                      ...departments.map((d) => ({ value: d, label: d })),
                    ]}
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
                    options={[
                      { value: '', label: t('allDepartments', lang) },
                      ...departments.map((d) => ({ value: d, label: d })),
                    ]}
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
