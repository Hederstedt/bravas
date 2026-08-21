import { useCallback, useEffect, useState } from 'react'
import { fetchManagerView, fetchSession, type ManagerView, type PoolPlayer } from '../../api'
import { useLiveEvent } from '../../useLiveEvents'
import { Fixtures } from './fixtures'
import { LeagueTable } from './leagueTable'
import { SeasonLobby } from './seasonLobby'
import { SquadBuilder } from './squadBuilder'
import { TeamForm } from './teamForm'
import { TrainingDesk } from './trainingDesk'
import { TransferDesk } from './transferDesk'

// Läsvyn är öppen — man ska kunna titta på tabellen och poolen utan att logga
// in. Sessionen avgör vilka knappar som visas, servern avgör vad som får göras.
export function ManagerPage() {
  const [view, setView] = useState<ManagerView | null | 'loading'>('loading')
  const [signedIn, setSignedIn] = useState(false)

  useEffect(() => {
    let cancelled = false
    void fetchManagerView().then((v) => {
      if (!cancelled) setView(v)
    })
    void fetchSession().then((s) => {
      if (!cancelled) setSignedIn(s !== null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Någon annan har spelat en omgång — hämta om vyn så att tabellen och
  // schemat uppdateras för den som redan har sidan öppen. Samma omhämtning
  // används efter egna handlingar som inte redan svarat med en färsk vy.
  const reload = useCallback(() => {
    void fetchManagerView().then(setView)
  }, [])
  useLiveEvent('league', reload)
  // En affär någon annanstans ändrar poolen och priserna för alla, och ett
  // träningspass ändrar betyg och värde.
  useLiveEvent('transfer', reload)
  useLiveEvent('training', reload)

  return (
    <main>
      <section id="manager">
        <div className="container">
          <div className="section-head">
            <span className="index">CS</span>
            <h1>Bravas CS Manager</h1>
          </div>

          {view === 'loading' && <p className="roster-note">Hämtar säsongen…</p>}

          {view === null && (
            <p className="roster-note">
              Managern kunde inte nås just nu — prova igen om en liten stund.
            </p>
          )}

          {view !== 'loading' && view !== null && view.season === null && (
            <SeasonLobby
              signedIn={signedIn}
              onStarted={reload}
              lastFinished={view.lastFinished}
            />
          )}

          {view !== 'loading' && view !== null && view.season !== null && (
            <SeasonBody view={view} signedIn={signedIn} onView={setView} onReload={reload} />
          )}
        </div>
      </section>
    </main>
  )
}

function SeasonBody({
  view,
  signedIn,
  onView,
  onReload,
}: {
  view: ManagerView
  signedIn: boolean
  onView: (v: ManagerView) => void
  onReload: () => void
}) {
  return (
    <>
      <p className="manager-season">
        Säsong: <strong>{view.season!.name}</strong> · {view.teams.length} lag
      </p>

      {signedIn && view.myTeam === null && <TeamForm onCreated={onReload} />}

      {/* Byggfas: fri ombyggnad. Seriefas: truppen är låst — träning och
          marknad gäller. */}
      {view.myTeam !== null &&
        (view.locked ? (
          <>
            <TrainingDesk view={view} onView={onView} />
            <TransferDesk view={view} onView={onView} />
          </>
        ) : (
          <SquadBuilder view={view} onView={onView} />
        ))}

      <div className="manager-block">
        <h3>Tabellen</h3>
        <LeagueTable
          table={view.table}
          botTeams={new Set(view.teams.filter((t) => t.bot).map((t) => t.id))}
        />
      </div>

      <div className="manager-block">
        <h3>Spelschemat</h3>
        <Fixtures fixtures={view.fixtures} canPlay={signedIn} onPlayed={onReload} />
      </div>

      {view.myTeam === null && (
        <div className="manager-block">
          <h3>Spelarpoolen</h3>
          <Pool pool={view.pool} />
        </div>
      )}
    </>
  )
}

// Poolen som ren läsning — den som har ett lag ser den i truppbyggaren i
// stället, med knappar.
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
