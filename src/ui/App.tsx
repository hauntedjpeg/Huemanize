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
  const [hex, setHex] = useState('#859991')
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
  const modeRef = useRef(mode)
  const colorNameRef = useRef(colorName)
  modeRef.current = mode
  colorNameRef.current = colorName

  // Listen for plugin responses
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data.pluginMessage as PluginResponse
      if (!msg) return

      if (msg.type === 'scale-generated') {
        setScale(msg.scale)
        setSuggestedName(msg.suggestedName)
        if (colorNameRef.current === '' || colorNameRef.current === prevSuggestion.current) {
          setColorName(msg.suggestedName)
        }
        prevSuggestion.current = msg.suggestedName
      } else if (msg.type === 'collections-list') {
        setCollections(msg.collections)
      } else if (msg.type === 'all-groups') {
        setGroupedCollections(msg.collections)
        setSelectedTarget(msg.collections[0]?.groups[0] ? `${msg.collections[0].id}|${msg.collections[0].groups[0]}` : '')
      } else if (msg.type === 'added-to-variables') {
        setStatus(modeRef.current === 'update' ? 'Variables updated!' : 'Added to variables!')
        setTimeout(() => setStatus(null), 3000)
      } else if (msg.type === 'error') {
        setStatus(`Error: ${msg.message}`)
        setTimeout(() => setStatus(null), 5000)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Fetch collections and groups on mount
  useEffect(() => {
    postToPlugin({ type: 'get-collections' })
    postToPlugin({ type: 'get-all-groups' })
  }, [])

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
      <div className="flex flex-col w-full">
        <div className="p-4 border-b border-figma-border">
          <HexInput value={hex} onChange={handleHexChange} />
        </div>

        <div className="flex flex-col gap-3 p-4">
          <ModeToggle value={mode} onChange={setMode} />

          {mode === 'add' && <ColorNameInput value={colorName} onChange={setColorName} />}

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
        </div>

        <div className="flex flex-col gap-2 p-4 mt-auto">
          <button
            onClick={handleSubmit}
            disabled={scale.length === 0 || (mode === 'update' && !selectedTarget)}
            className="flex justify-center items-center w-full h-6 py-2 text-[11px]/4 font-medium rounded bg-figma-bg-brand text-figma-text-onbrand hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'update' ? 'Update Variables' : 'Add Variables'}
          </button>

          {status && (
            <p className={`text-xs text-center ${status.startsWith('Error') ? 'text-figma-text-danger' : 'text-figma-text-success'}`}>
              {status}
            </p>
          )}
        </div>
      </div>

      <div className="w-full p-4 border-l border-figma-border">
        <ScalePreview
          scale={scale}
          anchorStep={anchorStep}
          onAnchorChange={handleAnchorChange}
        />
      </div>
    </div>
  )
}
