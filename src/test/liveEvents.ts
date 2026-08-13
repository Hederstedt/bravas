import { vi } from 'vitest'
import { resetLiveEvents } from '../useLiveEvents'

// jsdom har ingen EventSource. Den här stubben låter tester mata in händelser
// som om servern skickat dem, utan att någon ström öppnas.
class FakeEventSource {
  static instances: FakeEventSource[] = []
  closed = false
  onerror: (() => void) | null = null
  private listeners = new Map<string, Set<(e: MessageEvent) => void>>()

  url: string

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(name: string, fn: (e: MessageEvent) => void) {
    const set = this.listeners.get(name) ?? new Set<(e: MessageEvent) => void>()
    set.add(fn)
    this.listeners.set(name, set)
  }

  close() {
    this.closed = true
  }

  emit(name: string, data: string) {
    for (const fn of this.listeners.get(name) ?? []) fn({ data } as MessageEvent)
  }
}

export function installLiveEvents(): void {
  resetLiveEvents()
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
}

export function teardownLiveEvents(): void {
  resetLiveEvents()
  vi.unstubAllGlobals()
}

// Skickar en händelse till allt som prenumererar, precis som servern hade gjort.
export function emitLiveEvent(name: string, data: unknown): void {
  for (const instance of FakeEventSource.instances) {
    instance.emit(name, JSON.stringify(data))
  }
}
