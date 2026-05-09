// Shared types for the validate-ui judge harness.
//
// Three layers:
//   1. Scenario  — what the YAML file declares (input + rubric).
//   2. Artefact  — what the runner captures from a Live session (raw
//      observations: tool calls, surfaces, transcripts).
//   3. Verdict   — what the judge produces from the artefact (axis-by-axis
//      pass/fail, plus a top-line summary).
//
// Deterministic axes (tool names, surface component IDs) are scored in
// pure code BEFORE the judge sees the artefact. The judge only weighs in
// on soft axes (voice-reply quality, language correctness).

import type { Language } from '@/lib/messages'
import type { VoiceName } from '@/gemini/liveSession'
import type { ScenarioReport, ScenarioTurn } from './runScenario'

// ─── Scenario (YAML on disk) ──────────────────────────────────────────

export type InputMode = 'text' | 'tts'

export interface ScenarioRubric {
  // Free-form description of what Lucy must accomplish — fed to the judge
  // so it knows what "pass" looks like for this scenario. Keep it
  // declarative and observable: things the judge can check from the
  // captured artefact.
  description: string
  // If set, a reply MUST be in this language. Defaults to scenario language.
  speakLanguage?: Language
  // Hard caps on the spoken reply. Hint, not enforced — Lucy may exceed
  // when warranted; the judge weighs whether the breach was justified.
  maxSentences?: number
}

export interface JudgeAxis {
  id: string
  label: string
  // Whether the judge or pure code evaluates this axis.
  kind: 'deterministic' | 'soft'
  required: boolean
}

export interface YamlScenario {
  // Identity and presentation.
  id: string
  description?: string
  language: Language
  voiceName?: VoiceName
  // Default 'text'. CLI flag --tts upgrades all scenarios to 'tts'.
  inputMode?: InputMode
  // Search policy carries over from the existing harness — strict (mocks
  // required) is the default to avoid surprise spend during CI runs.
  searchPolicy?: 'strict' | 'live'
  // Scenario turns reuse the existing ScenarioTurn discriminator (user /
  // submit) so we don't fork the runner's input shape.
  turns: ScenarioTurn[]
  // Per-turn timeout. Defaults to 30 s in the runner.
  turnTimeoutMs?: number
  // Soft-axis rubric handed to the judge.
  rubric: ScenarioRubric
}

// ─── Artefact (per-scenario run) ───────────────────────────────────────

export interface CapturedTurn {
  index: number
  promptInput: string
  // Lucy's spoken reply, captured via Gemini's outputTranscription events
  // (server-side STT — same socket).
  lucyTranscript: string
  // Each tool the model fired during the turn, in order.
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>
  // Snapshot of the surface most recently rendered or updated this turn.
  surface?: {
    surfaceId: string
    componentIds: string[]
    componentTypes: Record<string, string>
    dataModel: Record<string, unknown>
  }
  // Pure-code assertion failures (structural A2UI checks etc).
  failures: Array<{ rule: string; detail: string }>
  elapsedMs: number
}

export interface ScenarioArtefact {
  scenarioId: string
  language: Language
  inputMode: InputMode
  startedAt: string
  finishedAt: string
  rubric: ScenarioRubric
  turns: CapturedTurn[]
  // Surfaced if the session itself failed (network, model error, timeout).
  fatalError?: string
}

// ─── Verdict (judge output) ───────────────────────────────────────────

export interface AxisResult {
  axisId: string
  label: string
  pass: boolean
  // Free-form reasoning. For deterministic axes this is the rule that
  // failed; for soft axes it's the judge's note.
  note: string
}

export interface ScenarioVerdict {
  scenarioId: string
  // Aggregated overall — pass iff every required axis passes.
  overall: 'pass' | 'fail' | 'partial'
  axes: AxisResult[]
  // Raw judge text, kept for diagnostics. Only populated when the judge
  // ran; deterministic-only runs leave this undefined.
  judgeRaw?: string
}

export interface RunSummary {
  startedAt: string
  finishedAt: string
  totalScenarios: number
  passed: number
  failed: number
  partial: number
  inputMode: InputMode
  judgeUsed: boolean
  artefactsDir: string
  perScenario: Array<{
    scenarioId: string
    overall: ScenarioVerdict['overall']
    axisLine: string // single-line "ax1✓ ax2✓ ax3✗" rollup
  }>
}

// Re-export for convenience.
export type { ScenarioReport, ScenarioTurn }
