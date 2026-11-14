// Eklentiyi Chrome (Edge/Brave/Opera/Vivaldi) ve Firefox için ayrı klasörlere ve zip dosyalarına hazırlar.
//   node scripts/build-extension.mjs  ->  extension-dist/chrome, extension-dist/firefox (+ .zip)
import { cpSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'extension')
const outDir = join(root, 'extension-dist')
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const base = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'))
base.version = version

const variants = {
  chrome: base,
  firefox: (() => {
    const m = structuredClone(base)
    m.background = { scripts: ['background.js'] }
    delete m.minimum_chrome_version
    m.browser_specific_settings = { gecko: { id: 'gokce-download-manager@tngokce', strict_min_version: '121.0' } }
    return m
  })()
}

for (const [name, manifest] of Object.entries(variants)) {
  const dir = join(outDir, name)
  cpSync(src, dir, { recursive: true })
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  const zip = join(outDir, `gokce-download-manager-${name}-${version}.zip`)
  try {
    if (process.platform === 'win32') {
      execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${dir}\\*' -DestinationPath '${zip}' -Force`])
    } else {
      execFileSync('zip', ['-qr', zip, '.'], { cwd: dir })
    }
    console.log('✓', name, '->', zip)
  } catch {
    console.log('✓', name, '->', dir, '(zip oluşturulamadı)')
  }
}
