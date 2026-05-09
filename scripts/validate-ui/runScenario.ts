// Drives a scripted scenario through LiveSession in TEXT mode and applies
// every Lucy toolCall to a headless A2UI processor — same fan-out as
// useVoiceSession, just without the audio plumbing and React renderer.

import type { FunctionCall } from '@google/genai'
import { LiveSession, type VoiceName } from '@/gemini/liveSession'
import { PROVIDERS_BY_NAME } from '@/lib/search/registry'
import type { Language } from '@/lib/messages'
import {
  type A2uiMessage,
  APOPHASIS_CATALOG_ID,
  createHeadlessProcessor,
} from './headlessProcessor'
import {
  type AssertionFailure,
  assertDataModelKeys,
  assertSurfaceStructure,
} from './assertions'
import { streamTtsToSession } from './ttsBridgeNode'
import type {
  CapturedTurn,
  InputMode,
  ScenarioArtefact,
  ScenarioRubric,
} from './types'

export interface SurfaceExpect {
  surfaceId?: string
  requireSubmitButton?: boolean
  requiredComponents?: string[]
  requiredDataModelKeys?: string[]
}

export interface TurnExpect {
  // Tool names expected during this turn, in order. Extra tool calls are
  // allowed unless `exact: true` is set.
  tools?: string[]
  exact?: boolean
  surface?: SurfaceExpect
}

interface BaseTurn {
  // Optional toolMocks: name → response payload to ack with. Required for
  // search_* tools when searchPolicy === 'strict'.
  toolMocks?: Record<string, unknown>
  expect?: TurnExpect
}

export interface UserTurn extends BaseTurn {
  kind: 'user'
  text: string
}

export interface SubmitTurn extends BaseTurn {
  kind: 'submit'
  // Optional: defaults to whichever surface was rendered or updated on the
  // previous turn. Specify explicitly only when the scenario opens multiple
  // surfaces and needs to disambiguate.
  surfaceId?: string
  eventName?: string
  dataModel?: Record<string, unknown>
}

export type ScenarioTurn = UserTurn | SubmitTurn

export interface Scenario {
  name: string
  language: Language
  voiceName?: VoiceName
  // 'strict' (default): unmocked search tools fail the turn. Prevents the
  // harness from silently billing live SerpApi/Brave during CI.
  // 'live': forwards search tool calls to the real provider handlers.
  searchPolicy?: 'strict' | 'live'
  turns: ScenarioTurn[]
  // Optional rubric for the judge. When absent, the run produces an
  // artefact but the judge has nothing to grade against and is skipped.
  rubric?: ScenarioRubric
}

export interface TurnReport {
  index: number
  user: string
  toolCalls: { name: string; args: Record<string, unknown> }[]
  surface?: {
    surfaceId: string
    componentIds: string[]
    dataModel: Record<string, unknown>
  }
  failures: AssertionFailure[]
}

export interface ScenarioReport {
  name: string
  language: Language
  passed: boolean
  turns: TurnReport[]
  // Captured artefact suitable for the judge. Same data as `turns` but in
  // the shape the judge expects (with transcripts, timings, and component
  // types). Always populated.
  artefact: ScenarioArtefact
}

interface RunOptions {
  apiKey: string
  // Per-turn timeout for waiting on `turnComplete`. Defaults to 30s.
  turnTimeoutMs?: number
  // 'text' (default): drive turns via sendUserText (sendClientContent
  // under the hood). Cheap, fast, doesn't exercise the audio pipeline.
  // 'tts': synthesise the user prompt to audio via Gemini TTS and pump
  // 16 kHz frames into the session, exactly as mic input would. Slower
  // and more expensive but covers VAD + audio decoder.
  inputMode?: InputMode
  // Voice for TTS-mode synthesis. Defaults to Kore.
  ttsVoice?: string
}

// Browser-side helpers we don't ship with the harness. Mirrors what the
// (real) DOM provides so we can compile under Bun.
function nowIso(): string {
  return new Date().toISOString()
}

export async function runScenario(
  scenario: Scenario,
  opts: RunOptions,
): Promise<ScenarioReport> {
  // The Live model rejects responseModalities=[TEXT], so the harness uses
  // the same AUDIO config production uses and simply ignores the audio
  // bytes. Tool calls + outputTranscription + turnComplete fire the same.
  const session = new LiveSession({
    apiKey: opts.apiKey,
    language: scenario.language,
    voiceName: scenario.voiceName ?? 'Aoede',
  })
  const processor = createHeadlessProcessor()
  const searchPolicy = scenario.searchPolicy ?? 'strict'

  // Per-turn buffers, swapped before each user/submit send.
  let collectedToolCalls: { name: string; args: Record<string, unknown> }[] = []
  let lastTouchedSurfaceId: string | null = null
  let currentMocks: Record<string, unknown> = {}
  let turnFailures: AssertionFailure[] = []
  let resolveTurn: (() => void) | null = null
  let rejectTurn: ((err: Error) => void) | null = null
  // Tracks the typed component (Slider / ChoicePicker / etc) per id within
  // the most recently rendered surface. Lets the artefact carry types
  // without re-walking the components array.
  let lastSurfaceComponentTypes: Record<string, string> = {}
  // Accumulates Lucy's spoken reply via outputTranscript events, then
  // gets snapshotted into the artefact at turn close.
  let turnTranscriptBuf = ''

  const handleToolCall = (fc: FunctionCall) => {
    if (!fc?.name || !fc?.id) return
    const args = (fc.args ?? {}) as Record<string, unknown>
    collectedToolCalls.push({ name: fc.name, args })

    try {
      if (fc.name === 'render_surface' || fc.name === 'update_surface') {
        const surfaceId = String(args.surface_id ?? '')
        if (!surfaceId) {
          turnFailures.push({
            rule: 'surface_id',
            detail: `${fc.name} missing surface_id`,
          })
          ackOk(fc, { ok: false })
          return
        }
        lastTouchedSurfaceId = surfaceId

        if (fc.name === 'render_surface') {
          // Run structural assertions BEFORE handing the payload to the
          // processor — schema parsing in addComponent throws on the first
          // bad component and we'd lose the rest of the failure list.
          turnFailures.push(...assertSurfaceStructure(args.components))
          turnFailures.push(
            ...assertDataModelKeys(
              args.components,
              (args.data_model as Record<string, unknown>) ?? {},
            ),
          )
          lastSurfaceComponentTypes = extractComponentTypes(args.components)

          // Drop any prior surface with this id so the second render in a
          // turn doesn't error out on duplicate-id, mirroring useVoiceSession.
          try {
            processor.processMessages([
              { version: 'v0.9', deleteSurface: { surfaceId } },
            ] as unknown as A2uiMessage[])
          } catch {
            /* nothing to delete */
          }
          const messages = [
            {
              version: 'v0.9',
              createSurface: {
                surfaceId,
                catalogId: APOPHASIS_CATALOG_ID,
                sendDataModel: true,
              },
            },
            {
              version: 'v0.9',
              updateComponents: {
                surfaceId,
                components: args.components,
              },
            },
            {
              version: 'v0.9',
              updateDataModel: {
                surfaceId,
                path: '/',
                value: (args.data_model as Record<string, unknown>) ?? {},
              },
            },
          ] as unknown as A2uiMessage[]
          try {
            processor.processMessages(messages)
          } catch (err) {
            turnFailures.push({
              rule: 'processor_apply',
              detail: `processor rejected render_surface: ${
                err instanceof Error ? err.message : String(err)
              }`,
            })
          }
        } else {
          // update_surface — replay components and patch data model.
          const messages: unknown[] = []
          if (args.components) {
            // Re-run structural assertions on any replacement payload.
            turnFailures.push(...assertSurfaceStructure(args.components))
            lastSurfaceComponentTypes = {
              ...lastSurfaceComponentTypes,
              ...extractComponentTypes(args.components),
            }
            messages.push({
              version: 'v0.9',
              updateComponents: { surfaceId, components: args.components },
            })
          }
          const patch = (args.data_model_patch as Record<string, unknown>) ?? null
          if (patch) {
            for (const [path, value] of Object.entries(patch)) {
              messages.push({
                version: 'v0.9',
                updateDataModel: { surfaceId, path, value },
              })
            }
          }
          try {
            processor.processMessages(messages as unknown as A2uiMessage[])
          } catch (err) {
            turnFailures.push({
              rule: 'processor_apply',
              detail: `processor rejected update_surface: ${
                err instanceof Error ? err.message : String(err)
              }`,
            })
          }
        }
        ackOk(fc, { ok: true, surface_id: surfaceId })
        return
      }

      if (fc.name === 'close_surface') {
        const surfaceId = String(args.surface_id ?? '')
        try {
          processor.processMessages([
            { version: 'v0.9', deleteSurface: { surfaceId } },
          ] as unknown as A2uiMessage[])
        } catch {
          /* already gone */
        }
        ackOk(fc, { ok: true, surface_id: surfaceId })
        return
      }

      if (fc.name === 'respond_in_voice') {
        ackOk(fc, { ok: true })
        return
      }

      if (PROVIDERS_BY_NAME[fc.name]) {
        const mock = currentMocks[fc.name]
        if (mock !== undefined) {
          ackOk(fc, mock)
          return
        }
        if (searchPolicy === 'live') {
          const provider = PROVIDERS_BY_NAME[fc.name]
          provider
            .handler(args, 5)
            .then((results) => {
              ackOk(fc, {
                results,
                count: results.length,
                kind: provider.kind,
                summary: results.length
                  ? `${results.length} matches.`
                  : 'No matches for this query.',
              })
            })
            .catch((err) => {
              ackOk(fc, {
                results: [],
                count: 0,
                error: err instanceof Error ? err.message : String(err),
              })
            })
          return
        }
        turnFailures.push({
          rule: 'unmocked_search',
          detail: `${fc.name} called but no mock provided (searchPolicy='strict')`,
        })
        ackOk(fc, {
          results: [],
          count: 0,
          summary: 'No matches for this query.',
        })
        return
      }

      turnFailures.push({
        rule: 'unknown_tool',
        detail: `unknown tool: ${fc.name}`,
      })
      ackOk(fc, { ok: false, error: `unknown tool: ${fc.name}` })
    } catch (err) {
      turnFailures.push({
        rule: 'handler_threw',
        detail: err instanceof Error ? err.message : String(err),
      })
      ackOk(fc, {
        error: { code: 'INVALID_PAYLOAD', message: String(err) },
      })
    }
  }

  function ackOk(fc: FunctionCall, response: unknown): void {
    if (!fc.id || !fc.name) return
    session.sendToolResponse([
      { id: fc.id, name: fc.name, response: response as Record<string, unknown> },
    ])
  }

  session.addEventListener('toolCall', (e) => {
    handleToolCall((e as CustomEvent<FunctionCall>).detail)
  })
  session.addEventListener('outputTranscript', (e) => {
    turnTranscriptBuf += (e as CustomEvent<string>).detail
  })
  session.addEventListener('turnComplete', () => {
    resolveTurn?.()
  })
  session.addEventListener('error', (e) => {
    const detail = (e as CustomEvent).detail
    const msg =
      detail?.message ?? detail?.reason ?? (detail ? JSON.stringify(detail) : 'session error')
    rejectTurn?.(new Error(msg))
  })
  session.addEventListener('close', () => {
    rejectTurn?.(new Error('session closed before turnComplete'))
  })

  const startedAt = nowIso()
  await session.connect()

  const capturedTurns: CapturedTurn[] = []
  const report: Omit<ScenarioReport, 'artefact'> = {
    name: scenario.name,
    language: scenario.language,
    passed: true,
    turns: [],
  }

  try {
    for (let i = 0; i < scenario.turns.length; i++) {
      const turn = scenario.turns[i]
      collectedToolCalls = []
      turnFailures = []
      currentMocks = turn.toolMocks ?? {}
      lastSurfaceComponentTypes = {}
      turnTranscriptBuf = ''
      const turnStart = Date.now()

      let userText: string
      if (turn.kind === 'user') {
        userText = turn.text
      } else {
        const sid = turn.surfaceId ?? lastTouchedSurfaceId
        if (!sid) {
          throw new Error(
            `turn ${i}: submit kind requires surfaceId (no prior surface to default to)`,
          )
        }
        userText = buildSurfaceEventText(
          sid,
          turn.eventName ?? 'submit',
          turn.dataModel,
        )
      }

      const turnPromise = new Promise<void>((resolve, reject) => {
        resolveTurn = resolve
        rejectTurn = reject
      })
      const timeoutMs = opts.turnTimeoutMs ?? 30_000
      const timer = setTimeout(() => {
        rejectTurn?.(new Error(`turn ${i} timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      if (opts.inputMode === 'tts') {
        // Surface-event submissions stay on the text path: they're
        // synthetic markers from our submit handler, not natural-language
        // user prose, and TTS-ing them produces nonsense audio.
        if (turn.kind === 'submit') {
          session.sendUserText(userText)
        } else {
          // Awaits internally — frames pace at ~128 ms per chunk so the
          // server VAD sees a realistic cadence.
          await streamTtsToSession(userText, session, opts.apiKey, opts.ttsVoice)
        }
      } else {
        session.sendUserText(userText)
      }

      try {
        await turnPromise
      } finally {
        clearTimeout(timer)
        resolveTurn = null
        rejectTurn = null
      }

      // Per-turn surface snapshot (uses the surface most recently rendered
      // or updated this turn, falling back to expect.surfaceId).
      const surfaceId =
        turn.expect?.surface?.surfaceId ?? lastTouchedSurfaceId ?? undefined
      let surfaceSnapshot: TurnReport['surface']
      if (surfaceId) {
        const surface = processor.model.getSurface(surfaceId)
        if (surface) {
          const componentIds = Array.from(surface.componentsModel.entries).map(
            ([id]) => id,
          )
          const root = surface.dataModel.get('/')
          surfaceSnapshot = {
            surfaceId,
            componentIds,
            dataModel: isRecord(root) ? root : {},
          }
        }
      }

      // Per-turn expectations.
      if (turn.expect) {
        if (turn.expect.tools) {
          checkToolExpectations(turn.expect, collectedToolCalls, turnFailures)
        }
        if (turn.expect.surface) {
          checkSurfaceExpectations(
            turn.expect.surface,
            surfaceSnapshot,
            turnFailures,
          )
        }
      }

      report.turns.push({
        index: i,
        user: userText,
        toolCalls: collectedToolCalls,
        surface: surfaceSnapshot,
        failures: turnFailures,
      })
      capturedTurns.push({
        index: i,
        promptInput: userText,
        lucyTranscript: turnTranscriptBuf.trim(),
        toolCalls: collectedToolCalls.map((c) => ({ name: c.name, args: c.args })),
        surface: surfaceSnapshot
          ? {
              ...surfaceSnapshot,
              componentTypes: lastSurfaceComponentTypes,
            }
          : undefined,
        failures: turnFailures.map((f) => ({ rule: f.rule, detail: f.detail })),
        elapsedMs: Date.now() - turnStart,
      })
      if (turnFailures.length > 0) report.passed = false
    }
  } finally {
    session.close()
  }

  const artefact: ScenarioArtefact = {
    scenarioId: scenario.name,
    language: scenario.language,
    inputMode: opts.inputMode ?? 'text',
    startedAt,
    finishedAt: nowIso(),
    rubric: scenario.rubric ?? { description: '' },
    turns: capturedTurns,
  }

  return { ...report, artefact }
}

function buildSurfaceEventText(
  surfaceId: string,
  eventName: string,
  dataModel: Record<string, unknown> | undefined,
): string {
  return [
    `[surface_event] surface_id=${surfaceId}`,
    `event=${eventName}`,
    `data_model=${JSON.stringify(dataModel ?? {})}`,
    'Decide whether to refine with a fresh update_surface, call ' +
      'search_music if you have enough info, or respond_in_voice for a ' +
      'brief acknowledgement.',
  ].join('\n')
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Walks the components array and returns a map of id → component type
// (e.g. "Slider", "ChoicePicker"). Used to build the artefact's
// componentTypes map so the judge can reason about structure without
// re-walking the raw payload.
function extractComponentTypes(components: unknown): Record<string, string> {
  if (!Array.isArray(components)) return {}
  const out: Record<string, string> = {}
  for (const c of components) {
    if (!isRecord(c)) continue
    if (typeof c.id !== 'string' || typeof c.component !== 'string') continue
    out[c.id] = c.component
  }
  return out
}

function checkToolExpectations(
  expect: TurnExpect,
  actual: { name: string; args: Record<string, unknown> }[],
  out: AssertionFailure[],
): void {
  const expected = expect.tools ?? []
  const actualNames = actual.map((c) => c.name)
  if (expect.exact) {
    const matches =
      actualNames.length === expected.length &&
      expected.every((n, i) => actualNames[i] === n)
    if (!matches) {
      out.push({
        rule: 'tool_sequence_exact',
        detail: `expected exactly [${expected.join(', ')}], got [${actualNames.join(', ')}]`,
      })
    }
    return
  }
  // Subsequence match: every expected tool must appear in order; extras OK.
  let cursor = 0
  for (const want of expected) {
    const found = actualNames.indexOf(want, cursor)
    if (found === -1) {
      out.push({
        rule: 'tool_sequence',
        detail: `expected "${want}" after position ${cursor}; got [${actualNames.join(', ')}]`,
      })
      return
    }
    cursor = found + 1
  }
}

function checkSurfaceExpectations(
  expect: SurfaceExpect,
  snapshot: TurnReport['surface'] | undefined,
  out: AssertionFailure[],
): void {
  if (!snapshot) {
    out.push({
      rule: 'surface_present',
      detail: `expected a surface${
        expect.surfaceId ? ` "${expect.surfaceId}"` : ''
      } but none was rendered/updated this turn`,
    })
    return
  }
  if (expect.requiredComponents) {
    // Component types are tracked on the model nodes, not the id list — we
    // re-derive from the toolCall args at render-time. For now, fold this
    // into the surface snapshot by checking ids end with a known suffix is
    // not reliable; instead assert presence by id existence + leave type
    // checks to assertSurfaceStructure (which already runs over args).
    // We just check that the expected ids exist on the surface.
    for (const id of expect.requiredComponents) {
      if (!snapshot.componentIds.includes(id)) {
        // Treat the value as either a component id OR a component type
        // marker — when no id matches, we leave the failure to the args-
        // level structural pass.
        out.push({
          rule: 'required_component',
          detail: `surface "${snapshot.surfaceId}" missing component id "${id}"`,
        })
      }
    }
  }
  if (expect.requiredDataModelKeys) {
    for (const key of expect.requiredDataModelKeys) {
      if (!(key in snapshot.dataModel)) {
        out.push({
          rule: 'data_model_key',
          detail: `surface "${snapshot.surfaceId}" data_model missing key "${key}"`,
        })
      }
    }
  }
  if (expect.requireSubmitButton) {
    // The structural assertion already enforces "at least one Button with
    // an action" on every render, so this is a re-check at the surface
    // level — useful when the scenario explicitly cares.
    // No surface-model-level way to re-check action wiring; rely on the
    // earlier structural pass.
  }
}
