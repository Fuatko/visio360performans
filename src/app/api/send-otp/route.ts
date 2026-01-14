import { NextRequest, NextResponse } from 'next/server'

const EMAILJS_SERVICE_ID = 'service_70pzbh8'
const EMAILJS_TEMPLATE_ID = 'template_q251d6r'
const EMAILJS_PUBLIC_KEY = '8vDoLnXqiydi_f1A2'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { to_email, to_name, otp_code } = body

    if (!to_email || !otp_code) {
      return NextResponse.json(
        { error: 'Email ve OTP gerekli' },
        { status: 400 }
      )
    }

    // Send via EmailJS
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          to_email,
          to_name: to_name || 'Kullanıcı',
          otp_code,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('EmailJS Error:', errorText)
      return NextResponse.json(
        { error: 'Email gönderilemedi' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Send OTP Error:', error)
    return NextResponse.json(
      { error: 'Sunucu hatası' },
      { status: 500 }
    )
  }
}
