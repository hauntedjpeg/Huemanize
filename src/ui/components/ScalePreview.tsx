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
    <div className="flex flex-col gap-1">
      <div className="flex gap-0.5">
        {scale.map((entry) => {
          const isAnchor = entry.step === anchorStep
          const isLight = isLightColor(entry.hex)

          return (
            <button
              key={entry.step}
              onClick={() => onAnchorChange(entry.step)}
              className={`flex-1 flex flex-col items-center justify-end rounded-sm cursor-pointer transition-all ${
                isAnchor ? 'ring-2 ring-figma-border-brand ring-offset-1' : ''
              }`}
              style={{
                backgroundColor: entry.hex,
                height: '140px',
              }}
              title={`${entry.step}: ${entry.hex}${isAnchor ? ' (anchor)' : ''}\nClick to set as anchor`}
            >
              <span
                className={`text-[9px] font-medium pb-1 ${
                  isLight ? 'text-black/60' : 'text-white/60'
                }`}
              >
                {entry.step}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-figma-text-tertiary text-center">
        Click a swatch to reposition your color
      </p>
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
