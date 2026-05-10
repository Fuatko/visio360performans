'use client'

import { useEffect, useState } from 'react'
import { Eye, Type, ZapOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type AccessibilityPreferences = {
  highContrast: boolean
  largeText: boolean
  reducedMotion: boolean
}

const STORAGE_KEY = 'visio360_accessibility_preferences'

const defaultPreferences: AccessibilityPreferences = {
  highContrast: false,
  largeText: false,
  reducedMotion: false,
}

function readPreferences(): AccessibilityPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultPreferences
    const parsed = JSON.parse(raw) as Partial<AccessibilityPreferences>
    return {
      highContrast: Boolean(parsed.highContrast),
      largeText: Boolean(parsed.largeText),
      reducedMotion: Boolean(parsed.reducedMotion),
    }
  } catch {
    return defaultPreferences
  }
}

function applyPreferences(preferences: AccessibilityPreferences) {
  const root = document.documentElement
  root.classList.toggle('a11y-high-contrast', preferences.highContrast)
  root.classList.toggle('a11y-large-text', preferences.largeText)
  root.classList.toggle('a11y-reduced-motion', preferences.reducedMotion)
}

export function AccessibilityPreferencesPanel() {
  const [preferences, setPreferences] = useState<AccessibilityPreferences>(() =>
    typeof window === 'undefined' ? defaultPreferences : readPreferences()
  )
  const [open, setOpen] = useState(false)

  useEffect(() => {
    applyPreferences(preferences)
  }, [preferences])

  const updatePreference = (key: keyof AccessibilityPreferences) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Preference persistence is optional; keep UI usable even if storage is blocked.
      }
      applyPreferences(next)
      return next
    })
  }

  const options = [
    {
      key: 'highContrast' as const,
      label: 'Yüksek kontrast',
      icon: Eye,
      help: 'Az gören kullanıcılar için renk ayrımını güçlendirir.',
    },
    {
      key: 'largeText' as const,
      label: 'Büyük yazı',
      icon: Type,
      help: 'Metinleri ve tıklanabilir alanları daha okunur yapar.',
    },
    {
      key: 'reducedMotion' as const,
      label: 'Azaltılmış hareket',
      icon: ZapOff,
      help: 'Animasyon ve geçişleri azaltır.',
    },
  ]

  return (
    <div className="fixed bottom-4 left-4 z-[60] print:hidden">
      {open ? (
        <div className="mb-2 w-[min(92vw,22rem)] rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-[var(--foreground)]">Erişilebilirlik</div>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Bu seçenekler sadece görünümü değiştirir; cevaplar ve skorlar etkilenmez.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-sm text-[var(--muted)] hover:bg-[var(--surface-2)]"
              aria-label="Erişilebilirlik panelini kapat"
            >
              Kapat
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {options.map((option) => {
              const Icon = option.icon
              const checked = preferences[option.key]
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => updatePreference(option.key)}
                  aria-pressed={checked}
                  className={cn(
                    'w-full rounded-xl border px-3 py-3 text-left transition-colors',
                    checked
                      ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--foreground)]'
                      : 'border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-2)]'
                  )}
                >
                  <span className="flex items-start gap-3">
                    <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand)]" aria-hidden="true" />
                    <span>
                      <span className="block text-sm font-semibold">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">{option.help}</span>
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm font-semibold text-[var(--foreground)] shadow-lg hover:bg-[var(--surface-2)]"
        aria-expanded={open}
        aria-label="Erişilebilirlik tercihlerini aç"
      >
        <Eye className="h-5 w-5 text-[var(--brand)]" aria-hidden="true" />
        Erişilebilirlik
      </button>
    </div>
  )
}
