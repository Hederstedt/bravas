import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { fetchHighlights, fetchValheimStatus, type Highlights, type ValheimStatus } from '../api'
import { members, games, statHighlights, statsIsMock } from '../data/clan'
import { useLiveEvent } from '../useLiveEvents'
import { useSiteConfig } from '../useSiteConfig'
import { SteamLogin } from './auth'
import { BvsMark } from './BvsMark'
import {
  DiscordIcon,
  CrosshairIcon,
  AxeIcon,
  FactoryIcon,
  LockIcon,
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
}

// Sektionslänkarna pekar på /#ankare så att de fungerar även från /manager —
// Link ger SPA-navigering hem och HomePage scrollar sedan till rätt sektion.
const navLinks = [
  { to: '/#gubbarna', label: 'Gubbarna' },
  { to: '/#spel', label: 'Spel' },
  { to: '/#siffrorna', label: 'Siffrorna' },
  { to: '/#citat', label: 'Citat' },
  { to: '/manager', label: 'Manager' },
  { to: '/#om', label: 'Om oss' },
  { to: '/#discord', label: 'Discord' },
]

export function Nav() {
  const [open, setOpen] = useState(false)

  return (
    <nav className="nav">
      <div className="container nav-inner">
        <Link to="/#top" className="nav-brand" onClick={() => setOpen(false)}>
          <BvsMark className="mark" /> BVS
        </Link>
        <div className="nav-links">
          {navLinks.map((l) => (
            <Link key={l.to} to={l.to}>
              {l.label}
            </Link>
          ))}
          <SteamLogin />
        </div>
        <button
          type="button"
          className="nav-burger"
          aria-label={open ? 'Stäng menyn' : 'Öppna menyn'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span />
          <span />
          <span />
        </button>
      </div>
      {open && (
        <div className="nav-overlay" role="dialog" aria-label="Meny">
          {navLinks.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
          <SteamLogin />
        </div>
      )}
    </nav>
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

          {status && !canFlip && (
            <p className="server-locked">
              <LockIcon />
              Logga in för att se serverns namn och lösenord
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

export function Stats() {
  const [live, setLive] = useState<Highlights | null>(null)
  const [openRecord, setOpenRecord] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchHighlights().then((h) => {
      if (!cancelled) setLive(h)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Steam lämnar bara ut statistik för den som har öppen profil. Tills någon
  // gjort det är märkt demo-data ärligare än en tom sektion.
  const real = live && live.highlights.length > 0
  const cards = real ? live.highlights : statHighlights

  return (
    <section id="siffrorna">
      <div className="container">
        <div className="section-head">
          <span className="index">03</span>
          <h2>Siffrorna</h2>
          {!real && statsIsMock && <span className="demo-badge">Demo-data</span>}
        </div>
        <div className="stats-grid">
          {cards.map((s) => {
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
                      onClick={() => setOpenRecord(isOpen ? null : id)}
                    >
                      {isOpen ? 'Dölj listan' : `Visa alla ${standings.length}`}
                    </button>
                    {isOpen && (
                      <ol className="stat-standings">
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
        <p className="roster-note">
          {real
            ? `Hämtat live från Steam för ${live.withStats} av ${live.memberCount} gubbar — resten har stängd spelinformation på sin profil.`
            : 'Placeholder-siffror så länge — riktig statistik hämtas från Steam så fort någon har öppen spelinformation.'}
        </p>
      </div>
    </section>
  )
}

export function About() {
  return (
    <section id="om" className="about">
      <div className="container about-grid">
        <div>
          <div className="section-head">
            <span className="index">05</span>
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
            <div className="num">{members.length}</div>
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

  return (
    <section id="discord" className="discord-cta">
      <div className="container">
        <h2>Häng med i Discorden</h2>
        <p>Där händer allt: kvällens lineup, serverstatus och diskussioner om rush B ändå.</p>
        {discordInviteUrl && (
          <a className="btn btn-primary" href={discordInviteUrl}>
            <DiscordIcon /> Joina BVS
          </a>
        )}
      </div>
    </section>
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
      </div>
    </footer>
  )
}
