'use client'

import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gray'
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'bg-[var(--brand-soft)] text-[var(--brand)]',
      success: 'bg-[var(--success-soft)] text-emerald-700',
      warning: 'bg-[var(--warning-soft)] text-amber-700',
      danger: 'bg-[var(--danger-soft)] text-red-700',
      info: 'bg-sky-100 text-sky-700',
      gray: 'bg-slate-100 text-slate-700',
    }
    
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'

export { Badge }
