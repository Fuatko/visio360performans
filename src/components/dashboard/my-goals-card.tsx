'use client'

import { useEffect, useState } from 'react'
import { Card, CardBody, CardHeader, CardTitle, Badge } from '@/components/ui'
import { t } from '@/lib/i18n'
import { Target } from 'lucide-react'

type Lang = 'tr' | 'en' | 'fr'

/** Sunucunun (serializeGoalForEmployee) gönderdiği satır; score/score_rationale yalnız görünürse VAR. */
type EmployeeGoal = {
  id: string
  title: string
  description: string | null
  weight: number | null
  target_text: string | null
  due_date: string | null
  status: 'open' | 'achieved' | 'partial' | 'missed' | 'cancelled'
  score?: number | null
  score_rationale?: string | null
}

type Payload = {
  success?: boolean
  period: { id: string; name: string; status: string | null } | null
  goals: EmployeeGoal[]
  weight_total: number
  score_pending: boolean
}

const STATUS_KEY = {
  open: 'goalsStatusOpen',
  achieved: 'goalsStatusAchieved',
  partial: 'goalsStatusPartial',
  missed: 'goalsStatusMissed',
  cancelled: 'goalsStatusCancelled',
} as const

const STATUS_VARIANT = {
  open: 'info',
  achieved: 'success',
  partial: 'warning',
  missed: 'danger',
  cancelled: 'gray',
} as const

/** Hedeflerim — hedef yoksa kart hiç çizilmez. Hedef puanı performans puanına dahil değildir. */
export function MyGoalsCard({ lang }: { lang: Lang }) {
  const [data, setData] = useState<Payload | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const resp = await fetch(`/api/my-goals?lang=${encodeURIComponent(lang)}`, { cache: 'no-store' })
        const json = (await resp.json().catch(() => null)) as Payload | null
        if (alive && resp.ok && json?.success) setData(json)
      } catch {
        /* kart gösterilmez */
      }
    })()
    return () => {
      alive = false
    }
  }, [lang])

  if (!data || !data.goals.length) return null

  const fmtDate = (d: string | null) => {
    if (!d) return ''
    try {
      return new Date(d).toLocaleDateString(lang === 'tr' ? 'tr-TR' : lang === 'fr' ? 'fr-FR' : 'en-GB')
    } catch {
      return d
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Target className="w-5 h-5 text-[var(--brand)]" />
          {t('myGoalsTitle', lang)}
          {data.period ? <span className="text-sm font-normal text-[var(--muted)]">· {data.period.name}</span> : null}
        </CardTitle>
      </CardHeader>
      <CardBody className="space-y-3">
        {data.goals.map((g) => (
          <div key={g.id} className="rounded-lg border border-[var(--border)] p-3 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-[var(--foreground)] min-w-0 flex-1">{g.title}</span>
              {g.weight !== null ? <span className="text-xs text-[var(--muted)]">%{g.weight}</span> : null}
              <Badge variant={STATUS_VARIANT[g.status] || 'info'}>{t(STATUS_KEY[g.status] || 'goalsStatusOpen', lang)}</Badge>
            </div>
            {g.description ? <p className="text-sm text-[var(--muted)]">{g.description}</p> : null}
            {g.target_text || g.due_date ? (
              <p className="text-xs text-[var(--muted)]">
                {g.target_text ? `${t('goalsFieldTarget', lang)}: ${g.target_text}` : ''}
                {g.target_text && g.due_date ? ' · ' : ''}
                {g.due_date ? `${t('goalsFieldDueDate', lang)}: ${fmtDate(g.due_date)}` : ''}
              </p>
            ) : null}
            {'score' in g && g.score !== null && g.score !== undefined ? (
              <p className="text-sm">
                <span className="font-semibold tabular-nums">{Number(g.score).toFixed(2)}</span>
                {g.score_rationale ? <span className="text-[var(--muted)]"> — {g.score_rationale}</span> : null}
              </p>
            ) : (
              <p className="text-xs text-[var(--muted)]">{t('myGoalsScorePending', lang)}</p>
            )}
          </div>
        ))}
        <p className="text-xs text-[var(--muted)]">{t('goalsNotInPerformance', lang)}</p>
      </CardBody>
    </Card>
  )
}
