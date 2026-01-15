'use client'

import { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'info'

function toneVars(tone: Tone) {
  switch (tone) {
    case 'success':
      return {
        icon: 'text-[var(--success)]',
        iconBg: 'bg-[var(--success-soft)]',
        border: 'border-[var(--success)]/25',
      }
    case 'warning':
      return {
        icon: 'text-[var(--warning)]',
        iconBg: 'bg-[var(--warning-soft)]',
        border: 'border-[var(--warning)]/25',
      }
    case 'danger':
      return {
        icon: 'text-[var(--danger)]',
        iconBg: 'bg-[var(--danger-soft)]',
        border: 'border-[var(--danger)]/25',
      }
    case 'info':
      return {
        icon: 'text-[var(--info)]',
        iconBg: 'bg-[var(--info-soft)]',
        border: 'border-[var(--info)]/25',
      }
    case 'brand':
    default:
      return {
        icon: 'text-[var(--brand)]',
        iconBg: 'bg-[var(--brand-soft)]',
        border: 'border-[var(--brand)]/25',
      }
  }
}

export function StatTile({
  title,
  value,
  icon: Icon,
  tone = 'brand',
  right,
  className,
  ...props
}: {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  tone?: Tone
  right?: React.ReactNode
} & HTMLAttributes<HTMLDivElement>) {
  const v = toneVars(tone)
  return (
    <div
      className={cn(
        'bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm transition-all',
        'hover:-translate-y-0.5 hover:shadow-md',
        className
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-3">
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center border', v.iconBg, v.border)}>
          <Icon className={cn('w-6 h-6', v.icon)} />
        </div>
        {right}
      </div>
      <div className="mt-4 text-3xl font-bold text-[var(--foreground)]">{value}</div>
      <div className="mt-1 text-sm text-[var(--muted)]">{title}</div>
    </div>
  )
}

