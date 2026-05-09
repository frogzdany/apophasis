// Append-style JSONL log writer with two backends:
//
//   • LOGS_BUCKET env set → writes to gs://<LOGS_BUCKET>/sessions/<sid>.jsonl
//     using application-default credentials (Cloud Run service account
//     locally `gcloud auth application-default login`).
//   • otherwise → falls back to ./logs/<sid>.jsonl on the local filesystem
//     (matches the existing dev-mode behavior).
//
// GCS objects are not natively appendable, so we read-modify-write per
// entry. Fine for low-volume session logging; revisit if traffic grows.

import { mkdir } from 'node:fs/promises'
import { join, normalize, relative } from 'node:path'

const LOCAL_LOG_DIR = join(process.cwd(), 'logs')
const BUCKET = process.env.LOGS_BUCKET ?? ''
const PREFIX = process.env.LOGS_PREFIX ?? 'sessions'

await mkdir(LOCAL_LOG_DIR, { recursive: true }).catch(() => {})

interface LogEntry {
  sessionId: string
  ts?: string
  kind: string
  // biome-ignore lint/suspicious/noExplicitAny: free-form payload by design
  payload?: any
}

function safeFilename(sessionId: string): string | null {
  // Refuse anything that would escape the prefix or contain path separators.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(sessionId)) return null
  return `${sessionId}.jsonl`
}

function safeLocalPath(fname: string): string | null {
  const full = normalize(join(LOCAL_LOG_DIR, fname))
  const rel = relative(LOCAL_LOG_DIR, full)
  if (rel.startsWith('..') || rel.includes('/')) return null
  return full
}

function lineFor(entry: LogEntry): string {
  return `${JSON.stringify({
    ts: entry.ts ?? new Date().toISOString(),
    kind: entry.kind,
    payload: entry.payload,
  })}\n`
}

// ─── GCS path ────────────────────────────────────────────────────────────
// Lazy-require @google/cloud-storage so local-fs runs don't need it loaded.
let gcsBucket: import('@google-cloud/storage').Bucket | null = null

async function getBucket() {
  if (gcsBucket) return gcsBucket
  const { Storage } = await import('@google-cloud/storage')
  const storage = new Storage()
  gcsBucket = storage.bucket(BUCKET)
  return gcsBucket
}

async function appendGcs(entry: LogEntry, fname: string): Promise<void> {
  const bucket = await getBucket()
  const obj = bucket.file(`${PREFIX}/${fname}`)
  let existing = ''
  try {
    const [buf] = await obj.download()
    existing = buf.toString('utf8')
  } catch (err) {
    // 404 on first write is expected.
    const code = (err as { code?: number }).code
    if (code !== 404) throw err
  }
  await obj.save(existing + lineFor(entry), {
    contentType: 'application/x-ndjson',
    resumable: false,
    metadata: { cacheControl: 'no-store' },
  })
}

// ─── Local-fs path (dev) ────────────────────────────────────────────────
async function appendLocal(entry: LogEntry, fname: string): Promise<void> {
  const file = safeLocalPath(fname)
  if (!file) throw new Error('Invalid sessionId')
  const f = Bun.file(file)
  const existing = (await f.exists()) ? await f.text() : ''
  await Bun.write(file, existing + lineFor(entry))
}

export async function appendLog(entry: LogEntry): Promise<void> {
  const fname = safeFilename(entry.sessionId)
  if (!fname) throw new Error('Invalid sessionId')
  if (BUCKET) {
    await appendGcs(entry, fname)
  } else {
    await appendLocal(entry, fname)
  }
}

export function describeStore(): { backend: 'gcs' | 'local'; target: string } {
  if (BUCKET) return { backend: 'gcs', target: `gs://${BUCKET}/${PREFIX}/` }
  return { backend: 'local', target: LOCAL_LOG_DIR }
}
