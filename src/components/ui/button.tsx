'use client'

import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, disabled, ...props }, ref) => {
    const baseStyles = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
    
    const variants = {
      primary: 'bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white shadow-sm shadow-black/5',
      secondary: 'bg-[var(--surface)] hover:bg-[var(--surface-2)] text-slate-700 border border-[var(--border)]',
      success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm shadow-black/5',
      danger: 'bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-black/5',
      ghost: 'bg-transparent hover:bg-[var(--brand-soft)] text-slate-700',
    }
    
    const sizes = {
      sm: 'px-3 py-1.5 text-sm gap-1.5',
      md: 'px-4 py-2.5 text-sm gap-2',
      lg: 'px-6 py-3 text-base gap-2',
    }
    
    return (
      <button
        ref={ref}
        className={cn(baseStyles, variants[variant], sizes[size], className)}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'

export { Button }
