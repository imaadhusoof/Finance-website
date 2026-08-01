import { useEffect, useState } from 'react'
import { fetchUniverse, type TickerInfo } from './api'
import Constellation from './components/Constellation'
import BuildPortfolio from './views/BuildPortfolio'
import Dashboard from './views/Dashboard'
import TickerDetail from './views/TickerDetail'

type View =
  | { name: 'universe' }
  | { name: 'detail'; ticker: string }
  | { name: 'build' }

export default function App() {
  const [view, setView] = useState<View>({ name: 'universe' })
  const [universe, setUniverse] = useState<TickerInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchUniverse()
      .then((data) => {
        if (!cancelled) setUniverse(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selected =
    view.name === 'detail'
      ? universe?.find((t) => t.ticker === view.ticker)
      : undefined

  // Re-keying the view container replays its entrance animation on navigation.
  const viewKey =
    view.name === 'detail' ? `detail-${view.ticker}` : view.name

  return (
    <div className="app">
      <Constellation />
      <header className="header">
        <div className="shell header-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              ◆
            </span>
            Portfolio Builder
          </div>
          <nav className="nav">
            <button
              type="button"
              className={`nav-btn${view.name !== 'build' ? ' active' : ''}`}
              onClick={() => setView({ name: 'universe' })}
            >
              Universe
            </button>
            <button
              type="button"
              className={`nav-btn${view.name === 'build' ? ' active' : ''}`}
              onClick={() => setView({ name: 'build' })}
            >
              Build portfolio
            </button>
          </nav>
        </div>
      </header>

      <main className="main">
        <div className="shell" key={viewKey}>
          {error && (
            <div className="center-state">
              <strong>Couldn't reach the API.</strong>
              <span>{error}</span>
              <span>Make sure the backend is running on port 8000.</span>
            </div>
          )}

          {!error && view.name === 'universe' && (
            <Dashboard
              universe={universe}
              onSelect={(ticker) => setView({ name: 'detail', ticker })}
            />
          )}

          {!error && view.name === 'detail' && (
            <TickerDetail
              ticker={view.ticker}
              info={selected}
              onBack={() => setView({ name: 'universe' })}
            />
          )}

          {!error && view.name === 'build' && <BuildPortfolio universe={universe} />}
        </div>
      </main>
    </div>
  )
}
