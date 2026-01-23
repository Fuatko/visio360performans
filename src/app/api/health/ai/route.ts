import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      route: '/api/health/ai',
      env: {
        openai_api_key_set: Boolean((process.env.OPENAI_API_KEY || '').trim()),
        openai_model: (process.env.OPENAI_MODEL || '').trim() || 'gpt-4o-mini',
        openai_base_url_set: Boolean((process.env.OPENAI_BASE_URL || '').trim()),
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'application/json; charset=utf-8',
      },
    }
  )
}

