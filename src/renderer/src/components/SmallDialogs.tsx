import { useEffect, useState } from 'react'
import type { DownloadItem, PostAction } from '@shared/types'
import { isHttpUrl } from '@shared/format'
import { useI18n } from '../i18n'
import { Icon } from '../icons'
import { Button, Field, Modal, Toggle } from './ui'

export function ConfirmDeleteDialog({ items, withFiles, onClose }: { items: DownloadItem[]; withFiles: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const [deleteFiles, setDeleteFiles] = useState(withFiles)
  const hasCompleted = items.some((i) => i.status === 'completed')
  return (
    <Modal
      title={t('delete')}
      onClose={onClose}
      width={460}
      footer={
        <>
          <div className="spacer" />
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button
            variant="danger"
            icon="trash"
            autoFocus
            onClick={async () => {
              await window.api.remove(
                items.map((i) => i.id),
                deleteFiles
              )
              onClose()
            }}
          >
            {t('delete')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <p>{t('confirmDelete', { count: items.length })}</p>
        {items.length <= 5 && (
          <ul className="plain-list">
            {items.map((i) => (
              <li key={i.id}>{i.fileName}</li>
            ))}
          </ul>
        )}
        {hasCompleted && <Toggle checked={deleteFiles} onChange={setDeleteFiles} label={t('confirmDeleteFiles')} />}
      </div>
    </Modal>
  )
}

export function RefreshAddressDialog({ item, onClose }: { item: DownloadItem; onClose: () => void }) {
  const { t } = useI18n()
  const [url, setUrl] = useState('')
  useEffect(() => {
    void window.api.readClipboardUrl().then((u) => u && u !== item.url && setUrl(u))
  }, [item.url])
  return (
    <Modal
      title={t('refreshAddress').replace('…', '')}
      onClose={onClose}
      width={560}
      footer={
        <>
          <div className="spacer" />
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button
            variant="primary"
            icon="refresh"
            disabled={!isHttpUrl(url)}
            onClick={async () => {
              await window.api.refreshAddress(item.id, url.trim())
              onClose()
            }}
          >
            {t('ok')}
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="callout">
          <Icon name="info" size={16} />
          <span>{t('refreshAddressHelp')}</span>
        </div>
        <Field label={t('fileName')}>
          <div className="readonly">{item.fileName}</div>
        </Field>
        <Field label={t('url')}>
          <div className="readonly mono small">{item.url}</div>
        </Field>
        <Field label={t('newAddress')}>
          <input className="input mono" value={url} onChange={(e) => setUrl(e.target.value)} autoFocus spellCheck={false} />
        </Field>
      </div>
    </Modal>
  )
}

export function PostActionDialog({ action, seconds, onClose }: { action: PostAction; seconds: number; onClose: () => void }) {
  const { t } = useI18n()
  const [left, setLeft] = useState(seconds)
  useEffect(() => {
    const timer = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [])
  const cancel = () => {
    void window.api.cancelPostAction(false)
    onClose()
  }
  return (
    <Modal
      title={t('postActionTitle')}
      onClose={cancel}
      width={420}
      footer={
        <>
          <div className="spacer" />
          <Button variant="primary" onClick={cancel} autoFocus>
            {t('cancel')}
          </Button>
          <Button
            variant="danger"
            icon="power"
            onClick={() => {
              void window.api.cancelPostAction(true)
              onClose()
            }}
          >
            {t('doItNow')}
          </Button>
        </>
      }
    >
      <div className="post-action">
        <div className="countdown">{left}</div>
        <p>{t('postActionBody', { action: t(`post.${action}`), seconds: left })}</p>
      </div>
    </Modal>
  )
}
