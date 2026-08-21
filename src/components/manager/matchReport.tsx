import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { fetchMatchReport, type MatchReport, type PlayerLine } from '../../api'

function Scoreboard({ title, lines }: { title: string; lines: PlayerLine[] }) {
  return (
    <div className="scoreboard">
      <h4>{title}</h4>
      <table aria-label={`Protokoll för ${title}`}>
        <thead>
          <tr>
            <th scope="col">Spelare</th>
            <th scope="col" className="num">
              K
            </th>
            <th scope="col" className="num">
              D
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((p) => (
            <tr key={p.id}>
              <td>{p.name}</td>
              <td className="num">{p.kills}</td>
              <td className="num">{p.deaths}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function MatchReportPage() {
  const { id } = useParams()
  const [state, setState] = useState<'loading' | 'missing' | MatchReport>('loading')

  useEffect(() => {
    // Samma mönster som servern: bara siffror är ett id. Allt annat är 404 —
    // ingen anledning att fråga API:et om något som inte kan finnas.
    const num = id && /^\d+$/.test(id) ? Number(id) : null
    if (num === null) {
      setState('missing')
      return
    }
    let cancelled = false
    setState('loading')
    void fetchMatchReport(num).then((r) => {
      if (!cancelled) setState(r ?? 'missing')
    })
    return () => {
      cancelled = true
    }
  }, [id])

  return (
    <main id="main" tabIndex={-1}>
      <section id="matchreferat">
        <div className="container">
          <div className="section-head">
            <span className="index">CS</span>
            <h2>Matchreferat</h2>
          </div>

          {state === 'loading' && <p className="roster-note">Hämtar referatet…</p>}

          {state === 'missing' && (
            <>
              <p className="roster-note">Referatet hittades inte — matchen kanske inte är spelad.</p>
              <p>
                <Link className="btn btn-ghost" to="/manager">
                  Tillbaka till managern
                </Link>
              </p>
            </>
          )}

          {state !== 'loading' && state !== 'missing' && (
            <ReportBody report={state} />
          )}
        </div>
      </section>
    </main>
  )
}

function ReportBody({ report }: { report: MatchReport }) {
  const r = report.report
  const home = r.scoreboard.home
  const away = r.scoreboard.away

  return (
    <>
      <p className="report-matchday">Omgång {report.matchday}</p>
      <p className="report-score">
        <span className="report-team">{report.home.name}</span>
        <strong>
          {r.homeScore}–{r.awayScore}
        </strong>
        <span className="report-team">{report.away.name}</span>
        {r.winner === 'draw' && <span className="report-draw">Oavgjort</span>}
      </p>

      {r.walkover ? (
        // Matchen spelades aldrig — rapporten säger varför i stället för att
        // visa ett tomt protokoll.
        <p className="roster-note">Walkover: {r.walkover}</p>
      ) : (
        <>
          {r.mvp && (
            <p className="report-mvp">
              Matchens gubbe: <strong>{r.mvp.name}</strong> ({r.mvp.kills}/{r.mvp.deaths})
            </p>
          )}

          <div className="report-rounds" aria-label="Rundförlopp">
            {r.rounds.map((round) => (
              <span
                key={round.round}
                className={`round-dot ${round.winner}`}
                title={`Runda ${round.round}: ${round.winner === 'home' ? 'hemma' : 'borta'}`}
              />
            ))}
          </div>

          <div className="report-boards">
            <Scoreboard title={report.home.name} lines={home} />
            <Scoreboard title={report.away.name} lines={away} />
          </div>
        </>
      )}

      <p>
        <Link className="btn btn-ghost" to="/manager">
          Tillbaka till managern
        </Link>
      </p>
    </>
  )
}
