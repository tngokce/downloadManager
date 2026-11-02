import { memo } from 'react'
import type { DownloadItem, DownloadLive } from '@shared/types'
import { formatBytes, formatDuration, formatSpeed, progressOf } from '@shared/format'
import type { I18nKey } from '@shared/i18n'
import { useI18n } from '../i18n'
import { Icon, categoryIcon } from '../icons'

export type SortKey = 'name' | 'size' | 'progress' | 'speed' | 'eta' | 'status' | 'added'
export interface Sort {
  key: SortKey
  dir: 1 | -1
}

const STATUS_RANK: Record<DownloadItem['status'], number> = {
  downloading: 0,
  connecting: 1,
  merging: 2,
  verifying: 3,
  queued: 4,
  paused: 5,
  failed: 6,
  completed: 7
}

export function sortItems(items: DownloadItem[], sort: Sort, live: Map<string, DownloadLive>): DownloadItem[] {
  const val = (i: DownloadItem): number | string => {
    switch (sort.key) {
      case 'name':
        return i.fileName.toLowerCase()
      case 'size':
        return i.totalBytes ?? -1
      case 'progress':
        return progressOf(i) ?? -1
      case 'speed':
        return live.get(i.id)?.speed ?? 0
      case 'eta':
        return live.get(i.id)?.eta ?? Number.MAX_SAFE_INTEGER
      case 'status':
        return STATUS_RANK[i.status]
      case 'added':
        return i.createdAt
    }
  }
  return [...items].sort((a, b) => {
    const x = val(a)
    const y = val(b)
    if (x < y) return -sort.dir
    if (x > y) return sort.dir
    return a.order - b.order
  })
}

function formatDate(ts: number, lang: string): string {
  const d = new Date(ts)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(lang, { day: '2-digit', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

const Row = memo(function Row({
  item,
  live,
  selected,
  onMouseDown,
  onDoubleClick,
  onContextMenu
}: {
  item: DownloadItem
  live?: DownloadLive
  selected: boolean
  onMouseDown: (e: React.MouseEvent, id: string) => void
  onDoubleClick: (id: string) => void
  onContextMenu: (e: React.MouseEvent, id: string) => void
}) {
  const { t, err, lang } = useI18n()
  const p = progressOf(item)
  const active = item.status === 'downloading' || item.status === 'connecting'
  return (
    <div
      className={`tr status-${item.status}${selected ? ' selected' : ''}`}
      onMouseDown={(e) => onMouseDown(e, item.id)}
      onDoubleClick={() => onDoubleClick(item.id)}
      onContextMenu={(e) => onContextMenu(e, item.id)}
      role="row"
      aria-selected={selected}
    >
      <div className="td td-name" title={item.fileName}>
        <span className="file-icon">
          <Icon name={item.kind === 'hls' ? 'video' : categoryIcon(item.category)} size={16} />
        </span>
        <span className="name-stack">
          <span className="name">{item.fileName}</span>
          {item.status === 'failed' && item.error && <span className="sub text-danger">{err(item.error)}</span>}
        </span>
      </div>
      <div className="td td-num">{formatBytes(item.totalBytes)}</div>
      <div className="td td-progress">
        <div className={`progress ${item.status === 'completed' ? 'done' : ''} ${item.status === 'failed' ? 'failed' : ''} ${p == null && active ? 'indeterminate' : ''}`}>
          <div className="progress-fill" style={{ width: `${(p ?? 0) * 100}%` }} />
        </div>
        <span className="pct">{p == null ? (item.downloadedBytes ? formatBytes(item.downloadedBytes) : '') : `${(p * 100).toFixed(p < 0.1 ? 1 : 0)}%`}</span>
      </div>
      <div className="td td-num">{live ? formatSpeed(live.speed) : ''}</div>
      <div className="td td-num">{live && live.eta != null ? formatDuration(live.eta) : ''}</div>
      <div className="td">
        <span className={`pill pill-${item.status}`}>{t(`status.${item.status}` as I18nKey)}</span>
      </div>
      <div className="td td-num muted">{formatDate(item.createdAt, lang)}</div>
    </div>
  )
})

export function DownloadTable({
  items,
  live,
  selected,
  sort,
  onSort,
  onRowMouseDown,
  onRowDoubleClick,
  onRowContextMenu,
  onBackgroundClick,
  empty
}: {
  items: DownloadItem[]
  live: Map<string, DownloadLive>
  selected: Set<string>
  sort: Sort
  onSort: (key: SortKey) => void
  onRowMouseDown: (e: React.MouseEvent, id: string) => void
  onRowDoubleClick: (id: string) => void
  onRowContextMenu: (e: React.MouseEvent, id: string) => void
  onBackgroundClick: () => void
  empty: React.ReactNode
}) {
  const { t } = useI18n()
  const cols: [SortKey, I18nKey, string][] = [
    ['name', 'colName', ''],
    ['size', 'colSize', 'num'],
    ['progress', 'colProgress', ''],
    ['speed', 'colSpeed', 'num'],
    ['eta', 'colEta', 'num'],
    ['status', 'colStatus', ''],
    ['added', 'colAdded', 'num']
  ]
  return (
    <div className="table" role="grid">
      <div className="thead" role="row">
        {cols.map(([key, label, cls]) => (
          <button key={key} className={`th ${cls} ${sort.key === key ? 'sorted' : ''}`} onClick={() => onSort(key)}>
            <span>{t(label)}</span>
            {sort.key === key && <Icon name="chevronDown" size={12} style={{ transform: sort.dir === 1 ? 'rotate(180deg)' : undefined }} />}
          </button>
        ))}
      </div>
      <div className="tbody" onMouseDown={(e) => e.target === e.currentTarget && onBackgroundClick()}>
        {items.length === 0
          ? empty
          : items.map((item) => (
              <Row
                key={item.id}
                item={item}
                live={live.get(item.id)}
                selected={selected.has(item.id)}
                onMouseDown={onRowMouseDown}
                onDoubleClick={onRowDoubleClick}
                onContextMenu={onRowContextMenu}
              />
            ))}
      </div>
    </div>
  )
}
