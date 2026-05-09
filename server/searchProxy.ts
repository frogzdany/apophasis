// Server-side search proxy. Routes:
//   POST /api/search/web      — fan-out across Brave + Tavily + Exa
//   POST /api/search/books    — SerpApi engine=google_books
//   POST /api/search/places   — SerpApi engine=google_maps
//   POST /api/search/products — SerpApi engine=google_shopping
//
// All upstreams have their keys server-side only; browser providers in
// src/lib/search/providers/ call this proxy. Cached for 10 minutes via
// searchCache.ts and rate-limited per-IP via searchRateLimit.ts.

import { cacheGet, cacheKey, cacheSet } from './searchCache'

// ─── Types shared with browser adapters ───────────────────────────────
export type NormalisedKind = 'web' | 'book' | 'place' | 'product'

export interface NormalisedResult {
  source: string
  id: string
  kind: NormalisedKind
  title: string
  subtitle?: string
  description?: string
  url?: string
  imageUrl?: string
  facets?: Record<string, string | number>
  reason?: string
  score?: number
}

export interface SearchProxyResponse {
  results: NormalisedResult[]
  answer?: string
  elapsedMs: number
  provenance?: Record<string, number>
  cached?: boolean
  error?: string
}

// ─── Provider clients ─────────────────────────────────────────────────

const TIMEOUT_MS = 6_000

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`upstream timeout after ${ms}ms`)), ms)
    p.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

interface BraveResult {
  title?: string
  url?: string
  description?: string
  thumbnail?: { src?: string }
  profile?: { name?: string; long_name?: string }
}

async function braveWeb(query: string, max: number): Promise<NormalisedResult[]> {
  const key = process.env.BRAVE_API_KEY
  if (!key) return []
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(Math.min(20, max)))
  url.searchParams.set('safesearch', 'moderate')
  const res = await withTimeout(
    fetch(url.toString(), {
      headers: {
        'X-Subscription-Token': key,
        Accept: 'application/json',
      },
    }),
  )
  if (!res.ok) {
    console.warn('[search] brave non-OK', res.status)
    return []
  }
  const payload = (await res.json()) as { web?: { results?: BraveResult[] } }
  return (payload.web?.results ?? []).slice(0, max).map((r, i) => ({
    source: 'brave',
    id: `brave:${r.url ?? i}`,
    kind: 'web',
    title: r.title ?? r.url ?? 'Untitled',
    subtitle: r.profile?.long_name ?? r.profile?.name,
    description: r.description,
    url: r.url,
    imageUrl: r.thumbnail?.src,
    reason: 'web · Brave',
  }))
}

interface TavilyResult {
  title?: string
  url?: string
  content?: string
  score?: number
}

interface TavilyResponse {
  answer?: string
  results?: TavilyResult[]
  images?: { url?: string }[]
}

async function tavilyWeb(
  query: string,
  max: number,
): Promise<{ results: NormalisedResult[]; answer?: string }> {
  const key = process.env.TAVILY_API_KEY
  if (!key) return { results: [] }
  const res = await withTimeout(
    fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        query,
        max_results: Math.min(10, max),
        search_depth: 'basic',
        include_answer: true,
      }),
    }),
  )
  if (!res.ok) {
    console.warn('[search] tavily non-OK', res.status)
    return { results: [] }
  }
  const payload = (await res.json()) as TavilyResponse
  const results = (payload.results ?? []).slice(0, max).map((r, i) => ({
    source: 'tavily',
    id: `tavily:${r.url ?? i}`,
    kind: 'web' as const,
    title: r.title ?? r.url ?? 'Untitled',
    description: r.content?.slice(0, 280),
    url: r.url,
    score: r.score,
    reason: 'web · Tavily',
  }))
  // Trim Tavily's free-form answer so Lucy doesn't read a wall of text.
  const answer = payload.answer ? payload.answer.slice(0, 320).trim() : undefined
  return { results, answer }
}

interface ExaResult {
  id?: string
  url?: string
  title?: string
  score?: number
  publishedDate?: string
  author?: string
  text?: string
  summary?: string
  image?: string
}

async function exaWeb(query: string, max: number): Promise<NormalisedResult[]> {
  const key = process.env.EXA_API_KEY
  if (!key) return []
  const res = await withTimeout(
    fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        numResults: Math.min(10, max),
        type: 'auto',
      }),
    }),
  )
  if (!res.ok) {
    console.warn('[search] exa non-OK', res.status)
    return []
  }
  const payload = (await res.json()) as { results?: ExaResult[] }
  return (payload.results ?? []).slice(0, max).map((r, i) => ({
    source: 'exa',
    id: `exa:${r.id ?? r.url ?? i}`,
    kind: 'web',
    title: r.title ?? r.url ?? 'Untitled',
    subtitle: r.author,
    description: r.summary ?? r.text?.slice(0, 280),
    url: r.url,
    imageUrl: r.image,
    score: r.score,
    facets: r.publishedDate ? { published: r.publishedDate.slice(0, 10) } : undefined,
    reason: 'semantic · Exa',
  }))
}

// ─── Web fan-out ──────────────────────────────────────────────────────

function dedupeByUrl(results: NormalisedResult[]): NormalisedResult[] {
  const seen = new Set<string>()
  const out: NormalisedResult[] = []
  for (const r of results) {
    const key = r.url ? r.url.replace(/\/$/, '').toLowerCase() : r.id
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out
}

async function webFanOut(query: string, max: number): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
  const settled = await Promise.allSettled([
    braveWeb(query, max),
    tavilyWeb(query, max),
    exaWeb(query, max),
  ])
  const brave = settled[0].status === 'fulfilled' ? settled[0].value : []
  const tavilyOut =
    settled[1].status === 'fulfilled' ? settled[1].value : { results: [] as NormalisedResult[] }
  const exa = settled[2].status === 'fulfilled' ? settled[2].value : []

  // Interleave Brave/Tavily/Exa to keep the top of the list diverse, then
  // dedupe by URL. Brave first because its index is broadest.
  const merged: NormalisedResult[] = []
  const lanes = [brave, tavilyOut.results, exa]
  for (let i = 0; i < max; i++) {
    for (const lane of lanes) {
      if (lane[i]) merged.push(lane[i])
    }
  }
  const results = dedupeByUrl(merged).slice(0, max)
  return {
    results,
    answer: tavilyOut.answer,
    elapsedMs: Math.round(performance.now() - startedAt),
    provenance: {
      brave: brave.length,
      tavily: tavilyOut.results.length,
      exa: exa.length,
    },
  }
}

// ─── SerpApi (books / places / products) ──────────────────────────────

interface SerpOrganic {
  title?: string
  link?: string
  displayed_link?: string
  snippet?: string
  thumbnail?: string
  favicon?: string
  // udm=36 (books vertical) sometimes carries authors here
  authors?: string[]
  about_this_result?: { source?: { source_info_link?: string; description?: string } }
  // shared
  source?: string
}

interface SerpShopping {
  position?: number
  title?: string
  link?: string
  source?: string
  price?: string
  extracted_price?: number
  rating?: number
  reviews?: number
  thumbnail?: string
  delivery?: string
}

interface SerpLocal {
  position?: number
  title?: string
  place_id?: string
  address?: string
  rating?: number
  reviews?: number
  type?: string
  hours?: string
  phone?: string
  website?: string
  thumbnail?: string
  gps_coordinates?: { latitude?: number; longitude?: number }
}

interface SerpResponse {
  organic_results?: SerpOrganic[]
  shopping_results?: SerpShopping[]
  local_results?: SerpLocal[] | { places?: SerpLocal[] }
  error?: string
}

async function serpapi(
  engine: string,
  params: Record<string, string>,
): Promise<SerpResponse | null> {
  const key = process.env.SERPAPI_KEY
  if (!key) {
    console.warn('[search] SERPAPI_KEY not set; engine', engine, 'will return empty')
    return { error: 'SERPAPI_KEY not configured on server' }
  }
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', engine)
  url.searchParams.set('api_key', key)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v)
  }
  const res = await withTimeout(fetch(url.toString()), 8_000)
  if (!res.ok) {
    console.warn('[search] serpapi non-OK', engine, res.status)
    return { error: `SerpApi HTTP ${res.status}` }
  }
  const payload = (await res.json()) as SerpResponse
  if (payload.error) {
    console.warn('[search] serpapi returned error', engine, payload.error)
  }
  return payload
}

async function booksSearch(args: {
  query: string
  max: number
  hl?: string
}): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
  // SerpApi removed the dedicated `google_books` engine; the current Google
  // Books vertical lives at engine=google with udm=36 (the same id Google's
  // own UI uses for the Books filter chip).
  const payload = await serpapi('google', {
    q: args.query,
    udm: '36',
    num: String(Math.min(20, args.max)),
    hl: args.hl ?? 'en',
  })
  if (payload?.error) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: payload.error,
    }
  }
  const items = payload?.organic_results ?? []
  const results: NormalisedResult[] = items.slice(0, args.max).map((r, i) => {
    const facets: Record<string, string | number> = {}
    if (r.authors?.length) facets.authors = r.authors.join(', ')
    if (r.displayed_link) facets.source = r.displayed_link
    return {
      source: 'serpapi',
      id: `book:${r.link ?? i}`,
      kind: 'book',
      title: r.title ?? 'Untitled',
      subtitle: r.authors?.join(', ') ?? r.displayed_link,
      description: r.snippet ?? r.about_this_result?.source?.description,
      url: r.link,
      imageUrl: r.thumbnail ?? r.favicon,
      facets,
      reason: 'Google Books',
    }
  })
  return { results, elapsedMs: Math.round(performance.now() - startedAt) }
}

async function placesSearch(args: {
  query: string
  max: number
  location?: string
  ll?: string
  hl?: string
}): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
  // google_maps requires a `z` (zoom) or `m` (map size) parameter whenever
  // `location` is supplied. Default to a city-level zoom (12) so the user
  // doesn't have to think about it; explicit ll overrides this.
  const needsZoom = Boolean(args.location) && !args.ll
  const payload = await serpapi('google_maps', {
    q: args.query,
    type: 'search',
    hl: args.hl ?? 'en',
    ...(args.location ? { location: args.location } : {}),
    ...(args.ll ? { ll: args.ll } : {}),
    ...(needsZoom ? { z: '12' } : {}),
  })
  if (payload?.error) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: payload.error,
    }
  }
  // local_results can be either an array or an object with `places` depending
  // on whether the underlying engine returned a structured panel.
  const raw = payload?.local_results
  const items: SerpLocal[] = Array.isArray(raw) ? raw : (raw?.places ?? [])
  const results: NormalisedResult[] = items.slice(0, args.max).map((r, i) => {
    const facets: Record<string, string | number> = {}
    if (typeof r.rating === 'number') facets.rating = `★ ${r.rating.toFixed(1)}`
    if (typeof r.reviews === 'number') facets.reviews = `${r.reviews} reviews`
    if (r.type) facets.type = r.type
    if (r.hours) facets.hours = r.hours
    return {
      source: 'serpapi',
      id: `place:${r.place_id ?? r.title ?? i}`,
      kind: 'place',
      title: r.title ?? 'Untitled place',
      subtitle: r.address,
      description: [r.type, r.phone].filter(Boolean).join(' · '),
      url: r.website,
      imageUrl: r.thumbnail,
      facets,
      reason: 'Google Maps',
    }
  })
  return { results, elapsedMs: Math.round(performance.now() - startedAt) }
}

async function productsSearch(args: {
  query: string
  max: number
  hl?: string
  gl?: string
}): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
  const payload = await serpapi('google_shopping', {
    q: args.query,
    num: String(Math.min(20, args.max)),
    hl: args.hl ?? 'en',
    gl: args.gl ?? 'us',
  })
  if (payload?.error) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: payload.error,
    }
  }
  const items = payload?.shopping_results ?? []
  const results: NormalisedResult[] = items.slice(0, args.max).map((r, i) => {
    const facets: Record<string, string | number> = {}
    if (r.price) facets.price = r.price
    if (r.source) facets.store = r.source
    if (typeof r.rating === 'number') facets.rating = `★ ${r.rating.toFixed(1)}`
    if (typeof r.reviews === 'number') facets.reviews = `${r.reviews} reviews`
    if (r.delivery) facets.delivery = r.delivery
    return {
      source: 'serpapi',
      id: `product:${r.link ?? i}`,
      kind: 'product',
      title: r.title ?? 'Untitled product',
      subtitle: r.source,
      description: r.delivery,
      url: r.link,
      imageUrl: r.thumbnail,
      facets,
      reason: 'Google Shopping',
    }
  })
  return { results, elapsedMs: Math.round(performance.now() - startedAt) }
}

// ─── Router ───────────────────────────────────────────────────────────

interface SearchRequestBody {
  query?: string
  max_results?: number
  // Place-only optional hints.
  location?: string
  ll?: string
  hl?: string
  gl?: string
}

export interface ProxyOutcome {
  status: number
  body: unknown
}

export async function handleSearchRequest(
  provider: string,
  body: SearchRequestBody,
): Promise<ProxyOutcome> {
  const query = String(body.query ?? '').trim()
  if (!query) {
    return { status: 400, body: { error: 'query required' } }
  }
  const max = Math.max(1, Math.min(Number(body.max_results) || 5, 10))

  const args = { query, max, location: body.location, ll: body.ll, hl: body.hl, gl: body.gl }
  const key = cacheKey(provider, args as unknown as Record<string, unknown>)
  const cached = cacheGet<SearchProxyResponse>(key)
  if (cached) {
    return { status: 200, body: { ...cached, cached: true } }
  }

  let result: SearchProxyResponse
  try {
    switch (provider) {
      case 'web':
        result = await webFanOut(query, max)
        break
      case 'books':
        result = await booksSearch({ query, max, hl: body.hl })
        break
      case 'places':
        result = await placesSearch({
          query,
          max,
          location: body.location,
          ll: body.ll,
          hl: body.hl,
        })
        break
      case 'products':
        result = await productsSearch({ query, max, hl: body.hl, gl: body.gl })
        break
      default:
        return { status: 404, body: { error: `unknown provider: ${provider}` } }
    }
  } catch (err) {
    console.error('[search] handler threw', provider, err)
    return {
      status: 502,
      body: { error: err instanceof Error ? err.message : String(err), results: [] },
    }
  }

  // Only cache successful, non-empty responses. Errors and empty payloads
  // would otherwise stick around for the full TTL.
  if (!result.error && result.results.length > 0) {
    cacheSet(key, result)
  }
  return { status: 200, body: result }
}
