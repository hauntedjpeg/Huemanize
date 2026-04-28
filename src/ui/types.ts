export const SCALE_STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const
export type ScaleStep = (typeof SCALE_STEPS)[number]

export type ScaleType = 'accent' | 'gray'

export type Tuple12<T> = readonly [T, T, T, T, T, T, T, T, T, T, T, T]

export interface ScaleEntry {
  step: ScaleStep
  light: string
  dark: string
}

export interface GenerationOptions {
  hex: string
  scaleType: ScaleType
  lightBackground: string
  darkBackground: string
}

// UI -> Plugin
export type PluginMessage =
  | ({ type: 'generate-scale' } & GenerationOptions)
  | { type: 'get-collections' }
  | { type: 'get-all-groups' }
  | ({ type: 'add-to-variables'; colorName: string; collectionId?: string } & GenerationOptions)

// Plugin -> UI
export type PluginResponse =
  | { type: 'scale-generated'; scale: ScaleEntry[]; suggestedName: string }
  | { type: 'collections-list'; collections: CollectionOption[] }
  | { type: 'all-groups'; collections: CollectionWithGroups[] }
  | { type: 'added-to-variables' }
  | { type: 'mismatched-collection'; collectionName: string }
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
