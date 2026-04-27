import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import {
  loadCacheForSet, toOklch, findAnchorStep, mean, median, percentile,
  STANDARD_STEPS, DATA_DIR, type StandardStep, type CacheEntry,
} from './lib.ts'
import { generateScale, detectAnchorStep } from '../../src/plugin/color.ts'
import type { ScaleStep } from '../../src/ui/types.ts'

interface StepResult {
  step: StandardStep
  apiHex: string
  ourHex: string
  apiL: number; apiC: number; apiH: number
  ourL: number; ourC: number; ourH: number
  deltaE: number   // OKLCH Euclidean (a/b form)
  dL: number; dC: number; dH: number  // signed channel deltas
  exactMatch: boolean
}

interface InputResult {
  input: string
  inputL: number; inputC: number; inputH: number
  apiAnchor: StandardStep | null
  ourAnchor: ScaleStep
  steps: StepResult[]
  maxDeltaE: number
  meanDeltaE: number
}

function deltaEOklch(
  a: { l: number; c: number; h: number },
  b: { l: number; c: number; h: number },
): number {
  // Convert to (L, a, b) and use Euclidean distance.
  const aRad = (a.h * Math.PI) / 180
  const bRad = (b.h * Math.PI) / 180
  const aA = a.c * Math.cos(aRad), aB = a.c * Math.sin(aRad)
  const bA = b.c * Math.cos(bRad), bB = b.c * Math.sin(bRad)
  const dL = a.l - b.l, dA = aA - bA, dB = aB - bB
  return Math.sqrt(dL * dL + dA * dA + dB * dB)
}

function angularDiff(a: number, b: number): number {
  let d = (a - b) % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

function compareEntry(entry: CacheEntry, useAutoAnchor: boolean): InputResult {
  const inp = toOklch(entry.input)
  const apiAnchor = findAnchorStep(entry)

  // Two modes:
  // - useAutoAnchor=false: use the API's anchor (tests our color generation in isolation)
  // - useAutoAnchor=true: use our auto-detected anchor (simulates real-world plugin usage)
  const ourAnchor = useAutoAnchor
    ? detectAnchorStep(entry.input)
    : ((apiAnchor ?? 600) as ScaleStep)
  const ourScale = generateScale(entry.input, ourAnchor)

  const steps: StepResult[] = []
  for (const shade of entry.response.shades) {
    const step = Number(shade.name) as StandardStep
    const ourEntry = ourScale.find((s) => s.step === step)
    if (!ourEntry) continue
    const apiOk = toOklch(shade.hexcode)
    const ourOk = toOklch(ourEntry.hex)
    const dE = deltaEOklch(apiOk, ourOk)
    steps.push({
      step,
      apiHex: shade.hexcode.toLowerCase(),
      ourHex: ourEntry.hex.toLowerCase(),
      apiL: apiOk.l, apiC: apiOk.c, apiH: apiOk.h,
      ourL: ourOk.l, ourC: ourOk.c, ourH: ourOk.h,
      deltaE: dE,
      dL: ourOk.l - apiOk.l,
      dC: ourOk.c - apiOk.c,
      dH: angularDiff(ourOk.h, apiOk.h),
      exactMatch: apiOk.l > 0 && ourEntry.hex.toLowerCase() === shade.hexcode.toLowerCase(),
    })
  }

  const dEs = steps.map((s) => s.deltaE)
  return {
    input: entry.input.toLowerCase(),
    inputL: inp.l, inputC: inp.c, inputH: inp.h,
    apiAnchor,
    ourAnchor,
    steps,
    maxDeltaE: Math.max(...dEs),
    meanDeltaE: mean(dEs),
  }
}

async function main() {
  const setArg = process.argv.find((a) => a.startsWith('--set='))
  const set = (setArg?.slice(6) ?? 'training') as 'training' | 'validation'
  const useAutoAnchor = process.argv.includes('--auto-anchor')
  const entries = await loadCacheForSet(set)
  console.log(`Comparing algorithm vs ${entries.length} '${set}' cached responses${useAutoAnchor ? ' (using AUTO-detected anchor)' : ' (using API anchor)'}...\n`)

  const results: InputResult[] = []
  for (const e of entries) {
    try {
      results.push(compareEntry(e, useAutoAnchor))
    } catch (err) {
      console.error(`  failed for ${e.input}: ${err}`)
    }
  }

  // Aggregate
  const allDeltas = results.flatMap((r) => r.steps.map((s) => s.deltaE))
  const exactCount = results.flatMap((r) => r.steps).filter((s) => s.exactMatch).length
  const totalSteps = results.flatMap((r) => r.steps).length

  console.log('Overall ΔE in OKLCH (Lab Euclidean):')
  console.log(`  median:  ${median(allDeltas).toFixed(4)}`)
  console.log(`  mean:    ${mean(allDeltas).toFixed(4)}`)
  console.log(`  p90:     ${percentile(allDeltas, 0.90).toFixed(4)}`)
  console.log(`  p95:     ${percentile(allDeltas, 0.95).toFixed(4)}`)
  console.log(`  p99:     ${percentile(allDeltas, 0.99).toFixed(4)}`)
  console.log(`  max:     ${Math.max(...allDeltas).toFixed(4)}`)
  console.log(`  exact-hex matches: ${exactCount}/${totalSteps} (${(100 * exactCount / totalSteps).toFixed(1)}%)`)

  // Per-step breakdown
  console.log('\nPer-step median / p95 ΔE:')
  for (const step of STANDARD_STEPS) {
    const ds = results.flatMap((r) => r.steps.filter((s) => s.step === step).map((s) => s.deltaE))
    if (ds.length === 0) continue
    console.log(`  ${String(step).padStart(3)}: median=${median(ds).toFixed(4)}  p95=${percentile(ds, 0.95).toFixed(4)}  max=${Math.max(...ds).toFixed(4)}`)
  }

  // Worst 10 inputs
  const worst = [...results].sort((a, b) => b.maxDeltaE - a.maxDeltaE).slice(0, 10)
  console.log('\nWorst 10 inputs by maxΔE:')
  for (const w of worst) {
    const worstStep = w.steps.reduce((a, b) => (a.deltaE > b.deltaE ? a : b))
    console.log(`  ${w.input}  maxΔE=${w.maxDeltaE.toFixed(4)} at step ${worstStep.step}  api=${worstStep.apiHex} ours=${worstStep.ourHex}  dL=${worstStep.dL.toFixed(3)} dC=${worstStep.dC.toFixed(3)} dH=${worstStep.dH.toFixed(1)}°`)
  }

  // Persist for the report
  await mkdir(DATA_DIR, { recursive: true })
  const outPath = join(DATA_DIR, 'compare-results.json')
  await writeFile(outPath, JSON.stringify({ results }, null, 2))
  console.log(`\nResults saved to ${outPath}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
