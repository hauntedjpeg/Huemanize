import { mkdir, writeFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateSamples, type SampleSet } from './samples.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = join(HERE, 'cache')
const API_BASE = 'https://uicolors.app/api/v1/color-scales/tailwindcss3/generate'
const CONCURRENCY = 4

interface CliArgs {
  set: SampleSet
  force: boolean
  limit: number | null
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  let set: SampleSet = 'training'
  let force = false
  let limit: number | null = null
  for (const arg of args) {
    if (arg === '--force') force = true
    else if (arg.startsWith('--set=')) set = arg.slice(6) as SampleSet
    else if (arg.startsWith('--limit=')) limit = Number(arg.slice(8))
  }
  return { set, force, limit }
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true } catch { return false }
}

async function fetchOne(hex: string, apiKey: string): Promise<unknown> {
  const noHash = hex.replace('#', '').toLowerCase()
  const url = `${API_BASE}/${noHash}`

  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'content-type': 'application/json' },
    })

    if (res.ok) return await res.json()

    if (res.status === 401 || res.status === 403) {
      throw new Error(`Auth failed (${res.status}): check UICOLORS_API_KEY`)
    }

    if (res.status === 429 || res.status >= 500) {
      const wait = 2 ** attempt * 500 + Math.random() * 250
      await new Promise((r) => setTimeout(r, wait))
      continue
    }

    const body = await res.text().catch(() => '<unreadable>')
    throw new Error(`Fetch ${noHash} failed ${res.status}: ${body.slice(0, 200)}`)
  }

  throw new Error(`Fetch ${hex} exhausted retries`)
}

async function processOne(hex: string, force: boolean, apiKey: string): Promise<'cached' | 'fetched' | 'error'> {
  const noHash = hex.replace('#', '').toLowerCase()
  const cachePath = join(CACHE_DIR, `${noHash}.json`)

  if (!force && (await exists(cachePath))) return 'cached'

  try {
    const data = await fetchOne(hex, apiKey)
    await writeFile(cachePath, JSON.stringify({ input: hex, response: data, fetchedAt: new Date().toISOString() }, null, 2))
    return 'fetched'
  } catch (e) {
    console.error(`  [error] ${hex}: ${e instanceof Error ? e.message : String(e)}`)
    return 'error'
  }
}

async function main() {
  const apiKey = process.env.UICOLORS_API_KEY
  if (!apiKey) throw new Error('UICOLORS_API_KEY missing — check tools/train/.env')

  const { set, force, limit } = parseArgs()
  await mkdir(CACHE_DIR, { recursive: true })

  let samples = generateSamples(set).map((s) => s.hex)
  if (limit) samples = samples.slice(0, limit)

  console.log(`Fetching ${samples.length} '${set}' samples (concurrency=${CONCURRENCY}, force=${force})`)

  let cached = 0, fetched = 0, errored = 0, done = 0
  const queue = [...samples]
  const inFlight: Promise<void>[] = []

  async function worker() {
    while (queue.length > 0) {
      const hex = queue.shift()!
      const result = await processOne(hex, force, apiKey!)
      done++
      if (result === 'cached') cached++
      else if (result === 'fetched') fetched++
      else errored++
      if (done % 10 === 0 || done === samples.length) {
        process.stdout.write(`  ${done}/${samples.length} (cached=${cached} fetched=${fetched} errors=${errored})\n`)
      }
    }
  }

  for (let i = 0; i < CONCURRENCY; i++) inFlight.push(worker())
  await Promise.all(inFlight)

  console.log(`\nDone. cached=${cached} fetched=${fetched} errors=${errored}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
