import { existsSync } from 'node:fs'
import { rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { DownloadItem } from '@shared/types'

const MIME_EXT: Record<string, string> = {
  'application/zip': 'zip',
  'application/x-zip-compressed': 'zip',
  'application/x-rar-compressed': 'rar',
  'application/vnd.rar': 'rar',
  'application/x-7z-compressed': '7z',
  'application/gzip': 'gz',
  'application/x-tar': 'tar',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/x-msdownload': 'exe',
  'application/x-msi': 'msi',
  'application/x-apple-diskimage': 'dmg',
  'application/vnd.android.package-archive': 'apk',
  'application/x-iso9660-image': 'iso',
  'application/json': 'json',
  'application/epub+zip': 'epub',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/flac': 'flac',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/mp2t': 'ts',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'text/csv': 'csv'
}

export function extensionForMime(mime: string | undefined): string | undefined {
  if (!mime) return undefined
  return MIME_EXT[mime.split(';')[0].trim().toLowerCase()]
}

/** Sunucunun latin1 olarak gönderdiği UTF-8 baytlarını düzeltir ("TÃ¼rkÃ§e" -> "Türkçe"). */
function fixMojibake(s: string): string {
  if (!/[\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s
  const decoded = Buffer.from(s, 'latin1').toString('utf8')
  return decoded.includes('�') ? s : decoded
}

export function parseContentDisposition(value: string | undefined): string | undefined {
  if (!value) return undefined
  // RFC 5987: filename*=UTF-8''dosya%20adi.zip
  const star = value.match(/filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i)
  if (star) {
    try {
      const charset = star[1].toLowerCase()
      const raw = star[2].trim().replace(/^"|"$/g, '')
      if (charset === 'utf-8' || charset === '') return decodeURIComponent(raw)
      return unescape(raw)
    } catch {
      /* düz filename'e düş */
    }
  }
  const quoted = value.match(/filename\s*=\s*"((?:\\"|[^"])*)"/i)
  if (quoted) return fixMojibake(quoted[1].replace(/\\"/g, '"'))
  const plain = value.match(/filename\s*=\s*([^;]+)/i)
  if (plain) return fixMojibake(plain[1].trim())
  return undefined
}

export function fileNameFromUrl(url: string): string | undefined {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop()
    if (!last) return undefined
    return decodeURIComponent(last)
  } catch {
    return undefined
  }
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i

/** Windows ve macOS'ta geçerli, güvenli bir dosya adı üretir. */
export function sanitizeFileName(name: string): string {
  let out = name
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/^[\s.]+/, '')
    .replace(/[\s.]+$/, '')
    .trim()
  if (!out) out = 'download'
  if (WINDOWS_RESERVED.test(out)) out = `_${out}`
  // Çoğu dosya sisteminde 255 bayt sınırı; uzantıyı koruyarak kısalt.
  while (Buffer.byteLength(out) > 200) {
    const dot = out.lastIndexOf('.')
    const ext = dot > 0 && out.length - dot <= 12 ? out.slice(dot) : ''
    const base = ext ? out.slice(0, dot) : out
    out = base.slice(0, base.length - 1) + ext
  }
  return out
}

export function ensureExtension(name: string, mime: string | undefined): string {
  if (/\.[a-z0-9]{1,8}$/i.test(name)) return name
  const ext = extensionForMime(mime)
  return ext ? `${name}.${ext}` : name
}

export function resolveFileName(opts: { contentDisposition?: string; url: string; finalUrl?: string; mime?: string }): string {
  const raw =
    parseContentDisposition(opts.contentDisposition) ??
    (opts.finalUrl ? fileNameFromUrl(opts.finalUrl) : undefined) ??
    fileNameFromUrl(opts.url) ??
    'download'
  return sanitizeFileName(ensureExtension(raw, opts.mime))
}

export const PART_SUFFIX = '.dmpart'

/** Klasörde (ve devam eden indirmelerde) çakışmayan bir ad bulur: "dosya (1).zip" */
export function uniqueFileName(directory: string, name: string, taken: Set<string> = new Set()): string {
  const isFree = (n: string) =>
    !taken.has(n.toLowerCase()) && !existsSync(join(directory, n)) && !existsSync(join(directory, n + PART_SUFFIX))
  if (isFree(name)) return name
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  for (let i = 1; i < 10000; i++) {
    const candidate = `${base} (${i})${ext}`
    if (isFree(candidate)) return candidate
  }
  return `${base} (${Date.now()})${ext}`
}

/** .dmpart dosyasını son adına taşır; ad doluysa ayara göre üzerine yazar veya yeni ad bulur. */
export async function finalizePartFile(item: DownloadItem, overwrite: boolean): Promise<string> {
  const part = join(item.directory, item.fileName + PART_SUFFIX)
  let name = item.fileName
  if (existsSync(join(item.directory, name))) {
    if (overwrite) {
      await rm(join(item.directory, name), { force: true })
    } else {
      const dot = name.lastIndexOf('.')
      const base = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      for (let i = 1; existsSync(join(item.directory, name)); i++) name = `${base} (${i})${ext}`
    }
  }
  await rename(part, join(item.directory, name))
  return name
}
