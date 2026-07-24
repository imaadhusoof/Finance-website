interface Item {
  label: string
  value: number
}

/**
 * Horizontal count bars. Color encodes nothing here (every bar is the same
 * measure), so a single hue is correct — a categorical palette would imply a
 * distinction that does not exist. Every value is directly labeled, so no
 * tooltip is needed to reach it.
 */
export default function SectorBars({ items }: { items: Item[] }) {
  if (!items.length) {
    return <div className="center-state">No classification data yet.</div>
  }
  const max = Math.max(...items.map((i) => i.value))

  return (
    <div className="bars">
      {items.map((item, idx) => (
        <div className="bar-row" key={item.label}>
          <div className="bar-label" title={item.label}>
            {item.label}
          </div>
          <div className="bar-track">
            <div
              className="bar-fill"
              style={{
                width: `${(item.value / max) * 100}%`,
                animationDelay: `${idx * 45}ms`,
              }}
            />
          </div>
          <div className="bar-value">{item.value}</div>
        </div>
      ))}
    </div>
  )
}
