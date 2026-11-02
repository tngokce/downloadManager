import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { PendingAdd } from '@shared/types'
import { initStore, useStore } from './store'
import { MainApp } from './components/MainApp'
import { AddDialog } from './components/AddDialog'
import { Toasts } from './components/ui'
import './styles.css'

/** Tarayıcıdan/panodan gelen indirme için açılan ayrı küçük pencere */
function AddWindow({ token }: { token: string }) {
  const [pending, setPending] = useState<PendingAdd | null | undefined>(undefined)
  useEffect(() => {
    void window.api.getPendingAdd(token).then(setPending)
  }, [token])
  if (pending === undefined) return null
  if (pending === null) {
    void window.api.closeWindow()
    return null
  }
  return (
    <div className="add-window">
      <AddDialog
        page
        initial={pending.request}
        source={pending.source}
        onCancel={() => void window.api.resolvePendingAdd(token, null)}
        onSubmit={async (req) => {
          await window.api.resolvePendingAdd(token, req)
        }}
      />
      <Toasts />
    </div>
  )
}

function Root() {
  const { ready, settings } = useStore()
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const on = () => setHash(location.hash)
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  useEffect(() => {
    if (settings) document.documentElement.lang = settings.language
  }, [settings])
  if (!ready) return null
  const add = hash.match(/^#\/add\/([\w-]+)/)
  if (add) return <AddWindow token={add[1]} />
  return <MainApp />
}

void initStore()
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
)
