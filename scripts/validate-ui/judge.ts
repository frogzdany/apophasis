// External LLM-as-judge for the soft axes (voice-reply quality, on-topic,
// language correctness). Lives entirely in the test harness — the
// deployed service never imports this file or talks to Anthropic.
//
// The judge sees the artefact for ONE scenario at a time. We deliberately
// keep prompts short and the verdict shape rigid (axes-as-list with
// pass/note) so behaviour stays predictable across SDK versions.

import Anthropic from '@anthropic-ai/sdk'
import type { AxisResult, ScenarioArtefact } from './types'

const DEFAULT_MODEL = process.env.JUDGE_MODEL ?? 'claude-sonnet-4-6'

export const SOFT_AXIS_IDS = [
  'voice_reply_quality',
  'voice_reply_brevity',
  'language_correctness',
  'tool_routing_intent',
] as const

export type SoftAxisId = (typeof SOFT_AXIS_IDS)[number]

export interface JudgeResult {
  axes: AxisResult[]
  // Raw text the model returned. Kept for diagnostics only.
  raw: string
  model: string
}

let client: Anthropic | null = null

function getClient(): Anthropic {
  if (client) return client
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY not set. Add it to .env.local; the judge runs ' +
        'in the test harness only — never deployed.',
    )
  }
  client = new Anthropic({ apiKey })
  return client
}

const SYSTEM_PROMPT = `You are an external grader for a generative-UI voice
agent named Lucy. You will receive (a) a scenario rubric describing what
Lucy was supposed to do, and (b) a captured artefact from a single run:
the user's input, Lucy's spoken reply (transcribed), the tools she fired
with their args, and the final state of any UI surface she rendered.

Score the run along EXACTLY these four soft axes and return STRICT JSON:

{
  "voice_reply_quality":  { "pass": bool, "note": "<= 200 chars" },
  "voice_reply_brevity":  { "pass": bool, "note": "<= 200 chars" },
  "language_correctness": { "pass": bool, "note": "<= 200 chars" },
  "tool_routing_intent":  { "pass": bool, "note": "<= 200 chars" }
}

Axis definitions:
  - voice_reply_quality: did Lucy's spoken reply make sense in context
    and sound natural? "" (silent / no speech) is ACCEPTABLE when the
    scenario calls for tool-only turns. Reject when she negates a
    capability she has (e.g. "I can only speak"), refuses without reason,
    or speaks gibberish.
  - voice_reply_brevity: hard cap is rubric.maxSentences (default 2 short
    sentences). Tool-only turns with empty speech satisfy this trivially.
  - language_correctness: spoken language must match rubric.speakLanguage
    (or scenario language when unset). For Spanish, LATAM / mexicano flavour
    is expected; reject peninsular tics like "vale" / "guay".
  - tool_routing_intent: was the chosen tool the most specific match for
    the user's intent? E.g. song talk → search_music, book talk →
    search_books, places → search_places, video → search_video. UI tools
    (render_surface / update_surface / close_surface) count as correct
    when the rubric says so. Soft check — judge intent, not just name.

Return ONLY the JSON object. No prose, no markdown fences.`

export async function judgeArtefact(artefact: ScenarioArtefact): Promise<JudgeResult> {
  const ai = getClient()
  const userPayload = formatUserPayload(artefact)
  const response = await ai.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPayload }],
  })
  const raw = extractText(response)
  const axes = parseAxes(raw)
  return { axes, raw, model: DEFAULT_MODEL }
}

function extractText(resp: Anthropic.Messages.Message): string {
  const block = resp.content?.[0]
  if (block && block.type === 'text') return block.text
  return ''
}

function formatUserPayload(artefact: ScenarioArtefact): string {
  // Trim oversized arg payloads — components arrays can be huge and the
  // judge only needs the IDs, types, and data model to reason.
  const compactTurns = artefact.turns.map((t) => ({
    index: t.index,
    promptInput: t.promptInput,
    lucyTranscript: t.lucyTranscript,
    toolCalls: t.toolCalls.map((c) => ({ name: c.name, args: compactArgs(c.args) })),
    surface: t.surface,
    elapsedMs: t.elapsedMs,
  }))
  return [
    'SCENARIO RUBRIC:',
    JSON.stringify(artefact.rubric, null, 2),
    '',
    `LANGUAGE: ${artefact.language}`,
    `INPUT MODE: ${artefact.inputMode}`,
    '',
    'CAPTURED TURNS:',
    JSON.stringify(compactTurns, null, 2),
  ].join('\n')
}

// Components and dataModel can balloon. We keep top-level identity but
// strip deeply nested option arrays past the first few entries.
function compactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (k === 'components' && Array.isArray(v)) {
      out[k] = `<${v.length} components — see surface.componentTypes>`
      continue
    }
    out[k] = v
  }
  return out
}

function parseAxes(raw: string): AxisResult[] {
  // Be lenient about stray formatting — try to lift the first JSON object.
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) {
    return SOFT_AXIS_IDS.map((id) => ({
      axisId: id,
      label: humanLabel(id),
      pass: false,
      note: 'judge returned no JSON object',
    }))
  }
  let parsed: Record<string, { pass?: boolean; note?: string }> = {}
  try {
    parsed = JSON.parse(m[0])
  } catch (err) {
    return SOFT_AXIS_IDS.map((id) => ({
      axisId: id,
      label: humanLabel(id),
      pass: false,
      note: `judge JSON parse failed: ${err instanceof Error ? err.message : err}`,
    }))
  }
  return SOFT_AXIS_IDS.map((id) => {
    const entry = parsed[id]
    if (!entry || typeof entry.pass !== 'boolean') {
      return {
        axisId: id,
        label: humanLabel(id),
        pass: false,
        note: 'judge omitted this axis',
      }
    }
    return {
      axisId: id,
      label: humanLabel(id),
      pass: entry.pass,
      note: typeof entry.note === 'string' ? entry.note : '',
    }
  })
}

function humanLabel(axisId: SoftAxisId): string {
  switch (axisId) {
    case 'voice_reply_quality':
      return 'Voice reply on-topic'
    case 'voice_reply_brevity':
      return 'Voice reply brevity'
    case 'language_correctness':
      return 'Language matches scenario'
    case 'tool_routing_intent':
      return 'Tool choice matches intent'
  }
}
