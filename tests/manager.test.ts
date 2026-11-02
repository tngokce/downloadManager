import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { DownloadManager } from '../src/main/manager'
import { JsonStore } from '../src/main/store'
import { DEFAULT_QUEUES, createDefaultSettings } from '../src/shared/defaults'
import type { DownloadItem, Settings } from '../src/shared/types'
import { sha256, startServer, tempDir, type TestServer } from './helpers'

const MB = 1024 * 1024
let server: TestServer | null = null
let managers: DownloadManager[] = []

afterEach(async () => {
  for (const m of managers) await m.shutdown()
  managers = []
  await server?.close()
  server = null
})

async function setup(overrides: Partial<Settings> = {}, storeDir?: string) {
  const dir = await tempDir()
  const settings = { ...createDefaultSettings(dir), proxy: { ...createDefaultSettings(dir).proxy, mode: 'none' as const }, retryDelaySec: 0.05, ...overrides }
  const store = new JsonStore<DownloadItem[]>(storeDir ?? (await tempDir()), 'downloads.json', 50)
  const m = new DownloadManager(settings, structuredClone(DEFAULT_QUEUES), store)
  managers.push(m)
  return { m, dir, store }
}

function waitFor(m: DownloadManager, id: string, status: DownloadItem['status'], timeout = 20000) {
  return new Promise<DownloadItem>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`zaman aşımı: ${m.items.get(id)?.status}`)), timeout)
    const check = () => {
      const item = m.items.get(id)
      if (item?.status === status) {
        clearTimeout(t)
        m.off('patched', check)
        resolve(item)
      }
    }
    m.on('patched', check)
    check()
  })
}

describe('DownloadManager', () => {
  it('ekler, indirir, kategoriyi belirler ve tamamlandı olayı yayar', async () => {
    server = await startServer(4 * MB)
    const { m, dir } = await setup()
    let completed = 0
    m.on('completed', () => completed++)
    const item = m.add({ url: `${server.url}/a.zip`, fileName: 'arsiv.zip' })
    expect(item.category).toBe('compressed')
    await waitFor(m, item.id, 'completed')
    expect(completed).toBe(1)
    expect(sha256(await readFile(join(dir, 'arsiv.zip')))).toBe(server.sha256)
  })

  it('eşzamanlı indirme sınırına uyar', async () => {
    server = await startServer(2 * MB, { perConnectionRate: 512 * 1024 })
    const { m } = await setup({ maxConcurrentDownloads: 2, connectionsPerDownload: 2 })
    const items = [1, 2, 3, 4].map((i) => m.add({ url: `${server!.url}/f${i}.bin` }))
    await new Promise((r) => setTimeout(r, 300))
    expect(m.activeCount).toBe(2)
    expect(items.filter((i) => i.status === 'queued')).toHaveLength(2)
    await Promise.all(items.map((i) => waitFor(m, i.id, 'completed')))
  })

  it('duraklatır ve sürdürür', async () => {
    server = await startServer(8 * MB, { perConnectionRate: 2 * MB })
    const { m, dir } = await setup({ connectionsPerDownload: 2 })
    const item = m.add({ url: `${server.url}/f.bin`, fileName: 'f.bin' })
    await new Promise((r) => setTimeout(r, 500))
    await m.pause([item.id])
    expect(item.status).toBe('paused')
    const partial = item.downloadedBytes
    expect(partial).toBeGreaterThan(0)
    m.start([item.id])
    await waitFor(m, item.id, 'completed')
    expect(sha256(await readFile(join(dir, 'f.bin')))).toBe(server.sha256)
  })

  it('checksum uyuşmazlığını yakalar', async () => {
    server = await startServer(MB)
    const { m } = await setup()
    const ok = m.add({ url: `${server.url}/ok.bin`, checksum: { algorithm: 'sha256', expected: server.sha256 } })
    const bad = m.add({ url: `${server.url}/bad.bin`, checksum: { algorithm: 'sha256', expected: '0'.repeat(64) } })
    await waitFor(m, ok.id, 'completed')
    await waitFor(m, bad.id, 'failed')
    expect(ok.checksum?.ok).toBe(true)
    expect(bad.error).toBe('checksum')
  })

  it('kapanışta yarım kalan indirmeyi açılışta kaldığı yerden sürdürür', async () => {
    server = await startServer(8 * MB, { perConnectionRate: 2 * MB })
    const storeDir = await tempDir()
    const first = await setup({ connectionsPerDownload: 2 }, storeDir)
    const item = first.m.add({ url: `${server.url}/f.bin`, fileName: 'f.bin' })
    await new Promise((r) => setTimeout(r, 500))
    const t0 = Date.now()
    await first.m.shutdown()
    managers = managers.filter((x) => x !== first.m)
    // Kapanış indirmenin bitmesini beklememeli; görev yeniden başlatılmamalı
    expect(Date.now() - t0).toBeLessThan(1000)
    expect(item.status).toBe('queued')
    expect(item.downloadedBytes).toBeLessThan(8 * MB)

    const second = await setup({ defaultDirectory: first.dir }, storeDir)
    const restored = second.m.items.get(item.id)!
    expect(restored.downloadedBytes).toBeGreaterThan(0)
    await waitFor(second.m, item.id, 'completed')
    expect(sha256(await readFile(join(first.dir, 'f.bin')))).toBe(server.sha256)
  })

  it('durdurulmuş kuyruktaki öğeyi başlatmaz, kuyruk başlayınca indirir', async () => {
    server = await startServer(MB)
    const { m } = await setup()
    let doneQueue = ''
    m.on('queueDone', (q) => (doneQueue = q.id))
    const item = m.add({ url: `${server.url}/f.bin`, queueId: 'scheduled' })
    await new Promise((r) => setTimeout(r, 200))
    expect(item.status).toBe('queued')
    m.startQueue('scheduled')
    await waitFor(m, item.id, 'completed')
    expect(doneQueue).toBe('scheduled')
  })
})
