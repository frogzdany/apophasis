import { AzureOpenAI } from 'openai'
import type { DrawingInterpretation } from './interpretDrawing'

function baseEndpoint(raw: string): string {
  try {
    const u = new URL(raw)
    return `${u.protocol}//${u.hostname}/`
  } catch {
    return raw.replace(/\/$/, '') + '/'
  }
}

function client() {
  return new AzureOpenAI({
    endpoint: baseEndpoint(process.env.AZURE_OPENAI_ENDPOINT ?? ''),
    apiKey: process.env.AZURE_OPENAI_API_KEY ?? '',
    apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview',
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o',
  })
}

// ── Pre-built A2UI surface templates, one per search provider ────────────────
// Component trees are static and correct; GPT-4o only fills the dataModel.

type Component = Record<string, unknown>

function btn(id: string, label: string, event = 'submit'): Component[] {
  return [
    { id, component: 'Button', child: `${id}_lbl`, variant: 'primary', action: { event: { name: event } } },
    { id: `${id}_lbl`, component: 'Text', text: label, variant: 'body' },
  ]
}

function opts(items: string[]) {
  return items.map((v) => ({ label: v, value: v }))
}

const TEMPLATES: Record<string, { components: Component[]; defaultDataModel: Record<string, unknown> }> = {
  search_music: {
    components: [
      { id: 'root', component: 'Column', children: ['title', 'fragment', 'mood', 'tempo', 'instruments', 'era', 'submit', 'submit_lbl'] },
      { id: 'title', component: 'Text', text: 'Find this song', variant: 'h3' },
      { id: 'fragment', component: 'TextField', label: 'Lyric, title, or artist', variant: 'longText', value: { path: '/fragment' } },
      { id: 'mood', component: 'Slider', label: 'Mood: Melancholy ↔ Triumphant', min: -1, max: 1, step: 0.05, value: { path: '/mood' } },
      { id: 'tempo', component: 'Slider', label: 'Tempo (bpm)', min: 40, max: 200, step: 1, value: { path: '/tempo_bpm' } },
      { id: 'instruments', component: 'ChoicePicker', label: 'Stand-out instrument', variant: 'mutuallyExclusive', options: opts(['Piano', 'Guitar', 'Saxophone', 'Synth', 'Strings', 'Voice', 'Drums']), value: { path: '/instrument' } },
      { id: 'era', component: 'ChoicePicker', label: 'Era', variant: 'mutuallyExclusive', options: opts(['1960s', '1970s', '1980s', '1990s', '2000s', '2010s', '2020s']), value: { path: '/era' } },
      ...btn('submit', 'Search for this song', 'search_music'),
    ],
    defaultDataModel: { fragment: '', mood: 0, tempo_bpm: 120, instrument: [], era: [] },
  },

  search_places: {
    components: [
      { id: 'root', component: 'Column', children: ['title', 'query', 'location', 'type_pick', 'submit', 'submit_lbl'] },
      { id: 'title', component: 'Text', text: 'Find this place', variant: 'h3' },
      { id: 'query', component: 'TextField', label: 'What are you looking for?', variant: 'shortText', value: { path: '/query' } },
      { id: 'location', component: 'TextField', label: 'City / area (optional)', variant: 'shortText', value: { path: '/location' } },
      { id: 'type_pick', component: 'ChoicePicker', label: 'Type', variant: 'mutuallyExclusive', options: opts(['Restaurant', 'Café', 'Museum', 'Park', 'Hotel', 'Shop', 'Landmark', 'Other']), value: { path: '/type' } },
      ...btn('submit', 'Search for this place', 'search_places'),
    ],
    defaultDataModel: { query: '', location: '', type: [] },
  },

  search_video: {
    components: [
      { id: 'root', component: 'Column', children: ['title', 'query', 'submit', 'submit_lbl'] },
      { id: 'title', component: 'Text', text: 'Find this video', variant: 'h3' },
      { id: 'query', component: 'TextField', label: 'Describe the video', variant: 'longText', value: { path: '/query' } },
      ...btn('submit', 'Search on YouTube', 'search_video'),
    ],
    defaultDataModel: { query: '' },
  },

  search_books: {
    components: [
      { id: 'root', component: 'Column', children: ['title', 'query', 'genre_pick', 'submit', 'submit_lbl'] },
      { id: 'title', component: 'Text', text: 'Find this book', variant: 'h3' },
      { id: 'query', component: 'TextField', label: 'Title, author, or topic', variant: 'longText', value: { path: '/query' } },
      { id: 'genre_pick', component: 'ChoicePicker', label: 'Genre', variant: 'mutuallyExclusive', options: opts(['Fiction', 'Non-fiction', 'Sci-fi', 'Fantasy', 'Mystery', 'Biography', 'Science', 'History']), value: { path: '/genre' } },
      ...btn('submit', 'Search for this book', 'search_books'),
    ],
    defaultDataModel: { query: '', genre: [] },
  },

  search_products: {
    components: [
      { id: 'root', component: 'Column', children: ['title', 'query', 'cat_pick', 'submit', 'submit_lbl'] },
      { id: 'title', component: 'Text', text: 'Find this product', variant: 'h3' },
      { id: 'query', component: 'TextField', label: 'What product are you looking for?', variant: 'longText', value: { path: '/query' } },
      { id: 'cat_pick', component: 'ChoicePicker', label: 'Category', variant: 'mutuallyExclusive', options: opts(['Electronics', 'Clothing', 'Sports', 'Home', 'Toys', 'Beauty', 'Food', 'Other']), value: { path: '/category' } },
      ...btn('submit', 'Search for this product', 'search_products'),
    ],
    defaultDataModel: { query: '', category: [] },
  },

  search_web: {
    components: [
      { id: 'root', component: 'Column', children: ['title', 'query', 'submit', 'submit_lbl'] },
      { id: 'title', component: 'Text', text: 'Search the web', variant: 'h3' },
      { id: 'query', component: 'TextField', label: 'What are you searching for?', variant: 'longText', value: { path: '/query' } },
      ...btn('submit', 'Search the web', 'search_web'),
    ],
    defaultDataModel: { query: '' },
  },
}

// ── GPT-4o decision schema ───────────────────────────────────────────────────

const DECISION_PROMPT = `You are a search intent classifier for a multimodal reverse-search assistant.
The user has drawn something on a canvas and the drawing has been interpreted. Your job is to:
1. Decide which search provider best matches what was drawn.
2. Decide the strategy: "direct_search" (drawing is specific enough to search right now) or "refine" (need user to confirm/fill in more details).
3. Pre-fill a dataModel for the search surface with values extracted from the drawing.

AVAILABLE SEARCH PROVIDERS:
- search_music    → fragment (string), mood (-1 to 1), tempo_bpm (40-200), instrument (string), era (string like "1990s"), descriptors (string[])
- search_places   → query (string), location (string), type (string: Restaurant|Café|Museum|Park|Hotel|Shop|Landmark|Other)
- search_video    → query (string)
- search_books    → query (string), genre (string)
- search_products → query (string), category (string)
- search_web      → query (string)

STRATEGY RULES:
- Use "direct_search" when the drawing clearly identifies something specific (recognizable artist, song, landmark, movie, book, product). confidence must be > 0.72.
- Use "refine" when the drawing shows a general concept, style, or vibe but lacks a specific match. The surface will let the user confirm or fill in missing details.

For "direct_search", also return directSearchArgs — the exact args to pass to that provider right now.
For search_music directSearchArgs: translate Spanish hints to English; always include fragment.
For search_places directSearchArgs: set query as specific as possible.

Respond ONLY with valid JSON:
{
  "strategy": "direct_search" | "refine",
  "provider": "search_music" | "search_places" | "search_video" | "search_books" | "search_products" | "search_web",
  "confidence": 0.0-1.0,
  "surfaceTitle": "Short title max 5 words",
  "surfaceDataModel": { /* initial values matching provider schema */ },
  "directSearchArgs": { /* only present when strategy==="direct_search" */ }
}`

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
  const ai = client()

  const userMsg = [
    `Title: ${interp.title}`,
    `Domain: ${interp.domain}`,
    `Description: ${interp.description}`,
    `Attributes: ${JSON.stringify(interp.attributes)}`,
    `Suggested query: "${interp.searchQuery}"`,
  ].join('\n')

  const res = await ai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o',
    messages: [
      { role: 'system', content: DECISION_PROMPT },
      { role: 'user', content: userMsg },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 600,
  })

  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(res.choices[0]?.message?.content ?? '{}')
  } catch {
    // Fall back gracefully to a generic web search surface
  }

  const provider = String(parsed.provider ?? 'search_web')
  const template = TEMPLATES[provider] ?? TEMPLATES.search_web
  const strategy = parsed.strategy === 'direct_search' ? 'direct_search' : 'refine'
  const confidence = Number(parsed.confidence ?? 0.5)

  // Merge GPT-4o filled values onto the template's defaults
  const surfaceDataModel = {
    ...template.defaultDataModel,
    ...(typeof parsed.surfaceDataModel === 'object' && parsed.surfaceDataModel !== null
      ? (parsed.surfaceDataModel as Record<string, unknown>)
      : {}),
  }

  // Update the surface title inside the component tree (first Text child of root)
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
