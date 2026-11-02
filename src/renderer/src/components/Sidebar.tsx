import type { DownloadItem } from '@shared/types'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { Icon, categoryIcon, type IconName } from '../icons'

export type Filter =
  | { type: 'all' }
  | { type: 'status'; value: 'active' | 'completed' | 'unfinished' | 'failed' }
  | { type: 'category'; id: string }
  | { type: 'queue'; id: string }

const ACTIVE = new Set(['connecting', 'downloading', 'verifying', 'merging'])

export function matchesFilter(item: DownloadItem, f: Filter): boolean {
  switch (f.type) {
    case 'all':
      return true
    case 'status':
      if (f.value === 'active') return ACTIVE.has(item.status)
      if (f.value === 'completed') return item.status === 'completed'
      if (f.value === 'failed') return item.status === 'failed'
      return item.status !== 'completed'
    case 'category':
      return item.category === f.id
    case 'queue':
      return item.queueId === f.id && item.status !== 'completed'
  }
}

export function sameFilter(a: Filter, b: Filter): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function Sidebar({ filter, onChange }: { filter: Filter; onChange: (f: Filter) => void }) {
  const { downloads, settings, queues } = useStore()
  const { t, cat, queue } = useI18n()
  const list = [...downloads.values()]
  const count = (f: Filter) => list.filter((i) => matchesFilter(i, f)).length

  const Item = ({ f, icon, label, extra }: { f: Filter; icon: IconName; label: string; extra?: React.ReactNode }) => {
    const n = count(f)
    return (
      <button className={`side-item ${sameFilter(filter, f) ? 'active' : ''}`} onClick={() => onChange(f)}>
        <Icon name={icon} size={15} />
        <span className="side-label">{label}</span>
        {extra}
        {n > 0 && <span className="side-count">{n}</span>}
      </button>
    )
  }

  return (
    <aside className="sidebar">
      <div className="side-group">
        <Item f={{ type: 'all' }} icon="inbox" label={t('all')} />
        <Item f={{ type: 'status', value: 'active' }} icon="download" label={t('filterActive')} />
        <Item f={{ type: 'status', value: 'unfinished' }} icon="clock" label={t('filterUnfinished')} />
        <Item f={{ type: 'status', value: 'completed' }} icon="check" label={t('filterCompleted')} />
        <Item f={{ type: 'status', value: 'failed' }} icon="alert" label={t('filterFailed')} />
      </div>
      <div className="side-title">{t('categories')}</div>
      <div className="side-group">
        {settings?.categories.map((c) => (
          <Item key={c.id} f={{ type: 'category', id: c.id }} icon={categoryIcon(c.id)} label={cat(c)} />
        ))}
      </div>
      <div className="side-title">{t('queues')}</div>
      <div className="side-group">
        {queues.map((q) => (
          <Item key={q.id} f={{ type: 'queue', id: q.id }} icon="list" label={queue(q)} extra={<span className={`dot ${q.running ? 'dot-on' : ''}`} />} />
        ))}
      </div>
    </aside>
  )
}
