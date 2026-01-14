'use client'

import { Card, CardBody } from '@/components/ui'
import { ReactNode } from 'react'

export function RequireSelection({
  enabled,
  title = 'KVKK / Güvenlik',
  message = 'Devam etmek için seçim yapın.',
  children,
}: {
  enabled: boolean
  title?: string
  message?: string
  children: ReactNode
}) {
  if (!enabled) return <>{children}</>

  return (
    <Card>
      <CardBody className="py-12 text-center text-slate-600">
        <div className="text-slate-900 font-semibold mb-2">{title}</div>
        <div className="text-sm">{message}</div>
      </CardBody>
    </Card>
  )
}

