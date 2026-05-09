// Vitest globalSetup: boots the proxy once for the whole tools suite,
// records the base URL into LUCY_TEST_PROXY_URL, and tears down at the end.

import { loadDotenv } from './env'
import { startTestProxy, type TestProxy } from './runProxy'

let proxy: TestProxy | null = null

export async function setup(): Promise<void> {
  loadDotenv()
  // Migration shim: YouTube used to live in the browser bundle as
  // VITE_YOUTUBE_API_KEY but is now server-side as YOUTUBE_API_KEY. If a
  // dev still has only the legacy name, promote it before the proxy
  // subprocess inherits the env so search_video keeps working.
  if (!process.env.YOUTUBE_API_KEY && process.env.VITE_YOUTUBE_API_KEY) {
    process.env.YOUTUBE_API_KEY = process.env.VITE_YOUTUBE_API_KEY
  }
  proxy = await startTestProxy()
  process.env.LUCY_TEST_PROXY_URL = proxy.baseUrl
  process.env.LUCY_TEST_PROXY_PORT = String(proxy.port)
  // eslint-disable-next-line no-console
  console.log(`[tests] proxy ready at ${proxy.baseUrl}`)
}

export async function teardown(): Promise<void> {
  if (proxy) {
    await proxy.stop()
    proxy = null
  }
}
