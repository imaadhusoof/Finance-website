import { useEffect, useMemo, useState } from 'react'
import {
  fetchPrices,
  formatDate,
  formatPrice,
  type PriceSeries,
  type TickerInfo,
} from '../api'
import PriceChart from '../components/PriceChart'

const RANGES = [
  { key: '1M', days: 31 },
  { key: '6M', days: 183 },
  { key: '1Y', days: 366 },
  { key: '5Y', days: Infinity },
] as const

type RangeKey = (typeof RANGES)[number]['key']

export default function TickerDetail({
  ticker,
  info,
  onBack,
}: {
  ticker: string
  info?: TickerInfo
  onBack: () => void
}) {
  const [series, setSeries] = useState<PriceSeries | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<RangeKey>('1Y')
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSeries(null)
    setError(null)
    fetchPrices(ticker)
      .then((data) => {
        if (!cancelled) setSeries(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [ticker])

  // Range selection just slices the raw series — no derived figures.
  const view = useMemo(() => {
    if (!series) return null
    const cfg = RANGES.find((r) => r.key === range)!
    if (cfg.days === Infinity) return series
    const last = new Date(`${series.dates[series.dates.length - 1]}T00:00:00`)
    const cutoff = new Date(last)
    cutoff.setDate(cutoff.getDate() - cfg.days)
    const start = series.dates.findIndex(
      (d) => new Date(`${d}T00:00:00`).getTime() >= cutoff.getTime(),
    )
    const from = start < 0 ? 0 : start
    return {
      ...series,
      dates: series.dates.slice(from),
      prices: series.prices.slice(from),
    }
  }, [series, range])

  const currency = info?.currency ?? 'USD'
  const latest = view?.prices[view.prices.length - 1] ?? null

  return (
    <div className="anim-in">
      <button type="button" className="btn btn-ghost" onClick={onBack}>
        ← Back to universe
      </button>

      <div className="detail-head section-gap">
        <div>
          <h1 className="page-title">
            {ticker}
            {info?.quote_type && (
              <span className="chip chip-accent" style={{ marginLeft: 10, verticalAlign: 'middle' }}>
                {info.quote_type}
              </span>
            )}
          </h1>
          <p className="page-sub">{info?.name ?? 'Price history'}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="stat-label">Latest close</div>
          <div className="stat-value">{formatPrice(latest, currency)}</div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="card-head">
          <h2 className="card-title">Adjusted close</h2>
          <div className="range-row">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`range-btn${range === r.key ? ' active' : ''}`}
                onClick={() => setRange(r.key)}
              >
                {r.key}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="center-state">{error}</div>}

        {!error && !view && (
          <div className="center-state">
            <div className="spinner" />
            Loading price history…
          </div>
        )}

        {view && (
          <>
            <PriceChart
              dates={view.dates}
              prices={view.prices}
              currency={currency}
              label={ticker}
            />
            <div className="table-toggle">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowTable((s) => !s)}
                aria-expanded={showTable}
              >
                {showTable ? 'Hide' : 'Show'} data table ({view.dates.length} rows)
              </button>
            </div>
            {showTable && (
              <div className="table-scroll anim-in">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Adjusted close</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.dates
                      .map((d, i) => ({ d, p: view.prices[i] }))
                      .reverse()
                      .map(({ d, p }) => (
                        <tr key={d}>
                          <td>{formatDate(d)}</td>
                          <td>{formatPrice(p, currency)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card card-pad section-gap">
        <div className="card-head">
          <h2 className="card-title">Classification</h2>
          <span className="card-note">from the provider's metadata</span>
        </div>
        <div className="meta-list">
          <div className="meta-item">
            <div className="meta-key">Sector</div>
            <div className="meta-val">{info?.sector ?? '—'}</div>
          </div>
          <div className="meta-item">
            <div className="meta-key">Industry</div>
            <div className="meta-val">{info?.industry ?? '—'}</div>
          </div>
          <div className="meta-item">
            <div className="meta-key">Type</div>
            <div className="meta-val">{info?.quote_type ?? '—'}</div>
          </div>
          <div className="meta-item">
            <div className="meta-key">Currency</div>
            <div className="meta-val">{info?.currency ?? '—'}</div>
          </div>
          <div className="meta-item">
            <div className="meta-key">History</div>
            <div className="meta-val">{series?.dates.length ?? '—'} days</div>
          </div>
          <div className="meta-item">
            <div className="meta-key">First date</div>
            <div className="meta-val">
              {series ? formatDate(series.dates[0]) : '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
