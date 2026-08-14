import { Link } from 'react-router'
import type { PublicFixture } from '../../api'

// Spelschemat grupperat per omgång. Ett spelat resultat länkar till referatet —
// det sparades när matchen spelades och ser alltid likadant ut.
export function Fixtures({ fixtures }: { fixtures: PublicFixture[] }) {
  if (fixtures.length === 0) {
    return <p className="roster-note">Spelschemat läggs när serien startar.</p>
  }

  const matchdays = [...new Set(fixtures.map((f) => f.matchday))].sort((a, b) => a - b)

  return (
    <div className="fixtures">
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
