import OpenAI from 'openai'

// Lazy-load @copilotkit/runtime so a compatibility error does not crash the
// entire Bun server. The drawing feature works without it (direct Azure path).
let _handleRequest: ((req: Request) => Promise<Response>) | null | false = null

async function getCopilotHandler(): Promise<((req: Request) => Promise<Response>) | null> {
  if (_handleRequest !== null) return _handleRequest || null

  try {
    const { CopilotRuntime, OpenAIAdapter, copilotRuntimeNextJSAppRouterEndpoint } =
      // biome-ignore lint/suspicious/noExplicitAny: dynamic import
      (await import('@copilotkit/runtime')) as any

    const endpoint = (process.env.AZURE_OPENAI_ENDPOINT ?? '').replace(/\/$/, '')
    const apiKey = process.env.AZURE_OPENAI_API_KEY ?? ''
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o'
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2025-01-01-preview'

    // Extract base hostname in case user pasted full Azure URL
    let baseUrl = endpoint
    try {
      const u = new URL(endpoint)
      baseUrl = `${u.protocol}//${u.hostname}`
    } catch { /* keep as-is */ }

    const openai = new OpenAI({
      apiKey,
      baseURL: `${baseUrl}/openai/deployments/${deployment}`,
      defaultQuery: { 'api-version': apiVersion },
      defaultHeaders: { 'api-key': apiKey },
    })

    const serviceAdapter = new OpenAIAdapter({ openai, model: deployment })
    const runtime = new CopilotRuntime()

    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      serviceAdapter,
      endpoint: '/api/copilotkit',
    })

    _handleRequest = handleRequest
    console.log('[copilotkit] runtime ready')
    return _handleRequest
  } catch (err) {
    console.warn('[copilotkit] runtime unavailable (drawing card still works):', String(err).slice(0, 120))
    _handleRequest = false
    return null
  }
}

export async function handleCopilotKitRequest(req: Request): Promise<Response> {
  const handler = await getCopilotHandler()
  if (!handler) {
    return new Response(JSON.stringify({ error: 'CopilotKit runtime unavailable' }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }
  return handler(req)
}
