# Search-tool test suite

A small, opinionated suite that validates each Gemini search tool with
**real upstream calls** (no mocks, no fixtures). The point is to answer
three questions, per tool, on every run:

1. Are we calling the upstream API correctly?
2. Are the args Lucy emits correctly processed by the handler?
3. Is the output usable for the model (Lucy can speak it / open it / play it)?

## Run

```bash
bun run test:tools
```

This boots the real Bun proxy on a random port (via Vitest globalSetup),
points the browser providers at it, and exercises every tool against its
upstream. Tests skip with a clear reason if their key isn't configured.

To see proxy logs while debugging:

```bash
LUCY_TEST_VERBOSE=1 bun run test:tools
```

## Layout

```
tests/
  helpers/
    env.ts            — loads .env.local, exposes hasKey() / skipMissing()
    runProxy.ts       — boots Bun proxy on a random free port + fetch monkey-patch
    globalSetup.ts    — Vitest hook: starts proxy once, sets LUCY_TEST_PROXY_URL
    setupFile.ts      — per-worker hook: installs the relative-fetch proxy
    expects.ts        — shared "Lucy-ready" assertions
  tools/
    search_music.test.ts
    search_video.test.ts
    search_web.test.ts
    search_books.test.ts
    search_places.test.ts
    search_products.test.ts
```

## The five-act test shape (every tool follows this)

1. **Registration** — provider is in `SEARCH_PROVIDERS`, `declaration.name`
   matches the tool name, `kind` is correct.
2. **Input contract** — handler accepts the exact arg shape Lucy emits.
3. **Schema-valid output** — real call returns ≥ 1 result; every result
   passes `SearchResultSchema.safeParse`.
4. **Model-friendliness** — top result is "Lucy-ready":
   - `title` non-empty, no raw HTML
   - actionable (one of: `externalUrl`, `preview`, `imageUrl`)
   - `description` ≤ 500 chars
5. **Edge cases** — empty query → `[]` (not throw); `max_results` cap respected.

Plus a tool-specific extra (the "what makes THIS tool useful" assertion):

| Tool              | Tool-specific extra                                               |
|-------------------|-------------------------------------------------------------------|
| `search_music`    | At least 1 of top 3 has `preview.kind === 'audio'`                |
| `search_video`    | Top result's `externalUrl` is a `youtube.com/watch?v=...` URL     |
| `search_web`      | `provenance` reports all three lanes (brave/tavily/exa)           |
| `search_books`    | Top result has either a `description` or a `subtitle` to speak    |
| `search_places`   | Top result's address mentions the location hint; rating present   |
| `search_products` | Top result has both a `price` facet and a `store` (subtitle)      |

## Adding a new tool — checklist

1. Drop a file in `src/lib/search/providers/<name>.ts`.
2. Register it in `src/lib/search/registry.ts`.
3. (If keyed) add a branch in `server/searchProxy.ts`.
4. Copy any file under `tests/tools/` as a template; rename and:
   - swap the import to your provider
   - pick a stable known-good input (table this in the file header)
   - replace the tool-specific extra with the one assertion that defines
     "this tool is useful for Lucy"
5. Add the new env-key check to `skipReason()` if the provider is keyed.
6. `bun run test:tools` — confirm green locally before merging.

## Why no fixtures?

Fixtures rot. The whole point of this suite is to catch the kind of
upstream rug-pull we just hit (`engine=google_books` → unsupported). A
fixture-based test would have happily passed against a stale recorded
response while production silently broke. The trade-off is real:

- **Slow** (~20s per full run, network-bound)
- **Costs SerpApi credits** (a few per run)
- **Skipped tests on keyless dev machines** (handled gracefully)

That's the right trade for a six-tool suite. If the suite grows past
~30 tests we'll revisit.

## Why `fileParallelism: false`?

Two reasons:
1. SerpApi has a low concurrent-request limit; parallel files spike it.
2. The proxy's 10-min LRU is process-wide; sequential runs let later
   tests benefit from earlier-test cache fills, dropping cost on reruns.

## Schema as the contract

`src/lib/search/schemas.ts` is the canonical Zod definition. Every test
hands its results to `SearchResultSchema.safeParse`; every proxy
response to `SearchProxyResponseSchema.safeParse`. Both are `.strict()`
at the top level so adding a new field anywhere fails the suite,
forcing an intentional schema bump.
