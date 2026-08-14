import { useState } from 'react'
import { Link } from 'react-router'
import { playMatchday, type PublicFixture } from '../../api'

// Spelschemat grupperat per omgång. Ett spelat resultat länkar till referatet —
// det sparades när matchen spelades och ser alltid likadant ut. Vem som helst
// inloggad får spela nästa omgång: serien är gemensam, inte någons egen.
export function Fixtures({
  fixtures,
  canPlay = false,
  onPlayed,
}: {
  fixtures: PublicFixture[]
  canPlay?: boolean
  onPlayed?: () => void
}) {
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')

  // Schemat läggs på servern först när första omgången spelas. Knappen måste
  // alltså finnas redan när schemat är tomt — annars går serien inte att
  // starta alls, och den som just skrivit på sin trupp står och stampar.
  const hasSchedule = fixtures.length > 0

  if (!hasSchedule && !canPlay) {
    return <p className="roster-note">Spelschemat läggs när serien startar.</p>
  }

  async function play() {
    if (playing) return
    setPlaying(true)
    setError('')
    const result = await playMatchday()
    setPlaying(false)

    if (!result.ok) {
      setError(
        result.error === 'season_finished'
          ? 'Serien är färdigspelad.'
          : (result.message ?? 'Omgången kunde inte spelas. Försök igen.'),
      )
      return
    }
    onPlayed?.()
  }

  const matchdays = [...new Set(fixtures.map((f) => f.matchday))].sort((a, b) => a - b)
  const allPlayed = hasSchedule && fixtures.every((f) => f.played)

  return (
    <div className="fixtures">
      {!hasSchedule && (
        <p className="roster-note">
          Schemat läggs när första omgången spelas — då låses trupperna och serien är igång.
        </p>
      )}
      {canPlay && !allPlayed && (
        <p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={playing}
            onClick={() => void play()}
          >
            {playing ? 'Spelar…' : hasSchedule ? 'Spela nästa omgång' : 'Spela första omgången'}
          </button>
        </p>
      )}
      {error && <p className="quote-error">{error}</p>}
      {matchdays.map((day) => (
        <section key={day} className="matchday" aria-label={`Omgång ${day}`}>
          <h4>Omgång {day}</h4>
          <ul className="fixture-list">
            {fixtures
              .filter((f) => f.matchday === day)
              .map((f) => (
                <li key={f.id} className="fixture">
                  <span className="fixture-team home">{f.home.name}</span>
                  {f.played ? (
                    <Link
                      className="fixture-score"
                      to={`/manager/match/${f.id}`}
                      title="Läs referatet"
                    >
                      {f.homeScore}–{f.awayScore}
                    </Link>
                  ) : (
                    <span className="fixture-score unplayed">–</span>
                  )}
                  <span className="fixture-team away">{f.away.name}</span>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
