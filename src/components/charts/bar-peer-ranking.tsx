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
} from 'recharts'
import { ChartDescription } from './chart-description'

type Row = { name: string; value: number; isSelected: boolean }

export function BarPeerRanking({
  rows,
  title = 'Kurum sıralaması',
}: {
  rows: Row[]
  title?: string
}) {
  const data = rows.map((r) => ({
    name: r.name,
    value: r.value || 0,
    isSelected: r.isSelected,
  }))

  return (
    <div className="w-full min-h-[320px]" role="img" aria-label={title}>
      <ChartDescription
        title={title}
        rows={data.map((d) => ({ name: d.name, value: d.value }))}
        fields={[{ key: 'value', label: 'Puan' }]}
      />
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="rgba(107,124,147,0.25)" strokeDasharray="3 3" />
          <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 10, fill: 'var(--muted)' }}
          />
          <Tooltip />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {data.map((d, idx) => (
              <Cell
                key={`cell-${idx}`}
                fill={d.isSelected ? 'var(--brand)' : 'rgba(107,124,147,0.45)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
