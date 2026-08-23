import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchFeedResult, type FeedItem } from '../api'
import { monthLabel, relativeTime } from '../feedText'
import { useSectionStatus } from '../useApiOutage'
import { useLiveEvent } from '../useLiveEvents'
import { StarIcon, SteamIcon, TrophyIcon } from './icons'

// Loggboken: vad som hänt i klanen, i tidsordning. Raderna räknas fram på
// servern ur tabeller som redan finns (se server/src/feed.ts) — sajten hade
// all den här informationen förut, men bara utspridd och utan att någonsin
// säga *när*.

function Row({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case 'member':
      return (
        <>
          <span className="feed-icon" aria-hidden="true">
            <SteamIcon />
          </span>
          <p>
            <strong>{item.name}</strong> blev en av gubbarna.
          </p>
        </>
      )

    case 'month':
      return (
        <>
          <span className="feed-icon gold" aria-hidden="true">
            <StarIcon />
          </span>
          <p>
            <strong>{item.name}</strong> kröntes till Månadens BVS:are för {monthLabel(item.month)}.
          </p>
        </>
      )

    case 'quote':
      return (
        <>
          <span className="feed-icon" aria-hidden="true">
            <TrophyIcon />
          </span>
          <p>
            Nytt på citatväggen: <q>{item.text}</q> — <strong>{item.saidBy}</strong>
          </p>
        </>
      )

    case 'match':
      return (
        <>
          <span className="feed-icon" aria-hidden="true">
            <TrophyIcon />
          </span>
          <p>
            <Link to={`/manager/match/${item.fixtureId}`}>
              {item.home} <strong>{item.homeScore}–{item.awayScore}</strong> {item.away}
            </Link>
          </p>
        </>
      )

    case 'season':
      return (
        <>
          <span className="feed-icon" aria-hidden="true">
            <TrophyIcon />
          </span>
          <p>
            Säsongen <strong>{item.name}</strong> drog igång i managern.
          </p>
        </>
      )
  }
}

export function Feed() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retryTick, setRetryTick] = useState(0)

  // Samma val som citatväggen: statusen går aldrig tillbaka till 'loading', så
  // en laddningstext blinkar inte förbi varje gång någon skriver ett citat.
  useEffect(() => {
    let cancelled = false
    void fetchFeedResult().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setItems(result.data)
        setStatus('ready')
      } else {
        setStatus('error')
      }
    })
    return () => {
      cancelled = true
    }
  }, [retryTick])

  // Ett nytt citat eller en spelad match är just en sådan händelse som hör
  // hemma här — loggboken ska inte vara den sista som får veta.
  const reload = useCallback(() => setRetryTick((t) => t + 1), [])
  useLiveEvent('quote', reload)
  useLiveEvent('league', reload)

  const covered = useSectionStatus('loggboken', status === 'error', reload)

  return (
    <section id="loggboken">
      <div className="container">
        <div className="section-head">
          <span className="index">05</span>
          <h2>Loggboken</h2>
        </div>

        {status === 'loading' && (
          <p className="roster-note route-loading" role="status">
            Hämtar loggboken…
          </p>
        )}

        {status === 'error' &&
          (covered ? (
            <p className="roster-note">Kunde inte hämta loggboken just nu.</p>
          ) : (
            <div className="roster-error">
              <p className="roster-note" role="alert">
                Kunde inte hämta loggboken just nu. Kika in igen om en stund.
              </p>
              <button type="button" className="btn btn-ghost" onClick={reload}>
                Försök igen
              </button>
            </div>
          ))}

        {status === 'ready' && items.length === 0 && (
          <p className="roster-note">
            Inget har hänt än — logga in, skriv ett citat eller dra igång en säsong i managern.
          </p>
        )}

        {items.length > 0 && (
          <ol className="feed">
            {/* Tidsstämpeln duger inte som nyckel: seedade medlemmar delar
                first_login på millisekunden, och flera gubbar kan mycket väl
                logga in första gången samma sekund. Platsen i listan är det
                enda som säkert skiljer raderna åt, och listan byts ändå ut i
                sin helhet vid varje hämtning. */}
            {items.map((item, i) => (
              <li key={`${item.kind}-${item.at}-${i}`}>
                <Row item={item} />
                <time dateTime={new Date(item.at).toISOString()}>{relativeTime(item.at)}</time>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
