import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { Api } from './api'

const invoke =
  (channel: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args)

function subscribe<T>(channel: string) {
  return (cb: (payload: T) => void) => {
    const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  }
}

const api: Api = {
  getState: invoke(IPC.getState) as Api['getState'],
  probe: invoke(IPC.probe) as Api['probe'],
  add: invoke(IPC.add) as Api['add'],
  addMany: invoke(IPC.addMany) as Api['addMany'],
  start: invoke(IPC.start) as Api['start'],
  pause: invoke(IPC.pause) as Api['pause'],
  remove: invoke(IPC.remove) as Api['remove'],
  redownload: invoke(IPC.redownload) as Api['redownload'],
  refreshAddress: invoke(IPC.refreshAddress) as Api['refreshAddress'],
  update: invoke(IPC.update) as Api['update'],
  moveToQueue: invoke(IPC.moveToQueue) as Api['moveToQueue'],
  reorder: invoke(IPC.reorder) as Api['reorder'],
  startAll: invoke(IPC.startAll) as Api['startAll'],
  pauseAll: invoke(IPC.pauseAll) as Api['pauseAll'],
  clearCompleted: invoke(IPC.clearCompleted) as Api['clearCompleted'],
  computeHash: invoke(IPC.computeHash) as Api['computeHash'],
  openFile: invoke(IPC.openFile) as Api['openFile'],
  showInFolder: invoke(IPC.showInFolder) as Api['showInFolder'],
  chooseDirectory: invoke(IPC.chooseDirectory) as Api['chooseDirectory'],
  importList: invoke(IPC.importList) as Api['importList'],
  exportList: invoke(IPC.exportList) as Api['exportList'],
  setSettings: invoke(IPC.setSettings) as Api['setSettings'],
  resetSettings: invoke(IPC.resetSettings) as Api['resetSettings'],
  setQueue: invoke(IPC.setQueue) as Api['setQueue'],
  deleteQueue: invoke(IPC.deleteQueue) as Api['deleteQueue'],
  startQueue: invoke(IPC.startQueue) as Api['startQueue'],
  stopQueue: invoke(IPC.stopQueue) as Api['stopQueue'],
  getPendingAdd: invoke(IPC.getPendingAdd) as Api['getPendingAdd'],
  resolvePendingAdd: invoke(IPC.resolvePendingAdd) as Api['resolvePendingAdd'],
  getPendingBatch: invoke(IPC.getPendingBatch) as Api['getPendingBatch'],
  cancelPostAction: invoke(IPC.cancelPostAction) as Api['cancelPostAction'],
  openExternal: invoke(IPC.openExternal) as Api['openExternal'],
  openExtensionFolder: invoke(IPC.openExtensionFolder) as Api['openExtensionFolder'],
  closeWindow: invoke(IPC.closeWindow) as Api['closeWindow'],
  readClipboardUrl: invoke(IPC.readClipboardUrl) as Api['readClipboardUrl'],
  writeClipboard: (text) => ipcRenderer.send('clipboard:write', text),

  onDownloadsAdded: subscribe(IPC.evDownloadsAdded),
  onDownloadsPatched: subscribe(IPC.evDownloadsPatched),
  onDownloadsRemoved: subscribe(IPC.evDownloadsRemoved),
  onLive: subscribe(IPC.evLive),
  onSettings: subscribe(IPC.evSettings),
  onQueues: subscribe(IPC.evQueues),
  onShowBatch: subscribe(IPC.evShowBatch),
  onPostAction: subscribe(IPC.evPostAction),
  onCommand: subscribe(IPC.evCommand)
}

contextBridge.exposeInMainWorld('api', api)
