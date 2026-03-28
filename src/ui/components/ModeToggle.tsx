type Mode = 'add' | 'update'

interface ModeToggleProps {
  value: Mode
  onChange: (mode: Mode) => void
}

export default function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-figma-text-secondary">Action</label>
      <div className="flex rounded border border-figma-border overflow-hidden">
        <button
          onClick={() => onChange('add')}
          className={`flex-1 h-6 text-[11px]/4 font-medium transition-colors ${value === 'add' ? 'bg-figma-bg-brand text-figma-text-onbrand' : 'bg-figma-bg-secondary text-figma-text-secondary hover:text-figma-text'}`}
        >
          Add
        </button>
        <button
          onClick={() => onChange('update')}
          className={`flex-1 h-6 text-[11px]/4 font-medium transition-colors border-l border-figma-border ${value === 'update' ? 'bg-figma-bg-brand text-figma-text-onbrand' : 'bg-figma-bg-secondary text-figma-text-secondary hover:text-figma-text'}`}
        >
          Update
        </button>
      </div>
    </div>
  )
}
