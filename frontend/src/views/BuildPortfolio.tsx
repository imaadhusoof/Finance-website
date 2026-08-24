import { useMemo, useState } from 'react'
import {
  ApiError,
  formatUSD0,
  requestRecommendation,
  type Recommendation,
  type RiskTolerance,
  type TickerInfo,
} from '../api'
import AllocationDonut from '../components/AllocationDonut'
import MonteCarloChart from '../components/MonteCarloChart'

const RISKS: { key: RiskTolerance; label: string; blurb: string }[] = [
  { key: 'conservative', label: 'Conservative', blurb: 'Protect capital; lean on bonds' },
  { key: 'balanced', label: 'Balanced', blurb: 'Growth with a floor under it' },
  { key: 'aggressive', label: 'Aggressive', blurb: 'Reach for return, ride the swings' },
]

function pct(v: number | undefined): string {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

export default function BuildPortfolio({
  universe,
}: {
  universe: TickerInfo[] | null
}) {
  const [amount, setAmount] = useState(25000)
  const [risk, setRisk] = useState<RiskTolerance>('balanced')
  const [horizon, setHorizon] = useState(15)
  const [excluded, setExcluded] = useState<string[]>([])

  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Recommendation | null>(null)
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
      if (err instanceof ApiError) setError(err.detail)
      else setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  const m = result?.metrics
  const median = m?.median_end_value

  return (
    <div className="anim-in">
      <div className="page-head">
        <p className="section-eyebrow">Build</p>
        <h1 className="page-title">Set your constraints</h1>
        <p className="page-sub">
          Three inputs define the problem. The optimizer solves for the rest.
        </p>
      </div>

      <form className="build-form" onSubmit={submit}>
        <div className="form-grid-2">
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
                min={100}
                step={100}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
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
              style={{ marginTop: 14 }}
            />
          </div>
        </div>

        <div className="field-block">
          <span className="field-label">Risk tolerance</span>
          <div className="risk-cards" role="group" aria-label="Risk tolerance">
            {RISKS.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`risk-card${risk === r.key ? ' active' : ''}`}
                aria-pressed={risk === r.key}
                onClick={() => setRisk(r.key)}
              >
                <span className="risk-name">{r.label}</span>
                <span className="risk-blurb">{r.blurb}</span>
              </button>
            ))}
          </div>
        </div>

        {sectors.length > 0 && (
          <div className="field-block">
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
          <button className="btn btn-lg" type="submit" disabled={pending}>
            {pending ? 'Optimizing…' : 'Build portfolio'}
          </button>
        </div>
      </form>

      {error && (
        <div className="callout" style={{ marginTop: 28, borderLeftColor: 'var(--accent)' }}>
          <strong>Couldn't build that portfolio.</strong> {error}
        </div>
      )}

      {result && (
        <div className="result anim-up">
          {/* Headline metric readout — big numbers, no boxes. */}
          <section className="section" style={{ paddingBottom: 30 }}>
            <p className="section-eyebrow">The allocation</p>
            <div className="metric-line">
              <div className="metric">
                <div className="metric-value">{pct(m?.expected_return)}</div>
                <div className="metric-label">Expected annual return</div>
              </div>
              <div className="metric">
                <div className="metric-value">{pct(m?.volatility)}</div>
                <div className="metric-label">Volatility</div>
              </div>
              <div className="metric">
                <div className="metric-value">{m?.sharpe?.toFixed(2) ?? '—'}</div>
                <div className="metric-label">Sharpe ratio</div>
              </div>
            </div>
          </section>

          {/* Monte Carlo projection — the centerpiece. */}
          {result.projection && median != null && (
            <section className="section">
              <p className="section-eyebrow">Projected value over {horizon} years</p>
              <p className="projection-caption">
                Your <strong>{formatUSD0(amount)}</strong> projects to a median of{' '}
                <strong>{formatUSD0(median)}</strong> — most outcomes land between{' '}
                {formatUSD0(m?.p10_end_value ?? null)} and{' '}
                {formatUSD0(m?.p90_end_value ?? null)}.
              </p>
              <MonteCarloChart projection={result.projection} invested={amount} />
              <div className="fan-key">
                <span><span className="key-swatch outer" /> 10–90th percentile</span>
                <span><span className="key-swatch inner" /> 25–75th percentile</span>
                <span><span className="key-swatch line" /> Median path</span>
              </div>
            </section>
          )}

          {/* Allocation breakdown. */}
          <section className="section">
            <p className="section-eyebrow">Holdings</p>
            <AllocationDonut holdings={result.holdings} total={amount} />
          </section>

          {result.notes && (
            <section className="section">
              <p className="section-eyebrow">Notes</p>
              <p className="prose-note">{result.notes}</p>
              {result.skipped.length > 0 && (
                <p className="prose-note muted" style={{ marginTop: 10 }}>
                  Excluded from the estimate for insufficient history: {result.skipped.join(', ')}.
                </p>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  )
}
