import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetLiveEvents, subscribeToEvent } from './useLiveEvents'

// Minimal EventSource-stubbe. jsdom har ingen, vilket i sig är en del av det
// som testas: sidan ska fungera även där den saknas.
class FakeEventSource {
  static instances: FakeEventSource[] = []
  url: string
  closed = false
  onerror: (() => void) | null = null
  private listeners = new Map<string, Set<(e: MessageEvent) => void>>()

  constructor(url: string) {
    this.url = url
    FakeEventSource.instances.push(this)
  }

  addEventListener(name: string, fn: (e: MessageEvent) => void) {
    const set = this.listeners.get(name) ?? new Set()
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

function installEventSource() {
  FakeEventSource.instances = []
  vi.stubGlobal('EventSource', FakeEventSource)
}

beforeEach(() => {
  resetLiveEvents()
  installEventSource()
})

afterEach(() => {
  resetLiveEvents()
  vi.unstubAllGlobals()
})

describe('subscribeToEvent', () => {
  it('opens one stream no matter how many listeners there are', () => {
    subscribeToEvent('quote', () => {})
    subscribeToEvent('presence', () => {})
    subscribeToEvent('quote', () => {})

    expect(FakeEventSource.instances).toHaveLength(1)
    expect(FakeEventSource.instances[0].url).toBe('/api/events')
  })

  it('hands the parsed payload to every listener for that event', () => {
    const a = vi.fn()
    const b = vi.fn()
    subscribeToEvent('quote', a)
    subscribeToEvent('quote', b)

    FakeEventSource.instances[0].emit('quote', '{"reason":"added"}')

    expect(a).toHaveBeenCalledWith({ reason: 'added' })
    expect(b).toHaveBeenCalledWith({ reason: 'added' })
  })

  it('does not wake listeners for a different event', () => {
    const onQuote = vi.fn()
    subscribeToEvent('quote', onQuote)
    subscribeToEvent('presence', () => {})

    FakeEventSource.instances[0].emit('presence', '{}')

    expect(onQuote).not.toHaveBeenCalled()
  })

  it('stops calling a listener once it unsubscribes', () => {
    const handler = vi.fn()
    const unsubscribe = subscribeToEvent('quote', handler)
    const other = subscribeToEvent('quote', () => {})

    unsubscribe()
    FakeEventSource.instances[0].emit('quote', '{}')

    expect(handler).not.toHaveBeenCalled()
    other()
  })

  it('closes the stream when the last listener goes away', () => {
    const unsubscribe = subscribeToEvent('quote', () => {})
    expect(FakeEventSource.instances[0].closed).toBe(false)

    unsubscribe()

    expect(FakeEventSource.instances[0].closed).toBe(true)
  })

  it('keeps the stream open while any listener remains', () => {
    const first = subscribeToEvent('quote', () => {})
    subscribeToEvent('presence', () => {})

    first()

    expect(FakeEventSource.instances[0].closed).toBe(false)
  })

  it('survives a payload that is not valid JSON', () => {
    // En trasig ram ska inte ta med sig sidan.
    const handler = vi.fn()
    subscribeToEvent('quote', handler)

    expect(() => FakeEventSource.instances[0].emit('quote', 'inte json')).not.toThrow()
    expect(handler).toHaveBeenCalledWith(null)
  })

  it('does nothing at all where EventSource is missing', () => {
    // Sidan hämtar redan sitt innehåll vid montering; strömmen är ett tillägg,
    // inte en förutsättning.
    resetLiveEvents()
    vi.stubGlobal('EventSource', undefined)

    expect(() => subscribeToEvent('quote', () => {})()).not.toThrow()
  })
})
