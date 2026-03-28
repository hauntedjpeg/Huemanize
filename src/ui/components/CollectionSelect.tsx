import { SiChevronDown } from 'stera-icons'
import type { CollectionOption } from '../types'

interface CollectionSelectProps {
  collections: CollectionOption[]
  value: string
  onChange: (collectionId: string) => void
}

export default function CollectionSelect({ collections, value, onChange }: CollectionSelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px]/3.5 font-medium tracking-wide text-figma-text-secondary">Collection</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-6 appearance-none px-2 text-[11px]/4 rounded-md border border-figma-bg-secondary hover:border-figma-border bg-figma-bg-secondary text-figma-text focus-visible:outline-none focus-visible:border-figma-border-selected"
        >
          <option value="">Create new collection</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <SiChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-figma-text-secondary" size={10} />
      </div>
    </div>
  )
}
