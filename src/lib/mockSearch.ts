// Hand-rolled mock catalogue used until the Spotify proxy lands. Returns
// up to 5 fake matches scored against the converged dataModel.
export interface MockTrack {
  id: string
  title: string
  artist: string
  era: string
  mood: number // -1 melancholy ↔ 1 triumphant
  instruments: string[]
  reason: string
}

const CATALOGUE: MockTrack[] = [
  {
    id: 'baker_st',
    title: 'Baker Street',
    artist: 'Gerry Rafferty',
    era: '1970s',
    mood: 0.1,
    instruments: ['Saxophone', 'Guitar'],
    reason: 'Melancholy verses with a triumphant sax hook — a frequent half-remembered classic.',
  },
  {
    id: 'careless_whisper',
    title: 'Careless Whisper',
    artist: 'George Michael',
    era: '1980s',
    mood: -0.4,
    instruments: ['Saxophone', 'Synth', 'Voice'],
    reason: 'Heavy sax lead, late-night melancholy mood.',
  },
  {
    id: 'mr_jones',
    title: 'Mr. Jones',
    artist: 'Counting Crows',
    era: '1990s',
    mood: 0.5,
    instruments: ['Guitar', 'Voice'],
    reason: 'Late-90s bittersweet pop-rock with a triumphant chorus.',
  },
  {
    id: 'clocks',
    title: 'Clocks',
    artist: 'Coldplay',
    era: '2000s',
    mood: 0.0,
    instruments: ['Piano', 'Synth'],
    reason: 'Driving piano riff, ambivalent emotional tone.',
  },
  {
    id: 'night_call',
    title: 'Nightcall',
    artist: 'Kavinsky',
    era: '2010s',
    mood: -0.3,
    instruments: ['Synth', 'Voice'],
    reason: 'Synth-driven, melancholic, late-night atmosphere.',
  },
  {
    id: 'street_spirit',
    title: 'Street Spirit (Fade Out)',
    artist: 'Radiohead',
    era: '1990s',
    mood: -0.8,
    instruments: ['Guitar', 'Voice'],
    reason: 'Sparse, deeply melancholic 1990s alternative.',
  },
  {
    id: 'so_what',
    title: 'So What',
    artist: 'Miles Davis',
    era: '1950s',
    mood: 0.0,
    instruments: ['Saxophone', 'Piano'],
    reason: 'Cool-jazz sax with a contemplative vibe.',
  },
]

export interface SearchInput {
  mood?: number
  instrument?: string
  era?: string
  tempo_bpm?: number
  descriptors?: string[]
  fragment?: string
}

export function mockSearchMusic(input: SearchInput): MockTrack[] {
  const scored = CATALOGUE.map((track) => {
    let score = 0
    if (typeof input.mood === 'number') {
      score -= Math.abs(track.mood - input.mood) * 2
    }
    if (input.instrument && track.instruments.includes(input.instrument)) {
      score += 2
    }
    if (input.era && track.era === input.era) score += 2
    if (input.fragment) {
      const f = input.fragment.toLowerCase()
      if (track.title.toLowerCase().includes(f) || track.artist.toLowerCase().includes(f)) {
        score += 4
      }
    }
    return { track, score }
  })
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 3).map((s) => s.track)
}
