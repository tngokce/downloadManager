import { Agent, ProxyAgent, Socks5ProxyAgent, request, type Dispatcher } from 'undici'

export interface DispatcherOptions {
  connectTimeoutMs: number
  readTimeoutMs: number
  verifyTls: boolean
  proxy?: { protocol: 'http' | 'https' | 'socks5'; host: string; port: number; username?: string; password?: string } | null
}

/**
 * Bağlantı havuzu. Her origin için bağlantı sayısı sınırsız bırakılır; böylece bir dosyanın
 * bölümleri ayrı TCP bağlantılarından paralel iner (sunucu tarafı bağlantı başı hız sınırları aşılır).
 * HTTP/2 bilinçli olarak kapalı: tek bağlantıda çoklama, çok bağlantılı indirmenin faydasını yok eder.
 */
export function createDispatcher(o: DispatcherOptions): Dispatcher {
  const tls = { rejectUnauthorized: o.verifyTls }
  const common = {
    connectTimeout: o.connectTimeoutMs,
    headersTimeout: o.readTimeoutMs,
    bodyTimeout: o.readTimeoutMs,
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 120_000,
    allowH2: false
  }
  const p = o.proxy
  if (p && p.host) {
    if (p.protocol === 'socks5') {
      return new Socks5ProxyAgent(`socks5://${p.host}:${p.port}`, {
        ...common,
        username: p.username || undefined,
        password: p.password || undefined,
        requestTls: tls
      })
    }
    const token = p.username ? `Basic ${Buffer.from(`${p.username}:${p.password ?? ''}`).toString('base64')}` : undefined
    return new ProxyAgent({ ...common, uri: `${p.protocol}://${p.host}:${p.port}`, token, requestTls: tls })
  }
  return new Agent({ ...common, connect: tls })
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly retryAfterMs?: number
  ) {
    super(`HTTP ${statusCode}`)
    this.name = 'HttpError'
  }
}

export interface HttpResponse {
  statusCode: number
  headers: Record<string, string | string[] | undefined>
  body: Dispatcher.ResponseData['body']
  finalUrl: string
}

export interface HttpRequestOptions {
  method?: 'GET' | 'HEAD'
  headers?: Record<string, string>
  signal?: AbortSignal
  dispatcher: Dispatcher
  maxRedirects?: number
}

const REDIRECT_CODES = new Set([301, 302, 303, 307, 308])
const SENSITIVE_HEADERS = ['cookie', 'authorization']

/** "a.b.example.com" -> "example.com" (kaba bir site karşılaştırması için yeterli) */
function siteOf(host: string): string {
  const parts = host.split('.')
  return parts.length <= 2 ? host : parts.slice(-2).join('.')
}

/** Yanıt gövdesini okumadan kapatır (undici erken kapatmada hata olayı yayar; yutulur). */
export function discard(body: Dispatcher.ResponseData['body']): void {
  body.on('error', () => undefined)
  if (!body.destroyed) body.destroy()
}

export function header(headers: HttpResponse['headers'], name: string): string | undefined {
  const v = headers[name.toLowerCase()]
  return Array.isArray(v) ? v[0] : v
}

/** Yönlendirmeleri kendisi takip eden GET isteği; son adresi de döndürür. */
export async function httpRequest(url: string, opts: HttpRequestOptions): Promise<HttpResponse> {
  const maxRedirects = opts.maxRedirects ?? 10
  let current = url
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(opts.headers ?? {})) headers[k.toLowerCase()] = v
  // Sıkıştırılmış yanıt bayt aralıklarını bozar; her zaman ham veri istenir.
  headers['accept-encoding'] = 'identity'

  for (let i = 0; i <= maxRedirects; i++) {
    const res = await request(current, {
      method: opts.method ?? 'GET',
      headers,
      signal: opts.signal,
      dispatcher: opts.dispatcher
    })
    const location = header(res.headers, 'location')
    if (REDIRECT_CODES.has(res.statusCode) && location) {
      discard(res.body)
      const next = new URL(location, current)
      if (siteOf(next.hostname) !== siteOf(new URL(current).hostname)) {
        for (const h of SENSITIVE_HEADERS) delete headers[h]
      }
      current = next.href
      continue
    }
    return { statusCode: res.statusCode, headers: res.headers, body: res.body, finalUrl: current }
  }
  throw new Error('Çok fazla yönlendirme (redirect)')
}

export function parseRetryAfter(value: string | undefined): number | undefined {
  if (!value) return undefined
  const secs = Number(value)
  if (Number.isFinite(secs)) return Math.min(secs * 1000, 5 * 60_000)
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 5 * 60_000)) : undefined
}

/** Ağ kaynaklı (tekrar denenebilir) hata mı? */
export function isTransientError(err: unknown): boolean {
  if (err instanceof HttpError) {
    return err.statusCode === 408 || err.statusCode === 425 || err.statusCode === 429 || err.statusCode >= 500
  }
  return true
}
