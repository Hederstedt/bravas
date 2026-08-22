import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import {
  fetchCards,
  fetchPresence,
  type CardAttribute,
  type CardTier,
  type PlayerCard,
  type Presence,
  type PresenceMap,
  type RosterMember,
} from '../api'
import { compareAttribute } from '../cardStats'
import { useLiveEvent } from '../useLiveEvents'
import { useMembers } from '../useMembers'
import { useSession } from '../useSession'
import { BvsMark } from './BvsMark'
import { ChevronIcon, DiscordIcon, StarIcon } from './icons'

// Glittret ska visas en gång per webbläsarsession, inte vid varenda
// sidladdning. Nytt precedensfall — sessionStorage finns inte någon
// annanstans i src/ i dag — men motiverat och litet: en enda flagga.
const MONTH_GLITTER_KEY = 'bvs-month-glitter-played'

function shouldPlayMonthGlitter(): boolean {
  try {
    if (sessionStorage.getItem(MONTH_GLITTER_KEY)) return false
    sessionStorage.setItem(MONTH_GLITTER_KEY, '1')
    return true
  } catch {
    // Privat läge kan neka sessionStorage — då spelas glittret helt enkelt inte.
    return false
  }
}

// Allt kortkomponenten behöver, oavsett om raden kom från Steam eller från
// platshållarna. Utan den skulle kortet behöva känna till båda källorna.
interface LineupEntry {
  id: string
  name: string
  avatarUrl: string | null
  discordName: string | null
  overall: number
  tier: CardTier
  position: string
  attributes: CardAttribute[]
  wotAttributes: CardAttribute[]
  comments: string[]
  presence: Presence | null
  pending: boolean
  // Inte betygshärlett — se PlayerCard i api.ts.
  memberOfMonth: boolean
}

function presenceLabel(p: Presence): string {
  if (p.status === 'in-game') return `Spelar ${p.game}`
  return p.status === 'online' ? 'Online' : 'Offline'
}

function initial(name: string): string {
  return name.replace(/^\[BVS\]\s*/, '').charAt(0).toUpperCase()
}

// Kortens ordning kommer från API:et, som redan sorterat bäst först. Gubbar vars
// statistik ännu inte hämtats hamnar sist i stället för att falla ur raden.
function buildLineup(
  live: RosterMember[],
  cards: PlayerCard[],
  presence: PresenceMap,
): LineupEntry[] {
  const byId = new Map(live.map((m) => [m.steamid64, m]))
  const rated: LineupEntry[] = []
  const seen = new Set<string>()

  for (const card of cards) {
    const member = byId.get(card.steamid64)
    if (!member) continue
    seen.add(card.steamid64)
    rated.push({
      id: card.steamid64,
      name: member.personaName,
      avatarUrl: member.avatarUrl,
      discordName: member.discordName,
      overall: card.overall,
      tier: card.tier,
      position: card.position,
      attributes: card.attributes,
      wotAttributes: card.wotAttributes,
      comments: card.comments,
      presence: presence[card.steamid64] ?? null,
      // "Kika in igen om en stund" var förr bara för den som saknades helt ur
      // cards-listan. Nu får den som inte har någon statistik alls (stängd
      // profil, inget länkat) ändå ett kort — men ska fortfarande visa "—",
      // inte ett missvisande "0".
      pending: !card.hasStats,
      memberOfMonth: card.memberOfMonth,
    })
  }

  const pending = live
    .filter((m) => !seen.has(m.steamid64))
    .map((m) => ({
      id: m.steamid64,
      name: m.personaName,
      avatarUrl: m.avatarUrl,
      discordName: m.discordName,
      overall: 0,
      tier: 'okänd' as CardTier,
      position: '',
      attributes: [],
      wotAttributes: [],
      comments: ['Statistiken hämtas från Steam. Kika in igen om en stund.'],
      presence: presence[m.steamid64] ?? null,
      pending: true,
      memberOfMonth: false,
    }))

  return [...rated, ...pending]
}

function PlayerCardView({
  entry,
  crew,
  glitter,
}: {
  entry: LineupEntry
  crew: PlayerCard[]
  glitter: boolean
}) {
  const [open, setOpen] = useState<string | null>(null)
  const p = entry.presence

  const openAttr = entry.attributes.find((a) => a.key === open) ?? null
  const comparison = openAttr ? compareAttribute(crew, entry.id, openAttr.key) : null

  return (
    <article
      className={`player-card${entry.memberOfMonth ? ' member-of-month' : ''}`}
      data-tier={entry.tier}
    >
      {glitter && (
        <div className="card-glitter" aria-hidden="true">
          {Array.from({ length: 10 }, (_, i) => (
            <span key={i} style={{ '--i': i } as CSSProperties} />
          ))}
        </div>
      )}

      <div className="card-top">
        <div className="overall-wrap">
          <span className="overall-label">BVS-betyg</span>
          <span className="overall">{entry.pending ? '—' : entry.overall}</span>
        </div>
        {entry.position && <span className="position">{entry.position}</span>}
        <BvsMark className="card-mark" />
      </div>

      <div className="card-portrait">
        <div className="avatar">
          {entry.avatarUrl ? (
            <img
              src={entry.avatarUrl}
              alt={entry.name}
              width={116}
              height={116}
              loading="lazy"
              decoding="async"
            />
          ) : (
            initial(entry.name)
          )}
          {p && (
            <span className={`presence ${p.status}`} role="status" aria-label={presenceLabel(p)} />
          )}
        </div>
      </div>

      <h3 className="card-name">{entry.name}</h3>
      {entry.memberOfMonth && (
        <p className="card-of-month">
          <StarIcon />
          Månadens BVS:are
        </p>
      )}
      {entry.discordName && (
        <p className="card-discord">
          <DiscordIcon />
          {entry.discordName}
        </p>
      )}
      {p?.game && <p className="card-playing">{p.game}</p>}

      {entry.attributes.length > 0 && (
        <ul className="card-attrs">
          {entry.attributes.map((a) => {
            const isOpen = open === a.key
            return (
              <li key={a.key} className="attr">
                {/* Knapp, inte bara hover: sidan har lika mycket mobiltrafik
                    som desktop, och på touch finns ingen hover att sväva med. */}
                <button
                  type="button"
                  className="attr-toggle"
                  aria-expanded={isOpen}
                  aria-controls={`attr-detail-${entry.id}`}
                  onClick={() => setOpen(isOpen ? null : a.key)}
                >
                  <span className="attr-key">{a.key}</span>
                  <span className="attr-rating">{a.rating}</span>
                  {/* Förkortningen säger inget uppläst. Förklaringen står i
                      panelen nedanför och i listan under raden, så här räcker
                      det utskrivna namnet. */}
                  <span className="sr-only">{a.label}</span>
                </button>
                <span className="attr-bar" style={{ '--pct': `${a.rating}%` } as CSSProperties} />
              </li>
            )
          })}
        </ul>
      )}

      {entry.wotAttributes.length > 0 && (
        <>
          <p className="card-attrs-label">World of Tanks</p>
          <ul className="card-attrs card-attrs-wot">
            {entry.wotAttributes.map((a) => (
              <li key={a.key} className="attr attr-static">
                <span className="attr-head">
                  <span className="attr-key">{a.key}</span>
                  <span className="attr-rating">{a.rating}</span>
                </span>
                <span className="sr-only">{a.label}</span>
                <span className="attr-bar" style={{ '--pct': `${a.rating}%` } as CSSProperties} />
              </li>
            ))}
          </ul>
        </>
      )}

      {openAttr && (
        <div className="attr-detail" id={`attr-detail-${entry.id}`}>
          <p className="attr-detail-name">
            {openAttr.label} · {openAttr.rating}
          </p>
          <p className="attr-detail-what">{openAttr.description}</p>
          {comparison && (
            <p className="attr-detail-rank">
              {comparison.of > 1
                ? `${comparison.rank} av ${comparison.of} i klanen · bäst ${comparison.best} · snitt ${comparison.average}`
                : 'Ingen att jämföra med än'}
            </p>
          )}
        </div>
      )}

      {entry.comments.map((c) => (
        <p key={c} className="card-quip">
          {c}
        </p>
      ))}
    </article>
  )
}

export function Roster() {
  // Gubbarna dyker upp här först när de loggat in med Steam. Medlemslistan
  // och sessionen delas med About/Nav/SteamLogin i stället för att Roster
  // hämtar sina egna — ett vanligt startsidesbesök gjorde tidigare flera
  // identiska anrop till samma endpoints.
  //
  // result skiljer "API:et har inte svarat än" (null) och "API:et svarade med
  // fel" (ok: false) från "svarade, och listan är faktiskt tom" (ok: true,
  // data: []) — samma tomma array dolde tidigare alla tre bakom en påhittad
  // laguppställning, så ett driftfel såg ut som en vanlig dag utan medlemmar.
  const { result, reload: reloadMembers } = useMembers()
  const session = useSession()
  const [cards, setCards] = useState<PlayerCard[]>([])
  const [presence, setPresence] = useState<PresenceMap>({})
  // Stängd som standard — ingen fattade "65 ENTRY" förut, men förklaringen
  // ska gå att hitta, inte tvinga sig på alla som bara vill se korten.
  const [legendOpen, setLegendOpen] = useState(false)
  // Regerande vinnarens glitter, en gång per webbläsarsession — se
  // shouldPlayMonthGlitter ovan. Blir true högst en gång och stannar där.
  const [glitter, setGlitter] = useState(false)
  // Ökas av "Försök igen" för att trigga om kort/presence utan att bygga en
  // egen refetch-funktion att hålla synkad med effektens cancelled-flagga.
  // Medlemslistan har sin egen omladdning via useMembers().reload().
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    void fetchCards().then((c) => {
      if (!cancelled) setCards(c)
    })
    void fetchPresence().then((p) => {
      if (!cancelled) setPresence(p)
    })
    return () => {
      cancelled = true
    }
  }, [retryTick])

  const status: 'loading' | 'error' | 'ready' =
    result === null ? 'loading' : result.ok ? 'ready' : 'error'
  const live = result?.ok ? result.data : []

  function retry() {
    reloadMembers()
    setRetryTick((t) => t + 1)
  }

  // Pollern på servern säger till när någon loggat in i ett spel. Bara
  // prickarna byts — korten och betygen rörs inte, så raden hoppar inte till.
  const onPresence = useCallback((data: unknown) => {
    const next = (data as { presence?: PresenceMap } | null)?.presence
    if (next) setPresence(next)
  }, [])
  useLiveEvent('presence', onPresence)

  // Kröningsjobbet sänder den här när en ny månad avgörs. Bara korten hämtas
  // om — betygen rörs inte, precis som presence-uppdateringen ovan.
  const onBvsMonth = useCallback(() => {
    void fetchCards().then(setCards)
  }, [])
  useLiveEvent('bvs-month', onBvsMonth)

  const ready = status === 'ready' && live.length > 0
  const lineup = ready ? buildLineup(live, cards, presence) : []

  // Förklaringarna kommer från API:et tillsammans med betygen, så koden här
  // slipper hålla en egen kopia som kan glida isär från uträkningen. WoT-
  // attributen läggs på separat — bara CS2 har alla sex på varenda gubbe, WoT
  // finns bara hos den som länkat.
  const legend = lineup.find((e) => e.attributes.length > 0)?.attributes ?? []
  const wotLegend = lineup.find((e) => e.wotAttributes.length > 0)?.wotAttributes ?? []

  // Den inloggade besökarens egen rad i rostern, om hen finns med — avgör om
  // hänvisningen till kontosidan är värd att visa.
  const mine = session ? (live.find((m) => m.steamid64 === session.steamid64) ?? null) : null

  // Avgörs högst en gång per montering: så fort en regerande vinnare synts
  // till (eller konstaterats saknas) rör vi inte sessionStorage igen. Ett
  // booleskt beroende i stället för hela lineup-arrayen — den är en ny
  // referens varje render och hade triggat effekten i onödan.
  const hasWinner = lineup.some((e) => e.memberOfMonth)
  const checkedGlitter = useRef(false)
  useEffect(() => {
    if (checkedGlitter.current) return
    if (!hasWinner) return
    checkedGlitter.current = true
    if (shouldPlayMonthGlitter()) setGlitter(true)
  }, [hasWinner])

  return (
    <section id="gubbarna">
      <div className="container">
        <div className="section-head">
          <span className="index">01</span>
          <h2>Gubbarna</h2>
        </div>

        {status === 'loading' && (
          <p className="roster-note route-loading" role="status">
            Hämtar gubbarna…
          </p>
        )}

        {status === 'error' && (
          <div className="roster-error">
            <p className="roster-note" role="alert">
              Kunde inte hämta gubbarna just nu. Kika in igen om en stund.
            </p>
            <button type="button" className="btn btn-ghost" onClick={retry}>
              Försök igen
            </button>
          </div>
        )}

        {status === 'ready' && live.length === 0 && (
          <p className="roster-note">
            Ingen har loggat in än — logga in med Steam för att bli den första i uppställningen.
          </p>
        )}

        {ready && (
          <>
            {/* Kopplingarna bor på kontosidan sedan de fick en egen. En rad kvar
                här ändå, så den som letar där de låg förut inte går bet. */}
            {mine && (
              <p className="roster-note account-pointer">
                Discord- och World of Tanks-kopplingen finns på{' '}
                <Link to="/mitt-konto">Mitt konto</Link>.
              </p>
            )}

            <div className="lineup" role="group" aria-label="Gubbarna i BVS">
              {lineup.map((entry) => (
                <PlayerCardView
                  key={entry.id}
                  entry={entry}
                  crew={cards}
                  glitter={glitter && entry.memberOfMonth}
                />
              ))}
            </div>

            {(legend.length > 0 || wotLegend.length > 0) && (
              <div className="legend-toggle-wrap">
                <button
                  type="button"
                  className="legend-toggle"
                  aria-expanded={legendOpen}
                  aria-controls="attr-legend-body"
                  onClick={() => setLegendOpen(!legendOpen)}
                >
                  <ChevronIcon />
                  {legendOpen ? 'Dölj hur betyget räknas' : 'Hur räknas betyget fram?'}
                </button>
                {legendOpen && (
                  <div className="legend-body" id="attr-legend-body">
                    <p>
                      <strong>BVS-betyget</strong> är en viktad summa av dina attribut — den som väger
                      tyngst (Frag) räknas mer än den som väger minst (Tid). Länkar du fler spel läggs
                      varje spel på som ett rejält tillägg ovanpå, aldrig ett avdrag: ju fler
                      spelkonton du länkar, desto högre kan betyget bli — ett svagt konto kan bara
                      höja betyget, aldrig sänka det.
                    </p>
                    <p>
                      <strong>Titeln</strong> (t.ex. KAPTEN eller GENERAL) är BVS egen rangordning och
                      styrs bara av betyget, oavsett vilket spel poängen kom ifrån — samma titlar för
                      alla, så ingen behöver gissa vad en förkortning betyder.
                      <strong> Tier</strong> (ikon/guld/silver/brons) är bara betyget i hinkar: 87+,
                      75+, 60+, annars brons.
                    </p>
                    {legend.length > 0 && (
                      <dl className="attr-legend">
                        {legend.map((a) => (
                          <div key={a.key}>
                            <dt>
                              <span className="attr-legend-key">{a.key}</span> {a.label}
                            </dt>
                            <dd>{a.description}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    {wotLegend.length > 0 && (
                      <>
                        <p className="legend-subhead">World of Tanks</p>
                        <dl className="attr-legend">
                          {wotLegend.map((a) => (
                            <div key={a.key}>
                              <dt>
                                <span className="attr-legend-key">{a.key}</span> {a.label}
                              </dt>
                              <dd>{a.description}</dd>
                            </div>
                          ))}
                        </dl>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <p className="roster-note">
              Betygen räknas fram ur gubbarnas riktiga CS2-statistik från Steam. Kommentarerna
              skriver sig själva.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
