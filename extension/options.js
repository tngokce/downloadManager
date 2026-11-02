'use strict'
const api = globalThis.browser ?? globalThis.chrome
const t = (k) => api.i18n.getMessage(k) || k
document.querySelectorAll('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n)))
const port = document.getElementById('port')
api.storage.local.get({ port: '' }).then((s) => (port.value = s.port || ''))
document.getElementById('save').addEventListener('click', async () => {
  const v = Number(port.value)
  await api.storage.local.set({ port: v >= 1024 && v <= 65535 ? v : '' })
  document.getElementById('saved').textContent = t('optionsSaved')
})
