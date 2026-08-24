import { generateBiModalScale } from './radix'
import { suggestColorName } from './color'
import { hasLegacyStepNaming, writeBiModalScale } from './shared/figmaVariables'
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
            const modeIds = c.modes.map((m) => m.modeId)
            const groupVars = new Map<string, boolean>()
            for (const v of allVars) {
              if (v.variableCollectionId !== c.id) continue
              const slash = v.name.lastIndexOf('/')
              if (slash === -1) continue
              // `Neutral/Light/1` and `Neutral/Dark/1` both belong to the
              // `Neutral` group — the variant is an implementation detail the
              // user shouldn't have to pick between.
              const group = stripVariantSegment(v.name.slice(0, slash))
              const isAlias = modeIds.some((modeId) => {
                const value = v.valuesByMode[modeId]
                return (
                  value != null &&
                  typeof value === 'object' &&
                  'type' in value &&
                  value.type === 'VARIABLE_ALIAS'
                )
              })
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

      await writeBiModalScale(collection, msg.colorName, scale)

      figma.notify(`Added 24 "${msg.colorName}" color variables`)
      respond({ type: 'added-to-variables' })
    }
  } catch (e) {
    respond({ type: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

function respond(msg: PluginResponse) {
  figma.ui.postMessage(msg)
}

/**
 * Drop a trailing `/Light` or `/Dark` segment from a group path. Only strips
 * when a non-empty prefix remains, so a top-level group literally named `Light`
 * survives.
 */
function stripVariantSegment(group: string): string {
  for (const variant of ['Light', 'Dark']) {
    const suffix = `/${variant}`
    if (group.endsWith(suffix) && group.length > suffix.length) {
      return group.slice(0, -suffix.length)
    }
  }
  return group
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
