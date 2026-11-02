'use strict'
const api = globalThis.browser ?? globalThis.chrome
const t = (k) => api.i18n.getMessage(k) || k
const $ = (id) => document.getElementById(id)
const msg = (m) => new Promise((resolve) => api.runtime.sendMessage(m, resolve))

document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)))

function fmtSize(n) {
  if (!n) return ''
  const u = ['B', 'KB', 'MB', 'GB']
  let i = 0
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++ }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`
}

function label(m) {
  try {
    const u = new URL(m.url)
    return decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || u.hostname)
  } catch { return m.url }
}

async function main() {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true })
  const status = await msg({ type: 'status' })
  const connected = status && status.connected
  $('status').textContent = connected ? t('appConnected') : t('appNotRunning')
  $('status').className = `status ${connected ? 'ok' : 'off'}`
  if (!connected) {
    $('offline').hidden = false
    $('offline').textContent = t('appNotRunningHelp')
  } else if (status.config && !status.config.enabled) {
    $('offline').hidden = false
    $('offline').textContent = t('integrationDisabledInApp')
  }
  $('enabled').checked = !!(status && status.enabled)
  $('enabled').addEventListener('change', (e) => msg({ type: 'setEnabled', enabled: e.target.checked }))

  const { list } = (tab && (await msg({ type: 'media', tabId: tab.id }))) || { list: [] }
  $('nomedia').hidden = list.length > 0
  for (const m of list) {
    const li = document.createElement('li')
    const info = document.createElement('div')
    info.className = 'info'
    const name = document.createElement('div')
    name.className = 'name'
    name.textContent = label(m)
    name.title = m.url
    const meta = document.createElement('div')
    meta.className = 'meta'
    meta.textContent = [m.kind === 'hls' ? 'HLS' : m.mime, fmtSize(m.size)].filter(Boolean).join(' · ')
    info.append(name, meta)
    const btn = document.createElement('button')
    btn.textContent = t('download')
    btn.disabled = !connected
    btn.addEventListener('click', async () => {
      btn.disabled = true
      const r = await msg({ type: 'sendMedia', tabId: tab.id, media: m })
      btn.textContent = r && r.ok ? t('sent') : t('failed')
    })
    li.append(info, btn)
    $('media').append(li)
  }

  $('all').disabled = !connected || !tab || !/^https?:/.test(tab.url || '')
  $('all').addEventListener('click', async () => {
    $('all').disabled = true
    const r = await msg({ type: 'sendAllLinks', tabId: tab.id })
    $('all').textContent = r && r.ok ? t('sent') : t('failed')
    if (r && r.ok) setTimeout(() => window.close(), 600)
  })
}
main()
