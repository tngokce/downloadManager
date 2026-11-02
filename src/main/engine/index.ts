import type { DownloadItem } from '@shared/types'
import { FtpDownloader } from './ftp'
import { HlsDownloader } from './hls'
import { HttpDownloader } from './HttpDownloader'
import type { DownloadTask, EngineConfig } from './task'

export function createTask(item: DownloadItem, cfg: EngineConfig): DownloadTask {
  switch (item.kind) {
    case 'hls':
      return new HlsDownloader(item, cfg)
    case 'ftp':
      return new FtpDownloader(item, cfg)
    default:
      return new HttpDownloader(item, cfg)
  }
}

export { probe } from './probe'
export { createDispatcher } from './http'
export { SpeedLimiter } from './throttle'
export { hashFile, guessAlgorithm } from './checksum'
export { errorCode } from './errors'
export { runProcess } from './hls'
export { PART_SUFFIX, resolveFileName, sanitizeFileName, uniqueFileName } from './filename'
export type { DownloadTask, EngineConfig } from './task'
