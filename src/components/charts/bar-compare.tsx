'use client'

import {
  ResponsiveContainer,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  Cell,
} from 'recharts'

type CompareRow = { name: string; self: number; peer: number }

import { colorForCategory } from '@/lib/chart-colors'

export function BarCompare({
  rows,
  selfLabel = 'Öz',
  peerLabel = 'Ekip',
}: {
  rows: CompareRow[]
  selfLabel?: string
  peerLabel?: string
}) {
  const data = rows.map((r) => ({
    name: r.name,
    self: r.self || 0,
    peer: r.peer || 0,
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
          <Legend />
          {/* Per-category colors with slight opacity difference per series */}
          <Bar name={selfLabel} dataKey="self" radius={[8, 8, 0, 0]}>
            {data.map((d, idx) => (
              <Cell key={`self-${idx}`} fill={colorForCategory(d.name)} fillOpacity={0.9} />
            ))}
          </Bar>
          <Bar name={peerLabel} dataKey="peer" radius={[8, 8, 0, 0]}>
            {data.map((d, idx) => (
              <Cell key={`peer-${idx}`} fill={colorForCategory(d.name)} fillOpacity={0.55} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

