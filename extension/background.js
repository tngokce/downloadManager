// Gökçe Download Manager tarayıcı eklentisi — arka plan betiği (Chrome MV3 service worker / Firefox background script)
'use strict'

const api = globalThis.browser ?? globalThis.chrome
const IS_FIREFOX = typeof globalThis.browser !== 'undefined' && navigator.userAgent.includes('Firefox')
const DEFAULT_PORT = 53771
const PORT_RANGE = 5
const MEDIA_MIN_BYTES = 512 * 1024
const MAX_MEDIA_PER_TAB = 40

// Uygulama kapalıyken tarayıcıya geri bırakılan indirmeler tekrar yakalanmasın
const skipUrls = new Set()
let cached = { port: null, config: null, at: 0 }

const t = (key) => api.i18n.getMessage(key) || key

// ---------------------------------------------------------------- uygulama bağlantısı

async function userSettings() {
  const s = await api.storage.local.get({ enabled: true, port: '' })
  return { enabled: s.enabled !== false, port: Number(s.port) || null }
}

async function fetchJson(url, init = {}, timeoutMs = 1500) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: 'no-store' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** Uygulamayı bulur (önbellek 5 sn). Bulunamazsa null. */
async function connect(force = false) {
  if (!force && cached.port && Date.now() - cached.at < 5000) return cached
  const { port: custom } = await userSettings()
  const ports = custom ? [custom] : [cached.port, ...Array.from({ length: PORT_RANGE }, (_, i) => DEFAULT_PORT + i)].filter(Boolean)
  for (const port of [...new Set(ports)]) {
    const r = await fetchJson(`http://127.0.0.1:${port}/ping`, {}, 700)
    if (r && r.app === 'download-manager') {
      cached = { port, config: r.config, version: r.version, at: Date.now() }
      return cached
    }
  }
  cached = { port: null, config: null, at: Date.now() }
  return null
}

async function send(path, body) {
  const conn = await connect()
  if (!conn) return false
  const r = await fetchJson(
    `http://127.0.0.1:${conn.port}${path}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) },
    4000
  )
  return !!(r && r.ok)
}

async function cookieHeader(url, incognito) {
  try {
    const query = { url }
    if (incognito) query.storeId = IS_FIREFOX ? 'firefox-private' : '1'
    const list = await api.cookies.getAll(query)
    return list.map((c) => `${c.name}=${c.value}`).join('; ') || undefined
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------- yardımcılar

function baseName(path) {
  return (path || '').split(/[\\/]/).pop() || ''
}

function nameFromUrl(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || '')
  } catch {
    return ''
  }
}

function extOf(name) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || '')
  return m ? m[1].toLowerCase() : ''
}

function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return ''
  }
}

function isExcluded(config, ...urls) {
  const sites = config.excludedSites || []
  return urls.some((u) => {
    const h = hostOf(u)
    return h && sites.some((s) => h === s || h.endsWith('.' + s))
  })
}

// ---------------------------------------------------------------- indirme yakalama

async function shouldCapture(item) {
  const { enabled } = await userSettings()
  if (!enabled) return null
  const url = item.finalUrl || item.url
  if (!/^(https?|ftp):/i.test(url)) return null // blob:, data: → tarayıcıda kalsın
  if (skipUrls.has(item.url) || skipUrls.has(url)) {
    skipUrls.delete(item.url)
    skipUrls.delete(url)
    return null
  }
  const conn = await connect()
  if (!conn || !conn.config || !conn.config.enabled) return null
  const cfg = conn.config
  const fileName = baseName(item.filename) || nameFromUrl(url)
  const ext = extOf(fileName) || extOf(nameFromUrl(url))
  if (!cfg.interceptExtensions.includes(ext)) return null
  const size = item.totalBytes > 0 ? item.totalBytes : item.fileSize > 0 ? item.fileSize : 0
  if (size && cfg.minSizeKB && size < cfg.minSizeKB * 1024) return null
  if (isExcluded(cfg, url, item.referrer)) return null
  return { url, fileName, size }
}

async function capture(item) {
  const decision = await shouldCapture(item)
  if (!decision) return false
  try {
    await api.downloads.cancel(item.id)
    await api.downloads.erase({ id: item.id })
  } catch {
    /* zaten bitmiş olabilir */
  }
  const ok = await send('/add', {
    url: item.url,
    finalUrl: item.finalUrl,
    fileName: decision.fileName,
    referrer: item.referrer || undefined,
    cookies: await cookieHeader(decision.url, item.incognito),
    userAgent: navigator.userAgent,
    mime: item.mime,
    fileSize: decision.size || undefined
  })
  if (!ok) {
    // Uygulamaya ulaşılamadı: indirmeyi tarayıcıya geri ver
    skipUrls.add(item.url)
    api.downloads.download({ url: item.url })
  }
  return true
}

if (api.downloads.onDeterminingFilename) {
  // Chrome: gerçek dosya adı (Content-Disposition) bu aşamada bilinir
  api.downloads.onDeterminingFilename.addListener((item, suggest) => {
    capture(item)
      .catch(() => false)
      .finally(() => {
        try {
          suggest()
        } catch {
          /* indirme iptal edildi */
        }
      })
    return true
  })
} else {
  // Firefox
  api.downloads.onCreated.addListener((item) => {
    if (item.state === 'in_progress') capture(item).catch(() => undefined)
  })
}

// ---------------------------------------------------------------- medya (video) algılama

const SEGMENT_RE = /\.(ts|m4s|m4f|aac|vtt|webvtt|key)(\?|$)/i
const IGNORE_RE = /(googlevideo\.com\/videoplayback|[?&]range=\d|\/range\/\d|\.mpd(\?|$))/i

async function mediaFor(tabId) {
  const key = `media:${tabId}`
  const r = await api.storage.session.get(key)
  return r[key] || []
}

async function setMedia(tabId, list) {
  await api.storage.session.set({ [`media:${tabId}`]: list })
  api.action.setBadgeText({ tabId, text: list.length ? String(list.length) : '' })
  api.action.setBadgeBackgroundColor({ tabId, color: '#2563eb' })
}

function headerValue(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name)
  return h ? h.value : ''
}

api.webRequest.onHeadersReceived.addListener(
  (d) => {
    if (d.tabId < 0 || d.statusCode >= 400) return
    const url = d.url
    if (IGNORE_RE.test(url)) return
    const type = headerValue(d.responseHeaders, 'content-type').toLowerCase()
    const isHls = /mpegurl/.test(type) || /\.m3u8(\?|$)/i.test(url)
    const isMedia = /^(video|audio)\//.test(type) && !/mp2t|iso.segment/.test(type)
    if (!isHls && !isMedia) return
    if (!isHls && SEGMENT_RE.test(url)) return
    let size = 0
    const cr = /\/(\d+)$/.exec(headerValue(d.responseHeaders, 'content-range'))
    if (cr) size = Number(cr[1])
    else size = Number(headerValue(d.responseHeaders, 'content-length')) || 0
    if (isMedia && size && size < MEDIA_MIN_BYTES) return
    void (async () => {
      const list = await mediaFor(d.tabId)
      const key = url.split('#')[0]
      if (list.some((m) => m.url === key)) return
      list.unshift({ url: key, kind: isHls ? 'hls' : 'http', mime: type.split(';')[0], size: isHls ? 0 : size, at: Date.now() })
      await setMedia(d.tabId, list.slice(0, MAX_MEDIA_PER_TAB))
    })()
  },
  { urls: ['<all_urls>'], types: ['media', 'xmlhttprequest', 'other'] },
  ['responseHeaders']
)

api.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'loading' && info.url) void setMedia(tabId, [])
})
api.tabs.onRemoved.addListener((tabId) => void api.storage.session.remove(`media:${tabId}`))

async function sendMedia(tab, media) {
  return send('/add', {
    url: media.url,
    kind: media.kind,
    referrer: tab.url,
    cookies: await cookieHeader(media.url, tab.incognito),
    userAgent: navigator.userAgent,
    mime: media.mime,
    fileSize: media.size || undefined,
    title: (tab.title || 'video').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 120)
  })
}

// ---------------------------------------------------------------- sağ tık menüleri

function createMenus() {
  api.contextMenus.removeAll(() => {
    api.contextMenus.create({ id: 'dm-link', title: t('menuDownloadLink'), contexts: ['link'] })
    api.contextMenus.create({ id: 'dm-media', title: t('menuDownloadMedia'), contexts: ['video', 'audio', 'image'] })
    api.contextMenus.create({ id: 'dm-selection', title: t('menuDownloadSelection'), contexts: ['selection'] })
    api.contextMenus.create({ id: 'dm-all', title: t('menuDownloadAll'), contexts: ['page'] })
  })
}
api.runtime.onInstalled.addListener(createMenus)
api.runtime.onStartup?.addListener(createMenus)

/** Sayfadaki (veya seçimdeki) tüm bağlantıları toplar — sayfa içinde çalışır */
function collectLinks(selectionOnly) {
  const out = new Map()
  const add = (href, text) => {
    try {
      const u = new URL(href, location.href)
      if (/^(https?|ftp):$/.test(u.protocol) && !out.has(u.href)) out.set(u.href, (text || '').trim().slice(0, 200))
    } catch {
      /* geçersiz */
    }
  }
  let root = document
  if (selectionOnly) {
    const sel = window.getSelection()
    if (!sel || !sel.rangeCount) return []
    const frag = sel.getRangeAt(0).cloneContents()
    const div = document.createElement('div')
    div.appendChild(frag)
    root = div
  }
  root.querySelectorAll('a[href]').forEach((a) => add(a.getAttribute('href'), a.textContent))
  if (!selectionOnly) {
    root.querySelectorAll('img[src], video[src], audio[src], source[src]').forEach((el) => add(el.getAttribute('src'), ''))
  }
  return [...out.entries()].map(([url, text]) => ({ url, text }))
}

async function sendLinks(tab, selectionOnly) {
  const results = await api.scripting.executeScript({ target: { tabId: tab.id, allFrames: !selectionOnly }, func: collectLinks, args: [selectionOnly] })
  const seen = new Set()
  const items = []
  for (const r of results || []) {
    for (const l of r.result || []) {
      if (seen.has(l.url)) continue
      seen.add(l.url)
      items.push({ url: l.url, referrer: tab.url })
    }
  }
  if (!items.length) return false
  return send('/batch', { items, referrer: tab.url })
}

async function notifyFailure() {
  const conn = await connect(true)
  if (conn) return
  api.notifications?.create({ type: 'basic', iconUrl: 'icons/128.png', title: t('extName'), message: t('appNotRunningHelp') })
}

api.contextMenus.onClicked.addListener(async (info, tab) => {
  let ok = false
  if (info.menuItemId === 'dm-link' && info.linkUrl) {
    ok = await send('/add', {
      url: info.linkUrl,
      referrer: info.pageUrl,
      cookies: await cookieHeader(info.linkUrl, tab && tab.incognito),
      userAgent: navigator.userAgent
    })
  } else if (info.menuItemId === 'dm-media' && info.srcUrl && /^https?:/.test(info.srcUrl)) {
    ok = await sendMedia(tab, { url: info.srcUrl, kind: /\.m3u8(\?|$)/i.test(info.srcUrl) ? 'hls' : 'http' })
  } else if (info.menuItemId === 'dm-media' && tab) {
    // blob: kaynaklı video — algılanan akışlardan en uygununu gönder
    const list = await mediaFor(tab.id)
    const best = list.find((m) => m.kind === 'hls') || list[0]
    if (best) ok = await sendMedia(tab, best)
  } else if ((info.menuItemId === 'dm-all' || info.menuItemId === 'dm-selection') && tab) {
    ok = await sendLinks(tab, info.menuItemId === 'dm-selection')
  }
  if (!ok) void notifyFailure()
})

// ---------------------------------------------------------------- açılır pencere ve içerik betiği mesajları

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  ;(async () => {
    switch (msg && msg.type) {
      case 'status': {
        const conn = await connect(true)
        const s = await userSettings()
        return { connected: !!conn, config: conn && conn.config, version: conn && conn.version, enabled: s.enabled }
      }
      case 'setEnabled':
        await api.storage.local.set({ enabled: !!msg.enabled })
        return { ok: true }
      case 'media':
        return { list: await mediaFor(msg.tabId) }
      case 'sendMedia': {
        const tab = await api.tabs.get(msg.tabId)
        return { ok: await sendMedia(tab, msg.media) }
      }
      case 'sendAllLinks': {
        const tab = await api.tabs.get(msg.tabId)
        return { ok: await sendLinks(tab, false) }
      }
      case 'contentConfig': {
        const conn = await connect()
        const s = await userSettings()
        return { videoButton: !!(conn && conn.config && conn.config.enabled && conn.config.videoButton && s.enabled), label: t('videoButton') }
      }
      case 'videoClick': {
        const tab = sender.tab
        if (!tab) return { ok: false }
        let ok = false
        if (msg.src && /^https?:/.test(msg.src)) {
          ok = await sendMedia(tab, { url: msg.src, kind: /\.m3u8(\?|$)/i.test(msg.src) ? 'hls' : 'http' })
        } else {
          const list = await mediaFor(tab.id)
          const best = list.find((m) => m.kind === 'hls') || list.filter((m) => m.kind === 'http').sort((a, b) => b.size - a.size)[0]
          if (best) ok = await sendMedia(tab, best)
        }
        if (!ok) void notifyFailure()
        return { ok }
      }
      default:
        return null
    }
  })().then(sendResponse, () => sendResponse(null))
  return true
})
