import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { clampChroma } from 'culori'
import {
  loadCacheForSet, toOklch, findAnchorStep, mean, median, percentile,
  circularMeanDeg, angularDiff,
  STANDARD_STEPS, DATA_DIR, HERE, type StandardStep, type OklchPoint, type CacheEntry,
} from './lib.ts'

const PLUGIN_TABLES_PATH = join(HERE, '..', '..', 'src', 'plugin', 'uicolors-tables.ts')

const HUE_BANDS = 12  // 30° each
const BAND_WIDTH = 360 / HUE_BANDS

const VIVIDNESS_BUCKET_EDGES = [0.45, 0.8]

function hueToBand(h: number): number {
  return Math.floor(((h % 360) + 360) % 360 / BAND_WIDTH)
}

/** Input chroma as a fraction of the sRGB gamut max at this (L, H). 0 → achromatic, 1 → at the gamut edge. */
function vividnessOf(l: number, c: number, h: number): number {
  const max = clampChroma({ mode: 'oklch', l, c: 1, h }, 'oklch').c ?? 0
  return max > 0 ? Math.min(1, c / max) : 0
}

const NATURAL_ANCHOR_V_THRESHOLD = 0.95
const NATURAL_ANCHOR_L_TOLERANCE = 0.10

/** L at which the sRGB gamut chroma is maximized for this hue. */
function bandPeakL(h: number): number {
  let bestL = 0.5, bestC = 0
  for (let l = 0.05; l <= 0.97; l += 0.005) {
    const c = clampChroma({ mode: 'oklch', l, c: 1, h }, 'oklch').c ?? 0
    if (c > bestC) { bestC = c; bestL = l }
  }
  return bestL
}

interface PerStepStats {
  count: number
  l: { mean: number; median: number; min: number; max: number; stdev: number }
  cRatio: { mean: number; median: number }  // C_step / C_input (when C_input > 0)
  hDrift: { meanDeg: number; medianDeg: number }  // signed degrees from input hue
  cAbsMean: number  // for grays where ratio is undefined
}

interface BandStepKey { band: number; step: StandardStep }

// Achromatic input-L bins. The API uses three distinct ladder shapes for grays, keyed by
// input.L (not anchor): a "dark canonical" scale (e.g. #000000 → step 50=#f6f6f6, step
// 950=#262626), a "light canonical" scale (#ffffff → step 50=#fafafa, step 950=#292929),
// and a custom scale for mid-light grays like #bebebe. Bin edges 0.70 / 0.92 picked from
// training: #8f8f8f (L≈0.65) uses dark canonical, #bebebe (L=0.78) uses custom,
// #eeeeee (L=0.94) uses light canonical. The 0.70 edge buffers #8f8f8f away from the
// custom bin which only has one training sample.
const ACHROMATIC_L_BIN_EDGES = [0.70, 0.92]

function achromaticLBin(l: number): number {
  if (l < ACHROMATIC_L_BIN_EDGES[0]) return 0
  if (l < ACHROMATIC_L_BIN_EDGES[1]) return 1
  return 2
}

function summarize(entries: CacheEntry[]): {
  byBandStep: Map<string, PerStepStats>
  globalLByStep: Map<StandardStep, number>
  achromaticByStep: Map<StandardStep, OklchPoint>
  achromaticByLBin: number[][][]  // [bin][stepIdx] = list of output L values
} {
  const buckets = new Map<string, {
    L: number[]
    cRatio: number[]
    hDrift: number[]
    cAbs: number[]
  }>()

  const globalLBuckets = new Map<StandardStep, number[]>()
  const achromaticBuckets = new Map<StandardStep, { L: number[]; C: number[]; H: number[] }>()
  // [bin][stepIdx] = list of output L values for achromatic inputs in this bin.
  // Anchor doesn't matter — what matters is the input's L position on the gray axis.
  const achromaticByLBin: number[][][] = [
    STANDARD_STEPS.map(() => [] as number[]),
    STANDARD_STEPS.map(() => [] as number[]),
    STANDARD_STEPS.map(() => [] as number[]),
  ]

  for (const entry of entries) {
    const inputOklch = toOklch(entry.input)
    const isAchromatic = inputOklch.c < 0.01
    const band = hueToBand(inputOklch.h)
    const anchor = findAnchorStep(entry)

    for (const shade of entry.response.shades) {
      const step = Number(shade.name) as StandardStep
      const stepOklch = toOklch(shade.hexcode)

      // Skip anchor step for L ladder (input L != canonical L for that step)
      const isAnchor = step === anchor

      // Global L per step (excluding anchor cases)
      if (!isAnchor) {
        if (!globalLBuckets.has(step)) globalLBuckets.set(step, [])
        globalLBuckets.get(step)!.push(stepOklch.l)
      }

      if (isAchromatic) {
        if (!achromaticBuckets.has(step)) achromaticBuckets.set(step, { L: [], C: [], H: [] })
        const a = achromaticBuckets.get(step)!
        a.L.push(stepOklch.l); a.C.push(stepOklch.c); a.H.push(stepOklch.h)

        // Bucket by input L bin. Skip the anchor step itself — at the anchor step the API
        // substitutes the input, so its L equals input.L (a tautology that would skew the
        // bin's "typical anchor-step output L" toward the bin's typical input L).
        if (!isAnchor) {
          const bin = achromaticLBin(inputOklch.l)
          achromaticByLBin[bin][STANDARD_STEPS.indexOf(step)].push(stepOklch.l)
        }
        continue
      }

      const key = `${band}|${step}`
      if (!buckets.has(key)) buckets.set(key, { L: [], cRatio: [], hDrift: [], cAbs: [] })
      const b = buckets.get(key)!
      if (!isAnchor) b.L.push(stepOklch.l)
      b.cRatio.push(stepOklch.c / inputOklch.c)
      b.cAbs.push(stepOklch.c)
      b.hDrift.push(angularDiff(stepOklch.h, inputOklch.h))
    }
  }

  const byBandStep = new Map<string, PerStepStats>()
  for (const [key, b] of buckets) {
    const sorted = [...b.L].sort((a, b) => a - b)
    const m = mean(b.L)
    const variance = b.L.length > 1 ? mean(b.L.map((x) => (x - m) ** 2)) : 0
    byBandStep.set(key, {
      count: b.L.length,
      l: {
        mean: m,
        median: median(b.L),
        min: sorted[0],
        max: sorted.at(-1)!,
        stdev: Math.sqrt(variance),
      },
      cRatio: { mean: mean(b.cRatio), median: median(b.cRatio) },
      hDrift: { meanDeg: circularMeanDeg(b.hDrift.map((d) => (d + 360) % 360)), medianDeg: median(b.hDrift) },
      cAbsMean: mean(b.cAbs),
    })
  }

  const globalLByStep = new Map<StandardStep, number>()
  for (const [step, ls] of globalLBuckets) globalLByStep.set(step, median(ls))

  const achromaticByStep = new Map<StandardStep, OklchPoint>()
  for (const [step, b] of achromaticBuckets) {
    achromaticByStep.set(step, { l: median(b.L), c: median(b.C), h: median(b.H) })
  }

  return { byBandStep, globalLByStep, achromaticByStep, achromaticByLBin }
}

/**
 * Minimum fraction of in-band samples that must agree on an anchor for the
 * "natural anchor" override to fire for that band. Bands with weak modes (e.g.
 * yellow-orange band 2 has a 3-way tie among 500/300/600) get null and fall
 * through to existing bucket logic — picking arbitrarily would push real
 * out-of-mode inputs (#ffc251, #ffc075) toward the wrong anchor.
 */
const NATURAL_ANCHOR_MIN_PLURALITY = 0.5

/**
 * Per-band anchor for inputs at the hue's gamut-peak L (high vividness AND L near peak).
 * For these "natural anchor" inputs, hue alone determines the API's anchor placement —
 * sidesteps the bucket-2 input.L median which gets contaminated by mid-L vivid samples.
 *
 * Two-axis filter: v ≥ V_THRESHOLD gates "on the gamut shell"; |L − bandPeakL(h)| ≤ TOL
 * gates "at the *peak* of that shell, not its dark/light tails." Returns null for bands
 * with no qualifying samples or where no anchor commands a strict plurality (those fall
 * through to existing bucket logic).
 */
function computeNaturalAnchorAtPeak(entries: CacheEntry[]): (StandardStep | null)[] {
  const perBand: Map<StandardStep, number[]>[] = []
  for (let b = 0; b < HUE_BANDS; b++) perBand.push(new Map())
  for (const e of entries) {
    const inp = toOklch(e.input)
    if (inp.c < 0.01) continue
    const v = vividnessOf(inp.l, inp.c, inp.h)
    if (v < NATURAL_ANCHOR_V_THRESHOLD) continue
    const peakL = bandPeakL(inp.h)
    if (Math.abs(inp.l - peakL) > NATURAL_ANCHOR_L_TOLERANCE) continue
    const a = findAnchorStep(e)
    if (a == null) continue
    const band = hueToBand(inp.h)
    if (!perBand[band].has(a)) perBand[band].set(a, [])
    perBand[band].get(a)!.push(v)
  }
  const out: (StandardStep | null)[] = []
  for (let b = 0; b < HUE_BANDS; b++) {
    const m = perBand[b]
    if (m.size === 0) { out.push(null); continue }
    let total = 0
    let bestA: StandardStep = 600, bestN = -1, bestMaxV = -1
    for (const [a, vs] of m) {
      total += vs.length
      const maxV = Math.max(...vs)
      if (vs.length > bestN || (vs.length === bestN && maxV > bestMaxV)) {
        bestN = vs.length; bestMaxV = maxV; bestA = a
      }
    }
    out.push(bestN / total > NATURAL_ANCHOR_MIN_PLURALITY ? bestA : null)
  }
  return out
}

function buildTables(entries: CacheEntry[]) {
  const { byBandStep, globalLByStep, achromaticByStep, achromaticByLBin } = summarize(entries)

  // Per-band ladders: bands × steps
  const lLadder: number[][] = []  // [band][stepIdx]
  const cEnvelope: number[][] = []  // [band][stepIdx] = C_step / C_input
  const hDrift: number[][] = []   // [band][stepIdx] degrees

  for (let band = 0; band < HUE_BANDS; band++) {
    const lRow: number[] = []
    const cRow: number[] = []
    const hRow: number[] = []
    for (const step of STANDARD_STEPS) {
      const stat = byBandStep.get(`${band}|${step}`)
      if (stat) {
        lRow.push(stat.l.median)
        cRow.push(stat.cRatio.median)
        hRow.push(stat.hDrift.medianDeg)
      } else {
        lRow.push(globalLByStep.get(step) ?? 0.5)
        cRow.push(1)
        hRow.push(0)
      }
    }
    lLadder.push(lRow)
    cEnvelope.push(cRow)
    hDrift.push(hRow)
  }

  // Achromatic (grays) ladder — global pooled median, used as fallback.
  const achromatic = STANDARD_STEPS.map((step) => achromaticByStep.get(step) ?? { l: 0.5, c: 0, h: 0 })

  // Per-input-L-bin achromatic ladder: [bin][stepIdx]. Median output L per step within each
  // input.L bin. NaN where a bin has no samples for that step — filled at emit time using the
  // global achromatic ladder.
  const achromaticLPerLBin: number[][] = achromaticByLBin.map((binSteps) =>
    binSteps.map((ls) => ls.length ? median(ls) : NaN),
  )

  // Global L ladder (used as fallback / for default L when only L matters)
  const globalL = STANDARD_STEPS.map((step) => globalLByStep.get(step) ?? 0.5)

  // Per-anchor / per-band tables
  // For each (anchor_step, hue_band, target_step):
  //   - L: median absolute L of target step
  //   - C: median absolute C of target step
  //   - Hdrift: median (target_H - input_H)
  // Plus an anchor-only (anchor x band x step, ignoring other dims) for input.C scaling
  const perAnchor: {
    L: number[][][]   // [anchorIdx][band][stepIdx]
    C: number[][][]
    H: number[][][]
    inputCMedian: number[][]  // [anchorIdx][band] — typical input.C for inputs anchored here
    inputLMedian: number[][]  // [anchorIdx][band] — typical input.L for inputs anchored here
    sampleCount: number[][]   // [anchorIdx][band] — how many training samples we have
  } = {
    L: [], C: [], H: [], inputCMedian: [], inputLMedian: [], sampleCount: [],
  }

  for (let aIdx = 0; aIdx < STANDARD_STEPS.length; aIdx++) {
    const anchor = STANDARD_STEPS[aIdx]
    const lByBandStep: number[][][] = []
    const cByBandStep: number[][][] = []
    const hByBandStep: number[][][] = []
    const inputCs: number[][] = []
    const inputLs: number[][] = []

    for (let b = 0; b < HUE_BANDS; b++) {
      lByBandStep.push(STANDARD_STEPS.map(() => [] as number[]))
      cByBandStep.push(STANDARD_STEPS.map(() => [] as number[]))
      hByBandStep.push(STANDARD_STEPS.map(() => [] as number[]))
      inputCs.push([])
      inputLs.push([])
    }

    for (const entry of entries) {
      if (findAnchorStep(entry) !== anchor) continue
      const inp = toOklch(entry.input)
      if (inp.c < 0.01) continue
      const band = hueToBand(inp.h)
      inputCs[band].push(inp.c)
      inputLs[band].push(inp.l)
      for (const shade of entry.response.shades) {
        const sIdx = STANDARD_STEPS.indexOf(Number(shade.name) as StandardStep)
        if (sIdx < 0) continue
        const o = toOklch(shade.hexcode)
        lByBandStep[band][sIdx].push(o.l)
        cByBandStep[band][sIdx].push(o.c)
        hByBandStep[band][sIdx].push(angularDiff(o.h, inp.h))
      }
    }

    const lOut: number[][] = []
    const cOut: number[][] = []
    const hOut: number[][] = []
    const cMedRow: number[] = []
    const lMedRow: number[] = []
    const sampleRow: number[] = []
    for (let b = 0; b < HUE_BANDS; b++) {
      lOut.push(STANDARD_STEPS.map((_, i) => lByBandStep[b][i].length ? median(lByBandStep[b][i]) : NaN))
      cOut.push(STANDARD_STEPS.map((_, i) => cByBandStep[b][i].length ? median(cByBandStep[b][i]) : NaN))
      hOut.push(STANDARD_STEPS.map((_, i) => hByBandStep[b][i].length ? median(hByBandStep[b][i]) : NaN))
      cMedRow.push(inputCs[b].length ? median(inputCs[b]) : NaN)
      lMedRow.push(inputLs[b].length ? median(inputLs[b]) : NaN)
      sampleRow.push(inputCs[b].length)
    }
    perAnchor.L.push(lOut)
    perAnchor.C.push(cOut)
    perAnchor.H.push(hOut)
    perAnchor.inputCMedian.push(cMedRow)
    perAnchor.inputLMedian.push(lMedRow)
    perAnchor.sampleCount.push(sampleRow)
  }

  // ABSOLUTE chroma per (band, step), from non-anchor non-achromatic cases.
  const absoluteCBuckets: number[][][] = []
  for (let b = 0; b < HUE_BANDS; b++) {
    absoluteCBuckets.push(STANDARD_STEPS.map(() => [] as number[]))
  }
  for (const entry of entries) {
    const inp = toOklch(entry.input)
    if (inp.c < 0.01) continue
    const band = hueToBand(inp.h)
    const a = findAnchorStep(entry)
    for (const shade of entry.response.shades) {
      const step = Number(shade.name) as StandardStep
      if (step === a) continue
      const sIdx = STANDARD_STEPS.indexOf(step)
      const o = toOklch(shade.hexcode)
      absoluteCBuckets[band][sIdx].push(o.c)
    }
  }
  const absoluteCPerBand: number[][] = []
  for (let b = 0; b < HUE_BANDS; b++) {
    absoluteCPerBand.push(STANDARD_STEPS.map((_, i) =>
      absoluteCBuckets[b][i].length ? median(absoluteCBuckets[b][i]) : 0))
  }

  // Per-anchor + per-band + per-vividness-bucket tables.
  // Vividness = input.C / clampChroma(L_in, H_in).c — gamut-relative, 0..1.
  // Buckets: 0 = muted (v < 0.45), 1 = moderate (0.45–0.8), 2 = vivid-for-hue (>= 0.8).
  // Gamut-relative is essential for narrow-gamut hues (e.g. yellow at L=0.4 maxes at C≈0.08):
  // an absolute-C bucket scheme would never place such inputs in the vivid bucket even when
  // they sit at the gamut edge, mixing them with truly-medium-chroma inputs and washing out
  // both the chroma envelope and the per-cell input.L median used for anchor detection.
  const CHROMA_BUCKETS = 3
  const bucketOf = (l: number, c: number, h: number): number => {
    const v = vividnessOf(l, c, h)
    return v < VIVIDNESS_BUCKET_EDGES[0] ? 0 : v < VIVIDNESS_BUCKET_EDGES[1] ? 1 : 2
  }

  const lByABC: number[][][][] = []  // [anchor][band][bucket][step]
  const cByABC: number[][][][] = []
  const hByABC: number[][][][] = []
  const cntByABC: number[][][] = []  // [anchor][band][bucket] = sample count

  for (let a = 0; a < STANDARD_STEPS.length; a++) {
    const lAB: number[][][] = []
    const cAB: number[][][] = []
    const hAB: number[][][] = []
    const cntAB: number[][] = []
    for (let b = 0; b < HUE_BANDS; b++) {
      const lB: number[][] = []
      const cB: number[][] = []
      const hB: number[][] = []
      const cntB: number[] = []
      for (let bk = 0; bk < CHROMA_BUCKETS; bk++) {
        lB.push(STANDARD_STEPS.map(() => NaN))
        cB.push(STANDARD_STEPS.map(() => NaN))
        hB.push(STANDARD_STEPS.map(() => NaN))
        cntB.push(0)
      }
      lAB.push(lB); cAB.push(cB); hAB.push(hB); cntAB.push(cntB)
    }
    lByABC.push(lAB); cByABC.push(cAB); hByABC.push(hAB); cntByABC.push(cntAB)
  }

  // Collect raw values per bucket
  const rawL: number[][][][][] = []
  const rawC: number[][][][][] = []
  const rawH: number[][][][][] = []
  const rawInputL: number[][][][] = []  // [a][b][bk] = list of input L values
  const rawInputV: number[][][][] = []  // [a][b][bk] = list of input vividness values
  for (let a = 0; a < STANDARD_STEPS.length; a++) {
    rawL.push([]); rawC.push([]); rawH.push([]); rawInputL.push([]); rawInputV.push([])
    for (let b = 0; b < HUE_BANDS; b++) {
      rawL[a].push([]); rawC[a].push([]); rawH[a].push([]); rawInputL[a].push([]); rawInputV[a].push([])
      for (let bk = 0; bk < CHROMA_BUCKETS; bk++) {
        rawL[a][b].push(STANDARD_STEPS.map(() => [] as number[]))
        rawC[a][b].push(STANDARD_STEPS.map(() => [] as number[]))
        rawH[a][b].push(STANDARD_STEPS.map(() => [] as number[]))
        rawInputL[a][b].push([])
        rawInputV[a][b].push([])
      }
    }
  }
  for (const entry of entries) {
    const inp = toOklch(entry.input)
    if (inp.c < 0.01) continue
    const a = findAnchorStep(entry)
    if (a == null) continue
    const aIdx = STANDARD_STEPS.indexOf(a)
    const band = hueToBand(inp.h)
    const bk = bucketOf(inp.l, inp.c, inp.h)
    cntByABC[aIdx][band][bk]++
    rawInputL[aIdx][band][bk].push(inp.l)
    rawInputV[aIdx][band][bk].push(vividnessOf(inp.l, inp.c, inp.h))
    for (const shade of entry.response.shades) {
      const step = Number(shade.name) as StandardStep
      const sIdx = STANDARD_STEPS.indexOf(step)
      if (sIdx < 0) continue
      const o = toOklch(shade.hexcode)
      rawL[aIdx][band][bk][sIdx].push(o.l)
      rawC[aIdx][band][bk][sIdx].push(o.c)
      rawH[aIdx][band][bk][sIdx].push(angularDiff(o.h, inp.h))
    }
  }
  // Median input.L and input.V per (anchor, band, bucket) — used for hue/chroma-aware anchor detection.
  const inputLByABC: number[][][] = []
  const inputVByABC: number[][][] = []
  for (let a = 0; a < STANDARD_STEPS.length; a++) {
    inputLByABC.push([])
    inputVByABC.push([])
    for (let b = 0; b < HUE_BANDS; b++) {
      inputLByABC[a].push([])
      inputVByABC[a].push([])
      for (let bk = 0; bk < CHROMA_BUCKETS; bk++) {
        inputLByABC[a][b].push(rawInputL[a][b][bk].length ? median(rawInputL[a][b][bk]) : NaN)
        inputVByABC[a][b].push(rawInputV[a][b][bk].length ? median(rawInputV[a][b][bk]) : NaN)
      }
    }
  }
  for (let a = 0; a < STANDARD_STEPS.length; a++) {
    for (let b = 0; b < HUE_BANDS; b++) {
      for (let bk = 0; bk < CHROMA_BUCKETS; bk++) {
        for (let s = 0; s < STANDARD_STEPS.length; s++) {
          const lvs = rawL[a][b][bk][s]
          const cvs = rawC[a][b][bk][s]
          const hvs = rawH[a][b][bk][s]
          if (lvs.length) lByABC[a][b][bk][s] = median(lvs)
          if (cvs.length) cByABC[a][b][bk][s] = median(cvs)
          if (hvs.length) hByABC[a][b][bk][s] = median(hvs)
        }
      }
    }
  }

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      sampleCount: entries.length,
      hueBands: HUE_BANDS,
      bandWidthDeg: BAND_WIDTH,
      steps: STANDARD_STEPS,
      chromaBuckets: CHROMA_BUCKETS,
      vividnessBucketEdges: VIVIDNESS_BUCKET_EDGES,
    },
    lLadder,
    cEnvelope,
    hDrift,
    achromatic,
    achromaticLPerLBin,
    globalL,
    perAnchor,
    absoluteCPerBand,
    perAnchorBandChroma: { L: lByABC, C: cByABC, H: hByABC, sampleCount: cntByABC, inputL: inputLByABC, inputV: inputVByABC },
    naturalAnchorAtPeak: computeNaturalAnchorAtPeak(entries),
  }
}

function printSummary(entries: CacheEntry[]) {
  console.log(`\nLoaded ${entries.length} cached responses\n`)

  // How many had a clean anchor match?
  let withAnchor = 0
  const anchorCounts = new Map<StandardStep, number>()
  for (const e of entries) {
    const a = findAnchorStep(e)
    if (a !== null) {
      withAnchor++
      anchorCounts.set(a, (anchorCounts.get(a) ?? 0) + 1)
    }
  }
  console.log(`Anchor identified by exact-hex match: ${withAnchor}/${entries.length}`)
  console.log('Anchor distribution:')
  for (const step of STANDARD_STEPS) {
    const c = anchorCounts.get(step) ?? 0
    if (c > 0) console.log(`  ${String(step).padStart(3)}: ${c}`)
  }

  // L ladder by step (global)
  const globalLBuckets = new Map<StandardStep, number[]>()
  for (const e of entries) {
    for (const s of e.response.shades) {
      const step = Number(s.name) as StandardStep
      const o = toOklch(s.hexcode)
      if (!globalLBuckets.has(step)) globalLBuckets.set(step, [])
      globalLBuckets.get(step)!.push(o.l)
    }
  }
  console.log('\nGlobal L ladder excluding anchor cases (median, p10, p90):')
  const filteredLBuckets = new Map<StandardStep, number[]>()
  for (const e of entries) {
    const a = findAnchorStep(e)
    for (const s of e.response.shades) {
      const step = Number(s.name) as StandardStep
      if (step === a) continue
      const o = toOklch(s.hexcode)
      if (!filteredLBuckets.has(step)) filteredLBuckets.set(step, [])
      filteredLBuckets.get(step)!.push(o.l)
    }
  }
  for (const step of STANDARD_STEPS) {
    const ls = filteredLBuckets.get(step) ?? []
    console.log(`  ${String(step).padStart(3)}: ${median(ls).toFixed(3)} [${percentile(ls, 0.1).toFixed(3)} - ${percentile(ls, 0.9).toFixed(3)}] n=${ls.length}`)
  }

  // C envelope by step (median ratio C_step / C_input across all non-achromatic, non-anchor cases)
  console.log('\nC envelope (median C_step/C_input excluding anchor):')
  const cRatioBuckets = new Map<StandardStep, number[]>()
  for (const e of entries) {
    const a = findAnchorStep(e)
    const inp = toOklch(e.input)
    if (inp.c < 0.01) continue
    for (const s of e.response.shades) {
      const step = Number(s.name) as StandardStep
      if (step === a) continue
      const o = toOklch(s.hexcode)
      if (!cRatioBuckets.has(step)) cRatioBuckets.set(step, [])
      cRatioBuckets.get(step)!.push(o.c / inp.c)
    }
  }
  for (const step of STANDARD_STEPS) {
    const rs = cRatioBuckets.get(step) ?? []
    console.log(`  ${String(step).padStart(3)}: ${median(rs).toFixed(3)} [${percentile(rs, 0.1).toFixed(3)} - ${percentile(rs, 0.9).toFixed(3)}] n=${rs.length}`)
  }
}

function fillTable(table: number[][][], fallback: number): number[][][] {
  // For NaN cells, fill from neighbors (band-wise interpolation, then anchor-wise).
  const out = table.map((row) => row.map((col) => [...col]))
  for (let a = 0; a < out.length; a++) {
    for (let b = 0; b < out[a].length; b++) {
      for (let s = 0; s < out[a][b].length; s++) {
        if (!Number.isFinite(out[a][b][s])) {
          // Search outward by band first
          for (let off = 1; off < HUE_BANDS && !Number.isFinite(out[a][b][s]); off++) {
            const left = out[a][(b - off + HUE_BANDS) % HUE_BANDS][s]
            const right = out[a][(b + off) % HUE_BANDS][s]
            if (Number.isFinite(left)) out[a][b][s] = left
            else if (Number.isFinite(right)) out[a][b][s] = right
          }
          // Fall back to other anchors at same band/step
          if (!Number.isFinite(out[a][b][s])) {
            for (let aOff = 1; aOff < out.length && !Number.isFinite(out[a][b][s]); aOff++) {
              for (const aTry of [a - aOff, a + aOff]) {
                if (aTry < 0 || aTry >= out.length) continue
                if (Number.isFinite(out[aTry][b][s])) {
                  out[a][b][s] = out[aTry][b][s]
                  break
                }
              }
            }
          }
          if (!Number.isFinite(out[a][b][s])) out[a][b][s] = fallback
        }
      }
    }
  }
  return out
}

/**
 * Fill empty INPUT_L cells with the canonical L for that anchor step instead of cross-anchor
 * propagation. Anchor-cross fill is misleading here: an empty (anchor=50, band, bucket) cell
 * filled from anchor 100's typical input.L (~0.85) makes anchor 50 a tempting (and wrong) match
 * for any L≈0.85 input. Falling back to L_LADDER[anchor] keeps each anchor's "expected input L"
 * anchored to where that step actually sits on the ladder.
 */
function fillInputL(table: number[][][], anchorL: number[]): number[][][] {
  const out = table.map((aR) => aR.map((bR) => [...bR]))
  const A = out.length, B = out[0].length, BK = out[0][0].length
  for (let a = 0; a < A; a++) {
    for (let b = 0; b < B; b++) {
      for (let bk = 0; bk < BK; bk++) {
        if (Number.isFinite(out[a][b][bk])) continue
        // Try other buckets at same (a, b) — same anchor, just different vividness
        for (let bkOff = 1; bkOff < BK && !Number.isFinite(out[a][b][bk]); bkOff++) {
          for (const bkTry of [bk - bkOff, bk + bkOff]) {
            if (bkTry < 0 || bkTry >= BK) continue
            if (Number.isFinite(out[a][b][bkTry])) { out[a][b][bk] = out[a][b][bkTry]; break }
          }
        }
        // Try other bands at same (a, bk) — same anchor, neighboring hue
        if (!Number.isFinite(out[a][b][bk])) {
          for (let bOff = 1; bOff < B && !Number.isFinite(out[a][b][bk]); bOff++) {
            const left = out[a][(b - bOff + B) % B][bk]
            const right = out[a][(b + bOff) % B][bk]
            if (Number.isFinite(left)) out[a][b][bk] = left
            else if (Number.isFinite(right)) out[a][b][bk] = right
          }
        }
        // Final fallback: canonical L for this anchor step (NOT neighboring anchors)
        if (!Number.isFinite(out[a][b][bk])) out[a][b][bk] = anchorL[a]
      }
    }
  }
  return out
}

/**
 * Fill empty INPUT_V cells with the bucket's center vividness — empty cells should reflect
 * "what V do inputs in this bucket typically have?", not propagate from neighboring (a, b).
 * The bucket already constrains v to a known range, so the center is a principled default.
 */
function fillInputV(table: number[][][], bucketCenters: number[]): number[][][] {
  const out = table.map((aR) => aR.map((bR) => [...bR]))
  const A = out.length, B = out[0].length, BK = out[0][0].length
  for (let a = 0; a < A; a++) {
    for (let b = 0; b < B; b++) {
      for (let bk = 0; bk < BK; bk++) {
        if (Number.isFinite(out[a][b][bk])) continue
        // Try other bands at same (a, bk) — neighboring hues, same anchor + bucket
        for (let bOff = 1; bOff < B && !Number.isFinite(out[a][b][bk]); bOff++) {
          const left = out[a][(b - bOff + B) % B][bk]
          const right = out[a][(b + bOff) % B][bk]
          if (Number.isFinite(left)) out[a][b][bk] = left
          else if (Number.isFinite(right)) out[a][b][bk] = right
        }
        // Final fallback: bucket-center vividness
        if (!Number.isFinite(out[a][b][bk])) out[a][b][bk] = bucketCenters[bk]
      }
    }
  }
  return out
}

function fillVec3(table: number[][][], fallback: number): number[][][] {
  // Fill NaN cells in [a][b][bk] table by neighbors (bk → b → a → fallback).
  const out = table.map((aR) => aR.map((bR) => [...bR]))
  const A = out.length, B = out[0].length, BK = out[0][0].length
  for (let a = 0; a < A; a++) {
    for (let b = 0; b < B; b++) {
      for (let bk = 0; bk < BK; bk++) {
        if (Number.isFinite(out[a][b][bk])) continue
        for (let bkOff = 1; bkOff < BK && !Number.isFinite(out[a][b][bk]); bkOff++) {
          for (const bkTry of [bk - bkOff, bk + bkOff]) {
            if (bkTry < 0 || bkTry >= BK) continue
            if (Number.isFinite(out[a][b][bkTry])) { out[a][b][bk] = out[a][b][bkTry]; break }
          }
        }
        if (!Number.isFinite(out[a][b][bk])) {
          for (let bOff = 1; bOff < B && !Number.isFinite(out[a][b][bk]); bOff++) {
            const left = out[a][(b - bOff + B) % B][bk]
            const right = out[a][(b + bOff) % B][bk]
            if (Number.isFinite(left)) out[a][b][bk] = left
            else if (Number.isFinite(right)) out[a][b][bk] = right
          }
        }
        if (!Number.isFinite(out[a][b][bk])) {
          for (let aOff = 1; aOff < A && !Number.isFinite(out[a][b][bk]); aOff++) {
            for (const aTry of [a - aOff, a + aOff]) {
              if (aTry < 0 || aTry >= A) continue
              if (Number.isFinite(out[aTry][b][bk])) { out[a][b][bk] = out[aTry][b][bk]; break }
            }
          }
        }
        if (!Number.isFinite(out[a][b][bk])) out[a][b][bk] = fallback
      }
    }
  }
  return out
}

function fill4D(table: number[][][][], fallback: number): number[][][][] {
  // Fill NaN cells in [a][b][bk][s] table by:
  //   1) other chroma buckets at same (a, b, s)
  //   2) other bands at same (a, bk, s)
  //   3) other anchors at same (b, bk, s)
  //   4) fallback constant
  const out = table.map((aR) => aR.map((bR) => bR.map((bkR) => [...bkR])))
  const A = out.length, B = out[0].length, BK = out[0][0].length, S = out[0][0][0].length
  for (let a = 0; a < A; a++) {
    for (let b = 0; b < B; b++) {
      for (let bk = 0; bk < BK; bk++) {
        for (let s = 0; s < S; s++) {
          if (Number.isFinite(out[a][b][bk][s])) continue
          // Other chroma buckets first (preserves anchor + band locality)
          for (let bkOff = 1; bkOff < BK && !Number.isFinite(out[a][b][bk][s]); bkOff++) {
            for (const bkTry of [bk - bkOff, bk + bkOff]) {
              if (bkTry < 0 || bkTry >= BK) continue
              if (Number.isFinite(out[a][b][bkTry][s])) {
                out[a][b][bk][s] = out[a][b][bkTry][s]
                break
              }
            }
          }
          // Then other bands
          if (!Number.isFinite(out[a][b][bk][s])) {
            for (let bOff = 1; bOff < B && !Number.isFinite(out[a][b][bk][s]); bOff++) {
              const left = out[a][(b - bOff + B) % B][bk][s]
              const right = out[a][(b + bOff) % B][bk][s]
              if (Number.isFinite(left)) out[a][b][bk][s] = left
              else if (Number.isFinite(right)) out[a][b][bk][s] = right
            }
          }
          // Then other anchors
          if (!Number.isFinite(out[a][b][bk][s])) {
            for (let aOff = 1; aOff < A && !Number.isFinite(out[a][b][bk][s]); aOff++) {
              for (const aTry of [a - aOff, a + aOff]) {
                if (aTry < 0 || aTry >= A) continue
                if (Number.isFinite(out[aTry][b][bk][s])) {
                  out[a][b][bk][s] = out[aTry][b][bk][s]
                  break
                }
              }
            }
          }
          if (!Number.isFinite(out[a][b][bk][s])) out[a][b][bk][s] = fallback
        }
      }
    }
  }
  return out
}

function fillVec(table: number[][], fallback: number): number[][] {
  const out = table.map((row) => [...row])
  for (let a = 0; a < out.length; a++) {
    for (let b = 0; b < out[a].length; b++) {
      if (!Number.isFinite(out[a][b])) {
        for (let off = 1; off < HUE_BANDS && !Number.isFinite(out[a][b]); off++) {
          const left = out[a][(b - off + HUE_BANDS) % HUE_BANDS]
          const right = out[a][(b + off) % HUE_BANDS]
          if (Number.isFinite(left)) out[a][b] = left
          else if (Number.isFinite(right)) out[a][b] = right
        }
        if (!Number.isFinite(out[a][b])) {
          for (let aOff = 1; aOff < out.length && !Number.isFinite(out[a][b]); aOff++) {
            for (const aTry of [a - aOff, a + aOff]) {
              if (aTry < 0 || aTry >= out.length) continue
              if (Number.isFinite(out[aTry][b])) { out[a][b] = out[aTry][b]; break }
            }
          }
        }
        if (!Number.isFinite(out[a][b])) out[a][b] = fallback
      }
    }
  }
  return out
}

/**
 * Fill empty cells in [binIdx][stepIdx] with the global achromatic ladder for that step.
 * The mid bin in particular often has only one sample (#bebebe in current training); fully
 * empty bins or empty steps within a bin get the pooled global median — preferable to
 * borrowing from a neighboring bin which may use a structurally different ladder shape.
 */
function fillAchromaticLPerLBin(table: number[][], achromaticGlobal: { l: number; c: number; h: number }[]): number[][] {
  const out = table.map((row) => [...row])
  for (let bin = 0; bin < out.length; bin++) {
    for (let s = 0; s < out[bin].length; s++) {
      if (!Number.isFinite(out[bin][s])) out[bin][s] = achromaticGlobal[s]?.l ?? 0.5
    }
  }
  return out
}

function emitTypeScript(tables: ReturnType<typeof buildTables>): string {
  // Fill sparse cells in per-anchor tables before serializing.
  const filledL = fillTable(tables.perAnchor.L, 0.5)
  const filledC = fillTable(tables.perAnchor.C, 0.0)
  const filledH = fillTable(tables.perAnchor.H, 0.0)
  const filledInputC = fillVec(tables.perAnchor.inputCMedian, 0.05)
  const filledInputL = fillVec(tables.perAnchor.inputLMedian, 0.5)
  const filledAchromaticL = fillAchromaticLPerLBin(tables.achromaticLPerLBin, tables.achromatic)

  return `// Auto-generated from tools/train/analyze.ts on ${tables.meta.generatedAt}
// Source: ${tables.meta.sampleCount} cached uicolors.app responses
// Do not edit by hand — run \`pnpm train:analyze\` to regenerate.

export const STANDARD_STEPS = ${JSON.stringify(tables.meta.steps)} as const
export type StandardStep = (typeof STANDARD_STEPS)[number]

export const HUE_BANDS = ${tables.meta.hueBands}
export const BAND_WIDTH_DEG = ${tables.meta.bandWidthDeg}

// Median L per step, excluding cases where the input was anchored at that step.
export const L_LADDER: readonly number[] = ${JSON.stringify(tables.globalL)}

// Median L per [hueBand][step], excluding anchor cases.
export const L_LADDER_PER_BAND: readonly (readonly number[])[] = ${JSON.stringify(tables.lLadder)}

// Median C_step / C_input per [hueBand][step], excluding anchor and achromatic cases.
export const C_ENVELOPE_PER_BAND: readonly (readonly number[])[] = ${JSON.stringify(tables.cEnvelope)}

// Median signed hue offset (degrees) per [hueBand][step]: H_step - H_input.
export const H_DRIFT_PER_BAND: readonly (readonly number[])[] = ${JSON.stringify(tables.hDrift)}

// For achromatic inputs (input chroma < ~0.01): the (l, c, h) the API returns at each step.
// Pooled median across all gray training inputs. Used as fallback when a bin is empty.
export const ACHROMATIC_LADDER: readonly { l: number; c: number; h: number }[] = ${JSON.stringify(tables.achromatic)}

// Bin edges on input.L for the per-bin achromatic ladder lookup.
// L < edges[0] → dark canonical; L < edges[1] → custom (input-relative); else → light canonical.
export const ACHROMATIC_L_BIN_EDGES: readonly number[] = ${JSON.stringify(ACHROMATIC_L_BIN_EDGES)}

// Per-input-L-bin achromatic L ladder: [binIdx][stepIdx]. Median output L per step, bucketed
// by the input's L position. Bin 0 (dark, e.g. #000000–#8f8f8f): the API's "dark canonical"
// scale. Bin 2 (light, e.g. #eeeeee–#ffffff): the API's "light canonical" scale. Bin 1
// (custom mid-light range like #bebebe): an input-relative scale where the input's L sets
// the curve mid-point. Empty cells fall back to ACHROMATIC_LADDER.l.
export const ACHROMATIC_L_PER_L_BIN: readonly (readonly number[])[] = ${JSON.stringify(filledAchromaticL)}

// Per-anchor median L: [anchorIdx][hueBand][stepIdx]
export const L_PER_ANCHOR_BAND: readonly (readonly (readonly number[])[])[] = ${JSON.stringify(filledL)}

// Per-anchor median absolute C: [anchorIdx][hueBand][stepIdx]
export const C_PER_ANCHOR_BAND: readonly (readonly (readonly number[])[])[] = ${JSON.stringify(filledC)}

// Per-anchor median hue drift (signed deg): [anchorIdx][hueBand][stepIdx]
export const H_DRIFT_PER_ANCHOR_BAND: readonly (readonly (readonly number[])[])[] = ${JSON.stringify(filledH)}

// Median input.C across training samples anchored at this (anchor, band).
export const INPUT_C_MEDIAN_PER_ANCHOR_BAND: readonly (readonly number[])[] = ${JSON.stringify(filledInputC)}

// Median input.L across training samples anchored at this (anchor, band).
export const INPUT_L_MEDIAN_PER_ANCHOR_BAND: readonly (readonly number[])[] = ${JSON.stringify(filledInputL)}

// Median ABSOLUTE chroma per [hueBand][step], from non-anchor non-achromatic cases.
export const ABSOLUTE_C_PER_BAND: readonly (readonly number[])[] = ${JSON.stringify(tables.absoluteCPerBand)}

// Vividness bucket edges. Vividness = input.C / sRGB-gamut-max-C at (input.L, input.H).
// Bucket 0: v < edges[0] (muted). Bucket 1: edges[0] ≤ v < edges[1] (moderate).
// Bucket 2: v ≥ edges[1] (vivid-for-hue, i.e. near the gamut edge for the input's L/H).
export const VIVIDNESS_BUCKET_EDGES: readonly number[] = ${JSON.stringify(tables.meta.vividnessBucketEdges)}
export const CHROMA_BUCKETS = ${tables.meta.chromaBuckets}

// Median (L, C, H_drift) per [anchorIdx][band][chromaBucket][step] — fully filled.
export const L_PER_ABC: readonly (readonly (readonly (readonly number[])[])[])[] = ${JSON.stringify(fill4D(tables.perAnchorBandChroma.L, 0.5))}
export const C_PER_ABC: readonly (readonly (readonly (readonly number[])[])[])[] = ${JSON.stringify(fill4D(tables.perAnchorBandChroma.C, 0.0))}
export const H_DRIFT_PER_ABC: readonly (readonly (readonly (readonly number[])[])[])[] = ${JSON.stringify(fill4D(tables.perAnchorBandChroma.H, 0.0))}

// Sample count per [anchorIdx][band][chromaBucket] — for fallback decisions.
export const SAMPLE_COUNT_PER_ABC: readonly (readonly (readonly number[])[])[] = ${JSON.stringify(tables.perAnchorBandChroma.sampleCount)}

// Median INPUT L per [anchorIdx][band][chromaBucket] — for hue/chroma-aware anchor detection.
// Empty cells fall back to the anchor's canonical L (L_LADDER), not to a neighboring anchor's
// data. This prevents anchor 50 (zero training samples for chromatic inputs) from inheriting
// anchor 100's typical input.L and falsely matching mid-light inputs.
export const INPUT_L_PER_ABC: readonly (readonly (readonly number[])[])[] = ${JSON.stringify(fillInputL(tables.perAnchorBandChroma.inputL, tables.globalL))}

// Median INPUT vividness per [anchorIdx][band][chromaBucket]. Used alongside INPUT_L_PER_ABC
// for multi-feature anchor detection: vivid inputs (v≈1) match deeper anchors than naive nearest-L
// would suggest, since the API places gamut-pinned colors deeper on the scale.
// Empty cells fall back to the bucket's center vividness — an empty cell still has a known v range
// (defined by the bucket edges), so propagating from neighbors would be misleading.
export const INPUT_V_PER_ABC: readonly (readonly (readonly number[])[])[] = ${JSON.stringify(fillInputV(tables.perAnchorBandChroma.inputV, [VIVIDNESS_BUCKET_EDGES[0] / 2, (VIVIDNESS_BUCKET_EDGES[0] + VIVIDNESS_BUCKET_EDGES[1]) / 2, (VIVIDNESS_BUCKET_EDGES[1] + 1) / 2]))}

// Vividness threshold for "at the gamut shell" — inputs at or above this are candidates
// for the natural-anchor override (hue alone determines anchor).
export const NATURAL_ANCHOR_V_THRESHOLD = ${NATURAL_ANCHOR_V_THRESHOLD}

// Allowed |input.L − bandPeakL(h)| for the natural-anchor override to fire.
// v alone isn't enough: dark gamut-shell colors (e.g. #191700) have v=1 but anchor
// elsewhere; the L-filter requires inputs to be at the *peak* of the gamut shell.
export const NATURAL_ANCHOR_L_TOLERANCE = ${NATURAL_ANCHOR_L_TOLERANCE}

// Per-band L at which the sRGB gamut chroma peaks (sampled at band centers). Used at
// runtime to identify inputs at the gamut peak; emitted as a constant since clampChroma
// is too expensive to call on the detectAnchorStep hot path.
export const BAND_PEAK_L: readonly number[] = ${JSON.stringify(
    Array.from({ length: HUE_BANDS }, (_, b) => bandPeakL((b + 0.5) * BAND_WIDTH))
  )}

// Override anchor for inputs at gamut peak per band. null = no qualifying training
// samples in this band; falls through to standard bucket-2 logic.
export const NATURAL_ANCHOR_AT_PEAK: readonly (number | null)[] = ${JSON.stringify(tables.naturalAnchorAtPeak)}
`
}

async function main() {
  const entries = await loadCacheForSet('training')
  printSummary(entries)
  const tables = buildTables(entries)

  // Override tables.globalL with the anchor-excluded median (more accurate)
  const filteredLBuckets = new Map<StandardStep, number[]>()
  for (const e of entries) {
    const a = findAnchorStep(e)
    for (const s of e.response.shades) {
      const step = Number(s.name) as StandardStep
      if (step === a) continue
      const o = toOklch(s.hexcode)
      if (!filteredLBuckets.has(step)) filteredLBuckets.set(step, [])
      filteredLBuckets.get(step)!.push(o.l)
    }
  }
  tables.globalL = STANDARD_STEPS.map((step) => median(filteredLBuckets.get(step) ?? []))

  await mkdir(DATA_DIR, { recursive: true })
  const jsonPath = join(DATA_DIR, 'tables.json')
  await writeFile(jsonPath, JSON.stringify(tables, null, 2))
  console.log(`\nWrote tables to ${jsonPath}`)

  const tsContent = emitTypeScript(tables)
  await writeFile(PLUGIN_TABLES_PATH, tsContent)
  console.log(`Wrote TypeScript module to ${PLUGIN_TABLES_PATH}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
