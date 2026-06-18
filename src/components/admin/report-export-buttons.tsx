'use client'

import { Button } from '@/components/ui'
import { Download, Printer } from 'lucide-react'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'

export function ReportExportButtons({
  onExcel,
  onPdf,
  excelDisabled,
  pdfDisabled,
  size = 'sm',
}: {
  onExcel: () => void
  onPdf: () => void
  excelDisabled?: boolean
  pdfDisabled?: boolean
  size?: 'sm' | 'md'
}) {
  const lang = useLang()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="secondary" size={size} onClick={onExcel} disabled={excelDisabled}>
        <Download className="w-4 h-4" />
        {t('exportExcel', lang)}
      </Button>
      <Button variant="secondary" size={size} onClick={onPdf} disabled={pdfDisabled}>
        <Printer className="w-4 h-4" />
        {t('printPdf', lang)}
      </Button>
    </div>
  )
}
