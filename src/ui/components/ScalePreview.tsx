import type { ScaleEntry } from '../types'

interface ScalePreviewProps {
  scale: ScaleEntry[]
}

export default function ScalePreview({ scale }: ScalePreviewProps) {
  if (scale.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-figma-text-secondary text-[11px]">
        Enter a hex color to generate a scale
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="grid grid-cols-2 gap-2 text-[9px]/3.5 font-medium tracking-wide text-figma-text-secondary">
        <div>Light</div>
        <div>Dark</div>
      </div>
      <div className="grid grid-cols-2 gap-2 flex-1">
        <Column entries={scale} pick={(e) => e.light} />
        <Column entries={scale} pick={(e) => e.dark} />
      </div>
    </div>
  )
}

interface ColumnProps {
  entries: ScaleEntry[]
  pick: (entry: ScaleEntry) => string
}

function Column({ entries, pick }: ColumnProps) {
  return (
    <div className="flex flex-col gap-1">
      {entries.map((entry) => {
        const hex = pick(entry)
        const isLight = isLightColor(hex)
        return (
          <div
            key={entry.step}
            className="flex-1 relative flex items-center justify-center rounded-md"
            style={{ backgroundColor: hex }}
            title={`${entry.step}: ${hex}`}
          >
            <span
              className={`text-[9px] font-medium ${
                isLight ? 'text-black/80' : 'text-white/90'
              }`}
            >
              {entry.step}
            </span>
          </div>
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
  return r * 0.299 + g * 0.587 + b * 0.114 > 150
}
