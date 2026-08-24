import { useEffect, useMemo, useState } from 'react'
import { fetchQuotes, formatDate, formatPrice, type Quote, type TickerInfo } from '../api'
import SectorBars from '../components/SectorBars'

const QUOTE_REFRESH_MS = 60_000

function countBy(items: TickerInfo[], key: (t: TickerInfo) => string | null) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const k = key(item)
    if (!k) continue
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}

export default function Dashboard({
  universe,
  onSelect,
}: {
  universe: TickerInfo[] | null
  onSelect: (ticker: string) => void
}) {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})

  // Live prices land after first paint, then refresh on the server's quote TTL.
  useEffect(() => {
    if (!universe?.length) return
    const symbols = universe.map((t) => t.ticker)
    let cancelled = false

    const load = async () => {
      try {
        const data = await fetchQuotes(symbols)
        if (!cancelled) setQuotes(data)
      } catch {
        /* keep the last good quotes rather than blanking the UI */
      }
    }

    load()
    const id = window.setInterval(load, QUOTE_REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [universe])

  const sectors = useMemo(() => countBy(universe ?? [], (t) => t.sector), [universe])
  const assetTypes = useMemo(
    () => countBy(universe ?? [], (t) => t.quote_type),
    [universe],
  )

  if (!universe) {
    return (
      <div className="center-state">
        <div className="spinner" />
        Loading universe…
      </div>
    )
  }

  const latestDate = universe
    .map((t) => t.last_close_date)
    .filter(Boolean)
    .sort()
    .pop()
  const liveCount = Object.keys(quotes).length

  // Group by asset type so the list reads as a considered catalogue, not a
  // flat grid of clones — funds, then individual equities.
  const order = (t: TickerInfo) => (t.quote_type === 'ETF' ? 0 : 1)
  const rows = [...universe].sort(
    (a, b) => order(a) - order(b) || a.ticker.localeCompare(b.ticker),
  )

  return (
    <div className="anim-in">
      <div className="page-head">
        <p className="section-eyebrow">The universe</p>
        <h1 className="page-title">Every asset the optimizer can choose from</h1>
        <p className="hero-meta" style={{ marginTop: 16 }}>
          <strong>{universe.length}</strong> assets · <strong>{sectors.length}</strong>{' '}
          sectors ·{' '}
          {liveCount ? (
            <>
              <strong>{liveCount}</strong> live <span className="live-dot inline" />
            </>
          ) : (
            'fetching live prices…'
          )}{' '}
          · data through {latestDate ? formatDate(latestDate) : '—'}
        </p>
      </div>

      {/* Editorial asset table — hairline rows, not a grid of boxes. */}
      <div className="asset-table" role="table" aria-label="Asset universe">
        <div className="asset-row asset-head" role="row">
          <span role="columnheader">Asset</span>
          <span role="columnheader">Class</span>
          <span role="columnheader" style={{ textAlign: 'right' }}>
            Price
          </span>
        </div>
        {rows.map((info, i) => {
          const quote = quotes[info.ticker]
          const live = quote !== undefined
          const price = live ? quote.price : info.last_close
          const currency = quote?.currency ?? info.currency
          const cls =
            info.quote_type === 'ETF' ? 'ETF' : info.sector ?? info.quote_type ?? '—'
          return (
            <button
              key={info.ticker}
              type="button"
              className="asset-row anim-up"
              style={{ animationDelay: `${Math.min(i, 16) * 22}ms` }}
              onClick={() => onSelect(info.ticker)}
              role="row"
            >
              <span className="asset-name" role="cell">
                <span className="asset-symbol">{info.ticker}</span>
                <span className="asset-full">{info.name ?? '—'}</span>
              </span>
              <span className="asset-class" role="cell">
                <span className={`chip${info.quote_type === 'ETF' ? ' chip-accent' : ''}`}>
                  {cls}
                </span>
              </span>
              <span className={`asset-price${live ? ' live' : ''}`} role="cell">
                {formatPrice(price, currency)}
                {live && <span className="live-dot" />}
              </span>
            </button>
          )
        })}
      </div>

      {/* One integrated composition section, not two separate boxes. */}
      <section className="section">
        <p className="section-eyebrow">Composition</p>
        <div className="composition">
          <div>
            <h3 className="step-title" style={{ marginBottom: 16 }}>
              By sector
            </h3>
            <SectorBars items={sectors} />
          </div>
          <div>
            <h3 className="step-title" style={{ marginBottom: 16 }}>
              By asset type
            </h3>
            <SectorBars items={assetTypes} />
          </div>
        </div>
      </section>
    </div>
  )
}
