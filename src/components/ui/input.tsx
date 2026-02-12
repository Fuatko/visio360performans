'use client'

import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, type = 'text', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
            {label}
          </label>
        )}
        <input
          type={type}
          ref={ref}
          className={cn(
            'w-full px-4 py-2.5 text-sm border rounded-xl transition-all duration-200',
            'bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)] placeholder-[var(--muted)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 focus:border-[var(--brand)]',
            'disabled:bg-[var(--surface-2)] disabled:cursor-not-allowed',
            error && 'border-[var(--danger)] focus:ring-[var(--danger)]/30 focus:border-[var(--danger)]',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-[var(--danger)]">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'

export { Input }
