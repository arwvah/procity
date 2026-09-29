/** Pure, testable logic: normalization, colors, filters, search, sorting. */
import type { FilterKind, Metric, ProcessInfo, SortKey } from '../types'

export const MIN_HEIGHT = 1.4
export const MAX_HEIGHT = 30.0

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Logarithmic normalization so huge outliers do not flatten everything else. */
export function logScale(v: number, lo: number, hi: number): number {
  const a = Math.log1p(Math.max(v, lo))
  const b = Math.log1p(lo)
  const c = Math.log1p(hi)
  return clamp01((a - b) / (c - b))
}

/** Metric ranges (lo, hi) per height metric. */
const RANGES: Record<Metric, [number, number]> = {
  mem: [1, 4096], // MB
  cpu: [0.2, 100], // percent
  threads: [1, 128],
}

export function heightForProcess(p: ProcessInfo, metric: Metric): number {
  const v = metric === 'mem' ? p.mem_mb : metric === 'cpu' ? p.cpu_percent : p.num_threads ?? 1
  const [lo, hi] = RANGES[metric]
  return MIN_HEIGHT + (MAX_HEIGHT - MIN_HEIGHT) * logScale(v, lo, hi)
}

/** CPU% -> RGB gradient: dark blue -> neon blue -> cyan -> orange -> red. */
type RGB = [number, number, number]
const STOPS: Array<[number, RGB]> = [
  [0.0, [0.055, 0.14, 0.4]],
  [0.25, [0.0, 0.65, 1.0]],
  [0.5, [0.0, 0.94, 1.0]],
  [0.75, [1.0, 0.54, 0.24]],
  [0.95, [1.0, 0.23, 0.36]],
  [1.0, [1.0, 0.12, 0.25]],
]

export function cpuColor(cpu: number): RGB {
  const t = clamp01(cpu / 100)
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i]
    const [t0, c0] = STOPS[i - 1]
    if (t <= t1) {
      const f = (t - t0) / (t1 - t0 || 1)
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f]
    }
  }
  return STOPS[STOPS.length - 1][1]
}

/** True when the process passes the active filter. */
export function matchFilter(p: ProcessInfo, filter: FilterKind, currentUid: number | null): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'highcpu':
      return p.cpu_percent >= 10
    case 'highmem':
      return p.mem_mb >= 300
    case 'user':
      if (p.uid !== null && currentUid !== null) return p.uid >= 1000
      return p.username !== null && p.username !== 'root'
    case 'system':
      if (p.uid !== null) return p.uid < 1000
      return p.username === 'root' || p.username === null
    default:
      return true
  }
}

/** Search by process name, PID or username (case-insensitive substring). */
export function searchMatch(p: ProcessInfo, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (!needle) return false
  return (
    p.name.toLowerCase().includes(needle) ||
    String(p.pid).includes(needle) ||
    (p.username !== null && p.username.toLowerCase().includes(needle))
  )
}

export function sortProcesses(list: ProcessInfo[], by: SortKey): ProcessInfo[] {
  const copy = [...list]
  copy.sort((a, b) =>
    by === 'cpu' ? b.cpu_percent - a.cpu_percent : b.mem_mb - a.mem_mb,
  )
  return copy
}

export function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`
}

export function formatUptime(s: number): string {
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
