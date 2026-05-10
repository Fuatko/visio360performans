type NumericRow = Record<string, string | number | null | undefined>

function formatNumber(value: unknown) {
  const n = Number(value || 0)
  return Number.isFinite(n) ? n.toFixed(1) : '0.0'
}

export function ChartDescription({
  title,
  rows,
  fields,
}: {
  title: string
  rows: NumericRow[]
  fields: Array<{ key: string; label: string }>
}) {
  const visibleRows = rows.slice(0, 8)

  return (
    <div className="sr-only">
      <p>{title}</p>
      <ul>
        {visibleRows.map((row, index) => (
          <li key={`${String(row.name || row.subject || 'row')}-${index}`}>
            {String(row.name || row.subject || 'Kategori')}: {fields.map((field) => `${field.label} ${formatNumber(row[field.key])}`).join(', ')}
          </li>
        ))}
      </ul>
    </div>
  )
}
