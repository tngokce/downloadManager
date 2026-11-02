import type { Segment } from '@shared/types'

/** Boyutu bilinmeyen akışlar için bölüm sonu */
export const UNKNOWN_END = Number.MAX_SAFE_INTEGER

export function isDone(s: Segment): boolean {
  return s.pos > s.end
}

export function remainingOf(s: Segment, cursor = s.pos): number {
  return Math.max(0, s.end - cursor + 1)
}

export function downloadedOf(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + (Math.min(s.pos, s.end + 1) - s.start), 0)
}

/** Dosyayı eşit parçalara böler. */
export function createSegments(total: number, parts: number, minSize: number): Segment[] {
  if (total <= 0) return [{ start: 0, end: -1, pos: 0 }]
  const count = Math.max(1, Math.min(parts, Math.floor(total / Math.max(1, minSize)) || 1))
  const size = Math.ceil(total / count)
  const out: Segment[] = []
  for (let start = 0; start < total; start += size) {
    const end = Math.min(total, start + size) - 1
    out.push({ start, end, pos: start })
  }
  return out
}

/**
 * Boştaki bir bağlantı için iş bulur (IDM tarzı dinamik bölümleme):
 * 1. Kimsenin çalışmadığı yarım bölüm varsa onu verir.
 * 2. Yoksa kalan kısmı en büyük olan aktif bölümü ikiye böler, ikinci yarıyı verir.
 *    Böylece erken biten bağlantılar yavaş olanların yükünü paylaşır ve indirme sonunda
 *    tek bir yavaş bağlantı beklenmez.
 *
 * `cursorOf` aktif bölümün o ana kadar alınmış (henüz diske yazılmamış olsa bile) konumunu verir;
 * bölme noktası her zaman bunun ilerisinde seçilir.
 */
export function pickWork(
  segments: Segment[],
  busy: Set<Segment>,
  minSize: number,
  cursorOf: (s: Segment) => number
): Segment | null {
  let idle: Segment | null = null
  for (const s of segments) {
    if (!isDone(s) && !busy.has(s) && (!idle || remainingOf(s) > remainingOf(idle))) idle = s
  }
  if (idle) return idle

  let victim: Segment | null = null
  let victimRemaining = 0
  for (const s of segments) {
    if (!busy.has(s) || s.end === UNKNOWN_END) continue
    const rem = remainingOf(s, cursorOf(s))
    if (rem > victimRemaining) {
      victim = s
      victimRemaining = rem
    }
  }
  if (!victim || victimRemaining < minSize * 2) return null

  const cursor = cursorOf(victim)
  const mid = cursor + Math.floor(victimRemaining / 2)
  const fresh: Segment = { start: mid, end: victim.end, pos: mid }
  victim.end = mid - 1
  segments.splice(segments.indexOf(victim) + 1, 0, fresh)
  return fresh
}

/** Biten bitişik bölümleri birleştirerek kayıt dosyasını küçük tutar. */
export function compactSegments(segments: Segment[]): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start)
  const out: Segment[] = []
  for (const s of sorted) {
    const prev = out[out.length - 1]
    if (prev && isDone(prev) && prev.end + 1 === s.start && isDone(s)) {
      prev.end = s.end
      prev.pos = s.end + 1
    } else {
      out.push({ ...s })
    }
  }
  return out
}
