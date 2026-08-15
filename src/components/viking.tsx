import { vikingLook, type GearKind, type HelmetKind, type Palette, type VikingLook } from '../viking'
import type { CardAttribute, CardTier } from '../api'

// Vikingen ritas i SVG, precis som resten av sajtens grafik — inga externa
// assets och ingen upphovsrättsskyddad fan art. Vad som ska ritas bestäms i
// viking.ts; här finns bara formerna.
//
// Byst rakt framifrån i en 100x100-ruta. Föräldern klipper den till hexagon,
// så hörnen får vara tomma och allt viktigt håller sig innanför mitten.

function Helmet({ kind, palette }: { kind: HelmetKind; palette: Palette }) {
  const { metal, metalDark } = palette

  return (
    <g>
      {/* Vingarna sitter bakom kupan, annars skär de igenom den. */}
      {kind === 'vingar' && (
        <>
          <path d="M30 34 L14 22 L18 36 L12 34 L20 44 Z" fill={metal} opacity="0.9" />
          <path d="M70 34 L86 22 L82 36 L88 34 L80 44 Z" fill={metal} opacity="0.9" />
        </>
      )}

      {/* Kupan. Läder är rundare och lägre, järn har en kant som tar emot hugg. */}
      {kind === 'lader' ? (
        <path d="M28 40 Q50 18 72 40 L72 44 L28 44 Z" fill={metalDark} />
      ) : (
        <>
          <path d="M27 41 Q50 15 73 41 L73 45 L27 45 Z" fill={metal} />
          <path d="M27 41 Q50 15 73 41 L73 45 L27 45 Z" fill="#000" opacity="0.18" />
          <path d="M48 17 L52 17 L53 41 L47 41 Z" fill={metalDark} />
          <rect x="25" y="41" width="50" height="6" rx="1" fill={metalDark} />
        </>
      )}

      {/* Näsjärnet, guld och uppåt. */}
      {(kind === 'nasskydd' || kind === 'vingar') && (
        <path d="M46 45 L54 45 L53 62 L47 62 Z" fill={metal} />
      )}
    </g>
  )
}

function Beard({ look }: { look: VikingLook }) {
  const { beard, beardColor, grey } = look
  if (beard === 0) return null

  // Grånar i två steg med speltiden. Blandningen görs med ett grått lager
  // ovanpå i stället för att räkna om färgen — enklare, och det ger samma
  // resultat.
  const greyOpacity = grey === 0 ? 0 : grey === 1 ? 0.35 : 0.65

  const shapes: Record<number, string> = {
    1: 'M36 66 Q50 76 64 66 L63 72 Q50 82 37 72 Z',
    2: 'M35 64 Q50 78 65 64 L66 78 Q50 92 34 78 Z',
    3: 'M34 63 Q50 80 66 63 L68 84 Q59 96 50 92 Q41 96 32 84 Z',
  }

  return (
    <g>
      <path d={shapes[beard]!} fill={beardColor} />
      <path d={shapes[beard]!} fill="#d8d8d8" opacity={greyOpacity} />
      {/* Flätan syns först på det längsta skägget — kortare skägg har inget
          att fläta. */}
      {beard === 3 && (
        <>
          <rect x="46" y="86" width="8" height="3" rx="1.5" fill={look.palette.metalDark} />
          <rect x="46" y="91" width="8" height="3" rx="1.5" fill={look.palette.metalDark} />
        </>
      )}
    </g>
  )
}

// Hexagonen klipper bort allt utanför x 7–93 och smalnar dessutom av mot topp
// och botten. Utrustningen ritas därför diagonalt bakom huvudet i den breda
// mittbandet — första försöket lade den längs vänsterkanten, och då blev
// yxan och bågen flisor som knappt syntes.
const GEAR_PLACEMENT = 'translate(21 31) rotate(-24)'

function Gear({ kind, palette }: { kind: GearKind; palette: Palette }) {
  const { metal, metalDark } = palette
  const wood = '#6b4a2f'

  // Lokalt system: skaftet går rakt ner från origo, huvudet sitter överst.
  const shaft = <rect x="-2.4" y="0" width="4.8" height="52" rx="2" fill={wood} />

  return (
    <g transform={GEAR_PLACEMENT}>
      {kind === 'yxa' && (
        <>
          {shaft}
          <path d="M-2 2 L-18 -4 Q-24 6 -18 16 L-2 12 Z" fill={metal} />
          <path d="M-2 2 L-18 -4 Q-24 6 -18 16 L-2 12 Z" fill="#000" opacity="0.15" />
        </>
      )}

      {kind === 'stav' && (
        <>
          {shaft}
          <circle cx="0" cy="-4" r="8" fill="none" stroke={metal} strokeWidth="3" />
        </>
      )}

      {kind === 'kniv' && (
        <>
          <rect x="-2.4" y="14" width="4.8" height="16" rx="2" fill={wood} />
          <path d="M0 14 L7 -4 L0 -20 L-7 -4 Z" fill={metal} />
        </>
      )}

      {kind === 'båge' && (
        <g fill="none">
          <path d="M0 -18 Q-20 14 0 46" stroke={wood} strokeWidth="5" strokeLinecap="round" />
          <path d="M0 -18 L0 46" stroke={metal} strokeWidth="1.6" />
        </g>
      )}

      {kind === 'sköld' && (
        <g transform="translate(-4 16)">
          <circle cx="0" cy="0" r="17" fill={metalDark} />
          <circle cx="0" cy="0" r="12.5" fill="none" stroke={metal} strokeWidth="2.4" />
          <circle cx="0" cy="0" r="4.5" fill={metal} />
        </g>
      )}

      {kind === 'horn' && (
        <g transform="translate(-2 10)">
          <path d="M-14 -8 Q4 -14 14 -4 Q2 10 -14 6 Z" fill={palette.skin} />
          <path d="M-14 -8 Q4 -14 14 -4 Q2 10 -14 6 Z" fill="#000" opacity="0.12" />
          <path d="M12 -6 Q20 -4 18 4 Q12 4 11 -1 Z" fill={metal} />
        </g>
      )}
    </g>
  )
}

export function Viking({
  id,
  tier,
  position,
  attributes,
  className,
}: {
  id: string
  tier: CardTier
  position: string
  attributes: readonly CardAttribute[]
  className?: string
}) {
  const look = vikingLook({ id, tier, position, attributes })
  const { palette: p, faceWidth, eyeTilt } = look

  // Ansiktet skalas kring mitten, så bredden ändrar inte var näsan sitter.
  const faceTransform = `translate(50 0) scale(${faceWidth} 1) translate(-50 0)`

  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Vikingporträtt genererat ur spelarens statistik"
    >
      {/* Axlar och mantel, som en sockel att bygga bysten på. */}
      <path d="M18 100 Q22 78 40 72 L60 72 Q78 78 82 100 Z" fill={p.cloak} />
      <path d="M40 72 L50 84 L60 72 L60 78 L50 90 L40 78 Z" fill={p.metalDark} />

      <Gear kind={look.gear} palette={p} />

      <g transform={faceTransform}>
        {/* Hals */}
        <rect x="44" y="62" width="12" height="14" fill={p.skinShade} />

        {/* Huvudform — kantig, som resten av sajten. */}
        <path d="M32 40 L68 40 L66 68 Q50 82 34 68 Z" fill={p.skin} />
        <path d="M32 40 L68 40 L67 50 L33 50 Z" fill={p.skinShade} opacity="0.45" />

        {/* Krigsmålningen ligger som ett band tvärs över ögonen, inte under.
            Under hakan täcktes den av skägget och syntes inte alls. */}
        {look.warPaint && <rect x="32" y="51" width="36" height="9" fill="#8c2f1f" opacity="0.9" />}

        {/* Ögon under hjälmkanten, ovanpå bandet. Lutningen kommer från seedet. */}
        <g transform={`rotate(${eyeTilt} 50 56)`}>
          <rect x="38" y="54" width="8" height="3.5" rx="1.4" fill="#20242b" />
          <rect x="54" y="54" width="8" height="3.5" rx="1.4" fill="#20242b" />
        </g>

        <Beard look={look} />

        {/* Ärr ritas sist och i en mörkare ton än huden. Låg kontrast och
            placering under skägget gjorde dem osynliga i första försöket —
            nu sitter de på panna och kind, där huden alltid syns. */}
        <g stroke="#7d4a2a" strokeLinecap="round" opacity="0.85" fill="none">
          {look.scars >= 1 && <path d="M39 48 L36 59" strokeWidth="2" />}
          {look.scars >= 2 && <path d="M63 47 L65 57" strokeWidth="1.8" />}
          {look.scars >= 3 && <path d="M44 44 L56 44" strokeWidth="1.8" />}
        </g>
      </g>

      <Helmet kind={look.helmet} palette={p} />
    </svg>
  )
}
