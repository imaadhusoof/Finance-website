import { useEffect, useMemo, useState } from 'react'
import { fetchQuotes, formatDate, type Quote, type TickerInfo } from '../api'
import SectorBars from '../components/SectorBars'
import TickerCard from '../components/TickerCard'

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
  const [refreshing, setRefreshing] = useState(false)

  // Live prices land after first paint, then refresh on the server's quote TTL.
  useEffect(() => {
    if (!universe?.length) return
    const symbols = universe.map((t) => t.ticker)
    let cancelled = false

    const load = async () => {
      setRefreshing(true)
      try {
        const data = await fetchQuotes(symbols)
        if (!cancelled) setQuotes(data)
      } catch {
        /* keep the last good quotes rather than blanking the UI */
      } finally {
        if (!cancelled) setRefreshing(false)
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

  const unclassified = universe.filter((t) => !t.sector).length
  const latestDate = universe
    .map((t) => t.last_close_date)
    .filter(Boolean)
    .sort()
    .pop()
  const liveCount = Object.keys(quotes).length

  return (
    <div className="anim-in">
      <div className="page-head">
        <h1 className="page-title">Your universe</h1>
        <p className="page-sub">
          Cached price history and classification data for every asset available to
          the portfolio builder. Select any asset to see its full history.
        </p>
      </div>

      <div className="stat-row">
        <div className="stat anim-up">
          <div className="stat-label">Assets tracked</div>
          <div className="stat-value">{universe.length}</div>
        </div>
        <div className="stat anim-up" style={{ animationDelay: '50ms' }}>
          <div className="stat-label">Sectors covered</div>
          <div className="stat-value">{sectors.length}</div>
        </div>
        <div className="stat anim-up" style={{ animationDelay: '100ms' }}>
          <div className="stat-label">Live prices</div>
          <div className="stat-value">{liveCount || '—'}</div>
          <div className="stat-hint">
            {liveCount ? 'refreshes every 60s' : 'fetching…'}
          </div>
        </div>
        <div className="stat anim-up" style={{ animationDelay: '150ms' }}>
          <div className="stat-label">Data through</div>
          <div className="stat-value" style={{ fontSize: 19 }}>
            {latestDate ? formatDate(latestDate) : '—'}
          </div>
        </div>
      </div>

      <div className={refreshing && !liveCount ? 'refreshing' : undefined}>
        <div className="ticker-grid">
          {universe.map((info, i) => (
            <TickerCard
              key={info.ticker}
              info={info}
              quote={quotes[info.ticker]}
              index={i}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>

      <div
        className="section-gap"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        <div className="card card-pad anim-up">
          <div className="card-head">
            <h2 className="card-title">By sector</h2>
            <span className="card-note">{unclassified} unclassified</span>
          </div>
          <SectorBars items={sectors} />
        </div>

        <div className="card card-pad anim-up" style={{ animationDelay: '60ms' }}>
          <div className="card-head">
            <h2 className="card-title">By asset type</h2>
            <span className="card-note">holdings</span>
          </div>
          <SectorBars items={assetTypes} />
        </div>
      </div>
    </div>
  )
}
