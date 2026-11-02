import {
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  app,
  clipboard,
  nativeImage,
  nativeTheme,
  powerMonitor,
  powerSaveBlocker,
  screen,
  session,
  shell,
  type MenuItemConstructorOptions
} from 'electron'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { AddRequest, AppState, DownloadItem, PendingAdd, PendingBatch, PostAction, Queue, Settings } from '@shared/types'
import { DEFAULT_QUEUES, MAIN_QUEUE_ID, createDefaultSettings, mergeSettings } from '@shared/defaults'
import { fileExtension, formatSpeed, isHttpUrl } from '@shared/format'
import { translate, type I18nKey } from '@shared/i18n'
import { IPC } from '@shared/ipc'
import { DownloadManager } from './manager'
import { JsonStore } from './store'
import { Bridge, type BridgeDownload } from './bridge'
import { Scheduler } from './scheduler'
import { applyLoginItem, findFfmpeg, launchedHidden, runPostAction } from './system'
import { registerIpc } from './ipc'

const isMac = process.platform === 'darwin'
const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL
const PROTOCOL = 'dlmanager'

interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  maximized?: boolean
}

export function resourcePath(...parts: string[]): string {
  return app.isPackaged ? join(process.resourcesPath, ...parts) : join(app.getAppPath(), ...parts)
}

/** Uygulamanın tüm parçalarını bir araya getiren denetleyici. */
export class Controller {
  settings!: Settings
  queues!: Queue[]
  manager!: DownloadManager
  mainWindow: BrowserWindow | null = null
  ffmpegPath: string | null = null
  readonly pendingAdds = new Map<string, PendingAdd>()
  readonly pendingBatches = new Map<string, PendingBatch>()
  private readonly addWindows = new Map<string, BrowserWindow>()
  private tray: Tray | null = null
  private bridge!: Bridge
  private scheduler!: Scheduler
  private settingsStore!: JsonStore<Settings>
  private queueStore!: JsonStore<Queue[]>
  private windowStore!: JsonStore<WindowState>
  private quitting = false
  private powerBlockerId: number | null = null
  private clipboardTimer: NodeJS.Timeout | null = null
  private lastClipboard = ''
  private postActionTimer: NodeJS.Timeout | null = null
  private pendingPostAction: PostAction | null = null
  private lastActivity = { active: 0, speed: 0, progress: null as number | null }

  t(key: I18nKey, vars?: Record<string, string | number>): string {
    return translate(this.settings.language, key, vars)
  }

  // ------------------------------------------------------------ başlatma

  async init(): Promise<void> {
    const dataDir = app.getPath('userData')
    this.settingsStore = new JsonStore<Settings>(dataDir, 'settings.json', 300)
    this.queueStore = new JsonStore<Queue[]>(dataDir, 'queues.json', 300)
    this.windowStore = new JsonStore<WindowState>(dataDir, 'window.json', 500)

    const lang = app.getLocale().toLowerCase().startsWith('tr') ? 'tr' : 'en'
    this.settings = mergeSettings(createDefaultSettings(app.getPath('downloads'), lang), this.settingsStore.load())
    const savedQueues = this.queueStore.load()
    this.queues = savedQueues?.length ? savedQueues : structuredClone(DEFAULT_QUEUES)
    nativeTheme.themeSource = this.settings.theme

    this.manager = new DownloadManager(this.settings, this.queues, new JsonStore<DownloadItem[]>(dataDir, 'downloads.json'), {
      resolveSystemProxy: async () => {
        const r = await session.defaultSession.resolveProxy('https://www.example.com')
        return r && r !== 'DIRECT' ? r : null
      },
      ffmpegPath: () => this.ffmpegPath,
      log: (m) => console.log(m)
    })
    this.wireManager()

    this.bridge = new Bridge({
      version: app.getVersion(),
      config: () => ({
        enabled: this.settings.browser.enabled,
        interceptExtensions: this.settings.browser.interceptExtensions,
        minSizeKB: this.settings.browser.minSizeKB,
        excludedSites: this.settings.browser.excludedSites,
        videoButton: this.settings.browser.videoButton,
        language: this.settings.language
      }),
      onDownload: (d) => this.fromBrowser(d),
      onBatch: (items, referrer) => this.openBatch('browser', items.map((d) => this.browserRequest(d)), referrer)
    })
    if (this.settings.browser.enabled) await this.bridge.start(this.settings.browser.port)

    this.scheduler = new Scheduler({
      queues: () => this.queues,
      start: (id) => this.manager.startQueue(id),
      stop: (id) => void this.manager.stopQueue(id)
    })
    this.scheduler.start()

    void findFfmpeg(this.settings.ffmpegPath).then((p) => {
      this.ffmpegPath = p
      this.broadcast(IPC.evSettings, this.settings)
    })

    registerIpc(this)
    this.buildMenu()
    this.createTray()
    this.applyClipboardMonitor()
    applyLoginItem(this.settings.startAtLogin)

    powerMonitor.on('resume', () => setTimeout(() => void this.manager.kick(), 3000))

    const hidden = launchedHidden() || this.settings.startMinimized
    this.createMainWindow(!hidden)
  }

  private wireManager(): void {
    const m = this.manager
    m.on('added', (items) => this.broadcast(IPC.evDownloadsAdded, items))
    m.on('removed', (ids) => this.broadcast(IPC.evDownloadsRemoved, ids))
    m.on('patched', (items) => this.broadcast(IPC.evDownloadsPatched, items))
    m.on('live', (live) => this.broadcast(IPC.evLive, live))
    m.on('queues', (queues) => {
      this.queueStore.save(queues)
      this.broadcast(IPC.evQueues, queues)
    })
    m.on('activity', (a) => this.onActivity(a))
    m.on('completed', (item) => {
      if (this.settings.notifications && Notification.isSupported()) {
        const n = new Notification({ title: this.t('notifCompleted'), body: item.fileName, silent: true })
        n.on('click', () => shell.showItemInFolder(join(item.directory, item.fileName)))
        n.show()
      }
      if (this.settings.soundOnComplete) this.mainWindow?.webContents.send(IPC.evCommand, { type: 'sound' })
    })
    m.on('failed', (item) => {
      if (this.settings.notifications && Notification.isSupported()) {
        new Notification({ title: this.t('notifFailed'), body: item.fileName, silent: true }).show()
      }
    })
    m.on('queueDone', (q) => this.onQueueDone(q))
  }

  // ------------------------------------------------------------ pencereler

  private rendererUrl(hash: string): { url?: string; file?: string; hash: string } {
    if (isDev) return { url: `${process.env.ELECTRON_RENDERER_URL}#${hash}`, hash }
    return { file: join(__dirname, '../renderer/index.html'), hash }
  }

  private secureWindow(win: BrowserWindow): void {
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    win.webContents.on('will-navigate', (e, url) => {
      if (!isDev || !url.startsWith(process.env.ELECTRON_RENDERER_URL ?? '')) e.preventDefault()
    })
  }

  private load(win: BrowserWindow, hash: string): void {
    const r = this.rendererUrl(hash)
    if (r.url) void win.loadURL(r.url)
    else void win.loadFile(r.file!, { hash: r.hash })
  }

  private webPreferences() {
    return {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  }

  createMainWindow(show: boolean): void {
    const saved = this.windowStore.load() ?? { width: 1180, height: 720 }
    const visible = screen.getAllDisplays().some((d) => {
      const b = d.workArea
      return saved.x === undefined || (saved.x >= b.x - 50 && saved.x < b.x + b.width && (saved.y ?? 0) >= b.y - 50 && (saved.y ?? 0) < b.y + b.height)
    })
    const win = new BrowserWindow({
      width: saved.width,
      height: saved.height,
      x: visible ? saved.x : undefined,
      y: visible ? saved.y : undefined,
      minWidth: 860,
      minHeight: 520,
      show: false,
      title: this.t('appName'),
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181d' : '#ffffff',
      titleBarStyle: isMac ? 'hiddenInset' : 'default',
      trafficLightPosition: { x: 14, y: 16 },
      autoHideMenuBar: true,
      icon: isMac ? undefined : resourcePath('resources', 'icon.png'),
      webPreferences: this.webPreferences()
    })
    if (saved.maximized) win.maximize()
    this.secureWindow(win)
    this.load(win, '/')
    win.once('ready-to-show', () => {
      if (show) win.show()
    })

    const saveBounds = () => {
      if (win.isDestroyed() || win.isMinimized()) return
      const b = win.getNormalBounds()
      this.windowStore.save({ ...b, maximized: win.isMaximized() })
    }
    win.on('resize', saveBounds)
    win.on('move', saveBounds)
    win.on('close', (e) => {
      saveBounds()
      if (!this.quitting && (this.settings.closeToTray || isMac)) {
        e.preventDefault()
        win.hide()
      }
    })
    win.on('closed', () => {
      this.mainWindow = null
      if (!isMac && !this.settings.closeToTray) app.quit()
    })
    this.mainWindow = win
  }

  showMainWindow(): void {
    if (!this.mainWindow) this.createMainWindow(true)
    const w = this.mainWindow!
    if (w.isMinimized()) w.restore()
    w.show()
    w.focus()
  }

  openAddWindow(pending: PendingAdd): void {
    this.pendingAdds.set(pending.token, pending)
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const width = 640
    const height = 600
    const win = new BrowserWindow({
      width,
      height,
      x: Math.round(display.x + (display.width - width) / 2),
      y: Math.round(display.y + (display.height - height) / 3),
      minWidth: 520,
      minHeight: 440,
      show: false,
      alwaysOnTop: true,
      minimizable: false,
      fullscreenable: false,
      title: this.t('newDownload'),
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181d' : '#ffffff',
      autoHideMenuBar: true,
      icon: isMac ? undefined : resourcePath('resources', 'icon.png'),
      webPreferences: this.webPreferences()
    })
    this.secureWindow(win)
    this.load(win, `/add/${pending.token}`)
    win.once('ready-to-show', () => {
      win.show()
      win.focus()
    })
    win.on('closed', () => {
      this.addWindows.delete(pending.token)
      this.pendingAdds.delete(pending.token)
    })
    this.addWindows.set(pending.token, win)
  }

  resolvePendingAdd(token: string, req: AddRequest | null): DownloadItem | null {
    const item = req ? this.manager.add(req) : null
    this.addWindows.get(token)?.close()
    this.pendingAdds.delete(token)
    return item
  }

  openBatch(source: PendingBatch['source'], items: PendingBatch['items'], referrer?: string): void {
    const token = randomUUID()
    this.pendingBatches.set(token, { token, source, items, referrer })
    this.showMainWindow()
    const send = () => this.mainWindow?.webContents.send(IPC.evShowBatch, token)
    if (this.mainWindow?.webContents.isLoading()) this.mainWindow.webContents.once('did-finish-load', send)
    else send()
  }

  broadcast(channel: string, payload: unknown): void {
    for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }

  // ------------------------------------------------------------ tarayıcı ve pano

  browserRequest(d: BridgeDownload): PendingBatch['items'][number] & AddRequest {
    const headers: Record<string, string> = {}
    if (d.cookies) headers.Cookie = d.cookies
    if (d.userAgent) headers['User-Agent'] = d.userAgent
    let fileName = d.fileName?.split(/[\\/]/).pop()
    if (!fileName && d.title && d.kind === 'hls') fileName = `${d.title}.mp4`
    const url = d.finalUrl || d.url
    return {
      url,
      fileName,
      referrer: d.referrer,
      headers,
      totalBytes: d.fileSize ?? null,
      mime: d.mime,
      kind: d.kind === 'hls' ? 'hls' : undefined,
      hls: d.kind === 'hls' ? { playlistUrl: url } : undefined
    }
  }

  private fromBrowser(d: BridgeDownload): void {
    const req = this.browserRequest(d)
    if (!this.settings.browser.showAddDialog) {
      this.manager.add({ ...req, start: this.settings.autoStart })
      return
    }
    this.openAddWindow({ token: randomUUID(), source: 'browser', request: req })
  }

  applyClipboardMonitor(): void {
    if (this.clipboardTimer) clearInterval(this.clipboardTimer)
    this.clipboardTimer = null
    if (!this.settings.clipboardMonitor) return
    let primed = false
    let busy = false
    this.clipboardTimer = setInterval(async () => {
      if (busy) return
      busy = true
      try {
        const text = (await clipboard.readText()).trim()
        // İlk okuma yalnızca mevcut içeriği kaydeder; açılışta eski bağlantı yakalanmaz.
        if (!primed || text === this.lastClipboard) {
          primed = true
          this.lastClipboard = text
          return
        }
        this.lastClipboard = text
        if (!isHttpUrl(text) || text.includes('\n')) return
        const ext = fileExtension(new URL(text).pathname)
        const wanted = this.settings.browser.interceptExtensions.includes(ext) || ext === 'm3u8'
        if (!wanted || this.manager.findDuplicate(text)) return
        this.openAddWindow({ token: randomUUID(), source: 'clipboard', request: { url: text } })
      } finally {
        busy = false
      }
    }, 1000)
  }

  /** Uygulamanın kendisi panoya yazdığında izleyici bunu yeni bağlantı sanmasın */
  writeClipboard(text: string): void {
    this.lastClipboard = text
    void clipboard.writeText(text)
  }

  handleProtocolUrl(raw: string): void {
    try {
      const u = new URL(raw)
      const target = u.searchParams.get('url')
      if (u.protocol === `${PROTOCOL}:` && target && isHttpUrl(target)) {
        this.openAddWindow({ token: randomUUID(), source: 'protocol', request: { url: target } })
      }
    } catch {
      /* geçersiz adres */
    }
  }

  // ------------------------------------------------------------ ayarlar

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const prev = this.settings
    const next: Settings = {
      ...prev,
      ...patch,
      proxy: { ...prev.proxy, ...patch.proxy },
      browser: { ...prev.browser, ...patch.browser }
    }
    this.settings = next
    this.settingsStore.save(next)
    this.manager.applySettings(next)
    nativeTheme.themeSource = next.theme

    if (prev.browser.enabled !== next.browser.enabled || prev.browser.port !== next.browser.port) {
      if (next.browser.enabled) await this.bridge.start(next.browser.port)
      else await this.bridge.stop()
    }
    if (prev.clipboardMonitor !== next.clipboardMonitor) this.applyClipboardMonitor()
    if (prev.startAtLogin !== next.startAtLogin) applyLoginItem(next.startAtLogin)
    if (prev.ffmpegPath !== next.ffmpegPath) this.ffmpegPath = await findFfmpeg(next.ffmpegPath)
    if (prev.language !== next.language) {
      this.buildMenu()
      this.updateTray()
    }
    if (prev.speedLimitEnabled !== next.speedLimitEnabled || prev.browser.enabled !== next.browser.enabled) this.updateTray()
    this.broadcast(IPC.evSettings, next)
    return next
  }

  async resetSettings(): Promise<Settings> {
    const lang = this.settings.language
    const defaults = createDefaultSettings(app.getPath('downloads'), lang)
    return this.updateSettings(defaults)
  }

  saveQueues(queues: Queue[]): void {
    this.queues = queues
    this.queueStore.save(queues)
    this.manager.setQueues(queues)
  }

  get bridgePort(): number | null {
    return this.bridge.port
  }

  state(): AppState {
    return {
      downloads: this.manager.list(),
      settings: this.settings,
      queues: this.queues,
      platform: process.platform,
      version: app.getVersion(),
      ffmpegAvailable: !!this.ffmpegPath,
      bridgePort: this.bridge.port
    }
  }

  // ------------------------------------------------------------ etkinlik, tepsi, menü

  private onActivity(a: { active: number; speed: number; progress: number | null }): void {
    const changed = a.active !== this.lastActivity.active
    this.lastActivity = a
    const win = this.mainWindow
    if (win && !win.isDestroyed()) win.setProgressBar(a.active ? (a.progress ?? 2) : -1)
    if (isMac && app.dock) app.dock.setBadge(a.active ? String(a.active) : '')
    if (this.tray) {
      const tip = a.active ? `${this.t('appName')} — ${this.t('activeDownloads', { count: a.active })} · ${formatSpeed(a.speed)}` : this.t('appName')
      this.tray.setToolTip(tip)
      if (isMac) this.tray.setTitle(a.active ? formatSpeed(a.speed) : '', { fontType: 'monospacedDigit' })
    }
    if (a.active && this.settings.preventSleep && this.powerBlockerId === null) {
      this.powerBlockerId = powerSaveBlocker.start('prevent-app-suspension')
    } else if ((!a.active || !this.settings.preventSleep) && this.powerBlockerId !== null) {
      powerSaveBlocker.stop(this.powerBlockerId)
      this.powerBlockerId = null
    }
    if (changed) this.updateTray()
  }

  private onQueueDone(q: Queue): void {
    if (q.id !== MAIN_QUEUE_ID && this.settings.notifications && Notification.isSupported()) {
      const name = q.builtin ? this.t(`queue.${q.id}` as I18nKey) : q.name
      new Notification({ title: this.t('appName'), body: this.t('notifQueueDone', { name }), silent: true }).show()
    }
    const action = q.onComplete
    if (action === 'none') return
    // Ana kuyruktaki "bitince" seçimi tek seferliktir; ertesi gün sürpriz kapanma olmasın.
    if (q.id === MAIN_QUEUE_ID) this.saveQueues(this.queues.map((x) => (x.id === q.id ? { ...x, onComplete: 'none' } : x)))
    const seconds = 60
    this.showMainWindow()
    this.mainWindow?.webContents.send(IPC.evPostAction, { action, seconds })
    if (this.postActionTimer) clearTimeout(this.postActionTimer)
    this.pendingPostAction = action
    this.postActionTimer = setTimeout(() => this.executePostAction(), seconds * 1000)
  }

  executePostAction(): void {
    const action = this.pendingPostAction
    this.cancelPostAction()
    if (action) runPostAction(action)
  }

  cancelPostAction(): void {
    if (this.postActionTimer) clearTimeout(this.postActionTimer)
    this.postActionTimer = null
    this.pendingPostAction = null
  }

  private createTray(): void {
    const icon = isMac
      ? nativeImage.createFromPath(resourcePath('resources', 'trayTemplate.png'))
      : nativeImage.createFromPath(resourcePath('resources', 'tray.png'))
    if (isMac) icon.setTemplateImage(true)
    this.tray = new Tray(icon)
    this.tray.setToolTip(this.t('appName'))
    this.tray.on('click', () => {
      if (!isMac) this.showMainWindow()
    })
    this.updateTray()
  }

  private updateTray(): void {
    if (!this.tray) return
    const menu = Menu.buildFromTemplate([
      { label: this.t('trayShow'), click: () => this.showMainWindow() },
      { label: this.t('addUrl'), click: () => this.command('addUrl') },
      { type: 'separator' },
      { label: this.t('startAll'), click: () => this.manager.startAll() },
      { label: this.t('pauseAll'), click: () => void this.manager.pauseAll(), enabled: this.lastActivity.active > 0 },
      { type: 'separator' },
      {
        label: this.t('speedLimiter'),
        type: 'checkbox',
        checked: this.settings.speedLimitEnabled,
        click: (mi) => void this.updateSettings({ speedLimitEnabled: mi.checked })
      },
      {
        label: this.t('browserEnabled'),
        type: 'checkbox',
        checked: this.settings.browser.enabled,
        click: (mi) => void this.updateSettings({ browser: { ...this.settings.browser, enabled: mi.checked } })
      },
      { type: 'separator' },
      { label: this.t('trayQuit'), click: () => app.quit() }
    ])
    this.tray.setContextMenu(menu)
  }

  command(type: 'addUrl' | 'batch' | 'settings' | 'scheduler'): void {
    this.showMainWindow()
    const send = () => this.mainWindow?.webContents.send(IPC.evCommand, { type })
    if (this.mainWindow?.webContents.isLoading()) this.mainWindow.webContents.once('did-finish-load', send)
    else send()
  }

  private buildMenu(): void {
    if (!isMac) {
      Menu.setApplicationMenu(null)
      return
    }
    const template: MenuItemConstructorOptions[] = [
      {
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: `${this.t('settings')}…`, accelerator: 'Cmd+,', click: () => this.command('settings') },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: this.settings.language === 'tr' ? 'Dosya' : 'File',
        submenu: [
          { label: `${this.t('addUrl')}…`, accelerator: 'Cmd+N', click: () => this.command('addUrl') },
          { label: `${this.t('batch')}…`, accelerator: 'Cmd+Shift+N', click: () => this.command('batch') },
          { label: `${this.t('scheduler')}…`, click: () => this.command('scheduler') },
          { type: 'separator' },
          { role: 'close' }
        ]
      },
      { role: 'editMenu' },
      {
        role: 'viewMenu',
        submenu: [
          ...(isDev ? ([{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }] as MenuItemConstructorOptions[]) : []),
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      { role: 'windowMenu' }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  }

  // ------------------------------------------------------------ kapanış

  async shutdown(): Promise<void> {
    this.quitting = true
    this.scheduler.stop()
    if (this.clipboardTimer) clearInterval(this.clipboardTimer)
    await this.bridge.stop()
    await this.manager.shutdown()
    this.settingsStore.flush()
    this.queueStore.flush(this.queues)
    this.windowStore.flush()
  }

  markQuitting(): void {
    this.quitting = true
  }
}

// ---------------------------------------------------------------- uygulama yaşam döngüsü

// Test/duman testi için: ayrı veri klasörü ve otomatik ekran görüntüsü
if (process.env.DM_USER_DATA) app.setPath('userData', process.env.DM_USER_DATA)

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const controller = new Controller()
  let pendingProtocolUrl: string | null = process.argv.find((a) => a.startsWith(`${PROTOCOL}://`)) ?? null
  let ready = false

  if (process.defaultApp && process.argv[1]) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [process.argv[1]])
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL)
  }
  if (process.platform === 'win32') app.setAppUserModelId('com.tngokce.downloadmanager')

  app.on('open-url', (e, url) => {
    e.preventDefault()
    if (ready) controller.handleProtocolUrl(url)
    else pendingProtocolUrl = url
  })

  app.on('second-instance', (_e, argv) => {
    const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`))
    if (url) controller.handleProtocolUrl(url)
    else controller.showMainWindow()
  })

  app.whenReady().then(async () => {
    await controller.init()
    ready = true
    if (pendingProtocolUrl) controller.handleProtocolUrl(pendingProtocolUrl)
    pendingProtocolUrl = null
    const shot = process.env.DM_SCREENSHOT
    const open = process.env.DM_OPEN
    if (open === 'settings' || open === 'scheduler' || open === 'batch') setTimeout(() => controller.command(open), 1500)
    if (shot) {
      const { writeFileSync } = await import('node:fs')
      setTimeout(async () => {
        const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows().find((w) => w.isVisible()) ?? controller.mainWindow
        const img = await win?.webContents.capturePage()
        if (img) writeFileSync(shot, img.toPNG())
        app.quit()
      }, Number(process.env.DM_SCREENSHOT_DELAY ?? 2500))
    }
  })

  app.on('activate', () => controller.showMainWindow())
  app.on('window-all-closed', () => {
    /* tepside çalışmaya devam; çıkış tepsi menüsünden veya Cmd+Q ile */
  })

  let shuttingDown = false
  app.on('before-quit', () => controller.markQuitting())
  app.on('will-quit', (e) => {
    if (shuttingDown) return
    e.preventDefault()
    shuttingDown = true
    // İlerlemenin diske yazılmasını bekle, sonra çık.
    controller
      .shutdown()
      .catch((err) => console.error(err))
      .finally(() => app.exit(0))
  })
}
