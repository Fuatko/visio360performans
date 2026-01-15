'use client'

import { HTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gray'
}

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'bg-[var(--brand-soft)] text-[var(--brand-text)]',
      success: 'bg-[var(--success-soft)] text-[var(--success-text)]',
      warning: 'bg-[var(--warning-soft)] text-[var(--warning-text)]',
      danger: 'bg-[var(--danger-soft)] text-[var(--danger-text)]',
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
