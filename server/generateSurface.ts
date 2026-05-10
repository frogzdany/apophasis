// Drawing → A2UI surface generator.
//
// Takes a DrawingInterpretation (from interpretDrawing.ts) and decides
// which existing search provider to surface (search_music / search_places /
// search_video / search_books / search_products / search_web), pre-fills
// the matching A2UI dataModel, and returns a ready-to-mount surface.
//
// Uses `@google/genai` with the same `GEMINI_API_KEY` Lucy already uses
// for the Live session. No new credential, no Azure / OpenAI dep. The
// prebuilt component trees below are static and correct; the model only
// fills the dataModel + decides direct-search vs refine.

import { GoogleGenAI, Type } from '@google/genai'
import type { DrawingInterpretation } from './interpretDrawing'

let aiClient: GoogleGenAI | null = null

function getClient(): GoogleGenAI {
  if (aiClient) return aiClient
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY not set on the server. The drawing pipeline reuses ' +
        'the same key Lucy uses for the Live session — see infra/main.tf.',
    )
  }
  aiClient = new GoogleGenAI({ apiKey })
  return aiClient
}

// ── Pre-built A2UI surface templates, one per search provider ────────────────
// Component trees are static and correct; the model only fills dataModel.

type Component = Record<string, unknown>

function btn(id: string, label: string, event = 'submit'): Component[] {
  return [
    {
      id,
      component: 'Button',
      child: `${id}_lbl`,
      variant: 'primary',
      action: { event: { name: event } },
    },
    { id: `${id}_lbl`, component: 'Text', text: label, variant: 'body' },
  ]
}

function opts(items: string[]) {
  return items.map((v) => ({ label: v, value: v }))
}

const TEMPLATES: Record<
  string,
  { components: Component[]; defaultDataModel: Record<string, unknown> }
> = {
  search_music: {
    components: [
      {
        id: 'root',
        component: 'Column',
        children: ['title', 'fragment', 'mood', 'tempo', 'instruments', 'era', 'submit', 'submit_lbl'],
      },
      { id: 'title', component: 'Text', text: 'Find this song', variant: 'h3' },
      {
        id: 'fragment',
        component: 'TextField',
        label: 'Lyric, title, or artist',
        variant: 'longText',
        value: { path: '/fragment' },
      },
      {
        id: 'mood',
        component: 'Slider',
        label: 'Mood: Melancholy ↔ Triumphant',
        min: -1,
        max: 1,
        step: 0.05,
        value: { path: '/mood' },
      },
      {
        id: 'tempo',
        component: 'Slider',
        label: 'Tempo (bpm)',
        min: 40,
        max: 200,
        step: 1,
        value: { path: '/tempo_bpm' },
      },
      {
        id: 'instruments',
        component: 'ChoicePicker',
        label: 'Stand-out instrument',
        variant: 'mutuallyExclusive',
        options: opts(['Piano', 'Guitar', 'Saxophone', 'Synth', 'Strings', 'Voice', 'Drums']),
        value: { path: '/instrument' },
      },
      {
        id: 'era',
        component: 'ChoicePicker',
        label: 'Era',
        variant: 'mutuallyExclusive',
        options: opts(['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s']),
        value: { path: '/era' },
      },
      ...btn('submit', 'Search for this song', 'search_music'),
    ],
    defaultDataModel: { fragment: '', mood: 0, tempo_bpm: 120, instrument: [], era: [] },
  },

  search_places: {
    components: [
      {
        id: 'root',
        component: 'Column',
        children: ['title', 'query', 'location', 'type_pick', 'submit', 'submit_lbl'],
      },
      { id: 'title', component: 'Text', text: 'Find this place', variant: 'h3' },
      {
        id: 'query',
        component: 'TextField',
        label: 'What are you looking for?',
        variant: 'shortText',
        value: { path: '/query' },
      },
      {
        id: 'location',
        component: 'TextField',
        label: 'City / area (optional)',
        variant: 'shortText',
        value: { path: '/location' },
      },
      {
        id: 'type_pick',
        component: 'ChoicePicker',
        label: 'Type',
        variant: 'mutuallyExclusive',
        options: opts([
          'Restaurant',
          'Café',
          'Museum',
          'Park',
          'Hotel',
          'Shop',
          'Landmark',
          'Other',
        ]),
        value: { path: '/type' },
      },
      ...btn('submit', 'Search for this place', 'search_places'),
    ],
    defaultDataModel: { query: '', location: '', type: [] },
  },

  search_video: {
    components: [
      { id: 'root', component: 'Column', children: ['title', 'query', 'submit', 'submit_lbl'] },
      { id: 'title', component: 'Text', text: 'Find this video', variant: 'h3' },
      {
        id: 'query',
        component: 'TextField',
        label: 'Describe the video',
        variant: 'longText',
        value: { path: '/query' },
      },
      ...btn('submit', 'Search on YouTube', 'search_video'),
    ],
    defaultDataModel: { query: '' },
  },

  search_books: {
    components: [
      {
        id: 'root',
        component: 'Column',
        children: ['title', 'query', 'genre_pick', 'submit', 'submit_lbl'],
      },
      { id: 'title', component: 'Text', text: 'Find this book', variant: 'h3' },
      {
        id: 'query',
        component: 'TextField',
        label: 'Title, author, or topic',
        variant: 'longText',
        value: { path: '/query' },
      },
      {
        id: 'genre_pick',
        component: 'ChoicePicker',
        label: 'Genre',
        variant: 'mutuallyExclusive',
        options: opts([
          'Fiction',
          'Non-fiction',
          'Sci-fi',
          'Fantasy',
          'Mystery',
          'Biography',
          'Science',
          'History',
        ]),
        value: { path: '/genre' },
      },
      ...btn('submit', 'Search for this book', 'search_books'),
    ],
    defaultDataModel: { query: '', genre: [] },
  },

  search_products: {
    components: [
      {
        id: 'root',
        component: 'Column',
        children: ['title', 'query', 'cat_pick', 'submit', 'submit_lbl'],
      },
      { id: 'title', component: 'Text', text: 'Find this product', variant: 'h3' },
      {
        id: 'query',
        component: 'TextField',
        label: 'What product are you looking for?',
        variant: 'longText',
        value: { path: '/query' },
      },
      {
        id: 'cat_pick',
        component: 'ChoicePicker',
        label: 'Category',
        variant: 'mutuallyExclusive',
        options: opts([
          'Electronics',
          'Clothing',
          'Sports',
          'Home',
          'Toys',
          'Beauty',
          'Food',
          'Other',
        ]),
        value: { path: '/category' },
      },
      ...btn('submit', 'Search for this product', 'search_products'),
    ],
    defaultDataModel: { query: '', category: [] },
  },

  search_web: {
    components: [
      { id: 'root', component: 'Column', children: ['title', 'query', 'submit', 'submit_lbl'] },
      { id: 'title', component: 'Text', text: 'Search the web', variant: 'h3' },
      {
        id: 'query',
        component: 'TextField',
        label: 'What are you searching for?',
        variant: 'longText',
        value: { path: '/query' },
      },
      ...btn('submit', 'Search the web', 'search_web'),
    ],
    defaultDataModel: { query: '' },
  },
}

const VALID_PROVIDERS = [
  'search_music',
  'search_places',
  'search_video',
  'search_books',
  'search_products',
  'search_web',
] as const

// ── Decision schema ─────────────────────────────────────────────────────────

const DECISION_PROMPT = `You are a search-intent classifier for a multimodal reverse-search assistant. The user has drawn something on a canvas; another model has already produced the description, domain, and search query you'll receive in the user message.

Your job:
1. Pick the search provider that best matches what was drawn.
2. Pick the strategy: "direct_search" when the drawing identifies something specific enough to search right now (confidence > 0.72); otherwise "refine".
3. Pre-fill the surface dataModel with values extracted from the drawing.

Provider schemas (use the exact keys / value types):
- search_music    → fragment (string), mood (-1 to 1), tempo_bpm (40-200), instrument (string), era (string e.g. "1990s")
- search_places   → query (string), location (string), type (one of: Restaurant, Café, Museum, Park, Hotel, Shop, Landmark, Other)
- search_video    → query (string)
- search_books    → query (string), genre (string)
- search_products → query (string), category (string)
- search_web      → query (string)

For "direct_search", also include directSearchArgs — the exact args to pass to that provider right now. Translate Spanish hints to English in fragment / query fields. For places, set query as specific as possible.`

const DECISION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    strategy: { type: Type.STRING, enum: ['direct_search', 'refine'] },
    provider: { type: Type.STRING, enum: [...VALID_PROVIDERS] as string[] },
    confidence: { type: Type.NUMBER },
    surfaceTitle: { type: Type.STRING },
    surfaceDataModel: { type: Type.OBJECT, properties: {} },
    directSearchArgs: { type: Type.OBJECT, properties: {} },
  },
  required: ['strategy', 'provider', 'confidence', 'surfaceTitle', 'surfaceDataModel'],
} as const

// ── Public interface ─────────────────────────────────────────────────────────

export interface DrawingSurface {
  surfaceId: string
  components: Component[]
  dataModel: Record<string, unknown>
  surfaceTitle: string
  provider: string
  strategy: 'direct_search' | 'refine'
  confidence: number
  directSearchArgs?: Record<string, unknown>
}

export async function generateSurface(interp: DrawingInterpretation): Promise<DrawingSurface> {
  const ai = getClient()
  const model = process.env.DRAWING_MODEL ?? 'gemini-2.5-flash'

  const userMsg = [
    `Title: ${interp.title}`,
    `Domain: ${interp.domain}`,
    `Description: ${interp.description}`,
    `Attributes: ${JSON.stringify(interp.attributes)}`,
    `Suggested query: "${interp.searchQuery}"`,
  ].join('\n')

  const res = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [{ text: `${DECISION_PROMPT}\n\n${userMsg}` }],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: DECISION_SCHEMA,
      maxOutputTokens: 700,
    },
  })

  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(res.text ?? '{}') as Record<string, unknown>
  } catch {
    /* fall back to a generic web search surface */
  }

  const rawProvider = String(parsed.provider ?? 'search_web')
  const provider = (
    VALID_PROVIDERS.includes(rawProvider as (typeof VALID_PROVIDERS)[number])
      ? rawProvider
      : 'search_web'
  ) as string
  const template = TEMPLATES[provider] ?? TEMPLATES.search_web
  const strategy: DrawingSurface['strategy'] =
    parsed.strategy === 'direct_search' ? 'direct_search' : 'refine'
  const confidence = Number(parsed.confidence ?? 0.5)

  // Merge model-filled values onto the template's defaults.
  const surfaceDataModel = {
    ...template.defaultDataModel,
    ...(typeof parsed.surfaceDataModel === 'object' && parsed.surfaceDataModel !== null
      ? (parsed.surfaceDataModel as Record<string, unknown>)
      : {}),
  }

  // Update the surface title inside the component tree (first Text child of root).
  const surfaceTitle = String(parsed.surfaceTitle ?? interp.title ?? 'Search')
  const components = template.components.map((c) => {
    if (c.id === 'title') return { ...c, text: surfaceTitle }
    return c
  })

  const surfaceId = `drawing_${provider.replace('search_', '')}_${Date.now()}`

  return {
    surfaceId,
    components,
    dataModel: surfaceDataModel,
    surfaceTitle,
    provider,
    strategy,
    confidence,
    directSearchArgs:
      strategy === 'direct_search' &&
      typeof parsed.directSearchArgs === 'object' &&
      parsed.directSearchArgs !== null
        ? (parsed.directSearchArgs as Record<string, unknown>)
        : undefined,
  }
}
