'use client'

import { IntegrationSettingsClient } from '@/components/admin/integration-settings-client'

export default function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Entegrasyon Yönetimi</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Dış platform bağlantılarını buradan yapılandırın.</p>
      </div>
      <IntegrationSettingsClient />
    </div>
  )
}
