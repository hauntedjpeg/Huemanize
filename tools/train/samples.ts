import { formatHex, clampChroma, parse, oklch } from 'culori'

export interface Sample {
  hex: string
  oklch: { l: number; c: number; h: number }
  tag: string
}

export type SampleSet = 'training' | 'validation'

function makeSample(l: number, c: number, h: number, tag: string): Sample | null {
  const clamped = clampChroma({ mode: 'oklch', l, c, h: h % 360 }, 'oklch')
  const hex = formatHex(clamped)
  if (!hex) return null
  const round = oklch(parse(hex)!)!
  return {
    hex: hex.toLowerCase(),
    oklch: { l: round.l ?? 0, c: round.c ?? 0, h: round.h ?? h },
    tag,
  }
}

// Hex-first sample: preserves the exact input hex (no clampChroma round-trip).
// Use for corner cases where the literal hex matters (#000000, #0000ff, etc.)
// because makeSample's clamp + formatHex can shift away from the desired value.
function makeSampleFromHex(hex: string, tag: string): Sample | null {
  const p = parse(hex)
  if (!p) return null
  const o = oklch(p)
  if (!o) return null
  return {
    hex: hex.toLowerCase(),
    oklch: { l: o.l ?? 0, c: o.c ?? 0, h: o.h ?? 0 },
    tag,
  }
}

function dedupe(samples: Sample[]): Sample[] {
  const seen = new Set<string>()
  const out: Sample[] = []
  for (const s of samples) {
    if (seen.has(s.hex)) continue
    seen.add(s.hex)
    out.push(s)
  }
  return out
}

export function generateSamples(set: SampleSet): Sample[] {
  const samples: Sample[] = []

  if (set === 'training') {
    const lightnessBands = [0.78, 0.62, 0.50, 0.38]

    // 24 hues × 4 L × vivid chroma → 96
    const hues24 = Array.from({ length: 24 }, (_, i) => i * 15)
    for (const h of hues24) {
      for (const l of lightnessBands) {
        const s = makeSample(l, 0.18, h, `vivid/h=${h}/l=${l}`)
        if (s) samples.push(s)
      }
    }

    // 12 hues × 4 L × muted chroma → 48
    const hues12 = Array.from({ length: 12 }, (_, i) => i * 30)
    for (const h of hues12) {
      for (const l of lightnessBands) {
        const s = makeSample(l, 0.10, h, `muted/h=${h}/l=${l}`)
        if (s) samples.push(s)
      }
    }

    // 12 hues × 4 L × very-muted chroma → 48
    for (const h of hues12) {
      for (const l of lightnessBands) {
        const s = makeSample(l, 0.04, h, `vmuted/h=${h}/l=${l}`)
        if (s) samples.push(s)
      }
    }

    // 6 grays
    for (const l of [0.95, 0.80, 0.65, 0.50, 0.35, 0.20]) {
      const s = makeSample(l, 0.0, 0, `gray/l=${l}`)
      if (s) samples.push(s)
    }

    // Gap-fill set 1: very dark inputs (likely anchor 900/950) across all hues
    for (const h of hues24) {
      for (const l of [0.30, 0.25, 0.20]) {
        for (const c of [0.16, 0.08, 0.03]) {
          const s = makeSample(l, c, h, `dark/h=${h}/l=${l}/c=${c}`)
          if (s) samples.push(s)
        }
      }
    }

    // Gap-fill set 2: very light inputs (likely anchor 100/200) across all hues
    for (const h of hues24) {
      for (const l of [0.92, 0.86]) {
        for (const c of [0.10, 0.05, 0.02]) {
          const s = makeSample(l, c, h, `light/h=${h}/l=${l}/c=${c}`)
          if (s) samples.push(s)
        }
      }
    }

    // Gap-fill set 3: extra mid-range coverage at fine chroma steps
    for (const h of hues12) {
      for (const l of [0.70, 0.55, 0.45]) {
        for (const c of [0.14, 0.07]) {
          const s = makeSample(l, c, h, `mid/h=${h}/l=${l}/c=${c}`)
          if (s) samples.push(s)
        }
      }
    }

    // Dense grid: 36 hues × 6 lightness × 4 chroma levels for better per-(anchor, band) coverage
    const huesDense = Array.from({ length: 36 }, (_, i) => i * 10)
    const lightnessDense = [0.85, 0.72, 0.60, 0.50, 0.40, 0.28]
    const chromaDense = [0.20, 0.13, 0.07, 0.025]
    for (const h of huesDense) {
      for (const l of lightnessDense) {
        for (const c of chromaDense) {
          const s = makeSample(l, c, h, `dense/h=${h}/l=${l}/c=${c}`)
          if (s) samples.push(s)
        }
      }
    }

    // Corner-case coverage: extends past the dense grid's caps (C ≤ 0.20,
    // L ∈ [0.20, 0.95]) to populate sparse cells the algorithm extrapolates
    // poorly into — pure primaries, near-axis, extreme grays, max chroma.

    // 1. Pure RGB/CMY + black/white + mid-gray (10)
    const primaries = [
      '#000000', '#ffffff',
      '#ff0000', '#00ff00', '#0000ff',
      '#ffff00', '#00ffff', '#ff00ff',
      '#7f7f7f', '#808080',
    ]
    for (const hex of primaries) {
      const s = makeSampleFromHex(hex, `corner/primary/${hex.slice(1)}`)
      if (s) samples.push(s)
    }

    // 2. Very dark grays (L ≈ 0.07–0.20)
    for (const hex of ['#080808', '#0d0d0d', '#131313', '#1a1a1a']) {
      const s = makeSampleFromHex(hex, `corner/dark-gray/${hex.slice(1)}`)
      if (s) samples.push(s)
    }

    // 3. Very light grays (L ≈ 0.97–0.99)
    for (const hex of ['#f5f5f5', '#fafafa', '#fcfcfc']) {
      const s = makeSampleFromHex(hex, `corner/light-gray/${hex.slice(1)}`)
      if (s) samples.push(s)
    }

    // 4. Pure-axis near neighbors (12) — 1–2 unit perturbations of primaries
    const nearAxis = [
      '#fe0000', '#ff0010', '#ff1000',
      '#00fe00', '#10ff00', '#00ff10',
      '#0000fe', '#0010ff', '#1000ff',
      '#fefe00', '#fe00fe', '#00fefe',
    ]
    for (const hex of nearAxis) {
      const s = makeSampleFromHex(hex, `corner/near-axis/${hex.slice(1)}`)
      if (s) samples.push(s)
    }

    // User-flagged samples: specific colors where the algorithm's output diverged from
    // the API badly enough to warrant adding ground-truth API data to the training set.
    for (const hex of ['#859991']) {
      const s = makeSampleFromHex(hex, `corner/user-flagged/${hex.slice(1)}`)
      if (s) samples.push(s)
    }

    // 5. Max-chroma at 12 hues, L = 0.5 (95% of sRGB gamut max C)
    for (const h of hues12) {
      const clamped = clampChroma({ mode: 'oklch', l: 0.5, c: 1, h }, 'oklch')
      const cMax = (clamped.c ?? 0) * 0.95
      const s = makeSample(0.5, cMax, h, `corner/maxc/h=${h}`)
      if (s) samples.push(s)
    }

    // 6. Off-axis very-high-chroma — 5 hues with deep gamut × 2 lightnesses
    const deepHues = [25, 264, 280, 300, 330]
    for (const h of deepHues) {
      for (const l of [0.40, 0.55]) {
        const clamped = clampChroma({ mode: 'oklch', l, c: 1, h }, 'oklch')
        const cMax = (clamped.c ?? 0) * 0.95
        const s = makeSample(l, cMax, h, `corner/highc/h=${h}/l=${l}`)
        if (s) samples.push(s)
      }
    }
  } else {
    // Validation: offset grids (different hues + different L bands) to avoid overlap
    const lightnessBands = [0.72, 0.58, 0.44]

    // 12 hues at offset 7.5°
    const hues12 = Array.from({ length: 12 }, (_, i) => i * 30 + 7.5)
    for (const h of hues12) {
      for (const l of lightnessBands) {
        const vivid = makeSample(l, 0.16, h, `val-vivid/h=${h}/l=${l}`)
        if (vivid) samples.push(vivid)
        const muted = makeSample(l, 0.08, h, `val-muted/h=${h}/l=${l}`)
        if (muted) samples.push(muted)
      }
    }

    // A few grays at offset L
    for (const l of [0.88, 0.55, 0.28]) {
      const s = makeSample(l, 0.0, 0, `val-gray/l=${l}`)
      if (s) samples.push(s)
    }
  }

  return dedupe(samples)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const set = (process.argv[2] as SampleSet) || 'training'
  const samples = generateSamples(set)
  console.log(`# ${set} set: ${samples.length} samples`)
  for (const s of samples) console.log(s.hex, s.tag)
}
