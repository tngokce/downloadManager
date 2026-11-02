import { useState } from 'react'
import type { Category, Settings } from '@shared/types'
import { MAX_CONNECTIONS } from '@shared/defaults'
import type { I18nKey } from '@shared/i18n'
import { useStore } from '../store'
import { useI18n } from '../i18n'
import { Icon, type IconName } from '../icons'
import { Button, Field, Modal, NumberInput, SpeedInput, Toggle, toast } from './ui'

type Section = 'general' | 'downloads' | 'connection' | 'speed' | 'categories' | 'browser' | 'video' | 'advanced'

const SECTIONS: { id: Section; icon: IconName }[] = [
  { id: 'general', icon: 'settings' },
  { id: 'downloads', icon: 'download' },
  { id: 'connection', icon: 'globe' },
  { id: 'speed', icon: 'gauge' },
  { id: 'categories', icon: 'layers' },
  { id: 'browser', icon: 'puzzle' },
  { id: 'video', icon: 'video' },
  { id: 'advanced', icon: 'more' }
]

const splitList = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((x) => x.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean)

export function SettingsDialog({ onClose, initialSection = 'general' }: { onClose: () => void; initialSection?: Section }) {
  const { settings, meta } = useStore()
  const { t, cat } = useI18n()
  const [draft, setDraft] = useState<Settings>(structuredClone(settings!))
  const [section, setSection] = useState<Section>(initialSection)
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setBrowser = (patch: Partial<Settings['browser']>) => setDraft((d) => ({ ...d, browser: { ...d.browser, ...patch } }))
  const setProxy = (patch: Partial<Settings['proxy']>) => setDraft((d) => ({ ...d, proxy: { ...d.proxy, ...patch } }))
  const setCategory = (i: number, patch: Partial<Category>) =>
    setDraft((d) => ({ ...d, categories: d.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) }))

  const save = async () => {
    await window.api.setSettings(draft)
    toast(t('save') + ' ✓')
    onClose()
  }

  const chooseDir = async (current: string, apply: (d: string) => void) => {
    const d = await window.api.chooseDirectory(current)
    if (d) apply(d)
  }

  return (
    <Modal
      title={t('settings')}
      onClose={onClose}
      width={820}
      footer={
        <>
          <Button
            variant="ghost"
            icon="refresh"
            onClick={async () => {
              const s = await window.api.resetSettings()
              setDraft(structuredClone(s))
            }}
          >
            {t('resetSettings')}
          </Button>
          <div className="spacer" />
          <Button onClick={onClose}>{t('cancel')}</Button>
          <Button variant="primary" onClick={() => void save()}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="settings">
        <nav className="settings-nav">
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? 'active' : ''} onClick={() => setSection(s.id)}>
              <Icon name={s.icon} size={15} />
              {t(`settings.${s.id}` as I18nKey)}
            </button>
          ))}
        </nav>
        <div className="settings-body stack">
          {section === 'general' && (
            <>
              <div className="grid-2">
                <Field label={t('language')}>
                  <select className="input" value={draft.language} onChange={(e) => set('language', e.target.value as Settings['language'])}>
                    <option value="tr">Türkçe</option>
                    <option value="en">English</option>
                  </select>
                </Field>
                <Field label={t('theme')}>
                  <select className="input" value={draft.theme} onChange={(e) => set('theme', e.target.value as Settings['theme'])}>
                    <option value="system">{t('themeSystem')}</option>
                    <option value="light">{t('themeLight')}</option>
                    <option value="dark">{t('themeDark')}</option>
                  </select>
                </Field>
              </div>
              <Toggle checked={draft.startAtLogin} onChange={(v) => set('startAtLogin', v)} label={t('startAtLogin')} />
              <Toggle checked={draft.startMinimized} onChange={(v) => set('startMinimized', v)} label={t('startMinimized')} />
              <Toggle checked={draft.closeToTray} onChange={(v) => set('closeToTray', v)} label={t('closeToTray')} />
              <Toggle checked={draft.notifications} onChange={(v) => set('notifications', v)} label={t('notifications')} />
              <Toggle checked={draft.soundOnComplete} onChange={(v) => set('soundOnComplete', v)} label={t('soundOnComplete')} />
              <Toggle checked={draft.preventSleep} onChange={(v) => set('preventSleep', v)} label={t('preventSleep')} />
              <Toggle checked={draft.clipboardMonitor} onChange={(v) => set('clipboardMonitor', v)} label={t('clipboardMonitor')} />
            </>
          )}

          {section === 'downloads' && (
            <>
              <Field label={t('defaultDirectory')}>
                <div className="row gap-s">
                  <input className="input grow" value={draft.defaultDirectory} onChange={(e) => set('defaultDirectory', e.target.value)} />
                  <Button icon="folder" onClick={() => void chooseDir(draft.defaultDirectory, (d) => set('defaultDirectory', d))}>
                    {t('browse')}
                  </Button>
                </div>
              </Field>
              <Toggle checked={draft.useCategoryFolders} onChange={(v) => set('useCategoryFolders', v)} label={t('useCategoryFolders')} />
              <Toggle checked={draft.autoStart} onChange={(v) => set('autoStart', v)} label={t('autoStart')} />
              <Toggle checked={draft.resumeOnStartup} onChange={(v) => set('resumeOnStartup', v)} label={t('resumeOnStartup')} />
              <Field label={t('duplicateAction')}>
                <select className="input" value={draft.duplicateAction} onChange={(e) => set('duplicateAction', e.target.value as Settings['duplicateAction'])}>
                  <option value="rename">{t('dupRename')}</option>
                  <option value="overwrite">{t('dupOverwrite')}</option>
                </select>
              </Field>
              <div className="grid-2">
                <Field label={t('maxConcurrent')}>
                  <NumberInput value={draft.maxConcurrentDownloads} min={1} max={20} onChange={(v) => set('maxConcurrentDownloads', v)} />
                </Field>
                <Field label={t('connectionsPerDownload')} help={t('connectionsHelp')}>
                  <NumberInput value={draft.connectionsPerDownload} min={1} max={MAX_CONNECTIONS} onChange={(v) => set('connectionsPerDownload', v)} />
                </Field>
              </div>
            </>
          )}

          {section === 'connection' && (
            <>
              <Field label={t('proxy')}>
                <select className="input" value={draft.proxy.mode} onChange={(e) => setProxy({ mode: e.target.value as Settings['proxy']['mode'] })}>
                  <option value="none">{t('proxyNone')}</option>
                  <option value="system">{t('proxySystem')}</option>
                  <option value="manual">{t('proxyManual')}</option>
                </select>
              </Field>
              {draft.proxy.mode === 'manual' && (
                <>
                  <div className="grid-3">
                    <Field label={t('protocol')}>
                      <select className="input" value={draft.proxy.protocol} onChange={(e) => setProxy({ protocol: e.target.value as Settings['proxy']['protocol'] })}>
                        <option value="http">HTTP</option>
                        <option value="https">HTTPS</option>
                        <option value="socks5">SOCKS5</option>
                      </select>
                    </Field>
                    <Field label={t('host')}>
                      <input className="input mono" value={draft.proxy.host} onChange={(e) => setProxy({ host: e.target.value.trim() })} />
                    </Field>
                    <Field label={t('port')}>
                      <NumberInput value={draft.proxy.port} min={1} max={65535} onChange={(v) => setProxy({ port: v })} />
                    </Field>
                  </div>
                  <div className="grid-2">
                    <Field label={t('username')}>
                      <input className="input" value={draft.proxy.username} onChange={(e) => setProxy({ username: e.target.value })} autoComplete="off" />
                    </Field>
                    <Field label={t('password')}>
                      <input className="input" type="password" value={draft.proxy.password} onChange={(e) => setProxy({ password: e.target.value })} autoComplete="off" />
                    </Field>
                  </div>
                </>
              )}
              <div className="grid-2">
                <Field label={t('maxRetries')}>
                  <NumberInput value={draft.maxRetries} min={0} max={1000} onChange={(v) => set('maxRetries', v)} />
                </Field>
                <Field label={t('retryDelay')}>
                  <NumberInput value={draft.retryDelaySec} min={1} max={600} onChange={(v) => set('retryDelaySec', v)} />
                </Field>
                <Field label={t('connectTimeout')}>
                  <NumberInput value={draft.connectTimeoutSec} min={3} max={300} onChange={(v) => set('connectTimeoutSec', v)} />
                </Field>
                <Field label={t('readTimeout')}>
                  <NumberInput value={draft.readTimeoutSec} min={5} max={600} onChange={(v) => set('readTimeoutSec', v)} />
                </Field>
              </div>
              <Field label={t('userAgent')}>
                <input className="input mono" value={draft.userAgent} onChange={(e) => set('userAgent', e.target.value)} spellCheck={false} />
              </Field>
              <Toggle checked={draft.verifyTls} onChange={(v) => set('verifyTls', v)} label={t('verifyTls')} />
            </>
          )}

          {section === 'speed' && (
            <>
              <Toggle checked={draft.speedLimitEnabled} onChange={(v) => set('speedLimitEnabled', v)} label={t('speedLimitEnabled')} />
              <Field label={t('globalSpeedLimit')}>
                <SpeedInput value={draft.globalSpeedLimit} onChange={(v) => set('globalSpeedLimit', v)} unlimitedLabel={t('unlimited')} />
              </Field>
              <Field label={t('minSegmentSize')}>
                <div className="row gap-s">
                  <NumberInput value={Math.round(draft.minSegmentSize / 1024)} min={64} max={65536} onChange={(v) => set('minSegmentSize', v * 1024)} />
                  <span className="muted">KB</span>
                </div>
              </Field>
            </>
          )}

          {section === 'categories' && (
            <>
              <div className="cat-table">
                <div className="cat-row cat-head">
                  <span>{t('categoryName')}</span>
                  <span>{t('extensions')}</span>
                  <span>{t('folder')}</span>
                  <span />
                </div>
                {draft.categories.map((c, i) => (
                  <div className="cat-row" key={c.id}>
                    {c.builtin ? (
                      <span className="cat-name">{cat(c)}</span>
                    ) : (
                      <input className="input" value={c.name} onChange={(e) => setCategory(i, { name: e.target.value })} />
                    )}
                    <input
                      className="input mono"
                      defaultValue={c.extensions.join(' ')}
                      disabled={c.id === 'general'}
                      onBlur={(e) => setCategory(i, { extensions: splitList(e.target.value) })}
                    />
                    <div className="row gap-s">
                      <input className="input grow" value={c.directory} placeholder={t('defaultFolder')} onChange={(e) => setCategory(i, { directory: e.target.value })} />
                      <Button icon="folder" onClick={() => void chooseDir(c.directory || draft.defaultDirectory, (d) => setCategory(i, { directory: d }))} />
                    </div>
                    {c.builtin ? (
                      <span />
                    ) : (
                      <Button icon="trash" variant="ghost" title={t('remove')} onClick={() => setDraft((d) => ({ ...d, categories: d.categories.filter((_, j) => j !== i) }))} />
                    )}
                  </div>
                ))}
              </div>
              <div>
                <Button
                  icon="plus"
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      categories: [...d.categories.filter((c) => c.id !== 'general'), { id: crypto.randomUUID(), name: 'Yeni', extensions: [], directory: '' }, ...d.categories.filter((c) => c.id === 'general')]
                    }))
                  }
                >
                  {t('addCategory')}
                </Button>
              </div>
            </>
          )}

          {section === 'browser' && (
            <>
              <Toggle checked={draft.browser.enabled} onChange={(v) => setBrowser({ enabled: v })} label={t('browserEnabled')} />
              <div className="grid-2">
                <Field label={t('browserPort')}>
                  <NumberInput value={draft.browser.port} min={1024} max={65530} onChange={(v) => setBrowser({ port: v })} />
                </Field>
                <Field label={t('bridgeStatus')}>
                  <div className={meta.bridgePort ? 'text-ok' : 'text-danger'} style={{ paddingTop: 7 }}>
                    {meta.bridgePort ? t('bridgeRunning', { port: meta.bridgePort }) : t('bridgeStopped')}
                  </div>
                </Field>
              </div>
              <Toggle checked={draft.browser.showAddDialog} onChange={(v) => setBrowser({ showAddDialog: v })} label={t('showAddDialog')} />
              <Toggle checked={draft.browser.videoButton} onChange={(v) => setBrowser({ videoButton: v })} label={t('videoButton')} />
              <Field label={t('interceptExtensions')}>
                <textarea
                  className="input mono"
                  rows={3}
                  defaultValue={draft.browser.interceptExtensions.join(' ')}
                  onBlur={(e) => setBrowser({ interceptExtensions: splitList(e.target.value) })}
                  spellCheck={false}
                />
              </Field>
              <div className="grid-2">
                <Field label={t('minSizeKB')}>
                  <NumberInput value={draft.browser.minSizeKB} min={0} max={1_000_000} onChange={(v) => setBrowser({ minSizeKB: v })} />
                </Field>
                <Field label={t('excludedSites')}>
                  <textarea
                    className="input mono"
                    rows={3}
                    defaultValue={draft.browser.excludedSites.join('\n')}
                    onBlur={(e) => setBrowser({ excludedSites: e.target.value.split(/\s+/).map((x) => x.trim().toLowerCase()).filter(Boolean) })}
                    spellCheck={false}
                  />
                </Field>
              </div>
              <div className="callout">
                <Icon name="puzzle" size={16} />
                <div className="stack-s">
                  <strong>{t('extensionSetup')}</strong>
                  <span>{t('extensionSetupHelp')}</span>
                  <div>
                    <Button icon="folder" onClick={() => void window.api.openExtensionFolder()}>
                      {t('openExtensionFolder')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}

          {section === 'video' && (
            <>
              <div className={`callout ${meta.ffmpegAvailable ? '' : 'callout-warn'}`}>
                <Icon name={meta.ffmpegAvailable ? 'check' : 'alert'} size={16} />
                <span>{meta.ffmpegAvailable ? t('ffmpegFound') : t('ffmpegMissing')}</span>
              </div>
              <Field label={t('ffmpegPath')}>
                <input className="input mono" value={draft.ffmpegPath} onChange={(e) => set('ffmpegPath', e.target.value)} spellCheck={false} />
              </Field>
              <Toggle checked={draft.hlsRemux} onChange={(v) => set('hlsRemux', v)} label={t('hlsRemux')} />
            </>
          )}

          {section === 'advanced' && (
            <>
              <Field label={t('postDownloadCommand')} help={t('postDownloadHelp')}>
                <input className="input mono" value={draft.postDownloadCommand} onChange={(e) => set('postDownloadCommand', e.target.value)} spellCheck={false} />
              </Field>
              <div className="muted small">
                {t('appName')} v{meta.version} · {meta.platform}
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
