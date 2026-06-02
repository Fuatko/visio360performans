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

  const handleLogout = async () => {
    try {
      await fetch('/api/session', { method: 'DELETE', credentials: 'include' })
    } catch {
      // Oturum çerezi silinemese bile yerel çıkış yapılır
    }
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

            {/* Nav — iPad (≥768px) tablet düzeni lg’ye kadar alt menüde; üst menü sadece lg+ */}
            <nav className="hidden lg:flex flex-1 items-center gap-1 overflow-x-auto min-w-0" aria-label={t('dashboard', lang)}>
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
                    <span title={item.label}>{item.shortLabel}</span>
                  </Link>
                )
              })}
            </nav>

            {/* Dil + kullanıcı + çıkış */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="w-20 sm:w-28 hidden min-[420px]:block">
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
              <div className="text-right hidden lg:block">
                <p className="text-sm font-medium text-[var(--foreground)]">{user.name}</p>
                <p className="text-xs text-[var(--muted)]">{user.title || user.department || '-'}</p>
              </div>
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[var(--brand)] rounded-xl hidden sm:flex items-center justify-center text-white font-semibold text-sm shrink-0">
                {getInitials(user.name)}
              </div>
              {/* Çıkış — her genişlikte yazılı (iPad md=768’de ikon-only kayboluyordu) */}
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl border-2 border-[var(--danger)]/40 bg-[var(--danger-soft)] text-sm font-semibold text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white hover:border-[var(--danger)] shrink-0"
                title={t('logout', lang)}
                aria-label={t('logout', lang)}
              >
                <LogOut className="w-4 h-4 shrink-0" aria-hidden />
                <span>{t('logoutShort', lang)}</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 lg:pb-8">
        {children}
      </main>

      {/* Mobile bottom navigation — Gelişim her zaman görünür */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-[var(--surface)] border-t border-[var(--border)]"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom, 0px))' }}
        aria-label={t('dashboard', lang)}
      >
        <div className="grid grid-cols-6 gap-0">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                aria-label={item.label}
                className={cn(
                  'flex flex-col items-center justify-center gap-0.5 py-2 px-0.5 min-h-[56px] text-[9px] sm:text-[10px] font-medium',
                  isActive ? 'text-[var(--brand)] bg-[var(--brand-soft)]/50' : 'text-[var(--muted)]'
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="leading-tight text-center line-clamp-2">{item.shortLabel}</span>
              </Link>
            )
          })}
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex flex-col items-center justify-center gap-0.5 py-2 px-0.5 min-h-[56px] text-[9px] sm:text-[10px] font-semibold text-[var(--danger)] hover:bg-[var(--danger-soft)]"
            aria-label={t('logout', lang)}
          >
            <LogOut className="w-5 h-5 shrink-0" aria-hidden />
            <span className="leading-tight text-center">{t('logoutShort', lang)}</span>
          </button>
        </div>
      </nav>
      </div>
    </LanguageProvider>
  )
}
