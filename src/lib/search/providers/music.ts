import { type FunctionDeclaration, Type } from '@google/genai'
import { type MusicResult, type SearchInput, searchMusic } from '../../searchMusic'
import type { SearchProvider, SearchResult } from '../types'

const declaration: FunctionDeclaration = {
  name: 'search_music',
  description:
    'Search for songs / tracks via iTunes Search API. Use whenever the user is ' +
    'trying to find a song, album, or artist. The most important field is ' +
    '"fragment" — pack any text the user remembers (lyric snippet, partial title, ' +
    'partial artist name, language hints translated to English). era / instrument ' +
    'are appended; mood / tempo are scoring hints only.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      fragment: {
        type: Type.STRING,
        description:
          'Free text the user remembers. Always translate Spanish hints to ' +
          'English here ("french female singer" not "cantante francesa").',
      },
      instrument: { type: Type.STRING },
      era: { type: Type.STRING, description: 'Decade, e.g. "1990s".' },
      tempo_bpm: { type: Type.NUMBER },
      mood: { type: Type.NUMBER, description: '-1 melancholy ↔ 1 triumphant' },
      descriptors: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
  },
}

function adapt(m: MusicResult): SearchResult {
  return {
    id: m.id,
    kind: 'music',
    title: m.title,
    subtitle: m.artist,
    description: m.album,
    imageUrl: m.artworkUrl,
    externalUrl: m.externalUrl,
    preview: m.previewUrl ? { kind: 'audio', url: m.previewUrl } : undefined,
    facets: {
      ...(m.year ? { year: m.year } : {}),
      ...(m.genre ? { genre: m.genre } : {}),
    },
    reason: m.reason,
  }
}

export const musicProvider: SearchProvider = {
  name: 'search_music',
  kind: 'music',
  declaration,
  async handler(args, limit = 5) {
    const results = await searchMusic(args as SearchInput, limit)
    return results.map(adapt)
  },
}
