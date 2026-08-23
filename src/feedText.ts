// Loggbokens tidsangivelser. Intl gör böjningen och svenskans egna ord ("i
// går") åt oss — det enda som behöver bestämmas här är vilken enhet ett givet
// avstånd ska räknas i.
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
// Genomsnittsmånad och -år: exaktheten spelar ingen roll för en text som ändå
// säger "för 2 månader sedan".
const MONTH = 30.44 * DAY
const YEAR = 365.25 * DAY

const rtf = new Intl.RelativeTimeFormat('sv-SE', { numeric: 'auto' })

const UNITS: [ms: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [YEAR, 'year'],
  [MONTH, 'month'],
  [WEEK, 'week'],
  [DAY, 'day'],
  [HOUR, 'hour'],
  [MINUTE, 'minute'],
]

export function relativeTime(at: number, now = Date.now()): string {
  const elapsed = now - at

  // Serverns klocka och webbläsarens går isär med några sekunder ibland. En
  // händelse som ser ut att ligga strax i framtiden är inte framtiden, den är
  // nyss — "om 3 sekunder" vore bara förvirrande.
  if (elapsed < MINUTE) return 'nyss'

  for (const [ms, unit] of UNITS) {
    if (elapsed >= ms) return rtf.format(-Math.floor(elapsed / ms), unit)
  }
  return 'nyss'
}

// Månadsnyckeln från kröningen är 'YYYY-MM' (se server/src/bvsMonth.ts).
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return month

  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1)
  if (Number.isNaN(date.getTime())) return month
  return date.toLocaleString('sv-SE', { month: 'long' })
}
