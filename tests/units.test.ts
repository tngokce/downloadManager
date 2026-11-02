import { describe, expect, it } from 'vitest'
import { createSegments, downloadedOf, isDone, pickWork, compactSegments } from '../src/main/engine/segments'
import { parseContentDisposition, sanitizeFileName, resolveFileName } from '../src/main/engine/filename'
import { guessAlgorithm } from '../src/main/engine/checksum'
import { expandUrlPattern, formatBytes, parseSize } from '../src/shared/format'
import type { Segment } from '../src/shared/types'

describe('segments', () => {
  it('dosyayı eşit ve boşluksuz böler', () => {
    const s = createSegments(1000, 3, 10)
    expect(s[0].start).toBe(0)
    expect(s[s.length - 1].end).toBe(999)
    for (let i = 1; i < s.length; i++) expect(s[i].start).toBe(s[i - 1].end + 1)
  })

  it('küçük dosyayı en küçük bölüm boyutuna göre daha az parçaya böler', () => {
    expect(createSegments(100, 8, 60)).toHaveLength(1)
    expect(createSegments(0, 8, 60)).toEqual([{ start: 0, end: -1, pos: 0 }])
  })

  it('boş bağlantı en büyük aktif bölümü ikiye böler', () => {
    const segs: Segment[] = [
      { start: 0, end: 999, pos: 1000 },
      { start: 1000, end: 1999, pos: 1100 }
    ]
    const busy = new Set([segs[1]])
    const fresh = pickWork(segs, busy, 100, (s) => s.pos)!
    expect(fresh.start).toBe(1550)
    expect(segs[1].end).toBe(1549)
    expect(fresh.end).toBe(1999)
    // bölme noktası alınmış ama yazılmamış veri imlecinin ilerisinde olmalı
    const segs2: Segment[] = [{ start: 0, end: 999, pos: 0 }]
    const f2 = pickWork(segs2, new Set(segs2), 100, () => 600)!
    expect(f2.start).toBeGreaterThan(600)
  })

  it('çok küçük kalan işi bölmez', () => {
    const segs: Segment[] = [{ start: 0, end: 999, pos: 900 }]
    expect(pickWork(segs, new Set(segs), 100, (s) => s.pos)).toBeNull()
  })

  it('biten bitişik bölümleri birleştirir ve ilerleme korunur', () => {
    const segs: Segment[] = [
      { start: 0, end: 9, pos: 10 },
      { start: 10, end: 19, pos: 20 },
      { start: 20, end: 29, pos: 25 }
    ]
    const c = compactSegments(segs)
    expect(c).toHaveLength(2)
    expect(downloadedOf(c)).toBe(downloadedOf(segs))
    expect(isDone(c[0])).toBe(true)
  })
})

describe('filename', () => {
  it('Content-Disposition biçimlerini çözer', () => {
    expect(parseContentDisposition(`attachment; filename*=UTF-8''%C3%A7i%C3%A7ek.pdf`)).toBe('çiçek.pdf')
    expect(parseContentDisposition('attachment; filename="a b.zip"')).toBe('a b.zip')
    expect(parseContentDisposition('attachment; filename=x.rar')).toBe('x.rar')
    expect(parseContentDisposition(`attachment; filename="${Buffer.from('Türkçe.zip').toString('latin1')}"`)).toBe('Türkçe.zip')
  })

  it('geçersiz karakterleri ve ayrılmış adları temizler', () => {
    expect(sanitizeFileName('a<b>:c?.txt')).toBe('a_b__c_.txt')
    expect(sanitizeFileName('CON.txt')).toBe('_CON.txt')
    expect(sanitizeFileName('...')).toBe('download')
    expect(Buffer.byteLength(sanitizeFileName('ş'.repeat(300) + '.zip'))).toBeLessThanOrEqual(200)
    expect(sanitizeFileName('ş'.repeat(300) + '.zip').endsWith('.zip')).toBe(true)
  })

  it('URL ve MIME türünden ad üretir', () => {
    expect(resolveFileName({ url: 'https://x.com/dl/setup%20v2.exe?token=1' })).toBe('setup v2.exe')
    expect(resolveFileName({ url: 'https://x.com/download', mime: 'application/pdf' })).toBe('download.pdf')
  })
})

describe('format', () => {
  it('toplu indirme desenlerini genişletir', () => {
    expect(expandUrlPattern('https://x/img[01-03].jpg')).toEqual(['https://x/img01.jpg', 'https://x/img02.jpg', 'https://x/img03.jpg'])
    expect(expandUrlPattern('https://x/[a-c].zip')).toHaveLength(3)
    expect(expandUrlPattern('https://x/[1-2]/[1-2].zip')).toEqual(['https://x/1/1.zip', 'https://x/1/2.zip', 'https://x/2/1.zip', 'https://x/2/2.zip'])
    expect(expandUrlPattern('https://x/[0-10:5].zip')).toEqual(['https://x/0.zip', 'https://x/5.zip', 'https://x/10.zip'])
  })

  it('boyut okur ve yazar', () => {
    expect(parseSize('1.5 MB')).toBe(1572864)
    expect(parseSize('800k')).toBe(819200)
    expect(parseSize('abc')).toBeNull()
    expect(formatBytes(1536)).toBe('1.5 KB')
  })

  it('hash algoritmasını tahmin eder', () => {
    expect(guessAlgorithm('d41d8cd98f00b204e9800998ecf8427e')).toBe('md5')
    expect(guessAlgorithm('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')).toBe('sha256')
    expect(guessAlgorithm('xyz')).toBeNull()
  })
})
