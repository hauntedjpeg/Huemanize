import { oklch, formatHex, parse } from 'culori'
import { colornames as colorNameList } from 'color-name-list'
import { SCALE_STEPS, type ScaleStep, type ScaleEntry } from '../ui/types'

/**
 * Generate a Tailwind-style 50-950 color scale from a hex input.
 *
 * Pipeline: hex -> OKLCH -> generate 11 OKLCH colors -> hex[]
 *
 * The input color is pinned at `anchorStep`. Steps lighter than the anchor
 * interpolate toward white; steps darker interpolate toward black. Chroma
 * tapers naturally toward the extremes (OKLCH gamut narrows near L=0 and L=1).
 */
export function generateScale(hex: string, anchorStep: ScaleStep): ScaleEntry[] {
  const parsed = parse(hex)
  if (!parsed) throw new Error('Invalid color')

  const anchor = oklch(parsed)
  if (!anchor) throw new Error('Could not convert to OKLCH')

  const anchorL = anchor.l ?? 0.5
  const anchorC = anchor.c ?? 0
  const anchorH = anchor.h ?? 0
  const isAchromatic = anchorC < 0.008

  const anchorIndex = SCALE_STEPS.indexOf(anchorStep)

  return SCALE_STEPS.map((step, index) => {
    let l: number
    let c: number

    if (index === anchorIndex) {
      l = anchorL
      c = anchorC
    } else if (index < anchorIndex) {
      // Lighter segment: t goes 0 (step 50) → 1 (anchor).
      // 0.97 keeps 50 from being pure white and retains a hint of hue.
      const t = index / anchorIndex
      l = lerp(0.97, anchorL, t)
      const minChromaRatio = 0.06
      c = isAchromatic ? 0 : anchorC * (minChromaRatio + (1 - minChromaRatio) * t)
    } else {
      // Darker segment: t goes 0 (anchor) → 1 (step 950).
      // Dark end is capped at 0.18 but always kept below anchorL so the
      // scale stays monotonically darker even for very dark anchor colors.
      const darkEndL = Math.min(0.18, anchorL * 0.4)
      const t = (index - anchorIndex) / (SCALE_STEPS.length - 1 - anchorIndex)
      l = lerp(anchorL, darkEndL, t)
      c = isAchromatic ? 0 : anchorC * chromaFactor(l, anchorL)
    }

    const result = formatHex({ mode: 'oklch', l, c, h: anchorH })

    return {
      step,
      hex: result || '#000000',
      isAnchor: index === anchorIndex,
    }
  })
}

/**
 * Chroma scaling factor based on distance from anchor lightness.
 * Tapers chroma toward white (L=1) and black (L=0) using a parabolic curve,
 * mimicking how the OKLCH gamut naturally narrows at the extremes.
 */
function chromaFactor(l: number, anchorL: number): number {
  const maxDist = Math.max(anchorL, 1 - anchorL)
  if (maxDist === 0) return 0
  const factor = 1 - Math.pow((l - anchorL) / maxDist, 2)
  return Math.max(0.01, factor)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Detect the most appropriate anchor step for a given hex color based on its
 * OKLCH lightness. Used to auto-set a smart default when a new color is entered.
 */
export function detectAnchorStep(hex: string): ScaleStep {
  const parsed = parse(hex)
  if (!parsed) return 600

  const color = oklch(parsed)
  if (!color) return 600

  const l = color.l ?? 0.5

  const stepLightness: [ScaleStep, number][] = [
    [50,  0.97],
    [100, 0.93],
    [200, 0.86],
    [300, 0.76],
    [400, 0.65],
    [500, 0.54],
    [600, 0.44],
    [700, 0.35],
    [800, 0.26],
    [900, 0.19],
    [925, 0.15],
    [950, 0.11],
  ]

  let best: ScaleStep = 600
  let bestDist = Infinity
  for (const [step, target] of stepLightness) {
    const dist = Math.abs(l - target)
    if (dist < bestDist) {
      bestDist = dist
      best = step
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
