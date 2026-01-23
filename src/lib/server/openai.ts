type OpenAIJsonResult<T> =
  | { ok: true; data: T; model: string; raw_text: string }
  | { ok: false; error: string; detail?: string; model?: string; status?: number }

function env(name: string) {
  return (process.env[name] || '').trim()
}

function baseUrl() {
  return env('OPENAI_BASE_URL') || 'https://api.openai.com/v1'
}

function modelName() {
  return env('OPENAI_MODEL') || 'gpt-4o-mini'
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

function pickOpenAiError(raw: string) {
  const j = safeJsonParse<any>(raw)
  const msg = j?.error?.message ? String(j.error.message) : ''
  const type = j?.error?.type ? String(j.error.type) : ''
  const code = j?.error?.code ? String(j.error.code) : ''
  const out = [msg, type ? `type=${type}` : '', code ? `code=${code}` : ''].filter(Boolean).join(' | ')
  return out || raw
}

export async function openaiJson<T>(input: {
  system: string
  user: string
  max_tokens?: number
  temperature?: number
}): Promise<OpenAIJsonResult<T>> {
  const apiKey = env('OPENAI_API_KEY')
  if (!apiKey) return { ok: false, error: 'OPENAI_API_KEY missing' }

  const model = modelName()
  const url = baseUrl().replace(/\/$/, '') + '/chat/completions'

  const controller = new AbortController()
  const timeoutMs = Number(env('OPENAI_TIMEOUT_MS') || '') || 12000
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let resp: Response
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: typeof input.temperature === 'number' ? input.temperature : 0.3,
        max_tokens: typeof input.max_tokens === 'number' ? input.max_tokens : 900,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
      signal: controller.signal,
    })
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? `OpenAI request timed out after ${timeoutMs}ms` : String(e?.message || e)
    return { ok: false, error: 'OpenAI request failed', detail: msg.slice(0, 1200), model, status: 504 }
  } finally {
    clearTimeout(timer)
  }

  const raw = await resp.text().catch(() => '')
  if (!resp.ok) {
    const detail = pickOpenAiError(raw).slice(0, 1200)
    return { ok: false, error: 'OpenAI request failed', detail, model, status: resp.status }
  }

  const parsed = safeJsonParse<any>(raw)
  const content = parsed?.choices?.[0]?.message?.content ? String(parsed.choices[0].message.content) : ''
  const data = content ? safeJsonParse<T>(content) : null
  if (!data) {
    return { ok: false, error: 'Failed to parse JSON from model', detail: content.slice(0, 1200), model, status: 200 }
  }

  return { ok: true, data, model, raw_text: content }
}

