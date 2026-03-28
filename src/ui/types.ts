export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 925, 950] as const
export type ScaleStep = (typeof SCALE_STEPS)[number]

// UI -> Plugin
export type PluginMessage =
  | { type: 'generate-scale'; hex: string; anchorStep: ScaleStep }
  | { type: 'add-to-variables'; hex: string; anchorStep: ScaleStep; colorName: string }

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
