import { type FunctionDeclaration, Type } from '@google/genai'
import { logEvent } from '../../sessionLogger'
import type { SearchProvider, SearchResult } from '../types'

const ENDPOINT = 'https://www.googleapis.com/youtube/v3/search'

interface YTSearchItem {
  id?: { videoId?: string; channelId?: string; playlistId?: string }
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

const declaration: FunctionDeclaration = {
  name: 'search_video',
  description:
    'Search YouTube for videos via the Google Data API. Use when the user is ' +
    'trying to find a video, music video, lecture, tutorial, scene, performance, ' +
    'or anything that lives on YouTube. The "query" field is the most important ' +
    'signal — translate Spanish phrases to English keywords when more idiomatic ' +
    'for the platform.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description:
          'Free text query. Lyric snippets, titles, channel names, descriptive ' +
          'phrases all work.',
      },
      max_results: { type: Type.NUMBER },
    },
    required: ['query'],
  },
}

function adapt(item: YTSearchItem): SearchResult | null {
  const id = item.id?.videoId
  if (!id) return null
  const sn = item.snippet ?? {}
  const thumb =
    sn.thumbnails?.medium?.url ?? sn.thumbnails?.high?.url ?? sn.thumbnails?.default?.url
  return {
    id,
    kind: 'video',
    title: sn.title ?? 'Untitled video',
    subtitle: sn.channelTitle,
    description: sn.description,
    imageUrl: thumb,
    externalUrl: `https://www.youtube.com/watch?v=${id}`,
    preview: { kind: 'iframe', url: `https://www.youtube.com/embed/${id}` },
    facets: {
      ...(sn.publishedAt ? { published: sn.publishedAt.slice(0, 10) } : {}),
    },
    reason: 'matches title/description',
  }
}

export const youtubeProvider: SearchProvider = {
  name: 'search_video',
  kind: 'video',
  declaration,
  async handler(args, limit = 5) {
    const startedAt = performance.now()
    const apiKey = import.meta.env.VITE_YOUTUBE_API_KEY as string | undefined
    if (!apiKey) {
      logEvent('searchVideo.error', { reason: 'missing VITE_YOUTUBE_API_KEY' })
      return []
    }
    const query = String((args.query as string | undefined) ?? '').trim()
    if (!query) {
      logEvent('searchVideo.empty', { reason: 'no query' })
      return []
    }
    const max = Math.max(1, Math.min(Number(args.max_results) || limit, 10))
    const url = new URL(ENDPOINT)
    url.searchParams.set('part', 'snippet')
    url.searchParams.set('type', 'video')
    url.searchParams.set('maxResults', String(max))
    url.searchParams.set('q', query)
    url.searchParams.set('key', apiKey)
    logEvent('searchVideo.request', { query, max })

    try {
      const res = await fetch(url.toString())
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        logEvent('searchVideo.error', { status: res.status, body: body.slice(0, 400) })
        return []
      }
      const payload = (await res.json()) as { items?: YTSearchItem[] }
      const results = (payload.items ?? []).map(adapt).filter((r): r is SearchResult => r !== null)
      logEvent('searchVideo.response', {
        query,
        elapsedMs: Math.round(performance.now() - startedAt),
        rawCount: payload.items?.length ?? 0,
        returnedCount: results.length,
        top: results.slice(0, 3).map((r) => ({ title: r.title, subtitle: r.subtitle })),
      })
      return results
    } catch (e) {
      logEvent('searchVideo.error', { error: String(e), query })
      return []
    }
  },
}
