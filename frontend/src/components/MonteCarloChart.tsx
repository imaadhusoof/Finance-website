import { useEffect, useMemo, useRef, useState } from 'react'
import { formatPrice, type Projection } from '../api'

interface Props {
  projection: Projection
  invested: number
  height?: number
}

const PAD = { top: 18, right: 18, bottom: 34, left: 66 }

function niceTicks(lo: number, hi: number, count = 4): number[] {
  const span = hi - lo || 1
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const norm = raw / mag
  const step = (norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1) * mag
  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(v)
  return ticks
}

function compactUSD(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`
  return `$${v.toFixed(0)}`
}

/**
 * Monte Carlo projection as a fan chart: the shaded bands are the 10–90 and
 * 25–75 percentile ranges of simulated portfolio value; the solid line is the
 * median path. The spread — not the median — is the message, so the bands lead
 * visually and the median rides on top.
 */
export default function MonteCarloChart({ projection, invested, height = 320 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    setWidth(el.clientWidth)
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const { years, p10, p25, p50, p75, p90 } = projection
  const n = years.length
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = Math.max(0, height - PAD.top - PAD.bottom)

  const { lo, hi, ticks } = useMemo(() => {
    const max = Math.max(...p90)
    const min = Math.min(...p10, invested)
    const hiPad = max * 1.05
    const loPad = Math.max(0, min * 0.9)
    return { lo: loPad, hi: hiPad, ticks: niceTicks(loPad, hiPad, 4) }
  }, [p10, p90, invested])

  const xAt = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yAt = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * innerH

  // A filled band: trace the upper edge left→right, then the lower edge back.
  const band = (upper: number[], lower: number[]) => {
    const top = upper.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`)
    const bottom: string[] = []
    for (let i = lower.length - 1; i >= 0; i--) {
      bottom.push(`L${xAt(i).toFixed(1)},${yAt(lower[i]).toFixed(1)}`)
    }
    return `${top.join(' ')} ${bottom.join(' ')} Z`
  }

  const outerBand = useMemo(() => band(p90, p10), [p90, p10, innerW, innerH, lo, hi])
  const innerBand = useMemo(() => band(p75, p25), [p75, p25, innerW, innerH, lo, hi])
  const medianPath = useMemo(
    () => p50.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join(' '),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p50, innerW, innerH, lo, hi],
  )

  const xLabels = useMemo(() => {
    const maxYear = years[n - 1]
    const out: { i: number; text: string }[] = []
    const count = Math.min(6, n)
    for (let k = 0; k < count; k++) {
      const i = Math.round((k / Math.max(1, count - 1)) * (n - 1))
      out.push({ i, text: `${Math.round(years[i])}y` })
    }
    void maxYear
    return out
  }, [years, n])

  function pointerIndex(clientX: number): number {
    const el = wrapRef.current
    if (!el || n === 0) return 0
    const rect = el.getBoundingClientRect()
    const t = (clientX - rect.left - PAD.left) / (innerW || 1)
    return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))))
  }

  const active = hover
  const tooltipX = active !== null ? Math.min(Math.max(xAt(active), 80), width - 80) : 0

  return (
    <div
      className="chart-wrap"
      ref={wrapRef}
      style={{ height }}
      onPointerMove={(e) => setHover(pointerIndex(e.clientX))}
      onPointerLeave={() => setHover(null)}
    >
      {width > 0 && (
        <svg className="chart-svg" width={width} height={height} role="img"
          aria-label="Monte Carlo projection of portfolio value">
          {ticks.map((t) => (
            <g key={t}>
              <line className="chart-grid" x1={PAD.left} x2={PAD.left + innerW} y1={yAt(t)} y2={yAt(t)} />
              <text className="chart-axis-text" x={PAD.left - 10} y={yAt(t)} textAnchor="end" dominantBaseline="middle">
                {compactUSD(t)}
              </text>
            </g>
          ))}
          {xLabels.map(({ i, text }) => (
            <text key={`${i}-${text}`} className="chart-axis-text" x={xAt(i)} y={height - 10}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
              {text}
            </text>
          ))}

          {/* Invested baseline */}
          <line className="mc-baseline" x1={PAD.left} x2={PAD.left + innerW} y1={yAt(invested)} y2={yAt(invested)} />

          <path className="mc-band-outer" d={outerBand} />
          <path className="mc-band-inner" d={innerBand} />
          <path className="mc-median" d={medianPath} />

          {active !== null && (
            <g>
              <line className="chart-crosshair" x1={xAt(active)} x2={xAt(active)} y1={PAD.top} y2={PAD.top + innerH} />
              <circle className="chart-focus-dot" cx={xAt(active)} cy={yAt(p50[active])} r={4} />
            </g>
          )}
        </svg>
      )}

      {active !== null && (
        <div className="tooltip mc-tooltip" style={{ left: tooltipX, top: yAt(p90[active]) - 10 }}>
          <div className="tooltip-label" style={{ marginTop: 0, marginBottom: 4 }}>
            Year {Math.round(years[active])}
          </div>
          <div className="mc-tip-row"><span>Median</span><strong>{formatPrice(p50[active], 'USD')}</strong></div>
          <div className="mc-tip-row muted"><span>10–90%</span><span>{compactUSD(p10[active])} – {compactUSD(p90[active])}</span></div>
        </div>
      )}
    </div>
  )
}
