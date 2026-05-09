// CLI entry for the UI-validation harness.
//
//   bun run scripts/validate-ui.ts <scenario.json> [<scenario.json> ...]
//
// Boots a text-mode Gemini Live session, runs every scenario, prints a
// per-turn report, and exits non-zero on any failure. Use this to verify
// that the production system prompt + tool declarations still produce
// well-formed A2UI surfaces without spinning up a microphone.

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { type Scenario, type ScenarioReport, runScenario } from './validate-ui/runScenario'

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

function resolveApiKey(): string {
  const key = process.env.GEMINI_API_KEY ?? process.env.VITE_GEMINI_API_KEY
  if (!key) {
    throw new Error(
      'No Gemini API key found. Set GEMINI_API_KEY (or VITE_GEMINI_API_KEY) ' +
        'in the env or in .env.local.',
    )
  }
  return key
}

function loadScenario(path: string): Scenario {
  const abs = resolve(process.cwd(), path)
  const raw = readFileSync(abs, 'utf8')
  const parsed = JSON.parse(raw) as Scenario
  if (!parsed.name || !parsed.language || !Array.isArray(parsed.turns)) {
    throw new Error(`scenario at ${abs} is missing name/language/turns`)
  }
  return parsed
}

function printReport(report: ScenarioReport): void {
  const status = report.passed ? 'PASS' : 'FAIL'
  console.log(`\n[${status}] ${report.name} (${report.language})`)
  for (const turn of report.turns) {
    const summary =
      turn.toolCalls.map((c) => c.name).join(' → ') || '(no tool calls)'
    console.log(`  turn ${turn.index}: ${summary}`)
    if (turn.surface) {
      console.log(
        `    surface "${turn.surface.surfaceId}" → ` +
          `${turn.surface.componentIds.length} components, ` +
          `dataModel keys: [${Object.keys(turn.surface.dataModel).join(', ')}]`,
      )
    }
    for (const f of turn.failures) {
      console.log(`    ✗ ${f.rule}: ${f.detail}`)
    }
  }
}

async function main(): Promise<void> {
  loadDotenv()
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error(
      'Usage: bun run scripts/validate-ui.ts <scenario.json> [<scenario.json> ...]',
    )
    process.exit(2)
  }
  const apiKey = resolveApiKey()

  let allPassed = true
  for (const path of args) {
    const scenario = loadScenario(path)
    let report: ScenarioReport
    try {
      report = await runScenario(scenario, { apiKey })
    } catch (err) {
      console.error(`\n[ERROR] ${scenario.name}:`, err instanceof Error ? err.message : err)
      allPassed = false
      continue
    }
    printReport(report)
    if (!report.passed) allPassed = false
  }

  process.exit(allPassed ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
