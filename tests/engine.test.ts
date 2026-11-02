import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { HttpDownloader } from '../src/main/engine/HttpDownloader'
import { HlsDownloader, parsePlaylist } from '../src/main/engine/hls'
import { probe } from '../src/main/engine/probe'
import { SpeedLimiter } from '../src/main/engine/throttle'
import { errorCode } from '../src/main/engine/errors'
import { makeConfig, makeItem, sha256, startServer, tempDir, type TestServer } from './helpers'

const MB = 1024 * 1024
let server: TestServer | null = null
afterEach(async () => {
  await server?.close()
  server = null
})

async function fileHash(dir: string, name: string) {
  return sha256(await readFile(join(dir, name)))
}

describe('probe', () => {
  it('boyutu, devam desteğini ve UTF-8 dosya adını algılar (yönlendirme dahil)', async () => {
    server = await startServer(2 * MB)
    const r = await probe(`${server.url}/redirect`, { dispatcher: makeConfig().dispatcher })
    expect(r.totalBytes).toBe(2 * MB)
    expect(r.resumable).toBe(true)
    expect(r.fileName).toBe('Türkçe dosya.bin')
    expect(r.finalUrl).toBe(`${server.url}/files/real.bin`)
  })

  it('Range desteklemeyen sunucuyu tanır', async () => {
    server = await startServer(MB, { noRange: true })
    const r = await probe(`${server.url}/a.bin`, { dispatcher: makeConfig().dispatcher })
    expect(r.resumable).toBe(false)
    expect(r.totalBytes).toBe(MB)
  })

  it('HLS ana listesindeki kaliteleri listeler', async () => {
    server = await startServer(MB)
    const r = await probe(`${server.url}/master.m3u8`, { dispatcher: makeConfig().dispatcher })
    expect(r.kind).toBe('hls')
    expect(r.hlsVariants?.map((v) => v.name)).toEqual(['720p · 2400 kbps', '360p · 800 kbps'])
  })
})

describe('HttpDownloader', () => {
  it('çok bağlantıyla eksiksiz indirir', async () => {
    server = await startServer(20 * MB + 12345)
    const dir = await tempDir()
    const item = makeItem(`${server.url}/f.bin`, dir)
    expect(await new HttpDownloader(item, makeConfig()).run()).toBe('completed')
    expect(await fileHash(dir, 'file.bin')).toBe(server.sha256)
    expect(item.downloadedBytes).toBe(server.data.length)
    expect(server.stats.maxConcurrent).toBeGreaterThan(1)
    expect(await readdir(dir)).toEqual(['file.bin'])
  })

  it('duraklatılıp yeni bir görevle kaldığı yerden devam eder', async () => {
    server = await startServer(16 * MB, { perConnectionRate: 4 * MB })
    const dir = await tempDir()
    const item = makeItem(`${server.url}/f.bin`, dir)
    const t1 = new HttpDownloader(item, makeConfig())
    const p = t1.run()
    await new Promise((r) => setTimeout(r, 400))
    t1.pause()
    expect(await p).toBe('paused')
    const partial = item.downloadedBytes
    expect(partial).toBeGreaterThan(0)
    expect(partial).toBeLessThan(16 * MB)

    // Uygulama yeniden başlamış gibi: kayıtlı segmentlerin JSON kopyasıyla devam
    const restored = JSON.parse(JSON.stringify(item))
    const before = server.stats.requests
    expect(await new HttpDownloader(restored, makeConfig()).run()).toBe('completed')
    expect(await fileHash(dir, 'file.bin')).toBe(server.sha256)
    expect(server.stats.requests - before).toBeGreaterThan(1)
  })

  it('rastgele kopan bağlantılara rağmen dosyayı bozulmadan tamamlar', async () => {
    server = await startServer(12 * MB, { dropRate: 0.5 })
    const dir = await tempDir()
    const item = makeItem(`${server.url}/f.bin`, dir)
    expect(await new HttpDownloader(item, makeConfig()).run()).toBe('completed')
    expect(await fileHash(dir, 'file.bin')).toBe(server.sha256)
    expect(item.retryCount).toBeGreaterThan(0)
  })

  it('Range desteklemeyen sunucudan tek bağlantıyla indirir, kopunca baştan alır', async () => {
    server = await startServer(4 * MB, { noRange: true, dropRate: 0.4 })
    const dir = await tempDir()
    const item = makeItem(`${server.url}/f.bin`, dir)
    expect(await new HttpDownloader(item, makeConfig()).run()).toBe('completed')
    expect(item.resumable).toBe(false)
    expect(server.stats.maxConcurrent).toBe(1)
    expect(await fileHash(dir, 'file.bin')).toBe(server.sha256)
  })

  it('boyutu bilinmeyen (chunked) yanıtı indirir', async () => {
    server = await startServer(3 * MB + 7, { noRange: true, chunked: true })
    const dir = await tempDir()
    const item = makeItem(`${server.url}/f.bin`, dir)
    expect(await new HttpDownloader(item, makeConfig()).run()).toBe('completed')
    expect(item.totalBytes).toBe(3 * MB + 7)
    expect(await fileHash(dir, 'file.bin')).toBe(server.sha256)
  })

  it('sunucu bağlantı sınırına (429) uyum sağlar', async () => {
    server = await startServer(8 * MB, { maxConcurrent: 2, perConnectionRate: 8 * MB })
    const dir = await tempDir()
    const item = makeItem(`${server.url}/f.bin`, dir, { maxConnections: 8 })
    expect(await new HttpDownloader(item, makeConfig()).run()).toBe('completed')
    expect(await fileHash(dir, 'file.bin')).toBe(server.sha256)
    expect(server.stats.rejected).toBeGreaterThan(0)
  })

  it('aynı adlı dosya varsa yeni ad verir', async () => {
    server = await startServer(MB)
    const dir = await tempDir()
    await new HttpDownloader(makeItem(`${server.url}/f.bin`, dir), makeConfig()).run()
    const second = makeItem(`${server.url}/f.bin`, dir)
    await new HttpDownloader(second, makeConfig()).run()
    expect(second.fileName).toBe('file (1).bin')
  })

  it('404 hatasında anlamlı hata kodu verir', async () => {
    server = await startServer(MB)
    const dir = await tempDir()
    const err = await new HttpDownloader(makeItem(`${server.url}/missing`, dir), makeConfig()).run().catch((e) => e)
    expect(errorCode(err)).toBe('http:404')
  })

  it('hız sınırına uyar', async () => {
    server = await startServer(2 * MB)
    const dir = await tempDir()
    const t0 = Date.now()
    await new HttpDownloader(makeItem(`${server.url}/f.bin`, dir, { speedLimit: 2 * MB }), makeConfig()).run()
    const elapsed = Date.now() - t0
    // İlk saniyelik kova dolu başlar; 2 MB @ 2 MB/s için en az ~0.5 sn beklenir
    expect(elapsed).toBeGreaterThan(450)
    expect(await fileHash(dir, 'file.bin')).toBe(server.sha256)
  })
})

describe('HLS', () => {
  it('AES-128 şifreli parçaları çözüp birleştirir', async () => {
    server = await startServer(3 * MB)
    const dir = await tempDir()
    const item = makeItem(`${server.url}/master.m3u8`, dir, {
      kind: 'hls',
      fileName: 'video.mp4',
      hls: { playlistUrl: `${server.url}/media.m3u8`, segmentsTotal: 0, segmentsDone: 0 }
    })
    expect(await new HlsDownloader(item, makeConfig({ ffmpegPath: null })).run()).toBe('completed')
    expect(item.fileName).toBe('video.ts')
    expect(item.hls?.segmentsDone).toBe(6)
    expect(await fileHash(dir, 'video.ts')).toBe(server.sha256)
    expect(await readdir(dir)).toEqual(['video.ts'])
  })

  it('byterange ve göreli adresleri çözümler', () => {
    const pl = parsePlaylist('#EXTM3U\n#EXT-X-BYTERANGE:100@0\n#EXTINF:1,\na.ts\n#EXT-X-BYTERANGE:50\n#EXTINF:1,\na.ts\n#EXT-X-ENDLIST', 'https://x.com/v/list.m3u8')
    expect(pl.type).toBe('media')
    if (pl.type !== 'media') return
    expect(pl.segments[0].uri).toBe('https://x.com/v/a.ts')
    expect(pl.segments[1].byterange).toEqual({ length: 50, offset: 100 })
  })
})

describe('SpeedLimiter', () => {
  it('0 iken beklemez', async () => {
    const l = new SpeedLimiter(0)
    const t0 = Date.now()
    for (let i = 0; i < 100; i++) await l.consume(MB)
    expect(Date.now() - t0).toBeLessThan(50)
  })
})
