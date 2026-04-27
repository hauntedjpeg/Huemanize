import { oklch, parse, formatHex, clampChroma } from 'culori'
import { colornames as colorNameList } from 'color-name-list'
import { type ScaleStep, type ScaleEntry } from '../ui/types'
import {
  L_LADDER,
  ACHROMATIC_LADDER,
  HUE_BANDS,
  BAND_WIDTH_DEG,
  STANDARD_STEPS,
  L_PER_ABC,
  C_PER_ABC,
  H_DRIFT_PER_ABC,
  INPUT_L_PER_ABC,
  INPUT_V_PER_ABC,
  SAMPLE_COUNT_PER_ABC,
  VIVIDNESS_BUCKET_EDGES,
  NATURAL_ANCHOR_AT_PEAK,
  NATURAL_ANCHOR_V_THRESHOLD,
  NATURAL_ANCHOR_L_TOLERANCE,
  BAND_PEAK_L,
} from './uicolors-tables'

const ACHROMATIC_INPUT_C_THRESHOLD = 0.01

/**
 * When an achromatic input's L is more than this far from its anchor's canonical L
 * (L_LADDER[anchorIdx]), the per-step ladder is more accurate than input-relative
 * interpolation. The natural anchor-detection gap for a gray with L=0 (black) anchored
 * at step 950 is L_LADDER[950]≈0.27, so 0.15 is comfortably below that — but well above
 * the gap a typical "near-canonical" gray would produce.
 */
const ACHROMATIC_ABSOLUTE_FALLBACK_DL = 0.15

/**
 * Generate a Tailwind-style 50-950 color scale from a hex input.
 *
 * Trained against the uicolors.app `tailwindcss3` API. Input is pinned at the
 * detected (or chosen) anchor step; other steps use trained per-hue-band tables
 * for L (lightness), C (chroma envelope multiplier), and H (hue drift).
 */
export function generateScale(hex: string, anchorStep: ScaleStep): ScaleEntry[] {
  const parsed = parse(hex)
  if (!parsed) throw new Error('Invalid color')

  const inp = oklch(parsed)
  if (!inp) throw new Error('Could not convert to OKLCH')

  const lIn = inp.l ?? 0
  const cIn = inp.c ?? 0
  const hIn = inp.h ?? 0
  const isAchromatic = cIn < ACHROMATIC_INPUT_C_THRESHOLD

  const anchorIdx = STANDARD_STEPS.indexOf(anchorStep)
  const lastIdx = STANDARD_STEPS.length - 1

  // Hue band interpolation parameters (between adjacent bands).
  const { bandLow, bandHigh, t: bandT } = bandLookup(hIn)

  // Vividness bucket interpolation parameters (between adjacent buckets).
  const { bkLow, bkHigh, t: bkT } = bucketLookup(lIn, cIn, hIn)

  // Per-anchor + per-band + per-chroma-bucket lookups, with bilinear interpolation
  // across the (band, bucket) grid.
  const lookup4 = (table: typeof L_PER_ABC, i: number): number => {
    const a = table[anchorIdx][bandLow][bkLow][i]
    const b = table[anchorIdx][bandHigh][bkLow][i]
    const c = table[anchorIdx][bandLow][bkHigh][i]
    const d = table[anchorIdx][bandHigh][bkHigh][i]
    return lerp(lerp(a, b, bandT), lerp(c, d, bandT), bkT)
  }
  const lookupAngle = (table: typeof H_DRIFT_PER_ABC, i: number): number => {
    const a = table[anchorIdx][bandLow][bkLow][i]
    const b = table[anchorIdx][bandHigh][bkLow][i]
    const c = table[anchorIdx][bandLow][bkHigh][i]
    const d = table[anchorIdx][bandHigh][bkHigh][i]
    return lerpAngle(lerpAngle(a, b, bandT), lerpAngle(c, d, bandT), bkT)
  }

  const out: ScaleEntry[] = []

  for (let i = 0; i < STANDARD_STEPS.length; i++) {
    const step = STANDARD_STEPS[i]

    if (step === anchorStep) {
      out.push({ step, hex: formatHex({ mode: 'oklch', l: lIn, c: cIn, h: hIn }) ?? '#000000', isAnchor: true })
      continue
    }

    let l: number, c: number, h: number

    if (isAchromatic) {
      // Inputs whose L is far from this anchor's canonical L (e.g. pure black anchored at 950)
      // can't use the input-relative lerp — it would push every step toward lIn and crush the
      // far end of the scale. Fall back to absolute ladder values for non-anchor steps.
      if (Math.abs(lIn - L_LADDER[anchorIdx]) > ACHROMATIC_ABSOLUTE_FALLBACK_DL) {
        l = ACHROMATIC_LADDER[i].l
      } else {
        // Linear-through-input for grays whose L sits near the anchor's typical L.
        const lEndLight = ACHROMATIC_LADDER[0].l
        const lEndDark = ACHROMATIC_LADDER[lastIdx].l
        if (i < anchorIdx) {
          l = lerp(lEndLight, lIn, anchorIdx === 0 ? 0 : i / anchorIdx)
        } else if (i === lastIdx) {
          l = lEndDark
        } else if (anchorIdx >= lastIdx) {
          l = ACHROMATIC_LADDER[i].l
        } else {
          const dPenult = lastIdx - 1
          if (anchorIdx >= dPenult) {
            l = ACHROMATIC_LADDER[i].l
          } else {
            const t = (i - anchorIdx) / (dPenult - anchorIdx)
            l = lerp(lIn, ACHROMATIC_LADDER[dPenult].l, t)
          }
        }
      }
      c = 0
      h = 0
    } else {
      l = lookup4(L_PER_ABC, i)
      c = lookup4(C_PER_ABC, i)
      h = (hIn + lookupAngle(H_DRIFT_PER_ABC, i) + 360) % 360
    }

    // Keep chroma inside the sRGB gamut for this (l, h).
    const clamped = clampChroma({ mode: 'oklch', l, c, h }, 'oklch')
    const hexOut = formatHex({
      mode: 'oklch',
      l: clamped.l ?? l,
      c: clamped.c ?? 0,
      h: clamped.h ?? h,
    }) ?? '#000000'
    out.push({ step, hex: hexOut, isAnchor: false })
  }

  return out
}

/**
 * Weight on Δvividness² in the multi-feature anchor score: dist² = ΔL² + α·ΔV².
 *
 * Vividness is a tiebreaker for cases where multiple anchors have similar typical input L.
 * E.g. vivid orange #e58e00 (L≈0.72, v=1.0) matches step 400 (med L=0.72, V=0.87) and
 * step 500 (med L=0.78, V=1.0) on L alone, but the API anchors at 500. The V signal lets
 * us prefer the deeper (more saturation-loyal) anchor for gamut-pinned inputs.
 *
 * α=0.5 picked from a 0.0–2.0 sweep against the cached training+validation responses, paired
 * with center-based band interpolation: tied for best validation median (0.0144) and best
 * validation p95 (0.0670). Higher weights swap too aggressively and hurt anchor agreement.
 */
const ANCHOR_VIVIDNESS_WEIGHT = 0.5

/**
 * Detect the most appropriate anchor step for a given hex color.
 *
 * Trained on the API's actual anchor placements: for each (hue band, chroma
 * bucket) we know the typical (L, vividness) of inputs the API anchored at each step.
 * We pick the step minimizing weighted (ΔL² + α·ΔV²). The V term captures hue-aware
 * behavior like vivid bright orange anchoring at step 500 instead of step 400, where
 * both have similar typical L but step 500's typical V matches gamut-pinned inputs.
 */
export function detectAnchorStep(hex: string): ScaleStep {
  const parsed = parse(hex)
  if (!parsed) return 600

  const color = oklch(parsed)
  if (!color) return 600

  const l = color.l ?? 0.5
  const c = color.c ?? 0
  const h = color.h ?? 0

  // Achromatic: nearest L on global ladder (no hue band signal)
  if (c < 0.01) {
    let best: ScaleStep = 600
    let bestDist = Infinity
    for (let i = 0; i < STANDARD_STEPS.length; i++) {
      const dist = Math.abs(l - L_LADDER[i])
      if (dist < bestDist) {
        bestDist = dist
        best = STANDARD_STEPS[i]
      }
    }
    return best
  }

  const { bandLow, bandHigh, t: bandT } = bandLookup(h)
  const v = vividnessOf(l, c, h)

  // Natural-anchor override: at the per-hue gamut peak (high v AND L near peak),
  // hue alone determines the anchor. Sidesteps the bucket-2 input.L median, which
  // gets contaminated by mid-L vivid samples. Two-axis filter: v gates "on the
  // gamut shell"; L gates "at the *peak* of that shell, not its dark/light tails."
  // Picks the closer band's anchor rather than lerping indices: anchors are
  // categorical, so lerp(600, 400) → 500 would fabricate a midpoint that wasn't
  // observed in either band's training data (would push #ff00ff 600→500, e.g.).
  const peakL = lerp(BAND_PEAK_L[bandLow], BAND_PEAK_L[bandHigh], bandT)
  if (v >= NATURAL_ANCHOR_V_THRESHOLD && Math.abs(l - peakL) <= NATURAL_ANCHOR_L_TOLERANCE) {
    const useBand = bandT < 0.5 ? bandLow : bandHigh
    const a = NATURAL_ANCHOR_AT_PEAK[useBand]
    if (a != null) return a as ScaleStep
    // Closer band has no plurality-anchor evidence: fall through to bucket logic
    // rather than borrow from the far band, which may behave very differently.
  }

  const { bkLow, bkHigh, t: bkT } = bucketLookup(l, c, h)

  let best: ScaleStep = 600
  let bestScore = Infinity
  for (let i = 0; i < STANDARD_STEPS.length; i++) {
    // Skip anchors with no training evidence in any of the four interpolation cells.
    // Empty cells are filled by `fillInputL` so `generateScale`'s bilinear lookup
    // doesn't crash, but those filled values claim a perfect L match here that the
    // anchor has zero data to support.
    const totalSamples =
      SAMPLE_COUNT_PER_ABC[i][bandLow][bkLow] +
      SAMPLE_COUNT_PER_ABC[i][bandHigh][bkLow] +
      SAMPLE_COUNT_PER_ABC[i][bandLow][bkHigh] +
      SAMPLE_COUNT_PER_ABC[i][bandHigh][bkHigh]
    if (totalSamples === 0) continue

    // Typical input.L and input.V for this step, interpolated across (band, bucket).
    const lA = INPUT_L_PER_ABC[i][bandLow][bkLow]
    const lB = INPUT_L_PER_ABC[i][bandHigh][bkLow]
    const lC = INPUT_L_PER_ABC[i][bandLow][bkHigh]
    const lD = INPUT_L_PER_ABC[i][bandHigh][bkHigh]
    const targetL = lerp(lerp(lA, lB, bandT), lerp(lC, lD, bandT), bkT)

    const vA = INPUT_V_PER_ABC[i][bandLow][bkLow]
    const vB = INPUT_V_PER_ABC[i][bandHigh][bkLow]
    const vC = INPUT_V_PER_ABC[i][bandLow][bkHigh]
    const vD = INPUT_V_PER_ABC[i][bandHigh][bkHigh]
    const targetV = lerp(lerp(vA, vB, bandT), lerp(vC, vD, bandT), bkT)

    const dL = l - targetL
    const dV = v - targetV
    const score = dL * dL + ANCHOR_VIVIDNESS_WEIGHT * dV * dV
    if (score < bestScore) {
      bestScore = score
      best = STANDARD_STEPS[i]
    }
  }
  return best
}

/**
 * Suggest a color name by finding the nearest match in the color-name-list
 * database (~30,000 named colors) using RGB Euclidean distance.
 */
export function suggestColorName(hex: string): string {
  const parsed = parse(hex)
  if (!parsed) return 'Color'

  const norm = hex.replace('#', '')
  if (norm.length !== 6) return 'Color'

  const tr = parseInt(norm.slice(0, 2), 16)
  const tg = parseInt(norm.slice(2, 4), 16)
  const tb = parseInt(norm.slice(4, 6), 16)

  let bestName = 'Color'
  let bestDist = Infinity

  for (const entry of colorNameList) {
    const h = entry.hex.replace('#', '')
    if (h.length !== 6) continue
    const dr = tr - parseInt(h.slice(0, 2), 16)
    const dg = tg - parseInt(h.slice(2, 4), 16)
    const db = tb - parseInt(h.slice(4, 6), 16)
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      bestName = entry.name
    }
  }

  return bestName
}

/**
 * Center-based band interpolation: each band's stat represents its center hue (not its left edge).
 * For 30° bands, band 0 represents H≈15°, band 1 represents H≈45°, etc.
 *
 * Why this matters: the median of band 0 (samples in [0°, 30°)) is biased toward the band's
 * center. Treating it as the value at H=0° (left-edge interpretation) means an input at H=29.95°
 * gets ~100% weighted toward band 1, which is wrong — H=29.95° is actually closest to band 0's
 * center (15°) and band 1's center (45°) at roughly equal distance (so it should be a 50/50 blend).
 *
 * This is critical at hue boundaries where the underlying behavior is non-smooth (e.g., the
 * red/orange boundary at H=30° has very different hue-drift behavior in the two bands for vivid
 * dark colors).
 */
function bandLookup(hue: number): { bandLow: number; bandHigh: number; t: number } {
  const normalized = ((hue % 360) + 360) % 360
  // Subtract 0.5 so band centers (h = (i+0.5)*W) map to integer band indices
  const bandFloat = normalized / BAND_WIDTH_DEG - 0.5
  const bandLowRaw = Math.floor(bandFloat)
  const bandLow = ((bandLowRaw % HUE_BANDS) + HUE_BANDS) % HUE_BANDS
  const bandHigh = (bandLow + 1) % HUE_BANDS
  const t = bandFloat - bandLowRaw
  return { bandLow, bandHigh, t }
}

/**
 * Map an input's gamut-relative vividness to a fractional bucket index for smooth
 * interpolation between the 3 vividness buckets. Vividness = input.C / max-C-at-(L,H);
 * 0 → achromatic, 1 → at the sRGB gamut edge for that L/H.
 *
 * Bucket 0 (muted, v < EDGES[0]) is centered at the midpoint of [0, EDGES[0]].
 * Bucket 1 (moderate) at the midpoint of [EDGES[0], EDGES[1]].
 * Bucket 2 (vivid-for-hue) at the midpoint of [EDGES[1], 1].
 */
function bucketLookup(l: number, c: number, h: number): { bkLow: number; bkHigh: number; t: number } {
  const v = vividnessOf(l, c, h)
  const e0 = VIVIDNESS_BUCKET_EDGES[0]
  const e1 = VIVIDNESS_BUCKET_EDGES[1]
  const centers = [e0 / 2, (e0 + e1) / 2, (e1 + 1) / 2]
  if (v <= centers[0]) return { bkLow: 0, bkHigh: 0, t: 0 }
  if (v >= centers[2]) return { bkLow: 2, bkHigh: 2, t: 0 }
  if (v < centers[1]) {
    return { bkLow: 0, bkHigh: 1, t: (v - centers[0]) / (centers[1] - centers[0]) }
  }
  return { bkLow: 1, bkHigh: 2, t: (v - centers[1]) / (centers[2] - centers[1]) }
}

function vividnessOf(l: number, c: number, h: number): number {
  const max = clampChroma({ mode: 'oklch', l, c: 1, h }, 'oklch').c ?? 0
  return max > 0 ? Math.min(1, c / max) : 0
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Linear interpolation between two angle deltas (in degrees), shortest-path. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return a + diff * t
}
