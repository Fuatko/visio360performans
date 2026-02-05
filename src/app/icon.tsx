import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export const size = {
  width: 512,
  height: 512,
}

export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1d4ed8',
          color: 'white',
          fontSize: 240,
          fontWeight: 800,
          letterSpacing: -8,
          borderRadius: 96,
        }}
      >
        V
      </div>
    ),
    size
  )
}

