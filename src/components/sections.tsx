import type { ReactNode } from 'react'
import { members, games, discordInvite } from '../data/clan'
import { BvsMark } from './BvsMark'
import { DiscordIcon, CrosshairIcon, AxeIcon, FactoryIcon, CubeIcon } from './icons'

const gameArt: Record<string, { tint: string; art: string; icon: ReactNode }> = {
  cs2: {
    tint: '#ff7a1a',
    art: 'linear-gradient(135deg, #3d2410, #14100b 70%)',
    icon: <CrosshairIcon />,
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
  minecraft: {
    tint: '#4ade80',
    art: 'linear-gradient(135deg, #16341c, #0b140d 70%)',
    icon: <CubeIcon />,
  },
}

export function Nav() {
  return (
    <nav className="nav">
      <div className="container nav-inner">
        <a href="#top" className="nav-brand">
          <BvsMark className="mark" /> BVS
        </a>
        <div className="nav-links">
          <a href="#spel">Spel</a>
          <a href="#gubbarna">Gubbarna</a>
          <a href="#om">Om oss</a>
          <a href="#discord">Discord</a>
        </div>
      </div>
    </nav>
  )
}

export function Hero() {
  return (
    <header className="hero" id="top">
      <div className="container">
        <p className="hero-tag">Est. Västra Götaland</p>
        <h1>Bravas</h1>
        <p className="hero-sub">
          <strong>Goa gubbar</strong> som lirar CS2, bygger fabriker och dör mot troll — på egen
          server, i eget garage.
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary" href={discordInvite}>
            <DiscordIcon /> Joina Discorden
          </a>
          <a className="btn btn-ghost" href="#gubbarna">
            Möt gubbarna
          </a>
        </div>
      </div>
      <span className="hero-scroll">▼ Scrolla</span>
    </header>
  )
}

export function Games() {
  return (
    <section id="spel">
      <div className="container">
        <div className="section-head">
          <span className="index">01</span>
          <h2>Vad vi lirar</h2>
        </div>
        <div className="games-grid">
          {games.map((g) => {
            const art = gameArt[g.id]
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

export function Roster() {
  return (
    <section id="gubbarna">
      <div className="container">
        <div className="section-head">
          <span className="index">02</span>
          <h2>Gubbarna</h2>
        </div>
        <div className="roster-grid">
          {members.map((m) => (
            <article key={m.nick} className="member-card">
              <div className="avatar">{m.nick.replace('Gubbe #', '')}</div>
              <h3>{m.nick}</h3>
              <p className="role">{m.role}</p>
              <p className="flavor">{m.flavor}</p>
            </article>
          ))}
        </div>
        <p className="roster-note">
          Rostern fylls på med riktiga nick och Steam-avatarer — Steam-koppling är på ingång.
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
            <span className="index">03</span>
            <h2>Om BVS</h2>
          </div>
          <p>
            BVS — <strong>Bravas</strong> — är ett gäng goa gubbar från Västra Götaland som har
            lirat ihop sedan hedenhös. Numera mest CS2 på kvällarna, med avstickare till Valheim
            när vikingasuget slår till och Satisfactory när någon säger orden{' '}
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
  return (
    <section id="discord" className="discord-cta">
      <div className="container">
        <h2>Häng med i Discorden</h2>
        <p>Där händer allt: kvällens lineup, serverstatus och diskussioner om rush B ändå.</p>
        <a className="btn btn-primary" href={discordInvite}>
          <DiscordIcon /> Joina BVS
        </a>
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
