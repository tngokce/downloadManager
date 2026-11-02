import type { Dispatcher } from 'undici'
import type { ProbeResult } from '@shared/types'
import { HttpError, header, httpRequest, discard, parseRetryAfter } from './http'
import { resolveFileName, sanitizeFileName } from './filename'
import { looksLikeHls, parsePlaylist } from './hls'
import { probeFtp } from './ftp'

export interface ProbeOptions {
  headers?: Record<string, string>
  dispatcher: Dispatcher
  signal?: AbortSignal
}

/**
 * Sunucuya "Range: bytes=0-0" ile sorar: boyut, devam ettirme desteği, dosya adı, ETag.
 * HEAD yerine GET kullanılır; birçok sunucu HEAD'e yanlış/eksik yanıt verir.
 */
export async function probe(url: string, opts: ProbeOptions): Promise<ProbeResult> {
  if (url.startsWith('ftp://') || url.startsWith('ftps://')) return probeFtp(url)

  const res = await httpRequest(url, {
    headers: { ...opts.headers, range: 'bytes=0-0' },
    dispatcher: opts.dispatcher,
    signal: opts.signal
  })
  const h = res.headers
  const mime = header(h, 'content-type')?.split(';')[0].trim().toLowerCase()

  if (res.statusCode >= 400) {
    discard(res.body)
    throw new HttpError(res.statusCode, parseRetryAfter(header(h, 'retry-after')))
  }

  let totalBytes: number | null = null
  let resumable = false
  if (res.statusCode === 206) {
    const m = header(h, 'content-range')?.match(/bytes\s+\d+-\d+\/(\d+|\*)/i)
    if (m && m[1] !== '*') {
      totalBytes = Number(m[1])
      resumable = true
    }
  } else {
    const len = header(h, 'content-length')
    totalBytes = len != null && /^\d+$/.test(len) ? Number(len) : null
  }

  const base: ProbeResult = {
    url,
    finalUrl: res.finalUrl,
    fileName: resolveFileName({
      contentDisposition: header(h, 'content-disposition'),
      url,
      finalUrl: res.finalUrl,
      mime
    }),
    totalBytes,
    resumable,
    mime,
    etag: header(h, 'etag'),
    lastModified: header(h, 'last-modified'),
    kind: 'http'
  }

  if (looksLikeHls(res.finalUrl, mime)) {
    discard(res.body)
    return probeHls(base, opts)
  }
  discard(res.body)
  return base
}

async function probeHls(base: ProbeResult, opts: ProbeOptions): Promise<ProbeResult> {
  const res = await httpRequest(base.finalUrl, { headers: opts.headers, dispatcher: opts.dispatcher, signal: opts.signal })
  if (res.statusCode >= 400) {
    discard(res.body)
    throw new HttpError(res.statusCode)
  }
  const text = await res.body.text()
  const playlist = parsePlaylist(text, res.finalUrl)
  const stem = base.fileName.replace(/\.(m3u8?|txt)$/i, '') || 'video'
  const fileName = sanitizeFileName(`${stem}.mp4`)
  if (playlist.type === 'master') {
    return { ...base, kind: 'hls', fileName, totalBytes: null, resumable: true, hlsVariants: playlist.variants }
  }
  return {
    ...base,
    kind: 'hls',
    fileName,
    totalBytes: null,
    resumable: true,
    hlsVariants: [{ url: res.finalUrl, bandwidth: 0, name: 'default' }]
  }
}
