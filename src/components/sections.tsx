import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import {
  fetchDiscordStatus,
  fetchHighlightsResult,
  fetchValheimStatus,
  type DiscordStatus,
  type Highlights,
  type ValheimStatus,
} from '../api'
import { games, gameStatsBlurbs } from '../data/clan'
import { groupHighlights } from '../statsGrouping'
import { useSectionStatus } from '../useApiOutage'
import { useLiveEvent } from '../useLiveEvents'
import { useMembers } from '../useMembers'
import { useSession } from '../useSession'
import { useSiteConfig } from '../useSiteConfig'
import { SteamLogin } from './auth'
import { BvsMark } from './BvsMark'
import {
  DiscordIcon,
  CrosshairIcon,
  AxeIcon,
  FactoryIcon,
  LockIcon,
  SteamIcon,
  TankIcon,
  TrophyIcon,
} from './icons'

// Rostern bor i egen fil — den bär hela kortmodellen och gjorde den här filen
// dubbelt så lång. Re-exporteras här så importerna ser likadana ut som förut.
export { Roster } from './roster'

const gameArt: Record<string, { tint: string; art: string; icon: ReactNode }> = {
  cs2: {
    tint: '#ff7a1a',
    art: 'linear-gradient(135deg, #3d2410, #14100b 70%)',
    icon: <CrosshairIcon />,
  },
  wot: {
    tint: '#a3b18a',
    art: 'linear-gradient(135deg, #2c331f, #10130b 70%)',
    icon: <TankIcon />,
  },
  valheim: {
    tint: '#7dd3fc',
    art: 'linear-gradient(135deg, #12303d, #0b141a 70%)',
    icon: <AxeIcon />,
  },
  satisfactory: {
    tint: '#fbbf24',
    art: 'linear-gradient(135deg, #3d3210, #14120b 70%)',
    icon: <FactoryIcon />,
  },
  // Inget spel i sig — mock-datans "över alla spel"-post i Siffrorna
  // (Mest speltid totalt). Finns bara här så gruppering inte spricker på den.
  steam: {
    tint: '#66c0f4',
    art: 'linear-gradient(135deg, #16232e, #0b141a 70%)',
    icon: <SteamIcon />,
  },
}

function fallbackArt(gameId: string) {
  return gameArt[gameId] ?? { tint: undefined, art: undefined, icon: <TrophyIcon /> }
}

// Sektionslänkarna pekar på /#ankare så att de fungerar även från /manager —
// Link ger SPA-navigering hem och HomePage scrollar sedan till rätt sektion.
const navLinks = [
  { to: '/#gubbarna', label: 'Gubbarna' },
  { to: '/#spel', label: 'Spel' },
  { to: '/#siffrorna', label: 'Siffrorna' },
  { to: '/#citat', label: 'Citat' },
  { to: '/#klippen', label: 'Klippen' },
  { to: '/#loggboken', label: 'Loggboken' },
  { to: '/manager', label: 'Manager' },
  { to: '/#om', label: 'Om oss' },
  { to: '/#discord', label: 'Discord' },
  { to: '/kom-igang', label: 'Kom igång' },
]

export function Nav() {
  const [open, setOpen] = useState(false)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const overlayId = useId()
  const location = useLocation()

  // Admin-länken är bekvämlighet, inte skydd — servern gatear varje
  // admin-endpoint oavsett vad menyn visar. Men en död länk för alla andra
  // vore bara skräp, så den ritas bara för den som faktiskt kan använda den.
  // Delad session — SteamLogin (monterad två gånger: desktop + mobilöverlägg)
  // frågar samma cache i stället för att själv fråga API:et igen.
  const session = useSession()
  const isAdmin = session?.isAdmin === true

  // navLinks driver både desktopmenyn och mobilöverlägget, så en villkorad
  // post räcker för båda.
  const links = isAdmin ? [...navLinks, { to: '/admin', label: 'Admin' }] : navLinks

  // Escape stänger menyn och lämnar tillbaka fokus till hamburgaren — utan det
  // hamnar tangentbordsanvändaren i ingenmansland när menyn försvinner.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      setOpen(false)
      burgerRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Fokus till första länken vid öppning, och sidan bakom slutar rulla —
  // annars kan man skrolla runt på en sida man inte ser. Effekten städar sig
  // själv (overflow tillbaka till normalt) både vid stängning och avmontering.
  useEffect(() => {
    if (!open) return
    overlayRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Utan en fälla kan Tab lämna dialogen och fortsätta ut i sidan bakom, som
  // ligger dold men fortfarande kvar i DOM:en.
  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== 'Tab') return
    const focusable = overlayRef.current?.querySelectorAll<HTMLElement>('a, button')
    if (!focusable || focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable[focusable.length - 1]!
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  // Bara riktiga sidlänkar kan vara "aktuella" — Gubbarna/Spel/Siffrorna m.fl.
  // pekar alla på "/" med olika ankare, och utan skrollspaning finns ingen
  // ensam rätt bland dem att märka.
  function isCurrentPage(to: string) {
    return !to.includes('#') && to === location.pathname
  }

  // OBS: overlayn ligger som syskon till <nav>, inte inuti den. `.nav` har
  // backdrop-filter, och ett filter gör elementet till containing block för
  // allt med position: fixed inuti — då räknas overlayns `inset: 64px 0 0`
  // mot navbarens 65 px i stället för mot skärmen. Resultatet blev en 48 px
  // hög remsa där alla länkarna hamnade utanför och klipptes bort: menyn såg
  // ut att öppnas men innehöll inget klickbart. Flytta inte tillbaka den.
  return (
    <>
      <nav className="nav">
        <div className="container nav-inner">
          <Link to="/#top" className="nav-brand" onClick={() => setOpen(false)}>
            <BvsMark className="mark" /> BVS
          </Link>
          <div className="nav-links">
            {links.map((l) => (
              <Link key={l.to} to={l.to} aria-current={isCurrentPage(l.to) ? 'page' : undefined}>
                {l.label}
              </Link>
            ))}
            <SteamLogin />
          </div>
          <button
            type="button"
            ref={burgerRef}
            className="nav-burger"
            aria-label={open ? 'Stäng menyn' : 'Öppna menyn'}
            aria-expanded={open}
            aria-controls={overlayId}
            onClick={() => setOpen(!open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </nav>
      {open && (
        <div
          id={overlayId}
          ref={overlayRef}
          className="nav-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Meny"
          onKeyDown={trapTab}
        >
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              aria-current={isCurrentPage(l.to) ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
          <SteamLogin />
        </div>
      )}
    </>
  )
}

export function Hero() {
  const { discordInviteUrl } = useSiteConfig()

  return (
    <header className="hero" id="top">
      <div className="embers" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} style={{ '--i': i } as React.CSSProperties} />
        ))}
      </div>
      <div className="container">
        <p className="hero-tag">Est. Västra Götaland</p>
        <h1>Bravas</h1>
        <p className="hero-sub">
          <strong>Goa gubbar</strong> som lirar CS2, rullar pansar, bygger fabriker och dör mot
          troll — på egen server, i eget garage.
        </p>
        <div className="hero-actions">
          {discordInviteUrl && (
            <a className="btn btn-primary" href={discordInviteUrl}>
              <DiscordIcon /> Joina Discorden
            </a>
          )}
          <a className="btn btn-ghost" href="#gubbarna">
            Möt gubbarna
          </a>
        </div>
      </div>
      <span className="hero-scroll">▼ Scrolla</span>
    </header>
  )
}

// Pollern på servern skickar bara det som faktiskt kan ändras i drift — namn,
// lösenord och adress är statisk konfig och ingår inte i själva livehändelsen.
type ValheimLiveUpdate = Pick<ValheimStatus, 'online' | 'players' | 'maxPlayers'>

// Adress och lösenord är till för att klistras in i Valheim, inte för att
// skrivas av för hand från en mobilskärm. Klicket får inte bubbla vidare —
// på flippkortet hade det vänt tillbaka kortet mitt i kopieringen.
function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      return
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      className={`copy-btn${copied ? ' copied' : ''}`}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        void copy()
      }}
    >
      {copied ? 'Kopierat ✓' : 'Kopiera'}
    </button>
  )
}

// Valheim-kortet lever: ramen pulserar grönt när servern är online, och för
// inloggade flippar kortet på klick till en baksida med anslutningsuppgifterna.
// Flip-knapparna finns för tangentbord och skärmläsare — musklick fungerar
// var som helst på kortet via bubbling. Den bortvända sidan görs inert så att
// tabb-ordningen inte snubblar in i osynliga knappar.
function ValheimCard({
  title,
  blurb,
  art,
  status,
}: {
  title: string
  blurb: string
  art: { tint: string; art: string; icon: ReactNode }
  status: ValheimStatus | null
}) {
  const [flipped, setFlipped] = useState(false)
  const canFlip = Boolean(status?.serverName && status?.password)
  const live = status?.online === true

  return (
    <article
      className={`game-card${live ? ' live' : ''}${canFlip ? ' flippable' : ''}${flipped ? ' flipped' : ''}`}
      style={{ '--game-tint': art.tint, '--game-art': art.art } as React.CSSProperties}
      onClick={canFlip ? () => setFlipped((f) => !f) : undefined}
    >
      <div className="card-inner">
        <div className="card-front" inert={flipped}>
          <div className="art">{art.icon}</div>
          <h3>{title}</h3>
          <p>{blurb}</p>

          {status && (
            <p className={`live-row${live ? ' online' : ''}`}>
              <span className="server-dot" aria-hidden="true" />
              {live ? 'Online' : 'Offline'}
              {live && status.players !== null && (
                <span className="live-count">{`${status.players} / ${status.maxPlayers} inne`}</span>
              )}
            </p>
          )}

          {/* Inloggad men ändå inga uppgifter betyder att serverns .env saknar
              dem — då är "logga in" fel besked och omöjligt att agera på. */}
          {status && !canFlip && (
            <p className="server-locked">
              <LockIcon />
              {status.signedIn
                ? 'Serverns namn och lösenord är inte ifyllda än'
                : 'Logga in för att se serverns namn och lösenord'}
            </p>
          )}

          {canFlip && (
            <button type="button" className="flip-hint">
              Visa namn &amp; lösenord ↻
            </button>
          )}
        </div>

        {canFlip && status && (
          <div className="card-back" inert={!flipped}>
            <h3>Anslut till servern</h3>
            <dl className="server-details">
              <div className="server-row">
                <dt>Server</dt>
                <dd>
                  <strong>{status.serverName}</strong>
                </dd>
              </div>
              {status.address && (
                <div className="server-row">
                  <dt>Adress</dt>
                  <dd>
                    <code>{status.address}</code>
                    <CopyButton value={status.address} label="Kopiera adressen" />
                  </dd>
                </div>
              )}
              <div className="server-row">
                <dt>Lösenord</dt>
                <dd>
                  <code>{status.password}</code>
                  <CopyButton value={status.password!} label="Kopiera lösenordet" />
                </dd>
              </div>
            </dl>
            <button type="button" className="flip-hint">
              Vänd tillbaka ↻
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

export function Games() {
  const [valheim, setValheim] = useState<ValheimStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchValheimStatus().then((v) => {
      if (!cancelled) setValheim(v)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Namn/lösenord/adress rörs inte av en livehändelse — bara online-läget och
  // spelarantalet, så raden inte hoppar till om man just fick upp uppgifterna.
  const onValheimUpdate = useCallback((data: unknown) => {
    const update = data as ValheimLiveUpdate | null
    if (!update) return
    setValheim((prev) => (prev ? { ...prev, ...update } : prev))
  }, [])
  useLiveEvent('valheim', onValheimUpdate)

  return (
    <section id="spel">
      <div className="container">
        <div className="section-head">
          <span className="index">02</span>
          <h2>Vad vi lirar</h2>
        </div>
        <div className="games-grid">
          {games.map((g) => {
            const art = gameArt[g.id]
            // Valheim-kortet bär livestatusen i stället för en statisk pill —
            // "Säsong" bredvid "Online" hade bara varit brus.
            if (g.id === 'valheim') {
              return (
                <ValheimCard key={g.id} title={g.title} blurb={g.blurb} art={art} status={valheim} />
              )
            }
            return (
              <article
                key={g.id}
                className="game-card"
                style={{ '--game-tint': art.tint, '--game-art': art.art } as React.CSSProperties}
              >
                <div className="art">{art.icon}</div>
                <h3>{g.title}</h3>
                <p>{g.blurb}</p>
                <span className={`status ${g.status.toLowerCase().replace(' ', '-')}`}>
                  {g.status}
                </span>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}

type StatsStatus = 'loading' | 'error' | 'ready'

export function Stats() {
  const [status, setStatus] = useState<StatsStatus>('loading')
  const [live, setLive] = useState<Highlights | null>(null)
  const [openRecord, setOpenRecord] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    void fetchHighlightsResult().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setLive(result.data)
        setStatus('ready')
      } else {
        setStatus('error')
      }
    })
    return () => {
      cancelled = true
    }
  }, [retryTick])

  const retry = useCallback(() => setRetryTick((t) => t + 1), [])
  // Felar fler sektioner samtidigt tar bannern på startsidan över beskedet och
  // knappen — se home.tsx.
  const covered = useSectionStatus('siffrorna', status === 'error', retry)

  // Steam lämnar bara ut statistik för den som har öppen profil, så en tom
  // lista här är ett giltigt svar — inte ett fel och inte en anledning att
  // hitta på siffror.
  const ready = status === 'ready' && live !== null && live.highlights.length > 0
  const groups = ready ? groupHighlights(live.highlights) : []

  return (
    <section id="siffrorna">
      <div className="container">
        <div className="section-head">
          <span className="index">03</span>
          <h2>Siffrorna</h2>
        </div>

        {status === 'loading' && (
          <p className="roster-note route-loading" role="status">
            Hämtar siffrorna…
          </p>
        )}

        {status === 'error' &&
          (covered ? (
            <p className="roster-note">Kunde inte hämta siffrorna just nu.</p>
          ) : (
            <div className="roster-error">
              <p className="roster-note" role="alert">
                Kunde inte hämta siffrorna just nu. Kika in igen om en stund.
              </p>
              <button type="button" className="btn btn-ghost" onClick={retry}>
                Försök igen
              </button>
            </div>
          ))}

        {status === 'ready' && live !== null && live.highlights.length === 0 && (
          <p className="roster-note">
            Ingen statistik än — så fort någon har öppen spelinformation i Steam dyker siffrorna
            upp här.
          </p>
        )}

        {ready && live !== null && (
          <>
            {groups.map((group) => {
              const art = fallbackArt(group.gameId)
              return (
                <div
                  key={group.gameId}
                  className="stats-group"
                  style={{ '--game-tint': art.tint } as React.CSSProperties}
                >
                  <div className="stats-group-head">
                    {art.icon}
                    <div>
                      <h3>{group.gameTitle}</h3>
                      {gameStatsBlurbs[group.gameId] && <p>{gameStatsBlurbs[group.gameId]}</p>}
                    </div>
                  </div>
                  <div className="stats-grid">
                    {group.cards.map((s) => {
                      const id = `${s.gameId}-${s.label}`
                      const standings = s.standings ?? []
                      const isOpen = openRecord === id
                      return (
                        <article key={id} className="stat-card">
                          <div className="stat-card-head">
                            <TrophyIcon />
                            <span className="stat-game">{s.gameTitle}</span>
                          </div>
                          <p className="stat-label">{s.label}</p>
                          <p className="stat-value">{s.value}</p>
                          <p className="stat-holder">{s.holder}</p>
                          <p className="stat-detail">{s.detail}</p>

                          {/* Bara rekordhållaren syns i vila. Vill man veta vem som ligger
                              tvåa fäller man ut listan — på klick, inte hover, så det
                              fungerar lika bra med tumme som med mus. */}
                          {standings.length > 1 && (
                            <>
                              <button
                                type="button"
                                className="stat-expand"
                                aria-expanded={isOpen}
                                aria-controls={`stat-standings-${id}`}
                                // Samma synliga text ("Visa alla 3") upprepas på varje kort i
                                // rutnätet — utan ett eget namn per knapp låter alla likadant
                                // för den som navigerar med skärmläsare.
                                aria-label={
                                  isOpen ? `Dölj listan för ${s.label}` : `Visa hela listan för ${s.label}`
                                }
                                onClick={() => setOpenRecord(isOpen ? null : id)}
                              >
                                {isOpen ? 'Dölj listan' : `Visa alla ${standings.length}`}
                              </button>
                              {isOpen && (
                                <ol className="stat-standings" id={`stat-standings-${id}`}>
                                  {standings.map((row, i) => (
                                    <li key={row.name}>
                                      <span className="rank">{i + 1}</span>
                                      <span className="who">{row.name}</span>
                                      <span className="what">{row.value}</span>
                                    </li>
                                  ))}
                                </ol>
                              )}
                            </>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            <p className="roster-note">
              {`Hämtat live från Steam för ${live.withStats} av ${live.memberCount} gubbar — resten har stängd spelinformation på sin profil.`}
            </p>
          </>
        )}
      </div>
    </section>
  )
}

export function About() {
  // Räknaren visade tidigare den hårdkodade platshållarlängden tills en
  // riktig siffra kom in — om API:et var nere kom den aldrig, och sajten
  // påstod ett medlemsantal som inte fanns. Nu visar den ett streck tills ett
  // äkta svar kommit, även om svaret råkar vara noll. Delad med Roster — ett
  // vanligt startsidesbesök gör bara ett anrop till /api/members, inte två.
  const { result } = useMembers()
  const memberCount = result?.ok ? result.data.length : null

  return (
    <section id="om" className="about">
      <div className="container about-grid">
        <div>
          <div className="section-head">
            <span className="index">07</span>
            <h2>Om BVS</h2>
          </div>
          <p>
            BVS — <strong>Bravas</strong> — är ett gäng goa gubbar från Västra Götaland som har
            lirat ihop sedan hedenhös. Numera mest CS2 på kvällarna, pansarslag i World of Tanks,
            och avstickare till Valheim och Satisfactory när någon säger orden{' '}
            <em>"jag har optimerat fabriken"</em>.
          </p>
          <p>
            Allt körs på <strong>egen järnvara</strong>: hemsidan du kollar på och spelservrarna
            snurrar på en ihopskruvad server av gamla delar — som det ska vara.
          </p>
        </div>
        <div className="stat-grid">
          <div className="stat">
            <div className="num">{memberCount ?? '–'}</div>
            <div className="label">Goa gubbar</div>
          </div>
          <div className="stat">
            <div className="num">{games.length}</div>
            <div className="label">Spel i rotation</div>
          </div>
          <div className="stat">
            <div className="num">1</div>
            <div className="label">Garageserver</div>
          </div>
          <div className="stat">
            <div className="num">∞</div>
            <div className="label">Eftersnack</div>
          </div>
        </div>
      </div>
    </section>
  )
}

export function DiscordCta() {
  const { discordInviteUrl } = useSiteConfig()
  const [discord, setDiscord] = useState<DiscordStatus | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchDiscordStatus().then((d) => {
      if (!cancelled) setDiscord(d)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Pollern skickar hela ögonblicksbilden när någon kommer eller går.
  const onDiscord = useCallback((data: unknown) => {
    const next = data as DiscordStatus | null
    if (next) setDiscord(next)
  }, [])
  useLiveEvent('discord', onDiscord)

  // Widgeten kan vara avstängd i Discord, och då ska sektionen se ut som förut
  // i stället för att visa en tom lista.
  const live = discord?.available === true

  return (
    <section id="discord" className="discord-cta">
      <div className="container">
        <h2>Häng med i Discorden</h2>
        <p>Där händer allt: kvällens lineup, serverstatus och diskussioner om rush B ändå.</p>

        {live && <DiscordLive status={discord} />}

        {discordInviteUrl && (
          <a className="btn btn-primary" href={discordInviteUrl}>
            <DiscordIcon /> Joina BVS
          </a>
        )}
      </div>
    </section>
  )
}

// Vilka som hänger inne just nu. Discord listar bara de som är online och som
// själva syns i widgeten, så en tom lista med noll inne är ett giltigt svar —
// inte ett fel.
function DiscordLive({ status }: { status: DiscordStatus }) {
  if (status.online === 0) {
    return <p className="discord-live empty">Tomt i Discorden just nu — bli den som drar igång.</p>
  }

  // Siffran kommer från Discord och räknar alla online, även de som inte ryms
  // i namnlistan.
  const hidden = status.online - status.members.length

  return (
    <div className="discord-live">
      <p className="discord-count">
        <span className="server-dot" aria-hidden="true" />
        {status.online === 1 ? '1 gubbe inne just nu' : `${status.online} gubbar inne just nu`}
      </p>
      <ul className="discord-members">
        {status.members.map((m) => (
          <li key={m.name} className={m.status}>
            <span className="who">{m.name}</span>
            {m.game && <span className="playing">{m.game}</span>}
          </li>
        ))}
        {hidden > 0 && <li className="more">+{hidden} till</li>}
      </ul>
    </div>
  )
}

export function Footer() {
  return (
    <footer>
      <div className="container footer-inner">
        <span>
          © {new Date().getFullYear()} BVS · Bravas — byggd med <span className="heart">♥</span> i
          Västra Götaland
        </span>
        <span>Hostad i ett garage nära dig</span>
        <Link to="/integritet">Integritet</Link>
      </div>
    </footer>
  )
}
