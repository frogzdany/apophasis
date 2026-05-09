import { type FunctionDeclaration, Type } from '@google/genai'
import { logEvent } from '../../sessionLogger'
import type { SearchProvider, SearchResult } from '../types'
import { callProxy, type ProxyResult } from './proxyClient'

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

function adapt(r: ProxyResult): SearchResult {
  // The server already produces a watch URL; pull the videoId off the
  // facets map so the embed iframe can be reconstructed without parsing.
  const videoId = (r.facets?.videoId as string | undefined) ?? r.id.replace(/^video:/, '')
  return {
    id: r.id,
    kind: 'video',
    title: r.title,
    subtitle: r.subtitle,
    description: r.description,
    imageUrl: r.imageUrl,
    externalUrl: r.url,
    preview: videoId
      ? { kind: 'iframe', url: `https://www.youtube.com/embed/${videoId}` }
      : undefined,
    facets: r.facets ?? {},
    reason: r.reason,
  }
}

export const youtubeProvider: SearchProvider = {
  name: 'search_video',
  kind: 'video',
  declaration,
  async handler(args, limit = 5) {
    const query = String((args.query as string | undefined) ?? '').trim()
    if (!query) {
      logEvent('search.video.empty', { reason: 'no query' })
      return []
    }
    const max = Math.max(1, Math.min(Number(args.max_results) || limit, 10))
    logEvent('search.video.request', { query, max })

    const payload = await callProxy('video', { query, max_results: max })
    return payload.results.map(adapt)
  },
}
