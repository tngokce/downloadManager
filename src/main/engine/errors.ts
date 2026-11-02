import { HttpError } from './http'
import { FatalDownloadError } from './task'

/**
 * Hataları arayüzün çevirebileceği kodlara dönüştürür: "kod" veya "kod:ayrıntı".
 * Kodlar: auth, expired, changed, diskFull, permission, tls, drm, ffmpeg, rangeRejected,
 * http:<durum>, net:<sistem kodu>
 */
export function errorCode(err: unknown): string {
  if (err instanceof FatalDownloadError) return err.message
  if (err instanceof HttpError) {
    if (err.statusCode === 401 || err.statusCode === 407) return 'auth'
    if (err.statusCode === 403 || err.statusCode === 410) return `expired:${err.statusCode}`
    return `http:${err.statusCode}`
  }
  const e = err as { code?: string; message?: string; cause?: { code?: string } }
  const code = e?.code ?? e?.cause?.code
  if (code === 'ENOSPC' || code === 'EDQUOT') return 'diskFull'
  if (code === 'EACCES' || code === 'EPERM' || code === 'EROFS') return 'permission'
  if (code && /CERT|SSL|TLS|SELF_SIGNED/i.test(code)) return `tls:${code}`
  if (code) return `net:${code}`
  return `net:${e?.message ?? String(err)}`
}

export function fatal(code: string): FatalDownloadError {
  return new FatalDownloadError(code)
}
