import { useEffect, useState } from 'react'
import { fetchMembersResult, type ApiFetch, type RosterMember } from './api'

type Result = ApiFetch<RosterMember[]>

// Roster (hela laguppställningen) och About (bara antalet) ville förut båda
// hämta rostern var för sig — ett normalt startsidesbesök gjorde två
// identiska anrop till /api/members. cached/pending delas mellan alla
// monterade konsumenter, och subscribers gör att en omladdning (t.ex. Rosters
// "Försök igen") uppdaterar alla samtidigt, inte bara den som tryckte.
let pending: Promise<Result> | null = null
let cached: Result | null = null
const subscribers = new Set<(r: Result) => void>()

function load(): void {
  // fetchMembersResult() fångar redan sina egna fel och svarar { ok: false }
  // — men cachen delas nu av flera komponenter, så ett oväntat kastat fel ska
  // aldrig få möjligheten att tysta ner alla av dem på en gång.
  pending ??= fetchMembersResult()
    .catch((): Result => ({ ok: false }))
    .then((r) => {
      cached = r
      pending = null
      for (const notify of subscribers) notify(r)
      return r
    })
}

export function useMembers(): { result: Result | null; reload: () => void } {
  const [result, setResult] = useState<Result | null>(cached)

  useEffect(() => {
    subscribers.add(setResult)
    if (cached) setResult(cached)
    else load()
    return () => {
      subscribers.delete(setResult)
    }
  }, [])

  return {
    result,
    reload: () => {
      cached = null
      load()
    },
  }
}

// Testerna byter ut fetchMembersResult per fall, så cachen måste kunna
// nollställas mellan dem.
export function resetMembersCache(): void {
  pending = null
  cached = null
  subscribers.clear()
}
