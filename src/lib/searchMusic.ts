// Real music search via Apple's free iTunes Search API. No auth, CORS open,
// returns track metadata + 30s preview URLs. We score the raw response
// against the converged query so the top match is meaningful even when
// iTunes returns dozens of unrelated hits.
import { logEvent } from './sessionLogger'

export interface SearchInput {
  fragment?: string
  instrument?: string
  era?: string
  tempo_bpm?: number
  mood?: number
  descriptors?: string[]
}

export interface MusicResult {
  id: string
  title: string
  artist: string
  album?: string
  year?: number
  genre?: string
  previewUrl?: string
  artworkUrl?: string
  externalUrl?: string
  reason?: string
}

interface ITunesTrack {
  trackId: number
  trackName?: string
  artistName?: string
  collectionName?: string
  releaseDate?: string
  primaryGenreName?: string
  previewUrl?: string
  artworkUrl100?: string
  trackViewUrl?: string
}

const ENDPOINT = 'https://itunes.apple.com/search'

// Words that hurt iTunes keyword search when stacked into a query — they
// describe metadata that isn't in any track field.
const STOP_HINTS = new Set([
  'female',
  'male',
  'singer',
  'song',
  'songs',
  'music',
  'track',
  'famous',
  'popular',
  'best',
  'cantante',
  'famosa',
  'famoso',
  'cancion',
  'canción',
])

function strip(words: string): string {
  return words
    .split(/\s+/)
    .filter((w) => w && !STOP_HINTS.has(w.toLowerCase()))
    .join(' ')
    .trim()
}

function buildQuery(input: SearchInput): string {
  const parts: string[] = []

  // Fragment is the strongest signal — let it through almost untouched, only
  // dropping pure-stopword bloat that iTunes can't match.
  if (input.fragment?.trim()) {
    const f = strip(input.fragment.trim())
    if (f) parts.push(f)
  }
  if (input.instrument?.trim()) {
    const i = strip(input.instrument.trim())
    if (i) parts.push(i)
  }
  if (input.descriptors?.length) {
    const d = strip(input.descriptors.join(' '))
    if (d) parts.push(d)
  }
  if (input.era?.trim()) {
    const m = /^(\d{4})s$/i.exec(input.era.trim())
    parts.push(m ? `${m[1]}s` : input.era.trim())
  }
  return parts.join(' ').trim()
}

function eraFromYear(year: number | undefined): string | null {
  if (!year || Number.isNaN(year)) return null
  const decade = Math.floor(year / 10) * 10
  return `${decade}s`
}

function score(track: ITunesTrack, input: SearchInput): number {
  let s = 0
  const text =
    `${track.trackName ?? ''} ${track.artistName ?? ''} ${track.collectionName ?? ''}`.toLowerCase()
  if (input.fragment) {
    const f = input.fragment.toLowerCase().trim()
    if (f && text.includes(f)) s += 6
  }
  if (input.instrument) {
    const inst = input.instrument.toLowerCase()
    if (text.includes(inst) || (track.primaryGenreName ?? '').toLowerCase().includes(inst)) {
      s += 2
    }
  }
  const year = track.releaseDate ? Number(track.releaseDate.slice(0, 4)) : undefined
  if (input.era && year) {
    const era = eraFromYear(year)
    if (era === input.era) s += 3
  }
  // Strong preview availability bonus — useful for the demo loop.
  if (track.previewUrl) s += 0.5
  return s
}

async function fetchTerm(term: string): Promise<ITunesTrack[]> {
  const url = new URL(ENDPOINT)
  url.searchParams.set('term', term)
  url.searchParams.set('entity', 'musicTrack')
  url.searchParams.set('limit', '25')
  url.searchParams.set('media', 'music')
  try {
    const res = await fetch(url.toString())
    if (!res.ok) {
      console.warn('[lucy] iTunes search non-OK', res.status)
      logEvent('searchMusic.error', { status: res.status, term })
      return []
    }
    const payload = (await res.json()) as { results?: ITunesTrack[] }
    return payload.results ?? []
  } catch (e) {
    console.error('[lucy] iTunes fetch failed', e)
    logEvent('searchMusic.error', { error: String(e), term })
    return []
  }
}

export async function searchMusic(input: SearchInput, limit = 5): Promise<MusicResult[]> {
  const startedAt = performance.now()
  const term = buildQuery(input)
  logEvent('searchMusic.request', { input, term, limit })

  if (!term) {
    logEvent('searchMusic.empty', { input, reason: 'no term built' })
    return []
  }

  let tracks = await fetchTerm(term)
  let usedTerm = term

  // Fallback: if the broad query found nothing, retry with just the
  // fragment (or, if no fragment, just the most distinctive token). iTunes
  // can choke when too many keywords are stacked.
  if (tracks.length === 0 && input.fragment?.trim()) {
    const narrow = strip(input.fragment.trim())
    if (narrow && narrow !== term) {
      logEvent('searchMusic.retry', { term, narrow })
      tracks = await fetchTerm(narrow)
      usedTerm = narrow
    }
  }
  const ranked = tracks
    .map((t) => ({ track: t, s: score(t, input) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)

  const results = ranked.map(({ track, s }) => {
    const year = track.releaseDate ? Number(track.releaseDate.slice(0, 4)) : undefined
    const reason = describeMatch(track, input, s)
    return {
      id: String(track.trackId),
      title: track.trackName ?? 'Unknown title',
      artist: track.artistName ?? 'Unknown artist',
      album: track.collectionName,
      year,
      genre: track.primaryGenreName,
      previewUrl: track.previewUrl,
      artworkUrl: track.artworkUrl100?.replace(/100x100/, '300x300'),
      externalUrl: track.trackViewUrl,
      reason,
    }
  })

  const elapsedMs = Math.round(performance.now() - startedAt)
  logEvent('searchMusic.response', {
    term,
    usedTerm,
    elapsedMs,
    rawCount: tracks.length,
    returnedCount: results.length,
    top: results.slice(0, 3).map((r) => ({
      title: r.title,
      artist: r.artist,
      year: r.year,
      genre: r.genre,
      reason: r.reason,
    })),
  })

  return results
}

function describeMatch(track: ITunesTrack, input: SearchInput, s: number): string {
  const bits: string[] = []
  if (input.fragment) {
    const text = `${track.trackName ?? ''} ${track.artistName ?? ''}`.toLowerCase()
    if (text.includes(input.fragment.toLowerCase())) {
      bits.push(`matches "${input.fragment}"`)
    }
  }
  if (input.era && track.releaseDate) {
    const year = Number(track.releaseDate.slice(0, 4))
    const era = eraFromYear(year)
    if (era === input.era) bits.push(`from ${era}`)
  }
  if (input.instrument && track.primaryGenreName) {
    bits.push(`genre: ${track.primaryGenreName}`)
  }
  if (bits.length === 0) {
    bits.push(`score ${s.toFixed(1)}`)
  }
  return bits.join(' · ')
}
