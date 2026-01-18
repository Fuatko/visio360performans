export const corporatePalette = [
  '#2563eb', // blue
  '#0ea5e9', // sky
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#22c55e', // green
  '#84cc16', // lime
  '#f59e0b', // amber
  '#f97316', // orange
  '#ef4444', // red
  '#ec4899', // pink
  '#a855f7', // purple
  '#6366f1', // indigo
] as const

function hash32(input: string) {
  // FNV-1a 32bit
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function colorForCategory(name: string) {
  const idx = hash32(String(name || '')) % corporatePalette.length
  return corporatePalette[idx] || corporatePalette[0]
}

