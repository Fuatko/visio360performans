'use client'

import { useMemo, useState, useEffect } from 'react'
import { CheckSquare, Eye, Loader2, Save, Square } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  ADMIN_RESULTS_STATIC_SECTIONS,
  type AdminResultsReportTab,
} from '@/lib/admin-results-report-catalog'
import {
  defaultOrgAdminVisibleReportIds,
  isSuperAdminOnlyReport,
} from '@/lib/admin-results-report-visibility'
import { t, type Lang } from '@/lib/i18n'

const TAB_ORDER: AdminResultsReportTab[] = ['overview', 'analytics', 'aux']

function tabLabel(tab: AdminResultsReportTab, lang: Lang) {
  if (tab === 'analytics') {
    return lang === 'en' ? 'Analytics' : lang === 'fr' ? 'Analytique' : 'Analitik'
  }
  if (tab === 'aux') {
    return lang === 'en' ? 'Auxiliary' : lang === 'fr' ? 'Auxiliaire' : 'Yardımcı'
  }
  return lang === 'en' ? 'Overview' : lang === 'fr' ? 'Vue d’ensemble' : 'Genel bakış'
}

type Props = {
  lang: Lang
  enabledIds: string[]
  loading: boolean
  saving: boolean
  onSave: (enabledIds: string[]) => Promise<void>
}

export function AdminReportsVisibilityPanel({ lang, enabledIds, loading, saving, onSave }: Props) {
  const [draft, setDraft] = useState<string[] | null>(null)
  const selected = draft ?? enabledIds

  useEffect(() => {
    setDraft(null)
  }, [enabledIds])

  const manageableSections = useMemo(
    () => ADMIN_RESULTS_STATIC_SECTIONS.filter((s) => !isSuperAdminOnlyReport(s)),
    []
  )
  const superAdminOnlySections = useMemo(
    () => ADMIN_RESULTS_STATIC_SECTIONS.filter((s) => isSuperAdminOnlyReport(s)),
    []
  )

  const toggle = (id: string) => {
    setDraft((prev) => {
      const base = prev ?? enabledIds
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    })
  }

  const selectAll = () => setDraft(manageableSections.map((s) => s.id))
  const resetDefault = () => setDraft(defaultOrgAdminVisibleReportIds())
  const clearAll = () => setDraft([])

  const dirty = useMemo(() => {
    if (draft === null) return false
    const a = [...draft].sort().join('\0')
    const b = [...enabledIds].sort().join('\0')
    return a !== b
  }, [draft, enabledIds])

  return (
    <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-4 w-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-sky-600 shrink-0" />
            ) : (
              <Eye className="w-4 h-4 text-sky-600 shrink-0" />
            )}
            {t('adminReportsVisibilityTitle', lang)}
          </div>
          <p className="text-xs text-[var(--muted)] mt-1 leading-snug max-w-3xl">
            {t('adminReportsVisibilityHint', lang)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={loading || saving} onClick={selectAll}>
            <CheckSquare className="w-3.5 h-3.5" />
            {t('adminReportsVisibilitySelectAll', lang)}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={loading || saving} onClick={resetDefault}>
            {t('adminReportsVisibilityResetDefault', lang)}
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={loading || saving} onClick={clearAll}>
            <Square className="w-3.5 h-3.5" />
            {t('adminReportsVisibilityClearAll', lang)}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={loading || saving || !dirty}
            onClick={() => void onSave(selected)}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t('adminReportsVisibilitySave', lang)}
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        {TAB_ORDER.map((tab) => {
          const sections = manageableSections.filter((s) => s.tab === tab)
          if (!sections.length) return null
          return (
            <div key={tab}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">
                {tabLabel(tab, lang)}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sections.map((section) => (
                  <label
                    key={section.id}
                    className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 cursor-pointer hover:bg-[var(--surface-2)]/60"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 rounded border-[var(--border)] w-4 h-4 accent-sky-600"
                      checked={selected.includes(section.id)}
                      disabled={loading || saving}
                      onChange={() => toggle(section.id)}
                    />
                    <span className="text-sm text-[var(--foreground)] leading-snug">
                      {section.label[lang] || section.label.tr}
                      {section.schoolOnly ? (
                        <span className="ml-1.5 text-[10px] font-medium text-sky-700 dark:text-sky-300 bg-sky-500/10 px-1.5 py-0.5 rounded">
                          {t('adminReportsVisibilitySchoolOnlyBadge', lang)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {superAdminOnlySections.length ? (
        <div className="mt-4 pt-3 border-t border-[var(--border)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)] mb-2">
            {t('adminReportsVisibilitySuperAdminOnlyTitle', lang)}
          </p>
          <ul className="text-xs text-[var(--muted)] space-y-1">
            {superAdminOnlySections.map((section) => (
              <li key={section.id}>• {section.label[lang] || section.label.tr}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
