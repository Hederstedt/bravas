import { useEffect, useRef, useState } from 'react'

// Sektionerna på startsidan hämtar var sin sak från samma API. Ligger API:et
// nere felar de alla tre samtidigt — men var och en ritade sin egen ruta med
// sin egen "Försök igen", så ett problem såg ut som tre. Registret här låter
// dem veta om de är ensamma om att fela eller inte.
export type SectionKey = 'gubbarna' | 'siffrorna' | 'citaten' | 'loggboken'

// Två räcker: en ensam trasig sektion är förmodligen just den sektionen (en
// spelserver som inte svarar, en tom cache), och då är det ärligare att låta
// den säga det själv än att påstå att hela sajten är nere.
const OUTAGE_THRESHOLD = 2

const failing = new Set<SectionKey>()
const reloaders = new Map<SectionKey, () => void>()
const subscribers = new Set<() => void>()

function notify(): void {
  for (const subscriber of subscribers) subscriber()
}

// Antalet trasiga sektioner, med en omritning när det ändras. Delad av både
// sektionerna och bannern, så att de aldrig kan visa olika bild av läget.
function useFailingCount(): number {
  const [, bump] = useState(0)

  useEffect(() => {
    const subscriber = () => bump((n) => n + 1)
    subscribers.add(subscriber)
    // Antalet kan ha hunnit ändras mellan renderingen och att prenumerationen
    // kom på plats — en sektion som felar snabbt hinner annars undan.
    subscriber()
    return () => {
      subscribers.delete(subscriber)
    }
  }, [])

  return failing.size
}

// Anropas av varje sektion som hämtar något: rapporterar om den felar just nu
// och lämnar sin omladdning till bannerns knapp. Svaret säger om bannern har
// tagit över beskedet — då ska sektionen inte rita en egen ruta till.
export function useSectionStatus(
  section: SectionKey,
  failed: boolean,
  reload: () => void,
): boolean {
  // Sektionernas reload-funktioner skapas om vid varje rendering. Ref:en gör
  // att registreringen inte behöver köras om för det.
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  })

  useEffect(() => {
    reloaders.set(section, () => reloadRef.current())
    return () => {
      reloaders.delete(section)
      if (failing.delete(section)) notify()
    }
  }, [section])

  useEffect(() => {
    if (failed === failing.has(section)) return
    if (failed) failing.add(section)
    else failing.delete(section)
    notify()
  }, [section, failed])

  return useFailingCount() >= OUTAGE_THRESHOLD
}

export function useApiOutage(): { outage: boolean; retry: () => void } {
  const count = useFailingCount()

  return {
    outage: count >= OUTAGE_THRESHOLD,
    // Kopia först: omladdningarna svarar och tömmer mängden medan vi går
    // igenom den.
    retry: () => {
      for (const section of [...failing]) reloaders.get(section)?.()
    },
  }
}

// Registret är modulnivå och överlever mellan testfall, precis som
// medlemscachen.
export function resetApiOutage(): void {
  failing.clear()
  reloaders.clear()
  subscribers.clear()
}
