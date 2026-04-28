import { generateBiModalScale } from './radix'
import { suggestColorName } from './color'
import {
  ensureLightDarkModes,
  hasLegacyStepNaming,
  writeBiModalScale,
} from './shared/figmaVariables'
import type { PluginMessage, PluginResponse } from '../ui/types'

figma.showUI(__html__, { width: 480, height: 480, themeColors: true })

figma.ui.onmessage = async (msg: PluginMessage) => {
  try {
    if (msg.type === 'generate-scale') {
      const scale = generateBiModalScale({
        hex: msg.hex,
        scaleType: msg.scaleType,
        lightBackground: msg.lightBackground,
        darkBackground: msg.darkBackground,
      })
      const suggestedName = suggestColorName(msg.hex)
      respond({ type: 'scale-generated', scale, suggestedName })
    } else if (msg.type === 'get-collections') {
      const collections = await figma.variables.getLocalVariableCollectionsAsync()
      respond({
        type: 'collections-list',
        collections: collections
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => ({ id: c.id, name: c.name })),
      })
    } else if (msg.type === 'get-all-groups') {
      const collections = await figma.variables.getLocalVariableCollectionsAsync()
      const allVars = await figma.variables.getLocalVariablesAsync('COLOR')
      respond({
        type: 'all-groups',
        collections: collections
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => {
            const modeId = c.modes[0].modeId
            const groupVars = new Map<string, boolean>()
            for (const v of allVars) {
              if (v.variableCollectionId !== c.id) continue
              const slash = v.name.lastIndexOf('/')
              if (slash === -1) continue
              const group = v.name.slice(0, slash)
              const value = v.valuesByMode[modeId]
              const isAlias =
                value != null &&
                typeof value === 'object' &&
                'type' in value &&
                value.type === 'VARIABLE_ALIAS'
              groupVars.set(group, (groupVars.get(group) ?? false) || isAlias)
            }
            const groups = Array.from(groupVars.entries())
              .filter(([, hasAlias]) => !hasAlias)
              .map(([group]) => group)
              .sort()
            return { id: c.id, name: c.name, groups }
          })
          .filter((c) => c.groups.length > 0),
      })
    } else if (msg.type === 'add-to-variables') {
      const collection = await resolveCollection(msg.collectionId)

      if (msg.collectionId && (await hasLegacyStepNaming(collection, msg.colorName))) {
        respond({ type: 'mismatched-collection', collectionName: collection.name })
        return
      }

      const scale = generateBiModalScale({
        hex: msg.hex,
        scaleType: msg.scaleType,
        lightBackground: msg.lightBackground,
        darkBackground: msg.darkBackground,
      })

      const modes = ensureLightDarkModes(collection)
      await writeBiModalScale(collection, msg.colorName, scale, modes)

      figma.notify(`Added 12 "${msg.colorName}" color variables`)
      respond({ type: 'added-to-variables' })
    }
  } catch (e) {
    respond({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

function respond(msg: PluginResponse) {
  figma.ui.postMessage(msg)
}

async function resolveCollection(collectionId?: string): Promise<VariableCollection> {
  if (collectionId) {
    const found = await figma.variables.getVariableCollectionByIdAsync(collectionId)
    if (found) return found
  }
  const collections = await figma.variables.getLocalVariableCollectionsAsync()
  return (
    collections.find((c) => c.name === 'Colors') ??
    figma.variables.createVariableCollection('Colors')
  )
}
