interface ColorNameInputProps {
  value: string
  onChange: (name: string) => void
}

export default function ColorNameInput({ value, onChange }: ColorNameInputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-figma-text-secondary">Color name</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Blue, Primary, Brand"
        className="px-2 py-1.5 text-sm rounded border border-figma-border bg-figma-bg-secondary text-figma-text focus:outline-none focus:border-figma-border-brand"
      />
    </div>
  )
}
