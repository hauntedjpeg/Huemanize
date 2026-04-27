import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { clampChroma } from 'culori'
import { DATA_DIR, STANDARD_STEPS, mean, median, percentile, type StandardStep } from './lib.ts'

interface StepResult {
  step: StandardStep
  apiHex: string; ourHex: string
  apiL: number; apiC: number; apiH: number
  ourL: number; ourC: number; ourH: number
  deltaE: number
  dL: number; dC: number; dH: number
  exactMatch: boolean
}

interface InputResult {
  input: string
  inputL: number; inputC: number; inputH: number
  apiAnchor: StandardStep | null
  ourAnchor: StandardStep
  steps: StepResult[]
  maxDeltaE: number
  meanDeltaE: number
}

const HUE_BANDS = 12
const BAND_WIDTH = 360 / HUE_BANDS
const VIVIDNESS_BUCKET_EDGES = [0.45, 0.8]

function hueToBand(h: number): number {
  return Math.floor(((h % 360) + 360) % 360 / BAND_WIDTH)
}

function vividnessOf(l: number, c: number, h: number): number {
  const max = clampChroma({ mode: 'oklch', l, c: 1, h }, 'oklch').c ?? 0
  return max > 0 ? Math.min(1, c / max) : 0
}

function lBand(l: number): string {
  if (l < 0.25) return 'very-dark'
  if (l < 0.45) return 'dark'
  if (l < 0.65) return 'mid'
  if (l < 0.85) return 'light'
  return 'very-light'
}

function vividBucket(v: number): string {
  if (v < VIVIDNESS_BUCKET_EDGES[0]) return 'muted'
  if (v < VIVIDNESS_BUCKET_EDGES[1]) return 'moderate'
  return 'vivid'
}

interface ClusterStats {
  key: string
  count: number
  medianMaxDE: number
  p95MaxDE: number
  meanMaxDE: number
  worst: { input: string; maxDeltaE: number; worstStep: StandardStep; dL: number; dC: number; dH: number }[]
}

function clusterBy(results: InputResult[], keyFn: (r: InputResult) => string | null): ClusterStats[] {
  const groups = new Map<string, InputResult[]>()
  for (const r of results) {
    const key = keyFn(r)
    if (key == null) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(r)
  }
  const out: ClusterStats[] = []
  for (const [key, rs] of groups) {
    const dEs = rs.map((r) => r.maxDeltaE)
    const worst = [...rs].sort((a, b) => b.maxDeltaE - a.maxDeltaE).slice(0, 3).map((r) => {
      const ws = r.steps.reduce((a, b) => (a.deltaE > b.deltaE ? a : b))
      return { input: r.input, maxDeltaE: r.maxDeltaE, worstStep: ws.step, dL: ws.dL, dC: ws.dC, dH: ws.dH }
    })
    out.push({
      key,
      count: rs.length,
      medianMaxDE: median(dEs),
      p95MaxDE: percentile(dEs, 0.95),
      meanMaxDE: mean(dEs),
      worst,
    })
  }
  return out.sort((a, b) => b.medianMaxDE - a.medianMaxDE)
}

function printClusters(title: string, clusters: ClusterStats[], minCount = 1): void {
  console.log(`\n## ${title}`)
  console.log(`  ${'cluster'.padEnd(36)}  count   median   p95     worst inputs (input  maxΔE  step  dL/dC/dH°)`)
  for (const c of clusters) {
    if (c.count < minCount) continue
    const worstStr = c.worst.map((w) =>
      `${w.input}@${w.worstStep}(${w.maxDeltaE.toFixed(2)})`).join(', ')
    console.log(
      `  ${c.key.padEnd(36)}  ${String(c.count).padStart(5)}   ${c.medianMaxDE.toFixed(4)}  ${c.p95MaxDE.toFixed(4)}  ${worstStr}`,
    )
  }
}

async function main(): Promise<void> {
  const setArg = process.argv.find((a) => a.startsWith('--set='))?.slice(6) ?? 'training'
  const fileArg = process.argv.find((a) => a.startsWith('--file='))?.slice(7)
  const path = fileArg ?? join(DATA_DIR, setArg === 'training' ? 'baseline-training.json' : 'baseline-validation.json')

  const raw = await readFile(path, 'utf-8')
  const data = JSON.parse(raw) as { results: InputResult[] }
  const results = data.results
  console.log(`Clustering ${results.length} inputs from ${path}\n`)

  const achromatic = results.filter((r) => r.inputC < 0.01)
  const chromatic = results.filter((r) => r.inputC >= 0.01)

  console.log(`  achromatic: ${achromatic.length}`)
  console.log(`  chromatic:  ${chromatic.length}`)

  // 1. Achromatic by API anchor — surfaces the #000000 issue
  printClusters(
    'Achromatic, by API anchor step',
    clusterBy(achromatic, (r) => r.apiAnchor != null ? `anchor=${r.apiAnchor}` : null),
  )

  // 2. Achromatic by input L band
  printClusters(
    'Achromatic, by input L band',
    clusterBy(achromatic, (r) => `L=${lBand(r.inputL)}`),
  )

  // 3. Chromatic by L band
  printClusters(
    'Chromatic, by input L band',
    clusterBy(chromatic, (r) => `L=${lBand(r.inputL)}`),
  )

  // 4. Chromatic by vividness bucket
  printClusters(
    'Chromatic, by vividness bucket',
    clusterBy(chromatic, (r) => `v=${vividBucket(vividnessOf(r.inputL, r.inputC, r.inputH))}`),
  )

  // 5. Chromatic by L band x vividness — the most actionable view
  printClusters(
    'Chromatic, by L band x vividness',
    clusterBy(chromatic, (r) => `${lBand(r.inputL)}+${vividBucket(vividnessOf(r.inputL, r.inputC, r.inputH))}`),
    3,
  )

  // 6. Chromatic by hue band x vividness — finds hue-specific issues
  printClusters(
    'Chromatic, by hue band x vividness (top 12)',
    clusterBy(chromatic, (r) => `h${hueToBand(r.inputH)}+${vividBucket(vividnessOf(r.inputL, r.inputC, r.inputH))}`).slice(0, 12),
    3,
  )

  // 7. Per-step ΔE within each L band — surfaces e.g. "step 500 of dark inputs is bad"
  console.log('\n## Per-step median ΔE within input L bands')
  console.log(`  ${'L band'.padEnd(12)}  ` + STANDARD_STEPS.map((s) => String(s).padStart(6)).join('  '))
  for (const band of ['very-dark', 'dark', 'mid', 'light', 'very-light']) {
    const rs = results.filter((r) => lBand(r.inputL) === band)
    if (rs.length === 0) continue
    const cells = STANDARD_STEPS.map((step) => {
      const dEs = rs.flatMap((r) => r.steps.filter((s) => s.step === step).map((s) => s.deltaE))
      return median(dEs).toFixed(4)
    })
    console.log(`  ${band.padEnd(12)}  ` + cells.map((c) => c.padStart(6)).join('  '))
  }

  // 8. Top-30 worst inputs with full context
  console.log('\n## Top-30 worst inputs (with cluster keys)')
  const worst30 = [...results].sort((a, b) => b.maxDeltaE - a.maxDeltaE).slice(0, 30)
  for (const r of worst30) {
    const v = vividnessOf(r.inputL, r.inputC, r.inputH)
    const isAchro = r.inputC < 0.01
    const tag = isAchro ? `achro/anchor=${r.apiAnchor}` : `${lBand(r.inputL)}/${vividBucket(v)}/h${hueToBand(r.inputH)}`
    const ws = r.steps.reduce((a, b) => (a.deltaE > b.deltaE ? a : b))
    console.log(
      `  ${r.input}  maxΔE=${r.maxDeltaE.toFixed(4)}  step=${ws.step}  api=${ws.apiHex} ours=${ws.ourHex}  dL=${ws.dL.toFixed(3)} dC=${ws.dC.toFixed(3)} dH=${ws.dH.toFixed(1)}°  [${tag}]`,
    )
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
