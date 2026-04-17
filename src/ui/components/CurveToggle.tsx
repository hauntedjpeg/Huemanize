import type { CurveType } from '../types'

interface CurveToggleProps {
  value: CurveType
  onChange: (curve: CurveType) => void
}

export default function CurveToggle({ value, onChange }: CurveToggleProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px]/3.5 font-medium tracking-wide text-figma-text-secondary">Curve</label>
      <div className="flex rounded-md bg-figma-bg-secondary overflow-hidden">
        <button
          onClick={() => onChange('linear')}
          className={`flex-1 h-6 text-[11px]/4 rounded-md border border-figma-bg font-medium ${value === 'linear' ? 'bg-figma-bg border border-figma-border text-figma-text' : 'border-transparent text-figma-text-secondary hover:text-figma-text'}`}
        >
          Linear
        </button>
        <button
          onClick={() => onChange('fine-ends')}
          className={`flex-1 h-6 text-[11px]/4 rounded-md border border-figma-bg font-medium ${value === 'fine-ends' ? 'bg-figma-bg border border-figma-border text-figma-text' : 'border-transparent text-figma-text-secondary hover:text-figma-text'}`}
        >
          Fine Ends
        </button>
      </div>
    </div>
  )
}
