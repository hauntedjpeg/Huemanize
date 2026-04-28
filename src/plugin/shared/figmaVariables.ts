import { SCALE_STEPS, type ScaleEntry } from '../../ui/types'

const LIGHT = 'Light'
const DARK = 'Dark'

export interface CollectionModes {
  lightModeId: string
  darkModeId: string
}

/**
 * Ensure the collection has a `Light` and a `Dark` mode. If the collection was
 * just created, Figma added a single default mode (typically named "Mode 1") —
 * we rename that to `Light` and add `Dark`. If both modes already exist by
 * name, we reuse them.
 *
 * We never delete existing modes, since shapes elsewhere in the file may be
 * bound to them.
 */
export function ensureLightDarkModes(collection: VariableCollection): CollectionModes {
  let lightModeId: string | undefined
  let darkModeId: string | undefined

  for (const mode of collection.modes) {
    if (mode.name === LIGHT) lightModeId = mode.modeId
    else if (mode.name === DARK) darkModeId = mode.modeId
  }

  if (!lightModeId) {
    if (collection.modes.length === 1 && !darkModeId) {
      const defaultMode = collection.modes[0]
      collection.renameMode(defaultMode.modeId, LIGHT)
      lightModeId = defaultMode.modeId
    } else {
      lightModeId = collection.addMode(LIGHT)
    }
  }

  if (!darkModeId) {
    darkModeId = collection.addMode(DARK)
  }

  return { lightModeId, darkModeId }
}

/**
 * Write a 12-step bi-modal scale into the collection under `${colorName}/1` ..
 * `${colorName}/12`. Existing variables with the same names are updated; new
 * variables are created.
 */
export async function writeBiModalScale(
  collection: VariableCollection,
  colorName: string,
  scale: ScaleEntry[],
  modes: CollectionModes,
): Promise<void> {
  const existing = await figma.variables.getLocalVariablesAsync('COLOR')

  for (const entry of scale) {
    const varName = `${colorName}/${entry.step}`
    const found = existing.find(
      (v) => v.name === varName && v.variableCollectionId === collection.id,
    )
    const variable = found ?? figma.variables.createVariable(varName, collection, 'COLOR')
    variable.setValueForMode(modes.lightModeId, hexToRgb(entry.light))
    variable.setValueForMode(modes.darkModeId, hexToRgb(entry.dark))
  }
}

/**
 * Detect whether the target collection holds the legacy 50-950 step naming
 * under the given color name. Used to refuse in-place writes that would
 * silently leave both schemes coexisting.
 */
export async function hasLegacyStepNaming(
  collection: VariableCollection,
  colorName: string,
): Promise<boolean> {
  const existing = await figma.variables.getLocalVariablesAsync('COLOR')
  const legacySteps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
  return existing.some((v) => {
    if (v.variableCollectionId !== collection.id) return false
    for (const step of legacySteps) {
      if (v.name === `${colorName}/${step}`) return true
    }
    return false
  })
}

/**
 * Detect whether a Figma file already has the new 1-12 naming under this
 * color name in the given collection.
 */
export async function hasNewStepNaming(
  collection: VariableCollection,
  colorName: string,
): Promise<boolean> {
  const existing = await figma.variables.getLocalVariablesAsync('COLOR')
  return existing.some((v) => {
    if (v.variableCollectionId !== collection.id) return false
    for (const step of SCALE_STEPS) {
      if (v.name === `${colorName}/${step}`) return true
    }
    return false
  })
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '')
  const expanded = h.length === 3
    ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    : h
  return {
    r: parseInt(expanded.slice(0, 2), 16) / 255,
    g: parseInt(expanded.slice(2, 4), 16) / 255,
    b: parseInt(expanded.slice(4, 6), 16) / 255,
  }
}
