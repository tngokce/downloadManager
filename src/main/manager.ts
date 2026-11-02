import { EventEmitter } from 'node:events'
import { existsSync } from 'node:fs'
import { rm, statfs } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import type { Dispatcher } from 'undici'
import type {
  AddRequest,
  DownloadItem,
  DownloadLive,
  DownloadStatus,
  HashAlgorithm,
  ProbeResult,
  Queue,
  Settings
} from '@shared/types'
import { MAIN_QUEUE_ID, MAX_CONNECTIONS } from '@shared/defaults'
import { fileExtension } from '@shared/format'
import {
  PART_SUFFIX,
  SpeedLimiter,
  createDispatcher,
  createTask,
  errorCode,
  hashFile,
  probe,
  sanitizeFileName,
  uniqueFileName,
  type DownloadTask,
  type EngineConfig
} from './engine'
import { compactSegments, downloadedOf } from './engine/segments'
import type { JsonStore } from './store'

const ACTIVE: DownloadStatus[] = ['connecting', 'downloading', 'verifying', 'merging']
const TICK_MS = 500

interface Running {
  task: DownloadTask
  /** Duraklatma sonrası hangi duruma geçilecek (kuyruk durdurulunca 'queued') */
  afterPause: DownloadStatus
  runStartedAt: number
  lastReceived: number
  speed: number
  /** Görev tamamen bittiğinde (finally dahil) çözülür */
  done: Promise<void>
}

export interface ManagerDeps {
  /** Sistem proxy ayarını "PROXY host:port" biçiminde döndürür */
  resolveSystemProxy?: () => Promise<string | null>
  ffmpegPath?: () => string | null
  log?: (message: string) => void
}

export interface ManagerEvents {
  added: [DownloadItem[]]
  removed: [string[]]
  patched: [DownloadItem[]]
  live: [DownloadLive[]]
  completed: [DownloadItem]
  failed: [DownloadItem]
  queues: [Queue[]]
  queueDone: [Queue]
  activity: [{ active: number; speed: number; progress: number | null }]
}

/**
 * İndirme listesinin, kuyrukların ve çalışan görevlerin sahibi.
 * Electron'dan bağımsızdır; arayüzle olaylar (EventEmitter) üzerinden konuşur.
 */
export class DownloadManager extends EventEmitter<ManagerEvents> {
  readonly items = new Map<string, DownloadItem>()
  queues: Queue[]
  private readonly running = new Map<string, Running>()
  private readonly dirty = new Set<string>()
  private readonly globalLimiter = new SpeedLimiter()
  private dispatcher: Dispatcher
  private ticker: NodeJS.Timeout
  private orderSeq = 0
  /** Kapanış başladı: yeni görev başlatılmaz */
  private closing = false
  /** Etkinliği görülmüş kuyruklar; boşaldıklarında "bitti" olayı bir kez yayılır */
  private readonly activeQueues = new Set<string>()

  constructor(
    private settings: Settings,
    queues: Queue[],
    private readonly store: JsonStore<DownloadItem[]>,
    private readonly deps: ManagerDeps = {}
  ) {
    super()
    this.queues = queues
    for (const item of store.load() ?? []) {
      if (ACTIVE.includes(item.status)) item.status = settings.resumeOnStartup ? 'queued' : 'paused'
      this.items.set(item.id, item)
      this.orderSeq = Math.max(this.orderSeq, item.order + 1)
    }
    this.dispatcher = this.buildDispatcher(null)
    this.applySettings(settings)
    this.ticker = setInterval(() => this.tick(), TICK_MS)
  }

  // ------------------------------------------------------------ yapılandırma

  private buildDispatcher(systemProxy: string | null): Dispatcher {
    const s = this.settings
    let proxy: Parameters<typeof createDispatcher>[0]['proxy'] = null
    if (s.proxy.mode === 'manual' && s.proxy.host) proxy = s.proxy
    else if (s.proxy.mode === 'system' && systemProxy) {
      // "PROXY host:port", "HTTPS host:port", "SOCKS5 host:port"
      const m = systemProxy.match(/^(PROXY|HTTPS|SOCKS5?)\s+([^:\s;]+):(\d+)/i)
      if (m) {
        const kind = m[1].toUpperCase()
        proxy = { protocol: kind.startsWith('SOCKS') ? 'socks5' : kind === 'HTTPS' ? 'https' : 'http', host: m[2], port: Number(m[3]) }
      }
    }
    return createDispatcher({
      connectTimeoutMs: s.connectTimeoutSec * 1000,
      readTimeoutMs: s.readTimeoutSec * 1000,
      verifyTls: s.verifyTls,
      proxy
    })
  }

  applySettings(settings: Settings): void {
    const prev = this.settings
    this.settings = settings
    this.globalLimiter.setRate(settings.speedLimitEnabled ? settings.globalSpeedLimit : 0)
    const netChanged =
      JSON.stringify([prev.proxy, prev.connectTimeoutSec, prev.readTimeoutSec, prev.verifyTls]) !==
      JSON.stringify([settings.proxy, settings.connectTimeoutSec, settings.readTimeoutSec, settings.verifyTls])
    if (netChanged || prev === settings) void this.refreshDispatcher()
    this.pump()
  }

  async refreshDispatcher(): Promise<void> {
    const system = this.settings.proxy.mode === 'system' ? ((await this.deps.resolveSystemProxy?.()) ?? null) : null
    const old = this.dispatcher
    this.dispatcher = this.buildDispatcher(system)
    if (old !== this.dispatcher) old.close().catch(() => undefined)
  }

  /** Görevler ayarları canlı okur: hız/proxy değişikliği çalışan indirmelere de yansır. */
  private engineConfig(): EngineConfig {
    const mgr = this
    return {
      get dispatcher() {
        return mgr.dispatcher
      },
      globalLimiter: this.globalLimiter,
      get maxRetries() {
        return mgr.settings.maxRetries
      },
      get retryDelayMs() {
        return mgr.settings.retryDelaySec * 1000
      },
      get minSegmentSize() {
        return mgr.settings.minSegmentSize
      },
      get userAgent() {
        return mgr.settings.userAgent
      },
      get overwrite() {
        return mgr.settings.duplicateAction === 'overwrite'
      },
      get ffmpegPath() {
        return mgr.deps.ffmpegPath?.() ?? null
      },
      get hlsRemux() {
        return mgr.settings.hlsRemux
      },
      log: (id, message) => this.deps.log?.(`[${this.items.get(id)?.fileName ?? id}] ${message}`)
    }
  }

  // ------------------------------------------------------------ sorgular

  list(): DownloadItem[] {
    return [...this.items.values()].sort((a, b) => a.order - b.order)
  }

  async probe(url: string, headers: Record<string, string> = {}): Promise<ProbeResult> {
    return probe(url, { headers: { 'user-agent': this.settings.userAgent, ...headers }, dispatcher: this.dispatcher })
  }

  findDuplicate(url: string): DownloadItem | undefined {
    return [...this.items.values()].find((i) => i.url === url || i.finalUrl === url)
  }

  categoryFor(fileName: string): string {
    const ext = fileExtension(fileName)
    return this.settings.categories.find((c) => c.extensions.includes(ext))?.id ?? 'general'
  }

  directoryFor(categoryId: string): string {
    const cat = this.settings.categories.find((c) => c.id === categoryId)
    if (cat?.directory) return cat.directory
    if (this.settings.useCategoryFolders && cat) return join(this.settings.defaultDirectory, cat.name)
    return this.settings.defaultDirectory
  }

  /** Aynı klasörde bitmemiş indirmelerin rezerve ettiği adlar */
  private takenNames(directory: string, exceptId?: string): Set<string> {
    const set = new Set<string>()
    for (const i of this.items.values()) {
      if (i.id !== exceptId && i.directory === directory && i.status !== 'completed') set.add(i.fileName.toLowerCase())
    }
    return set
  }

  // ------------------------------------------------------------ ekleme / silme

  add(req: AddRequest): DownloadItem {
    const url = req.url.trim()
    const kind = req.kind ?? (/^ftps?:/i.test(url) ? 'ftp' : 'http')
    let fileName = sanitizeFileName(req.fileName?.trim() || decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || '') || 'download')
    const category = req.category && this.settings.categories.some((c) => c.id === req.category) ? req.category : this.categoryFor(fileName)
    const directory = req.directory?.trim() || this.directoryFor(category)
    if (this.settings.duplicateAction !== 'overwrite') fileName = uniqueFileName(directory, fileName, this.takenNames(directory))

    const item: DownloadItem = {
      id: randomUUID(),
      kind,
      url,
      referrer: req.referrer,
      fileName,
      directory,
      category,
      queueId: req.queueId && this.queues.some((q) => q.id === req.queueId) ? req.queueId : MAIN_QUEUE_ID,
      status: req.start === false ? 'paused' : 'queued',
      totalBytes: req.totalBytes ?? null,
      downloadedBytes: 0,
      resumable: false,
      segments: [],
      maxConnections: Math.min(MAX_CONNECTIONS, Math.max(1, req.maxConnections ?? this.settings.connectionsPerDownload)),
      speedLimit: req.speedLimit ?? 0,
      headers: req.headers ?? {},
      mime: req.mime,
      checksum: req.checksum?.expected ? { algorithm: req.checksum.algorithm, expected: req.checksum.expected.trim().toLowerCase() } : undefined,
      hls: req.hls ? { ...req.hls, segmentsTotal: 0, segmentsDone: 0 } : undefined,
      retryCount: 0,
      createdAt: Date.now(),
      elapsedMs: 0,
      order: this.orderSeq++,
      note: req.note
    }
    this.items.set(item.id, item)
    this.emit('added', [item])
    this.persist()
    this.pump()
    return item
  }

  addMany(reqs: AddRequest[]): DownloadItem[] {
    return reqs.map((r) => this.add(r))
  }

  async remove(ids: string[], deleteFiles: boolean): Promise<void> {
    for (const id of ids) {
      const item = this.items.get(id)
      if (!item) continue
      await this.stopTask(id, 'paused')
      this.items.delete(id)
      // Yarım kalan geçici dosyalar her durumda silinir; bitmiş dosya yalnızca istenirse.
      await this.deleteTemp(item)
      if (deleteFiles && item.status === 'completed') await rm(join(item.directory, item.fileName), { force: true }).catch(() => undefined)
    }
    this.emit('removed', ids)
    this.persist()
    this.pump()
  }

  private async deleteTemp(item: DownloadItem): Promise<void> {
    await rm(join(item.directory, item.fileName + PART_SUFFIX), { force: true }).catch(() => undefined)
    await rm(join(item.directory, item.fileName + '.dmhls'), { recursive: true, force: true }).catch(() => undefined)
  }

  // ------------------------------------------------------------ durum değişiklikleri

  start(ids: string[]): void {
    for (const id of ids) {
      const item = this.items.get(id)
      if (!item || item.status === 'completed' || this.running.has(id)) continue
      item.status = 'queued'
      item.error = undefined
      // Durdurulmuş bir kuyruktaki öğeyi elle başlatmak kuyruğu da başlatır.
      const q = this.queues.find((x) => x.id === item.queueId)
      if (q && !q.running) {
        item.queueId = MAIN_QUEUE_ID
      }
      this.markDirty(item)
    }
    this.pump()
  }

  async pause(ids: string[]): Promise<void> {
    for (const id of ids) {
      const item = this.items.get(id)
      if (!item) continue
      if (this.running.has(id)) await this.stopTask(id, 'paused')
      else if (item.status === 'queued') {
        item.status = 'paused'
        this.markDirty(item)
      }
    }
  }

  startAll(): void {
    this.start([...this.items.values()].filter((i) => i.status === 'paused' || i.status === 'failed').map((i) => i.id))
  }

  async pauseAll(): Promise<void> {
    await this.pause([...this.items.values()].filter((i) => i.status !== 'completed').map((i) => i.id))
  }

  /** Bitmiş veya hatalı indirmeyi sıfırdan yeniden başlatır */
  async redownload(id: string): Promise<void> {
    const item = this.items.get(id)
    if (!item) return
    await this.stopTask(id, 'paused')
    await this.deleteTemp(item)
    item.segments = []
    item.downloadedBytes = 0
    item.totalBytes = null
    item.retryCount = 0
    item.elapsedMs = 0
    item.completedAt = undefined
    item.error = undefined
    if (item.hls) item.hls = { ...item.hls, segmentsDone: 0, segmentsTotal: 0 }
    if (item.checksum) item.checksum = { algorithm: item.checksum.algorithm, expected: item.checksum.expected }
    if (this.settings.duplicateAction !== 'overwrite') {
      item.fileName = uniqueFileName(item.directory, item.fileName, this.takenNames(item.directory, item.id))
    }
    this.start([id])
  }

  /**
   * Süresi dolmuş bağlantıyı yenisiyle değiştirir (IDM "adresi yenile").
   * İlerleme korunur; yeni adres aynı boyutta dosya veriyorsa kaldığı yerden devam eder.
   */
  async refreshAddress(id: string, url: string, headers?: Record<string, string>): Promise<void> {
    const item = this.items.get(id)
    if (!item) return
    const wasRunning = this.running.has(id)
    await this.stopTask(id, 'paused')
    item.url = url.trim()
    item.finalUrl = undefined
    if (headers) item.headers = { ...item.headers, ...headers }
    item.error = undefined
    this.markDirty(item)
    if (wasRunning || item.status === 'failed') this.start([id])
  }

  async update(id: string, changes: Partial<Pick<DownloadItem, 'fileName' | 'directory' | 'speedLimit' | 'maxConnections' | 'note' | 'headers' | 'category' | 'checksum'>>): Promise<void> {
    const item = this.items.get(id)
    if (!item) return
    const started = item.downloadedBytes > 0 || this.running.has(id)
    if (changes.speedLimit !== undefined) {
      item.speedLimit = Math.max(0, changes.speedLimit)
      this.running.get(id)?.task.setSpeedLimit(item.speedLimit)
    }
    if (changes.maxConnections !== undefined) item.maxConnections = Math.min(MAX_CONNECTIONS, Math.max(1, changes.maxConnections))
    if (changes.note !== undefined) item.note = changes.note
    if (changes.headers) item.headers = changes.headers
    if (changes.category) item.category = changes.category
    if (changes.checksum !== undefined) item.checksum = changes.checksum
    // Dosya adı ve klasör yalnızca indirme başlamadan değiştirilebilir.
    if (!started && item.status !== 'completed') {
      if (changes.fileName) item.fileName = sanitizeFileName(changes.fileName)
      if (changes.directory) item.directory = changes.directory
    }
    this.markDirty(item)
  }

  moveToQueue(ids: string[], queueId: string): void {
    if (!this.queues.some((q) => q.id === queueId)) return
    for (const id of ids) {
      const item = this.items.get(id)
      if (!item) continue
      item.queueId = queueId
      this.markDirty(item)
    }
    this.pump()
  }

  /** Sürükle-bırak ile sıralama: verilen kimlikler bu sırayla dizilir */
  reorder(ids: string[]): void {
    const orders = ids.map((id) => this.items.get(id)?.order ?? 0).sort((a, b) => a - b)
    ids.forEach((id, i) => {
      const item = this.items.get(id)
      if (item) {
        item.order = orders[i]
        this.markDirty(item)
      }
    })
  }

  clearCompleted(): void {
    const ids = [...this.items.values()].filter((i) => i.status === 'completed').map((i) => i.id)
    for (const id of ids) this.items.delete(id)
    this.emit('removed', ids)
    this.persist()
  }

  async computeHash(id: string, algorithm: HashAlgorithm): Promise<string> {
    const item = this.items.get(id)
    if (!item || item.status !== 'completed') throw new Error('Dosya henüz tamamlanmadı')
    return hashFile(join(item.directory, item.fileName), algorithm)
  }

  /** Uyku/ağ değişikliği sonrası beklemedeki bağlantıları hemen yeniden kurar */
  async kick(): Promise<void> {
    const ids = [...this.running.keys()]
    for (const id of ids) await this.stopTask(id, 'queued')
    this.pump()
  }

  // ------------------------------------------------------------ kuyruklar

  setQueues(queues: Queue[]): void {
    this.queues = queues
    this.emit('queues', queues)
    this.pump()
  }

  startQueue(queueId: string): void {
    const q = this.queues.find((x) => x.id === queueId)
    if (!q) return
    q.running = true
    for (const item of this.items.values()) {
      if (item.queueId === queueId && (item.status === 'paused' || item.status === 'failed')) {
        item.status = 'queued'
        item.error = undefined
        this.markDirty(item)
      }
    }
    this.emit('queues', this.queues)
    this.pump()
  }

  async stopQueue(queueId: string): Promise<void> {
    const q = this.queues.find((x) => x.id === queueId)
    if (!q) return
    q.running = false
    this.activeQueues.delete(queueId)
    for (const [id] of this.running) {
      if (this.items.get(id)?.queueId === queueId) await this.stopTask(id, 'queued')
    }
    this.emit('queues', this.queues)
  }

  // ------------------------------------------------------------ çalıştırma

  /** Boş yer varsa sıradaki indirmeleri başlatır. */
  pump(): void {
    if (this.closing) return
    const max = Math.max(1, this.settings.maxConcurrentDownloads)
    const candidates = this.list().filter((i) => i.status === 'queued' && !this.running.has(i.id))
    for (const item of candidates) {
      if (this.running.size >= max) break
      const q = this.queues.find((x) => x.id === item.queueId) ?? this.queues[0]
      if (!q?.running) continue
      if (q.maxConcurrent > 0) {
        const inQueue = [...this.running.keys()].filter((id) => this.items.get(id)?.queueId === q.id).length
        if (inQueue >= q.maxConcurrent) continue
      }
      this.activeQueues.add(q.id)
      void this.runTask(item)
    }
  }

  private async checkDiskSpace(item: DownloadItem): Promise<void> {
    if (item.totalBytes == null) return
    const remaining = item.totalBytes - item.downloadedBytes
    try {
      const s = await statfs(existsSync(item.directory) ? item.directory : this.settings.defaultDirectory)
      if (s.bavail * s.bsize < remaining) throw Object.assign(new Error('diskFull'), { code: 'ENOSPC' })
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOSPC') throw err
    }
  }

  private async runTask(item: DownloadItem): Promise<void> {
    const task = createTask(item, this.engineConfig())
    let finish!: () => void
    const done = new Promise<void>((r) => (finish = r))
    const entry: Running = { task, afterPause: 'paused', runStartedAt: Date.now(), lastReceived: 0, speed: 0, done }
    this.running.set(item.id, entry)
    item.status = 'connecting'
    item.error = undefined
    this.markDirty(item)
    try {
      await this.checkDiskSpace(item)
      const result = await task.run()
      if (result === 'completed') {
        await this.onCompleted(item)
      } else {
        item.status = entry.afterPause
      }
    } catch (err) {
      item.status = 'failed'
      item.error = errorCode(err)
      this.deps.log?.(`[${item.fileName}] hata: ${item.error}`)
      this.emit('failed', item)
    } finally {
      item.elapsedMs += Date.now() - entry.runStartedAt
      if (item.status !== 'completed') item.segments = compactSegments(item.segments)
      this.running.delete(item.id)
      this.markDirty(item)
      this.persist()
      finish()
      this.pump()
      this.checkQueuesDone()
    }
  }

  private async onCompleted(item: DownloadItem): Promise<void> {
    item.segments = []
    if (item.checksum?.expected) {
      item.status = 'verifying'
      this.markDirty(item)
      const actual = await hashFile(join(item.directory, item.fileName), item.checksum.algorithm)
      item.checksum = { ...item.checksum, actual, ok: actual === item.checksum.expected }
      if (!item.checksum.ok) {
        item.status = 'failed'
        item.error = 'checksum'
        this.emit('failed', item)
        return
      }
    }
    item.status = 'completed'
    item.completedAt = Date.now()
    this.emit('completed', item)
    const cmd = this.settings.postDownloadCommand.trim()
    if (cmd) {
      const file = join(item.directory, item.fileName)
      const line = cmd.replaceAll('{file}', JSON.stringify(file)).replaceAll('{dir}', JSON.stringify(item.directory))
      spawn(line, { shell: true, detached: true, stdio: 'ignore', windowsHide: true }).unref()
    }
  }

  private async stopTask(id: string, afterPause: DownloadStatus): Promise<void> {
    const entry = this.running.get(id)
    if (!entry) return
    entry.afterPause = afterPause
    entry.task.pause()
    // Görev kendi finally bloğunda kaydı siler; tamamlanmasını bekle.
    await entry.done
  }

  private checkQueuesDone(): void {
    for (const qid of [...this.activeQueues]) {
      const pending = [...this.items.values()].some(
        (i) => i.queueId === qid && (i.status === 'queued' || ACTIVE.includes(i.status) || this.running.has(i.id))
      )
      if (pending) continue
      this.activeQueues.delete(qid)
      const q = this.queues.find((x) => x.id === qid)
      if (q) this.emit('queueDone', q)
    }
  }

  // ------------------------------------------------------------ canlı istatistikler

  private markDirty(item: DownloadItem): void {
    this.dirty.add(item.id)
  }

  private tick(): void {
    const live: DownloadLive[] = []
    let totalSpeed = 0
    for (const [id, entry] of this.running) {
      const item = this.items.get(id)
      if (!item) continue
      const received = entry.task.receivedBytes
      const instant = ((received - entry.lastReceived) * 1000) / TICK_MS
      entry.lastReceived = received
      // Üstel hareketli ortalama: dalgalanmayı yumuşatır ama değişime hızlı tepki verir.
      entry.speed = entry.speed === 0 ? instant : entry.speed * 0.7 + instant * 0.3
      totalSpeed += entry.speed
      let eta: number | null = null
      if (item.totalBytes && entry.speed > 1) eta = (item.totalBytes - item.downloadedBytes) / entry.speed
      else if (item.hls && item.hls.segmentsDone > 0 && entry.speed > 1) {
        const perSeg = item.downloadedBytes / item.hls.segmentsDone
        eta = ((item.hls.segmentsTotal - item.hls.segmentsDone) * perSeg) / entry.speed
      }
      live.push({ id, speed: entry.speed, eta, activeConnections: entry.task.activeConnections })
      this.dirty.add(id)
    }
    if (live.length || this.running.size === 0) this.emit('live', live)

    if (this.dirty.size) {
      const changed = [...this.dirty].map((id) => this.items.get(id)).filter((i): i is DownloadItem => !!i)
      this.dirty.clear()
      if (changed.length) this.emit('patched', changed)
      this.persist()
    }

    let total = 0
    let done = 0
    for (const id of this.running.keys()) {
      const i = this.items.get(id)
      if (i?.totalBytes) {
        total += i.totalBytes
        done += i.downloadedBytes
      }
    }
    this.emit('activity', { active: this.running.size, speed: totalSpeed, progress: total ? done / total : null })
  }

  get activeCount(): number {
    return this.running.size
  }

  private persist(): void {
    this.store.save(this.list())
  }

  /** Kapanış: tüm görevleri durdurur ve ilerlemeyi diske yazar. */
  async shutdown(): Promise<void> {
    this.closing = true
    clearInterval(this.ticker)
    const ids = [...this.running.keys()]
    await Promise.all(ids.map((id) => this.stopTask(id, 'queued')))
    for (const item of this.items.values()) {
      if (item.status !== 'completed') {
        item.segments = compactSegments(item.segments)
        item.downloadedBytes = item.kind === 'http' && item.segments.length ? downloadedOf(item.segments) : item.downloadedBytes
      }
    }
    this.store.flush(this.list())
    await this.dispatcher.close().catch(() => undefined)
  }
}
