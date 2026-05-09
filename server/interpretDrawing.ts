import { AzureOpenAI } from 'openai'

export interface DrawingInterpretation {
  description: string
  domain: 'music' | 'video' | 'book' | 'place' | 'product' | 'web'
  searchQuery: string
  title: string
  attributes: Record<string, string | number>
}

// The user may paste the full Azure URL (with path + query) or just the base.
// AzureOpenAI needs only: https://<resource>.cognitiveservices.azure.com/
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

const VISION_PROMPT = `Describe this hand-drawn sketch on a dark canvas in 2-3 sentences.
Cover: the main subject, any text or recognizable symbols, and what the user is likely
trying to find or communicate. Be specific and confident. Output only the description.`

const INTENT_PROMPT = `From this drawing description, extract a search intent.

Respond with ONLY valid JSON in this exact shape:
{
  "domain": "music" | "video" | "book" | "place" | "product" | "web",
  "searchQuery": "natural language search string",
  "title": "what was drawn (max 5 words)",
  "attributes": {
    "key": "value"
  }
}

Choose the most specific domain. Fill attributes with useful search facets for that
domain — e.g. music: { "instrument": "guitar", "era": "1990s", "mood": "melancholic" };
product: { "category": "sneakers", "color": "red" }; place: { "type": "restaurant", "city": "Paris" }.`

export async function interpretDrawing(imageBase64: string): Promise<DrawingInterpretation> {
  const ai = client()

  // Step 1 — Vision: describe what was drawn
  const visionRes = await ai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${imageBase64}`, detail: 'high' },
          },
          { type: 'text', text: VISION_PROMPT },
        ],
      },
    ],
    max_tokens: 300,
  })
  const description = visionRes.choices[0]?.message?.content?.trim() ?? ''
  if (!description) throw new Error('Azure OpenAI returned empty vision response')

  // Step 2 — Intent: structured search parameters
  const intentRes = await ai.chat.completions.create({
    model: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o',
    messages: [
      { role: 'system', content: 'Respond only with valid JSON, no markdown.' },
      { role: 'user', content: `Drawing: "${description}"\n\n${INTENT_PROMPT}` },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 400,
  })

  let parsed: Record<string, unknown> = {}
  try {
    parsed = JSON.parse(intentRes.choices[0]?.message?.content ?? '{}')
  } catch { /* use defaults */ }

  const VALID_DOMAINS = ['music', 'video', 'book', 'place', 'product', 'web'] as const
  const rawDomain = String(parsed.domain ?? 'web')
  const domain = (VALID_DOMAINS.includes(rawDomain as (typeof VALID_DOMAINS)[number])
    ? rawDomain
    : 'web') as DrawingInterpretation['domain']

  return {
    description,
    domain,
    searchQuery: String(parsed.searchQuery ?? description.slice(0, 140)),
    title: String(parsed.title ?? 'Drawing'),
    attributes: (parsed.attributes as Record<string, string | number>) ?? {},
  }
}
