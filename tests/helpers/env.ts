// Tiny .env.local loader + key-availability checks. Vitest under Bun
// inherits the env automatically, but we re-parse the file as a fallback so
// the suite works the same when invoked from a non-Bun shell.

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

let loaded = false

function parse(content: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    out[key] = value
  }
  return out
}

export function loadDotenv(): void {
  if (loaded) return
  loaded = true
  const path = resolve(__dirname, '..', '..', '.env.local')
  if (!existsSync(path)) return
  const parsed = parse(readFileSync(path, 'utf8'))
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined || process.env[k] === '') {
      process.env[k] = v
    }
  }
}

export function hasKey(name: string): boolean {
  loadDotenv()
  const v = process.env[name]
  return typeof v === 'string' && v.length > 0
}

// Convenience: return a `skipReason` string when any of the listed keys is
// missing, else null. Use with `it.skipIf(skipMissing(...))`.
export function skipMissing(...names: string[]): string | false {
  const missing = names.filter((n) => !hasKey(n))
  return missing.length > 0 ? `missing env: ${missing.join(', ')}` : false
}
