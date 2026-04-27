import { SiChevronDown } from "stera-icons"
import type { CurveType } from "../types"

interface CurveSelectProps {
  value: CurveType
  onChange: (curve: CurveType) => void
}

interface OptionDef {
  value: CurveType
  label: string
}

const CUSTOM_OPTIONS: OptionDef[] = [
  { value: "linear", label: "Linear" },
  { value: "fine-ends", label: "Fine Ends" },
  { value: "fine-ends-contrast", label: "Fine Ends + Contrast" },
]

const TAILWIND_OPTIONS: OptionDef[] = [
  { value: "tailwind-reference", label: "Tailwind Reference" },
  { value: "tailwind-parametric", label: "Tailwind Parametric" },
  { value: "tailwind-hybrid", label: "Tailwind Hybrid" },
]

export default function CurveToggle({ value, onChange }: CurveSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px]/3.5 font-medium tracking-wide text-figma-text-secondary">
        Curve
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as CurveType)}
          className="w-full h-6 appearance-none px-2 text-[11px]/4 rounded-md border border-figma-bg-secondary hover:border-figma-border bg-figma-bg-secondary text-figma-text focus-visible:outline-none focus-visible:border-figma-border-selected"
        >
          <optgroup label="Custom">
            {CUSTOM_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
          <optgroup label="Tailwind">
            {TAILWIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </optgroup>
        </select>
        <SiChevronDown
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-figma-text-secondary"
          size={10}
        />
      </div>
    </div>
  )
}
