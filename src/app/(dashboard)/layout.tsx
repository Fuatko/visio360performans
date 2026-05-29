'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/store/auth'
import { ToastContainer } from '@/components/ui/toast'
import { cn, getInitials } from '@/lib/utils'
import { Loader2, LayoutDashboard, ClipboardList, BarChart3, Target, LogOut, ListChecks } from 'lucide-react'
import { Select } from '@/components/ui'
import { LanguageProvider } from '@/components/i18n/language-context'
import { Lang, t } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'

function detectBrowserLang(): Lang {
  try {
    const navLang = (typeof navigator !== 'undefined' ? navigator.language : '') || ''
    const l = navLang.toLowerCase()
    if (l.startsWith('fr')) return 'fr'
    if (l.startsWith('en')) return 'en'
    return 'tr'
  } catch {
    return 'tr'
  }
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, isLoading, logout, setUser } = useAuthStore()
  const [lang, setLang] = useState<Lang>(() => {
    try {
      const saved = typeof window !== 'undefined' ? window.localStorage.getItem('visio360_prelogin_lang') : null
      if (saved === 'tr' || saved === 'en' || saved === 'fr') return saved
    } catch {}
    return detectBrowserLang()
  })

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login')
    }
  }, [isLoading, user, router])

  useEffect(() => {
    if (!user) return
    setLang((prev) => (user.preferred_language as Lang) || prev || 'tr')
  }, [user])

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  const menuItems = useMemo(
    () => [
      { label: t('dashboard', lang), shortLabel: t('dashboard', lang), href: '/dashboard', icon: LayoutDashboard },
      { label: t('myEvaluations', lang), shortLabel: t('myEvaluations', lang), href: '/dashboard/evaluations', icon: ClipboardList },
      { label: t('myResults', lang), shortLabel: t('myResults', lang), href: '/dashboard/results', icon: BarChart3 },
      { label: t('myDevelopment', lang), shortLabel: t('myDevelopmentShort', lang), href: '/dashboard/development', icon: Target },
      { label: t('actionPlanTracking', lang), shortLabel: t('actionPlanShort', lang), href: '/dashboard/action-plans', icon: ListChecks },
    ],
    [lang]
  )

  const saveLang = async (next: Lang) => {
    setLang(next)
    try {
      window.localStorage.setItem('visio360_prelogin_lang', next)
    } catch {}
    if (!user) return
    try {
      const { error } = await supabase.from('users').update({ preferred_language: next }).eq('id', user.id)
      if (error) throw error
      setUser({ ...user, preferred_language: next } as any)
      // auth store'da kullanıcı objesi local'de güncel kalır; sayfa refresh'le de gelir.
    } catch {
      // sessiz geç: UI dili değişsin, DB yazılamazsa admin sonra düzeltir
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--brand)]" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <LanguageProvider lang={lang}>
      <div className="min-h-screen bg-[var(--background)]">
      <ToastContainer />
      
      {/* Header */}
      <header className="bg-[var(--surface)] border-b border-[var(--border)] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[var(--brand)] rounded-xl flex items-center justify-center shadow-lg shadow-black/5">
                <span className="text-lg font-bold text-white">V</span>
              </div>
              <div>
                <h1 className="font-bold text-[var(--foreground)]">VISIO 360°</h1>
                <p className="text-xs text-[var(--muted)]">{t('performanceSystem', lang)}</p>
              </div>
            </div>

            {/* Nav */}
            <nav className="hidden md:flex flex-1 items-center gap-1 overflow-x-auto min-w-0" aria-label={t('dashboard', lang)}>
              {menuItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                      isActive
                        ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                        : 'text-[var(--foreground)] hover:bg-[var(--surface-2)]'
                    )}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="hidden lg:inline">{item.label}</span>
                    <span className="lg:hidden">{item.shortLabel}</span>
                  </Link>
                )
              })}
            </nav>

            {/* User */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="w-24 sm:w-32">
                <Select
                  options={[
                    { value: 'tr', label: `🇹🇷 ${t('tr', lang)}` },
                    { value: 'en', label: `🇬🇧 ${t('en', lang)}` },
                    { value: 'fr', label: `🇫🇷 ${t('fr', lang)}` },
                  ]}
                  value={lang}
                  onChange={(e) => saveLang(e.target.value as Lang)}
                  placeholder={t('language', lang)}
                />
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-[var(--foreground)]">{user.name}</p>
                <p className="text-xs text-[var(--muted)]">{user.title || user.department || '-'}</p>
              </div>
              <div className="w-10 h-10 bg-[var(--brand)] rounded-xl flex items-center justify-center text-white font-semibold text-sm">
                {getInitials(user.name)}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="p-2 text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--danger-soft)] rounded-lg transition-colors"
                title={t('logout', lang)}
                aria-label={t('logout', lang)}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Nav */}
      <nav className="md:hidden bg-[var(--surface)] border-b border-[var(--border)] px-4 py-2 flex gap-1 overflow-x-auto" aria-label={t('dashboard', lang)}>
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap',
                isActive
                  ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                  : 'text-[var(--foreground)]'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="max-[380px]:hidden">{item.shortLabel}</span>
            </Link>
          )
        })}
      </nav>

      {/* Main */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      </div>
    </LanguageProvider>
  )
}
