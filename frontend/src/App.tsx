import { useEffect, useState } from 'react'
import { fetchUniverse, type TickerInfo } from './api'
import Constellation from './components/Constellation'
import BuildPortfolio from './views/BuildPortfolio'
import Dashboard from './views/Dashboard'
import Home from './views/Home'
import TickerDetail from './views/TickerDetail'

type View =
  | { name: 'home' }
  | { name: 'universe' }
  | { name: 'detail'; ticker: string }
  | { name: 'build' }

const NAV: { key: 'home' | 'universe' | 'build'; label: string }[] = [
  { key: 'home', label: 'Overview' },
  { key: 'universe', label: 'Universe' },
  { key: 'build', label: 'Build' },
]

export default function App() {
  const [view, setView] = useState<View>({ name: 'home' })
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

  // Which top-level nav item is highlighted (detail belongs to Universe).
  const activeNav =
    view.name === 'detail' ? 'universe' : view.name

  // Re-keying the view container replays its entrance animation on navigation.
  const viewKey =
    view.name === 'detail' ? `detail-${view.ticker}` : view.name

  return (
    <div className="app">
      <Constellation />
      <header className="header">
        <div className="shell header-inner">
          <button
            type="button"
            className="brand"
            onClick={() => setView({ name: 'home' })}
          >
            <span className="brand-mark" aria-hidden="true">
              ◆
            </span>
            Portfolio Builder
          </button>
          <nav className="nav">
            {NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`nav-btn${activeNav === item.key ? ' active' : ''}`}
                onClick={() => setView({ name: item.key } as View)}
              >
                {item.label}
              </button>
            ))}
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

          {!error && view.name === 'home' && (
            <Home
              universe={universe}
              onBuild={() => setView({ name: 'build' })}
              onExplore={() => setView({ name: 'universe' })}
            />
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

      <footer className="footer">
        <div className="shell footer-inner">
          <span>
            Built by Imaad Husoof · FastAPI · React · mean-variance optimization
          </span>
          <span className="footer-muted">Delayed data · not investment advice</span>
        </div>
      </footer>
    </div>
  )
}
