'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { useAdminContextStore } from '@/store/admin-context'
import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { LanguageProvider } from '@/components/i18n/language-context'
import { Lang, t } from '@/lib/i18n'
import { Select, toast } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { ToastContainer } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, isLoading } = useAuthStore()
  const { organizationId, setOrganizationId } = useAdminContextStore()
  const [mounted, setMounted] = useState(false)
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([])
  const [lang, setLang] = useState<Lang>('tr')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted && !isLoading) {
      if (!user) {
        router.push('/login')
      } else if (user.role !== 'super_admin' && user.role !== 'org_admin') {
        router.push('/dashboard')
      }
    }
  }, [mounted, isLoading, user, router])

  // KVKK: org_admin ise kurum sabitlenir
  useEffect(() => {
    if (!mounted || !user) return
    if (user.role === 'org_admin' && user.organization_id && organizationId !== user.organization_id) {
      setOrganizationId(user.organization_id)
    }
  }, [mounted, user, organizationId, setOrganizationId])

  // Super admin için kurum listesi
  useEffect(() => {
    if (!mounted || !user) return
    if (user.role !== 'super_admin') return

    ;(async () => {
      try {
        const { data, error } = await supabase.from('organizations').select('id,name').order('name')
        if (error) throw error
        setOrgs(data || [])
      } catch (e: any) {
        toast(e?.message || 'Kurumlar yüklenemedi', 'error')
      }
    })()
  }, [mounted, user])

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!user || (user.role !== 'super_admin' && user.role !== 'org_admin')) {
    return null
  }

  return (
    <LanguageProvider lang={lang}>
    <div className="min-h-screen bg-slate-50">
      <ToastContainer />
      <AdminSidebar />
      <main className="ml-64">
        {/* KVKK / Context Bar */}
        <div className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="px-8 py-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-slate-900">{t('organizationSelectionTitle', lang)}</div>
              <div className="text-xs text-slate-500">
                {t('organizationSelectionHint', lang)}
              </div>
            </div>

            {user.role === 'org_admin' ? (
              <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 px-4 py-2 rounded-xl">
                {user.organization_id ? 'Kurum sabit (org_admin)' : 'Kurum bulunamadı'}
              </div>
            ) : (
              <div className="w-80">
                <Select
                  options={orgs.map(o => ({ value: o.id, label: o.name }))}
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  placeholder={t('selectOrganization', lang)}
                />
              </div>
            )}
          </div>
        </div>

        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  </LanguageProvider>
  )
}
