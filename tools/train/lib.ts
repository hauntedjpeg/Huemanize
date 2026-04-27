import { readdir, readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { oklch, parse } from 'culori'

export const HERE = dirname(fileURLToPath(import.meta.url))
export const CACHE_DIR = join(HERE, 'cache')
export const DATA_DIR = join(HERE, 'data')
export const REPORTS_DIR = join(HERE, 'reports')

export const STANDARD_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const
export type StandardStep = (typeof STANDARD_STEPS)[number]

export interface ApiShade { name: string; hexcode: string; hsl: { hue: number; saturation: number; lightness: number } }
export interface ApiResponse { name: string; shades: ApiShade[] }
export interface CacheEntry { input: string; response: ApiResponse; fetchedAt: string }

export interface OklchPoint { l: number; c: number; h: number }

export function toOklch(hex: string): OklchPoint {
  const p = parse(hex)
  if (!p) throw new Error(`Invalid hex: ${hex}`)
  const o = oklch(p)
  if (!o) throw new Error(`OKLCH conversion failed: ${hex}`)
  return { l: o.l ?? 0, c: o.c ?? 0, h: o.h ?? 0 }
}

export async function loadAllCache(): Promise<CacheEntry[]> {
  const files = await readdir(CACHE_DIR)
  const entries: CacheEntry[] = []
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    const raw = await readFile(join(CACHE_DIR, f), 'utf-8')
    entries.push(JSON.parse(raw))
  }
  return entries
}

export async function loadCacheForSet(set: 'training' | 'validation'): Promise<CacheEntry[]> {
  const { generateSamples } = await import('./samples.ts')
  const sampleHexes = new Set(generateSamples(set).map((s) => s.hex.toLowerCase()))
  const all = await loadAllCache()
  return all.filter((e) => sampleHexes.has(e.input.toLowerCase()))
}

/**
 * Find the step in the response whose hex matches the input (the auto-detected anchor).
 * Returns null if no exact match (rare; happens for some grays where uicolors returns a slight variation).
 */
export function findAnchorStep(entry: CacheEntry): StandardStep | null {
  const inputNorm = entry.input.toLowerCase().replace('#', '')
  for (const shade of entry.response.shades) {
    if (shade.hexcode.toLowerCase().replace('#', '') === inputNorm) {
      return Number(shade.name) as StandardStep
    }
  }
  return null
}

/** Circular mean of angles in degrees. */
export function circularMeanDeg(angles: number[]): number {
  if (angles.length === 0) return 0
  let x = 0, y = 0
  for (const a of angles) {
    const r = (a * Math.PI) / 180
    x += Math.cos(r); y += Math.sin(r)
  }
  const mean = (Math.atan2(y / angles.length, x / angles.length) * 180) / Math.PI
  return (mean + 360) % 360
}

/** Signed angular difference in degrees, in (-180, 180]. */
export function angularDiff(a: number, b: number): number {
  let d = (a - b) % 360
  if (d > 180) d -= 360
  if (d <= -180) d += 360
  return d
}

export function mean(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length)
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function percentile(xs: number[], p: number): number {
  if (xs.length === 0) return 0
  const sorted = [...xs].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[idx]
}
