import { CURVE_OPTIONS, type LightnessCurve } from '../types'

interface CurveSelectorProps {
  value: LightnessCurve
  onChange: (curve: LightnessCurve) => void
}

export default function CurveSelector({ value, onChange }: CurveSelectorProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-figma-text-secondary">Lightness curve</label>
      <div className="flex gap-0.5 bg-figma-bg-secondary rounded p-0.5">
        {CURVE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            title={opt.description}
            className={`flex-1 py-1 text-xs rounded transition-colors ${
              value === opt.value
                ? 'bg-figma-bg text-figma-text font-medium shadow-sm'
                : 'text-figma-text-secondary hover:text-figma-text'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
