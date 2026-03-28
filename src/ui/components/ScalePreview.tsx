import { SiCircleFill } from 'stera-icons'
import type { ScaleEntry, ScaleStep } from '../types'

interface ScalePreviewProps {
  scale: ScaleEntry[]
  anchorStep: ScaleStep
  onAnchorChange: (step: ScaleStep) => void
}

export default function ScalePreview({ scale, anchorStep, onAnchorChange }: ScalePreviewProps) {
  if (scale.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-figma-text-secondary text-sm">
        Enter a hex color to generate a scale
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-1">
      {scale.map((entry) => {
        const isAnchor = entry.step === anchorStep
        const isLight = isLightColor(entry.hex)

        return (
          <button
            key={entry.step}
            onClick={() => onAnchorChange(entry.step)}
            className="flex-1 relative flex h-full flex-col items-center justify-center rounded-md cursor-pointer transition-all"
            style={{
              backgroundColor: entry.hex,
            }}
            title={`${entry.step}: ${entry.hex}${isAnchor ? ' (anchor)' : ''}\nClick to set as anchor`}
          >
            {isAnchor && (
              <SiCircleFill
                className={`absolute left-2 top-1/2 -translate-y-1/2 size-2 ${
                  isLight ? 'text-black/70' : 'text-white/80'
                }`}
              />
            )}
            <span
              className={`text-[9px] font-medium ${
                isLight ? 'text-black/80' : 'text-white/90'
              }`}
            >
              {entry.step}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  // Relative luminance approximation
  return r * 0.299 + g * 0.587 + b * 0.114 > 150
}
