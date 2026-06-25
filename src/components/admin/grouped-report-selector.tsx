'use client'

import { useMemo } from 'react'
import { BarChart3, BriefcaseBusiness, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { groupLabel } from '@/lib/admin-results-report-catalog-config'
import type { AdminResultsReportGroup } from '@/lib/admin-results-report-catalog'
import type { Lang } from '@/lib/i18n'

export type GroupedReportOption = {
  id: string
  label: string
  description: string
  group: AdminResultsReportGroup
}

type Props = {
  lang: Lang
  options: GroupedReportOption[]
  selectedId: string
  onSelect: (id: string) => void
}

function groupIcon(group: AdminResultsReportGroup) {
  if (group === 'summary') return BarChart3
  if (group === 'management') return BriefcaseBusiness
  return Users
}

export function GroupedReportSelector({ lang, options, selectedId, onSelect }: Props) {
  const summary = useMemo(() => options.find((o) => o.group === 'summary'), [options])
  const management = useMemo(
    () => options.filter((o) => o.group === 'management'),
    [options]
  )
  const hr = useMemo(() => options.filter((o) => o.group === 'hr'), [options])

  const renderCard = (option: GroupedReportOption, compact = false) => {
    const active = selectedId === option.id
    const Icon = groupIcon(option.group)
    return (
      <button
        key={option.id}
        type="button"
        onClick={() => onSelect(option.id)}
        className={cn(
          'w-full text-left rounded-xl border px-3 py-3 transition-all',
          active
            ? 'border-[var(--brand)] bg-[var(--brand)]/8 shadow-sm ring-1 ring-[var(--brand)]/25'
            : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]/70 hover:border-[var(--brand)]/30'
        )}
      >
        <div className="flex items-start gap-2.5">
          <Icon
            className={cn(
              'w-4 h-4 shrink-0 mt-0.5',
              active ? 'text-[var(--brand)]' : 'text-[var(--muted)]'
            )}
          />
          <div className="min-w-0">
            <div
              className={cn(
                'font-medium leading-snug',
                compact ? 'text-sm' : 'text-sm sm:text-base',
                active ? 'text-[var(--foreground)]' : 'text-[var(--foreground)]'
              )}
            >
              {option.label}
            </div>
            <p className="text-xs text-[var(--muted)] mt-1 leading-relaxed line-clamp-2">{option.description}</p>
          </div>
        </div>
      </button>
    )
  }

  const renderGroup = (title: string, items: GroupedReportOption[]) => {
    if (!items.length) return null
    return (
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-2 px-0.5">
          {title}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {items.map((item) => renderCard(item))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {summary ? (
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)] mb-2 px-0.5">
            {groupLabel('summary', lang)}
          </h3>
          {renderCard(summary)}
        </div>
      ) : null}

      <div className="max-h-[min(52vh,520px)] overflow-y-auto pr-1 space-y-4">
        {renderGroup(groupLabel('management', lang), management)}
        {renderGroup(groupLabel('hr', lang), hr)}
      </div>
    </div>
  )
}
