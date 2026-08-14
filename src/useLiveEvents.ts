import { useEffect } from 'react'

// En enda ström för hela sidan. Rostern och citatväggen lyssnar båda, och två
// EventSource mot samma endpoint hade kostat två anslutningar utan att ge något.
//
// Sidan fungerar utan strömmen. Varje sektion hämtar sitt innehåll vid
// montering som förut; det här lägger bara till att de får veta när något
// ändrats av någon annan.

type Handler = (data: unknown) => void

const handlers = new Map<string, Set<Handler>>()
let source: EventSource | null = null

function openSource() {
  if (source || typeof EventSource === 'undefined') return

  source = new EventSource('/api/events')

  // EventSource återansluter själv vid avbrott, så det finns inget att göra
  // här utöver att inte krascha. Går strömmen aldrig att öppna står sidan
  // kvar på det den hämtade vid laddning.
  source.onerror = () => {}

  for (const name of handlers.keys()) attach(name)
}

const attached = new Set<string>()

function attach(name: string) {
  if (!source || attached.has(name)) return
  attached.add(name)
  source.addEventListener(name, (event) => {
    let data: unknown = null
    try {
      data = JSON.parse((event as MessageEvent).data as string)
    } catch {
      // En trasig nyttolast ska inte hindra lyssnarna från att uppdatera sig.
    }
    for (const handler of handlers.get(name) ?? []) handler(data)
  })
}

function closeIfIdle() {
  if (!source) return
  for (const set of handlers.values()) if (set.size > 0) return
  source.close()
  source = null
  attached.clear()
}

export function subscribeToEvent(name: string, handler: Handler): () => void {
  const set = handlers.get(name) ?? new Set<Handler>()
  set.add(handler)
  handlers.set(name, set)

  openSource()
  attach(name)

  return () => {
    set.delete(handler)
    closeIfIdle()
  }
}

// Handler hålls i en ref-liknande stängning via useEffect-beroendet: skickar
// anroparen in en ny funktion varje render skulle strömmen annars kopplas om
// vid varje omritning.
export function useLiveEvent(name: string, handler: Handler): void {
  useEffect(() => subscribeToEvent(name, handler), [name, handler])
}

// Bara för tester.
export function resetLiveEvents(): void {
  handlers.clear()
  attached.clear()
  source?.close()
  source = null
}
