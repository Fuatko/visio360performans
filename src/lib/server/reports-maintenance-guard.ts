import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  getAdminReportsMaintenance,
  isReportsMaintenanceBlocked,
} from '@/lib/server/platform-settings'

export async function reportsMaintenanceBlockedResponse(
  supabase: SupabaseClient,
  role: string | null | undefined
): Promise<NextResponse | null> {
  const maintenance = await getAdminReportsMaintenance(supabase)
  if (!isReportsMaintenanceBlocked(maintenance, role)) return null
  return NextResponse.json(
    {
      success: false,
      maintenance: true,
      error: 'ŞU ANDA YAZILIMIN BAKIM ÇALIŞMASI YAPILMAKTADIR',
    },
    { status: 503 }
  )
}
