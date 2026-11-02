import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { DownloadItem } from '../src/shared/types'
import { createDispatcher, SpeedLimiter, type EngineConfig } from '../src/main/engine'

export interface ServerOptions {
  noRange?: boolean
  /** Her yanıtı bu olasılıkla rastgele bir noktada keser */
  dropRate?: number
  /** Eşzamanlı bağlantı bu sayıyı aşarsa 429 döner */
  maxConcurrent?: number
  /** Content-Length göndermez (chunked) */
  chunked?: boolean
  /** Her bağlantı için bayt/sn sınırı */
  perConnectionRate?: number
}

export interface TestServer {
  url: string
  data: Buffer
  sha256: string
  stats: { requests: number; maxConcurrent: number; rejected: number }
  close(): Promise<void>
}

export function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

const AES_KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'hex')

export async function startServer(size: number, opts: ServerOptions = {}): Promise<TestServer> {
  const data = randomBytes(size)
  const stats = { requests: 0, maxConcurrent: 0, rejected: 0 }
  let concurrent = 0

  // HLS: 6 parçalık, AES-128 ile şifreli bir oynatma listesi
  const hlsParts = Array.from({ length: 6 }, (_, i) => data.subarray(Math.floor((i * size) / 6), Math.floor(((i + 1) * size) / 6)))
  const encrypt = (buf: Buffer, seq: number) => {
    const iv = Buffer.from(seq.toString(16).padStart(32, '0'), 'hex')
    const c = createCipheriv('aes-128-cbc', AES_KEY, iv)
    return Buffer.concat([c.update(buf), c.final()])
  }

  const handler = (req: IncomingMessage, res: ServerResponse) => {
    stats.requests++
    const path = req.url ?? '/'
    if (path === '/redirect') {
      res.writeHead(302, { location: '/files/real.bin' })
      return res.end()
    }
    if (path === '/missing') {
      res.writeHead(404)
      return res.end()
    }
    if (path === '/master.m3u8') {
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' })
      return res.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720\nmedia.m3u8\n')
    }
    if (path === '/media.m3u8' || path === '/low.m3u8') {
      const lines = ['#EXTM3U', '#EXT-X-TARGETDURATION:4', '#EXT-X-MEDIA-SEQUENCE:0', '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"']
      hlsParts.forEach((_, i) => lines.push('#EXTINF:4.0,', `seg${i}.ts`))
      lines.push('#EXT-X-ENDLIST')
      res.writeHead(200, { 'content-type': 'application/vnd.apple.mpegurl' })
      return res.end(lines.join('\n'))
    }
    if (path === '/key.bin') return res.end(AES_KEY)
    const seg = path.match(/^\/seg(\d+)\.ts$/)
    if (seg) return res.end(encrypt(hlsParts[Number(seg[1])], Number(seg[1])))

    if (opts.maxConcurrent && concurrent >= opts.maxConcurrent) {
      stats.rejected++
      res.writeHead(429, { 'retry-after': '0' })
      return res.end()
    }
    concurrent++
    stats.maxConcurrent = Math.max(stats.maxConcurrent, concurrent)
    res.on('close', () => concurrent--)

    let start = 0
    let end = size - 1
    const range = req.headers.range?.match(/bytes=(\d+)-(\d*)/)
    const headers: Record<string, string | number> = {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename*=UTF-8''T%C3%BCrk%C3%A7e%20dosya.bin`,
      etag: '"abc"'
    }
    if (!opts.noRange) headers['accept-ranges'] = 'bytes'
    if (range && !opts.noRange) {
      start = Number(range[1])
      end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1
      if (start >= size) {
        res.writeHead(416, { 'content-range': `bytes */${size}` })
        return res.end()
      }
      headers['content-range'] = `bytes ${start}-${end}/${size}`
      if (!opts.chunked) headers['content-length'] = end - start + 1
      res.writeHead(206, headers)
    } else {
      if (!opts.chunked) headers['content-length'] = size
      res.writeHead(200, headers)
    }

    const body = data.subarray(start, end + 1)
    const dropAt = opts.dropRate && Math.random() < opts.dropRate ? Math.floor(Math.random() * body.length) : -1
    const CHUNK = 64 * 1024
    let off = 0
    const pump = () => {
      while (off < body.length) {
        if (dropAt >= 0 && off >= dropAt) {
          res.destroy()
          return
        }
        const piece = body.subarray(off, off + CHUNK)
        off += piece.length
        if (opts.perConnectionRate) {
          res.write(piece)
          setTimeout(pump, (piece.length / opts.perConnectionRate) * 1000)
          return
        }
        if (!res.write(piece)) {
          res.once('drain', pump)
          return
        }
      }
      res.end()
    }
    pump()
  }

  const server: Server = createServer(handler)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    data,
    sha256: sha256(data),
    stats,
    close: () =>
      new Promise((r) => {
        server.closeAllConnections()
        server.close(() => r())
      })
  }
}

export async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'dm-test-'))
}

export function makeConfig(overrides: Partial<EngineConfig> = {}): EngineConfig {
  return {
    dispatcher: createDispatcher({ connectTimeoutMs: 5000, readTimeoutMs: 5000, verifyTls: true }),
    globalLimiter: new SpeedLimiter(0),
    maxRetries: 0,
    retryDelayMs: 50,
    minSegmentSize: 64 * 1024,
    userAgent: 'dm-test',
    overwrite: false,
    ...overrides
  }
}

export function makeItem(url: string, directory: string, overrides: Partial<DownloadItem> = {}): DownloadItem {
  return {
    id: Math.random().toString(36).slice(2),
    kind: 'http',
    url,
    fileName: 'file.bin',
    directory,
    category: 'general',
    queueId: 'main',
    status: 'queued',
    totalBytes: null,
    downloadedBytes: 0,
    resumable: false,
    segments: [],
    maxConnections: 8,
    speedLimit: 0,
    headers: {},
    retryCount: 0,
    createdAt: Date.now(),
    elapsedMs: 0,
    order: 0,
    ...overrides
  }
}
