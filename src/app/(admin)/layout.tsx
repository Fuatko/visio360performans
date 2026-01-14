'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import { AdminSidebar } from '@/components/layout/admin-sidebar'
import { ToastContainer } from '@/components/ui/toast'
import { Loader2 } from 'lucide-react'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const { user, isLoading } = useAuthStore()
  const [mounted, setMounted] = useState(false)

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
    <div className="min-h-screen bg-gray-50">
      <ToastContainer />
      <AdminSidebar />
      <main className="ml-64 p-8">
        {children}
      </main>
    </div>
  )
}
