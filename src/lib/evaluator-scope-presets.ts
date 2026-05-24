import { normalizeMatchKey } from '@/lib/duty-title-match'
export type EvaluatorDutyMode = 'full' | 'categories' | 'none'

export type ScopePresetId =
  | 'rehberlik_koordinator_ogretmen_6'
  | 'md_zumre_genel_2'
  | 'genel_tum_kilitli'
  | 'yan_gorev_sadece_hedef'

export type ScopePresetCategoryLike = {
  id: string
  name?: string | null
  main_category_name?: string | null
  name_en?: string | null
  name_fr?: string | null
}

export type ScopePresetDef = {
  id: ScopePresetId
  label: string
  description: string
  restrict_period: boolean
  duty_mode: EvaluatorDutyMode
  /** Alt kategori adında geçmeli (normalize); boş + match_all_period = tümü */
  period_category_keys: string[]
  match_all_period?: boolean
}

export const EVALUATOR_SCOPE_PRESETS: ScopePresetDef[] = [
  {
    id: 'rehberlik_koordinator_ogretmen_6',
    label: 'Rehberlik koordinatörü (6 öğretmen alt kategorisi + rehberlik soruları)',
    description:
      'Genel: Mesleki Sorumluluk, Pedagojik Yetkinlik, Ölçme, Teknoloji, Veli İletişimi, Öğrenci İlişkileri. Yan görev yok → hedefte Rehberlik Öğretmeni görevi varsa rehberlik soruları otomatik eklenir.',
    restrict_period: true,
    duty_mode: 'none',
    period_category_keys: [
      'mesleki sorumluluk',
      'pedagojik yetkinlik',
      'olcme ve degerlendirme',
      'teknolojik yetkin',
      'veli iletisim',
      'ogrenci iliskileri',
      'empati',
    ],
  },
  {
    id: 'md_zumre_genel_2',
    label: 'Müdür / müdür yrd. / zümre — 2 genel alt kategori',
    description: 'Kurum İçi İletişim + Mesleki Gelişim (genel matris grubu). Yan görev yok → hedefin görev paketine göre.',
    restrict_period: true,
    duty_mode: 'none',
    period_category_keys: ['kurum ici iletisim', 'kurum ici', 'mesleki gelisim'],
  },
  {
    id: 'genel_tum_kilitli',
    label: 'Genel — dönemdeki tüm kilitli alt kategoriler',
    description: 'Tüm genel alt kategoriler (ör. 21 soru). Yan görev yok → hedef görev Excel / matris kutusuna göre.',
    restrict_period: true,
    duty_mode: 'none',
    period_category_keys: [],
    match_all_period: true,
  },
  {
    id: 'yan_gorev_sadece_hedef',
    label: 'Yalnızca hedefin görev soruları (genel kapalı)',
    description: 'Genel soru yok; yalnızca hedefe atanmış görev paketi soruları (özel senaryo).',
    restrict_period: true,
    duty_mode: 'none',
    period_category_keys: ['__none__'],
  },
]

function categoryBlob(c: ScopePresetCategoryLike) {
  return normalizeMatchKey(
    [c.name, c.main_category_name, c.name_en, c.name_fr].filter(Boolean).join(' ')
  )
}

export function matchPeriodCategoriesToPreset(
  categories: ScopePresetCategoryLike[],
  presetId: ScopePresetId
): { ids: string[]; labels: string[]; preset: ScopePresetDef } {
  const preset = EVALUATOR_SCOPE_PRESETS.find((p) => p.id === presetId)
  if (!preset) {
    return { ids: [], labels: [], preset: EVALUATOR_SCOPE_PRESETS[0] }
  }

  if (preset.period_category_keys.includes('__none__')) {
    return { ids: [], labels: [], preset }
  }

  if (preset.match_all_period) {
    const labels = categories.map((c) => String(c.name || c.id))
    return { ids: categories.map((c) => c.id), labels, preset }
  }

  const keys = preset.period_category_keys.map((k) => normalizeMatchKey(k))
  const matched: ScopePresetCategoryLike[] = []
  for (const c of categories) {
    const blob = categoryBlob(c)
    if (!blob) continue
    if (keys.some((k) => blob.includes(k) || k.includes(blob))) matched.push(c)
  }

  return {
    ids: matched.map((c) => c.id),
    labels: matched.map((c) => String(c.name || c.id)),
    preset,
  }
}

export function scopePayloadFromPreset(
  categories: ScopePresetCategoryLike[],
  presetId: ScopePresetId
): {
  restrict_period: boolean
  duty_mode: EvaluatorDutyMode
  period_category_ids: string[]
  duty_category_ids: string[]
  duty_package_ids: string[]
  matched_labels: string[]
  preset: ScopePresetDef
} {
  const { ids, labels, preset } = matchPeriodCategoriesToPreset(categories, presetId)
  return {
    restrict_period: preset.restrict_period && ids.length > 0,
    duty_mode: preset.duty_mode,
    period_category_ids: ids,
    duty_category_ids: [],
    duty_package_ids: [],
    matched_labels: labels,
    preset,
  }
}
