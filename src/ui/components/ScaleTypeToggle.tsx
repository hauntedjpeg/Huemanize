import type { ScaleType } from '../types'

interface ScaleTypeToggleProps {
  value: ScaleType
  onChange: (scaleType: ScaleType) => void
}

export default function ScaleTypeToggle({ value, onChange }: ScaleTypeToggleProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px]/3.5 font-medium tracking-wide text-figma-text-secondary">
        Scale type
      </label>
      <div className="flex rounded-md bg-figma-bg-secondary overflow-hidden">
        <button
          onClick={() => onChange('accent')}
          className={`flex-1 h-6 text-[11px]/4 rounded-md border border-figma-bg font-medium ${value === 'accent' ? 'bg-figma-bg border border-figma-border text-figma-text' : 'border-transparent text-figma-text-secondary hover:text-figma-text'}`}
        >
          Accent
        </button>
        <button
          onClick={() => onChange('gray')}
          className={`flex-1 h-6 text-[11px]/4 rounded-md border border-figma-bg font-medium ${value === 'gray' ? 'bg-figma-bg border border-figma-border text-figma-text' : 'border-transparent text-figma-text-secondary hover:text-figma-text'}`}
        >
          Gray
        </button>
      </div>
    </div>
  )
}
