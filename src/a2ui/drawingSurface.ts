import type { A2uiMessage } from '@a2ui/web_core/v0_9'
import { APOPHASIS_CATALOG_ID, getProcessor } from './processor'
import { PROVIDERS_BY_NAME } from '@/lib/search/registry'
import { useStore } from '@/store'

export interface DrawingSurface {
  surfaceId: string
  components: Record<string, unknown>[]
  dataModel: Record<string, unknown>
  surfaceTitle: string
  provider: string
  strategy: 'direct_search' | 'refine'
  confidence: number
  directSearchArgs?: Record<string, unknown>
}

// Build a structured text Lucy can act on immediately.
function buildLucySearchText(surface: DrawingSurface): string {
  const args = JSON.stringify(surface.directSearchArgs ?? surface.dataModel)
  return [
    '[drawing_context]',
    `The user drew: ${surface.surfaceTitle}`,
    `Strategy: direct_search → call ${surface.provider} immediately.`,
    `Args: ${args}`,
    `Do NOT ask for clarification — call ${surface.provider} now with the args above.`,
  ].join('\n')
}

// Dispatch a drawing-generated A2UI surface through the processor and register
// it in the store so SurfacePanel renders it on the right side.
function dispatchSurfaceToPanel(surface: DrawingSurface): void {
  const processor = getProcessor()

  try {
    processor.processMessages([
      { version: 'v0.9', deleteSurface: { surfaceId: surface.surfaceId } },
    ] as unknown as A2uiMessage[])
  } catch { /* first run */ }

  processor.processMessages([
    {
      version: 'v0.9',
      createSurface: {
        surfaceId: surface.surfaceId,
        catalogId: APOPHASIS_CATALOG_ID,
        sendDataModel: true,
      },
    },
    {
      version: 'v0.9',
      updateComponents: {
        surfaceId: surface.surfaceId,
        components: surface.components,
      },
    },
    {
      version: 'v0.9',
      updateDataModel: {
        surfaceId: surface.surfaceId,
        path: '/',
        value: surface.dataModel,
      },
    },
  ] as unknown as A2uiMessage[])

  useStore.getState().registerSurface(surface.surfaceId)
}

// Trigger the search directly from the client — used when Lucy is not active.
async function triggerDirectSearch(surface: DrawingSurface): Promise<void> {
  const args = surface.directSearchArgs ?? surface.dataModel
  const provider = PROVIDERS_BY_NAME[surface.provider]
  if (!provider) return

  const store = useStore.getState()
  const queryParts = Object.values(args).filter((v) => typeof v === 'string') as string[]
  const queryLabel = queryParts.filter(Boolean).join(' · ') || surface.surfaceTitle

  store.setSearchPending(true)
  store.setSearchResults(queryLabel, null)

  try {
    const results = await provider.handler(args, 5)
    store.setSearchResults(queryLabel, results)
    if (results[0]) {
      store.addEvent({
        kind: 'result',
        title: 'Drawing search result',
        detail: results[0].subtitle
          ? `${results[0].title} — ${results[0].subtitle}`
          : results[0].title,
      })
    }
  } catch (e) {
    store.setSearchPending(false)
    console.warn('[drawing] direct search failed', e)
  }
}

// Main entry point called from DrawingCanvas after the user clicks
// "Open interactive UI" or "Search directly".
export function dispatchDrawingSurface(surface: DrawingSurface): void {
  const { voiceActive } = useStore.getState()

  if (surface.strategy === 'direct_search') {
    if (voiceActive) {
      // Lucy is connected → let her call the provider (she hears drawing context).
      window.dispatchEvent(
        new CustomEvent('lucyDrawingContext', { detail: buildLucySearchText(surface) }),
      )
    } else {
      // Lucy is offline → call provider directly from the client.
      triggerDirectSearch(surface)
    }
    // Also show the surface so the user can see and refine what was searched.
    dispatchSurfaceToPanel(surface)
  } else {
    // Refine strategy: show the pre-filled surface; Lucy or direct search fires on submit.
    dispatchSurfaceToPanel(surface)

    // Give Lucy context even in refine mode so she's ready to act on submit.
    if (voiceActive) {
      const contextText = [
        '[drawing_context]',
        `The user drew: ${surface.surfaceTitle}`,
        `Strategy: refine — surface "${surface.surfaceId}" is now visible with pre-filled values.`,
        `When the user submits it, call ${surface.provider} with the provided data_model.`,
      ].join('\n')
      window.dispatchEvent(new CustomEvent('lucyDrawingContext', { detail: contextText }))
    }
  }
}
