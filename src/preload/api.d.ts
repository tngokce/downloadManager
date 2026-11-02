import type {
  AddRequest,
  AppState,
  DownloadItem,
  DownloadLive,
  HashAlgorithm,
  PendingAdd,
  PendingBatch,
  PostAction,
  ProbeResult,
  Queue,
  Settings
} from '../shared/types'

export interface ProbeResponse {
  result?: ProbeResult
  error?: string
  duplicate?: { id: string; status: DownloadItem['status'] }
}

export type UpdatableFields = Partial<
  Pick<DownloadItem, 'fileName' | 'directory' | 'speedLimit' | 'maxConnections' | 'note' | 'headers' | 'category' | 'checksum'>
>

export type AppCommand = { type: 'addUrl' | 'batch' | 'settings' | 'scheduler' | 'sound' }

export interface Api {
  getState(): Promise<AppState>
  probe(url: string, headers?: Record<string, string>): Promise<ProbeResponse>
  add(req: AddRequest): Promise<DownloadItem>
  addMany(reqs: AddRequest[], start?: boolean): Promise<DownloadItem[]>
  start(ids: string[]): Promise<void>
  pause(ids: string[]): Promise<void>
  remove(ids: string[], deleteFiles: boolean): Promise<void>
  redownload(id: string): Promise<void>
  refreshAddress(id: string, url: string): Promise<void>
  update(id: string, changes: UpdatableFields): Promise<void>
  moveToQueue(ids: string[], queueId: string): Promise<void>
  reorder(ids: string[]): Promise<void>
  startAll(): Promise<void>
  pauseAll(): Promise<void>
  clearCompleted(): Promise<void>
  computeHash(id: string, algorithm: HashAlgorithm): Promise<string>
  openFile(id: string): Promise<void>
  showInFolder(id: string): Promise<void>
  chooseDirectory(current?: string): Promise<string | null>
  importList(): Promise<string[] | null>
  exportList(ids?: string[]): Promise<boolean>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  resetSettings(): Promise<Settings>
  setQueue(queue: Queue): Promise<Queue[]>
  deleteQueue(id: string): Promise<Queue[]>
  startQueue(id: string): Promise<void>
  stopQueue(id: string): Promise<void>
  getPendingAdd(token: string): Promise<PendingAdd | null>
  resolvePendingAdd(token: string, req: AddRequest | null): Promise<DownloadItem | null>
  getPendingBatch(token: string): Promise<PendingBatch | null>
  cancelPostAction(runNow?: boolean): Promise<void>
  openExternal(url: string): Promise<void>
  openExtensionFolder(): Promise<void>
  closeWindow(): Promise<void>
  readClipboardUrl(): Promise<string | null>
  writeClipboard(text: string): void

  onDownloadsAdded(cb: (items: DownloadItem[]) => void): () => void
  onDownloadsPatched(cb: (items: DownloadItem[]) => void): () => void
  onDownloadsRemoved(cb: (ids: string[]) => void): () => void
  onLive(cb: (live: DownloadLive[]) => void): () => void
  onSettings(cb: (s: Settings) => void): () => void
  onQueues(cb: (q: Queue[]) => void): () => void
  onShowBatch(cb: (token: string) => void): () => void
  onPostAction(cb: (p: { action: PostAction; seconds: number }) => void): () => void
  onCommand(cb: (c: AppCommand) => void): () => void
}

declare global {
  interface Window {
    api: Api
  }
}
