/**
 * Typed client for the FastAPI data layer.
 *
 * The backend serves raw prices and metadata only. Anything derived from a
 * price (returns, risk, allocations) comes from /api/recommend, which is the
 * seam for the portfolio algorithm.
 */

export interface TickerInfo {
  ticker: string
  name: string | null
  sector: string | null
  industry: string | null
  quote_type: string | null
  currency: string | null
  last_close: number | null
  last_close_date: string | null
  cached: boolean
}

export interface Quote {
  ticker: string
  price: number
  currency: string | null
  timestamp: string
}

export interface PriceSeries {
  ticker: string
  dates: string[]
  prices: number[]
}

export interface Holding {
  ticker: string
  weight: number
  amount: number | null
  name: string | null
  sector: string | null
}

export interface Recommendation {
  holdings: Holding[]
  metrics: Record<string, number>
  notes: string | null
}

export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive'

export interface PortfolioRequest {
  amount: number
  risk_tolerance: RiskTolerance
  horizon_years: number
  tickers?: string[] | null
  excluded_sectors: string[]
}

export class ApiError extends Error {
  status: number
  detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

async function parseError(res: Response): Promise<never> {
  let detail = `Request failed (${res.status})`
  try {
    const body = await res.json()
    if (body && typeof body.detail === 'string') detail = body.detail
  } catch {
    /* non-JSON error body — keep the default message */
  }
  throw new ApiError(res.status, detail)
}

async function getJSON<T>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) await parseError(res)
  return (await res.json()) as T
}

export async function fetchUniverse(): Promise<TickerInfo[]> {
  const data = await getJSON<{ tickers: TickerInfo[] }>('/api/universe')
  return data.tickers
}

export async function fetchQuotes(
  tickers: string[],
): Promise<Record<string, Quote>> {
  const query = tickers.length ? `?tickers=${encodeURIComponent(tickers.join(','))}` : ''
  const data = await getJSON<{ quotes: Record<string, Quote> }>(`/api/quotes${query}`)
  return data.quotes
}

export function fetchPrices(ticker: string): Promise<PriceSeries> {
  return getJSON<PriceSeries>(`/api/prices/${encodeURIComponent(ticker)}`)
}

export async function requestRecommendation(
  request: PortfolioRequest,
): Promise<Recommendation> {
  const res = await fetch('/api/recommend', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!res.ok) await parseError(res)
  return (await res.json()) as Recommendation
}

// --- formatting helpers ----------------------------------------------------

export function formatPrice(value: number | null, currency?: string | null): string {
  if (value === null || Number.isNaN(value)) return '—'
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  return currency === 'USD' || !currency ? `$${formatted}` : `${formatted} ${currency}`
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
