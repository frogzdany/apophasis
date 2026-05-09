// Vitest globalSetup: boots the proxy once for the whole tools suite,
// records the base URL into LUCY_TEST_PROXY_URL, and tears down at the end.

import { loadDotenv } from './env'
import { startTestProxy, type TestProxy } from './runProxy'

let proxy: TestProxy | null = null

export async function setup(): Promise<void> {
  loadDotenv()
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
