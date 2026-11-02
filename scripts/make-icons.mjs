// SVG simgelerden PNG üretir. Çalıştırma: npm run icons  (Electron ile)
import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const appSvg = readFileSync(join(root, 'resources/icon.svg'), 'utf8')
const traySvg = readFileSync(join(root, 'resources/tray.svg'), 'utf8')
const colorTray = traySvg.replaceAll('#000', '#2563eb').replace('<rect', '<rect fill="#2563eb"').replaceAll('<rect x=', '<rect fill="#2563eb" x=')

const jobs = [
  [appSvg, 1024, 'resources/icon.png'],
  [appSvg, 256, 'resources/icon-256.png'],
  [traySvg, 16, 'resources/trayTemplate.png'],
  [traySvg, 32, 'resources/trayTemplate@2x.png'],
  [colorTray, 32, 'resources/tray.png'],
  [appSvg, 16, 'extension/icons/16.png'],
  [appSvg, 32, 'extension/icons/32.png'],
  [appSvg, 48, 'extension/icons/48.png'],
  [appSvg, 128, 'extension/icons/128.png']
]

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, frame: false, transparent: true, webPreferences: { offscreen: true } })
  for (const [svg, size, out] of jobs) {
    win.setContentSize(size, size)
    const html = `<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
    await new Promise((r) => setTimeout(r, 150))
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: size, height: size })
    const png = img.resize({ width: size, height: size, quality: 'best' }).toPNG()
    mkdirSync(dirname(join(root, out)), { recursive: true })
    writeFileSync(join(root, out), png)
    console.log('✓', out, `${size}x${size}`)
  }
  app.quit()
})
