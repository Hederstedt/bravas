import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  fetchCards,
  fetchMembers,
  fetchPresence,
  fetchSession,
  linkDiscord,
  MAX_DISCORD_NAME,
  WOT_LOGIN_URL,
  type CardAttribute,
  type CardTier,
  type PlayerCard,
  type Presence,
  type PresenceMap,
  type RosterMember,
  type Session,
} from '../api'
import { compareAttribute } from '../cardStats'
import { useLiveEvent } from '../useLiveEvents'
import { members } from '../data/clan'
import { BvsMark } from './BvsMark'
import { ChevronIcon, DiscordIcon } from './icons'

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
    }))

  return [...rated, ...pending]
}

function placeholderLineup(): LineupEntry[] {
  return members.map((m) => ({
    id: m.nick,
    name: m.nick,
    avatarUrl: null,
    discordName: null,
    overall: m.overall,
    tier: m.tier,
    position: m.position,
    attributes: m.attributes,
    wotAttributes: [],
    comments: [m.flavor],
    presence: null,
    pending: false,
  }))
}

// Platshållarna som kort, så jämförelsen fungerar även innan någon loggat in.
function placeholderCards(): PlayerCard[] {
  return members.map((m) => ({
    steamid64: m.nick,
    personaName: m.nick,
    hasStats: true,
    overall: m.overall,
    tier: m.tier,
    position: m.position,
    attributes: m.attributes,
    wotAttributes: [],
    comments: [m.flavor],
  }))
}

function PlayerCardView({ entry, crew }: { entry: LineupEntry; crew: PlayerCard[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const p = entry.presence

  const openAttr = entry.attributes.find((a) => a.key === open) ?? null
  const comparison = openAttr ? compareAttribute(crew, entry.id, openAttr.key) : null

  return (
    <article className="player-card" data-tier={entry.tier}>
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
            <img src={entry.avatarUrl} alt={entry.name} />
          ) : (
            initial(entry.name)
          )}
          {p && (
            <span className={`presence ${p.status}`} role="status" aria-label={presenceLabel(p)} />
          )}
        </div>
      </div>

      <h3 className="card-name">{entry.name}</h3>
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
        <div className="attr-detail">
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
  // Gubbarna dyker upp här först när de loggat in med Steam. Tills dess (och om
  // API:et är nere) visas platshållarna, så sektionen aldrig står tom.
  const [live, setLive] = useState<RosterMember[]>([])
  const [cards, setCards] = useState<PlayerCard[]>([])
  const [presence, setPresence] = useState<PresenceMap>({})
  // Stängd som standard — ingen fattade "65 ENTRY" förut, men förklaringen
  // ska gå att hitta, inte tvinga sig på alla som bara vill se korten.
  const [legendOpen, setLegendOpen] = useState(false)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchMembers().then((m) => {
      if (!cancelled) setLive(m)
    })
    void fetchCards().then((c) => {
      if (!cancelled) setCards(c)
    })
    void fetchPresence().then((p) => {
      if (!cancelled) setPresence(p)
    })
    void fetchSession().then((s) => {
      if (!cancelled) setSession(s)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Efter en Discord-koppling: hämta om rostern så namnet dyker upp på kortet
  // utan att sidan behöver laddas om.
  const reloadMembers = useCallback(() => {
    void fetchMembers().then(setLive)
  }, [])

  // Pollern på servern säger till när någon loggat in i ett spel. Bara
  // prickarna byts — korten och betygen rörs inte, så raden hoppar inte till.
  const onPresence = useCallback((data: unknown) => {
    const next = (data as { presence?: PresenceMap } | null)?.presence
    if (next) setPresence(next)
  }, [])
  useLiveEvent('presence', onPresence)

  const isLive = live.length > 0
  const lineup = isLive ? buildLineup(live, cards, presence) : placeholderLineup()
  // Jämförelsen räknas mot samma uppsättning som visas, så platshållarkorten
  // går att klicka på precis som de riktiga.
  const crew = isLive ? cards : placeholderCards()

  // Förklaringarna kommer från API:et tillsammans med betygen, så koden här
  // slipper hålla en egen kopia som kan glida isär från uträkningen. WoT-
  // attributen läggs på separat — bara CS2 har alla sex på varenda gubbe, WoT
  // finns bara hos den som länkat.
  const legend = lineup.find((e) => e.attributes.length > 0)?.attributes ?? []
  const wotLegend = lineup.find((e) => e.wotAttributes.length > 0)?.wotAttributes ?? []

  // Delas av både Discord- och WoT-länkningen: samma inloggade besökares egen
  // rad i rostern, om hen finns med.
  const mine = session ? (live.find((m) => m.steamid64 === session.steamid64) ?? null) : null

  return (
    <section id="gubbarna">
      <div className="container">
        <div className="section-head">
          <span className="index">01</span>
          <h2>Gubbarna</h2>
        </div>

        {/* Högt upp, inte gömt under kortraden — annars missar man att den
            finns, vilket den gjorde när den låg sist i sektionen. */}
        {mine && (
          <div className="account-links">
            <h3>Koppla dina konton</h3>
            <DiscordLink mine={mine} onLinked={reloadMembers} />
            <WotLink mine={mine} />
          </div>
        )}

        <div className="lineup" role="group" aria-label="Gubbarna i BVS">
          {lineup.map((entry) => (
            <PlayerCardView key={entry.id} entry={entry} crew={crew} />
          ))}
        </div>

        {(legend.length > 0 || wotLegend.length > 0) && (
          <div className="legend-toggle-wrap">
            <button
              type="button"
              className="legend-toggle"
              aria-expanded={legendOpen}
              onClick={() => setLegendOpen(!legendOpen)}
            >
              <ChevronIcon />
              {legendOpen ? 'Dölj hur betyget räknas' : 'Hur räknas betyget fram?'}
            </button>
            {legendOpen && (
              <div className="legend-body">
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
          {isLive
            ? 'Betygen räknas fram ur gubbarnas riktiga CS2-statistik från Steam. Kommentarerna skriver sig själva.'
            : 'Rostern fylls på med riktiga nick, Steam-avatarer och betyg — logga in med Steam för att synas här.'}
        </p>
      </div>
    </section>
  )
}

// Steam vet vad du heter i Steam, inte i Discorden — kopplingen får skrivas in
// för hand. Visas bara för den som är inloggad och finns i rostern; namnet
// hamnar sedan på hans eget spelarkort.
function DiscordLink({
  mine,
  onLinked,
}: {
  mine: RosterMember | null
  onLinked: () => void
}) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  if (!mine) return null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = name.trim()
    if (!value || saving) return

    setSaving(true)
    setError('')
    const ok = await linkDiscord(value)
    setSaving(false)

    if (!ok) {
      setError('Namnet kunde inte sparas. Försök igen.')
      return
    }
    setName('')
    setSaved(true)
    onLinked()
  }

  return (
    <form className="quote-form discord-link" onSubmit={submit}>
      <label>
        {mine.discordName ? 'Byt Discord-namn' : 'Vad heter du i Discorden?'}
        <input
          value={name}
          maxLength={MAX_DISCORD_NAME}
          onChange={(e) => {
            setName(e.target.value)
            setSaved(false)
          }}
          placeholder={mine.discordName ?? 'gubbe'}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Sparar…' : 'Koppla till kortet'}
      </button>
      {error && <p className="quote-error">{error}</p>}
      {saved && !error && <p className="roster-note">Sparat — namnet syns på ditt kort.</p>}
    </form>
  )
}

// Ingen egen inloggning — bara en länk till ett riktigt Wargaming-konto, samma
// idé som Discord-namnet men med en kontokoll i stället för fritext. En hel
// sidnavigering, inte ett fetch-anrop: det är en OAuth-liknande redirect ut
// till Wargaming och tillbaka.
function WotLink({ mine }: { mine: RosterMember | null }) {
  if (!mine) return null

  return (
    <p className="roster-note wot-link">
      {mine.wotNickname ? (
        <>
          Länkad mot World of Tanks som <strong>{mine.wotNickname}</strong>.{' '}
          <a href={WOT_LOGIN_URL}>Byt konto</a>
        </>
      ) : (
        <a className="btn btn-ghost" href={WOT_LOGIN_URL}>
          Länka World of Tanks
        </a>
      )}
    </p>
  )
}
