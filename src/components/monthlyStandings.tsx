import { useEffect, useState } from 'react'
import { fetchMonthlyStatus, type MonthlyStatus } from '../api'

// Löpande ställning för Månadens BVS:are, visad på både kontosidan (så var
// och en ser var hen ligger) och admin-sidan (så det syns att mätningen
// fungerar innan kröningen faktiskt sker).
export function MonthlyStandings() {
  const [status, setStatus] = useState<MonthlyStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchMonthlyStatus().then((s) => {
      if (!cancelled) setStatus(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!status) return null

  return (
    <div className="monthly-standings">
      <h3>Månadens BVS:are</h3>
      <p className="roster-note">
        Viktad speltid i klanens spel den här månaden, med ett tak per spel — bredd slår att grinda
        ett enda spel. Stängd Steam-profil samplas aldrig och ger noll poäng; det är inget personligt,
        ingen mäts den vägen.
      </p>

      {status.lastMonth && (
        <p className="monthly-winner">
          Förra månadens vinnare: <strong>{status.lastMonth.personaName}</strong> (
          {status.lastMonth.score.toFixed(1)} p)
        </p>
      )}

      {status.standings.length === 0 ? (
        <p className="roster-note">Ingen ställning att visa än.</p>
      ) : (
        <ol className="monthly-standings-list">
          {status.standings.map((row) => (
            <li key={row.steamid64}>
              <span className="who">{row.personaName}</span>
              <span className="what">{row.score.toFixed(1)} p</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
