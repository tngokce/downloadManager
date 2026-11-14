// Tüm uygulama, tepsi ve eklenti simgelerini tek kaynaktan (resources/logo.png) üretir.
// Çalıştırma: npm run icons  (Electron ile; ek bağımlılık gerekmez)
//
// Logoyu değiştirmek için resources/logo.png dosyasını yenisiyle değiştirip komutu yeniden çalıştırın.
// Kaynak kare olmak zorunda değildir; şeffaf kenarlarla kareye tamamlanır.
import { app, nativeImage } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** BGRA bitmap'i verilen kenar uzunluğunda şeffaf bir kareye ortalar. */
function padToSquare(img) {
  const { width, height } = img.getSize()
  const side = Math.max(width, height)
  const src = img.toBitmap()
  const out = Buffer.alloc(side * side * 4)
  const ox = Math.floor((side - width) / 2)
  const oy = Math.floor((side - height) / 2)
  for (let y = 0; y < height; y++) src.copy(out, ((y + oy) * side + ox) * 4, y * width * 4, (y + 1) * width * 4)
  return nativeImage.createFromBitmap(out, { width: side, height: side })
}

/** Logoyu `size` boyutunda bir tuvale, içerik `size * scale` olacak şekilde ortalayarak yerleştirir. */
function render(square, size, scale = 1) {
  const inner = Math.round(size * scale)
  const resized = square.resize({ width: inner, height: inner, quality: 'best' })
  if (inner === size) return resized
  const src = resized.toBitmap()
  const out = Buffer.alloc(size * size * 4)
  const o = Math.floor((size - inner) / 2)
  for (let y = 0; y < inner; y++) src.copy(out, ((y + o) * size + o) * 4, y * inner * 4, (y + 1) * inner * 4)
  return nativeImage.createFromBitmap(out, { width: size, height: size })
}

/**
 * macOS menü çubuğu için "template" simge: koyu alanlar siyah, açık alanlar (harf) şeffaf olur.
 * macOS bu simgeyi açık/koyu temaya göre kendisi renklendirir.
 */
function toTemplate(img) {
  const { width, height } = img.getSize()
  const px = Buffer.from(img.toBitmap())
  for (let i = 0; i < px.length; i += 4) {
    const lum = (0.114 * px[i] + 0.587 * px[i + 1] + 0.299 * px[i + 2]) / 255
    px[i + 3] = Math.round(px[i + 3] * (1 - lum))
    px[i] = px[i + 1] = px[i + 2] = 0
  }
  return nativeImage.createFromBitmap(px, { width, height })
}

const jobs = [
  // [çıktı, boyut, içerik oranı, dönüşüm]
  ['resources/icon.png', 1024, 0.86],
  ['resources/icon-256.png', 256, 0.86],
  ['resources/tray.png', 32, 1],
  ['resources/trayTemplate.png', 16, 1, toTemplate],
  ['resources/trayTemplate@2x.png', 32, 1, toTemplate],
  ['extension/icons/16.png', 16, 1],
  ['extension/icons/32.png', 32, 1],
  ['extension/icons/48.png', 48, 1],
  ['extension/icons/128.png', 128, 1],
  ['docs/assets/logo.png', 256, 1]
]

app.whenReady().then(() => {
  const source = nativeImage.createFromPath(join(root, 'resources/logo.png'))
  if (source.isEmpty()) {
    console.error('resources/logo.png okunamadı')
    app.exit(1)
    return
  }
  const square = padToSquare(source)
  for (const [out, size, scale, transform] of jobs) {
    let img = render(square, size, scale)
    if (transform) img = transform(img)
    mkdirSync(dirname(join(root, out)), { recursive: true })
    writeFileSync(join(root, out), img.toPNG())
    console.log('✓', out, `${size}x${size}`)
  }
  app.quit()
})
