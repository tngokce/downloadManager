import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

/** Eklentiden gelen indirme bilgisi */
export interface BridgeDownload {
  url: string
  finalUrl?: string
  fileName?: string
  referrer?: string
  cookies?: string
  userAgent?: string
  mime?: string
  fileSize?: number
  kind?: 'http' | 'hls'
  title?: string
}

export interface BridgeHandlers {
  version: string
  config(): unknown
  onDownload(d: BridgeDownload): void
  onBatch(items: BridgeDownload[], referrer?: string): void
}

const EXTENSION_ORIGIN = /^(chrome-extension|moz-extension|safari-web-extension|extension):\/\/[a-z0-9-]+$/i
const MAX_BODY = 4 * 1024 * 1024
/** Eklenti bu port aralığını tarar; varsayılan port doluysa sıradaki denenir. */
export const PORT_RANGE = 5

/**
 * Tarayıcı eklentisi ile uygulama arasındaki yerel köprü.
 *
 * Güvenlik:
 * - Yalnızca 127.0.0.1 dinlenir (ağdaki diğer cihazlar erişemez).
 * - İstek bir tarayıcı eklentisinden gelmelidir: Origin bir eklenti adresi olmalı ya da
 *   Origin hiç olmamalı ve Sec-Fetch-Site "none" olmalıdır. Chrome, site izni olan eklentinin
 *   isteklerine Origin eklemez, Sec-Fetch-Site: none gönderir. Web sayfaları bu başlıkları
 *   taklit edemez (her zaman Origin ya da Sec-Fetch-Site: cross-site gönderirler),
 *   böylece rastgele bir site kullanıcı adına indirme başlatamaz.
 * - Host başlığı kontrol edilir (DNS rebinding saldırılarına karşı).
 */
export class Bridge {
  private server: Server | null = null
  port: number | null = null

  constructor(private readonly handlers: BridgeHandlers) {}

  async start(preferredPort: number): Promise<number | null> {
    await this.stop()
    for (let port = preferredPort; port < preferredPort + PORT_RANGE; port++) {
      const ok = await this.listen(port)
      if (ok) {
        this.port = port
        return port
      }
    }
    return null
  }

  private listen(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = createServer((req, res) => void this.handle(req, res))
      server.once('error', () => resolve(false))
      server.listen(port, '127.0.0.1', () => {
        this.server = server
        resolve(true)
      })
    })
  }

  async stop(): Promise<void> {
    const s = this.server
    this.server = null
    this.port = null
    if (s) await new Promise<void>((r) => s.close(() => r()))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const origin = req.headers.origin ?? ''
    const host = req.headers.host ?? ''
    const send = (status: number, body?: unknown) => {
      const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': 'no-store' }
      if (EXTENSION_ORIGIN.test(origin)) {
        headers['access-control-allow-origin'] = origin
        headers['access-control-allow-methods'] = 'GET, POST, OPTIONS'
        headers['access-control-allow-headers'] = 'content-type'
        headers.vary = 'Origin'
      }
      res.writeHead(status, headers)
      res.end(body === undefined ? '' : JSON.stringify(body))
    }

    if (!/^(127\.0\.0\.1|localhost):\d+$/.test(host)) return send(421, { error: 'bad host' })
    const fromExtension = origin ? EXTENSION_ORIGIN.test(origin) : req.headers['sec-fetch-site'] === 'none'
    if (!fromExtension) return send(403, { error: 'forbidden' })
    if (req.method === 'OPTIONS') return send(204)

    const path = (req.url ?? '/').split('?')[0]
    try {
      if (req.method === 'GET' && path === '/ping') {
        return send(200, { app: 'download-manager', version: this.handlers.version, config: this.handlers.config() })
      }
      if (req.method !== 'POST') return send(405, { error: 'method' })
      const body = await readJson(req)
      if (path === '/add') {
        const d = validate(body)
        if (!d) return send(400, { error: 'url' })
        this.handlers.onDownload(d)
        return send(200, { ok: true })
      }
      if (path === '/batch') {
        const b = body as { items?: unknown[]; referrer?: string }
        const items = (b.items ?? []).map(validate).filter((x): x is BridgeDownload => !!x)
        if (!items.length) return send(400, { error: 'items' })
        this.handlers.onBatch(items, typeof b.referrer === 'string' ? b.referrer : undefined)
        return send(200, { ok: true, count: items.length })
      }
      return send(404, { error: 'not found' })
    } catch (err) {
      return send(400, { error: (err as Error).message })
    }
  }
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('invalid json'))
      }
    })
    req.on('error', reject)
  })
}

function str(v: unknown, max = 8192): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined
}

function validate(raw: unknown): BridgeDownload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const url = str(o.url, 16384)
  if (!url || !/^(https?|ftps?):\/\//i.test(url)) return null
  const finalUrl = str(o.finalUrl, 16384)
  return {
    url,
    finalUrl: finalUrl && /^https?:\/\//i.test(finalUrl) ? finalUrl : undefined,
    fileName: str(o.fileName, 512),
    referrer: str(o.referrer, 4096),
    cookies: str(o.cookies, 65536),
    userAgent: str(o.userAgent, 1024),
    mime: str(o.mime, 256),
    fileSize: typeof o.fileSize === 'number' && o.fileSize > 0 ? o.fileSize : undefined,
    kind: o.kind === 'hls' ? 'hls' : 'http',
    title: str(o.title, 512)
  }
}
