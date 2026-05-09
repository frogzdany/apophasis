// Tiny shared client for the Bun /api/search/<provider> proxy. Keeps the
// fetch + error handling in one place so each provider file just adapts the
// returned shape into a SearchResult.

import { logEvent } from '../../sessionLogger'

export type ProxyKind = 'web' | 'book' | 'place' | 'product' | 'video'

export interface ProxyResult {
  source: string
  id: string
  kind: ProxyKind
  title: string
  subtitle?: string
  description?: string
  url?: string
  imageUrl?: string
  facets?: Record<string, string | number>
  reason?: string
  score?: number
}

export interface ProxyResponse {
  results: ProxyResult[]
  answer?: string
  elapsedMs?: number
  provenance?: Record<string, number>
  cached?: boolean
  error?: string
}

export interface ProxyRequest {
  // Optional because the coordinate / id-based Google Places routes
  // (places_nearby, place_details) don't take a free-text query.
  query?: string
  max_results?: number
  // Place-only optional hints.
  location?: string
  ll?: string
  hl?: string
  gl?: string
  // Google Places API (New) extras.
  lat?: number
  lng?: number
  radius_m?: number
  included_types?: string[]
  place_id?: string
}

export async function callProxy(provider: string, body: ProxyRequest): Promise<ProxyResponse> {
  const startedAt = performance.now()
  try {
    const res = await fetch(`/api/search/${provider}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      logEvent(`search.${provider}.error`, {
        status: res.status,
        body: errBody.slice(0, 400),
      })
      return { results: [], error: `proxy ${res.status}` }
    }
    const payload = (await res.json()) as ProxyResponse
    logEvent(`search.${provider}.response`, {
      query: body.query,
      elapsedMs: Math.round(performance.now() - startedAt),
      upstreamElapsedMs: payload.elapsedMs,
      cached: payload.cached ?? false,
      count: payload.results?.length ?? 0,
      provenance: payload.provenance,
      hasAnswer: Boolean(payload.answer),
    })
    return payload
  } catch (err) {
    logEvent(`search.${provider}.error`, { error: String(err) })
    return { results: [], error: err instanceof Error ? err.message : String(err) }
  }
}
