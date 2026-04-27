import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { DATA_DIR, REPORTS_DIR } from './lib.ts'

interface StepResult {
  step: number
  apiHex: string; ourHex: string
  apiL: number; apiC: number; apiH: number
  ourL: number; ourC: number; ourH: number
  deltaE: number
  dL: number; dC: number; dH: number
  exactMatch: boolean
}

interface InputResult {
  input: string
  inputL: number; inputC: number; inputH: number
  apiAnchor: number | null
  ourAnchor: number
  steps: StepResult[]
  maxDeltaE: number
  meanDeltaE: number
}

function escape(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] ?? c))
}

function dEColor(dE: number): string {
  if (dE < 0.005) return '#86efac'   // imperceptible — green
  if (dE < 0.015) return '#bef264'   // tiny — lime
  if (dE < 0.03)  return '#fde047'   // small — yellow
  if (dE < 0.06)  return '#fdba74'   // medium — orange
  if (dE < 0.12)  return '#fca5a5'   // big — red-light
  return '#ef4444'                    // huge — red
}

function renderRow(r: InputResult): string {
  const cells = r.steps.map((s) => {
    const isAnchor = s.step === r.apiAnchor
    const matchBadge = s.exactMatch ? '✓' : ''
    return `
      <td class="cell" style="background:${dEColor(s.deltaE)}">
        <div class="step">${s.step}${isAnchor ? ' ★' : ''} ${matchBadge}</div>
        <div class="swatches">
          <div class="sw" style="background:${s.apiHex}" title="API: ${s.apiHex}"></div>
          <div class="sw" style="background:${s.ourHex}" title="Ours: ${s.ourHex}"></div>
        </div>
        <div class="hex">${s.apiHex}<br>${s.ourHex}</div>
        <div class="dE">ΔE ${s.deltaE.toFixed(3)}</div>
        <div class="deltas">dL ${s.dL.toFixed(2)} dC ${s.dC.toFixed(2)} dH ${s.dH.toFixed(0)}°</div>
      </td>`
  }).join('')

  return `
    <tr>
      <td class="meta">
        <div class="input-sw" style="background:${r.input}"></div>
        <div class="input-hex">${r.input}</div>
        <div class="input-coords">L ${r.inputL.toFixed(2)} C ${r.inputC.toFixed(2)} H ${r.inputH.toFixed(0)}°</div>
        <div class="anchor">anchor ${r.apiAnchor ?? '?'}</div>
        <div class="max-de">max ΔE ${r.maxDeltaE.toFixed(3)}</div>
      </td>
      ${cells}
    </tr>`
}

function renderHTML(results: InputResult[]): string {
  // Sort worst-first
  const sorted = [...results].sort((a, b) => b.maxDeltaE - a.maxDeltaE)
  const rows = sorted.map(renderRow).join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>uicolors comparison</title>
<style>
  body { background:#0a0a0a; color:#eee; font:12px/1.4 ui-monospace,monospace; padding:16px; }
  h1 { font-size:16px; }
  table { border-collapse:collapse; }
  td { border:1px solid #222; padding:4px; vertical-align:top; }
  td.meta { background:#171717; padding:8px; min-width:90px; }
  .cell { color:#000; min-width:90px; text-align:center; padding:6px; }
  .input-sw, .sw { width:40px; height:40px; border-radius:4px; display:inline-block; }
  .input-sw { width:60px; height:60px; }
  .swatches { display:flex; gap:2px; justify-content:center; margin:4px 0; }
  .sw { width:30px; height:30px; }
  .step { font-weight:600; margin-bottom:2px; }
  .hex { font-size:10px; line-height:1.3; }
  .dE { font-weight:600; margin-top:4px; }
  .deltas { font-size:10px; opacity:0.7; }
  .input-hex { font-weight:600; margin-top:6px; }
  .input-coords, .anchor { font-size:10px; opacity:0.7; margin-top:2px; }
  .max-de { font-weight:600; color:#fca5a5; margin-top:6px; }
  .legend { margin:12px 0; display:flex; gap:8px; align-items:center; }
  .legend > span { display:inline-block; padding:3px 6px; color:#000; font-size:10px; border-radius:3px; }
</style>
</head><body>
<h1>uicolors.app vs Huemanize — ${results.length} inputs, sorted worst-first</h1>
<div class="legend">
  ΔE legend:
  <span style="background:#86efac">imperceptible &lt; 0.005</span>
  <span style="background:#bef264">tiny &lt; 0.015</span>
  <span style="background:#fde047">small &lt; 0.03</span>
  <span style="background:#fdba74">medium &lt; 0.06</span>
  <span style="background:#fca5a5">big &lt; 0.12</span>
  <span style="background:#ef4444">huge ≥ 0.12</span>
</div>
<p>Each cell: top swatch = uicolors API, bottom = our algorithm. ★ = anchor (where API pinned the input). ✓ = exact hex match.</p>
<table>${rows}</table>
</body></html>`
}

async function main() {
  const path = join(DATA_DIR, 'compare-results.json')
  const raw = await readFile(path, 'utf-8')
  const data = JSON.parse(raw) as { results: InputResult[] }

  await mkdir(REPORTS_DIR, { recursive: true })
  const outPath = join(REPORTS_DIR, 'compare.html')
  await writeFile(outPath, renderHTML(data.results))
  console.log(`Report written to ${outPath}`)
  console.log(`Open with:  open ${outPath}`)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {} // mark as module
