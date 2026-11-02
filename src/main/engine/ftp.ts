import { Client } from 'basic-ftp'
import { existsSync } from 'node:fs'
import { mkdir, open, type FileHandle } from 'node:fs/promises'
import { join } from 'node:path'
import { Writable } from 'node:stream'
import { setTimeout as sleep } from 'node:timers/promises'
import type { DownloadItem, ProbeResult } from '@shared/types'
import { PART_SUFFIX, finalizePartFile, sanitizeFileName } from './filename'
import { UNKNOWN_END, downloadedOf, isDone } from './segments'
import { SpeedLimiter } from './throttle'
import { errorCode, fatal } from './errors'
import { FatalDownloadError, backoffMs, isFatalFsError, type DownloadTask, type EngineConfig, type TaskResult } from './task'

interface FtpTarget {
  host: string
  port: number
  user: string
  password: string
  path: string
  secure: boolean | 'implicit'
}

export function parseFtpUrl(url: string): FtpTarget {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port) || 21,
    user: u.username ? decodeURIComponent(u.username) : 'anonymous',
    password: u.password ? decodeURIComponent(u.password) : 'anonymous@',
    path: decodeURIComponent(u.pathname),
    secure: u.protocol === 'ftps:' ? 'implicit' : false
  }
}

async function connect(t: FtpTarget, timeoutMs = 20_000): Promise<Client> {
  const c = new Client(timeoutMs)
  await c.access({ host: t.host, port: t.port, user: t.user, password: t.password, secure: t.secure })
  return c
}

export async function probeFtp(url: string): Promise<ProbeResult> {
  const t = parseFtpUrl(url)
  const c = await connect(t)
  try {
    const size = await c.size(t.path).catch(() => null)
    const mod = await c.lastMod(t.path).catch(() => undefined)
    return {
      url,
      finalUrl: url,
      fileName: sanitizeFileName(t.path.split('/').pop() || 'download'),
      totalBytes: size,
      resumable: true,
      lastModified: mod?.toUTCString(),
      kind: 'ftp'
    }
  } finally {
    c.close()
  }
}

/** FTP/FTPS indirici: tek bağlantı, REST komutuyla kaldığı yerden devam. */
export class FtpDownloader implements DownloadTask {
  private stopped = false
  private client: Client | null = null
  private readonly limiter = new SpeedLimiter()
  private readonly abort = new AbortController()
  private received = 0

  constructor(
    private readonly item: DownloadItem,
    private readonly cfg: EngineConfig
  ) {
    this.limiter.setRate(item.speedLimit)
  }

  get activeConnections(): number {
    return this.client ? 1 : 0
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
    this.client?.close()
  }

  async run(): Promise<TaskResult> {
    const item = this.item
    const target = parseFtpUrl(item.url)
    item.status = 'connecting'
    item.error = undefined
    await mkdir(item.directory, { recursive: true })
    const part = join(item.directory, item.fileName + PART_SUFFIX)

    if (!item.segments.length || !existsSync(part)) {
      item.segments = [{ start: 0, end: item.totalBytes != null ? item.totalBytes - 1 : UNKNOWN_END, pos: 0 }]
      await (await open(part, 'w')).close()
    }
    const seg = item.segments[0]

    for (let attempt = 0; !isDone(seg); ) {
      if (this.stopped) return 'paused'
      let fh: FileHandle | null = null
      const before = seg.pos
      try {
        this.client = await connect(target)
        item.status = 'downloading'
        item.startedAt ??= Date.now()
        fh = await open(part, 'r+')
        const handle = fh
        const sink = new Writable({
          write: (chunk: Buffer, _enc, cb) => {
            this.received += chunk.length
            Promise.all([this.limiter.consume(chunk.length, this.abort.signal), this.cfg.globalLimiter.consume(chunk.length, this.abort.signal)])
              .then(() => handle.write(chunk, 0, chunk.length, seg.pos))
              .then(() => {
                seg.pos += chunk.length
                item.downloadedBytes = downloadedOf(item.segments)
                cb()
              }, cb)
          }
        })
        await this.client.downloadTo(sink, target.path, seg.pos)
        if (seg.end === UNKNOWN_END) {
          seg.end = seg.pos - 1
          item.totalBytes = seg.pos
        }
        if (!isDone(seg)) throw new Error('Bağlantı erken kapandı')
      } catch (err) {
        if (this.stopped) return 'paused'
        if (isFatalFsError(err)) throw fatal(errorCode(err))
        if (err instanceof FatalDownloadError) throw err
        const code = (err as { code?: number }).code
        if (code === 530) throw fatal('auth')
        if (code === 550) throw fatal('expired:550')
        attempt = seg.pos > before ? 1 : attempt + 1
        if (this.cfg.maxRetries > 0 && attempt > this.cfg.maxRetries) throw err
        item.retryCount++
        try {
          await sleep(backoffMs(this.cfg.retryDelayMs, attempt - 1), undefined, { signal: this.abort.signal })
        } catch {
          return 'paused'
        }
      } finally {
        await fh?.close().catch(() => undefined)
        this.client?.close()
        this.client = null
      }
    }
    item.fileName = await finalizePartFile(item, this.cfg.overwrite)
    return 'completed'
  }
}
