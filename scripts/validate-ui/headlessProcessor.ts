// Headless A2UI processor for the UI-validation harness.
//
// The app's runtime processor (src/a2ui/processor.ts) is bound to React
// catalog components so the live renderer can mount them. The harness only
// needs the *model* — component tree, dataModel, surface lifecycle — so it
// builds a processor on top of the schema-only BASIC_COMPONENTS catalog.
// This keeps the harness pure-Node (no React, no jsdom) while still
// running real Zod validation against every component Lucy emits.

import {
  type A2uiMessage,
  type ComponentApi,
  MessageProcessor,
  Catalog,
} from '@a2ui/web_core/v0_9'
import {
  BASIC_COMPONENTS,
  BASIC_FUNCTIONS,
} from '@a2ui/web_core/v0_9/basic_catalog'
import { APOPHASIS_CATALOG_ID } from '@/a2ui/catalogId'

export const headlessCatalog = new Catalog<ComponentApi>(
  APOPHASIS_CATALOG_ID,
  BASIC_COMPONENTS,
  BASIC_FUNCTIONS,
)

export function createHeadlessProcessor(): MessageProcessor<ComponentApi> {
  return new MessageProcessor<ComponentApi>([headlessCatalog])
}

export type { A2uiMessage }
export { APOPHASIS_CATALOG_ID }
