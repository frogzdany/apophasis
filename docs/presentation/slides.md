---
marp: true
theme: lucy
paginate: true
size: 16:9
footer: 'Apophasis · lucy-blob · Beyond the Chatbox 2026'
---

<!-- _class: lead hero -->
<!-- _paginate: false -->
<!-- _footer: '' -->
<!-- _backgroundImage: "linear-gradient(120deg, rgba(10,11,20,0.55) 0%, rgba(10,11,20,0.85) 60%), url('assets/hero-title.png')" -->

# Apophasis

## A reverse search engine for things you can't fully describe.

### lucy-blob · voice + generative UI · Beyond the Chatbox 2026

---

## The problem

# You don't *search* for what you can't describe. You *ask a friend.*

- A song you half-remember — a riff, three words of a lyric, the mood.
- A book whose title you forgot but you remember the cover and one scene.
- A place from a friend's story — "that bar in CDMX with the rooftop and the live trio."
- A product you saw once — color, shape, brand-you-cannot-recall.

> Search engines need a query. Half-memories aren't queries — they're conversations.

---

## The solution

# Meet **Lucy.**

- **Voice in, voice out** — Gemini Live keeps the loop conversational; server VAD lets you interrupt her, and her interrupt you.
- **She draws back** — instead of asking five clarifying questions out loud, Lucy renders a *surface* on screen: a slider for year, a chip for genre, a text field for one lyric you remember. You tune it. She converges.
- **She picks the right tool** — songs go to iTunes, books to Google Books, places to Maps, products to Shopping, the rest to a parallel web fan-out.
- **The blob is the indicator** — a three.js shader that breathes through `idle → listening → thinking → asking → result`. No spinners, no toolbar, no chat log getting in the way.

🌐 **Live demo:** <https://lucy-blob-nvfgf6doka-uc.a.run.app/>

---

<!-- _class: cols -->

## One real conversation

# *"A song… something about Tokyo… sad piano…"*

![w:520](assets/slide4-conversation.png)

<div>

1. **You speak.** Mic streams over the same WebSocket Lucy's voice rides back. Blob → `listening`.
2. **Lucy thinks.** A `render_surface` tool call fires *before* the first audio chunk. Blob → `thinking → asking`.
3. **A surface appears** — year slider, "instrumental" toggle, "lyric you remember?" field. Lucy says *"déjame ver…"*
4. **You drag the slider** to ~2003. Submit re-enters as a fresh user turn.
5. **`search_music`** → iTunes (~200 ms) → top card: *Lost in Translation OST*. Hit ▶, recognize it.

</div>

---

<!-- _class: diagram -->

## Architecture

![w:1100](assets/architecture.png)

<p class="caption">

**Browser** holds the React SPA, the three.js blob, and the A2UI processor — talks to **Gemini Live** over WebSocket (audio + tool calls). The **Bun proxy** mints ephemeral Live tokens, fans out `search_*` to SerpApi / Brave / Tavily / Exa, and sinks JSONL logs to GCS. One **Cloud Run** service serves the SPA *and* every `/api/*` route; Artifact Registry, Secret Manager, GCS bucket, and budget alarm are all Terraform-managed under `infra/`.

</p>

---

## Domain-routed tool surface

| Tool              | Backend                              | Where it runs        |
|-------------------|--------------------------------------|----------------------|
| `search_music`    | iTunes Search API                    | Browser direct       |
| `search_video`    | YouTube Data v3                      | Browser direct       |
| `search_books`    | SerpApi · Google Books (`udm=36`)    | Bun proxy            |
| `search_places`   | SerpApi · Google Maps                | Bun proxy            |
| `search_products` | SerpApi · Google Shopping            | Bun proxy            |
| `search_web`      | Brave + Tavily + Exa, parallel + dedup | Bun proxy          |

**Adding a new tool ≈ 50 lines:** one file in `src/lib/search/providers/`, one entry in `registry.ts`, one line in Lucy's prompt, one test. The dispatcher in `useVoiceSession.ts` is generic — *zero* hook changes per tool.

---

## Tech stack

| Concern              | Choice                                                          |
|----------------------|-----------------------------------------------------------------|
| Bundler / dev        | Vite 8                                                          |
| UI                   | React 19 + Tailwind 4 (shadcn conventions, lucide icons)        |
| State                | Zustand                                                         |
| 3D / shader          | three.js + @react-three/fiber + drei + postprocessing           |
| **Live UI surfaces** | **@a2ui/react v0.9** *(A2UI — Google's open generative-UI protocol)* |
| **Voice / LLM**      | **@google/genai · `gemini-3.1-flash-live-preview`**             |
| Server runtime       | Bun (`server/index.ts`) — proxy + static, single binary         |
| Linter / format      | Biome                                                           |
| Tests                | Vitest (unit + live tool-validation suite)                      |
| Deploy               | GCP Cloud Run · Terraform (`infra/`)                            |

---

<!-- _class: diagram -->

## Generative UI, in motion

![w:1100](assets/sequence.png)

<p class="caption">

**Lucy** emits `render_surface` → **A2UI Processor** runs `createSurface / updateComponents / updateDataModel` → **You** see the panel and tweak it → submit fires `setActionListener` → serialised `dataModel` is sent back as a fresh user turn → tool routing decides the next call (`update_surface`, `search_*`, or `respond_in_voice`). **Single source of truth:** every surface — including the planned `agent_search` planner surfaces — flows through this same processor. No parallel rendering paths.

</p>

---

<!-- _class: cols dense -->

# Beyond the Chatbox · pillars 1 & 2

## How Apophasis answers the brief

<div class="pillar">

### 1 · Dynamic Component Generation

> *"UI that adapts its structure and state based on the underlying model's reasoning."*

- Lucy emits **A2UI** components per turn — `Slider`, `Choice`, `TextField`, `Button` — chosen by the model from her tool surface.
- `render_surface / update_surface / close_surface` map 1:1 to A2UI's `createSurface / updateComponents / deleteSurface`.
- The **same** model turn that decides "I need to ask about year" also decides whether to render a slider vs. a free text — *structure follows reasoning.*

📍 `src/hooks/useVoiceSession.ts:212-282`

</div>

<div class="pillar">

### 2 · Agentic Feedback Loops

> *"Interfaces that allow users to steer autonomous agents through interactive, real-time visual elements."*

- Surface submit → **`setActionListener` re-enters the loop** as a fresh user turn carrying the full `dataModel`.
- The blob's phase (`listening / thinking / asking / result`) is itself a feedback channel — you see Lucy work *before* she speaks.
- **Roadmap:** a LangGraph.js planner behind `agent_search`, with `interrupt()`-based steering rendered through the same A2UI surface — same loop, longer horizon.

📍 `src/hooks/useVoiceSession.ts:404-443` · `liveSession.ts:186-194`

</div>

---

<!-- _class: cols dense -->

# Beyond the Chatbox · pillars 3 & 4

## How Apophasis answers the brief

<div class="pillar">

### 3 · Latency-Optimized Rendering

> *"KV cache or local execution (Gemma 4 / Muse Spark) for fluid, zero-lag UX."*

We don't ship a GPU — we ship **streaming everywhere**:

- **Bidirectional Live audio** — first audio token plays before Lucy finishes thinking; server-side VAD makes interruption native.
- **Surface-first feedback** — `render_surface` typically fires *before* the first audio chunk; the UI never waits on tokens to confirm "I heard you."
- **Parallel search fan-out** — `search_web` hits Brave + Tavily + Exa concurrently, dedups, returns the union (`server/searchProxy.ts`).
- **10-min LRU cache + per-IP rate limit** on every proxied search (`server/searchCache.ts`, `searchRateLimit.ts`).
- **Browser-direct calls** for CORS-open providers — one fewer hop for music + video.
- **Roadmap:** local-Gemma fallback for token mint + tiny clarifications, keeping Cloud Run for heavy tools.

</div>

<div class="pillar">

### 4 · Tool-Enabled Interfaces

> *"UI that doesn't just display data but provides interactive hooks for agents to execute cross-app workflows."*

- Every A2UI surface **is** an interactive hook: `Button`s and `Slider`s carry `actions` that route through `setActionListener` straight back into Gemini's tool loop.
- One conversation can chain *cross-domain* tools — `search_places` → `search_video` → `search_music` — with the surface as the steering wheel.
- The `respond_in_voice` tool exists purely so chat-only turns close cleanly under `mode:'ANY'` — proof that the UI ↔ tool contract is the primary loop, voice is one channel of it.
- **Roadmap:** wrap selected tools as **MCP** servers so Lucy can drive third-party apps with the same A2UI vocabulary.

📍 `src/a2ui/processor.ts` · `src/lib/search/registry.ts`

</div>

---

## Alignment with the 2026 generative-UI stack

| Framework / protocol | Apophasis status                                                                                          |
|----------------------|-----------------------------------------------------------------------------------------------------------|
| **A2UI (Google)**    | ✅ **Shipped today** via `@a2ui/react v0.9`. Custom catalog (`APOPHASIS_CATALOG_ID`) maps Lucy's components to React renderers. |
| **MCP Apps**         | 🛠 **Roadmap (Phase 4).** Wrap `search_*` + a planner-driven `agent_search` as MCP servers — same UI vocabulary, broader workflows. |
| **AG-UI / CopilotKit** | 🔁 **Same problem, different solution.** Our voice-first loop + LangGraph.js planner over an SSE side-channel achieves the same agent ↔ frontend wiring without the React-copilot abstraction. |

> The brief asks for prototypes that *push the boundaries of how users interact with AI*. Apophasis pushes on the dimension chat can't reach: **the things you can only describe by gesture, by tweak, by "no, more like this."**

---

## Roadmap & ask

### Next iteration (in flight)
- **`agent_search` planner** — LangGraph.js `StateGraph` behind a single new Live tool, streaming A2UI patches over SSE so multi-step queries don't make Lucy go silent.
- **`interrupt()`-based steering** — the planner renders a planner-namespaced surface; the user steers; resume value flows back through the same submit path.
- **MCP wrapping** — make Lucy's tools portable beyond this app.

### Try it
- 🌐 **Live:** <https://lucy-blob-nvfgf6doka-uc.a.run.app/>
- 📦 **Repo:** github · *lucy-blob* (private demo)
- 🎤 **Best prompt to start with:** *"I'm looking for a song… I don't remember the name…"*

---

<!-- _class: lead hero -->
<!-- _paginate: false -->
<!-- _footer: '' -->
<!-- _backgroundImage: "linear-gradient(120deg, rgba(10,11,20,0.55) 0%, rgba(10,11,20,0.85) 60%), url('assets/hero-closing.png')" -->

# Thank you.

## Apophasis — describe the absence, find the thing.
