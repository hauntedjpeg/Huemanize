import { useState, useCallback, useEffect } from 'react'

interface BackgroundInputsProps {
  light: string
  dark: string
  onLightChange: (hex: string) => void
  onDarkChange: (hex: string) => void
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

export default function BackgroundInputs({ light, dark, onLightChange, onDarkChange }: BackgroundInputsProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px]/3.5 font-medium tracking-wide text-figma-text-secondary">
        Background
      </label>
      <div className="flex gap-2">
        <BgField value={light} onChange={onLightChange} placeholder="Light" />
        <BgField value={dark} onChange={onDarkChange} placeholder="Dark" />
      </div>
    </div>
  )
}

interface BgFieldProps {
  value: string
  onChange: (hex: string) => void
  placeholder: string
}

function BgField({ value, onChange, placeholder }: BgFieldProps) {
  const [raw, setRaw] = useState(() => value.replace(/^#/, '').toUpperCase())
  const [valid, setValid] = useState(true)
  const [lastValid, setLastValid] = useState(() => value.replace(/^#/, '').toUpperCase())

  // Keep raw in sync if parent updates `value` from outside (e.g. localStorage hydrate)
  useEffect(() => {
    const next = value.replace(/^#/, '').toUpperCase()
    setRaw(next)
    setLastValid(next)
  }, [value])

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target.value
      setRaw(input)
      const hex = normalize(input)
      if (hex) {
        setValid(true)
        setLastValid(input.toUpperCase())
        onChange(hex)
      } else {
        setValid(input.length === 0)
      }
    },
    [onChange],
  )

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    e.target.select()
  }, [])

  const handleBlur = useCallback(() => {
    setRaw((prev) => {
      const cleaned = prev.replace(/^#/, '')
      if (cleaned.length === 0 || !normalize(cleaned)) return lastValid
      return cleaned.toUpperCase()
    })
    setValid(true)
  }, [lastValid])

  const displayHex = normalize(raw) ?? value

  return (
    <div className="relative flex-1">
      <div
        className="absolute top-1.25 left-1.25 size-3.5 rounded-xs shrink-0"
        style={{ backgroundColor: displayHex }}
      />
      <input
        type="text"
        value={raw}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        className={`h-6 w-full px-2 pl-6 text-[11px]/4 rounded-md border bg-figma-bg-secondary text-figma-text ${
          valid
            ? 'border-figma-bg-secondary hover:border-figma-border'
            : 'border-figma-border-danger'
        } focus:outline-none focus:border-figma-border-selected`}
      />
    </div>
  )
}
