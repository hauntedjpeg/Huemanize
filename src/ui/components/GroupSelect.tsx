import { SiChevronDown } from "stera-icons"
import type { CollectionWithGroups } from "../types"

interface GroupSelectProps {
  collections: CollectionWithGroups[]
  value: string
  onChange: (target: string) => void
}

export default function GroupSelect({
  collections,
  value,
  onChange,
}: GroupSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px]/3.5 font-medium tracking-wide text-figma-text-secondary">
        Target group
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={collections.length === 0}
          className="w-full h-6 appearance-none px-2 text-[11px]/4 rounded-md border border-figma-bg-secondary hover:border-figma-border bg-figma-bg-secondary text-figma-text focus-visible:outline-none focus-visible:border-figma-border-selected disabled:opacity-50"
        >
          {collections.length === 0 ? (
            <option value="">No color groups found</option>
          ) : (
            collections.map((c) => (
              <optgroup key={c.id} label={c.name}>
                {c.groups.map((g) => (
                  <option key={g} value={`${c.id}|${g}`}>
                    {g}
                  </option>
                ))}
              </optgroup>
            ))
          )}
        </select>
        <SiChevronDown
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-figma-text-secondary"
          size={10}
        />
      </div>
    </div>
  )
}
