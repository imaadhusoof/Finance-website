/**
 * How it works + methodology. Split out of the landing so the home page stays a
 * short overview; this page carries the full explanation of the approach behind
 * /api/recommend.
 */
export default function Method({ onBuild }: { onBuild: () => void }) {
  return (
    <div className="anim-in">
      <div className="page-head">
        <p className="section-eyebrow">How it works</p>
        <h1 className="page-title">From raw prices to a projected portfolio</h1>
        <p className="page-sub" style={{ maxWidth: 600 }}>
          Three stages turn a curated set of assets and a few constraints into a
          diversified allocation and a range of outcomes.
        </p>
      </div>

      {/* ---- Three steps -------------------------------------------------- */}
      <div className="steps" style={{ marginTop: 8 }}>
        <div className="step">
          <span className="step-num">01</span>
          <h3 className="step-title">Read the data</h3>
          <p className="step-body">
            Five years of daily adjusted closes for every asset, cached locally so
            the math runs on clean, consistent history — not a live scrape
            mid-calculation.
          </p>
        </div>
        <div className="step">
          <span className="step-num">02</span>
          <h3 className="step-title">Optimize the mix</h3>
          <p className="step-body">
            A mean-variance optimizer weighs expected return against risk and
            correlation, tuned to your risk tolerance, to find an efficient
            allocation — no single bet allowed to dominate.
          </p>
        </div>
        <div className="step">
          <span className="step-num">03</span>
          <h3 className="step-title">Project the outcome</h3>
          <p className="step-body">
            A Monte Carlo simulation runs thousands of possible futures for that
            portfolio, showing the range of outcomes over your horizon — not a
            single false-precision number.
          </p>
        </div>
      </div>

      {/* ---- Methodology -------------------------------------------------- */}
      <section className="section prose">
        <p className="section-eyebrow">The method</p>
        <h2 className="prose-h">Why these weights, and not others</h2>

        <p>
          The allocation isn't a set of hand-picked ratios. It's the solution to
          an optimization problem first framed by Harry Markowitz in 1952: among
          every portfolio you could build, find the one with the lowest risk for
          a given expected return. Formally, the engine maximizes{' '}
          <span className="math">wᵀμ − ½·λ·wᵀΣw</span> — expected return, minus a
          penalty on variance — subject to the weights being positive, summing to
          one, and none exceeding a cap.
        </p>

        <h3 className="prose-sub">Risk tolerance is a dial, not a label</h3>
        <p>
          That λ is the risk-aversion dial. A <em>conservative</em> profile sets
          it high, so variance is penalized hard and the optimizer leans toward
          bonds and gold; an <em>aggressive</em> profile sets it low, tolerating
          swings in exchange for reaching further up the efficient frontier. Same
          math, different point on the curve.
        </p>

        <h3 className="prose-sub">Guarding against overconfident inputs</h3>
        <p>
          Naive mean-variance optimization has a famous flaw: it trusts
          historical averages completely, so it piles into whatever happened to
          perform best and calls it optimal. This engine pushes back with{' '}
          <em>shrinkage</em> — pulling each asset's estimated return toward the
          group average and regularizing the covariance matrix — so noisy history
          doesn't masquerade as certainty. The result is more diversified and
          more honest.
        </p>

        <h3 className="prose-sub">A range, not a promise</h3>
        <p>
          Finally, the chosen portfolio is projected forward with a Monte Carlo
          simulation: thousands of randomized return paths, summarized as a fan
          from the pessimistic 10th percentile to the optimistic 90th. It's a
          deliberate rejection of single-number forecasts. Markets aren't
          stationary and the past isn't a guarantee — the spread is the point.
        </p>

        <div className="callout">
          <strong>Not investment advice.</strong> This is a demonstration of
          portfolio-construction technique, built on delayed public data. It
          doesn't know your taxes, your other holdings, or next week.
        </div>
      </section>

      <section className="cta-band">
        <div>
          <h2 className="cta-title">See it on your numbers</h2>
          <p className="cta-sub">
            Pick an amount and a risk level — the allocation and its projection
            build in a moment.
          </p>
        </div>
        <button className="btn btn-lg" type="button" onClick={onBuild}>
          Build a portfolio
        </button>
      </section>
    </div>
  )
}
