'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { ClipboardList, CheckCircle, Clock, ArrowRight, Loader2 } from 'lucide-react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { matrixEvaluationContextLabel } from '@/lib/matrix-evaluation-context'

interface Assignment {
  id: string
  evaluator_id: string
  target_id: string
  status: string
  slug: string | null
  completed_at: string | null
  target: { name: string; department: string } | null
  evaluation_periods: { name: string; status: string } | null
  matrix_context?: string | null
}

type AssignmentGroup = {
  key: string
  title: string
  department: string
  items: Assignment[]
}

function periodLabel(p: Assignment['evaluation_periods'], lang: 'tr' | 'en' | 'fr') {
  if (!p) return '-'
  const row = p as { name?: string; name_en?: string; name_fr?: string }
  if (lang === 'fr') return String(row.name_fr || row.name || '-')
  if (lang === 'en') return String(row.name_en || row.name || '-')
  return String(row.name || '-')
}

function assignmentFormLabel(assignment: Assignment, lang: 'tr' | 'en' | 'fr') {
  const isSelf = assignment.evaluator_id === assignment.target_id
  if (isSelf) return t('selfEvaluation', lang)
  if (assignment.matrix_context === 'okul_yasam') return 'Kategori değerlendirmesi (genel değil)'
  if (assignment.matrix_context) return matrixEvaluationContextLabel(assignment.matrix_context)
  return t('peerEvaluation', lang)
}

function groupAssignments(list: Assignment[], lang: 'tr' | 'en' | 'fr'): AssignmentGroup[] {
  const map = new Map<string, AssignmentGroup>()

  for (const a of list) {
    const isSelf = a.evaluator_id === a.target_id
    const key = isSelf ? `self:${a.id}` : `target:${a.target_id}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        title: isSelf ? t('selfEvaluation', lang) : a.target?.name || '-',
        department: isSelf ? '' : a.target?.department || '-',
        items: [],
      })
    }
    map.get(key)!.items.push(a)
  }

  for (const g of map.values()) {
    g.items.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
      return assignmentFormLabel(a, lang).localeCompare(assignmentFormLabel(b, lang), 'tr')
    })
  }

  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'tr'))
}

function formsCountLabel(count: number, lang: 'tr' | 'en' | 'fr') {
  return t('evaluationsFormsForPerson', lang).replace('{count}', String(count))
}

function AssignmentRow({
  assignment,
  lang,
  compact,
}: {
  assignment: Assignment
  lang: 'tr' | 'en' | 'fr'
  compact?: boolean
}) {
  const isSelf = assignment.evaluator_id === assignment.target_id
  const isPending = assignment.status === 'pending'
  const isActive = assignment.evaluation_periods?.status === 'active'
  const formLabel = assignmentFormLabel(assignment, lang)

  return (
    <div
      className={`flex items-center justify-between gap-3 ${
        compact ? 'px-4 py-2.5 bg-[var(--surface)]/60' : 'px-6 py-4'
      } hover:bg-[var(--surface-2)] transition-colors`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div
          className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-sm ${
            assignment.status === 'completed'
              ? 'bg-[var(--success-soft)] text-[var(--success)]'
              : isSelf
                ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                : 'bg-[var(--warning-soft)] text-[var(--warning)]'
          }`}
        >
          {assignment.status === 'completed' ? '✅' : isSelf ? '🔵' : '📋'}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-[var(--foreground)] text-sm truncate">{formLabel}</p>
          {!compact ? (
            <p className="text-sm text-[var(--muted)] truncate">
              {assignment.target?.department || '-'} • {periodLabel(assignment.evaluation_periods, lang)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <Badge variant={assignment.status === 'completed' ? 'success' : isActive ? 'warning' : 'gray'}>
          {assignment.status === 'completed'
            ? `✅ ${t('done', lang)}`
            : isActive
              ? `⏳ ${t('waiting', lang)}`
              : `🔒 ${t('periodClosed', lang)}`}
        </Badge>

        {isPending && isActive ? (
          <Link
            href={`/evaluation/${assignment.id}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--brand)] text-white rounded-lg hover:bg-[var(--brand-hover)] transition-colors font-medium text-sm"
          >
            {t('evaluate', lang)}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        ) : assignment.status === 'completed' ? (
          <span className="text-xs text-[var(--muted)]/70 tabular-nums">
            {assignment.completed_at ? new Date(assignment.completed_at).toLocaleDateString('tr-TR') : '-'}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function TargetGroup({
  group,
  lang,
  defaultOpen,
  compactCompleted,
}: {
  group: AssignmentGroup
  lang: 'tr' | 'en' | 'fr'
  defaultOpen?: boolean
  compactCompleted?: boolean
}) {
  const pendingInGroup = group.items.filter((a) => a.status === 'pending').length
  const allCompleted = pendingInGroup === 0
  const useAccordion = group.items.length > 1 || (compactCompleted && allCompleted)

  if (!useAccordion) {
    return (
      <div className="border-b border-[var(--border)] last:border-b-0">
        <AssignmentRow assignment={group.items[0]} lang={lang} />
      </div>
    )
  }

  return (
    <details
      className="group/target border-b border-[var(--border)] last:border-b-0"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-3.5 hover:bg-[var(--surface-2)] transition-colors [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="shrink-0 w-6 h-6 rounded-md border border-[var(--border)] flex items-center justify-center text-[var(--muted)] text-xs group-open/target:rotate-90 transition-transform"
            aria-hidden
          >
            ▶
          </span>
          <div className="min-w-0">
            <p className="font-medium text-[var(--foreground)] truncate">{group.title}</p>
            {group.department ? (
              <p className="text-sm text-[var(--muted)] truncate">{group.department}</p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {pendingInGroup > 0 ? (
            <Badge variant="warning">
              {pendingInGroup} {t('pending', lang).toLowerCase()}
            </Badge>
          ) : null}
          <span className="text-xs text-[var(--muted)]">{formsCountLabel(group.items.length, lang)}</span>
        </div>
      </summary>
      <div className="border-t border-[var(--border)] divide-y divide-[var(--border)] bg-[var(--surface-2)]/40">
        {group.items.map((assignment) => (
          <AssignmentRow key={assignment.id} assignment={assignment} lang={lang} compact />
        ))}
      </div>
    </details>
  )
}

function EvaluationSection({
  title,
  groups,
  lang,
  defaultSectionOpen,
  compactGroups,
  empty,
}: {
  title: string
  groups: AssignmentGroup[]
  lang: 'tr' | 'en' | 'fr'
  defaultSectionOpen?: boolean
  compactGroups?: boolean
  empty?: ReactNode
}) {
  if (groups.length === 0) return empty ?? null

  const totalForms = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <details
      className="border-b border-[var(--border)] last:border-b-0"
      open={defaultSectionOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 bg-[var(--surface-2)]/50 hover:bg-[var(--surface-2)] transition-colors [&::-webkit-details-marker]:hidden">
        <h3 className="font-semibold text-[var(--foreground)]">{title}</h3>
        <Badge variant={compactGroups ? 'success' : 'warning'}>
          {groups.length} {lang === 'tr' ? 'kişi' : lang === 'fr' ? 'personnes' : 'people'} · {totalForms}{' '}
          {t('evaluationsCount', lang)}
        </Badge>
      </summary>
      <div>
        {groups.map((group) => (
          <TargetGroup
            key={group.key}
            group={group}
            lang={lang}
            defaultOpen={!compactGroups && group.items.some((a) => a.status === 'pending')}
            compactCompleted={compactGroups}
          />
        ))}
      </div>
    </details>
  )
}

export default function EvaluationsPage() {
  const lang = useLang()
  const { user } = useAuthStore()
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all')

  useEffect(() => {
    if (user) loadAssignments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  const loadAssignments = async () => {
    if (!user) return

    try {
      const resp = await fetch(`/api/dashboard/evaluations?filter=all`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as { success?: boolean; assignments?: Assignment[]; error?: string }
      if (!resp.ok || !payload.success) throw new Error(payload.error || 'Veriler alınamadı')
      setAssignments((payload.assignments || []) as Assignment[])
    } catch (error) {
      console.error('Load error:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAssignments = assignments.filter((a) => {
    if (filter === 'pending') return a.status === 'pending' && a.evaluation_periods?.status === 'active'
    if (filter === 'completed') return a.status === 'completed'
    return true
  })

  const pendingCount = assignments.filter((a) => a.status === 'pending' && a.evaluation_periods?.status === 'active').length
  const completedCount = assignments.filter((a) => a.status === 'completed').length

  const { pendingGroups, completedGroups } = useMemo(() => {
    const pendingList = filteredAssignments.filter(
      (a) => a.status === 'pending' && a.evaluation_periods?.status === 'active'
    )
    const completedList = filteredAssignments.filter((a) => a.status === 'completed')
    return {
      pendingGroups: groupAssignments(filter === 'completed' ? [] : pendingList, lang),
      completedGroups: groupAssignments(filter === 'pending' ? [] : completedList, lang),
    }
  }, [filteredAssignments, filter, lang])

  const showPendingSection = filter === 'all' || filter === 'pending'
  const showCompletedSection = filter === 'all' || filter === 'completed'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">📋 {t('evaluationsTitle', lang)}</h1>
        <p className="text-[var(--muted)] mt-1">{t('evaluationsSubtitle', lang)}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => setFilter('all')}
          className={`text-left transition-all bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md ${
            filter === 'all' ? 'ring-2 ring-[var(--brand)]/20' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center border bg-[var(--brand-soft)] border-[var(--brand)]/25">
              <ClipboardList className="w-6 h-6 text-[var(--brand)]" />
            </div>
          </div>
          <div className="mt-4 text-3xl font-bold text-[var(--foreground)]">{assignments.length}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">{t('total', lang)}</div>
        </button>
        <button
          onClick={() => setFilter('pending')}
          className={`text-left transition-all bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md ${
            filter === 'pending' ? 'ring-2 ring-[var(--warning)]/20' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center border bg-[var(--warning-soft)] border-[var(--warning)]/25">
              <Clock className="w-6 h-6 text-[var(--warning)]" />
            </div>
          </div>
          <div className="mt-4 text-3xl font-bold text-[var(--foreground)]">{pendingCount}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">{t('pending', lang)}</div>
        </button>
        <button
          onClick={() => setFilter('completed')}
          className={`text-left transition-all bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md ${
            filter === 'completed' ? 'ring-2 ring-[var(--success)]/20' : ''
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center border bg-[var(--success-soft)] border-[var(--success)]/25">
              <CheckCircle className="w-6 h-6 text-[var(--success)]" />
            </div>
          </div>
          <div className="mt-4 text-3xl font-bold text-[var(--foreground)]">{completedCount}</div>
          <div className="mt-1 text-sm text-[var(--muted)]">{t('completed', lang)}</div>
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {filter === 'all' && t('allEvaluations', lang)}
            {filter === 'pending' && t('pendingEvaluations', lang)}
            {filter === 'completed' && t('completedEvaluations', lang)}
          </CardTitle>
          <Badge variant={filter === 'pending' ? 'warning' : filter === 'completed' ? 'success' : 'info'}>
            {filteredAssignments.length} {t('evaluationsCount', lang)}
          </Badge>
        </CardHeader>
        <CardBody className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="py-12 text-center text-[var(--muted)]">
              {filter === 'pending' ? (
                <>
                  <CheckCircle className="w-12 h-12 text-[var(--success)] mx-auto mb-3" />
                  <p>{t('congratsAllDone', lang)} 🎉</p>
                </>
              ) : (
                <>
                  <ClipboardList className="w-12 h-12 text-[var(--muted)]/40 mx-auto mb-3" />
                  <p>{t('noEvaluationsYet', lang)}</p>
                </>
              )}
            </div>
          ) : (
            <div>
              {showPendingSection ? (
                <EvaluationSection
                  title={t('evaluationsPendingSection', lang)}
                  groups={pendingGroups}
                  lang={lang}
                  defaultSectionOpen
                  empty={
                    filter === 'pending' ? undefined : (
                      <p className="px-6 py-4 text-sm text-[var(--muted)]">{t('congratsAllDone', lang)} 🎉</p>
                    )
                  }
                />
              ) : null}
              {showCompletedSection ? (
                <EvaluationSection
                  title={t('evaluationsCompletedSection', lang)}
                  groups={completedGroups}
                  lang={lang}
                  defaultSectionOpen={filter === 'completed'}
                  compactGroups
                />
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
