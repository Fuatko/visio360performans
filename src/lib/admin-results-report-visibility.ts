import {
  ADMIN_RESULTS_STATIC_SECTIONS,
  type AdminResultsReportSection,
} from '@/lib/admin-results-report-catalog'

export function isSuperAdminOnlyReport(section: AdminResultsReportSection): boolean {
  return section.superAdminOnly === true
}

/** Kurum admini için varsayılan: süper-admin-only hariç tüm statik raporlar */
export function defaultOrgAdminVisibleReportIds(): string[] {
  return ADMIN_RESULTS_STATIC_SECTIONS.filter((s) => !isSuperAdminOnlyReport(s)).map((s) => s.id)
}

export function normalizeOrgVisibleReportIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const byId = new Map(ADMIN_RESULTS_STATIC_SECTIONS.map((s) => [s.id, s]))
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') continue
    const section = byId.get(item)
    if (!section || isSuperAdminOnlyReport(section)) continue
    if (!out.includes(item)) out.push(item)
  }
  return out.length ? out : null
}

export function resolveOrgVisibleReportIds(saved: string[] | null | undefined): Set<string> {
  const ids = saved?.length ? saved : defaultOrgAdminVisibleReportIds()
  return new Set(ids)
}

export function isReportVisibleToOrgAdmin(
  sectionId: string,
  orgVisibleReportIds: string[] | null | undefined
): boolean {
  const section = ADMIN_RESULTS_STATIC_SECTIONS.find((s) => s.id === sectionId)
  if (!section || isSuperAdminOnlyReport(section)) return false
  return resolveOrgVisibleReportIds(orgVisibleReportIds).has(sectionId)
}
