declare module 'apcach' {
  type ContrastModel = 'apca' | 'wcag'
  type SearchDirection = 'auto' | 'lighter' | 'darker'

  interface ContrastConfig {
    bgColor: unknown
    contrastModel: ContrastModel
    cr: number
    fgColor: unknown
    searchDirection: SearchDirection
  }

  interface Apcach {
    alpha: number
    chroma: number
    colorSpace: 'srgb' | 'p3'
    contrastConfig: ContrastConfig
    hue: number
    lightness: number
  }

  export function apcach(
    contrast: ContrastConfig | number,
    chroma: number,
    hue: number,
    alpha?: number,
    colorSpace?: 'srgb' | 'p3',
  ): Apcach

  export function crToBg(
    bgColor: string,
    cr: number,
    contrastModel?: ContrastModel,
    searchDirection?: SearchDirection,
  ): ContrastConfig

  export function calcContrast(
    fgColor: string,
    bgColor: string,
    contrastModel?: ContrastModel,
    colorSpace?: 'srgb' | 'p3',
  ): number
}
