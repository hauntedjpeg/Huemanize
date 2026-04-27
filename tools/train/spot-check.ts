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

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const hexes = args.length ? args : ['#000000', '#0000ff']
  for (const h of hexes) await checkOne(h)
}

main().catch((e) => { console.error(e); process.exit(1) })
