export type ReportExportLang = 'tr' | 'en' | 'fr'

export function escapeHtmlForPrint(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Excel/Numbers uyumlu hücre metni — satır sonu ve kontrol karakterlerini temizler. */
export function csvSanitize(v: unknown): string {
  return String(v ?? '')
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
    .trim()
}

export function csvEsc(v: unknown): string {
  return `"${csvSanitize(v).replace(/"/g, '""')}"`
}

export function downloadCsv(filename: string, csvBody: string) {
  const normalized = csvBody.replace(/\r?\n/g, '\r\n').replace(/^\r\n/, '')
  const body = `sep=;\r\n${normalized}`
  const blob = new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function buildCsv(headers: string[], rows: unknown[][], sep = ';'): string {
  const lines = [headers.map(csvEsc).join(sep)]
  rows.forEach((row) => {
    lines.push(row.map(csvEsc).join(sep))
  })
  return lines.join('\n') + '\n'
}

export function openPrintableReport(opts: {
  lang: ReportExportLang
  title: string
  subtitle?: string
  headers: string[]
  rows: string[][]
  onBlocked?: () => void
}) {
  const { lang, title, subtitle, headers, rows, onBlocked } = opts
  if (!rows.length) return false
  const w = window.open('', '_blank')
  if (!w) {
    onBlocked?.()
    return false
  }
  const esc = escapeHtmlForPrint
  const printBtn =
    lang === 'en' ? 'Print / Save as PDF' : lang === 'fr' ? 'Imprimer / PDF' : 'Yazdır / PDF kaydet'
  const head = headers.map((h) => `<th>${esc(h)}</th>`).join('')
  const body = rows
    .map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
    .join('')
  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 20px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p.meta { margin: 0 0 16px; color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }
  .no-print { margin-bottom: 16px; }
  @media print { .no-print { display: none !important; } body { padding: 12px; } }
</style>
</head>
<body>
  <div class="no-print">
    <button type="button" onclick="window.print()" style="padding:8px 14px;font-size:13px;cursor:pointer;border:1px solid #d1d5db;border-radius:8px;background:#fff;">${esc(printBtn)}</button>
  </div>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<p class="meta">${esc(subtitle)}</p>` : ''}
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
</body>
</html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => {
    try {
      w.print()
    } catch {
      /* kullanıcı butona basar */
    }
  }, 300)
  return true
}

export type PrintableReportSection = {
  heading?: string
  headers: string[]
  rows: string[][]
}

export function openPrintableReportDocument(opts: {
  lang: ReportExportLang
  title: string
  subtitle?: string
  sections: PrintableReportSection[]
  onBlocked?: () => void
}) {
  const { lang, title, subtitle, sections, onBlocked } = opts
  const nonEmpty = sections.filter((s) => s.rows.length > 0)
  if (!nonEmpty.length) return false

  const w = window.open('', '_blank')
  if (!w) {
    onBlocked?.()
    return false
  }

  const esc = escapeHtmlForPrint
  const printBtn =
    lang === 'en' ? 'Print / Save as PDF' : lang === 'fr' ? 'Imprimer / PDF' : 'Yazdır / PDF kaydet'

  const sectionHtml = nonEmpty
    .map((section) => {
      const head = section.headers.map((h) => `<th>${esc(h)}</th>`).join('')
      const body = section.rows
        .map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')
      const heading = section.heading ? `<h2>${esc(section.heading)}</h2>` : ''
      return `${heading}<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
    })
    .join('')

  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 20px; color: #111; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 20px 0 8px; color: #374151; }
  p.meta { margin: 0 0 16px; color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
  th, td { border: 1px solid #ddd; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }
  .no-print { margin-bottom: 16px; }
  @media print { .no-print { display: none !important; } body { padding: 12px; } h2 { page-break-after: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
</style>
</head>
<body>
  <div class="no-print">
    <button type="button" onclick="window.print()" style="padding:8px 14px;font-size:13px;cursor:pointer;border:1px solid #d1d5db;border-radius:8px;background:#fff;">${esc(printBtn)}</button>
  </div>
  <h1>${esc(title)}</h1>
  ${subtitle ? `<p class="meta">${esc(subtitle)}</p>` : ''}
  ${sectionHtml}
</body>
</html>`
  w.document.open()
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => {
    try {
      w.print()
    } catch {
      /* kullanıcı butona basar */
    }
  }, 300)
  return true
}
