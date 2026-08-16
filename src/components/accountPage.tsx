import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  fetchMembers,
  fetchSession,
  linkDiscord,
  logout,
  MAX_DISCORD_NAME,
  STEAM_LOGIN_URL,
  WOT_LOGIN_URL,
  type RosterMember,
} from '../api'
import { SteamIcon } from './icons'
import { MonthlyStandings } from './monthlyStandings'

type State =
  | { status: 'loading' }
  | { status: 'anonymous' }
  // mine kan saknas trots giltig session: kakan är signerad och stateless, och
  // säger inget om att det finns en rad i rostern.
  | { status: 'signed-in'; mine: RosterMember | null }

// Allt som rör den egna inloggningen på ett ställe: vilket Steam-konto sidan
// gäller, kopplingarna till Discord och World of Tanks, och vägen ut. Låg de i
// Gubbarna förut, mitt i kortraden, där de inte hörde hemma.
export function AccountPage() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [params] = useSearchParams()
  // Steam-callbacken skickar hit den som precis loggat in för första gången.
  const isNew = params.get('ny') === '1'

  // Samma mönster som SteamLogin: sessionen säger vem du är, rostern vad du
  // heter. Sidan hämtar sitt eget i stället för att ärva Gubbarnas state.
  const load = useCallback(async (): Promise<State> => {
    try {
      const session = await fetchSession()
      if (!session) return { status: 'anonymous' }
      const mine = (await fetchMembers()).find((m) => m.steamid64 === session.steamid64) ?? null
      return { status: 'signed-in', mine }
    } catch {
      return { status: 'anonymous' }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void load().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [load])

  // Efter en Discord-koppling: hämta om raden så namnet syns direkt.
  const reload = useCallback(() => {
    void load().then(setState)
  }, [load])

  return (
    <main>
      <section id="mitt-konto">
        <div className="container">
          <div className="section-head">
            <span className="index">JAG</span>
            <h2>Mitt konto</h2>
          </div>

          {state.status === 'anonymous' && (
            <>
              <p className="roster-note">
                Här bor dina kontokopplingar — Discord och World of Tanks — och knappen som loggar
                ut dig. Logga in med Steam så dyker de upp.
              </p>
              <p>
                <a className="btn btn-primary" href={STEAM_LOGIN_URL}>
                  <SteamIcon /> Logga in med Steam
                </a>
              </p>
            </>
          )}

          {state.status === 'signed-in' && (
            <>
              {isNew && (
                <p className="account-welcome">
                  Välkommen till BVS! Ditt kort finns redan i Gubbarna. Länkar du World of Tanks
                  här nedanför räknas dina strider in i betyget också — det kan bara höja det,
                  aldrig sänka.
                </p>
              )}

              {state.mine && (
                <p className="account-who">
                  {state.mine.avatarUrl && (
                    <img src={state.mine.avatarUrl} alt={state.mine.personaName} />
                  )}
                  <span>{state.mine.personaName}</span>
                </p>
              )}

              {state.mine && (
                <div className="account-links">
                  <h3>Koppla dina konton</h3>
                  <DiscordLink mine={state.mine} onLinked={reload} />
                  <WotLink mine={state.mine} />
                </div>
              )}

              <MonthlyStandings />

              <SignOut />
            </>
          )}
        </div>
      </section>
    </main>
  )
}

// En hel omladdning i stället för att nollställa varje komponents cachade
// session: SteamLogin renderas på två ställen samtidigt (desktopmenyn och
// mobilöverlägget) med var sin state, och den jakten vore betydligt bräckligare.
function SignOut() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function signOut() {
    if (busy) return
    setBusy(true)
    setError('')

    const ok = await logout()
    if (!ok) {
      setBusy(false)
      setError('Kunde inte logga ut. Försök igen.')
      return
    }
    window.location.href = '/'
  }

  return (
    <div className="account-signout">
      <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => void signOut()}>
        {busy ? 'Loggar ut…' : 'Logga ut'}
      </button>
      {error && <p className="quote-error">{error}</p>}
    </div>
  )
}

// Steam vet vad du heter i Steam, inte i Discorden — kopplingen får skrivas in
// för hand. Namnet hamnar sedan på ditt eget spelarkort i Gubbarna.
function DiscordLink({ mine, onLinked }: { mine: RosterMember; onLinked: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = name.trim()
    if (!value || saving) return

    setSaving(true)
    setError('')
    const ok = await linkDiscord(value)
    setSaving(false)

    if (!ok) {
      setError('Namnet kunde inte sparas. Försök igen.')
      return
    }
    setName('')
    setSaved(true)
    onLinked()
  }

  return (
    <form className="quote-form discord-link" onSubmit={submit}>
      <label>
        {mine.discordName ? 'Byt Discord-namn' : 'Vad heter du i Discorden?'}
        <input
          value={name}
          maxLength={MAX_DISCORD_NAME}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
          placeholder={mine.discordName ?? 'gubbe'}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Sparar…' : 'Koppla till kortet'}
      </button>
      {error && <p className="quote-error">{error}</p>}
      {saved && !error && <p className="roster-note">Sparat — namnet syns på ditt kort.</p>}
    </form>
  )
}

// Ingen egen inloggning — bara en länk till ett riktigt Wargaming-konto, samma
// idé som Discord-namnet men med en kontokoll i stället för fritext. En hel
// sidnavigering, inte ett fetch-anrop: det är en OAuth-liknande redirect ut
// till Wargaming och tillbaka.
function WotLink({ mine }: { mine: RosterMember }) {
  return (
    <p className="roster-note wot-link">
      {mine.wotNickname ? (
        <>
          Länkad mot World of Tanks som <strong>{mine.wotNickname}</strong>.{' '}
          <a href={WOT_LOGIN_URL}>Byt konto</a>
        </>
      ) : (
        <a className="btn btn-ghost" href={WOT_LOGIN_URL}>
          Länka World of Tanks
        </a>
      )}
    </p>
  )
}
