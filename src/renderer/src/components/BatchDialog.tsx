import { useMemo, useState } from 'react'
import type { AddRequest, PendingBatch } from '@shared/types'
import { MAIN_QUEUE_ID } from '@shared/defaults'
import { expandUrlPattern, fileExtension, isHttpUrl } from '@shared/format'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { Button, Field, Modal, Toggle } from './ui'

type Tab = 'pattern' | 'list' | 'browser'

function nameOf(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() ?? url)
  } catch {
    return url
  }
}

export function BatchDialog({ batch, initialUrls, onClose }: { batch?: PendingBatch | null; initialUrls?: string[]; onClose: () => void }) {
  const { settings, queues } = useStore()
  const { t, queue } = useI18n()
  const [tab, setTab] = useState<Tab>(batch ? 'browser' : initialUrls ? 'list' : 'pattern')
  const [pattern, setPattern] = useState('')
  const [listText, setListText] = useState((initialUrls ?? []).join('\n'))
  const [filter, setFilter] = useState('')
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set())
  const [directory, setDirectory] = useState(settings!.defaultDirectory)
  const [queueId, setQueueId] = useState(MAIN_QUEUE_ID)
  const [start, setStart] = useState(settings!.autoStart)

  const source = useMemo<PendingBatch['items']>(() => {
    if (tab === 'browser') return batch?.items ?? []
    const urls = tab === 'pattern' ? (pattern.trim() ? expandUrlPattern(pattern.trim(), 5000) : []) : listText.split(/\r?\n/).map((l) => l.trim())
    return Array.from(new Set(urls.filter(isHttpUrl))).map((url) => ({ url }))
  }, [tab, pattern, listText, batch])

  const exts = filter
    .split(/[,\s]+/)
    .map((e) => e.replace(/^\./, '').toLowerCase())
    .filter(Boolean)
  const visible = exts.length ? source.filter((i) => exts.includes(fileExtension(i.fileName ?? nameOf(i.url)))) : source
  const selected = visible.filter((i) => !unchecked.has(i.url))

  const toggle = (url: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev)
      if (next.has(url)) next.delete(url)
      else next.add(url)
      return next
    })

  const submit = async () => {
    const reqs: AddRequest[] = selected.map((i) => ({
      url: i.url,
      fileName: i.fileName,
      referrer: i.referrer ?? batch?.referrer,
      headers: i.headers,
      directory,
      queueId
    }))
    await window.api.addMany(reqs, start)
    onClose()
  }

  return (
    <Modal
      title={t('batchTitle')}
      onClose={onClose}
      width={720}
      footer={
        <>
          <Toggle checked={start} onChange={setStart} label={t('startImmediately')} />
          <div className="spacer" />
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" icon="download" disabled={!selected.length} onClick={() => void submit()}>
            {t('addSelected', { count: selected.length })}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="segmented">
          <button className={tab === 'pattern' ? 'active' : ''} onClick={() => setTab('pattern')}>
            {t('batchPattern')}
          </button>
          <button className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>
            {t('batchList')}
          </button>
          {batch && (
            <button className={tab === 'browser' ? 'active' : ''} onClick={() => setTab('browser')}>
              {t('fromBrowser')}
            </button>
          )}
        </div>

        {tab === 'pattern' && (
          <Field label={t('batchPattern')} help={t('batchPatternHelp')}>
            <input className="input mono" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="https://example.com/file[001-100].zip" autoFocus spellCheck={false} />
          </Field>
        )}
        {tab === 'list' && (
          <Field label={t('batchList')} help={t('batchListHelp')}>
            <textarea className="input mono" rows={5} value={listText} onChange={(e) => setListText(e.target.value)} autoFocus spellCheck={false} />
            <div className="row gap-s" style={{ marginTop: 6 }}>
              <Button
                icon="file"
                onClick={async () => {
                  const urls = await window.api.importList()
                  if (urls?.length) setListText((prev) => [prev.trim(), ...urls].filter(Boolean).join('\n'))
                }}
              >
                {t('importList')}
              </Button>
            </div>
          </Field>
        )}

        <div className="row gap-s">
          <input className="input grow" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('batchFilter')} />
          <span className="muted nowrap">{t('batchFound', { count: visible.length })}</span>
        </div>

        <div className="batch-list">
          <label className="batch-row batch-head">
            <input
              type="checkbox"
              checked={visible.length > 0 && selected.length === visible.length}
              onChange={(e) => setUnchecked(e.target.checked ? new Set() : new Set(visible.map((i) => i.url)))}
            />
            <span>{t('selectAll')}</span>
          </label>
          {visible.slice(0, 2000).map((i) => (
            <label key={i.url} className="batch-row" title={i.url}>
              <input type="checkbox" checked={!unchecked.has(i.url)} onChange={() => toggle(i.url)} />
              <span className="batch-name">{i.fileName ?? nameOf(i.url)}</span>
              <span className="batch-url mono">{i.url}</span>
            </label>
          ))}
        </div>

        <div className="grid-2">
          <Field label={t('saveTo')}>
            <div className="row gap-s">
              <input className="input grow" value={directory} onChange={(e) => setDirectory(e.target.value)} />
              <Button
                icon="folder"
                onClick={async () => {
                  const d = await window.api.chooseDirectory(directory)
                  if (d) setDirectory(d)
                }}
              />
            </div>
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
      </div>
    </Modal>
  )
}
