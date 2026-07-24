import { useEffect, useMemo, useRef, useState } from 'react'
import { formatPrice } from '../api'

interface Props {
  dates: string[]
  prices: number[]
  currency?: string | null
  height?: number
  label: string
}

const PAD = { top: 16, right: 18, bottom: 30, left: 58 }

/** Round-number tick values covering [lo, hi]. */
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

function formatTick(v: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: v >= 100 ? 0 : 1,
  }).format(v)
}

/**
 * Single-series price line. One series means no legend box is needed — the
 * card title names what is plotted.
 */
export default function PriceChart({
  dates,
  prices,
  currency,
  height = 300,
  label,
}: Props) {
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

  const n = prices.length
  const innerW = Math.max(0, width - PAD.left - PAD.right)
  const innerH = Math.max(0, height - PAD.top - PAD.bottom)

  const { lo, hi, ticks } = useMemo(() => {
    if (!n) return { lo: 0, hi: 1, ticks: [] as number[] }
    let min = Infinity
    let max = -Infinity
    for (const p of prices) {
      if (p < min) min = p
      if (p > max) max = p
    }
    const span = max - min || Math.abs(max) || 1
    const padded = { lo: min - span * 0.1, hi: max + span * 0.1 }
    return { ...padded, ticks: niceTicks(padded.lo, padded.hi, 4) }
  }, [prices, n])

  const xAt = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const yAt = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo || 1)) * innerH

  const points = useMemo(
    () => prices.map((p, i) => ({ x: xAt(i), y: yAt(p) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prices, innerW, innerH, lo, hi],
  )

  const linePath = useMemo(
    () => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '),
    [points],
  )

  const areaPath = useMemo(() => {
    if (!points.length) return ''
    const base = PAD.top + innerH
    const first = points[0]
    const last = points[points.length - 1]
    return `${linePath} L${last.x.toFixed(2)},${base} L${first.x.toFixed(2)},${base} Z`
  }, [linePath, points, innerH])

  // Exact for a polyline: sum the segment lengths. Avoids a DOM measure (and
  // the flash of an undrawn line) before the draw-in animation can start.
  const pathLen = useMemo(() => {
    let total = 0
    for (let i = 1; i < points.length; i++) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y)
    }
    return Math.ceil(total)
  }, [points])

  const xLabels = useMemo(() => {
    if (!n) return [] as { i: number; text: string }[]
    const spanDays =
      (new Date(dates[n - 1]).getTime() - new Date(dates[0]).getTime()) / 86_400_000
    const opts: Intl.DateTimeFormatOptions =
      spanDays > 400
        ? { month: 'short', year: 'numeric' }
        : { month: 'short', day: 'numeric' }
    const count = Math.min(5, n)
    const out: { i: number; text: string }[] = []
    for (let k = 0; k < count; k++) {
      const i = Math.round((k / Math.max(1, count - 1)) * (n - 1))
      out.push({
        i,
        text: new Date(`${dates[i]}T00:00:00`).toLocaleDateString('en-US', opts),
      })
    }
    return out
  }, [dates, n])

  function pointerIndex(clientX: number): number {
    const el = wrapRef.current
    if (!el || n === 0) return 0
    const rect = el.getBoundingClientRect()
    const t = (clientX - rect.left - PAD.left) / (innerW || 1)
    return Math.max(0, Math.min(n - 1, Math.round(t * (n - 1))))
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!n) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 1 : -1
      setHover((h) => Math.max(0, Math.min(n - 1, (h ?? n - 1) + step)))
    } else if (e.key === 'Escape') {
      setHover(null)
    }
  }

  if (!n) {
    return <div className="center-state">No price data.</div>
  }

  const active = hover ?? null
  const tooltipX = active !== null ? Math.min(Math.max(xAt(active), 66), width - 66) : 0

  return (
    <div
      className="chart-wrap"
      ref={wrapRef}
      style={{ height }}
      onPointerMove={(e) => setHover(pointerIndex(e.clientX))}
      onPointerLeave={() => setHover(null)}
    >
      {width > 0 && (
        <svg
          className="chart-svg"
          width={width}
          height={height}
          role="img"
          aria-label={`${label} price history from ${dates[0]} to ${dates[n - 1]}`}
          tabIndex={0}
          onKeyDown={onKeyDown}
          onFocus={() => setHover((h) => h ?? n - 1)}
        >
          {/* Gridlines + y ticks — recessive, hairline, solid */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                className="chart-grid"
                x1={PAD.left}
                x2={PAD.left + innerW}
                y1={yAt(t)}
                y2={yAt(t)}
              />
              <text
                className="chart-axis-text"
                x={PAD.left - 10}
                y={yAt(t)}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {formatTick(t)}
              </text>
            </g>
          ))}

          {/* x tick labels */}
          {xLabels.map(({ i, text }) => (
            <text
              key={`${i}-${text}`}
              className="chart-axis-text"
              x={xAt(i)}
              y={height - 8}
              textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
            >
              {text}
            </text>
          ))}

          <path className="chart-area" d={areaPath} />
          <path
            key={`${label}-${n}-${pathLen}`}
            className="chart-line animate"
            d={linePath}
            style={{ ['--len' as string]: pathLen }}
          />

          {/* End marker with a surface ring so it stays legible */}
          <circle className="chart-end-dot" cx={xAt(n - 1)} cy={yAt(prices[n - 1])} r={4} />

          {/* Crosshair snaps to the nearest date */}
          {active !== null && (
            <g>
              <line
                className="chart-crosshair"
                x1={xAt(active)}
                x2={xAt(active)}
                y1={PAD.top}
                y2={PAD.top + innerH}
              />
              <circle
                className="chart-focus-dot"
                cx={xAt(active)}
                cy={yAt(prices[active])}
                r={5}
              />
            </g>
          )}
        </svg>
      )}

      {active !== null && (
        <div
          className="tooltip"
          style={{ left: tooltipX, top: yAt(prices[active]) - 14 }}
        >
          {/* Value leads, label follows */}
          <div className="tooltip-value">
            <span className="tooltip-key" />
            {formatPrice(prices[active], currency)}
          </div>
          <div className="tooltip-label">
            {new Date(`${dates[active]}T00:00:00`).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </div>
        </div>
      )}
    </div>
  )
}
