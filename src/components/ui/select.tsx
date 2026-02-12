'use client'

import { SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder = 'Seçin...', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
            {label}
          </label>
        )}
        <select
          ref={ref}
          className={cn(
            'w-full px-4 py-2.5 text-sm border rounded-xl transition-all duration-200',
            'bg-[var(--surface)] border-[var(--border)] text-[var(--foreground)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/30 focus:border-[var(--brand)]',
            'disabled:bg-[var(--surface-2)] disabled:cursor-not-allowed',
            'appearance-none cursor-pointer',
            error && 'border-[var(--danger)] focus:ring-[var(--danger)]/30 focus:border-[var(--danger)]',
            className
          )}
          {...props}
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p className="mt-1.5 text-sm text-[var(--danger)]">{error}</p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'

export { Select }
