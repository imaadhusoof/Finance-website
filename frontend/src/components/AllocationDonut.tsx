import { formatUSD0, type Holding } from '../api'

interface Props {
  holdings: Holding[]
  total: number
}

const SIZE = 220
const STROKE = 30
const R = (SIZE - STROKE) / 2
const C = 2 * Math.PI * R
const CENTER = SIZE / 2

/**
 * Weight ramp: a single-hue sequence (light → deep blue) ordered by weight, so
 * the largest positions read darkest. A monochrome ramp keeps the allocation
 * on-brand and avoids implying categorical meaning where there is only "more"
 * and "less".
 */
function shade(i: number, n: number): string {
  const t = n <= 1 ? 0 : i / (n - 1)
  // Interpolate lightness of the accent hue (~213°, 66% sat).
  const light = 78 - t * 40 // 78% → 38%
  return `hsl(213, 62%, ${light}%)`
}

export default function AllocationDonut({ holdings, total }: Props) {
  let offset = 0
  const segments = holdings.map((h, i) => {
    const len = h.weight * C
    const seg = {
      ticker: h.ticker,
      color: shade(i, holdings.length),
      dash: len,
      gap: C - len,
      offset: -offset,
    }
    offset += len
    return seg
  })

  return (
    <div className="donut-wrap">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="donut" role="img"
        aria-label="Portfolio allocation by weight">
        <circle cx={CENTER} cy={CENTER} r={R} fill="none" stroke="var(--surface-sunken)" strokeWidth={STROKE} />
        {segments.map((s) => (
          <circle
            key={s.ticker}
            cx={CENTER}
            cy={CENTER}
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth={STROKE}
            strokeDasharray={`${s.dash} ${s.gap}`}
            strokeDashoffset={s.offset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            className="donut-seg"
          />
        ))}
        <text x={CENTER} y={CENTER - 6} textAnchor="middle" className="donut-center-num">
          {holdings.length}
        </text>
        <text x={CENTER} y={CENTER + 14} textAnchor="middle" className="donut-center-label">
          holdings
        </text>
      </svg>

      <ul className="donut-legend">
        {holdings.map((h, i) => (
          <li key={h.ticker} className="legend-row">
            <span className="legend-dot" style={{ background: shade(i, holdings.length) }} />
            <span className="legend-ticker">{h.ticker}</span>
            <span className="legend-name">{h.sector ?? h.name ?? ''}</span>
            <span className="legend-weight">{(h.weight * 100).toFixed(1)}%</span>
            <span className="legend-amount">{formatUSD0(h.amount)}</span>
          </li>
        ))}
        <li className="legend-row legend-total">
          <span className="legend-dot" style={{ background: 'transparent' }} />
          <span className="legend-ticker">Total</span>
          <span className="legend-name" />
          <span className="legend-weight">100%</span>
          <span className="legend-amount">{formatUSD0(total)}</span>
        </li>
      </ul>
    </div>
  )
}
