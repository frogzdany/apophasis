import {
  type A2uiMessage,
  type ActionListener,
  type ComponentApi,
  MessageProcessor,
} from '@a2ui/web_core/v0_9'
import { APOPHASIS_CATALOG_ID, apophasisCatalog } from './catalog'

// Singleton MessageProcessor shared across the app. The processor parses
// inbound A2UI server messages (createSurface, updateComponents, etc.) and
// emits surface events that the React renderer subscribes to.
//
// We keep a mutable action listener so useVoiceSession can install its
// handler without recreating the processor (which would lose mounted
// surfaces).
let processor: MessageProcessor<ComponentApi> | null = null
let actionListener: ActionListener | null = null

const dispatchAction: ActionListener = async (action) => {
  if (actionListener) await actionListener(action)
}

// biome-ignore lint/suspicious/noExplicitAny: catalog generic type is opaque
const catalogs = [apophasisCatalog as any]

export function getProcessor(): MessageProcessor<ComponentApi> {
  if (!processor) {
    processor = new MessageProcessor<ComponentApi>(catalogs, dispatchAction)
  }
  return processor
}

export function setActionListener(listener: ActionListener | null): void {
  actionListener = listener
}

export function resetProcessor(): MessageProcessor<ComponentApi> {
  processor = new MessageProcessor<ComponentApi>(catalogs, dispatchAction)
  return processor
}

export type { A2uiMessage, ActionListener }
export { APOPHASIS_CATALOG_ID }
