type Mode = 'add' | 'update'

interface ModeToggleProps {
  value: Mode
  onChange: (mode: Mode) => void
}

export default function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <div className="flex rounded-md bg-figma-bg-secondary overflow-hidden">
      <button
        onClick={() => onChange('add')}
        className={`flex-1 h-6 text-[11px]/4 rounded-md border border-figma-bg font-medium ${value === 'add' ? 'bg-figma-bg border border-figma-border text-figma-text' : 'border-transparent text-figma-text-secondary hover:text-figma-text'}`}
      >
        Add
      </button>
      <button
        onClick={() => onChange('update')}
        className={`flex-1 h-6 text-[11px]/4 rounded-md border border-figma-bg font-medium ${value === 'update' ? 'bg-figma-bg border border-figma-border text-figma-text' : 'border-transparent text-figma-text-secondary hover:text-figma-text'}`}
      >
        Update
      </button>
    </div>
  )
}
