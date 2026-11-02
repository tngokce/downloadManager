// Ana süreç, preload ve arayüz arasında paylaşılan veri modelleri.

export type DownloadStatus =
  | 'queued' // sırada, boş yer bekliyor
  | 'connecting' // sunucuya bağlanıyor / bilgi alınıyor
  | 'downloading'
  | 'paused'
  | 'verifying' // checksum doğrulanıyor
  | 'merging' // HLS parçaları birleştiriliyor
  | 'completed'
  | 'failed'

export type DownloadKind = 'http' | 'hls' | 'ftp'

export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha512'

/** Dosyanın bir bölümü. `end` dahil; `pos` sıradaki yazılacak bayt. pos > end ise bölüm bitmiştir. */
export interface Segment {
  start: number
  end: number
  pos: number
}

export interface ChecksumInfo {
  algorithm: HashAlgorithm
  expected?: string
  actual?: string
  ok?: boolean
}

export interface HlsInfo {
  /** Seçilen varyantın (çözünürlük) playlist adresi */
  playlistUrl: string
  /** Ayrı ses izi varsa playlist adresi */
  audioUrl?: string
  segmentsTotal: number
  segmentsDone: number
  resolution?: string
}

export interface DownloadItem {
  id: string
  kind: DownloadKind
  url: string
  /** Yönlendirmelerden sonraki gerçek adres */
  finalUrl?: string
  /** İndirmenin başlatıldığı sayfa (Referer) */
  referrer?: string
  fileName: string
  directory: string
  category: string
  queueId: string
  status: DownloadStatus
  totalBytes: number | null
  downloadedBytes: number
  /** Sunucu Range isteklerini destekliyor mu (devam ettirilebilir mi) */
  resumable: boolean
  segments: Segment[]
  maxConnections: number
  /** İndirmeye özel hız sınırı (bayt/sn), 0 = sınırsız */
  speedLimit: number
  /** Cookie, User-Agent, Authorization vb. ek başlıklar */
  headers: Record<string, string>
  mime?: string
  etag?: string
  lastModified?: string
  checksum?: ChecksumInfo
  hls?: HlsInfo
  error?: string
  retryCount: number
  createdAt: number
  startedAt?: number
  completedAt?: number
  /** Toplam aktif indirme süresi (ms) */
  elapsedMs: number
  /** Sıra içindeki öncelik; küçük olan önce başlar */
  order: number
  /** Kullanıcı açıklaması */
  note?: string
}

/** Arayüze anlık gönderilen (kaydedilmeyen) canlı istatistikler */
export interface DownloadLive {
  id: string
  speed: number
  eta: number | null
  activeConnections: number
}

export interface Category {
  id: string
  name: string
  extensions: string[]
  /** Boşsa varsayılan klasör + kategori adı kullanılır */
  directory: string
  builtin?: boolean
}

export interface QueueSchedule {
  enabled: boolean
  /** "HH:MM" */
  startTime: string
  /** "HH:MM" boş = durdurma yok */
  stopTime: string
  /** 0=Pazar ... 6=Cumartesi; boş = her gün */
  days: number[]
}

export interface Queue {
  id: string
  name: string
  running: boolean
  maxConcurrent: number
  schedule: QueueSchedule
  /** Kuyruk bittiğinde yapılacak işlem */
  onComplete: PostAction
  builtin?: boolean
}

export type PostAction = 'none' | 'sleep' | 'shutdown' | 'quit'

export type ProxyMode = 'none' | 'system' | 'manual'

export interface ProxySettings {
  mode: ProxyMode
  protocol: 'http' | 'https' | 'socks5'
  host: string
  port: number
  username: string
  password: string
}

export interface BrowserIntegration {
  enabled: boolean
  port: number
  /** Eklentinin yakalayacağı dosya uzantıları */
  interceptExtensions: string[]
  /** Bu boyutun altındaki dosyalar tarayıcıya bırakılır (KB) */
  minSizeKB: number
  excludedSites: string[]
  /** Tarayıcıdan gelen indirmede onay penceresi göster */
  showAddDialog: boolean
  /** Sayfadaki videolar için "İndir" düğmesi */
  videoButton: boolean
}

export type Language = 'tr' | 'en'
export type Theme = 'system' | 'light' | 'dark'
export type DuplicateAction = 'rename' | 'overwrite'

export interface Settings {
  language: Language
  theme: Theme
  defaultDirectory: string
  useCategoryFolders: boolean
  categories: Category[]
  maxConcurrentDownloads: number
  connectionsPerDownload: number
  /** Dinamik bölümlemede bir bölümün bölünebilmesi için gereken en küçük boyut (bayt) */
  minSegmentSize: number
  /** 0 = sonsuz deneme */
  maxRetries: number
  retryDelaySec: number
  connectTimeoutSec: number
  readTimeoutSec: number
  speedLimitEnabled: boolean
  /** bayt/sn */
  globalSpeedLimit: number
  userAgent: string
  proxy: ProxySettings
  duplicateAction: DuplicateAction
  autoStart: boolean
  /** Uygulama kapanırken süren indirmeleri açılışta sürdür */
  resumeOnStartup: boolean
  browser: BrowserIntegration
  clipboardMonitor: boolean
  notifications: boolean
  soundOnComplete: boolean
  startAtLogin: boolean
  startMinimized: boolean
  closeToTray: boolean
  preventSleep: boolean
  verifyTls: boolean
  /** Boşsa PATH içinde aranır */
  ffmpegPath: string
  /** HLS indirmelerini ffmpeg ile mp4'e dönüştür */
  hlsRemux: boolean
  /** Bitince dosyayı virüs taraması vb. için çalıştırılacak komut, {file} yer tutucusu */
  postDownloadCommand: string
}

export interface ProbeResult {
  url: string
  finalUrl: string
  fileName: string
  totalBytes: number | null
  resumable: boolean
  mime?: string
  etag?: string
  lastModified?: string
  kind: DownloadKind
  hlsVariants?: HlsVariant[]
}

export interface HlsVariant {
  url: string
  bandwidth: number
  resolution?: string
  codecs?: string
  audioUrl?: string
  name: string
}

/** Yeni indirme ekleme isteği (arayüzden, tarayıcıdan veya panodan) */
export interface AddRequest {
  url: string
  fileName?: string
  directory?: string
  category?: string
  queueId?: string
  referrer?: string
  headers?: Record<string, string>
  maxConnections?: number
  speedLimit?: number
  checksum?: { algorithm: HashAlgorithm; expected: string }
  start?: boolean
  kind?: DownloadKind
  hls?: { playlistUrl: string; audioUrl?: string; resolution?: string }
  totalBytes?: number | null
  mime?: string
  note?: string
}

/** Tarayıcıdan/panodan gelen, kullanıcı onayı bekleyen istek */
export interface PendingAdd {
  token: string
  source: 'browser' | 'clipboard' | 'manual' | 'protocol'
  request: AddRequest
}

export interface PendingBatch {
  token: string
  source: 'browser' | 'manual'
  items: { url: string; fileName?: string; referrer?: string; headers?: Record<string, string> }[]
  referrer?: string
}

export interface AppState {
  downloads: DownloadItem[]
  settings: Settings
  queues: Queue[]
  platform: string
  version: string
  ffmpegAvailable: boolean
  bridgePort: number | null
}

export interface DownloadPatch {
  id: string
  changes: Partial<DownloadItem>
}
