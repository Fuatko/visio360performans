'use client'

import { useEffect, useMemo, useState } from 'react'
import { GripVertical, LayoutList, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui'
import {
  ADMIN_RESULTS_STATIC_SECTIONS,
  type AdminResultsReportSection,
} from '@/lib/admin-results-report-catalog'
import {
  defaultReportCatalogConfig,
  groupLabel,
  resolveReportCatalogEntry,
  type ReportCatalogConfig,
  type ReportCatalogGroup,
  type ReportCatalogSectionOverride,
} from '@/lib/admin-results-report-catalog-config'
import { isSuperAdminOnlyReport } from '@/lib/admin-results-report-visibility'
import { assessmentKindLabel, normalizeAssessmentKind } from '@/lib/evaluation-period-kind'
import { t, type Lang } from '@/lib/i18n'

type Props = {
  lang: Lang
  config: ReportCatalogConfig
  loading: boolean
  saving: boolean
  onSave: (config: ReportCatalogConfig) => Promise<void>
}

type DraftSection = ReportCatalogSectionOverride & { id: string }

function sectionAssessmentBadge(section: AdminResultsReportSection, lang: Lang) {
  if (!section.assessmentKindScope) {
    return lang === 'en' ? 'All types' : lang === 'fr' ? 'Tous types' : 'Tüm türler'
  }
  return assessmentKindLabel(normalizeAssessmentKind(section.assessmentKindScope), lang)
}

export function AdminReportsCatalogConfigPanel({ lang, config, loading, saving, onSave }: Props) {
  const [draft, setDraft] = useState<ReportCatalogConfig | null>(null)
  const [filterKind, setFilterKind] = useState<'all' | 'development_360' | 'job_evaluation'>('all')
  const [dragId, setDragId] = useState<string | null>(null)

  const activeConfig = draft ?? config

  useEffect(() => {
    setDraft(null)
  }, [config])

  const manageableSections = useMemo(
    () => ADMIN_RESULTS_STATIC_SECTIONS.filter((s) => !isSuperAdminOnlyReport(s) && s.id !== 'summary'),
    []
  )

  const filteredSections = useMemo(() => {
    return manageableSections.filter((section) => {
      if (filterKind === 'all') return true
      if (!section.assessmentKindScope) return true
      return section.assessmentKindScope === filterKind
    })
  }, [manageableSections, filterKind])

  const grouped = useMemo(() => {
    const management: DraftSection[] = []
    const hr: DraftSection[] = []
    for (const section of filteredSections) {
      const resolved = resolveReportCatalogEntry(section, activeConfig)
      if (resolved.group === 'summary') continue
      const item: DraftSection = {
        id: section.id,
        group: resolved.group,
        sortOrder: resolved.sortOrder,
        label: resolved.label,
        description: resolved.description,
      }
      if (item.group === 'management') management.push(item)
      else hr.push(item)
    }
    const sortFn = (a: DraftSection, b: DraftSection) =>
      (a.sortOrder ?? 999) - (b.sortOrder ?? 999) || a.id.localeCompare(b.id)
    management.sort(sortFn)
    hr.sort(sortFn)
    return { management, hr }
  }, [filteredSections, activeConfig])

  const updateSection = (id: string, patch: Partial<ReportCatalogSectionOverride>) => {
    setDraft((prev) => {
      const base = prev ?? config
      const current = base.sections[id] || {}
      return {
        sections: {
          ...base.sections,
          [id]: { ...current, ...patch },
        },
      }
    })
  }

  const updateLocalized = (
    id: string,
    field: 'label' | 'description',
    locale: 'tr' | 'en' | 'fr',
    value: string
  ) => {
    setDraft((prev) => {
      const base = prev ?? config
      const current = base.sections[id] || {}
      const localized = { ...(current[field] || {}), [locale]: value }
      return {
        sections: {
          ...base.sections,
          [id]: { ...current, [field]: localized },
        },
      }
    })
  }

  const moveWithinGroup = (group: ReportCatalogGroup, fromId: string, toId: string) => {
    if (fromId === toId) return
    const list = group === 'management' ? [...grouped.management] : [...grouped.hr]
    const fromIdx = list.findIndex((x) => x.id === fromId)
    const toIdx = list.findIndex((x) => x.id === toId)
    if (fromIdx < 0 || toIdx < 0) return
    const [item] = list.splice(fromIdx, 1)
    list.splice(toIdx, 0, item)
    setDraft((prev) => {
      const base = prev ?? config
      const sections = { ...base.sections }
      list.forEach((entry, index) => {
        sections[entry.id] = { ...(sections[entry.id] || {}), sortOrder: (group === 'management' ? 10 : 10) + index * 10 }
      })
      return { sections }
    })
  }

  const dirty = useMemo(() => {
    if (!draft) return false
    return JSON.stringify(draft) !== JSON.stringify(config)
  }, [draft, config])

  const resetDefaults = () => setDraft(defaultReportCatalogConfig())

  const renderSectionEditor = (entry: DraftSection) => {
    const section = manageableSections.find((s) => s.id === entry.id)
    if (!section) return null
    const resolved = resolveReportCatalogEntry(section, activeConfig)

    return (
      <div
        key={entry.id}
        draggable
        onDragStart={() => setDragId(entry.id)}
        onDragEnd={() => setDragId(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => {
          if (!dragId || dragId === entry.id) return
          const dragGroup = resolveReportCatalogEntry(
            manageableSections.find((s) => s.id === dragId)!,
            activeConfig
          ).group
          if (dragGroup === 'summary') return
          if (dragGroup !== entry.group) {
            updateSection(dragId, { group: entry.group as ReportCatalogGroup })
          }
          moveWithinGroup(entry.group as ReportCatalogGroup, dragId, entry.id)
          setDragId(null)
        }}
        className={`rounded-xl border bg-[var(--surface)] p-3 space-y-3 ${
          dragId === entry.id ? 'border-[var(--brand)] opacity-70' : 'border-[var(--border)]'
        }`}
      >
        <div className="flex items-start gap-2">
          <GripVertical className="w-4 h-4 text-[var(--muted)] shrink-0 mt-1 cursor-grab" />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[var(--foreground)]">{section.label[lang] || section.label.tr}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-800 dark:text-sky-200">
                {sectionAssessmentBadge(section, lang)}
              </span>
              {section.schoolOnly ? (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-900">
                  {t('adminReportsVisibilitySchoolOnlyBadge', lang)}
                </span>
              ) : null}
            </div>

            <div className="flex flex-wrap gap-3 text-xs">
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`group-${entry.id}`}
                  checked={resolved.group === 'management'}
                  disabled={loading || saving}
                  onChange={() => updateSection(entry.id, { group: 'management' })}
                />
                {groupLabel('management', lang)}
              </label>
              <label className="inline-flex items-center gap-1.5">
                <input
                  type="radio"
                  name={`group-${entry.id}`}
                  checked={resolved.group === 'hr'}
                  disabled={loading || saving}
                  onChange={() => updateSection(entry.id, { group: 'hr' })}
                />
                {groupLabel('hr', lang)}
              </label>
            </div>

            <label className="block text-xs">
              <span className="text-[var(--muted)]">{t('adminReportsCatalogTitleTr', lang)}</span>
              <input
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm"
                value={resolved.label.tr}
                disabled={loading || saving}
                onChange={(e) => updateLocalized(entry.id, 'label', 'tr', e.target.value)}
              />
            </label>
            <label className="block text-xs">
              <span className="text-[var(--muted)]">{t('adminReportsCatalogDescriptionTr', lang)}</span>
              <textarea
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-sm min-h-[56px]"
                value={resolved.description.tr}
                disabled={loading || saving}
                onChange={(e) => updateLocalized(entry.id, 'description', 'tr', e.target.value)}
              />
            </label>
          </div>
        </div>
      </div>
    )
  }

  const renderGroupColumn = (title: string, items: DraftSection[]) => (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-[var(--foreground)]">{title}</h4>
      <div className="space-y-2 min-h-[120px]">
        {items.map((item) => renderSectionEditor(item))}
        {!items.length ? (
          <div className="text-xs text-[var(--muted)] border border-dashed border-[var(--border)] rounded-xl p-4 text-center">
            {t('adminReportsCatalogEmptyGroup', lang)}
          </div>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 px-4 py-4 w-full">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin text-violet-600 shrink-0" />
            ) : (
              <LayoutList className="w-4 h-4 text-violet-600 shrink-0" />
            )}
            {t('adminReportsCatalogTitle', lang)}
          </div>
          <p className="text-xs text-[var(--muted)] mt-1 leading-snug max-w-3xl">
            {t('adminReportsCatalogHint', lang)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" disabled={loading || saving} onClick={resetDefaults}>
            {t('adminReportsCatalogReset', lang)}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={loading || saving || !dirty}
            onClick={() => void onSave(activeConfig)}
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {t('adminReportsCatalogSave', lang)}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {(['all', 'development_360', 'job_evaluation'] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            disabled={loading || saving}
            onClick={() => setFilterKind(kind)}
            className={`text-xs px-3 py-1.5 rounded-full border ${
              filterKind === kind
                ? 'border-violet-500 bg-violet-500/15 text-violet-900 dark:text-violet-100'
                : 'border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)]'
            }`}
          >
            {kind === 'all'
              ? t('adminReportsCatalogFilterAll', lang)
              : assessmentKindLabel(normalizeAssessmentKind(kind), lang)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {renderGroupColumn(groupLabel('management', lang), grouped.management)}
        {renderGroupColumn(groupLabel('hr', lang), grouped.hr)}
      </div>
    </div>
  )
}
