import { afterEach, describe, expect, it } from 'vitest'
import { request } from 'undici'
import { Bridge, type BridgeDownload } from '../src/main/bridge'
import { Scheduler } from '../src/main/scheduler'
import type { Queue } from '../src/shared/types'

let bridge: Bridge | null = null
afterEach(async () => {
  await bridge?.stop()
  bridge = null
})

async function setup() {
  const received: BridgeDownload[] = []
  const batches: BridgeDownload[][] = []
  bridge = new Bridge({
    version: '1.0.0',
    config: () => ({ enabled: true }),
    onDownload: (d) => received.push(d),
    onBatch: (items) => batches.push(items)
  })
  const port = (await bridge.start(47000 + Math.floor(Math.random() * 1000)))!
  return { port, received, batches }
}

const EXT = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'

describe('Bridge', () => {
  it('eklentiden gelen indirmeyi kabul eder', async () => {
    const { port, received } = await setup()
    const res = await request(`http://127.0.0.1:${port}/add`, {
      method: 'POST',
      headers: { origin: EXT, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/a.zip', cookies: 'a=1', fileSize: 10 })
    })
    expect(res.statusCode).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe(EXT)
    expect(received[0]).toMatchObject({ url: 'https://example.com/a.zip', cookies: 'a=1', fileSize: 10 })
  })

  it('Origin göndermeyen Chrome eklentisini kabul eder (Sec-Fetch-Site: none)', async () => {
    const { port } = await setup()
    const res = await request(`http://127.0.0.1:${port}/ping`, { headers: { 'sec-fetch-site': 'none', 'sec-fetch-mode': 'cors' } })
    expect(res.statusCode).toBe(200)
    expect(await res.body.json()).toMatchObject({ app: 'download-manager' })
  })

  it('web sayfalarından ve kaynağı belirsiz istekleri reddeder', async () => {
    const { port, received } = await setup()
    const cases: Record<string, string>[] = [
      { origin: 'https://evil.com' },
      { origin: 'null' },
      { origin: 'https://evil.com', 'sec-fetch-site': 'none' },
      { 'sec-fetch-site': 'cross-site' },
      {}
    ]
    for (const extra of cases) {
      const res = await request(`http://127.0.0.1:${port}/add`, {
        method: 'POST',
        headers: { ...extra, 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com/a.zip' })
      })
      expect(res.statusCode).toBe(403)
      await res.body.dump()
    }
    expect(received).toHaveLength(0)
  })

  it('DNS rebinding için yabancı Host başlığını reddeder', async () => {
    const { port } = await setup()
    const res = await request(`http://127.0.0.1:${port}/ping`, { headers: { origin: EXT, host: `evil.com:${port}` } })
    expect(res.statusCode).toBe(421)
    await res.body.dump()
  })

  it('geçersiz adresleri ve javascript: şemasını kabul etmez', async () => {
    const { port, received } = await setup()
    const res = await request(`http://127.0.0.1:${port}/add`, {
      method: 'POST',
      headers: { origin: EXT, 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'javascript:alert(1)' })
    })
    expect(res.statusCode).toBe(400)
    await res.body.dump()
    expect(received).toHaveLength(0)
  })

  it('toplu bağlantıları iletir ve ping yanıtında yapılandırmayı döner', async () => {
    const { port, batches } = await setup()
    const ping = await request(`http://127.0.0.1:${port}/ping`, { headers: { origin: EXT } })
    expect(await ping.body.json()).toMatchObject({ app: 'download-manager', config: { enabled: true } })
    const res = await request(`http://127.0.0.1:${port}/batch`, {
      method: 'POST',
      headers: { origin: EXT, 'content-type': 'application/json' },
      body: JSON.stringify({ items: [{ url: 'https://a.com/1.zip' }, { url: 'bad' }, { url: 'https://a.com/2.zip' }] })
    })
    expect(res.statusCode).toBe(200)
    await res.body.dump()
    expect(batches[0].map((b) => b.url)).toEqual(['https://a.com/1.zip', 'https://a.com/2.zip'])
  })
})

describe('Scheduler', () => {
  const queue = (over: Partial<Queue['schedule']> = {}): Queue => ({
    id: 'q',
    name: 'q',
    running: false,
    maxConcurrent: 0,
    onComplete: 'none',
    schedule: { enabled: true, startTime: '02:00', stopTime: '08:00', days: [], ...over }
  })

  it('başlama ve durma saatinde bir kez tetikler', () => {
    const events: string[] = []
    const q = queue()
    const s = new Scheduler({ queues: () => [q], start: () => events.push('start'), stop: () => events.push('stop') })
    s.check(new Date(2026, 0, 5, 1, 59))
    s.check(new Date(2026, 0, 5, 2, 0))
    s.check(new Date(2026, 0, 5, 2, 0, 30))
    s.check(new Date(2026, 0, 5, 8, 0))
    expect(events).toEqual(['start', 'stop'])
  })

  it('uyku nedeniyle kaçırılan başlama saatini uyanınca uygular', () => {
    const events: string[] = []
    const q = queue()
    const s = new Scheduler({ queues: () => [q], start: () => events.push('start'), stop: () => events.push('stop') })
    s.check(new Date(2026, 0, 5, 1, 30))
    s.check(new Date(2026, 0, 5, 3, 15))
    expect(events).toEqual(['start'])
  })

  it('seçili olmayan günlerde çalışmaz', () => {
    const events: string[] = []
    const q = queue({ days: [1] }) // yalnızca pazartesi
    const s = new Scheduler({ queues: () => [q], start: () => events.push('start'), stop: () => undefined })
    s.check(new Date(2026, 0, 6, 1, 59)) // salı
    s.check(new Date(2026, 0, 6, 2, 0))
    expect(events).toEqual([])
  })
})
