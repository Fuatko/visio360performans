'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { getInitials } from '@/lib/utils'
import {
  LayoutDashboard,
  Building2,
  Users,
  Calendar,
  Target,
  HelpCircle,
  BarChart3,
  Settings,
  LogOut,
  Sliders,
  ClipboardList,
  BadgePercent,
  ListChecks,
  BookOpen,
} from 'lucide-react'
import { isCompensationEnabled } from '@/lib/feature-flags'

const menuItems = [
  { labelKey: 'menuMain', type: 'title' },
  { labelKey: 'adminDashboard', href: '/admin', icon: LayoutDashboard },
  { labelKey: 'myEvaluations', href: '/admin/my-evaluations', icon: ClipboardList },
  { labelKey: 'organizations', href: '/admin/organizations', icon: Building2 },
  { labelKey: 'users', href: '/admin/users', icon: Users },
  { labelKey: 'periods', href: '/admin/periods', icon: Calendar },
  { labelKey: 'menuEvaluation', type: 'title' },
  { labelKey: 'matrix', href: '/admin/matrix', icon: Target },
  { labelKey: 'questionsMgmt', href: '/admin/questions', icon: HelpCircle },
  { labelKey: 'resultsReports', href: '/admin/results', icon: BarChart3 },
  { labelKey: 'actionPlanTracking', href: '/admin/action-plans', icon: ListChecks },
  { labelKey: 'trainingCatalog', href: '/admin/training-catalog', icon: BookOpen },
  ...(isCompensationEnabled()
    ? ([{ labelKey: 'compensation', href: '/admin/compensation', icon: BadgePercent }] as const)
    : ([] as const)),
  { labelKey: 'menuSystem', type: 'title' },
  { labelKey: 'coefficients', href: '/admin/coefficients', icon: Sliders },
  { labelKey: 'settings', href: '/admin/settings', icon: Settings },
] as const

export function AdminSidebar() {
  const lang = useLang()
  const pathname = usePathname()
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <aside className="w-64 bg-gradient-to-b from-[var(--surface)] to-[var(--surface-2)] border-r border-[var(--border)] min-h-screen flex flex-col fixed left-0 top-0">
      {/* Logo */}
      <div className="p-5 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[var(--brand)] rounded-xl flex items-center justify-center shadow-lg shadow-black/5">
            <span className="text-lg font-bold text-white">V</span>
          </div>
          <div>
            <h1 className="text-[var(--foreground)] font-bold text-lg">VISIO 360°</h1>
            <p className="text-xs text-[var(--muted)]">{t('adminPanel', lang)}</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {menuItems.map((item, index) => {
          if ('type' in item && item.type === 'title') {
            return (
              <div
                key={index}
                className="text-xs text-[var(--muted)] uppercase tracking-wider mt-5 mb-2 px-3"
              >
                {t(item.labelKey as any, lang)}
              </div>
            )
          }

          const Icon = (item as any).icon
          const isActive = pathname === (item as any).href

          return (
            <Link
              key={index}
              href={(item as any).href}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl mb-1 transition-all duration-200',
                isActive
                  ? 'bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--border)] shadow-sm'
                  : 'text-[var(--foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{t(item.labelKey as any, lang)}</span>
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--brand)] rounded-xl flex items-center justify-center text-white font-semibold text-sm">
            {user ? getInitials(user.name) : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[var(--foreground)] text-sm font-medium truncate">
              {user?.name || t('userFallbackName', lang)}
            </p>
            <p className="text-[var(--muted)] text-xs truncate">
              {user?.email || ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-2)] rounded-lg transition-colors"
            title={t('logout', lang)}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
