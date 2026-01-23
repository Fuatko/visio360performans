type OpenAIJsonResult<T> =
  | { ok: true; data: T; model: string; raw_text: string }
  | { ok: false; error: string; detail?: string; model?: string }

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

  const resp = await fetch(url, {
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
  })

  const raw = await resp.text().catch(() => '')
  if (!resp.ok) return { ok: false, error: 'OpenAI request failed', detail: raw.slice(0, 1200), model }

  const parsed = safeJsonParse<any>(raw)
  const content = parsed?.choices?.[0]?.message?.content ? String(parsed.choices[0].message.content) : ''
  const data = content ? safeJsonParse<T>(content) : null
  if (!data) {
    return { ok: false, error: 'Failed to parse JSON from model', detail: content.slice(0, 1200), model }
  }

  return { ok: true, data, model, raw_text: content }
}

