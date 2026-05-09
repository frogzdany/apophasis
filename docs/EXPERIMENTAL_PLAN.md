# Experimental Branch Plan — `experimental/agent-harness`

Branch parted from `main@521ea5e` (= the deployed POC, image
`lucy-blob:20260509-1602` on Cloud Run service `lucy-blob` in project
`apophasis`, region `us-central1`). The `poc/*` branches receive
production fixes; this branch holds in-flight WIP plus the LangGraph.js
harness work to be retaken later.

Created: 2026-05-09.

---

## 1. Current WIP carried into this branch

Four files have uncommitted-then-committed routing/UX edits that were
already in progress before the harness pivot. They are *not* the harness
itself — they are the substrate the harness will sit on top of.

- `src/gemini/systemInstructions.ts`
  - Maps-first place routing: any place-anchored query (named, themed,
    "where can I…", "places with X") goes through `search_places_google`
    first, even when the wording is descriptive. Empty Maps response is
    expected to fall back to a visual search automatically.
  - Visual-fallback rule: when any domain tool returns 0 results, Lucy
    is told to retry once with `search_products` (English-translated
    query if needed) before asking the user to clarify.
  - "No redundant panels" rule: after a domain selector is submitted,
    don't open a second clarifier panel — go straight to the search or
    render exactly one short refinement surface.
  - Mirrored in EN + ES blocks.
- `src/hooks/useVoiceSession.ts`
  - `emptyStreakRef` counter to short-circuit infinite empty retries.
  - On surface create, drop any *other* open surface first to avoid
    stacking domain-selector + refinement panels.
  - Query-label cleanup so chips read like a search box (only `args.query`
    when present, instead of joining hl/gl/location).
  - Transparent visual fallback: when a search provider returns 0, the
    handler quietly retries through Brave Images and feeds the synthetic
    summary back into Lucy's `sendToolResponse` so she narrates the
    fallback rather than going silent.
- `src/lib/messages.ts`
  - Adds `event.searchVisualFallback` strings (EN + ES).
- `src/lib/search/providers/products.ts`
  - Reframes the `search_products` tool description as "the universal
    visual search" so Gemini Live picks it as a fallback, not just a
    product-specific tool.

These edits are **independent of LangGraph** — they should still apply
once the harness lands. If the harness ships a more general fallback
mechanism, the empty-streak / visual-fallback code in `useVoiceSession`
may become redundant; revisit then.

---

## 2. Harness direction (from 2026-05-09 design memo)

**Decision.** Lucy keeps her existing Gemini Live tool surface; agentic
orchestration is layered *behind* her via one new Live tool plus an SSE
side-channel — not in place of her.

**Why.** Live's `mode:'ANY'` (one tool call per turn) and the
requirement that `sendToolResponse` close the turn make it impossible to
run a multi-step planner *inside* a single Live tool call without
making Lucy go silent. Out-of-band streaming is the only way to keep
voice snappy AND let the planner take 2–5 s to finish.

### Tool surface

Add ONE new Live tool alongside the existing `search_*` set — do NOT
replace them. Concrete fast paths (clear song match, named place)
shouldn't pay the planner overhead.

```ts
agent_search({ goal, hints?, location?, thread_id?, resume? })
```

The handler in `useVoiceSession.ts`:

1. ACKs immediately with `{ status: 'queued', thread_id }` so
   `sendToolResponse` resolves and Lucy's voice can start.
2. Opens an SSE stream to the planner host.
3. Pushes raw A2UI patches + gallery results down the SSE into the
   *same* surface processor used by Live tools (namespaced
   `planner:<id>` surfaceIds). Single source of truth.

### Planner

Server-side LangGraph.js `StateGraph`. Nodes use async-generator tools,
`streamMode: ["custom", "tools", "updates"]`, and
`config.writer(...)` to push raw patches.

### Steering / human-in-loop

`interrupt(steerPayload)` from a `humanInLoop` node →
planner-namespaced A2UI surface in the browser → user submit goes
through the existing `setActionListener` path → resume value returns as

```ts
agent_search({ thread_id, resume: dataModel })
// →
graph.invoke(new Command({ resume }), { configurable: { thread_id } })
```

### Voice/planner timing rule

When Lucy calls `agent_search`, she must say **one short bridging
sentence** ("déjame ver" / "one sec") and end her turn. The panel
carries the rest. Codify in `systemInstructions.ts`.

### Routing rule

- Ambiguous / thematic / multi-domain / "muéstrame…" → `agent_search`.
- Concrete music/book/place-by-name → existing `search_*` tools.

### Constraints already validated against this design

- `src/gemini/liveConfig.ts:79` — `mode:'ANY'` is fine, `agent_search`
  is a real function call.
- `src/hooks/useVoiceSession.ts:332` — `sendToolResponse` closing the
  turn is fine because of the immediate ack.
- `src/hooks/useVoiceSession.ts:212–271` — A2UI surface processor is
  the single source of truth; planner reuses it via namespaced surface
  ids, not a parallel one.
- `src/hooks/useVoiceSession.ts:404–443` — `setActionListener` already
  converts surface submits into user-text turns; repurpose as the
  resume channel for `interrupt()`.

(Line numbers are from the WIP state on this branch — re-check before
editing, the file has had additions since.)

---

## 3. Alternate GCP deploy target

The POC service `lucy-blob` on `apophasis` must keep serving traffic.
Three options for the experimental deploy, ranked by iteration speed:

### A. Tagged revision on the same Cloud Run service (recommended for early iteration)

```
gcloud run deploy lucy-blob \
  --image us-central1-docker.pkg.dev/apophasis/lucy-blob/lucy-blob:harness-<sha> \
  --tag harness --no-traffic --region us-central1
```

Hit it via `harness---lucy-blob-<hash>-uc.a.run.app`. No new infra,
zero blast radius on the POC, fastest deploy cycle. Requires a Cloud
Run revision tag carve-out in `infra/main.tf` if/when we move from
imperative `gcloud` to terraform-managed traffic.

### B. Separate Cloud Run service in `apophasis`

E.g. `lucy-blob-experimental`. Cheap, just a `service_name` var
override and a duplicated Terraform service block. Same Artifact
Registry repo, separate revisions, separate URL. Pick this when the
harness stabilizes enough that we want a stable URL to share.

### C. Separate GCP project

Full isolation (separate AR repo, secrets, budget, IAM). More setup;
only worth it if the harness starts pulling enough cost or risk to
warrant a clean budget boundary.

**Default plan:** start with A while the planner is unstable; promote
to B once we want a sharable URL. Don't bother with C unless cost or
risk demands it.

---

## 4. Open decisions (still pending)

- Scaffolding slice — Phase 0 quick-fix only, Phase 0+1, or spike-only?
- Planner host — in the existing Bun server, separate Cloud Run service,
  or browser?
- Whether Phase 4 wraps tools as MCP servers to concretely demonstrate
  the hackathon brief's "MCP Apps" line.

---

## 5. Where to resume

When picking this branch back up:

1. `git checkout experimental/agent-harness` and re-read this file.
2. Re-validate the line-numbered references in §2 — the POC main may
   have moved; the harness work needs to rebase cleanly onto the latest
   `main`.
3. Confirm the routing-rule edits in `systemInstructions.ts` haven't
   been superseded by changes that landed on `poc/*` and merged into
   `main`. If they have, drop the redundant ones from this branch.
4. Pick the scaffolding slice (Phase 0 / 0+1 / spike) and the planner
   host before writing any harness code.
5. Spike `agent_search` ack + SSE stream end-to-end *before* wiring
   LangGraph, to validate the timing assumption in §2.
