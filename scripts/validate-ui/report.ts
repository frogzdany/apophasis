// Persists per-scenario artefacts and the rolled-up run summary under
// tests/judge/runs/<ISO-timestamp>/.
//
// Layout:
//   tests/judge/runs/2026-05-09T14-37-12Z/
//     summary.md
//     summary.json
//     <scenarioId>/
//       artefact.json   — capture (input, transcripts, tool calls, surfaces)
//       verdict.json    — deterministic + soft axis results
//       judge.txt       — raw Claude response (when judge ran)

import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type {
  AxisResult,
  RunSummary,
  ScenarioArtefact,
  ScenarioVerdict,
} from './types'

const RUNS_ROOT = resolve(process.cwd(), 'tests/judge/runs')

export interface RunDir {
  root: string
  scenarioDir(scenarioId: string): string
}

export function createRunDir(now = new Date()): RunDir {
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z')
  const root = join(RUNS_ROOT, stamp)
  mkdirSync(root, { recursive: true })
  return {
    root,
    scenarioDir(scenarioId: string) {
      const dir = join(root, scenarioId)
      mkdirSync(dir, { recursive: true })
      return dir
    },
  }
}

export function writeArtefact(dir: string, artefact: ScenarioArtefact): void {
  writeFileSync(join(dir, 'artefact.json'), JSON.stringify(artefact, null, 2))
}

export function writeVerdict(
  dir: string,
  verdict: ScenarioVerdict,
  judgeRaw?: string,
): void {
  writeFileSync(join(dir, 'verdict.json'), JSON.stringify(verdict, null, 2))
  if (judgeRaw) writeFileSync(join(dir, 'judge.txt'), judgeRaw)
}

export function rollupVerdict(
  scenarioId: string,
  axes: AxisResult[],
  judgeRaw?: string,
): ScenarioVerdict {
  const passed = axes.filter((a) => a.pass).length
  const failed = axes.length - passed
  const overall: ScenarioVerdict['overall'] =
    failed === 0 ? 'pass' : passed === 0 ? 'fail' : 'partial'
  return { scenarioId, overall, axes, judgeRaw }
}

export function writeSummary(dir: string, summary: RunSummary): void {
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2))
  writeFileSync(join(dir, 'summary.md'), renderMarkdown(summary))
}

export function renderMarkdown(summary: RunSummary): string {
  const lines: string[] = []
  lines.push('# validate-ui run')
  lines.push('')
  lines.push(`- Started: ${summary.startedAt}`)
  lines.push(`- Finished: ${summary.finishedAt}`)
  lines.push(`- Input mode: ${summary.inputMode}`)
  lines.push(`- Judge: ${summary.judgeUsed ? 'Claude' : 'none (deterministic only)'}`)
  lines.push(
    `- Result: ${summary.passed} pass · ${summary.partial} partial · ${summary.failed} fail (of ${summary.totalScenarios})`,
  )
  lines.push('')
  lines.push('| scenario | overall | axes |')
  lines.push('| -------- | ------- | ---- |')
  for (const row of summary.perScenario) {
    lines.push(`| ${row.scenarioId} | ${verdictBadge(row.overall)} | ${row.axisLine} |`)
  }
  lines.push('')
  return lines.join('\n')
}

function verdictBadge(o: ScenarioVerdict['overall']): string {
  if (o === 'pass') return '✅ pass'
  if (o === 'fail') return '❌ fail'
  return '⚠️ partial'
}

// One-line axis rollup for the markdown table: "ax✓ ax✓ ax✗ ax✓"
export function axisLine(axes: AxisResult[]): string {
  return axes.map((a) => `${a.axisId}${a.pass ? '✓' : '✗'}`).join(' ')
}
