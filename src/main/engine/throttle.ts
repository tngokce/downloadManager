import { setTimeout as sleep } from 'node:timers/promises'

/**
 * Token-bucket hız sınırlayıcı. Birden çok bağlantı aynı nesneyi paylaşır; borç modeliyle
 * her tüketici aldığı bayt kadar bekler, böylece toplam hız sınıra oturur.
 */
export class SpeedLimiter {
  private rate = 0
  private tokens = 0
  private last = performance.now()

  constructor(bytesPerSecond = 0) {
    this.setRate(bytesPerSecond)
  }

  /** 0 = sınırsız */
  setRate(bytesPerSecond: number): void {
    this.rate = Math.max(0, bytesPerSecond)
    this.tokens = Math.min(this.tokens, this.rate)
    this.last = performance.now()
  }

  get bytesPerSecond(): number {
    return this.rate
  }

  async consume(bytes: number, signal?: AbortSignal): Promise<void> {
    if (!this.rate) return
    const now = performance.now()
    this.tokens = Math.min(this.rate, this.tokens + ((now - this.last) / 1000) * this.rate)
    this.last = now
    this.tokens -= bytes
    if (this.tokens < 0) {
      const waitMs = (-this.tokens / this.rate) * 1000
      await sleep(Math.min(waitMs, 10_000), undefined, { signal })
    }
  }
}
