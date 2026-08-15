import { Viking } from './viking'
import type { CardAttribute, CardTier } from '../api'

// Provark för vikingafigurerna: alla varianter bredvid varandra, så att
// formerna går att granska i ett svep i stället för att jaga rätt gubbe i
// rostern. Monteras av src/vikingSheet.tsx och fotas av
// scripts/viking-sheet.mjs — ingår aldrig i produktionsbygget, eftersom Vite
// bara bygger index.html.

const TIERS: CardTier[] = ['ikon', 'guld', 'silver', 'brons', 'okänd']
const POSITIONS = ['AWP', 'ENTRY', 'SMYGARE', 'IGL', 'SKALLE', 'VETERAN']

function attrs(over: Record<string, number> = {}): CardAttribute[] {
  const base: Record<string, number> = { SIK: 60, SKA: 60, FRA: 55, TÅL: 60, NYT: 55, TID: 60 }
  return Object.entries({ ...base, ...over }).map(([key, rating]) => ({
    key,
    label: key,
    description: '',
    rating,
  }))
}

function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="sheet-cell" style={{ textAlign: 'center' }}>
      <div
        style={{
          width: 116,
          height: 116,
          margin: '0 auto',
          clipPath: 'polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
          background: 'linear-gradient(160deg, #2a3340, #151a21)',
        }}
      >
        {children}
      </div>
      <p style={{ fontSize: 12, color: '#98a2ad', margin: '6px 0 0' }}>{title}</p>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 15, letterSpacing: 2, textTransform: 'uppercase', color: '#ff7a1a' }}>
        {label}
      </h2>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>{children}</div>
    </section>
  )
}

export function VikingSheet() {
  return (
    <div style={{ padding: 28, fontFamily: 'system-ui' }}>
      <Row label="Tier — hjälmen">
        {TIERS.map((tier) => (
          <Cell key={tier} title={tier}>
            <Viking id={`t-${tier}`} tier={tier} position="ENTRY" attributes={attrs()} />
          </Cell>
        ))}
      </Row>

      <Row label="Position — utrustningen">
        {POSITIONS.map((pos) => (
          <Cell key={pos} title={pos}>
            <Viking id={`p-${pos}`} tier="guld" position={pos} attributes={attrs()} />
          </Cell>
        ))}
      </Row>

      <Row label="Speltid — skägg och grånad">
        {[10, 40, 65, 85, 95].map((tid) => (
          <Cell key={tid} title={`TID ${tid}`}>
            <Viking id={`tid-${tid}`} tier="silver" position="VETERAN" attributes={attrs({ TID: tid })} />
          </Cell>
        ))}
      </Row>

      <Row label="Tålighet — ärr (lågt = fler)">
        {[85, 55, 30, 12].map((tal) => (
          <Cell key={tal} title={`TÅL ${tal}`}>
            <Viking id={`tal-${tal}`} tier="brons" position="SKALLE" attributes={attrs({ TÅL: tal })} />
          </Cell>
        ))}
      </Row>

      <Row label="Frag — krigsmålning tänds vid 70">
        {[50, 75].map((fra) => (
          <Cell key={fra} title={`FRA ${fra}`}>
            <Viking id={`fra-${fra}`} tier="ikon" position="AWP" attributes={attrs({ FRA: fra })} />
          </Cell>
        ))}
      </Row>

      <Row label="Samma betyg, olika seed — inga tvillingar">
        {['a', 'b', 'c', 'd', 'e', 'f'].map((id) => (
          <Cell key={id} title={id}>
            <Viking id={`seed-${id}`} tier="guld" position="ENTRY" attributes={attrs({ TID: 80 })} />
          </Cell>
        ))}
      </Row>
    </div>
  )
}
