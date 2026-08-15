import type { TableRow } from '../../api'

// Ren presentation — sortering och särskiljning är redan gjorda på servern.
// botTeams märker ut det datorstyrda motståndet, så ingen undrar vem som
// managar "Lagg IF".
export function LeagueTable({
  table,
  botTeams,
}: {
  table: TableRow[]
  botTeams?: ReadonlySet<number>
}) {
  if (table.length === 0) {
    return <p className="roster-note">Tabellen fylls på när serien drar igång.</p>
  }

  return (
    <div className="league-table-wrap">
      <table className="league-table" aria-label="Ligatabellen">
        <thead>
          <tr>
            <th scope="col" className="num">
              #
            </th>
            <th scope="col">Lag</th>
            <th scope="col" className="num" title="Spelade">
              S
            </th>
            <th scope="col" className="num" title="Vunna">
              V
            </th>
            <th scope="col" className="num" title="Oavgjorda">
              O
            </th>
            <th scope="col" className="num" title="Förlorade">
              F
            </th>
            <th scope="col" className="num" title="Rundor, vunna–förlorade">
              Rundor
            </th>
            <th scope="col" className="num" title="Rundskillnad">
              +/−
            </th>
            <th scope="col" className="num" title="Poäng">
              P
            </th>
          </tr>
        </thead>
        <tbody>
          {table.map((row, i) => (
            <tr key={row.teamId}>
              <td className="num">{i + 1}</td>
              <td>
                {row.name}
                {botTeams?.has(row.teamId) && (
                  <span className="bot-badge" title="Datorstyrt lag">
                    BOT
                  </span>
                )}
              </td>
              <td className="num">{row.played}</td>
              <td className="num">{row.won}</td>
              <td className="num">{row.drawn}</td>
              <td className="num">{row.lost}</td>
              <td className="num">
                {row.roundsFor}–{row.roundsAgainst}
              </td>
              <td className="num">{row.diff > 0 ? `+${row.diff}` : row.diff}</td>
              <td className="num points">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
