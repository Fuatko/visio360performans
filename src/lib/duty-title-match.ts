/** Görev adı ↔ kullanıcı unvanı (title) eşleştirmesi */

import type { Lang } from '@/lib/i18n'

export type DutyLike = { id: string; name?: string | null; code?: string | null; name_en?: string | null; name_fr?: string | null }

export function dutyLabelFallback(lang: Lang): string {
  if (lang === 'fr') return 'Tâche additionnelle'
  if (lang === 'en') return 'Extra duty'
  return 'Ek görev'
}

/** Değerlendirme formunda görev bandı başlığı — FR seçiliyken Türkçe name kullanılmaz */
export function pickDutyDisplayName(duty: DutyLike, lang: Lang): string {
  const tr = String(duty.name || '').trim()
  const en = String(duty.name_en || '').trim()
  const fr = String(duty.name_fr || '').trim()
  if (lang === 'fr') return fr || en || tr || dutyLabelFallback('fr')
  if (lang === 'en') return en || tr || fr || dutyLabelFallback('en')
  return tr || fr || en || dutyLabelFallback('tr')
}

/** Görev Excel / unvan: yalnızca genel değerlendirme — ek görev paketi atanmaz */
const GENERAL_ONLY_DUTY_EXACT = new Set([
  'ogretmen',
  'egitmen',
  'genel',
  'teacher',
  'instructor',
])

export function isGeneralOnlyDutyTitle(title: string): boolean {
  const key = normalizeMatchKey(title)
  if (!key) return false
  if (GENERAL_ONLY_DUTY_EXACT.has(key)) return true
  if (key.startsWith('egitmen genel')) return true
  if (key.startsWith('genel degerlendirme')) return true
  if (key.includes('genel is performans degerlendirme')) return true
  return false
}

export function normalizeMatchKey(value: string): string {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('tr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function dutyAliases(duty: DutyLike): string[] {
  const raw = [duty.name, duty.code, duty.name_en, duty.name_fr].filter(Boolean).map(String)
  const keys = new Set<string>()
  raw.forEach((s) => {
    const n = normalizeMatchKey(s)
    if (n) keys.add(n)
    const codeLike = normalizeMatchKey(s.replace(/_/g, ' '))
    if (codeLike) keys.add(codeLike)
  })
  return Array.from(keys)
}

/** En iyi eşleşen görev id'si; yoksa null */
export function matchDutyIdForTitle(title: string, duties: DutyLike[]): string | null {
  const tKey = normalizeMatchKey(title)
  if (!tKey || !duties.length) return null

  let best: { id: string; score: number } | null = null

  for (const duty of duties) {
    const id = String(duty.id || '')
    if (!id) continue
    const aliases = dutyAliases(duty)
    for (const alias of aliases) {
      if (!alias) continue
      let score = 0
      if (tKey === alias) score = 100
      else if (tKey.includes(alias) || alias.includes(tKey)) score = 70
      else {
        const tWords = new Set(tKey.split(' ').filter((w) => w.length > 2))
        const aWords = alias.split(' ').filter((w) => w.length > 2)
        const overlap = aWords.filter((w) => tWords.has(w)).length
        if (overlap && overlap >= Math.min(tWords.size, aWords.length)) score = 50 + overlap * 5
      }
      if (score > 0 && (!best || score > best.score)) best = { id, score }
    }
  }

  return best && best.score >= 50 ? best.id : null
}

export type SyncDutyUsersResult = {
  added: number
  skippedNoTitle: number
  skippedNoMatch: number
  skippedGeneral: number
  unmatchedTitles: string[]
}

/** Mevcut atamaları korur; unvana göre yeni eşleşmeler ekler */
export function syncDutyUserRowsFromTitles(
  users: Array<{ id: string; title?: string | null }>,
  duties: DutyLike[],
  existingRows: Array<{ duty_id: string; user_id: string; is_active?: boolean }>
): { rows: Array<{ duty_id: string; user_id: string; is_active: boolean }>; stats: SyncDutyUsersResult } {
  const rows = [...existingRows.map((r) => ({ ...r, is_active: r.is_active !== false }))]
  const key = (dutyId: string, userId: string) => `${dutyId}::${userId}`
  const seen = new Set(rows.map((r) => key(String(r.duty_id), String(r.user_id))))

  const stats: SyncDutyUsersResult = {
    added: 0,
    skippedNoTitle: 0,
    skippedNoMatch: 0,
    skippedGeneral: 0,
    unmatchedTitles: [],
  }
  const unmatchedSet = new Set<string>()

  for (const user of users) {
    const userId = String(user.id || '')
    const title = String(user.title || '').trim()
    if (!userId) continue
    if (!title) {
      stats.skippedNoTitle += 1
      continue
    }
    if (isGeneralOnlyDutyTitle(title)) {
      stats.skippedGeneral += 1
      continue
    }
    const dutyId = matchDutyIdForTitle(title, duties)
    if (!dutyId) {
      stats.skippedNoMatch += 1
      unmatchedSet.add(title)
      continue
    }
    const k = key(dutyId, userId)
    if (seen.has(k)) continue
    seen.add(k)
    rows.push({ duty_id: dutyId, user_id: userId, is_active: true })
    stats.added += 1
  }

  stats.unmatchedTitles = Array.from(unmatchedSet).sort((a, b) => a.localeCompare(b, 'tr'))
  return { rows, stats }
}
