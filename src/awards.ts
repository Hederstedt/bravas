import type { AwardKey } from './api'

// Texten för månadens utmärkelser, på ett ställe: kortet i rostern och
// förklaringen på Kom igång-sidan visar samma sak, och två kopior hade glidit
// isär från varandra och från uträkningen i server/src/bvsAwards.ts.
//
// De heter *utmärkelser*, aldrig titlar. Titeln är rangen (KAPTEN, GENERAL)
// och styrs bara av betyget; det här hör till månaden och säger inget om hur
// bra någon är.

// Speglar CAP_HOURS_PER_GAME i server/src/bvsMonth.ts. Taket räknas bara på
// servern — det här är enbart till för att kunna skriva ut det i förklaringen,
// och ändras det där ska det ändras här. Samma mönster som MAX_QUOTE_LENGTH i
// api.ts, som speglar serverns gräns av samma skäl.
export const CAP_HOURS_PER_GAME = 10

export interface AwardCopy {
  label: string
  // Vad som ger den, i förklaringen. Ingen ska behöva undra om den är godtycklig.
  earnedBy: string
  // Talet som vann den, skrivet så det betyder något.
  format: (value: number) => string
}

function hours(value: number): string {
  return `${value.toFixed(1).replace('.', ',')} h`
}

export const AWARDS: Record<AwardKey, AwardCopy> = {
  jumbo: {
    label: 'Träskeden',
    earnedBy:
      'Lägst månadspoäng av alla som faktiskt syntes. Du måste ha varit där för att kunna komma sist — den som har stängd Steam-profil eller var bortrest står utanför, inte sist.',
    format: (v) => `${v.toFixed(1).replace('.', ',')} p`,
  },
  sofflocket: {
    label: 'Sofflocket',
    earnedBy: 'Mer tid i Discorden än i spelen. Han hänger, han lirar inte.',
    format: (v) => `${hours(v)} mer i Discorden än i spel`,
  },
  enkelsparet: {
    label: 'Enkelspåret',
    earnedBy:
      'Hela månaden i ett enda spel, och minst ett fullt tak i det. Bredd slår grind i poängen — det här är motsatsen.',
    format: (v) => `${hours(v)} i ett och samma spel`,
  },
  vindflojeln: {
    label: 'Vindflöjeln',
    earnedBy:
      'Flest byten mellan spel mitt i en session. Aldrig klar med något. Att spela CS2 på måndagen och Valheim på lördagen räknas inte — det ska vara samma kväll.',
    format: (v) => `${v} byten mitt i steget`,
  },
  nattvakten: {
    label: 'Nattvakten',
    earnedBy:
      'Flest timmar loggade mellan midnatt och sex. Kvällsspel räknas inte — då är halva klanen igång. Sover du någonsin?',
    format: (v) => `${hours(v)} efter midnatt`,
  },
}

// Ett kort bär högst ett band. Vinnaren först, sedan träskeden, sedan
// skämten — servern delar redan ut högst en utmärkelse per gubbe, men
// ordningen står här så kortet aldrig behöver gissa.
export const AWARD_ORDER: AwardKey[] = ['jumbo', 'sofflocket', 'enkelsparet', 'vindflojeln', 'nattvakten']
