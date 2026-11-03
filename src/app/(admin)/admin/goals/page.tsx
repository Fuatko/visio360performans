'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardBody, Badge, Button, toast, ToastContainer } from '@/components/ui'
import { useLang } from '@/components/i18n/language-context'
import { useAdminContextStore } from '@/store/admin-context'
import { useAuthStore } from '@/store/auth'
import { t } from '@/lib/i18n'
import { GOAL_STATUSES, isGoalTextLocked, type GoalStatus } from '@/lib/goals'
import { ChevronDown, ChevronRight, Loader2, Plus, Target, Trash2 } from 'lucide-react'

type Lang = 'tr' | 'en' | 'fr'
type Period = { id: string; name: string }
type Goal = {
  id: string
  title: string
  description: string | null
  weight: number | string | null
  target_text: string | null
  due_date: string | null
  status: GoalStatus
  score: number | string | null
  score_rationale: string | null
}
type Person = {
  user_id: string
  name: string
  title: string
  department: string
  goals: Goal[]
  weight_total: number
  scored_count: number
}
type Payload = { period: { id: string; name: string; status: string | null; end_date: string | null }; canScore: boolean; people: Person[] }

const STATUS_KEY: Record<GoalStatus, string> = {
  open: 'goalsStatusOpen',
  achieved: 'goalsStatusAchieved',
  partial: 'goalsStatusPartial',
  missed: 'goalsStatusMissed',
  cancelled: 'goalsStatusCancelled',
}

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}
const dateOnly = (v: string | null) => (v ? String(v).slice(0, 10) : '')

type Draft = {
  title: string
  description: string
  weight: string
  target_text: string
  due_date: string
  status: GoalStatus
  score: string
  score_rationale: string
}
const emptyDraft: Draft = { title: '', description: '', weight: '', target_text: '', due_date: '', status: 'open', score: '', score_rationale: '' }
const draftOf = (g: Goal): Draft => ({
  title: g.title || '',
  description: g.description || '',
  weight: n(g.weight) === null ? '' : String(n(g.weight)),
  target_text: g.target_text || '',
  due_date: dateOnly(g.due_date),
  status: g.status,
  score: n(g.score) === null ? '' : String(n(g.score)),
  score_rationale: g.score_rationale || '',
})

export default function GoalsPage() {
  const lang = useLang() as Lang
  const { organizationId } = useAdminContextStore()
  const { user } = useAuthStore()
  const orgId = user?.role === 'org_admin' ? String(user.organization_id || '') : String(organizationId || '')

  const [periods, setPeriods] = useState<Period[]>([])
  const [periodId, setPeriodId] = useState('')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(false)
  const [openPerson, setOpenPerson] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null) // goal id | 'new'
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!orgId) return
    ;(async () => {
      try {
        const resp = await fetch(`/api/admin/matrix-data?org_id=${encodeURIComponent(orgId)}`, { cache: 'no-store' })
        const json = (await resp.json().catch(() => ({}))) as { success?: boolean; periods?: Array<{ id: string; name: string }> }
        if (resp.ok && json?.success) setPeriods((json.periods || []).map((p) => ({ id: String(p.id), name: String(p.name || '') })))
      } catch {
        /* ignore */
      }
    })()
  }, [orgId])

  const load = useCallback(
    async (pid: string) => {
      if (!pid || !orgId) return
      setLoading(true)
      try {
        const qs = new URLSearchParams({ period_id: pid, org_id: orgId })
        const resp = await fetch(`/api/admin/goals?${qs.toString()}`, { cache: 'no-store' })
        const json = (await resp.json().catch(() => ({}))) as Payload & { success?: boolean; error?: string }
        if (!resp.ok || !json?.success) throw new Error(json?.error || t('exportNoData', lang))
        setData(json)
      } catch (e) {
        setData(null)
        toast(e instanceof Error ? e.message : t('exportNoData', lang), 'error')
      } finally {
        setLoading(false)
      }
    },
    [orgId, lang]
  )

  const errorText = (code: string | undefined) =>
    code === 'goal_scored_locked'
      ? t('goalsTextLocked', lang)
      : code === 'goal_scored_no_delete'
        ? t('goalsDeleteBlocked', lang)
        : code === 'period_not_completed'
          ? t('goalsScoreLockedPeriodOpen', lang)
          : code || t('saveError', lang)

  const save = async (person: Person, goal: Goal | null) => {
    if (!draft.title.trim()) return void toast(t('goalsFieldTitle', lang), 'error')
    setSaving(true)
    try {
      const locked = !!goal && isGoalTextLocked(n(goal.score))
      const textFields = {
        title: draft.title,
        description: draft.description,
        weight: draft.weight === '' ? null : Number(draft.weight),
        target_text: draft.target_text,
        due_date: draft.due_date || null,
      }
      let resp: Response
      if (!goal) {
        resp = await fetch('/api/admin/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ period_id: periodId, user_id: person.user_id, org_id: orgId, status: draft.status, ...textFields }),
        })
      } else {
        const body: Record<string, unknown> = { id: goal.id, org_id: orgId, status: draft.status }
        // Puanlanmış hedefte metin alanları GÖNDERİLMEZ (kilitli).
        if (!locked) Object.assign(body, textFields)
        if (data?.canScore) {
          const newScore = draft.score === '' ? null : Number(draft.score)
          if (newScore !== n(goal.score)) body.score = newScore
          body.score_rationale = draft.score_rationale
        }
        resp = await fetch('/api/admin/goals', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      const json = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string }
      if (!resp.ok || !json?.success) throw new Error(errorText(json?.error))
      toast(t('saved', lang), 'success')
      setEditing(null)
      await load(periodId)
    } catch (e) {
      toast(e instanceof Error ? e.message : t('saveError', lang), 'error')
    } finally {
      setSaving(false)
    }
  }

  const remove = async (goal: Goal) => {
    if (!window.confirm(`${t('delete', lang)}: ${goal.title}?`)) return
    const qs = new URLSearchParams({ id: goal.id, org_id: orgId })
    const resp = await fetch(`/api/admin/goals?${qs.toString()}`, { method: 'DELETE' })
    const json = (await resp.json().catch(() => ({}))) as { success?: boolean; error?: string }
    if (!resp.ok || !json?.success) return void toast(errorText(json?.error), 'error')
    await load(periodId)
  }

  const canScore = !!data?.canScore
  const inputCls = 'w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-sm disabled:opacity-60'

  const editor = (person: Person, goal: Goal | null) => {
    const locked = !!goal && isGoalTextLocked(n(goal.score))
    return (
      <div className="grid gap-2 sm:grid-cols-2 rounded-lg border border-[var(--brand)]/40 bg-[var(--surface-2)]/40 p-3">
        <label className="text-xs text-[var(--muted)] sm:col-span-2">
          {t('goalsFieldTitle', lang)}
          <input className={inputCls} value={draft.title} disabled={locked} title={locked ? t('goalsTextLocked', lang) : undefined} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
        </label>
        <label className="text-xs text-[var(--muted)] sm:col-span-2">
          {t('goalsFieldDescription', lang)}
          <textarea className={inputCls} rows={2} value={draft.description} disabled={locked} title={locked ? t('goalsTextLocked', lang) : undefined} onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
        </label>
        <label className="text-xs text-[var(--muted)]">
          {t('goalsFieldWeight', lang)}
          <input type="number" min={0} max={100} className={inputCls} value={draft.weight} disabled={locked} title={locked ? t('goalsTextLocked', lang) : undefined} onChange={(e) => setDraft((d) => ({ ...d, weight: e.target.value }))} />
        </label>
        <label className="text-xs text-[var(--muted)]">
          {t('goalsFieldDueDate', lang)}
          <input type="date" className={inputCls} value={draft.due_date} disabled={locked} title={locked ? t('goalsTextLocked', lang) : undefined} onChange={(e) => setDraft((d) => ({ ...d, due_date: e.target.value }))} />
        </label>
        <label className="text-xs text-[var(--muted)] sm:col-span-2">
          {t('goalsFieldTarget', lang)}
          <input className={inputCls} value={draft.target_text} disabled={locked} title={locked ? t('goalsTextLocked', lang) : undefined} onChange={(e) => setDraft((d) => ({ ...d, target_text: e.target.value }))} />
        </label>
        <label className="text-xs text-[var(--muted)]">
          {t('goalsFieldStatus', lang)}
          <select className={inputCls} value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as GoalStatus }))}>
            {GOAL_STATUSES.map((st) => (
              <option key={st} value={st}>
                {t(STATUS_KEY[st] as never, lang)}
              </option>
            ))}
          </select>
        </label>
        {goal ? (
          <label className="text-xs text-[var(--muted)]">
            {t('goalsFieldScore', lang)}
            <input
              type="number"
              min={1}
              max={5}
              step={0.1}
              className={inputCls}
              value={draft.score}
              disabled={!canScore}
              title={!canScore ? t('goalsScoreLockedPeriodOpen', lang) : undefined}
              onChange={(e) => setDraft((d) => ({ ...d, score: e.target.value }))}
            />
          </label>
        ) : null}
        {goal ? (
          <label className="text-xs text-[var(--muted)] sm:col-span-2">
            {t('goalsFieldScoreRationale', lang)}
            <textarea className={inputCls} rows={2} value={draft.score_rationale} disabled={!canScore} onChange={(e) => setDraft((d) => ({ ...d, score_rationale: e.target.value }))} />
          </label>
        ) : null}
        {locked ? <p className="text-xs text-amber-700 dark:text-amber-300 sm:col-span-2">{t('goalsTextLocked', lang)}</p> : null}
        <div className="flex gap-2 sm:col-span-2">
          <Button size="sm" onClick={() => void save(person, goal)} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t('save', lang)}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
            {lang === 'en' ? 'Cancel' : lang === 'fr' ? 'Annuler' : 'Vazgeç'}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <ToastContainer />
      <div className="mb-2 flex items-center gap-2">
        <Target className="w-6 h-6 text-[var(--brand)]" aria-hidden />
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">{t('goalsPageTitle', lang)}</h1>
      </div>
      <p className="text-sm text-[var(--muted)]">{t('goalsPageDesc', lang)}</p>
      <p className="mb-5 text-sm font-medium text-sky-800 dark:text-sky-200">{t('goalsNotInPerformance', lang)}</p>

      <Card className="mb-5">
        <CardBody className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-[var(--muted)]">{t('goalsSelectPeriod', lang)}</label>
            <select
              className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--foreground)]"
              value={periodId}
              onChange={(e) => {
                setPeriodId(e.target.value)
                setData(null)
                setOpenPerson(null)
                setEditing(null)
                void load(e.target.value)
              }}
            >
              <option value="">{t('goalsSelectPeriod', lang)}</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-[var(--muted)]" /> : null}
        </CardBody>
      </Card>

      {data && !canScore ? (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
          {t('goalsScoreLockedPeriodOpen', lang)}
        </p>
      ) : null}

      {data && !data.people.length ? <p className="text-sm text-[var(--muted)]">{t('goalsNoPeople', lang)}</p> : null}

      {data && data.people.length ? (
        <Card>
          <CardBody className="p-0 divide-y divide-[var(--border)]">
            {data.people.map((p) => {
              const open = openPerson === p.user_id
              const ok100 = Math.abs(p.weight_total - 100) < 0.005
              return (
                <div key={p.user_id}>
                  <button
                    type="button"
                    className="w-full flex flex-wrap items-center gap-3 px-4 py-2.5 text-left hover:bg-[var(--surface-2)]/50"
                    onClick={() => {
                      setOpenPerson(open ? null : p.user_id)
                      setEditing(null)
                    }}
                    aria-expanded={open}
                  >
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    <span className="font-medium text-[var(--foreground)] min-w-[10rem]">{p.name}</span>
                    <span className="text-xs text-[var(--muted)]">{[p.title, p.department].filter(Boolean).join(' · ')}</span>
                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      <Badge variant="info">{p.goals.length}</Badge>
                      {p.goals.length ? (
                        <Badge variant={ok100 ? 'success' : 'warning'} title={ok100 ? undefined : t('goalsWeightWarning', lang)}>
                          {t('goalsWeightTotal', lang)}: {p.weight_total}
                        </Badge>
                      ) : null}
                      {p.goals.length ? (
                        <Badge variant="gray">
                          {t('goalsScoreAction', lang)}: {p.scored_count}/{p.goals.length}
                        </Badge>
                      ) : null}
                    </span>
                  </button>
                  {open ? (
                    <div className="px-4 pb-4 space-y-2">
                      {p.goals.length && !ok100 ? (
                        <p className="text-xs text-amber-700 dark:text-amber-300">{t('goalsWeightWarning', lang)}</p>
                      ) : null}
                      {!p.goals.length ? <p className="text-sm text-[var(--muted)]">{t('goalsEmptyForPerson', lang)}</p> : null}
                      {p.goals.map((g) =>
                        editing === g.id ? (
                          <div key={g.id}>{editor(p, g)}</div>
                        ) : (
                          <div key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-[var(--border)] px-3 py-2 text-sm">
                            <span className="font-medium min-w-0 flex-1">{g.title}</span>
                            <span className="text-xs text-[var(--muted)]">{n(g.weight) === null ? '' : `%${n(g.weight)}`}</span>
                            <span className="text-xs text-[var(--muted)]">{g.target_text || ''}</span>
                            <span className="text-xs text-[var(--muted)]">{dateOnly(g.due_date)}</span>
                            <Badge variant="gray">{t(STATUS_KEY[g.status] as never, lang)}</Badge>
                            <span className="tabular-nums font-semibold">{n(g.score) === null ? '—' : n(g.score)!.toFixed(2)}</span>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditing(g.id)
                                setDraft(draftOf(g))
                              }}
                            >
                              {canScore ? t('goalsScoreAction', lang) : t('editLabel', lang)}
                            </Button>
                            {!isGoalTextLocked(n(g.score)) ? (
                              <Button size="sm" variant="ghost" onClick={() => void remove(g)} aria-label={t('delete', lang)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            ) : null}
                          </div>
                        )
                      )}
                      {editing === `new:${p.user_id}` ? (
                        editor(p, null)
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditing(`new:${p.user_id}`)
                            setDraft(emptyDraft)
                          }}
                        >
                          <Plus className="w-4 h-4" />
                          {t('goalsAdd', lang)}
                        </Button>
                      )}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
