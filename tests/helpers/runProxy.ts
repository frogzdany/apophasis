// Boots the real Bun proxy in a subprocess on a random free port. Used by
// the live tool-tests so the same code path the browser hits in production
// is exercised end-to-end (provider handler → /api/search/* → upstream).

import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '..', '..')

async function pickFreePort(): Promise<number> {
  return new Promise((resolveP, reject) => {
    const srv = createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, () => {
      const addr = srv.address()
      if (typeof addr === 'object' && addr) {
        const port = addr.port
        srv.close(() => resolveP(port))
      } else {
        srv.close()
        reject(new Error('failed to pick port'))
      }
    })
  })
}

async function waitForHealth(port: number, timeoutMs = 8000): Promise<void> {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`)
      if (res.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`proxy on port ${port} did not become healthy in ${timeoutMs}ms`)
}

export interface TestProxy {
  baseUrl: string
  port: number
  stop: () => Promise<void>
}

export async function startTestProxy(): Promise<TestProxy> {
  const port = await pickFreePort()
  const child: ChildProcess = spawn('bun', ['run', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout?.on('data', (b: Buffer) => {
    if (process.env.LUCY_TEST_VERBOSE) process.stdout.write(`[proxy] ${b}`)
  })
  child.stderr?.on('data', (b: Buffer) => {
    process.stderr.write(`[proxy] ${b}`)
  })

  try {
    await waitForHealth(port)
  } catch (err) {
    child.kill('SIGTERM')
    throw err
  }

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    stop: () =>
      new Promise<void>((resolveP) => {
        if (child.exitCode !== null || child.killed) return resolveP()
        child.once('exit', () => resolveP())
        child.kill('SIGTERM')
        // Hard fallback if SIGTERM is ignored.
        setTimeout(() => {
          if (child.exitCode === null) child.kill('SIGKILL')
        }, 1500)
      }),
  }
}

// Wraps globalThis.fetch so that:
//  - relative '/api/...' calls (what the browser providers do) resolve
//    against the test proxy
//  - the Origin header is set to the proxy's own origin so the
//    same-origin gate in server/index.ts admits the request.
// Returns an uninstall function.
export function installRelativeFetchProxy(baseUrl: string): () => void {
  const real = globalThis.fetch.bind(globalThis)
  const patched: typeof fetch = async (input, init) => {
    let target: string | URL | Request = input
    if (typeof input === 'string' && input.startsWith('/')) {
      target = `${baseUrl}${input}`
    } else if (input instanceof URL && input.pathname.startsWith('/api/')) {
      target = new URL(input.pathname + input.search, baseUrl)
    }
    const headers = new Headers(init?.headers)
    if (!headers.has('origin')) headers.set('origin', baseUrl)
    return real(target, { ...init, headers })
  }
  globalThis.fetch = patched
  return () => {
    globalThis.fetch = real
  }
}
