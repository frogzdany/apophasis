// Server-side search proxy. Routes:
//   POST /api/search/web            — fan-out across Brave + Tavily + Exa
//   POST /api/search/books          — Google Books API v1 (volumes.list)
//   POST /api/search/places         — SerpApi engine=google_maps
//   POST /api/search/products       — Brave Image Search (drives the morph;
//                                     not a true shopping API)
//   POST /api/search/video          — YouTube Data API (search.list)
//   POST /api/search/places_google  — Google Places API (New) Text Search
//   POST /api/search/places_nearby  — Google Places API (New) Nearby Search
//   POST /api/search/place_details  — Google Places API (New) Place Details
//
// All upstreams have their keys server-side only; browser providers in
// src/lib/search/providers/ call this proxy. Cached for 10 minutes via
// searchCache.ts and rate-limited per-IP via searchRateLimit.ts.

import { cacheGet, cacheKey, cacheSet } from './searchCache'

// ─── Types shared with browser adapters ───────────────────────────────
export type NormalisedKind = 'web' | 'book' | 'place' | 'product' | 'video'

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

// ─── Google Books (volumes.list) ──────────────────────────────────────

interface GoogleBooksVolumeInfo {
  title?: string
  subtitle?: string
  authors?: string[]
  publisher?: string
  publishedDate?: string
  description?: string
  industryIdentifiers?: { type?: string; identifier?: string }[]
  pageCount?: number
  categories?: string[]
  averageRating?: number
  ratingsCount?: number
  language?: string
  imageLinks?: {
    smallThumbnail?: string
    thumbnail?: string
    small?: string
    medium?: string
    large?: string
    extraLarge?: string
  }
  infoLink?: string
  canonicalVolumeLink?: string
  previewLink?: string
}

interface GoogleBooksVolume {
  id?: string
  volumeInfo?: GoogleBooksVolumeInfo
}

interface GoogleBooksResponse {
  totalItems?: number
  items?: GoogleBooksVolume[]
  error?: { message?: string }
}

const BOOKS_DESCRIPTION_MAX = 500

function pickIsbn(
  ids: GoogleBooksVolumeInfo['industryIdentifiers'],
  type: 'ISBN_13' | 'ISBN_10',
): string | undefined {
  if (!ids) return undefined
  for (const id of ids) {
    if (id.type === type && typeof id.identifier === 'string' && id.identifier.length > 0) {
      return id.identifier
    }
  }
  return undefined
}

function bestCover(images: GoogleBooksVolumeInfo['imageLinks']): string | undefined {
  if (!images) return undefined
  // Prefer larger covers when present so the gallery card has something to
  // show; thumbnail is the universal fallback. The API still hands back
  // http:// URLs occasionally — force https for browsers in mixed-content
  // mode.
  const url =
    images.extraLarge ?? images.large ?? images.medium ?? images.small ?? images.thumbnail
  if (!url) return undefined
  return url.startsWith('http://') ? `https://${url.slice('http://'.length)}` : url
}

async function booksSearchGoogleBooks(args: {
  query: string
  max: number
  hl?: string
  key: string
}): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
  const url = new URL('https://www.googleapis.com/books/v1/volumes')
  url.searchParams.set('q', args.query)
  // Books API caps maxResults at 40; we cap at 10 elsewhere already.
  url.searchParams.set('maxResults', String(Math.min(40, args.max)))
  url.searchParams.set('printType', 'books')
  url.searchParams.set('orderBy', 'relevance')
  url.searchParams.set('projection', 'full')
  if (args.hl && args.hl.length > 0) {
    url.searchParams.set('langRestrict', args.hl)
  }
  url.searchParams.set('key', args.key)

  let payload: GoogleBooksResponse
  try {
    // Google Books occasionally takes 8-10s on langRestrict-narrowed
    // queries even when the result set is small. Give it 12s so a single
    // slow call doesn't surface as a zero-results UX bug.
    const res = await withTimeout(fetch(url.toString()), 12_000)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        results: [],
        elapsedMs: Math.round(performance.now() - startedAt),
        error: `Google Books HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      }
    }
    payload = (await res.json()) as GoogleBooksResponse
  } catch (err) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: err instanceof Error ? err.message : String(err),
    }
  }
  if (payload.error?.message) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: payload.error.message,
    }
  }

  const items = payload.items ?? []
  const results: NormalisedResult[] = items.slice(0, args.max).map((v, i) => {
    const info = v.volumeInfo ?? {}
    const facets: Record<string, string | number> = {}
    if (info.authors?.length) facets.authors = info.authors.join(', ')
    if (info.publisher) facets.publisher = info.publisher
    if (info.publishedDate) facets.publishedDate = info.publishedDate
    if (typeof info.pageCount === 'number') facets.pageCount = info.pageCount
    if (info.categories?.length) facets.categories = info.categories.join(', ')
    const isbn13 = pickIsbn(info.industryIdentifiers, 'ISBN_13')
    if (isbn13) facets.isbn13 = isbn13
    const isbn10 = pickIsbn(info.industryIdentifiers, 'ISBN_10')
    if (isbn10) facets.isbn10 = isbn10
    if (typeof info.averageRating === 'number') facets.averageRating = info.averageRating
    if (typeof info.ratingsCount === 'number') facets.ratingsCount = info.ratingsCount
    if (info.language) facets.language = info.language

    const fullTitle = info.subtitle
      ? `${info.title ?? 'Untitled'}: ${info.subtitle}`
      : info.title ?? 'Untitled'
    const description =
      info.description && info.description.length > BOOKS_DESCRIPTION_MAX
        ? `${info.description.slice(0, BOOKS_DESCRIPTION_MAX - 1).trimEnd()}…`
        : info.description

    return {
      source: 'google_books',
      id: `book:${v.id ?? info.canonicalVolumeLink ?? info.infoLink ?? i}`,
      kind: 'book',
      title: fullTitle,
      subtitle: info.authors?.join(', '),
      description,
      url: info.canonicalVolumeLink ?? info.infoLink ?? info.previewLink,
      imageUrl: bestCover(info.imageLinks),
      facets,
      reason: 'Google Books',
    }
  })
  return { results, elapsedMs: Math.round(performance.now() - startedAt) }
}

// SerpApi fallback for /api/search/books. SerpApi removed the dedicated
// `google_books` engine; the Books vertical now lives at engine=google
// with udm=36 (the same id Google's UI uses for the Books filter chip).
// We use this only when Google Books is unconfigured or errors — empty
// result sets do NOT trigger fallback (SerpApi rarely surfaces better
// hits and costs credits).
async function booksSearchSerpApi(args: {
  query: string
  max: number
  hl?: string
}): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
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
      reason: 'Google Books (SerpApi fallback)',
    }
  })
  return { results, elapsedMs: Math.round(performance.now() - startedAt) }
}

// Orchestrates books search: Google Books primary, SerpApi as fallback
// when Google Books is unconfigured or errors. Lucy doesn't need to know
// which path served a given turn; she just calls search_books.
async function booksSearch(args: {
  query: string
  max: number
  hl?: string
}): Promise<SearchProxyResponse> {
  const googleKey = process.env.GOOGLE_BOOKS_API_KEY
  const hasSerp = Boolean(process.env.SERPAPI_KEY)
  if (!googleKey && !hasSerp) {
    return {
      results: [],
      elapsedMs: 0,
      error:
        'No books backend configured (need GOOGLE_BOOKS_API_KEY ' +
        'as primary and/or SERPAPI_KEY as fallback)',
    }
  }
  if (googleKey) {
    const primary = await booksSearchGoogleBooks({ ...args, key: googleKey })
    // Fall back only on actual errors. Empty-but-clean responses mean the
    // query genuinely had no Google Books match; SerpApi is unlikely to
    // do better and costs credits.
    if (!primary.error || !hasSerp) return primary
    console.warn('[search] books: Google Books errored, falling back to SerpApi:', primary.error)
  }
  return booksSearchSerpApi(args)
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

// ─── Brave Image Search ───────────────────────────────────────────────
//
// Powers /api/search/products. We deliberately use the image index — not a
// shopping API — because the gallery's job is to feed the morph animation
// with visually consistent product photos. Prices / stores / ratings are
// not available; tool callers should not promise them.

interface BraveImageResult {
  type?: string
  // The page URL the image was found on. (Not `page_url`, despite what
  // the public docs suggest.)
  url?: string
  title?: string
  source?: string
  page_fetched?: string
  thumbnail?: {
    src?: string
    width?: number
    height?: number
  }
  properties?: {
    url?: string
    placeholder?: string
    width?: number
    height?: number
  }
  meta_url?: {
    scheme?: string
    netloc?: string
    hostname?: string
    favicon?: string
  }
  confidence?: string
}

interface BraveImageResponse {
  results?: BraveImageResult[]
  type?: string
  query?: { original?: string }
}

async function productsSearch(args: {
  query: string
  max: number
  hl?: string
  gl?: string
}): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
  const key = process.env.BRAVE_API_KEY
  if (!key) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: 'BRAVE_API_KEY not configured on server',
    }
  }
  // Default to LATAM defaults when language is es; the morph audience for
  // this demo skews Spanish. Caller can still override via `gl`.
  const country = (args.gl ?? (args.hl === 'es' ? 'MX' : 'US')).toUpperCase()
  const searchLang = args.hl ?? (country === 'MX' ? 'es' : 'en')

  const url = new URL('https://api.search.brave.com/res/v1/images/search')
  url.searchParams.set('q', args.query)
  // Brave caps image results at 200; we cap at 10 for the gallery.
  url.searchParams.set('count', String(Math.min(20, args.max)))
  url.searchParams.set('country', country)
  url.searchParams.set('search_lang', searchLang)
  url.searchParams.set('safesearch', 'strict')

  let payload: BraveImageResponse
  try {
    const res = await withTimeout(
      fetch(url.toString(), {
        headers: {
          'X-Subscription-Token': key,
          Accept: 'application/json',
        },
      }),
      8_000,
    )
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        results: [],
        elapsedMs: Math.round(performance.now() - startedAt),
        error: `Brave Images HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      }
    }
    payload = (await res.json()) as BraveImageResponse
  } catch (err) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: err instanceof Error ? err.message : String(err),
    }
  }

  const items = payload.results ?? []
  const results: NormalisedResult[] = items.slice(0, args.max).map((r, i) => {
    const facets: Record<string, string | number> = {}
    // Width/height live on thumbnail (proxied) AND on properties (original).
    // Use whichever is present; thumbnail is the more reliable source.
    const w = r.thumbnail?.width ?? r.properties?.width
    const h = r.thumbnail?.height ?? r.properties?.height
    if (typeof w === 'number') facets.width = w
    if (typeof h === 'number') facets.height = h
    if (r.properties?.url) facets.originalUrl = r.properties.url
    if (r.meta_url?.hostname) facets.host = r.meta_url.hostname
    return {
      source: 'brave_images',
      id: `product:${r.url ?? i}`,
      kind: 'product',
      title: r.title ?? r.meta_url?.hostname ?? 'Untitled image',
      subtitle: r.source ?? r.meta_url?.hostname,
      // No description on Brave Image results — leave undefined so the
      // gallery card just shows title + host.
      // r.url is the page the image was found on (despite the docs naming
      // it `page_url`). It's the right link for "open the source page".
      url: r.url,
      // thumbnail.src is Brave's proxied 500px-wide CDN image — perfect
      // for the gallery and the morph (no CORS, no broken hosts).
      imageUrl: r.thumbnail?.src ?? r.properties?.url,
      facets,
      reason: 'Brave Images',
    }
  })
  return { results, elapsedMs: Math.round(performance.now() - startedAt) }
}

// ─── YouTube Data API (search.list) ───────────────────────────────────
//
// Powers /api/search/video. The key was previously baked into the Vite
// bundle via VITE_YOUTUBE_API_KEY; that exposed it to every browser.
// Lifting it server-side keeps the key in Secret Manager and lets the
// existing proxy cache + rate limit cover this provider too.

interface YouTubeSearchItem {
  id?: { videoId?: string; kind?: string }
  snippet?: {
    title?: string
    description?: string
    channelTitle?: string
    publishedAt?: string
    thumbnails?: {
      default?: { url?: string }
      medium?: { url?: string }
      high?: { url?: string }
    }
  }
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[]
  error?: { message?: string }
}

async function videoSearch(args: {
  query: string
  max: number
}): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: 'YOUTUBE_API_KEY not configured on server',
    }
  }
  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', String(Math.min(10, args.max)))
  url.searchParams.set('q', args.query)
  url.searchParams.set('key', key)

  let payload: YouTubeSearchResponse
  try {
    const res = await withTimeout(fetch(url.toString()), 8_000)
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        results: [],
        elapsedMs: Math.round(performance.now() - startedAt),
        error: `YouTube HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      }
    }
    payload = (await res.json()) as YouTubeSearchResponse
  } catch (err) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: err instanceof Error ? err.message : String(err),
    }
  }
  if (payload.error?.message) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: payload.error.message,
    }
  }

  const items = payload.items ?? []
  const results: NormalisedResult[] = items
    .map((item, i): NormalisedResult | null => {
      const id = item.id?.videoId
      if (!id) return null
      const sn = item.snippet ?? {}
      const thumb =
        sn.thumbnails?.medium?.url ?? sn.thumbnails?.high?.url ?? sn.thumbnails?.default?.url
      const facets: Record<string, string | number> = {}
      if (sn.publishedAt) facets.published = sn.publishedAt.slice(0, 10)
      if (sn.channelTitle) facets.channel = sn.channelTitle
      facets.videoId = id
      return {
        source: 'youtube',
        id: `video:${id}`,
        kind: 'video',
        title: sn.title ?? 'Untitled video',
        subtitle: sn.channelTitle,
        description: sn.description,
        url: `https://www.youtube.com/watch?v=${id}`,
        imageUrl: thumb,
        facets,
        reason: 'YouTube Data API',
      }
    })
    .filter((r): r is NormalisedResult => r !== null)
    .slice(0, args.max)
  return { results, elapsedMs: Math.round(performance.now() - startedAt) }
}

// ─── Google Places API (New) ──────────────────────────────────────────
//
// One key, three endpoints — Text Search, Nearby Search, Place Details.
// All require a FieldMask header; the SKU billed is the highest tier
// touched by any field requested. Pinning the same conservative mask
// across the three handlers lands them in the "Pro" SKU (rating, hours,
// price level, types) but keeps them out of the "Enterprise" tier.
// https://developers.google.com/maps/documentation/places/web-service/usage-and-billing

const PLACES_BASE = 'https://places.googleapis.com/v1'

const PLACES_TEXT_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.userRatingCount',
  'places.priceLevel',
  'places.types',
  'places.googleMapsUri',
  'places.websiteUri',
  'places.regularOpeningHours.openNow',
].join(',')

// Place Details field paths drop the leading `places.` (single-place response).
const PLACE_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'rating',
  'userRatingCount',
  'priceLevel',
  'types',
  'googleMapsUri',
  'websiteUri',
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'currentOpeningHours.openNow',
  'currentOpeningHours.weekdayDescriptions',
  'regularOpeningHours.weekdayDescriptions',
].join(',')

interface GooglePlace {
  id?: string
  displayName?: { text?: string; languageCode?: string }
  formattedAddress?: string
  location?: { latitude?: number; longitude?: number }
  rating?: number
  userRatingCount?: number
  priceLevel?: string
  types?: string[]
  googleMapsUri?: string
  websiteUri?: string
  internationalPhoneNumber?: string
  nationalPhoneNumber?: string
  regularOpeningHours?: {
    openNow?: boolean
    weekdayDescriptions?: string[]
  }
  currentOpeningHours?: {
    openNow?: boolean
    weekdayDescriptions?: string[]
  }
}

const PRICE_LEVEL_GLYPH: Record<string, string> = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
}

async function googlePlacesFetch(
  path: string,
  fieldMask: string,
  init: { method: 'GET' | 'POST'; body?: Record<string, unknown>; languageCode?: string },
): Promise<unknown> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) throw new Error('GOOGLE_PLACES_API_KEY missing')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': key,
    'X-Goog-FieldMask': fieldMask,
  }
  if (init.languageCode) headers['Accept-Language'] = init.languageCode
  const res = await withTimeout(
    fetch(`${PLACES_BASE}${path}`, {
      method: init.method,
      headers,
      body: init.body ? JSON.stringify(init.body) : undefined,
    }),
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`google-places ${path} ${res.status}: ${text.slice(0, 300)}`)
  }
  return res.json()
}

function adaptGooglePlace(p: GooglePlace, idx: number): NormalisedResult {
  const facets: Record<string, string | number> = {}
  if (typeof p.rating === 'number') facets.rating = `★ ${p.rating.toFixed(1)}`
  if (typeof p.userRatingCount === 'number') facets.reviews = `${p.userRatingCount} reviews`
  const priceGlyph = p.priceLevel ? PRICE_LEVEL_GLYPH[p.priceLevel] : undefined
  if (priceGlyph) facets.price = priceGlyph
  const primaryType = p.types?.[0]
  if (primaryType) facets.type = primaryType
  const openNow = p.regularOpeningHours?.openNow ?? p.currentOpeningHours?.openNow
  if (typeof openNow === 'boolean') facets.open = openNow ? 'open now' : 'closed'

  const id = p.id ?? `${idx}`
  return {
    source: 'google_places',
    id: `gplace:${id}`,
    kind: 'place',
    title: p.displayName?.text ?? 'Untitled place',
    subtitle: p.formattedAddress,
    description: primaryType,
    url: p.websiteUri ?? p.googleMapsUri,
    facets,
    reason: 'Google Places',
  }
}

async function placesGoogleSearch(args: {
  query: string
  max: number
  location?: string
  hl?: string
}): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
  const body: Record<string, unknown> = {
    textQuery: args.location ? `${args.query} in ${args.location}` : args.query,
    pageSize: Math.min(20, args.max),
  }
  if (args.hl) body.languageCode = args.hl
  let payload: { places?: GooglePlace[] }
  try {
    payload = (await googlePlacesFetch('/places:searchText', PLACES_TEXT_FIELD_MASK, {
      method: 'POST',
      body,
      languageCode: args.hl,
    })) as { places?: GooglePlace[] }
  } catch (err) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: err instanceof Error ? err.message : String(err),
    }
  }
  const items = payload.places ?? []
  const results = items.slice(0, args.max).map(adaptGooglePlace)
  return { results, elapsedMs: Math.round(performance.now() - startedAt) }
}

async function placesNearbySearch(args: {
  lat: number
  lng: number
  max: number
  radius: number
  includedTypes?: string[]
  hl?: string
}): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
  const body: Record<string, unknown> = {
    locationRestriction: {
      circle: {
        center: { latitude: args.lat, longitude: args.lng },
        radius: args.radius,
      },
    },
    maxResultCount: Math.min(20, args.max),
  }
  if (args.includedTypes && args.includedTypes.length > 0) {
    body.includedTypes = args.includedTypes
  }
  if (args.hl) body.languageCode = args.hl
  let payload: { places?: GooglePlace[] }
  try {
    payload = (await googlePlacesFetch('/places:searchNearby', PLACES_TEXT_FIELD_MASK, {
      method: 'POST',
      body,
      languageCode: args.hl,
    })) as { places?: GooglePlace[] }
  } catch (err) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: err instanceof Error ? err.message : String(err),
    }
  }
  const items = payload.places ?? []
  const results = items.slice(0, args.max).map(adaptGooglePlace)
  return { results, elapsedMs: Math.round(performance.now() - startedAt) }
}

async function placeDetailsLookup(args: {
  placeId: string
  hl?: string
}): Promise<SearchProxyResponse> {
  const startedAt = performance.now()
  const id = args.placeId.startsWith('places/') ? args.placeId.slice('places/'.length) : args.placeId
  let place: GooglePlace
  try {
    place = (await googlePlacesFetch(
      `/places/${encodeURIComponent(id)}`,
      PLACE_DETAILS_FIELD_MASK,
      { method: 'GET', languageCode: args.hl },
    )) as GooglePlace
  } catch (err) {
    return {
      results: [],
      elapsedMs: Math.round(performance.now() - startedAt),
      error: err instanceof Error ? err.message : String(err),
    }
  }
  // Place Details returns the place object directly, not wrapped in `places`.
  // adaptGooglePlace covers the common fields; we add the details-only ones
  // (phone, weekday hours) on top so callers see them in `facets`.
  const base = adaptGooglePlace(place, 0)
  const facets = { ...(base.facets ?? {}) }
  const phone = place.internationalPhoneNumber ?? place.nationalPhoneNumber
  if (phone) facets.phone = phone
  const weekday =
    place.currentOpeningHours?.weekdayDescriptions ?? place.regularOpeningHours?.weekdayDescriptions
  if (weekday && weekday.length > 0) facets.hours = weekday.join(' · ')
  const result: NormalisedResult = { ...base, facets }
  return { results: [result], elapsedMs: Math.round(performance.now() - startedAt) }
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
  // Google Places (New) extras.
  lat?: number
  lng?: number
  radius_m?: number
  included_types?: unknown
  place_id?: string
}

export interface ProxyOutcome {
  status: number
  body: unknown
}

export async function handleSearchRequest(
  provider: string,
  body: SearchRequestBody,
): Promise<ProxyOutcome> {
  // Coordinate / id-based providers — they don't take a free-text query.
  if (provider === 'places_nearby') return handlePlacesNearby(body)
  if (provider === 'place_details') return handlePlaceDetails(body)

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
      case 'video':
        result = await videoSearch({ query, max })
        break
      case 'places_google':
        result = await placesGoogleSearch({ query, max, location: body.location, hl: body.hl })
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

async function handlePlacesNearby(body: SearchRequestBody): Promise<ProxyOutcome> {
  const lat = Number(body.lat)
  const lng = Number(body.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { status: 400, body: { error: 'lat and lng required' } }
  }
  const max = Math.max(1, Math.min(Number(body.max_results) || 5, 10))
  const radius = Math.max(1, Math.min(Number(body.radius_m) || 1500, 50_000))
  const includedTypes = Array.isArray(body.included_types)
    ? (body.included_types as unknown[]).filter(
        (t): t is string => typeof t === 'string' && t.length > 0,
      )
    : undefined

  const args = { lat, lng, max, radius, includedTypes, hl: body.hl }
  const key = cacheKey('places_nearby', args as unknown as Record<string, unknown>)
  const cached = cacheGet<SearchProxyResponse>(key)
  if (cached) return { status: 200, body: { ...cached, cached: true } }

  let result: SearchProxyResponse
  try {
    result = await placesNearbySearch(args)
  } catch (err) {
    console.error('[search] handler threw', 'places_nearby', err)
    return {
      status: 502,
      body: { error: err instanceof Error ? err.message : String(err), results: [] },
    }
  }
  if (!result.error && result.results.length > 0) cacheSet(key, result)
  return { status: 200, body: result }
}

async function handlePlaceDetails(body: SearchRequestBody): Promise<ProxyOutcome> {
  const placeId = String(body.place_id ?? '').trim()
  if (!placeId) {
    return { status: 400, body: { error: 'place_id required' } }
  }
  const args = { placeId, hl: body.hl }
  const key = cacheKey('place_details', args as unknown as Record<string, unknown>)
  const cached = cacheGet<SearchProxyResponse>(key)
  if (cached) return { status: 200, body: { ...cached, cached: true } }

  let result: SearchProxyResponse
  try {
    result = await placeDetailsLookup(args)
  } catch (err) {
    console.error('[search] handler threw', 'place_details', err)
    return {
      status: 502,
      body: { error: err instanceof Error ? err.message : String(err), results: [] },
    }
  }
  if (!result.error && result.results.length > 0) cacheSet(key, result)
  return { status: 200, body: result }
}
