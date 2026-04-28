import { colornames as colorNameList } from 'color-name-list'

const HEX_RE = /^#[0-9a-fA-F]{6}$/

/**
 * Suggest a color name by finding the nearest match in the color-name-list
 * database (~30,000 named colors) using RGB Euclidean distance.
 */
export function suggestColorName(hex: string): string {
  if (!HEX_RE.test(hex)) return 'Color'

  const norm = hex.slice(1)
  const tr = parseInt(norm.slice(0, 2), 16)
  const tg = parseInt(norm.slice(2, 4), 16)
  const tb = parseInt(norm.slice(4, 6), 16)

  let bestName = 'Color'
  let bestDist = Infinity

  for (const entry of colorNameList) {
    const h = entry.hex.replace('#', '')
    if (h.length !== 6) continue
    const dr = tr - parseInt(h.slice(0, 2), 16)
    const dg = tg - parseInt(h.slice(2, 4), 16)
    const db = tb - parseInt(h.slice(4, 6), 16)
    const dist = dr * dr + dg * dg + db * db
    if (dist < bestDist) {
      bestDist = dist
      bestName = entry.name
    }
  }

  return bestName
}
