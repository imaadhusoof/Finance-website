import type { TickerInfo } from '../api'

/**
 * Short landing: hero + a compact teaser that points to the dedicated
 * How-it-works page. The full methodology lives in Method.tsx.
 */
export default function Home({
  universe,
  onBuild,
  onExplore,
  onMethod,
}: {
  universe: TickerInfo[] | null
  onBuild: () => void
  onExplore: () => void
  onMethod: () => void
}) {
  const assetCount = universe?.length ?? null
  const sectorCount = universe
    ? new Set(universe.map((t) => t.sector).filter(Boolean)).size
    : null

  return (
    <div className="anim-in">
      <section className="hero">
        <p className="eyebrow">Portfolio construction, from the ground up</p>
        <h1 className="hero-title">
          A diversified portfolio,
          <br />
          solved rather than guessed.
        </h1>
        <p className="hero-lead">
          Set an amount, a risk appetite, and a time horizon. The engine reads
          five years of daily prices, solves for the mix that earns the most
          return for the risk you'll take, and simulates where it could land.
        </p>
        <div className="hero-actions">
          <button className="btn btn-lg" type="button" onClick={onBuild}>
            Build a portfolio
          </button>
          <button className="btn-ghost btn-lg" type="button" onClick={onExplore}>
            Explore the universe →
          </button>
        </div>
        <p className="hero-meta">
          {assetCount != null ? (
            <>
              Working from a curated universe of <strong>{assetCount}</strong>{' '}
              assets across <strong>{sectorCount}</strong> sectors — equities,
              bonds, and commodities.
            </>
          ) : (
            'Loading the asset universe…'
          )}
        </p>
      </section>

      {/* Compact teaser → full methodology page */}
      <section className="teaser">
        <button type="button" className="teaser-inner" onClick={onMethod}>
          <span className="teaser-step">
            <span className="teaser-num">01</span> Read the data
          </span>
          <span className="teaser-arrow">→</span>
          <span className="teaser-step">
            <span className="teaser-num">02</span> Optimize the mix
          </span>
          <span className="teaser-arrow">→</span>
          <span className="teaser-step">
            <span className="teaser-num">03</span> Project the outcome
          </span>
          <span className="teaser-link">How it works →</span>
        </button>
      </section>
    </div>
  )
}
