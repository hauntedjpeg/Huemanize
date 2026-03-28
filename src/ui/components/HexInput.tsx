import { useState, useCallback } from 'react'

interface HexInputProps {
  value: string
  onChange: (hex: string) => void
}

const HEX_RE = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function normalize(input: string): string | null {
  const match = input.match(HEX_RE)
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]
  }
  return '#' + hex.toLowerCase()
}

export default function HexInput({ value, onChange }: HexInputProps) {
  const [raw, setRaw] = useState(value)
  const [valid, setValid] = useState(true)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value
      setRaw(input)

      const hex = normalize(input)
      if (hex) {
        setValid(true)
        onChange(hex)
      } else {
        setValid(input.length === 0)
      }
    },
    [onChange]
  )

  const displayHex = normalize(raw) ?? value

  return (
    <div className="flex items-center gap-2 relative">
      <div
        className="absolute top-1 left-1 size-4 rounded border border-figma-border shrink-0"
        style={{ backgroundColor: displayHex }}
      />
      <input
        type="text"
        value={raw}
        onChange={handleChange}
        placeholder="#3b82f6"
        className={`h-6 flex-1 px-2 pl-6 text-xs rounded border bg-figma-bg-secondary text-figma-text ${
          valid ? 'border-figma-border' : 'border-figma-border-danger'
        } focus:outline-none focus:border-figma-border-selected`}
      />
    </div>
  )
}
