import { NextRequest, NextResponse } from 'next/server'
import { verifySession } from '@/lib/server/session'
import { rateLimitByUser } from '@/lib/server/rate-limit'
import { getInspiraConfig, listCourses } from '@/lib/server/inspirasuite'

export const runtime = 'nodejs'

function sessionFromReq(req: NextRequest) {
  const token = req.cookies.get('visio360_session')?.value
  return verifySession(token)
}

// GET — InspiraSuite'teki yayınlanmış kursları getir
export async function GET(req: NextRequest) {
  const s = sessionFromReq(req)
  if (!s || (s.role !== 'super_admin' && s.role !== 'org_admin')) {
    return NextResponse.json({ success: false, error: 'Yetkisiz' }, { status: 401 })
  }

  const rl = await rateLimitByUser(req, 'integrations:inspirasuite:courses', String(s.uid || ''), 60, 60 * 1000)
  if (rl.blocked) return NextResponse.json({ success: false, error: 'Çok fazla istek yapıldı' }, { status: 429, headers: rl.headers })

  if (!(await getInspiraConfig()).enabled) {
    return NextResponse.json({ success: false, error: 'InspiraSuite entegrasyonu aktif değil' }, { status: 503 })
  }

  try {
    const courses = await listCourses()
    return NextResponse.json({ success: true, courses })
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Kurslar alınamadı' },
      { status: 502 }
    )
  }
}
