import { useEffect, useState } from 'react'
import iuLogo from './assets/iu-logo.png'
import { fetchUniverse, type TickerInfo } from './api'
import Constellation from './components/Constellation'
import BuildPortfolio from './views/BuildPortfolio'
import Dashboard from './views/Dashboard'
import Home from './views/Home'
import Method from './views/Method'
import TickerDetail from './views/TickerDetail'

type View =
  | { name: 'home' }
  | { name: 'method' }
  | { name: 'universe' }
  | { name: 'detail'; ticker: string }
  | { name: 'build' }

const NAV: { key: 'home' | 'method' | 'universe' | 'build'; label: string }[] = [
  { key: 'home', label: 'Overview' },
  { key: 'method', label: 'How it works' },
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

  // Detail belongs under Universe for nav highlighting.
  const activeNav = view.name === 'detail' ? 'universe' : view.name
  const viewKey = view.name === 'detail' ? `detail-${view.ticker}` : view.name

  return (
    <div className="app">
      <Constellation />
      <header className="header">
        <div className="shell header-inner">
          <button
            type="button"
            className="brand"
            onClick={() => setView({ name: 'home' })}
            aria-label="Imaadh Usoof — Portfolio Builder home"
          >
            <img className="brand-logo" src={iuLogo} alt="" aria-hidden="true" />
            <span className="brand-text">
              <span className="brand-name">Portfolio Builder</span>
              <span className="brand-by">Imaadh Usoof</span>
            </span>
          </button>
          <nav className="nav">
            {NAV.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`nav-link${activeNav === item.key ? ' active' : ''}`}
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
              onMethod={() => setView({ name: 'method' })}
            />
          )}

          {!error && view.name === 'method' && (
            <Method onBuild={() => setView({ name: 'build' })} />
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
            Built by Imaadh Usoof · FastAPI · React · mean-variance optimization
          </span>
          <span className="footer-muted">Delayed data · not investment advice</span>
        </div>
      </footer>
    </div>
  )
}
