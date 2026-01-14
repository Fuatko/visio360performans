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
    <aside className="w-64 bg-gradient-to-b from-slate-800 to-slate-900 min-h-screen flex flex-col fixed left-0 top-0">
      {/* Logo */}
      <div className="p-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-amber-400 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <span className="text-lg font-bold text-slate-900">V</span>
          </div>
          <div>
            <h1 className="text-white font-bold text-lg">VISIO 360°</h1>
            <p className="text-xs text-slate-400">Super Admin</p>
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
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-500/25'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-amber-500 rounded-xl flex items-center justify-center text-slate-900 font-semibold text-sm">
            {user ? getInitials(user.name) : 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {user?.name || 'Kullanıcı'}
            </p>
            <p className="text-slate-400 text-xs truncate">
              {user?.email || ''}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
            title="Çıkış Yap"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
