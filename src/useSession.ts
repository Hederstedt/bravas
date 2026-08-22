import { useEffect, useState } from 'react'
import { fetchSession, type Session } from './api'

// Nav (alltid monterad) och SteamLogin (monterad två gånger samtidigt — en
// gång i desktopmenyn, en gång i mobilöverlägget) frågade förut var för sig.
// Ett delat anrop räcker: sessionen ändras aldrig under ett besök utan en hel
// omladdning (inloggning och utloggning navigerar båda om sidan).
let pending: Promise<Session | null> | null = null

function loadOnce(): Promise<Session | null> {
  // fetchSession() själv fångar redan sina fel och svarar null — men den här
  // cachen delas nu av flera komponenter, så ett oväntat kastat fel ska aldrig
  // få möjligheten att tysta ner alla av dem på en gång.
  pending ??= fetchSession().catch(() => null)
  return pending
}

// undefined = ännu inte hämtad, null = hämtad och ingen är inloggad. Utan den
// skillnaden hade SteamLogin inte kunnat vänta ut svaret innan den bestämmer
// sig för "Logga in med Steam" — en flimrande felaktig gissning som sedan
// byts ut är sämre än att vänta.
export function useSession(): Session | null | undefined {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    void loadOnce().then((s) => {
      if (!cancelled) setSession(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return session
}

// Testerna byter ut fetchSession per fall, så cachen måste kunna nollställas.
export function resetSessionCache(): void {
  pending = null
}
