const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function formatBytes(bytes: number | null | undefined, digits = 1): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  let i = 0
  let v = bytes
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 ? 0 : digits)} ${UNITS[i]}`
}

export function formatSpeed(bytesPerSec: number | null | undefined): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '—'
  return `${formatBytes(bytesPerSec)}/s`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const s = Math.round(seconds)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (d > 0) return `${d}g ${h}s`
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export function fileExtension(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : ''
}

export function progressOf(item: { totalBytes: number | null; downloadedBytes: number; hls?: { segmentsTotal: number; segmentsDone: number } }): number | null {
  if (item.hls && item.hls.segmentsTotal > 0) return item.hls.segmentsDone / item.hls.segmentsTotal
  if (!item.totalBytes) return null
  return Math.min(1, item.downloadedBytes / item.totalBytes)
}

/** "1.5 MB", "800k", "2m" gibi girdileri bayta çevirir */
export function parseSize(input: string): number | null {
  const m = input.trim().match(/^(\d+(?:[.,]\d+)?)\s*([kmgt]?)(?:i?b)?(?:\/s)?$/i)
  if (!m) return null
  const n = parseFloat(m[1].replace(',', '.'))
  const mult = { '': 1, k: 1024, m: 1024 ** 2, g: 1024 ** 3, t: 1024 ** 4 }[m[2].toLowerCase() as '' | 'k' | 'm' | 'g' | 't']
  return Math.round(n * mult)
}

/**
 * Toplu indirme deseni: "https://x.com/img[001-120].jpg" veya "file[a-z].zip".
 * Birden çok köşeli parantez desteklenir.
 */
export function expandUrlPattern(pattern: string, limit = 10000): string[] {
  const m = pattern.match(/\[([0-9]+|[a-zA-Z])-([0-9]+|[a-zA-Z])(?::(\d+))?\]/)
  if (!m || m.index === undefined) return [pattern]
  const [whole, from, to, stepStr] = m
  const step = Math.max(1, Number(stepStr ?? 1))
  const head = pattern.slice(0, m.index)
  const tail = pattern.slice(m.index + whole.length)
  const values: string[] = []
  if (/^\d+$/.test(from) && /^\d+$/.test(to)) {
    const width = from.startsWith('0') || to.startsWith('0') ? from.length : 0
    const a = Number(from)
    const b = Number(to)
    const dir = a <= b ? 1 : -1
    for (let i = a; dir > 0 ? i <= b : i >= b; i += step * dir) {
      values.push(String(i).padStart(width, '0'))
      if (values.length >= limit) break
    }
  } else if (/^[a-zA-Z]$/.test(from) && /^[a-zA-Z]$/.test(to)) {
    const a = from.charCodeAt(0)
    const b = to.charCodeAt(0)
    const dir = a <= b ? 1 : -1
    for (let i = a; dir > 0 ? i <= b : i >= b; i += step * dir) values.push(String.fromCharCode(i))
  } else {
    return [pattern]
  }
  const out: string[] = []
  for (const v of values) {
    for (const rest of expandUrlPattern(tail, limit)) {
      out.push(head + v + rest)
      if (out.length >= limit) return out
    }
  }
  return out
}

export function isHttpUrl(text: string): boolean {
  try {
    const u = new URL(text.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'ftp:'
  } catch {
    return false
  }
}
