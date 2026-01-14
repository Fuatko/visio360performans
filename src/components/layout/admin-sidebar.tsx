'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
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
} from 'lucide-react'

const menuItems = [
  { label: 'Ana Menü', type: 'title' },
  { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
  { label: 'Kurumlar', href: '/admin/organizations', icon: Building2 },
  { label: 'Kullanıcılar', href: '/admin/users', icon: Users },
  { label: 'Dönemler', href: '/admin/periods', icon: Calendar },
  { label: 'Değerlendirme', type: 'title' },
  { label: 'Değerlendirme Matrisi', href: '/admin/matrix', icon: Target },
  { label: 'Soru Yönetimi', href: '/admin/questions', icon: HelpCircle },
  { label: 'Sonuçlar & Raporlar', href: '/admin/results', icon: BarChart3 },
  { label: 'Sistem', type: 'title' },
  { label: 'Katsayı Ayarları', href: '/admin/coefficients', icon: Sliders },
  { label: 'Ayarlar', href: '/admin/settings', icon: Settings },
]

export function AdminSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()

  const handleLogout = () => {
    logout()
    window.location.href = '/login'
  }

  return (
    <aside className="w-64 bg-gradient-to-b from-white to-slate-50 border-r border-slate-200 min-h-screen flex flex-col fixed left-0 top-0">
      {/* Logo */}
      <div className="p-5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[var(--brand)] rounded-xl flex items-center justify-center shadow-lg shadow-black/5">
            <span className="text-lg font-bold text-white">V</span>
          </div>
          <div>
            <h1 className="text-slate-900 font-bold text-lg">VISIO 360°</h1>
            <p className="text-xs text-slate-500">Yönetim Paneli</p>
          </div>
        </div>
      </div>

      {/* Menu */}
      <nav className="flex-1 p-3 overflow-y-auto">
        {menuItems.map((item, index) => {
          if (item.type === 'title') {
            return (
              <div
                key={index}
                className="text-xs text-slate-500 uppercase tracking-wider mt-5 mb-2 px-3"
              >
                {item.label}
              </div>
            )
          }

          const Icon = item.icon!
          const isActive = pathname === item.href

          return (
            <Link
              key={index}
              href={item.href!}
              className={cn(
                'flex items-center gap-3 px-4 py-2.5 rounded-xl mb-1 transition-all duration-200',
                isActive
                  ? 'bg-[var(--brand-soft)] text-[var(--brand)] border border-[var(--border)] shadow-sm'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[var(--brand)] rounded-xl flex items-center justify-center text-white font-semibold text-sm">
            {user ? getInitials(user.name) : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-900 text-sm font-medium truncate">
              {user?.name || 'Kullanıcı'}
            </p>
            <p className="text-slate-500 text-xs truncate">
              {user?.email || ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            title="Çıkış Yap"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
