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
      { label: t('dashboard', lang), href: '/dashboard', icon: LayoutDashboard },
      { label: t('myEvaluations', lang), href: '/dashboard/evaluations', icon: ClipboardList },
      { label: t('myResults', lang), href: '/dashboard/results', icon: BarChart3 },
      { label: t('myDevelopment', lang), href: '/dashboard/development', icon: Target },
      { label: t('actionPlanTracking', lang), href: '/dashboard/action-plans', icon: ListChecks },
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <LanguageProvider lang={lang}>
      <div className="min-h-screen">
      <ToastContainer />
      
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-3">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[var(--brand)] rounded-xl flex items-center justify-center shadow-lg shadow-black/5">
                <span className="text-lg font-bold text-white">V</span>
              </div>
              <div>
                <h1 className="font-bold text-gray-900">VISIO 360°</h1>
                <p className="text-xs text-gray-500">{t('performanceSystem', lang)}</p>
              </div>
            </div>

            {/* Nav */}
            <nav className="hidden md:flex flex-1 items-center gap-1 overflow-x-auto min-w-0">
              {menuItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
                      isActive
                        ? 'bg-blue-50 text-blue-600'
                        : 'text-gray-600 hover:bg-gray-100'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {item.label}
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
                <p className="text-sm font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{user.title || user.department || '-'}</p>
              </div>
              <div className="w-10 h-10 bg-[var(--brand)] rounded-xl flex items-center justify-center text-white font-semibold text-sm">
                {getInitials(user.name)}
              </div>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title={t('logout', lang)}
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Nav */}
      <nav className="md:hidden bg-white border-b border-gray-100 px-4 py-2 flex gap-1 overflow-x-auto">
        {menuItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap',
                isActive
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600'
              )}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Main */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      </div>
    </LanguageProvider>
  )
}
