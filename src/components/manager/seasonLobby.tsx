import { useState } from 'react'
import { MAX_TEAM_NAME, startSeason, STEAM_LOGIN_URL, type FinishedSeason } from '../../api'
import { LeagueTable } from './leagueTable'

// Ingen säsong igång. Vem som helst i klanen får dra igång den — servern
// lämnar tillbaka en pågående säsong i stället för att skapa en till, så två
// som trycker samtidigt hamnar i samma serie.
//
// Har en säsong just spelats färdigt visas dess sluttabell här. Utan den
// känns säsongsslutet som att allt raderades: lobbyn dyker upp och serien man
// nyss spelade fram är borta.
export function SeasonLobby({
  signedIn,
  onStarted,
  lastFinished,
}: {
  signedIn: boolean
  onStarted: () => void
  lastFinished?: FinishedSeason | null
}) {
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

  const champion = lastFinished?.table[0]

  return (
    <>
      {lastFinished ? (
        <p className="roster-note">
          <strong>{lastFinished.name}</strong> är färdigspelad
          {champion && (
            <>
              {' '}
              — <strong>{champion.name}</strong> tog hem den på {champion.points} poäng
            </>
          )}
          . Dags för nästa: poolen fryses om med gubbarnas kort som de står i dag, och alla
          bygger nytt lag för 20 000.
        </p>
      ) : (
        <p className="roster-note">
          Ingen säsong igång ännu. Så här funkar det: poolen fryses med gubbarnas kort som de står
          i dag, varje manager bygger ett lag för 20 000, serien spelas omgång för omgång och
          tabellen skiljer agnarna från vetet.
        </p>
      )}

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

      {lastFinished && (
        <div className="manager-block">
          <h3>Så slutade {lastFinished.name}</h3>
          <LeagueTable table={lastFinished.table} botTeams={new Set(lastFinished.botTeamIds)} />
        </div>
      )}
    </>
  )
}
