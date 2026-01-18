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

type SingleRow = { name: string; value: number }

import { colorForCategory } from '@/lib/chart-colors'

export function BarSingle({
  rows,
  label = 'Öz',
}: {
  rows: SingleRow[]
  label?: string
}) {
  const data = rows.map((r) => ({
    name: r.name,
    value: r.value || 0,
  }))

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
          <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <Tooltip />
          <Bar name={label} dataKey="value" radius={[8, 8, 0, 0]}>
            {data.map((d, idx) => (
              <Cell key={`cell-${idx}`} fill={colorForCategory(d.name)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

