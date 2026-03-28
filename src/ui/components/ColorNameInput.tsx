interface ColorNameInputProps {
  value: string
  onChange: (name: string) => void
}

export default function ColorNameInput({ value, onChange }: ColorNameInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px]/3.5 font-medium tracking-wide text-figma-text-secondary">Color name</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Blue, Primary, Brand"
        className="h-6 px-2 py-1.5 text-[11px]/4 rounded-md border border-figma-bg-secondary hover:border-figma-border bg-figma-bg-secondary text-figma-text focus:outline-none focus-visible:border-figma-border-selected"
      />
    </div>
  )
}
