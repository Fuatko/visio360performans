'use client'

import { Card, CardBody, CardHeader, CardTitle, toast, ToastContainer, Button } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'

export default function AdminSettingsPage() {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(false)

  const testConnection = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.from('organizations').select('id').limit(1)
      if (error) throw error
      toast('Bağlantı başarılı', 'success')
    } catch (e: any) {
      toast(e?.message || 'Bağlantı hatası', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <ToastContainer />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">⚙️ Ayarlar</h1>
        <p className="text-gray-500 mt-1">Sistem ayarları ve bağlantı kontrolleri</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>🔗 Supabase Bağlantı Testi</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-sm text-gray-600">
            Mevcut oturum: <span className="font-medium">{user?.email || '-'}</span>
          </p>
          <Button onClick={testConnection} disabled={loading}>
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
            Bağlantıyı Test Et
          </Button>
        </CardBody>
      </Card>
    </div>
  )
}

