import { useState } from 'react'
import { makeTransfer, type ManagerView } from '../../api'

function kr(n: number): string {
  return n.toLocaleString('sv-SE')
}

// Seriefasen: truppen är låst och all förändring går via marknaden. En affär
// är sälj-en-köp-en, atomiskt — truppen är alltid exakt fem. Servern validerar
// allt igen; det här speglar reglerna och visar serverns besked rakt av.
export function TransferDesk({
  view,
  onView,
}: {
  view: ManagerView
  onView: (v: ManagerView) => void
}) {
  const team = view.myTeam!
  const [sellKey, setSellKey] = useState<string | null>(null)
  // Aktiviteten kan ha öppnat en extra affär — samma förklaring som i
  // träningen, så den inte dyker upp oförklarad här heller.
  const [buyKey, setBuyKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selling = team.squad.find((p) => p.key === sellKey) ?? null
  const buying = view.pool.find((p) => p.key === buyKey) ?? null
  const soldFor = selling ? Math.floor(selling.value * view.sellRate) : 0
  const fundsAfter = team.funds + soldFor - (buying?.value ?? 0)

  const windowOpen = team.transfersLeft > 0
  const ready = selling !== null && buying !== null && fundsAfter >= 0 && windowOpen

  async function submit() {
    if (saving || !selling || !buying) return
    setSaving(true)
    setError('')
    const result = await makeTransfer(selling.key, buying.key)
    setSaving(false)

    if (!result.ok) {
      setError(result.message ?? 'Affären gick inte igenom. Försök igen.')
      return
    }
    setSellKey(null)
    setBuyKey(null)
    onView(result.data)
  }

  // Dyrast först, som i truppbyggaren.
  const freeAgents = [...view.pool]
    .filter((p) => p.takenBy === null)
    .sort((a, b) => b.value - a.value)

  return (
    <div className="manager-block">
      <h3>{team.name}</h3>

      <p className="manager-budget">
        Kassa: {kr(team.funds)} · försäljning ger {Math.round(view.sellRate * 100)} % av värdet ·{' '}
        {/* Kvoten kunde bara vara ett innan tvärspelspoängen fanns, så
            singularen räckte. Nu kan den vara fler. */}
        {windowOpen
          ? `${team.transfersLeft} ${team.transfersLeft === 1 ? 'affär' : 'affärer'} kvar före nästa omgång`
          : 'omgångens affär är gjord — fönstret öppnar när omgången spelats'}
      </p>

      <div className="transfer-desk">
        <div className="transfer-side">
          <h4>Truppen — välj vem som säljs</h4>
          <ul className="squad-list">
            {team.squad.map((p) => (
              <li key={p.key} className={p.key === sellKey ? 'selected' : undefined}>
                <span>{p.name}</span>
                <span className="value">{kr(p.value)}</span>
                <button
                  type="button"
                  className="pick-btn"
                  onClick={() => {
                    setError('')
                    setSellKey(p.key === sellKey ? null : p.key)
                  }}
                >
                  {p.key === sellKey ? 'Ångra' : 'Sälj'}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="transfer-side">
          <h4>Lediga gubbar — välj vem som köps</h4>
          <div className="pool-wrap">
            <table className="pool-table" aria-label="Lediga gubbar">
              <thead>
                <tr>
                  <th scope="col">Spelare</th>
                  <th scope="col" className="num">
                    Pris
                  </th>
                  <th scope="col" aria-label="Val" />
                </tr>
              </thead>
              <tbody>
                {freeAgents.map((p) => (
                  <tr key={p.key} className={p.key === buyKey ? 'selected' : undefined}>
                    <td>{p.name}</td>
                    <td className="num">{kr(p.value)}</td>
                    <td className="pick">
                      <button
                        type="button"
                        className="pick-btn"
                        onClick={() => {
                          setError('')
                          setBuyKey(p.key === buyKey ? null : p.key)
                        }}
                      >
                        {p.key === buyKey ? 'Ångra' : 'Köp'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selling && buying && (
        <p className={`manager-budget${fundsAfter < 0 ? ' over' : ''}`}>
          Säljer {selling.name} för {kr(soldFor)} · köper {buying.name} för {kr(buying.value)} ·
          kassa efter: {kr(fundsAfter)}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary"
        disabled={saving || !ready}
        onClick={() => void submit()}
      >
        {saving ? 'Genomför…' : 'Genomför affären'}
      </button>
      {error && <p className="quote-error">{error}</p>}
    </div>
  )
}
