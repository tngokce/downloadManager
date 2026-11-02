import type { Category, Queue, Settings } from './types'

export const MAIN_QUEUE_ID = 'main'
export const SCHEDULED_QUEUE_ID = 'scheduled'
export const DEFAULT_BRIDGE_PORT = 53771
export const MAX_CONNECTIONS = 32

export const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'

export const DEFAULT_CATEGORIES: Category[] = [
  {
    id: 'compressed',
    name: 'Compressed',
    builtin: true,
    directory: '',
    extensions: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz', 'tgz', 'zst', 'iso', 'img', 'cab', 'arj', 'lz', 'lzh']
  },
  {
    id: 'documents',
    name: 'Documents',
    builtin: true,
    directory: '',
    extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'txt', 'rtf', 'csv', 'epub', 'mobi', 'pages', 'numbers', 'key']
  },
  {
    id: 'music',
    name: 'Music',
    builtin: true,
    directory: '',
    extensions: ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'aif', 'aiff', 'mid', 'midi']
  },
  {
    id: 'video',
    name: 'Video',
    builtin: true,
    directory: '',
    extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg', '3gp', 'ts', 'm2ts', 'vob', 'ogv']
  },
  {
    id: 'programs',
    name: 'Programs',
    builtin: true,
    directory: '',
    extensions: ['exe', 'msi', 'msix', 'appx', 'dmg', 'pkg', 'app', 'deb', 'rpm', 'apk', 'appimage', 'bat', 'jar']
  },
  {
    id: 'images',
    name: 'Images',
    builtin: true,
    directory: '',
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'svg', 'heic', 'raw', 'psd', 'ico']
  },
  { id: 'general', name: 'General', builtin: true, directory: '', extensions: [] }
]

export const DEFAULT_QUEUES: Queue[] = [
  {
    id: MAIN_QUEUE_ID,
    name: 'Main queue',
    builtin: true,
    running: true,
    maxConcurrent: 0,
    onComplete: 'none',
    schedule: { enabled: false, startTime: '02:00', stopTime: '', days: [] }
  },
  {
    id: SCHEDULED_QUEUE_ID,
    name: 'Scheduled',
    builtin: true,
    running: false,
    maxConcurrent: 2,
    onComplete: 'none',
    schedule: { enabled: true, startTime: '02:00', stopTime: '08:00', days: [] }
  }
]

/** Tarayıcı eklentisinin varsayılan olarak yakalayacağı uzantılar */
export const DEFAULT_INTERCEPT_EXTENSIONS = Array.from(
  new Set(
    DEFAULT_CATEGORIES.filter((c) => c.id !== 'images' && c.id !== 'general')
      .flatMap((c) => c.extensions)
      .filter((e) => !['txt', 'csv', 'svg', 'app', 'bat', 'ts'].includes(e))
  )
)

export function createDefaultSettings(downloadsDir: string, language: Settings['language'] = 'tr'): Settings {
  return {
    language,
    theme: 'system',
    defaultDirectory: downloadsDir,
    useCategoryFolders: false,
    categories: structuredClone(DEFAULT_CATEGORIES),
    maxConcurrentDownloads: 3,
    connectionsPerDownload: 8,
    minSegmentSize: 512 * 1024,
    maxRetries: 0,
    retryDelaySec: 3,
    connectTimeoutSec: 20,
    readTimeoutSec: 30,
    speedLimitEnabled: false,
    globalSpeedLimit: 2 * 1024 * 1024,
    userAgent: DEFAULT_USER_AGENT,
    proxy: { mode: 'system', protocol: 'http', host: '', port: 8080, username: '', password: '' },
    duplicateAction: 'rename',
    autoStart: true,
    resumeOnStartup: true,
    browser: {
      enabled: true,
      port: DEFAULT_BRIDGE_PORT,
      interceptExtensions: DEFAULT_INTERCEPT_EXTENSIONS,
      minSizeKB: 0,
      excludedSites: [],
      showAddDialog: true,
      videoButton: true
    },
    clipboardMonitor: true,
    notifications: true,
    soundOnComplete: true,
    startAtLogin: false,
    startMinimized: false,
    closeToTray: true,
    preventSleep: true,
    verifyTls: true,
    ffmpegPath: '',
    hlsRemux: true,
    postDownloadCommand: ''
  }
}

/** Kayıtlı ayarları varsayılanlarla birleştirir; yeni sürümde eklenen alanlar eksik kalmaz. */
export function mergeSettings(defaults: Settings, saved: Partial<Settings> | undefined): Settings {
  if (!saved) return defaults
  return {
    ...defaults,
    ...saved,
    proxy: { ...defaults.proxy, ...saved.proxy },
    browser: { ...defaults.browser, ...saved.browser },
    categories: saved.categories?.length ? saved.categories : defaults.categories
  }
}
