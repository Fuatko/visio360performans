import { matchDutyIdForTitle, normalizeMatchKey, type DutyLike } from '@/lib/duty-title-match'

export type MatrixDutyPreset =
  | 'zumre'
  | 'sinif_ogretmeni'
  | 'rehberlik_ogretmeni'
  | 'nobetci_ogretmeni'
  | 'kulup_ogretmeni'
  | 'formator'
  | 'yasam_koordinatoru'
  | 'bilimsel_etkinlik_koordinatoru'

const PRESET_CONFIG: Record<
  MatrixDutyPreset,
  { titles: string[]; includes: string[]; label: string; missingError: string }
> = {
  zumre: {
    titles: ['Zümre Başkanı', 'Zumre Baskani', 'Zümre'],
    includes: ['zumre'],
    label: 'Zümre Başkanı',
    missingError:
      'Dönemde «Zümre Başkanı» görev paketi yok. Önce Dönemler → Görev Soruları bölümünde Zümre Başkanı ekleyip kilitleyin.',
  },
  sinif_ogretmeni: {
    titles: ['Sınıf Öğretmeni', 'Sinif Ogretmeni', 'Sınıf öğretmeni'],
    includes: ['sinif ogretmen', 'class teacher'],
    label: 'Sınıf Öğretmeni',
    missingError:
      'Dönemde «Sınıf Öğretmeni» görev paketi yok. Önce Dönemler → Görev Soruları bölümünde Sınıf Öğretmeni ekleyip kilitleyin.',
  },
  rehberlik_ogretmeni: {
    titles: ['Rehberlik Öğretmeni', 'Rehber Öğretmen', 'Rehberlik ogretmeni'],
    includes: ['rehberlik', 'rehber ogretmen'],
    label: 'Rehberlik Öğretmeni',
    missingError:
      'Dönemde «Rehberlik Öğretmeni» görev paketi yok. Önce Dönemler → Görev Soruları bölümünde Rehberlik Öğretmeni ekleyip kilitleyin.',
  },
  nobetci_ogretmeni: {
    titles: ['Nöbetçi Öğretmen', 'Nobetci Ogretmen', 'Nöbetçi öğretmeni', 'Nöbetçi Öğretmeni'],
    includes: ['nobetci'],
    label: 'Nöbetçi Öğretmeni',
    missingError:
      'Dönemde «Nöbetçi Öğretmen» görev paketi yok. Önce Dönemler → Görev Soruları bölümünde Nöbetçi Öğretmen ekleyip kilitleyin.',
  },
  kulup_ogretmeni: {
    titles: ['Kulüp Öğretmeni', 'Kulup Ogretmeni', 'Klüp Öğretmeni', 'Club Teacher'],
    includes: ['kulup', 'club teacher'],
    label: 'Kulüp Öğretmeni',
    missingError:
      'Dönemde «Kulüp Öğretmeni» görev paketi yok. Önce Dönemler → Görev Soruları bölümünde Kulüp Öğretmeni ekleyip kilitleyin.',
  },
  formator: {
    titles: ['Formatör', 'Formator', 'Formateur'],
    includes: ['formator', 'formateur'],
    label: 'Formatör',
    missingError:
      'Dönemde «Formatör» görev paketi yok. Önce Dönemler → Görev Soruları bölümünde Formatör ekleyip kilitleyin.',
  },
  yasam_koordinatoru: {
    titles: [
      'Okul İçi Yaşam Koordinatörü',
      'Okul Ici Yasam Koordinatoru',
      'Okul İçi Yaşam Koordinatör',
      'School Life Coordinator',
    ],
    includes: ['okul ici yasam koordinator', 'yasam koordinatoru'],
    label: 'Okul İçi Yaşam Koordinatörü',
    missingError:
      'Dönemde «Okul İçi Yaşam Koordinatörü» görev paketi yok. Önce Dönemler → Görev Soruları bölümünde ekleyip kilitleyin.',
  },
  bilimsel_etkinlik_koordinatoru: {
    titles: [
      'Bilimsel Etkinlikler Koordinatörü',
      'Bilimsel Etkinlikler Koordinatörü Görev Tanımı İş Performans Değerlendirme_2026',
      'Bilimsel Etkinlik Koordinatörü',
      'Bilimsel Etkinlik Koordinatoru',
      'Bilimsel Etkinlik Koordinatör',
      'Bilimsel Faaliyet Koordinatörü',
      'Coordonnateur des activités scientifiques',
      'Scientific Activity Coordinator',
    ],
    includes: [
      'bilimsel etkinlikler koordinator',
      'bilimsel etkinlik koordinator',
      'bilimsel etkinlikler',
      'bilimsel faaliyet koordinator',
    ],
    label: 'Bilimsel Etkinlik Koordinatörü',
    missingError:
      'Dönemde «Bilimsel Etkinlik Koordinatörü» görev paketi yok. Önce Dönemler → Görev Soruları bölümünde ekleyip kilitleyin.',
  },
}

export type MatrixDutyAssignResult = {
  ok: boolean
  error?: string
  preset?: MatrixDutyPreset
  duty_id?: string
  duty_name?: string
  targets_in_matrix: number
  duties_added: number
  duties_already: number
}

function dutyMatchKeys(d: DutyLike): string[] {
  const keys = new Set<string>()
  for (const raw of [d.name, d.code, d.name_en, d.name_fr]) {
    const s = String(raw || '').trim()
    if (!s) continue
    const n = normalizeMatchKey(s)
    if (n) keys.add(n)
    const fromCode = normalizeMatchKey(s.replace(/_/g, ' '))
    if (fromCode) keys.add(fromCode)
  }
  return Array.from(keys)
}

function isOtherDutyKey(key: string, except?: MatrixDutyPreset) {
  const other = (frag: string) => key.includes(frag)
  if (except !== 'zumre' && other('zumre')) return true
  if (except !== 'sinif_ogretmeni' && other('sinif ogretmen')) return true
  if (except !== 'rehberlik_ogretmeni' && other('rehber')) return true
  if (except !== 'nobetci_ogretmeni' && other('nobetci')) return true
  if (except !== 'kulup_ogretmeni' && other('kulup')) return true
  if (except !== 'formator' && other('formator')) return true
  if (except !== 'yasam_koordinatoru' && (other('okul ici yasam koordinator') || other('yasam koordinatoru')))
    return true
  if (
    except !== 'bilimsel_etkinlik_koordinatoru' &&
    (other('bilimsel etkinlikler koordinator') || other('bilimsel etkinlik koordinator'))
  )
    return true
  return false
}

/** Dönem görev paketi adı → matris bağlamı (zümre, rehberlik, yaşam koordinatörü vb.) */
export function resolveMatrixDutyPresetFromDuty(duty: DutyLike): MatrixDutyPreset | null {
  const presets = Object.keys(PRESET_CONFIG) as MatrixDutyPreset[]
  for (const preset of presets) {
    if (findDutyIdForMatrixPreset([duty], preset)) return preset
  }
  return null
}

export function findDutyIdForMatrixPreset(duties: DutyLike[], preset: MatrixDutyPreset): string | null {
  const cfg = PRESET_CONFIG[preset]
  const includeNorm = cfg.includes.map((f) => normalizeMatchKey(f)).filter(Boolean)

  for (const title of cfg.titles) {
    const id = matchDutyIdForTitle(title, duties)
    if (id) return id
  }

  let best: { id: string; score: number } | null = null
  for (const d of duties) {
    const keys = dutyMatchKeys(d)
    if (!keys.length) continue
    for (const key of keys) {
      if (isOtherDutyKey(key, preset)) continue
      for (const frag of includeNorm) {
        if (!frag || frag.length < 8) continue
        if (!key.includes(frag)) continue
        const score = key === frag ? 100 : frag.length + (key.startsWith(frag) ? 10 : 0)
        if (!best || score > best.score) best = { id: String(d.id), score }
      }
    }
  }
  if (best && best.score >= 20) return best.id

  return null
}

/** Hata mesajında dönemdeki görev adlarını göster */
export function formatPeriodDutyNamesForError(duties: DutyLike[]): string {
  const labels = duties
    .map((d) => String(d.name || d.code || '').trim())
    .filter(Boolean)
  if (!labels.length) return 'Bu dönemde hiç görev paketi kaydı yok.'
  return `Dönemdeki görev paketleri: ${labels.join(' · ')}`
}

/** Matris Excel sol sütunundaki hedeflere görev paketi ekler (mevcut diğer görevleri silmez). */
export async function assignMatrixPresetDutyToTargets(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  periodId: string,
  targetUserIds: string[],
  duties: DutyLike[],
  preset: MatrixDutyPreset,
  opts?: { dryRun?: boolean }
): Promise<MatrixDutyAssignResult> {
  const dryRun = Boolean(opts?.dryRun)
  const cfg = PRESET_CONFIG[preset]
  const uniqueTargets = Array.from(new Set(targetUserIds.filter(Boolean)))
  if (!uniqueTargets.length) {
    return {
      ok: false,
      error: 'Matriste hedef kişi bulunamadı',
      preset,
      targets_in_matrix: 0,
      duties_added: 0,
      duties_already: 0,
    }
  }

  const dutyId = findDutyIdForMatrixPreset(duties, preset)
  if (!dutyId) {
    return {
      ok: false,
      error: `${cfg.missingError} ${formatPeriodDutyNamesForError(duties)}`,
      preset,
      targets_in_matrix: uniqueTargets.length,
      duties_added: 0,
      duties_already: 0,
    }
  }

  const dutyName = duties.find((d) => String(d.id) === dutyId)?.name || cfg.label

  const { data: existing, error: exErr } = await supabase
    .from('evaluation_period_user_duties')
    .select('user_id, duty_id')
    .eq('period_id', periodId)
    .eq('is_active', true)

  if (exErr && !String(exErr.message || '').includes('does not exist')) {
    return {
      ok: false,
      error: exErr.message || 'Görev kayıtları okunamadı',
      preset,
      targets_in_matrix: uniqueTargets.length,
      duties_added: 0,
      duties_already: 0,
    }
  }

  const existingKeys = new Set(
    ((existing || []) as { user_id?: string; duty_id?: string }[]).map((r) => `${r.user_id}::${r.duty_id}`)
  )

  const toInsert: Array<{ period_id: string; user_id: string; duty_id: string; is_active: boolean }> = []
  let already = 0
  for (const userId of uniqueTargets) {
    const key = `${userId}::${dutyId}`
    if (existingKeys.has(key)) {
      already += 1
      continue
    }
    toInsert.push({ period_id: periodId, user_id: userId, duty_id: dutyId, is_active: true })
  }

  if (toInsert.length && !dryRun) {
    const { error: insErr } = await supabase.from('evaluation_period_user_duties').insert(toInsert)
    if (insErr) {
      return {
        ok: false,
        error: insErr.message || `${cfg.label} görevi atanamadı`,
        preset,
        targets_in_matrix: uniqueTargets.length,
        duties_added: 0,
        duties_already: already,
      }
    }
  }

  return {
    ok: true,
    preset,
    duty_id: dutyId,
    duty_name: dutyName,
    targets_in_matrix: uniqueTargets.length,
    duties_added: toInsert.length,
    duties_already: already,
  }
}

/** @deprecated use assignMatrixPresetDutyToTargets(..., 'zumre') */
export async function assignZumreDutyToMatrixTargets(
  supabase: Parameters<typeof assignMatrixPresetDutyToTargets>[0],
  periodId: string,
  targetUserIds: string[],
  duties: DutyLike[],
  opts?: { dryRun?: boolean }
) {
  const r = await assignMatrixPresetDutyToTargets(supabase, periodId, targetUserIds, duties, 'zumre', opts)
  return {
    ...r,
    zumre_duty_id: r.duty_id,
    zumre_duty_name: r.duty_name,
  }
}
