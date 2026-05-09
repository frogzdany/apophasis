# syntax=docker/dockerfile:1.7

# ─── Stage 1: build the Vite SPA ────────────────────────────────────────────
FROM oven/bun:1.2-alpine AS builder
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json tsconfig.app.json tsconfig.node.json tsconfig.tests.json \
     vite.config.ts biome.json eslint.config.js index.html components.json ./
COPY src ./src
COPY public ./public

# Bypass `bun run build` (which is `tsc -b && vite build`) because tsc -b
# resolves tsconfig.json's references — including tsconfig.tests.json. The
# config file itself is copied above so rolldown can resolve the reference,
# but its `include` paths (tests/, vitest configs) are intentionally absent
# from the prod image. Restrict tsc -b to the app + node projects.
RUN bunx tsc -b tsconfig.app.json tsconfig.node.json && bunx vite build


# ─── Stage 2: runtime — Bun server + static assets ─────────────────────────
FROM oven/bun:1.2-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Production deps only. The server reads @google/genai and
# @google-cloud/storage at runtime.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY server ./server
# tsconfig.json + src/ are needed at runtime so Bun can resolve the `@/`
# path alias when server modules import shared code (notably
# src/gemini/liveConfig.ts, the single source of truth for Live config).
COPY tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY src ./src
COPY --from=builder /app/dist ./dist

# Cloud Run injects PORT; default to 8080 for local docker run.
ENV PORT=8080
ENV DIST_DIR=/app/dist
EXPOSE 8080

CMD ["bun", "run", "server/index.ts"]
