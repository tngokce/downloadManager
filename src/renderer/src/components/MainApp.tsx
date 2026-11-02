import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AddRequest, DownloadItem, PendingBatch, PostAction } from '@shared/types'
import { MAIN_QUEUE_ID } from '@shared/defaults'
import { formatSpeed, isHttpUrl } from '@shared/format'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { Icon, type IconName } from '../icons'
import { AddDialog } from './AddDialog'
import { BatchDialog } from './BatchDialog'
import { SettingsDialog } from './SettingsDialog'
import { SchedulerDialog } from './SchedulerDialog'
import { ConfirmDeleteDialog, PostActionDialog, RefreshAddressDialog } from './SmallDialogs'
import { DetailsPanel } from './DetailsPanel'
import { DownloadTable, sortItems, type Sort, type SortKey } from './DownloadTable'
import { Sidebar, matchesFilter, type Filter } from './Sidebar'
import { ContextMenu, Toasts, playDoneSound, toast, type MenuItem } from './ui'

type Dialog =
  | { type: 'add'; initial: AddRequest }
  | { type: 'batch'; batch?: PendingBatch | null; urls?: string[] }
  | { type: 'settings' }
  | { type: 'scheduler' }
  | { type: 'delete'; ids: string[]; withFiles: boolean }
  | { type: 'refresh'; id: string }
  | { type: 'post'; action: PostAction; seconds: number }

const ACTIVE = new Set(['connecting', 'downloading', 'verifying', 'merging'])
const isMac = navigator.userAgent.includes('Mac')

function ToolButton({ icon, label, onClick, disabled, active, title }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; active?: boolean; title?: string }) {
  return (
    <button className={`tool${active ? ' active' : ''}`} onClick={onClick} disabled={disabled} title={title ?? label}>
      <Icon name={icon} size={17} />
      <span className="tool-label">{label}</span>
    </button>
  )
}

export function MainApp() {
  const { downloads, live, settings, queues, meta } = useStore()
  const { t, queue } = useI18n()
  const [filter, setFilter] = useState<Filter>({ type: 'all' })
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'added', dir: -1 })
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [anchor, setAnchor] = useState<string | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const all = useMemo(() => [...downloads.values()], [downloads])
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = all.filter((i) => matchesFilter(i, filter) && (!q || i.fileName.toLowerCase().includes(q) || i.url.toLowerCase().includes(q)))
    return sortItems(filtered, sort, live)
  }, [all, filter, search, sort, live])

  const selectedItems = useMemo(() => visible.filter((i) => selected.has(i.id)), [visible, selected])
  const single = selectedItems.length === 1 ? selectedItems[0] : null
  const ids = selectedItems.map((i) => i.id)
  const canStart = selectedItems.some((i) => i.status === 'paused' || i.status === 'failed')
  const canPause = selectedItems.some((i) => i.status === 'queued' || ACTIVE.has(i.status))
  const mainQueue = queues.find((q) => q.id === MAIN_QUEUE_ID)
  const totalSpeed = [...live.values()].reduce((s, l) => s + l.speed, 0)
  const activeCount = all.filter((i) => ACTIVE.has(i.status)).length

  // Seçili ama artık listede olmayanları temizle
  useEffect(() => {
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => downloads.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [downloads])

  const openAdd = useCallback(async (url?: string) => {
    const clip = url ?? (await window.api.readClipboardUrl()) ?? ''
    setDialog({ type: 'add', initial: { url: clip } })
  }, [])

  const handleUrls = useCallback(
    (text: string) => {
      const urls = text
        .split(/[\r\n\s]+/)
        .map((s) => s.trim())
        .filter(isHttpUrl)
      if (urls.length === 1) void openAdd(urls[0])
      else if (urls.length > 1) setDialog({ type: 'batch', urls })
    },
    [openAdd]
  )

  // Ana süreçten gelen komutlar
  useEffect(() => {
    const offs = [
      window.api.onCommand((c) => {
        if (c.type === 'sound') playDoneSound()
        else if (c.type === 'addUrl') void openAdd()
        else if (c.type === 'batch') setDialog({ type: 'batch' })
        else setDialog({ type: c.type })
      }),
      window.api.onShowBatch(async (token) => {
        const batch = await window.api.getPendingBatch(token)
        if (batch) setDialog({ type: 'batch', batch })
      }),
      window.api.onPostAction((p) => setDialog({ type: 'post', ...p }))
    ]
    return () => offs.forEach((o) => o())
  }, [openAdd])

  // Klavye kısayolları
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement
      if (dialog || menu) return
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        if (e.shiftKey) setDialog({ type: 'batch' })
        else void openAdd()
      } else if (mod && e.key === ',') {
        e.preventDefault()
        setDialog({ type: 'settings' })
      } else if (mod && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (typing) {
        return
      } else if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        setSelected(new Set(visible.map((i) => i.id)))
      } else if ((e.key === 'Delete' || (isMac && e.key === 'Backspace')) && ids.length) {
        e.preventDefault()
        setDialog({ type: 'delete', ids, withFiles: e.shiftKey })
      } else if (e.key === ' ' && ids.length) {
        e.preventDefault()
        if (canPause) void window.api.pause(ids)
        else if (canStart) void window.api.start(ids)
      } else if (e.key === 'Enter' && single) {
        void window.api.openFile(single.id)
      } else if (e.key === 'Escape') {
        setSelected(new Set())
      } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && visible.length) {
        e.preventDefault()
        const idx = visible.findIndex((i) => i.id === anchor)
        const next = visible[Math.max(0, Math.min(visible.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))]
        setSelected(new Set([next.id]))
        setAnchor(next.id)
      }
    }
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (dialog || target.closest('input, textarea')) return
      const text = e.clipboardData?.getData('text') ?? ''
      if (text) handleUrls(text)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [dialog, menu, visible, ids, canPause, canStart, single, anchor, openAdd, handleUrls])

  const onRowMouseDown = useCallback(
    (e: React.MouseEvent, id: string) => {
      if (e.button === 2 && selected.has(id)) return
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (e.shiftKey && anchor) {
        const a = visible.findIndex((i) => i.id === anchor)
        const b = visible.findIndex((i) => i.id === id)
        const [from, to] = a < b ? [a, b] : [b, a]
        setSelected(new Set(visible.slice(from, to + 1).map((i) => i.id)))
        return
      }
      if (mod) {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      } else setSelected(new Set([id]))
      setAnchor(id)
    },
    [anchor, visible, selected]
  )

  const onRowDoubleClick = useCallback((id: string) => {
    const item = downloads.get(id)
    if (!item) return
    if (item.status === 'completed') void window.api.openFile(id)
    else if (item.status === 'paused' || item.status === 'failed') void window.api.start([id])
    else void window.api.pause([id])
  }, [downloads])

  const contextItems = useCallback(
    (items: DownloadItem[]): MenuItem[] => {
      const list = items.map((i) => i.id)
      const one = items.length === 1 ? items[0] : null
      const startable = items.some((i) => i.status === 'paused' || i.status === 'failed')
      const pausable = items.some((i) => i.status === 'queued' || ACTIVE.has(i.status))
      return [
        { label: t('open'), icon: 'file', disabled: !one || one.status !== 'completed', onClick: () => one && void window.api.openFile(one.id) },
        { label: t('showInFolder'), icon: 'folder', disabled: !one, onClick: () => one && void window.api.showInFolder(one.id) },
        { separator: true },
        { label: t('start'), icon: 'play', disabled: !startable, onClick: () => void window.api.start(list) },
        { label: t('pause'), icon: 'pause', disabled: !pausable, onClick: () => void window.api.pause(list) },
        { label: t('redownload'), icon: 'refresh', disabled: !one, onClick: () => one && void window.api.redownload(one.id) },
        { label: t('refreshAddress'), icon: 'link', disabled: !one || one.status === 'completed', onClick: () => one && setDialog({ type: 'refresh', id: one.id }) },
        {
          label: t('copyUrl'),
          icon: 'copy',
          onClick: () => {
            window.api.writeClipboard(items.map((i) => i.url).join('\n'))
            toast(t('copied'))
          }
        },
        {
          label: t('moveToQueue'),
          icon: 'list',
          submenu: queues.map((q) => ({
            label: queue(q),
            checked: items.every((i) => i.queueId === q.id),
            onClick: () => void window.api.moveToQueue(list, q.id)
          }))
        },
        { separator: true },
        { label: t('delete'), icon: 'trash', onClick: () => setDialog({ type: 'delete', ids: list, withFiles: false }) },
        { label: t('deleteWithFile'), icon: 'trash', danger: true, disabled: !items.some((i) => i.status === 'completed'), onClick: () => setDialog({ type: 'delete', ids: list, withFiles: true }) }
      ]
    },
    [t, queues, queue]
  )

  const onRowContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault()
      const sel = selected.has(id) ? visible.filter((i) => selected.has(i.id)) : [downloads.get(id)!]
      if (!selected.has(id)) {
        setSelected(new Set([id]))
        setAnchor(id)
      }
      setMenu({ x: e.clientX, y: e.clientY, items: contextItems(sel) })
    },
    [selected, visible, downloads, contextItems]
  )

  const onSort = useCallback((key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: key === 'name' || key === 'status' ? 1 : -1 })), [])

  const postActionMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const acts: PostAction[] = ['none', 'sleep', 'shutdown', 'quit']
    setMenu({
      x: r.left,
      y: r.bottom + 4,
      items: acts.map((a) => ({
        label: t(`post.${a}`),
        checked: mainQueue?.onComplete === a,
        onClick: () => mainQueue && void window.api.setQueue({ ...mainQueue, onComplete: a })
      }))
    })
  }

  if (!settings) return null

  const empty = (
    <div className="empty">
      <Icon name="download" size={40} />
      <h3>{all.length ? t('noMatches') : t('emptyTitle')}</h3>
      {!all.length && <p>{t('emptyBody')}</p>}
      {!all.length && (
        <button className="btn btn-primary" onClick={() => void openAdd()}>
          <Icon name="plus" size={15} /> {t('addUrl')}
        </button>
      )}
    </div>
  )

  return (
    <div
      className={`app ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('text/uri-list') || e.dataTransfer.types.includes('text/plain')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        handleUrls(e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain'))
      }}
    >
      <header className="toolbar">
        <div className="toolbar-group">
          <ToolButton icon="plus" label={t('addUrl')} onClick={() => void openAdd()} title={`${t('addUrl')} (${isMac ? '⌘' : 'Ctrl+'}N)`} />
          <ToolButton icon="layers" label={t('batch')} onClick={() => setDialog({ type: 'batch' })} />
        </div>
        <div className="toolbar-sep" />
        <div className="toolbar-group">
          <ToolButton icon="play" label={t('resume')} disabled={!canStart} onClick={() => void window.api.start(ids)} />
          <ToolButton icon="pause" label={t('pause')} disabled={!canPause} onClick={() => void window.api.pause(ids)} />
          <ToolButton icon="playAll" label={t('startAll')} onClick={() => void window.api.startAll()} />
          <ToolButton icon="stop" label={t('pauseAll')} disabled={!activeCount && !all.some((i) => i.status === 'queued')} onClick={() => void window.api.pauseAll()} />
        </div>
        <div className="toolbar-sep" />
        <div className="toolbar-group">
          <ToolButton icon="trash" label={t('delete')} disabled={!ids.length} onClick={() => setDialog({ type: 'delete', ids, withFiles: false })} />
          <ToolButton icon="broom" label={t('clearCompleted')} disabled={!all.some((i) => i.status === 'completed')} onClick={() => void window.api.clearCompleted()} />
        </div>
        <div className="toolbar-spacer" />
        <div className="search">
          <Icon name="search" size={14} />
          <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('search')} spellCheck={false} />
        </div>
        <div className="toolbar-group">
          <ToolButton
            icon="gauge"
            label={t('speedLimiter')}
            active={settings.speedLimitEnabled}
            title={`${t('speedLimiter')}: ${formatSpeed(settings.globalSpeedLimit)}`}
            onClick={() => void window.api.setSettings({ speedLimitEnabled: !settings.speedLimitEnabled })}
          />
          <button className={`tool${mainQueue && mainQueue.onComplete !== 'none' ? ' active warn' : ''}`} onClick={postActionMenu} title={t('whenDone')}>
            <Icon name="power" size={17} />
            <span className="tool-label">{t('whenDone')}</span>
          </button>
          <ToolButton icon="clock" label={t('scheduler')} onClick={() => setDialog({ type: 'scheduler' })} />
          <ToolButton icon="settings" label={t('settings')} onClick={() => setDialog({ type: 'settings' })} />
        </div>
      </header>

      <div className="main">
        <Sidebar filter={filter} onChange={setFilter} />
        <section className="content">
          <DownloadTable
            items={visible}
            live={live}
            selected={selected}
            sort={sort}
            onSort={onSort}
            onRowMouseDown={onRowMouseDown}
            onRowDoubleClick={onRowDoubleClick}
            onRowContextMenu={onRowContextMenu}
            onBackgroundClick={() => setSelected(new Set())}
            empty={empty}
          />
          {single && <DetailsPanel key={single.id} item={single} live={live.get(single.id)} />}
        </section>
      </div>

      <footer className="statusbar">
        <span>{t('activeDownloads', { count: activeCount })}</span>
        <span className="sep" />
        <span>
          {t('totalSpeed')}: <strong>{formatSpeed(totalSpeed)}</strong>
        </span>
        {settings.speedLimitEnabled && (
          <>
            <span className="sep" />
            <span className="text-warn">
              <Icon name="gauge" size={12} /> {formatSpeed(settings.globalSpeedLimit)}
            </span>
          </>
        )}
        <div className="spacer" />
        <span className={meta.bridgePort ? 'text-ok' : 'muted'}>
          <Icon name="puzzle" size={12} /> {meta.bridgePort ? t('browserConnected', { port: meta.bridgePort }) : t('browserOff')}
        </span>
      </footer>

      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}

      {dialog?.type === 'add' && (
        <AddDialog
          initial={dialog.initial}
          source="manual"
          onCancel={() => setDialog(null)}
          onSubmit={async (req) => {
            await window.api.add(req)
            setDialog(null)
          }}
        />
      )}
      {dialog?.type === 'batch' && <BatchDialog batch={dialog.batch} initialUrls={dialog.urls} onClose={() => setDialog(null)} />}
      {dialog?.type === 'settings' && <SettingsDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'scheduler' && <SchedulerDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'delete' && (
        <ConfirmDeleteDialog items={dialog.ids.map((id) => downloads.get(id)).filter((i): i is DownloadItem => !!i)} withFiles={dialog.withFiles} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'refresh' && downloads.get(dialog.id) && <RefreshAddressDialog item={downloads.get(dialog.id)!} onClose={() => setDialog(null)} />}
      {dialog?.type === 'post' && <PostActionDialog action={dialog.action} seconds={dialog.seconds} onClose={() => setDialog(null)} />}
      <Toasts />
    </div>
  )
}
