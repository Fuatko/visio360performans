'use client'

import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Bar,
  Cell,
  ReferenceLine,
} from 'recharts'

type GapRow = { name: string; gap: number }

export function GapBar({
  rows,
  label = 'Gap (Öz - Ekip)',
}: {
  rows: GapRow[]
  label?: string
}) {
  const data = rows.map((r) => ({ name: r.name, gap: Number(r.gap || 0) }))

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 32, left: 0 }}>
          <CartesianGrid stroke="rgba(107,124,147,0.25)" strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            interval={0}
            angle={-25}
            textAnchor="end"
            height={60}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
          />
          <YAxis domain={[-5, 5]} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <Tooltip formatter={(value: any) => [Number(value).toFixed(1), label]} />
          <ReferenceLine y={0} stroke="rgba(107,124,147,0.55)" />
          <Bar dataKey="gap" radius={[8, 8, 0, 0]}>
            {data.map((d, idx) => (
              <Cell
                // positive gap: self higher -> amber, negative gap: self lower -> blue/green
                key={`cell-${idx}`}
                fill={d.gap >= 0 ? 'var(--warning)' : 'var(--brand)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

