import { useState } from 'react'
import { ActivityNote } from './activityNote'
import {
  TRAINING_CAP,
  trainPlayer,
  trainingGain,
  type ManagerAttrKey,
  type ManagerView,
} from '../../api'

const ATTRS: ManagerAttrKey[] = ['SIK', 'SKA', 'FRA', 'TÅL', 'NYT', 'TID']

// Träningen: ett pass höjer ett attribut på en egen gubbe med en förutsägbar,
// avtagande kurva — ingen tärning. Knappen visar vad passet ger innan det
// skickas; servern räknar själv och har sista ordet.
export function TrainingDesk({
  view,
  onView,
}: {
  view: ManagerView
  onView: (v: ManagerView) => void
}) {
  const team = view.myTeam!
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const windowOpen = team.trainingLeft > 0

  async function train(playerKey: string, attr: ManagerAttrKey) {
    if (saving) return
    setSaving(true)
    setError('')
    const result = await trainPlayer(playerKey, attr)
    setSaving(false)

    if (!result.ok) {
      setError(result.message ?? 'Passet gick inte att genomföra. Försök igen.')
      return
    }
    onView(result.data)
  }

  return (
    <div className="manager-block">
      <h3>Träningen</h3>
      {/* Utan förklaringen dyker ett extra pass upp ur tomma intet. */}

      <p className="manager-budget">
        {windowOpen
          ? `${team.trainingLeft} pass kvar före nästa omgång — låga betyg växer snabbast, vid ${TRAINING_CAP} är det stopp`
          : 'omgångens pass är gjorda — lira lite CS2 så öppnar fler'}
      </p>

      <ActivityNote activity={team.activity} />
      {error && <p className="quote-error">{error}</p>}

      {/* tabIndex gör den rullbara ytan nåbar med tangentbord, se
          leagueTable.tsx. */}
      <div className="pool-wrap" tabIndex={0}>
        <table className="pool-table training-table" aria-label="Träningen">
          <thead>
            <tr>
              <th scope="col">Spelare</th>
              {ATTRS.map((attr) => (
                <th key={attr} scope="col" className="num">
                  {attr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.squad.map((p) => (
              <tr key={p.key}>
                <td>{p.name}</td>
                {ATTRS.map((attr) => {
                  const rating = p.ratings[attr]
                  const maxed = rating >= TRAINING_CAP
                  return (
                    <td key={attr} className="num">
                      <button
                        type="button"
                        className="pick-btn"
                        disabled={saving || !windowOpen || maxed}
                        title={
                          maxed
                            ? `${p.name} är färdigtränad i ${attr}`
                            : `Träna ${attr}: ${rating} → ${rating + trainingGain(rating)}`
                        }
                        onClick={() => void train(p.key, attr)}
                      >
                        {rating}
                        {!maxed && <span className="gain">+{trainingGain(rating)}</span>}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
