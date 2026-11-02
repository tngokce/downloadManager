import { createDecipheriv } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import type { DownloadItem, HlsVariant } from '@shared/types'
import { HttpError, header, httpRequest, discard, isTransientError, parseRetryAfter } from './http'
import { SpeedLimiter } from './throttle'
import { errorCode, fatal } from './errors'
import { FatalDownloadError, backoffMs, isFatalFsError, requestHeaders, type DownloadTask, type EngineConfig, type TaskResult } from './task'

// ---------------------------------------------------------------- Ayrıştırıcı

interface ByteRange {
  length: number
  offset: number
}

interface KeyInfo {
  method: string
  uri?: string
  iv?: Buffer
}

export interface MediaSegment {
  uri: string
  duration: number
  seq: number
  byterange?: ByteRange
  key?: KeyInfo
  map?: { uri: string; byterange?: ByteRange }
}

export type Playlist =
  | { type: 'master'; variants: HlsVariant[] }
  | { type: 'media'; segments: MediaSegment[]; endList: boolean; targetDuration: number }

export function looksLikeHls(url: string, mime?: string): boolean {
  if (mime && /mpegurl/i.test(mime)) return true
  try {
    return /\.m3u8$/i.test(new URL(url).pathname)
  } catch {
    return false
  }
}

/** `KEY=VALUE,KEY2="a,b"` biçimindeki öznitelik listesini ayrıştırır. */
export function parseAttributes(input: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input))) out[m[1]] = m[2].replace(/^"|"$/g, '')
  return out
}

function parseByteRange(value: string, prevEnd: number): ByteRange {
  const [len, off] = value.split('@')
  return { length: Number(len), offset: off !== undefined ? Number(off) : prevEnd }
}

function variantName(bandwidth: number, resolution?: string): string {
  const kbps = bandwidth ? `${Math.round(bandwidth / 1000)} kbps` : ''
  const height = resolution?.split('x')[1]
  return [height ? `${height}p` : '', kbps].filter(Boolean).join(' · ') || 'default'
}

export function parsePlaylist(text: string, baseUrl: string): Playlist {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (!lines[0]?.startsWith('#EXTM3U')) throw fatal('hlsInvalid')
  const abs = (u: string) => new URL(u, baseUrl).href

  if (lines.some((l) => l.startsWith('#EXT-X-STREAM-INF'))) {
    const audioGroups = new Map<string, string>()
    for (const l of lines) {
      if (!l.startsWith('#EXT-X-MEDIA:')) continue
      const a = parseAttributes(l.slice(13))
      if (a.TYPE !== 'AUDIO' || !a.URI || !a['GROUP-ID']) continue
      if (!audioGroups.has(a['GROUP-ID']) || a.DEFAULT === 'YES') audioGroups.set(a['GROUP-ID'], abs(a.URI))
    }
    const variants: HlsVariant[] = []
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith('#EXT-X-STREAM-INF:')) continue
      const a = parseAttributes(lines[i].slice(18))
      const uri = lines.slice(i + 1).find((l) => !l.startsWith('#'))
      if (!uri) continue
      const bandwidth = Number(a.BANDWIDTH ?? a['AVERAGE-BANDWIDTH'] ?? 0)
      variants.push({
        url: abs(uri),
        bandwidth,
        resolution: a.RESOLUTION,
        codecs: a.CODECS,
        audioUrl: a.AUDIO ? audioGroups.get(a.AUDIO) : undefined,
        name: variantName(bandwidth, a.RESOLUTION)
      })
    }
    variants.sort((x, y) => y.bandwidth - x.bandwidth)
    return { type: 'master', variants }
  }

  const segments: MediaSegment[] = []
  let seq = 0
  let duration = 0
  let targetDuration = 0
  let endList = false
  let key: KeyInfo | undefined
  let map: MediaSegment['map']
  let pendingRange: ByteRange | undefined
  const lastEnd = new Map<string, number>()
  for (const l of lines) {
    if (l.startsWith('#EXT-X-MEDIA-SEQUENCE:')) seq = Number(l.slice(22))
    else if (l.startsWith('#EXT-X-TARGETDURATION:')) targetDuration = Number(l.slice(22))
    else if (l.startsWith('#EXTINF:')) duration = parseFloat(l.slice(8))
    else if (l.startsWith('#EXT-X-ENDLIST')) endList = true
    else if (l.startsWith('#EXT-X-BYTERANGE:')) pendingRange = parseByteRange(l.slice(17), -1)
    else if (l.startsWith('#EXT-X-KEY:')) {
      const a = parseAttributes(l.slice(11))
      key =
        a.METHOD === 'NONE'
          ? undefined
          : { method: a.METHOD, uri: a.URI ? abs(a.URI) : undefined, iv: a.IV ? Buffer.from(a.IV.replace(/^0x/i, '').padStart(32, '0'), 'hex') : undefined }
    } else if (l.startsWith('#EXT-X-MAP:')) {
      const a = parseAttributes(l.slice(11))
      map = { uri: abs(a.URI), byterange: a.BYTERANGE ? parseByteRange(a.BYTERANGE, 0) : undefined }
    } else if (!l.startsWith('#')) {
      const uri = abs(l)
      let byterange: ByteRange | undefined
      if (pendingRange) {
        byterange = { ...pendingRange, offset: pendingRange.offset >= 0 ? pendingRange.offset : (lastEnd.get(uri) ?? 0) }
        lastEnd.set(uri, byterange.offset + byterange.length)
        pendingRange = undefined
      }
      segments.push({ uri, duration, seq: seq++, byterange, key, map })
      duration = 0
    }
  }
  return { type: 'media', segments, endList, targetDuration }
}

// ---------------------------------------------------------------- İndirici

interface Track {
  label: 'v' | 'a'
  segments: MediaSegment[]
}

interface Job {
  track: Track
  index: number
  seg: MediaSegment
  file: string
}

/** Bir komutun PATH'te olup olmadığını kontrol eder (ffmpeg için). */
export function runProcess(cmd: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { windowsHide: true })
    let stderr = ''
    p.stderr?.on('data', (d) => (stderr = (stderr + String(d)).slice(-4000)))
    p.on('error', (e) => resolve({ code: -1, stderr: e.message }))
    p.on('close', (code) => resolve({ code: code ?? -1, stderr }))
  })
}

/**
 * HLS (m3u8) video indirici: parçaları paralel indirir, AES-128 şifresini çözer, sırayla
 * birleştirir; ffmpeg varsa ses/görüntüyü tek bir .mp4 dosyasında toplar.
 * DRM'li (SAMPLE-AES / Widevine / FairPlay) ve canlı yayınlar desteklenmez.
 */
export class HlsDownloader implements DownloadTask {
  private stopped = false
  private fatalError: Error | null = null
  private readonly abort = new AbortController()
  private readonly limiter = new SpeedLimiter()
  private readonly keys = new Map<string, Promise<Buffer>>()
  private inFlight = 0
  private received = 0

  constructor(
    private readonly item: DownloadItem,
    private readonly cfg: EngineConfig
  ) {
    this.limiter.setRate(item.speedLimit)
  }

  get activeConnections(): number {
    return this.inFlight
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

  private get workDir(): string {
    return join(this.item.directory, this.item.fileName + '.dmhls')
  }

  private headers(): Record<string, string> {
    return requestHeaders(this.item, this.cfg.userAgent)
  }

  async run(): Promise<TaskResult> {
    const item = this.item
    const hls = item.hls
    if (!hls) throw fatal('hlsInvalid')
    item.status = 'connecting'
    item.error = undefined

    const tracks: Track[] = []
    const video = await this.retrying(() => this.loadMedia(hls.playlistUrl))
    if (!video) return 'paused'
    tracks.push({ label: 'v', segments: video })
    if (hls.audioUrl) {
      const audio = await this.retrying(() => this.loadMedia(hls.audioUrl!))
      if (!audio) return 'paused'
      tracks.push({ label: 'a', segments: audio })
    }

    await mkdir(this.workDir, { recursive: true })
    const existing = new Set(await readdir(this.workDir))
    const jobs: Job[] = []
    let doneBytes = 0
    let total = 0
    for (const track of tracks) {
      for (const [index, seg] of track.segments.entries()) {
        total++
        const file = `${track.label}-${String(index).padStart(6, '0')}.seg`
        if (existing.has(file)) doneBytes += (await stat(join(this.workDir, file))).size
        else jobs.push({ track, index, seg, file })
      }
    }
    hls.segmentsTotal = total
    hls.segmentsDone = total - jobs.length
    item.downloadedBytes = doneBytes
    item.status = 'downloading'
    item.startedAt ??= Date.now()

    let next = 0
    const worker = async () => {
      while (!this.stopped && !this.fatalError && next < jobs.length) {
        const job = jobs[next++]
        this.inFlight++
        try {
          await this.downloadJob(job)
        } catch (err) {
          if (!this.stopped && !this.fatalError) {
            this.fatalError = err instanceof FatalDownloadError ? err : fatal(errorCode(err))
            this.abort.abort()
          }
        } finally {
          this.inFlight--
        }
      }
    }
    await Promise.all(Array.from({ length: Math.max(1, item.maxConnections) }, worker))
    if (this.fatalError) throw this.fatalError
    if (this.stopped) return 'paused'

    item.status = 'merging'
    await this.merge(tracks)
    return 'completed'
  }

  private async loadMedia(url: string): Promise<MediaSegment[]> {
    const res = await httpRequest(url, { headers: this.headers(), dispatcher: this.cfg.dispatcher, signal: this.abort.signal })
    if (res.statusCode >= 400) {
      discard(res.body)
      throw new HttpError(res.statusCode, parseRetryAfter(header(res.headers, 'retry-after')))
    }
    let pl = parsePlaylist(await res.body.text(), res.finalUrl)
    if (pl.type === 'master') {
      // Kullanıcı ana listeyi verdiyse en yüksek kaliteyi seç.
      const best = pl.variants[0]
      if (!best) throw fatal('hlsInvalid')
      if (best.audioUrl && !this.item.hls!.audioUrl) this.item.hls!.audioUrl = best.audioUrl
      return this.loadMedia(best.url)
    }
    if (!pl.endList) throw fatal('hlsLive')
    if (pl.segments.some((s) => s.key && s.key.method !== 'AES-128')) throw fatal('drm')
    return pl.segments
  }

  private async retrying<T>(fn: () => Promise<T>): Promise<T | null> {
    for (let attempt = 0; ; attempt++) {
      if (this.stopped) return null
      try {
        return await fn()
      } catch (err) {
        if (this.stopped) return null
        if (err instanceof FatalDownloadError || !isTransientError(err)) throw err
        if (this.cfg.maxRetries > 0 && attempt >= this.cfg.maxRetries) throw err
        this.item.retryCount++
        try {
          await sleep(backoffMs(this.cfg.retryDelayMs, attempt), undefined, { signal: this.abort.signal })
        } catch {
          return null
        }
      }
    }
  }

  private async fetchBytes(url: string, range?: ByteRange, count = true): Promise<Buffer> {
    const headers = this.headers()
    if (range) headers.range = `bytes=${range.offset}-${range.offset + range.length - 1}`
    const res = await httpRequest(url, { headers, dispatcher: this.cfg.dispatcher, signal: this.abort.signal })
    if (res.statusCode >= 400) {
      discard(res.body)
      throw new HttpError(res.statusCode, parseRetryAfter(header(res.headers, 'retry-after')))
    }
    const chunks: Buffer[] = []
    for await (const chunk of res.body as AsyncIterable<Buffer>) {
      if (count) {
        this.received += chunk.length
        await this.limiter.consume(chunk.length, this.abort.signal)
        await this.cfg.globalLimiter.consume(chunk.length, this.abort.signal)
      }
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  }

  private key(uri: string): Promise<Buffer> {
    let p = this.keys.get(uri)
    if (!p) {
      p = this.fetchBytes(uri, undefined, false)
      p.catch(() => this.keys.delete(uri))
      this.keys.set(uri, p)
    }
    return p
  }

  private async downloadJob(job: Job): Promise<void> {
    const r = await this.retrying(async () => {
      let data = await this.fetchBytes(job.seg.uri, job.seg.byterange)
      const k = job.seg.key
      if (k && k.method === 'AES-128' && k.uri) {
        const iv = k.iv ?? Buffer.from(job.seg.seq.toString(16).padStart(32, '0'), 'hex')
        const d = createDecipheriv('aes-128-cbc', await this.key(k.uri), iv)
        data = Buffer.concat([d.update(data), d.final()])
      }
      return data
    })
    if (!r) return
    const tmp = join(this.workDir, job.file + '.tmp')
    try {
      await writeFile(tmp, r)
      await rename(tmp, join(this.workDir, job.file))
    } catch (err) {
      if (isFatalFsError(err)) throw fatal(errorCode(err))
      throw err
    }
    this.item.downloadedBytes += r.length
    this.item.hls!.segmentsDone++
  }

  private async concatTrack(track: Track, out: string): Promise<void> {
    const ws = createWriteStream(out)
    const done = new Promise<void>((res, rej) => {
      ws.on('finish', res)
      ws.on('error', rej)
    })
    let lastMap: string | undefined
    for (const [index, seg] of track.segments.entries()) {
      // fMP4: başlatma parçası (init segment) her değiştiğinde bir kez yazılır.
      const mapKey = seg.map ? `${seg.map.uri}#${seg.map.byterange?.offset ?? ''}` : undefined
      if (seg.map && mapKey !== lastMap) {
        const init = await this.retrying(() => this.fetchBytes(seg.map!.uri, seg.map!.byterange, false))
        if (!init) throw new Error('paused')
        if (!ws.write(init)) await new Promise<void>((r) => ws.once('drain', () => r()))
        lastMap = mapKey
      }
      const file = join(this.workDir, `${track.label}-${String(index).padStart(6, '0')}.seg`)
      await pipeline(createReadStream(file), ws, { end: false })
    }
    ws.end()
    await done
  }

  private async merge(tracks: Track[]): Promise<void> {
    const item = this.item
    // workDir dosya adından türetilir; ad aşağıda değişeceği için önceden sabitlenir.
    const workDir = this.workDir
    const isFmp4 = tracks[0].segments.some((s) => s.map)
    const trackFiles: string[] = []
    for (const t of tracks) {
      const out = join(workDir, `${t.label}.${isFmp4 ? 'mp4' : 'ts'}`)
      await this.concatTrack(t, out)
      trackFiles.push(out)
    }

    const stem = item.fileName.replace(/\.[a-z0-9]{1,5}$/i, '')
    const ffmpeg = this.cfg.ffmpegPath
    let produced: string | null = null
    if (ffmpeg && (this.cfg.hlsRemux || trackFiles.length > 1)) {
      const out = join(workDir, 'out.mp4')
      const args = ['-hide_banner', '-loglevel', 'error', '-y']
      for (const f of trackFiles) args.push('-i', f)
      if (trackFiles.length > 1) args.push('-map', '0:v:0?', '-map', '1:a:0?')
      else args.push('-map', '0:v?', '-map', '0:a?')
      args.push('-c', 'copy', '-movflags', '+faststart', out)
      const r = await runProcess(ffmpeg, args)
      if (r.code === 0 && existsSync(out)) produced = out
      else this.cfg.log?.(item.id, `ffmpeg başarısız: ${r.stderr.trim()}`)
    }

    const place = async (src: string, ext: string) => {
      let name = `${stem}${ext}`
      if (!this.cfg.overwrite) for (let i = 1; existsSync(join(item.directory, name)); i++) name = `${stem} (${i})${ext}`
      else await rm(join(item.directory, name), { force: true })
      await rename(src, join(item.directory, name))
      return name
    }

    if (produced) {
      item.fileName = await place(produced, '.mp4')
    } else {
      item.fileName = await place(trackFiles[0], isFmp4 ? '.mp4' : '.ts')
      if (trackFiles[1]) {
        await place(trackFiles[1], isFmp4 ? '.audio.mp4' : '.audio.ts')
        this.cfg.log?.(item.id, 'Ses ayrı dosyaya kaydedildi (birleştirmek için ffmpeg gerekli)')
      }
    }
    const size = (await stat(join(item.directory, item.fileName))).size
    item.totalBytes = size
    item.downloadedBytes = size
    await rm(workDir, { recursive: true, force: true })
  }
}
