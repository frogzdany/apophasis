// Discovers and parses scenario files for the validate-ui harness.
//
// Canonical location: tests/judge/scenarios/*.yaml. The earlier prototype
// stored a single JSON scenario under scripts/validate-ui/scenarios/; that
// directory is no longer scanned (the JSON shape lacked a rubric, so it
// can't drive the judge anyway). If you have local JSON scenarios you
// want back, port them to YAML.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import type { Scenario } from './runScenario'
import type { YamlScenario } from './types'

const YAML_DIR = resolve(process.cwd(), 'tests/judge/scenarios')

export interface LoadedScenario {
  // Path relative to repo root. Used for run-dir naming and reporting.
  source: string
  scenario: Scenario
}

export function discoverScenarios(filter?: string): LoadedScenario[] {
  const out: LoadedScenario[] = []
  for (const path of listFiles(YAML_DIR, /\.ya?ml$/i)) {
    out.push({ source: path, scenario: loadYamlScenario(path) })
  }
  out.sort((a, b) => a.scenario.name.localeCompare(b.scenario.name))
  if (!filter) return out
  return out.filter((s) => matchFilter(s.scenario.name, filter))
}

// Glob-ish: '*' wildcards only. Anchored full match. We deliberately avoid
// pulling in a glob dep; '*' / 'song_*' / 'song_*_es' covers expected use.
function matchFilter(name: string, filter: string): boolean {
  const escaped = filter.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`).test(name)
}

function listFiles(dir: string, ext: RegExp): string[] {
  try {
    if (!statSync(dir).isDirectory()) return []
  } catch {
    return []
  }
  return readdirSync(dir)
    .filter((name) => ext.test(name))
    .map((name) => join(dir, name))
}

function loadYamlScenario(path: string): Scenario {
  const raw = readFileSync(path, 'utf8')
  const parsed = parseYaml(raw) as YamlScenario | null
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`scenario at ${path} did not parse as a mapping`)
  }
  if (!parsed.id) throw new Error(`scenario at ${path} missing required 'id'`)
  if (!parsed.language) throw new Error(`scenario at ${path} missing 'language'`)
  if (!Array.isArray(parsed.turns)) {
    throw new Error(`scenario at ${path} missing 'turns' array`)
  }
  if (!parsed.rubric || typeof parsed.rubric.description !== 'string') {
    throw new Error(
      `scenario at ${path} missing 'rubric.description' (the soft-axis spec)`,
    )
  }
  return {
    name: parsed.id,
    language: parsed.language,
    voiceName: parsed.voiceName,
    searchPolicy: parsed.searchPolicy,
    turns: parsed.turns,
    rubric: parsed.rubric,
  }
}

