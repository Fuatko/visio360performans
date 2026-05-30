/** Kurum matris arayüz profili — mevcut atama verisini değiştirmez, yalnızca admin ekranı. */

export type MatrixProfileId = 'school_full' | 'standard_360'

export type OrgMatrixFeatures = {
  operationalPlaybooks: boolean
  schoolDutyPresetCheckboxes: boolean
  dynamicDutyFromPeriod: boolean
  schoolMaintenanceTools: boolean
  schoolScopePresetsOnly: boolean
  categoryScopeColumn: boolean
}

export type OrgMatrixLabels = {
  dutySectionTitle: string
  dutySectionHint: string
  generalMatrixTitle: string
  scopePanelHint: string
}

export type OrgMatrixProfile = {
  id: MatrixProfileId
  labels: OrgMatrixLabels
  features: OrgMatrixFeatures
}

export type OrgSettings = {
  matrix_profile?: MatrixProfileId
}

const SCHOOL_FULL: OrgMatrixProfile = {
  id: 'school_full',
  labels: {
    dutySectionTitle: 'Yan görev matrisleri (okul)',
    dutySectionHint:
      'Zümre, rehberlik, kulüp vb. kutular yalnızca okul profilinde görünür. Görev paketleri Dönemler → Görev Soruları ile tanımlanır.',
    generalMatrixTitle: 'Genel matris Excel (0 / 1)',
    scopePanelHint:
      'Önce kapsam şablonu (rehberlik koordinatörü, müdür/zümre vb.) ile toplu uygulayın; matris Excel ile karışmasın.',
  },
  features: {
    operationalPlaybooks: true,
    schoolDutyPresetCheckboxes: true,
    dynamicDutyFromPeriod: true,
    schoolMaintenanceTools: true,
    schoolScopePresetsOnly: true,
    categoryScopeColumn: true,
  },
}

const STANDARD_360: OrgMatrixProfile = {
  id: 'standard_360',
  labels: {
    dutySectionTitle: 'Rol / ek yetkinlik matrisleri',
    dutySectionHint:
      'Bu kurumda görevler Dönemler → Görev Soruları ekranından tanımlanır. İşaretlediğiniz görev, matris hedeflerine otomatik atanır.',
    generalMatrixTitle: '360° değerlendirme matrisi (Excel)',
    scopePanelHint:
      'Değerlendirenlerin hangi soru kategorilerini göreceğini toplu veya satır bazında ayarlayın.',
  },
  features: {
    operationalPlaybooks: false,
    schoolDutyPresetCheckboxes: false,
    dynamicDutyFromPeriod: true,
    schoolMaintenanceTools: false,
    schoolScopePresetsOnly: false,
    categoryScopeColumn: true,
  },
}

export function parseOrgSettings(raw: unknown): OrgSettings {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as Record<string, unknown>
  const p = String(o.matrix_profile || '').trim()
  if (p === 'standard_360') return { matrix_profile: 'standard_360' }
  if (p === 'school_full') return { matrix_profile: 'school_full' }
  return {}
}

export function resolveOrgMatrixProfile(settings: unknown): OrgMatrixProfile {
  const parsed = parseOrgSettings(settings)
  if (parsed.matrix_profile === 'standard_360') return STANDARD_360
  return SCHOOL_FULL
}

export const MATRIX_PROFILE_OPTIONS: { value: MatrixProfileId; label: string; description: string }[] = [
  {
    value: 'school_full',
    label: 'Okul / eğitim (tam)',
    description: 'Zümre, rehberlik, yaşam koordinatörü matrisleri ve kurulum rehberleri.',
  },
  {
    value: 'standard_360',
    label: 'Kurumsal 360° (sade)',
    description: 'Genel matris + dönemde tanımlı görevler; okula özel kutular gizli.',
  },
]
