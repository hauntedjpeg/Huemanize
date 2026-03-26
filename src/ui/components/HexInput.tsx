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
    <div className="flex items-center gap-2">
      <div
        className="w-8 h-8 rounded border border-figma-border shrink-0"
        style={{ backgroundColor: displayHex }}
      />
      <input
        type="text"
        value={raw}
        onChange={handleChange}
        placeholder="#3b82f6"
        className={`flex-1 px-2 py-1.5 text-sm rounded border bg-figma-bg-secondary text-figma-text font-mono ${
          valid ? 'border-figma-border' : 'border-figma-border-danger'
        } focus:outline-none focus:border-figma-border-brand`}
      />
    </div>
  )
}
