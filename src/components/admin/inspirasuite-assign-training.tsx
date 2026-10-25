'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Award, Loader2, Search, Sparkles, X } from 'lucide-react'
import { Button, Input, toast } from '@/components/ui'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'

type Lang = 'tr' | 'en' | 'fr'

interface Course {
  id: string
  title: string
  price?: number | null
  is_free?: boolean
  currency?: string | null
  category?: string | null
  level?: string | null
}

interface ProgressRow {
  course_id?: string
  course_title: string
  progress: number
  status: string
}

function priceLabel(c: Course, lang: Lang) {
  if (c.is_free || c.price === 0) return t('asgFree', lang)
  if (typeof c.price === 'number') return `${c.currency === 'USD' ? '$' : '₺'}${c.price}`
  return ''
}

function statusLabel(status: string, lang: Lang) {
  const s = (status || '').toLowerCase()
  if (s === 'completed' || s === 'complete')
    return { text: t('asgStatusCompleted', lang), className: 'text-emerald-600' }
  if (s === 'not_started' || s === 'assigned')
    return { text: t('asgStatusNotStarted', lang), className: 'text-slate-500' }
  return { text: t('asgStatusInProgress', lang), className: 'text-blue-600' }
}

// ---------------------------------------------------------------------------
// Assigned trainings tracking table (Section 5)
// ---------------------------------------------------------------------------
export function AssignedTrainingsPanel({ personId, refreshKey }: { personId: string; refreshKey?: number }) {
  const lang = useLang()
  const [rows, setRows] = useState<ProgressRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!personId) return
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`/api/integrations/inspirasuite/progress?user_id=${encodeURIComponent(personId)}`)
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.success) throw new Error(data.error || t('asgProgressFailed', lang))
      setRows(Array.isArray(data.courses) ? data.courses : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('asgProgressFailed', lang))
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [personId, lang])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  if (!personId) return null

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
        <Award className="h-4 w-4 text-[var(--brand)]" /> {t('asgAssignedTrainings', lang)}
      </div>
      {loading && !rows ? (
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('loading', lang)}
        </div>
      ) : error ? (
        <div className="text-sm text-[var(--muted)]">{error}</div>
      ) : rows && rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--surface-2)] text-left text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 font-medium">{t('asgColCourse', lang)}</th>
                <th className="px-3 py-2 font-medium">{t('tcntProgress', lang)}</th>
                <th className="px-3 py-2 font-medium">{t('status', lang)}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const st = statusLabel(r.status, lang)
                const pct = Math.max(0, Math.min(100, Math.round(Number(r.progress) || 0)))
                return (
                  <tr key={r.course_id || i} className="border-t border-[var(--border)]">
                    <td className="px-3 py-2 text-[var(--foreground)]">{r.course_title}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--surface-2)]">
                          <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="tabular-nums text-xs text-[var(--muted)]">{pct}%</span>
                      </div>
                    </td>
                    <td className={`px-3 py-2 font-medium ${st.className}`}>{st.text}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-sm text-[var(--muted)]">{t('asgNoAssignedYet', lang)}</div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Assign modal (Section 4)
// ---------------------------------------------------------------------------
function AssignModal({
  personId,
  personName,
  assignedBy,
  gapOptions,
  onClose,
  onAssigned,
}: {
  personId: string
  personName: string
  assignedBy?: string
  gapOptions?: string[]
  onClose: () => void
  onAssigned: () => void
}) {
  const lang = useLang()
  const [courses, setCourses] = useState<Course[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [note, setNote] = useState('')
  const [gap, setGap] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const resp = await fetch('/api/integrations/inspirasuite/courses')
        const data = await resp.json().catch(() => ({}))
        if (!resp.ok || !data.success) throw new Error(data.error || t('asgCoursesFailed', lang))
        if (alive) setCourses(Array.isArray(data.courses) ? data.courses : [])
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : t('asgCoursesFailed', lang))
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [lang])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = (courses || []).filter((c) => {
    if (!query.trim()) return true
    const hay = `${c.title || ''} ${c.category || ''}`.toLowerCase()
    return hay.includes(query.trim().toLowerCase())
  })

  const selectedCourses = (courses || []).filter((c) => selected[c.id])

  const submit = async () => {
    if (selectedCourses.length === 0) {
      toast(t('asgPickAtLeastOne', lang), 'warning')
      return
    }
    setSubmitting(true)
    setErrorMsg(null)
    let ok = 0
    const errors: string[] = []
    for (const c of selectedCourses) {
      try {
        const resp = await fetch('/api/integrations/inspirasuite/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: personId,
            user_name: personName,
            course_id: c.id,
            course_title: c.title,
            assigned_by: assignedBy || 'Visio360PDS',
            reason: note.trim() || undefined,
            gap_competency: gap || undefined,
            due_date: dueDate || undefined,
          }),
        })
        const data = await resp.json().catch(() => ({}))
        if (resp.ok && data.success) ok++
        else errors.push(String(data.error || t('asgCourseNotAssigned', lang).replace('{title}', c.title)))
      } catch {
        errors.push(t('asgCourseConnError', lang).replace('{title}', c.title))
      }
    }
    setSubmitting(false)
    if (ok > 0) {
      toast(
        ok === 1
          ? t('asgAssignedOne', lang).replace('{name}', personName)
          : t('asgAssignedMany', lang).replace('{n}', String(ok)).replace('{name}', personName),
        'success'
      )
    }
    if (errors.length > 0) {
      // Gerçek hata sebebini göster (ör. "Bu kişi InspiraSuite'te kayıtlı değil…")
      setErrorMsg(errors[0])
      toast(errors[0], 'error')
    }
    if (ok > 0) {
      onAssigned()
      onClose()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-[var(--foreground)]">
              <Award className="h-5 w-5 text-[var(--brand)]" /> {t('asgModalTitle', lang)}
            </div>
            <div className="mt-0.5 text-sm text-[var(--muted)]">
              {t('asgPersonLabel', lang)} {personName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('asgClose', lang)}
            className="rounded-lg p-1 text-[var(--muted)] hover:bg-[var(--surface-2)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <Input
              placeholder={t('asgSearchCourse', lang)}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-[var(--muted)]">
              <Loader2 className="h-4 w-4 animate-spin" /> {t('asgCoursesLoading', lang)}
            </div>
          ) : error ? (
            <div className="py-6 text-sm text-[var(--danger)]">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-sm text-[var(--muted)]">{t('asgNoCourse', lang)}</div>
          ) : (
            <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              {filtered.map((c) => (
                <li key={c.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[var(--surface-2)]">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--brand)]"
                      checked={!!selected[c.id]}
                      onChange={(e) => setSelected((prev) => ({ ...prev, [c.id]: e.target.checked }))}
                    />
                    <span className="flex-1 text-sm text-[var(--foreground)]">{c.title}</span>
                    <span className="text-xs font-medium text-[var(--muted)]">{priceLabel(c, lang)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {gapOptions && gapOptions.length > 0 ? (
            <div className="mt-4">
              <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">{t('asgGapLabel', lang)}</label>
              <select
                value={gap}
                onChange={(e) => setGap(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
              >
                <option value="">{t('asgGapNone', lang)}</option>
                {gapOptions.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--muted)]">{t('asgGapHint', lang)}</p>
            </div>
          ) : null}

          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">{t('asgDueDateLabel', lang)}</label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-sm font-medium text-[var(--foreground)]">{t('asgNoteLabel', lang)}</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={t('asgNotePlaceholder', lang)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder-[var(--muted)] focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30"
            />
          </div>
        </div>

        {errorMsg ? (
          <div className="mx-5 mb-1 mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
            <span className="mt-0.5">⚠</span>
            <span>{errorMsg}</span>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-4">
          <span className="text-xs text-[var(--muted)]">
            {t('asgSelectedCount', lang).replace('{n}', String(selectedCourses.length))}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={submitting}>
              {t('asgCancel', lang)}
            </Button>
            <Button onClick={submit} disabled={submitting || selectedCourses.length === 0}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('asgAssignAndNotify', lang)}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Public launcher: button + modal + tracking table
// ---------------------------------------------------------------------------
export function AssignTrainingButton({
  personId,
  personName,
  assignedBy,
  gapOptions,
  showTracking = true,
  onChanged,
}: {
  personId: string
  personName: string
  assignedBy?: string
  gapOptions?: string[]
  showTracking?: boolean
  onChanged?: () => void
}) {
  const lang = useLang()
  const [open, setOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [autoBusy, setAutoBusy] = useState(false)

  const autoAssign = async () => {
    setAutoBusy(true)
    try {
      const resp = await fetch('/api/integrations/inspirasuite/auto-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ person_id: personId }),
      })
      const data = await resp.json().catch(() => ({}))
      if (!resp.ok || !data.success) throw new Error(data.error || t('asgAutoFailed', lang))
      const n = Array.isArray(data.assigned) ? data.assigned.length : 0
      if (n > 0) {
        toast(t('asgAutoOk', lang).replace('{n}', String(n)), 'success')
        setRefreshKey((k) => k + 1)
        onChanged?.()
      } else {
        toast(t('asgAutoNoGap', lang), 'info')
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : t('asgAutoFailed', lang), 'error')
    } finally {
      setAutoBusy(false)
    }
  }

  if (!personId) return null

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--foreground)]">{t('asgCardTitle', lang)}</div>
          <div className="text-xs text-[var(--muted)]">{t('asgCardHint', lang).replace('{name}', personName)}</div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={autoAssign} disabled={autoBusy}>
            {autoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{' '}
            {t('asgAutoAssign', lang)}
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Award className="h-4 w-4" /> {t('asgAssignTraining', lang)}
          </Button>
        </div>
      </div>

      {showTracking ? <AssignedTrainingsPanel personId={personId} refreshKey={refreshKey} /> : null}

      {open ? (
        <AssignModal
          personId={personId}
          personName={personName}
          assignedBy={assignedBy}
          gapOptions={gapOptions}
          onClose={() => setOpen(false)}
          onAssigned={() => {
            setRefreshKey((k) => k + 1)
            onChanged?.()
          }}
        />
      ) : null}
    </div>
  )
}
