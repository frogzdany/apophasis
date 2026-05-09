# Drawing Feature — Integration Guide

Branch: `drawingfunction` → `main`

This document covers every change introduced by the drawing branch so a developer can merge it cleanly, configure the required services, and understand how the feature works end-to-end.

---

## Overview

The drawing feature lets users sketch what they are looking for on an in-app canvas. Once the user taps **Interpret**, the sketch is:

1. Sent to **Azure OpenAI GPT-4o (vision)** which produces a natural-language description.
2. Sent to **GPT-4o (JSON mode)** which classifies the intent into one of six search domains and extracts structured attributes.
3. Rendered as a result card inside the canvas panel — with a **domain badge**, **description**, and pre-filled **search query**.
4. (In the background) Sent to a second GPT-4o call that generates a full **A2UI interactive surface** the user can open and refine.
5. Forwarded to **Lucy** (the Gemini live session) via a `lucyDrawingContext` custom event so she can call the right search provider immediately.

---

## Files Added

### `server/interpretDrawing.ts`
Two-step Azure OpenAI pipeline called by `POST /api/interpret-drawing`.

- **Step 1 (vision):** sends the base64 PNG to GPT-4o with a vision prompt; returns a 2-3 sentence description of what was drawn.
- **Step 2 (intent):** sends the description to GPT-4o in JSON mode; returns a structured `DrawingInterpretation`:

```ts
interface DrawingInterpretation {
  description: string
  domain: 'music' | 'video' | 'book' | 'place' | 'product' | 'web'
  searchQuery: string
  title: string
  attributes: Record<string, string | number>
}
```

### `server/generateSurface.ts`
Called by `POST /api/generate-surface`. Takes a `DrawingInterpretation` and:

- Chooses a **static A2UI component template** for the detected domain (music, places, video, books, products, web).
- Uses GPT-4o to decide the **strategy** (`direct_search` or `refine`) and pre-fill the surface data model.
- Returns a `DrawingSurface` object ready to be dispatched to the A2UI processor.

```ts
interface DrawingSurface {
  surfaceId: string
  components: Record<string, unknown>[]
  dataModel: Record<string, unknown>
  surfaceTitle: string
  provider: string
  strategy: 'direct_search' | 'refine'
  confidence: number
  directSearchArgs?: Record<string, unknown>  // only when strategy === 'direct_search'
}
```

**Strategy rules** (enforced by GPT-4o prompt):
- `direct_search` when confidence > 0.72 and the drawing identifies something specific.
- `refine` when the drawing shows a concept/style but lacks a specific target.

### `server/copilotRuntime.ts`
Optional CopilotKit runtime bridge at `POST /api/copilotkit`. Lazy-loaded at request time — if `@copilotkit/runtime` is unavailable (e.g. peer dep conflict) it returns 503 and the drawing feature continues to work via the direct Azure path.

### `src/ui/DrawingCanvas.tsx`
Main drawing modal — renders as a full-screen overlay (`z-50`) when `store.drawingOpen === true`.

**Canvas spec:** 900 × 480 px logical, dark background `#06070a`, scales to fit `92vw` max-width container.

**Tools:** pen (8 colors, 4 brush sizes) and eraser.

**Panel states:** `'drawing'` → `'interpreting'` → `'result'`.

After successful interpretation:
- Stores result in Zustand (`setDrawingInterpretation`).
- Fires `lucyDrawingContext` custom event with a structured text Lucy acts on.
- Fires `POST /api/generate-surface` in the background (non-blocking).

### `src/ui/DrawingResultPanel.tsx`
Floating result card (`fixed bottom-24 right-4 z-40`) shown whenever `store.drawingInterpretation` is non-null (i.e. the canvas is closed but the interpretation is still active). Contains a **Search with Lucy** button that dispatches the query and clears the interpretation.

### `src/a2ui/drawingSurface.ts`
Client-side dispatcher that pushes a `DrawingSurface` into the A2UI processor:

- **`direct_search` + Lucy active:** fires `lucyDrawingContext` so Lucy calls the provider.
- **`direct_search` + Lucy offline:** calls the search provider directly via `PROVIDERS_BY_NAME[surface.provider]`.
- **`refine`:** pushes the surface to the panel so the user can confirm/edit fields before searching.

---

## Files Modified

### `server/index.ts`
Three new routes added after the existing `/api/gemini-token` handler:

| Method | Path | Handler |
|--------|------|---------|
| `POST` | `/api/interpret-drawing` | `interpretDrawing(imageBase64)` |
| `POST` | `/api/generate-surface` | `generateSurface(interpretation)` |
| `POST` | `/api/copilotkit` | `handleCopilotKitRequest(req)` |

Both drawing routes are **rate-limited** by the existing `searchRateOk(clientIp)` guard.

**Origin check relaxed in dev:** the `originAllowed` guard is now skipped when `DIST_DIR` is unset (dev mode) because Vite's proxy rewrites `Origin` headers in ways that break the comparison.

### `src/store/index.ts`
Three new state fields and two setters added to the Zustand store:

```ts
drawingOpen: boolean                 // controls canvas visibility
drawingPrompt: string | null         // optional prompt shown above canvas
drawingInterpretation: { ... } | null  // last interpretation result

setDrawingOpen(open: boolean, prompt?: string): void
setDrawingInterpretation(interp: { ... } | null): void
```

### `src/gemini/tools.ts`
New Gemini tool declaration `open_drawing_canvas` added to `UI_TOOLS`:

```ts
{
  name: 'open_drawing_canvas',
  parameters: {
    message: string  // max 20 words, shown above canvas
  }
}
```

**Trigger conditions** baked into the tool description (for Gemini to learn):
- User says "let me draw it" / "te lo dibujo" / "quiero dibujarte".
- User expresses Lucy is not understanding them.
- After 2+ failed search attempts.

### `src/gemini/liveSession.ts`
System prompt updated (both EN and ES) to document `open_drawing_canvas` in the UI tools section, including the trigger conditions and the `[drawing_context]` message pattern.

### `src/hooks/useVoiceSession.ts`
- Handles `open_drawing_canvas` tool calls from Gemini: calls `setDrawingOpen(true, message)` and acknowledges with `sendToolResponse`.
- Registers a `lucyDrawingContext` window event listener for the duration of the live session. When the event fires, the description is forwarded to Gemini via `session.sendUserText(text)` wrapped in a `[drawing_context]` header.
- Cleans up the listener on session close.

### `src/ui/Controls.tsx`
**"Draw for me" / "Dibújalo"** button added to the bottom control bar, triggering `setDrawingOpen(true)`. Uses the `PenLine` Lucide icon.

### `src/lib/messages.ts`
Fourteen new i18n keys added for both `en` and `es` locales:

| Key | EN | ES |
|-----|----|----|
| `drawing.title` | Draw what you're looking for | Dibuja lo que buscas |
| `drawing.pen` | Pen | Lápiz |
| `drawing.eraser` | Eraser | Borrador |
| `drawing.clear` | Clear | Limpiar |
| `drawing.interpret` | Interpret drawing | Interpretar dibujo |
| `drawing.interpreting` | Interpreting… | Interpretando… |
| `drawing.interpreted` | Lucy understood: | Lucy entendió: |
| `drawing.button` | Draw for me | Dibújalo |
| `drawing.buttonTooltip` | Open drawing canvas… | Abre el canvas… |
| `event.drawing` | Drawing canvas opened | Canvas de dibujo abierto |
| `event.drawingResult` | Drawing interpreted | Dibujo interpretado |

### `src/App.tsx`
`<DrawingCanvas />` added to the app root (after `<Controls />`). It renders `null` when `drawingOpen` is false so there is no DOM overhead at rest.

### `package.json`
New dependencies:

```json
"@copilotkit/react-core": "^1.57.1",
"@copilotkit/react-ui":   "^1.57.1",
"@copilotkit/runtime":    "^1.57.1",
"openai":                 "^6.37.0",
"concurrently":           "^9.2.1"
```

`dev:all` script changed from a background `&` shell trick to `concurrently` for cross-platform reliability.

---

## Environment Variables Required

Add these to `.env` (copy from `.env.example`):

```bash
# Azure OpenAI — drawing interpretation (vision + intent)
AZURE_OPENAI_ENDPOINT=https://<your-resource>.cognitiveservices.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2025-01-01-preview
AZURE_OPENAI_API_KEY=<your-key>
AZURE_OPENAI_DEPLOYMENT=gpt-4o
AZURE_OPENAI_API_VERSION=2024-12-01-preview
```

> **Note:** `AZURE_OPENAI_ENDPOINT` can be the full path URL or just the base hostname — the server normalizes it automatically.

---

## Integration Steps

### 1. Install dependencies

```bash
bun install
```

### 2. Set env vars

Copy the four `AZURE_OPENAI_*` variables above into `.env`.

### 3. Merge strategy

The branch has no direct conflicts with `main` on shared files (`server/index.ts`, `src/store/index.ts`, etc.) as long as `main` has not independently modified those same areas. Recommended merge approach:

```bash
git checkout main
git merge drawingfunction --no-ff -m "feat: drawing canvas with Azure OpenAI vision interpretation"
```

If there are conflicts in `server/index.ts`, the drawing routes should be inserted **after** the `/api/gemini-token` block and **before** the `/api/search/:provider` block.

### 4. Verify build

```bash
bunx tsc --noEmit   # must pass with zero errors
bun run build       # production build
```

### 5. Smoke test

1. Start dev: `bun run dev:all`
2. Click **Draw for me** in the bottom bar → canvas opens.
3. Draw something, click **Interpret drawing**.
4. Verify the result card shows a domain badge, description, and search query.
5. Click **Open interactive UI** — the A2UI surface panel should appear on the right.
6. Start a voice session, say "I'll draw it for you" → Lucy should open the canvas via `open_drawing_canvas`.

---

## Architecture Diagram

```
User draws on <DrawingCanvas>
        │
        │  POST /api/interpret-drawing  (base64 PNG)
        ▼
  server/interpretDrawing.ts
        │  Azure OpenAI GPT-4o vision  →  description
        │  Azure OpenAI GPT-4o JSON    →  domain / query / attributes
        ▼
  DrawingInterpretation stored in Zustand
        │
        ├──→  lucyDrawingContext event  →  useVoiceSession  →  session.sendUserText
        │                                                         │
        │                                                         ▼
        │                                                   Gemini acts (search / render_surface)
        │
        └──→  POST /api/generate-surface  (background, non-blocking)
                      │
                      │  Azure OpenAI GPT-4o JSON  →  DrawingSurface
                      ▼
              dispatchDrawingSurface()
                      │
                      ├── direct_search + Lucy active  →  lucyDrawingContext event
                      ├── direct_search + Lucy offline →  PROVIDERS_BY_NAME[provider].handler()
                      └── refine                       →  A2UI processor  →  SurfacePanel
```

---

## Known Limitations & Follow-up Work

- `DrawingResultPanel` is currently rendered but the floating card overlaps with `SurfacePanel` when both are visible simultaneously. Consider dismissing the card automatically when a surface is opened.
- `@copilotkit/*` packages add ~2 MB to the bundle. If CopilotKit is not used beyond this lazy runtime, the packages can be removed and `server/copilotRuntime.ts` deleted.
- The `.env.example` committed in this branch contains a real API key and endpoint — these should be rotated and the file cleaned before merging to `main`.
- `AZURE_OPENAI_API_VERSION` is set to `2024-12-01-preview` in `.env.example` but the code defaults to `2025-01-01-preview`. Align the two.
