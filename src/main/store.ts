import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Atomik JSON deposu: önce geçici dosyaya yazar, sonra yeniden adlandırır.
 * Elektrik kesintisi veya çökme anında yarım yazılmış dosya oluşmaz.
 */
export class JsonStore<T> {
  private readonly path: string
  private timer: NodeJS.Timeout | null = null
  private pending: T | null = null

  constructor(
    dir: string,
    name: string,
    private readonly delayMs = 1500
  ) {
    mkdirSync(dir, { recursive: true })
    this.path = join(dir, name)
  }

  load(): T | undefined {
    if (!existsSync(this.path)) return undefined
    try {
      return JSON.parse(readFileSync(this.path, 'utf8')) as T
    } catch (err) {
      // Bozuk dosyayı silme; incelenebilsin diye kenara al.
      renameSync(this.path, `${this.path}.corrupt-${Date.now()}`)
      console.error(`[store] ${this.path} okunamadı:`, err)
      return undefined
    }
  }

  /** Gecikmeli kaydet (sık değişen veriler için) */
  save(data: T): void {
    this.pending = data
    if (this.timer) return
    this.timer = setTimeout(() => this.flush(), this.delayMs)
  }

  /** Bekleyen kaydı hemen yaz */
  flush(data?: T): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    const value = data ?? this.pending
    this.pending = null
    if (value === null || value === undefined) return
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, JSON.stringify(value))
    renameSync(tmp, this.path)
  }
}
