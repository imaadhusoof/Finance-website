import { useMemo, useState } from 'react'
import {
  ApiError,
  formatPrice,
  requestRecommendation,
  type Recommendation,
  type RiskTolerance,
  type TickerInfo,
} from '../api'

const RISKS: { key: RiskTolerance; label: string }[] = [
  { key: 'conservative', label: 'Conservative' },
  { key: 'balanced', label: 'Balanced' },
  { key: 'aggressive', label: 'Aggressive' },
]

export default function BuildPortfolio({
  universe,
}: {
  universe: TickerInfo[] | null
}) {
  const [amount, setAmount] = useState(10000)
  const [risk, setRisk] = useState<RiskTolerance>('balanced')
  const [horizon, setHorizon] = useState(10)
  const [excluded, setExcluded] = useState<string[]>([])

  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Recommendation | null>(null)
  const [notImplemented, setNotImplemented] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sectors = useMemo(() => {
    const set = new Set<string>()
    for (const t of universe ?? []) if (t.sector) set.add(t.sector)
    return [...set].sort()
  }, [universe])

  function toggleSector(sector: string) {
    setExcluded((prev) =>
      prev.includes(sector) ? prev.filter((s) => s !== sector) : [...prev, sector],
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setPending(true)
    setResult(null)
    setNotImplemented(null)
    setError(null)
    try {
      const data = await requestRecommendation({
        amount,
        risk_tolerance: risk,
        horizon_years: horizon,
        tickers: universe?.map((t) => t.ticker) ?? null,
        excluded_sectors: excluded,
      })
      setResult(data)
    } catch (err) {
      if (err instanceof ApiError && err.status === 501) setNotImplemented(err.detail)
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="anim-in">
      <div className="page-head">
        <h1 className="page-title">Build a portfolio</h1>
        <p className="page-sub">
          Set your constraints and the optimizer will propose an allocation across
          the cached universe.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: 16,
        }}
      >
        <form className="card card-pad" onSubmit={submit}>
          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="amount">
                Amount to invest
              </label>
              <div className="input-wrap">
                <span className="input-prefix">$</span>
                <input
                  id="amount"
                  className="input"
                  type="number"
                  // step validation is measured from `min`, so these must stay
                  // commensurate or round default amounts fail validation.
                  min={100}
                  step={100}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>
            </div>

            <div>
              <span className="field-label">Risk tolerance</span>
              <div className="segmented" role="group" aria-label="Risk tolerance">
                {RISKS.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    className={`segment${risk === r.key ? ' active' : ''}`}
                    aria-pressed={risk === r.key}
                    onClick={() => setRisk(r.key)}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="field-label" htmlFor="horizon">
                Time horizon
                <span className="field-hint">
                  {horizon} {horizon === 1 ? 'year' : 'years'}
                </span>
              </label>
              <input
                id="horizon"
                className="slider"
                type="range"
                min={1}
                max={40}
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
              />
            </div>

            {sectors.length > 0 && (
              <div>
                <span className="field-label">
                  Exclude sectors
                  <span className="field-hint">
                    {excluded.length ? `${excluded.length} excluded` : 'none excluded'}
                  </span>
                </span>
                <div className="chip-row">
                  {sectors.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`chip-toggle${excluded.includes(s) ? ' excluded' : ''}`}
                      aria-pressed={excluded.includes(s)}
                      onClick={() => toggleSector(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <button className="btn" type="submit" disabled={pending}>
                {pending ? 'Building…' : 'Build portfolio'}
              </button>
            </div>
          </div>
        </form>

        {notImplemented && (
          <div className="notice anim-up">
            <div className="notice-title">Algorithm not connected yet</div>
            <div className="notice-body">
              The data layer is live and this form is wired up end to end — but the
              recommendation math is intentionally left to you. Implement{' '}
              <code>recommend()</code> in <code>backend/recommendation.py</code> and
              this panel will render your allocation automatically.
              <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12.5 }}>
                Server said: {notImplemented}
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="card card-pad anim-up">
            <strong>Request failed.</strong>
            <div className="page-sub">{error}</div>
          </div>
        )}

        {result && (
          <div className="card card-pad anim-up">
            <div className="card-head">
              <h2 className="card-title">Recommended allocation</h2>
              <span className="card-note">{result.holdings.length} holdings</span>
            </div>

            {Object.keys(result.metrics).length > 0 && (
              <div className="stat-row">
                {Object.entries(result.metrics).map(([key, value]) => (
                  <div className="stat" key={key}>
                    <div className="stat-label">{key}</div>
                    <div className="stat-value">{value}</div>
                  </div>
                ))}
              </div>
            )}

            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Sector</th>
                  <th>Weight</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {result.holdings.map((h) => (
                  <tr key={h.ticker}>
                    <td>
                      <strong>{h.ticker}</strong>
                      {h.name ? ` · ${h.name}` : ''}
                    </td>
                    <td style={{ textAlign: 'left' }}>{h.sector ?? '—'}</td>
                    <td>{(h.weight * 100).toFixed(1)}%</td>
                    <td>{formatPrice(h.amount, 'USD')}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {result.notes && <p className="page-sub">{result.notes}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
