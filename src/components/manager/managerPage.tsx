import { useCallback, useEffect, useState } from 'react'
import { fetchManagerView, type ManagerView, type PoolPlayer } from '../../api'
import { useLiveEvent } from '../../useLiveEvents'
import { Fixtures } from './fixtures'
import { LeagueTable } from './leagueTable'

// Läsvyn är öppen — man ska kunna titta på tabellen och poolen utan att logga
// in. Knapparna (starta säsong, bygga trupp, spela omgång) kommer i nästa steg.
export function ManagerPage() {
  const [view, setView] = useState<ManagerView | null | 'loading'>('loading')

  useEffect(() => {
    let cancelled = false
    void fetchManagerView().then((v) => {
      if (!cancelled) setView(v)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Någon annan har spelat en omgång — hämta om vyn så att tabellen och
  // schemat uppdateras för den som redan har sidan öppen.
  const reload = useCallback(() => {
    void fetchManagerView().then(setView)
  }, [])
  useLiveEvent('league', reload)

  return (
    <main>
      <section id="manager">
        <div className="container">
          <div className="section-head">
            <span className="index">CS</span>
            <h2>Manager</h2>
          </div>

          {view === 'loading' && <p className="roster-note">Hämtar säsongen…</p>}

          {view === null && (
            <p className="roster-note">
              Managern kunde inte nås just nu — prova igen om en liten stund.
            </p>
          )}

          {view !== 'loading' && view !== null && view.season === null && (
            <p className="roster-note">
              Ingen säsong igång ännu. Här drar CS Manager igång: varje gubbe bygger ett lag av
              klanens spelare, serien spelas omgång för omgång och tabellen skiljer agnarna från
              vetet.
            </p>
          )}

          {view !== 'loading' && view !== null && view.season !== null && (
            <SeasonBody view={view} />
          )}
        </div>
      </section>
    </main>
  )
}

function SeasonBody({ view }: { view: ManagerView }) {
  return (
    <>
      <p className="manager-season">
        Säsong: <strong>{view.season!.name}</strong> · {view.teams.length} lag
      </p>

      {view.myTeam && (
        <div className="manager-block">
          <h3>{view.myTeam.name}</h3>
          {view.myTeam.squad.length === 0 ? (
            <p className="roster-note">Truppen är tom — dags att skriva på några gubbar.</p>
          ) : (
            <>
              <ul className="squad-list">
                {view.myTeam.squad.map((p) => (
                  <li key={p.key}>
                    <span>{p.name}</span>
                    <span className="value">{p.value.toLocaleString('sv-SE')}</span>
                  </li>
                ))}
              </ul>
              <p className="manager-budget">
                {view.myTeam.spent.toLocaleString('sv-SE')} av {view.budget.toLocaleString('sv-SE')}{' '}
                spenderat
              </p>
            </>
          )}
        </div>
      )}

      <div className="manager-block">
        <h3>Tabellen</h3>
        <LeagueTable table={view.table} />
      </div>

      <div className="manager-block">
        <h3>Spelschemat</h3>
        <Fixtures fixtures={view.fixtures} />
      </div>

      <div className="manager-block">
        <h3>Spelarpoolen</h3>
        <Pool pool={view.pool} />
      </div>
    </>
  )
}

function Pool({ pool }: { pool: PoolPlayer[] }) {
  if (pool.length === 0) {
    return <p className="roster-note">Poolen fryses när säsongen startar.</p>
  }

  // Dyrast först — det är stjärnorna man kommer hit för att titta på.
  const sorted = [...pool].sort((a, b) => b.value - a.value)

  return (
    <div className="pool-wrap">
      <table className="pool-table" aria-label="Spelarpoolen">
        <thead>
          <tr>
            <th scope="col">Spelare</th>
            <th scope="col" className="num">
              Värde
            </th>
            <th scope="col">Kontrakt</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => (
            <tr key={p.key} className={p.takenBy ? 'taken' : undefined}>
              <td>{p.name}</td>
              <td className="num">{p.value.toLocaleString('sv-SE')}</td>
              <td>{p.takenBy ?? 'Ledig'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
