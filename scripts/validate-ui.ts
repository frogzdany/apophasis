// CLI for the validate-ui judge harness.
//
// Default flow:
//   - Discover scenarios under tests/judge/scenarios/*.yaml (and the
//     legacy scripts/validate-ui/scenarios/*.json files).
//   - Run each through a text-mode Live session (sendUserText), capturing
//     transcripts, tool calls, and surface snapshots into an artefact.
//   - Score deterministic axes in plain code.
//   - When ANTHROPIC_API_KEY is set and --no-judge isn't passed, hand the
//     artefact to Claude for the soft axes.
//   - Persist everything under tests/judge/runs/<ts>/, print a summary,
//     exit non-zero on any fail.
//
// Flags:
//   --tts                  drive turns via TTS round-trip (audio path)
//   --no-judge             skip the Claude call (deterministic axes only)
//   --scenario "<glob>"    filter by scenario id (e.g. song_search_*)
//   --save-audio           save TTS input + Lucy reply WAVs (--tts only)
//
// Env:
//   GEMINI_API_KEY (or VITE_GEMINI_API_KEY) — required
//   ANTHROPIC_API_KEY — required unless --no-judge

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { evaluateDeterministicAxes } from './validate-ui/deterministic'
import { judgeArtefact } from './validate-ui/judge'
import { discoverScenarios } from './validate-ui/loadScenarios'
import {
  axisLine,
  createRunDir,
  rollupVerdict,
  writeArtefact,
  writeSummary,
  writeVerdict,
} from './validate-ui/report'
import { type ScenarioReport, runScenario } from './validate-ui/runScenario'
import type {
  AxisResult,
  RunSummary,
  ScenarioArtefact,
  ScenarioVerdict,
} from './validate-ui/types'

interface Cli {
  tts: boolean
  judge: boolean
  filter?: string
  saveAudio: boolean
  positional: string[]
}

function parseArgs(argv: string[]): Cli {
  const out: Cli = { tts: false, judge: true, saveAudio: false, positional: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--tts') out.tts = true
    else if (a === '--no-judge') out.judge = false
    else if (a === '--save-audio') out.saveAudio = true
    else if (a === '--scenario') {
      out.filter = argv[++i]
    } else if (a.startsWith('--scenario=')) {
      out.filter = a.slice('--scenario='.length)
    } else if (a.startsWith('-')) {
      throw new Error(`unknown flag: ${a}`)
    } else {
      out.positional.push(a)
    }
  }
  return out
}

function loadDotenv(): void {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value
    }
  }
}

function resolveGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.VITE_GEMINI_API_KEY
  if (!key) {
    throw new Error(
      'No Gemini API key found. Set GEMINI_API_KEY (or VITE_GEMINI_API_KEY) ' +
        'in the env or in .env.local.',
    )
  }
  return key
}

async function main(): Promise<void> {
  loadDotenv()
  const cli = parseArgs(process.argv.slice(2))

  if (cli.saveAudio && !cli.tts) {
    console.error('--save-audio requires --tts; ignoring.')
    cli.saveAudio = false
  }
  if (cli.saveAudio) {
    console.error('--save-audio: WAV capture not implemented yet; flag is a no-op.')
    cli.saveAudio = false
  }

  const apiKey = resolveGeminiKey()
  const judgeEnabled = cli.judge && !!process.env.ANTHROPIC_API_KEY
  if (cli.judge && !process.env.ANTHROPIC_API_KEY) {
    console.error(
      'ANTHROPIC_API_KEY not set — running deterministic axes only. Pass ' +
        '--no-judge to silence this warning.',
    )
  }

  const scenarios = discoverScenarios(cli.filter)
  if (scenarios.length === 0) {
    console.error(
      'No scenarios matched. Looked in tests/judge/scenarios/*.yaml and ' +
        'scripts/validate-ui/scenarios/*.json.',
    )
    process.exit(2)
  }

  const startedAt = new Date()
  const runDir = createRunDir(startedAt)
  console.log(`[validate-ui] writing artefacts to ${runDir.root}`)
  console.log(`[validate-ui] running ${scenarios.length} scenario(s)`)

  const perScenario: RunSummary['perScenario'] = []
  let passed = 0
  let failed = 0
  let partial = 0

  for (const { scenario, source } of scenarios) {
    const id = scenario.name
    process.stdout.write(`  → ${id} ... `)
    let report: ScenarioReport
    try {
      report = await runScenario(scenario, {
        apiKey,
        inputMode: cli.tts ? 'tts' : 'text',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`ERROR (${msg})`)
      const dir = runDir.scenarioDir(id)
      const fatal: ScenarioArtefact = {
        scenarioId: id,
        language: scenario.language,
        inputMode: cli.tts ? 'tts' : 'text',
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
        rubric: scenario.rubric ?? { description: '' },
        turns: [],
        fatalError: msg,
      }
      writeArtefact(dir, fatal)
      const verdict: ScenarioVerdict = {
        scenarioId: id,
        overall: 'fail',
        axes: [
          {
            axisId: 'no_session_failures',
            label: 'Session ran to completion',
            pass: false,
            note: msg,
          },
        ],
      }
      writeVerdict(dir, verdict)
      perScenario.push({ scenarioId: id, overall: 'fail', axisLine: 'session✗' })
      failed += 1
      continue
    }

    const dir = runDir.scenarioDir(id)
    writeArtefact(dir, report.artefact)

    const detAxes = evaluateDeterministicAxes(report.artefact)
    const softAxes: AxisResult[] = []
    let judgeRaw: string | undefined
    if (judgeEnabled && scenario.rubric && detAxes.every((a) => a.pass)) {
      try {
        const j = await judgeArtefact(report.artefact)
        softAxes.push(...j.axes)
        judgeRaw = j.raw
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.log(`(judge error: ${msg.slice(0, 80)})`)
        softAxes.push({
          axisId: 'judge_error',
          label: 'Judge call failed',
          pass: false,
          note: msg,
        })
      }
    }
    const allAxes = [...detAxes, ...softAxes]
    const verdict = rollupVerdict(id, allAxes, judgeRaw)
    writeVerdict(dir, verdict, judgeRaw)

    if (verdict.overall === 'pass') passed += 1
    else if (verdict.overall === 'fail') failed += 1
    else partial += 1

    perScenario.push({
      scenarioId: id,
      overall: verdict.overall,
      axisLine: axisLine(allAxes),
    })
    console.log(
      `${verdict.overall.toUpperCase()} (${allAxes.filter((a) => a.pass).length}/${allAxes.length} axes) [${shortSource(source)}]`,
    )
  }

  const summary: RunSummary = {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    totalScenarios: scenarios.length,
    passed,
    failed,
    partial,
    inputMode: cli.tts ? 'tts' : 'text',
    judgeUsed: judgeEnabled,
    artefactsDir: runDir.root,
    perScenario,
  }
  writeSummary(runDir.root, summary)

  console.log(
    `\n[validate-ui] ${passed} pass · ${partial} partial · ${failed} fail of ${scenarios.length}`,
  )
  console.log(`[validate-ui] summary: ${runDir.root}/summary.md`)
  process.exit(failed > 0 ? 1 : 0)
}

function shortSource(path: string): string {
  // tests/judge/scenarios/song_search_en.yaml → song_search_en.yaml
  return path.split('/').slice(-1)[0]
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
