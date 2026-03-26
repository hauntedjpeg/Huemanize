import { generateScale, suggestColorName } from './color'
import type { PluginMessage, PluginResponse, ScaleEntry } from '../ui/types'

figma.showUI(__html__, { width: 480, height: 400, themeColors: true })

figma.ui.onmessage = async (msg: PluginMessage) => {
  try {
    if (msg.type === 'generate-scale') {
      const scale = generateScale(msg.hex, msg.anchorStep, msg.curve)
      const suggestedName = suggestColorName(msg.hex)
      respond({ type: 'scale-generated', scale, suggestedName })
    } else if (msg.type === 'add-to-variables') {
      const scale = generateScale(msg.hex, msg.anchorStep, msg.curve)
      await createColorVariables(scale, msg.colorName)
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

async function createColorVariables(scale: ScaleEntry[], colorName: string): Promise<void> {
  // Find or create "Colors" collection
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  let collection = collections.find((c) => c.name === 'Colors')

  if (!collection) {
    collection = figma.variables.createVariableCollection('Colors')
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
