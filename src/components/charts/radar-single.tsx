'use client'

import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Tooltip,
} from 'recharts'
import { ChartDescription } from './chart-description'

type SingleRow = { name: string; value: number }

export function RadarSingle({
  rows,
  label = 'Öz',
}: {
  rows: SingleRow[]
  label?: string
}) {
  const data = rows.map((r) => ({
    subject: r.name,
    value: r.value || 0,
  }))

  return (
    <div className="w-full h-[340px]" role="img" aria-label={`${label} radar grafiği`}>
      <ChartDescription title={`${label} radar grafiği`} rows={data} fields={[{ key: 'value', label }]} />
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="rgba(107,124,147,0.25)" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10, fill: 'var(--muted)' }} />
          <Tooltip />
          <Radar
            name={label}
            dataKey="value"
            stroke="var(--brand)"
            fill="var(--brand-soft)"
            fillOpacity={0.65}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

