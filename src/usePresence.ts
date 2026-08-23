import { useEffect, useState } from 'react'
import { fetchPresence, type PresenceMap } from './api'
import { useLiveEvent } from './useLiveEvents'

// Närvaron delas mellan Gubbarna och live-pillen i navbaren. Utan det här
// hämtar de var sin kopia av /api/presence vid varje sidladdning — samma
// misstag som rostern och Om BVS gjorde med /api/members innan useMembers
// fanns, och e2e-testet i smoke.spec.ts vaktar numera båda.
let cached: PresenceMap | null = null
let pending: Promise<PresenceMap> | null = null
const subscribers = new Set<(p: PresenceMap) => void>()

function publish(next: PresenceMap): void {
  cached = next
  for (const notify of subscribers) notify(next)
}

function load(): void {
  pending ??= fetchPresence()
    .catch((): PresenceMap => ({}))
    .then((p) => {
      pending = null
      publish(p)
      return p
    })
}

export function usePresence(): { presence: PresenceMap; reload: () => void } {
  const [presence, setPresence] = useState<PresenceMap>(cached ?? {})

  useEffect(() => {
    subscribers.add(setPresence)
    if (!cached) load()
    return () => {
      subscribers.delete(setPresence)
    }
  }, [])

  // Pollern säger till när någon loggat in i ett spel. Flera konsumenter kan
  // lyssna — uppdateringen skriver samma cache och väcker alla på en gång, så
  // prickarna på korten och siffran i navbaren kan aldrig visa olika saker.
  useLiveEvent('presence', (data) => {
    const next = (data as { presence?: PresenceMap } | null)?.presence
    if (next) publish(next)
  })

  return {
    presence,
    reload: () => {
      cached = null
      load()
    },
  }
}

// Testerna byter ut fetchPresence per fall, så cachen måste kunna nollställas
// mellan dem.
export function resetPresenceCache(): void {
  cached = null
  pending = null
  subscribers.clear()
}
