'use client'

import { SelectHTMLAttributes, forwardRef, useId } from 'react'
import { cn } from '@/lib/utils'

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  options: { value: string; label: string }[]
  placeholder?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder = 'Seçin...', id, 'aria-describedby': ariaDescribedBy, ...props }, ref) => {
    const generatedId = useId()
    const selectId = id || `select-${generatedId}`
    const errorId = error ? `${selectId}-error` : undefined
    const describedBy = [ariaDescribedBy, errorId].filter(Boolean).join(' ') || undefined
    const hasEmptyOption = options.some((o) => o.value === '')

    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
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
          {!hasEmptyOption ? <option value="">{placeholder}</option> : null}
          {options.map((option, index) => (
            <option key={option.value || `empty-${index}`} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={errorId} className="mt-1.5 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'

export { Select }
