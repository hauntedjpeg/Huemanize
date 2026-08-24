import type { ScaleEntry } from '../../ui/types'

const LIGHT_SEGMENT = 'Light'
const DARK_SEGMENT = 'Dark'

/**
 * Write a 12-step bi-modal scale into the collection as two separate groups of
 * single-valued variables: `${colorName}/Light/1` .. `/12` and
 * `${colorName}/Dark/1` .. `/12`.
 *
 * We never add, rename, or remove collection modes — the light/dark split now
 * lives in the variable names. Whatever modes the collection already has all
 * receive the same value, so a variable resolves identically regardless of the
 * active mode.
 *
 * Legacy flat variables (`${colorName}/1` .. `/12`, which held light and dark in
 * two modes) are renamed in place into the `Light` subgroup. Renaming preserves
 * the variable id, so layers bound to them keep working.
 */
export async function writeBiModalScale(
  collection: VariableCollection,
  colorName: string,
  scale: ScaleEntry[],
): Promise<void> {
  const all = await figma.variables.getLocalVariablesAsync('COLOR')
  // Name -> Variable index, scoped to this collection. Mutated as we rename and
  // create, so later steps see the current state.
  const byName = new Map<string, Variable>()
  for (const v of all) {
    if (v.variableCollectionId === collection.id) byName.set(v.name, v)
  }
  const modeIds = collection.modes.map((m) => m.modeId)

  for (const entry of scale) {
    const lightName = `${colorName}/${LIGHT_SEGMENT}/${entry.step}`
    const darkName = `${colorName}/${DARK_SEGMENT}/${entry.step}`
    const legacyName = `${colorName}/${entry.step}`

    // Only the light variant may claim the legacy variable; dark is always
    // create-or-update.
    const lightVar = resolveVariable(byName, collection, lightName, legacyName)
    const darkVar = resolveVariable(byName, collection, darkName)

    setAllModes(lightVar, modeIds, hexToRgb(entry.light))
    setAllModes(darkVar, modeIds, hexToRgb(entry.dark))
  }
}

function resolveVariable(
  byName: Map<string, Variable>,
  collection: VariableCollection,
  name: string,
  legacyName?: string,
): Variable {
  const found = byName.get(name)
  if (found) return found

  if (legacyName) {
    const legacy = byName.get(legacyName)
    if (legacy) {
      legacy.name = name
      byName.delete(legacyName)
      byName.set(name, legacy)
      return legacy
    }
  }

  const created = figma.variables.createVariable(name, collection, 'COLOR')
  byName.set(name, created)
  return created
}

function setAllModes(variable: Variable, modeIds: string[], value: RGB): void {
  for (const modeId of modeIds) {
    variable.setValueForMode(modeId, value)
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
