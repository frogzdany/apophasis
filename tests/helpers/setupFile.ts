// Per-worker setup: installs the relative-fetch proxy so that browser
// providers' `fetch('/api/search/...')` calls land on the test proxy
// spawned in globalSetup.ts.

import { afterAll, beforeAll } from 'vitest'
import { loadDotenv } from './env'
import { installRelativeFetchProxy } from './runProxy'

let uninstall: (() => void) | null = null

beforeAll(() => {
  loadDotenv()
  const baseUrl = process.env.LUCY_TEST_PROXY_URL
  if (baseUrl) {
    uninstall = installRelativeFetchProxy(baseUrl)
  }
})

afterAll(() => {
  if (uninstall) {
    uninstall()
    uninstall = null
  }
})
