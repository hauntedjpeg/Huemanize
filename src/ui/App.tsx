import { useState, useEffect, useCallback, useRef } from 'react'
import type { PluginMessage, PluginResponse, ScaleEntry, ScaleStep, CollectionOption } from './types'
import { detectAnchorStep } from '../plugin/color'
import HexInput from './components/HexInput'
import ScalePreview from './components/ScalePreview'
import ColorNameInput from './components/ColorNameInput'

function postToPlugin(msg: PluginMessage) {
  parent.postMessage({ pluginMessage: msg }, '*')
}

export default function App() {
  const [hex, setHex] = useState('#3b82f6')
  const [anchorStep, setAnchorStep] = useState<ScaleStep>(() => detectAnchorStep('#3b82f6'))
  const [scale, setScale] = useState<ScaleEntry[]>([])
  const [colorName, setColorName] = useState('')
  const [suggestedName, setSuggestedName] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [collections, setCollections] = useState<CollectionOption[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('')
  const prevSuggestion = useRef('')

  // Listen for plugin responses
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const msg = event.data.pluginMessage as PluginResponse
      if (!msg) return

      if (msg.type === 'scale-generated') {
        setScale(msg.scale)
        setSuggestedName(msg.suggestedName)
        // Auto-fill name if user hasn't customized it
        if (colorName === '' || colorName === prevSuggestion.current) {
          setColorName(msg.suggestedName)
        }
        prevSuggestion.current = msg.suggestedName
      } else if (msg.type === 'collections-list') {
        setCollections(msg.collections)
      } else if (msg.type === 'added-to-variables') {
        setStatus('Added to variables!')
        setTimeout(() => setStatus(null), 3000)
      } else if (msg.type === 'error') {
        setStatus(`Error: ${msg.message}`)
        setTimeout(() => setStatus(null), 5000)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [colorName])

  // Fetch collections on mount
  useEffect(() => {
    postToPlugin({ type: 'get-collections' })
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

  const handleAddToVariables = useCallback(() => {
    const name = colorName.trim() || suggestedName || 'Color'
    postToPlugin({
      type: 'add-to-variables',
      hex,
      anchorStep,
      colorName: name,
      collectionId: selectedCollectionId || undefined,
    })
  }, [hex, anchorStep, colorName, suggestedName, selectedCollectionId])

  return (
    <div className="flex h-full">
      <div className="w-full p-5">
        <HexInput value={hex} onChange={handleHexChange} />

        <ColorNameInput value={colorName} onChange={setColorName} />

        <select
          value={selectedCollectionId}
          onChange={(e) => setSelectedCollectionId(e.target.value)}
          className="w-full h-6 px-1 text-[11px]/4 rounded border border-figma-border bg-figma-bg-secondary text-figma-text focus-visible:outline-none focus-visible:border-figma-border-selected"
        >
          <option value="">
            {collections.length === 0 ? 'Create new "Colors" collection' : 'Create new "Colors" collection'}
          </option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        <button
          onClick={handleAddToVariables}
          disabled={scale.length === 0}
          className="w-full py-2 text-sm font-medium rounded bg-figma-bg-brand text-figma-text-onbrand hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add to Variables
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
