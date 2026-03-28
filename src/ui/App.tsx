import { useState, useEffect, useCallback, useRef } from 'react'
import type { PluginMessage, PluginResponse, ScaleEntry, ScaleStep, CollectionOption, CollectionWithGroups } from './types'
import { detectAnchorStep } from '../plugin/color'
import HexInput from './components/HexInput'
import ScalePreview from './components/ScalePreview'
import ColorNameInput from './components/ColorNameInput'
import ModeToggle from './components/ModeToggle'
import CollectionSelect from './components/CollectionSelect'
import GroupSelect from './components/GroupSelect'

function postToPlugin(msg: PluginMessage) {
  parent.postMessage({ pluginMessage: msg }, '*')
}

type Mode = 'add' | 'update'

export default function App() {
  const [hex, setHex] = useState('#3b82f6')
  const [anchorStep, setAnchorStep] = useState<ScaleStep>(() => detectAnchorStep('#3b82f6'))
  const [scale, setScale] = useState<ScaleEntry[]>([])
  const [colorName, setColorName] = useState('')
  const [suggestedName, setSuggestedName] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('add')
  // Add mode
  const [collections, setCollections] = useState<CollectionOption[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('')
  // Update mode
  const [groupedCollections, setGroupedCollections] = useState<CollectionWithGroups[]>([])
  const [selectedTarget, setSelectedTarget] = useState<string>('') // "collectionId|groupName"
  const prevSuggestion = useRef('')

  // Listen for plugin responses
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data.pluginMessage as PluginResponse
      if (!msg) return

      if (msg.type === 'scale-generated') {
        setScale(msg.scale)
        setSuggestedName(msg.suggestedName)
        if (colorName === '' || colorName === prevSuggestion.current) {
          setColorName(msg.suggestedName)
        }
        prevSuggestion.current = msg.suggestedName
      } else if (msg.type === 'collections-list') {
        setCollections(msg.collections)
      } else if (msg.type === 'all-groups') {
        setGroupedCollections(msg.collections)
        setSelectedTarget(msg.collections[0]?.groups[0] ? `${msg.collections[0].id}|${msg.collections[0].groups[0]}` : '')
      } else if (msg.type === 'added-to-variables') {
        setStatus(mode === 'update' ? 'Variables updated!' : 'Added to variables!')
        setTimeout(() => setStatus(null), 3000)
      } else if (msg.type === 'error') {
        setStatus(`Error: ${msg.message}`)
        setTimeout(() => setStatus(null), 5000)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [colorName, mode])

  // Fetch collections on mount
  useEffect(() => {
    postToPlugin({ type: 'get-collections' })
  }, [])

  // Fetch all groups when switching to update mode
  useEffect(() => {
    if (mode === 'update') {
      postToPlugin({ type: 'get-all-groups' })
    }
  }, [mode])

  // Generate scale when hex or anchor changes
  useEffect(() => {
    if (hex) {
      postToPlugin({ type: 'generate-scale', hex, anchorStep })
    }
  }, [hex, anchorStep])

  const handleHexChange = useCallback((newHex: string) => {
    setHex(newHex)
    setAnchorStep(detectAnchorStep(newHex))
  }, [])

  const handleAnchorChange = useCallback((step: ScaleStep) => {
    setAnchorStep(step)
  }, [])

  const handleSubmit = useCallback(() => {
    if (mode === 'update') {
      const [collectionId, ...groupParts] = selectedTarget.split('|')
      const groupName = groupParts.join('|')
      postToPlugin({ type: 'add-to-variables', hex, anchorStep, colorName: groupName, collectionId })
    } else {
      const name = colorName.trim() || suggestedName || 'Color'
      postToPlugin({ type: 'add-to-variables', hex, anchorStep, colorName: name, collectionId: selectedCollectionId || undefined })
    }
  }, [mode, hex, anchorStep, colorName, suggestedName, selectedCollectionId, selectedTarget])

  return (
    <div className="flex h-full">
      <div className="flex flex-col w-full p-5">
        <HexInput value={hex} onChange={handleHexChange} />

        {mode === 'add' && <ColorNameInput value={colorName} onChange={setColorName} />}

        <ModeToggle value={mode} onChange={setMode} />

        {mode === 'add' && (
          <CollectionSelect
            collections={collections}
            value={selectedCollectionId}
            onChange={setSelectedCollectionId}
          />
        )}

        {mode === 'update' && (
          <GroupSelect
            collections={groupedCollections}
            value={selectedTarget}
            onChange={setSelectedTarget}
          />
        )}

        <button
          onClick={handleSubmit}
          disabled={scale.length === 0 || (mode === 'update' && !selectedTarget)}
          className="w-full py-2 mt-auto text-sm font-medium rounded bg-figma-bg-brand text-figma-text-onbrand hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {mode === 'update' ? 'Update Variables' : 'Add to Variables'}
        </button>

        {status && (
          <p className={`text-xs text-center ${status.startsWith('Error') ? 'text-figma-text-danger' : 'text-figma-text-success'}`}>
            {status}
          </p>
        )}
      </div>

      <div className="w-full p-5 border-l border-figma-border">
        <ScalePreview
          scale={scale}
          anchorStep={anchorStep}
          onAnchorChange={handleAnchorChange}
        />
      </div>
    </div>
  )
}
