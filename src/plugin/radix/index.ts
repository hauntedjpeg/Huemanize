import { generateRadixColors } from './generateRadixColors'
import { SCALE_STEPS, type ScaleEntry, type ScaleType } from '../../ui/types'

// When generating an accent scale, Radix's algorithm still requires a `gray` arg.
// The gray output is computed but discarded; `getButtonHoverColor` only searches
// the accent scale, so this constant has no effect on the returned accent.
const UNUSED_GRAY = '#8B8D98'

// Symmetric: when generating a gray scale, the accent input is required but the
// accent output is discarded.
const UNUSED_ACCENT = '#3B82F6'

export interface GenerateBiModalArgs {
  hex: string
  scaleType: ScaleType
  lightBackground: string
  darkBackground: string
}

export function generateBiModalScale(args: GenerateBiModalArgs): ScaleEntry[] {
  const accent = args.scaleType === 'accent' ? args.hex : UNUSED_ACCENT
  const gray = args.scaleType === 'gray' ? args.hex : UNUSED_GRAY

  const lightResult = generateRadixColors({
    appearance: 'light',
    accent,
    gray,
    background: args.lightBackground,
  })

  const darkResult = generateRadixColors({
    appearance: 'dark',
    accent,
    gray,
    background: args.darkBackground,
  })

  const lightScale = args.scaleType === 'accent' ? lightResult.accentScale : lightResult.grayScale
  const darkScale = args.scaleType === 'accent' ? darkResult.accentScale : darkResult.grayScale

  return SCALE_STEPS.map((step, i) => ({
    step,
    light: lightScale[i],
    dark: darkScale[i],
  }))
}
