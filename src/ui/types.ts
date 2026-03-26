export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type ScaleStep = (typeof SCALE_STEPS)[number]

export type LightnessCurve = 'linear' | 'easeIn' | 'easeOut' | 'sCurve'

export const CURVE_OPTIONS: { value: LightnessCurve; label: string; description: string }[] = [
  { value: 'linear',  label: 'Linear',  description: 'Even lightness steps' },
  { value: 'easeIn',  label: 'Ease In',  description: 'Steps cluster near extremes' },
  { value: 'easeOut', label: 'Ease Out', description: 'Steps cluster near the anchor' },
  { value: 'sCurve',  label: 'S-Curve', description: 'Compressed at both ends' },
]

// UI -> Plugin
export type PluginMessage =
  | { type: 'generate-scale'; hex: string; anchorStep: ScaleStep; curve: LightnessCurve }
  | { type: 'add-to-variables'; hex: string; anchorStep: ScaleStep; curve: LightnessCurve; colorName: string }

// Plugin -> UI
export type PluginResponse =
  | { type: 'scale-generated'; scale: ScaleEntry[]; suggestedName: string }
  | { type: 'added-to-variables' }
  | { type: 'error'; message: string }

export interface ScaleEntry {
  step: ScaleStep
  hex: string
  isAnchor: boolean
}
