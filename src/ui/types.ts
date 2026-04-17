export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 925, 950] as const
export type ScaleStep = (typeof SCALE_STEPS)[number]

export type CurveType = 'linear' | 'fine-ends'

// UI -> Plugin
export type PluginMessage =
  | { type: 'generate-scale'; hex: string; anchorStep: ScaleStep; curveType: CurveType }
  | { type: 'get-collections' }
  | { type: 'get-all-groups' }
  | { type: 'add-to-variables'; hex: string; anchorStep: ScaleStep; curveType: CurveType; colorName: string; collectionId?: string }

// Plugin -> UI
export type PluginResponse =
  | { type: 'scale-generated'; scale: ScaleEntry[]; suggestedName: string }
  | { type: 'collections-list'; collections: CollectionOption[] }
  | { type: 'all-groups'; collections: CollectionWithGroups[] }
  | { type: 'added-to-variables' }
  | { type: 'error'; message: string }

export interface CollectionOption {
  id: string
  name: string
}

export interface CollectionWithGroups {
  id: string
  name: string
  groups: string[]
}

export interface ScaleEntry {
  step: ScaleStep
  hex: string
  isAnchor: boolean
}
