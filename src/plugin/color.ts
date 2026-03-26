import { oklch, formatHex, parse } from 'culori'
import { SCALE_STEPS, type ScaleStep, type ScaleEntry, type LightnessCurve } from '../ui/types'

/**
 * Easing functions applied to the interpolation parameter `t` (0→1).
 * All functions map [0,1] → [0,1] and pass through 0 and 1.
 */
const CURVES: Record<LightnessCurve, (t: number) => number> = {
  linear:  (t) => t,
  easeIn:  (t) => t * t,
  easeOut: (t) => t * (2 - t),
  sCurve:  (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
}

/**
 * Generate a Tailwind-style 50-950 color scale from a hex input.
 *
 * Pipeline: hex -> OKLCH -> generate 11 OKLCH colors -> hex[]
 *
 * The input color is pinned at `anchorStep`. Steps lighter than the anchor
 * interpolate toward white; steps darker interpolate toward black. Chroma
 * tapers naturally toward the extremes (OKLCH gamut narrows near L=0 and L=1).
 * The `curve` parameter controls how lightness is distributed across steps.
 */
export function generateScale(hex: string, anchorStep: ScaleStep, curve: LightnessCurve = 'linear'): ScaleEntry[] {
  const parsed = parse(hex)
  if (!parsed) throw new Error('Invalid color')

  const anchor = oklch(parsed)
  if (!anchor) throw new Error('Could not convert to OKLCH')

  const anchorL = anchor.l ?? 0.5
  const anchorC = anchor.c ?? 0
  const anchorH = anchor.h ?? 0
  const isAchromatic = anchorC < 0.02

  const anchorIndex = SCALE_STEPS.indexOf(anchorStep)
  const ease = CURVES[curve]

  return SCALE_STEPS.map((step, index) => {
    let l: number
    let c: number

    if (index === anchorIndex) {
      l = anchorL
      c = anchorC
    } else if (index < anchorIndex) {
      // Lighter segment: t goes 0 (step 50) → 1 (anchor).
      // 0.97 keeps 50 from being pure white and retains a hint of hue.
      const t = ease(index / anchorIndex)
      l = lerp(0.97, anchorL, t)
      c = isAchromatic ? 0 : anchorC * chromaFactor(l, anchorL)
    } else {
      // Darker segment: t goes 0 (anchor) → 1 (step 950).
      // 0.18 keeps 950 clearly distinguishable from pure black.
      const t = ease((index - anchorIndex) / (SCALE_STEPS.length - 1 - anchorIndex))
      l = lerp(anchorL, 0.18, t)
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
  return Math.max(0.10, factor)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * Suggest a color name based on OKLCH hue and chroma.
 */
export function suggestColorName(hex: string): string {
  const parsed = parse(hex)
  if (!parsed) return 'Color'

  const color = oklch(parsed)
  if (!color) return 'Color'

  const chroma = color.c ?? 0
  if (chroma < 0.02) return 'Gray'

  const h = ((color.h ?? 0) % 360 + 360) % 360

  const hueNames: [number, string][] = [
    [15, 'Red'],
    [40, 'Orange'],
    [65, 'Amber'],
    [90, 'Yellow'],
    [135, 'Lime'],
    [160, 'Green'],
    [185, 'Emerald'],
    [210, 'Teal'],
    [240, 'Cyan'],
    [265, 'Sky'],
    [285, 'Blue'],
    [310, 'Indigo'],
    [330, 'Purple'],
    [345, 'Fuchsia'],
    [360, 'Rose'],
  ]

  for (const [boundary, name] of hueNames) {
    if (h < boundary) return name
  }
  return 'Red'
}
