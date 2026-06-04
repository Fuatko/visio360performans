'use client'

type CategoryRow = {
  name: string
  self?: number
  peer: number
  diff?: number
  peerTrimmed?: number
}

type SliceLike = {
  matrixContext: string
  matrixLabel: string
  isDutyMatrix?: boolean
  categoryCompare?: CategoryRow[]
}

function scoreCell(v: number | undefined | null, pct = false) {
  if (v == null || !Number.isFinite(Number(v)) || Number(v) <= 0) return '—'
  const n = Number(v)
  return pct ? `${Math.round((n / 5) * 100)}%` : n.toFixed(1)
}

export function MatrixSliceCategoryAccordions({
  slices,
  showSelf = false,
  defaultOpenFirst = false,
}: {
  slices: SliceLike[]
  showSelf?: boolean
  defaultOpenFirst?: boolean
}) {
  const withCategories = (slices || []).filter((s) => (s.categoryCompare || []).length > 0)
  if (!withCategories.length) {
    return (
      <div className="text-sm text-[var(--muted)] mt-3">Kategori bazlı veri yok.</div>
    )
  }

  return (
    <div className="mt-4 space-y-2">
      <div className="text-sm font-semibold text-[var(--foreground)]">Kategori bazlı inceleme</div>
      <p className="text-xs text-[var(--muted)]">
        Tüm kategoriler listelenir; yer kazanmak için bölüm başlığına tıklayarak açıp kapatabilirsiniz.
      </p>
      {withCategories.map((slice, idx) => {
        const rows = slice.categoryCompare || []
        return (
          <details
            key={slice.matrixContext}
            className={`group border rounded-xl overflow-hidden ${
              slice.isDutyMatrix ? 'border-amber-500/30' : 'border-[var(--border)]'
            }`}
            open={defaultOpenFirst && idx === 0}
          >
            <summary className="cursor-pointer list-none px-4 py-3 bg-[var(--surface-2)] hover:bg-[var(--surface)] flex items-center justify-between gap-2">
              <span className="font-medium text-sm text-[var(--foreground)]">
                {slice.matrixLabel}
                <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                  ({rows.length} kategori)
                </span>
              </span>
              <span className="text-xs text-[var(--muted)] group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="p-3 overflow-x-auto bg-[var(--surface)]">
              <table className="w-full text-xs min-w-[480px]">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                    <th className="text-left py-2 pr-3 font-semibold">Kategori</th>
                    {showSelf ? (
                      <th className="text-center py-2 px-2 font-semibold w-16">Öz</th>
                    ) : null}
                    <th className="text-center py-2 px-2 font-semibold w-16">Ekip</th>
                    <th className="text-center py-2 px-2 font-semibold w-16">Trim</th>
                    {showSelf ? (
                      <th className="text-center py-2 px-2 font-semibold w-16">Fark</th>
                    ) : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rows.map((c) => (
                    <tr key={c.name} className="hover:bg-[var(--surface-2)]/50">
                      <td className="py-2 pr-3 font-medium text-[var(--foreground)] align-top">
                        <span className="line-clamp-2" title={c.name}>
                          {c.name}
                        </span>
                      </td>
                      {showSelf ? (
                        <td className="py-2 px-2 text-center text-[var(--brand)]">{scoreCell(c.self)}</td>
                      ) : null}
                      <td className="py-2 px-2 text-center text-[var(--success)] font-semibold">
                        {scoreCell(c.peer)}
                      </td>
                      <td className="py-2 px-2 text-center">{scoreCell(c.peerTrimmed)}</td>
                      {showSelf ? (
                        <td className="py-2 px-2 text-center">
                          {c.self && c.peer
                            ? `${c.diff && c.diff > 0 ? '+' : ''}${Number(c.diff || 0).toFixed(1)}`
                            : '—'}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )
      })}
    </div>
  )
}
