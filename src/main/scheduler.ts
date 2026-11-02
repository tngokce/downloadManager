import type { Queue } from '@shared/types'

export interface SchedulerHooks {
  queues(): Queue[]
  start(queueId: string): void
  stop(queueId: string): void
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/**
 * Kuyrukları belirlenen saatte başlatır/durdurur. Her 15 sn'de bir kontrol eder;
 * aynı dakika içinde aynı işlem iki kez tetiklenmez. Bilgisayar uykudaysa
 * kaçırılan başlama saati, uyanınca durma saatinden önceyse yine uygulanır.
 */
export class Scheduler {
  private timer: NodeJS.Timeout | null = null
  private readonly fired = new Set<string>()
  private lastCheck = new Date()

  constructor(private readonly hooks: SchedulerHooks) {}

  start(): void {
    this.stop()
    this.timer = setInterval(() => this.check(new Date()), 15_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  check(now: Date): void {
    const prev = this.lastCheck
    this.lastCheck = now
    const today = now.toDateString()
    for (const q of this.hooks.queues()) {
      const s = q.schedule
      if (!s.enabled) continue
      if (s.days.length && !s.days.includes(now.getDay())) continue
      const t = hhmm(now)
      const inWindow = (time: string) => !!time && (t === time || (hhmm(prev) < time && t > time && prev.toDateString() === today))
      const startKey = `${q.id}:start:${today}:${s.startTime}`
      const stopKey = `${q.id}:stop:${today}:${s.stopTime}`
      if (inWindow(s.startTime) && !this.fired.has(startKey) && !(s.stopTime && t >= s.stopTime && s.stopTime > s.startTime)) {
        this.fired.add(startKey)
        this.hooks.start(q.id)
      }
      if (inWindow(s.stopTime) && !this.fired.has(stopKey)) {
        this.fired.add(stopKey)
        this.hooks.stop(q.id)
      }
    }
    if (this.fired.size > 500) this.fired.clear()
  }
}
