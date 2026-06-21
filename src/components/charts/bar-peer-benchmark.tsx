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
} from 'recharts'
import { ChartDescription } from './chart-description'

type Row = { name: string; person: number; orgAvg: number }

export function BarPeerBenchmark({
  rows,
  personLabel = 'Kişi',
  orgLabel = 'Kurum ort.',
}: {
  rows: Row[]
  personLabel?: string
  orgLabel?: string
}) {
  const data = rows.map((r) => ({
    name: r.name,
    person: r.person || 0,
    orgAvg: r.orgAvg || 0,
  }))

  return (
    <div className="w-full min-h-[340px]" role="img" aria-label={`${personLabel} vs ${orgLabel}`}>
      <ChartDescription
        title={`${personLabel} vs ${orgLabel}`}
        rows={data}
        fields={[
          { key: 'person', label: personLabel },
          { key: 'orgAvg', label: orgLabel },
        ]}
      />
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 48, left: 0 }}>
          <CartesianGrid stroke="rgba(107,124,147,0.25)" strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            interval={0}
            angle={-28}
            textAnchor="end"
            height={72}
            tick={{ fontSize: 10, fill: 'var(--muted)' }}
          />
          <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <Tooltip />
          <Legend />
          <Bar name={personLabel} dataKey="person" fill="var(--brand)" radius={[6, 6, 0, 0]} />
          <Bar name={orgLabel} dataKey="orgAvg" fill="var(--success)" fillOpacity={0.65} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
