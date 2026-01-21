'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardHeader, CardBody, CardTitle, Badge } from '@/components/ui'
import { useAuthStore } from '@/store/auth'
import { useLang } from '@/components/i18n/language-context'
import { t } from '@/lib/i18n'
import { 
  Target, TrendingUp, TrendingDown, Lightbulb, BookOpen, 
  CheckCircle, Clock, Loader2, ArrowUp, ArrowDown, Minus
} from 'lucide-react'
import { RequireSelection } from '@/components/kvkk/require-selection'
import { RadarCompare } from '@/components/charts/radar-compare'
import { BarCompare } from '@/components/charts/bar-compare'

interface CategoryScore {
  name: string
  selfScore: number
  peerScore: number
  gap: number
}

interface DevelopmentPlan {
  strengths: CategoryScore[]
  improvements: CategoryScore[]
  recommendations: string[]
}

export default function DevelopmentPage() {
  const lang = useLang()
  const { user } = useAuthStore()
  const [plan, setPlan] = useState<DevelopmentPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [periodName, setPeriodName] = useState('')
  const [periodOptions, setPeriodOptions] = useState<{ id: string; name: string }[]>([])
  const [selectedPeriodId, setSelectedPeriodId] = useState('')

  const loadPeriods = useCallback(async () => {
    if (!user) return

    try {
      const resp = await fetch('/api/dashboard/development', { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')
      setPeriodOptions((payload.periods || []) as any)
      setSelectedPeriodId('')
      setPeriodName('')
      setPlan(null)
      setLoading(false)
      return

    } catch (error) {
      console.error('Development plan error:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user) loadPeriods()
  }, [user, loadPeriods])

  const loadDevelopmentPlanForPeriod = async (periodId: string) => {
    if (!user) return
    setLoading(true)
    try {
      const resp = await fetch(`/api/dashboard/development?period_id=${encodeURIComponent(periodId)}`, { method: 'GET' })
      const payload = (await resp.json().catch(() => ({}))) as any
      if (!resp.ok || !payload?.success) throw new Error(payload?.error || 'Veri alınamadı')
      setPeriodName(String(payload.periodName || ''))
      setPlan(payload.plan || null)

    } catch (error) {
      console.error('Development plan error:', error)
      setPlan(null)
    } finally {
      setLoading(false)
    }
  }

  const getGapIcon = (gap: number) => {
    if (gap > 0.3) return <ArrowUp className="w-4 h-4 text-amber-500" />
    if (gap < -0.3) return <ArrowDown className="w-4 h-4 text-blue-500" />
    return <Minus className="w-4 h-4 text-gray-400" />
  }

  const getGapLabel = (gap: number) => {
    if (gap > 0.5) return 'Aşırı Özgüven'
    if (gap > 0.3) return 'Hafif Yüksek'
    if (gap < -0.5) return 'Düşük Özgüven'
    if (gap < -0.3) return 'Hafif Düşük'
    return 'Uyumlu'
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🎯 {t('myDevelopmentTitle', lang)}</h1>
        <p className="text-gray-500 mt-1">{t('myDevelopmentSubtitle', lang)}</p>
      </div>

      {periodOptions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>📅 Dönem Seçimi</CardTitle>
          </CardHeader>
          <CardBody className="flex flex-wrap gap-2">
            {periodOptions.map(p => (
              <button
                key={p.id}
                onClick={() => { setSelectedPeriodId(p.id); loadDevelopmentPlanForPeriod(p.id) }}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  selectedPeriodId === p.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {p.name}
              </button>
            ))}
          </CardBody>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      ) : periodOptions.length > 0 && !selectedPeriodId ? (
        <RequireSelection enabled={true} message="KVKK için: önce dönem seçmelisiniz.">
          <div />
        </RequireSelection>
      ) : !plan ? (
        <Card>
          <CardBody className="py-12 text-center text-gray-500">
            <Target className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Henüz değerlendirme sonucu yok</p>
            <p className="text-sm mt-2">Değerlendirmeler tamamlandığında gelişim planınız oluşturulacak</p>
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Period Badge */}
          <div className="mb-6">
            <Badge variant="info" className="text-sm px-4 py-2">
              📅 {periodName} Dönemi Analizi
            </Badge>
          </div>

          {/* Compare charts */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-[var(--brand)]" />
                KPI / Kategori Kıyas Grafikleri
              </CardTitle>
              <div className="text-sm text-[var(--muted)]">
                Öz değerlendirme (Self) ile ekip değerlendirmesi (Peer) arasındaki farkları görsel olarak inceleyin.
              </div>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                  <div className="font-semibold text-[var(--foreground)] mb-3">🕸️ Radar</div>
                  <RadarCompare
                    rows={[...plan.strengths, ...plan.improvements].map((c) => ({
                      name: c.name,
                      self: c.selfScore || 0,
                      peer: c.peerScore || 0,
                    }))}
                    selfLabel={t('selfShort', lang)}
                    peerLabel={t('teamShort', lang)}
                  />
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-4">
                  <div className="font-semibold text-[var(--foreground)] mb-3">📊 Bar</div>
                  <BarCompare
                    rows={[...plan.strengths, ...plan.improvements].map((c) => ({
                      name: c.name,
                      self: c.selfScore || 0,
                      peer: c.peerScore || 0,
                    }))}
                    selfLabel={t('selfShort', lang)}
                    peerLabel={t('teamShort', lang)}
                  />
                </div>
              </div>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Strengths */}
            <Card>
              <CardHeader className="bg-emerald-50 border-b border-emerald-100">
                <CardTitle className="flex items-center gap-2 text-emerald-700">
                  <TrendingUp className="w-5 h-5" />
                  Güçlü Yönlerim
                </CardTitle>
                <Badge variant="success">{plan.strengths.length} alan</Badge>
              </CardHeader>
              <CardBody>
                {plan.strengths.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Henüz güçlü alan belirlenmedi</p>
                ) : (
                  <div className="space-y-4">
                    {plan.strengths.map((cat, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600 font-semibold text-sm">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{cat.name}</p>
                            <p className="text-xs text-gray-500">
                              Öz: {cat.selfScore} | Peer: {cat.peerScore}
                            </p>
                          </div>
                        </div>
                        <Badge variant="success">{cat.peerScore}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>

            {/* Improvements */}
            <Card>
              <CardHeader className="bg-amber-50 border-b border-amber-100">
                <CardTitle className="flex items-center gap-2 text-amber-700">
                  <TrendingDown className="w-5 h-5" />
                  Gelişim Alanlarım
                </CardTitle>
                <Badge variant="warning">{plan.improvements.length} alan</Badge>
              </CardHeader>
              <CardBody>
                {plan.improvements.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">Tüm alanlarda iyi performans gösteriyorsunuz! 🎉</p>
                ) : (
                  <div className="space-y-4">
                    {plan.improvements.map((cat, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600 font-semibold text-sm">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{cat.name}</p>
                            <p className="text-xs text-gray-500">
                              Öz: {cat.selfScore} | Peer: {cat.peerScore}
                            </p>
                          </div>
                        </div>
                        <Badge variant="warning">{cat.peerScore}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Gap Analysis */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-600" />
                Öz-Değerlendirme Gap Analizi
              </CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-500 mb-4">
                Kendinizi nasıl gördüğünüz ile başkalarının sizi nasıl gördüğü arasındaki fark
              </p>
              <div className="space-y-3">
                {[...plan.strengths, ...plan.improvements].map((cat, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{cat.name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Gap: {cat.gap > 0 ? '+' : ''}{cat.gap}</span>
                      {getGapIcon(cat.gap)}
                    </div>
                    <Badge variant={Math.abs(cat.gap) > 0.5 ? 'warning' : 'gray'}>
                      {getGapLabel(cat.gap)}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Recommendations */}
          <Card>
            <CardHeader className="bg-blue-50 border-b border-blue-100">
              <CardTitle className="flex items-center gap-2 text-blue-700">
                <Lightbulb className="w-5 h-5" />
                Gelişim Önerileri
              </CardTitle>
            </CardHeader>
            <CardBody>
              {plan.recommendations.length === 0 ? (
                <p className="text-gray-500 text-center py-4">Öneri oluşturulacak yeterli veri yok</p>
              ) : (
                <div className="space-y-4">
                  {plan.recommendations.map((rec, idx) => (
                    <div key={idx} className="flex gap-4 p-4 bg-blue-50 rounded-xl">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <BookOpen className="w-4 h-4 text-blue-600" />
                      </div>
                      <p className="text-gray-700">{rec}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {/* Action Items */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
                Eylem Planı
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {plan.improvements.slice(0, 3).map((imp, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 border border-gray-200 rounded-xl">
                    <div className="w-6 h-6 border-2 border-gray-300 rounded-full flex-shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">
                        {imp.name} alanında gelişim sağla
                      </p>
                      <p className="text-sm text-gray-500">
                        Hedef: {imp.peerScore} → {Math.min(5, imp.peerScore + 1).toFixed(1)}
                      </p>
                    </div>
                    <Badge variant="gray">
                      <Clock className="w-3 h-3 mr-1" />
                      3 ay
                    </Badge>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  )
}
