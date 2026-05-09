import { type FunctionDeclaration, Type } from '@google/genai'
import { SEARCH_PROVIDERS } from '@/lib/search/registry'

// UI / orchestration tools — domain-neutral. The actual search tools come
// from the providers registry below so adding YouTube / Books / Web is just
// a matter of dropping a file in src/lib/search/providers/.
//
// IMPORTANT: when toolConfig.functionCallingConfig.mode === 'ANY' the model
// MUST emit one of these on every turn. respond_in_voice is the no-op
// fallback for greetings and chit-chat where no real action is appropriate.
const UI_TOOLS: FunctionDeclaration[] = [
  {
    name: 'render_surface',
    description:
      'Render or replace a UI surface so the user can answer fuzzy attributes. ' +
      'Use this when you need to start a new line of questioning. The components ' +
      'array follows A2UI v0.9 (basic catalog: Column, Row, Card, Text, TextField, ' +
      'ChoicePicker, Slider, CheckBox, Button). One component MUST have id "root".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        surface_id: {
          type: Type.STRING,
          description: 'Stable identifier for this surface (e.g. "song_search").',
        },
        components: {
          type: Type.ARRAY,
          description:
            'A2UI v0.9 component list. Each item has id, component (e.g. "Column"), ' +
            'and component-specific properties. Children are id-references.',
          items: { type: Type.OBJECT },
        },
        data_model: {
          type: Type.OBJECT,
          description:
            'Initial dataModel values keyed by JSON Pointer paths (e.g. {"/title": ""}).',
        },
      },
      required: ['surface_id', 'components'],
    },
  },
  {
    name: 'update_surface',
    description:
      'Patch an existing surface in place when the user has provided more ' +
      'information. Prefer this over render_surface for refinement so the iteration ' +
      'counter advances.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        surface_id: { type: Type.STRING },
        components: {
          type: Type.ARRAY,
          description: 'New full component list (replaces previous). Optional.',
          items: { type: Type.OBJECT },
        },
        data_model_patch: {
          type: Type.OBJECT,
          description: 'Object whose keys are JSON Pointer paths and values are the new values.',
        },
      },
      required: ['surface_id'],
    },
  },
  {
    name: 'close_surface',
    description: 'Dismiss a surface that is no longer needed.',
    parameters: {
      type: Type.OBJECT,
      properties: { surface_id: { type: Type.STRING } },
      required: ['surface_id'],
    },
  },
  {
    name: 'respond_in_voice',
    description:
      'Use ONLY for plain conversational replies that do not require any UI or ' +
      'search (greetings, simple acknowledgements, "thanks", "yes", "no", or short ' +
      'clarifying follow-ups). NEVER use this when the user describes something they ' +
      'want to find, asks for components, or refines a panel — those need ' +
      'render_surface or update_surface. The audio reply Lucy speaks is independent ' +
      'of this tool; this just signals "no UI action this turn".',
    parameters: {
      type: Type.OBJECT,
      properties: {
        intent: {
          type: Type.STRING,
          description:
            'One word for the chat intent: "greet" | "ack" | "clarify" | "thanks" | "other".',
        },
      },
    },
  },
]

export const APOPHASIS_TOOLS: FunctionDeclaration[] = [
  ...UI_TOOLS,
  ...SEARCH_PROVIDERS.map((p) => p.declaration),
]
