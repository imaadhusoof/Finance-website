import { formatPrice, type Quote, type TickerInfo } from '../api'

interface Props {
  info: TickerInfo
  quote?: Quote
  index: number
  onSelect: (ticker: string) => void
}

export default function TickerCard({ info, quote, index, onSelect }: Props) {
  const live = quote !== undefined
  const price = live ? quote.price : info.last_close
  const currency = quote?.currency ?? info.currency
  const kind = info.quote_type === 'ETF' ? 'ETF' : info.sector ?? info.quote_type ?? '—'

  return (
    <button
      type="button"
      className="ticker-card anim-up"
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
      onClick={() => onSelect(info.ticker)}
      aria-label={`View price history for ${info.ticker}`}
    >
      <div className="ticker-top">
        <span className="ticker-symbol">{info.ticker}</span>
        <span className={`chip${info.quote_type === 'ETF' ? ' chip-accent' : ''}`}>
          {kind}
        </span>
      </div>

      <div className="ticker-name">{info.name ?? '—'}</div>

      <div className={`ticker-price${live ? ' live' : ''}`}>
        {formatPrice(price, currency)}
      </div>

      <div className="ticker-meta">
        {live ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className="live-dot" /> Live
          </span>
        ) : info.last_close_date ? (
          `Close · ${info.last_close_date}`
        ) : (
          'Not cached'
        )}
      </div>
    </button>
  )
}
