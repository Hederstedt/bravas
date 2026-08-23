import { describe, expect, it } from 'vitest'
import { clipEmbedUrl, providerLabel } from './clipEmbed'

describe('clipEmbedUrl', () => {
  // Adressen byggs ur en fast mall och aldrig ur något någon skrivit in —
  // servern har redan kastat den inklistrade länken och lämnar bara ut
  // leverantör och id (se server/src/clipUrl.ts).
  it('bygger YouTube-adressen mot nocookie-domänen', () => {
    expect(clipEmbedUrl('youtube', 'dQw4w9WgXcQ', 'www.bravas.se')).toBe(
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0',
    )
  })

  // Twitchspelaren vägrar spela om parent inte är den sida den bäddas in på,
  // så värdnamnet måste med — och det skiljer sig mellan drift och localhost.
  it('skickar med värdnamnet till Twitch', () => {
    expect(clipEmbedUrl('twitch', 'SpicyCrunchyOtterKappa', 'www.bravas.se')).toBe(
      'https://clips.twitch.tv/embed?clip=SpicyCrunchyOtterKappa&parent=www.bravas.se&autoplay=true',
    )
    expect(clipEmbedUrl('twitch', 'SpicyCrunchyOtterKappa', 'localhost')).toContain(
      'parent=localhost',
    )
  })

  it('behåller Medals id och nyckel som två delar', () => {
    expect(clipEmbedUrl('medal', '4954893/vpkPnOp0o', 'www.bravas.se')).toBe(
      'https://medal.tv/clip/4954893/vpkPnOp0o?autoplay=1',
    )
  })

  // Servern släpper bara igenom id som matchar sitt mönster, men vyn ska inte
  // vila på det: det är här strängen blir ett src-attribut.
  it('kodar id:t i stället för att lita på det', () => {
    const url = clipEmbedUrl('youtube', 'a&b"c<d', 'www.bravas.se')
    expect(url).not.toContain('"')
    expect(url).not.toContain('<')
    expect(url).toContain('a%26b%22c%3Cd')
  })

  it('svarar null på en tjänst vi inte känner igen', () => {
    expect(clipEmbedUrl('vimeo', '12345', 'www.bravas.se')).toBeNull()
  })
})

describe('providerLabel', () => {
  it('namnger tjänsten för den som ska klicka', () => {
    expect(providerLabel('youtube')).toBe('YouTube')
    expect(providerLabel('twitch')).toBe('Twitch')
    expect(providerLabel('medal')).toBe('Medal')
  })

  it('hittar inte på ett namn för något okänt', () => {
    expect(providerLabel('vimeo')).toBe('vimeo')
  })
})
