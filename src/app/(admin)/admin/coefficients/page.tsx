'use client'

import { Card, CardBody, CardHeader, CardTitle, toast, ToastContainer } from '@/components/ui'

export default function CoefficientsPage() {
  return (
    <div className="space-y-6">
      <ToastContainer />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">🎛️ Katsayı Ayarları</h1>
        <p className="text-gray-500 mt-1">
          Bu ekran yakında eklenecek. Şimdilik menüde 404 olmaması için oluşturuldu.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bilgi</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-gray-600">
            Katsayı ayarlarını (pozisyon seviyesi ağırlıkları vb.) buraya taşıyacağız.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}

