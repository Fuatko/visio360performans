'use client'

import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
} from 'recharts'

type CompareRow = { name: string; self: number; peer: number }

export function RadarCompare({
  rows,
  selfLabel = 'Öz',
  peerLabel = 'Ekip',
}: {
  rows: CompareRow[]
  selfLabel?: string
  peerLabel?: string
}) {
  const data = rows.map((r) => ({
    subject: r.name,
    self: r.self || 0,
    peer: r.peer || 0,
  }))

  return (
    <div className="w-full h-[340px]">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data}>
          <PolarGrid stroke="rgba(107,124,147,0.25)" />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
          <PolarRadiusAxis domain={[0, 5]} tick={{ fontSize: 10, fill: 'var(--muted)' }} />
          <Tooltip />
          <Legend />
          <Radar
            name={selfLabel}
            dataKey="self"
            stroke="var(--brand)"
            fill="var(--brand-soft)"
            fillOpacity={0.6}
          />
          <Radar
            name={peerLabel}
            dataKey="peer"
            stroke="var(--success)"
            fill="var(--success-soft)"
            fillOpacity={0.6}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}

