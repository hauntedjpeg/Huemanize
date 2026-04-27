import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  CACHE_DIR, STANDARD_STEPS, toOklch, findAnchorStep, median,
  type CacheEntry,
} from './lib.ts'
import { generateScale, detectAnchorStep } from '../../src/plugin/color.ts'

// Inline copy of compare.ts's deltaEOklch — Lab Euclidean from OKLCH.
function deltaEOklch(
  a: { l: number; c: number; h: number },
  b: { l: number; c: number; h: number },
): number {
  const aRad = (a.h * Math.PI) / 180
  const bRad = (b.h * Math.PI) / 180
  const aA = a.c * Math.cos(aRad), aB = a.c * Math.sin(aRad)
  const bA = b.c * Math.cos(bRad), bB = b.c * Math.sin(bRad)
  const dL = a.l - b.l, dA = aA - bA, dB = aB - bB
  return Math.sqrt(dL * dL + dA * dA + dB * dB)
}

async function checkOne(rawHex: string): Promise<void> {
  const norm = rawHex.toLowerCase().replace(/^#/, '')
  const hex = `#${norm}`
  const path = join(CACHE_DIR, `${norm}.json`)

  let entry: CacheEntry
  try {
    entry = JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    console.error(`No cache for ${hex} at ${path}. Run 'pnpm train:fetch' first.`)
    return
  }

  const apiAnchor = findAnchorStep(entry)
  const ourAnchor = detectAnchorStep(hex)
  const ourScale = generateScale(hex, ourAnchor)

  console.log(`\n=== ${hex} ===`)
  console.log(`  api anchor: ${apiAnchor ?? '(no exact match)'}`)
  console.log(`  our anchor: ${ourAnchor}`)
  console.log(`  step  apiHex     ourHex     ΔE`)

  const dEs: number[] = []
  for (const step of STANDARD_STEPS) {
    const shade = entry.response.shades.find((s) => Number(s.name) === step)
    const ours = ourScale.find((s) => s.step === step)
    if (!shade || !ours) continue
    const apiOk = toOklch(shade.hexcode)
    const ourOk = toOklch(ours.hex)
    const dE = deltaEOklch(apiOk, ourOk)
    dEs.push(dE)
    console.log(
      `  ${String(step).padStart(4)}  ${shade.hexcode.toLowerCase().padEnd(9)}  ${ours.hex.toLowerCase().padEnd(9)}  ${dE.toFixed(4)}`,
    )
  }
  const maxDE = Math.max(...dEs)
  console.log(`  -- median ΔE: ${median(dEs).toFixed(4)}, max ΔE: ${maxDE.toFixed(4)}`)
}

// Default marquee inputs: pure black/white (achromatic edge), pure RGB primaries (gamut-extreme
// chromatics), and mid-light grays that exercise the bin-1 (custom) achromatic ladder.
const DEFAULT_HEXES = [
  '#000000', '#ffffff',
  '#ff0000', '#00ff00', '#0000ff',
  '#7f7f7f', '#bebebe', '#d7d7d7',
]

async function checkOneCollect(rawHex: string, maxAllowed: number | null): Promise<{ maxDE: number; failed: boolean }> {
  const norm = rawHex.toLowerCase().replace(/^#/, '')
  const hex = `#${norm}`
  const path = join(CACHE_DIR, `${norm}.json`)

  let entry: CacheEntry
  try {
    entry = JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    console.error(`No cache for ${hex} at ${path}. Run 'pnpm train:fetch' first.`)
    return { maxDE: Infinity, failed: true }
  }

  await checkOne(rawHex)

  // Re-derive maxDE from the same data so we can apply the threshold
  const ourAnchor = detectAnchorStep(hex)
  const ourScale = generateScale(hex, ourAnchor)
  let maxDE = 0
  for (const step of STANDARD_STEPS) {
    const shade = entry.response.shades.find((s) => Number(s.name) === step)
    const ours = ourScale.find((s) => s.step === step)
    if (!shade || !ours) continue
    const apiOk = toOklch(shade.hexcode)
    const ourOk = toOklch(ours.hex)
    const dE = deltaEOklch(apiOk, ourOk)
    if (dE > maxDE) maxDE = dE
  }
  const failed = maxAllowed != null && maxDE > maxAllowed
  return { maxDE, failed }
}

async function main(): Promise<void> {
  const flags = process.argv.slice(2).filter((a) => a.startsWith('--'))
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const hexes = args.length ? args : DEFAULT_HEXES

  const maxArg = flags.find((a) => a.startsWith('--max-delta-e='))
  const maxAllowed = maxArg ? Number(maxArg.slice('--max-delta-e='.length)) : null

  let anyFailed = false
  let worstDE = 0
  let worstHex = ''
  for (const h of hexes) {
    const { maxDE, failed } = await checkOneCollect(h, maxAllowed)
    if (failed) anyFailed = true
    if (maxDE > worstDE) { worstDE = maxDE; worstHex = h }
  }

  if (maxAllowed != null) {
    console.log(`\n----`)
    console.log(`Threshold: maxΔE ≤ ${maxAllowed.toFixed(4)}`)
    console.log(`Worst: ${worstHex} maxΔE=${worstDE.toFixed(4)}`)
    if (anyFailed) {
      console.error(`FAILED: at least one input exceeded maxΔE threshold`)
      process.exit(1)
    } else {
      console.log(`PASSED`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
