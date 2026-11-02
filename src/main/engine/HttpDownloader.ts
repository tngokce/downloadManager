import { mkdir, open, type FileHandle } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import type { DownloadItem, Segment } from '@shared/types'
import { HttpError, header, httpRequest, discard, isTransientError, parseRetryAfter } from './http'
import { probe } from './probe'
import { PART_SUFFIX, finalizePartFile } from './filename'
import { UNKNOWN_END, createSegments, downloadedOf, isDone, pickWork } from './segments'
import { SpeedLimiter } from './throttle'
import { errorCode, fatal } from './errors'
import {
  FatalDownloadError,
  backoffMs,
  isFatalFsError,
  requestHeaders,
  type DownloadTask,
  type EngineConfig,
  type TaskResult
} from './task'

/** Diske tek seferde yazılacak tampon boyutu: az sistem çağrısı, düşük bellek */
const FLUSH_BYTES = 1024 * 1024

interface Worker {
  seg: Segment
  /** Ağdan alınmış verinin ulaştığı konum (diske yazılmayı bekleyenler dahil) */
  cursor: number
}

/**
 * Çok bağlantılı HTTP(S) indirici.
 *
 * - Dosya, sunucu Range destekliyorsa N bölüme ayrılır ve her bölüm ayrı bağlantıyla iner.
 * - Bir bağlantı işini bitirince en çok işi kalan bölümü ikiye bölüp yarısını devralır.
 * - Veri tek bir ".dmpart" dosyasına konumlu (pwrite) yazılır; birleştirme adımı yoktur.
 * - Bölüm konumları yalnızca veri diske yazıldıktan sonra ilerletilir; uygulama çökse bile
 *   kaydedilen ilerleme güvenlidir ve indirme kaldığı yerden sürer.
 * - Kopan bağlantılar üstel geri çekilmeyle (backoff) yeniden denenir; sunucu 429/503 ile
 *   bağlantı sayısını kısıtlarsa bağlantı sayısı otomatik düşürülür.
 */
export class HttpDownloader implements DownloadTask {
  private stopped = false
  private fatalError: Error | null = null
  private readonly abort = new AbortController()
  private readonly workers = new Set<Worker>()
  private readonly limiter = new SpeedLimiter()
  private fh: FileHandle | null = null
  private allowedConnections: number
  private received = 0

  constructor(
    private readonly item: DownloadItem,
    private readonly cfg: EngineConfig
  ) {
    this.limiter.setRate(item.speedLimit)
    this.allowedConnections = Math.max(1, item.maxConnections)
  }

  get activeConnections(): number {
    return this.workers.size
  }

  get receivedBytes(): number {
    return this.received
  }

  setSpeedLimit(bytesPerSecond: number): void {
    this.limiter.setRate(bytesPerSecond)
  }

  pause(): void {
    this.stopped = true
    this.abort.abort()
  }

  private get partPath(): string {
    return join(this.item.directory, this.item.fileName + PART_SUFFIX)
  }

  private log(msg: string): void {
    this.cfg.log?.(this.item.id, msg)
  }

  async run(): Promise<TaskResult> {
    const item = this.item
    item.status = 'connecting'
    item.error = undefined
    await mkdir(item.directory, { recursive: true })

    const info = await this.retrying(() =>
      probe(item.url, { headers: requestHeaders(item, this.cfg.userAgent), dispatcher: this.cfg.dispatcher, signal: this.abort.signal })
    )
    if (!info) return 'paused'

    const hasProgress = item.segments.length > 0 && downloadedOf(item.segments) > 0
    let reset = !hasProgress || !existsSync(this.partPath) || !info.resumable
    if (!reset && item.totalBytes !== info.totalBytes) {
      this.log(`Sunucudaki dosya boyutu değişmiş (${item.totalBytes} -> ${info.totalBytes}); baştan indiriliyor`)
      reset = true
    }
    if (!reset && item.etag && info.etag && item.etag !== info.etag) {
      this.log('ETag değişmiş; boyut aynı olduğu için devam ediliyor')
    }

    item.finalUrl = info.finalUrl
    item.mime ??= info.mime
    item.etag = info.etag
    item.lastModified = info.lastModified
    item.resumable = info.resumable
    item.totalBytes = info.totalBytes

    try {
      if (reset) {
        const total = item.totalBytes
        item.segments =
          item.resumable && total != null
            ? createSegments(total, item.maxConnections, this.cfg.minSegmentSize)
            : [{ start: 0, end: total != null ? total - 1 : UNKNOWN_END, pos: 0 }]
        this.fh = await open(this.partPath, 'w')
        // Yer ayırma: parçalanmayı azaltır, disk dolu hatasını erken yakalar.
        if (total) await this.fh.truncate(total)
      } else {
        this.fh = await open(this.partPath, 'r+')
      }
    } catch (err) {
      throw fatal(errorCode(err))
    }

    item.downloadedBytes = downloadedOf(item.segments)
    item.status = 'downloading'
    item.startedAt ??= Date.now()

    try {
      await this.runWorkers()
    } finally {
      await this.fh.close().catch(() => undefined)
      this.fh = null
    }

    if (this.fatalError) throw this.fatalError
    if (!item.segments.every(isDone)) {
      if (this.stopped) return 'paused'
      throw new Error('İndirme tamamlanamadı')
    }
    if (item.totalBytes == null) item.totalBytes = item.downloadedBytes
    item.fileName = await finalizePartFile(item, this.cfg.overwrite)
    return 'completed'
  }

  /** Geçici hatalarda yeniden dener; duraklatılırsa null döner. */
  private async retrying<T>(fn: () => Promise<T>): Promise<T | null> {
    for (let attempt = 0; ; attempt++) {
      if (this.stopped) return null
      try {
        return await fn()
      } catch (err) {
        if (this.stopped) return null
        if (!isTransientError(err) || (this.cfg.maxRetries > 0 && attempt >= this.cfg.maxRetries)) throw err
        this.item.retryCount++
        const wait = (err instanceof HttpError && err.retryAfterMs) || backoffMs(this.cfg.retryDelayMs, attempt)
        this.log(`Bağlantı hatası (${errorCode(err)}), ${Math.round(wait / 1000)} sn sonra tekrar denenecek`)
        try {
          await sleep(wait, undefined, { signal: this.abort.signal })
        } catch {
          return null
        }
      }
    }
  }

  private cursorOf(seg: Segment): number {
    for (const w of this.workers) if (w.seg === seg) return w.cursor
    return seg.pos
  }

  private nextWork(): Segment | null {
    const segs = this.item.segments
    if (!this.item.resumable) return this.workers.size === 0 ? (segs.find((s) => !isDone(s)) ?? null) : null
    const busy = new Set([...this.workers].map((w) => w.seg))
    return pickWork(segs, busy, this.cfg.minSegmentSize, (s) => this.cursorOf(s))
  }

  private async runWorkers(): Promise<void> {
    const running = new Set<Promise<void>>()
    const spawn = () => {
      while (!this.stopped && !this.fatalError && this.workers.size < this.allowedConnections) {
        const seg = this.nextWork()
        if (!seg) break
        const w: Worker = { seg, cursor: seg.pos }
        this.workers.add(w)
        const p: Promise<void> = this.runWorker(w)
          .catch((err: unknown) => {
            if (!this.fatalError && !this.stopped) {
              this.fatalError = err instanceof FatalDownloadError ? err : fatal(errorCode(err))
              this.abort.abort()
            }
          })
          .finally(() => {
            this.workers.delete(w)
            running.delete(p)
          })
        running.add(p)
      }
    }
    spawn()
    while (running.size) {
      await Promise.race(running)
      spawn()
    }
  }

  private async runWorker(w: Worker): Promise<void> {
    const seg = w.seg
    let attempt = 0
    while (!isDone(seg)) {
      if (this.stopped || this.fatalError) return
      const before = seg.pos
      try {
        await this.fetchInto(w)
        attempt = 0
      } catch (err) {
        if (this.stopped || this.fatalError) return
        if (err instanceof FatalDownloadError) throw err
        if (isFatalFsError(err)) throw fatal(errorCode(err))
        if (seg.pos > before) attempt = 0
        attempt++

        if (err instanceof HttpError) {
          const s = err.statusCode
          if (s === 401 || s === 407) throw err
          // Sunucu fazla bağlantıyı reddediyor: bu bağlantıyı bırak, bölüm diğerlerine kalsın.
          if ((s === 429 || s === 503) && this.workers.size > 1) {
            this.allowedConnections = Math.max(1, this.workers.size - 1)
            this.log(`Sunucu bağlantı sınırı (HTTP ${s}); bağlantı sayısı ${this.allowedConnections} olarak ayarlandı`)
            return
          }
          if (!isTransientError(err) && attempt >= 3) throw err
        }
        if (this.cfg.maxRetries > 0 && attempt > this.cfg.maxRetries) throw err

        this.item.retryCount++
        const wait = (err instanceof HttpError && err.retryAfterMs) || backoffMs(this.cfg.retryDelayMs, attempt - 1)
        try {
          await sleep(wait, undefined, { signal: this.abort.signal })
        } catch {
          return
        }
      }
    }
  }

  /** Bir bölümü tek bir HTTP isteğiyle indirebildiği kadar indirir. */
  private async fetchInto(w: Worker): Promise<void> {
    const item = this.item
    const seg = w.seg
    const fh = this.fh!
    const signal = this.abort.signal
    const headers = requestHeaders(item, this.cfg.userAgent)

    if (item.resumable) {
      headers.range = `bytes=${seg.pos}-${seg.end === UNKNOWN_END ? '' : seg.end}`
    } else if (seg.pos > 0) {
      // Sunucu devam ettirmeyi desteklemiyor: kopan bağlantıdan sonra baştan başlamak zorunlu.
      this.log('Sunucu devam ettirmeyi desteklemiyor; baştan indiriliyor')
      seg.pos = 0
      item.downloadedBytes = 0
      await fh.truncate(0)
    }

    const res = await httpRequest(item.url, { headers, signal, dispatcher: this.cfg.dispatcher })
    if (res.statusCode >= 400) {
      discard(res.body)
      throw new HttpError(res.statusCode, parseRetryAfter(header(res.headers, 'retry-after')))
    }
    if (item.resumable) {
      if (res.statusCode !== 206) {
        discard(res.body)
        throw new Error('rangeRejected')
      }
      const cr = header(res.headers, 'content-range')?.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/i)
      if (!cr || Number(cr[1]) !== seg.pos) {
        discard(res.body)
        throw new Error('Content-Range uyuşmazlığı')
      }
      if (cr[3] !== '*' && item.totalBytes != null && Number(cr[3]) !== item.totalBytes) {
        discard(res.body)
        throw fatal('changed')
      }
    }

    w.cursor = seg.pos
    const pending: Buffer[] = []
    let pendingLen = 0
    const flush = async () => {
      if (!pendingLen) return
      const buf = pending.length === 1 ? pending[0] : Buffer.concat(pending, pendingLen)
      const len = pendingLen
      pending.length = 0
      pendingLen = 0
      await fh.write(buf, 0, len, seg.pos)
      seg.pos += len
      item.downloadedBytes += len
    }

    let streamEnded = false
    let cutShort = false
    try {
      for await (const chunk of res.body as AsyncIterable<Buffer>) {
        // seg.end başka bir bağlantının bölmesiyle küçülmüş olabilir; fazlasını atla.
        const limit = seg.end - w.cursor + 1
        if (limit <= 0) {
          cutShort = true
          break
        }
        const piece = chunk.length > limit ? chunk.subarray(0, limit) : chunk
        w.cursor += piece.length
        this.received += piece.length
        await this.limiter.consume(piece.length, signal)
        await this.cfg.globalLimiter.consume(piece.length, signal)
        pending.push(piece)
        pendingLen += piece.length
        if (pendingLen >= FLUSH_BYTES) await flush()
        if (w.cursor > seg.end) {
          cutShort = true
          break
        }
      }
      streamEnded = !cutShort
    } finally {
      discard(res.body)
      await flush()
    }

    if (seg.end === UNKNOWN_END && streamEnded) {
      // Boyutu bilinmeyen akış sonuna ulaştı: dosyanın sonu budur.
      seg.end = seg.pos - 1
      item.totalBytes = seg.pos
      return
    }
    if (!isDone(seg)) throw new Error('Bağlantı erken kapandı')
  }
}
