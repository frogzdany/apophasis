#!/usr/bin/env bun
/**
 * Generate slide imagery via Gemini 2.5 Flash Image (a.k.a. nano banana).
 *
 *   bun run gen-images.ts                 # generate any missing PNG
 *   bun run gen-images.ts --force         # regenerate everything
 *   bun run gen-images.ts --only=hero     # generate only matching ids
 *
 * Reads VITE_GEMINI_API_KEY from <repo>/.env.local.
 * Writes PNGs to ../assets/<file>.
 */
import { GoogleGenAI } from '@google/genai'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const ASSETS_DIR = resolve(__dirname, '..', 'assets')

interface ImageSpec {
  id: string
  file: string
  aspectRatio: string
  prompt: string
}

interface PromptsConfig {
  model: string
  common_style: string
  images: ImageSpec[]
}

function loadEnvKey(): string {
  const envPath = join(REPO_ROOT, '.env.local')
  if (!existsSync(envPath)) {
    throw new Error(`.env.local not found at ${envPath}`)
  }
  const content = readFileSync(envPath, 'utf8')
  const match = content.match(/^(?:VITE_)?GEMINI_API_KEY=(.+)$/m)
  if (!match) throw new Error('GEMINI_API_KEY not found in .env.local')
  return match[1].trim().replace(/^["']|["']$/g, '')
}

function parseFlags(argv: string[]): { force: boolean; only: string[] } {
  const force = argv.includes('--force')
  const only: string[] = []
  for (const arg of argv) {
    const m = arg.match(/^--only=(.+)$/)
    if (m) only.push(...m[1].split(','))
  }
  return { force, only }
}

async function generate(
  ai: GoogleGenAI,
  model: string,
  spec: ImageSpec,
  commonStyle: string,
): Promise<{ outPath: string; bytes: number }> {
  const fullPrompt = `${spec.prompt}\n\nStyle: ${commonStyle}`
  // The SDK's generateContent shape for image gen — generationConfig.responseModalities
  // forces an image-only response; aspectRatio comes through imageConfig.
  // biome-ignore lint/suspicious/noExplicitAny: SDK config typing trails the API
  const config: any = {
    responseModalities: ['IMAGE'],
    imageConfig: { aspectRatio: spec.aspectRatio },
  }
  const response = await ai.models.generateContent({
    model,
    contents: fullPrompt,
    config,
  })

  const parts = response.candidates?.[0]?.content?.parts ?? []
  const imagePart = parts.find((p) => p.inlineData?.data)
  if (!imagePart?.inlineData?.data) {
    throw new Error(
      `No image returned for ${spec.id}. Parts: ${JSON.stringify(parts).slice(0, 240)}`,
    )
  }
  const buffer = Buffer.from(imagePart.inlineData.data, 'base64')
  const outPath = join(ASSETS_DIR, spec.file)
  writeFileSync(outPath, buffer)
  return { outPath, bytes: buffer.length }
}

async function main(): Promise<void> {
  const { force, only } = parseFlags(process.argv.slice(2))
  const apiKey = loadEnvKey()
  const config: PromptsConfig = JSON.parse(
    readFileSync(join(__dirname, 'prompts.json'), 'utf8'),
  )

  if (!existsSync(ASSETS_DIR)) mkdirSync(ASSETS_DIR, { recursive: true })

  const ai = new GoogleGenAI({ apiKey })
  const targets = config.images.filter((img) => only.length === 0 || only.includes(img.id))

  console.log(
    `[nano-banana] model=${config.model}  targets=${targets.length}  force=${force}`,
  )

  let generated = 0
  let skipped = 0
  let failed = 0

  for (const spec of targets) {
    const outPath = join(ASSETS_DIR, spec.file)
    if (!force && existsSync(outPath)) {
      console.log(`  ✓ skip   ${spec.id} (exists)`)
      skipped++
      continue
    }
    process.stdout.write(`  · gen    ${spec.id} (${spec.aspectRatio}) ... `)
    try {
      const { bytes } = await generate(ai, config.model, spec, config.common_style)
      console.log(`done — ${(bytes / 1024).toFixed(0)} KB → ${spec.file}`)
      generated++
    } catch (err) {
      console.log('FAILED')
      console.error(`    ${err instanceof Error ? err.message : String(err)}`)
      failed++
    }
  }

  const cost = (generated * 0.039).toFixed(3)
  console.log(
    `\n[nano-banana] generated=${generated}  skipped=${skipped}  failed=${failed}  ~$${cost}`,
  )
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
