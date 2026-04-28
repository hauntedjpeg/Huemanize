import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  PluginMessage,
  PluginResponse,
  ScaleEntry,
  ScaleType,
  CollectionOption,
  CollectionWithGroups,
} from './types'
import HexInput from './components/HexInput'
import ScalePreview from './components/ScalePreview'
import ColorNameInput from './components/ColorNameInput'
import ModeToggle from './components/ModeToggle'
import ScaleTypeToggle from './components/ScaleTypeToggle'
import BackgroundInputs from './components/BackgroundInputs'
import CollectionSelect from './components/CollectionSelect'
import GroupSelect from './components/GroupSelect'

function postToPlugin(msg: PluginMessage) {
  parent.postMessage({ pluginMessage: msg }, '*')
}

type Mode = 'add' | 'update'

const STORAGE_PREFIX = 'huemanize:'
function loadString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(STORAGE_PREFIX + key) ?? fallback
  } catch {
    return fallback
  }
}
function saveString(key: string, value: string) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, value)
  } catch {
    // ignore
  }
}

export default function App() {
  const [hex, setHex] = useState(() => loadString('hex', '#3B82F6'))
  const [scaleType, setScaleType] = useState<ScaleType>(
    () => (loadString('scaleType', 'accent') as ScaleType),
  )
  const [lightBackground, setLightBackground] = useState(() => loadString('lightBg', '#FFFFFF'))
  const [darkBackground, setDarkBackground] = useState(() => loadString('darkBg', '#0C0C0C'))
  const [scale, setScale] = useState<ScaleEntry[]>([])
  const [colorName, setColorName] = useState('')
  const [suggestedName, setSuggestedName] = useState('')
  const [mode, setMode] = useState<Mode>(() => (loadString('targetMode', 'add') as Mode))
  const [collections, setCollections] = useState<CollectionOption[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('')
  const [groupedCollections, setGroupedCollections] = useState<CollectionWithGroups[]>([])
  const [selectedTarget, setSelectedTarget] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const prevSuggestion = useRef('')
  const colorNameRef = useRef(colorName)
  colorNameRef.current = colorName

  // Persist user preferences
  useEffect(() => saveString('hex', hex), [hex])
  useEffect(() => saveString('scaleType', scaleType), [scaleType])
  useEffect(() => saveString('lightBg', lightBackground), [lightBackground])
  useEffect(() => saveString('darkBg', darkBackground), [darkBackground])
  useEffect(() => saveString('targetMode', mode), [mode])

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
        setSelectedTarget(
          msg.collections[0]?.groups[0]
            ? `${msg.collections[0].id}|${msg.collections[0].groups[0]}`
            : '',
        )
      } else if (msg.type === 'added-to-variables') {
        setErrorMessage('')
      } else if (msg.type === 'mismatched-collection') {
        setErrorMessage(
          `"${msg.collectionName}" already uses the legacy 50–950 step naming under this color. Switch to a different collection or pick "Create new collection".`,
        )
      } else if (msg.type === 'error') {
        setErrorMessage(msg.message)
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

  // Generate scale when inputs change
  useEffect(() => {
    if (hex) {
      postToPlugin({
        type: 'generate-scale',
        hex,
        scaleType,
        lightBackground,
        darkBackground,
      })
    }
  }, [hex, scaleType, lightBackground, darkBackground])

  const handleHexChange = useCallback((newHex: string) => {
    setHex(newHex)
  }, [])

  const handleSubmit = useCallback(() => {
    setErrorMessage('')
    if (mode === 'update') {
      const [collectionId, ...groupParts] = selectedTarget.split('|')
      const groupName = groupParts.join('|')
      postToPlugin({
        type: 'add-to-variables',
        hex,
        scaleType,
        lightBackground,
        darkBackground,
        colorName: groupName,
        collectionId,
      })
    } else {
      const name = colorName.trim() || suggestedName || 'Color'
      postToPlugin({
        type: 'add-to-variables',
        hex,
        scaleType,
        lightBackground,
        darkBackground,
        colorName: name,
        collectionId: selectedCollectionId || undefined,
      })
    }
  }, [
    mode,
    hex,
    scaleType,
    lightBackground,
    darkBackground,
    colorName,
    suggestedName,
    selectedCollectionId,
    selectedTarget,
  ])

  return (
    <div className="flex h-full">
      <div className="flex flex-col w-full">
        <div className="flex flex-col p-4 gap-3 border-b border-figma-border">
          <HexInput value={hex} onChange={handleHexChange} />
          <ScaleTypeToggle value={scaleType} onChange={setScaleType} />
          <BackgroundInputs
            light={lightBackground}
            dark={darkBackground}
            onLightChange={setLightBackground}
            onDarkChange={setDarkBackground}
          />
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

        {errorMessage && (
          <div className="px-4 pb-2 text-[11px]/4 text-figma-text-danger">{errorMessage}</div>
        )}

        <div className="flex flex-col gap-3 p-4 mt-auto">
          <button
            onClick={handleSubmit}
            disabled={scale.length === 0 || (mode === 'update' && !selectedTarget)}
            className="flex justify-center items-center w-full h-6 py-2 text-[11px]/4 font-medium rounded bg-figma-bg-brand text-figma-text-onbrand hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mode === 'update' ? 'Update Variables' : 'Add Variables'}
          </button>
        </div>
      </div>

      <div className="w-full p-4 border-l border-figma-border">
        <ScalePreview scale={scale} />
      </div>
    </div>
  )
}
