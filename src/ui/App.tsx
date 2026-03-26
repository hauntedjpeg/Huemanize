import { useState, useEffect, useCallback, useRef } from 'react'
import type { PluginMessage, PluginResponse, ScaleEntry, ScaleStep, LightnessCurve } from './types'
import HexInput from './components/HexInput'
import ScalePreview from './components/ScalePreview'
import ColorNameInput from './components/ColorNameInput'
import CurveSelector from './components/CurveSelector'

function postToPlugin(msg: PluginMessage) {
  parent.postMessage({ pluginMessage: msg }, '*')
}

export default function App() {
  const [hex, setHex] = useState('#3b82f6')
  const [anchorStep, setAnchorStep] = useState<ScaleStep>(500)
  const [curve, setCurve] = useState<LightnessCurve>('linear')
  const [scale, setScale] = useState<ScaleEntry[]>([])
  const [colorName, setColorName] = useState('')
  const [suggestedName, setSuggestedName] = useState('')
  const [status, setStatus] = useState<string | null>(null)
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

  // Generate scale when hex, anchor, or curve changes
  useEffect(() => {
    if (hex) {
      postToPlugin({ type: 'generate-scale', hex, anchorStep, curve })
    }
  }, [hex, anchorStep, curve])

  const handleHexChange = useCallback((newHex: string) => {
    setHex(newHex)
  }, [])

  const handleAnchorChange = useCallback((step: ScaleStep) => {
    setAnchorStep(step)
  }, [])

  const handleAddToVariables = useCallback(() => {
    const name = colorName.trim() || suggestedName || 'Color'
    postToPlugin({ type: 'add-to-variables', hex, anchorStep, curve, colorName: name })
  }, [hex, anchorStep, curve, colorName, suggestedName])

  return (
    <div className="flex flex-col gap-3 p-4 h-full">
      <h1 className="text-base font-semibold text-figma-text">Huemanize</h1>

      <HexInput value={hex} onChange={handleHexChange} />

      <ScalePreview
        scale={scale}
        anchorStep={anchorStep}
        onAnchorChange={handleAnchorChange}
      />

      <CurveSelector value={curve} onChange={setCurve} />

      <ColorNameInput value={colorName} onChange={setColorName} />

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
  )
}
