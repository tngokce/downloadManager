import { useState } from 'react'
import type { DownloadItem, DownloadLive, HashAlgorithm } from '@shared/types'
import { MAX_CONNECTIONS } from '@shared/defaults'
import { formatBytes, formatDuration, formatSpeed, progressOf } from '@shared/format'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { Icon } from '../icons'
import { joinPath } from './AddDialog'
import { Button, NumberInput, SpeedInput, toast } from './ui'

function SegmentBar({ item }: { item: DownloadItem }) {
  const total = item.totalBytes ?? 0
  if (item.hls) {
    const p = progressOf(item) ?? 0
    return (
      <div className="segbar">
        <div className="segbar-fill" style={{ left: 0, width: `${p * 100}%` }} />
      </div>
    )
  }
  if (item.status === 'completed') {
    return (
      <div className="segbar">
        <div className="segbar-fill done" style={{ left: 0, width: '100%' }} />
      </div>
    )
  }
  if (!total || !item.segments.length) {
    return <div className={`segbar ${item.status === 'downloading' ? 'indeterminate' : ''}`} />
  }
  return (
    <div className="segbar">
      {item.segments.map((s, i) => {
        const left = (s.start / total) * 100
        const width = ((Math.min(s.pos, s.end + 1) - s.start) / total) * 100
        const active = s.pos <= s.end && item.status === 'downloading'
        return (
          <div key={i}>
            <div className="segbar-fill" style={{ left: `${left}%`, width: `${width}%` }} />
            {active && <div className="segbar-head" style={{ left: `${left + width}%` }} />}
            {i > 0 && <div className="segbar-split" style={{ left: `${left}%` }} />}
          </div>
        )
      })}
    </div>
  )
}

function SpeedGraph({ samples }: { samples: number[] }) {
  const w = 300
  const h = 64
  const max = Math.max(1, ...samples)
  const n = 120
  const pts = samples.map((v, i) => `${((n - samples.length + i) / (n - 1)) * w},${h - (v / max) * (h - 6) - 2}`)
  return (
    <div className="speedgraph">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h}>
        {pts.length > 1 && (
          <>
            <polygon className="sg-area" points={`${pts[0].split(',')[0]},${h} ${pts.join(' ')} ${w},${h}`} />
            <polyline className="sg-line" points={pts.join(' ')} />
          </>
        )}
      </svg>
      <span className="sg-max">{formatSpeed(max)}</span>
    </div>
  )
}

export function DetailsPanel({ item, live }: { item: DownloadItem; live?: DownloadLive }) {
  const { history, meta } = useStore()
  const { t, err } = useI18n()
  const [algo, setAlgo] = useState<HashAlgorithm>(item.checksum?.algorithm ?? 'sha256')
  const [hash, setHash] = useState<{ id: string; algo: string; value: string } | null>(null)
  const [hashing, setHashing] = useState(false)
  const avg = item.elapsedMs > 0 ? item.downloadedBytes / (item.elapsedMs / 1000) : 0
  const p = progressOf(item)

  const rows: [string, React.ReactNode][] = [
    [t('url'), <span className="mono selectable">{item.url}</span>],
    [t('savedTo'), <span className="selectable">{joinPath(meta.platform, item.directory, item.fileName)}</span>],
    [
      t('size'),
      <>
        {formatBytes(item.downloadedBytes)} / {formatBytes(item.totalBytes)}
        {p != null && ` (${(p * 100).toFixed(1)}%)`}
        {item.hls && ` · ${t('segmentsProgress', { done: item.hls.segmentsDone, total: item.hls.segmentsTotal || '?' })}`}
      </>
    ],
    [t('resumable'), item.kind === 'hls' || item.resumable ? t('yes') : item.totalBytes == null && item.status !== 'completed' ? t('unknown') : t('no')],
    [t('connections'), `${live?.activeConnections ?? 0} / ${item.maxConnections}`],
    [t('elapsed'), formatDuration(item.elapsedMs / 1000)],
    [t('avgSpeed'), formatSpeed(avg)],
    [t('retries'), String(item.retryCount)]
  ]
  if (item.error) rows.push([t('status.failed'), <span className="text-danger">{err(item.error)}</span>])
  if (item.checksum?.expected)
    rows.push([
      t('checksum'),
      <span className={item.checksum.ok === false ? 'text-danger' : item.checksum.ok ? 'text-ok' : ''}>
        {item.checksum.algorithm.toUpperCase()} {item.checksum.ok === undefined ? '…' : item.checksum.ok ? '✓' : '✗'}
      </span>
    ])
  if (item.note) rows.push([t('note'), item.note])

  return (
    <div className="details">
      <div className="details-info">
        {rows.map(([k, v]) => (
          <div className="kv" key={k}>
            <span className="k">{k}</span>
            <span className="v">{v}</span>
          </div>
        ))}
      </div>
      <div className="details-side">
        <div className="details-label">{t('segments')}</div>
        <SegmentBar item={item} />
        <div className="details-label">
          {t('colSpeed')} · {formatSpeed(live?.speed)}
        </div>
        <SpeedGraph samples={history.get(item.id) ?? []} />
        <div className="details-controls">
          <label>
            <span>{t('perDownloadLimit')}</span>
            <SpeedInput value={item.speedLimit} onChange={(v) => void window.api.update(item.id, { speedLimit: v })} unlimitedLabel={t('unlimited')} />
          </label>
          <label>
            <span>{t('connections')}</span>
            <NumberInput value={item.maxConnections} min={1} max={MAX_CONNECTIONS} onChange={(v) => void window.api.update(item.id, { maxConnections: v })} width={70} />
          </label>
          {item.status === 'completed' && (
            <div className="hash-row">
              <select className="input" value={algo} onChange={(e) => setAlgo(e.target.value as HashAlgorithm)} style={{ width: 100 }}>
                <option value="md5">MD5</option>
                <option value="sha1">SHA-1</option>
                <option value="sha256">SHA-256</option>
                <option value="sha512">SHA-512</option>
              </select>
              <Button
                icon="check"
                disabled={hashing}
                onClick={async () => {
                  setHashing(true)
                  try {
                    setHash({ id: item.id, algo, value: await window.api.computeHash(item.id, algo) })
                  } catch (e) {
                    toast(String(e), 'error')
                  } finally {
                    setHashing(false)
                  }
                }}
              >
                {hashing ? '…' : t('computeHash')}
              </Button>
              {hash && hash.id === item.id && (
                <button
                  className="hash-value mono"
                  title={hash.value}
                  onClick={() => {
                    window.api.writeClipboard(hash.value)
                    toast(t('copied'))
                  }}
                >
                  <Icon name="copy" size={12} /> {hash.value}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
