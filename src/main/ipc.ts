import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { AddRequest, DownloadItem, HashAlgorithm, Queue, Settings } from '@shared/types'
import { MAIN_QUEUE_ID } from '@shared/defaults'
import { isHttpUrl } from '@shared/format'
import { IPC } from '@shared/ipc'
import { errorCode } from './engine'
import { resourcePath, type Controller } from './index'

const HASHES: HashAlgorithm[] = ['md5', 'sha1', 'sha256', 'sha512']

function ids(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

export function registerIpc(c: Controller): void {
  const m = () => c.manager
  const item = (id: unknown): DownloadItem | undefined => (typeof id === 'string' ? m().items.get(id) : undefined)
  const handle = (channel: string, fn: (...args: unknown[]) => unknown) =>
    ipcMain.handle(channel, (_e, ...args: unknown[]) => fn(...args))

  handle(IPC.getState, () => c.state())

  handle(IPC.probe, async (url, headers) => {
    if (typeof url !== 'string' || !isHttpUrl(url)) return { error: 'invalidUrl' }
    const dup = m().findDuplicate(url.trim())
    try {
      const result = await m().probe(url.trim(), (headers as Record<string, string>) ?? {})
      return { result, duplicate: dup ? { id: dup.id, status: dup.status } : undefined }
    } catch (err) {
      return { error: errorCode(err), duplicate: dup ? { id: dup.id, status: dup.status } : undefined }
    }
  })

  handle(IPC.add, (req) => {
    const r = req as AddRequest
    if (!r || typeof r.url !== 'string' || !isHttpUrl(r.url)) throw new Error('invalidUrl')
    return m().add({ ...r, start: r.start ?? c.settings.autoStart })
  })

  handle(IPC.addMany, (reqs, start) => {
    const list = (Array.isArray(reqs) ? reqs : []).filter((r: AddRequest) => r && typeof r.url === 'string' && isHttpUrl(r.url)) as AddRequest[]
    return m().addMany(list.map((r) => ({ ...r, start: start === undefined ? c.settings.autoStart : !!start })))
  })

  handle(IPC.start, (v) => m().start(ids(v)))
  handle(IPC.pause, (v) => m().pause(ids(v)))
  handle(IPC.startAll, () => m().startAll())
  handle(IPC.pauseAll, () => m().pauseAll())
  handle(IPC.clearCompleted, () => m().clearCompleted())
  handle(IPC.redownload, (id) => (typeof id === 'string' ? m().redownload(id) : undefined))
  handle(IPC.reorder, (v) => m().reorder(ids(v)))
  handle(IPC.moveToQueue, (v, q) => (typeof q === 'string' ? m().moveToQueue(ids(v), q) : undefined))

  handle(IPC.remove, async (v, deleteFiles) => {
    const list = ids(v)
    if (deleteFiles) {
      // Bitmiş dosyalar kalıcı silinmez, çöp kutusuna/geri dönüşüm kutusuna taşınır.
      for (const id of list) {
        const it = item(id)
        if (it?.status === 'completed') {
          const p = join(it.directory, it.fileName)
          if (existsSync(p)) await shell.trashItem(p).catch(() => undefined)
        }
      }
    }
    await m().remove(list, false)
  })

  handle(IPC.refreshAddress, (id, url) => {
    if (typeof id !== 'string' || typeof url !== 'string' || !isHttpUrl(url)) throw new Error('invalidUrl')
    return m().refreshAddress(id, url)
  })

  handle(IPC.update, (id, changes) => (typeof id === 'string' && changes && typeof changes === 'object' ? m().update(id, changes) : undefined))

  handle(IPC.computeHash, (id, algo) => {
    if (typeof id !== 'string' || !HASHES.includes(algo as HashAlgorithm)) throw new Error('invalid')
    return m().computeHash(id, algo as HashAlgorithm)
  })

  handle(IPC.openFile, async (id) => {
    const it = item(id)
    if (!it) return
    const p = join(it.directory, it.fileName)
    if (it.status === 'completed' && existsSync(p)) await shell.openPath(p)
    else await shell.openPath(it.directory)
  })

  handle(IPC.showInFolder, async (id) => {
    const it = item(id)
    if (!it) return
    const p = join(it.directory, it.fileName)
    if (existsSync(p)) shell.showItemInFolder(p)
    else await shell.openPath(it.directory)
  })

  ipcMain.handle(IPC.chooseDirectory, async (e, current) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const r = await dialog.showOpenDialog(win!, {
      defaultPath: typeof current === 'string' ? current : c.settings.defaultDirectory,
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle(IPC.importList, async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const r = await dialog.showOpenDialog(win!, { properties: ['openFile'], filters: [{ name: 'Text', extensions: ['txt', 'csv', 'lst'] }] })
    if (r.canceled || !r.filePaths[0]) return null
    const text = await readFile(r.filePaths[0], 'utf8')
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => isHttpUrl(l))
  })

  ipcMain.handle(IPC.exportList, async (e, v) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined
    const r = await dialog.showSaveDialog(win!, { defaultPath: 'downloads.txt', filters: [{ name: 'Text', extensions: ['txt'] }] })
    if (r.canceled || !r.filePath) return false
    const selected = ids(v)
    const list = m()
      .list()
      .filter((i) => !selected.length || selected.includes(i.id))
      .map((i) => i.url)
    await writeFile(r.filePath, list.join('\n') + '\n', 'utf8')
    return true
  })

  handle(IPC.setSettings, (patch) => c.updateSettings((patch ?? {}) as Partial<Settings>))
  handle(IPC.resetSettings, () => c.resetSettings())

  handle(IPC.setQueue, (q) => {
    const queue = q as Queue
    if (!queue?.id || typeof queue.name !== 'string') throw new Error('invalid')
    const exists = c.queues.some((x) => x.id === queue.id)
    c.saveQueues(exists ? c.queues.map((x) => (x.id === queue.id ? { ...x, ...queue, builtin: x.builtin } : x)) : [...c.queues, { ...queue, builtin: false }])
    return c.queues
  })

  handle(IPC.deleteQueue, (id) => {
    const q = c.queues.find((x) => x.id === id)
    if (!q || q.builtin) return c.queues
    const affected = m()
      .list()
      .filter((i) => i.queueId === id)
      .map((i) => i.id)
    m().moveToQueue(affected, MAIN_QUEUE_ID)
    c.saveQueues(c.queues.filter((x) => x.id !== id))
    return c.queues
  })

  handle(IPC.startQueue, (id) => (typeof id === 'string' ? m().startQueue(id) : undefined))
  handle(IPC.stopQueue, (id) => (typeof id === 'string' ? m().stopQueue(id) : undefined))

  handle(IPC.getPendingAdd, (token) => (typeof token === 'string' ? (c.pendingAdds.get(token) ?? null) : null))
  handle(IPC.resolvePendingAdd, (token, req) => {
    if (typeof token !== 'string') return null
    const r = req as AddRequest | null
    if (r && (typeof r.url !== 'string' || !isHttpUrl(r.url))) throw new Error('invalidUrl')
    return c.resolvePendingAdd(token, r)
  })
  handle(IPC.getPendingBatch, (token) => {
    if (typeof token !== 'string') return null
    const b = c.pendingBatches.get(token) ?? null
    c.pendingBatches.delete(token)
    return b
  })

  handle(IPC.cancelPostAction, (runNow) => (runNow === true ? c.executePostAction() : c.cancelPostAction()))

  handle(IPC.openExternal, (url) => {
    if (typeof url === 'string' && /^https?:\/\//.test(url)) void shell.openExternal(url)
  })

  handle(IPC.openExtensionFolder, () => shell.openPath(resourcePath('extension')))

  ipcMain.handle(IPC.closeWindow, (e) => BrowserWindow.fromWebContents(e.sender)?.close())

  handle(IPC.readClipboardUrl, async () => {
    const text = (await clipboard.readText()).trim()
    return isHttpUrl(text) && !text.includes('\n') ? text : null
  })

  ipcMain.on('clipboard:write', (_e, text) => {
    if (typeof text === 'string') c.writeClipboard(text)
  })
}
