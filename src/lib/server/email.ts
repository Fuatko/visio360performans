import crypto from 'crypto'

type Provider = 'brevo' | 'resend'

function isValidFromField(value: string) {
  const s = value.trim()
  if (!s) return false
  // Accept either `email@example.com` or `Name <email@example.com>`
  const email = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/
  const named = /^.+<\s*[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\s*>$/
  return email.test(s) || named.test(s)
}

function pickProvider(): Provider {
  return process.env.BREVO_API_KEY ? 'brevo' : 'resend'
}

function safeId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
}

export async function sendTransactionalEmail(input: { to: string; subject: string; html: string }) {
  const to = (input.to || '').trim()
  if (!to) return { ok: false, provider: pickProvider(), error: 'Missing recipient' as const }

  const provider = pickProvider()

  if (provider === 'brevo') {
    const brevoApiKey = (process.env.BREVO_API_KEY || '').trim()
    const fromEmail = (process.env.BREVO_FROM_EMAIL || '').trim()
    const fromName = (process.env.BREVO_FROM_NAME || 'VISIO 360').trim()
    if (!brevoApiKey) return { ok: false, provider, error: 'BREVO_API_KEY missing' as const }
    if (!fromEmail || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(fromEmail)) {
      return { ok: false, provider, error: 'BREVO_FROM_EMAIL missing/invalid' as const }
    }

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { accept: 'application/json', 'api-key': brevoApiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        sender: { name: fromName || 'VISIO 360', email: fromEmail },
        to: [{ email: to }],
        subject: input.subject,
        htmlContent: input.html,
      }),
    })

    const raw = await resp.text().catch(() => '')
    if (!resp.ok) {
      return { ok: false, provider, error: 'Brevo send failed' as const, detail: raw.slice(0, 600) }
    }

    let messageId: string | null = null
    try {
      const parsed = JSON.parse(raw) as { messageId?: unknown }
      if (parsed?.messageId) messageId = String(parsed.messageId)
    } catch {
      // ignore
    }

    return { ok: true, provider, message_id: messageId || safeId('brevo') }
  }

  // Resend
  const resendApiKey = (process.env.RESEND_API_KEY || '').trim()
  if (!resendApiKey) return { ok: false, provider, error: 'RESEND_API_KEY missing' as const }

  const fromEnvRaw = (process.env.RESEND_FROM_EMAIL || '').trim()
  if (fromEnvRaw && !isValidFromField(fromEnvRaw)) {
    return { ok: false, provider, error: 'RESEND_FROM_EMAIL invalid' as const }
  }
  const from = fromEnvRaw || 'VISIO 360 <onboarding@resend.dev>'

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject: input.subject, html: input.html }),
  })
  const raw = await resp.text().catch(() => '')
  if (!resp.ok) {
    return { ok: false, provider, error: 'Resend send failed' as const, detail: raw.slice(0, 600) }
  }

  let messageId: string | null = null
  try {
    const parsed = JSON.parse(raw) as { id?: unknown }
    if (parsed?.id) messageId = String(parsed.id)
  } catch {
    // ignore
  }

  return { ok: true, provider, message_id: messageId || safeId('resend') }
}

