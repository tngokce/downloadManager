import { useSyncExternalStore } from 'react'
import type { AppState, DownloadItem, DownloadLive, Queue, Settings } from '@shared/types'

export interface UiState {
  ready: boolean
  downloads: Map<string, DownloadItem>
  live: Map<string, DownloadLive>
  /** Ayrıntı panelindeki hız grafiği için son ~60 sn'lik örnekler */
  history: Map<string, number[]>
  settings: Settings | null
  queues: Queue[]
  meta: Pick<AppState, 'platform' | 'version' | 'ffmpegAvailable' | 'bridgePort'>
}

const HISTORY_LEN = 120

let state: UiState = {
  ready: false,
  downloads: new Map(),
  live: new Map(),
  history: new Map(),
  settings: null,
  queues: [],
  meta: { platform: 'darwin', version: '', ffmpegAvailable: false, bridgePort: null }
}
const listeners = new Set<() => void>()

function set(patch: Partial<UiState>): void {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function getState(): UiState {
  return state
}

export function useStore(): UiState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state
  )
}

async function refreshMeta(): Promise<void> {
  const s = await window.api.getState()
  set({ meta: { platform: s.platform, version: s.version, ffmpegAvailable: s.ffmpegAvailable, bridgePort: s.bridgePort } })
}

let initialized = false

/** Ana süreçten ilk durumu alır ve olaylara abone olur (pencere başına bir kez). */
export async function initStore(): Promise<void> {
  if (initialized) return
  initialized = true
  const s = await window.api.getState()
  set({
    ready: true,
    downloads: new Map(s.downloads.map((d) => [d.id, d])),
    settings: s.settings,
    queues: s.queues,
    meta: { platform: s.platform, version: s.version, ffmpegAvailable: s.ffmpegAvailable, bridgePort: s.bridgePort }
  })
  document.documentElement.dataset.platform = s.platform

  const upsert = (items: DownloadItem[]) => {
    const next = new Map(state.downloads)
    for (const i of items) next.set(i.id, i)
    set({ downloads: next })
  }
  window.api.onDownloadsAdded(upsert)
  window.api.onDownloadsPatched(upsert)
  window.api.onDownloadsRemoved((ids) => {
    const next = new Map(state.downloads)
    for (const id of ids) next.delete(id)
    set({ downloads: next })
  })
  window.api.onLive((list) => {
    const live = new Map(list.map((l) => [l.id, l]))
    const history = new Map(state.history)
    for (const l of list) {
      const h = [...(history.get(l.id) ?? []), l.speed]
      history.set(l.id, h.length > HISTORY_LEN ? h.slice(-HISTORY_LEN) : h)
    }
    set({ live, history })
  })
  window.api.onSettings((settings) => {
    set({ settings })
    void refreshMeta()
  })
  window.api.onQueues((queues) => set({ queues }))
}
