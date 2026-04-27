import { generateScale, suggestColorName } from './color'
import type { PluginMessage, PluginResponse, ScaleEntry } from '../ui/types'

figma.showUI(__html__, { width: 480, height: 400, themeColors: true })

figma.ui.onmessage = async (msg: PluginMessage) => {
  try {
    if (msg.type === 'generate-scale') {
      const scale = generateScale(msg.hex, msg.anchorStep)
      const suggestedName = suggestColorName(msg.hex)
      respond({ type: 'scale-generated', scale, suggestedName })
    } else if (msg.type === 'get-collections') {
      const collections = await figma.variables.getLocalVariableCollectionsAsync()
      respond({
        type: 'collections-list',
        collections: collections.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => ({ id: c.id, name: c.name })),
      })
    } else if (msg.type === 'get-all-groups') {
      const collections = await figma.variables.getLocalVariableCollectionsAsync()
      const allVars = await figma.variables.getLocalVariablesAsync('COLOR')
      respond({
        type: 'all-groups',
        collections: collections.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => {
          const modeId = c.modes[0].modeId
          // Group variables by their prefix, excluding any group that contains an alias value
          const groupVars = new Map<string, boolean>() // group -> hasAlias
          for (const v of allVars) {
            if (v.variableCollectionId !== c.id) continue
            const slash = v.name.lastIndexOf('/')
            if (slash === -1) continue
            const group = v.name.slice(0, slash)
            const value = v.valuesByMode[modeId]
            const isAlias = value != null && typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS'
            groupVars.set(group, (groupVars.get(group) ?? false) || isAlias)
          }
          const groups = Array.from(groupVars.entries())
            .filter(([, hasAlias]) => !hasAlias)
            .map(([group]) => group)
            .sort()
          return { id: c.id, name: c.name, groups }
        }).filter((c) => c.groups.length > 0),
      })
    } else if (msg.type === 'add-to-variables') {
      const scale = generateScale(msg.hex, msg.anchorStep)
      await createColorVariables(scale, msg.colorName, msg.collectionId)
      respond({ type: 'added-to-variables' })
    }
  } catch (e) {
    respond({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

function respond(msg: PluginResponse) {
  figma.ui.postMessage(msg)
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16) / 255,
    g: parseInt(h.slice(2, 4), 16) / 255,
    b: parseInt(h.slice(4, 6), 16) / 255,
  }
}

async function createColorVariables(scale: ScaleEntry[], colorName: string, collectionId?: string): Promise<void> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  let collection: VariableCollection | undefined

  if (collectionId) {
    collection = collections.find((c) => c.id === collectionId)
  }

  if (!collection) {
    collection = collections.find((c) => c.name === 'Colors') ?? figma.variables.createVariableCollection('Colors')
  }

  const modeId = collection.modes[0].modeId
  const existingVars = await figma.variables.getLocalVariablesAsync('COLOR')

  for (const entry of scale) {
    const varName = `${colorName}/${entry.step}`
    const existing = existingVars.find(
      (v) => v.name === varName && v.variableCollectionId === collection!.id
    )

    const rgb = hexToRgb(entry.hex)

    if (existing) {
      existing.setValueForMode(modeId, rgb)
    } else {
      const variable = figma.variables.createVariable(varName, collection!, 'COLOR')
      variable.setValueForMode(modeId, rgb)
    }
  }

  figma.notify(`Added ${scale.length} "${colorName}" color variables`)
}
