import { useState } from 'react'
import { MAX_TEAM_NAME, startSeason, STEAM_LOGIN_URL } from '../../api'

// Ingen säsong igång. Vem som helst i klanen får dra igång den — servern
// lämnar tillbaka en pågående säsong i stället för att skapa en till, så två
// som trycker samtidigt hamnar i samma serie.
export function SeasonLobby({ signedIn, onStarted }: { signedIn: boolean; onStarted: () => void }) {
  const [name, setName] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || starting) return

    setStarting(true)
    setError('')
    const result = await startSeason(name.trim())
    setStarting(false)

    if (!result.ok) {
      setError(result.message ?? 'Säsongen kunde inte startas. Försök igen.')
      return
    }
    onStarted()
  }

  return (
    <>
      <p className="roster-note">
        Ingen säsong igång ännu. Så här funkar det: poolen fryses med gubbarnas kort som de står
        i dag, varje manager bygger ett lag för 20 000, serien spelas omgång för omgång och
        tabellen skiljer agnarna från vetet.
      </p>

      {signedIn ? (
        <form className="quote-form" onSubmit={submit}>
          <label>
            Vad ska säsongen heta?
            <input
              value={name}
              maxLength={MAX_TEAM_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="Garageligan"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={starting}>
            {starting ? 'Startar…' : 'Starta säsongen'}
          </button>
          {error && <p className="quote-error">{error}</p>}
        </form>
      ) : (
        <p className="roster-note">Logga in med Steam för att dra igång säsongen.</p>
      )}
      {!signedIn && (
        <p>
          <a className="btn btn-primary" href={STEAM_LOGIN_URL}>
            Logga in med Steam
          </a>
        </p>
      )}
    </>
  )
}
