'use client'

import { useEffect } from 'react'

export function SwRegister() {
  useEffect(() => {
    // Register a minimal service worker to enable "Install app" on Chrome/Edge.
    // This app is online-first; the SW does not implement offline caching by default.
    if (!('serviceWorker' in navigator)) return
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

    // Avoid noisy logs; just best-effort.
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => {
        if (isLocalhost) console.warn('SW register failed:', err)
      })
  }, [])

  return null
}

