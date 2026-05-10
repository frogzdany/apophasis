// Drawing-canvas vision pipeline.
//
// Takes a base64 PNG of the user's sketch and returns a structured
// DrawingInterpretation the surface generator can consume. Uses
// `@google/genai` with the same `GEMINI_API_KEY` Lucy already uses for
// the Live session — no new credential, no Azure / OpenAI dep.
//
// The original Azure OpenAI implementation made two calls (vision then
// intent). Gemini's `responseMimeType: 'application/json'` +
// `responseSchema` lets us collapse them into a single multimodal call,
// which is faster and roughly halves the per-drawing cost. The schema
// constrains the output so JSON.parse never throws on a well-formed
// response.
//
// Model defaults to `gemini-2.5-flash` (fast, multimodal, cheap).
// Override via DRAWING_MODEL env var if you want pro-quality.

import { GoogleGenAI, Type } from '@google/genai'

export interface DrawingInterpretation {
  description: string
  domain: 'music' | 'video' | 'book' | 'place' | 'product' | 'web'
  searchQuery: string
  title: string
  attributes: Record<string, string | number>
}

const VALID_DOMAINS = ['music', 'video', 'book', 'place', 'product', 'web'] as const

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

const PROMPT = `You are a search-intent classifier looking at a hand-drawn sketch on a dark canvas.

Produce a single JSON response with these fields:
- description: 2-3 confident sentences covering the main subject, any text or
  recognizable symbols, and what the user is likely trying to find. Be specific.
- domain: the most specific domain among: music, video, book, place, product, web.
- searchQuery: a natural-language search string ready to feed a search engine.
- title: a short label for what was drawn (max 5 words).
- attributes: useful search facets for that domain. Examples:
  music    → { instrument: "guitar", era: "1990s", mood: "melancholic" }
  product  → { category: "sneakers", color: "red" }
  place    → { type: "restaurant", city: "Paris" }
  Pick the keys that are actually evident from the drawing. Skip anything you'd be guessing.`

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    description: { type: Type.STRING },
    domain: {
      type: Type.STRING,
      enum: [...VALID_DOMAINS] as string[],
    },
    searchQuery: { type: Type.STRING },
    title: { type: Type.STRING },
    attributes: {
      type: Type.OBJECT,
      properties: {},
      // Allow arbitrary string/number keys. Gemini's structured-output
      // mode tolerates `properties: {}` + relies on the model to fill
      // sensible domain-specific facets.
    },
  },
  required: ['description', 'domain', 'searchQuery', 'title', 'attributes'],
} as const

export async function interpretDrawing(imageBase64: string): Promise<DrawingInterpretation> {
  const ai = getClient()
  const model = process.env.DRAWING_MODEL ?? 'gemini-2.5-flash'

  const res = await ai.models.generateContent({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'image/png', data: imageBase64 } },
          { text: PROMPT },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 600,
    },
  })

  const text = res.text?.trim() ?? ''
  if (!text) throw new Error('Gemini returned empty response for drawing')

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(text) as Record<string, unknown>
  } catch (err) {
    throw new Error(`Gemini returned non-JSON drawing response: ${err}`)
  }

  const description = String(parsed.description ?? '').trim()
  if (!description) throw new Error('Gemini omitted the drawing description')

  const rawDomain = String(parsed.domain ?? 'web')
  const domain = (
    VALID_DOMAINS.includes(rawDomain as (typeof VALID_DOMAINS)[number]) ? rawDomain : 'web'
  ) as DrawingInterpretation['domain']

  const attrs = parsed.attributes
  const attributes: Record<string, string | number> = {}
  if (attrs && typeof attrs === 'object') {
    for (const [k, v] of Object.entries(attrs as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number') attributes[k] = v
    }
  }

  return {
    description,
    domain,
    searchQuery: String(parsed.searchQuery ?? description.slice(0, 140)),
    title: String(parsed.title ?? 'Drawing'),
    attributes,
  }
}
