// Den enda platsen där en embed-adress byggs. Servern har redan kastat den
// inklistrade länken och lämnar bara ut leverantör och id (se
// server/src/clipUrl.ts), så det finns ingen väg från något någon skrivit in
// till ett src-attribut — men id:t kodas ändå här, för det är den här raden
// som faktiskt blir attributet.

// youtube-nocookie i stället för youtube.com: sajten har ingen egen spårning,
// och då ska den inte bjuda in någon annans i onödan heller. Spelaren sätter
// inga annonskakor förrän klippet faktiskt spelas.
const YOUTUBE_HOST = 'https://www.youtube-nocookie.com'

const LABELS: Record<string, string> = {
  youtube: 'YouTube',
  twitch: 'Twitch',
  medal: 'Medal',
}

export function providerLabel(provider: string): string {
  return LABELS[provider] ?? provider
}

export function clipEmbedUrl(
  provider: string,
  videoId: string,
  hostname: string,
): string | null {
  switch (provider) {
    case 'youtube':
      return `${YOUTUBE_HOST}/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`

    // Twitchspelaren vägrar spela om parent inte är sidan den bäddas in på, så
    // värdnamnet måste med — och det skiljer sig mellan drift och localhost,
    // alltså läses det av anroparen i stället för att stå hårdkodat.
    case 'twitch':
      return `https://clips.twitch.tv/embed?clip=${encodeURIComponent(videoId)}&parent=${encodeURIComponent(hostname)}&autoplay=true`

    // Medals id är två delar, id och delningsnyckel, som bärs ihop med ett
    // snedstreck. Delarna kodas var för sig så att snedstrecket överlever.
    case 'medal': {
      const path = videoId
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/')
      return `https://medal.tv/clip/${path}?autoplay=1`
    }

    default:
      return null
  }
}
