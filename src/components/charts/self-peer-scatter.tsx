'use client'

import {
  ResponsiveContainer,
  ScatterChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Scatter,
  ReferenceLine,
} from 'recharts'

type Point = { name: string; self: number; peer: number }

import { colorForCategory } from '@/lib/chart-colors'

export function SelfPeerScatter({
  points,
  selfLabel = 'Öz',
  peerLabel = 'Ekip',
}: {
  points: Point[]
  selfLabel?: string
  peerLabel?: string
}) {
  const data = points.map((p) => ({
    name: p.name,
    self: p.self || 0,
    peer: p.peer || 0,
    color: colorForCategory(p.name),
  }))

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, bottom: 16, left: 0 }}>
          <CartesianGrid stroke="rgba(107,124,147,0.25)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="self"
            domain={[0, 5]}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            name={selfLabel}
            label={{ value: selfLabel, position: 'insideBottom', offset: -8, fill: 'var(--muted)', fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="peer"
            domain={[0, 5]}
            tick={{ fontSize: 11, fill: 'var(--muted)' }}
            name={peerLabel}
            label={{ value: peerLabel, angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 11 }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            formatter={(value: any, name: any) => [Number(value).toFixed(1), name]}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}
          />
          {/* y=x reference for alignment */}
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 5, y: 5 }]} stroke="rgba(107,124,147,0.45)" />
          <Scatter
            name="Kategoriler"
            data={data}
            shape={(props: any) => {
              const { cx, cy, payload } = props
              const fill = payload?.color || 'var(--brand)'
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={fill}
                  stroke="rgba(17,24,39,0.25)"
                  strokeWidth={1}
                />
              )
            }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}

