import { useEffect, useMemo, useRef, useState } from 'react'
import type { AddRequest, HashAlgorithm, PendingAdd, ProbeResult, Settings } from '@shared/types'
import { MAX_CONNECTIONS, MAIN_QUEUE_ID } from '@shared/defaults'
import { fileExtension, formatBytes, isHttpUrl } from '@shared/format'
import type { ProbeResponse } from '../../../preload/api'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { Icon, categoryIcon } from '../icons'
import { Button, Field, Modal, NumberInput, SpeedInput } from './ui'

export function joinPath(platform: string, dir: string, name: string): string {
  const sep = platform === 'win32' ? '\\' : '/'
  return dir.endsWith(sep) ? dir + name : dir + sep + name
}

export function categoryFor(settings: Settings, fileName: string): string {
  const ext = fileExtension(fileName)
  return settings.categories.find((c) => c.extensions.includes(ext))?.id ?? 'general'
}

export function directoryFor(settings: Settings, platform: string, categoryId: string): string {
  const cat = settings.categories.find((c) => c.id === categoryId)
  if (cat?.directory) return cat.directory
  if (settings.useCategoryFolders && cat) return joinPath(platform, settings.defaultDirectory, cat.name)
  return settings.defaultDirectory
}

function header(headers: Record<string, string> | undefined, name: string): string {
  if (!headers) return ''
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : ''
}

export function AddDialog({
  initial,
  source,
  page,
  onSubmit,
  onCancel
}: {
  initial: AddRequest
  source?: PendingAdd['source']
  page?: boolean
  onSubmit: (req: AddRequest) => Promise<void> | void
  onCancel: () => void
}) {
  const { settings, queues, meta } = useStore()
  const { t, err, cat, queue } = useI18n()
  const s = settings!

  const [url, setUrl] = useState(initial.url)
  const [fileName, setFileName] = useState(initial.fileName ?? '')
  const [nameEdited, setNameEdited] = useState(!!initial.fileName)
  const [category, setCategory] = useState(initial.category ?? '')
  const [categoryEdited, setCategoryEdited] = useState(!!initial.category)
  const [directory, setDirectory] = useState(initial.directory ?? '')
  const [dirEdited, setDirEdited] = useState(!!initial.directory)
  const [queueId, setQueueId] = useState(initial.queueId ?? MAIN_QUEUE_ID)
  const [connections, setConnections] = useState(initial.maxConnections ?? s.connectionsPerDownload)
  const [speedLimit, setSpeedLimit] = useState(initial.speedLimit ?? 0)
  const [advanced, setAdvanced] = useState(false)
  const [referrer, setReferrer] = useState(initial.referrer ?? '')
  const [cookies, setCookies] = useState(header(initial.headers, 'cookie'))
  const [userAgent, setUserAgent] = useState(header(initial.headers, 'user-agent'))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [hashAlgo, setHashAlgo] = useState<HashAlgorithm>(initial.checksum?.algorithm ?? 'sha256')
  const [hashExpected, setHashExpected] = useState(initial.checksum?.expected ?? '')
  const [note, setNote] = useState(initial.note ?? '')
  const [probe, setProbe] = useState<{ loading: boolean; res?: ProbeResponse }>({ loading: false })
  const [variant, setVariant] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const urlRef = useRef<HTMLInputElement>(null)

  const headers = useMemo(() => {
    const h: Record<string, string> = { ...(initial.headers ?? {}) }
    for (const k of Object.keys(h)) if (/^(cookie|user-agent|authorization)$/i.test(k)) delete h[k]
    if (cookies.trim()) h.Cookie = cookies.trim()
    if (userAgent.trim()) h['User-Agent'] = userAgent.trim()
    if (username) h.Authorization = `Basic ${btoa(unescape(encodeURIComponent(`${username}:${password}`)))}`
    return h
  }, [initial.headers, cookies, userAgent, username, password])

  // Adres veya başlıklar değişince sunucuyu yokla (yazarken her tuşta değil).
  useEffect(() => {
    const target = url.trim()
    if (!isHttpUrl(target)) {
      setProbe({ loading: false })
      return
    }
    let cancelled = false
    setProbe((p) => ({ loading: true, res: p.res }))
    const timer = setTimeout(async () => {
      const h = { ...headers }
      if (referrer) h.Referer = referrer
      const res = await window.api.probe(target, h)
      if (cancelled) return
      setProbe({ loading: false, res })
      const r = res.result
      if (r) {
        if (!nameEdited) setFileName(r.fileName)
        setVariant(0)
      }
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [url, headers, referrer])

  const effectiveCategory = categoryEdited && category ? category : categoryFor(s, fileName || url)
  const effectiveDir = dirEdited && directory ? directory : directoryFor(s, meta.platform, effectiveCategory)
  const result: ProbeResult | undefined = probe.res?.result
  const isHls = result?.kind === 'hls' || initial.kind === 'hls'
  const variants = result?.hlsVariants ?? []
  const validUrl = isHttpUrl(url.trim())

  const submit = async (start: boolean) => {
    if (!validUrl) {
      urlRef.current?.focus()
      return
    }
    setSubmitting(true)
    const v = variants[variant]
    const req: AddRequest = {
      url: url.trim(),
      fileName: fileName.trim() || undefined,
      directory: effectiveDir,
      category: effectiveCategory,
      queueId,
      referrer: referrer.trim() || undefined,
      headers,
      maxConnections: connections,
      speedLimit,
      checksum: hashExpected.trim() ? { algorithm: hashAlgo, expected: hashExpected.trim() } : undefined,
      start,
      totalBytes: result?.totalBytes ?? initial.totalBytes ?? null,
      mime: result?.mime ?? initial.mime,
      note: note.trim() || undefined
    }
    if (isHls) {
      req.kind = 'hls'
      req.hls = v
        ? { playlistUrl: v.url, audioUrl: v.audioUrl, resolution: v.resolution }
        : (initial.hls ?? { playlistUrl: result?.finalUrl ?? url.trim() })
      req.totalBytes = null
    }
    try {
      await onSubmit(req)
    } finally {
      setSubmitting(false)
    }
  }

  const sizeText = isHls ? (variants[variant]?.name ?? t('typeHls')) : result ? formatBytes(result.totalBytes) : initial.totalBytes ? formatBytes(initial.totalBytes) : '—'

  return (
    <Modal
      title={t('newDownload')}
      onClose={onCancel}
      page={page}
      width={620}
      footer={
        <>
          <Button variant="ghost" onClick={() => void submit(false)} disabled={submitting || !validUrl}>
            {t('downloadLater')}
          </Button>
          <div className="spacer" />
          <Button onClick={onCancel}>{t('cancel')}</Button>
          <Button variant="primary" icon="download" onClick={() => void submit(true)} disabled={submitting || !validUrl} autoFocus={!!initial.url}>
            {t('downloadNow')}
          </Button>
        </>
      }
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          void submit(true)
        }}
      >
        <div className="file-card">
          <div className="file-card-icon">
            <Icon name={isHls ? 'video' : categoryIcon(effectiveCategory)} size={26} />
          </div>
          <div className="file-card-body">
            <div className="file-card-name" title={fileName}>
              {fileName || '—'}
            </div>
            <div className="file-card-meta">
              {probe.loading ? (
                <span className="muted">
                  <span className="spinner" /> {t('probing')}
                </span>
              ) : probe.res?.error ? (
                <span className="text-danger">{t('probeFailed', { error: probe.res.error === 'invalidUrl' ? t('invalidUrl') : err(probe.res.error) })}</span>
              ) : (
                <>
                  <span>{sizeText}</span>
                  {result && !isHls && (
                    <span className={`badge ${result.resumable ? 'badge-ok' : 'badge-warn'}`}>
                      {t('resumable')}: {result.resumable ? t('yes') : t('no')}
                    </span>
                  )}
                  {isHls && <span className="badge">{t('typeHls')}</span>}
                  {result?.kind === 'ftp' && <span className="badge">{t('typeFtp')}</span>}
                </>
              )}
              {source === 'browser' && <span className="badge badge-accent">{t('fromBrowser')}</span>}
              {source === 'clipboard' && <span className="badge badge-accent">{t('fromClipboard')}</span>}
            </div>
          </div>
        </div>

        {probe.res?.duplicate && (
          <div className="callout callout-warn">
            <Icon name="alert" size={15} />
            {t('duplicateWarning', { status: t(`status.${probe.res.duplicate.status}`) })}
          </div>
        )}

        <Field label={t('url')}>
          <input
            ref={urlRef}
            className="input mono"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            autoFocus={!initial.url}
            spellCheck={false}
          />
        </Field>

        {isHls && variants.length > 1 && (
          <Field label={t('quality')}>
            <select className="input" value={variant} onChange={(e) => setVariant(Number(e.target.value))}>
              {variants.map((v, i) => (
                <option key={v.url} value={i}>
                  {v.name}
                  {v.codecs ? ` — ${v.codecs}` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t('fileName')}>
          <input
            className="input"
            value={fileName}
            onChange={(e) => {
              setFileName(e.target.value)
              setNameEdited(true)
            }}
            spellCheck={false}
          />
        </Field>

        <Field label={t('saveTo')}>
          <div className="row gap-s">
            <input
              className="input grow"
              value={effectiveDir}
              onChange={(e) => {
                setDirectory(e.target.value)
                setDirEdited(true)
              }}
              spellCheck={false}
            />
            <Button
              icon="folder"
              onClick={async () => {
                const d = await window.api.chooseDirectory(effectiveDir)
                if (d) {
                  setDirectory(d)
                  setDirEdited(true)
                }
              }}
            >
              {t('browse')}
            </Button>
          </div>
        </Field>

        <div className="grid-2">
          <Field label={t('category')}>
            <select
              className="input"
              value={effectiveCategory}
              onChange={(e) => {
                setCategory(e.target.value)
                setCategoryEdited(true)
                setDirEdited(false)
              }}
            >
              {s.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {cat(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('queue')}>
            <select className="input" value={queueId} onChange={(e) => setQueueId(e.target.value)}>
              {queues.map((q) => (
                <option key={q.id} value={q.id}>
                  {queue(q)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <button type="button" className="disclosure" onClick={() => setAdvanced((a) => !a)}>
          <Icon name={advanced ? 'chevronDown' : 'chevronRight'} size={14} /> {t('advanced')}
        </button>

        {advanced && (
          <div className="stack advanced">
            <div className="grid-2">
              <Field label={t('connections')}>
                <NumberInput value={connections} min={1} max={MAX_CONNECTIONS} onChange={setConnections} />
              </Field>
              <Field label={t('perDownloadLimit')}>
                <SpeedInput value={speedLimit} onChange={setSpeedLimit} unlimitedLabel={t('unlimited')} />
              </Field>
            </div>
            <Field label={t('referrer')}>
              <input className="input mono" value={referrer} onChange={(e) => setReferrer(e.target.value)} spellCheck={false} />
            </Field>
            <Field label={t('cookies')}>
              <textarea className="input mono" rows={2} value={cookies} onChange={(e) => setCookies(e.target.value)} spellCheck={false} />
            </Field>
            <Field label={t('userAgent')}>
              <input className="input mono" value={userAgent} placeholder={s.userAgent} onChange={(e) => setUserAgent(e.target.value)} spellCheck={false} />
            </Field>
            <div className="grid-2">
              <Field label={t('username')}>
                <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
              </Field>
              <Field label={t('password')}>
                <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
              </Field>
            </div>
            <Field label={t('expectedHash')}>
              <div className="row gap-s">
                <select className="input" style={{ width: 110 }} value={hashAlgo} onChange={(e) => setHashAlgo(e.target.value as HashAlgorithm)}>
                  <option value="md5">MD5</option>
                  <option value="sha1">SHA-1</option>
                  <option value="sha256">SHA-256</option>
                  <option value="sha512">SHA-512</option>
                </select>
                <input
                  className="input mono grow"
                  value={hashExpected}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    setHashExpected(v)
                    const guess = ({ 32: 'md5', 40: 'sha1', 64: 'sha256', 128: 'sha512' } as Record<number, HashAlgorithm>)[v.length]
                    if (guess && /^[0-9a-f]+$/i.test(v)) setHashAlgo(guess)
                  }}
                  spellCheck={false}
                />
              </div>
            </Field>
            <Field label={t('note')}>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  )
}
