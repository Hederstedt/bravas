import { useState } from 'react'
import { saveSquad, type ManagerView, type PoolPlayer } from '../../api'

function kr(n: number): string {
  return n.toLocaleString('sv-SE')
}

// Truppbyggaren: välj exakt fem ur poolen inom budgeten och skriv på. Servern
// validerar allt igen — det här speglar bara reglerna så att de flesta felen
// stoppas innan de skickas, och serverns besked visas som det är när någon
// ändå hann före.
export function SquadBuilder({
  view,
  onView,
}: {
  view: ManagerView
  onView: (v: ManagerView) => void
}) {
  const team = view.myTeam!
  const [selected, setSelected] = useState<string[]>(team.squad.map((p) => p.key))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const byKey = new Map(view.pool.map((p) => [p.key, p]))
  const cost = selected.reduce((sum, key) => sum + (byKey.get(key)?.value ?? 0), 0)
  const overBudget = cost > view.budget
  const full = selected.length >= view.squadSize

  function toggle(player: PoolPlayer) {
    setError('')
    setSelected((current) =>
      current.includes(player.key)
        ? current.filter((k) => k !== player.key)
        : [...current, player.key],
    )
  }

  async function submit() {
    if (saving) return
    setSaving(true)
    setError('')
    const result = await saveSquad(selected)
    setSaving(false)

    if (!result.ok) {
      // Serverns meddelande är skrivet för managern — visa det rakt av.
      setError(result.message ?? 'Truppen kunde inte sparas. Försök igen.')
      return
    }
    onView(result.data)
    setSelected(result.data.myTeam?.squad.map((p) => p.key) ?? [])
  }

  // Dyrast först — det är stjärnorna man kommer hit för att titta på.
  const sorted = [...view.pool].sort((a, b) => b.value - a.value)

  return (
    <div className="manager-block">
      <h3>{team.name}</h3>

      <p className={`manager-budget${overBudget ? ' over' : ''}`}>
        Trupp: {selected.length}/{view.squadSize} · {kr(cost)} av {kr(view.budget)}
      </p>

      <button
        type="button"
        className="btn btn-primary"
        disabled={saving || selected.length !== view.squadSize || overBudget}
        onClick={() => void submit()}
      >
        {saving ? 'Skriver på…' : 'Skriv på truppen'}
      </button>
      {error && <p className="quote-error">{error}</p>}

      {/* tabIndex gör den rullbara ytan nåbar med tangentbord, se
          leagueTable.tsx. */}
      <div className="pool-wrap" tabIndex={0}>
        <table className="pool-table" aria-label="Spelarpoolen">
          <thead>
            <tr>
              <th scope="col">Spelare</th>
              <th scope="col" className="num">
                Värde
              </th>
              <th scope="col">Kontrakt</th>
              <th scope="col" aria-label="Val" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const isMine = selected.includes(p.key)
              const takenByOther = p.takenBy !== null && p.takenBy !== team.name
              return (
                <tr key={p.key} className={takenByOther ? 'taken' : undefined}>
                  <td>{p.name}</td>
                  <td className="num">{kr(p.value)}</td>
                  <td>{takenByOther ? p.takenBy : isMine ? team.name : 'Ledig'}</td>
                  <td className="pick">
                    {isMine ? (
                      <button type="button" className="pick-btn" onClick={() => toggle(p)}>
                        Ta bort
                      </button>
                    ) : takenByOther ? null : (
                      <button
                        type="button"
                        className="pick-btn"
                        disabled={full}
                        onClick={() => toggle(p)}
                      >
                        Välj
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
