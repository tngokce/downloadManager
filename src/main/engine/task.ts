import type { Dispatcher } from 'undici'
import type { DownloadItem } from '@shared/types'
import type { SpeedLimiter } from './throttle'

export interface EngineConfig {
  dispatcher: Dispatcher
  globalLimiter: SpeedLimiter
  /** Ardışık başarısız deneme sınırı; 0 = sonsuz */
  maxRetries: number
  retryDelayMs: number
  minSegmentSize: number
  userAgent: string
  /** Bitmiş dosya varsa üzerine yaz (false ise yeni ad bulunur) */
  overwrite: boolean
  ffmpegPath?: string | null
  hlsRemux?: boolean
  /** Uyarılar ve tanılama satırları için */
  log?: (id: string, message: string) => void
}

export type TaskResult = 'completed' | 'paused'

export interface DownloadTask {
  /** İndirmeyi çalıştırır; tamamlanınca veya duraklatılınca döner, kalıcı hatada fırlatır. */
  run(): Promise<TaskResult>
  pause(): void
  setSpeedLimit(bytesPerSecond: number): void
  readonly activeConnections: number
  /** Bu çalıştırmada ağdan alınan toplam bayt (hız ölçümü için) */
  readonly receivedBytes: number
}

/** Tekrar denemenin anlamsız olduğu hata (ör. 401, disk dolu, bağlantı süresi dolmuş) */
export class FatalDownloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FatalDownloadError'
  }
}

export function backoffMs(base: number, attempt: number): number {
  const exp = Math.min(base * 2 ** Math.min(attempt, 5), 60_000)
  return exp * (0.75 + Math.random() * 0.5)
}

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || (err as { code?: string }).code === 'ABORT_ERR' || err.name === 'RequestAbortedError')
}

/** Disk dolu / izin yok gibi tekrar denemeyle düzelmeyecek dosya sistemi hataları */
export function isFatalFsError(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'ENOSPC' || code === 'EACCES' || code === 'EPERM' || code === 'EROFS' || code === 'ENAMETOOLONG' || code === 'EDQUOT'
}

export function requestHeaders(item: DownloadItem, userAgent: string): Record<string, string> {
  const h: Record<string, string> = { 'user-agent': userAgent, accept: '*/*' }
  if (item.referrer) h.referer = item.referrer
  for (const [k, v] of Object.entries(item.headers)) if (v) h[k.toLowerCase()] = v
  return h
}
