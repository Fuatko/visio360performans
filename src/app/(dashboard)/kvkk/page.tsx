'use client'

import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { getKvkkContent } from '@/lib/kvkk-content'

// Markdown öğeleri için sade tipografi (prose eklentisine bağımlı değil)
const mdComponents = {
  h1: (p: { children?: React.ReactNode }) => (
    <h1 className="text-2xl font-semibold text-[var(--foreground)] mt-6 mb-3 first:mt-0">{p.children}</h1>
  ),
  h2: (p: { children?: React.ReactNode }) => (
    <h2 className="text-xl font-semibold text-[var(--foreground)] mt-5 mb-2">{p.children}</h2>
  ),
  h3: (p: { children?: React.ReactNode }) => (
    <h3 className="text-lg font-semibold text-[var(--foreground)] mt-4 mb-2">{p.children}</h3>
  ),
  p: (p: { children?: React.ReactNode }) => (
    <p className="text-[var(--foreground)] leading-relaxed my-3">{p.children}</p>
  ),
  ul: (p: { children?: React.ReactNode }) => <ul className="list-disc pl-6 my-3 space-y-1">{p.children}</ul>,
  ol: (p: { children?: React.ReactNode }) => <ol className="list-decimal pl-6 my-3 space-y-1">{p.children}</ol>,
  li: (p: { children?: React.ReactNode }) => <li className="text-[var(--foreground)] leading-relaxed">{p.children}</li>,
  a: (p: { href?: string; children?: React.ReactNode }) => (
    <a href={p.href} className="text-[var(--brand)] underline" target="_blank" rel="noopener noreferrer">
      {p.children}
    </a>
  ),
  strong: (p: { children?: React.ReactNode }) => <strong className="font-semibold">{p.children}</strong>,
  em: (p: { children?: React.ReactNode }) => <em className="italic text-[var(--muted)]">{p.children}</em>,
  hr: () => <hr className="my-5 border-t border-[var(--border)]" />,
  table: (p: { children?: React.ReactNode }) => (
    <div className="overflow-x-auto my-3">
      <table className="w-full text-sm border-collapse">{p.children}</table>
    </div>
  ),
  th: (p: { children?: React.ReactNode }) => (
    <th className="border border-[var(--border)] px-3 py-2 text-left bg-[var(--surface-2)]">{p.children}</th>
  ),
  td: (p: { children?: React.ReactNode }) => (
    <td className="border border-[var(--border)] px-3 py-2">{p.children}</td>
  ),
}

const fallbackNote: Record<string, string> = {
  tr: 'Bu içerik şu an Türkçe olarak gösteriliyor.',
  fr: 'Ce contenu est actuellement affiché en turc.',
  en: 'This content is currently shown in Turkish.',
}

export default function KvkkPage() {
  const lang = useLang()
  const content = useMemo(() => getKvkkContent(lang), [lang])

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-8">
        <h1 className="sr-only">{t('kvkkTitle', lang)}</h1>
        {content.fellBackToTr ? (
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--muted)]">
            {fallbackNote[lang] || fallbackNote.tr}
          </div>
        ) : null}
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
          {content.markdown}
        </ReactMarkdown>
      </div>
    </div>
  )
}
