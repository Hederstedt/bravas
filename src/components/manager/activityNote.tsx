import type { ActivityBonus } from '../../api'

function hours(value: number): string {
  return `${value.toLocaleString('sv-SE', { maximumFractionDigits: 1 })} h`
}

// Vad man lirat ihop sedan förra omgången, och vad det gav. Utan den här raden
// dyker ett extra träningspass upp utan förklaring, och då ser det ut som en
// bugg i stället för en belöning.
//
// Betygen rörs aldrig av det här — poolen är fryst, se docs/manager.md. Det
// som växer är hur mycket managern får göra före nästa match.
export function ActivityNote({ activity }: { activity: ActivityBonus }) {
  const { hours: played, training, transfer } = activity
  const anyTime = played.cs2 > 0 || played.other > 0

  if (!anyTime) {
    return (
      <p className="activity-note">
        Lirar du CS2 före nästa omgång öppnar fler träningspass, och tid i klanens andra spel ger
        en extra affär.
      </p>
    )
  }

  const earned: string[] = []
  if (training > 0) earned.push(training === 1 ? 'ett extra pass' : `${training} extra pass`)
  if (transfer > 0) earned.push('en extra affär')

  const spent: string[] = []
  if (played.cs2 > 0) spent.push(`${hours(played.cs2)} CS2`)
  if (played.other > 0) spent.push(`${hours(played.other)} i klanens andra spel`)

  return (
    <p className="activity-note earned">
      <strong>{spent.join(' och ')}</strong> sedan förra omgången
      {earned.length > 0 ? ` — det gav ${earned.join(' och ')}.` : '. Lira lite till så ger det utdelning.'}
    </p>
  )
}
